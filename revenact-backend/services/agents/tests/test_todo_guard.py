"""No agent action may target a to-do (contract §1): the agents' evidence
never holds one, so a proposal naming one is dropped at validation, and an
action can never resolve to one."""

from datetime import timedelta

from services.agents import evidence
from services.agents.actions.tasks import complete_validate, redate_validate
from services.agents.kinds import Invalid
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import Task


class TodoGuardTests(AgentsFixture):
    def setUp(self):
        self.todo = Task.objects.create(
            title="Renew passport",
            assignee=self.csm,
            assignee_name=self.csm.name,
            created_by=self.csm,
            due_date=self.today - timedelta(days=1),
            priority="high",
        )
        self.ctx = evidence.build(self.org, "cs", today=self.today)
        self.row = self.ctx.records[evidence._ref("customer", self.pizza.pk)]

    def test_the_evidence_never_holds_a_to_do(self):
        self.assertNotIn(self.todo.pk, self.ctx.tasks)
        self.assertNotIn("Renew passport", str(self.ctx.records))

    def test_a_proposal_naming_a_to_do_is_dropped(self):
        payload = {
            "task_id": self.todo.pk,
            "due_date": (self.today + timedelta(days=3)).isoformat(),
        }
        for validate in (complete_validate, redate_validate):
            with self.assertRaises(Invalid):
                validate(payload, self.row, self.ctx, None)
