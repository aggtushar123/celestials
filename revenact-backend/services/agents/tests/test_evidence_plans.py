"""What a CS or Sales agent reads of plans (contract, `plan.start`): one
workspace block of the templates every member may read (built-ins and the
workspace's shared ones, at most 20, by name), and each record's open
plans."""

from copy import deepcopy

from services.agents import evidence, prompt
from services.agents.tests.fixtures import AgentsFixture
from services.plans.models import Plan, PlanTemplate
from services.plans.tests.fixtures import STEPS


class PlanEvidenceTests(AgentsFixture):
    def template(self, name, sharing, organisation=None, owner=None):
        return PlanTemplate.objects.create(
            organisation=organisation or self.org,
            owner=owner or self.csm,
            name=name,
            kind="other",
            milestones=deepcopy(STEPS),
            sharing=sharing,
        )

    def build(self, agent="cs"):
        return evidence.build(self.org, agent, today=self.today)

    def test_the_templates_every_member_may_read(self):
        shared = self.template("Shared kick-off", "workspace")
        self.template("Carl's own", "private")
        self.template("For Mona", "people")
        self.template("Globex's", "workspace", organisation=self.other_org, owner=self.stranger)
        ctx = self.build()
        builtins = set(PlanTemplate.objects.filter(is_builtin=True).values_list("pk", flat=True))
        self.assertEqual(set(ctx.templates), builtins | {shared.pk})
        self.assertEqual(
            ctx.templates[shared.pk],
            {
                "id": shared.pk,
                "name": "Shared kick-off",
                "kind": "other",
                "milestones": 2,
                "tasks": 2,
            },
        )
        text = prompt.render(ctx)
        self.assertIn("\nPlan templates:\n", text)
        self.assertIn(
            f'  template {shared.pk}: "Shared kick-off" (other), 2 milestones, 2 tasks', text
        )

    def test_at_most_twenty_templates(self):
        for i in range(25):
            self.template(f"Shared {i:02d}", "workspace")
        self.assertEqual(len(self.build().templates), evidence.TEMPLATE_LIMIT)

    def test_each_records_open_plans(self):
        onboarding = PlanTemplate.objects.get(is_builtin=True, kind="onboarding")
        common = {
            "organisation": self.org,
            "customer": self.pizza,
            "kind": "onboarding",
            "owner": self.csm,
            "start_date": self.today,
            "target_date": self.today,
        }
        running = Plan.objects.create(**common, template=onboarding, name="Onboarding")
        Plan.objects.create(**common, template=onboarding, name="Old", status="done")
        Plan.objects.create(**common, template=onboarding, name="Undone", status="draft")
        ctx = self.build()
        row = ctx.records[f"customer:{self.pizza.pk}"]
        line = f'    plan {running.pk}: "Onboarding", not started, from template {onboarding.pk}'
        self.assertEqual(
            row["plans"],
            [
                {
                    "id": running.pk,
                    "template_id": onboarding.pk,
                    "name": "Onboarding",
                    "line": line,
                }
            ],
        )
        self.assertIn(line, evidence.record_block(ctx, row))

    def test_the_ops_agent_reads_only_templates_the_workspace_shares(self):
        # Superseded: Ops reads templates now (builder evidence, Task 9)
        shared = self.template("Shared kick-off", "workspace")
        private = self.template("Carl's own", "private")
        ctx = self.build("ops")
        self.assertIn(shared.pk, ctx.templates)
        self.assertNotIn(private.pk, ctx.templates)
        self.assertNotIn("Carl's own", prompt.render(ctx))
