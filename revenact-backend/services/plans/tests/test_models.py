"""The plan tables: one record per plan, one open plan per record and
template, a milestone only inside its own plan, built-ins without an owner,
and the two new notification kinds."""

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError

from services.customers.models import Task
from services.notifications.models import Notification
from services.plans import models as limits
from services.plans.models import Milestone, Plan, PlanTemplate
from services.plans.tests.fixtures import PlanFixture


class PlanModelTests(PlanFixture):
    def test_the_limits_are_the_specs(self):
        self.assertEqual(
            (
                limits.MAX_MILESTONES,
                limits.MAX_TASKS,
                limits.MAX_OWNED_TEMPLATES,
                limits.MAX_SHARED,
                limits.MAX_NAME,
                limits.MAX_DESCRIPTION,
                limits.MAX_TASK_TITLE,
                limits.MAX_OFFSET,
            ),
            (12, 50, 50, 50, 120, 500, 255, 365),
        )
        self.assertEqual(limits.OPEN, ("not_started", "on_track", "at_risk"))

    def test_a_new_plan_has_not_started(self):
        plan = self.build_plan()
        self.assertEqual(
            (plan.status, plan.status_set_by, plan.at_risk_cleared_on, plan.done_at),
            ("not_started", "system", None, None),
        )
        self.assertEqual(str(plan), f"Plan {plan.pk}")
        self.assertEqual(
            [(m.name, m.position) for m in plan.milestones.all()], [("Kick-off", 0), ("Review", 1)]
        )
        self.assertEqual(str(plan.milestones.first()), f"Milestone {plan.milestones.first().pk}")
        self.assertEqual(plan.tasks.count(), 2)

    def test_a_plan_sits_on_exactly_one_record(self):
        for on in ({}, {"customer": self.pizza, "account": self.emea}):
            with self.assertRaises(IntegrityError), transaction.atomic():
                Plan.objects.create(
                    organisation=self.org,
                    name="x",
                    kind="other",
                    owner=self.csm,
                    start_date=self.today,
                    target_date=self.today,
                    **on,
                )

    def test_one_open_plan_per_record_and_template(self):
        self.build_plan(template=self.mine)
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.build_plan(template=self.mine)
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.build_plan(template=self.mine, status="at_risk")

    def test_finished_or_templateless_plans_do_not_count(self):
        self.build_plan(template=self.mine, status="done")
        self.build_plan(template=self.mine, status="cancelled")
        self.build_plan(template=None)
        self.build_plan(template=None)
        self.build_plan(template=self.mine)
        self.build_plan(self.emea, template=self.mine)
        self.assertEqual(Plan.objects.count(), 6)

    def test_deleting_a_plan_deletes_its_milestones_and_tasks(self):
        plan = self.build_plan()
        plan.delete()
        self.assertFalse(Milestone.objects.exists())
        self.assertFalse(
            Task.objects.filter(title__in=["Hold the call", "Run the review"]).exists()
        )

    def test_deleting_its_template_keeps_the_plan(self):
        template = self.make_template(name="Short-lived")
        plan = self.build_plan(template=template)
        template.delete()
        plan.refresh_from_db()
        self.assertIsNone(plan.template)

    def test_an_owner_with_plans_cannot_be_deleted(self):
        self.build_plan(owner=self.mona)
        with self.assertRaises(ProtectedError):
            self.mona.delete()


class TaskLinkTests(PlanFixture):
    def task(self, **fields):
        values = {
            "customer": self.pizza,
            "title": "x",
            "assignee_name": "x",
            "due_date": self.today,
            "priority": "low",
            **fields,
        }
        return Task(**values)

    def test_a_milestone_needs_a_plan(self):
        milestone = self.build_plan().milestones.first()
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.task(milestone=milestone).save()

    def test_full_clean_refuses_a_milestone_from_another_plan(self):
        first, second = self.build_plan(), self.build_plan(self.emea)
        task = self.task(plan=first, milestone=second.milestones.first())
        with self.assertRaises(ValidationError) as caught:
            task.full_clean()
        self.assertEqual(
            caught.exception.message_dict["milestone"],
            ["A task's milestone must be in its own plan."],
        )

    def test_a_task_without_a_plan_is_as_before(self):
        task = self.task()
        task.full_clean()
        task.save()
        self.assertEqual((task.plan, task.milestone), (None, None))


class TemplateModelTests(PlanFixture):
    def test_a_personal_template_is_private_and_owned(self):
        self.assertEqual(
            (self.mine.sharing, self.mine.is_builtin, self.mine.description),
            ("private", False, ""),
        )
        self.assertEqual(str(self.mine), f"Plan template {self.mine.pk}")

    def test_built_in_means_no_workspace_and_no_owner(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            PlanTemplate.objects.create(
                organisation=self.org, owner=self.csm, name="x", kind="other", is_builtin=True
            )
        with self.assertRaises(IntegrityError), transaction.atomic():
            PlanTemplate.objects.create(name="x", kind="other")


class NotificationKindTests(PlanFixture):
    def test_plan_started_and_plan_task_assigned_are_real_kinds(self):
        choices = dict(Notification.Kind.choices)
        self.assertEqual(
            (choices["plan_started"], choices["plan_task_assigned"]),
            ("Plan started", "Plan tasks assigned"),
        )
