"""Recommended (spec §2.3 Read, §4): the open recommendations a reader may
decide, newest first, each with what its card shows; those about records
they cannot open counted in `hidden`, never named. And what Assign
prefills."""

import json
from datetime import date, timedelta

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.accounts.models import User
from services.agents.tests.mixed import add_mixed_actions
from services.customers.models import Customer
from services.metrics.models import AgentAction
from services.segments.tests.fixtures import person
from services.work.clock import add_working_days
from services.work.defaults import default_due, default_priority, describe
from services.work.models import Recommendation
from services.work.prefs import settings_for
from services.work.tests.recommend_fixtures import RecommendFixture, task_proposal

URL = "/api/v1/work/recommendations/"


class RecommendedListTests(RecommendFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.dough_rec = cls.make_rec(on=cls.dough, recipient=cls.mona, suggested=cls.csm, value=30)
        cls.taco_rec = cls.make_rec(on=cls.taco, recipient=cls.other, suggested=cls.other)
        cls.loose_rec = cls.make_rec(on=cls.loose, recipient=cls.admin)
        cls.done = cls.make_rec(
            "health_drop", on=cls.dough, recipient=cls.mona, suggested=cls.csm, status="dismissed"
        )
        cls.pizza_rec = cls.make_rec(on=cls.pizza, recipient=cls.csm, suggested=cls.csm)

    def ids(self, user, scope=None):
        body = self.ok(user, URL if scope is None else f"{URL}?scope={scope}")
        return [item["id"] for item in body["items"]]

    def test_a_managers_team_is_everything_they_may_decide_newest_first(self):
        body = self.ok(self.mona, f"{URL}?scope=team")
        self.assertEqual(body["scope"], "team")
        self.assertEqual([i["id"] for i in body["items"]], [self.pizza_rec.pk, self.dough_rec.pk])
        self.assertEqual((body["count"], body["hidden"]), (2, 0))

    def test_me_is_the_callers_own_queue(self):
        self.assertEqual(self.ids(self.mona, "me"), [self.dough_rec.pk])
        self.assertEqual(self.ids(self.csm, "me"), [self.pizza_rec.pk])
        self.assertEqual(self.ids(self.other, "me"), [self.taco_rec.pk])
        self.assertEqual(self.ids(self.admin, "me"), [self.loose_rec.pk])

    def test_the_default_scope_is_team_for_managers_and_view_all(self):
        self.assertEqual(self.ok(self.mona, URL)["scope"], "team")
        self.assertEqual(self.ok(self.admin, URL)["scope"], "team")
        self.assertEqual(self.ok(self.csm, URL)["scope"], "me")
        self.assertEqual(self.ok(self.lee, URL)["scope"], "me")

    def test_view_all_decides_every_open_one(self):
        self.assertEqual(
            self.ids(self.admin, "team"),
            [self.pizza_rec.pk, self.loose_rec.pk, self.taco_rec.pk, self.dough_rec.pk],
        )

    def test_a_row_carries_what_the_card_shows(self):
        [row] = self.ok(self.mona, f"{URL}?scope=me")["items"]
        self.assertEqual(
            row,
            {
                "id": self.dough_rec.pk,
                "kind": "renewal_due",
                "title": "Prepare Dough Co's renewal",
                "why": {
                    "facts": ["Renews in 30 days"],
                    "evidence": [{"label": "Dough Co", "link": f"/organizations/{self.dough.pk}"}],
                },
                "record": {"kind": "customer", "id": self.dough.pk, "name": "Dough Co"},
                "suggested_assignee": {
                    "id": self.csm.pk,
                    "name": "Carl CSM",
                    "active": True,
                    "can_open": True,
                },
                "recipient": {"id": self.mona.pk, "name": "Mona Manager"},
                "defaults": {
                    "title": "Prepare Dough Co's renewal",
                    "due_date": (self.today + timedelta(days=23)).isoformat(),
                    "priority": "high",
                },
                "agent_action": None,
                "created_at": row["created_at"],
            },
        )

    def test_an_accounts_row_names_the_account(self):
        east = self.make_rec(on=self.east, recipient=self.mona, suggested=self.csm)
        row = next(i for i in self.ok(self.mona, f"{URL}?scope=me")["items"] if i["id"] == east.pk)
        self.assertEqual(
            row["record"], {"kind": "account", "id": self.east.pk, "name": "Taco East"}
        )

    def test_an_accounts_row_says_whether_its_suggested_person_can_open_the_account(self):
        # Carl owns Taco East; Taco West is Dana's, which Carl cannot open.
        east = self.make_rec(on=self.east, recipient=self.mona, suggested=self.csm)
        west = self.make_rec(on=self.west, recipient=self.other, suggested=self.csm)
        rows = {i["id"]: i for i in self.ok(self.admin, f"{URL}?scope=team")["items"]}
        self.assertEqual(
            (rows[east.pk]["record"]["kind"], rows[east.pk]["suggested_assignee"]["can_open"]),
            ("account", True),
        )
        self.assertEqual(
            (rows[west.pk]["record"]["kind"], rows[west.pk]["suggested_assignee"]["can_open"]),
            ("account", False),
        )

    def test_a_record_the_reader_cannot_open_is_counted_not_named(self):
        self.make_rec(on=self.west, recipient=self.mona, title="Prepare Taco West's renewal")
        body = self.ok(self.mona, f"{URL}?scope=me")
        self.assertEqual((body["count"], body["hidden"]), (1, 1))
        self.assertNotIn("Taco West", json.dumps(body))

    def test_a_suggested_person_who_lost_access_is_flagged(self):
        Customer.objects.filter(pk=self.dough.pk).update(owner=self.other)
        body = self.ok(self.admin, f"{URL}?scope=team")
        row = next(i for i in body["items"] if i["id"] == self.dough_rec.pk)
        self.assertFalse(row["suggested_assignee"]["can_open"])

    def test_an_inactive_suggested_person_reads_as_inactive_and_cannot_be_opened(self):
        User.objects.filter(pk=self.csm.pk).update(is_active=False)
        body = self.ok(self.admin, f"{URL}?scope=team")
        row = next(i for i in body["items"] if i["id"] == self.dough_rec.pk)
        self.assertEqual(
            (row["suggested_assignee"]["active"], row["suggested_assignee"]["can_open"]),
            (False, False),
        )

    def test_team_scope_also_counts_what_the_reader_cannot_open(self):
        # Mona already decides pizza_rec and dough_rec; Taco West is Dana's
        # (outside Mona's chain), so its recommendation is hidden, not shown.
        self.make_rec(on=self.west, recipient=self.mona, title="Prepare Taco West's renewal")
        body = self.ok(self.mona, f"{URL}?scope=team")
        self.assertEqual((body["count"], body["hidden"]), (2, 1))

    def test_a_skip_level_manager_sees_their_reports_reports_in_team_scope(self):
        # Bob manages Mona, who manages Carl; dough_rec is suggested to Carl.
        boss = person("bob@acme.io", "Bob Boss", self.org)
        User.objects.filter(pk=self.mona.pk).update(reports_to=boss)
        body = self.ok(boss, f"{URL}?scope=team")
        self.assertIn(self.dough_rec.pk, [i["id"] for i in body["items"]])

    def test_the_agents_row_defaults_from_its_proposal(self):
        proposal = task_proposal(self.org, self.soup, due_in=10, priority="medium")
        rec = self.make_rec(
            "agent_action",
            on=self.soup,
            recipient=self.mona,
            suggested=self.mona,
            agent_action=proposal,
        )
        row = next(i for i in self.ok(self.mona, f"{URL}?scope=me")["items"] if i["id"] == rec.pk)
        self.assertEqual(row["agent_action"]["id"], proposal.pk)
        self.assertEqual(
            (row["defaults"]["due_date"], row["defaults"]["priority"]),
            ((self.today + timedelta(days=10)).isoformat(), "medium"),
        )

    def test_an_unknown_scope_is_refused(self):
        response = self.get(self.mona, f"{URL}?scope=company")
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"code": "SCOPE_UNKNOWN", "detail": "Choose me or team."}),
        )

    def test_leadership_and_other_workspaces_decide_nothing_here(self):
        for reader in (self.lee, self.stranger):
            for scope in ("me", "team"):
                with self.subTest(reader=reader.name, scope=scope):
                    body = self.ok(reader, f"{URL}?scope={scope}")
                    self.assertEqual((body["items"], body["count"], body["hidden"]), ([], 0, 0))


class ListQueryShapeTests(RecommendFixture):
    """The list is hot (the sidebar badge polls it on every route change):
    its query count must track the page's distinct suggested assignees,
    never its row count."""

    def build_rows(self, assignees):
        """One open recommendation per `assignees` entry, each on its own
        fresh customer so the one-open-per-record constraint never binds."""
        for i, assignee in enumerate(assignees):
            record = self.customer(f"Extra {i}", None, 10_000, "5.0")
            self.make_rec(on=record, recipient=self.mona, suggested=assignee)

    def test_the_query_count_tracks_assignees_not_rows(self):
        few = (self.csm, self.other, self.mona)
        self.build_rows(few)
        settings_for(self.org)  # the workspace's settings row is made on first read
        with CaptureQueriesContext(connection) as small:
            body = self.ok(self.admin, f"{URL}?scope=team")
        self.assertEqual(len(body["items"]), 3)

        # Six more rows, reusing exactly the same three assignees.
        many = few * 3
        self.build_rows(many)
        with CaptureQueriesContext(connection) as big:
            body = self.ok(self.admin, f"{URL}?scope=team")
        self.assertEqual(len(body["items"]), 3 + 9)
        self.assertEqual(len(big.captured_queries), len(small.captured_queries))


class AgentActionQueryShapeTests(RecommendFixture):
    """Other kinds' previews look up tasks, people and attributes: done once
    for the page, so rows of those kinds add no query."""

    def add(self, number):
        record, actions = add_mixed_actions(self, number)
        for action in actions:
            self.make_rec("agent_action", on=record, recipient=self.mona, agent_action=action)

    def test_non_task_kinds_add_no_queries(self):
        self.add(0)
        settings_for(self.org)
        with CaptureQueriesContext(connection) as small:
            body = self.ok(self.admin, f"{URL}?scope=team")
        self.assertEqual(len(body["items"]), 3)
        for number in range(1, 5):
            self.add(number)
        with CaptureQueriesContext(connection) as big:
            body = self.ok(self.admin, f"{URL}?scope=team")
        self.assertEqual(len(body["items"]), 15)
        self.assertEqual(len(big.captured_queries), len(small.captured_queries))


class DefaultsTests(RecommendFixture):
    def test_working_days_skip_the_weekend(self):
        self.assertEqual(add_working_days(date(2026, 10, 5), 3), date(2026, 10, 8))  # Mon -> Thu
        self.assertEqual(add_working_days(date(2026, 10, 9), 3), date(2026, 10, 14))  # Fri -> Wed
        self.assertEqual(add_working_days(date(2026, 10, 10), 3), date(2026, 10, 14))  # Sat -> Wed

    def test_a_renewal_is_due_a_week_before_and_never_in_the_past(self):
        rec = self.make_rec(on=self.dough, recipient=self.mona)
        self.assertEqual(default_due(rec, self.today), self.today + timedelta(days=23))
        Customer.objects.filter(pk=self.dough.pk).update(
            renewal_date=self.today + timedelta(days=3)
        )
        self.assertEqual(default_due(Recommendation.objects.get(pk=rec.pk), self.today), self.today)

    def test_anything_else_is_three_working_days_away(self):
        rec = self.make_rec("urgent_tickets", on=self.taco, recipient=self.other)
        self.assertEqual(default_due(rec, date(2026, 10, 9)), date(2026, 10, 14))

    def test_a_malformed_proposal_action_never_500s_the_list(self):
        proposal = task_proposal(self.org, self.soup)
        AgentAction.objects.filter(pk=proposal.pk).update(payload=["not", "a", "dict"])
        rec = self.make_rec(
            "agent_action",
            on=self.soup,
            recipient=self.mona,
            suggested=self.mona,
            agent_action=proposal,
        )
        rec.refresh_from_db()
        self.assertEqual(default_due(rec, self.today), add_working_days(self.today, 3))
        self.assertEqual(default_priority(rec), "medium")
        row = next(i for i in self.ok(self.mona, f"{URL}?scope=me")["items"] if i["id"] == rec.pk)
        self.assertEqual(row["defaults"]["priority"], "medium")

    def test_priority_by_kind(self):
        expected = {
            "renewal_due": "high",
            "health_drop": "high",
            "urgent_tickets": "high",
            "anomaly": "high",
        }
        for kind, priority in expected.items():
            with self.subTest(kind=kind):
                self.assertEqual(default_priority(Recommendation(kind=kind)), priority)

    def test_the_description_lists_the_facts(self):
        self.assertEqual(
            describe(["Renews in 9 days", "Renewal date 6 Nov"]),
            "Recommended by Revenact:\n- Renews in 9 days\n- Renewal date 6 Nov",
        )
        self.assertEqual(describe([]), "")
