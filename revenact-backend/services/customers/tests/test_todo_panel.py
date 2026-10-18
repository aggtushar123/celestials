"""The task panel on a to-do (contract §1.2, §1.3): its creator reads,
edits, ticks and comments on it; nobody else finds it. A record may be
attached (it then lives by record rules); never changed or removed."""

from datetime import timedelta

from core.models import AuditEvent
from services.accounts.models import User
from services.customers.models import Task, TaskEvent
from services.work.tests.fixtures import WorkFixture

ONLY_YOURS = "A to-do without a record can only be yours."
OPENABLE = "Choose an organisation or account you can open."


class TodoPanelTests(WorkFixture):
    def setUp(self):
        self.todo = Task.objects.create(
            title="Book the QBR room",
            assignee=self.csm,
            assignee_name=self.csm.name,
            created_by=self.csm,
            due_date=None,
            priority="medium",
        )
        self.url = f"/api/v1/tasks/{self.todo.pk}/"

    def client_for(self, user):
        return self.as_user(User.objects.get(pk=user.pk))

    def patch(self, body, user=None):
        return self.client_for(user or self.csm).patch(self.url, body, format="json")

    def test_its_creator_reads_it_as_a_private_task_with_no_record(self):
        body = self.client_for(self.csm).get(self.url).json()
        self.assertEqual(
            (body["parent"], body["parent_name"], body["parent_type"], body["due_date"]),
            (None, None, None, None),
        )
        self.assertTrue(body["private"])
        self.assertEqual(
            body["editable"],
            ["title", "description", "status", "due_date", "priority", "assignee", "record"],
        )

    def test_nobody_else_finds_it(self):
        for user in (self.mona, self.admin, self.lee, self.other):
            client = self.client_for(user)
            self.assertEqual(client.get(self.url).status_code, 404, user.name)
            self.assertEqual(client.patch(self.url, {"title": "x"}, format="json").status_code, 404)
            comment = client.post(f"{self.url}comments/", {"body": "hi"}, format="json")
            self.assertEqual(comment.status_code, 404)

    def test_done_and_undone(self):
        response = self.patch({"status": "completed"})
        self.assertEqual((response.status_code, response.json()["status"]), (200, "completed"))
        self.assertEqual(self.patch({"status": "pending"}).json()["status"], "pending")

    def test_a_date_can_be_set_and_cleared(self):
        day = (self.today + timedelta(days=3)).isoformat()
        self.assertEqual(self.patch({"due_date": day}).json()["due_date"], day)
        self.assertIsNone(self.patch({"due_date": None}).json()["due_date"])
        event = TaskEvent.objects.filter(task=self.todo, kind="due_changed").last()
        self.assertEqual(event.data, {"from": day, "to": None})

    def test_a_task_on_a_record_keeps_its_date(self):
        response = self.client_for(self.csm).patch(
            f"/api/v1/tasks/{self.overdue.pk}/", {"due_date": None}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {"due_date": ["Choose a date."]})

    def test_a_to_do_is_only_ever_its_creators(self):
        response = self.patch({"assignee_id": self.mona.pk})
        self.assertEqual((response.status_code, response.json()), (400, {"assignee": [ONLY_YOURS]}))
        self.assertEqual(self.patch({"assignee_id": self.csm.pk}).status_code, 200)

    def test_attaching_a_record_makes_it_an_ordinary_task(self):
        day = self.today.isoformat()
        response = self.patch({"customer_id": self.pizza.pk, "due_date": day})
        self.assertEqual(response.status_code, 200, response.json())
        body = response.json()
        self.assertEqual(
            body["parent"], {"kind": "customer", "id": self.pizza.pk, "name": "Pizza Hut"}
        )
        self.assertFalse(body["private"])
        self.assertNotIn("record", body["editable"])
        event = TaskEvent.objects.get(task=self.todo, kind="edited", data__field="record")
        self.assertEqual(
            event.data,
            {
                "field": "record",
                "from": None,
                "to": {"kind": "customer", "id": self.pizza.pk, "name": "Pizza Hut"},
            },
        )
        # Record rules now: Carl's manager reads it.
        self.assertEqual(self.client_for(self.mona).get(self.url).status_code, 200)

    def test_attaching_needs_a_date_an_openable_record_and_only_one(self):
        cases = (
            ({"customer_id": self.pizza.pk}, {"due_date": ["Choose a date."]}),
            (
                {"account_id": self.west.pk, "due_date": self.today.isoformat()},
                {"record": [OPENABLE]},
            ),
            ({"customer_id": 999_999, "due_date": self.today.isoformat()}, {"record": [OPENABLE]}),
            (
                {
                    "customer_id": self.pizza.pk,
                    "account_id": self.emea.pk,
                    "due_date": self.today.isoformat(),
                },
                {"record": ["Choose an organisation or an account, not both."]},
            ),
            ({"customer_id": "pizza"}, {"customer_id": [OPENABLE]}),
        )
        for body, error in cases:
            response = self.patch(body)
            self.assertEqual((response.status_code, response.json()), (400, error), body)
        self.assertTrue(Task.objects.filter(pk=self.todo.pk, customer__isnull=True).exists())

    def test_attaching_checks_a_new_assignee_against_the_record(self):
        response = self.patch(
            {
                "customer_id": self.pizza.pk,
                "due_date": self.today.isoformat(),
                "assignee_id": self.other.pk,
            }
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "ASSIGNEE_CANNOT_OPEN")

    def test_a_tasks_record_never_changes(self):
        url = f"/api/v1/tasks/{self.overdue.pk}/"
        client = self.client_for(self.csm)
        moved = client.patch(url, {"customer_id": self.dough.pk}, format="json")
        self.assertEqual(
            (moved.status_code, moved.json()),
            (400, {"record": ["A task's organisation or account can't be changed."]}),
        )
        same = client.patch(url, {"customer_id": self.pizza.pk, "account_id": None}, format="json")
        self.assertEqual(same.status_code, 200)

    def test_its_creator_comments_on_it(self):
        response = self.client_for(self.csm).post(
            f"{self.url}comments/", {"body": "Room 4"}, format="json"
        )
        self.assertEqual(response.status_code, 201)

    def test_record_endpoints_still_need_a_date(self):
        response = self.client_for(self.csm).post(
            f"/api/v1/customers/{self.pizza.pk}/tasks/",
            {"title": "Call", "priority": "high"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("due_date", response.json())

    def test_editing_a_to_do_keeps_its_title_out_of_the_audit_log(self):
        self.assertEqual(self.patch({"title": "Book the board room"}).status_code, 200)
        event = AuditEvent.objects.filter(action="task.update").last()
        self.assertEqual(event.target_repr, f"Task {self.todo.pk}")
        self.assertNotIn("Book", event.target_repr)
        self.assertEqual(event.metadata["fields"], ["title"])

    def test_attaching_a_record_is_audited_without_the_title(self):
        day = self.today.isoformat()
        response = self.patch({"customer_id": self.pizza.pk, "due_date": day})
        self.assertEqual(response.status_code, 200, response.json())
        event = AuditEvent.objects.filter(action="task.update").last()
        self.assertIn("record", event.metadata["fields"])
        self.assertEqual(event.target_repr, f"Task {self.todo.pk}")
