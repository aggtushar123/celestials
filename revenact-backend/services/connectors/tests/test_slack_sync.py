"""Slack escalations D1 SE1-4 to SE1-9: a pass files threads as conversations
on the channel's customer or the one the message names; anything unclear
waits in Needs a customer; replies land in the same conversation. D3: through
the catch-up (one channel here, one page and one thread a pass)."""

from datetime import timedelta

from django.utils import timezone

from services.agents.models import SignalThread
from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors import naming, sync
from services.connectors.models import Connector, SlackChannel, UnmatchedItem
from services.connectors.providers import get_provider
from services.connectors.tests.slack_fake import use_slack
from services.customers.models import Customer, SlackConversation, Ticket


class SlackSyncTests(IntakeFixture):
    def setUp(self):
        super().setUp()
        self.slack_api = use_slack(self)
        # R5: D1's cases read one channel
        del self.slack_api.channels["C0ESCALATE"]
        self.slack_api.members.discard("C0ESCALATE")
        self.slack = self.connector("slack", "cs")
        self.slack.set_credentials({"bot_token": "xoxb-test-only"})
        self.slack.config = {
            "channel": "C0SUPPORT",
            "channel_name": "support",
            "bot_name": "revenact",
        }
        self.slack.status = Connector.Status.CONNECTED
        self.slack.save()
        self.shack = Customer.objects.create(organisation=self.org, name="Taco Shack")

    def run_pass(self):
        # the 60-second guard (SC3-6): each pass in a test is a minute later
        SlackChannel.objects.update(asked_at=timezone.now() - timedelta(minutes=2))
        return sync.sync_connector(self.slack)

    def test_a_message_naming_one_customer_is_filed_there(self):
        self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail, urgent")
        self.assertEqual(self.run_pass()["created"], 1)
        made = SlackConversation.objects.get()
        self.assertEqual((made.customer, made.matched_by), (self.pizza, "name"))
        self.assertEqual(made.started_by_name, "Faiz Jamal")
        self.assertFalse(Ticket.objects.filter(connector=self.slack).exists())
        thread = SignalThread.objects.get(conversation=made)
        self.assertEqual(thread.source_kind, "slack")

    def test_a_channel_set_to_one_customer_files_everything_there(self):
        self.run_pass()
        SlackChannel.objects.filter(connector=self.slack, channel_id="C0SUPPORT").update(
            customer=self.shack, read_at=None
        )
        SlackChannel.objects.filter(connector=self.slack).exclude(channel_id="C0SUPPORT").update(
            read_at=timezone.now()
        )
        self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.run_pass()
        made = SlackConversation.objects.get()
        self.assertEqual((made.customer, made.matched_by), (self.shack, "channel"))

    def test_the_posters_email_is_never_used(self):
        # Ann's Slack email is a Pizza Hut contact's domain; the message names nobody.
        self.slack_api.say("C0SUPPORT", "U0ANN", "Anyone seeing slow dashboards?")
        self.assertEqual(self.run_pass()["unmatched"], 1)
        self.assertFalse(SlackConversation.objects.exists())

    def test_a_colleagues_message_naming_two_waits_with_both(self):
        self.slack_api.users["U0CARL"] = {
            "real_name": "Carl",
            "profile": {"email": self.csm.email},
        }
        self.slack_api.say("C0SUPPORT", "U0CARL", "Pizza Hut and Taco Shack both fail")
        self.run_pass()
        row = UnmatchedItem.objects.get(connector=self.slack)
        self.assertEqual(
            sorted(c["id"] for c in row.candidates), sorted([self.pizza.pk, self.shack.pk])
        )
        self.assertEqual(row.number, "#support")

    def test_a_reply_lands_in_the_same_conversation_and_wakes_it(self):
        top = self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.run_pass()
        thread = SignalThread.objects.get()
        SignalThread.objects.filter(pk=thread.pk).update(status="processed")
        self.slack_api.say("C0SUPPORT", "U0ANN", "Still failing", thread_ts=top)
        self.assertEqual(self.run_pass()["updated"], 1)
        made = SlackConversation.objects.get()
        self.assertEqual(
            [m["text"] for m in made.messages], ["Pizza Hut exports fail", "Still failing"]
        )
        self.assertEqual(SignalThread.objects.get().status, "new")

    def test_our_own_reply_is_stored_but_wakes_nothing(self):
        top = self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.run_pass()
        SignalThread.objects.update(status="processed")
        self.slack_api.channels["C0SUPPORT"].append(
            {"ts": f"{float(top) + 5:.6f}", "text": "On it.", "bot_id": "B0BOT", "thread_ts": top}
        )
        self.run_pass()
        self.assertTrue(SlackConversation.objects.get().messages[-1]["bot"])
        self.assertEqual(SignalThread.objects.get().status, "processed")

    def test_a_member_starts_it(self):
        self.slack_api.users["U0CARL"] = {
            "real_name": "Carl",
            "profile": {"email": self.csm.email.upper()},
        }
        self.slack_api.say("C0SUPPORT", "U0CARL", "Pizza Hut exports fail")
        self.run_pass()
        self.assertEqual(SlackConversation.objects.get().started_by, self.csm)

    def test_the_pass_notes_what_it_did_and_whether_the_channel_is_shared(self):
        self.slack_api.shared.add("C0SUPPORT")
        # an admin chose it: a Slack Connect channel is otherwise excluded (SC3-12)
        SlackChannel.objects.create(
            connector=self.slack,
            channel_id="C0SUPPORT",
            name="support",
            is_member=True,
            chosen_at=timezone.now(),
        )
        self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.slack_api.say("C0SUPPORT", "U0FAIZ", "Lunch?")
        self.run_pass()
        self.slack.refresh_from_db()
        self.assertEqual(
            self.slack.last_sync_note, "1 new, 0 updated, 1 without a matching account"
        )
        # SC3-12: the flag is the channel's, no longer the connection's
        self.assertNotIn("external_shared", self.slack.config)
        self.assertTrue(SlackChannel.objects.get(channel_id="C0SUPPORT").external_shared)
        self.assertTrue(SlackConversation.objects.get().external_shared)

    def test_a_pass_with_nothing_new_saves_nothing(self):
        self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.run_pass()
        stamp = SlackConversation.objects.get().updated_at
        self.assertEqual(self.run_pass(), {"created": 0, "updated": 0, "unmatched": 0})
        self.assertEqual(SlackConversation.objects.get().updated_at, stamp)
        self.slack.refresh_from_db()
        self.assertEqual(self.slack.last_sync_note, "0 new, 0 updated")

    def test_file_conversation_says_unchanged_when_the_read_adds_nothing(self):
        self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.run_pass()
        now = timezone.now()
        provider, creds = get_provider("slack"), self.slack.get_credentials()
        (raw,), _more, _lowest = provider.read_page(
            self.slack.config, creds, channel="C0SUPPORT", oldest="0"
        )
        remote = provider.thread_of(creds, self.slack.config, "C0SUPPORT", raw)
        names = naming.covered_names(self.slack)
        outcome, conversation = sync.file_conversation(self.slack, remote, names, now=now)
        self.assertEqual((outcome, conversation), ("unchanged", SlackConversation.objects.get()))

    def test_a_refused_read_marks_the_connector_and_logs_no_text(self):
        self.slack_api.refuse_next("conversations.history", "invalid_auth")
        with self.assertLogs("services.connectors.sync", "WARNING") as logs:
            self.assertEqual(self.run_pass(), {"created": 0, "updated": 0, "unmatched": 0})
        self.slack.refresh_from_db()
        self.assertEqual(
            (self.slack.status, self.slack.error),
            (Connector.Status.ERROR, "Slack: invalid_auth"),
        )
        self.assertEqual(
            logs.output, [f"WARNING:services.connectors.sync:connector {self.slack}: ProviderError"]
        )

    def test_an_inactive_member_starts_nothing(self):
        self.csm.is_active = False
        self.csm.save(update_fields=["is_active"])
        self.slack_api.users["U0CARL"] = {"real_name": "Carl", "profile": {"email": self.csm.email}}
        self.slack_api.say("C0SUPPORT", "U0CARL", "Pizza Hut exports fail")
        self.run_pass()
        self.assertIsNone(SlackConversation.objects.get().started_by)

    def test_a_failed_replies_read_keeps_the_pass_and_retries_next_time(self):
        top = self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.slack_api.say("C0SUPPORT", "U0ANN", "Same here", thread_ts=top)
        self.run_pass()
        reply = self.slack_api.say("C0SUPPORT", "U0ANN", "Still failing", thread_ts=top)
        self.slack_api.refuse_next("conversations.replies", "ratelimited")
        self.run_pass()
        self.slack.refresh_from_db()
        self.assertEqual((self.slack.status, self.slack.error), (Connector.Status.CONNECTED, ""))
        made = SlackConversation.objects.get()
        self.assertEqual([m["text"] for m in made.messages][1:], ["Same here"])
        self.run_pass()
        made.refresh_from_db()
        self.assertEqual([m["text"] for m in made.messages][1:], ["Same here", "Still failing"])
        self.assertEqual(made.latest_reply, reply)

    def test_a_thread_waiting_on_pass_one_that_files_on_pass_two_leaves_no_row(self):
        self.slack_api.say("C0SUPPORT", "U0FAIZ", "Anyone seeing slow dashboards?")
        self.assertEqual(self.run_pass()["unmatched"], 1)
        self.assertTrue(UnmatchedItem.objects.filter(connector=self.slack).exists())
        SlackChannel.objects.filter(channel_id="C0SUPPORT").update(customer=self.shack)
        self.assertEqual(self.run_pass()["created"], 1)
        self.assertEqual(SlackConversation.objects.get().customer, self.shack)
        self.assertFalse(UnmatchedItem.objects.filter(connector=self.slack).exists())

    def test_a_third_pass_with_no_new_reply_keeps_the_stored_replies(self):
        top = self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.run_pass()
        self.slack_api.say("C0SUPPORT", "U0ANN", "Still failing", thread_ts=top)
        self.run_pass()
        self.run_pass()
        self.assertEqual(
            [m["text"] for m in SlackConversation.objects.get().messages],
            ["Pizza Hut exports fail", "Still failing"],
        )

    def test_a_long_thread_keeps_its_top_and_the_newest_replies(self):
        top = self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        for n in range(55):
            self.slack_api.say("C0SUPPORT", "U0ANN", f"reply {n}", thread_ts=top)
        for _ in range(4):  # D3: one replies page (parent and 14 replies) a pass
            self.run_pass()
        messages = SlackConversation.objects.get().messages
        self.assertEqual(len(messages), SlackConversation.MAX_MESSAGES)
        self.assertEqual(messages[0]["ts"], top)
        self.assertEqual(messages[1]["text"], "reply 6")
        self.assertEqual(messages[-1]["text"], "reply 54")
