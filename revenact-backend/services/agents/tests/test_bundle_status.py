"""A bundle's status (contract §1.3, D4, D15): what a run ends as, a waiting
bundle with nothing left proposed, the 14-day read-time rule, stuck runs, and
legacy paths that decide a step settling its bundle."""

from datetime import timedelta

from django.utils import timezone

from services.agents import bundles, deciding
from services.agents.deciding import expire
from services.agents.models import AgentBundle
from services.agents.tests.bundle_fixtures import BundleFixture, lifecycle, note
from services.metrics.models import AgentAction


class OutcomeTests(BundleFixture):
    def statuses(self, bundle, *pairs):
        for step, (status, selected) in zip(bundle.steps.order_by("position"), pairs, strict=True):
            AgentAction.objects.filter(pk=step.pk).update(status=status, selected=selected)
        return list(bundle.steps.order_by("position"))

    def test_done_partly_done_and_expired(self):
        bundle = self.bundle_of(self.pizza, lifecycle(), note(), note("Two", "B"))
        cases = [
            ((("applied", True), ("skipped", False), ("applied", True)), "done"),
            ((("applied", True), ("failed", True), ("skipped", False)), "partly_done"),
            ((("applied", True), ("expired", True), ("skipped", False)), "partly_done"),
            ((("expired", True), ("expired", True), ("skipped", False)), "expired"),
            ((("undone", True), ("applied", True), ("applied", True)), "done"),
        ]
        for pairs, expected in cases:
            with self.subTest(pairs=pairs):
                self.assertEqual(bundles.outcome(self.statuses(bundle, *pairs)), expected)


class SettleTests(BundleFixture):
    def test_a_waiting_bundle_with_nothing_proposed_expires_or_is_superseded(self):
        bundle = self.bundle_of(self.pizza, lifecycle(), note())
        first, second = bundle.steps.order_by("position")
        expire(first, "not_reproposed")
        self.assertEqual(bundles.settle(AgentBundle.objects.get(pk=bundle.pk)).status, "waiting")
        expire(second, "replaced")
        self.assertEqual(bundles.settle(AgentBundle.objects.get(pk=bundle.pk)).status, "expired")
        other = self.bundle_of(self.pizza, note("Replaced", "X"))
        expire(other.steps.get(), "replaced")
        self.assertEqual(bundles.settle(AgentBundle.objects.get(pk=other.pk)).status, "superseded")

    def test_a_legacy_decision_settles_its_bundle(self):
        bundle = self.bundle_of(self.pizza, lifecycle())
        step = bundle.steps.get()
        deciding.reject(self.fresh(self.csm), step.pk)
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).status, "rejected")
        again = self.bundle_of(self.pizza, lifecycle("adoption"))
        deciding.approve(self.fresh(self.csm), again.steps.get().pk)
        again.refresh_from_db()
        self.assertEqual((again.status, again.run_by_id), ("done", self.csm.pk))

    def test_setting_a_kind_to_never_settles(self):
        bundle = self.bundle_of(self.pizza, note())
        response = self.client_for(self.admin).patch(
            "/api/v1/agents/settings/", {"levels": {"cs": {"note.create": "never"}}}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).status, "expired")


class ReadTimeExpiryTests(BundleFixture):
    def test_live_waiting_drops_a_bundle_14_days_old(self):
        young = self.bundle_of(self.pizza, lifecycle())
        old = self.bundle_of(self.pizza, note())
        AgentBundle.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=14))
        rows = bundles.live_waiting(AgentBundle.objects.filter(organisation=self.org))
        self.assertEqual(list(rows.values_list("pk", flat=True)), [young.pk])
        self.assertTrue(bundles.read_expired(AgentBundle.objects.get(pk=old.pk), timezone.now()))

    def test_expire_bundle_expires_every_proposed_step(self):
        bundle = self.bundle_of(self.pizza, lifecycle(), note())
        bundles.expire_bundle(AgentBundle.objects.get(pk=bundle.pk), "waited")
        bundle.refresh_from_db()
        self.assertEqual(bundle.status, "expired")
        self.assertEqual(
            set(bundle.steps.values_list("status", "expired_reason")), {("expired", "waited")}
        )


class StuckRunTests(BundleFixture):
    def stuck(self, minutes):
        bundle = self.bundle_of(self.pizza, lifecycle(), note())
        first, second = bundle.steps.order_by("position")
        AgentAction.objects.filter(pk=first.pk).update(status="applied")
        AgentBundle.objects.filter(pk=bundle.pk).update(
            status="running",
            run_by=self.csm,
            run_started_at=timezone.now() - timedelta(minutes=minutes),
        )
        return AgentBundle.objects.get(pk=bundle.pk), second

    def test_a_run_left_15_minutes_is_settled_partly_done(self):
        bundle, second = self.stuck(15)
        settled = bundles.settle_stuck(bundle)
        second.refresh_from_db()
        self.assertEqual(settled.status, "partly_done")
        self.assertIsNotNone(settled.run_finished_at)
        self.assertEqual(
            (second.status, second.error), ("failed", "This step didn't finish. Retry it.")
        )

    def test_settling_a_stuck_run_is_audited(self):
        from core.models import AuditEvent

        bundle, second = self.stuck(20)
        bundles.settle_stuck(bundle)
        failed = AuditEvent.objects.get(action="agent_action.failed")
        self.assertEqual(
            (failed.actor, failed.target_id, failed.metadata["error"], failed.metadata["bundle"]),
            (None, str(second.pk), "StuckRun", bundle.pk),
        )
        finished = AuditEvent.objects.get(action="agent_bundle.run_finished")
        self.assertEqual(
            (finished.actor, finished.target_id, finished.metadata),
            (
                None,
                str(bundle.pk),
                {"status": "partly_done", "steps": {"applied": 1, "failed": 1}, "stuck": True},
            ),
        )

    def test_a_fresh_run_is_left_alone_and_the_sweep_counts(self):
        bundle, _second = self.stuck(5)
        self.assertEqual(bundles.settle_stuck(bundle).status, "running")
        self.stuck(20)
        self.assertEqual(bundles.settle_stuck_all(self.org), 1)
