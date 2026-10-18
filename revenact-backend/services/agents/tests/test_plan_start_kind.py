"""plan.start (contract): only a listed template with no open plan on the
record; applied by a person, it starts the plan for the record's owner and
keeps the action on it; undo takes it back to Draft, never deletes it."""

from django.db import transaction

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.agents import evidence
from services.agents.actions import plan_starts
from services.agents.kinds import ChangedSince, Invalid, Stale
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import Task
from services.metrics.models import AgentAction
from services.plans.models import Plan, PlanTemplate


class PlanStartKindTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.onboarding = PlanTemplate.objects.get(is_builtin=True, kind="onboarding")
        cls.ref = f"customer:{cls.pizza.pk}"

    def ctx(self):
        return evidence.build(Organisation.objects.get(pk=self.org.pk), "cs", today=self.today)

    def validate(self, payload):
        ctx = self.ctx()
        return plan_starts.START.validate(payload, ctx.records[self.ref], ctx, [])

    def action(self, **fields):
        """A proposed plan.start on Pizza Hut, its payload as `validate` leaves it."""
        milestones = self.onboarding.milestones
        payload = {
            "template_id": self.onboarding.pk,
            "template": self.onboarding.name,
            "milestones": len(milestones),
            "tasks": sum(len(m["tasks"]) for m in milestones),
        }
        fields = {"target": plan_starts.START.target(payload), **fields}
        return AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="plan.start",
            customer=self.pizza,
            title="Start the Onboarding plan on Pizza Hut",
            rationale="It has just signed.",
            payload=payload,
            **fields,
        )

    def test_a_listed_template_validates_and_caches_what_it_shows(self):
        payload = self.validate({"template_id": self.onboarding.pk})
        milestones = len(self.onboarding.milestones)
        tasks = sum(len(m["tasks"]) for m in self.onboarding.milestones)
        self.assertEqual(
            payload,
            {
                "template_id": self.onboarding.pk,
                "template": self.onboarding.name,
                "milestones": milestones,
                "tasks": tasks,
            },
        )
        self.assertEqual(plan_starts.START.target(payload), f"plan:{self.onboarding.pk}")
        action = self.action()
        self.assertEqual(
            plan_starts.START.preview(action),
            {"plan": {"template": self.onboarding.name, "milestones": milestones, "tasks": tasks}},
        )
        self.assertIsNone(plan_starts.START.current(action))

    def test_an_unlisted_template_or_one_already_running_is_dropped(self):
        private = PlanTemplate.objects.create(
            organisation=self.org,
            owner=self.csm,
            name="Carl's own",
            kind="other",
            milestones=self.onboarding.milestones,
        )
        with self.assertRaises(Invalid):
            self.validate({"template_id": private.pk})
        with self.assertRaises(Invalid):
            self.validate({"template_id": "4"})
        self.action().delete()
        Plan.objects.create(
            organisation=self.org,
            customer=self.pizza,
            template=self.onboarding,
            name="Onboarding",
            kind="onboarding",
            owner=self.csm,
            start_date=self.today,
            target_date=self.today,
        )
        with self.assertRaises(Invalid):
            self.validate({"template_id": self.onboarding.pk})

    def test_apply_starts_it_for_the_record_owner_and_keeps_the_action(self):
        action = self.action()
        after, result = plan_starts.START.apply(action, self.mona)
        plan = Plan.objects.get(pk=after)
        self.assertEqual(result, {"plan_id": plan.pk})
        self.assertEqual(
            (plan.customer, plan.owner, plan.started_by, plan.agent_action, plan.start_date),
            (self.pizza, self.csm, self.mona, action, self.today),
        )
        self.assertTrue(Task.objects.filter(plan=plan).exists())
        self.assertTrue(AuditEvent.objects.filter(action="plan.started").exists())

    def test_apply_refuses_without_a_person_an_open_plan_or_a_shared_template(self):
        action = self.action()
        with self.assertRaises(Stale):
            plan_starts.START.apply(action, None)
        plan_starts.START.apply(action, self.mona)
        with self.assertRaises(Stale):
            plan_starts.START.apply(self.action(target="plan:again"), self.mona)
        shared = PlanTemplate.objects.create(
            organisation=self.org,
            owner=self.csm,
            name="Shared",
            kind="other",
            milestones=self.onboarding.milestones,
            sharing="workspace",
        )
        later = self.action(target="plan:shared")
        later.payload = {**later.payload, "template_id": shared.pk}
        PlanTemplate.objects.filter(pk=shared.pk).update(sharing="private")
        with self.assertRaises(Stale):
            plan_starts.START.apply(later, self.mona)

    def test_undo_returns_the_plan_to_draft(self):
        action = self.action()
        action.after, action.result = plan_starts.START.apply(action, self.mona)
        with transaction.atomic():
            plan_starts.START.undo(action, self.mona)
        plan = Plan.objects.get(pk=action.after)
        self.assertEqual(plan.status, "draft")
        self.assertFalse(Task.objects.filter(plan=plan).exists())
        self.assertTrue(plan.draft_tasks)
        event = AuditEvent.objects.get(action="plan.returned_to_draft")
        self.assertEqual(
            event.metadata, {"tasks": len(plan.draft_tasks), "agent_action": action.pk}
        )

    def test_undo_refuses_with_the_contracts_sentences(self):
        action = self.action()
        action.after, action.result = plan_starts.START.apply(action, self.mona)
        Task.objects.filter(plan_id=action.after).update(status="completed")
        with self.assertRaises(ChangedSince) as caught, transaction.atomic():
            plan_starts.START.undo(action, self.mona)
        self.assertEqual(
            caught.exception.detail, "Work on this plan has been done: it can't go back to draft."
        )
        Plan.objects.filter(pk=action.after).update(status="cancelled")
        with self.assertRaises(ChangedSince) as caught, transaction.atomic():
            plan_starts.START.undo(action, self.mona)
        self.assertEqual(caught.exception.detail, "This plan has been finished or cancelled.")
        Plan.objects.filter(pk=action.after).delete()
        with self.assertRaises(ChangedSince) as caught, transaction.atomic():
            plan_starts.START.undo(action, self.mona)
        self.assertEqual(caught.exception.detail, "This plan has been deleted.")
