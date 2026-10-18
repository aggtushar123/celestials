"""Every agents route with a member, a manager, a view-all reader and a
stranger: counted, never named; evidence for view-all only; a stranger sees
nothing of another workspace."""

from services.agents.tests.fixtures import AgentsFixture
from services.metrics.models import AgentAction


class PrivacyTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        for record in (cls.pizza, cls.soup, cls.globex):
            AgentAction.objects.create(
                organisation=record.organisation,
                agent="cs",
                batch="b",
                kind="note.create",
                customer=record,
                target="note:x",
                title=f"Note on {record.name}",
                rationale="r",
                evidence=["secret figure"],
                payload={"title": "x", "body": "y"},
            )

    def names(self, user):
        data = self.client_for(user).get("/api/v1/agents/actions/").data
        return sorted(r["record"]["name"] for r in data["results"]), data["hidden"]

    def test_member_manager_view_all_and_stranger(self):
        self.assertEqual(self.names(self.csm), (["Pizza Hut"], 1))
        self.assertEqual(self.names(self.mona), (["Pizza Hut", "Soup Co"], 0))
        self.assertEqual(self.names(self.other), ([], 2))
        self.assertEqual(self.names(self.admin), (["Pizza Hut", "Soup Co"], 0))
        self.assertEqual(self.names(self.stranger), (["Globex Corp"], 0))

    def test_evidence_is_for_view_all_only(self):
        def evidence(user):
            data = self.client_for(user).get("/api/v1/agents/actions/").data
            return [r["evidence"] for r in data["results"]]

        self.assertEqual(evidence(self.csm), [[]])
        self.assertTrue(all(evidence(self.admin)))

    def test_another_workspaces_action_is_a_404(self):
        theirs = AgentAction.objects.get(customer=self.globex)
        response = self.client_for(self.admin).post(f"/api/v1/agents/actions/{theirs.pk}/approve/")
        self.assertEqual(response.status_code, 404)
