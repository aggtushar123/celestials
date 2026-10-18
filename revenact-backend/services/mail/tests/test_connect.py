"""Connecting Google (contract §1): the gates refuse before OAuth and again
in the callback; a partial grant, a wrong domain or an address someone else
holds is refused and the grant revoked; a reconnect resumes the kept row and
its copies; a different address or provider replaces it."""

from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.core import signing
from django.test import override_settings
from django.utils import timezone

from core.models import AuditEvent
from core.oauth_browser import digest as browser_digest
from services.accounts.models import Organisation, User
from services.customers.models import Email
from services.identity.models import OrganizationDomain
from services.mail import gates, scopes
from services.mail.models import MailboxConnection, MailMessage
from services.mail.providers.base import Credentials
from services.mail.views import (
    BROWSER_COOKIE,
    BROWSER_COOKIE_SECURE,
    STATE_SALT,
)

from .gmail_fake import gmail_message
from .gmail_fixtures import GmailFixture

CALLBACK = "/api/v1/mail/oauth/google/callback/"
#: The nonce the starting browser holds in its cookie, for tests that mint
#: their own state.
NONCE = "this-browser"


def landed_at(response):
    return {k: v[0] for k, v in parse_qs(urlsplit(response["Location"]).query).items()}


@override_settings(
    GOOGLE_OAUTH_CLIENT_ID="cid", GOOGLE_OAUTH_CLIENT_SECRET="sec", FRONTEND_URL="https://app.test"
)
class ConnectGoogleTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = self.use_gmail()

    def as_dana(self):
        self.client.force_authenticate(User.objects.get(pk=self.dana.pk))

    def back(self, query="code=xyz", user=None):
        """Google sends the browser back; where Revenact then sends it."""
        state = signing.dumps(
            {
                "user": (user or self.dana).id,
                "provider": "google",
                "browser": browser_digest(NONCE),
            },
            salt=STATE_SALT,
        )
        self.client.force_authenticate(None)
        self.client.cookies[BROWSER_COOKIE] = NONCE
        response = self.client.get(f"{CALLBACK}?{query}&state={state}")
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response["Location"].startswith("https://app.test/integrations?"))
        return {k: v[0] for k, v in parse_qs(urlsplit(response["Location"]).query).items()}

    # -- before OAuth -----------------------------------------------------
    def test_a_failing_gate_answers_before_oauth_and_is_not_audited(self):
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        self.as_dana()
        response = self.client.post("/api/v1/mail/connect/google/")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.data,
            {"code": "GMAIL_NOT_ENABLED", "detail": gates.MESSAGES["GMAIL_NOT_ENABLED"]},
        )
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=True)
        OrganizationDomain.objects.update(verification_status="pending")
        self.as_dana()
        self.assertEqual(
            self.client.post("/api/v1/mail/connect/google/").data["code"], "NO_VERIFIED_DOMAIN"
        )
        self.assertFalse(AuditEvent.objects.filter(action__startswith="mailbox.").exists())

    def test_the_authorize_url_asks_for_the_three_gmail_scopes(self):
        self.as_dana()
        url = self.client.post("/api/v1/mail/connect/google/").data["authorize_url"]
        asked = parse_qs(urlsplit(url).query)["scope"][0].split()
        self.assertEqual(asked, list(scopes.REQUESTED))

    # -- the callback -----------------------------------------------------
    def test_a_full_grant_on_a_verified_address_connects_and_starts_the_import(self):
        self.fake.add(gmail_message("old1"), quietly=True)
        self.assertEqual(self.back(), {"mailbox": "connected"})
        c = MailboxConnection.objects.get(user=self.dana)
        self.assertEqual((c.provider, c.address, c.status), ("google", "dana@acme.io", "connected"))
        self.assertTrue(c.two_way)
        self.assertEqual((c.history_id, c.import_total_estimate), (self.fake.history_id, 1))
        self.assertEqual((c.import_before - c.import_after).days, 365)
        self.assertEqual(
            (c.import_page_token, c.import_done_at, c.reconcile_started_at), ("", None, None)
        )
        self.assertIsNotNone(c.wake_at)
        self.assertEqual(c.get_credentials()["refresh_token"], "fake-refresh")
        event = AuditEvent.objects.get(action="mailbox.connect")
        self.assertEqual(event.actor, self.dana)
        self.assertEqual(
            event.metadata,
            {
                "provider": "google",
                "address": "dana@acme.io",
                "scopes": ["gmail.modify", "gmail.send", "gmail.compose"],
                "two_way": True,
            },
        )

    def test_a_partial_grant_is_refused_revoked_and_never_reads_the_mailbox(self):
        self.fake.granted_scope = f"{scopes.MODIFY} openid"
        self.assertEqual(
            self.back(),
            {
                "mailbox": "refused",
                "code": "SCOPES_MISSING",
                "detail": gates.MESSAGES["SCOPES_MISSING"],
            },
        )
        self.assertEqual(self.fake.revoked, ["fake-refresh"])
        self.assertFalse(MailboxConnection.objects.exists())
        self.assertFalse(any(where.endswith("/profile") for _, where, _ in self.fake.calls))
        event = AuditEvent.objects.get(action="mailbox.connect_refused")
        self.assertEqual(
            (event.outcome, event.actor, event.metadata),
            ("failure", self.dana, {"provider": "google", "code": "SCOPES_MISSING"}),
        )

    def test_an_address_off_the_verified_domains_is_refused_naming_them(self):
        for address in ("dana@gmail.com", "dana@eu.acme.io"):
            with self.subTest(address=address):
                self.fake.address = address
                self.fake.revoked = []
                self.assertEqual(
                    self.back(),
                    {
                        "mailbox": "refused",
                        "code": "WRONG_DOMAIN",
                        "detail": "Connect your acme.io account.",
                    },
                )
                self.assertEqual(self.fake.revoked, ["fake-refresh"])
        events = AuditEvent.objects.filter(action="mailbox.connect_refused")
        self.assertEqual({e.metadata["domain"] for e in events}, {"gmail.com", "eu.acme.io"})
        self.assertNotIn("dana@", str([e.metadata for e in events]))
        self.assertFalse(MailboxConnection.objects.exists())

    def test_an_address_someone_else_holds_is_refused(self):
        self.google(self.carl, "dana@acme.io")
        landed = self.back()
        self.assertEqual((landed["mailbox"], landed["code"]), ("refused", "ADDRESS_IN_USE"))
        self.assertEqual(self.fake.revoked, ["fake-refresh"])
        self.assertFalse(MailboxConnection.objects.filter(user=self.dana).exists())

    def test_the_gates_run_again_before_the_code_is_exchanged(self):
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        landed = self.back()
        self.assertEqual((landed["mailbox"], landed["code"]), ("refused", "GMAIL_NOT_ENABLED"))
        self.assertEqual(self.fake.calls, [])

    def test_google_saying_no_is_explained(self):
        response = self.client.get(f"{CALLBACK}?error=access_denied&state=x")
        landed = {k: v[0] for k, v in parse_qs(urlsplit(response["Location"]).query).items()}
        self.assertEqual(
            landed,
            {
                "mailbox": "refused",
                "code": "GOOGLE_DENIED",
                "detail": gates.MESSAGES["GOOGLE_DENIED"],
            },
        )

    def test_a_forged_state_is_an_error(self):
        response = self.client.get(f"{CALLBACK}?code=xyz&state=forged")
        self.assertIn("mailbox=error", response["Location"])
        self.assertFalse(MailboxConnection.objects.exists())

    # -- reconnect and replace ----------------------------------------------
    def kept(self, address="dana@acme.io", **fields):
        row = self.google(
            self.dana,
            address,
            status="disconnected",
            disconnected_at=timezone.now(),
            granted_scopes=[scopes.SEND],
            **fields,
        )
        MailboxConnection.objects.filter(pk=row.pk).update(credentials="")
        MailMessage.objects.create(
            connection=row,
            owner=self.dana,
            organisation=self.org,
            provider_message_id="k1",
            direction="received",
            subject="Kept",
            sent_at=timezone.now(),
        )
        return row

    def test_reconnecting_the_same_address_resumes_the_kept_row(self):
        row = self.kept()
        self.assertEqual(self.back(), {"mailbox": "connected"})
        again = MailboxConnection.objects.get(user=self.dana)
        self.assertEqual(
            (again.pk, again.status, again.disconnected_at), (row.pk, "connected", None)
        )
        self.assertIsNotNone(again.reconcile_started_at)
        self.assertEqual(again.messages.count(), 1)
        self.assertFalse(AuditEvent.objects.filter(action="mailbox.connect").exists())
        self.assertTrue(AuditEvent.objects.filter(action="mailbox.reconnect").exists())
        changed = AuditEvent.objects.get(action="mailbox.scopes_changed")
        self.assertEqual(
            changed.metadata,
            {"from": ["gmail.send"], "to": ["gmail.modify", "gmail.send", "gmail.compose"]},
        )

    def test_a_different_address_replaces_the_kept_row_and_its_copies(self):
        old = self.kept("old@acme.io")
        filed = self.email(self.dana, mailbox=old)
        self.assertEqual(self.back(), {"mailbox": "connected"})
        self.assertFalse(MailboxConnection.objects.filter(pk=old.pk).exists())
        self.assertFalse(MailMessage.objects.exists())
        filed.refresh_from_db()
        self.assertIsNone(filed.mailbox)
        gone = AuditEvent.objects.get(action="mailbox.disconnect")
        self.assertEqual(
            gone.metadata,
            {
                "provider": "google",
                "address": "old@acme.io",
                "revoked": False,
                "delete_after": None,
            },
        )
        self.assertTrue(AuditEvent.objects.filter(action="mailbox.connect").exists())

    def test_imap_over_a_kept_google_row_replaces_it(self):
        self.kept()
        self.as_dana()
        with patch("services.mail.providers.imap.ImapProvider._imap") as login:
            login.return_value.__enter__ = lambda s: s
            login.return_value.__exit__ = lambda s, *a: None
            response = self.client.post(
                "/api/v1/mail/connect/imap/",
                {
                    "address": "dana@acme.io",
                    "password": "x",
                    "imap_host": "i.acme.io",
                    "smtp_host": "s.acme.io",
                },
                format="json",
            )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(MailboxConnection.objects.get(user=self.dana).provider, "imap")
        self.assertFalse(MailMessage.objects.exists())
        self.assertEqual(Email.objects.count(), 0)


def state_of(authorize_url):
    return parse_qs(urlsplit(authorize_url).query)["state"][0]


@override_settings(
    GOOGLE_OAUTH_CLIENT_ID="cid",
    GOOGLE_OAUTH_CLIENT_SECRET="sec",
    MICROSOFT_OAUTH_CLIENT_ID="mid",
    MICROSOFT_OAUTH_CLIENT_SECRET="msec",
    FRONTEND_URL="https://app.test",
)
class BrowserBindingTests(GmailFixture):
    """The callback finishes only in the browser that started the connect:
    a forwarded authorize link must never connect the person who opens it
    to the person who asked for it (contract decision 33)."""

    def setUp(self):
        super().setUp()
        self.fake = self.use_gmail()
        exchange = patch(
            "services.mail.providers.microsoft.MicrosoftProvider.exchange_code",
            return_value=Credentials(
                address="dana@acme.io", display_name="Dana", data={"refresh_token": "ms-r"}
            ),
        )
        self.ms_exchange = exchange.start()
        self.addCleanup(exchange.stop)

    def start(self, provider="google", **extra):
        """Dana starts the connect: the authorize URL's state, and the response."""
        self.client.force_authenticate(User.objects.get(pk=self.dana.pk))
        response = self.client.post(f"/api/v1/mail/connect/{provider}/", **extra)
        self.assertEqual(response.status_code, 200, response.data)
        # Not force_authenticate(None): that logs out, emptying the cookie
        # jar. The callback authenticates nobody anyway.
        return state_of(response.data["authorize_url"]), response

    def finish(self, state, provider="google", **extra):
        return self.client.get(
            f"/api/v1/mail/oauth/{provider}/callback/?code=xyz&state={state}", **extra
        )

    def test_the_connect_gives_the_starting_browser_a_short_lived_locked_down_cookie(self):
        _, response = self.start()
        cookie = response.cookies[BROWSER_COOKIE]
        self.assertGreaterEqual(len(cookie.value), 32)
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Lax")
        self.assertEqual(cookie["path"], "/api/v1/mail/oauth/")
        self.assertEqual(cookie["max-age"], 15 * 60)
        self.assertFalse(cookie["secure"])
        self.assertNotIn(cookie.value, response.data["authorize_url"])
        self.assertEqual(cookie["domain"], "")
        self.assertNotIn(BROWSER_COOKIE_SECURE, response.cookies)

    def test_over_https_the_cookie_is_host_only_so_a_sibling_subdomain_cannot_plant_it(self):
        """`__Host-` makes the browser refuse the cookie unless it is Secure,
        Path=/ and has no Domain: a sibling *.sslip.io site cannot toss one in."""
        _, response = self.start(secure=True)
        self.assertEqual(BROWSER_COOKIE_SECURE, "__Host-revenact_mail_oauth")
        self.assertNotIn(BROWSER_COOKIE, response.cookies)
        cookie = response.cookies[BROWSER_COOKIE_SECURE]
        self.assertTrue(cookie["secure"])
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["path"], "/")
        self.assertEqual(cookie["domain"], "")
        self.assertEqual(cookie["samesite"], "Lax")
        self.assertEqual(cookie["max-age"], 15 * 60)

    def test_over_https_the_same_browser_connects_and_clears_the_host_cookie(self):
        state, _ = self.start(secure=True)
        response = self.finish(state, secure=True)
        self.assertEqual(landed_at(response), {"mailbox": "connected"})
        cleared = response.cookies[BROWSER_COOKIE_SECURE]
        self.assertEqual((cleared.value, cleared["max-age"], cleared["path"]), ("", 0, "/"))
        self.assertTrue(cleared["secure"])

    def test_over_https_a_planted_unprefixed_cookie_is_refused(self):
        state, response = self.start(secure=True)
        nonce = response.cookies[BROWSER_COOKIE_SECURE].value
        self.client.cookies.clear()  # B's browser, with A's nonce tossed in
        self.client.cookies[BROWSER_COOKIE] = nonce
        response = self.finish(state, secure=True)
        self.assertEqual(landed_at(response)["code"], "BROWSER_MISMATCH")
        self.assertEqual(self.fake.calls, [])
        self.assertFalse(MailboxConnection.objects.exists())

    @override_settings(CORS_ALLOWED_ORIGINS=["http://localhost:5173"])
    def test_a_credentialed_connect_from_the_dev_spa_may_set_the_cookie(self):
        """Local dev serves the SPA on :5173 and the API on :8000: the SPA's
        fetch sends `credentials: 'include'`, which the browser honours (and
        stores the cookie) only when the API allows credentials for it."""
        _, response = self.start(HTTP_ORIGIN="http://localhost:5173")
        self.assertEqual(response["Access-Control-Allow-Origin"], "http://localhost:5173")
        self.assertEqual(response["Access-Control-Allow-Credentials"], "true")

    def test_each_connect_gets_its_own_nonce(self):
        _, first = self.start()
        _, second = self.start()
        self.assertNotEqual(
            first.cookies[BROWSER_COOKIE].value, second.cookies[BROWSER_COOKIE].value
        )

    def test_google_in_the_same_browser_connects_and_clears_the_cookie(self):
        state, _ = self.start()
        response = self.finish(state)
        self.assertEqual(landed_at(response), {"mailbox": "connected"})
        self.assertEqual(MailboxConnection.objects.get(user=self.dana).provider, "google")
        cleared = response.cookies[BROWSER_COOKIE]
        self.assertEqual((cleared.value, cleared["max-age"]), ("", 0))
        self.assertEqual(cleared["path"], "/api/v1/mail/oauth/")

    def test_microsoft_in_the_same_browser_connects(self):
        state, _ = self.start("microsoft")
        response = self.finish(state, "microsoft")
        self.assertEqual(landed_at(response), {"mailbox": "connected"})
        self.assertEqual(MailboxConnection.objects.get(user=self.dana).provider, "microsoft")
        self.assertEqual(response.cookies[BROWSER_COOKIE]["max-age"], 0)

    def refused(self, response, provider):
        self.assertEqual(
            landed_at(response),
            {
                "mailbox": "refused",
                "code": "BROWSER_MISMATCH",
                "detail": gates.MESSAGES["BROWSER_MISMATCH"],
            },
        )
        self.assertFalse(MailboxConnection.objects.exists())
        event = AuditEvent.objects.get(action="mailbox.connect_refused")
        self.assertEqual(
            (event.outcome, event.actor, event.metadata),
            ("failure", self.dana, {"provider": provider, "code": "BROWSER_MISMATCH"}),
        )
        self.assertEqual(response.cookies[BROWSER_COOKIE]["max-age"], 0)

    def test_a_forwarded_google_link_is_refused_before_the_code_is_exchanged(self):
        state, _ = self.start()
        self.client.cookies.clear()  # someone else's browser
        self.refused(self.finish(state), "google")
        self.assertEqual(self.fake.calls, [])
        self.assertEqual(self.fake.revoked, [])

    def test_a_forwarded_microsoft_link_is_refused_before_the_code_is_exchanged(self):
        state, _ = self.start("microsoft")
        self.client.cookies.clear()
        self.refused(self.finish(state, "microsoft"), "microsoft")
        self.ms_exchange.assert_not_called()

    def test_a_cookie_from_another_connect_is_refused(self):
        state, _ = self.start()
        self.client.cookies[BROWSER_COOKIE] = "someone-elses-nonce"
        self.refused(self.finish(state), "google")
        self.assertEqual(self.fake.calls, [])

    def test_a_state_minted_without_a_browser_binding_is_refused(self):
        self.client.cookies[BROWSER_COOKIE] = NONCE
        state = signing.dumps({"user": self.dana.id, "provider": "google"}, salt=STATE_SALT)
        self.refused(self.finish(state), "google")
        self.assertEqual(self.fake.calls, [])

    def test_the_cookie_is_cleared_even_when_the_state_is_bad(self):
        self.client.cookies[BROWSER_COOKIE] = NONCE
        response = self.finish("forged")
        self.assertEqual(landed_at(response)["mailbox"], "error")
        self.assertEqual(response.cookies[BROWSER_COOKIE]["max-age"], 0)
