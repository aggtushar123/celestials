"""The email agent (spec 2026-10-17-private-mail-and-email-agent-design §2,
owner decisions A, B, D of 2026-10-17).

Defended: internal mail (every party a member) is never stored, not even in
its owner's inbox, and stored copies can be purged; the agent reads it only
for someone who switched it on, only mail they sent, less than a day old,
once. Whatever it finds waits on that sender: nobody else hears of a task or
a meeting until they confirm. Then the colleague gets the task (undoable for
a day) or the person asked for gets the meeting to book. The email text
never leaves the mailbox: a canary in it reaches no task, proposal,
notification, feed row or calendar invite.
"""

from datetime import datetime, timedelta
from datetime import timezone as dt_timezone
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.utils import timezone
from rest_framework import status

from core.models import AuditEvent
from services.accounts.models import User
from services.calendar.models import Meeting
from services.customers.models import Task
from services.emailagent import inbox, run
from services.emailagent.models import EmailIntent, MeetingProposal
from services.mail import scopes
from services.mail.models import MailMessage
from services.mail.providers.base import Message
from services.mail.sync import store_message, sync_mailbox
from services.mail.tests.gmail_fixtures import GRANTED, GmailFixture
from services.mail.tests.test_mail import FakeProvider
from services.notifications.models import Notification

# A Friday, 10:00 UTC; the workspace works Monday to Friday in UTC.
NOW = datetime(2026, 10, 16, 10, 0, tzinfo=dt_timezone.utc)
CANARY = "SECRET-CANARY"
BODY = f"Pizza Hut's health is going down ({CANARY} figures), we need to talk to Alice, urgent."


def internal(sender, to, *, rfc="<m1@acme.io>", date=None, labels=("sent",), body=BODY):
    return Message(
        provider_id=f"p-{rfc}",
        thread_id="t1",
        subject="Pizza Hut",
        from_address=sender.email,
        from_name=sender.name,
        to=[(u.name, u.email) for u in to],
        date=date or NOW - timedelta(minutes=5),
        body=body,
        headers={"Message-ID": rfc},
        labels=list(labels),
    )


class AgentFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.carl_box = self.google(
            self.carl, granted_scopes=[*GRANTED, scopes.CALENDAR_EVENTS], agent_reads_mail=True
        )
        self.dana_box = self.google(self.dana, agent_reads_mail=True)
        self.reads = []
        self.answer = {"intent": "none", "topic": "", "urgent": False}
        patcher = patch("services.emailagent.detect.read", side_effect=self._read)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _read(self, message, **_):
        self.reads.append(message.provider_id)
        assert CANARY in message.body  # the agent does read the mail, in memory
        return self.answer

    def process(self, message, box=None):
        return run.process(box or self.carl_box, message, now=NOW)


class NeverStoredTests(AgentFixture):
    def test_internal_mail_is_not_kept_and_mail_with_a_customer_is(self):
        self.assertIsNone(store_message(self.dana_box, internal(self.carl, [self.dana])))
        sam = Message(
            provider_id="ext",
            thread_id="t2",
            subject="Renewal",
            from_address="sam@pizzahut.com",
            from_name="Sam",
            to=[("Dana", "dana@acme.io")],
            date=NOW,
            body="Renew?",
        )
        self.assertIsNotNone(store_message(self.dana_box, sam))
        self.assertEqual(
            list(MailMessage.objects.values_list("provider_message_id", flat=True)), ["ext"]
        )

    def test_sync_hands_it_to_the_agent_and_stores_nothing(self):
        imap = self.connect(self.priya)
        imap.agent_reads_mail = True
        imap.save(update_fields=["agent_reads_mail"])
        FakeProvider.queued = [internal(self.priya, [self.carl], date=timezone.now())]
        with patch("services.mail.sync.get_provider", return_value=FakeProvider()):
            sync_mailbox(imap)
        self.assertFalse(MailMessage.objects.filter(connection=imap).exists())
        self.assertEqual(inbox.drain(imap), 1)
        self.assertEqual(self.reads, ["p-<m1@acme.io>"])

    def test_purge_counts_then_deletes_stored_internal_mail_only(self):
        for i, (sender, to) in enumerate(
            ((self.carl, "dana@acme.io"), ("sam@pizzahut.com", "dana@acme.io"))
        ):
            MailMessage.objects.create(
                connection=self.dana_box,
                owner=self.dana,
                organisation=self.org,
                provider_message_id=f"old-{i}",
                direction="received",
                subject="x",
                from_address=getattr(sender, "email", sender),
                to=[["", to]],
                sent_at=NOW,
            )
        out = StringIO()
        call_command("purge_internal_mail", stdout=out)
        self.assertIn("1 internal message(s) would be deleted", out.getvalue())
        self.assertEqual(MailMessage.objects.count(), 2)
        call_command("purge_internal_mail", "--delete", stdout=StringIO())
        self.assertEqual(
            list(MailMessage.objects.values_list("provider_message_id", flat=True)), ["old-1"]
        )
        self.assertTrue(AuditEvent.objects.filter(action="mail.internal_purged").exists())


class ConsentTests(AgentFixture):
    def test_only_for_someone_who_switched_it_on_and_only_what_they_sent_today(self):
        self.carl_box.agent_reads_mail = False
        self.assertFalse(
            inbox.offer(self.carl_box, internal(self.carl, [self.dana]), sent=True, now=NOW)
        )
        self.carl_box.agent_reads_mail = True
        self.assertFalse(
            inbox.offer(self.carl_box, internal(self.dana, [self.carl]), sent=False, now=NOW)
        )
        old = internal(self.carl, [self.dana], date=NOW - timedelta(hours=25))
        self.assertFalse(inbox.offer(self.carl_box, old, sent=True, now=NOW))
        self.assertTrue(
            inbox.offer(self.carl_box, internal(self.carl, [self.dana]), sent=True, now=NOW)
        )
        inbox._waiting.clear()

    def test_the_owner_switches_it_on_and_off_audited(self):
        self.client.force_authenticate(self.priya)
        self.google(self.priya)
        response = self.client.patch(
            "/api/v1/mail/connection/", {"agent_reads_mail": True}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["connection"]["agent_reads_mail"])
        self.assertEqual(
            AuditEvent.objects.get(action="mailbox.agent_reads_mail").metadata, {"to": True}
        )
        bad = self.client.patch(
            "/api/v1/mail/connection/", {"agent_reads_mail": "yes"}, format="json"
        )
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

    def test_each_message_is_read_once(self):
        self.process(internal(self.carl, [self.dana]))
        self.process(internal(self.carl, [self.dana]), box=self.dana_box)
        self.assertEqual(len(self.reads), 1)


class TaskTests(AgentFixture):
    def setUp(self):
        super().setUp()
        self.answer = {
            "intent": "task",
            "topic": "Pizza Hut renewal prep",
            "urgent": False,
            "customer_name": "Pizza Hut",
            "assignee_email": "dana@acme.io",
            "task_title": "Prepare the Pizza Hut renewal deck",
            "due": "tomorrow_morning",
        }

    def test_it_waits_on_the_sender_and_nobody_else_hears_of_it(self):
        intent = self.process(internal(self.carl, [self.priya]))
        self.assertEqual(intent.outcome, EmailIntent.Outcome.AWAITING)
        self.assertFalse(Task.objects.exists())
        self.assertFalse(Notification.objects.filter(recipient=self.dana).exists())
        self.client.force_authenticate(self.carl)
        rows = self.client.get("/api/v1/work/feed/").data
        row = next(i for g in rows["groups"] for i in g["items"] if i["kind"] == "email_suggestion")
        self.assertEqual(row["title"], "Give Dana a task: Prepare the Pizza Hut renewal deck")
        self.assertEqual(str(row["detail"]["due_date"]), "2026-10-19")
        self.assertNotIn(CANARY, str(row))

    def test_confirm_gives_the_colleague_the_task_and_either_can_undo_it(self):
        intent = self.process(internal(self.carl, [self.priya]))
        self.client.force_authenticate(self.dana)  # not hers to confirm
        self.assertEqual(
            self.client.post(f"/api/v1/email-agent/suggestions/{intent.pk}/confirm/").status_code,
            404,
        )
        self.client.force_authenticate(self.carl)
        response = self.client.post(f"/api/v1/email-agent/suggestions/{intent.pk}/confirm/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        task = Task.objects.get()
        self.assertEqual(
            (task.assignee, task.created_by, task.customer), (self.dana, self.carl, self.pizza)
        )
        self.assertEqual(task.due_date.isoformat(), "2026-10-19")  # Friday → Monday
        self.assertNotIn(CANARY, task.description)
        self.assertTrue(Notification.objects.filter(recipient=self.dana).exists())
        self.client.force_authenticate(self.dana)
        self.assertEqual(
            self.client.post(f"/api/v1/email-agent/tasks/{task.pk}/undo/").status_code, 200
        )
        self.assertFalse(Task.objects.exists())

    def test_never_suggested_for_someone_who_cannot_open_the_customer(self):
        eve = User.objects.create_user(
            email="eve@acme.io", password="x", name="Eve", organisation=self.org
        )
        self.answer["assignee_email"] = eve.email
        intent = self.process(internal(self.carl, [eve]))
        self.assertEqual(intent.outcome, EmailIntent.Outcome.TASK_REFUSED)

    def test_dismiss(self):
        intent = self.process(internal(self.carl, [self.priya]))
        self.client.force_authenticate(self.carl)
        self.assertEqual(
            self.client.post(f"/api/v1/email-agent/suggestions/{intent.pk}/dismiss/").status_code,
            200,
        )
        intent.refresh_from_db()
        self.assertEqual(intent.outcome, EmailIntent.Outcome.DISMISSED)
        self.assertFalse(Task.objects.exists())


class FakeCalendar:
    def __init__(self):
        self.inserted = []

    def __call__(self, creds):
        self.creds = creds
        return self

    def insert(self, body, **params):
        self.inserted.append(body)
        return {**body, "status": "confirmed", "hangoutLink": "https://meet.google.com/x"}


class MeetingTests(AgentFixture):
    def setUp(self):
        super().setUp()
        self.answer = {
            "intent": "meeting",
            "topic": "Pizza Hut health is dropping",
            "urgent": True,
            "customer_name": "Pizza Hut",
            "asked_for": ["alice@acme.io"],
            "length_minutes": 30,
        }

    def test_the_person_asked_for_hears_nothing_until_the_sender_sends_it(self):
        intent = self.process(internal(self.carl, [self.dana]))
        proposal = MeetingProposal.objects.get()
        self.assertEqual(
            (proposal.approver, proposal.status),
            (self.alice, MeetingProposal.Status.AWAITING_SENDER),
        )
        self.assertFalse(Notification.objects.filter(recipient=self.alice).exists())
        self.client.force_authenticate(self.alice)
        self.assertEqual(
            self.client.get(f"/api/v1/email-agent/proposals/{proposal.pk}/").status_code, 404
        )
        feed = self.client.get("/api/v1/work/feed/").data
        self.assertFalse(
            any(i["kind"] == "meeting_proposal" for g in feed["groups"] for i in g["items"])
        )
        # Carl sends it: now Alice gets it, a topic and who asked, never the mail.
        self.client.force_authenticate(self.carl)
        mine = self.client.get("/api/v1/work/feed/").data
        row = next(i for g in mine["groups"] for i in g["items"] if i["kind"] == "email_suggestion")
        self.assertEqual(row["title"], "Ask Alice for a meeting: Pizza Hut health is dropping")
        self.client.post(f"/api/v1/email-agent/suggestions/{intent.pk}/confirm/")
        told = Notification.objects.get(
            recipient=self.alice, kind=Notification.Kind.MEETING_PROPOSED
        )
        self.assertEqual(told.message, "Carl asked for a meeting: Pizza Hut health is dropping")
        self.client.force_authenticate(self.alice)
        feed = self.client.get("/api/v1/work/feed/").data
        row = next(i for g in feed["groups"] for i in g["items"] if i["kind"] == "meeting_proposal")
        self.assertEqual(row["detail"]["requester"]["name"], "Carl")
        self.assertNotIn(CANARY, str(row))

    def test_urgent_finds_the_first_half_hour_carl_is_free_today(self):
        Meeting.objects.create(
            organisation=self.org,
            owner=self.carl,
            connection=self.carl_box,
            google_event_id="busy",
            starts_at=datetime(2026, 10, 16, 10, 30, tzinfo=dt_timezone.utc),
            ends_at=datetime(2026, 10, 16, 11, 30, tzinfo=dt_timezone.utc),
        )
        self.process(internal(self.carl, [self.dana]))
        self.assertEqual(
            MeetingProposal.objects.get().proposed_start,
            datetime(2026, 10, 16, 11, 30, tzinfo=dt_timezone.utc),
        )

    def test_not_urgent_starts_the_next_working_morning(self):
        self.answer["urgent"] = False
        self.process(internal(self.carl, [self.dana]))
        self.assertEqual(
            MeetingProposal.objects.get().proposed_start,
            datetime(2026, 10, 19, 9, 0, tzinfo=dt_timezone.utc),
        )

    def test_asking_nobody_else_is_the_senders_own_to_book(self):
        self.answer["asked_for"] = []
        self.process(internal(self.carl, [self.dana]))
        proposal = MeetingProposal.objects.get()
        self.assertEqual(
            (proposal.approver, proposal.status), (self.carl, MeetingProposal.Status.OPEN)
        )

    def test_once_sent_the_approver_books_it_and_google_invites_the_rest(self):
        self.answer["asked_for"] = ["carl@acme.io"]  # Dana writes; Carl, with Calendar, approves
        intent = self.process(internal(self.dana, [self.priya]), box=self.dana_box)
        self.client.force_authenticate(self.dana)
        self.client.post(f"/api/v1/email-agent/suggestions/{intent.pk}/confirm/")
        fake = FakeCalendar()
        proposal = MeetingProposal.objects.get()
        self.client.force_authenticate(self.carl)
        with patch("services.calendar.booking.CalendarSession", fake):
            response = self.client.post(
                f"/api/v1/email-agent/proposals/{proposal.pk}/book/", {}, format="json"
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            sorted(a["email"] for a in fake.inserted[0]["attendees"]),
            ["dana@acme.io", "priya@acme.io"],
        )
        self.assertNotIn(CANARY, str(fake.inserted[0]))
        proposal.refresh_from_db()
        self.assertEqual(proposal.status, MeetingProposal.Status.BOOKED)
