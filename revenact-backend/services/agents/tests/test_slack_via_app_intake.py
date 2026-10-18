"""SE4-16: a reply we posted as a person answers the thread and reads as
ours in the agent's lines; SE4-7, contract §2: the thread's facts the
escalation reads."""

from services.agents import intake
from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors.models import SlackChannel
from services.customers.models import SlackConversation
from services.customers.tests.slack_fixtures import msg


class ViaAppTests(OutsideFixture):
    def with_reply(self, **marks):
        conversation, thread = self.slack_thread(self.pizza)
        SlackConversation.objects.filter(pk=conversation.pk).update(
            messages=[
                *conversation.messages,
                {**msg("1760340999.000100", "Faiz Jamal", "Logged."), **marks},
            ]
        )
        thread.refresh_from_db()
        return conversation, thread

    def test_our_reply_as_a_person_answers_the_thread(self):
        _, thread = self.with_reply(via_app=True)
        self.assertEqual(intake.answered(thread), "answered")

    def test_it_reads_as_ours_in_the_agent_s_lines(self):
        _, thread = self.with_reply(via_app=True)
        ctx, _ = self.thread_ctx(thread)
        self.assertIn('message 2: we wrote (as "Faiz Jamal")', ctx.thread_lines[1])

    def test_a_person_s_own_reply_does_not_answer_it(self):
        _, thread = self.with_reply()
        self.assertIsNone(intake.answered(thread))

    def test_the_thread_s_facts_for_an_escalation(self):
        conversation, thread = self.slack_thread(self.pizza)
        # D3 (SC3-12): the conversation's channel row holds the flag
        SlackChannel.objects.filter(
            connector=conversation.connector, channel_id=conversation.channel
        ).update(external_shared=True)
        thread.refresh_from_db()
        ctx, _ = self.thread_ctx(thread)
        self.assertEqual(
            {
                k: ctx.thread_slack[k]
                for k in ("external_shared", "started_by_id", "started_by_name", "url")
            },
            {
                "external_shared": True,
                "started_by_id": None,
                "started_by_name": "Faiz Jamal",
                "url": conversation.url,
            },
        )
        self.assertIsNone(ctx.escalation)


class WholeThreadTests(OutsideFixture):
    def test_the_model_reads_every_stored_message_and_who_is_who(self):
        from services.agents.evidence import SLACK_MESSAGES, record_block

        conversation, thread = self.slack_thread(self.pizza)
        messages = [msg(f"17603400{n:02d}.000100", "Jesh Sanghvi", f"Line {n}") for n in range(12)]
        SlackConversation.objects.filter(pk=conversation.pk).update(
            messages=messages,
            people={"U0FAIZ": {"name": "Faiz Jamal", "member": None}},
        )
        thread.refresh_from_db()
        ctx, _ = self.thread_ctx(thread)
        self.assertEqual(SLACK_MESSAGES, 50)
        self.assertEqual(len(ctx.thread_lines), 12)
        self.assertIn("message 1:", ctx.thread_lines[0])
        self.assertEqual((ctx.thread_slack["first"], len(ctx.thread_slack["messages"])), (1, 12))
        block = record_block(ctx, ctx.records[ctx.thread_ref])
        self.assertIn('    slack people: <@U0FAIZ> is "Faiz Jamal"', block)
