"""Slack escalations D4, SE4-24: the sync learns who a thread's posters and
mentioned people are: their name, and the member each one is (by their
Slack link first, else by their Slack email). No email is stored. D3: the
catch-up fills them (the events path: test_slack_events)."""

from datetime import timedelta

from django.utils import timezone

from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors import naming, sync
from services.connectors.models import SlackChannel, SlackLink
from services.connectors.providers.base import ProviderError, RemoteThread
from services.connectors.providers.slack import MAX_PEOPLE, SlackProvider, mentions
from services.connectors.tests.slack_fake import use_slack
from services.connectors.tests.test_slack_threads import fetch
from services.customers.models import SlackConversation
from services.segments.tests.fixtures import person

CONFIG = {"channel": "C0SUPPORT", "channel_name": "support", "bot_name": "revenact"}
CREDS = {"bot_token": "xoxb-test-only"}


class MentionTests(OutsideFixture):
    def test_mentions_are_read_once_each_in_order(self):
        self.assertEqual(
            mentions("<@U0FAIZ> can you take this? cc <@U0JESH|jesh> and <@U0FAIZ>"),
            ["U0FAIZ", "U0JESH"],
        )
        self.assertEqual(mentions("no one here"), [])


class ChannelSharedTests(OutsideFixture):
    """SE4-19: conversations.info says whether a channel is shared outside."""

    def setUp(self):
        super().setUp()
        self.api = use_slack(self)

    def test_shared_pending_unshared_and_unknown(self):
        self.api.shared.add("C0SUPPORT")
        self.api.pending_shared.add("C0ESCALATE")
        provider = SlackProvider()
        self.assertTrue(provider.channel_shared(CREDS, "C0SUPPORT"))
        self.assertTrue(provider.channel_shared(CREDS, "C0ESCALATE"))
        self.api.shared.clear()
        self.api.pending_shared.clear()
        self.assertFalse(provider.channel_shared(CREDS, "C0SUPPORT"))
        self.api.no_info.add("C0SUPPORT")
        with self.assertRaises(ProviderError):
            provider.channel_shared(CREDS, "C0SUPPORT")


class ProviderPeopleTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.slack_api = use_slack(self)
        self.slack_api.users["U0JESH"] = {
            "real_name": "Jesh Sanghvi",
            "profile": {"email": "jesh@acme.io"},
        }

    def test_posters_and_mentioned_people_come_with_the_thread(self):
        top = self.slack_api.say("C0SUPPORT", "U0CARL", "Pizza Hut exports fail")
        self.slack_api.say("C0SUPPORT", "U0JESH", "<@U0FAIZ> can you take this?", thread_ts=top)
        (thread,), _, _ = fetch(CONFIG, CREDS)
        people = SlackProvider()._people_of(CREDS, thread, {}, [0], set())
        self.assertEqual(
            people,
            {
                "U0CARL": {"name": "Carl Lee", "email": "carl@acme.io"},
                "U0JESH": {"name": "Jesh Sanghvi", "email": "jesh@acme.io"},
                "U0FAIZ": {"name": "Faiz Jamal", "email": "faiz@acme.io"},
            },
        )

    def test_a_catch_up_looks_up_at_most_max_people_new_people(self):
        support = self.slack_connector()
        del self.slack_api.channels["C0ESCALATE"]
        self.slack_api.members.discard("C0ESCALATE")
        text = " ".join(f"<@U0P{n:03d}>" for n in range(MAX_PEOPLE + 5))
        self.slack_api.say("C0SUPPORT", "U0CARL", f"Pizza Hut: {text}")
        sync.sync_connector(support)
        asked = [q["user"] for name, _body, q in self.slack_api.calls if name == "users.info"]
        # the poster, then MAX_PEOPLE mentioned people
        self.assertEqual(len(asked), MAX_PEOPLE + 1)
        self.assertEqual(len(SlackConversation.objects.get().people), MAX_PEOPLE + 1)


class SyncPeopleTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.support = self.slack_connector()
        self.names = naming.covered_names(self.support)
        self.faiz = person("faiz@acme.io", "Faiz Jamal", self.org)
        self.jesh = person("jesh@acme.io", "Jesh Sanghvi", self.org)

    def remote(self, people, ts="1792041400.000100"):
        return RemoteThread(
            thread_ts=ts,
            channel="C0SUPPORT",
            text="Pizza Hut exports fail",
            user_id="U0CARL",
            user_name="Carl Lee",
            user_email="carl@acme.io",
            posted_at=timezone.now(),
            latest_reply="",
            replies=[],
            url="https://slack.com/archives/C0SUPPORT/p1792041400000100",
            people=people,
        )

    def file(self, remote):
        return sync.file_conversation(self.support, remote, self.names, now=timezone.now())

    def test_a_slack_link_wins_over_the_email_and_no_email_is_kept(self):
        SlackLink.objects.create(
            organisation=self.org,
            user=self.jesh,
            team_id="T0ACME",
            slack_user_id="U0FAIZ",
            name="Jesh on Slack",
            credentials="",
        )
        people = {
            "U0FAIZ": {"name": "Faiz Jamal", "email": "faiz@acme.io"},
            "U0OUT": {"name": "Guest Person", "email": "guest@elsewhere.com"},
        }
        self.assertEqual(self.file(self.remote(people))[0], "created")
        made = SlackConversation.objects.get()
        self.assertEqual(
            made.people,
            {
                "U0FAIZ": {"name": "Faiz Jamal", "member": self.jesh.pk},
                "U0OUT": {"name": "Guest Person", "member": None},
            },
        )
        self.assertNotIn("@", str(made.people))

    def test_the_email_finds_the_member_in_any_case(self):
        self.file(self.remote({"U0FAIZ": {"name": "Faiz Jamal", "email": "FAIZ@ACME.IO"}}))
        self.assertEqual(SlackConversation.objects.get().people["U0FAIZ"]["member"], self.faiz.pk)

    def test_people_seen_before_are_kept(self):
        self.file(self.remote({"U0FAIZ": {"name": "Faiz Jamal", "email": "faiz@acme.io"}}))
        later = self.remote({"U0JESH": {"name": "Jesh Sanghvi", "email": "jesh@acme.io"}})
        later.replies = [
            {
                "ts": "1792041450.000100",
                "user_id": "U0JESH",
                "name": "Jesh Sanghvi",
                "text": "On it",
                "bot": False,
            }
        ]
        later.latest_reply = "1792041450.000100"
        self.assertEqual(self.file(later)[0], "updated")
        self.assertEqual(set(SlackConversation.objects.get().people), {"U0FAIZ", "U0JESH"})

    def test_a_lookup_without_a_name_keeps_the_stored_name(self):
        """M-5: a failed users.info answers no name; the name seen before stays."""
        self.file(self.remote({"U0OUT": {"name": "Guest Person", "email": ""}}))
        later = self.remote({"U0OUT": {"name": "", "email": ""}})
        later.replies = [
            {
                "ts": "1792041450.000100",
                "user_id": "U0OUT",
                "name": "",
                "text": "Any news?",
                "bot": False,
            }
        ]
        later.latest_reply = "1792041450.000100"
        self.file(later)
        self.assertEqual(
            SlackConversation.objects.get().people["U0OUT"],
            {"name": "Guest Person", "member": None},
        )


class PassTests(OutsideFixture):
    """F11: a pass asks Slack only about people not yet resolved; the people
    a conversation already knows as members cost no users.info."""

    def setUp(self):
        super().setUp()
        self.slack_api = use_slack(self)
        # D3: one channel, so each pass's catch-up reads it
        del self.slack_api.channels["C0ESCALATE"]
        self.slack_api.members.discard("C0ESCALATE")
        self.support = self.slack_connector()
        self.faiz = person("faiz@acme.io", "Faiz Jamal", self.org)

    def run_pass(self):
        # the 60-second guard (SC3-6): each pass in a test is a minute later
        SlackChannel.objects.update(asked_at=timezone.now() - timedelta(minutes=2))
        return sync.sync_connector(self.support)

    def asked(self):
        return [q["user"] for name, _body, q in self.slack_api.calls if name == "users.info"]

    def test_a_second_pass_asks_nobody_already_resolved(self):
        top = self.slack_api.say("C0SUPPORT", "U0ANN", "Pizza Hut exports fail <@U0FAIZ>")
        self.run_pass()
        self.assertEqual(self.asked(), ["U0ANN", "U0FAIZ"])
        self.assertEqual(
            SlackConversation.objects.get().people,
            {
                "U0ANN": {"name": "Ann Lee", "member": None},
                "U0FAIZ": {"name": "Faiz Jamal", "member": self.faiz.pk},
            },
        )
        self.slack_api.calls.clear()
        self.slack_api.say("C0SUPPORT", "U0CARL", "<@U0FAIZ> any news?", thread_ts=top)
        self.run_pass()
        # the posters are read for their names as every pass does; Faiz, resolved, is not
        self.assertEqual(sorted(self.asked()), ["U0ANN", "U0CARL"])
        self.assertEqual(set(SlackConversation.objects.get().people), {"U0CARL", "U0FAIZ", "U0ANN"})
