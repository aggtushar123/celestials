"""A person's Jira link (agent bundles round 2 D2 contract §1 to §3): storage,
sites, the seat, refresh with rotation, warm and lose. Atlassian is a fake."""

import time
from unittest.mock import patch

from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings

from core.models import AuditEvent
from services.accounts.models import Organisation, User
from services.connectors import jira_links
from services.connectors.models import Connector, JiraLink
from services.connectors.providers.base import ProviderError
from services.connectors.tests.atlassian_fake import CLOUD, use_atlassian

ON = {"ATLASSIAN_OAUTH_CLIENT_ID": "cid", "ATLASSIAN_OAUTH_CLIENT_SECRET": "secret"}


@override_settings(**ON)
class JiraLinkTests(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name="Acme")
        self.carl = User.objects.create_user(
            email="carl@acme.io", password="x" * 12, name="Carl Lee", organisation=self.org
        )
        self.jira = Connector.objects.create(
            organisation=self.org,
            provider="jira",
            name="Jira",
            config={"host": "acme.atlassian.net", "project": "SUP", "account_name": "Jira Bot"},
        )
        self.jira.set_credentials({"email": "bot@acme.io", "api_token": "t"})
        self.jira.status = Connector.Status.CONNECTED
        self.jira.save()
        self.atlassian = use_atlassian(self)

    def link(self, *, expires_in=3600, refresh="rt-0", status=JiraLink.Status.LINKED):
        self.atlassian.live_refresh.add(refresh)
        link = JiraLink(
            organisation=self.org,
            user=self.carl,
            account_id="acc-carl",
            name="Carl Lee",
            sites=[{"cloud_id": CLOUD, "url": "https://acme.atlassian.net", "name": "acme"}],
            status=status,
        )
        link.set_credentials(
            {
                "access_token": "at-0",
                "refresh_token": refresh,
                "expires_at": time.time() + expires_in,
            }
        )
        link.save()
        return link

    def test_tokens_are_encrypted_at_rest(self):
        link = self.link()
        self.assertNotIn("at-0", link.credentials)
        self.assertEqual(JiraLink.objects.get().get_credentials()["refresh_token"], "rt-0")

    def test_the_authorize_url_asks_for_the_four_scopes_and_consent(self):
        url = jira_links.authorize_url(
            "s1", "http://localhost:8000/api/v1/connectors/jira-link/callback/"
        )
        self.assertTrue(url.startswith("https://auth.atlassian.com/authorize?"))
        for part in (
            "audience=api.atlassian.com",
            "client_id=cid",
            "prompt=consent",
            "response_type=code",
            "state=s1",
            "read%3Ajira-work+write%3Ajira-work+read%3Ajira-user+offline_access",
        ):
            self.assertIn(part, url)

    def test_only_jira_resources_count_and_sites_match_by_host(self):
        rows = jira_links.resources("at-1")
        self.assertEqual(
            rows, [{"cloud_id": CLOUD, "url": "https://acme.atlassian.net", "name": "acme"}]
        )
        link = self.link()
        self.assertEqual(jira_links.site_for(link, self.jira)["cloud_id"], CLOUD)
        self.jira.config = {**self.jira.config, "host": "other.atlassian.net"}
        self.assertIsNone(jira_links.site_for(link, self.jira))

    def test_a_covering_link_seats_the_person_else_the_connection(self):
        link = self.link()
        seat = jira_links.seat_for(self.jira, link)
        self.assertEqual(
            (seat.person, seat.name, seat.creds), (True, "Carl Lee", {"access_token": "at-0"})
        )
        self.assertEqual(seat.config["api_base"], f"https://api.atlassian.com/ex/jira/{CLOUD}")
        bot = jira_links.seat_for(self.jira, None)
        self.assertEqual((bot.person, bot.name, bot.creds["api_token"]), (False, "Jira Bot", "t"))

    def test_a_lost_link_raises(self):
        link = self.link(status=JiraLink.Status.LOST)
        with self.assertRaises(jira_links.LinkLost):
            jira_links.seat_for(self.jira, link)

    def test_an_expiring_token_is_refreshed_and_the_new_refresh_token_kept(self):
        link = self.link(expires_in=30)
        self.assertEqual(jira_links.fresh_token(link), "at-1")
        link.refresh_from_db()
        self.assertEqual(link.get_credentials()["refresh_token"], "rt-1")
        self.assertIsNotNone(link.refreshed_at)
        self.assertEqual(self.atlassian.refreshes, ["rt-0"])

    def test_warm_refreshes_within_fifteen_minutes_only(self):
        link = self.link(expires_in=20 * 60)
        jira_links.warm(link)
        self.assertEqual(self.atlassian.refreshes, [])
        link = JiraLink.objects.get()
        JiraLink.objects.filter(pk=link.pk).delete()
        link = self.link(expires_in=10 * 60)
        jira_links.warm(link)
        self.assertEqual(self.atlassian.refreshes, ["rt-0"])

    def test_a_refused_refresh_loses_the_link_and_audits_it(self):
        link = self.link(expires_in=0)
        self.atlassian.refuse_refresh()
        with self.assertRaises(jira_links.LinkLost):
            jira_links.fresh_token(link)
        link.refresh_from_db()
        self.assertEqual(link.status, JiraLink.Status.LOST)
        event = AuditEvent.objects.get(action="jira.link_lost")
        self.assertEqual((event.metadata, event.outcome), ({"reason": "invalid_grant"}, "failure"))
        self.assertNotIn("rt-0", str(event.metadata))

    def test_no_answer_while_refreshing_is_not_lost(self):
        link = self.link(expires_in=0)
        self.atlassian.drop_refresh()
        with self.assertRaises(jira_links.LinkUnreachable):
            jira_links.fresh_token(link)
        link.refresh_from_db()
        self.assertEqual(link.status, JiraLink.Status.LINKED)

    def test_the_preview_names_who_acts(self):
        self.assertEqual(
            jira_links.preview_for(self.jira, None),
            {"as": "Jira Bot", "as_you": False, "link": "none"},
        )
        self.assertEqual(
            jira_links.preview_for(self.jira, self.link()),
            {"as": "Carl Lee", "as_you": True, "link": None},
        )
        self.jira.config = {**self.jira.config, "host": "other.atlassian.net"}
        self.assertEqual(
            jira_links.preview_for(self.jira, JiraLink.objects.get())["link"], "other_site"
        )
        with override_settings(ATLASSIAN_OAUTH_CLIENT_ID=""):
            self.assertEqual(jira_links.preview_for(self.jira, None)["link"], "off")

    def test_one_atlassian_account_per_workspace(self):
        self.link()
        dana = User.objects.create_user(
            email="dana@acme.io", password="x" * 12, name="Dana", organisation=self.org
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            JiraLink.objects.create(
                organisation=self.org, user=dana, account_id="acc-carl", name="x", credentials="x"
            )

    def test_the_warm_window_is_fifteen_minutes(self):
        self.assertEqual(jira_links.JIRA_LINK_WARM_SECONDS, 15 * 60)

    def test_the_code_exchange_keeps_expiry_and_scope(self):
        tokens = jira_links.exchange("good-code", "http://localhost:8000/cb/")
        self.assertEqual((tokens["access_token"], tokens["refresh_token"]), ("at-1", "rt-1"))
        self.assertGreater(tokens["expires_at"], time.time() + 3000)
        self.assertIn("write:jira-work", tokens["scope"])
        with self.assertRaises(ProviderError):
            jira_links.exchange("bad-code", "http://localhost:8000/cb/")

    def test_malformed_atlassian_answers_are_tolerated(self):
        good = self.atlassian.resources[0]
        self.atlassian.resources = ["x", None, {"url": "https://no-id.atlassian.net"}, good]
        self.assertEqual([r["cloud_id"] for r in jira_links.resources("at-1")], [CLOUD])
        with patch("services.connectors.jira_links.http_json", return_value={"oops": 1}):
            self.assertEqual(jira_links.resources("at-1"), [])
        for odd in ("soon", None, [1]):
            with self.subTest(expires_in=odd):
                tokens = jira_links._with_expiry({"access_token": "a", "expires_in": odd})
                self.assertAlmostEqual(tokens["expires_at"], time.time() + 3600, delta=5)

    def test_a_refresh_without_rotation_keeps_the_old_refresh_token(self):
        self.atlassian.give_refresh_token = False
        link = self.link(expires_in=0)
        self.assertEqual(jira_links.fresh_token(link), "at-1")
        link.refresh_from_db()
        self.assertEqual(link.get_credentials()["refresh_token"], "rt-0")

    def test_a_spent_refresh_token_is_never_reused(self):
        link = self.link(expires_in=0)
        jira_links.fresh_token(link)
        stale = JiraLink.objects.get()
        stale.set_credentials({**stale.get_credentials(), "expires_at": 0})
        stale.save()
        self.assertEqual(jira_links.fresh_token(stale), "at-2")
        self.assertEqual(self.atlassian.refreshes, ["rt-0", "rt-1"])

    def test_a_link_lost_elsewhere_is_not_refreshed(self):
        link = self.link(expires_in=0)
        JiraLink.objects.filter(pk=link.pk).update(status=JiraLink.Status.LOST)
        with self.assertRaises(jira_links.LinkLost):
            jira_links.fresh_token(link)
        self.assertEqual(self.atlassian.refreshes, [])

    def test_losing_twice_audits_once(self):
        link = self.link()
        jira_links.lose(link, "invalid_grant")
        jira_links.lose(link, "invalid_grant")
        self.assertEqual(AuditEvent.objects.filter(action="jira.link_lost").count(), 1)
        link.refresh_from_db()
        self.assertIsNotNone(link.lost_at)

    def test_a_refusal_other_than_invalid_grant_keeps_the_link(self):
        link = self.link(expires_in=0)

        def misconfigured(*args, **kwargs):
            raise ProviderError(
                "401 from auth.atlassian.com", status=401, body={"error": "access_denied"}
            )

        from unittest.mock import patch

        with (
            patch("services.connectors.jira_links.http_json", misconfigured),
            self.assertRaises(jira_links.LinkUnreachable),
        ):
            jira_links.fresh_token(link)
        link.refresh_from_db()
        self.assertEqual(link.status, JiraLink.Status.LINKED)
        self.assertFalse(AuditEvent.objects.filter(action="jira.link_lost").exists())

    def test_a_link_with_no_refresh_token_is_lost_without_a_call(self):
        link = self.link(expires_in=0, refresh="")
        with self.assertRaises(jira_links.LinkLost):
            jira_links.fresh_token(link)
        self.assertEqual(self.atlassian.refreshes, [])
        link.refresh_from_db()
        self.assertEqual(link.status, JiraLink.Status.LOST)

    def test_warm_says_nothing_when_refresh_fails(self):
        link = self.link(expires_in=0)
        self.atlassian.drop_refresh()
        jira_links.warm(link)
        jira_links.warm(None)
        link.refresh_from_db()
        self.assertEqual(link.status, JiraLink.Status.LINKED)

    def test_a_seat_never_shows_its_token(self):
        seat = jira_links.seat_for(self.jira, self.link())
        self.assertNotIn("at-0", repr(seat))
        self.assertNotIn("at-0", str(self.link_row()))

    def link_row(self):
        return JiraLink.objects.get()

    def test_jira_connectors_are_the_enabled_connected_jira_ones(self):
        Connector.objects.create(organisation=self.org, provider="jira", name="No creds")
        off = Connector.objects.create(
            organisation=self.org, provider="jira", name="Off", is_enabled=False
        )
        off.set_credentials({"api_token": "t"})
        off.save()
        self.assertEqual(list(jira_links.jira_connectors(self.org.pk)), [self.jira])

    def test_unauthorized_client_naming_the_refresh_token_loses_the_link(self):
        link = self.link(expires_in=0)
        self.atlassian.refuse_refresh("unauthorized_client", "refresh_token is invalid")
        with self.assertRaises(jira_links.LinkLost):
            jira_links.fresh_token(link)
        link.refresh_from_db()
        self.assertEqual(link.status, JiraLink.Status.LOST)
        event = AuditEvent.objects.get(action="jira.link_lost")
        self.assertEqual(event.metadata, {"reason": "invalid_grant"})

    def test_a_refused_client_keeps_the_link(self):
        for error, said in (
            ("invalid_client", "refresh_token is invalid"),
            ("unauthorized_client", "client is not allowed"),
        ):
            link = self.link(expires_in=0, refresh=f"rt-{error}")
            self.atlassian.refuse_refresh(error, said)
            with self.assertRaises(jira_links.LinkUnreachable):
                jira_links.fresh_token(link)
            link.refresh_from_db()
            self.assertEqual(link.status, JiraLink.Status.LINKED)
            link.delete()
        self.assertFalse(AuditEvent.objects.filter(action="jira.link_lost").exists())

    @override_settings(ATLASSIAN_OAUTH_CLIENT_ID="", ATLASSIAN_OAUTH_CLIENT_SECRET="")
    def test_linking_off_means_the_connection_acts(self):
        link = self.link(expires_in=0)
        seat = jira_links.seat_for(self.jira, link)
        self.assertEqual(
            (seat.person, seat.name, seat.creds["api_token"]), (False, "Jira Bot", "t")
        )
        self.assertEqual(
            jira_links.preview_for(self.jira, link),
            {"as": "Jira Bot", "as_you": False, "link": "off"},
        )
        lost = self.link_row()
        JiraLink.objects.filter(pk=lost.pk).update(status=JiraLink.Status.LOST)
        lost.refresh_from_db()
        self.assertFalse(jira_links.seat_for(self.jira, lost).person)
        self.assertEqual(jira_links.preview_for(self.jira, lost)["link"], "off")
        self.assertEqual(self.atlassian.refreshes, [])
