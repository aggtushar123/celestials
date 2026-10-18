"""The feed and its count cost the same however many items wait (contract
§2.7), under a pinned ceiling, and no query uses DISTINCT (Postgres 16)."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.accounts.models import User
from services.work.models import SlackSuggestion
from services.work.tests.feed_fixtures import COUNT, FEED, FeedFixture

#: Measured on this branch (Task 9, Step 6); raise only with a reason in the commit.
#: Agent bundles Task 12: +1, a page of bundles reads its steps once.
#: Connections spec §3: +5, Slack messages sent to Work (savepoint pair, count,
#: page, the records they name read once).
#: Slack message actions (2026-10-16): +2, the Jira connection and the named
#: records' open tickets, each read once per page.
#: SE4-25: +1, the reader's participation, once per page.
#: Email agent (2026-10-17): +4, meeting proposals' count, page and its two
#: prefetches (attendees, attendees without Calendar), once per page; and +4 for
#: the reader's own suggestions from their sent mail (count, page, two prefetches).
FEED_CEILING = 70
#: Agent bundles Task 17: +3, the badge also counts the reader's own department queue.
COUNT_CEILING = 26
PAIRS = [
    ("renewal_due", "pizza"),
    ("health_drop", "pizza"),
    ("urgent_tickets", "pizza"),
    ("anomaly", "pizza"),
    ("renewal_due", "dough"),
    ("health_drop", "dough"),
]


class FeedQueryTests(FeedFixture):
    def seed(self, n):
        kind, on = PAIRS[n]
        self.review(self.csm, name=f"Rule {n}")
        self.proposal(self.pizza, title=f"Play {n}")
        self.question(self.csm, customer=self.pizza, text=f"Question {n}")
        self.reply(self.csm, self.dough)
        self.due(self.csm, self.pizza, due_in=-1, title=f"Late {n}")
        self.due(self.csm, self.emea, due_in=3, title=f"Soon {n}")
        self.todo(self.csm, title=f"To-do {n}")
        self.suggestion(self.csm, getattr(self, on), kind=kind)
        SlackSuggestion.objects.create(
            organisation=self.csm.organisation,
            owner=self.csm,
            customer=self.pizza,
            summary=f"Slack {n}",
            team_id="T0ACME",
            channel="D0DM",
            message_ts=f"1760000000.{n:06d}",
        )

    def measure(self, url):
        client = self.as_user(User.objects.get(pk=self.csm.pk))
        client.get(url)  # warm per-process caches
        client = self.as_user(User.objects.get(pk=self.csm.pk))
        with CaptureQueriesContext(connection) as queries:
            self.assertEqual(client.get(url).status_code, 200)
        return queries

    def check(self, url, ceiling):
        self.seed(0)
        few = self.measure(url)
        for n in range(1, len(PAIRS)):
            self.seed(n)
        many = self.measure(url)
        self.assertEqual(len(few), len(many), [q["sql"] for q in many.captured_queries])
        self.assertLessEqual(len(many), ceiling)
        for query in many.captured_queries:
            self.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])

    def test_the_feed_costs_the_same_however_many_items_wait(self):
        self.check(FEED, FEED_CEILING)

    def test_the_count_costs_the_same_however_many_items_wait(self):
        self.check(COUNT, COUNT_CEILING)
