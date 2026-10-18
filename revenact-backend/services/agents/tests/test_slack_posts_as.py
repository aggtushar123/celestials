"""SE4-15: the Slack step says who it posts as, for its reader: the reader
when their Slack link covers the connection's team, else the bot. The
post itself is SlackTool.post's rule, unchanged (#139)."""

from django.test import override_settings

from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors.tests.test_slack_link_views import ON, slack_link_for

DETAIL = "/api/v1/agents/bundles/{}/"


@override_settings(**ON)
class PostsAsTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.support = self.slack_connector()
        self.conversation, self.thread = self.slack_thread(self.pizza, self.support)
        self.bundle = self.outside_bundle(
            self.thread, ("slack.reply", self.slack_payload(self.conversation, self.support))
        )

    def preview(self, user):
        body = self.client_for(user).get(DETAIL.format(self.bundle.pk)).json()
        return body["steps"][0]["preview"]["slack"]

    def test_a_linked_reader_posts_as_themselves(self):
        slack_link_for(self.csm)
        self.assertEqual(
            (self.preview(self.csm)["as"], self.preview(self.csm)["as_you"]), (self.csm.name, True)
        )

    def test_without_a_link_it_is_the_bot(self):
        self.assertEqual(
            (self.preview(self.csm)["as"], self.preview(self.csm)["as_you"]), ("revenact", False)
        )

    def test_a_link_in_another_slack_team_is_the_bot(self):
        slack_link_for(self.csm, team_id="T0OTHER")
        self.assertFalse(self.preview(self.csm)["as_you"])

    def test_a_lost_link_is_the_bot(self):
        slack_link_for(self.csm, status="lost")
        self.assertFalse(self.preview(self.csm)["as_you"])
