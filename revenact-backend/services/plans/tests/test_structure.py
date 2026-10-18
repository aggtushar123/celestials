"""A plan's milestones and tasks: editors add, rename, re-date, reorder,
mark done or undone and remove; dates stay within a year of the start; at
most 12 milestones and 50 tasks; a task's assignee, creator and the plan's
editors tick it; a task the caller cannot see is 404; every change audited
by id; a finished plan's structure is read-only."""

from datetime import timedelta
from unittest.mock import patch

from services.customers.models import Task
from services.plans import status as plan_status
from services.plans import validation as say
from services.plans.access import NOT_CHECKER, NOT_EDITOR
from services.plans.models import Milestone, Plan
from services.plans.tests.fixtures import PlanFixture, iso

URL = "/api/v1/plans/"


class StructureFixture(PlanFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.plan = cls.build_plan()
        cls.kickoff = cls.plan.milestones.get(name="Kick-off")
        cls.review = cls.plan.milestones.get(name="Review")

    def call(self, method, path, user=None, **body):
        client = self.api(user or self.csm)
        return getattr(client, method)(f"{URL}{self.plan.pk}/{path}", body, format="json")

    def day(self, days):
        return iso(self.today + timedelta(days=days))

    def fresh(self):
        return Plan.objects.get(pk=self.plan.pk)

    def hidden_task(self, milestone, *, status="pending"):
        """Alice's own task: Carl and Mona cannot see it, only count it."""
        return Task.objects.create(
            customer=self.pizza,
            plan=self.plan,
            milestone=milestone,
            title="Alice's",
            assignee=self.admin,
            assignee_name="Alice Admin",
            created_by=self.admin,
            due_date=self.today,
            priority="low",
            status=status,
        )

    def titles(self, response):
        return [t["title"] for m in response.data["milestones"] for t in m["tasks"]]

    def before_the_lock(self, change):
        """`lock_plan` in the views, with `change()` run just before it: a
        concurrent request that got there first."""
        real = plan_status.lock_plan

        def first_change(pk):
            change()
            return real(pk)

        return patch("services.plans.views.lock_plan", side_effect=first_change)

    def extra_task(self, milestone, *, status="completed", title="Extra"):
        """A second task under `milestone`, nobody's (visible to everyone),
        so a milestone can hold one finished and one unfinished task."""
        return Task.objects.create(
            customer=self.pizza,
            plan=self.plan,
            milestone=milestone,
            title=title,
            assignee_name="",
            due_date=self.today,
            priority="low",
            status=status,
        )


class MilestoneTests(StructureFixture):
    def test_add_one_at_the_end(self):
        response = self.call("post", "milestones/", name="Wrap-up", due_date=self.day(30))
        self.assertEqual(response.status_code, 201, response.content)
        names = [(m["name"], m["position"]) for m in response.data["milestones"]]
        self.assertEqual(names, [("Kick-off", 0), ("Review", 1), ("Wrap-up", 2)])
        self.assertEqual(response.data["target_date"], self.day(30))
        added = Milestone.objects.get(name="Wrap-up")
        self.assertEqual(
            self.events("plan.milestone_changed"),
            [(str(self.plan.pk), {"milestone": added.pk, "change": "added"})],
        )

    def test_dates_stay_within_a_year_of_the_start(self):
        for due in (self.day(-1), self.day(366)):
            response = self.call("post", "milestones/", name="x", due_date=due)
            self.assertEqual(
                (response.status_code, response.data), (400, {"due_date": [say.DATE_RANGE]})
            )
        response = self.call("post", "milestones/", name="", due_date=self.day(3))
        self.assertEqual((response.status_code, response.data), (400, {"name": [say.CHOOSE_NAME]}))

    def test_at_most_twelve(self):
        Milestone.objects.bulk_create(
            [
                Milestone(plan=self.plan, name=f"M{i}", position=2 + i, due_date=self.today)
                for i in range(10)
            ]
        )
        response = self.call("post", "milestones/", name="13th", due_date=self.day(3))
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"non_field_errors": [say.TOO_MANY_MILESTONES]}),
        )

    def test_only_editors_while_open(self):
        response = self.call("post", "milestones/", user=self.admin, name="x", due_date=self.day(3))
        self.assertEqual((response.status_code, response.data), (403, {"detail": NOT_EDITOR}))
        Plan.objects.filter(pk=self.plan.pk).update(status="done")
        response = self.call("post", "milestones/", name="x", due_date=self.day(3))
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"non_field_errors": [say.PLAN_FINISHED]}),
        )

    def test_rename_and_redate_move_the_target(self):
        response = self.call(
            "patch", f"milestones/{self.review.pk}/", name="Final review", due_date=self.day(40)
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            (response.data["milestones"][1]["name"], response.data["target_date"]),
            ("Final review", self.day(40)),
        )
        self.assertEqual(
            self.events("plan.milestone_changed"),
            [
                (
                    str(self.plan.pk),
                    {
                        "milestone": self.review.pk,
                        "change": "edited",
                        "fields": ["due_date", "name"],
                    },
                )
            ],
        )

    def test_renaming_and_marking_done_together_is_one_audit_event(self):
        """F9: a rename/re-date and done/undone in the same PATCH audit as a
        single event carrying both the changed fields and `done`, not just
        `{"change": "done"}`."""
        response = self.call(
            "patch",
            f"milestones/{self.kickoff.pk}/",
            name="Launch",
            due_date=self.day(10),
            done=True,
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            self.events("plan.milestone_changed"),
            [
                (
                    str(self.plan.pk),
                    {
                        "milestone": self.kickoff.pk,
                        "change": "edited",
                        "fields": ["due_date", "name"],
                        "done": True,
                    },
                )
            ],
        )

    def test_marked_done_by_hand_puts_the_plan_on_track(self):
        response = self.call("patch", f"milestones/{self.kickoff.pk}/", done=True)
        self.assertIsNotNone(response.data["milestones"][0]["done_at"])
        self.assertEqual(response.data["status"], "on_track")
        self.assertEqual(Milestone.objects.get(pk=self.kickoff.pk).done_by, self.csm)
        self.assertEqual(
            self.events("plan.milestone_changed"),
            [(str(self.plan.pk), {"milestone": self.kickoff.pk, "change": "done"})],
        )

    def test_the_last_one_marked_done_finishes_the_plan(self):
        self.call("patch", f"milestones/{self.kickoff.pk}/", done=True)
        response = self.call("patch", f"milestones/{self.review.pk}/", done=True)
        self.assertEqual(response.data["status"], "done")

    def test_marked_undone(self):
        self.call("patch", f"milestones/{self.kickoff.pk}/", done=True)
        response = self.call("patch", f"milestones/{self.kickoff.pk}/", done=False)
        self.assertIsNone(response.data["milestones"][0]["done_at"])
        self.assertEqual(response.data["status"], "on_track")

    def test_remove_takes_its_tasks_and_closes_the_gap(self):
        response = self.call("delete", f"milestones/{self.kickoff.pk}/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            [(m["name"], m["position"]) for m in response.data["milestones"]], [("Review", 0)]
        )
        self.assertFalse(Task.objects.filter(title="Hold the call").exists())
        self.assertEqual(
            self.events("plan.milestone_changed"),
            [
                (
                    str(self.plan.pk),
                    {"milestone": self.kickoff.pk, "change": "removed", "tasks": 1},
                )
            ],
        )

    def test_the_removal_counts_hidden_tasks_too(self):
        self.hidden_task(self.kickoff)
        response = self.call("delete", f"milestones/{self.kickoff.pk}/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertNotIn("Alice's", self.titles(response))
        self.assertEqual([meta["tasks"] for _, meta in self.events("plan.milestone_changed")], [2])

    def test_a_milestone_with_completed_work_stays(self):
        self.extra_task(self.kickoff)
        response = self.call("delete", f"milestones/{self.kickoff.pk}/")
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"non_field_errors": [say.MILESTONE_HAS_DONE_WORK]}),
        )
        self.assertTrue(Milestone.objects.filter(pk=self.kickoff.pk).exists())
        self.assertEqual(self.events("plan.milestone_changed"), [])

    def test_hidden_completed_work_counts_too(self):
        self.hidden_task(self.kickoff, status="completed")
        response = self.call("delete", f"milestones/{self.kickoff.pk}/")
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"non_field_errors": [say.MILESTONE_HAS_DONE_WORK]}),
        )

    def test_removing_the_open_one_left_finishes_the_plan(self):
        self.call("patch", f"milestones/{self.review.pk}/", done=True)
        response = self.call("delete", f"milestones/{self.kickoff.pk}/")
        self.assertEqual(response.data["status"], "done")

    def test_the_last_milestone_stays(self):
        self.call("delete", f"milestones/{self.kickoff.pk}/")
        response = self.call("delete", f"milestones/{self.review.pk}/")
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"non_field_errors": [say.LAST_MILESTONE]}),
        )

    def test_a_milestone_of_another_plan_is_404(self):
        other = self.build_plan(self.emea).milestones.first()
        self.assertEqual(self.call("patch", f"milestones/{other.pk}/", name="x").status_code, 404)

    def test_reorder(self):
        response = self.call("post", "milestones/reorder/", order=[self.review.pk, self.kickoff.pk])
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual([m["name"] for m in response.data["milestones"]], ["Review", "Kick-off"])
        self.assertEqual(
            self.events("plan.milestone_changed"),
            [
                (
                    str(self.plan.pk),
                    {
                        "milestone": None,
                        "change": "reordered",
                        "order": [self.review.pk, self.kickoff.pk],
                    },
                )
            ],
        )

    def test_reorder_never_shows_hidden_tasks(self):
        self.hidden_task(self.review)
        response = self.call("post", "milestones/reorder/", order=[self.review.pk, self.kickoff.pk])
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.titles(response), ["Run the review", "Hold the call"])
        self.assertEqual(response.data["milestones"][0]["hidden_tasks"], 1)

    def test_reorder_lists_every_milestone_once(self):
        for order in (
            [self.review.pk],
            [self.review.pk, self.review.pk],
            [self.review.pk, 999999],
            "x",
        ):
            response = self.call("post", "milestones/reorder/", order=order)
            self.assertEqual(
                (response.status_code, response.data), (400, {"order": [say.REORDER]}), order
            )


class TaskTests(StructureFixture):
    def body(self, **fields):
        return {
            "milestone": self.kickoff.pk,
            "title": "Send the deck",
            "priority": "high",
            "due_date": self.day(5),
            "assignee": self.mona.pk,
            **fields,
        }

    def test_add_a_task_and_tell_its_assignee(self):
        response = self.call("post", "tasks/", **self.body())
        self.assertEqual(response.status_code, 201, response.content)
        task = Task.objects.get(title="Send the deck")
        self.assertEqual(
            (
                task.plan,
                task.milestone,
                task.customer,
                task.created_by,
                task.assignee,
                task.assignee_name,
            ),
            (self.plan, self.kickoff, self.pizza, self.csm, self.mona, "Mona Manager"),
        )
        self.assertEqual(
            self.notes("plan_task_assigned"),
            [
                (
                    self.mona.pk,
                    "1 task on Kick-off · Pizza Hut was assigned to you.",
                    f"/projects/{self.plan.pk}",
                )
            ],
        )
        self.assertEqual(
            self.events("plan.task_changed"),
            [(str(self.plan.pk), {"task": task.pk, "change": "added"})],
        )

    def test_assigning_yourself_tells_nobody(self):
        self.call("post", "tasks/", **self.body(assignee=self.csm.pk))
        self.assertEqual(self.notes("plan_task_assigned"), [])

    def test_a_task_needs_a_milestone(self):
        body = self.body()
        del body["milestone"]
        response = self.call("post", "tasks/", **body)
        self.assertEqual(
            (response.status_code, response.data), (400, {"milestone": [say.CHOOSE_MILESTONE]})
        )

    def test_a_task_is_checked_where_it_is_wrong(self):
        cases = [
            ({"assignee": self.other.pk}, {"assignee": [say.CANT_OPEN]}),
            (
                {"milestone": self.build_plan(self.emea).milestones.first().pk},
                {"milestone": [say.CHOOSE_MILESTONE]},
            ),
            ({"title": ""}, {"title": [say.NO_TITLE]}),
            ({"priority": "urgent"}, {"priority": [say.CHOOSE_PRIORITY]}),
            ({"due_date": self.day(400)}, {"due_date": [say.DATE_RANGE]}),
        ]
        for fields, errors in cases:
            response = self.call("post", "tasks/", **self.body(**fields))
            self.assertEqual((response.status_code, response.data), (400, errors), fields)

    def test_at_most_fifty_tasks(self):
        Task.objects.bulk_create(
            [
                Task(
                    customer=self.pizza,
                    plan=self.plan,
                    milestone=self.kickoff,
                    title=f"T{i}",
                    assignee_name="",
                    due_date=self.today,
                    priority="low",
                )
                for i in range(48)
            ]
        )
        response = self.call("post", "tasks/", **self.body())
        self.assertEqual(
            (response.status_code, response.data), (400, {"non_field_errors": [say.TOO_MANY_TASKS]})
        )

    def test_a_new_task_reopens_a_milestone_its_tasks_completed(self):
        call = self.plan.tasks.get(title="Hold the call")
        self.call("patch", f"tasks/{call.pk}/", status="completed")
        self.assertIsNotNone(Milestone.objects.get(pk=self.kickoff.pk).done_at)
        self.call("post", "tasks/", **self.body())
        self.assertIsNone(Milestone.objects.get(pk=self.kickoff.pk).done_at)

    def test_an_editor_edits_and_reassigns(self):
        call = self.plan.tasks.get(title="Hold the call")
        response = self.call(
            "patch", f"tasks/{call.pk}/", title="Hold the big call", assignee=self.mona.pk
        )
        self.assertEqual(response.status_code, 200, response.content)
        call.refresh_from_db()
        self.assertEqual(
            (call.title, call.assignee, call.assignee_name),
            ("Hold the big call", self.mona, "Mona Manager"),
        )
        self.assertEqual(len(self.notes("plan_task_assigned")), 1)
        self.assertEqual(
            self.events("plan.task_changed"),
            [
                (
                    str(self.plan.pk),
                    {"task": call.pk, "change": "edited", "fields": ["assignee", "title"]},
                )
            ],
        )

    def test_reassigning_a_task_to_yourself_tells_nobody(self):
        call = self.plan.tasks.get(title="Hold the call")
        Task.objects.filter(pk=call.pk).update(assignee=self.mona, assignee_name="Mona Manager")
        response = self.call("patch", f"tasks/{call.pk}/", assignee=self.csm.pk)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(Task.objects.get(pk=call.pk).assignee, self.csm)
        self.assertEqual(self.notes("plan_task_assigned"), [])

    def test_a_task_deleted_before_the_lock_is_404(self):
        call = self.plan.tasks.get(title="Hold the call")
        with self.before_the_lock(lambda: Task.objects.filter(pk=call.pk).delete()):
            response = self.call("patch", f"tasks/{call.pk}/", status="completed")
        self.assertEqual(response.status_code, 404, response.content)
        review = self.plan.tasks.get(title="Run the review")
        with self.before_the_lock(lambda: Task.objects.filter(pk=review.pk).delete()):
            response = self.call("delete", f"tasks/{review.pk}/")
        self.assertEqual(response.status_code, 404, response.content)
        self.assertEqual([meta["change"] for _, meta in self.events("plan.task_changed")], [])

    def test_a_patch_reads_the_task_again_under_the_lock(self):
        """Moved to Review by someone else first: ticking it finishes Review
        (whose other task is done), not the Kick-off it left."""
        call = self.plan.tasks.get(title="Hold the call")
        self.plan.tasks.filter(title="Run the review").update(status="completed")
        moved = lambda: Task.objects.filter(pk=call.pk).update(milestone=self.review)  # noqa: E731
        with self.before_the_lock(moved):
            response = self.call("patch", f"tasks/{call.pk}/", status="completed")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIsNotNone(Milestone.objects.get(pk=self.review.pk).done_at)
        self.assertEqual(response.data["status"], "on_track")

    def test_a_delete_reads_the_milestone_again_under_the_lock(self):
        """Moved to Review by someone else first: removing it leaves Review's
        other, completed task, so Review is done, not the Kick-off it left."""
        call = self.plan.tasks.get(title="Hold the call")
        self.plan.tasks.filter(title="Run the review").update(status="completed")
        moved = lambda: Task.objects.filter(pk=call.pk).update(milestone=self.review)  # noqa: E731
        with self.before_the_lock(moved):
            response = self.call("delete", f"tasks/{call.pk}/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIsNotNone(Milestone.objects.get(pk=self.review.pk).done_at)
        self.assertEqual(response.data["status"], "on_track")

    def test_moving_a_task_moves_both_milestones(self):
        call = self.plan.tasks.get(title="Hold the call")
        review = self.plan.tasks.get(title="Run the review")
        self.call("patch", f"tasks/{review.pk}/", status="completed")
        self.assertIsNotNone(Milestone.objects.get(pk=self.review.pk).done_at)
        self.call("patch", f"tasks/{call.pk}/", milestone=self.review.pk)
        self.assertIsNone(Milestone.objects.get(pk=self.review.pk).done_at)

    def test_moving_the_last_unfinished_task_away_finishes_its_milestone_and_progresses_the_plan(
        self,
    ):
        """F10: the task itself never turns `completed` here — moving it off
        Kick-off is what leaves Kick-off's only remaining task done, so the
        plan must still move from `not_started` to `on_track`."""
        self.extra_task(self.kickoff)
        call = self.plan.tasks.get(title="Hold the call")
        self.assertEqual(self.fresh().status, "not_started")
        response = self.call("patch", f"tasks/{call.pk}/", milestone=self.review.pk)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIsNotNone(Milestone.objects.get(pk=self.kickoff.pk).done_at)
        self.assertEqual(response.data["status"], "on_track")

    def test_deleting_the_last_unfinished_task_finishes_its_milestone_and_progresses_the_plan(self):
        """F10: same as above, through the DELETE route."""
        self.extra_task(self.kickoff)
        call = self.plan.tasks.get(title="Hold the call")
        self.assertEqual(self.fresh().status, "not_started")
        response = self.call("delete", f"tasks/{call.pk}/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIsNotNone(Milestone.objects.get(pk=self.kickoff.pk).done_at)
        self.assertEqual(response.data["status"], "on_track")

    def test_the_assignee_ticks_but_does_not_edit(self):
        secret = Task.objects.create(
            customer=self.pizza,
            plan=self.plan,
            milestone=self.review,
            title="Alice's",
            assignee=self.admin,
            assignee_name="Alice Admin",
            created_by=self.admin,
            due_date=self.today,
            priority="low",
        )
        response = self.call("patch", f"tasks/{secret.pk}/", user=self.admin, status="completed")
        self.assertEqual(response.status_code, 200, response.content)
        response = self.call("patch", f"tasks/{secret.pk}/", user=self.admin, title="Mine")
        self.assertEqual((response.status_code, response.data), (403, {"detail": NOT_EDITOR}))
        self.assertEqual(
            self.call("patch", f"tasks/{secret.pk}/", status="pending").status_code, 404
        )
        self.assertEqual(
            self.call("delete", f"tasks/{secret.pk}/", user=self.mona).status_code, 404
        )

    def test_a_reader_who_is_neither_cannot_tick(self):
        call = self.plan.tasks.get(title="Hold the call")
        Task.objects.filter(pk=call.pk).update(assignee=None, created_by=None)
        response = self.call("patch", f"tasks/{call.pk}/", user=self.admin, status="completed")
        self.assertEqual((response.status_code, response.data), (403, {"detail": NOT_CHECKER}))

    def test_ticking_on_a_finished_plan_changes_only_the_task(self):
        Plan.objects.filter(pk=self.plan.pk).update(status="cancelled")
        call = self.plan.tasks.get(title="Hold the call")
        self.assertEqual(
            self.call("patch", f"tasks/{call.pk}/", status="completed").status_code, 200
        )
        self.assertEqual(
            (self.fresh().status, Milestone.objects.get(pk=self.kickoff.pk).done_at),
            ("cancelled", None),
        )
        response = self.call("patch", f"tasks/{call.pk}/", title="x")
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"non_field_errors": [say.PLAN_FINISHED]}),
        )

    def test_ticking_on_a_done_plan_changes_only_the_task(self):
        self.plan.milestones.update(done_at=self.now)
        self.plan.tasks.update(status="completed")
        Plan.objects.filter(pk=self.plan.pk).update(status="done", done_at=self.now)
        call = self.plan.tasks.get(title="Hold the call")
        response = self.call("patch", f"tasks/{call.pk}/", status="pending")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(Task.objects.get(pk=call.pk).status, "pending")
        self.assertEqual(self.fresh().status, "done")
        self.assertIsNotNone(Milestone.objects.get(pk=self.kickoff.pk).done_at)
        self.assertEqual(self.events("plan.status_changed"), [])

    def test_deleting_never_shows_hidden_tasks(self):
        self.hidden_task(self.kickoff)
        call = self.plan.tasks.get(title="Hold the call")
        response = self.call("delete", f"tasks/{call.pk}/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.titles(response), ["Run the review"])
        self.assertEqual(response.data["milestones"][0]["hidden_tasks"], 1)

    def test_remove_a_task(self):
        call = self.plan.tasks.get(title="Hold the call")
        response = self.call("delete", f"tasks/{call.pk}/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["milestones"][0]["tasks"], [])
        self.assertEqual(
            self.events("plan.task_changed"),
            [(str(self.plan.pk), {"task": call.pk, "change": "removed"})],
        )


class BodyTests(StructureFixture):
    """A JSON array where an object belongs is a 400 with the UI's words on
    every write route, never a 500."""

    def test_an_array_body_is_refused(self):
        task = self.plan.tasks.get(title="Hold the call")
        routes = [
            ("post", f"{URL}templates/"),
            ("patch", f"{URL}templates/{self.mine.pk}/"),
            ("post", f"{URL}{self.plan.pk}/save-as-template/"),
            ("post", URL),
            ("patch", f"{URL}{self.plan.pk}/"),
            ("post", f"{URL}{self.plan.pk}/milestones/"),
            ("patch", f"{URL}{self.plan.pk}/milestones/{self.kickoff.pk}/"),
            ("post", f"{URL}{self.plan.pk}/milestones/reorder/"),
            ("post", f"{URL}{self.plan.pk}/tasks/"),
            ("patch", f"{URL}{self.plan.pk}/tasks/{task.pk}/"),
        ]
        client = self.api(self.csm)
        for method, url in routes:
            for body in ([{"name": "x", "order": [1]}], ["name"], []):
                response = getattr(client, method)(url, body, format="json")
                self.assertEqual(
                    (response.status_code, response.data),
                    (400, {"non_field_errors": [say.SEND_AN_OBJECT]}),
                    (method, url, body),
                )
