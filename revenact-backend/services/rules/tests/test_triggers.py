"""Each trigger, read as the owner sees their book: entries and exits from
the segments' change rows, a score crossing its line (both directions, and
never on the first night), and the schedule's days. Nothing here writes."""

from datetime import date, timedelta
from decimal import Decimal

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.customers.models import Account, Customer
from services.rules.models import RuleState
from services.rules.records import load, names, openable
from services.rules.tests.fixtures import RuleFixture
from services.rules.triggers import is_due, matches
from services.segments.baseline import rebaseline
from services.segments.models import Segment


class RecordsTests(RuleFixture):
    def test_openable_keeps_only_what_the_viewer_may_open(self):
        ids = [self.pizza.pk, self.taco.pk]
        mine = openable("customer", self.csm, ids).values_list("pk", flat=True)
        everyone = openable("customer", self.admin, ids).values_list("pk", flat=True)
        self.assertEqual((sorted(mine), sorted(everyone)), ([self.pizza.pk], sorted(ids)))

    def test_load_and_names(self):
        self.assertEqual([record.name for record in load("contact", [self.dot.pk])], ["Dot"])
        self.assertEqual(names("account", [self.emea.pk]), {self.emea.pk: "Pizza EMEA"})
        with self.assertNumQueries(0):
            self.assertEqual(names("customer", []), {})


class MovedTests(RuleFixture):
    def test_entered_reads_todays_entries(self):
        rule = self.make_rule()
        self.changed(self.book, [self.pizza])
        self.changed(self.book, [self.dough], "left")
        self.changed(self.book, [self.dough], day=self.today - timedelta(days=1))
        match = matches(rule, self.csm, today=self.today)
        self.assertEqual(
            (match.kind, match.ids, match.not_visible), ("customer", [self.pizza.pk], 0)
        )

    def test_left_reads_todays_exits(self):
        rule = self.make_rule(trigger="left")
        self.changed(self.book, [self.dough], "left")
        self.assertEqual(matches(rule, self.csm, today=self.today).ids, [self.dough.pk])

    def test_a_record_the_owner_may_not_open_is_counted_never_matched(self):
        self.changed(self.book, [self.pizza, self.taco])
        match = matches(self.make_rule(), self.csm, today=self.today)
        self.assertEqual((match.ids, match.not_visible), ([self.pizza.pk], 1))

    def test_a_deleted_record_is_counted_too(self):
        gone = Customer.objects.create(organisation=self.org, name="Gone", owner=self.csm)
        self.changed(self.book, [gone])
        gone.delete()
        match = matches(self.make_rule(), self.csm, today=self.today)
        self.assertEqual((match.ids, match.not_visible), ([], 1))

    def test_the_preview_reads_what_tonight_would_record(self):
        segment = self.pinned("customer", [self.pizza], name="Preview")
        rebaseline(segment, today=self.today - timedelta(days=1))
        Segment.objects.filter(pk=segment.pk).update(pinned_ids=[self.dough.pk])
        segment.refresh_from_db()
        entered = self.make_rule(segment=segment)
        left = self.make_rule(segment=segment, trigger="left")
        self.assertEqual(
            matches(entered, self.csm, today=self.today, preview=True).ids, [self.dough.pk]
        )
        self.assertEqual(
            matches(left, self.csm, today=self.today, preview=True).ids, [self.pizza.pk]
        )
        self.assertEqual(matches(entered, self.csm, today=self.today).ids, [])

    def test_the_preview_reads_todays_rows_once_the_segment_has_run(self):
        rebaseline(self.book, today=self.today)
        self.changed(self.book, [self.dough])
        # self.book just had its baseline set to today, so the preview below
        # reads today's SegmentChange rows directly, not a baseline diff.
        rule = self.make_rule(segment=self.book)
        self.assertEqual(
            matches(rule, self.csm, today=self.today, preview=True).ids, [self.dough.pk]
        )

    def test_the_preview_of_a_segment_with_no_baseline_is_empty(self):
        self.assertEqual(
            matches(self.make_rule(), self.csm, today=self.today, preview=True).ids, []
        )


class CrossedTests(RuleFixture):
    def rule(self, **fields):
        values = {
            "trigger": "crossed",
            "score": "csat",
            "direction": "below",
            "threshold": Decimal("60"),
        }
        return self.make_rule(**{**values, **fields})

    def set_csat(self, pizza=None, dough=None):
        Customer.objects.filter(pk=self.pizza.pk).update(csat_score=pizza)
        Customer.objects.filter(pk=self.dough.pk).update(csat_score=dough)

    def remember(self, rule, record, value, kind="customer"):
        RuleState.objects.create(
            rule=rule, record_kind=kind, record_id=record.pk, last_value=Decimal(value)
        )

    def fired(self, rule, **kwargs):
        return matches(rule, self.csm, today=self.today, state_rule_id=rule.pk, **kwargs).ids

    def test_the_first_night_stores_and_never_fires(self):
        rule = self.rule()
        self.set_csat(pizza=50, dough=70)
        match = matches(rule, self.csm, today=self.today, state_rule_id=rule.pk)
        self.assertEqual(match.ids, [])
        self.assertEqual(match.values, {self.pizza.pk: Decimal(50), self.dough.pk: Decimal(70)})

    def test_falling_below_the_line_fires(self):
        rule = self.rule()
        self.remember(rule, self.pizza, 70)
        self.remember(rule, self.dough, 50)
        self.set_csat(pizza=55, dough=40)
        self.assertEqual(self.fired(rule), [self.pizza.pk])  # Dough Co was already below

    def test_rising_above_the_line_fires(self):
        rule = self.rule(direction="above", threshold=Decimal("80"))
        self.remember(rule, self.pizza, 70)
        self.remember(rule, self.dough, 90)
        self.set_csat(pizza=85, dough=95)
        self.assertEqual(self.fired(rule), [self.pizza.pk])

    def test_the_line_itself_is_not_past_it(self):
        rule = self.rule()
        self.remember(rule, self.pizza, 70)
        self.set_csat(pizza=60)
        self.assertEqual(self.fired(rule), [])

    def test_a_value_exactly_on_the_line_fires_once_it_crosses(self):
        rule = self.rule()
        self.remember(rule, self.pizza, 60)  # exactly on the line: not past it yet
        self.set_csat(pizza=50)  # tonight: past it
        self.assertEqual(self.fired(rule), [self.pizza.pk])

    def test_a_record_with_no_score_is_left_out(self):
        rule = self.rule()
        self.remember(rule, self.pizza, 70)
        self.set_csat(pizza=None, dough=None)
        match = matches(rule, self.csm, today=self.today, state_rule_id=rule.pk)
        self.assertEqual((match.ids, match.values), ([], {}))

    def test_without_a_saved_rule_nothing_is_remembered(self):
        rule = self.rule()
        self.remember(rule, self.pizza, 70)
        self.set_csat(pizza=50)
        self.assertEqual(matches(rule, self.csm, today=self.today).ids, [])

    def test_the_preview_shows_who_is_past_the_line_now(self):
        rule = self.rule()
        self.set_csat(pizza=50, dough=70)
        match = matches(rule, self.csm, today=self.today, preview=True)
        self.assertEqual(match.ids, [self.pizza.pk])

    def test_the_preview_still_honours_a_stored_value(self):
        rule = self.rule()
        self.remember(rule, self.pizza, 40)
        self.set_csat(pizza=50, dough=70)
        self.assertEqual(self.fired(rule, preview=True), [])

    def test_an_account_segment_reads_the_accounts_own_score(self):
        accounts = self.pinned("account", [self.emea], name="Accounts")
        rule = self.rule(segment=accounts, score="nps", threshold=Decimal("0"))
        self.remember(rule, self.emea, 10, kind="account")
        Account.objects.filter(pk=self.emea.pk).update(nps_score=-20)
        self.assertEqual(self.fired(rule), [self.emea.pk])

    def test_health_and_ces_read_their_own_columns(self):
        health = self.rule(score="health", threshold=Decimal("4"))
        self.remember(health, self.pizza, 8)
        Customer.objects.filter(pk=self.pizza.pk).update(health_score=Decimal("3.0"))
        self.assertEqual(self.fired(health), [self.pizza.pk])
        ces = self.rule(score="ces", name="CES watch")
        self.remember(ces, self.dough, 70)
        Customer.objects.filter(pk=self.dough.pk).update(ces_percentage=Decimal("50.00"))
        self.assertEqual(self.fired(ces), [self.dough.pk])

    def test_only_members_the_owner_may_open(self):
        everyone = self.pinned("customer", [self.pizza, self.taco], name="Everyone")
        rule = self.rule(segment=everyone)
        self.remember(rule, self.taco, 70)
        Customer.objects.filter(pk=self.taco.pk).update(csat_score=10)
        match = matches(rule, self.csm, today=self.today, state_rule_id=rule.pk)
        self.assertEqual(match.ids, [])
        self.assertNotIn(self.taco.pk, match.values)


class ScheduleTests(RuleFixture):
    MONDAY = date(2026, 10, 5)
    FIRST = date(2026, 11, 1)

    def weekly(self, **fields):
        return self.make_rule(
            trigger="schedule", cadence="weekly", weekday=self.MONDAY.weekday(), **fields
        )

    def test_a_weekly_rule_is_due_on_its_weekday(self):
        rule = self.weekly()
        self.assertTrue(is_due(rule, self.MONDAY))
        self.assertFalse(is_due(rule, self.MONDAY + timedelta(days=1)))
        self.assertTrue(is_due(rule, self.MONDAY + timedelta(days=7)))

    def test_a_monthly_rule_is_due_on_the_first(self):
        rule = self.make_rule(trigger="schedule", cadence="monthly")
        self.assertTrue(is_due(rule, self.FIRST))
        self.assertFalse(is_due(rule, self.FIRST + timedelta(days=1)))

    def test_an_unknown_cadence_is_never_due(self):
        rule = self.make_rule(trigger="schedule", cadence="")
        self.assertFalse(is_due(rule, self.FIRST))
        self.assertFalse(is_due(rule, self.MONDAY))

    def test_a_due_rule_matches_every_member(self):
        rule = self.weekly()
        self.assertEqual(
            matches(rule, self.csm, today=self.MONDAY).ids, sorted([self.pizza.pk, self.dough.pk])
        )
        self.assertEqual(matches(rule, self.csm, today=self.MONDAY + timedelta(days=1)).ids, [])

    def test_members_are_only_records_the_owner_may_open(self):
        everyone = self.pinned("customer", [self.pizza, self.taco], name="Everyone")
        self.assertEqual(
            matches(self.weekly(segment=everyone), self.csm, today=self.MONDAY).ids,
            [self.pizza.pk],
        )


class QueryCountTests(RuleFixture):
    """Tonight's match costs the same number of queries whatever the
    segment's size: one lookup each, never one per member."""

    def bigger_book(self, n=6):
        extra = [
            Customer.objects.create(organisation=self.org, name=f"Extra {i}", owner=self.csm)
            for i in range(n)
        ]
        segment = self.pinned("customer", [self.pizza, self.dough, *extra], name="Bigger book")
        return segment, extra

    def warm(self):
        # The viewer's capability and org-chart reach are cached on first
        # use (services.customers.scoping); warm them so the pin below
        # measures the query itself, not that one-time cost.
        matches(self.make_rule(), self.csm, today=self.today)

    def rule_crossed(self, **fields):
        values = {
            "trigger": "crossed",
            "score": "csat",
            "direction": "below",
            "threshold": Decimal("60"),
        }
        return self.make_rule(**{**values, **fields})

    def test_entered_query_count_does_not_grow_with_members(self):
        self.warm()
        small = self.make_rule()
        self.changed(self.book, [self.pizza, self.dough])
        with self.assertNumQueries(2):
            matches(small, self.csm, today=self.today)

        segment, extra = self.bigger_book()
        big = self.make_rule(segment=segment)
        self.changed(segment, [self.pizza, self.dough, *extra])
        with self.assertNumQueries(2):
            matches(big, self.csm, today=self.today)

    def test_crossed_query_count_does_not_grow_with_members(self):
        self.warm()
        small = self.rule_crossed()
        Customer.objects.filter(pk=self.pizza.pk).update(csat_score=50)
        Customer.objects.filter(pk=self.dough.pk).update(csat_score=50)
        with self.assertNumQueries(2):
            matches(small, self.csm, today=self.today, state_rule_id=small.pk)

        segment, extra = self.bigger_book()
        for customer in extra:
            Customer.objects.filter(pk=customer.pk).update(csat_score=50)
        big = self.rule_crossed(segment=segment)
        with self.assertNumQueries(2):
            matches(big, self.csm, today=self.today, state_rule_id=big.pk)

    def test_schedule_query_count_does_not_grow_with_members(self):
        self.warm()
        small = self.make_rule(trigger="schedule", cadence="weekly", weekday=self.today.weekday())
        with self.assertNumQueries(1):
            matches(small, self.csm, today=self.today)

        segment, _extra = self.bigger_book()
        big = self.make_rule(
            segment=segment, trigger="schedule", cadence="weekly", weekday=self.today.weekday()
        )
        with self.assertNumQueries(1):
            matches(big, self.csm, today=self.today)

    def test_entered_preview_query_count_does_not_grow_with_members(self):
        # The diff must be non-empty (an empty `pk__in=[]` short-circuits to
        # no query), and the two segments' entry counts must differ in
        # size, to actually exercise the "does not grow" claim.
        self.warm()
        small = self.pinned("customer", [self.pizza], name="Preview small")
        rebaseline(small, today=self.today - timedelta(days=1))
        Segment.objects.filter(pk=small.pk).update(pinned_ids=[self.dough.pk])
        small.refresh_from_db()
        small_rule = self.make_rule(segment=small)
        with self.assertNumQueries(2):
            matches(small_rule, self.csm, today=self.today, preview=True)

        extra = [
            Customer.objects.create(organisation=self.org, name=f"Extra {i}", owner=self.csm)
            for i in range(6)
        ]
        big = self.pinned("customer", [self.pizza], name="Preview big")
        rebaseline(big, today=self.today - timedelta(days=1))
        Segment.objects.filter(pk=big.pk).update(
            pinned_ids=[self.dough.pk, *[record.pk for record in extra]]
        )
        big.refresh_from_db()
        big_rule = self.make_rule(segment=big)
        with self.assertNumQueries(2):
            matches(big_rule, self.csm, today=self.today, preview=True)


class SqlShapeTests(RuleFixture):
    """The visibility filter's own `DISTINCT` must stay inside the `id`
    subquery, never on the outer `SELECT` that reads a crossed or
    schedule rule's members (review: Important #1)."""

    def warm(self):
        matches(self.make_rule(), self.csm, today=self.today)

    def assert_no_outer_distinct(self, sql):
        self.assertFalse(sql.lstrip().upper().startswith("SELECT DISTINCT"), sql)

    def test_crossed_members_read_has_no_outer_distinct(self):
        self.warm()
        rule = self.make_rule(
            trigger="crossed", score="csat", direction="below", threshold=Decimal("60")
        )
        Customer.objects.filter(pk=self.pizza.pk).update(csat_score=50)
        with CaptureQueriesContext(connection) as ctx:
            matches(rule, self.csm, today=self.today, state_rule_id=rule.pk)
        self.assert_no_outer_distinct(ctx.captured_queries[0]["sql"])

    def test_schedule_members_read_has_no_outer_distinct(self):
        self.warm()
        rule = self.make_rule(trigger="schedule", cadence="weekly", weekday=self.today.weekday())
        with CaptureQueriesContext(connection) as ctx:
            matches(rule, self.csm, today=self.today)
        self.assert_no_outer_distinct(ctx.captured_queries[0]["sql"])
