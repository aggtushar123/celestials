"""A Draft plan is not open anywhere (contract, Plans): it is never
counted as open, never marked at risk or done by the nightly step, never
on the Brain's or a canvas's open plans, and never blocks a new plan from
the same template."""

from datetime import timedelta

from services.brain.doing import plans_in
from services.brain.scope import COMPANY, resolve
from services.copilot.brain_grounding import doing_counts
from services.plans.models import Plan
from services.plans.nightly import finished_plans, late_plans
from services.plans.starting import open_plan_id, start_plan
from services.plans.tests.fixtures import PlanFixture


class DraftNotOpenTests(PlanFixture):
    def setUp(self):
        self.draft = self.build_plan(
            template=self.mine, status="draft", start=self.today - timedelta(days=30)
        )

    def test_it_never_blocks_its_template(self):
        self.assertIsNone(open_plan_id(self.pizza, self.mine.pk))
        plan = start_plan(
            self.mine.pk, self.pizza, owner=self.csm, start_date=self.today, actor=self.csm
        )
        self.assertEqual(plan.status, "not_started")

    def test_the_nightly_step_leaves_it_alone(self):
        scope = Plan.objects.filter(pk=self.draft.pk)
        self.assertFalse(late_plans(scope, self.today).exists())
        self.draft.milestones.update(done_at=self.draft.created_at)
        self.assertFalse(finished_plans(scope).exists())

    def test_the_brain_neither_lists_nor_counts_it(self):
        self.assertFalse(plans_in(self.admin, resolve(self.admin, COMPANY), self.today).exists())
        payload = {"initiatives": [], "rules": [], "plans": [{"status": "draft"}]}
        self.assertEqual(doing_counts(payload)["open_plans"], 0)

    def test_the_record_list_puts_it_after_open_plans(self):
        open_plan = self.build_plan(template=None, name="Open one")
        rows = self.api(self.csm).get(f"/api/v1/customers/{self.pizza.pk}/plans/").data
        self.assertEqual([r["id"] for r in rows["results"]], [open_plan.pk, self.draft.pk])
