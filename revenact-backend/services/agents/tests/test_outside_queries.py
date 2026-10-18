"""Outside steps cost the same however many there are (agent bundles D3
contract §9): a waiting bundle's detail with 5 or 10 outside steps, a
History page of bundles whose outside steps ran, and the options route.
No query uses DISTINCT (Postgres 16)."""

from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext

from services.agents.models import AgentBundle
from services.agents.tests.outside_fixtures import OutsideFixture
from services.agents.tests.test_bundle_queries import BUNDLE_DETAIL_CEILING, HISTORY_CEILING
from services.agents.tests.test_intake_queries import no_distinct

DETAIL = "/api/v1/agents/bundles/{}/"
HISTORY = "/api/v1/agents/bundles/history/"
OPTIONS = "/api/v1/agents/bundles/{}/steps/{}/options/jira_projects/"

#: Contract §9, measured: detail with 5 or 10 outside steps (ceiling 10 + 2),
#: a History page (ceiling 8 + 1), both for a reader with a Jira link
#: (the page reads that link once).
# SE4-15: the reader's Slack link, once per page.
#: SE4-25: +1, the reader's participation, once per page.
OUTSIDE_DETAIL_QUERIES = 11
OUTSIDE_HISTORY_QUERIES = 10


LINKING = {"ATLASSIAN_OAUTH_CLIENT_ID": "test-id", "ATLASSIAN_OAUTH_CLIENT_SECRET": "test-secret"}


@override_settings(**LINKING)
class OutsideQueryTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.board = self.jira_connector()
        self.support = self.slack_connector()
        self.gmail_for(self.csm)
        self.link_for(self.csm)

    def outside_of(self, steps):
        n = AgentBundle.objects.count()
        email, mail = self.mail_thread(self.pizza, self.csm, thread=f"t{n}")
        conversation, _ = self.slack_thread(self.pizza, self.support, ts=f"1760340000.{n:06d}")
        kinds = [
            ("mail.send_reply", self.mail_payload(email)),
            ("slack.reply", self.slack_payload(conversation, self.support)),
            ("jira.create", self.jira_payload(self.board, member=self.erin.pk)),
            ("jira.assign", self.assign_payload(self.board, "SUP-12", member=self.erin.pk)),
            (
                "jira.comment",
                {"connector_id": self.board.pk, "issue": "SUP-12", "body": "Seen again."},
            ),
        ]
        return self.outside_bundle(mail, *[kinds[i % 5] for i in range(steps)])

    def measure(self, url):
        client = self.client_for(self.csm)
        client.get(url)
        with CaptureQueriesContext(connection) as queries:
            answer = client.get(url)
        self.assertEqual(answer.status_code, 200)
        no_distinct(self, queries)
        self.last = answer
        return len(queries)

    KINDS = {"mail.send_reply", "slack.reply", "jira.create", "jira.assign", "jira.comment"}

    def assert_real_steps(self, steps, status):
        """The page holds all five outside kinds, each with a preview and the
        keys the per-page reads feed (so the counts are not measured on empty pages)."""
        self.assertEqual({s["kind"] for s in steps}, self.KINDS)
        for step in steps:
            self.assertEqual(step["status"], status)
            self.assertTrue(step["preview"], step["kind"])
            self.assertIn("links", step)
            self.assertIn("disabled_reason", step)

    def test_a_bundles_detail_is_constant_in_its_outside_steps(self):
        five = self.measure(DETAIL.format(self.outside_of(5).pk))
        self.assert_real_steps(self.last.json()["steps"], "proposed")
        ten = self.measure(DETAIL.format(self.outside_of(10).pk))
        self.assertEqual(len(self.last.json()["steps"]), 10)
        self.assert_real_steps(self.last.json()["steps"], "proposed")
        self.assertEqual(five, ten)
        self.assertEqual(ten, OUTSIDE_DETAIL_QUERIES)
        self.assertLessEqual(ten, BUNDLE_DETAIL_CEILING + 2)

    def test_a_history_page_is_constant_in_its_rows(self):
        def ran():
            bundle = self.outside_of(5)
            self.assertEqual(self.run_all_steps(self.csm, bundle).status_code, 200)
            self.assertEqual(set(bundle.steps.values_list("status", flat=True)), {"applied"})

        ran()
        small = self.measure(HISTORY)
        self.assertEqual(len(self.last.json()["results"]), 1)
        self.assert_real_steps(self.last.json()["results"][0]["steps"], "applied")
        for _ in range(3):
            ran()
        many = self.measure(HISTORY)
        self.assertEqual(len(self.last.json()["results"]), 4)
        self.assertEqual(many, small)
        self.assertEqual(small, OUTSIDE_HISTORY_QUERIES)
        self.assertLessEqual(small, HISTORY_CEILING + 1)

    def test_the_options_route_is_constant(self):
        bundle = self.outside_of(3)
        step = bundle.steps.get(position=3)
        first = self.measure(OPTIONS.format(bundle.pk, step.pk))
        self.slack_connector(channel="C0OTHER", name="other")
        self.jira_connector(project="OPS")
        self.assertEqual(self.measure(OPTIONS.format(bundle.pk, step.pk)), first)
