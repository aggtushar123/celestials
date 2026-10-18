"""The suggested group (contract §2.2): open recommendations sent to the
reader, of the four kinds shown nowhere else in the feed, on records they
may open; newest first."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.accounts.models import User
from services.work.feed_suggest import Suggestions
from services.work.tests.feed_fixtures import FeedFixture


class SuggestionsTests(FeedFixture):
    def source(self, user):
        return Suggestions(User.objects.get(pk=user.pk), self.today)

    def test_a_suggestion(self):
        rec = self.suggestion(self.csm, self.dough)
        ((key, entry),) = self.source(self.csm).page(None, 10)
        self.assertEqual(key, (rec.created_at, rec.pk))
        self.assertEqual(
            {
                k: entry[k]
                for k in ("key", "kind", "id", "title", "record", "from", "actions", "priority")
            },
            {
                "key": f"recommendation:{rec.pk}",
                "kind": "suggestion",
                "id": rec.pk,
                "title": "Prepare Dough Co's renewal",
                "record": {"type": "customer", "id": self.dough.pk, "name": "Dough Co"},
                "from": {"type": "revenact", "label": "Revenact"},
                "actions": ["add", "assign", "dismiss"],
                "priority": None,
            },
        )
        detail = entry["detail"]
        self.assertEqual(
            (detail["id"], detail["kind"], detail["agent_action"]), (rec.pk, "renewal_due", None)
        )
        self.assertEqual(detail["suggested_assignee"]["id"], self.csm.pk)
        self.assertEqual(set(detail["defaults"]), {"title", "due_date", "priority"})

    def test_only_the_four_kinds(self):
        for kind in (
            "renewal_due",
            "health_drop",
            "urgent_tickets",
            "anomaly",
            "overdue_tasks",
            "open_questions",
        ):
            self.suggestion(self.csm, self.pizza, kind=kind)
        source = self.source(self.csm)
        self.assertEqual(source.count(), 4)
        self.assertEqual(
            sorted(entry["detail"]["kind"] for _key, entry in source.page(None, 10)),
            ["anomaly", "health_drop", "renewal_due", "urgent_tickets"],
        )

    def test_only_the_recipients_and_only_on_records_they_open(self):
        self.suggestion(self.mona, self.soup)
        self.suggestion(self.csm, self.soup, kind="health_drop")
        source = self.source(self.csm)
        self.assertEqual((source.count(), source.hidden()), (0, 1))
        self.assertEqual(self.source(self.mona).count(), 1)

    def test_newest_first_and_paged(self):
        old = self.suggestion(self.csm, self.pizza)
        new = self.suggestion(self.csm, self.dough)
        self.age(old, 3)
        first = self.source(self.csm).page(None, 1)
        self.assertEqual([entry["id"] for _key, entry in first], [new.pk])
        rest = self.source(self.csm).page(first[-1][0], 10)
        self.assertEqual([entry["id"] for _key, entry in rest], [old.pk])

    def test_page_costs_the_same_queries_for_one_or_three(self):
        def cost():
            source = self.source(self.csm)
            with CaptureQueriesContext(connection) as queries:
                source.page(None, 10)
            return len(queries)

        self.suggestion(self.csm, self.pizza)
        cost()  # warm process-level caches
        one = cost()
        self.suggestion(self.csm, self.dough, kind="health_drop")
        self.suggestion(self.csm, self.pizza, kind="anomaly")
        self.assertEqual(cost(), one)
