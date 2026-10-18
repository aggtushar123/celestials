"""The send: claimed once under row locks, the audience resolved again on
the server, one emailed link per person, a failure isolated to its invite,
the counts frozen and the send audited."""

import hashlib
import re
from datetime import timedelta
from io import StringIO
from smtplib import SMTPRecipientsRefused
from unittest.mock import ANY, patch

from django.conf import settings
from django.core import mail
from django.core.mail import send_mail
from django.core.management import call_command
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.email import send_survey_email
from services.surveys.models import STALE_MINUTES, SurveyInvite, SurveySend
from services.surveys.sending import _start_of, claim, deliver, deliver_pending
from services.surveys.tests.fixtures import SurveyFixture, contact

LINK = re.compile(r"/s/([A-Za-z0-9_-]+)")
FULL = {
    "audience": 2, "sent": 2, "failed": 0, "skipped_recent": 0, "skipped_no_email": 0,
    "skipped_cap": 0,
}  # fmt: skip


class SendFixture(SurveyFixture):
    def send_now(self, send, user=None, *, deliver=True):
        """Send now, then (by default) the minute runner that emails it."""
        client = APIClient()
        client.force_authenticate(user or send.owner)
        response = client.post(f"/api/v1/surveys/sends/{send.pk}/send/", format="json")
        if deliver:
            call_command("deliver_pending", stdout=StringIO())
        return response

    def ready(self, **fields):
        """Carl's draft to Pizza Hut's champions and decision makers: Ann and Ben."""
        return self.make_send(segment=self.pinned("customer", [self.pizza]), **fields)


class SendTests(SendFixture):
    def test_each_person_gets_their_own_link_and_only_its_hash_is_kept(self):
        send = self.ready(intro="Two minutes, promise.")
        response = self.send_now(send)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            sorted(message.to[0] for message in mail.outbox),
            ["ann@example.com", "ben@example.com"],
        )
        for message in mail.outbox:
            token = LINK.search(message.body).group(1)
            invite = SurveyInvite.objects.get(email=message.to[0])
            self.assertGreaterEqual(len(token), 43)
            self.assertEqual(invite.token_hash, hashlib.sha256(token.encode()).hexdigest())
            stored = SurveyInvite.objects.filter(pk=invite.pk).values().first()
            self.assertNotIn(token, str(stored))
        send.refresh_from_db()
        self.assertEqual((send.status, send.counts), ("sent", FULL))
        self.assertIsNotNone(send.sent_at)
        ben = SurveyInvite.objects.get(contact=self.ben)
        self.assertEqual(
            (ben.status, ben.customer_id, ben.account_id), ("pending", None, self.emea.pk)
        )
        self.assertEqual(ben.expires_at, send.started_at + timedelta(days=14))
        self.assertEqual(response.data["status"], "sending")

    def test_the_send_is_audited_with_counts_only(self):
        send = self.ready()
        self.send_now(send)
        event = AuditEvent.objects.get(action="survey.sent")
        self.assertEqual((event.target_id, event.metadata), (str(send.pk), FULL))

    def test_one_failure_never_stops_the_batch(self):
        send = self.ready()
        with patch(
            "services.surveys.sending.send_survey_email",
            side_effect=[OSError("mailbox unavailable"), None],
        ) as email:
            response = self.send_now(send)
        self.assertEqual((response.status_code, email.call_count), (200, 2))
        ann = SurveyInvite.objects.get(contact=self.ann)
        self.assertEqual(
            (ann.status, ann.failure), ("failed", "OSError: the email could not be sent.")
        )
        self.assertEqual(SurveyInvite.objects.get(contact=self.ben).status, "pending")
        send.refresh_from_db()
        self.assertEqual((send.status, send.counts["sent"], send.counts["failed"]), ("sent", 1, 1))

    def test_the_stored_failure_never_carries_the_address(self):
        refused = SMTPRecipientsRefused(
            {"ann@example.com": (550, b"5.1.1 <ann@example.com> unknown")}
        )
        with patch("services.surveys.sending.send_survey_email", side_effect=[refused, None]):
            self.send_now(self.ready())
        failure = SurveyInvite.objects.get(contact=self.ann).failure
        self.assertEqual(failure, "SMTPRecipientsRefused: the email could not be sent.")
        self.assertNotIn("@", failure)

    def test_one_mail_connection_serves_the_whole_batch(self):
        contact(self.pizza, "Cat")
        with (
            patch("services.surveys.sending.get_connection") as opened,
            patch("services.surveys.sending.send_survey_email") as email,
        ):
            self.assertEqual(self.send_now(self.ready()).status_code, 200)
        self.assertEqual((opened.call_count, email.call_count), (1, 3))
        batch = opened.return_value
        self.assertEqual({call.kwargs["connection"] for call in email.call_args_list}, {batch})

    def test_a_failure_reopens_the_connection_for_the_rest(self):
        with (
            patch("services.surveys.sending.get_connection") as opened,
            patch(
                "services.surveys.sending.send_survey_email", side_effect=[OSError("dropped"), None]
            ),
        ):
            self.send_now(self.ready())
        batch = opened.return_value
        # opened once for the batch, closed and reopened after the failure,
        # closed at the end
        self.assertEqual((batch.close.call_count, batch.open.call_count), (2, 2))
        self.assertEqual(SurveyInvite.objects.get(contact=self.ben).status, "pending")

    def test_the_connection_carries_the_messages(self):
        with patch("services.email.send_mail", wraps=send_mail) as sent:
            self.send_now(self.ready())
        connections = {call.kwargs["connection"] for call in sent.call_args_list}
        self.assertEqual((len(sent.call_args_list), len(connections)), (2, 1))
        self.assertIsNotNone(connections.pop())
        self.assertEqual(len(mail.outbox), 2)

    def test_a_second_send_is_409(self):
        send = self.ready()
        self.assertEqual(self.send_now(send).status_code, 200)
        response = self.send_now(send)
        self.assertEqual(
            (response.status_code, response.data),
            (409, {"detail": "This survey has already been sent."}),
        )
        self.assertEqual(len(mail.outbox), 2)

    def test_a_send_already_under_way_is_409(self):
        response = self.send_now(self.ready(status="sending"))
        self.assertEqual(
            (response.status_code, response.data), (409, {"detail": "This survey is being sent."})
        )
        self.assertEqual(mail.outbox, [])

    def test_the_claim_locks_the_owner_and_the_send(self):
        send = self.ready()
        with CaptureQueriesContext(connection) as ctx:
            self.send_now(send)
        locks = [query["sql"] for query in ctx.captured_queries if "FOR UPDATE" in query["sql"]]
        self.assertTrue(any('"accounts_user"' in sql for sql in locks), locks)
        self.assertTrue(any('"surveys_surveysend"' in sql for sql in locks), locks)

    def test_a_send_still_delivering_already_counts_its_people_as_asked(self):
        """Send A claims Ben and is left `sending` mid-delivery; send B over
        Ann and Ben, claimed meanwhile, skips Ben as asked in 30 days."""
        first = self.make_send(segment=self.pinned("account", [self.emea]))
        claim(first.pk, self.csm, today=timezone.localdate(), now=timezone.now())
        self.assertEqual(SurveyInvite.objects.filter(send=first).count(), 1)
        second = self.ready()
        response = self.send_now(second, deliver=False)
        self.assertEqual(response.status_code, 200, response.content)
        deliver(second)
        second.refresh_from_db()
        self.assertEqual(
            (second.counts["audience"], second.counts["skipped_recent"]), (1, 1), second.counts
        )
        self.assertEqual([message.to[0] for message in mail.outbox], ["ann@example.com"])

    def test_the_claim_locks_the_workspace_first(self):
        send = self.ready()
        with CaptureQueriesContext(connection) as ctx:
            self.send_now(send)
        locks = [query["sql"] for query in ctx.captured_queries if " UPDATE" in query["sql"]]
        locks = [sql for sql in locks if sql.startswith("SELECT")]
        self.assertTrue(locks, locks)
        self.assertIn('FROM "accounts_organisation"', locks[0])
        self.assertTrue(locks[0].endswith("FOR NO KEY UPDATE"), locks[0])

    def test_only_the_owner_sends(self):
        shared = self.ready(sharing="workspace")
        response = self.send_now(shared, user=self.other)
        self.assertEqual(
            (response.status_code, response.data),
            (403, {"detail": "Only the survey's owner can change it."}),
        )
        self.assertEqual(self.send_now(self.ready(), user=self.other).status_code, 404)


class RefusalTests(SendFixture):
    def assertRefused(self, send, status, body):
        response = self.send_now(send)
        self.assertEqual((response.status_code, response.data), (status, body))
        send.refresh_from_db()
        self.assertEqual((send.status, send.started_at), ("draft", None))
        self.assertFalse(SurveyInvite.objects.exists())
        self.assertEqual(mail.outbox, [])

    def test_no_segment(self):
        self.assertRefused(self.make_send(), 400, {"segment": ["Choose a segment."]})

    def test_nobody_to_send_to(self):
        # Carl's segment pins only Taco Bell, which he cannot open.
        send = self.make_send(segment=self.pinned("customer", [self.taco]))
        self.assertRefused(send, 400, {"segment": ["Nobody to send to."]})

    def test_no_roles(self):
        self.assertRefused(self.ready(roles=[]), 400, {"roles": ["Choose at least one role."]})

    def test_more_than_500_people(self):
        with patch("services.surveys.sending.MAX_PEOPLE", 1):
            self.assertRefused(
                self.ready(), 400, {"segment": ["This survey would reach 2 people; the most is 1."]}
            )

    def test_someone_elses_segment(self):
        theirs = self.pinned("customer", [self.taco], owner=self.other, sharing="workspace")
        self.assertRefused(
            self.make_send(segment=theirs),
            403,
            {"detail": "You can only survey your own segments."},
        )

    def started(self, count, at):
        SurveySend.objects.bulk_create(
            SurveySend(
                organisation=self.org,
                owner=self.csm,
                name=f"S{i}",
                survey_type="nps",
                subject="s",
                status="sent",
                started_at=at,
            )
            for i in range(count)
        )

    def test_the_20th_send_of_the_day_is_allowed(self):
        self.started(19, self.now)
        self.assertEqual(self.send_now(self.ready()).status_code, 200)

    def test_the_21st_send_of_the_day_is_429(self):
        self.started(20, self.now)
        self.assertRefused(
            self.ready(),
            429,
            {"detail": "You can send at most 20 surveys a day. Try again tomorrow."},
        )

    def test_earlier_days_do_not_count(self):
        self.started(20, self.now - timedelta(days=2))
        self.assertEqual(self.send_now(self.ready()).status_code, 200)

    def test_a_send_just_before_midnight_counts_for_the_day_before(self):
        # The day starts at midnight in settings.TIME_ZONE (UTC).
        midnight = _start_of(timezone.localdate())
        self.started(20, midnight - timedelta(seconds=1))
        self.assertEqual(self.send_now(self.ready()).status_code, 200)

    def test_a_send_at_midnight_counts_for_the_new_day(self):
        self.started(20, _start_of(timezone.localdate()))
        self.assertEqual(self.send_now(self.ready()).status_code, 429)


CONSOLE = "django.core.mail.backends.console.EmailBackend"


class EmailNotSetUpTests(SendFixture):
    @override_settings(EMAIL_BACKEND=CONSOLE, DEBUG=False)
    def test_the_console_backend_outside_debug_refuses_before_the_claim(self):
        send = self.ready()
        with patch("sys.stdout", new_callable=StringIO) as stdout:
            response = self.send_now(send)
        self.assertEqual(
            (response.status_code, response.data),
            (
                400,
                {"detail": "Email isn't set up for this workspace yet, so surveys can't be sent."},
            ),
        )
        send.refresh_from_db()
        self.assertEqual((send.status, send.started_at), ("draft", None))
        self.assertFalse(SurveyInvite.objects.exists())
        self.assertEqual(stdout.getvalue(), "")

    @override_settings(EMAIL_BACKEND=CONSOLE, DEBUG=True)
    def test_the_console_backend_still_sends_in_debug(self):
        with patch("sys.stdout", new_callable=StringIO) as stdout:
            response = self.send_now(self.ready())
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIn("/s/", stdout.getvalue())


class SurveyEmailTests(SurveyFixture):
    def test_the_email_is_plain_text_with_the_question_and_the_link(self):
        send = self.make_send(subject="How are we doing?", intro="Two minutes, promise.")
        invite = self.make_invite(send, self.ann)
        send_survey_email(invite, "tok_123")
        (message,) = mail.outbox
        self.assertEqual(
            (message.subject, message.to, message.from_email),
            ("How are we doing?", ["ann@example.com"], settings.DEFAULT_FROM_EMAIL),
        )
        self.assertIn("Two minutes, promise.", message.body)
        self.assertIn(
            "How likely are you to recommend Acme Inc to a friend or colleague?", message.body
        )
        self.assertIn(f"{settings.FRONTEND_URL}/s/tok_123", message.body)
        self.assertIn("14 days", message.body)
        self.assertEqual(message.alternatives, [])


class DeferredSendTests(SendFixture):
    """Send now only claims; `deliver_pending`, run every minute, emails."""

    def run_pending(self):
        call_command("deliver_pending", stdout=StringIO())

    def test_send_now_answers_at_once_still_sending_with_nobody_emailed(self):
        send = self.ready()
        response = self.send_now(send, deliver=False)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["status"], "sending")
        self.assertEqual(mail.outbox, [])
        self.assertEqual(
            list(send.invites.values_list("status", "token_hash")),
            [("queued", None), ("queued", None)],
        )
        self.assertFalse(AuditEvent.objects.filter(action="survey.sent").exists())

    def test_the_runner_delivers_and_finishes_it(self):
        send = self.ready()
        self.send_now(send, deliver=False)
        self.run_pending()
        self.assertEqual(
            sorted(message.to[0] for message in mail.outbox),
            ["ann@example.com", "ben@example.com"],
        )
        send.refresh_from_db()
        self.assertEqual((send.status, send.counts), ("sent", FULL))
        event = AuditEvent.objects.get(action="survey.sent")
        self.assertEqual((event.actor, event.metadata), (self.csm, FULL))

    def test_running_it_twice_never_emails_twice(self):
        self.send_now(self.ready(), deliver=False)
        self.run_pending()
        self.run_pending()
        self.assertEqual(len(mail.outbox), 2)
        self.assertEqual(AuditEvent.objects.filter(action="survey.sent").count(), 1)

    def test_a_run_started_during_another_never_emails_twice(self):
        """The second run starts while the first is emailing its first
        person: each person is taken by one of them only."""
        self.send_now(self.ready(), deliver=False)
        inner = []

        def email_then_race(invite, token, **kwargs):
            if not inner:
                inner.append(invite.pk)
                self.run_pending()
            return send_survey_email(invite, token, **kwargs)

        with patch("services.surveys.sending.send_survey_email", side_effect=email_then_race):
            self.run_pending()
        self.assertEqual(
            sorted(message.to[0] for message in mail.outbox),
            ["ann@example.com", "ben@example.com"],
        )
        self.assertEqual(AuditEvent.objects.filter(action="survey.sent").count(), 1)

    def test_a_send_interrupted_half_way_resumes_with_who_is_left(self):
        contact(self.pizza, "Cat")
        send = self.ready()
        self.send_now(send, deliver=False)
        with (
            patch(
                "services.surveys.sending.send_survey_email",
                side_effect=[None, SystemExit("worker restart")],
            ),
            self.assertRaises(SystemExit),
        ):
            self.run_pending()
        send.refresh_from_db()
        self.assertEqual(send.status, "sending")
        rows = sorted(
            (status, hash_ is not None)
            for status, hash_ in send.invites.values_list("status", "token_hash")
        )
        # one emailed, one taken when the worker died, one never tried
        self.assertEqual(rows, [("pending", True), ("queued", False), ("queued", True)])
        self.run_pending()
        self.assertEqual(len(mail.outbox), 1)  # only the one never tried
        send.refresh_from_db()
        self.assertEqual(send.status, "sending")  # the taken one is left to its worker
        later = timezone.now() + timedelta(minutes=STALE_MINUTES)
        self.assertEqual(deliver_pending(now=later), (1, 0))
        self.assertEqual(len(mail.outbox), 1)  # nobody emailed again
        send.refresh_from_db()
        self.assertEqual(send.status, "sent")
        self.assertEqual(
            (send.counts["audience"], send.counts["sent"], send.counts["failed"]), (3, 3, 0)
        )
        # whoever may have been emailed keeps a working link
        self.assertEqual(send.invites.filter(status="pending").count(), 3)

    def test_an_old_send_leaves_an_invite_another_worker_just_took_alone(self):
        """The gate is the take's age, not the send's: two workers on a send
        over 10 minutes old never mark each other's invite in flight."""
        send = self.ready()
        self.send_now(send, deliver=False)
        SurveySend.objects.filter(pk=send.pk).update(
            started_at=timezone.now() - timedelta(minutes=30)
        )
        send.invites.filter(contact=self.ann).update(token_hash="t" * 64, taken_at=timezone.now())
        self.run_pending()
        self.assertEqual(
            sorted(send.invites.values_list("contact__name", "status")),
            [("Ann", "queued"), ("Ben", "pending")],
        )
        send.refresh_from_db()
        self.assertEqual(send.status, "sending")

    def test_a_take_older_than_ten_minutes_counts_as_emailed(self):
        """Mirrors campaigns: a worker died holding Ann's invite; once her
        take is 10 minutes old she counts as emailed (link kept), never
        emailed again, and the rest are delivered."""
        send = self.ready()
        self.send_now(send, deliver=False)
        old = timezone.now() - timedelta(minutes=10)
        SurveySend.objects.filter(pk=send.pk).update(started_at=old - timedelta(minutes=20))
        send.invites.filter(contact=self.ann).update(token_hash="t" * 64, taken_at=old)
        self.run_pending()
        self.assertEqual(
            sorted(send.invites.values_list("contact__name", "status", "token_hash")),
            [("Ann", "pending", "t" * 64), ("Ben", "pending", ANY)],
        )
        self.assertEqual([message.to[0] for message in mail.outbox], ["ben@example.com"])
        send.refresh_from_db()
        self.assertEqual((send.status, send.counts["sent"]), ("sent", 2))

    def test_nothing_pending_costs_nine_queries(self):
        self.make_send(status="sent")
        # The command also runs Work's digests; send_due's query shape is
        # covered in services/work/tests/test_queries.py.
        with (
            patch("services.campaigns.management.commands.deliver_pending.send_digests"),
            CaptureQueriesContext(connection) as ctx,
        ):
            self.run_pending()
        # Two for the sends; Slack bundles add two for messages waiting for a
        # bundle (the hour-old UPDATE, the read) and three for held-back surveys
        # (expire, poll and send reads); the sales review check one for
        # tomorrow's meetings; channel tag to-dos one (the waiting checks' read).
        self.assertEqual(len(ctx.captured_queries), 9, [q["sql"] for q in ctx.captured_queries])


class SendAuditTests(SendFixture):
    def test_the_click_is_audited_with_the_request_before_anything_is_emailed(self):
        send = self.ready()
        client = APIClient()
        client.force_authenticate(self.csm)
        client.post(
            f"/api/v1/surveys/sends/{send.pk}/send/", format="json", REMOTE_ADDR="203.0.113.5"
        )
        event = AuditEvent.objects.get(action="survey.send_started")
        self.assertEqual(
            (event.actor, event.ip, event.target_id),
            (self.csm, "203.0.113.5", str(send.pk)),
        )
        self.assertEqual(
            event.metadata,
            {**FULL, "sent": 0, "failed": 0},
        )
        self.assertNotEqual(event.request_id, None)
        self.assertEqual(mail.outbox, [])
