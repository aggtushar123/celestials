"""The queue rail (contract §10.3, D8): the queues the reader may use, in
order, each counting what needs action (decide plus overdue); History has no
count; a failing queue has a null count and is named in `failed`."""

from unittest.mock import patch

from services.accounts.models import User
from services.agents.tests.intake_fixtures import IntakeFixture
from services.work.tests.feed_fixtures import FeedFixture

QUEUES = "/api/v1/work/queues/"


class QueuesTests(FeedFixture):
    def get(self, user):
        response = self.as_user(User.objects.get(pk=user.pk)).get(QUEUES)
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_each_reader_gets_their_queues(self):
        self.proposal(self.pizza, title="Carl's")
        self.due(self.csm, self.pizza, due_in=-1, title="Late")
        self.suggestion(self.csm, self.pizza)  # not counted (D8)
        carl = self.get(self.csm)
        self.assertEqual(
            carl,
            {
                "queues": [
                    {"key": "mine", "label": "Mine", "count": 2, "needs_customer": None},
                    {"key": "history", "label": "History", "count": None, "needs_customer": None},
                ],
                "failed": [],
            },
        )
        mona = self.get(self.mona)
        self.assertEqual(
            [(q["key"], q["count"]) for q in mona["queues"]],
            [("mine", 0), ("team", 2), ("history", None)],
        )
        alice = self.get(self.admin)
        self.assertEqual(
            [(q["key"], q["label"], q["count"]) for q in alice["queues"]],
            [("mine", "Mine", 0), ("company", "Rest of company", 2), ("history", "History", None)],
        )

    def test_a_failing_queue(self):
        with patch("services.work.feed_team.counts", side_effect=RuntimeError("down")):
            body = self.get(self.mona)
        self.assertEqual(body["failed"], ["team"])
        self.assertIsNone(next(q for q in body["queues"] if q["key"] == "team")["count"])
        self.assertEqual(next(q for q in body["queues"] if q["key"] == "mine")["count"], 0)

    def test_a_queue_whose_sources_partly_fail_is_failed(self):
        with patch("services.work.feed_team.counts", return_value=(5, ["task"])):
            body = self.get(self.mona)
        self.assertEqual(body["failed"], ["team"])
        self.assertIsNone(next(q for q in body["queues"] if q["key"] == "team")["count"])


class NeedsCustomerTests(IntakeFixture):
    def rail(self, user):
        return self.client_for(user).get(QUEUES).json()

    def test_a_routed_queue_counts_what_needs_a_customer(self):
        from services.connectors.tests.unmatched_fixtures import item

        jira = self.connector("jira", "cs")
        item(jira)
        item(jira)
        rows = {row["key"]: row for row in self.rail(self.csm)["queues"]}
        self.assertEqual(rows["department:cs"]["needs_customer"], 2)
        self.assertEqual(rows["department:cs"]["count"], 0)
        self.assertIsNone(rows["mine"]["needs_customer"])
        self.assertIsNone(rows["history"]["needs_customer"])

    def test_a_failing_item_count_leaves_the_bundle_count(self):
        self.connector("jira", "cs")
        with patch("services.connectors.unmatched.count", side_effect=RuntimeError):
            rows = self.rail(self.csm)
        cs = next(row for row in rows["queues"] if row["key"] == "department:cs")
        self.assertEqual((cs["count"], cs["needs_customer"], rows["failed"]), (0, None, []))
