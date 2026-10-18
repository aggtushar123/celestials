"""An AI agent's owner change kept as a recommendation (history: open, or
retired by delivery 2's migration) is shown and decided only by someone with
the owner-change right; anyone else is refused before its body is read."""

from services.agents.tests.fixtures import viewer
from services.metrics.models import AgentAction
from services.work.models import Recommendation
from services.work.tests.recommend_fixtures import RecommendFixture

URL = "/api/v1/work/recommendations/"


class OwnerChangeRecommendationTests(RecommendFixture):
    def setUp(self):
        # Vic sees every account but is no settings manager and not above Mona.
        self.vic = viewer(self.org)
        self.action = AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind=AgentAction.Kind.RECORD_OWNER,
            customer=self.soup,
            target="owner",
            title="Hand Soup Co to Carl",
            rationale="r",
            payload={"owner_id": self.csm.pk},
            before=self.mona.pk,
        )

    def owner_rec(self, *, retired=False):
        rec = self.make_rec(
            "agent_action",
            on=self.soup,
            recipient=self.admin,
            title="Hand Soup Co to Carl",
            agent_action=self.action,
        )
        if retired:
            Recommendation.objects.filter(pk=rec.pk).update(
                status="dismissed", dismiss_reason="retired"
            )
        return rec

    def ids(self, user):
        return [item["id"] for item in self.ok(user, f"{URL}?scope=team")["items"]]

    def decide(self, user, rec):
        return {
            "dismiss": self.post(user, f"{URL}{rec.pk}/dismiss/", {"reason": "other", "note": "x"}),
            "assign": self.post(user, f"{URL}{rec.pk}/assign/", {"assignee_id": self.csm.pk}),
        }

    def assert_refused(self, rec):
        for route, response in self.decide(self.vic, rec).items():
            with self.subTest(route=route):
                self.assertIn(response.status_code, (403, 404))
                self.assertNotIn("recommendation", response.data)
                self.assertNotIn("Carl", str(response.data))

    def test_an_open_owner_change_is_offered_only_to_who_may_make_it(self):
        rec = self.owner_rec()
        self.assertEqual(self.ids(self.vic), [])
        self.assertEqual(self.ids(self.admin), [rec.pk])
        self.assert_refused(rec)

    def test_a_retired_owner_change_refuses_who_may_not_make_it(self):
        rec = self.owner_rec(retired=True)
        self.assert_refused(rec)
        # Someone with the right is told it was already decided.
        response = self.decide(self.admin, rec)["dismiss"]
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["recommendation"]["dismiss_reason"], "retired")
