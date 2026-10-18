"""Tonight's records: the matches, less those fired within the cooldown,
at most 200 lowest id first. Then the builder's test: the same selection,
answered without writing a thing."""

from datetime import timedelta
from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.customers.models import Customer, Task
from services.notifications.models import Notification
from services.rules.models import Rule, RuleReview, RuleRun, RuleRunRecord, RuleState
from services.rules.selection import select
from services.rules.tests.fixtures import LIFECYCLE, NOTIFY_ME, SURVEY, TASK, RuleFixture
from services.segments.models import Segment
from services.surveys.models import SurveySend

URL = "/api/v1/rules/test/"


class SelectTests(RuleFixture):
    def fired_on(self, rule, record, days_ago, kind="customer"):
        RuleState.objects.create(
            rule=rule,
            record_kind=kind,
            record_id=record.pk,
            last_fired_on=self.today - timedelta(days=days_ago),
        )

    def select(self, rule, **kwargs):
        return select(rule, self.csm, today=self.today, state_rule_id=rule.pk, **kwargs)

    def test_a_record_fired_within_the_cooldown_is_skipped(self):
        rule = self.make_rule(cooldown_days=30)
        self.changed(self.book, [self.pizza, self.dough])
        self.fired_on(rule, self.pizza, 29)
        selection = self.select(rule)
        self.assertEqual((selection.fire, selection.cooldown), ([self.dough.pk], [self.pizza.pk]))

    def test_the_cooldown_ends_after_its_days(self):
        rule = self.make_rule(cooldown_days=30)
        self.changed(self.book, [self.pizza])
        self.fired_on(rule, self.pizza, 30)
        self.assertEqual(self.select(rule).fire, [self.pizza.pk])

    def test_another_kinds_state_is_another_record(self):
        rule = self.make_rule()
        self.changed(self.book, [self.pizza])
        self.fired_on(rule, self.pizza, 1, kind="account")
        self.assertEqual(self.select(rule).fire, [self.pizza.pk])

    def test_at_most_the_cap_a_night_lowest_id_first(self):
        rule = self.make_rule()
        self.changed(self.book, [self.pizza, self.dough])
        with patch("services.rules.selection.NIGHTLY_CAP", 1):
            selection = self.select(rule)
        self.assertEqual((selection.fire, selection.cap), ([self.pizza.pk], 1))

    def test_matched_counts_every_record_the_owner_may_open(self):
        rule = self.make_rule()
        self.changed(self.book, [self.pizza, self.dough, self.taco])
        self.fired_on(rule, self.pizza, 1)
        with patch("services.rules.selection.NIGHTLY_CAP", 0):
            selection = self.select(rule)
        self.assertEqual(selection.matched, 2)
        self.assertEqual(
            selection.skipped(failed=0),
            {"cooldown": 1, "cap": 1, "not_visible": 1, "failed": 0, "nobody": 0},
        )

    def test_without_a_saved_rule_nothing_is_cooling_down(self):
        rule = self.make_rule()
        self.changed(self.book, [self.pizza])
        self.fired_on(rule, self.pizza, 1)
        self.assertEqual(select(rule, self.csm, today=self.today).fire, [self.pizza.pk])


class TestEndpointTests(RuleFixture):
    def post(self, user=None, **fields):
        client = APIClient()
        client.force_authenticate(user or self.csm)
        body = {
            "segment": self.book.pk,
            "trigger": "schedule",
            "cadence": "weekly",
            "weekday": self.today.weekday(),
            "actions": [NOTIFY_ME],
            **fields,
        }
        return client.post(URL, body, format="json")

    def test_requires_authentication(self):
        self.assertEqual(APIClient().post(URL, {}, format="json").status_code, 401)

    def test_it_names_who_would_be_acted_on_tonight(self):
        response = self.post()
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            response.data,
            {
                "count": 2,
                "records": [
                    {"kind": "customer", "id": self.pizza.pk, "name": "Pizza Hut"},
                    {"kind": "customer", "id": self.dough.pk, "name": "Dough Co"},
                ],
                "hidden_count": 0,
                "skipped": {"cooldown": 0, "cap": 0, "not_visible": 0},
            },
        )

    def test_it_names_ten_at_most(self):
        with patch("services.rules.payloads.TEST_NAMED", 1):
            data = self.post().data
        self.assertEqual((data["count"], len(data["records"])), (2, 1))

    def test_a_saved_rule_lends_its_cooldown(self):
        rule = self.make_rule()
        RuleState.objects.create(
            rule=rule, record_kind="customer", record_id=self.pizza.pk, last_fired_on=self.today
        )
        data = self.post(rule=rule.pk).data
        self.assertEqual((data["count"], data["skipped"]["cooldown"]), (1, 1))

    def test_records_the_owner_cannot_open_are_a_count(self):
        Segment.objects.filter(pk=self.book.pk).update(last_evaluated_on=self.today)
        self.changed(self.book, [self.pizza, self.taco])
        data = self.post(trigger="entered").data
        self.assertEqual(
            (data["count"], data["hidden_count"], data["skipped"]["not_visible"]), (1, 1, 1)
        )
        self.assertEqual([record["name"] for record in data["records"]], ["Pizza Hut"])

    def test_it_is_checked_as_a_save_would_be(self):
        response = self.post(actions=[])
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"actions": ["Choose 1 to 3 actions."]}),
        )
        danas = self.pinned("customer", [self.taco], owner=self.other, sharing="workspace")
        self.assertEqual(self.post(segment=danas.pk).status_code, 403)

    def test_someone_elses_rule_cannot_be_lent(self):
        danas = self.pinned("customer", [self.taco], owner=self.other, name="Dana's")
        shared = self.make_rule(owner=self.other, segment=danas, sharing="workspace")
        self.assertEqual(self.post(rule=shared.pk).status_code, 403)
        private = self.make_rule(owner=self.other, segment=danas)
        self.assertEqual(self.post(rule=private.pk).status_code, 404)

    def test_it_writes_nothing(self):
        models = (
            Rule, RuleState, RuleRun, RuleRunRecord, RuleReview, Notification, AuditEvent,
            Task, SurveySend,
        )  # fmt: skip
        before = [model.objects.count() for model in models]
        with CaptureQueriesContext(connection) as ctx:
            response = self.post(actions=[TASK, LIFECYCLE, SURVEY])
        self.assertEqual(response.status_code, 200, response.content)
        writes = [
            query["sql"]
            for query in ctx.captured_queries
            if query["sql"].lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))
        ]
        self.assertEqual(writes, [])
        self.assertEqual([model.objects.count() for model in models], before)

    def test_it_reads_in_a_fixed_number_of_queries(self):
        # self.csm's capability and org-chart reach are cached on first use
        # (services.customers.scoping; see services/rules/tests/test_triggers.py
        # QueryCountTests.warm), so warm them first: otherwise the first call
        # pays a one-time cost the second call (same user object) does not,
        # which this test must not mistake for the count growing with size.
        self.post()
        with CaptureQueriesContext(connection) as small:
            self.post()
        extra = Customer.objects.create(organisation=self.org, name="Extra", owner=self.csm)
        bigger = self.pinned("customer", [self.pizza, self.dough, extra], name="Bigger")
        with CaptureQueriesContext(connection) as large:
            self.post(segment=bigger.pk)
        self.assertEqual(len(large.captured_queries), len(small.captured_queries))
