"""A Brain answer reaches a reader other than its asker only under the Brain
rule — same organisation, sees every account, reads every ticket department —
whoever that reader is: the conversation's owner and its accepted session
participants included, not only the people who are mentioned. The owner's
next send never feeds it to the model either. Every other surface's replies
are checked for them per reader too (`per_reader`, see
test_shared_reply_privacy); the Brain rule is one more check on top."""

from unittest.mock import patch

from services.accounts.models import User
from services.copilot.ask import SURFACES, AskContextSerializer
from services.copilot.context import Grounding
from services.copilot.models import (
    Conversation,
    CopilotSession,
    Message,
    SessionInvite,
    SessionParticipant,
)
from services.copilot.views import (
    REDACTED_REPLY,
    ask_snapshot,
    pipeline_snapshot,
    records_snapshot,
    sees_whole_conversation,
    tickets_snapshot,
    visible_messages,
)

from .brain_fixture import BrainAskFixture

ANSWER = "Team ARR is USD 400,000; Soup Co renews next."


class BrainTurns(BrainAskFixture):
    """Carl's conversation and the turns SendMessageView writes into it."""

    def setUp(self):
        self.task(self.csm, customer=self.pizza)
        self.conversation = Conversation.objects.create(
            organisation=self.org, user=self.csm, title="My book"
        )

    def store(self, author, context, grounding=None, fed=(), content=ANSWER, question="Why?"):
        """The two turns SendMessageView writes, with the snapshots it fixes."""
        if context is not None:
            checked = AskContextSerializer(data=context, context={"user": author})
            self.assertTrue(checked.is_valid(), checked.errors)
            context = checked.validated_data
            grounding = SURFACES[context["surface"]].ground(author, context, question)
        fed = list(fed)
        asked = Message.objects.create(
            conversation=self.conversation,
            role="user",
            content=question,
            author=author,
            context=context,
        )
        grounded, carries = ask_snapshot(author, context, grounding, fed)
        reply = Message.objects.create(
            conversation=self.conversation,
            role="assistant",
            content=content,
            sources=grounding.sources,
            grounded_customer_ids=grounded,
            carries_anomaly_text=carries,
            grounded_pipeline=pipeline_snapshot(context, grounding, fed),
            grounded_tickets=tickets_snapshot(context, grounding, fed),
            grounded_records=records_snapshot(context, grounding, fed),
            reply_to=asked,
        )
        return asked, reply

    def shown(self, user):
        reader = User.objects.get(pk=user.pk)
        return visible_messages(self.conversation, reader)

    def replies(self, user):
        return [m.content for m in self.shown(user) if m.role == "assistant"]

    def join(self, user):
        """`user` accepts the owner's invite into a live session."""
        session, _ = CopilotSession.objects.get_or_create(
            conversation=self.conversation, defaults={"status": CopilotSession.Status.LIVE}
        )
        SessionInvite.objects.create(
            session=session,
            invited_user=user,
            invited_by=self.conversation.user,
            status=SessionInvite.Status.ACCEPTED,
        )
        SessionParticipant.objects.create(session=session, user=user)
        self.assertTrue(sees_whole_conversation(self.conversation, user))


class BrainWholeReaderTests(BrainTurns):
    def test_the_owner_gets_the_redaction_for_a_mentioned_managers_team_answer(self):
        asked, _reply = self.store(self.mona, self.ask_context("team", "changed"))

        self.assertTrue(sees_whole_conversation(self.conversation, self.csm))
        self.assertEqual(self.replies(self.csm), [REDACTED_REPLY])
        # The question keeps its words, not the scope and tab it was asked on.
        question = next(m for m in self.shown(self.csm) if m.id == asked.id)
        self.assertEqual(question.content, "Why?")
        self.assertIsNone(question.context)

    def test_the_asker_always_reads_it(self):
        self.store(self.mona, self.ask_context("team", "changed"))

        self.assertEqual(self.replies(self.mona), [ANSWER])

    @patch("services.copilot.views.get_completion", return_value="Noted.")
    def test_the_owners_next_send_never_feeds_the_answer_to_the_model(self, completion):
        self.store(self.mona, self.ask_context("team", "changed"))

        response = self.post_ask(
            self.csm,
            self.ask_context("me", "waiting"),
            "And mine?",
            conversation_id=self.conversation.id,
        )

        self.assertEqual(response.status_code, 200, response.data)
        fed = completion.call_args.kwargs["messages"]
        self.assertNotIn(ANSWER, [m["content"] for m in fed])
        self.assertIn(REDACTED_REPLY, [m["content"] for m in fed])
        self.assertNotIn(ANSWER, str(response.data))

    def test_an_accepted_participant_gets_the_redaction(self):
        self.join(self.other)
        self.store(self.csm, self.ask_context("me", "waiting"))

        self.assertEqual(self.replies(self.other), [REDACTED_REPLY])
        self.assertEqual(self.replies(self.csm), [ANSWER])

    def test_a_participant_who_sees_everything_and_every_department_reads_it(self):
        self.join(self.admin)
        self.store(self.csm, self.ask_context("me", "waiting"))

        self.assertEqual(self.replies(self.admin), [ANSWER])

    def test_an_owner_who_sees_everything_and_every_department_reads_it(self):
        self.conversation = Conversation.objects.create(
            organisation=self.org, user=self.admin, title="Leadership"
        )
        self.store(self.mona, self.ask_context("team", "changed"))

        self.assertEqual(self.replies(self.admin), [ANSWER])

    def test_a_follow_up_fed_the_answer_is_withheld_from_the_owner_too(self):
        fed = self.store(self.mona, self.ask_context("team", "changed"))
        self.store(self.mona, None, Grounding("x"), fed, "Summary: " + ANSWER, "Summarise it.")

        self.assertEqual(self.replies(self.csm), [REDACTED_REPLY, REDACTED_REPLY])
        self.assertEqual(self.replies(self.mona), [ANSWER, "Summary: " + ANSWER])

    def test_a_leadership_owner_does_not_get_a_brain_fed_follow_up_someone_else_asked(self):
        # Accepted fail-closed: the follow-up's snapshot is unknown (None,
        # True), so only its asker reads it, even when the Brain answer it
        # was fed is readable to this owner.
        self.conversation = Conversation.objects.create(
            organisation=self.org, user=self.admin, title="Leadership"
        )
        fed = self.store(self.mona, self.ask_context("team", "changed"))
        self.store(self.mona, None, Grounding("x"), fed, "Summary: " + ANSWER, "Summarise it.")

        self.assertEqual(self.replies(self.admin), [ANSWER, REDACTED_REPLY])
        self.assertEqual(self.replies(self.mona), [ANSWER, "Summary: " + ANSWER])

    def test_other_surfaces_follow_their_own_rule_for_the_owner(self):
        # Mona's Dashboard book is hers (Soup Co), which Carl cannot open; her
        # plain reply cites nothing.
        self.store(
            self.mona,
            {
                "surface": "dashboard",
                "area": "health",
                "view": "triage",
                "filters": {"owner": "", "lifecycle": "", "customer": ""},
            },
            content="Dashboard answer.",
        )
        self.store(self.mona, None, Grounding("x"), content="Plain answer.")

        self.assertEqual(self.replies(self.csm), [REDACTED_REPLY, "Plain answer."])
        self.assertEqual(self.replies(self.mona), ["Dashboard answer.", "Plain answer."])

    def test_the_owner_is_not_shown_a_brain_origin_someone_else_asked(self):
        from services.copilot.views import header_for

        asked, _ = self.store(self.mona, self.ask_context("team", "changed"))
        Conversation.objects.filter(pk=self.conversation.pk).update(origin=asked.context)
        self.conversation.refresh_from_db()

        self.assertEqual(header_for(self.conversation, self.csm), ("My book", None))
        self.assertEqual(header_for(self.conversation, self.mona)[1], asked.context)

    def test_an_ask_fed_a_brain_fed_follow_up_is_withheld_once_the_answer_left_the_window(self):
        from services.copilot.views import HISTORY_WINDOW

        brain = self.store(self.mona, self.ask_context("team", "changed"))
        follow_up = self.store(self.mona, None, Grounding("x"), brain, "Summary: " + ANSWER)
        for n in range(HISTORY_WINDOW // 2 - 1):
            self.store(self.mona, None, Grounding("x"), (), f"Filler {n}.", f"Filler {n}?")
        fed = visible_messages(self.conversation, self.mona)[-HISTORY_WINDOW:]
        self.assertNotIn(brain[1].id, [m.id for m in fed])
        self.assertIn(follow_up[1].id, [m.id for m in fed])

        _asked, reply = self.store(
            self.mona,
            {
                "surface": "dashboard",
                "area": "health",
                "view": "triage",
                "filters": {"owner": "", "lifecycle": "", "customer": ""},
            },
            fed=fed,
            content="Dashboard answer repeating " + ANSWER,
        )

        self.assertEqual((reply.grounded_customer_ids, reply.carries_anomaly_text), (None, True))
        shown = {m.id: m.content for m in self.shown(self.csm)}
        self.assertEqual(shown[reply.id], REDACTED_REPLY)


class LeadershipUnknownTicketsTests(BrainAskFixture):
    def test_leadership_view_all_reads_a_brain_answer_whose_ticket_snapshot_is_unknown(self):
        from services.copilot.views import UNKNOWN, _reply_readable_by

        conversation = Conversation.objects.create(organisation=self.org, user=self.csm, title="x")
        checked = AskContextSerializer(
            data=self.ask_context("me", "waiting"), context={"user": self.csm}
        )
        self.assertTrue(checked.is_valid(), checked.errors)
        asked = Message.objects.create(
            conversation=conversation,
            role="user",
            content="Why?",
            author=self.csm,
            context=checked.validated_data,
        )
        reply = Message.objects.create(
            conversation=conversation,
            role="assistant",
            content=ANSWER,
            grounded_customer_ids=[self.pizza.pk],
            carries_anomaly_text=False,
            grounded_pipeline={"account_ids": [], "departments": []},
            grounded_tickets=UNKNOWN,
            grounded_records=[],
            reply_to=asked,
        )

        self.assertTrue(_reply_readable_by(reply, User.objects.get(pk=self.admin.pk), asked))
