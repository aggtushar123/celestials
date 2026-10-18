"""Each object a builder action makes keeps the action (contract, "Made by the
agent"); deleting the action never deletes the object."""

from services.agents.tests.builder_fixtures import builder_action, definition
from services.agents.tests.fixtures import AgentsFixture
from services.campaigns.models import Campaign
from services.customers.models import Canvas
from services.plans.models import PlanTemplate
from services.rules.models import Rule
from services.segments.models import Segment


class AgentActionLinkTests(AgentsFixture):
    def test_each_object_keeps_the_action_and_outlives_it(self):
        action = builder_action(self.org, "segment.create", definition())
        segment = Segment.objects.create(
            organisation=self.org, owner=self.admin, name="S", kind="customer", agent_action=action
        )
        rule = Rule.objects.create(
            organisation=self.org,
            owner=self.admin,
            name="R",
            trigger="entered",
            segment=segment,
            actions=[{"action": "task", "title": "Call", "assignee": "record_owner"}],
            agent_action=action,
        )
        campaign = Campaign.objects.create(
            organisation=self.org, owner=self.admin, name="C", segment=segment, agent_action=action
        )
        canvas = Canvas.objects.create(customer=self.pizza, name="M", agent_action=action)
        template = PlanTemplate.objects.create(
            organisation=self.org,
            owner=self.admin,
            name="T",
            kind="save",
            milestones=[{"name": "M", "offset_days": 0, "tasks": []}],
            agent_action=action,
        )
        made = (segment, rule, campaign, canvas, template)
        self.assertEqual(
            [
                list(getattr(action, name).all())
                for name in ("segments", "rules", "campaigns", "canvases", "plan_templates")
            ],
            [[obj] for obj in made],
        )
        action.delete()
        for obj in made:
            obj.refresh_from_db()
            self.assertIsNone(obj.agent_action_id)
