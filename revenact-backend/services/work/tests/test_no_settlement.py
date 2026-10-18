"""No cross-settlement (delivery 2 contract §2): an agent action decided
leaves any old recommendation row as it was, and the settlement code is
gone."""

from services.agents.tests.bundle_fixtures import run_one
from services.work import deciding, recommend
from services.work.models import Recommendation
from services.work.tests.feed_fixtures import FeedFixture


class NoSettlementTests(FeedFixture):
    def test_the_settlement_code_is_gone(self):
        self.assertFalse(hasattr(recommend, "settle_for_action"))
        self.assertFalse(hasattr(deciding, "UseApply"))
        from services.agents import deciding as agents_deciding

        self.assertFalse(hasattr(agents_deciding, "_settle"))

    def test_approving_an_action_leaves_a_history_row_alone(self):
        action = self.proposal(self.pizza)
        rec = Recommendation.objects.create(
            organisation=self.org,
            customer=self.pizza,
            kind="agent_action",
            title="Save play",
            agent_action=action,
            recipient=self.csm,
            status=Recommendation.Status.DISMISSED,
            dismiss_reason="retired",
        )
        response = run_one(self.as_user(self.csm), action)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["bundle"]["steps"][0]["status"], "applied")
        rec.refresh_from_db()
        self.assertEqual(
            (rec.status, rec.dismiss_reason, rec.task_id), ("dismissed", "retired", None)
        )
