"""What's being done (spec §1.2): each section filtered to the scope's book,
named only for what the reader may open."""

import re
from datetime import timedelta
from decimal import Decimal

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.brain import doing
from services.brain.initiatives import OWNER_METRICS, edited_as, trackable
from services.brain.metrics import figures as brain_figures
from services.brain.scope import book_actor, resolve
from services.brain.tests.doing_fixtures import DoingFixture
from services.customers.models import Customer, Risk, Task
from services.metrics.initiatives import Figures
from services.metrics.registry import BY_KEY, METRICS, compute_all, compute_slice
from services.plans.models import Plan
from services.rules.models import empty_skips
from services.segments.models import Segment


class InitiativeSectionTests(DoingFixture):
    def items(self, user, key):
        reader, scope = self.reader_and_scope(user, key)
        rows = doing.initiatives_in(reader, scope, self.today)
        return doing.initiative_items(reader, rows, Figures(self.org), self.today)

    def ids(self, user, key):
        return [row["id"] for row in self.items(user, key)]

    def test_me_is_what_i_own_and_what_is_cut_to_my_book(self):
        owned = self.initiative(self.csm)
        cut = self.initiative(self.admin, cut=self.csm)
        self.initiative(self.other)
        self.initiative(self.admin)
        self.assertCountEqual(self.ids(self.csm, "me"), [owned.pk, cut.pk])

    def test_my_team_is_the_same_for_everyone_on_my_desk(self):
        carls = self.initiative(self.csm)
        monas = self.initiative(self.mona)
        cut = self.initiative(self.admin, cut=self.csm)
        self.initiative(self.other)
        self.initiative(self.admin, cut=self.other)
        self.assertCountEqual(self.ids(self.mona, "team"), [carls.pk, monas.pk, cut.pk])

    def test_company_is_every_one(self):
        made = [self.initiative(self.csm), self.initiative(self.other), self.initiative(None)]
        self.assertCountEqual(self.ids(self.admin, "company"), [i.pk for i in made])
        self.assertCountEqual(self.ids(self.lee, "company"), [i.pk for i in made])

    def test_closed_ones_stay_thirty_days(self):
        recent = self.initiative(self.csm, status="done", closed_days_ago=10)
        self.initiative(self.csm, status="abandoned", closed_days_ago=40)
        self.assertEqual(self.ids(self.csm, "me"), [recent.pk])

    def test_active_then_planned_then_closed_soonest_first(self):
        late = self.initiative(self.csm, target_in=90)
        soon = self.initiative(self.csm, target_in=10)
        planned = self.initiative(self.csm, status="planned", target_in=5)
        done = self.initiative(self.csm, status="done", closed_days_ago=1, target_in=1)
        self.assertEqual(self.ids(self.csm, "me"), [soon.pk, late.pk, planned.pk, done.pk])

    def test_the_row_shape(self):
        mine = self.initiative(self.mona, cut=self.csm, baseline_scope="book", created_by=self.mona)
        whole = self.initiative(self.mona, metric="nrr")
        rows = {row["id"]: row for row in self.items(self.mona, "team")}
        row = rows[mine.pk]
        self.assertEqual(
            set(row),
            {
                "id", "title", "hypothesis", "outcome", "metric", "metric_label", "for",
                "status", "owner", "target_by", "progress", "work", "can_edit",
            },
        )  # fmt: skip
        self.assertEqual(row["metric_label"], "ARR at risk")
        self.assertEqual(
            row["for"], {"dimension": "owner", "member": str(self.csm.pk), "label": "Carl CSM"}
        )
        self.assertEqual(row["owner"], {"id": self.mona.pk, "name": "Mona Manager"})
        self.assertEqual(
            set(row["progress"]),
            {"baseline", "current", "target", "progress_pct", "days_left", "direction", "unit",
             "better"},
        )  # fmt: skip
        self.assertEqual(row["progress"]["baseline"], 1000.0)
        self.assertIsNone(rows[whole.pk]["for"])

    def test_progress_current_is_the_cut_persons_slice_not_the_whole_company(self):
        """A cut initiative's `progress.current` must come from the member's
        own owner slice — never the whole-organisation figure, which Carl's
        book (Pizza Hut, Dough Co) differs from (review risk 4). Mona can't
        use Company, so it is her read of Carl's book (`book_actor`); with no
        department-held records here that equals the registry's slice."""
        initiative = self.initiative(self.csm, cut=self.csm)
        metric = BY_KEY["at_risk_arr"]
        carls_slice = next(
            value
            for member, _label, value in compute_slice(self.org, metric, "owner")
            if member == str(self.csm.pk)
        )
        whole_company = compute_all(self.org)["at_risk_arr"]
        self.assertNotEqual(carls_slice, whole_company)
        (row,) = self.items(self.mona, "team")
        self.assertEqual(row["id"], initiative.pk)
        monas_read = compute_all(self.org, actor=book_actor(self.mona, self.csm.pk))
        self.assertEqual(row["progress"]["current"], monas_read["at_risk_arr"])
        self.assertEqual(row["progress"]["current"], carls_slice)

    def test_work_counts_everything_and_names_only_readable_tasks(self):
        initiative = self.initiative(self.csm, cut=self.csm)
        due = self.today

        def task(customer, assignee, status, title, *, created_by=None):
            return Task.objects.create(
                customer=customer,
                initiative=initiative,
                title=title,
                assignee=assignee,
                assignee_name=assignee.name if assignee else "",
                created_by=created_by if created_by is not None else assignee,
                due_date=due,
                priority=Task.Priority.HIGH,
                status=status,
            )

        # Dana's own customer, with no account linking it to Carl or Mona
        # (unlike Taco Bell, which Carl's Taco East account would make
        # visible to this desk) — genuinely outside the desk's book.
        private = self.customer("Private Co", self.other, 60_000, "8.0")

        task(self.pizza, self.csm, Task.Status.PENDING, "Call Pizza Hut")
        task(self.pizza, self.csm, Task.Status.COMPLETED, "Send the deck")
        task(self.taco, self.other, Task.Status.PENDING, "Call Taco Bell")
        # Passes `visible_tasks` (Carl is the assignee, on Mona's desk) but
        # fails the record check (Private Co is Dana's, outside the desk) —
        # proves the record-visibility half of the twice-filter is needed.
        task(private, self.csm, Task.Status.PENDING, "Carl peeks at Private Co")
        # Passes the record check (Pizza Hut is on Mona's desk) but fails
        # `visible_tasks` (Dana is neither creator nor assignee on it) —
        # proves the personal-visibility half is needed.
        task(self.pizza, self.other, Task.Status.PENDING, "Dana touches Pizza Hut")
        (row,) = self.items(self.mona, "team")
        self.assertEqual((row["work"]["open"], row["work"]["done"]), (4, 1))
        self.assertEqual(
            [t["title"] for t in row["work"]["tasks"]], ["Call Pizza Hut", "Send the deck"]
        )
        self.assertEqual(
            set(row["work"]["tasks"][0]),
            {"id", "title", "parent_name", "parent_type", "parent_id", "assignee_name",
             "due_date", "priority", "status"},
        )  # fmt: skip

    def test_can_edit_follows_edited_as(self):
        carls = self.initiative(self.csm)
        (row,) = self.items(self.mona, "team")
        self.assertTrue(row["can_edit"])
        self.assertTrue(self.items(self.csm, "me")[0]["can_edit"])
        unowned = self.initiative(None, cut=self.csm)
        rows = {row["id"]: row for row in self.items(self.csm, "me")}
        self.assertTrue(rows[carls.pk]["can_edit"])
        self.assertFalse(rows[unowned.pk]["can_edit"])

    def test_an_initiative_off_the_desks_books_carries_no_figures(self):
        """SOC2:AUTH-02 an initiative owned on the desk but tracking more
        than a desk person's own book (the whole company, or someone else's
        cut) keeps its row, without its figures or its cut's label, for a
        reader who can't use Company (final review I1)."""
        whole = self.initiative(self.csm)
        danas = self.initiative(self.csm, cut=self.other)
        own = self.initiative(self.csm, cut=self.csm)
        for user, key in ((self.csm, "me"), (self.mona, "team")):
            rows = {row["id"]: row for row in self.items(user, key)}
            for hidden in (whole, danas):
                row = rows[hidden.pk]
                self.assertIsNone(row["progress"], (user.name, key))
                self.assertIsNone(row["for"], (user.name, key))
                self.assertEqual(
                    (row["title"], row["metric"], row["metric_label"], row["status"]),
                    ("Halve ARR at risk", "at_risk_arr", "ARR at risk", "active"),
                )
                self.assertEqual(row["owner"], {"id": self.csm.pk, "name": "Carl CSM"})
                self.assertEqual(set(row["work"]), {"open", "done", "tasks"})
            self.assertIsNotNone(rows[own.pk]["progress"])
            self.assertEqual(rows[own.pk]["for"]["label"], "Carl CSM")
        payload = doing.initiative_payload(self.csm, whole.pk, self.today)
        self.assertIsNone(payload["progress"])

    def test_a_reader_who_can_use_company_sees_every_figure(self):
        leads = self.initiative(self.lee)
        cut = self.initiative(self.lee, cut=self.other)
        rows = {row["id"]: row for row in self.items(self.lee, "me")}
        self.assertEqual(rows[leads.pk]["progress"]["baseline"], 1000.0)
        self.assertEqual(rows[cut.pk]["for"]["label"], "Dana CSM")
        self.assertIsNotNone(rows[cut.pk]["progress"])
        rows = {row["id"]: row for row in self.items(self.admin, "company")}
        self.assertIsNotNone(rows[leads.pk]["progress"])

    def test_one_payload(self):
        made = self.initiative(self.csm, cut=self.csm, status="done", closed_days_ago=90)
        row = doing.initiative_payload(self.csm, made.pk, self.today)
        self.assertEqual(row["id"], made.pk)
        self.assertEqual(row["status"], "done")


class InitiativeFiguresFollowTheReaderTests(DoingFixture):
    """SOC2:AUTH-02 browser check: an owner-cut initiative read by someone
    who can't use Company is computed as that reader over the cut person's
    book (their Me figure), never the registry's organisation-wide slice,
    which counts records the reader can't read."""

    def setUp(self):
        Risk.objects.create(
            title="Sales worry",
            customer=self.pizza,
            mrr=Decimal("1000"),
            priority=Risk.Priority.HIGH,
            department="sales",
        )

    def row(self, user, key, initiative):
        reader, scope = self.reader_and_scope(user, key)
        rows = doing.initiative_items(
            reader, doing.initiatives_in(reader, scope, self.today), Figures(self.org), self.today
        )
        return next(row for row in rows if row["id"] == initiative.pk)

    def carls_slice(self):
        return next(
            value
            for member, _label, value in compute_slice(self.org, BY_KEY["at_risk_arr"], "owner")
            if member == str(self.csm.pk)
        )

    def test_my_own_book_excludes_another_departments_risk(self):
        own = self.initiative(self.csm, cut=self.csm)
        carls_me = brain_figures(resolve(self.csm, "me")).values["at_risk_arr"]
        self.assertNotEqual(carls_me, self.carls_slice())
        progress = self.row(self.csm, "me", own)["progress"]
        self.assertEqual(progress["current"], carls_me)

    def test_a_company_baseline_is_withheld_from_a_reader_without_company(self):
        made = self.initiative(self.admin, cut=self.csm)
        made.created_by = self.admin
        made.save()
        progress = self.row(self.csm, "me", made)["progress"]
        self.assertIsNone(progress["baseline"])
        self.assertIsNone(progress["progress_pct"])
        self.assertEqual(
            (progress["target"], progress["days_left"], progress["unit"], progress["better"]),
            (0.0, 60, "money", "down"),
        )
        self.assertIsNotNone(progress["current"])

    def test_a_book_baseline_is_shown_to_a_reader_without_company(self):
        made = self.initiative(self.csm, cut=self.csm, baseline_scope="book", created_by=self.csm)
        progress = self.row(self.csm, "me", made)["progress"]
        self.assertEqual(progress["baseline"], 1000.0)
        self.assertIsNotNone(progress["progress_pct"])

    def test_a_book_baseline_is_its_creators_read_only(self):
        """SOC2:AUTH-02 re-review I1: a manager in another department starts
        one on Carl's book; their read counts what Carl can't, so Carl sees
        no baseline while its creator does."""
        made = self.initiative(self.csm, cut=self.csm, baseline_scope="book", created_by=self.mona)
        carls = self.row(self.csm, "me", made)["progress"]
        self.assertIsNone(carls["baseline"])
        self.assertIsNone(carls["progress_pct"])
        self.assertEqual(self.row(self.mona, "team", made)["progress"]["baseline"], 1000.0)

    def test_a_withheld_baseline_gives_no_direction_away(self):
        """SOC2:AUTH-02 re-review I2: with the baseline withheld, `direction`
        is the metric's `better`, never the hidden baseline against the
        target (1000 below 5000 would say "up")."""
        made = self.initiative(self.admin, cut=self.csm)
        made.target_value = Decimal("5000")
        made.save()
        self.assertEqual(self.row(self.admin, "company", made)["progress"]["direction"], "up")
        progress = self.row(self.csm, "me", made)["progress"]
        self.assertIsNone(progress["baseline"])
        self.assertEqual(progress["direction"], "down")

    def test_a_company_reader_reads_the_registry_unchanged(self):
        made = self.initiative(self.admin, cut=self.csm)
        progress = self.row(self.admin, "company", made)["progress"]
        self.assertEqual(progress["current"], self.carls_slice())
        self.assertEqual(progress["baseline"], 1000.0)

    def test_the_payload_follows_the_reader_too(self):
        made = self.initiative(self.csm, cut=self.csm)
        payload = doing.initiative_payload(self.csm, made.pk, self.today)
        self.assertEqual(
            payload["progress"]["current"],
            brain_figures(resolve(self.csm, "me")).values["at_risk_arr"],
        )
        self.assertIsNone(payload["progress"]["baseline"])


class PlanSectionTests(DoingFixture):
    def section(self, user, key):
        reader, scope = self.reader_and_scope(user, key)
        return doing.plan_section(reader, scope, self.today)

    def ids(self, user, key):
        return [row["id"] for row in self.section(user, key)[0]]

    def test_me_is_plans_on_my_customers_and_accounts(self):
        mine = [self.plan(self.pizza), self.plan(self.dough), self.plan(self.emea),
                self.plan(self.east)]  # fmt: skip
        self.plan(self.taco)
        self.plan(self.west)
        self.plan(self.soup)
        self.assertCountEqual(self.ids(self.csm, "me"), [p.pk for p in mine])

    def test_my_team_adds_the_desk(self):
        shown = [self.plan(self.pizza), self.plan(self.soup), self.plan(self.east)]
        self.plan(self.west)
        self.plan(self.loose)
        self.assertCountEqual(self.ids(self.mona, "team"), [p.pk for p in shown])

    def test_company_is_everything_and_hides_what_the_reader_cant_open(self):
        on_pizza = self.plan(self.pizza)
        on_loose = self.plan(self.loose)
        items, hidden = self.section(self.admin, "company")
        self.assertCountEqual([row["id"] for row in items], [on_pizza.pk, on_loose.pk])
        self.assertEqual(hidden, 0)
        items, hidden = self.section(self.lee, "company")
        self.assertEqual([row["id"] for row in items], [on_loose.pk])
        self.assertEqual(hidden, 1)

    def test_open_by_status_then_the_last_thirty_days_closed(self):
        on_track = self.plan(self.pizza, status="on_track", target_in=5)
        not_started = self.plan(self.pizza, status="not_started", target_in=1)
        at_risk = self.plan(self.pizza, status="at_risk", target_in=50)
        at_risk_sooner = self.plan(self.dough, status="at_risk", target_in=20)
        done = self.plan(self.pizza, status="done")
        Plan.objects.filter(pk=done.pk).update(done_at=timezone.now() - timedelta(days=3))
        old = self.plan(self.pizza, status="done")
        Plan.objects.filter(pk=old.pk).update(done_at=timezone.now() - timedelta(days=40))
        cancelled = self.plan(self.dough, status="cancelled")
        Plan.objects.filter(pk=cancelled.pk).update(updated_at=timezone.now() - timedelta(days=10))
        stale = self.plan(self.dough, status="cancelled")
        Plan.objects.filter(pk=stale.pk).update(updated_at=timezone.now() - timedelta(days=31))
        self.assertEqual(
            self.ids(self.csm, "me"),
            [at_risk_sooner.pk, at_risk.pk, on_track.pk, not_started.pk, done.pk, cancelled.pk],
        )

    def test_a_cancelled_plan_closes_on_its_cancel_not_an_earlier_done(self):
        """done -> cancelled sorts by the cancel, and its 30 days count from
        the cancel (final review M3)."""
        earlier = self.plan(self.pizza, status="cancelled")
        Plan.objects.filter(pk=earlier.pk).update(updated_at=timezone.now() - timedelta(days=5))
        was_done = self.plan(self.dough, status="cancelled")
        Plan.objects.filter(pk=was_done.pk).update(
            done_at=timezone.now() - timedelta(days=40),
            updated_at=timezone.now() - timedelta(days=1),
        )
        done = self.plan(self.pizza, status="done")
        Plan.objects.filter(pk=done.pk).update(
            done_at=timezone.now() - timedelta(days=3),
            updated_at=timezone.now(),
        )
        self.assertEqual(self.ids(self.csm, "me"), [was_done.pk, done.pk, earlier.pk])

    def test_the_account_subquery_is_held_to_the_organisation(self):
        reader, scope = self.reader_and_scope(self.csm, "me")
        sql = str(doing.plans_in(reader, scope, self.today).query)
        # The account subquery's WHERE: the desk's customers (one org
        # condition) and, held to the organisation, a second one.
        where = sql[sql.index('FROM "customers_account"') : sql.index('"plans_plan"."status" IN')]
        self.assertEqual(len(re.findall(rf'"organisation_id" = {self.org.pk}\b', where)), 2)

    def test_then_and_now(self):
        kept = {"health_score": 2.0, "arr": 100000.0, "currency": "USD",
                "taken_on": "2026-10-06"}  # fmt: skip
        new = self.plan(self.dough, figures=kept, milestones=(True, False, False))
        old = self.plan(self.pizza)
        Customer.objects.filter(pk=self.dough.pk).update(health_score=Decimal("4.5"))
        rows = {row["id"]: row for row in self.section(self.csm, "me")[0]}
        row = rows[new.pk]
        self.assertEqual(
            set(row),
            {"id", "name", "status", "record", "owner", "target_date", "milestones", "then",
             "now"},
        )  # fmt: skip
        self.assertEqual(
            row["record"], {"type": "customer", "id": self.dough.pk, "name": "Dough Co"}
        )
        self.assertEqual(row["owner"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(row["milestones"], {"done": 1, "total": 3})
        self.assertEqual(
            row["then"], {"health_score": 2.0, "arr": 100000.0, "taken_on": "2026-10-06"}
        )
        self.assertEqual(row["now"], {"health_score": 4.5, "arr": 100000.0})
        self.assertIsNone(rows[old.pk]["then"])
        self.assertEqual(rows[old.pk]["now"], {"health_score": 8.0, "arr": 300000.0})

    def test_an_account_plan_reads_the_account(self):
        plan = self.plan(self.emea)
        (row,) = self.section(self.csm, "me")[0]
        self.assertEqual(row["record"], {"type": "account", "id": self.emea.pk,
                                         "name": "Pizza EMEA"})  # fmt: skip
        self.assertEqual(row["now"], {"health_score": 5.0, "arr": 0.0})
        self.assertEqual(row["id"], plan.pk)

    def test_then_arr_is_null_once_the_currency_moved(self):
        kept = {"health_score": 2.0, "arr": 90000.0, "currency": "EUR",
                "taken_on": "2026-10-06"}  # fmt: skip
        self.plan(self.dough, figures=kept)
        (row,) = self.section(self.csm, "me")[0]
        self.assertEqual(row["then"], {"health_score": 2.0, "arr": None, "taken_on": "2026-10-06"})


class EditedAsTests(DoingFixture):
    def test_owner_then_chain_then_company(self):
        carls = self.initiative(self.csm)
        self.assertEqual(edited_as(self.csm, carls), "me")
        self.assertEqual(edited_as(self.mona, carls), "team")
        self.assertEqual(edited_as(self.admin, carls), "company")
        self.assertIsNone(edited_as(self.other, carls))
        self.assertIsNone(edited_as(self.lee, carls))
        self.assertIsNone(edited_as(self.stranger, carls))

    def test_an_initiative_with_no_owner_is_company_only(self):
        unowned = self.initiative(None, cut=self.csm)
        self.assertIsNone(edited_as(self.csm, unowned))
        self.assertEqual(edited_as(self.admin, unowned), "company")

    def test_another_organisations_admin_gets_no_edit(self):
        """The organisation check runs first (SOC2:AUTH-02): Alice's
        `view_all_accounts` is an Acme right, and must not reach into
        Globex's initiative even though she owns nothing that would stop
        her there."""
        theirs = self.initiative(self.stranger, organisation=self.other_org)
        self.assertIsNone(edited_as(self.admin, theirs))


class TrackableTests(DoingFixture):
    def test_only_metrics_with_an_owner_cut(self):
        self.assertEqual(
            OWNER_METRICS, ("forecast_arr", "nrr", "at_risk_arr", "healthy_share",
                            "poor_health_count"),
        )  # fmt: skip
        self.assertEqual(OWNER_METRICS, tuple(m.key for m in METRICS if "owner" in m.slices))
        self.assertEqual(
            trackable()[2], {"key": "at_risk_arr", "label": "ARR at risk", "unit": "money",
                             "better": "down"},
        )  # fmt: skip


class RuleSectionTests(DoingFixture):
    def items(self, user, key):
        reader, scope = self.reader_and_scope(user, key)
        return doing.rule_items(reader, doing.rules_in(reader, scope))

    def test_the_desks_rules_private_ones_included(self):
        carls = self.rule(self.csm, name="Carl's")
        monas = self.rule(self.mona, name="Mona's")
        self.rule(self.other, name="Dana's")
        self.assertCountEqual(
            [r["id"] for r in self.items(self.mona, "team")], [carls.pk, monas.pk]
        )
        self.assertEqual([r["id"] for r in self.items(self.csm, "me")], [carls.pk])
        self.assertEqual(len(self.items(self.lee, "company")), 3)

    def test_my_own_rule_shows_every_count(self):
        rule = self.rule(self.csm)
        self.night(rule, fired=1, days_ago=1)
        self.night(rule, fired=4, matched=12, skipped={**empty_skips(), "cooldown": 2},
                   records=(self.pizza,))  # fmt: skip
        (row,) = self.items(self.csm, "me")
        self.assertEqual(
            row,
            {
                "id": rule.pk, "name": "Detractor follow-up", "segment": None,
                "is_active": True, "paused_reason": None, "paused_message": None,
                "mine": True, "readable": True,
                "last_run": {"run_on": self.today.isoformat(), "fired": 4, "matched": 12,
                             "skipped": 2},
            },
        )  # fmt: skip

    def test_someone_elses_rule_shows_only_what_fired_that_i_may_open(self):
        # Dana's own customer, with no account linking it to Carl or Mona
        # (unlike Taco Bell, which Carl's Taco East account would make
        # visible to this desk) — genuinely outside the desk's book.
        private = self.customer("Private Co", self.other, 60_000, "8.0")
        rule = self.rule(self.csm)
        self.night(rule, fired=3, matched=9, records=(self.pizza, self.dough, private))
        (row,) = self.items(self.mona, "team")
        self.assertEqual((row["mine"], row["readable"]), (False, False))
        self.assertEqual(row["last_run"], {"run_on": self.today.isoformat(), "fired": 2})
        (row,) = [r for r in self.items(self.lee, "company") if r["id"] == rule.pk]
        self.assertEqual(row["last_run"]["fired"], 0)

    def test_a_shared_rule_is_readable(self):
        self.rule(self.csm, sharing="workspace")
        (row,) = self.items(self.mona, "team")
        self.assertTrue(row["readable"])

    def test_paused_with_its_segment_and_no_night_yet(self):
        segment = Segment.objects.create(
            organisation=self.org, owner=self.csm, name="Detractors", kind="customer",
            rules={"match": "all", "conditions": []},
        )  # fmt: skip
        self.rule(self.csm, segment=segment, is_active=False, paused_reason="owner_inactive")
        (row,) = self.items(self.csm, "me")
        self.assertEqual(row["segment"], "Detractors")
        self.assertEqual(
            (row["is_active"], row["paused_reason"], row["paused_message"], row["last_run"]),
            (False, "owner_inactive", "Its owner is no longer active.", None),
        )

    def test_an_unknown_pause_code_still_reads(self):
        self.rule(self.csm, is_active=False, paused_reason="retired_code")
        (row,) = self.items(self.csm, "me")
        self.assertEqual(
            (row["paused_reason"], row["paused_message"]), ("retired_code", "It is paused.")
        )

    def test_active_first_then_by_name(self):
        b = self.rule(self.csm, name="B")
        a = self.rule(self.csm, name="A")
        off = self.rule(self.csm, name="0 off", is_active=False)
        self.assertEqual([r["id"] for r in self.items(self.csm, "me")], [a.pk, b.pk, off.pk])


class BuildTests(DoingFixture):
    def build(self, user, key):
        reader, scope = self.reader_and_scope(user, key)
        return doing.build(reader, scope, self.today)

    def test_the_shape(self):
        body = self.build(self.mona, "team")
        self.assertEqual(
            set(body), {"scope", "currency", "hidden", "trackable", "initiatives", "plans", "rules"}
        )
        self.assertEqual((body["scope"], body["currency"], body["hidden"]), ("team", "USD", 0))
        self.assertEqual([m["key"] for m in body["trackable"]], list(OWNER_METRICS))

    def test_hidden_counts_the_plans_the_reader_cant_open(self):
        self.plan(self.pizza)
        self.plan(self.taco)
        self.assertEqual(self.build(self.lee, "company")["hidden"], 2)
        self.assertEqual(self.build(self.admin, "company")["hidden"], 0)

    def _segment(self):
        """A segment to put on one of the fixture's rules: with every rule's
        segment null, dropping `rule_items`' `select_related("segment")`
        would be invisible here (a null FK costs no query), so this is the
        one rule with a real segment that would catch it."""
        return Segment.objects.create(
            organisation=self.org, owner=self.csm, name="Detractors", kind="customer",
            rules={"match": "all", "conditions": []},
        )  # fmt: skip

    def fill(self, n):
        segment = self._segment()
        for _ in range(n):
            self.initiative(self.csm, cut=self.csm)
            self.initiative(self.mona)
            self.plan(self.pizza, milestones=(True, False))
            self.plan(self.emea)
            self.night(self.rule(self.csm, segment=segment), fired=1, records=(self.pizza,))
            self.night(self.rule(self.mona), fired=1)

    def fill_rules_and_plans(self, n):
        """Like `fill`, minus the initiatives: isolates the brain's own
        section queries from initiative progress, which reuses the metric
        registry's rollups (`services.metrics.registry`) — including
        `forecast.py`'s own, legitimate `.distinct()` over the Opportunity/
        Risk-to-Account M2M, unrelated to this module's own query shape."""
        segment = self._segment()
        for _ in range(n):
            self.plan(self.pizza, milestones=(True, False))
            self.plan(self.emea)
            self.night(self.rule(self.csm, segment=segment), fired=1, records=(self.pizza,))
            self.night(self.rule(self.mona), fired=1)

    def queries(self):
        reader, scope = self.reader_and_scope(self.mona, "team")
        with CaptureQueriesContext(connection) as captured:
            doing.build(reader, scope, self.today)
        return captured.captured_queries

    def test_the_query_count_does_not_grow_with_the_items(self):
        self.fill(1)
        few = self.queries()
        self.fill(5)
        many = self.queries()
        self.assertEqual(len(few), len(many))

    def test_rules_and_plans_queries_carry_no_distinct(self):
        """The brain's own sections (rules, plans) never issue a DISTINCT
        query, whatever their length: initiative progress is excluded here
        (see `fill_rules_and_plans`) because it reads the metric registry's
        own rollups, not this module's book-filtering queries."""
        self.fill_rules_and_plans(1)
        few = self.queries()
        self.fill_rules_and_plans(5)
        many = self.queries()
        self.assertEqual(len(few), len(many))
        for query in many:
            self.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])
