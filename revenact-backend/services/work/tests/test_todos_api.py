"""POST /work/todos/ (contract §1.1): a private to-do, or a task on a record
under the record task routes' rules."""

from datetime import timedelta

from services.accounts.models import User
from services.customers.models import Task, TaskEvent
from services.notifications.models import Notification
from services.work.tests.feed_fixtures import TODOS, FeedFixture

OPENABLE = "Choose an organisation or account you can open."


class TodoCreateTests(FeedFixture):
    def post(self, body, user=None):
        client = self.as_user(User.objects.get(pk=(user or self.csm).pk))
        return client.post(TODOS, body, format="json")

    def test_a_title_makes_a_private_to_do_with_no_date(self):
        response = self.post({"title": "  Book the QBR room "})
        self.assertEqual(response.status_code, 201, response.json())
        body = response.json()
        task = Task.objects.get(pk=body["task"]["id"])
        self.assertEqual(
            (task.title, task.customer_id, task.account_id, task.due_date, task.priority),
            ("Book the QBR room", None, None, None, "medium"),
        )
        self.assertEqual(
            (task.created_by_id, task.assignee_id, task.source),
            (self.csm.pk, self.csm.pk, "manual"),
        )
        self.assertEqual(body["group"], "no_date")
        self.assertEqual(
            {k: body["item"][k] for k in ("key", "kind", "private", "record", "actions")},
            {
                "key": f"task:{task.pk}",
                "kind": "todo",
                "private": True,
                "record": None,
                "actions": ["done", "open"],
            },
        )
        self.assertTrue(body["task"]["private"])
        self.assertTrue(TaskEvent.objects.filter(task=task, kind="created").exists())
        self.assertFalse(Notification.objects.exists())

    def test_a_dated_prioritised_to_do(self):
        day = (self.today - timedelta(days=1)).isoformat()
        body = self.post({"title": "Renew passport", "due_date": day, "priority": "high"}).json()
        self.assertEqual(
            (body["group"], body["item"]["due_date"], body["item"]["priority"]),
            ("overdue", day, "high"),
        )

    def test_a_to_do_is_only_ever_yours(self):
        response = self.post({"title": "x", "assignee_id": self.mona.pk})
        self.assertEqual(
            (response.status_code, response.json()),
            (400, {"assignee": ["A to-do without a record can only be yours."]}),
        )
        self.assertEqual(self.post({"title": "x", "assignee_id": self.csm.pk}).status_code, 201)

    def test_with_a_record_it_is_an_ordinary_task(self):
        response = self.post(
            {"title": "Prep QBR", "customer_id": self.pizza.pk, "due_date": self.today.isoformat()}
        )
        self.assertEqual(response.status_code, 201, response.json())
        body = response.json()
        self.assertEqual((body["group"], body["item"]["kind"]), ("today", "task"))
        self.assertEqual(
            body["item"]["record"], {"type": "customer", "id": self.pizza.pk, "name": "Pizza Hut"}
        )
        self.assertEqual(Task.objects.get(pk=body["task"]["id"]).customer_id, self.pizza.pk)

    def test_given_to_someone_else_it_is_not_on_your_desk(self):
        response = self.post(
            {
                "title": "Call Pizza",
                "customer_id": self.pizza.pk,
                "due_date": self.today.isoformat(),
                "assignee_id": self.csm.pk,
            },
            user=self.mona,
        )
        body = response.json()
        self.assertEqual(response.status_code, 201, body)
        self.assertEqual((body["item"], body["group"]), (None, None))

    def test_a_record_task_tells_its_assignee(self):
        response = self.post(
            {
                "title": "Call Pizza",
                "customer_id": self.pizza.pk,
                "due_date": self.today.isoformat(),
                "assignee_id": self.csm.pk,
            },
            user=self.mona,
        )
        self.assertEqual(response.status_code, 201, response.json())
        self.assertTrue(
            Notification.objects.filter(recipient=self.csm, kind="task_assigned").exists()
        )

    def test_refusals(self):
        today = self.today.isoformat()
        cases = (
            ({}, {"title": ["Give the task a title."]}),
            ({"title": "   "}, {"title": ["Give the task a title."]}),
            ({"title": 123}, {"title": ["Give the task a title."]}),
            ({"title": "x" * 256}, {"title": ["Keep the title under 255 characters."]}),
            ({"title": "x", "due_date": "soon"}, {"due_date": ["Choose a date."]}),
            ({"title": "x", "priority": "urgent"}, {"priority": ["Choose high, medium or low."]}),
            ({"title": "x", "customer_id": "pizza"}, {"customer_id": [OPENABLE]}),
            ({"title": "x", "assignee_id": "carl"}, {"assignee_id": ["Choose who does it."]}),
            (
                {
                    "title": "x",
                    "customer_id": self.pizza.pk,
                    "account_id": self.emea.pk,
                    "due_date": today,
                },
                {"record": ["Choose an organisation or an account, not both."]},
            ),
            (
                {"title": "x", "customer_id": self.soup.pk, "due_date": today},
                {"record": [OPENABLE]},
            ),
            (
                {"title": "x", "customer_id": self.globex.pk, "due_date": today},
                {"record": [OPENABLE]},
            ),
            ({"title": "x", "customer_id": 999_999, "due_date": today}, {"record": [OPENABLE]}),
            ({"title": "x", "customer_id": self.pizza.pk}, {"due_date": ["Choose a date."]}),
            (
                {"title": "x", "customer_id": self.pizza.pk, "due_date": None},
                {"due_date": ["Choose a date."]},
            ),
        )
        for body, error in cases:
            response = self.post(body)
            self.assertEqual((response.status_code, response.json()), (400, error), body)
        self.assertFalse(Task.objects.exists())

    def test_an_assignee_who_cannot_open_the_record(self):
        response = self.post(
            {
                "title": "x",
                "customer_id": self.pizza.pk,
                "due_date": self.today.isoformat(),
                "assignee_id": self.other.pk,
            }
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(),
            {"code": "ASSIGNEE_CANNOT_OPEN", "detail": "That person can't open this organisation."},
        )

    def test_signed_out_is_refused(self):
        from rest_framework.test import APIClient

        self.assertEqual(APIClient().post(TODOS, {"title": "x"}, format="json").status_code, 401)
