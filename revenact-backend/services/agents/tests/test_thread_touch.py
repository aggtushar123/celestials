"""The sync touches a thread when it stores a message, and does nothing
else (agent bundles D2 contract §2.1, D2-1, D2-22): filed mail by its
mailbox and thread id, a ticket by its connector and external id; a status
change alone touches nothing; an old first message makes the thread already
skipped, so a first import never floods the agents. No model is called and
no bundle is made at sync time."""

from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone

from services.agents.models import AgentBundle, SignalThread
from services.agents.tests.drafts_fixtures import mailbox
from services.agents.tests.intake_fixtures import MODEL, IntakeFixture
from services.connectors import sync as ticket_sync
from services.connectors.providers.base import RemoteTicket
from services.customers.models import Ticket
from services.mail import sync as mail_sync
from services.mail.providers.base import Message


def message(**overrides):
    base = dict(
        provider_id="m1",
        thread_id="t1",
        subject="Login loop",
        from_address="ann@pizzahut.com",
        from_name="Ann Lee",
        to=[("Carl CSM", "carl@acme.io")],
        date=timezone.now() - timedelta(minutes=20),
        body="The login loop is back.",
    )
    base.update(overrides)
    return Message(**base)


def remote(**overrides):
    base = dict(
        external_id="1042",
        number="ZD-1042",
        title="Login loop",
        description="Nobody can log in.",
        status="open",
        priority="high",
        requester_email="ann@pizzahut.com",
        requester_name="Ann Lee",
        opened_at=timezone.localdate(),
    )
    base.update(overrides)
    return RemoteTicket(**base)


@patch(MODEL, side_effect=AssertionError("no model at sync"))
class MailTouchTests(IntakeFixture):
    def setUp(self):
        self.connection = mailbox(self.csm)

    def test_filed_mail_touches_its_thread(self, _model):
        email = mail_sync.file_message(self.connection, message())
        thread = SignalThread.objects.get()
        self.assertEqual(
            (thread.source_kind, thread.external_id, thread.customer_id, thread.mailbox_owner_id),
            ("mail", f"{self.connection.pk}:t1", self.pizza.pk, self.csm.pk),
        )
        self.assertEqual((thread.mail_thread, thread.status, thread.department), ("t1", "new", ""))
        self.assertEqual(thread.last_message_at, email.sent_at)
        self.assertFalse(AgentBundle.objects.exists())

    def test_a_newer_message_moves_it_forward_and_an_older_one_never_back(self, _model):
        mail_sync.file_message(self.connection, message())
        SignalThread.objects.update(status="processed", processed_through=timezone.now())
        later = timezone.now() - timedelta(minutes=5)
        mail_sync.file_message(self.connection, message(provider_id="m2", date=later))
        thread = SignalThread.objects.get()
        self.assertEqual((thread.last_message_at, thread.status), (later, "new"))
        mail_sync.file_message(
            self.connection, message(provider_id="m3", date=later - timedelta(hours=1))
        )
        self.assertEqual(SignalThread.objects.get().last_message_at, later)

    def test_mail_with_no_thread_id_feeds_nothing(self, _model):
        mail_sync.file_message(self.connection, message(thread_id=""))
        self.assertFalse(SignalThread.objects.exists())

    def test_mail_first_seen_eight_days_old_is_already_skipped(self, _model):
        old = timezone.now() - timedelta(days=8)
        mail_sync.file_message(self.connection, message(date=old))
        thread = SignalThread.objects.get()
        self.assertEqual((thread.status, thread.skip_reason), ("skipped", "stale"))
        self.assertEqual(thread.processed_through, thread.last_message_at)


@patch(MODEL, side_effect=AssertionError("no model at sync"))
class TicketTouchTests(IntakeFixture):
    def setUp(self):
        self.zendesk = self.connector("zendesk", "cs")

    def test_a_new_ticket_touches_its_thread(self, _model):
        outcome, ticket = ticket_sync.file_ticket(self.zendesk, remote())
        self.assertEqual(outcome, "created")
        thread = SignalThread.objects.get()
        self.assertEqual(
            (thread.source_kind, thread.external_id, thread.ticket_id, thread.department),
            ("zendesk", f"{self.zendesk.pk}:1042", ticket.pk, "cs"),
        )
        self.assertEqual(thread.customer_id, self.pizza.pk)
        self.assertFalse(AgentBundle.objects.exists())

    def test_only_new_words_or_a_reopen_touch_an_existing_ticket(self, _model):
        ticket_sync.file_ticket(self.zendesk, remote())
        first = SignalThread.objects.get().last_message_at
        ticket_sync.file_ticket(self.zendesk, remote(priority="low", status="in-progress"))
        self.assertEqual(SignalThread.objects.get().last_message_at, first)
        ticket_sync.file_ticket(self.zendesk, remote(description="Still broken today."))
        second = SignalThread.objects.get().last_message_at
        self.assertGreater(second, first)
        ticket_sync.file_ticket(
            self.zendesk, remote(description="Still broken today.", status="resolved")
        )
        self.assertEqual(SignalThread.objects.get().last_message_at, second)
        ticket_sync.file_ticket(
            self.zendesk, remote(description="Still broken today.", status="open")
        )
        self.assertGreater(SignalThread.objects.get().last_message_at, second)

    def test_a_ticket_first_seen_opened_eight_days_ago_is_already_skipped(self, _model):
        ticket_sync.file_ticket(
            self.zendesk, remote(opened_at=timezone.localdate() - timedelta(days=8))
        )
        thread = SignalThread.objects.get()
        self.assertEqual((thread.status, thread.skip_reason), ("skipped", "stale"))

    def test_an_unmatched_ticket_is_still_skipped_and_makes_no_thread(self, _model):
        outcome, _ = ticket_sync.file_ticket(self.zendesk, remote(requester_email="x@nowhere.io"))
        self.assertEqual(outcome, "unmatched")  # D2-2: unchanged
        self.assertFalse(SignalThread.objects.exists())
        self.assertFalse(Ticket.objects.exists())
