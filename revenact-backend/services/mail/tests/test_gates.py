"""Who may connect Google and when a Google mailbox is paused (contract §1,
decisions 22-24): the gates in order, the pause precedence computed live and
in bulk, each change audited, and no sending through a paused mailbox."""

from unittest.mock import patch

from django.db import connection as db
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import Organisation, User
from services.agents.tests.drafts_fixtures import draft, inbound
from services.agents.tests.fixtures import AgentsFixture
from services.billing.models import SeatAssignment
from services.customers.models import ReplyDraft
from services.identity.models import OrganizationDomain, OrganizationMembership
from services.mail import gates
from services.mail.models import MailboxConnection

from .gmail_fixtures import GmailFixture, google_connection
from .test_mail import FakeProvider


class ConnectGateTests(GmailFixture):
    def fresh(self, user):
        return User.objects.get(pk=user.pk)

    def test_everyone_in_order(self):
        self.assertIsNone(gates.connect_gate(self.fresh(self.dana)))
        SeatAssignment.objects.filter(membership__user=self.dana).update(released_at=timezone.now())
        self.assertEqual(gates.connect_gate(self.fresh(self.dana)), gates.NO_SEAT)
        OrganizationMembership.objects.filter(user=self.dana).update(status="suspended")
        self.assertEqual(gates.connect_gate(self.fresh(self.dana)), gates.MEMBER_SUSPENDED)
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        self.assertEqual(gates.connect_gate(self.fresh(self.dana)), gates.GMAIL_NOT_ENABLED)

    def test_a_suspended_workspace_or_an_inactive_person_is_suspended(self):
        Organisation.objects.filter(pk=self.org.pk).update(status="suspended")
        self.assertEqual(gates.connect_gate(self.fresh(self.dana)), gates.MEMBER_SUSPENDED)
        Organisation.objects.filter(pk=self.org.pk).update(status="active")
        User.objects.filter(pk=self.dana.pk).update(is_active=False)
        self.assertEqual(gates.connect_gate(self.fresh(self.dana)), gates.MEMBER_SUSPENDED)

    def test_no_verified_domain_comes_last(self):
        OrganizationDomain.objects.update(verification_status="pending")
        self.assertEqual(gates.connect_gate(self.fresh(self.dana)), gates.NO_VERIFIED_DOMAIN)
        self.assertIsNone(gates.early_gate(self.fresh(self.dana)))

    def test_the_address_must_be_on_a_verified_domain_exactly(self):
        OrganizationDomain.objects.create(
            organisation=self.org, domain="acme.co.uk", verification_status="verified"
        )
        OrganizationDomain.objects.create(
            organisation=self.org, domain="acme.dev", verification_status="pending"
        )
        self.assertIsNone(gates.address_gate(self.org, "dana@ACME.io"))
        for address in ("dana@eu.acme.io", "dana@gmail.com", "dana@acme.dev", "nobody"):
            with self.subTest(address=address):
                self.assertEqual(
                    gates.address_gate(self.org, address),
                    (gates.WRONG_DOMAIN, "Connect your acme.co.uk or acme.io account."),
                )
        OrganizationDomain.objects.update(verification_status="revoked")
        self.assertEqual(
            gates.address_gate(self.org, "dana@acme.io"),
            (gates.NO_VERIFIED_DOMAIN, gates.MESSAGES[gates.NO_VERIFIED_DOMAIN]),
        )


class PauseTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)

    def live(self):
        return gates.paused_reason(MailboxConnection.objects.get(pk=self.mailbox.pk))

    def test_the_precedence(self):
        args = dict(
            enabled=True, org_status="active", user_active=True, membership_id=1, seated=True
        )
        self.assertEqual(gates.reason_for(stored="", **args), "")
        self.assertEqual(gates.reason_for(stored="", **{**args, "seated": False}), "no_seat")
        self.assertEqual(
            gates.reason_for(stored="", **{**args, "membership_id": None, "seated": False}),
            "suspended",
        )
        self.assertEqual(
            gates.reason_for(stored="", **{**args, "org_status": "archived"}), "suspended"
        )
        self.assertEqual(gates.reason_for(stored="", **{**args, "user_active": False}), "suspended")
        self.assertEqual(
            gates.reason_for(stored="", **{**args, "enabled": False, "user_active": False}),
            "workspace_off",
        )
        self.assertEqual(
            gates.reason_for(stored="token_revoked", **{**args, "enabled": False}), "token_revoked"
        )

    def test_live_reasons(self):
        self.assertEqual(self.live(), "")
        SeatAssignment.objects.filter(membership__user=self.dana).update(released_at=timezone.now())
        self.assertEqual(self.live(), "no_seat")
        OrganizationMembership.objects.filter(user=self.dana).update(status="revoked")
        self.assertEqual(self.live(), "suspended")
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        self.assertEqual(self.live(), "workspace_off")

    def test_outlook_imap_and_disconnected_rows_are_never_paused(self):
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        self.assertEqual(gates.paused_reason(self.connect(self.carl)), "")
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")
        self.assertEqual(self.live(), "")
        self.assertIsNone(gates.live_mailbox(User.objects.get(pk=self.dana.pk)))

    def test_the_sweep_writes_audits_and_wakes_on_resume(self):
        carl = self.google(self.carl)
        revoked = self.google(self.alice, paused_reason="token_revoked", status="error")
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        with CaptureQueriesContext(db) as queries:
            self.assertEqual(gates.sweep(), (2, 0))
        self.assertLessEqual(
            len([q for q in queries.captured_queries if "audit" not in q["sql"]]), 8
        )
        self.assertEqual(
            set(MailboxConnection.objects.values_list("pk", "paused_reason")),
            {
                (self.mailbox.pk, "workspace_off"),
                (carl.pk, "workspace_off"),
                (revoked.pk, "token_revoked"),
            },
        )
        event = AuditEvent.objects.filter(action="mailbox.paused").first()
        self.assertEqual(
            (event.actor, event.organisation, event.metadata),
            (None, self.org, {"reason": "workspace_off"}),
        )
        self.assertEqual(gates.sweep(), (0, 0))

        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=True)
        self.assertEqual(gates.sweep(), (0, 2))
        self.mailbox.refresh_from_db()
        self.assertEqual(self.mailbox.paused_reason, "")
        self.assertIsNotNone(self.mailbox.wake_at)
        self.assertEqual(
            AuditEvent.objects.filter(action="mailbox.resumed").first().metadata,
            {"from": "workspace_off"},
        )
        revoked.refresh_from_db()
        self.assertEqual(revoked.paused_reason, "token_revoked")

    def test_a_revoke_landing_mid_sweep_is_never_erased_or_audited(self):
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        gates.sweep()
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=True)
        real = gates.reason_for

        def revoked_meanwhile(**kw):
            # A tick (or a send) pauses the mailbox after the sweep read it.
            MailboxConnection.objects.filter(pk=self.mailbox.pk).update(
                status="error", paused_reason="token_revoked"
            )
            return real(**kw)

        with patch("services.mail.gates.reason_for", side_effect=revoked_meanwhile):
            self.assertEqual(gates.sweep(), (0, 0))
        self.mailbox.refresh_from_db()
        self.assertEqual(
            (self.mailbox.paused_reason, self.mailbox.wake_at), ("token_revoked", None)
        )
        self.assertFalse(AuditEvent.objects.filter(action="mailbox.resumed").exists())


class PausedSendTests(GmailFixture):
    """A paused Google mailbox never acts as the person (decision 24)."""

    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        self.client.force_authenticate(self.dana)
        FakeProvider.sent = []
        patcher = patch("services.mail.sync.get_provider", return_value=FakeProvider())
        patcher.start()
        self.addCleanup(patcher.stop)

    def assertPaused(self, response):
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(
            response.data,
            {
                "code": "MAILBOX_PAUSED",
                "detail": (
                    "Your Gmail connection is paused: your workspace isn't enabled for Gmail."
                ),
                "paused_reason": "workspace_off",
            },
        )
        self.assertEqual(FakeProvider.sent, [])

    def test_compose_and_both_replies(self):
        body = {"to": ["sam@pizzahut.com"], "subject": "Hi", "body": "x"}
        self.assertPaused(
            self.client.post(f"/api/v1/customers/{self.pizza.id}/emails/send/", body, format="json")
        )
        self.assertPaused(
            self.client.post(
                f"/api/v1/customers/{self.pizza.id}/accounts/{self.apac.id}/emails/send/",
                body,
                format="json",
            )
        )
        from services.mail.models import MailMessage

        row = MailMessage.objects.create(
            connection=self.mailbox,
            owner=self.dana,
            organisation=self.org,
            provider_message_id="g1",
            direction="received",
            from_address="sam@pizzahut.com",
            subject="Hi",
            sent_at=timezone.now(),
        )
        self.assertPaused(
            self.client.post(
                f"/api/v1/mail/messages/{row.id}/reply/", {"body": "ok"}, format="json"
            )
        )
        email = self.email(self.dana, from_address="sam@pizzahut.com", mailbox=self.mailbox)
        self.assertPaused(
            self.client.post(
                f"/api/v1/communications/emails/{email.id}/reply/", {"body": "ok"}, format="json"
            )
        )

    def test_the_stats_tile_knows_a_disconnected_mailbox_is_none(self):
        url = "/api/v1/communications/stats/"
        self.assertTrue(self.client.get(url).data["has_mailbox"])
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")
        # A real request loads the user afresh; the test's user caches `mailbox`.
        self.client.force_authenticate(User.objects.get(pk=self.dana.pk))
        self.assertFalse(self.client.get(url).data["has_mailbox"])


class PausedDraftSendTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.connection = google_connection(cls.csm)
        cls.mail = inbound(cls.pizza, cls.csm)

    def test_a_draft_is_never_claimed_through_a_paused_mailbox(self):
        # The workspace is not switched on: the mailbox is paused (workspace_off).
        mine = draft(self.mail, self.csm)
        with patch("services.mail.sync.get_provider", return_value=FakeProvider()):
            response = self.client_for(self.csm).post(
                f"/api/v1/communications/drafts/{mine.pk}/send/", {}, format="json"
            )
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data["code"], "MAILBOX_PAUSED")
        mine.refresh_from_db()
        self.assertEqual(mine.status, ReplyDraft.Status.OPEN)
