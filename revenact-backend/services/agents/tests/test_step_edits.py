"""A person's edits to a step (contract §2, D11): only the kind's editable
keys, each checked with the sentences the same field has elsewhere."""

from datetime import timedelta

from services.agents.kinds import FieldErrors
from services.agents.registry import REGISTRY
from services.agents.tests.bundle_fixtures import BundleFixture


class TaskEditTests(BundleFixture):
    def task(self):
        payload = {
            "title": "Book a save call",
            "assignee_id": None,
            "assignee_name": "",
            "due_date": (self.today + timedelta(days=3)).isoformat(),
            "priority": "medium",
        }
        return self.step(self.pizza, kind="task.create", payload=payload)

    def edit(self, step, fields, runner=None):
        return REGISTRY["task.create"].edit(step, fields, runner or self.fresh(self.csm))

    def test_title_priority_date_and_assignee(self):
        step = self.task()
        due = (self.today + timedelta(days=5)).isoformat()
        payload = self.edit(
            step,
            {
                "title": "Call the sponsor",
                "priority": "high",
                "due_date": due,
                "assignee_id": self.csm.pk,
            },
        )
        self.assertEqual(
            payload,
            {
                "title": "Call the sponsor",
                "assignee_id": self.csm.pk,
                "assignee_name": "Carl CSM",
                "due_date": due,
                "priority": "high",
            },
        )
        self.assertEqual(
            REGISTRY["task.create"].editable, ("title", "assignee_id", "due_date", "priority")
        )

    def test_refusals_use_the_task_sentences(self):
        step = self.task()
        cases = [
            ({"title": ""}, {"title": ["Give the task a title."]}),
            ({"priority": "urgent"}, {"priority": ["Choose high, medium or low."]}),
            ({"due_date": "soon"}, {"due_date": ["Choose a date."]}),
            (
                {"due_date": (self.today - timedelta(days=1)).isoformat()},
                {"due_date": ["Choose today or a later date."]},
            ),
            (
                {"assignee_id": self.other.pk},
                {"assignee_id": ["That person can't open this organisation."]},
            ),
        ]
        for fields, errors in cases:
            with self.subTest(fields=fields), self.assertRaises(FieldErrors) as caught:
                self.edit(step, fields)
            self.assertEqual(caught.exception.errors, errors)


class NoteDraftCampaignEditTests(BundleFixture):
    def test_note(self):
        step = self.step(self.pizza, kind="note.create", payload={"title": "T", "body": "B"})
        spec = REGISTRY["note.create"]
        self.assertEqual(
            spec.edit(step, {"body": "New"}, self.fresh(self.csm)), {"title": "T", "body": "New"}
        )
        with self.assertRaises(FieldErrors) as caught:
            spec.edit(step, {"title": " ", "body": "x" * 4001}, self.fresh(self.csm))
        self.assertEqual(
            caught.exception.errors,
            {"title": ["Give the note a title."], "body": ["Keep the note under 4000 characters."]},
        )

    def test_draft_reply(self):
        spec = REGISTRY["draft.reply"]
        self.assertEqual(spec.editable, ("body",))
        step = self.step(self.pizza, kind="note.create", payload={"ticket_id": 1, "body": "Hi"})
        self.assertEqual(
            spec.edit(step, {"body": "Hello"}, None), {"ticket_id": 1, "body": "Hello"}
        )
        with self.assertRaises(FieldErrors) as caught:
            spec.edit(step, {"body": ""}, None)
        self.assertEqual(caught.exception.errors, {"body": ["Write the reply."]})

    def test_campaign(self):
        from services.agents.tests.builder_fixtures import builder_action, definition

        payload = {
            "name": "Check-in",
            "segment": definition(),
            "roles": ["champion"],
            "subject": "Hello",
            "body": "Hi {first_name}",
        }
        step = builder_action(self.org, "campaign.create", payload)
        spec = REGISTRY["campaign.create"]
        edited = spec.edit(step, {"subject": "Quick check-in"}, self.fresh(self.admin))
        self.assertEqual(edited, {**payload, "subject": "Quick check-in"})
        with self.assertRaises(FieldErrors) as caught:
            spec.edit(step, {"body": "Hi {nickname}", "name": ""}, self.fresh(self.admin))
        self.assertEqual(set(caught.exception.errors), {"body", "name"})

    def test_campaign_uses_the_kinds_own_limits(self):
        from services.agents.tests.builder_fixtures import builder_action, definition

        payload = {
            "name": "Check-in",
            "segment": definition(),
            "roles": ["champion"],
            "subject": "Hello",
            "body": "Hi",
        }
        step = builder_action(self.org, "campaign.create", payload)
        spec = REGISTRY["campaign.create"]
        with self.assertRaises(FieldErrors) as caught:
            spec.edit(step, {"body": "x" * 5001, "subject": ""}, self.fresh(self.admin))
        self.assertEqual(
            caught.exception.errors,
            {
                "body": ["Keep the message under 5000 characters."],
                "subject": ["Write a subject."],
            },
        )
