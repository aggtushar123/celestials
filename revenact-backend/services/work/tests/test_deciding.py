"""Deciding a recommendation (spec §2.3, §4, §5): who may, assign (the task,
its why, its defaults, the assignee told) and dismiss (with a reason); one
decision only, the second told who decided."""

from datetime import timedelta
from unittest.mock import patch

from rest_framework.exceptions import NotFound

from core.models import AuditEvent
from services.accounts.models import User
from services.customers.models import Customer, Task
from services.notifications.models import Notification
from services.work import deciding
from services.work.models import Recommendation
from services.work.rec_access import decided_as
from services.work.tests.recommend_fixtures import RecommendFixture, task_proposal

FACTS = ("Renews in 30 days", "Renewal date 6 Nov")


class DecideFixture(RecommendFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.rec = cls.make_rec(
            on=cls.dough, recipient=cls.mona, suggested=cls.csm, value=30, facts=FACTS
        )

    def assign(self, user, body=None, rec=None):
        url = f"/api/v1/work/recommendations/{(rec or self.rec).pk}/assign/"
        return self.post(user, url, {"assignee_id": self.csm.pk} if body is None else body)

    def dismiss(self, user, body, rec=None):
        return self.post(
            user, f"/api/v1/work/recommendations/{(rec or self.rec).pk}/dismiss/", body
        )

    def fresh(self, rec=None):
        return Recommendation.objects.get(pk=(rec or self.rec).pk)


class WhoDecidesTests(DecideFixture):
    def test_the_recipient_anyone_above_the_suggested_person_and_view_all(self):
        self.assertEqual(decided_as(self.mona, self.rec), "recipient")
        self.assertEqual(decided_as(self.admin, self.rec), "company")
        self.assertIsNone(decided_as(self.csm, self.rec))
        self.assertIsNone(decided_as(self.other, self.rec))
        self.assertIsNone(decided_as(self.lee, self.rec))
        User.objects.filter(pk=self.mona.pk).update(reports_to=self.lee)
        self.assertEqual(decided_as(User.objects.get(pk=self.lee.pk), self.rec), "chain")

    def test_404_then_403_then_400_then_409(self):
        # Gus is another workspace; Dana cannot open Dough Co; Lee cannot either.
        for outsider in (self.stranger, self.other, self.lee):
            with self.subTest(reader=outsider.name):
                response = self.assign(outsider)
                self.assertEqual(
                    (response.status_code, response.data),
                    (404, {"detail": "No such recommendation."}),
                )
        response = self.assign(self.csm)
        self.assertEqual(
            (response.status_code, response.data),
            (403, {"code": "CANT_DECIDE", "detail": "You can't decide this recommendation."}),
        )
        Recommendation.objects.filter(pk=self.rec.pk).update(status="expired")
        self.assertEqual(self.assign(self.csm).status_code, 403)
        self.assertEqual(self.assign(self.mona, {}).status_code, 400)
        self.assertEqual(self.assign(self.mona).status_code, 409)


class UnderTheLockTests(DecideFixture):
    """What changed between the route's checks and the row lock."""

    def meanwhile(self, **changes):
        """Change the row just before it is locked (a refresh re-routing it)."""
        real = deciding._locked

        def locked(*args, **kwargs):
            Recommendation.objects.filter(pk=self.rec.pk).update(**changes)
            return real(*args, **kwargs)

        return patch.object(deciding, "_locked", side_effect=locked)

    def test_a_row_gone_before_the_lock_is_not_found(self):
        for decide in (
            lambda: deciding.assign(self.mona, 999_999, assignee_id=self.csm.pk, today=self.today),
            lambda: deciding.dismiss(self.mona, 999_999, reason="not_relevant"),
        ):
            with self.assertRaises(NotFound) as caught:
                decide()
            self.assertEqual(str(caught.exception.detail), "No such recommendation.")

    def test_rerouted_away_from_the_reader_is_403(self):
        with self.meanwhile(recipient=self.other, suggested_assignee=self.other):
            assigned = self.assign(self.mona)
            dismissed = self.dismiss(self.mona, {"reason": "not_relevant"})
        for response in (assigned, dismissed):
            self.assertEqual(
                (response.status_code, response.data),
                (403, {"code": "CANT_DECIDE", "detail": "You can't decide this recommendation."}),
            )
        self.assertEqual(self.fresh().status, "open")
        self.assertFalse(Task.objects.filter(customer=self.dough).exists())
        self.assertFalse(AuditEvent.objects.filter(action__startswith="work.recommendation_"))

    def test_the_audit_records_the_role_held_under_the_lock(self):
        # No longer Mona's to receive, but Carl still reports to her.
        with self.meanwhile(recipient=self.other):
            response = self.assign(self.mona)
        self.assertEqual(response.status_code, 201, response.data)
        event = AuditEvent.objects.get(action="work.recommendation_assign")
        self.assertEqual(event.metadata["decided_as"], "chain")


class AssignTests(DecideFixture):
    def test_assigning_makes_the_task_with_its_why_and_tells_the_assignee(self):
        response = self.assign(self.mona)
        self.assertEqual(response.status_code, 201, response.data)
        task = Task.objects.get(pk=response.data["task"]["id"])
        self.assertEqual(
            (task.customer, task.assignee, task.created_by, task.source),
            (self.dough, self.csm, self.mona, "recommendation"),
        )
        self.assertEqual(
            (task.title, task.priority, task.due_date),
            ("Prepare Dough Co's renewal", "high", self.today + timedelta(days=23)),
        )
        self.assertEqual(
            task.description, "Recommended by Revenact:\n- Renews in 30 days\n- Renewal date 6 Nov"
        )
        self.assertEqual(
            list(task.events.values_list("kind", "actor", "data")),
            [
                (
                    "created",
                    self.mona.pk,
                    {
                        "source": "recommendation",
                        "assignee": {"id": self.csm.pk, "name": "Carl CSM"},
                        "recommendation": self.rec.pk,
                    },
                ),
                ("recommended", self.mona.pk, {"facts": list(FACTS)}),
            ],
        )
        note = Notification.objects.get(recipient=self.csm, kind="task_assigned")
        self.assertEqual(
            note.message, "Mona Manager assigned you “Prepare Dough Co's renewal” on Dough Co."
        )
        rec = self.fresh()
        self.assertEqual((rec.status, rec.task, rec.decided_by), ("assigned", task, self.mona))
        self.assertEqual(
            response.data["recommendation"],
            {
                "id": self.rec.pk,
                "status": "assigned",
                "decided_by": {"id": self.mona.pk, "name": "Mona Manager"},
                "decided_at": response.data["recommendation"]["decided_at"],
                "task_id": task.pk,
                "dismiss_reason": "",
                "dismiss_note": "",
            },
        )
        self.assertIsNotNone(response.data["recommendation"]["decided_at"])
        self.assertEqual(
            (response.data["task"]["id"], response.data["task"]["source"]),
            (task.pk, "recommendation"),
        )
        event = AuditEvent.objects.get(action="work.recommendation_assign")
        self.assertEqual(
            event.metadata, {"kind": "renewal_due", "decided_as": "recipient", "task": task.pk}
        )

    def test_the_decider_may_change_the_title_date_and_priority(self):
        due = self.today + timedelta(days=4)
        response = self.assign(
            self.mona,
            {
                "assignee_id": self.csm.pk,
                "title": "Call Dough Co",
                "due_date": due.isoformat(),
                "priority": "low",
            },
        )
        task = Task.objects.get(pk=response.data["task"]["id"])
        self.assertEqual((task.title, task.due_date, task.priority), ("Call Dough Co", due, "low"))

    def test_view_all_decides_as_company(self):
        response = self.assign(self.admin)
        self.assertEqual(response.status_code, 201, response.data)
        event = AuditEvent.objects.get(action="work.recommendation_assign")
        self.assertEqual(event.metadata["decided_as"], "company")

    def test_assigning_to_yourself_tells_nobody(self):
        response = self.assign(self.mona, {"assignee_id": self.mona.pk})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertFalse(Notification.objects.filter(kind="task_assigned").exists())

    def test_the_assignee_must_be_able_to_open_the_record(self):
        response = self.assign(self.mona, {"assignee_id": self.other.pk})
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
        self.assertEqual(self.fresh().status, "open")
        self.assertFalse(Task.objects.filter(source="recommendation").exists())

    def test_an_account_recommendation_makes_the_accounts_task(self):
        east = self.make_rec(on=self.east, recipient=self.mona, suggested=self.csm)
        response = self.assign(self.mona, rec=east)
        self.assertEqual(response.status_code, 201, response.data)
        task = Task.objects.get(pk=response.data["task"]["id"])
        self.assertEqual((task.account, task.customer), (self.east, None))
        response = self.assign(self.mona, {"assignee_id": self.other.pk}, rec=east)
        self.assertEqual(response.status_code, 409)

    def test_the_body_is_checked(self):
        cases = [
            ({}, {"assignee_id": ["Choose who does it."]}),
            ({"assignee_id": None}, {"assignee_id": ["Choose who does it."]}),
            ({"assignee_id": "carl"}, {"assignee_id": ["Choose who does it."]}),
            ({"assignee_id": self.csm.pk, "due_date": "soon"}, {"due_date": ["Choose a date."]}),
            (
                {"assignee_id": self.csm.pk, "priority": "urgent"},
                {"priority": ["Choose high, medium or low."]},
            ),
            ({"assignee_id": self.csm.pk, "title": ""}, {"title": ["Give the task a title."]}),
            (
                {"assignee_id": self.csm.pk, "title": "x" * 256},
                {"title": ["Keep the title under 255 characters."]},
            ),
        ]
        for body, errors in cases:
            with self.subTest(body=body):
                response = self.assign(self.mona, body)
                self.assertEqual((response.status_code, response.data), (400, errors))
        self.assertEqual(self.fresh().status, "open")

    def test_a_second_decision_is_told_who_decided(self):
        self.assign(self.mona)
        response = self.assign(self.admin)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            (response.data["code"], response.data["detail"]),
            ("ALREADY_DECIDED", "Mona Manager already assigned this."),
        )
        self.assertEqual(response.data["recommendation"]["status"], "assigned")
        self.assertEqual(Task.objects.filter(source="recommendation").count(), 1)

    def test_an_expired_one_says_so(self):
        Recommendation.objects.filter(pk=self.rec.pk).update(status="expired")
        response = self.assign(self.mona)
        self.assertEqual(
            (response.status_code, response.data["detail"]),
            (409, "This recommendation has expired."),
        )


class DismissTests(DecideFixture):
    def test_dismissing_keeps_its_reason(self):
        response = self.dismiss(self.mona, {"reason": "already_handled", "note": "ignored"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            {
                k: response.data["recommendation"][k]
                for k in ("status", "dismiss_reason", "dismiss_note")
            },
            {"status": "dismissed", "dismiss_reason": "already_handled", "dismiss_note": ""},
        )
        rec = self.fresh()
        self.assertEqual((rec.status, rec.decided_by, rec.task), ("dismissed", self.mona, None))
        event = AuditEvent.objects.get(action="work.recommendation_dismiss")
        self.assertEqual(
            event.metadata,
            {"kind": "renewal_due", "decided_as": "recipient", "reason": "already_handled"},
        )

    def test_other_needs_its_text(self):
        response = self.dismiss(self.mona, {"reason": "other", "note": "  "})
        self.assertEqual((response.status_code, response.data), (400, {"note": ["Say why."]}))
        response = self.dismiss(self.mona, {"reason": "other", "note": "Moving to annual billing"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.fresh().dismiss_note, "Moving to annual billing")

    def test_the_reason_is_one_of_the_list(self):
        message = "Choose already handled, not relevant, wrong person or other."
        for body in ({}, {"reason": "bored"}, {"reason": None}):
            with self.subTest(body=body):
                response = self.dismiss(self.mona, body)
                self.assertEqual(
                    (response.status_code, response.data), (400, {"reason": [message]})
                )
        response = self.dismiss(self.mona, {"reason": "other", "note": "x" * 256})
        self.assertEqual(response.data, {"note": ["Keep the note under 255 characters."]})

    def test_the_note_is_checked_only_for_other(self):
        response = self.dismiss(self.mona, {"reason": "not_relevant", "note": "x" * 600})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.fresh().dismiss_note, "")

    def test_others_note_may_be_255_characters_after_trimming(self):
        response = self.dismiss(self.mona, {"reason": "other", "note": f"  {'x' * 255}  "})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.fresh().dismiss_note, "x" * 255)

    def test_dismissed_then_assigned_is_409_naming_the_decider(self):
        self.dismiss(self.mona, {"reason": "wrong_person"})
        response = self.assign(self.admin)
        self.assertEqual(
            (response.status_code, response.data["detail"]),
            (409, "Mona Manager already dismissed this."),
        )

    def test_outsiders_cannot_dismiss(self):
        self.assertEqual(self.dismiss(self.other, {"reason": "not_relevant"}).status_code, 404)
        self.assertEqual(self.dismiss(self.csm, {"reason": "not_relevant"}).status_code, 403)
        self.assertEqual(self.fresh().status, "open")


class AgentDecisionTests(DecideFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.proposal = task_proposal(cls.org, cls.dough, due_in=10, priority="medium")
        cls.agent_rec = cls.make_rec(
            "agent_action",
            on=cls.dough,
            recipient=cls.mona,
            suggested=cls.csm,
            agent_action=cls.proposal,
            title="Call the exec sponsor",
            facts=("Proposed by the AI agent", "The agent suggested Carl CSM"),
        )

    def test_a_gone_organisation_takes_its_recommendations_with_it(self):
        Customer.objects.filter(pk=self.dough.pk).delete()
        self.assertFalse(Recommendation.objects.filter(pk=self.agent_rec.pk).exists())
