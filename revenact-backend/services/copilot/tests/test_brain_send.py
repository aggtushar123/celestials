"""POST /api/v1/copilot/messages/ from the Brain: validated, grounded,
metered as `brain`, charged an AI credit, the context stored."""

from types import SimpleNamespace
from unittest.mock import patch

from rest_framework import serializers

from services.billing import accounts, ledger
from services.copilot import anthropic_client
from services.copilot.anthropic_client import (
    BudgetExceeded,
    CopilotNotConfigured,
    CopilotRequestFailed,
)
from services.copilot.brain_context import NOT_YOUR_VIEW
from services.copilot.models import Conversation, Message, ModelCall

from .brain_fixture import BrainAskFixture

EMPTY = {"account_ids": [], "departments": []}


@patch("services.copilot.views.get_completion", return_value="ARR held; Dough Co renews soon.")
class BrainSendTests(BrainAskFixture):
    def test_an_answer_is_grounded_on_the_tab_and_metered_as_brain(self, completion):
        response = self.post_ask(self.csm, self.ask_context("me", "changed"))

        self.assertEqual(response.status_code, 200, response.data)
        kwargs = completion.call_args.kwargs
        self.assertEqual(kwargs["purpose"], "brain")
        self.assertIn("Brain data:\n<dashboard_data>", kwargs["system"])
        self.assertIn("Screen: Brain › What changed", kwargs["system"])
        self.assertIn("- ARR: USD 400,000;", kwargs["system"])

    def test_the_context_is_stored_and_is_the_origin(self, completion):
        context = {**self.ask_context("team", "waiting"), "label": "Spoofed"}

        data = self.post_ask(self.mona, context).data

        stored = {"surface": "brain", "scope": "team", "tab": "waiting"}
        self.assertEqual(data["origin"], stored)
        self.assertEqual(data["messages"][0]["context"], stored)
        listed = self.as_user(self.mona).get("/api/v1/copilot/conversations/").data
        self.assertEqual(listed[0]["origin"], stored)

    def test_one_conversation_spans_tabs_and_scopes(self, completion):
        first = self.post_ask(self.mona, self.ask_context("me", "changed")).data

        second = self.post_ask(
            self.mona,
            self.ask_context("team", "doing"),
            "And what is being done?",
            conversation_id=first["id"],
        )

        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(second.data["origin"], first["origin"])
        self.assertIn("Screen: Brain › What's being done", completion.call_args.kwargs["system"])

    def test_the_reply_stores_its_snapshot(self, completion):
        self.task(self.csm, customer=self.pizza)

        self.post_ask(self.csm, self.ask_context("me", "waiting"))

        reply = Message.objects.get(role="assistant")
        self.assertEqual(reply.grounded_customer_ids, [self.pizza.pk])
        self.assertIs(reply.carries_anomaly_text, False)
        self.assertEqual(reply.grounded_pipeline, EMPTY)
        self.assertEqual(reply.grounded_tickets, EMPTY)
        self.assertEqual(reply.grounded_records, [])
        self.assertEqual(reply.sources, [])

    def test_a_refused_context_is_a_400_before_the_model_is_called(self, completion):
        account = accounts.ensure(self.org)
        before = ledger.balance(account)
        cases = (
            (self.csm, self.ask_context("team", "changed"), {"scope": [NOT_YOUR_VIEW]}),
            (self.mona, self.ask_context("company", "changed"), {"scope": [NOT_YOUR_VIEW]}),
            (self.csm, self.ask_context("everyone", "changed"), {"scope": [NOT_YOUR_VIEW]}),
            (
                self.csm,
                self.ask_context("me", "graph"),
                {"tab": ['"graph" is not a valid choice.']},
            ),
        )
        for user, context, errors in cases:
            with self.subTest(context=context):
                response = self.post_ask(user, context)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data, {"context": errors})
        completion.assert_not_called()
        self.assertFalse(Conversation.objects.exists())
        self.assertFalse(Message.objects.exists())
        self.assertEqual(ledger.balance(account), before)

    def test_a_scope_lost_between_validation_and_grounding_is_the_same_400(self, completion):
        refused = serializers.ValidationError({"scope": [NOT_YOUR_VIEW]})
        with patch("services.copilot.brain_grounding.resolved_scope", side_effect=refused):
            response = self.post_ask(self.csm, self.ask_context("me", "changed"))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data, {"context": {"scope": [NOT_YOUR_VIEW]}})
        completion.assert_not_called()
        self.assertFalse(Conversation.objects.exists())

    def test_model_failures_map_to_429_503_and_502_and_leave_no_trace(self, completion):
        for exc, code in (
            (BudgetExceeded("Monthly budget reached"), 429),
            (CopilotNotConfigured("Not set up"), 503),
            (CopilotRequestFailed("Upstream failed"), 502),
        ):
            with self.subTest(code=code):
                completion.side_effect = exc
                response = self.post_ask(self.csm, self.ask_context("me", "customers"))
                self.assertEqual(response.status_code, code)
                self.assertFalse(Conversation.objects.exists())
                self.assertFalse(Message.objects.exists())


class FakeMessages:
    def create(self, **kwargs):
        return SimpleNamespace(
            content=[SimpleNamespace(type="text", text="An answer.")],
            usage=SimpleNamespace(input_tokens=10, output_tokens=5),
        )


class BrainCreditTests(BrainAskFixture):
    """Not stubbed above the client: the real budget and credit path runs."""

    def test_a_brain_answer_is_metered_and_charges_one_credit(self):
        account = accounts.ensure(self.org)
        client = SimpleNamespace(messages=FakeMessages())
        with patch.object(
            anthropic_client, "_build_client_and_model", return_value=(client, "model-x")
        ):
            response = self.post_ask(self.csm, self.ask_context("me", "doing"))

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(ledger.balance(account), 199)
        call = ModelCall.objects.get()
        self.assertEqual((call.purpose, call.outcome, call.user_id), ("brain", "ok", self.csm.pk))
