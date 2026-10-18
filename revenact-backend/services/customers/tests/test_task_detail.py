"""The task panel: read a task with its trail, change any field (each
change its own event, a new assignee told), Blocked with its reason, and
comments. A task the reader may not read is a 404. A plan's task keeps the
plan's rules.

PlanFixture's world: Carl owns Pizza Hut and reports to Mona; Dana cannot
open Pizza Hut; Alice (admin) can open everything."""

from datetime import timedelta
from unittest.mock import patch

from core.models import AuditEvent
from services.accounts.models import User
from services.customers.models import Customer, Task
from services.customers.task_access import FIELDS
from services.customers.task_changes import add_task
from services.customers.task_views import TaskDetailView
from services.notifications.models import Notification
from services.plans.access import NOT_CHECKER
from services.plans.models import Plan
from services.plans.tests.fixtures import PlanFixture
from services.segments.tests.fixtures import person


def whole_form(panel, **changes):
    """The panel's form as a client sends it back: every field, with `changes`."""
    form = {n: panel[n] for n in ("title", "description", "status", "due_date", "priority")}
    form["blocked_reason"] = panel["blocked_reason"]
    form["assignee_id"] = panel["assignee"]["id"]
    return {**form, **changes}


class DetailFixture(PlanFixture):
    def setUp(self):
        self.task = add_task(
            parent=self.pizza,
            title="Call Pizza Hut",
            due_date=self.today + timedelta(days=2),
            priority="medium",
            assignee=self.csm,
            created_by=self.csm,
            actor=self.csm,
            source=Task.Source.MANUAL,
        )
        self.url = f"/api/v1/tasks/{self.task.pk}/"

    def patch(self, body, user=None, url=None):
        return self.api(user or self.csm).patch(url or self.url, body, format="json")

    def kinds(self, task=None):
        return list((task or self.task).events.values_list("kind", flat=True))


class ReadTests(DetailFixture):
    def test_the_panel_reads_the_whole_task_and_its_trail(self):
        response = self.api(self.csm).get(self.url)
        self.assertEqual(response.status_code, 200, response.data)
        body = response.data
        self.assertEqual(
            {
                k: body[k]
                for k in ("id", "title", "description", "status", "blocked_reason", "source")
            },
            {
                "id": self.task.pk,
                "title": "Call Pizza Hut",
                "description": "",
                "status": "pending",
                "blocked_reason": "",
                "source": "manual",
            },
        )
        self.assertEqual(
            body["parent"], {"kind": "customer", "id": self.pizza.pk, "name": "Pizza Hut"}
        )
        self.assertEqual((body["parent_name"], body["parent_type"]), ("Pizza Hut", "customer"))
        self.assertEqual(body["assignee"], {"id": self.csm.pk, "name": "Carl CSM", "active": True})
        self.assertEqual(body["created_by"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(
            body["editable"], ["title", "description", "status", "due_date", "priority", "assignee"]
        )
        [event] = body["events"]
        self.assertEqual(
            {k: event[k] for k in ("kind", "actor", "body")},
            {"kind": "created", "actor": {"id": self.csm.pk, "name": "Carl CSM"}, "body": ""},
        )
        self.assertEqual((body["plan"], body["milestone"], body["initiative"]), (None, None, None))

    def test_the_chain_and_view_all_read_it_and_nobody_else(self):
        self.assertEqual(self.api(self.mona).get(self.url).status_code, 200)
        # Alice is outside Carl's chain; view-all reads every task (owner decision 2026-10-07).
        self.assertEqual(self.api(self.admin).get(self.url).status_code, 200)
        response = self.api(self.other).get(self.url)
        self.assertEqual((response.status_code, response.data), (404, {"detail": "No such task."}))


class ViewAllAndLeadershipTests(DetailFixture):
    """A reader with view_all_accounts or the Leadership function reads, edits
    and reassigns a task outside their chain, on a record they may open."""

    def test_view_all_edits_and_reassigns_a_task_outside_its_chain(self):
        alice = User.objects.get(pk=self.admin.pk)
        read = self.api(alice).get(self.url)
        self.assertEqual(
            read.data["editable"],
            ["title", "description", "status", "due_date", "priority", "assignee"],
        )
        response = self.patch(
            {"title": "Call Pizza Hut today", "assignee_id": self.mona.pk}, user=alice
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            (response.data["title"], response.data["assignee"]["id"]),
            ("Call Pizza Hut today", self.mona.pk),
        )
        self.assertEqual(self.task.events.get(kind="assigned").actor, alice)
        note = Notification.objects.get(kind="task_assigned")
        self.assertEqual((note.recipient, note.actor), (self.mona, alice))

    def test_leadership_edits_a_task_outside_its_chain_on_a_record_it_opens(self):
        lena = person("lena@acme.io", "Lena Lead", self.org, function=User.Function.LEADERSHIP)
        loose = Customer.objects.create(organisation=self.org, name="Loose Ltd")
        task = add_task(
            parent=loose,
            title="Tidy Loose Ltd",
            due_date=self.today + timedelta(days=2),
            priority="low",
            assignee=self.csm,
            created_by=self.csm,
            actor=self.csm,
            source=Task.Source.MANUAL,
        )
        url = f"/api/v1/tasks/{task.pk}/"
        self.assertEqual(self.api(lena).get(url).status_code, 200)
        response = self.patch({"priority": "high", "assignee_id": self.mona.pk}, user=lena, url=url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["priority"], "high")
        # ...but never on a record she cannot open: Pizza Hut is Carl's.
        self.assertEqual(self.api(lena).get(self.url).status_code, 404)
        self.assertEqual(self.patch({"title": "Mine"}, user=lena).status_code, 404)


class EditTests(DetailFixture):
    def test_each_changed_field_writes_its_event_and_is_audited(self):
        response = self.patch(
            {
                "title": "Call Pizza Hut again",
                "description": "Ask about seats",
                "priority": "high",
                "due_date": (self.today + timedelta(days=5)).isoformat(),
            }
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["title"], "Call Pizza Hut again")
        self.assertEqual(self.kinds(), ["created", "edited", "edited", "edited", "due_changed"])
        event = AuditEvent.objects.get(action="task.update")
        self.assertEqual(
            event.metadata, {"fields": ["title", "description", "priority", "due_date"]}
        )

    def test_the_same_values_write_nothing(self):
        response = self.patch({"title": "Call Pizza Hut", "priority": "medium"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.kinds(), ["created"])
        self.assertFalse(AuditEvent.objects.filter(action="task.update").exists())

    def test_the_whole_form_with_one_change_writes_only_that_change(self):
        form = self.api(self.csm).get(self.url).data
        response = self.patch(whole_form(form, title="Call Pizza Hut today"))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.kinds(), ["created", "edited"])
        event = AuditEvent.objects.get(action="task.update")
        self.assertEqual(event.metadata, {"fields": ["title"]})

    def test_a_task_deleted_while_it_is_saved_is_a_404_not_a_500(self):
        original = TaskDetailView._write

        def write_then_delete(view, request, task, values):
            original(view, request, task, values)
            Task.objects.filter(pk=task.pk).delete()

        with patch.object(TaskDetailView, "_write", write_then_delete):
            response = self.patch({"title": "Call Pizza Hut today"})
        self.assertEqual((response.status_code, response.data), (404, {"detail": "No such task."}))

    def test_blocked_needs_a_reason_and_leaving_it_clears_the_reason(self):
        refused = self.patch({"status": "blocked"})
        self.assertEqual(
            (refused.status_code, refused.data),
            (400, {"blocked_reason": ["Say what it's blocked on."]}),
        )
        blocked = self.patch({"status": "blocked", "blocked_reason": "Waiting on legal"})
        self.assertEqual(
            (blocked.data["status"], blocked.data["blocked_reason"]),
            ("blocked", "Waiting on legal"),
        )
        reason = self.patch({"blocked_reason": "Legal, then finance"})
        self.assertEqual(reason.data["blocked_reason"], "Legal, then finance")
        moved = self.patch({"status": "in-progress", "blocked_reason": "ignored"})
        self.assertEqual((moved.data["status"], moved.data["blocked_reason"]), ("in-progress", ""))
        statuses = list(self.task.events.filter(kind="status").values_list("data", flat=True))
        self.assertEqual(
            statuses,
            [
                {"from": "pending", "to": "blocked", "reason": "Waiting on legal"},
                {"from": "blocked", "to": "blocked", "reason": "Legal, then finance"},
                {"from": "blocked", "to": "in-progress"},
            ],
        )
        audited = AuditEvent.objects.filter(action="task.update").order_by("pk")
        self.assertEqual(
            audited.first().metadata,
            {"fields": ["status", "blocked_reason"], "from": "pending", "to": "blocked"},
        )

    def test_refusals_are_in_the_uis_words(self):
        cases = [
            (
                {"status": "done"},
                {"status": ["Choose pending, in progress, blocked or completed."]},
            ),
            ({"title": ""}, {"title": ["Give the task a title."]}),
            ({"priority": "urgent"}, {"priority": ["Choose high, medium or low."]}),
            ({"due_date": "soon"}, {"due_date": ["Choose a date."]}),
            ({"assignee_id": None}, {"assignee_id": ["Choose who does it."]}),
        ]
        for body, expected in cases:
            with self.subTest(body=body):
                response = self.patch(body)
                self.assertEqual((response.status_code, response.data), (400, expected))
        array = self.api(self.csm).patch(self.url, [1], format="json")
        self.assertEqual(array.data, {"non_field_errors": ["Send the fields as one object."]})
        self.assertEqual(self.kinds(), ["created"])

    def test_a_new_assignee_who_can_open_the_record_is_told(self):
        response = self.patch({"assignee_id": self.mona.pk})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["assignee"]["id"], self.mona.pk)
        self.assertEqual(response.data["assignee_name"], "Mona Manager")
        assigned = self.task.events.get(kind="assigned")
        self.assertEqual(
            assigned.data,
            {
                "from": {"id": self.csm.pk, "name": "Carl CSM"},
                "to": {"id": self.mona.pk, "name": "Mona Manager"},
            },
        )
        notes = Notification.objects.filter(kind="task_assigned")
        self.assertEqual(list(notes.values_list("recipient_id", flat=True)), [self.mona.pk])
        # Mona hands it back to herself: no change. To Carl: Carl is told, she isn't.
        self.patch({"assignee_id": self.csm.pk}, user=self.mona)
        self.assertEqual(
            list(notes.order_by("pk").values_list("recipient_id", flat=True)),
            [self.mona.pk, self.csm.pk],
        )

    def test_someone_who_cannot_open_the_record_is_refused(self):
        response = self.patch({"assignee_id": self.other.pk})
        self.assertEqual(
            (response.status_code, response.data),
            (
                400,
                {
                    "code": "ASSIGNEE_CANNOT_OPEN",
                    "detail": "That person can't open this organisation.",
                },
            ),
        )
        self.task.refresh_from_db()
        self.assertEqual(self.task.assignee, self.csm)

    def test_a_task_the_caller_cannot_read_is_404_and_untouched(self):
        response = self.patch({"title": "Mine now"}, user=self.other)
        self.assertEqual(response.status_code, 404)
        self.task.refresh_from_db()
        self.assertEqual(self.task.title, "Call Pizza Hut")


class CommentTests(DetailFixture):
    def comment(self, body, user=None):
        return self.api(user or self.csm).post(
            f"{self.url}comments/", {"body": body}, format="json"
        )

    def test_anyone_who_reads_it_comments(self):
        response = self.comment("  Called, left a voicemail. ")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            {k: response.data[k] for k in ("kind", "body", "actor", "data")},
            {
                "kind": "comment",
                "body": "Called, left a voicemail.",
                "actor": {"id": self.csm.pk, "name": "Carl CSM"},
                "data": {},
            },
        )
        self.assertEqual(self.comment("Thanks", user=self.mona).status_code, 201)
        self.assertEqual(self.kinds(), ["created", "comment", "comment"])

    def test_blank_too_long_and_unreadable(self):
        self.assertEqual(self.comment("  ").data, {"body": ["Write a comment."]})
        self.assertEqual(
            self.comment("x" * 5001).data, {"body": ["Keep a comment under 5,000 characters."]}
        )
        self.assertEqual(self.comment("Hi", user=self.other).status_code, 404)


class PlanTaskTests(DetailFixture):
    def setUp(self):
        super().setUp()
        # Alice (view-all) is given a task on Carl's plan: she reads it, but
        # she is neither the plan's owner nor above him, so she only ticks it.
        self.plan = self.build_plan(
            steps=[("Kick-off", 7, [("Hold the call", self.admin, "pending", self.csm)])]
        )
        self.plan_task = self.plan.tasks.get()
        self.plan_url = f"/api/v1/tasks/{self.plan_task.pk}/"

    def test_an_editor_changes_anything_through_the_panel(self):
        response = self.patch({"title": "Hold the kick-off call"}, url=self.plan_url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["plan"], {"id": self.plan.pk, "name": self.plan.name})

    def test_the_assignee_who_is_not_an_editor_only_moves_its_status(self):
        alice = User.objects.get(pk=self.admin.pk)
        read = self.api(alice).get(self.plan_url)
        self.assertEqual(read.data["editable"], ["status"])
        refused = self.patch({"title": "Mine"}, user=alice, url=self.plan_url)
        self.assertEqual(
            (refused.status_code, refused.data["detail"]),
            (403, "Only the plan's owner or their managers can change it."),
        )
        blocked = self.patch(
            {"status": "blocked", "blocked_reason": "No room booked"}, user=alice, url=self.plan_url
        )
        self.assertEqual(blocked.status_code, 200, blocked.data)
        self.plan_task.refresh_from_db()
        self.assertEqual(
            (self.plan_task.status, self.plan_task.blocked_reason), ("blocked", "No room booked")
        )
        done = self.patch({"status": "completed"}, user=alice, url=self.plan_url)
        self.assertEqual(done.status_code, 200, done.data)
        self.assertEqual(Plan.objects.get(pk=self.plan.pk).status, "done")

    def test_view_all_who_may_not_tick_it_on_the_plan_cannot_tick_it_here(self):
        """Spec §1.2: a plan's task keeps the plan's rules. Alice (view-all)
        reads Carl's own task on his plan, but only its assignee, its creator
        and the plan's editors tick it, as on the plan route."""
        carls = self.build_plan(
            steps=[("Kick-off", 7, [("Carl's own", self.csm, "pending")])], name="Carl's"
        ).tasks.get()
        url = f"/api/v1/tasks/{carls.pk}/"
        alice = User.objects.get(pk=self.admin.pk)
        read = self.api(alice).get(url)
        self.assertEqual((read.status_code, read.data["editable"]), (200, []))
        refused = self.patch({"status": "completed"}, user=alice, url=url)
        self.assertEqual(
            (refused.status_code, refused.data),
            (403, {"detail": NOT_CHECKER}),
        )
        carls.refresh_from_db()
        self.assertEqual(carls.status, "pending")
        self.assertEqual(self.api(self.csm).get(url).data["editable"], list(FIELDS))
        self.assertEqual(self.patch({"status": "completed"}, url=url).status_code, 200)

    def test_the_whole_form_with_only_its_status_changed_is_a_tick(self):
        alice = User.objects.get(pk=self.admin.pk)
        form = self.api(alice).get(self.plan_url).data
        response = self.patch(whole_form(form, status="completed"), user=alice, url=self.plan_url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "completed")
        Plan.objects.filter(pk=self.plan.pk).update(status="done")
        form = self.api(self.csm).get(self.plan_url).data
        response = self.patch(whole_form(form, status="pending"), url=self.plan_url)
        self.assertEqual(response.status_code, 200, response.data)

    def test_a_finished_plan_keeps_only_its_status_open(self):
        Plan.objects.filter(pk=self.plan.pk).update(status="done")
        refused = self.patch({"title": "Late"}, url=self.plan_url)
        self.assertEqual(
            (refused.status_code, refused.data),
            (400, {"non_field_errors": ["This plan is finished; only its tasks can change."]}),
        )
        self.assertEqual(self.patch({"status": "completed"}, url=self.plan_url).status_code, 200)


class FixRoundOneTests(DetailFixture):
    def test_hand_it_to_your_manager(self):
        """Carl hands Mona's task back to her: saved, and answered as saved,
        though he no longer reads it."""
        task = add_task(
            parent=self.pizza,
            title="Prep the QBR",
            due_date=self.today + timedelta(days=3),
            priority="high",
            assignee=self.csm,
            created_by=self.mona,
            actor=self.mona,
            source=Task.Source.MANUAL,
        )
        url = f"/api/v1/tasks/{task.pk}/"
        response = self.patch({"assignee_id": self.mona.pk}, url=url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["assignee"]["id"], self.mona.pk)
        self.assertEqual(response.data["editable"], [])
        self.assertEqual(self.api(self.csm).get(url).status_code, 404)

    def test_a_null_or_blank_reason_off_blocked_is_ignored(self):
        for body in (
            {"blocked_reason": None},
            {"blocked_reason": ""},
            {"status": "in-progress", "blocked_reason": None},
            {"status": "pending", "blocked_reason": ""},
        ):
            with self.subTest(body=body):
                response = self.patch(body)
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data["blocked_reason"], "")
        refused = self.patch({"status": "blocked", "blocked_reason": None})
        self.assertEqual(
            (refused.status_code, refused.data),
            (400, {"blocked_reason": ["Say what it's blocked on."]}),
        )


class PlanTaskAsThePlanRouteTests(DetailFixture):
    def setUp(self):
        super().setUp()
        self.plan = self.build_plan(
            steps=[("Kick-off", 7, [("Hold the call", self.admin, "pending", self.csm)])]
        )
        self.plan_task = self.plan.tasks.get()
        self.plan_url = f"/api/v1/tasks/{self.plan_task.pk}/"

    def test_an_edit_is_audited_as_the_plan_route_audits_it(self):
        response = self.patch({"title": "Hold the kick-off call"}, url=self.plan_url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            self.events("plan.task_changed"),
            [
                (
                    str(self.plan.pk),
                    {"task": self.plan_task.pk, "change": "edited", "fields": ["title"]},
                )
            ],
        )

    def test_a_new_assignee_is_told_as_the_plan_tells_them(self):
        response = self.patch({"assignee_id": self.mona.pk}, url=self.plan_url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([r for r, _, _ in self.notes("plan_task_assigned")], [self.mona.pk])
        self.assertEqual(self.notes("task_assigned"), [])
        # Back to the caller himself: nobody is told.
        self.patch({"assignee_id": self.csm.pk}, url=self.plan_url)
        self.assertEqual(len(self.notes("plan_task_assigned")), 1)
