"""Slack escalations D3, SC3-18: a reply's channel list offers its own thread
and every included channel of the Slack connections the reader may post
through; choosing one posts a new message there; choosing the thread again
posts in the thread. Slack is a fake."""

from django.core.cache import cache

from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors.models import SlackChannel
from services.connectors.tests.slack_fake import use_slack

OPTIONS = "/api/v1/agents/bundles/{}/steps/{}/options/slack_channels/"
STEP = "/api/v1/agents/bundles/{}/steps/{}/"


class ManyChannelsTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.api = use_slack(self)
        self.api.scopes = [*self.api.scopes, "chat:write"]
        self.support = self.slack_connector()
        self.support.granted_scopes = ["channels:read", "chat:write"]
        self.support.save()
        SlackChannel.objects.create(
            connector=self.support, channel_id="C0ESCALATE", name="escalations", is_member=True
        )
        SlackChannel.objects.create(
            connector=self.support, channel_id="C0OFF", name="off", is_member=True, included=False
        )
        SlackChannel.objects.create(
            connector=self.support, channel_id="C0OUT", name="out", is_member=False
        )
        self.conversation, self.thread = self.slack_thread(self.pizza, self.support)
        self.bundle = self.outside_bundle(
            self.thread, ("slack.reply", self.slack_payload(self.conversation, self.support))
        )
        self.step = self.bundle.steps.get()

    def options(self, **query):
        answer = self.client_for(self.csm).get(OPTIONS.format(self.bundle.pk, self.step.pk), query)
        self.assertEqual(answer.status_code, 200, answer.content)
        return [(o["id"], o["name"], o["detail"]) for o in answer.json()["options"]]

    def choose(self, choice):
        return self.client_for(self.csm).patch(
            STEP.format(self.bundle.pk, self.step.pk),
            {"fields": {"channel_choice": choice}},
            format="json",
        )

    def test_the_thread_then_every_included_channel_the_bot_is_in(self):
        pk = self.support.pk
        self.assertEqual(
            self.options(),
            [
                (str(pk), "#support", "This thread"),
                (f"{pk}:C0ESCALATE", "#escalations", "A new message"),
            ],
        )

    def test_an_excluded_channel_is_not_a_synced_row_and_is_live_not_synced(self):
        pk = self.support.pk
        self.assertNotIn(f"{pk}:C0OFF", [o[0] for o in self.options()])
        self.api.names["C0OFF"] = "off"
        self.api.channels["C0OFF"] = []
        self.api.members.add("C0OFF")
        live = self.options(live="1")
        self.assertIn((f"{pk}:C0OFF", "#off", "Not synced"), live)
        self.assertNotIn((f"{pk}:C0OFF", "#off", "A new message"), live)

    def test_choosing_another_channel_posts_a_new_message_there(self):
        answer = self.choose(f"{self.support.pk}:C0ESCALATE")
        self.assertEqual(answer.status_code, 200, answer.content)
        self.step.refresh_from_db()
        self.assertEqual(
            (self.step.payload["channel"], self.step.payload["unsynced"]), ("C0ESCALATE", False)
        )
        self.run_all_steps(self.csm, self.bundle)
        [post] = self.slack.posts
        self.assertEqual((post["channel"], post["thread_ts"]), ("C0ESCALATE", ""))

    def test_choosing_the_thread_again_posts_in_the_thread(self):
        self.choose(f"{self.support.pk}:C0ESCALATE")
        self.choose(str(self.support.pk))
        self.step.refresh_from_db()
        self.assertEqual(
            (self.step.payload["channel"], self.step.payload["channel_name"]),
            ("C0SUPPORT", "support"),
        )
        self.run_all_steps(self.csm, self.bundle)
        self.assertEqual(self.slack.posts[0]["thread_ts"], self.conversation.thread_ts)

    def test_an_excluded_or_unjoined_channel_cannot_be_chosen_as_synced(self):
        for channel in ("C0OFF", "C0OUT"):
            self.assertEqual(self.choose(f"{self.support.pk}:{channel}").status_code, 400)
