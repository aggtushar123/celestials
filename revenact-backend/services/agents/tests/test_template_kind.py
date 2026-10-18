"""plan.template (contract): a whole template, at most 4 milestones and 12
tasks; applied, the approver's and shared with the workspace; undo while
unedited, unstarted and unused."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from core.models import AuditEvent
from services.agents.actions import templates
from services.agents.kinds import ChangedSince, Invalid, OwnerLimit
from services.agents.tests.builder_fixtures import builder_action
from services.agents.tests.fixtures import AgentsFixture
from services.metrics.models import AgentAction
from services.plans.models import Plan, PlanTemplate
from services.rules.models import Rule

WRITE = templates.WRITE
TASK = {"title": "Call the champion", "priority": "high", "offset_days": 2}


def template(**fields):
    return {
        "kind": "save",
        "name": "Save at-risk renewals",
        "description": "Poor health close to renewal.",
        "milestones": [
            {"name": "Diagnose", "offset_days": 0, "tasks": [TASK, TASK]},
            {"name": "Recover", "offset_days": 14, "tasks": [TASK]},
        ],
        **fields,
    }


class TemplateKindTests(AgentsFixture):
    def validate(self, **fields):
        return WRITE.validate(template(**fields), None, None, [])

    def applied(self):
        action = builder_action(self.org, "plan.template", self.validate())
        action.after, action.result = WRITE.apply(action, self.admin)
        action.status = "applied"
        action.save(update_fields=["after", "result", "status"])
        return action

    def undo(self, action):
        with transaction.atomic():
            WRITE.undo(action, self.lee)

    def test_the_kind_validate_and_preview(self):
        self.assertEqual(
            (WRITE.label, WRITE.max_level, WRITE.agents),
            ("Write a plan template", "ask", ("ops",)),
        )
        self.assertTrue(WRITE.workspace_level and WRITE.builder)
        clean = self.validate()
        self.assertEqual(clean["milestones"][0]["tasks"][0]["assignee_role"], "record_owner")
        self.assertEqual(WRITE.target(clean), "template:save at-risk renewals")
        self.assertIn("Call the champion", WRITE.texts(clean))
        self.assertIn("Recover", WRITE.texts(clean))
        action = builder_action(self.org, "plan.template", clean)
        self.assertEqual(
            WRITE.preview(action),
            {
                "template": {
                    "kind": "save",
                    "name": "Save at-risk renewals",
                    "milestones": 2,
                    "tasks": 3,
                }
            },
        )

    def test_what_is_refused(self):
        one = {"name": "M", "offset_days": 0, "tasks": [TASK]}
        for fields in (
            {"kind": "rescue"},
            {"name": ""},
            {"description": "x" * 501},
            {"milestones": []},
            {"milestones": [one] * 5},
            {"milestones": [{"name": "M", "offset_days": 0, "tasks": [TASK] * 13}]},
            {"milestones": [{"name": "M", "offset_days": 400, "tasks": []}]},
            {
                "milestones": [
                    {"name": "M", "offset_days": 0, "tasks": [{**TASK, "assignee_role": "ceo"}]}
                ]
            },
        ):
            with self.subTest(fields=fields), self.assertRaises(Invalid):
                self.validate(**fields)

    def test_apply_shares_it_with_the_workspace_as_the_approvers(self):
        action = self.applied()
        made = PlanTemplate.objects.get(pk=action.result["template_id"])
        self.assertEqual(
            (made.owner, made.sharing, made.agent_action, made.kind),
            (self.admin, "workspace", action, "save"),
        )
        self.assertEqual(action.after["updated_at"], made.updated_at.isoformat())
        created = AuditEvent.objects.get(action="plan_template.created")
        self.assertEqual(
            (created.actor, created.metadata),
            (self.admin, {"kind": "save", "milestones": 2, "tasks": 3, "agent_action": action.pk}),
        )
        self.assertTrue(AuditEvent.objects.filter(action="plan_template.shared").exists())

    def test_past_fifty_templates_it_is_an_owner_limit(self):
        PlanTemplate.objects.bulk_create(
            PlanTemplate(organisation=self.org, owner=self.admin, name=f"T{i}", kind="other")
            for i in range(50)
        )
        action = builder_action(self.org, "plan.template", self.validate())
        with self.assertRaises(OwnerLimit) as caught, transaction.atomic():
            WRITE.apply(action, self.admin)
        self.assertEqual(caught.exception.detail, "You already own 50 plan templates.")

    def test_undo_deletes_it(self):
        action = self.applied()
        self.undo(action)
        self.assertFalse(PlanTemplate.objects.filter(pk=action.result["template_id"]).exists())
        self.assertEqual(AuditEvent.objects.get(action="plan_template.deleted").actor, self.lee)

    def test_undo_refuses_with_the_contracts_sentences(self):
        action = self.applied()
        made = PlanTemplate.objects.get(pk=action.result["template_id"])

        def refused():
            with self.assertRaises(ChangedSince) as caught:
                self.undo(action)
            return caught.exception.detail

        start = builder_action(
            self.org,
            "plan.start",
            {"template_id": made.pk},
            record=self.pizza,
            agent="cs",
            target=f"plan:{made.pk}",
        )
        self.assertEqual(refused(), "A scenario or a plan start uses this template now.")
        AgentAction.objects.filter(pk=start.pk).update(status="rejected")
        Rule.objects.create(
            organisation=self.org,
            owner=self.admin,
            name="R",
            trigger="entered",
            actions=[{"action": "plan", "template": made.pk}],
        )
        self.assertEqual(refused(), "A scenario or a plan start uses this template now.")
        Rule.objects.all().delete()
        Plan.objects.create(
            organisation=self.org,
            customer=self.pizza,
            template=made,
            name="Save",
            kind="save",
            owner=self.csm,
            start_date=self.today,
            target_date=self.today,
        )
        self.assertEqual(refused(), "Plans have been started from this template.")
        later = timezone.now() + timedelta(minutes=1)
        PlanTemplate.objects.filter(pk=made.pk).update(updated_at=later)
        self.assertEqual(refused(), "This plan template has been edited since.")
        PlanTemplate.objects.filter(pk=made.pk).delete()
        self.assertEqual(refused(), "This plan template has been deleted.")
