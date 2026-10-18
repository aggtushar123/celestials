"""The send (spec §1.4): the claim locks the workspace then the campaign,
resolves the audience and writes every delivery; delivery emails each
queued person at most once, outside any transaction; the finish freezes the
counts. Tokens are stored as hashes only; logs carry ids and class names."""

import re
from datetime import timedelta
from unittest import mock

from django.core import mail
from django.db import connection, transaction
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.campaigns import sending
from services.campaigns import validation as say
from services.campaigns.audience import build
from services.campaigns.models import CampaignSend
from services.campaigns.sending import (
    Refusal,
    before_claim,
    claim,
    deliver,
    deliver_pending,
    resume,
    sent_message,
)
from services.campaigns.tests.fixtures import CampaignFixture
from services.customers.models import Email
from services.surveys.tokens import hash_token

CONSOLE = "django.core.mail.backends.console.EmailBackend"
LINK = re.compile(r"/u/([A-Za-z0-9_-]{43})$")


class SendFixture(CampaignFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.campaign = cls.make_campaign(segment=cls.people)

    def claim(self, campaign=None, **kwargs):
        values = {"kind": "manual", "by": self.csm, "today": self.today, "now": self.now, **kwargs}
        return claim((campaign or self.campaign).pk, **values)

    def statuses(self, send):
        rows = send.deliveries.order_by("pk").values_list("contact__name", "status", "reason")
        return list(rows)


class ClaimTests(SendFixture):
    def test_the_claim_writes_the_send_and_everyone_on_it(self):
        self.ben.campaigns_unsubscribed_at = self.now
        self.ben.save(update_fields=["campaigns_unsubscribed_at"])
        self.people.pinned_ids = [self.ann.pk, self.dot.pk, self.ben.pk]
        self.people.save(update_fields=["pinned_ids"])
        send = self.claim()
        self.assertEqual(
            (send.kind, send.status, send.sent_by, send.started_at, send.finished_at),
            ("manual", "sending", self.csm, self.now, None),
        )
        self.assertEqual((send.subject, send.body), (self.campaign.subject, self.campaign.body))
        self.assertEqual(
            self.statuses(send),
            [("Ann", "queued", ""), ("Dot", "queued", ""), ("Ben", "skipped", "unsubscribed")],
        )
        self.assertEqual(send.counts["reached"], 3)
        self.assertEqual(send.counts["skipped"]["unsubscribed"], 1)
        self.assertEqual(send.deliveries.exclude(token_hash="").count(), 0)
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.status, "active")
        self.assertEqual(
            self.events("campaign.send_started"),
            [(str(self.campaign.pk), {"send": send.pk, "kind": "manual", "counts": send.counts})],
        )
        self.assertEqual(mail.outbox, [])

    def refused(self, detail, campaign=None):
        with self.assertRaises(Refusal) as caught:
            self.claim(campaign)
        self.assertEqual(
            (caught.exception.status, caught.exception.body), (400, {"detail": detail})
        )
        self.assertFalse(CampaignSend.objects.exists())

    @override_settings(EMAIL_BACKEND=CONSOLE, DEBUG=False)
    def test_email_not_set_up_writes_nothing(self):
        self.refused(say.EMAIL_NOT_SET_UP)
        self.assertEqual(before_claim(self.campaign), {"detail": say.EMAIL_NOT_SET_UP})

    def test_the_other_refusals(self):
        self.refused(say.ARCHIVED, self.make_campaign(segment=self.people, status="archived"))
        self.refused(say.CHOOSE_SEGMENT, self.make_campaign())
        self.refused(say.NEEDS_WORDS, self.make_campaign(segment=self.people, subject=" "))
        self.refused(say.NEEDS_WORDS, self.make_campaign(segment=self.people, body=""))
        gone = self.pinned("contact", [self.ann])
        orphan = self.make_campaign(segment=gone)
        gone.delete()
        self.refused(say.CHOOSE_SEGMENT, orphan)

    def test_an_inactive_owner_is_refused(self):
        self.csm.is_active = False
        self.csm.save(update_fields=["is_active"])
        self.refused(say.OWNER_INACTIVE)
        self.assertEqual(before_claim(self.campaign), {"detail": say.OWNER_INACTIVE})

    def test_nobody_to_email_writes_nothing(self):
        for person in (self.ann, self.dot):
            person.campaigns_unsubscribed_at = self.now
            person.save(update_fields=["campaigns_unsubscribed_at"])
        self.refused(say.NOBODY)
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.status, "draft")

    def test_a_second_claim_sees_the_first_ones_queued_people(self):
        self.claim()
        self.refused_after_first()

    def refused_after_first(self):
        with self.assertRaises(Refusal) as caught:
            self.claim()
        self.assertEqual(caught.exception.body, {"detail": say.NOBODY})
        other = self.make_campaign(name="Other", segment=self.people)
        with self.assertRaises(Refusal):
            self.claim(other)  # both are queued on a send: the 3-day gap holds too

    def test_lock_order_workspace_then_campaign_then_the_insert(self):
        with CaptureQueriesContext(connection) as ctx:
            self.claim()
        sqls = [query["sql"] for query in ctx.captured_queries]
        workspace = next(
            i
            for i, s in enumerate(sqls)
            if 'FROM "accounts_organisation"' in s and s.endswith("FOR NO KEY UPDATE")
        )
        campaign = next(
            i
            for i, s in enumerate(sqls)
            if 'FROM "campaigns_campaign"' in s and "FOR NO KEY UPDATE" in s
        )
        insert = next(
            i for i, s in enumerate(sqls) if s.startswith('INSERT INTO "campaigns_campaignsend"')
        )
        self.assertLess(workspace, campaign, sqls)
        self.assertLess(campaign, insert, sqls)

    def test_expectations_are_checked_under_the_lock(self):
        for expected in ({"expect_kind": "customer"}, {"expect_owner": self.other.pk}):
            with self.assertRaises(Refusal) as refused:
                self.claim(**expected)
            self.assertEqual(
                (refused.exception.status, refused.exception.body),
                (400, {"detail": say.CHOOSE_CAMPAIGN}),
            )
        self.assertFalse(CampaignSend.objects.exists())
        send = self.claim(expect_kind="contact", expect_owner=self.csm.pk)
        self.assertEqual(send.status, "sending")

    def test_records_limit_a_rule_send(self):
        campaign = self.make_campaign(segment=self.book)
        send = self.claim(campaign, kind="rule", by=None, records=[self.dough.pk])
        self.assertEqual(self.statuses(send), [("Dot", "queued", "")])

    def test_over_the_limit_gets_rows_too(self):
        with mock.patch("services.campaigns.audience.MAX_PEOPLE", 1):
            send = self.claim()
        self.assertEqual(
            self.statuses(send), [("Ann", "queued", ""), ("Dot", "skipped", "over_limit")]
        )


class DeliverTests(SendFixture):
    def test_each_person_is_emailed_once_and_filed_on_their_record(self):
        send = deliver(self.claim())
        self.assertEqual(self.mail_to(), ["ann@example.com", "dot@example.com"])
        first = mail.outbox[0]
        self.assertEqual(first.subject, "Hello Ann")
        self.assertTrue(
            first.body.startswith("We miss you at Pizza Hut.\nCarl CSM\n\n—\nCarl CSM, Acme Inc\n")
        )
        token = LINK.search(first.body).group(1)
        delivery = send.deliveries.get(contact=self.ann)
        self.assertEqual(delivery.token_hash, hash_token(token))
        email = delivery.email
        self.assertEqual(
            (
                email.customer,
                email.campaign,
                email.subject,
                email.sender_name,
                email.recipient_name,
            ),
            (self.pizza, self.campaign, "Hello Ann", "Carl CSM", "Ann"),
        )
        self.assertEqual(email.body, "We miss you at Pizza Hut.\nCarl CSM")  # no footer, no token
        self.assertEqual(self.statuses(send), [("Ann", "sent", ""), ("Dot", "sent", "")])
        self.assertEqual((send.status, send.counts["sent"], send.counts["reached"]), ("sent", 2, 2))
        self.assertIsNotNone(send.finished_at)
        self.assertEqual(
            self.events("campaign.send_finished"),
            [(str(self.campaign.pk), {"send": send.pk, "counts": send.counts})],
        )

    def test_the_token_is_stored_nowhere(self):
        deliver(self.claim())
        token = LINK.search(mail.outbox[0].body).group(1)
        self.assertFalse(Email.objects.filter(body__contains=token).exists())
        self.assertNotIn(token, str(list(AuditEvent.objects.values_list("metadata", flat=True))))

    def test_one_failure_is_skipped_failed_and_the_rest_go_on(self):
        real = sending.send_campaign_email

        def flaky(address, *args, **kwargs):
            if address == "ann@example.com":
                raise ConnectionError("550 ann@example.com rejected")
            return real(address, *args, **kwargs)

        with (
            mock.patch("services.campaigns.sending.send_campaign_email", flaky),
            self.assertLogs("services.campaigns.sending", "WARNING") as logs,
        ):
            send = deliver(self.claim())
        self.assertEqual(self.statuses(send), [("Ann", "skipped", "failed"), ("Dot", "sent", "")])
        self.assertEqual(send.counts["skipped"]["failed"], 1)
        self.assertEqual(self.mail_to(), ["dot@example.com"])
        # a known failure: nothing went out, so no link is live for Ann
        self.assertEqual(send.deliveries.get(contact=self.ann).token_hash, "")
        self.assertNotIn("ann@example.com", "\n".join(logs.output))
        self.assertIn("ConnectionError", "\n".join(logs.output))

    def test_delivering_again_emails_nobody_twice(self):
        send = self.claim()
        deliver(send)
        deliver(send)
        self.assertEqual(len(mail.outbox), 2)

    def test_a_person_another_worker_took_is_left_to_it(self):
        send = self.claim()
        send.deliveries.filter(contact=self.ann).update(token_hash="t" * 64)
        send = deliver(send)
        self.assertEqual(self.mail_to(), ["dot@example.com"])
        self.assertEqual(send.status, "sending")  # Ann is still someone's to finish

    def test_someone_who_unsubscribed_after_the_claim_is_skipped_not_emailed(self):
        send = self.claim()
        self.ann.campaigns_unsubscribed_at = self.now
        self.ann.save(update_fields=["campaigns_unsubscribed_at"])
        send = deliver(send)
        self.assertEqual(
            self.statuses(send), [("Ann", "skipped", "unsubscribed"), ("Dot", "sent", "")]
        )
        self.assertEqual(self.mail_to(), ["dot@example.com"])
        self.assertEqual((send.counts["sent"], send.counts["skipped"]["unsubscribed"]), (1, 1))

    def test_the_take_keeps_status_and_token_hash_on_the_delivery_row_itself(self):
        # Regression for the double-send window a join-based unsubscribe
        # check opened: Django has to fold a join into `WHERE "id" IN
        # (SELECT ...)` to keep an UPDATE on one table, which buries
        # status/token_hash inside that subquery where Postgres's
        # concurrent-update recheck does not see them. The take must stay
        # a plain UPDATE with status and token_hash as the delivery
        # table's own columns, and only an uncorrelated Contact subquery
        # for "not unsubscribed".
        with CaptureQueriesContext(connection) as ctx:
            deliver(self.claim())
        takes = [
            q["sql"]
            for q in ctx.captured_queries
            if q["sql"].startswith('UPDATE "campaigns_campaigndelivery" SET "token_hash"')
        ]
        self.assertEqual(len(takes), 2, takes)  # Ann, Dot
        for sql in takes:
            self.assertNotIn('"id" IN (SELECT', sql, sql)
            self.assertIn('"campaigns_campaigndelivery"."status" = \'queued\'', sql, sql)
            self.assertIn('"campaigns_campaigndelivery"."token_hash" = \'\'', sql, sql)
            self.assertIn('"contact_id" IN (SELECT', sql, sql)  # the unsubscribe check still runs

    def test_filing_the_email_row_failing_still_counts_the_real_send(self):
        with (
            mock.patch(
                "services.campaigns.sending.Email.objects.create", side_effect=RuntimeError("x")
            ),
            self.assertLogs("services.campaigns.sending", "ERROR") as logs,
        ):
            send = deliver(self.claim())
        self.assertEqual(self.mail_to(), ["ann@example.com", "dot@example.com"])
        self.assertEqual(self.statuses(send), [("Ann", "sent", ""), ("Dot", "sent", "")])
        self.assertTrue(all(d.email_id is None for d in send.deliveries.all()))
        self.assertEqual((send.counts["sent"], send.counts["skipped"]["failed"]), (2, 0))
        self.assertIn("RuntimeError", "\n".join(logs.output))

    def test_an_outage_stops_after_a_few_failures_and_leaves_the_rest_queued(self):
        def dead(*args, **kwargs):
            raise ConnectionError("Connection refused")

        with (
            mock.patch("services.campaigns.sending.send_campaign_email", side_effect=dead),
            mock.patch("services.campaigns.sending.MAX_CONSECUTIVE_FAILURES", 1),
            self.assertLogs("services.campaigns.sending", "ERROR"),
        ):
            send = deliver(self.claim())
        self.assertEqual(self.statuses(send), [("Ann", "skipped", "failed"), ("Dot", "queued", "")])
        self.assertEqual(send.status, "sending")
        self.assertEqual(mail.outbox, [])

    def test_a_mail_server_that_will_not_connect_leaves_everyone_queued(self):
        with (
            mock.patch(
                "services.campaigns.sending.get_connection",
                return_value=mock.Mock(open=mock.Mock(side_effect=ConnectionRefusedError("x"))),
            ),
            self.assertLogs("services.campaigns.sending", "ERROR") as logs,
        ):
            send = deliver(self.claim())
        self.assertEqual(send.status, "sending")
        self.assertEqual(self.statuses(send), [("Ann", "queued", ""), ("Dot", "queued", "")])
        self.assertFalse(send.deliveries.exclude(token_hash="").exists())
        self.assertEqual(mail.outbox, [])
        self.assertIn(f"campaign send {send.pk}", "\n".join(logs.output))
        self.assertIn("ConnectionRefusedError", "\n".join(logs.output))
        # resumable: once the server is back, the same send finishes
        send = deliver(send)
        self.assertEqual(
            (send.status, self.mail_to()), ("sent", ["ann@example.com", "dot@example.com"])
        )

    def test_deliver_refuses_to_run_inside_a_transaction(self):
        send = self.claim()
        with transaction.atomic():
            with self.assertRaises(RuntimeError):
                deliver(send)


class ResumeTests(SendFixture):
    def reasons(self, reach):
        return [(person.name, reason) for person, reason in reach.skipped]

    def cut_off(self, started):
        send = self.claim(now=started)
        send.deliveries.filter(contact=self.ann).update(token_hash="t" * 64)
        return send

    def test_a_stale_send_fails_the_person_it_was_emailing_and_sends_the_rest(self):
        send = resume(self.cut_off(self.now - timedelta(minutes=10)), now=self.now)
        self.assertEqual(self.statuses(send), [("Ann", "skipped", "failed"), ("Dot", "sent", "")])
        self.assertEqual((send.status, self.mail_to()), ("sent", ["dot@example.com"]))

    def test_a_stale_resume_keeps_the_hash_of_whoever_may_have_been_emailed(self):
        send = resume(self.cut_off(self.now - timedelta(minutes=10)), now=self.now)
        self.assertEqual(send.deliveries.get(contact=self.ann).token_hash, "t" * 64)

    def test_crash_after_the_email_went_out_keeps_the_link_and_never_emails_again(self):
        # The worker dies between SMTP and the mark (a killed process, not an
        # exception `_deliver_one` catches): Ann's email is out, her row is
        # still queued with its hash.
        class Crash(BaseException):
            pass

        real = sending.send_campaign_email

        def send_then_die(address, *args, **kwargs):
            real(address, *args, **kwargs)
            raise Crash

        started = self.now - timedelta(minutes=10)
        with (
            mock.patch("services.campaigns.sending.send_campaign_email", send_then_die),
            self.assertRaises(Crash),
        ):
            deliver(self.claim(now=started))
        token = LINK.search(mail.outbox[0].body).group(1)
        # resumed once her take is 10 minutes old
        send = resume(CampaignSend.objects.get(), now=timezone.now() + timedelta(minutes=10))
        self.assertEqual(self.statuses(send), [("Ann", "skipped", "failed"), ("Dot", "sent", "")])
        self.assertEqual(self.mail_to(), ["ann@example.com", "dot@example.com"])
        # her unsubscribe link still works
        url = f"/api/v1/campaigns/unsubscribe/{token}/"
        self.assertEqual(APIClient().get(url).data, {"workspace": "Acme Inc"})
        # a later send of the same campaign skips her as already received
        later = build(self.campaign, today=self.today, now=self.now + timedelta(days=30))
        self.assertIn(("Ann", "already_received"), self.reasons(later))
        # another campaign skips her as recent for 3 days from the send's start
        other = self.make_campaign(name="Other", segment=self.people)
        gap = started + timedelta(days=3)
        inside = build(other, today=self.today, now=gap - timedelta(seconds=1))
        self.assertIn(("Ann", "recent_campaign"), self.reasons(inside))
        after = build(other, today=self.today, now=gap + timedelta(days=1))
        self.assertNotIn("Ann", [name for name, _reason in self.reasons(after)])
        # the link answers the POST too
        self.assertEqual(APIClient().post(url, {}, format="json").status_code, 204)

    def test_an_old_send_leaves_a_person_another_worker_just_took_alone(self):
        """The gate is the take's age, not the send's: two workers on a send
        over 10 minutes old never mark each other's person in flight."""
        send = self.cut_off(self.now - timedelta(minutes=30))
        send.deliveries.filter(contact=self.ann).update(taken_at=self.now - timedelta(minutes=1))
        send = resume(send, now=self.now)
        self.assertEqual(self.statuses(send), [("Ann", "queued", ""), ("Dot", "sent", "")])
        self.assertEqual(send.status, "sending")

    def test_a_take_older_than_ten_minutes_is_failed(self):
        send = self.cut_off(self.now - timedelta(minutes=30))
        send.deliveries.filter(contact=self.ann).update(taken_at=self.now - timedelta(minutes=10))
        send = resume(send, now=self.now)
        self.assertEqual(self.statuses(send), [("Ann", "skipped", "failed"), ("Dot", "sent", "")])

    def test_the_take_stamps_when(self):
        send = deliver(self.claim())
        self.assertFalse(send.deliveries.filter(status="sent", taken_at__isnull=True).exists())

    def test_a_young_send_leaves_the_taken_person_alone(self):
        send = resume(self.cut_off(self.now - timedelta(minutes=9)), now=self.now)
        self.assertEqual(self.statuses(send), [("Ann", "queued", ""), ("Dot", "sent", "")])
        self.assertEqual(send.status, "sending")

    def test_deliver_pending_takes_every_send_at_once_however_young(self):
        """Nothing is delivered inside a request any more, so a manual send
        claimed a moment ago is the runner's to deliver straight away."""
        rule = self.make_rule()
        now_rule = self.claim(kind="rule", by=None, rule=rule)
        young = self.claim(self.make_campaign(name="Young", segment=self.book), now=self.now)
        self.assertEqual(deliver_pending(now=self.now), (2, 0))
        now_rule.refresh_from_db()
        young.refresh_from_db()
        self.assertEqual((now_rule.status, young.status), ("sent", "sent"))

    def test_deliver_pending_one_workspace_and_failures_counted(self):
        send = self.claim(kind="rule", by=None)
        self.assertEqual(deliver_pending(self.other_org, now=self.now), (0, 0))
        with mock.patch("services.campaigns.sending.resume", side_effect=RuntimeError("x")):
            self.assertEqual(deliver_pending(self.org, now=self.now), (0, 1))
        send.refresh_from_db()
        self.assertEqual(send.status, "sending")


class NoticeTests(SendFixture):
    def test_a_rule_send_without_review_tells_the_owner(self):
        deliver(self.claim(kind="rule", by=None))
        self.assertEqual(
            self.notes("campaign_sent"),
            [(self.csm.pk, "Win-back emailed 2 people.", f"/campaigns/{self.campaign.pk}")],
        )

    def test_a_manual_send_tells_nobody(self):
        deliver(self.claim())
        self.assertEqual(self.notes("campaign_sent"), [])

    def test_the_words(self):
        counts = {"sent": 1, "skipped": {"no_email": 2, "failed": 4}}
        self.assertEqual(
            sent_message(self.campaign, counts), "Win-back emailed 1 person · 6 skipped."
        )
        self.assertEqual(
            sent_message(self.campaign, {"sent": 42, "skipped": {"failed": 0}}),
            "Win-back emailed 42 people.",
        )
