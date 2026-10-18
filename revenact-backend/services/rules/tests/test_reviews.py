"""A night's survey: one review the owner approves or skips, or a survey
sent at once without review. It goes through services.surveys to the fired
records only, so every Surveys rule holds; a refusal is stored and the
review waits; waiting reviews expire after 7 days."""

from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core import mail
from django.core.management import call_command
from django.db import connection
from django.http import Http404
from django.test import override_settings
from django.test.utils import CaptureQueriesContext

from core.models import AuditEvent
from services.rules import reviews
from services.rules.access import readable_rules
from services.rules.models import RuleReview, RuleRun
from services.rules.reviews import (
    ALREADY_DECIDED,
    RULE_CHANGED,
    Answer,
    Decided,
    create_review,
    expire_reviews,
    get_owned_review,
    send_review,
    skip_review,
    survey_name,
)
from services.rules.tests.fixtures import SURVEY, RuleFixture
from services.surveys.models import DAILY_SENDS, SurveyInvite, SurveySend
from services.surveys.sending import CONSOLE_BACKEND, DAILY_LIMIT, EMAIL_NOT_SET_UP


class ReviewFixture(RuleFixture):
    def setUp(self):
        self.rule = self.make_rule(actions=[SURVEY])
        self.run = RuleRun.objects.create(rule=self.rule, run_on=self.today, started_at=self.now)

    def review(self, records):
        return create_review(
            self.rule, self.run, [record.pk for record in records], SURVEY, today=self.today
        )

    def approve(self, review, actor="owner"):
        return send_review(
            review.pk,
            actor=self.csm if actor == "owner" else actor,
            today=self.today,
            now=self.now,
        )

    def deliver_pending(self):
        call_command("deliver_pending", stdout=StringIO())

    def events(self, action):
        return list(AuditEvent.objects.filter(action=action).values_list("actor_id", "metadata"))


class CreateTests(ReviewFixture):
    def test_a_review_freezes_the_action_and_counts_who_it_reaches(self):
        review = self.review([self.pizza, self.dough])
        self.assertEqual(
            (review.status, review.action, review.run, review.rule),
            ("waiting", SURVEY, self.run, self.rule),
        )
        self.assertEqual(
            review.records,
            [{"kind": "customer", "id": self.pizza.pk}, {"kind": "customer", "id": self.dough.pk}],
        )
        # Ann (Pizza Hut), Ben (on Pizza EMEA, an account of Pizza Hut's) and Dot (Dough Co)
        self.assertEqual(review.counts, {"people": 3, "records": 3})

    def test_the_surveys_name_carries_the_nights_date_and_fits(self):
        self.assertEqual(survey_name(self.rule, self.today).split(" · ")[0], "Renewal watch")
        self.rule.name = "x" * 120
        self.assertEqual(len(survey_name(self.rule, self.today)), 120)


class ApproveTests(ReviewFixture):
    def test_approving_queues_a_survey_to_the_fired_records_only(self):
        review = self.review([self.dough])
        answer = self.approve(review)
        send = SurveySend.objects.get()
        self.assertEqual(answer, Answer(200, {"survey_send_id": send.pk}))
        # Approval only claims: the every-minute runner delivers.
        self.assertEqual(
            (send.owner, send.name, send.survey_type, send.status, send.segment),
            (self.csm, survey_name(self.rule, self.today), "nps", "sending", self.book),
        )
        invited = SurveyInvite.objects.filter(send=send)
        self.assertEqual(list(invited.values_list("contact__name", "status")), [("Dot", "queued")])
        self.assertEqual((mail.outbox, self.events("survey.sent")), ([], []))
        self.deliver_pending()
        send.refresh_from_db()
        self.assertEqual(send.status, "sent")
        self.assertEqual([message.to for message in mail.outbox], [["dot@example.com"]])
        review.refresh_from_db()
        self.assertEqual(
            (review.status, review.decided_by, review.decided_at, review.result),
            ("approved", self.csm, self.now, {"survey_send_id": send.pk}),
        )
        self.assertEqual(
            self.events("rule.review_approved"),
            [
                (
                    self.csm.pk,
                    {
                        "rule": self.rule.pk,
                        "kind": "survey",
                        "survey_send": send.pk,
                        "without_review": False,
                    },
                )
            ],
        )
        (sent,) = self.events("survey.sent")
        self.assertEqual((sent[1]["rule"], sent[1]["sent"]), (self.rule.pk, 1))

    def test_the_start_carries_the_rule_and_the_finish_is_the_owners(self):
        review = self.review([self.dough])
        self.approve(review, actor=None)
        (started,) = self.events("survey.send_started")
        self.assertEqual((started[0], started[1]["rule"]), (None, self.rule.pk))
        self.deliver_pending()
        (sent,) = self.events("survey.sent")
        self.assertEqual((sent[0], sent[1]["rule"]), (self.rule.owner_id, self.rule.pk))

    def test_the_runner_finishing_an_approved_send_audits_it_the_same(self):
        """Whoever wins the race to finish, the row reads the same."""
        review = self.review([self.dough])
        answer = self.approve(review)
        send = SurveySend.objects.get(pk=answer.body["survey_send_id"])
        self.assertEqual(send.status, "sending")
        self.deliver_pending()
        (sent,) = self.events("survey.sent")
        self.assertEqual((sent[0], sent[1]["rule"]), (self.rule.owner_id, self.rule.pk))

    def test_without_review_is_approved_by_nobody(self):
        review = self.review([self.dough])
        self.approve(review, actor=None)
        review.refresh_from_db()
        self.assertEqual((review.status, review.decided_by), ("approved", None))
        (event,) = self.events("rule.review_approved")
        self.assertEqual((event[0], event[1]["without_review"]), (None, True))

    def test_a_record_the_owner_cannot_open_is_never_surveyed(self):
        review = create_review(
            self.rule, self.run, [self.dough.pk, self.taco.pk], SURVEY, today=self.today
        )
        self.approve(review)
        self.assertEqual(
            list(SurveyInvite.objects.values_list("contact__name", flat=True)), ["Dot"]
        )

    def test_a_decided_review_is_409(self):
        review = self.review([self.dough])
        self.approve(review)
        with self.assertRaises(Decided):
            self.approve(review)
        with self.assertRaises(Decided):
            skip_review(review.pk, self.csm, now=self.now)
        self.assertEqual(ALREADY_DECIDED, "This review has already been decided.")

    def test_the_workspace_and_owner_lock_before_the_draft_is_inserted(self):
        """The same lock order `surveys.sending.claim` takes (workspace, then
        owner) is taken again before the draft is inserted, so the draft's
        own foreign-key lock on the owner's row never jumps the queue (a
        deadlock risk against another send by the same owner)."""
        review = self.review([self.dough])
        with CaptureQueriesContext(connection) as ctx:
            self.approve(review)
        sqls = [query["sql"] for query in ctx.captured_queries]
        draft_insert = next(
            i for i, sql in enumerate(sqls) if sql.startswith('INSERT INTO "surveys_surveysend"')
        )
        organisation_lock = next(
            i
            for i, sql in enumerate(sqls)
            if 'FROM "accounts_organisation"' in sql and sql.endswith("FOR NO KEY UPDATE")
        )
        owner_lock = next(
            i
            for i, sql in enumerate(sqls)
            if 'FROM "accounts_user"' in sql and sql.endswith("FOR UPDATE")
        )
        self.assertLess(organisation_lock, draft_insert, sqls)
        self.assertLess(owner_lock, draft_insert, sqls)
        self.assertLessEqual(organisation_lock, owner_lock, sqls)


class ChangedRuleTests(ReviewFixture):
    """A review stores its night's records with their kind. If the rule now
    points at a segment of another kind (or none), approving would read
    those ids as the wrong kind of record, so it is refused and expires."""

    def assert_expired_unsent(self, review, answer):
        self.assertEqual(answer, Answer(400, {"detail": RULE_CHANGED}))
        review.refresh_from_db()
        self.assertEqual(
            (review.status, review.decided_by, review.decided_at), ("expired", None, self.now)
        )
        self.assertFalse(SurveySend.objects.exists())
        self.assertFalse(SurveyInvite.objects.exists())
        self.assertEqual(mail.outbox, [])
        self.assertEqual(
            self.events("rule.review_expired"),
            [(self.csm.pk, {"rule": self.rule.pk, "kind": "survey", "reason": "rule_changed"})],
        )

    def test_a_review_whose_rule_moved_to_another_kind_is_refused_and_expires(self):
        review = self.review([self.pizza, self.dough])
        accounts = self.pinned("account", [self.emea], name="Accounts")
        type(self.rule).objects.filter(pk=self.rule.pk).update(segment=accounts)
        self.assert_expired_unsent(review, self.approve(review))

    def test_a_review_whose_rule_lost_its_segment_is_refused_and_expires(self):
        review = self.review([self.dough])
        type(self.rule).objects.filter(pk=self.rule.pk).update(segment=None)
        self.assert_expired_unsent(review, self.approve(review))

    def test_an_expired_review_is_then_decided(self):
        review = self.review([self.dough])
        type(self.rule).objects.filter(pk=self.rule.pk).update(segment=None)
        self.approve(review)
        with self.assertRaises(Decided):
            self.approve(review)


class RefusalTests(ReviewFixture):
    def assert_waits_with(self, review, body):
        review.refresh_from_db()
        self.assertEqual((review.status, review.result), ("waiting", {"error": body}))

    def test_nobody_to_ask_is_stored_and_the_review_waits(self):
        self.make_invite(self.make_send(), self.dot, created_at=self.now)  # surveyed recently
        sends = SurveySend.objects.count()
        review = self.review([self.dough])
        answer = self.approve(review)
        self.assertEqual(answer, Answer(400, {"segment": ["Nobody to send to."]}))
        self.assert_waits_with(review, {"segment": ["Nobody to send to."]})
        self.assertEqual(SurveySend.objects.count(), sends)  # the draft rolled back
        self.assertEqual(mail.outbox, [])

    @override_settings(DEBUG=False, EMAIL_BACKEND=CONSOLE_BACKEND)
    def test_email_not_set_up_is_a_refusal(self):
        review = self.review([self.dough])
        self.assertEqual(self.approve(review), Answer(400, {"detail": EMAIL_NOT_SET_UP}))
        self.assert_waits_with(review, {"detail": EMAIL_NOT_SET_UP})
        self.assertEqual(mail.outbox, [])

    def test_the_daily_limit_holds(self):
        SurveySend.objects.bulk_create(
            [
                SurveySend(
                    organisation=self.org,
                    owner=self.csm,
                    name=f"Send {i}",
                    survey_type="nps",
                    subject="s",
                    status="sent",
                    started_at=self.now,
                )
                for i in range(DAILY_SENDS)
            ]
        )
        review = self.review([self.dough])
        self.assertEqual(self.approve(review), Answer(400, {"detail": DAILY_LIMIT}))
        self.assert_waits_with(review, {"detail": DAILY_LIMIT})
        self.assertEqual(mail.outbox, [])

    def test_a_refused_review_can_be_approved_once_fixed(self):
        review = self.review([self.dough])
        with override_settings(DEBUG=False, EMAIL_BACKEND=CONSOLE_BACKEND):
            self.approve(review)
        self.assertEqual(self.approve(review).status, 200)


class SkipAndExpireTests(ReviewFixture):
    def test_skipping(self):
        review = skip_review(self.review([self.dough]).pk, self.csm, now=self.now)
        self.assertEqual((review.status, review.decided_by), ("skipped", self.csm))
        self.assertEqual(
            self.events("rule.review_skipped"),
            [(self.csm.pk, {"rule": self.rule.pk, "kind": "survey"})],
        )
        self.assertFalse(SurveySend.objects.exists())

    def age(self, review, days):
        RuleReview.objects.filter(pk=review.pk).update(created_at=self.now - timedelta(days=days))

    def other_night(self, days_ago):
        run = RuleRun.objects.create(
            rule=self.rule, run_on=self.today - timedelta(days=days_ago), started_at=self.now
        )
        return create_review(self.rule, run, [self.dough.pk], SURVEY, today=self.today)

    def test_waiting_reviews_expire_after_seven_days(self):
        old, young = self.review([self.dough]), self.other_night(1)
        self.age(old, 7)
        self.age(young, 6)
        self.assertEqual(expire_reviews(now=self.now), 1)
        old.refresh_from_db()
        young.refresh_from_db()
        self.assertEqual(
            (old.status, old.decided_at, young.status), ("expired", self.now, "waiting")
        )
        self.assertEqual(
            self.events("rule.review_expired"), [(None, {"rule": self.rule.pk, "kind": "survey"})]
        )

    def test_a_decided_review_never_expires(self):
        review = self.review([self.dough])
        skip_review(review.pk, self.csm, now=self.now)
        self.age(review, 30)
        self.assertEqual(expire_reviews(now=self.now), 0)

    def test_one_workspace_at_a_time(self):
        self.age(self.review([self.dough]), 8)
        self.assertEqual(expire_reviews(self.other_org, now=self.now), 0)
        self.assertEqual(expire_reviews(self.org, now=self.now), 1)

    def test_one_expiry_failure_never_stops_the_rest(self):
        first, second = self.review([self.dough]), self.other_night(1)
        self.age(first, 8)
        self.age(second, 8)
        real = reviews.audit.record
        calls = []

        def flaky(action, **kwargs):
            calls.append(action)
            if len(calls) == 1:
                raise RuntimeError("audit down")
            return real(action, **kwargs)

        with patch.object(reviews.audit, "record", side_effect=flaky):
            with self.assertLogs("services.rules.reviews", "ERROR"):
                self.assertEqual(expire_reviews(now=self.now), 1)
        statuses = sorted(RuleReview.objects.values_list("status", flat=True))
        self.assertEqual(statuses, ["expired", "waiting"])


class OwnedReviewTests(ReviewFixture):
    def test_only_the_rules_owner_may_open_a_review(self):
        review = self.review([self.dough])
        self.assertEqual(get_owned_review(self.csm, review.pk), review)
        for user in (self.admin, self.other, self.stranger):
            with self.assertRaises(Http404):
                get_owned_review(user, review.pk)

    def test_a_reader_of_a_shared_rule_is_404_on_approve_and_on_skip(self):
        """Being able to read a rule shared with the workspace is not being
        able to decide its review: `get_owned_review`, the check both the
        approve and skip views call first, still answers 404 for a reader
        who is not the rule's owner."""
        shared = self.make_rule(sharing="workspace")
        run = RuleRun.objects.create(rule=shared, run_on=self.today, started_at=self.now)
        review = create_review(shared, run, [self.dough.pk], SURVEY, today=self.today)
        self.assertTrue(readable_rules(self.other).filter(pk=shared.pk).exists())
        with self.assertRaises(Http404):  # the approve view's own check
            get_owned_review(self.other, review.pk)
        with self.assertRaises(Http404):  # the skip view's own check
            get_owned_review(self.other, review.pk)
