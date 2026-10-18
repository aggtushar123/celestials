"""Draft plans (Agents round §2, owner decision 3): a plan an agent started
goes back to Draft on undo, keeps its history and its tasks as data, and
starts again from Start plan. A Draft is not open anywhere."""

from datetime import timedelta

from django.db import connection, transaction
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.accounts.models import User
from services.customers.models import Task
from services.metrics.models import AgentAction
from services.notifications.models import Notification
from services.plans import drafting
from services.plans.models import OPEN, Milestone, Plan
from services.plans.starting import PlanOpen
from services.plans.status import lock_plan
from services.plans.tests.fixtures import PlanFixture


class DraftStatusTests(PlanFixture):
    def test_a_draft_is_not_open_and_does_not_block_its_template(self):
        self.assertNotIn(Plan.Status.DRAFT, OPEN)
        self.build_plan(template=self.mine, status="draft", draft_tasks=[{"title": "x"}])
        self.build_plan(template=self.mine, status="draft")
        open_one = self.build_plan(template=self.mine)
        self.assertEqual(open_one.status, "not_started")
        self.assertEqual(Plan.objects.filter(template=self.mine).count(), 3)

    def test_a_plan_keeps_the_action_that_started_it(self):
        action = AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="plan.start",
            customer=self.pizza,
            target=f"plan:{self.mine.pk}",
            title="Start the kick-off",
            rationale="r",
            payload={"template_id": self.mine.pk},
        )
        plan = self.build_plan(agent_action=action)
        self.assertEqual(plan.draft_tasks, [])
        self.assertEqual(list(action.plans.all()), [plan])


class ReturnToDraftTests(PlanFixture):
    def test_the_plan_stays_and_its_tasks_become_data(self):
        plan = self.build_plan(template=self.mine)
        Milestone.objects.filter(plan=plan, position=0).update(done_at=timezone.now())
        with transaction.atomic():
            drafting.return_to_draft(lock_plan(plan.pk), actor=self.mona, agent_action=91)
        plan.refresh_from_db()
        self.assertEqual(plan.status, "draft")
        self.assertFalse(Task.objects.filter(plan=plan).exists())
        self.assertEqual(plan.milestones.count(), 2)
        self.assertFalse(plan.milestones.filter(done_at__isnull=False).exists())
        kick, review = plan.milestones.order_by("position")
        self.assertEqual(
            plan.draft_tasks,
            [
                {
                    "milestone": kick.pk,
                    "title": "Hold the call",
                    "priority": "medium",
                    "due_date": (self.today + timedelta(days=7)).isoformat(),
                    "assignee": self.csm.pk,
                    "description": "",
                },
                {
                    "milestone": review.pk,
                    "title": "Run the review",
                    "priority": "medium",
                    "due_date": (self.today + timedelta(days=14)).isoformat(),
                    "assignee": self.csm.pk,
                    "description": "",
                },
            ],
        )
        self.assertEqual(
            self.events("plan.returned_to_draft"),
            [(str(plan.pk), {"tasks": 2, "agent_action": 91})],
        )

    def test_a_done_task_refuses_and_changes_nothing(self):
        plan = self.build_plan(steps=[("Kick-off", 7, [("Hold the call", self.csm, "completed")])])
        with self.assertRaises(drafting.HasDoneWork), transaction.atomic():
            drafting.return_to_draft(lock_plan(plan.pk), actor=self.mona, agent_action=None)
        plan.refresh_from_db()
        self.assertEqual(plan.status, "not_started")
        self.assertEqual(Task.objects.filter(plan=plan).count(), 1)


class StartFromDraftTests(PlanFixture):
    def draft(self, **fields):
        """A plan started five days ago, back in Draft."""
        fields.setdefault("template", self.mine)
        plan = self.build_plan(start=self.today - timedelta(days=5), **fields)
        with transaction.atomic():
            drafting.return_to_draft(lock_plan(plan.pk), actor=self.mona, agent_action=None)
        return Plan.objects.get(pk=plan.pk)

    def test_it_makes_the_tasks_again_from_today(self):
        plan = self.draft()
        started = drafting.start_from_draft(plan.pk, actor=self.mona, today=self.today)
        self.assertEqual(
            (started.status, started.start_date, started.draft_tasks),
            ("not_started", self.today, []),
        )
        tasks = list(Task.objects.filter(plan=plan).order_by("due_date"))
        self.assertEqual([t.title for t in tasks], ["Hold the call", "Run the review"])
        # Each date moves by the five days the plan sat in Draft.
        self.assertEqual(
            [t.due_date for t in tasks],
            [self.today + timedelta(days=7), self.today + timedelta(days=14)],
        )
        self.assertEqual({t.assignee for t in tasks}, {self.csm})
        self.assertEqual({t.source for t in tasks}, {"plan"})
        self.assertEqual(started.target_date, self.today + timedelta(days=14))
        self.assertEqual(
            sorted(m.due_date for m in plan.milestones.all()),
            [self.today + timedelta(days=7), self.today + timedelta(days=14)],
        )
        self.assertEqual(self.events("plan.started_from_draft"), [(str(plan.pk), {"tasks": 2})])
        self.assertTrue(
            Notification.objects.filter(recipient=self.csm, kind="plan_task_assigned").exists()
        )

    def test_a_task_goes_to_the_record_owner_then_the_plan_owner(self):
        # Dana can't open Pizza Hut: her task goes to Carl, the record's owner.
        plan = self.draft(steps=[("Kick-off", 7, [("Hold the call", self.other, "pending")])])
        drafting.start_from_draft(plan.pk, actor=self.mona, today=self.today)
        self.assertEqual(Task.objects.get(plan=plan).assignee, self.csm)
        # With Carl gone too, it goes to the plan's owner.
        mine = self.draft(
            owner=self.mona,
            name="Second",
            template=None,
            steps=[("Kick-off", 7, [("Hold the call", self.csm, "pending")])],
        )
        User.objects.filter(pk=self.csm.pk).update(is_active=False)
        drafting.start_from_draft(mine.pk, actor=self.mona, today=self.today)
        self.assertEqual(Task.objects.get(plan=mine).assignee, self.mona)

    def test_only_a_draft_starts(self):
        plan = self.build_plan(template=self.mine)
        with self.assertRaises(drafting.NotDraft):
            drafting.start_from_draft(plan.pk, actor=self.csm, today=self.today)

    def test_an_open_plan_from_the_template_blocks_it(self):
        plan = self.draft()
        other = self.build_plan(template=self.mine)
        with self.assertRaises(PlanOpen) as caught:
            drafting.start_from_draft(plan.pk, actor=self.csm, today=self.today)
        self.assertEqual(caught.exception.plan_id, other.pk)
        plan.refresh_from_db()
        self.assertEqual((plan.status, len(plan.draft_tasks)), ("draft", 2))


class StartRouteTests(PlanFixture):
    def draft(self):
        plan = self.build_plan(template=self.mine, start=self.today - timedelta(days=5))
        with transaction.atomic():
            drafting.return_to_draft(lock_plan(plan.pk), actor=self.mona, agent_action=None)
        return plan

    def start(self, user, plan):
        return self.api(user).post(f"/api/v1/plans/{plan.pk}/start/", {}, format="json")

    def test_an_editor_starts_a_draft(self):
        plan = self.draft()
        response = self.start(self.mona, plan)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual((response.data["id"], response.data["status"]), (plan.pk, "not_started"))
        self.assertEqual(Task.objects.filter(plan=plan).count(), 2)

    def test_errors_in_order(self):
        plan = self.draft()
        self.assertEqual(self.start(self.other, plan).status_code, 404)
        self.assertEqual(self.start(self.stranger, plan).status_code, 404)
        # Alice opens Pizza Hut but is not above Carl: not an editor.
        self.assertEqual(self.start(self.admin, plan).status_code, 403)
        other = self.build_plan(template=self.mine)
        response = self.start(self.csm, plan)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.data,
            {
                "code": "PLAN_OPEN",
                "plan_id": other.pk,
                "detail": "This record already has an open plan from this template.",
            },
        )
        response = self.start(self.csm, other)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.data, {"code": "NOT_DRAFT", "detail": "Only a draft plan can be started."}
        )


class DraftPayloadTests(PlanFixture):
    def started_by_the_agent(self, record=None, name="Kick-off · Pizza Hut"):
        """A plan the CS agent started (no template, so several may be open)."""
        record = record or self.pizza
        action = AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="plan.start",
            customer=record,
            target=f"plan:{self.mine.pk}",
            title="Start",
            rationale="r",
            payload={"template_id": self.mine.pk},
            status="applied",
        )
        return self.build_plan(record, agent_action=action, name=name)

    def test_a_draft_carries_its_pending_tasks_and_the_agent(self):
        plan = self.started_by_the_agent()
        with transaction.atomic():
            drafting.return_to_draft(lock_plan(plan.pk), actor=self.csm, agent_action=None)
        api = self.api(self.csm)
        page = api.get(f"/api/v1/plans/{plan.pk}/").data
        self.assertEqual(
            (page["status"], page["pending_tasks"], page["started_by_agent"]), ("draft", 2, "cs")
        )
        self.assertEqual(api.get("/api/v1/plans/").data["results"], [])
        listed = api.get("/api/v1/plans/", {"status": "draft"}).data
        self.assertEqual([row["id"] for row in listed["results"]], [plan.pk])
        self.assertEqual(listed["results"][0]["pending_tasks"], 2)
        self.assertEqual(listed["counts"]["draft"], 1)
        record = api.get(f"/api/v1/customers/{self.pizza.pk}/plans/").data["results"]
        self.assertEqual(record[0]["started_by_agent"], "cs")

    def test_an_open_plan_has_none_pending_and_no_agent(self):
        plan = self.build_plan()
        page = self.api(self.csm).get(f"/api/v1/plans/{plan.pk}/").data
        self.assertEqual((page["pending_tasks"], page["started_by_agent"]), (0, None))

    def test_the_list_reads_the_agents_once(self):
        self.started_by_the_agent()

        def count():
            with CaptureQueriesContext(connection) as queries:
                self.api(self.csm).get("/api/v1/plans/")
            return len(queries)

        few = count()
        for i in range(3):
            self.started_by_the_agent(self.dough, name=f"Kick-off {i}")
        self.assertEqual(count(), few)


class DraftEditingTests(PlanFixture):
    def setUp(self):
        self.plan = self.build_plan(template=self.mine)
        with transaction.atomic():
            drafting.return_to_draft(lock_plan(self.plan.pk), actor=self.csm, agent_action=None)
        self.carl = self.api(self.csm)
        self.url = f"/api/v1/plans/{self.plan.pk}/"

    def test_name_and_owner_change_on_a_draft(self):
        response = self.carl.patch(
            self.url, {"name": "Renamed", "owner": self.mona.pk}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual((response.data["name"], response.data["status"]), ("Renamed", "draft"))
        self.assertEqual(self.events("plan.updated")[-1][1], {"fields": ["name", "owner"]})

    def test_status_never_moves_into_or_out_of_draft_by_hand(self):
        refused = {"status": ["Start a draft plan with Start plan."]}
        response = self.carl.patch(self.url, {"status": "on_track"}, format="json")
        self.assertEqual((response.status_code, response.data), (400, refused))
        other = self.build_plan(self.dough)
        response = self.carl.patch(f"/api/v1/plans/{other.pk}/", {"status": "draft"}, format="json")
        self.assertEqual((response.status_code, response.data), (400, refused))

    def test_milestones_change_on_a_draft_and_take_their_kept_tasks_with_them(self):
        kick, review = self.plan.milestones.order_by("position")
        added = self.carl.post(
            f"{self.url}milestones/",
            {"name": "Wrap-up", "due_date": (self.today + timedelta(days=20)).isoformat()},
            format="json",
        )
        self.assertEqual(added.status_code, 201, added.data)
        renamed = self.carl.patch(
            f"{self.url}milestones/{kick.pk}/", {"name": "Start"}, format="json"
        )
        self.assertEqual(renamed.status_code, 200, renamed.data)
        done = self.carl.patch(f"{self.url}milestones/{kick.pk}/", {"done": True}, format="json")
        self.assertEqual(
            (done.status_code, done.data), (400, {"done": ["Start a draft plan with Start plan."]})
        )
        removed = self.carl.delete(f"{self.url}milestones/{review.pk}/")
        self.assertEqual(removed.status_code, 200, removed.data)
        self.plan.refresh_from_db()
        self.assertEqual([t["title"] for t in self.plan.draft_tasks], ["Hold the call"])
        self.assertEqual(removed.data["pending_tasks"], 1)

    def test_a_drafts_tasks_are_not_edited_until_it_starts(self):
        kick = self.plan.milestones.order_by("position").first()
        response = self.carl.post(
            f"{self.url}tasks/",
            {
                "milestone": kick.pk,
                "title": "Extra",
                "priority": "low",
                "due_date": self.today.isoformat(),
                "assignee": self.csm.pk,
            },
            format="json",
        )
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"non_field_errors": ["Start a draft plan with Start plan."]}),
        )

    def test_a_draft_is_deleted(self):
        self.assertEqual(self.carl.delete(self.url).status_code, 204)
        self.assertFalse(Plan.objects.filter(pk=self.plan.pk).exists())
