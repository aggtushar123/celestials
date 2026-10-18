"""A scope's comparison point: a baseline on first view, a fresh start when
the team changes, and a row per scope at each month-end."""

from datetime import date, timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.db.models.query import QuerySet
from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import User
from services.brain import history
from services.brain.metrics import figures
from services.brain.models import ScopeSnapshot
from services.brain.scope import resolve
from services.brain.tests.fixtures import BrainFixture
from services.customers.management.commands.run_health_maintenance import (
    last_completed_month_end,
)
from services.customers.models import Customer
from services.segments.tests.fixtures import person


class FirstViewTests(BrainFixture):
    def test_the_first_view_writes_one_baseline_and_audits_it(self):
        team = resolve(self.mona, "team")
        figs = figures(team)
        row = history.comparison_point(team, figs, self.today)
        again = history.comparison_point(team, figs, self.today)

        self.assertEqual(row.pk, again.pk)
        self.assertEqual(
            (row.kind, row.reason, row.taken_on), ("baseline", "first_view", self.today)
        )
        self.assertEqual(row.owner_ids, sorted([self.mona.id, self.csm.id]))
        self.assertEqual(set(row.customer_ids), {self.pizza.id, self.dough.id, self.soup.id})
        self.assertEqual(row.values["active_arr"], 450_000.0)
        self.assertIn(str(self.csm.id), row.slices["at_risk_arr"]["owner"])
        self.assertIsNone(history.team_changed_on(row))
        event = AuditEvent.objects.get(action="brain.scope_baseline_recorded")
        self.assertEqual(event.metadata, {"scope": team.stored_key, "reason": "first_view"})
        self.assertEqual((event.actor, event.target_id), (self.mona, str(row.pk)))

    def test_two_first_views_at_once_write_one_row(self):
        team = resolve(self.mona, "team")
        figs = figures(team)
        history.comparison_point(team, figs, self.today)  # the winner commits first

        # The loser's own read also missed the row (not just `latest`): its
        # first lookup inside `get_or_create` finds nothing either, so it
        # really attempts an INSERT against the row the winner already holds
        # — the unique constraint, not a cache hit, is what makes this one
        # row. Patching only `latest` (as the first draft of this test did)
        # lets `get_or_create`'s own pre-read quietly find the winner's row
        # in the same test transaction, so the constraint is never reached;
        # this also forces that pre-read to miss once.
        real_get = QuerySet.get
        calls = {"n": 0}

        def flaky_get(self, *args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise self.model.DoesNotExist
            return real_get(self, *args, **kwargs)

        with (
            patch("services.brain.history.latest", return_value=None),
            patch.object(QuerySet, "get", new=flaky_get),
        ):
            history.comparison_point(team, figs, self.today)

        self.assertEqual(calls["n"], 2)  # the miss, then the re-get after the IntegrityError
        self.assertEqual(ScopeSnapshot.objects.filter(scope_key=team.stored_key).count(), 1)
        self.assertEqual(
            AuditEvent.objects.filter(action="brain.scope_baseline_recorded").count(), 1
        )


class TeamChangedTests(BrainFixture):
    def test_a_changed_team_starts_again_from_today_and_keeps_its_history(self):
        team = resolve(self.mona, "team")
        ScopeSnapshot.objects.create(
            organisation=self.org,
            scope_key=team.stored_key,
            user=self.mona,
            taken_on=self.today - timedelta(days=20),
            kind="month_end",
            owner_ids=[self.mona.id],
        )
        row = history.comparison_point(team, figures(team), self.today)
        self.assertEqual(
            (row.taken_on, row.kind, row.reason), (self.today, "baseline", "team_changed")
        )
        self.assertEqual(history.team_changed_on(row), self.today)
        self.assertEqual(ScopeSnapshot.objects.filter(scope_key=team.stored_key).count(), 2)
        event = AuditEvent.objects.get(action="brain.scope_baseline_recorded")
        self.assertEqual(event.metadata["reason"], "team_changed")

    def test_a_change_on_the_baselines_own_day_replaces_it(self):
        first = history.comparison_point(
            resolve(self.mona, "team"), figures(resolve(self.mona, "team")), self.today
        )
        ed = person("ed@acme.io", "Ed CSM", self.org, reports_to=self.mona)
        mona = User.objects.get(pk=self.mona.pk)  # a fresh walk of the chart
        team = resolve(mona, "team")
        row = history.comparison_point(team, figures(team), self.today)
        self.assertEqual(row.pk, first.pk)
        self.assertEqual(row.reason, "team_changed")
        self.assertIn(ed.id, row.owner_ids)

    def test_two_same_day_team_changes_at_once_audit_once(self):
        # Today's pre-change baseline: what both racers' `latest` read saw,
        # before either had written Ed's arrival.
        stale = history.comparison_point(
            resolve(self.mona, "team"), figures(resolve(self.mona, "team")), self.today
        )
        ed = person("ed@acme.io", "Ed CSM", self.org, reports_to=self.mona)
        mona = User.objects.get(pk=self.mona.pk)
        team = resolve(mona, "team")
        figs = figures(team)

        # Neither request's `latest` saw the other's write — both resolve
        # against `stale`. The first to lock the row updates and audits;
        # the second finds its own owners already written under the lock
        # and leaves the row (and the audit trail) alone.
        with patch("services.brain.history.latest", return_value=stale):
            history.comparison_point(team, figs, self.today)
            row = history.comparison_point(team, figs, self.today)

        self.assertIn(ed.id, row.owner_ids)
        self.assertEqual(ScopeSnapshot.objects.filter(scope_key=team.stored_key).count(), 1)
        self.assertEqual(
            AuditEvent.objects.filter(
                action="brain.scope_baseline_recorded", metadata__reason="team_changed"
            ).count(),
            1,
        )


class CompanyScopeTests(BrainFixture):
    def test_company_has_no_comparison_point_of_its_own(self):
        company = resolve(self.admin, "company")
        with self.assertRaises(ValueError) as caught:
            history.comparison_point(company, figures(company), self.today)
        self.assertEqual(
            str(caught.exception), "Company compares against month-end metric snapshots."
        )


class MonthEndTests(BrainFixture):
    period_end = date(2026, 9, 30)
    #: Inside the write window: the night after the month ended.
    night_after = date(2026, 10, 1)

    def keys(self):
        return set(ScopeSnapshot.objects.values_list("scope_key", flat=True))

    def test_me_for_every_owner_and_team_for_every_manager(self):
        written, kept = history.record_month_end(self.org, self.period_end, today=self.night_after)
        self.assertEqual((written, kept), (4, 0))
        self.assertEqual(
            self.keys(),
            {
                f"me:{self.csm.id}",
                f"me:{self.mona.id}",
                f"me:{self.other.id}",
                f"team:{self.mona.id}",
            },
        )
        for row in ScopeSnapshot.objects.all():
            self.assertEqual(
                (row.kind, row.reason, row.taken_on), ("month_end", "", self.period_end)
            )

    def test_a_recorded_month_is_kept_not_overwritten(self):
        history.record_month_end(self.org, self.period_end, today=self.night_after)
        Customer.objects.filter(pk=self.pizza.pk).update(arr_billed_at_account=Decimal(1))
        self.assertEqual(
            history.record_month_end(self.org, self.period_end, today=self.night_after), (0, 4)
        )
        row = ScopeSnapshot.objects.get(scope_key=f"me:{self.csm.id}")
        self.assertEqual(row.values["active_arr"], 400_000.0)

    def test_deactivated_members_get_no_rows_and_dry_run_writes_nothing(self):
        User.objects.filter(pk=self.other.pk).update(is_active=False)
        self.assertEqual(
            history.record_month_end(
                self.org, self.period_end, dry_run=True, today=self.night_after
            ),
            (3, 0),
        )
        self.assertEqual(self.keys(), set())
        history.record_month_end(self.org, self.period_end, today=self.night_after)
        self.assertNotIn(f"me:{self.other.id}", self.keys())

    def test_rows_are_written_only_within_three_days_of_the_month_end(self):
        last_day = self.period_end + timedelta(days=3)
        with self.assertLogs("services.brain.history", "INFO") as logs:
            skipped = history.record_month_end(
                self.org, self.period_end, today=last_day + timedelta(days=1)
            )
        self.assertEqual(skipped, (0, 0))
        self.assertEqual(self.keys(), set())
        self.assertEqual(
            logs.output,
            [
                f"INFO:services.brain.history:brain month-end skipped "
                f"organisation={self.org.pk} period_end=2026-09-30 days_after=4"
            ],
        )
        self.assertEqual(
            history.record_month_end(self.org, self.period_end, today=last_day), (4, 0)
        )

    def test_a_new_owner_mid_month_gets_no_back_dated_row(self):
        newcomer = person("nina@acme.io", "Nina New", self.org)
        self.customer("Noodle Co", newcomer, 10_000, "8.0")
        history.record_month_end(self.org, self.period_end, today=date(2026, 10, 15))
        self.assertFalse(ScopeSnapshot.objects.filter(scope_key=f"me:{newcomer.id}").exists())

    def test_one_failing_scope_does_not_stop_the_rest_of_its_organisation(self):
        real = history.figures

        def flaky(scope):
            if scope.stored_key == f"me:{self.csm.id}":
                raise RuntimeError("boom 400000")
            return real(scope)

        with patch("services.brain.history.figures", side_effect=flaky):
            with self.assertLogs("services.brain.history", "INFO") as logs:
                written, kept = history.record_month_end(
                    self.org, self.period_end, today=self.night_after
                )
        self.assertEqual((written, kept), (3, 0))
        self.assertEqual(
            self.keys(), {f"me:{self.mona.id}", f"me:{self.other.id}", f"team:{self.mona.id}"}
        )
        text = "\n".join(logs.output)
        self.assertIn(
            f"brain month-end scope failed organisation={self.org.pk} member={self.csm.pk} "
            "scope=me error=RuntimeError",
            text,
        )
        self.assertNotIn("400000", text)


class NightlyJobTests(BrainFixture):
    """The job runs on 1 Oct here: inside the month-end write window
    whatever today's real date is."""

    def setUp(self):
        real = timezone.localdate

        def on_the_first(value=None, timezone=None):
            return real(value, timezone) if value is not None else date(2026, 10, 1)

        patcher = patch("django.utils.timezone.localdate", side_effect=on_the_first)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_the_job_records_the_scopes_and_says_how_long_it_took(self):
        out = StringIO()
        call_command("run_health_maintenance", "--org-email", "alice@acme.io", stdout=out)
        self.assertTrue(
            ScopeSnapshot.objects.filter(
                scope_key=f"team:{self.mona.id}", taken_on=last_completed_month_end()
            ).exists()
        )
        self.assertRegex(
            out.getvalue(),
            r"recorded 4 scope snapshot\(s\) for \d{4}-\d{2}-\d{2} across 1 organisation\(s\); "
            r"0 already recorded \(\d+\.\ds\)\.",
        )

    def test_a_failing_organisation_does_not_stop_the_others(self):
        from services.brain.history import record_month_end as real_record_month_end

        def flaky(organisation, period_end, *, dry_run=False):
            if organisation.pk == self.org.pk:
                raise RuntimeError("boom")
            return real_record_month_end(organisation, period_end, dry_run=dry_run)

        out = StringIO()
        # No --org-email: both BrainFixture tenants (Acme, Globex) are in
        # play, so Globex's own row proves Acme's failure didn't stop it.
        with patch("services.brain.history.record_month_end", side_effect=flaky):
            call_command("run_health_maintenance", stdout=out)

        self.assertFalse(ScopeSnapshot.objects.filter(organisation=self.org).exists())
        self.assertTrue(
            ScopeSnapshot.objects.filter(
                organisation=self.other_org, scope_key=f"me:{self.stranger.id}"
            ).exists()
        )
        text = out.getvalue()
        self.assertIn(f"scope snapshots skipped for organisation {self.org.pk}: RuntimeError", text)
        self.assertRegex(
            text,
            r"recorded 1 scope snapshot\(s\) for \d{4}-\d{2}-\d{2} across 2 organisation\(s\); "
            r"0 already recorded \(\d+\.\ds\)\.",
        )
        self.assertIn("assignee(s) of stale questions", text)
