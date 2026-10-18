"""Reading plans: whoever may open the record reads the plan, and nobody
else ever sees it listed or counted; each task keeps its own rule, so counts
are over the tasks the reader can see and the rest are `hidden_tasks`; the
list's filters, counts and cursor; the record sections; fixed query counts
and no outer DISTINCT."""

import json
from base64 import urlsafe_b64encode
from datetime import timedelta
from unittest.mock import patch

from django.db import connection
from django.test import SimpleTestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from services.plans import listing
from services.plans.tests.fixtures import PlanFixture, iso

URL = "/api/v1/plans/"
ROW_KEYS = {
    "id", "name", "kind", "status", "record", "owner", "start_date", "target_date",
    "milestones_done", "milestones_total", "tasks_done", "tasks_total", "next_due",
    "is_overdue", "can_edit", "pending_tasks", "started_by_agent",
}  # fmt: skip
DETAIL_KEYS = ROW_KEYS | {
    "template", "started_by", "started_by_rule", "status_set_by", "done_at", "created_at",
    "milestones", "hidden_tasks", "can_delete",
}  # fmt: skip
MILESTONE_KEYS = {
    "id", "name", "position", "due_date", "done_at", "is_overdue", "tasks", "hidden_tasks",
    "tasks_done", "tasks_total",
}  # fmt: skip
TASK_KEYS = {"id", "title", "priority", "status", "due_date", "assignee", "can_check"}
STATUSES = ("not_started", "on_track", "at_risk", "done", "cancelled", "draft")


def counted(**found):
    return {status: found.get(status, 0) for status in STATUSES}


def _cursor(payload):
    """An opaque cursor around an arbitrary JSON payload, the way a crafted
    (not `encode_cursor`-made) one would arrive."""
    return urlsafe_b64encode(json.dumps(payload).encode()).decode()


class DecodeCursorTests(SimpleTestCase):
    """`decode_cursor` reads every malformed shape as the first page (`None`),
    never raising: no DB needed, so no fixtures."""

    def test_an_id_too_large_to_be_an_int_is_malformed(self):
        # 1e999 overflows to float('inf'); int(inf) raises OverflowError.
        self.assertIsNone(listing.decode_cursor(_cursor(["2026-10-01T00:00:00+00:00", 1e999])))

    def test_a_naive_datetime_is_malformed(self):
        self.assertIsNone(listing.decode_cursor(_cursor(["2026-10-01T00:00:00", 1])))

    def test_garbage_base64_is_malformed(self):
        self.assertIsNone(listing.decode_cursor("####not-base64####"))

    def test_the_wrong_json_shape_is_malformed(self):
        self.assertIsNone(listing.decode_cursor(_cursor({"at": "2026-10-01T00:00:00+00:00"})))
        self.assertIsNone(listing.decode_cursor(_cursor(["2026-10-01T00:00:00+00:00"])))

    def test_a_good_cursor_decodes(self):
        at, pk = listing.decode_cursor(_cursor(["2026-10-01T00:00:00+00:00", 7]))
        self.assertEqual((at.isoformat(), pk), ("2026-10-01T00:00:00+00:00", 7))


class VisibilityTests(PlanFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.carls = cls.build_plan()
        cls.danas = cls.build_plan(cls.taco, owner=cls.other, name="Taco plan")

    def ids(self, user):
        return [row["id"] for row in self.api(user).get(URL).data["results"]]

    def test_requires_authentication(self):
        self.assertEqual(APIClient().get(URL).status_code, 401)
        self.assertEqual(APIClient().get(f"{URL}{self.carls.pk}/").status_code, 401)

    def test_a_plan_is_read_by_whoever_may_open_its_record(self):
        self.assertEqual(self.ids(self.csm), [self.carls.pk])
        self.assertEqual(self.ids(self.mona), [self.carls.pk])
        self.assertEqual(self.ids(self.other), [self.danas.pk])
        self.assertEqual(self.ids(self.admin), [self.danas.pk, self.carls.pk])
        self.assertEqual(self.ids(self.stranger), [])

    def test_a_plan_on_a_record_you_cannot_open_is_404(self):
        for user in (self.other, self.stranger):
            self.assertEqual(self.api(user).get(f"{URL}{self.carls.pk}/").status_code, 404)
        self.assertEqual(self.api(self.csm).get(f"{URL}999999/").status_code, 404)

    def test_counts_never_include_what_you_cannot_open(self):
        self.assertEqual(self.api(self.csm).get(URL).data["counts"], counted(not_started=1))

    def test_no_read_of_plans_starts_with_distinct(self):
        with CaptureQueriesContext(connection) as ctx:
            self.api(self.csm).get(URL)
            self.api(self.csm).get(f"{URL}{self.carls.pk}/")
            self.api(self.csm).get(f"/api/v1/customers/{self.pizza.pk}/plans/")
        reads = [q["sql"] for q in ctx.captured_queries if 'FROM "plans_plan"' in q["sql"]]
        self.assertTrue(reads)
        for sql in reads:
            self.assertFalse(sql.lstrip().upper().startswith("SELECT DISTINCT"), sql)


class PlanWorld(PlanFixture):
    """Carl's plan on Pizza Hut, started two days ago: Kick-off (due
    yesterday) with Carl's "Call" (done) and "Mail"; Review with Alice's own
    "Review", which Carl cannot see."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.plan = cls.build_plan(
            start=cls.today - timedelta(days=2),
            steps=[
                (
                    "Kick-off",
                    1,
                    [("Call", cls.csm, "completed"), ("Mail", cls.csm, "pending")],
                ),
                ("Review", 14, [("Review", cls.admin, "pending", cls.admin)]),
            ],
        )


class RowTests(PlanWorld):
    def row(self, user):
        (row,) = self.api(user).get(URL).data["results"]
        return row

    def test_a_row_counts_the_tasks_the_reader_can_see(self):
        row = self.row(self.csm)
        self.assertEqual(set(row), ROW_KEYS)
        self.assertEqual(
            row["record"], {"kind": "organization", "id": self.pizza.pk, "name": "Pizza Hut"}
        )
        self.assertEqual(
            (
                row["milestones_done"],
                row["milestones_total"],
                row["tasks_done"],
                row["tasks_total"],
                row["next_due"],
                row["is_overdue"],
                row["can_edit"],
            ),
            (0, 2, 1, 2, iso(self.today - timedelta(days=1)), True, True),
        )
        self.assertEqual(row["owner"], {"id": self.csm.pk, "name": "Carl CSM"})

    def test_a_manager_edits_and_an_admin_only_reads(self):
        self.assertEqual(self.row(self.mona)["can_edit"], True)
        admin = self.row(self.admin)
        # view-all and Leadership read every task (owner decision 2026-10-07):
        # the admin now counts all three of the plan's tasks, not only their own.
        self.assertEqual(
            (admin["can_edit"], admin["tasks_done"], admin["tasks_total"]), (False, 1, 3)
        )

    def test_an_account_plan_names_its_account(self):
        plan = self.build_plan(self.emea, name="EMEA plan")
        data = self.api(self.csm).get(f"{URL}{plan.pk}/").data
        self.assertEqual(
            data["record"], {"kind": "account", "id": self.emea.pk, "name": "Pizza EMEA"}
        )

    def test_a_finished_plan_is_never_overdue(self):
        self.plan.status = "cancelled"
        self.plan.save(update_fields=["status"])
        data = self.api(self.csm).get(f"{URL}{self.plan.pk}/").data
        self.assertEqual((data["is_overdue"], data["milestones"][0]["is_overdue"]), (False, False))


class DetailTests(PlanWorld):
    def test_the_plan_page(self):
        data = self.api(self.csm).get(f"{URL}{self.plan.pk}/").data
        self.assertEqual(set(data), DETAIL_KEYS)
        first, second = data["milestones"]
        self.assertEqual(set(first), MILESTONE_KEYS)
        self.assertEqual(
            (first["name"], first["position"], first["is_overdue"], first["hidden_tasks"]),
            ("Kick-off", 0, True, 0),
        )
        self.assertEqual([t["title"] for t in first["tasks"]], ["Call", "Mail"])
        self.assertEqual((first["tasks_done"], first["tasks_total"]), (1, 2))
        self.assertEqual(set(first["tasks"][0]), TASK_KEYS)
        self.assertEqual(first["tasks"][0]["assignee"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual((second["tasks"], second["hidden_tasks"]), ([], 1))
        self.assertEqual(
            (
                data["hidden_tasks"],
                data["can_delete"],
                data["status_set_by"],
                data["template"],
                data["started_by"],
                data["started_by_rule"],
            ),
            (1, False, "system", None, {"id": self.csm.pk, "name": "Carl CSM"}, None),
        )

    def test_a_task_is_checkable_by_its_assignee_its_creator_or_an_editor(self):
        admin = self.api(self.admin).get(f"{URL}{self.plan.pk}/").data
        (review,) = admin["milestones"][1]["tasks"]
        self.assertEqual((review["title"], review["can_check"]), ("Review", True))
        mona = self.api(self.mona).get(f"{URL}{self.plan.pk}/").data
        self.assertTrue(all(t["can_check"] for t in mona["milestones"][0]["tasks"]))

    def test_the_template_is_named(self):
        plan = self.build_plan(self.emea, template=self.mine)
        data = self.api(self.csm).get(f"{URL}{plan.pk}/").data
        self.assertEqual(data["template"], {"id": self.mine.pk, "name": "Carl's kick-off"})

    def test_a_rule_is_named_only_to_readers_of_the_rule(self):
        rule = self.make_rule(name="Save them")
        plan = self.build_plan(self.emea, started_by=None, started_by_rule=rule)
        carl = self.api(self.csm).get(f"{URL}{plan.pk}/").data
        self.assertEqual(
            (carl["started_by"], carl["started_by_rule"]),
            (None, {"id": rule.pk, "name": "Save them"}),
        )
        mona = self.api(self.mona).get(f"{URL}{plan.pk}/").data
        self.assertEqual(mona["started_by_rule"], {"id": None, "name": "a rule"})

    def test_the_page_reads_in_a_fixed_number_of_queries(self):
        def count(plan):
            with CaptureQueriesContext(connection) as ctx:
                self.api(self.csm).get(f"{URL}{plan.pk}/")
            return len(ctx.captured_queries)

        small = self.build_plan(self.emea, name="Small")
        big = self.build_plan(
            self.dough,
            name="Big",
            steps=[
                ("A", 1, [("1", self.csm, "pending"), ("2", self.mona, "pending")]),
                ("B", 2, [("3", self.csm, "completed"), ("4", self.admin, "pending")]),
                ("C", 3, []),
            ],
        )
        self.assertEqual(count(small), count(big))


class FilterTests(PlanFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.onboarding = cls.build_plan(kind="onboarding", name="Onboarding · Pizza Hut")
        cls.save = cls.build_plan(
            cls.emea, kind="save", owner=cls.mona, name="Save · Pizza EMEA", status="at_risk"
        )
        cls.old = cls.build_plan(name="Old", status="done")

    def ids(self, query="", user=None):
        data = self.api(user or self.csm).get(f"{URL}{query}").data
        return [row["id"] for row in data["results"]]

    def test_open_is_the_default_and_counts_ignore_status(self):
        data = self.api(self.csm).get(URL).data
        self.assertEqual([r["id"] for r in data["results"]], [self.save.pk, self.onboarding.pk])
        self.assertEqual(data["counts"], counted(not_started=1, at_risk=1, done=1))
        self.assertIsNone(data["next"])

    def test_status_is_repeatable_and_open_is_shorthand(self):
        self.assertEqual(self.ids("?status=done&status=at_risk"), [self.old.pk, self.save.pk])
        self.assertEqual(self.ids("?status=open"), [self.save.pk, self.onboarding.pk])

    def test_kind_owner_and_record(self):
        self.assertEqual(self.ids("?kind=save"), [self.save.pk])
        self.assertEqual(self.ids("?owner=me"), [self.onboarding.pk])
        self.assertEqual(self.ids(f"?owner={self.mona.pk}"), [self.save.pk])
        self.assertEqual(self.ids(f"?account={self.emea.pk}"), [self.save.pk])
        self.assertEqual(self.ids(f"?customer={self.pizza.pk}"), [self.onboarding.pk])

    def test_customer_or_account_you_cannot_open_gives_nothing(self):
        # Dana's own records, in the same workspace: Carl can't open either.
        hidden_customer = self.api(self.csm).get(f"{URL}?customer={self.taco.pk}").data
        self.assertEqual(hidden_customer["results"], [])
        self.assertEqual(hidden_customer["counts"], counted())
        hidden_account = self.api(self.csm).get(f"{URL}?account={self.west.pk}").data
        self.assertEqual(hidden_account["results"], [])
        self.assertEqual(hidden_account["counts"], counted())

    def test_has_my_tasks(self):
        self.assertEqual(self.ids("?mine=tasks", user=self.mona), [self.save.pk])
        self.assertEqual(self.ids("?mine=tasks"), [self.onboarding.pk])

    def test_q_matches_the_plan_or_its_record(self):
        self.assertEqual(self.ids("?q=emea"), [self.save.pk])
        self.assertEqual(self.ids("?q=ONBOARDING"), [self.onboarding.pk])

    def test_counts_follow_the_other_filters(self):
        data = self.api(self.csm).get(f"{URL}?kind=save").data
        self.assertEqual(data["counts"], counted(at_risk=1))

    def test_bad_values_are_ignored(self):
        self.assertEqual(
            self.ids("?status=x&kind=y&owner=z&customer=q"), [self.save.pk, self.onboarding.pk]
        )

    def test_pages_with_an_opaque_cursor(self):
        with patch.object(listing, "PAGE_SIZE", 1):
            first = self.api(self.csm).get(URL).data
            self.assertEqual([r["id"] for r in first["results"]], [self.save.pk])
            self.assertIsInstance(first["next"], str)
            second = self.api(self.csm).get(URL, {"cursor": first["next"]}).data
            self.assertEqual([r["id"] for r in second["results"]], [self.onboarding.pk])
            self.assertIsNone(second["next"])
            garbled = self.api(self.csm).get(URL, {"cursor": "not-a-cursor"}).data
            self.assertEqual([r["id"] for r in garbled["results"]], [self.save.pk])

    def test_a_malformed_cursor_reads_as_the_first_page_not_a_500(self):
        first_page = [self.save.pk, self.onboarding.pk]
        overflowing = _cursor(["2026-10-01T00:00:00+00:00", 1e999])
        self.assertEqual(self.ids(f"?cursor={overflowing}"), first_page)
        naive = _cursor(["2026-10-01T00:00:00", 1])
        self.assertEqual(self.ids(f"?cursor={naive}"), first_page)
        garbage_base64 = "####not-base64####"
        self.assertEqual(self.ids(f"?cursor={garbage_base64}"), first_page)
        wrong_shape = _cursor({"at": "2026-10-01T00:00:00+00:00"})
        self.assertEqual(self.ids(f"?cursor={wrong_shape}"), first_page)

    def test_a_cursor_past_the_end_is_the_empty_last_page(self):
        # Older than anything in the fixture, so nothing comes "after" it.
        past_the_end = _cursor(["2000-01-01T00:00:00+00:00", 1])
        data = self.api(self.csm).get(URL, {"cursor": past_the_end}).data
        self.assertEqual(data["results"], [])
        self.assertIsNone(data["next"])

    def test_the_list_reads_in_a_fixed_number_of_queries(self):
        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.api(self.csm).get(URL)
            return len(ctx.captured_queries)

        before = count()
        self.build_plan(self.dough, name="Dough plan")
        self.build_plan(self.emea, name="EMEA plan", status="on_track")
        self.assertEqual(count(), before)


class RecordPlansTests(PlanFixture):
    def test_open_first_then_newest(self):
        done = self.build_plan(status="done")
        fresh = self.build_plan()
        cancelled = self.build_plan(status="cancelled")
        on_track = self.build_plan(status="on_track")
        data = self.api(self.csm).get(f"/api/v1/customers/{self.pizza.pk}/plans/").data
        self.assertEqual(
            [r["id"] for r in data["results"]], [on_track.pk, fresh.pk, cancelled.pk, done.pk]
        )
        self.assertEqual(set(data["results"][0]), ROW_KEYS)

    def test_an_account_reads_its_own(self):
        plan = self.build_plan(self.emea)
        self.build_plan()
        data = self.api(self.csm).get(f"/api/v1/accounts/{self.emea.pk}/plans/").data
        self.assertEqual([r["id"] for r in data["results"]], [plan.pk])

    def test_a_record_you_cannot_open_is_404(self):
        self.build_plan()
        api = self.api(self.other)
        self.assertEqual(api.get(f"/api/v1/customers/{self.pizza.pk}/plans/").status_code, 404)
        self.assertEqual(api.get(f"/api/v1/accounts/{self.emea.pk}/plans/").status_code, 404)
        self.assertEqual(api.get("/api/v1/customers/999999/plans/").status_code, 404)
