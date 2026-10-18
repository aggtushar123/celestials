"""Delivery 1's wrappers are gone (contract, delivery 1 follow-ups): the
three /metrics/proposals/ routes answer 404, and the AI switch still stops
the agents."""

from unittest.mock import patch

from services.accounts.models import Organisation
from services.agents import run as agent_run
from services.agents.tests.fixtures import AgentsFixture
from services.metrics.models import AgentAction


class LegacyRoutesRemovedTests(AgentsFixture):
    def setUp(self):
        self.plan = patch("services.agents.policy.plan_credits", return_value=2000)
        self.plan.start()
        self.addCleanup(self.plan.stop)

    def test_the_three_routes_answer_404(self):
        action = AgentAction.objects.create(
            organisation=self.org,
            batch="b",
            kind="task.create",
            customer=self.pizza,
            target="task:call",
            title="Call",
            rationale="r",
            payload={
                "title": "Call",
                "assignee_id": None,
                "assignee_name": "Carl CSM",
                "due_date": self.today.isoformat(),
                "priority": "high",
            },
        )
        admin = self.client_for(self.admin)
        self.assertEqual(admin.get("/api/v1/metrics/proposals/").status_code, 404)
        self.assertEqual(admin.post("/api/v1/metrics/proposals/generate/").status_code, 404)
        for decision in ("approve", "reject"):
            url = f"/api/v1/metrics/proposals/{action.pk}/{decision}/"
            self.assertEqual(admin.post(url).status_code, 404)
        action.refresh_from_db()
        self.assertEqual(action.status, "proposed")

    def test_the_ai_switch_stops_run_and_run_all(self):
        Organisation.objects.filter(pk=self.org.pk).update(ai_agent_enabled=False)
        with patch("services.agents.run.get_completion") as call:
            result = agent_run.run(Organisation.objects.get(pk=self.org.pk), "cs")
            total = agent_run.run_all(Organisation.objects.get(pk=self.org.pk))
        self.assertEqual(result.skipped_reason, "ai_off")
        self.assertEqual((total.proposed, total.applied, total.failed), (0, 0, []))
        call.assert_not_called()
        self.assertFalse(AgentAction.objects.exists())

    def test_the_legacy_status_filter_is_gone(self):
        from services.metrics import legacy

        self.assertFalse(hasattr(legacy, "LEGACY_STATUS_FILTER"))
