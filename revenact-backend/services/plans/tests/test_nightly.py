"""The nightly step: an open plan with an overdue milestone becomes at risk
(by the system), unless a person cleared it and nothing has fallen due
since; a plan whose milestones are all done becomes done. Per plan, safe to
run twice, after the segments and before the rules."""

from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command

from core.models import AuditEvent
from services.metrics import recording
from services.plans import nightly
from services.plans.models import Plan
from services.plans.nightly import PlansResult, refresh_plans
from services.plans.tests.fixtures import PlanFixture
from services.rules import nightly as rules_nightly
from services.rules.nightly import RulesResult
from services.segments import nightly as segments_nightly


class NightFixture(PlanFixture):
    def night(self, days=0, organisation=None):
        return refresh_plans(organisation, today=self.today + timedelta(days=days), now=self.now)

    def status(self, plan):
        return Plan.objects.values_list("status", "status_set_by").get(pk=plan.pk)


class AtRiskTests(NightFixture):
    def test_an_overdue_milestone_puts_the_plan_at_risk(self):
        plan = self.build_plan()
        self.assertEqual(self.night(days=7), PlansResult())
        result = self.night(days=8)
        self.assertEqual(result, PlansResult(at_risk=1))
        self.assertEqual(self.status(plan), ("at_risk", "system"))
        event = AuditEvent.objects.get(action="plan.status_changed")
        self.assertEqual(
            (event.actor, event.metadata),
            (None, {"old": "not_started", "new": "at_risk", "by": "system"}),
        )

    def test_a_done_milestone_is_never_late(self):
        plan = self.build_plan()
        plan.milestones.filter(name="Kick-off").update(done_at=self.now)
        self.assertEqual(self.night(days=8), PlansResult())

    def test_a_cleared_plan_waits_for_a_milestone_due_since(self):
        plan = self.build_plan(status="on_track")
        Plan.objects.filter(pk=plan.pk).update(at_risk_cleared_on=self.today + timedelta(days=9))
        self.assertEqual(self.night(days=10), PlansResult())
        self.assertEqual(self.night(days=15), PlansResult(at_risk=1))

    def test_finished_and_at_risk_plans_are_left_alone(self):
        for status in ("done", "cancelled", "at_risk"):
            self.build_plan(status=status)
        self.assertEqual(self.night(days=30), PlansResult())

    def test_twice_in_one_night_is_safe(self):
        self.build_plan()
        self.assertEqual(self.night(days=8), PlansResult(at_risk=1))
        self.assertEqual(self.night(days=8), PlansResult())
        self.assertEqual(AuditEvent.objects.filter(action="plan.status_changed").count(), 1)


class DoneTests(NightFixture):
    def test_every_milestone_done_finishes_the_plan(self):
        plan = self.build_plan(status="on_track")
        plan.milestones.update(done_at=self.now, done_by=self.csm)
        self.assertEqual(self.night(), PlansResult(done=1))
        self.assertEqual(self.status(plan), ("done", "system"))
        self.assertIsNotNone(Plan.objects.get(pk=plan.pk).done_at)


class IsolationTests(NightFixture):
    def test_one_plans_failure_never_stops_the_rest(self):
        first, second = self.build_plan(), self.build_plan(self.emea)
        real = nightly.set_status

        def flaky(plan, *args, **kwargs):
            if plan.pk == first.pk:
                raise RuntimeError("Pizza Hut boom")
            return real(plan, *args, **kwargs)

        with (
            patch.object(nightly, "set_status", side_effect=flaky),
            self.assertLogs("services.plans.nightly", "ERROR") as logs,
        ):
            result = self.night(days=8)
        self.assertEqual(result, PlansResult(at_risk=1, failed=1))
        self.assertEqual(
            (self.status(first)[0], self.status(second)[0]), ("not_started", "at_risk")
        )
        self.assertNotIn("boom", "\n".join(logs.output))
        self.assertIn("RuntimeError", "\n".join(logs.output))

    def test_a_plan_deleted_mid_run_is_skipped_not_failed(self):
        first, second = self.build_plan(), self.build_plan(self.emea)
        real = nightly.lock_plan

        def deleted_first(pk):
            if pk == first.pk:
                Plan.objects.filter(pk=pk).delete()
            return real(pk)

        with (
            patch.object(nightly, "lock_plan", side_effect=deleted_first),
            self.assertNoLogs("services.plans.nightly", "ERROR"),
        ):
            result = self.night(days=8)
        self.assertEqual(result, PlansResult(at_risk=1, skipped=1))
        self.assertEqual(self.status(second)[0], "at_risk")

    def test_one_workspace_at_a_time(self):
        self.build_plan()
        self.assertEqual(self.night(days=8, organisation=self.other_org), PlansResult())
        self.assertEqual(self.night(days=8, organisation=self.org), PlansResult(at_risk=1))


class MaintenanceStepTests(NightFixture):
    def run_job(self, *args):
        out = StringIO()
        call_command("run_health_maintenance", *args, org_email="alice@acme.io", stdout=out)
        return out.getvalue()

    def test_plans_run_after_segments_and_before_rules(self):
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
                nightly, "refresh_plans", side_effect=step("plans", PlansResult(at_risk=2))
            ) as plans,
            patch.object(rules_nightly, "evaluate_rules", side_effect=step("rules", RulesResult())),
            patch.object(recording, "record_period_end", side_effect=step("metrics", (0, 0))),
        ):
            output = self.run_job()
        self.assertEqual(calls, ["segments", "plans", "rules", "metrics"])
        self.assertEqual(plans.call_args.args, (self.org,))
        self.assertIn("refreshed plans: 2 at risk, 0 done, 0 failed", output)

    def test_a_dry_run_skips_it(self):
        with patch.object(nightly, "refresh_plans") as plans:
            self.run_job("--dry-run")
        plans.assert_not_called()

    def test_a_failure_is_reported_by_class_and_the_job_goes_on(self):
        with patch.object(nightly, "refresh_plans", side_effect=RuntimeError("Pizza Hut")):
            output = self.run_job()
        self.assertIn("plans skipped: RuntimeError", output)
        self.assertNotIn("Pizza Hut", output)
        self.assertIn("metric snapshot(s)", output)
