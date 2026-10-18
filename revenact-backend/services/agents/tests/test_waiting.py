"""The Team queue lists agent bundles holding actions of every kind
(contract): kind bundle, the step read through the bundle's own route,
evidence for view-all only, and workspace-level actions for view-all only
(Decision 11)."""

from services.agents.tests.fixtures import AgentsFixture
from services.metrics.models import AgentAction

URL = "/api/v1/work/feed/team/?scope=company"
BUNDLE = "/api/v1/agents/bundles/{}/"


def approvals(body):
    return [
        i
        for g in body["groups"]
        if g["key"] == "decide"
        for i in g["items"]
        if i["kind"] == "bundle"
    ]


class TeamQueueAgentTests(AgentsFixture):
    def test_items_are_agent_actions(self):
        AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="record.lifecycle",
            customer=self.pizza,
            target="lifecycle",
            title="Move Pizza Hut",
            rationale="r",
            evidence=["Renews soon"],
            payload={"stage": "renewal"},
            before=self.pizza.lifecycle_stage,
        )
        AgentAction.objects.create(
            organisation=self.org,
            agent="ops",
            batch="b",
            kind="initiative.create",
            target="initiative:nrr::",
            title="Lift NRR",
            rationale="r",
            payload={"metric": "nrr", "metric_label": "NRR", "target_value": 1, "target_by": "x"},
        )
        alice = self.client_for(self.admin)
        kinds = sorted(
            alice.get(BUNDLE.format(i["id"])).data["steps"][0]["kind"]
            for i in approvals(alice.get(URL).data)
        )
        self.assertEqual(kinds, ["initiative.create", "record.lifecycle"])
        mona = self.client_for(self.mona)
        rows = approvals(mona.get("/api/v1/work/feed/team/?scope=team").data)
        (step,) = mona.get(BUNDLE.format(rows[0]["id"])).data["steps"]
        self.assertEqual(step["kind"], "record.lifecycle")
        self.assertEqual(step["evidence"], [])
        self.assertEqual((rows[0]["actions"], rows[0]["detail"]["can_run"]), (["open"], True))
        self.assertEqual(rows[0]["record"]["type"], "customer")
        self.assertEqual(rows[0]["for"], {"id": self.csm.pk, "name": "Carl CSM"})
