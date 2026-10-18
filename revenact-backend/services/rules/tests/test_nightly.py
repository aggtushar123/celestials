"""The nightly step: each active rule once a night, as its owner, in its own
transaction; each record and action in its own savepoint; the scores and
fired dates stored; a rule whose segment or owner went away switched off;
one review notice per owner; and its place in run_health_maintenance."""

from datetime import timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

from django.core import mail
from django.core.management import call_command
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import User
from services.customers.models import Customer, Task
from services.metrics import recording
from services.notifications.models import Notification
from services.rules import actions, nightly
from services.rules.models import Rule, RuleReview, RuleRun, RuleRunRecord, RuleState
from services.rules.nightly import RulesResult, evaluate_rules
from services.rules.tests.fixtures import LIFECYCLE, NOTIFY_ME, SURVEY, TASK, RuleFixture
from services.segments import nightly as segments_nightly
from services.segments.models import Segment
from services.surveys.models import SurveySend
from services.surveys.sending import CONSOLE_BACKEND, claim

DONE = {"status": "done", "detail": ""}
SKIPS = {"cooldown": 0, "cap": 0, "not_visible": 0, "failed": 0, "nobody": 0}


class NightlyFixture(RuleFixture):
    def night(self, days=0, organisation=None):
        return evaluate_rules(organisation, today=self.today + timedelta(days=days), now=self.now)

    def records(self, rule):
        rows = RuleRunRecord.objects.filter(run__rule=rule).order_by("record_id")
        return list(rows.values_list("record_id", "outcome", "reason"))

    def notes(self, kind="rule_fired"):
        rows = Notification.objects.filter(kind=kind).order_by("pk")
        return list(rows.values_list("recipient_id", "message", "link"))


class RunTests(NightlyFixture):
    def test_an_entered_rule_acts_on_todays_entries(self):
        rule = self.make_rule(actions=[NOTIFY_ME, TASK])
        self.changed(self.book, [self.pizza])
        result = self.night()
        self.assertEqual((result.ran, result.fired, result.reviews, result.failed), (1, 1, 0, 0))
        run = RuleRun.objects.get(rule=rule)
        self.assertEqual(
            (run.run_on, run.matched, run.fired, run.skipped),
            (self.today, 1, 1, SKIPS),
        )
        self.assertIsNotNone(run.finished_at)
        record = RuleRunRecord.objects.get(run=run)
        self.assertEqual(record.actions, [{"action": "notify", **DONE}, {"action": "task", **DONE}])
        self.assertEqual(Task.objects.get().customer, self.pizza)
        self.assertEqual(
            self.notes(),
            [
                (
                    self.csm.pk,
                    "Renewal watch: Pizza Hut entered My book",
                    f"/scenarios/rules/{rule.pk}?run={run.pk}",
                )
            ],
        )
        state = RuleState.objects.get(rule=rule)
        self.assertEqual((state.record_id, state.last_fired_on), (self.pizza.pk, self.today))
        event = AuditEvent.objects.get(action="rule.fired")
        self.assertEqual((event.actor, event.target_id), (None, str(rule.pk)))
        self.assertEqual(
            event.metadata,
            {"run": run.pk, "matched": 1, "fired": 1, "skipped": run.skipped},
        )

    def test_a_quiet_night_writes_its_run_and_no_audit(self):
        rule = self.make_rule()
        self.assertEqual(self.night().ran, 1)
        self.assertTrue(RuleRun.objects.filter(rule=rule, matched=0).exists())
        self.assertFalse(AuditEvent.objects.filter(action="rule.fired").exists())

    def test_one_run_per_rule_per_night(self):
        self.make_rule(actions=[TASK])
        self.changed(self.book, [self.pizza])
        self.night()
        again = self.night()
        self.assertEqual((again.ran, again.fired), (0, 0))
        self.assertEqual(Task.objects.count(), 1)

    def test_a_run_starts_when_its_rule_starts(self):
        self.make_rule()
        before = timezone.now()
        evaluate_rules(today=self.today, now=self.now - timedelta(hours=6))
        run = RuleRun.objects.get()
        self.assertGreaterEqual(run.started_at, before)
        self.assertLessEqual(run.started_at, run.finished_at)

    def test_a_rule_failing_after_its_writes_rolls_back_its_whole_night(self):
        rule = self.make_rule(actions=[NOTIFY_ME, TASK, LIFECYCLE])
        self.changed(self.book, [self.pizza])
        with (
            patch.object(nightly, "_store_states", side_effect=RuntimeError("late")),
            self.assertLogs("services.rules.nightly", "ERROR") as logs,
        ):
            result = self.night()
        self.assertEqual((result.ran, result.failed), (0, 1))
        self.assertFalse(RuleRun.objects.filter(rule=rule).exists())
        self.assertFalse(RuleRunRecord.objects.exists())
        self.assertFalse(Task.objects.exists())
        self.assertEqual(Customer.objects.get(pk=self.pizza.pk).lifecycle_stage, "onboarding")
        self.assertFalse(Notification.objects.exists())
        self.assertFalse(
            AuditEvent.objects.filter(action__in=["rule.field_changed", "rule.fired"]).exists()
        )
        self.assertFalse(RuleState.objects.exists())
        self.assertNotIn("late", logs.output[0])

    def test_a_second_night_the_same_day_makes_no_second_review_or_notice(self):
        self.make_rule(actions=[SURVEY, NOTIFY_ME])
        self.changed(self.book, [self.dough])
        self.night()
        again = self.night()
        self.assertEqual((again.ran, again.reviews, again.failed), (0, 0, 0))
        self.assertEqual(RuleReview.objects.count(), 1)
        self.assertEqual(len(self.notes("rule_review")), 1)
        self.assertEqual(len(self.notes("rule_fired")), 1)

    def test_rules_that_are_off_are_left_alone(self):
        self.make_rule(is_active=False)
        self.changed(self.book, [self.pizza])
        self.assertEqual(self.night().ran, 0)
        self.assertFalse(RuleRun.objects.exists())

    def test_one_workspace_at_a_time(self):
        mine = self.make_rule()
        Rule.objects.create(
            organisation=self.other_org,
            owner=self.stranger,
            name="Globex",
            trigger="entered",
            is_active=True,
            actions=[NOTIFY_ME],
            segment=self.pinned("customer", [self.globex], owner=self.stranger, name="G"),
        )
        self.assertEqual(self.night(organisation=self.org).ran, 1)
        self.assertEqual(list(RuleRun.objects.values_list("rule_id", flat=True)), [mine.pk])


class CrossedNightTests(NightlyFixture):
    def test_the_first_night_stores_and_the_next_fires(self):
        rule = self.make_rule(
            trigger="crossed", score="csat", direction="below", threshold=Decimal("60")
        )
        Customer.objects.filter(pk=self.pizza.pk).update(csat_score=70)
        Customer.objects.filter(pk=self.dough.pk).update(csat_score=50)
        self.assertEqual(self.night().fired, 0)
        stored = dict(RuleState.objects.values_list("record_id", "last_value"))
        self.assertEqual(stored, {self.pizza.pk: Decimal(70), self.dough.pk: Decimal(50)})
        Customer.objects.filter(pk=self.pizza.pk).update(csat_score=55)
        self.assertEqual(self.night(days=1).fired, 1)
        state = RuleState.objects.get(rule=rule, record_id=self.pizza.pk)
        self.assertEqual(
            (state.last_value, state.last_fired_on),
            (Decimal(55), self.today + timedelta(days=1)),
        )

    def crossing(self, **fields):
        return self.make_rule(
            trigger="crossed", score="csat", direction="below", threshold=Decimal("60"), **fields
        )

    def test_a_member_that_did_not_fire_still_gets_tonights_value(self):
        rule = self.crossing()
        Customer.objects.filter(pk__in=[self.pizza.pk, self.dough.pk]).update(csat_score=70)
        self.night()
        Customer.objects.filter(pk=self.pizza.pk).update(csat_score=55)
        Customer.objects.filter(pk=self.dough.pk).update(csat_score=65)
        self.assertEqual(self.night(days=1).fired, 1)
        dough = RuleState.objects.get(rule=rule, record_id=self.dough.pk)
        self.assertEqual((dough.last_value, dough.last_fired_on), (Decimal(65), None))

    def test_a_record_whose_actions_all_failed_keeps_its_value_but_no_fired_date(self):
        rule = self.crossing(actions=[LIFECYCLE])
        Customer.objects.filter(pk=self.pizza.pk).update(csat_score=70)
        self.night()
        Customer.objects.filter(pk=self.pizza.pk).update(csat_score=55)

        def broken(*args, **kwargs):
            raise RuntimeError("no")

        with (
            patch.dict(actions.INTERNAL, {"lifecycle": broken}),
            self.assertLogs("services.rules.nightly", "WARNING"),
        ):
            self.night(days=1)
        state = RuleState.objects.get(rule=rule, record_id=self.pizza.pk)
        self.assertEqual((state.last_value, state.last_fired_on), (Decimal(55), None))

    def test_a_member_without_a_score_tonight_forgets_its_last(self):
        self.make_rule(trigger="crossed", score="csat", direction="below", threshold=Decimal("60"))
        Customer.objects.filter(pk=self.pizza.pk).update(csat_score=70)
        self.night()
        Customer.objects.filter(pk=self.pizza.pk).update(csat_score=None)
        self.night(days=1)
        self.assertIsNone(RuleState.objects.get(record_id=self.pizza.pk).last_value)


class SkipTests(NightlyFixture):
    def test_the_cooldown_is_recorded_on_the_night(self):
        rule = self.make_rule()
        RuleState.objects.create(
            rule=rule,
            record_kind="customer",
            record_id=self.pizza.pk,
            last_fired_on=self.today - timedelta(days=1),
        )
        self.changed(self.book, [self.pizza, self.dough])
        self.night()
        self.assertEqual(
            self.records(rule),
            [(self.pizza.pk, "skipped", "cooldown"), (self.dough.pk, "fired", "")],
        )
        self.assertEqual(RuleRun.objects.get(rule=rule).skipped["cooldown"], 1)

    def test_the_cap_is_counted_with_no_row(self):
        rule = self.make_rule()
        self.changed(self.book, [self.pizza, self.dough])
        with patch("services.rules.selection.NIGHTLY_CAP", 1):
            self.night()
        self.assertEqual(self.records(rule), [(self.pizza.pk, "fired", "")])
        self.assertEqual(RuleRun.objects.get(rule=rule).skipped["cap"], 1)

    def test_a_record_the_owner_cannot_open_is_counted_and_never_touched(self):
        rule = self.make_rule(actions=[TASK])
        self.changed(self.book, [self.pizza, self.taco])
        self.night()
        self.assertEqual(self.records(rule), [(self.pizza.pk, "fired", "")])
        self.assertEqual(RuleRun.objects.get(rule=rule).skipped["not_visible"], 1)
        self.assertFalse(Task.objects.filter(customer=self.taco).exists())


class FailureTests(NightlyFixture):
    def flaky_on(self, record):
        def flaky(action, rule, target, kind, *, today, made):
            if target.pk == record.pk:
                raise RuntimeError("Pizza Hut's row said no")
            return actions.change_lifecycle(action, rule, target, kind, today=today, made=made)

        return patch.dict(actions.INTERNAL, {"lifecycle": flaky})

    def test_one_records_failure_is_recorded_and_the_rest_go_on(self):
        rule = self.make_rule(actions=[TASK, LIFECYCLE])
        self.changed(self.book, [self.pizza, self.dough])
        with (
            self.flaky_on(self.pizza),
            self.assertLogs("services.rules.nightly", "WARNING") as logs,
        ):
            self.night()
        pizza = RuleRunRecord.objects.get(run__rule=rule, record_id=self.pizza.pk)
        self.assertEqual(pizza.outcome, "fired")
        self.assertEqual(
            pizza.actions,
            [
                {"action": "task", **DONE},
                {
                    "action": "lifecycle",
                    "status": "failed",
                    "detail": "RuntimeError: could not be done",
                },
            ],
        )
        self.assertEqual(Customer.objects.get(pk=self.dough.pk).lifecycle_stage, "renewal")
        self.assertNotIn("Pizza Hut", logs.output[0])

    def test_a_record_whose_every_action_failed_is_skipped_and_not_cooled_down(self):
        rule = self.make_rule(actions=[LIFECYCLE])
        self.changed(self.book, [self.pizza])
        with self.flaky_on(self.pizza), self.assertLogs("services.rules.nightly", "WARNING"):
            self.night()
        self.assertEqual(self.records(rule), [(self.pizza.pk, "skipped", "failed")])
        run = RuleRun.objects.get(rule=rule)
        self.assertEqual((run.fired, run.skipped["failed"]), (0, 1))
        self.assertFalse(RuleState.objects.filter(last_fired_on__isnull=False).exists())

    def test_a_record_whose_every_action_was_skipped_is_skipped_for_nobody(self):
        rule = self.make_rule(actions=[{**NOTIFY_ME, "to": "record_owner"}])
        Customer.objects.filter(pk=self.dough.pk).update(owner=None)
        self.changed(self.book, [self.pizza, self.dough])
        result = self.night()
        self.assertEqual(
            self.records(rule),
            [(self.pizza.pk, "fired", ""), (self.dough.pk, "skipped", "nobody")],
        )
        run = RuleRun.objects.get(rule=rule)
        self.assertEqual((result.fired, run.fired), (1, 1))
        self.assertEqual(run.skipped, {**SKIPS, "nobody": 1})
        fired = set(
            RuleState.objects.filter(last_fired_on__isnull=False).values_list(
                "record_id", flat=True
            )
        )
        self.assertEqual(fired, {self.pizza.pk})  # no cooldown for Dough Co

    def test_skipped_and_failed_together_read_as_failed(self):
        rule = self.make_rule(actions=[{**NOTIFY_ME, "to": "record_owner"}, LIFECYCLE])
        Customer.objects.filter(pk=self.pizza.pk).update(owner=None)
        self.changed(self.book, [self.pizza])
        with self.flaky_on(self.pizza), self.assertLogs("services.rules.nightly", "WARNING"):
            self.night()
        self.assertEqual(self.records(rule), [(self.pizza.pk, "skipped", "failed")])
        self.assertEqual(RuleRun.objects.get(rule=rule).skipped, {**SKIPS, "failed": 1})

    def test_one_rules_failure_never_stops_the_rest(self):
        broken = self.make_rule(name="Broken")
        fine = self.make_rule(name="Fine")
        real = nightly.select

        def flaky(rule, owner, **kwargs):
            if rule.pk == broken.pk:
                raise RuntimeError("boom")
            return real(rule, owner, **kwargs)

        with patch.object(nightly, "select", side_effect=flaky):
            with self.assertLogs("services.rules.nightly", "ERROR") as logs:
                result = self.night()
        self.assertEqual((result.ran, result.failed), (1, 1))
        self.assertEqual(list(RuleRun.objects.values_list("rule_id", flat=True)), [fine.pk])
        self.assertIn(f"Rule {broken.pk}: nightly run failed", logs.output[0])


class PauseTests(NightlyFixture):
    def assert_paused(self, rule, reason, label):
        result = self.night()
        rule.refresh_from_db()
        self.assertEqual((result.paused, rule.is_active, rule.paused_reason), (1, False, reason))
        self.assertEqual(
            self.notes(),
            [
                (
                    rule.owner_id,
                    f"Renewal watch was switched off: {label}",
                    f"/scenarios/rules/{rule.pk}",
                )
            ],
        )
        self.assertEqual(
            list(
                AuditEvent.objects.filter(action="rule.paused").values_list("metadata", flat=True)
            ),
            [{"reason": reason}],
        )
        self.night(days=1)
        self.assertEqual(len(self.notes()), 1)  # told once
        self.assertFalse(RuleRun.objects.exists())

    def test_a_rule_whose_segment_is_gone_switches_off(self):
        rule = self.make_rule(segment=self.pinned("customer", [self.pizza], name="Gone"))
        Segment.objects.filter(pk=rule.segment_id).delete()
        self.assert_paused(rule, "segment_gone", "Its segment was deleted.")

    def test_a_segment_no_longer_the_owners_switches_it_off(self):
        rule = self.make_rule(segment=self.pinned("customer", [self.pizza], name="Moved"))
        Segment.objects.filter(pk=rule.segment_id).update(owner=self.other)
        self.assert_paused(rule, "segment_not_owned", "Its segment is no longer the owner's.")

    def test_an_inactive_owner_switches_it_off(self):
        rule = self.make_rule()
        User.objects.filter(pk=self.csm.pk).update(is_active=False)
        self.assert_paused(rule, "owner_inactive", "Its owner is no longer active.")

    def standing(self, status):
        from services.identity.models import OrganizationMembership

        OrganizationMembership.objects.filter(organisation=self.org, user=self.csm).update(
            status=status
        )

    def test_a_suspended_owner_switches_it_off_and_no_task_is_made(self):
        rule = self.make_rule(actions=[TASK])
        self.changed(self.book, [self.pizza])
        self.standing("suspended")
        self.assert_paused(rule, "owner_inactive", "Its owner is no longer active.")
        self.assertFalse(Task.objects.exists())

    def test_a_revoked_owner_switches_it_off_and_no_task_is_made(self):
        rule = self.make_rule(actions=[TASK])
        self.changed(self.book, [self.pizza])
        self.standing("revoked")
        self.assert_paused(rule, "owner_inactive", "Its owner is no longer active.")
        self.assertFalse(Task.objects.exists())


class StandingNightTests(NightlyFixture):
    """The active-for-work ids (`work.standing`) are read once per rule run,
    never once per task."""

    def standing_reads(self, records):
        self.make_rule(actions=[TASK])
        self.changed(self.book, records)
        with CaptureQueriesContext(connection) as ctx:
            self.night()
        self.assertEqual(Task.objects.count(), len(records))
        marker = '"identity_organizationmembership"."status" = \'active\''
        return sum(marker in query["sql"] for query in ctx.captured_queries)

    def test_one_standing_read_per_rule_run_however_many_tasks(self):
        self.assertEqual(self.standing_reads([self.pizza, self.dough]), 1)


class SurveyNightTests(NightlyFixture):
    def test_each_survey_rule_makes_a_review_and_the_owner_hears_once(self):
        first = self.make_rule(name="First", actions=[SURVEY])
        self.make_rule(name="Second", actions=[SURVEY, NOTIFY_ME])
        self.changed(self.book, [self.dough])
        result = self.night()
        self.assertEqual(result.reviews, 2)
        review = RuleRun.objects.get(rule=first).reviews.get()
        self.assertEqual(
            (review.status, review.records),
            ("waiting", [{"kind": "customer", "id": self.dough.pk}]),
        )
        self.assertEqual(
            RuleRunRecord.objects.get(run__rule=first).actions,
            [{"action": "survey", "status": "queued", "detail": ""}],
        )
        self.assertEqual(
            self.notes("rule_review"),
            [
                (
                    self.csm.pk,
                    "2 surveys from your rules are waiting for your review.",
                    "/work/mine?kind=approval",
                )
            ],
        )
        self.assertFalse(SurveySend.objects.exists())

    def test_nobody_reachable_makes_no_review(self):
        """Dot is the only contact Dough Co has, and she was surveyed five
        days ago: the quiet period reaches nobody, so the survey is skipped
        for the record and no review (or notice) is made."""
        self.make_invite(
            self.make_send(owner=self.csm), self.dot, created_at=self.now - timedelta(days=5)
        )
        rule = self.make_rule(actions=[SURVEY])
        self.changed(self.book, [self.dough])
        result = self.night()
        self.assertEqual(result.reviews, 0)
        self.assertFalse(RuleReview.objects.exists())
        self.assertEqual(self.records(rule), [(self.dough.pk, "skipped", "nobody")])
        self.assertEqual(
            RuleRunRecord.objects.get(run__rule=rule).actions,
            [{"action": "survey", "status": "skipped", "detail": actions.NOBODY_TO_REACH}],
        )
        self.assertEqual(self.notes("rule_review"), [])

    def test_nobody_reachable_still_fires_its_other_action(self):
        """A record with no one reachable for its survey still fires for an
        action that did something; the survey alone is skipped and no
        review is made."""
        self.make_invite(
            self.make_send(owner=self.csm), self.dot, created_at=self.now - timedelta(days=5)
        )
        rule = self.make_rule(actions=[NOTIFY_ME, SURVEY])
        self.changed(self.book, [self.dough])
        result = self.night()
        self.assertEqual(result.reviews, 0)
        self.assertFalse(RuleReview.objects.exists())
        self.assertEqual(self.records(rule), [(self.dough.pk, "fired", "")])
        self.assertEqual(
            RuleRunRecord.objects.get(run__rule=rule).actions,
            [
                {"action": "notify", **DONE},
                {"action": "survey", "status": "skipped", "detail": actions.NOBODY_TO_REACH},
            ],
        )
        self.assertEqual(self.notes("rule_review"), [])

    def test_without_review_sends_at_once(self):
        self.make_rule(actions=[{**SURVEY, "without_review": True}])
        self.changed(self.book, [self.dough])
        self.night()
        review = RuleReview.objects.get()
        self.assertEqual((review.status, review.decided_by), ("approved", None))
        self.assertEqual(SurveySend.objects.get().status, "sent")
        self.assertEqual([message.to for message in mail.outbox], [["dot@example.com"]])
        self.assertEqual(self.notes("rule_review"), [])

    @override_settings(DEBUG=False, EMAIL_BACKEND=CONSOLE_BACKEND)
    def test_without_review_refused_waits_and_the_owner_is_told(self):
        self.make_rule(actions=[{**SURVEY, "without_review": True}])
        self.changed(self.book, [self.dough])
        self.night()
        review = RuleReview.objects.get()
        self.assertEqual(review.status, "waiting")
        self.assertIn("error", review.result)
        self.assertEqual(
            self.notes("rule_review"),
            [
                (
                    self.csm.pk,
                    "A survey from your rules is waiting for your review.",
                    "/work/mine?kind=approval",
                )
            ],
        )

    def test_the_night_finishes_a_survey_send_still_sending(self):
        """The backstop for a runner that is down: a survey sent by hand and
        never delivered is finished by the night."""
        segment = self.pinned("customer", [self.dough], name="Dough")
        draft = SurveySend.objects.create(
            organisation=self.org, owner=self.csm, name="By hand", survey_type="nps",
            subject="How are we doing?", segment=segment, roles=["champion"],
        )  # fmt: skip
        claim(draft.pk, self.csm, today=self.today, now=self.now)
        result = self.night()
        draft.refresh_from_db()
        self.assertEqual((draft.status, result.survey_sends), ("sent", 1))
        self.assertEqual([message.to for message in mail.outbox], [["dot@example.com"]])

    def test_a_failed_send_without_review_is_counted_and_the_owner_told(self):
        self.make_rule(actions=[{**SURVEY, "without_review": True}])
        self.changed(self.book, [self.dough])
        with (
            patch.object(nightly, "send_review", side_effect=RuntimeError("smtp said no")),
            self.assertLogs("services.rules.nightly", "ERROR") as logs,
        ):
            result = self.night()
        self.assertEqual((result.reviews, result.failed), (1, 1))
        self.assertEqual(RuleReview.objects.get().status, "waiting")
        self.assertEqual(len(self.notes("rule_review")), 1)
        self.assertNotIn("smtp said no", "".join(logs.output))

    def test_a_failed_review_notice_is_counted_and_retried_on_the_next_run(self):
        self.make_rule(actions=[SURVEY])
        self.changed(self.book, [self.dough])
        real = nightly.notify

        def down(**kwargs):
            raise RuntimeError("push said no")

        with (
            patch.object(nightly, "notify", side_effect=down),
            self.assertLogs("services.rules.nightly", "ERROR"),
        ):
            result = self.night()
        self.assertEqual(result.failed, 1)
        self.assertEqual(self.notes("rule_review"), [])
        self.assertIsNone(RuleReview.objects.get().notified_at)
        with patch.object(nightly, "notify", side_effect=real):
            again = self.night()
        self.assertEqual(again.failed, 0)
        self.assertEqual(len(self.notes("rule_review")), 1)
        self.assertIsNotNone(RuleReview.objects.get().notified_at)

    def test_a_rerun_after_a_crash_sends_and_tells_what_was_left(self):
        """The rules committed, then the job died before the survey sent
        without review went out and before the owner heard: a re-run the
        same day sends it and tells the owner about the other, once."""
        self.make_rule(name="Auto", actions=[{**SURVEY, "without_review": True}])
        held = self.make_rule(name="Held", actions=[SURVEY])
        self.changed(self.book, [self.dough])
        with patch.object(nightly, "_finish_night", side_effect=RuntimeError("killed")):
            with self.assertRaises(RuntimeError):
                self.night()
        self.assertEqual(
            sorted(RuleReview.objects.values_list("status", flat=True)), ["waiting", "waiting"]
        )
        self.assertFalse(SurveySend.objects.exists())
        self.assertEqual(self.notes("rule_review"), [])

        again = self.night()
        self.assertEqual((again.ran, again.failed), (0, 0))
        statuses = dict(RuleReview.objects.values_list("rule__name", "status"))
        self.assertEqual(statuses, {"Auto": "approved", "Held": "waiting"})
        self.assertEqual([message.to for message in mail.outbox], [["dot@example.com"]])
        self.assertEqual(
            self.notes("rule_review"),
            [
                (
                    self.csm.pk,
                    "A survey from your rules is waiting for your review.",
                    "/work/mine?kind=approval",
                )
            ],
        )
        self.assertIsNotNone(RuleReview.objects.get(rule=held).notified_at)
        self.night()
        self.assertEqual(len(self.notes("rule_review")), 1)
        self.assertEqual(SurveySend.objects.count(), 1)

    @override_settings(DEBUG=False, EMAIL_BACKEND=CONSOLE_BACKEND)
    def test_a_refused_send_without_review_is_not_retried_on_a_rerun(self):
        self.make_rule(actions=[{**SURVEY, "without_review": True}])
        self.changed(self.book, [self.dough])
        self.night()
        with patch.object(nightly, "send_review") as send:
            self.night()
        send.assert_not_called()
        self.assertEqual(len(self.notes("rule_review")), 1)

    def test_waiting_reviews_expire_first(self):
        rule = self.make_rule(actions=[SURVEY])
        run = RuleRun.objects.create(
            rule=rule, run_on=self.today - timedelta(days=8), started_at=self.now
        )
        review = RuleReview.objects.create(rule=rule, run=run, action=SURVEY, records=[])
        RuleReview.objects.filter(pk=review.pk).update(created_at=self.now - timedelta(days=8))
        self.assertEqual(self.night().expired, 1)


class QueryCountTests(NightlyFixture):
    def queries_for(self, records, days):
        self.changed(self.wide, records, day=self.today + timedelta(days=days))
        with CaptureQueriesContext(connection) as queries:
            self.assertEqual(self.night(days=days).fired, len(records))
        return len(queries)

    def test_a_rules_queries_do_not_grow_with_its_records(self):
        extra = [
            Customer.objects.create(organisation=self.org, name=f"Extra {n}", owner=self.csm)
            for n in range(3)
        ]
        self.wide = self.pinned("customer", [self.pizza, self.dough, *extra], name="Wide")
        self.make_rule(segment=self.wide, actions=[NOTIFY_ME, SURVEY])
        one = self.queries_for([self.pizza], days=0)
        four = self.queries_for([self.dough, *extra], days=1)
        self.assertEqual(one, four)


class MaintenanceStepTests(NightlyFixture):
    def run_job(self, *args):
        out = StringIO()
        call_command("run_health_maintenance", *args, org_email="alice@acme.io", stdout=out)
        return out.getvalue()

    def test_rules_run_after_segments_and_before_the_month_end(self):
        calls = []

        def step(name, value):
            return lambda *args, **kwargs: calls.append(name) or value

        with (
            patch.object(
                segments_nightly,
                "evaluate_nightly",
                side_effect=step("segments", segments_nightly.NightlyResult()),
            ),
            patch.object(
                nightly,
                "evaluate_rules",
                side_effect=step("rules", RulesResult(ran=2, campaign_sends=3, survey_sends=4)),
            ) as rules,
            patch.object(recording, "record_period_end", side_effect=step("metrics", (0, 0))),
        ):
            output = self.run_job()
        self.assertEqual(calls, ["segments", "rules", "metrics"])
        self.assertEqual(rules.call_args.args, (self.org,))
        self.assertIn(
            "ran 2 rule(s): 0 record(s) fired, 0 review(s), 3 campaign send(s), "
            "4 survey send(s), 0 paused, 0 expired, 0 failed",
            output,
        )

    def test_a_dry_run_skips_it(self):
        with patch.object(nightly, "evaluate_rules") as rules:
            self.run_job("--dry-run")
        rules.assert_not_called()

    def test_a_failure_is_reported_and_the_job_goes_on(self):
        with patch.object(nightly, "evaluate_rules", side_effect=RuntimeError("boom")):
            output = self.run_job()
        self.assertIn("rules skipped: RuntimeError", output)
        self.assertNotIn("boom", output)
        self.assertIn("metric snapshot(s)", output)
