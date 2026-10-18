"""The Team queue costs the same however many items wait (delivery 2
contract §1.7), under a pinned ceiling, and no query uses DISTINCT."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.accounts.models import User
from services.rules.models import Rule
from services.work.tests.feed_fixtures import TEAM, FeedFixture

#: Measured on this branch (Task 5, Step 6); raise only with a reason in the commit.
#: Agent bundles Task 13: +1, a page of bundles reads its steps once.
#: SE4-25: +1, the reader's participation, once per page.
TEAM_CEILING = 47
PAIRS = [
    ("renewal_due", "pizza"),
    ("health_drop", "pizza"),
    ("urgent_tickets", "pizza"),
    ("anomaly", "pizza"),
    ("renewal_due", "dough"),
    ("health_drop", "dough"),
]


class TeamQueueQueryTests(FeedFixture):
    def seed(self, n):
        kind, on = PAIRS[n]
        self.review(self.csm, name=f"Rule {n}", sharing=Rule.Sharing.WORKSPACE)
        self.proposal(self.pizza, title=f"Play {n}")
        self.question(self.csm, customer=self.pizza, text=f"Question {n}")
        self.due(self.csm, self.pizza, due_in=-1, title=f"Late {n}")
        self.due(self.csm, self.west, due_in=-1, title=f"Hidden {n}")
        self.todo(self.csm, due_in=-1, title=f"To-do {n}")
        self.suggestion(self.csm, getattr(self, on), kind=kind)

    def measure(self, user, scope):
        url = f"{TEAM}?scope={scope}"
        client = self.as_user(User.objects.get(pk=user.pk))
        client.get(url)  # warm per-process caches
        client = self.as_user(User.objects.get(pk=user.pk))
        with CaptureQueriesContext(connection) as queries:
            self.assertEqual(client.get(url).status_code, 200)
        return queries

    def check(self, user, scope):
        self.seed(0)
        few = self.measure(user, scope)
        for n in range(1, len(PAIRS)):
            self.seed(n)
        many = self.measure(user, scope)
        self.assertEqual(len(few), len(many), [q["sql"] for q in many.captured_queries])
        self.assertLessEqual(len(many), TEAM_CEILING)
        for query in many.captured_queries:
            self.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])

    def test_my_team_costs_the_same_however_many_items_wait(self):
        self.check(self.mona, "team")

    def test_company_costs_the_same_however_many_items_wait(self):
        self.check(self.admin, "company")
