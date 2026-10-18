"""The task kinds (spec §1.3): create, reassign, redate, complete, snooze.
Plan tasks are never in the evidence; each change writes the task's own
events; undo restores only what is still as the action left it."""

from datetime import timedelta

from services.agents.actions import tasks
from services.agents.evidence import Context
from services.agents.kinds import ChangedSince, Invalid, Stale
from services.agents.tests.fixtures import AgentsFixture
from services.agents.tests.test_record_kinds import row_for
from services.customers.models import Account, Task, TaskEvent
from services.metrics.models import AgentAction
from services.notifications.models import Notification
from services.plans.models import Plan


class TaskKindsTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.call = Task.objects.create(
            customer=cls.pizza,
            title="Call Pizza Hut",
            assignee=cls.csm,
            assignee_name=cls.csm.name,
            created_by=cls.csm,
            due_date=cls.today + timedelta(days=2),
            priority="high",
        )

    def ctx(self):
        members = {u.pk: {"id": u.pk, "name": u.name} for u in (self.csm, self.mona, self.other)}
        tasks_ = {
            self.call.pk: {
                "id": self.call.pk,
                "record": f"customer:{self.pizza.pk}",
                "title": self.call.title,
                "assignee_id": self.csm.pk,
                "due_date": self.call.due_date.isoformat(),
                "status": "pending",
            }
        }
        return Context(self.org, "cs", self.today, members=members, tasks=tasks_)

    def action(self, kind, payload, *, before=None, evidence=()):
        return AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind=kind,
            customer=self.pizza,
            target=f"{kind}:{AgentAction.objects.count()}",
            title="t",
            rationale="r",
            evidence=list(evidence),
            payload=payload,
            before=before,
        )

    def test_a_gone_tasks_preview_has_no_id(self):
        action = self.action(
            "task.redate",
            {"task_id": self.call.pk, "due_date": self.today.isoformat()},
            before=self.call.due_date.isoformat(),
        )
        self.assertEqual(
            tasks.REDATE.preview(action)["task"], {"id": self.call.pk, "title": "Call Pizza Hut"}
        )
        Task.objects.filter(pk=self.call.pk).delete()
        self.assertEqual(
            tasks.REDATE.preview(action)["task"], {"id": None, "title": "A removed task"}
        )

    def test_create_validates_and_falls_back_on_bad_people_and_dates(self):
        clean = tasks.CREATE.validate(
            {"title": " Book the QBR ", "assignee_id": self.other.pk, "due_in_days": 400},
            row_for(self.pizza),
            self.ctx(),
            [],
        )
        # Dana can't open Pizza Hut, so nobody is named; the date is capped at 60 days.
        self.assertEqual(clean["title"], "Book the QBR")
        self.assertIsNone(clean["assignee_id"])
        self.assertEqual(clean["due_date"], (self.today + timedelta(days=60)).isoformat())
        self.assertEqual(clean["priority"], "medium")
        with self.assertRaises(Invalid):
            tasks.CREATE.validate({"title": " "}, row_for(self.pizza), self.ctx(), [])

    def test_create_applies_as_an_agent_task_and_undo_removes_an_untouched_one(self):
        action = self.action(
            "task.create",
            {
                "title": "Book the QBR",
                "assignee_id": self.csm.pk,
                "assignee_name": "Carl CSM",
                "due_date": (self.today + timedelta(days=5)).isoformat(),
                "priority": "high",
            },
        )
        action.after, action.result = tasks.CREATE.apply(action, None)
        task = Task.objects.get(pk=action.result["task_id"])
        self.assertEqual((task.source, task.assignee_id), (Task.Source.AGENT, self.csm.pk))
        created = TaskEvent.objects.get(task=task, kind="created")
        self.assertEqual(created.data["agent_action"], action.pk)
        tasks.CREATE.undo(action, self.mona)
        self.assertFalse(Task.objects.filter(pk=task.pk).exists())

    def test_create_undo_refuses_once_someone_worked_on_it(self):
        action = self.action(
            "task.create",
            {
                "title": "Book the QBR",
                "assignee_id": None,
                "assignee_name": "",
                "due_date": self.today.isoformat(),
                "priority": "low",
            },
        )
        action.after, action.result = tasks.CREATE.apply(action, self.mona)
        TaskEvent.objects.create(task_id=action.result["task_id"], kind="comment", body="On it")
        with self.assertRaises(ChangedSince) as caught:
            tasks.CREATE.undo(action, self.mona)
        self.assertEqual(
            caught.exception.detail, "This task has been worked on since: it can't be removed."
        )

    def test_reassign_redate_snooze_and_complete(self):
        reassign = self.action(
            "task.reassign",
            tasks.REASSIGN.validate(
                {"task_id": self.call.pk, "assignee_id": self.mona.pk},
                row_for(self.pizza),
                self.ctx(),
                [],
            ),
            before=self.csm.pk,
        )
        reassign.after, _ = tasks.REASSIGN.apply(reassign, None)
        self.call.refresh_from_db()
        self.assertEqual(self.call.assignee_id, self.mona.pk)
        self.assertTrue(TaskEvent.objects.filter(task=self.call, kind="assigned").exists())
        tasks.REASSIGN.undo(reassign, self.mona)
        self.call.refresh_from_db()
        self.assertEqual(self.call.assignee_id, self.csm.pk)

        until = (self.today + timedelta(days=9)).isoformat()
        snooze = self.action(
            "task.snooze",
            tasks.SNOOZE.validate(
                {"task_id": self.call.pk, "until": until, "reason": "Waiting on legal"},
                row_for(self.pizza),
                self.ctx(),
                [],
            ),
            before=self.call.due_date.isoformat(),
        )
        snooze.after, _ = tasks.SNOOZE.apply(snooze, None)
        self.call.refresh_from_db()
        self.assertEqual(self.call.due_date.isoformat(), until)
        self.assertTrue(
            TaskEvent.objects.filter(
                task=self.call, kind="comment", body="Snoozed by the CS agent: Waiting on legal"
            ).exists()
        )
        self.assertEqual(tasks.SNOOZE.preview(snooze)["to"], f"{until} (snoozed: Waiting on legal)")

        complete = self.action(
            "task.complete",
            tasks.COMPLETE.validate(
                {"task_id": self.call.pk, "because": "Call logged on 6 Oct"},
                row_for(self.pizza),
                self.ctx(),
                ["Call logged on 6 Oct"],
            ),
            before={"status": "pending", "blocked_reason": ""},
            evidence=["Call logged on 6 Oct"],
        )
        complete.after, _ = tasks.COMPLETE.apply(complete, self.mona)
        self.call.refresh_from_db()
        self.assertEqual(self.call.status, "completed")
        tasks.COMPLETE.undo(complete, self.mona)
        self.call.refresh_from_db()
        self.assertEqual(self.call.status, "pending")

    def test_complete_must_quote_its_evidence(self):
        with self.assertRaises(Invalid):
            tasks.COMPLETE.validate(
                {"task_id": self.call.pk, "because": "Trust me"},
                row_for(self.pizza),
                self.ctx(),
                ["Call logged on 6 Oct"],
            )

    def test_a_task_outside_the_evidence_or_on_another_record_is_refused(self):
        for bad in ({"task_id": 999999, "due_date": self.today.isoformat()}, {"task_id": "1"}):
            with self.subTest(bad=bad), self.assertRaises(Invalid):
                tasks.REDATE.validate(bad, row_for(self.pizza), self.ctx(), [])
        with self.assertRaises(Invalid):
            tasks.REDATE.validate(
                {"task_id": self.call.pk, "due_date": self.today.isoformat()},
                row_for(self.dough),
                self.ctx(),
                [],
            )

    def test_redate_undo_refuses_after_someone_moved_it(self):
        new = (self.today + timedelta(days=4)).isoformat()
        action = self.action(
            "task.redate",
            {"task_id": self.call.pk, "due_date": new},
            before=self.call.due_date.isoformat(),
        )
        action.after, _ = tasks.REDATE.apply(action, None)
        Task.objects.filter(pk=self.call.pk).update(due_date=self.today)
        with self.assertRaises(ChangedSince):
            tasks.REDATE.undo(action, self.mona)

    def test_apply_is_stale_once_the_task_is_done_or_gone(self):
        action = self.action(
            "task.redate",
            {"task_id": self.call.pk, "due_date": (self.today + timedelta(days=4)).isoformat()},
            before=self.call.due_date.isoformat(),
        )
        Task.objects.filter(pk=self.call.pk).update(status=Task.Status.COMPLETED)
        with self.assertRaises(Stale):
            tasks.REDATE.apply(action, None)
        Task.objects.filter(pk=self.call.pk).delete()
        with self.assertRaises(Stale):
            tasks.REDATE.apply(action, None)

    def test_complete_undo_restores_a_blocked_task_with_its_reason(self):
        Task.objects.filter(pk=self.call.pk).update(status="blocked", blocked_reason="Legal")
        action = self.action(
            "task.complete",
            {"task_id": self.call.pk, "because": "x"},
            before={"status": "blocked", "blocked_reason": "Legal"},
        )
        action.after, _ = tasks.COMPLETE.apply(action, None)
        tasks.COMPLETE.undo(action, self.mona)
        self.call.refresh_from_db()
        self.assertEqual((self.call.status, self.call.blocked_reason), ("blocked", "Legal"))

    def test_an_account_level_task_is_created_changed_and_removed(self):
        account = Account.objects.create(name="Pizza Group", owner=self.csm)
        account.customers.add(self.pizza)
        action = AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="task.create",
            account=account,
            target="task:x",
            title="t",
            rationale="r",
            payload={
                "title": "Group QBR",
                "assignee_id": self.csm.pk,
                "assignee_name": "Carl CSM",
                "due_date": (self.today + timedelta(days=5)).isoformat(),
                "priority": "low",
            },
        )
        action.after, action.result = tasks.CREATE.apply(action, None)
        task = Task.objects.get(pk=action.result["task_id"])
        self.assertEqual((task.account_id, task.customer_id), (account.pk, None))
        action.payload = {
            "task_id": task.pk,
            "due_date": (self.today + timedelta(days=8)).isoformat(),
        }
        action.before = task.due_date.isoformat()
        action.after, _ = tasks.REDATE.apply(action, None)
        task.refresh_from_db()
        self.assertEqual(task.due_date.isoformat(), action.after)
        tasks.REDATE.undo(action, self.mona)
        action.result = {"task_id": task.pk}
        # The redate and its undo are events: the task has been worked on.
        with self.assertRaises(ChangedSince):
            tasks.CREATE.undo(action, self.mona)
        self.assertTrue(Task.objects.filter(pk=task.pk).exists())

    # Fix round 1

    def v(self, kind, payload, row=None):
        return kind.validate(payload, row or row_for(self.pizza), self.ctx(), [])

    def test_reassign_validate_refuses_someone_who_cannot_open_the_record(self):
        with self.assertRaises(Invalid):
            self.v(tasks.REASSIGN, {"task_id": self.call.pk, "assignee_id": self.other.pk})

    def test_reassign_apply_is_stale_after_the_assignee_loses_access(self):
        action = self.action(
            "task.reassign",
            {"task_id": self.call.pk, "assignee_id": self.other.pk},
            before=self.csm.pk,
        )
        with self.assertRaises(Stale):
            tasks.REASSIGN.apply(action, None)

    def test_reassign_undo_refuses_when_the_previous_assignee_cannot_take_it_back(self):
        action = self.action(
            "task.reassign",
            {"task_id": self.call.pk, "assignee_id": self.mona.pk},
            before=self.other.pk,
        )
        action.after, _ = tasks.REASSIGN.apply(action, None)
        with self.assertRaises(ChangedSince) as caught:
            tasks.REASSIGN.undo(action, self.mona)
        self.assertEqual(caught.exception.applied, self.mona.name)
        self.assertEqual(caught.exception.current, self.mona.name)

    def test_reassign_undo_to_nobody_clears_the_name(self):
        action = self.action(
            "task.reassign",
            {"task_id": self.call.pk, "assignee_id": self.mona.pk},
            before=None,
        )
        action.after, _ = tasks.REASSIGN.apply(action, None)
        tasks.REASSIGN.undo(action, self.mona)
        self.call.refresh_from_db()
        self.assertEqual((self.call.assignee_id, self.call.assignee_name), (None, ""))

    def test_bad_dates_are_refused_for_redate_and_snooze(self):
        bad = [
            (self.today - timedelta(days=1)).isoformat(),
            (self.today + timedelta(days=121)).isoformat(),
            "next tuesday",
        ]
        for value in bad:
            with self.subTest(value=value):
                with self.assertRaises(Invalid):
                    self.v(tasks.REDATE, {"task_id": self.call.pk, "due_date": value})
                with self.assertRaises(Invalid):
                    self.v(tasks.SNOOZE, {"task_id": self.call.pk, "until": value, "reason": "x"})

    def test_snooze_refuses_an_earlier_date_and_a_missing_reason(self):
        with self.assertRaises(Invalid):
            self.v(
                tasks.SNOOZE,
                {"task_id": self.call.pk, "until": self.today.isoformat(), "reason": "x"},
            )
        later = (self.today + timedelta(days=9)).isoformat()
        with self.assertRaises(Invalid):
            self.v(tasks.SNOOZE, {"task_id": self.call.pk, "until": later, "reason": " "})

    def test_a_date_that_passed_while_waiting_is_stale(self):
        past = (self.today - timedelta(days=3)).isoformat()
        for kind, payload in (
            (tasks.REDATE, {"task_id": self.call.pk, "due_date": past}),
            (tasks.SNOOZE, {"task_id": self.call.pk, "until": past, "reason": "x"}),
        ):
            with self.subTest(kind=kind.key):
                with self.assertRaises(Stale):
                    kind.apply(self.action(kind.key, payload), None)
        action = self.action(
            "task.create",
            {
                "title": "Late",
                "assignee_id": None,
                "assignee_name": "",
                "due_date": past,
                "priority": "low",
            },
        )
        with self.assertRaises(Stale):
            tasks.CREATE.apply(action, self.mona)
        # An override (Work's Assign) brings its own date.
        tasks.CREATE.apply(action, self.mona, due_date=self.today)

    def test_a_plan_task_is_refused(self):
        plan = Plan.objects.create(
            organisation=self.org,
            customer=self.pizza,
            name="Kickoff",
            kind="other",
            owner=self.csm,
            start_date=self.today,
            target_date=self.today,
        )
        Task.objects.filter(pk=self.call.pk).update(plan=plan)
        future = (self.today + timedelta(days=4)).isoformat()
        stale = [
            (tasks.REDATE, {"task_id": self.call.pk, "due_date": future}),
            (tasks.SNOOZE, {"task_id": self.call.pk, "until": future, "reason": "x"}),
            (tasks.REASSIGN, {"task_id": self.call.pk, "assignee_id": self.mona.pk}),
            (tasks.COMPLETE, {"task_id": self.call.pk, "because": "x"}),
        ]
        for kind, payload in stale:
            action = self.action(kind.key, payload, before=self.csm.pk)
            with self.subTest(kind=kind.key):
                with self.assertRaises(Stale):
                    kind.apply(action, None)
        action = self.action("task.redate", stale[0][1], before=self.call.due_date.isoformat())
        action.after = future
        with self.assertRaises(ChangedSince):
            tasks.REDATE.undo(action, self.mona)

    def test_an_action_for_another_record_does_not_find_the_task(self):
        action = self.action("task.redate", {"task_id": self.call.pk, "due_date": "2999-01-01"})
        action.customer = self.dough
        with self.assertRaises(Stale):
            tasks.REDATE.apply(action, None)

    def test_complete_undo_refuses_when_reopened_or_removed(self):
        action = self.action(
            "task.complete",
            {"task_id": self.call.pk, "because": "x"},
            before={"status": "pending", "blocked_reason": ""},
        )
        action.after, _ = tasks.COMPLETE.apply(action, None)
        Task.objects.filter(pk=self.call.pk).update(status="pending")
        with self.assertRaises(ChangedSince) as caught:
            tasks.COMPLETE.undo(action, self.mona)
        self.assertIn("reopened", caught.exception.detail)
        Task.objects.filter(pk=self.call.pk).delete()
        with self.assertRaises(ChangedSince) as caught:
            tasks.COMPLETE.undo(action, self.mona)
        self.assertIn("removed", caught.exception.detail)

    def test_create_undo_refuses_on_a_completed_task(self):
        action = self.action(
            "task.create",
            {
                "title": "Book",
                "assignee_id": None,
                "assignee_name": "",
                "due_date": self.today.isoformat(),
                "priority": "low",
            },
        )
        action.after, action.result = tasks.CREATE.apply(action, self.mona)
        Task.objects.filter(pk=action.result["task_id"]).update(status="completed")
        with self.assertRaises(ChangedSince):
            tasks.CREATE.undo(action, self.mona)

    def test_reassign_and_redate_rearm_escalation_and_reassign_notifies(self):
        from django.utils import timezone

        Task.objects.filter(pk=self.call.pk).update(escalated_at=timezone.now())
        reassign = self.action(
            "task.reassign",
            {"task_id": self.call.pk, "assignee_id": self.mona.pk},
            before=self.csm.pk,
        )
        tasks.REASSIGN.apply(reassign, None)
        self.call.refresh_from_db()
        self.assertIsNone(self.call.escalated_at)
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.mona, kind=Notification.Kind.TASK_ASSIGNED
            ).exists()
        )
        Task.objects.filter(pk=self.call.pk).update(escalated_at=timezone.now())
        redate = self.action(
            "task.redate",
            {"task_id": self.call.pk, "due_date": (self.today + timedelta(days=7)).isoformat()},
        )
        tasks.REDATE.apply(redate, None)
        self.call.refresh_from_db()
        self.assertIsNone(self.call.escalated_at)

    def test_create_validate_refuses_a_record_outside_the_workspace(self):
        with self.assertRaises(Invalid):
            self.v(tasks.CREATE, {"title": "x"}, {"ref": "customer:999999"})
        with self.assertRaises(Invalid):
            self.v(
                tasks.REASSIGN,
                {"task_id": self.call.pk, "assignee_id": self.mona.pk},
                {**row_for(self.pizza), "ref": f"customer:{self.pizza.pk}"}
                | {"ref": "customer:999999"},
            )
