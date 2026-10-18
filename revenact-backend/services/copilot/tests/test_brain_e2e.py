"""Ask on the Brain over HTTP: a manager asks on What changed in My team; a
CSM's answer, shared by @mention, reaches the asker and a view-all reader
whole and a teammate withheld; a slice reader's read cost stays flat."""

from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.accounts.models import User
from services.copilot.views import REDACTED_REPLY

from .brain_fixture import BrainAskFixture

ANSWER = "Dough Co's renewal is what to decide first."


@patch("services.copilot.views.get_completion", return_value=ANSWER)
class BrainAskEndToEndTests(BrainAskFixture):
    def messages(self, user, conversation_id):
        response = self.as_user(User.objects.get(pk=user.pk)).get(
            f"/api/v1/copilot/conversations/{conversation_id}/"
        )
        self.assertEqual(response.status_code, 200, response.data)
        return response.data["messages"]

    def test_a_manager_asks_on_what_changed_in_my_team(self, completion):
        context = self.ask_context("team", "changed")

        response = self.post_ask(self.mona, context, "Why did these numbers move?")

        self.assertEqual(response.status_code, 200, response.data)
        system = completion.call_args.kwargs["system"]
        self.assertEqual(completion.call_args.kwargs["purpose"], "brain")
        for line in (
            "Screen: Brain › What changed",
            "Scope: My team",
            "- ARR: USD 450,000;",
            "THE OTHER TABS:",
            "Waiting: ",
            "What's being done: ",
            "Customers: ",
        ):
            self.assertIn(line, system)
        self.assertEqual(response.data["origin"], context)
        [asked, reply] = response.data["messages"]
        self.assertEqual((asked["context"], reply["content"]), (context, ANSWER))

    def test_a_shared_answer_reaches_its_asker_and_view_all_but_not_a_teammate(self, completion):
        self.task(self.csm, customer=self.pizza)
        context = self.ask_context("me", "waiting")
        sent = self.post_ask(self.csm, context, "@Mona @Alice what should I decide first?")
        self.assertEqual(sent.status_code, 200, sent.data)
        conversation_id = sent.data["id"]

        for user in (self.csm, self.admin):
            with self.subTest(reader=user.name):
                asked, reply = self.messages(user, conversation_id)
                self.assertEqual((asked["context"], reply["content"]), (context, ANSWER))

        asked, reply = self.messages(self.mona, conversation_id)
        self.assertEqual(asked["content"], "@Mona @Alice what should I decide first?")
        self.assertIsNone(asked["context"])
        self.assertEqual(reply["content"], REDACTED_REPLY)

    def read_costs(self, replies):
        """(owner, view-all reader) query counts for one read of a
        conversation holding `replies` Brain answers."""
        conversation_id = None
        for _ in range(replies):
            extra = {"conversation_id": conversation_id} if conversation_id else {}
            sent = self.post_ask(
                self.csm, self.ask_context("me", "waiting"), "@Alice and next?", **extra
            )
            self.assertEqual(sent.status_code, 200, sent.data)
            conversation_id = sent.data["id"]
        costs = []
        for user in (self.csm, self.admin):
            with CaptureQueriesContext(connection) as queries:
                messages = self.messages(user, conversation_id)
            self.assertEqual([m["content"] for m in messages[1::2]], [ANSWER] * replies)
            costs.append(len(queries))
        return costs

    def test_a_view_all_reader_pays_a_flat_extra_however_many_answers(self, completion):
        self.task(self.csm, customer=self.pizza)
        owner_one, reader_one = self.read_costs(1)
        owner_four, reader_four = self.read_costs(4)

        self.assertEqual(reader_four - owner_four, reader_one - owner_one)
