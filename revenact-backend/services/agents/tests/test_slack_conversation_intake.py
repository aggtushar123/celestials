"""Slack escalations D1 SE1-13: a Slack thread's block is its messages, its
reply goes back into the thread, and our own reply makes it answered."""

from services.agents import intake
from services.agents.models import AgentBundle
from services.agents.tests.outside_fixtures import OutsideFixture
from services.customers.models import SlackConversation
from services.customers.tests.slack_fixtures import msg


class SlackConversationIntakeTests(OutsideFixture):
    def test_the_block_is_the_threads_messages(self):
        conversation, thread = self.slack_thread(self.pizza)
        ctx, _ = self.thread_ctx(thread)
        self.assertEqual(ctx.thread_channel, "slack")
        self.assertIn('message 1: from "Ann Lee"', ctx.thread_lines[0])
        self.assertEqual(ctx.thread_slack["id"], conversation.pk)
        self.assertIsNone(ctx.thread_ticket)

    def test_the_bots_own_message_reads_as_ours(self):
        conversation, thread = self.slack_thread(self.pizza)
        SlackConversation.objects.filter(pk=conversation.pk).update(
            messages=[
                *conversation.messages,
                msg("1760340999.000100", "revenact", "On it.", bot=True),
            ]
        )
        thread.refresh_from_db()
        ctx, _ = self.thread_ctx(thread)
        self.assertIn("message 2: we wrote (revenact)", ctx.thread_lines[1])

    def test_a_slack_reply_goes_into_the_thread(self):
        conversation, thread = self.slack_thread(self.pizza)
        ctx, _ = self.thread_ctx(thread)
        item = {
            "kind": "slack.reply",
            "record": ctx.thread_ref,
            "title": "Answer Ann in Slack",
            "rationale": "Ann is locked out.",
            "evidence": [ctx.thread_lines[0].strip()],
            "payload": {"text": "Thanks Ann, we're on it."},
        }
        self.run_intake(self.answer(item))
        step = AgentBundle.objects.get(thread=thread).steps.get()
        self.assertEqual(step.kind, "slack.reply")
        self.assertEqual(step.payload["conversation_id"], conversation.pk)
        self.assertEqual(step.payload["thread_ts"], conversation.thread_ts)
        self.assertNotIn("ticket_id", step.payload)
        self.assertEqual(step.target, f"draft:conversation:{conversation.pk}")
        self.assertEqual(step.before, "open")

    def test_our_reply_last_makes_it_answered(self):
        conversation, thread = self.slack_thread(self.pizza)
        SlackConversation.objects.filter(pk=conversation.pk).update(
            messages=[
                *conversation.messages,
                msg("1760340999.000100", "revenact", "On it.", bot=True),
            ]
        )
        self.assertEqual(intake.answered(thread), "answered")

    def test_a_customers_message_last_is_not_answered(self):
        _conversation, thread = self.slack_thread(self.pizza)
        self.assertIsNone(intake.answered(thread))

    def test_no_draft_reply_on_a_conversation(self):
        _conversation, thread = self.slack_thread(self.pizza)
        ctx, _ = self.thread_ctx(thread)
        self.assertEqual(ctx.tickets, {})


class OwnBotTests(OutsideFixture):
    """I3: only our own bot's posts read as ours and answer a thread; another
    app's reply reads under its own name, like a person's line."""

    def thread_with(self, *extra, identity=True):
        connector = self.slack_connector()
        if identity:
            connector.config = {**connector.config, "bot_id": "B0BOT", "bot_user_id": "U0BOT"}
            connector.save(update_fields=["config"])
        conversation, thread = self.slack_thread(self.pizza, connector)
        SlackConversation.objects.filter(pk=conversation.pk).update(
            messages=[*conversation.messages, *extra]
        )
        thread.refresh_from_db()
        return thread

    @staticmethod
    def bot(name, user_id, **marks):
        return {
            "ts": "1760340999.000100",
            "user_id": user_id,
            "name": name,
            "text": "SUP-12 created.",
            "bot": True,
            **marks,
        }

    def test_another_apps_reply_reads_as_its_own_and_does_not_answer(self):
        thread = self.thread_with(self.bot("Jira Cloud", "U0JIRA", ours=False))
        ctx, _ = self.thread_ctx(thread)
        self.assertIn('message 2: from "Jira Cloud"', ctx.thread_lines[1])
        self.assertIsNone(intake.answered(thread))

    def test_our_marked_reply_reads_as_ours_and_answers(self):
        thread = self.thread_with(self.bot("revenact", "U0BOT", ours=True))
        ctx, _ = self.thread_ctx(thread)
        self.assertIn("message 2: we wrote (revenact)", ctx.thread_lines[1])
        self.assertEqual(intake.answered(thread), "answered")

    def test_an_unmarked_bot_post_is_ours_only_by_the_bots_identity(self):
        theirs = self.thread_with(self.bot("revenact", ""))
        self.assertIsNone(intake.answered(theirs))
        self.assertIn('from "revenact"', self.thread_ctx(theirs)[0].thread_lines[1])
        ours = self.thread_with(self.bot("revenact", "U0BOT"))
        self.assertEqual(intake.answered(ours), "answered")

    def test_with_no_identity_known_any_bot_is_ours_as_before(self):
        thread = self.thread_with(self.bot("Jira Cloud", "U0JIRA"), identity=False)
        self.assertEqual(intake.answered(thread), "answered")


class LongThreadTests(OutsideFixture):
    def test_ten_messages_are_all_shown_numbered_from_one(self):
        # SE4-28: a Slack thread is read whole (mail and tickets keep THREAD_MESSAGES)
        conversation, thread = self.slack_thread(self.pizza)
        SlackConversation.objects.filter(pk=conversation.pk).update(
            messages=[
                *conversation.messages,
                *(msg(f"17603400{n:02d}.000100", "Ann Lee", f"reply {n}") for n in range(9)),
            ]
        )
        thread.refresh_from_db()
        ctx, _ = self.thread_ctx(thread)
        self.assertEqual(len(ctx.thread_lines), 10)
        self.assertTrue(ctx.thread_lines[0].strip().startswith("message 1:"))
        self.assertIn("reply 8", ctx.thread_lines[-1])
