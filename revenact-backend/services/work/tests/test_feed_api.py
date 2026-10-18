"""GET /work/feed/ and /work/feed/count/ (contract §2): one list in eight
groups, the kind filter, keyset pages, partial failure, privacy and the
badge."""

import json
from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from services.accounts.models import User
from services.customers.models import Task
from services.work import feed_decide, feed_tasks
from services.work.feed_shape import CHOOSE_KIND, GROUPS, STALE_CURSOR
from services.work.tests.feed_fixtures import COUNT, FEED, FeedFixture


class FeedApiTests(FeedFixture):
    def everything(self):
        """One of each kind on Carl's desk, oldest first in the decide group."""
        self.review_ = self.review(self.csm)
        self.action = self.proposal(self.pizza)
        self.asked = self.question(self.csm, customer=self.pizza)
        self.draft = self.reply(self.csm, self.dough)
        aged = (
            (4, self.review_),
            (3, self.action),
            (3, self.action.bundle),
            (2, self.asked),
            (1, self.draft),
        )
        for days, row in aged:
            self.age(row, days)
        self.late = self.due(self.csm, self.pizza, due_in=-1)
        self.mine = self.todo(self.csm)
        self.rec = self.suggestion(self.csm, self.dough)

    def test_the_whole_feed(self):
        self.everything()
        body = self.body(self.csm)
        self.assertEqual([g["key"] for g in body["groups"]], list(GROUPS))
        self.assertEqual((body["hidden"], body["failed"]), (0, []))
        decide = self.group(body, "decide")
        self.assertEqual(
            [i["key"] for i in decide["items"]],
            [
                f"rule_review:{self.review_.pk}",
                f"bundle:{self.action.bundle_id}",
                f"question:{self.asked.pk}",
                f"draft:{self.draft.pk}",
            ],
        )
        self.assertEqual((decide["count"], decide["next"]), (4, None))
        self.assertEqual([i["id"] for i in self.group(body, "overdue")["items"]], [self.late.pk])
        self.assertEqual([i["id"] for i in self.group(body, "no_date")["items"]], [self.mine.pk])
        self.assertEqual([i["id"] for i in self.group(body, "suggested")["items"]], [self.rec.pk])
        for key in ("today", "week", "later", "blocked"):
            self.assertEqual(
                self.group(body, key), {"key": key, "count": 0, "items": [], "next": None}
            )
        keys = [i["key"] for g in body["groups"] for i in g["items"]]
        self.assertEqual(len(keys), len(set(keys)))

    def test_the_kind_filter(self):
        self.everything()
        body = self.body(self.csm, kind="approval,rule_review")
        decide = self.group(body, "decide")
        self.assertEqual([i["kind"] for i in decide["items"]], ["rule_review", "bundle"])
        self.assertEqual(decide["count"], 2)
        for key in GROUPS[1:]:
            self.assertEqual(self.group(body, key)["count"], 0)
        todos = self.body(self.csm, kind="todo")
        self.assertEqual([i["id"] for i in self.group(todos, "no_date")["items"]], [self.mine.pk])
        self.assertEqual(self.group(todos, "overdue")["count"], 0)

    def test_refused_queries(self):
        cases = (
            ({"kind": ""}, {"kind": [CHOOSE_KIND]}),
            ({"kind": "approvals"}, {"kind": [CHOOSE_KIND]}),
            (
                {"group": "inbox"},
                {
                    "group": [
                        "Choose decide, overdue, today, week, later, no_date, blocked or suggested."
                    ]
                },
            ),
            ({"cursor": "abc"}, {"cursor": ["Say which group to page."]}),
            ({"group": "decide", "cursor": "abc"}, {"cursor": [STALE_CURSOR]}),
        )
        for params, error in cases:
            response = self.feed(self.csm, **params)
            self.assertEqual((response.status_code, response.json()), (400, error), params)

    def test_a_cursor_for_another_group_is_stale(self):
        for i in range(51):
            self.todo(self.csm, title=f"To-do {i}")
        token = self.group(self.body(self.csm), "no_date")["next"]
        response = self.feed(self.csm, group="today", cursor=token)
        self.assertEqual((response.status_code, response.json()), (400, {"cursor": [STALE_CURSOR]}))

    def test_paging_a_task_group_never_skips_what_was_acted_on(self):
        made = [self.todo(self.csm, title=f"To-do {i}") for i in range(55)]
        first = self.group(self.body(self.csm), "no_date")
        self.assertEqual((first["count"], len(first["items"])), (55, 50))
        Task.objects.filter(pk__in=[made[0].pk, made[1].pk]).update(status="completed")
        second = self.body(self.csm, group="no_date", cursor=first["next"])
        self.assertEqual(second["failed"], [])
        page = second["group"]
        self.assertEqual((page["key"], page["count"], page["next"]), ("no_date", 53, None))
        self.assertEqual([i["id"] for i in page["items"]], [m.pk for m in made[50:]])

    def test_paging_the_decide_group_across_sources(self):
        made = []
        for i in range(30):
            review = self.review(self.csm, name=f"Rule {i}")
            question = self.question(self.csm, customer=self.pizza, text=f"Question {i}")
            self.age(review, 100 - 2 * i)
            self.age(question, 99 - 2 * i)
            made += [f"rule_review:{review.pk}", f"question:{question.pk}"]
        first = self.group(self.body(self.csm), "decide")
        rest = self.body(self.csm, group="decide", cursor=first["next"])["group"]
        self.assertEqual(
            [i["key"] for i in first["items"]] + [i["key"] for i in rest["items"]], made
        )
        self.assertIsNone(rest["next"])

    def test_a_group_without_a_cursor_is_its_first_page(self):
        self.everything()
        body = self.body(self.csm, group="suggested")
        self.assertEqual([i["id"] for i in body["group"]["items"]], [self.rec.pk])

    def test_one_failing_source_leaves_the_rest(self):
        self.everything()
        with (
            patch.object(feed_decide.Bundles, "page", side_effect=RuntimeError("boom")),
            self.assertLogs("services.work.feed", "WARNING") as logs,
        ):
            body = self.body(self.csm)
        self.assertEqual(body["failed"], ["bundle"])
        decide = self.group(body, "decide")
        self.assertEqual(decide["count"], 3)
        self.assertNotIn("bundle", [i["kind"] for i in decide["items"]])
        self.assertEqual(self.group(body, "overdue")["count"], 1)
        self.assertIn("bundle failed: RuntimeError", logs.output[0])

    def test_a_database_error_in_one_source_does_not_poison_the_others(self):
        self.everything()

        def broken(*_args, **_kwargs):
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1 / 0")

        with patch.object(feed_decide.Questions, "page", side_effect=broken):
            body = self.body(self.csm)
        self.assertEqual(body["failed"], ["question"])
        self.assertEqual(self.group(body, "suggested")["count"], 1)
        self.assertEqual(self.group(body, "no_date")["count"], 1)

    def test_tasks_and_to_dos_fail_together(self):
        self.everything()
        with patch.object(feed_tasks.Tasks, "counts", side_effect=RuntimeError("boom")):
            body = self.body(self.csm)
        self.assertEqual(body["failed"], ["task", "todo"])
        self.assertEqual(self.group(body, "no_date")["count"], 0)
        self.assertEqual(self.group(body, "decide")["count"], 4)

    def test_nobody_else_sees_a_to_do(self):
        self.todo(self.csm, title="Renew my passport", due_in=-1)
        for reader in (self.mona, self.admin, self.lee, self.other):
            text = json.dumps(self.body(reader))
            self.assertNotIn("Renew my passport", text, reader.name)

    def test_hidden_items_are_counted_never_named(self):
        self.due(self.csm, self.west, due_in=-1, created_by=self.other, title="West handover")
        self.suggestion(self.csm, self.soup, title="Prepare Soup's renewal")
        self.reply(self.csm, self.soup)
        response = self.feed(self.csm)
        self.assertEqual(response.json()["hidden"], 3)
        for name in ("West handover", "Taco West", "Soup Co"):
            self.assertNotIn(name, response.content.decode())

    def test_an_overdue_task_is_shown_once_and_retired_kinds_never(self):
        task = self.due(self.csm, self.pizza, due_in=-3)
        self.suggestion(self.csm, self.pizza, kind="overdue_tasks")
        body = self.body(self.csm)
        keys = [i["key"] for g in body["groups"] for i in g["items"]]
        self.assertEqual(keys, [f"task:{task.pk}"])

    def test_the_count(self):
        self.everything()
        self.due(self.csm, self.dough, due_in=-5, status="blocked", reason="Legal")
        self.todo(self.csm, due_in=-2)
        response = self.as_user(User.objects.get(pk=self.csm.pk)).get(COUNT)
        self.assertEqual(response.json(), {"decide": 4, "overdue": 2, "badge": 6, "failed": []})
        mona = self.as_user(User.objects.get(pk=self.mona.pk)).get(COUNT)
        self.assertEqual(mona.json(), {"decide": 0, "overdue": 0, "badge": 0, "failed": []})

    def test_a_failing_source_counts_nothing(self):
        self.everything()
        with patch.object(feed_decide.Drafts, "count", side_effect=RuntimeError("boom")):
            response = self.as_user(User.objects.get(pk=self.csm.pk)).get(COUNT)
        self.assertEqual(
            response.json(), {"decide": 3, "overdue": 1, "badge": 4, "failed": ["draft"]}
        )

    def test_the_badge_costs_the_same_however_many_sessions_hold_proposals(self):
        """Sessions the reader neither owns nor sits in are ruled out in
        SQL, before any per-session check."""
        carl = self.as_user(self.csm)
        carl.get(COUNT)  # warm per-process caches
        with CaptureQueriesContext(connection) as none:
            self.assertEqual(carl.get(COUNT).json()["badge"], 0)
        for i in range(10):
            session = self.session(self.other, self.mona, title=f"Dana's session {i}")
            self.proposal(self.taco, session=session)
        with CaptureQueriesContext(connection) as ten:
            self.assertEqual(carl.get(COUNT).json()["badge"], 0)
        self.assertEqual(len(ten), len(none), [q["sql"] for q in ten])

    def test_brain_waiting_is_gone(self):
        for url in ("/api/v1/brain/waiting/?scope=me", "/api/v1/brain/waiting/count/"):
            self.assertEqual(self.as_user(self.csm).get(url).status_code, 404, url)

    def test_today_is_gone(self):
        self.assertEqual(self.as_user(self.csm).get("/api/v1/work/today/").status_code, 404)

    def test_signed_out_is_refused(self):
        for url in (FEED, COUNT):
            self.assertEqual(APIClient().get(url).status_code, 401)
