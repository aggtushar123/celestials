"""My mailbox (contract §3): the connection payload with scopes, import,
push and a live pause; the provider gates; a Google disconnect that revokes,
wipes and keeps the copies for 30 days; Sync now queued for Google and
refused while paused; the summary's import and pause."""

from datetime import timedelta
from unittest.mock import patch

from django.test import override_settings
from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import Organisation, User
from services.mail import scopes
from services.mail.models import MailboxConnection, MailMessage

from .gmail_fixtures import GmailFixture
from .test_mail import FakeProvider

URL = "/api/v1/mail/connection/"
CONNECTION_KEYS = {
    "id",
    "provider",
    "provider_display",
    "address",
    "display_name",
    "status",
    "error",
    "last_synced_at",
    "created_at",
    "agent_reads_mail",
    "two_way",
    "needs_reconnect",
    "granted_scopes",
    "import",
    "push",
    "paused_reason",
    "signature",
}


@override_settings(
    GOOGLE_OAUTH_CLIENT_ID="cid",
    GOOGLE_OAUTH_CLIENT_SECRET="sec",
    GMAIL_PUBSUB_TOPIC="projects/revenact/topics/gmail",
    MAIL_DISCONNECT_RETENTION_DAYS=30,
)
class MyMailboxTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = self.use_gmail()
        self.now = timezone.now()
        self.as_dana()

    def as_dana(self):
        self.client.force_authenticate(User.objects.get(pk=self.dana.pk))

    def get(self):
        return self.client.get(URL).data

    def kept_message(self, connection):
        return MailMessage.objects.create(
            connection=connection,
            owner=self.dana,
            organisation=self.org,
            provider_message_id="g1",
            direction="received",
            subject="Hi",
            sent_at=self.now,
        )

    def google_provider(self, data):
        return next(p for p in data["providers"] if p["key"] == "google")

    # -- GET --------------------------------------------------------------
    def test_a_google_connection_reports_scopes_import_push_and_pause(self):
        c = self.google(
            self.dana,
            import_after=self.now - timedelta(days=365),
            import_before=self.now,
            import_total_estimate=18000,
            watch_expires_at=self.now + timedelta(days=2),
            last_synced_at=self.now,
        )
        self.kept_message(c)
        data = self.get()
        connection = data["connection"]
        self.assertEqual(set(connection), CONNECTION_KEYS)
        self.assertEqual(
            (
                connection["two_way"],
                connection["needs_reconnect"],
                connection["push"],
                connection["paused_reason"],
            ),
            (True, False, True, None),
        )
        self.assertEqual(
            connection["granted_scopes"], ["gmail.modify", "gmail.send", "gmail.compose"]
        )
        self.assertEqual(
            connection["import"],
            {"state": "importing", "imported": 1, "total_estimate": 18000, "done_at": None},
        )
        self.assertIsNone(data["disconnected"])
        self.assertEqual(
            self.google_provider(data),
            {
                "key": "google",
                "label": "Google Workspace / Gmail",
                "uses_oauth": True,
                "gate": None,
            },
        )

    def test_the_pause_is_live_and_a_read_only_grant_needs_a_reconnect(self):
        self.google(
            self.dana,
            granted_scopes=["https://www.googleapis.com/auth/gmail.readonly", scopes.SEND],
        )
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        self.as_dana()
        data = self.get()
        c = data["connection"]
        self.assertEqual(
            (c["paused_reason"], c["two_way"], c["needs_reconnect"]), ("workspace_off", False, True)
        )
        self.assertEqual(c["granted_scopes"], ["gmail.readonly", "gmail.send"])
        self.assertEqual(self.google_provider(data)["gate"], "GMAIL_NOT_ENABLED")
        # GET writes nothing; the loop's sweep stores the pause.
        self.assertEqual(MailboxConnection.objects.get(user=self.dana).paused_reason, "")

    def test_a_revoked_grant_needs_a_reconnect(self):
        self.google(
            self.dana,
            status="error",
            paused_reason="token_revoked",
            error="Google access was revoked. Reconnect Google.",
        )
        c = self.get()["connection"]
        self.assertEqual(
            (c["status"], c["paused_reason"], c["needs_reconnect"]),
            ("error", "token_revoked", True),
        )

    def test_outlook_and_imap_answer_with_the_new_fields_empty(self):
        self.connect(self.dana)
        c = self.get()["connection"]
        self.assertEqual(
            {
                k: c[k]
                for k in (
                    "two_way",
                    "needs_reconnect",
                    "granted_scopes",
                    "import",
                    "push",
                    "paused_reason",
                )
            },
            {
                "two_way": False,
                "needs_reconnect": False,
                "granted_scopes": [],
                "import": None,
                "push": False,
                "paused_reason": None,
            },
        )

    # -- DELETE -----------------------------------------------------------
    def test_a_google_disconnect_revokes_wipes_and_keeps_the_copies_for_30_days(self):
        c = self.google(
            self.dana,
            history_id=5,
            watch_expires_at=self.now + timedelta(days=2),
            wake_at=self.now,
            import_page_token="p2",
        )
        self.kept_message(c)
        self.assertEqual(self.client.delete(URL).status_code, 204)
        # A real request loads the user afresh; the test's user caches `mailbox`.
        self.as_dana()
        c.refresh_from_db()
        self.assertEqual(
            (
                c.status,
                c.credentials,
                c.history_id,
                c.wake_at,
                c.watch_expires_at,
                c.import_page_token,
            ),
            ("disconnected", "", None, None, None, ""),
        )
        self.assertEqual((self.fake.revoked, self.fake.stopped), (["fake-refresh"], 1))
        self.assertEqual(c.messages.count(), 1)
        delete_after = c.disconnected_at + timedelta(days=30)
        event = AuditEvent.objects.get(action="mailbox.disconnect")
        self.assertEqual(
            event.metadata,
            {
                "provider": "google",
                "address": "dana@acme.io",
                "revoked": True,
                "delete_after": delete_after.isoformat(),
            },
        )
        data = self.get()
        self.assertIsNone(data["connection"])
        self.assertEqual(
            data["disconnected"],
            {
                "provider": "google",
                "address": "dana@acme.io",
                "disconnected_at": c.disconnected_at,
                "delete_after": delete_after,
            },
        )
        # The owner still reads the kept copies; everywhere else it is no mailbox.
        self.assertEqual(self.client.get("/api/v1/mail/messages/").data["count"], 1)
        self.assertEqual(self.client.post("/api/v1/mail/sync/").status_code, 400)
        self.assertFalse(self.client.get("/api/v1/mail/messages/summary/").data["has_mailbox"])
        compose = self.client.post(
            f"/api/v1/customers/{self.pizza.id}/emails/send/",
            {"to": ["sam@pizzahut.com"], "subject": "Hi", "body": "x"},
            format="json",
        )
        self.assertEqual(compose.status_code, 400)
        self.assertEqual(self.client.delete(URL).status_code, 204)
        self.assertEqual(AuditEvent.objects.filter(action="mailbox.disconnect").count(), 1)

    def test_a_failed_revoke_still_disconnects(self):
        c = self.google(self.dana)
        self.fake.fail(r"^/revoke$", 400, "invalid_token")
        self.assertEqual(self.client.delete(URL).status_code, 204)
        c.refresh_from_db()
        self.assertEqual((c.status, c.credentials, self.fake.stopped), ("disconnected", "", 0))
        self.assertFalse(AuditEvent.objects.get(action="mailbox.disconnect").metadata["revoked"])

    # -- Sync now -----------------------------------------------------------
    def test_sync_now_queues_a_google_mailbox(self):
        c = self.google(self.dana)
        response = self.client.post("/api/v1/mail/sync/")
        self.assertEqual(response.status_code, 202)
        self.assertEqual(
            (response.data["provider"], response.data["filed"], response.data["queued"]),
            ("google", None, True),
        )
        c.refresh_from_db()
        self.assertIsNotNone(c.wake_at)
        self.assertEqual(self.fake.calls, [])

    def test_sync_now_on_a_paused_mailbox_is_refused(self):
        self.google(self.dana)
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        response = self.client.post("/api/v1/mail/sync/")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            (response.data["code"], response.data["paused_reason"]),
            ("MAILBOX_PAUSED", "workspace_off"),
        )

    def test_sync_now_on_imap_still_runs_inline(self):
        self.connect(self.dana)
        with patch("services.mail.sync.get_provider", return_value=FakeProvider()):
            response = self.client.post("/api/v1/mail/sync/")
        self.assertEqual((response.status_code, response.data["filed"]), (200, 0))
        self.assertNotIn("queued", response.data)

    # -- the summary --------------------------------------------------------
    def test_the_summary_carries_the_import_and_the_pause(self):
        self.google(
            self.dana,
            import_after=self.now - timedelta(days=365),
            import_before=self.now,
            import_done_at=self.now,
        )
        data = self.client.get("/api/v1/mail/messages/summary/").data
        self.assertEqual(data["import"]["state"], "done")
        self.assertIsNone(data["paused_reason"])
        self.connect(self.carl)
        self.client.force_authenticate(self.carl)
        data = self.client.get("/api/v1/mail/messages/summary/").data
        self.assertEqual(
            (data["has_mailbox"], data["import"], data["paused_reason"]), (True, None, None)
        )

    def test_an_imap_disconnect_deletes_at_once_and_audits_no_revoke(self):
        address = self.connect(self.dana).address
        self.assertEqual(self.client.delete(URL).status_code, 204)
        self.assertFalse(MailboxConnection.objects.filter(user=self.dana).exists())
        self.assertEqual(
            AuditEvent.objects.get(action="mailbox.disconnect").metadata,
            {"provider": "imap", "address": address, "revoked": False, "delete_after": None},
        )
