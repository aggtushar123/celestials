"""SE1-19: a Slack pass of three threads (two filed, one unmatched) costs a
fixed number of queries. The detail route's pin (SLACK_CONVERSATION_QUERIES)
lives in test_slack_views.py (Task 10), the story's in the story query tests
(Task 9), the unmatched list's in services/work/tests/test_unmatched_queries.py
and a Slack thread's run in services/agents/tests/test_intake_queries.py."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors import sync
from services.connectors.models import Connector, SlackChannel
from services.connectors.tests.slack_fake import use_slack

#: Measured on this branch (Task 12): 39 before `_scoped` was read once per pass.
#: Connections spec §3: +1, the members who linked Slack read once per pass.
#: D3 (measured, 42): the channel rows, the once-a-minute check, the picked
#: row's asked_at and its watermark, the stored threads' marks, and a
#: savepoint per filed thread (2 each); no conversations.info any more.
#: Rebased onto D4 (measured, 44): +2, each filed thread's people found by
#: Slack email (SE4-24, as on D4); the page's stored marks and people are one
#: query, read before filing.
SLACK_SYNC_QUERIES = 44


class SlackQueryTests(IntakeFixture):
    def connected_slack(self, api):
        slack = self.connector("slack", "cs")
        slack.set_credentials({"bot_token": "xoxb-test-only"})
        slack.config = {"channel": "C0SUPPORT", "channel_name": "support", "team_id": "T0ACME"}
        slack.status = Connector.Status.CONNECTED
        slack.save()
        # D3: the connection's one channel, as the migration made it (SC3-11)
        del api.channels["C0ESCALATE"]
        api.members.discard("C0ESCALATE")
        SlackChannel.objects.create(
            connector=slack, channel_id="C0SUPPORT", name="support", is_member=True
        )
        return slack

    def test_a_pass_of_three_threads(self):
        api = use_slack(self)
        slack = self.connected_slack(api)
        for text in ("Pizza Hut exports fail", "Pizza Hut login loops", "Lunch?"):
            api.say("C0SUPPORT", "U0FAIZ", text)
        with CaptureQueriesContext(connection) as seen:
            counts = sync.sync_connector(slack)
        self.assertEqual(counts, {"created": 2, "updated": 0, "unmatched": 1})
        for q in seen:
            self.assertNotIn("DISTINCT", q["sql"].upper())
        self.assertEqual(len(seen), SLACK_SYNC_QUERIES)
