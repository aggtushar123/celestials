"""The rule tables, their limits and constraints, and the two new
notification kinds."""

from datetime import timedelta

from django.db import IntegrityError, transaction

from services.notifications.models import Notification
from services.rules import models as limits
from services.rules.models import Rule, RuleReview, RuleRun, RuleRunRecord, RuleState
from services.rules.tests.fixtures import SURVEY, RuleFixture


class RuleModelTests(RuleFixture):
    def test_a_new_rule_is_off_private_and_waits_30_days(self):
        rule = Rule.objects.create(
            organisation=self.org, owner=self.csm, name="Watch", trigger="entered", actions=[]
        )
        self.assertEqual(
            (rule.is_active, rule.sharing, rule.cooldown_days, rule.paused_reason),
            (False, "private", 30, ""),
        )
        self.assertEqual(str(rule), f"Rule {rule.pk}")

    def test_the_limits_are_the_specs(self):
        self.assertEqual(
            (
                limits.MAX_OWNED,
                limits.MIN_ACTIONS,
                limits.MAX_ACTIONS,
                limits.MIN_COOLDOWN,
                limits.MAX_COOLDOWN,
                limits.DEFAULT_COOLDOWN,
                limits.NIGHTLY_CAP,
                limits.REVIEW_DAYS,
                limits.MAX_SHARED,
                limits.MAX_NAME,
                limits.MAX_MESSAGE,
                limits.MAX_TITLE,
                limits.MAX_DUE_DAYS,
            ),
            (50, 1, 3, 1, 365, 30, 200, 7, 50, 120, 280, 200, 90),
        )
        self.assertEqual(
            limits.SCORE_RANGES,
            {"csat": (0, 100), "nps": (-100, 100), "ces": (0, 100), "health": (0, 10)},
        )

    def test_the_cooldown_is_1_to_365_days(self):
        for days in (0, 366):
            with self.assertRaises(IntegrityError), transaction.atomic():
                self.make_rule(cooldown_days=days)

    def test_a_weekday_is_0_to_6(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_rule(trigger="schedule", cadence="weekly", weekday=7)

    def test_a_segment_knows_the_rules_it_triggers(self):
        rule = self.make_rule()
        self.assertEqual(list(self.book.triggered_rules.all()), [rule])

    def test_deleting_the_segment_keeps_the_rule(self):
        rule = self.make_rule(segment=self.pinned("customer", [self.pizza]))
        rule.segment.delete()
        rule.refresh_from_db()
        self.assertIsNone(rule.segment)

    def test_deleting_a_rule_deletes_its_states_runs_records_and_reviews(self):
        rule = self.make_rule()
        run = RuleRun.objects.create(rule=rule, run_on=self.today, started_at=self.now)
        RuleState.objects.create(rule=rule, record_kind="customer", record_id=self.pizza.pk)
        RuleRunRecord.objects.create(
            run=run, record_kind="customer", record_id=self.pizza.pk, outcome="fired"
        )
        RuleReview.objects.create(rule=rule, run=run, action=SURVEY, records=[])
        rule.delete()
        for model in (RuleRun, RuleState, RuleRunRecord, RuleReview):
            self.assertFalse(model.objects.exists(), model.__name__)


class StateRunAndReviewTests(RuleFixture):
    def test_one_state_per_rule_and_record(self):
        rule = self.make_rule()
        RuleState.objects.create(rule=rule, record_kind="customer", record_id=self.pizza.pk)
        RuleState.objects.create(rule=rule, record_kind="account", record_id=self.pizza.pk)
        with self.assertRaises(IntegrityError), transaction.atomic():
            RuleState.objects.create(rule=rule, record_kind="customer", record_id=self.pizza.pk)

    def test_one_run_per_rule_per_night(self):
        rule = self.make_rule()
        RuleRun.objects.create(rule=rule, run_on=self.today, started_at=self.now)
        RuleRun.objects.create(
            rule=rule, run_on=self.today - timedelta(days=1), started_at=self.now
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            RuleRun.objects.create(rule=rule, run_on=self.today, started_at=self.now)

    def test_a_new_run_counts_nothing_yet(self):
        run = RuleRun.objects.create(rule=self.make_rule(), run_on=self.today, started_at=self.now)
        self.assertEqual(
            (run.matched, run.fired, run.skipped, run.finished_at),
            (0, 0, {"cooldown": 0, "cap": 0, "not_visible": 0, "failed": 0, "nobody": 0}, None),
        )
        self.assertEqual(str(run), f"Rule run {run.pk}")

    def test_one_record_row_per_run_and_record(self):
        run = RuleRun.objects.create(rule=self.make_rule(), run_on=self.today, started_at=self.now)
        RuleRunRecord.objects.create(
            run=run, record_kind="customer", record_id=self.pizza.pk, outcome="fired"
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            RuleRunRecord.objects.create(
                run=run, record_kind="customer", record_id=self.pizza.pk, outcome="skipped"
            )

    def test_one_review_per_run_and_kind_waiting_seven_days(self):
        rule = self.make_rule()
        run = RuleRun.objects.create(rule=rule, run_on=self.today, started_at=self.now)
        review = RuleReview.objects.create(
            rule=rule, run=run, action=SURVEY, records=[{"kind": "customer", "id": self.pizza.pk}]
        )
        self.assertEqual((review.status, review.result, review.counts), ("waiting", {}, {}))
        self.assertEqual(review.expires_at, review.created_at + timedelta(days=7))
        self.assertEqual(list(run.reviews.all()), [review])
        self.assertEqual(str(review), f"Rule review {review.pk}")
        with self.assertRaises(IntegrityError), transaction.atomic():
            RuleReview.objects.create(rule=rule, run=run, action=SURVEY, records=[])


class NotificationKindTests(RuleFixture):
    def test_rule_fired_and_rule_review_are_real_kinds(self):
        choices = dict(Notification.Kind.choices)
        self.assertEqual(
            (choices["rule_fired"], choices["rule_review"]), ("Rule fired", "Rule review waiting")
        )

    def test_a_message_holds_a_digest_with_the_owners_note(self):
        note = Notification.objects.create(recipient=self.csm, kind="rule_fired", message="x" * 500)
        note.refresh_from_db()
        self.assertEqual(len(note.message), 500)
