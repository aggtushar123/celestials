"""The facilitator: a session's decisions into the review queue."""

from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from services.accounts.models import User
from services.agents.tests.bundle_fixtures import run_one
from services.copilot.models import (
    Conversation,
    CopilotSession,
    Message,
    SessionEvent,
    SessionInvite,
    SessionParticipant,
)
from services.customers.models import Customer, Task
from services.metrics import facilitator
from services.metrics.models import AgentAction

from .test_proposals import _org

PATH = "services.metrics.facilitator.get_completion"


def _session(org, owner, teammate, customer):
    """A live session about `customer` where the owner opened, the teammate
    joined and took the action on."""
    conversation = Conversation.objects.create(
        organisation=org, user=owner, title="What do we do about Fine?"
    )
    session = CopilotSession.objects.create(
        conversation=conversation, customer=customer, status=CopilotSession.Status.LIVE
    )
    SessionParticipant.objects.create(session=session, user=owner)
    SessionInvite.objects.create(
        session=session,
        invited_user=teammate,
        invited_by=owner,
        status=SessionInvite.Status.ACCEPTED,
    )
    SessionParticipant.objects.create(session=session, user=teammate)
    Message.objects.create(
        conversation=conversation,
        role=Message.Role.USER,
        content="Fine's champion just left. What should we do?",
    )
    Message.objects.create(
        conversation=conversation,
        role=Message.Role.ASSISTANT,
        content="Consider an exec sponsor call and a seat-usage review.",
    )
    reply = Message.objects.create(
        conversation=conversation,
        role=Message.Role.USER,
        content="Agreed — I'll book the exec sponsor call this week.",
    )
    SessionEvent.objects.create(
        session=session, kind=SessionEvent.Kind.REDIRECTED, actor=teammate, message=reply
    )
    SessionEvent.objects.create(
        session=session,
        kind=SessionEvent.Kind.HANDED_OFF,
        actor=owner,
        payload={"to_user_id": teammate.id, "to_user_name": teammate.name, "note": "your account"},
    )
    return session


def _answer(customer_id):
    return f"""[
  {{"kind": "task", "title": "Book the exec sponsor call with Fine",
    "rationale": "Carl agreed to book it this week after the champion left.",
    "evidence": ["Carl: Agreed — I'll book the exec sponsor call this week."],
    "initiative_id": null,
    "action": {{"customer_id": {customer_id}, "title": "Exec sponsor call: Fine",
                "assignee": "Carl", "due_in_days": 7, "priority": "high"}}}}
]"""


class EvidenceTests(TestCase):
    def setUp(self):
        self.org, self.admin, self.carl, self.b, self.shaky = _org()
        self.fine = Customer.objects.get(organisation=self.org, name="Fine")
        self.session = _session(self.org, self.admin, self.carl, self.fine)

    def test_the_prompt_carries_the_transcript_with_authors_and_the_sessions_account(self):
        evidence = facilitator.build_evidence(self.session, self.admin)
        prompt = facilitator.build_prompt(evidence)

        self.assertIn("Alice: Fine's champion just left.", prompt)
        self.assertIn("Copilot: Consider an exec sponsor call", prompt)
        self.assertIn("Carl: Agreed — I'll book the exec sponsor call", prompt)
        self.assertIn("Took part: Alice, Carl", prompt)
        self.assertIn('Alice handed off to Carl — "your account"', prompt)
        self.assertIn(f"About: Fine (account id {self.fine.id})", prompt)
        # Fine carries no downside, so the Ops agent never lists it — the
        # facilitator adds it so a task on it validates.
        self.assertIn(self.fine.id, {a["id"] for a in evidence["accounts"]})
        self.assertIn(f"- {self.fine.id}: Fine — account owner Carl", prompt)

    def test_decisions_already_captured_are_shown_so_they_are_not_repeated(self):
        with patch(PATH, return_value=_answer(self.fine.id)):
            facilitator.capture_decisions(self.session, requested_by=self.admin)

        prompt = facilitator.build_prompt(facilitator.build_evidence(self.session, self.admin))

        self.assertIn("ALREADY CAPTURED FROM THIS SESSION (do not repeat):", prompt)
        self.assertIn("- [task] Book the exec sponsor call with Fine (proposed)", prompt)

    def test_the_prompt_carries_what_other_functions_wrote_about_the_account(self):
        from services.knowledge.models import Contribution

        priya = User.objects.create_user(
            email="priya@acme.io",
            password="x",
            name="Priya",
            organisation=self.org,
            role=User.Role.CSM,
            function=User.Function.ENGINEERING,
        )
        Contribution.objects.create(
            organisation=self.org,
            customer=self.fine,
            author=priya,
            function="engineering",
            body="Their SSO breaks on token refresh; fix ships 25 Sep.",
        )
        other = Customer.objects.get(organisation=self.org, name="Pizza Hut")
        Contribution.objects.create(
            organisation=self.org,
            customer=other,
            author=priya,
            function="engineering",
            body="Unrelated account note.",
        )

        prompt = facilitator.build_prompt(facilitator.build_evidence(self.session, self.admin))

        self.assertIn("WHAT THE COMPANY KNOWS ABOUT FINE (function, person, date):", prompt)
        self.assertIn("- Engineering (Priya,", prompt)
        self.assertIn("SSO breaks on token refresh", prompt)
        self.assertNotIn("Unrelated account note", prompt)

    def test_a_session_nobody_has_spoken_in_has_nothing_to_decide(self):
        Message.objects.filter(conversation=self.session.conversation).delete()

        with self.assertRaises(facilitator.NothingToDecideFrom):
            facilitator.build_evidence(self.session, self.admin)


class CaptureTests(TestCase):
    def setUp(self):
        self.org, self.admin, self.carl, self.b, self.shaky = _org()
        self.fine = Customer.objects.get(organisation=self.org, name="Fine")
        self.session = _session(self.org, self.admin, self.carl, self.fine)

    def test_decisions_are_stored_as_proposals_tagged_with_the_session(self):
        with patch(PATH, return_value=_answer(self.fine.id)) as call:
            stored = facilitator.capture_decisions(self.session, requested_by=self.carl)

        self.assertEqual(call.call_args.kwargs["purpose"], "facilitator")
        self.assertEqual(len(stored), 1)
        proposal = stored[0]
        self.assertEqual(proposal.session, self.session)
        self.assertEqual(proposal.kind, AgentAction.Kind.TASK_CREATE)
        self.assertEqual(proposal.customer_id, self.fine.id)
        self.assertEqual(proposal.payload["assignee_name"], "Carl")
        self.assertEqual(proposal.generated_by, self.carl)
        self.assertEqual(proposal.status, AgentAction.Status.PROPOSED)

    def test_an_array_wrapped_in_prose_is_still_read(self):
        wrapped = (
            "Here is what the participants decided:\n"
            + _answer(self.fine.id)
            + "\nLet me know if you need anything else."
        )
        with patch(PATH, return_value=wrapped):
            stored = facilitator.capture_decisions(self.session, requested_by=self.admin)
        self.assertEqual([p.title for p in stored], ["Book the exec sponsor call with Fine"])

    def test_a_session_where_nothing_was_decided_stores_nothing(self):
        with patch(PATH, return_value="[]"):
            self.assertEqual(
                facilitator.capture_decisions(self.session, requested_by=self.admin), []
            )


class DecisionsViewTests(APITestCase):
    def setUp(self):
        self.org, self.admin, self.carl, self.b, self.shaky = _org()
        self.fine = Customer.objects.get(organisation=self.org, name="Fine")
        self.session = _session(self.org, self.admin, self.carl, self.fine)
        self.stranger = User.objects.create_user(
            email="zed@acme.io", password="x", name="Zed", organisation=self.org
        )
        self.url = (
            f"/api/v1/copilot/conversations/{self.session.conversation_id}/session/decisions/"
        )
        # Zed's own customer, with no org-chart link to Carl: Carl cannot
        # open it even though he's a present participant in a session about
        # it (privacy contract, 2026-10-06).
        self.secret = Customer.objects.create(
            organisation=self.org,
            name="Secret Co",
            owner=self.stranger,
            arr_billed_at_account=50_000,
        )
        self.secret_session = _session(self.org, self.admin, self.carl, self.secret)
        self.secret_url = (
            f"/api/v1/copilot/conversations/{self.secret_session.conversation_id}"
            "/session/decisions/"
        )

    def test_a_participant_captures_and_lists_the_sessions_decisions(self):
        self.client.force_authenticate(self.carl)
        with patch(PATH, return_value=_answer(self.fine.id)):
            response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        (row,) = response.data["proposals"]
        self.assertEqual(row["source"]["title"], "What do we do about Fine?")
        self.assertEqual(row["source"]["conversation_id"], self.session.conversation_id)

        listed = self.client.get(self.url)
        self.assertEqual([p["id"] for p in listed.data["proposals"]], [row["id"]])

    def test_someone_outside_the_session_cannot_see_or_ask(self):
        self.client.force_authenticate(self.stranger)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_404_NOT_FOUND)
        with patch(PATH) as call:
            self.assertEqual(self.client.post(self.url).status_code, status.HTTP_404_NOT_FOUND)
        call.assert_not_called()

    def test_a_conversation_without_a_session_is_404(self):
        lone = Conversation.objects.create(organisation=self.org, user=self.admin, title="Solo")
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/v1/copilot/conversations/{lone.id}/session/decisions/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_a_silent_session_is_422_without_a_model_call(self):
        Message.objects.filter(conversation=self.session.conversation).delete()
        self.client.force_authenticate(self.admin)
        with patch(PATH) as call:
            response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)
        call.assert_not_called()

    def test_evidence_and_rationale_are_withheld_from_a_non_view_all_participant(self):
        self.client.force_authenticate(self.carl)
        with patch(PATH, return_value=_answer(self.fine.id)):
            response = self.client.post(self.url)

        self.assertEqual(response.data["hidden"], 0)
        (row,) = response.data["proposals"]
        self.assertEqual(row["evidence"], [])
        self.assertIsNone(row["rationale"])
        self.assertEqual(row["action"]["customer_id"], self.fine.id)

        listed = self.client.get(self.url)
        self.assertEqual(listed.data["hidden"], 0)
        (listed_row,) = listed.data["proposals"]
        self.assertEqual(listed_row["evidence"], [])
        self.assertIsNone(listed_row["rationale"])

    def test_a_task_naming_a_customer_the_participant_cannot_open_is_hidden(self):
        self.client.force_authenticate(self.carl)
        with patch(PATH, return_value=_answer(self.secret.id)):
            response = self.client.post(self.secret_url)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["proposals"], [])
        self.assertEqual(response.data["hidden"], 1)

        listed = self.client.get(self.secret_url)
        self.assertEqual(listed.data["proposals"], [])
        self.assertEqual(listed.data["hidden"], 1)

    def test_a_view_all_reader_sees_the_full_payload_with_hidden_zero(self):
        self.client.force_authenticate(self.admin)
        with patch(PATH, return_value=_answer(self.secret.id)):
            response = self.client.post(self.secret_url)

        self.assertEqual(response.data["hidden"], 0)
        (row,) = response.data["proposals"]
        self.assertTrue(row["evidence"])
        self.assertTrue(row["rationale"])
        self.assertEqual(row["action"]["customer_id"], self.secret.id)

        listed = self.client.get(self.secret_url)
        self.assertEqual(listed.data["hidden"], 0)
        (listed_row,) = listed.data["proposals"]
        self.assertTrue(listed_row["evidence"])
        self.assertTrue(listed_row["rationale"])

    def test_approving_in_activity_creates_the_task_and_keeps_the_source(self):
        self.client.force_authenticate(self.admin)
        with patch(PATH, return_value=_answer(self.fine.id)):
            (row,) = self.client.post(self.url).data["proposals"]

        response = run_one(self.client, AgentAction.objects.get(pk=row["id"]))

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["bundle"]["steps"][0]["status"], "applied")
        self.assertEqual(AgentAction.objects.get(pk=row["id"]).session_id, self.session.id)
        task = Task.objects.get(customer=self.fine)
        self.assertEqual(task.title, "Exec sponsor call: Fine")
        self.assertEqual(task.assignee_name, "Carl")
        self.assertEqual(task.due_date, timezone.localdate() + timedelta(days=7))
