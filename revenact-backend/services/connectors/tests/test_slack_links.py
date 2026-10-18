"""A person's Slack link at work (Connections spec §3 Slack): the authorize
URL asks for user scopes only, a Slack reply posts with the runner's own
token and falls back to the bot, a revoked token loses the link, and a
synced thread names the member who linked its poster. Slack is a fake."""

from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlsplit

from django.test import SimpleTestCase, override_settings
from django.utils import timezone

from core.models import AuditEvent
from services.agents.outside import tools
from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors import slack_links, sync
from services.connectors.models import SlackChannel, SlackLink
from services.connectors.providers.base import RemoteThread
from services.connectors.tests.slack_fake import use_slack
from services.connectors.tests.test_slack_link_views import ON, slack_link_for

DM_SCOPES = ("im:history", "mpim:history", "im:read", "mpim:read", "im:write")


@override_settings(**ON)
class AuthorizeUrlTests(SimpleTestCase):
    def test_user_scopes_only_and_never_a_dm_scope(self):
        query = parse_qs(urlsplit(slack_links.authorize_url("st", "https://api.test/cb")).query)
        self.assertEqual(query["user_scope"], ["chat:write,users:read"])
        self.assertNotIn("scope", query)
        self.assertEqual(
            (query["client_id"], query["state"], query["redirect_uri"]),
            (["cid"], ["st"], ["https://api.test/cb"]),
        )
        for scope in DM_SCOPES:
            self.assertNotIn(scope, query["user_scope"][0])

    def test_configured_needs_both_halves(self):
        self.assertTrue(slack_links.configured())
        with override_settings(SLACK_OAUTH_CLIENT_SECRET=""):
            self.assertFalse(slack_links.configured())


@override_settings(**ON)
class PostAsMeTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.channel = self.slack_connector()
        self.api = use_slack(self)
        self.tool = tools.SlackTool()

    def post(self, actor, key="b1-s1"):
        return self.tool.post(
            self.channel,
            channel="C0SUPPORT",
            channel_name="#support",
            text="We're on it.",
            thread_ts="",
            key=key,
            actor=actor,
        )

    def tokens(self, method="chat.postMessage"):
        return [token for name, token in self.api.auth if name == method]

    def test_a_linked_person_posts_as_themselves(self):
        slack_link_for(self.csm)
        posted = self.post(self.csm)
        self.assertTrue(posted.person)
        self.assertEqual(self.tokens(), ["xoxp-u0carl"])
        [message] = self.api.channels["C0SUPPORT"]
        self.assertEqual(message["user"], "U0CARL")
        self.assertEqual(message["metadata"]["event_payload"], {"key": "b1-s1"})

    def test_no_link_posts_as_the_bot(self):
        posted = self.post(self.csm)
        self.assertFalse(posted.person)
        self.assertEqual(self.tokens(), ["xoxb-test-only"])

    def test_someone_elses_link_is_never_used(self):
        slack_link_for(self.other)
        self.post(self.csm)
        self.assertEqual(self.tokens(), ["xoxb-test-only"])

    def test_a_link_in_another_slack_workspace_posts_as_the_bot(self):
        slack_link_for(self.csm, team_id="T0OTHER")
        self.assertFalse(self.post(self.csm).person)
        self.assertEqual(self.tokens(), ["xoxb-test-only"])

    def test_a_lost_link_posts_as_the_bot(self):
        slack_link_for(self.csm, status="lost")
        self.assertFalse(self.post(self.csm).person)
        self.assertEqual(self.tokens(), ["xoxb-test-only"])

    def test_linking_turned_off_posts_as_the_bot(self):
        slack_link_for(self.csm)
        with override_settings(SLACK_OAUTH_CLIENT_ID=""):
            self.post(self.csm)
        self.assertEqual(self.tokens(), ["xoxb-test-only"])

    def test_a_revoked_token_loses_the_link_and_the_bot_posts(self):
        link = slack_link_for(self.csm)
        self.api.refuse_next("chat.postMessage", "token_revoked")
        posted = self.post(self.csm)
        self.assertFalse(posted.person)
        self.assertEqual(self.tokens(), ["xoxp-u0carl", "xoxb-test-only"])
        link.refresh_from_db()
        self.assertEqual(link.status, "lost")
        self.assertIsNotNone(link.lost_at)
        event = AuditEvent.objects.get(action="slack.link_lost")
        self.assertEqual(event.metadata, {"reason": "token_revoked"})
        # Next time the lost link is skipped.
        self.post(self.csm, key="b1-s2")
        self.assertEqual(self.tokens()[-1], "xoxb-test-only")

    def test_a_person_outside_the_channel_falls_back_without_losing_the_link(self):
        link = slack_link_for(self.csm)
        self.api.refuse_next("chat.postMessage", "not_in_channel")
        self.assertFalse(self.post(self.csm).person)
        link.refresh_from_db()
        self.assertEqual(link.status, "linked")

    def test_another_refusal_is_said_and_the_bot_does_not_post(self):
        slack_link_for(self.csm)
        self.api.refuse_next("chat.postMessage", "msg_too_long")
        with self.assertRaises(tools.Refused):
            self.post(self.csm)
        self.assertEqual(self.tokens(), ["xoxp-u0carl"])

    def test_no_answer_is_unconfirmed_and_never_posted_twice(self):
        slack_link_for(self.csm)
        self.api.drop_next("chat.postMessage")
        with self.assertRaises(tools.Unconfirmed):
            self.post(self.csm)
        self.assertEqual(self.tokens(), ["xoxp-u0carl"])

    def test_a_retry_finds_the_persons_post_by_its_key(self):
        slack_link_for(self.csm)
        posted = self.post(self.csm)
        found = self.tool.find(
            self.channel,
            channel="C0SUPPORT",
            channel_name="#support",
            key="b1-s1",
            thread_ts="",
            since=timezone.now() - timedelta(minutes=5),
        )
        self.assertEqual(found.ts, posted.ts)


class AttributionTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.channel = self.slack_connector(channel_row=False)
        # D3 (SC3-8): the record is the channel's own, not the connection's
        SlackChannel.objects.create(
            connector=self.channel,
            channel_id="C0SUPPORT",
            name="support",
            is_member=True,
            customer=self.pizza,
        )

    def remote(self, user_id, email=""):
        return RemoteThread(
            thread_ts="1760339000.000100",
            channel="C0SUPPORT",
            text="Pizza Hut can't log in.",
            user_id=user_id,
            user_name="Someone",
            user_email=email,
            posted_at=datetime(2026, 10, 13, tzinfo=UTC),
            latest_reply="",
            replies=[],
            url="https://slack.com/archives/C0SUPPORT/p1760339000000100",
        )

    def test_a_linked_poster_is_named_by_their_link(self):
        slack_link_for(self.csm, slack_user_id="U0CARL")
        outcome, conversation = sync.file_conversation(
            self.channel, self.remote("U0CARL"), [], now=timezone.now()
        )
        self.assertEqual((outcome, conversation.started_by), ("created", self.csm))

    def test_without_a_link_the_email_still_names_them(self):
        _, conversation = sync.file_conversation(
            self.channel, self.remote("U0X", email="dana@acme.io"), [], now=timezone.now()
        )
        self.assertEqual(conversation.started_by, self.other)

    def test_a_link_in_another_workspace_names_nobody(self):
        SlackLink.objects.all().delete()
        slack_link_for(self.csm, slack_user_id="U0CARL", team_id="T0OTHER")
        _, conversation = sync.file_conversation(
            self.channel, self.remote("U0CARL"), [], now=timezone.now()
        )
        self.assertIsNone(conversation.started_by)


@override_settings(**ON)
class SlackReplyStepAsMeTests(OutsideFixture):
    """A slack.reply step Carl runs goes out with his own token, through the
    real Slack tool (only Slack's HTTP is a fake)."""

    def setUp(self):
        super().setUp()
        self.support = self.slack_connector()
        self.conversation, self.thread = self.slack_thread(self.pizza, self.support)
        self.bundle = self.outside_bundle(
            self.thread, ("slack.reply", self.slack_payload(self.conversation, self.support))
        )
        self.api = use_slack(self)
        real = tools.Tools(self.fakes.mail, tools.SlackTool(), self.fakes.jira)
        scope = tools.using(real)
        scope.__enter__()
        self.addCleanup(scope.__exit__, None, None, None)

    def test_the_runner_posts_as_themselves(self):
        slack_link_for(self.csm)
        self.assertEqual(self.run_all_steps(self.csm, self.bundle).status_code, 200)
        step = self.bundle.steps.get()
        self.assertEqual(step.status, "applied")
        self.assertEqual(step.result["slack_as"], "person")
        self.assertEqual(
            [t for name, t in self.api.auth if name == "chat.postMessage"], ["xoxp-u0carl"]
        )

    def test_without_a_link_the_bot_posts(self):
        self.assertEqual(self.run_all_steps(self.csm, self.bundle).status_code, 200)
        step = self.bundle.steps.get()
        self.assertEqual(step.result["slack_as"], "connection")
        self.assertEqual(
            [t for name, t in self.api.auth if name == "chat.postMessage"], ["xoxb-test-only"]
        )
