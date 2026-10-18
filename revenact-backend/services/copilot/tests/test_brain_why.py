"""Ask on the Brain can say why a number moved: on What changed the prompt
carries each moved metric's owner and product cuts then → now, the accounts
carrying the downside the asker may open (the rest a count), and the saved
"Why?" explanations the asker may read. Nothing the asker can't open is
named, and grounding writes nothing."""

import re
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from core.models import AuditEvent
from services.brain.metrics import figures
from services.brain.models import ScopeSnapshot
from services.brain.scope import resolve
from services.copilot.brain_grounding import BRAIN_PERSONA
from services.customers.models import Activity
from services.metrics.models import Brief, Explanation, MetricSnapshot
from services.metrics.registry import BY_KEY
from services.metrics.signals import explanation_digest

from .brain_fixture import BrainAskFixture

AT_RISK = BY_KEY["at_risk_arr"]


def usd(value):
    return f"USD {value:,.0f}"


def usd_change(value):
    return f"+USD {value:,.0f}" if value > 0 else f"USD {value:,.0f}"


class WhyFixture(BrainAskFixture):
    def company_figures(self):
        return figures(resolve(self.admin, "company"))

    def month_end(self, metric, value, cuts=()):
        """A month-end row for `metric` (whole-org), and one per
        `(dimension, member, value)` in `cuts`."""
        period_end = self.today - timedelta(days=5)
        MetricSnapshot.objects.create(
            organisation=self.org, metric=metric, period_end=period_end, value=Decimal(value)
        )
        for dimension, member, member_value in cuts:
            MetricSnapshot.objects.create(
                organisation=self.org,
                metric=metric,
                dimension=dimension,
                member=member,
                period_end=period_end,
                value=Decimal(member_value),
            )
        return period_end

    def explanation(self, text, *, by, customer_ids, metric="at_risk_arr", **fields):
        fields.setdefault("generated_at", timezone.now() - timedelta(hours=1))
        return Explanation.objects.create(
            organisation=self.org,
            metric=metric,
            as_of=self.today,
            text=text,
            evidence=[],
            inputs={"customer_ids": customer_ids},
            generated_by=by,
            scope_key="company",
            **fields,
        )


class CutsTests(WhyFixture):
    def setUp(self):
        figs = self.company_figures()
        self.now = figs.values["at_risk_arr"]
        self.owners = {
            member: (label, value) for member, label, value in figs.slices["at_risk_arr"]["owner"]
        }
        self.products = {
            member: (label, value) for member, label, value in figs.slices["at_risk_arr"]["product"]
        }
        # Every owner moved; the smallest move is the fourth and is cut.
        self.moves = dict(zip(self.owners, (40_000, -25_000, 10_000, 1_000)))
        self.month_end(
            "at_risk_arr",
            self.now - 50_000,
            [("owner", m, self.owners[m][1] - move) for m, move in self.moves.items()]
            + [("product", m, value - 50_000) for m, (_label, value) in self.products.items()],
        )
        # Unchanged: same now and then, every cut too.
        healthy = figs.values["healthy_share"]
        self.month_end(
            "healthy_share",
            healthy,
            [
                ("owner", m, v)
                for m, _label, v in figs.slices["healthy_share"]["owner"]
                if v is not None
            ],
        )

    def test_a_moved_metric_carries_its_owner_and_product_cuts(self):
        summary = self.ground(self.admin, "company", "changed").summary

        self.assertIn("WHY IT MOVED", summary)
        line = next(
            row for row in summary.splitlines() if row.startswith("- ARR at risk by account owner:")
        )
        ranked = sorted(self.moves.items(), key=lambda item: -abs(item[1]))
        for member, move in ranked[:3]:
            label, value = self.owners[member]
            self.assertIn(f"{label} {usd(value - move)} → {usd(value)} ({usd_change(move)})", line)
        smallest_label = self.owners[ranked[3][0]][0]
        self.assertNotIn(smallest_label, line)
        # The biggest move comes first.
        self.assertTrue(line.split(": ", 1)[1].startswith(self.owners[ranked[0][0]][0]), line)

        product = next(
            row for row in summary.splitlines() if row.startswith("- ARR at risk by product:")
        )
        label, value = next(iter(self.products.values()))
        self.assertIn(f"{label} {usd(value - 50_000)} → {usd(value)} (+USD 50,000)", product)

    def test_an_unchanged_metric_carries_no_cuts(self):
        summary = self.ground(self.admin, "company", "changed").summary

        self.assertNotIn("- Book in good health by", summary)
        # Never compared (no month-end): no cuts either.
        self.assertNotIn("- Net revenue retention by", summary)

    def test_cuts_are_only_on_what_changed(self):
        for tab in ("waiting", "doing", "customers"):
            with self.subTest(tab=tab):
                summary = self.ground(self.admin, "company", tab).summary
                self.assertNotIn("WHY IT MOVED", summary)
                self.assertNotIn("ACCOUNTS CARRYING THE DOWNSIDE", summary)
                self.assertNotIn("SAVED EXPLANATIONS", summary)


class CutShapeTests(WhyFixture):
    """Every cut a metric has; members on one side only; Me and My team."""

    def test_arr_is_cut_by_its_own_cuts(self):
        figs = self.company_figures()
        segments = figs.slices["active_arr"]["segment"]
        lifecycle = figs.slices["active_arr"]["lifecycle"]
        self.month_end(
            "active_arr",
            figs.values["active_arr"] - 70_000,
            [("segment", m, (v or 0) - 70_000) for m, _l, v in segments if v]
            + [("lifecycle", m, (v or 0) - 70_000) for m, _l, v in lifecycle if v],
        )

        summary = self.ground(self.admin, "company", "changed").summary

        self.assertIn("- ARR by size band: ", summary)
        self.assertIn("- ARR by lifecycle stage: ", summary)
        self.assertIn("(+USD 70,000)", summary)

    def test_a_money_member_on_one_side_only_counts_as_zero_on_the_other(self):
        figs = self.company_figures()
        owners = {m: v for m, _l, v in figs.slices["at_risk_arr"]["owner"]}
        gone = self.person_gone()
        carl = str(self.csm.pk)
        cuts = [("owner", m, v) for m, v in owners.items() if m != carl]
        cuts.append(("owner", str(gone.pk), 30_000))
        self.month_end("at_risk_arr", figs.values["at_risk_arr"] - owners[carl] + 30_000, cuts)

        line = next(
            row
            for row in self.ground(self.admin, "company", "changed").summary.splitlines()
            if row.startswith("- ARR at risk by account owner:")
        )

        self.assertIn(f"Carl CSM USD 0 → {usd(owners[carl])} ({usd_change(owners[carl])})", line)
        self.assertIn("Olga Gone USD 30,000 → USD 0 (USD -30,000)", line)
        self.assertNotIn("not compared", line)

    def test_a_ratio_member_on_one_side_only_is_counted_not_compared(self):
        figs = self.company_figures()
        healthy = figs.values["healthy_share"]
        cuts = [
            ("owner", m, v - 10)
            for m, _l, v in figs.slices["healthy_share"]["owner"]
            if v is not None and m != str(self.csm.pk)
        ]
        self.month_end("healthy_share", healthy - 10, cuts)

        line = next(
            row
            for row in self.ground(self.admin, "company", "changed").summary.splitlines()
            if row.startswith("- Book in good health by account owner:")
        )

        self.assertIn("1 member new or gone since, not compared", line)
        self.assertNotIn("Carl CSM", line)

    def person_gone(self):
        from services.segments.tests.fixtures import person

        return person("olga@acme.io", "Olga Gone", self.org)

    def test_my_team_is_cut_against_its_own_snapshot(self):
        self.as_user(self.mona).get("/api/v1/brain/changed/?scope=team")
        type(self.dough).objects.filter(pk=self.dough.pk).update(health_score=Decimal("8.0"))

        summary = self.ground(self.mona, "team", "changed").summary

        line = next(
            row for row in summary.splitlines() if row.startswith("- ARR at risk by account owner:")
        )
        # Dough Co's risk is gone from Carl's book since the team's baseline.
        self.assertRegex(line, r"Carl CSM USD [\d,]+ → USD [\d,]+ \(USD -")
        self.assertIn("counted over this scope's book", summary)

    def test_me_is_cut_against_its_own_snapshot(self):
        self.as_user(self.csm).get("/api/v1/brain/changed/?scope=me")
        type(self.dough).objects.filter(pk=self.dough.pk).update(health_score=Decimal("8.0"))

        summary = self.ground(self.csm, "me", "changed").summary

        self.assertIn("- ARR at risk by account owner: Carl CSM USD ", summary)


class DownsideAccountsTests(WhyFixture):
    """Dough Co (Carl's) and Taco Bell (Dana's) carry the book's downside."""

    def test_an_openable_account_is_named_with_its_figures(self):
        grounding = self.ground(self.csm, "me", "changed")

        line = next(row for row in grounding.summary.splitlines() if row.startswith("- Dough Co"))
        self.assertIn("(owner Carl CSM): ARR USD 100,000, downside USD ", line)
        self.assertIn("renews in 30 days", line)
        self.assertIn("ACCOUNTS CARRYING THE DOWNSIDE", grounding.summary)
        self.assertNotIn("Taco Bell", grounding.summary)
        self.assertEqual(grounding.customer_ids, [self.dough.pk])

    def test_accounts_the_asker_cannot_open_are_only_counted(self):
        grounding = self.ground(self.lee, "company", "changed")

        for hidden in ("Dough Co", "Taco Bell", str(self.dough.pk), str(self.taco.pk)):
            self.assertNotIn(hidden, grounding.summary.split("ACCOUNTS CARRYING", 1)[1])
        self.assertNotIn("Dough Co", grounding.summary)
        self.assertNotIn("Taco Bell", grounding.summary)
        self.assertIn(
            "ACCOUNTS CARRYING THE DOWNSIDE (largest first; downside counted as the asker may "
            "read it; at most 6 named):\n"
            "Accounts: 2 more on records you can't open.",
            grounding.summary,
        )
        self.assertEqual(grounding.customer_ids, [])

    def test_the_control_a_reader_who_can_open_them_sees_them_named(self):
        grounding = self.ground(self.admin, "company", "changed")

        self.assertIn("- Dough Co", grounding.summary)
        self.assertIn("- Taco Bell", grounding.summary)
        self.assertNotIn("Accounts: ", grounding.summary)
        self.assertEqual(grounding.customer_ids, sorted([self.dough.pk, self.taco.pk]))


class ImprovedMoveTests(WhyFixture):
    """ARR going dark fell from a USD 1,000,000 month-end."""

    def setUp(self):
        self.month_end("dark_arr", 1_000_000)

    def move(self, summary):
        moves = summary.split("MATERIAL MOVES:", 1)[1].split("WHY IT MOVED", 1)[0]
        return next(row for row in moves.splitlines() if row.startswith("- ARR going dark:"))

    def test_an_improved_move_labels_its_accounts_still_counted(self):
        line = self.move(self.ground(self.admin, "company", "changed").summary)

        self.assertIn("better", line)
        self.assertIn("; still counted: ", line)
        self.assertNotIn("accounts:", line)

    def test_a_move_whose_metric_counts_no_accounts_has_no_list(self):
        for customer in (self.pizza, self.dough, self.soup, self.taco, self.loose):
            Activity.objects.create(
                customer=customer,
                type=Activity.ActivityType.HEALTH_CHECK_REVIEW,
                occurred_at=self.today,
            )

        line = self.move(self.ground(self.admin, "company", "changed").summary)

        self.assertNotIn("accounts:", line)
        self.assertNotIn("still counted:", line)
        self.assertTrue(line.endswith("better)"), line)


class CappedAndCombinedTests(WhyFixture):
    def test_a_capped_account_list_says_how_many_more(self):
        from services.copilot import brain_grounding

        Activity.objects.create(
            customer=self.pizza,
            type=Activity.ActivityType.HEALTH_CHECK_REVIEW,
            occurred_at=self.today,
        )
        self.month_end("dark_arr", 0)
        with patch.object(brain_grounding, "EXPOSURE_LIMIT", 1):
            summary = self.ground(self.admin, "company", "changed").summary

        moves = summary.split("MATERIAL MOVES:", 1)[1].split("WHY IT MOVED", 1)[0]
        dark = next(row for row in moves.splitlines() if row.startswith("- ARR going dark:"))
        self.assertIn("; and 3 more you may open", dark)
        self.assertIn("…and 1 more you may open.", summary)

    def test_what_changed_and_the_brief_name_their_customers_together(self):
        Brief.objects.create(
            organisation=self.org,
            as_of=self.today,
            headline="Pizza Hut carries the risk",
            body="Body.",
            watch=[],
            evidence={"customer_ids": [self.pizza.pk]},
            generated_by=self.csm,
            generated_at=timezone.now() - timedelta(hours=1),
            scope_key=f"me:{self.csm.pk}",
        )

        grounding = self.ground(self.csm, "me", "changed")

        self.assertEqual(grounding.customer_ids, sorted([self.pizza.pk, self.dough.pk]))


class SavedExplanationTests(WhyFixture):
    def test_a_readable_explanation_is_included_and_marked_stale(self):
        self.explanation("Loose Ltd carries it.", by=self.lee, customer_ids=[self.loose.pk])

        grounding = self.ground(self.lee, "company", "changed")

        self.assertIn("SAVED EXPLANATIONS", grounding.summary)
        self.assertIn(
            "- ARR at risk (numbers have moved since): Loose Ltd carries it.", grounding.summary
        )
        self.assertIn(self.loose.pk, grounding.customer_ids)

    def test_a_current_explanation_is_not_marked_stale(self):
        figs = self.company_figures()
        self.explanation(
            "Two renewals carry it.",
            by=self.admin,
            customer_ids=[],
            figures_digest=explanation_digest(
                figs.values["at_risk_arr"], figs.slices["at_risk_arr"]
            ),
        )

        summary = self.ground(self.admin, "company", "changed").summary

        self.assertIn("- ARR at risk: Two renewals carry it.", summary)

    def test_one_naming_a_customer_the_asker_cannot_open_is_left_out(self):
        self.explanation(
            "Loose Ltd carries it.",
            by=self.lee,
            customer_ids=[self.loose.pk],
            generated_at=timezone.now() - timedelta(hours=2),
        )
        self.explanation("Dough Co carries it.", by=self.lee, customer_ids=[self.dough.pk])

        grounding = self.ground(self.lee, "company", "changed")

        self.assertNotIn("Dough Co", grounding.summary)
        self.assertIn("Loose Ltd carries it.", grounding.summary)
        self.assertNotIn(self.dough.pk, grounding.customer_ids)
        # The control: a reader who sees everything may read the newer one.
        admin = self.ground(self.admin, "company", "changed")
        self.assertIn("Dough Co carries it.", admin.summary)
        self.assertIn(self.dough.pk, admin.customer_ids)

    def test_a_long_explanation_is_cut(self):
        self.explanation("x" * 2000, by=self.admin, customer_ids=[])

        summary = self.ground(self.admin, "company", "changed").summary

        self.assertIn("x" * 800 + "…", summary)
        self.assertNotIn("x" * 801, summary)

    def test_none_saved_says_so(self):
        summary = self.ground(self.admin, "company", "changed").summary

        self.assertIn("SAVED EXPLANATIONS", summary)
        self.assertIn("- none saved for these metrics", summary)


class MoveAccountsTests(WhyFixture):
    """ARR going dark moved: Pizza Hut was touched today, Taco Bell 65 days
    ago, Dough Co, Soup Co and Loose Ltd never. Lee can open only Loose Ltd."""

    def setUp(self):
        for customer, days in ((self.pizza, 0), (self.taco, 65)):
            Activity.objects.create(
                customer=customer,
                type=Activity.ActivityType.HEALTH_CHECK_REVIEW,
                occurred_at=self.today - timedelta(days=days),
            )
        self.month_end("dark_arr", 0)
        self.month_end("dark_accounts", 0)

    def move(self, summary, label):
        """The material move's line, not the figure's."""
        moves = summary.split("MATERIAL MOVES:", 1)[1].split("WHY IT MOVED", 1)[0]
        return next(row for row in moves.splitlines() if row.startswith(f"- {label}: "))

    def test_the_accounts_a_move_counts_are_listed_under_it(self):
        grounding = self.ground(self.admin, "company", "changed")

        line = self.move(grounding.summary, "ARR going dark")
        self.assertIn("; accounts: Dough Co (Carl CSM, USD 100,000, no contact logged)", line)
        self.assertIn("Taco Bell (Dana CSM, USD 200,000, no contact in 65 days)", line)
        self.assertIn("Loose Ltd (Unassigned, USD 80,000, no contact logged)", line)
        self.assertNotIn("Pizza Hut", line)
        self.assertNotIn("can't open", line)
        self.assertIn("Taco Bell (Dana CSM", self.move(grounding.summary, "Accounts going dark"))
        for customer in (self.dough, self.soup, self.taco, self.loose):
            self.assertIn(customer.pk, grounding.customer_ids)
        self.assertNotIn(self.pizza.pk, grounding.customer_ids)

    def test_accounts_the_asker_cannot_open_are_only_counted_under_the_move(self):
        grounding = self.ground(self.lee, "company", "changed")

        line = self.move(grounding.summary, "ARR going dark")
        self.assertIn(
            "; accounts: Loose Ltd (Unassigned, USD 80,000, no contact logged); "
            "3 more on records you can't open",
            line,
        )
        for hidden in ("Dough Co", "Soup Co", "Taco Bell"):
            self.assertNotIn(hidden, grounding.summary)
        # The id as a number of its own, not digits inside a figure such as
        # "82.2%" or "100.0%" (it flaked whenever the pk matched one).
        self.assertIsNone(re.search(rf"(?<![\d.]){self.taco.pk}(?![\d.%])", grounding.summary))
        self.assertEqual(grounding.customer_ids, [self.loose.pk])

    def test_a_move_with_no_account_rule_lists_none(self):
        self.month_end("open_tickets", 5)

        line = self.move(
            self.ground(self.admin, "company", "changed").summary, "Open support tickets"
        )

        self.assertNotIn("accounts:", line)

    def test_the_downside_accounts_are_listed_under_an_at_risk_move(self):
        self.month_end("at_risk_arr", 1)

        admin = self.move(self.ground(self.admin, "company", "changed").summary, "ARR at risk")
        lee = self.move(self.ground(self.lee, "company", "changed").summary, "ARR at risk")

        self.assertIn("; accounts: Taco Bell (Dana CSM, USD 200,000, downside USD ", admin)
        self.assertIn("Dough Co (Carl CSM", admin)
        self.assertIn("; accounts: 2 more on records you can't open", lee)
        self.assertNotIn("Dough Co", lee)


class NoWritesTests(WhyFixture):
    def test_grounding_writes_no_explanation_baseline_or_audit_row(self):
        self.explanation("Saved.", by=self.admin, customer_ids=[])
        self.month_end("at_risk_arr", 1)
        before = (
            Explanation.objects.count(),
            ScopeSnapshot.objects.count(),
            AuditEvent.objects.count(),
        )
        for user, scope in ((self.csm, "me"), (self.mona, "team"), (self.admin, "company")):
            with self.subTest(scope=scope):
                self.ground(user, scope, "changed")
                self.assertEqual(
                    (
                        Explanation.objects.count(),
                        ScopeSnapshot.objects.count(),
                        AuditEvent.objects.count(),
                    ),
                    before,
                )


class WhyQueryCountTests(WhyFixture):
    def queries(self, user):
        with CaptureQueriesContext(connection) as captured:
            self.ground(user, "company", "changed")
        return len(captured.captured_queries)

    def test_flat_in_moves_accounts_and_explanations(self):
        figs = self.company_figures()
        for key in ("active_arr", "nrr", "at_risk_arr", "healthy_share"):
            self.explanation(
                f"Saved {key}.", by=self.admin, customer_ids=[self.dough.pk], metric=key
            )
        self.month_end(
            "at_risk_arr",
            figs.values["at_risk_arr"] + 90_000,
            [("owner", m, (v or 0) + 1_000) for m, _l, v in figs.slices["at_risk_arr"]["owner"]],
        )
        few = {user.pk: self.queries(user) for user in (self.admin, self.lee)}

        # Many more moves (every headline metric and its cuts) and accounts.
        for key in ("nrr", "healthy_share", "forecast_arr"):
            value = figs.values[key]
            if value is None:
                continue
            self.month_end(
                key,
                value + 30,
                [("owner", m, (v or 0) + 5) for m, _l, v in figs.slices[key]["owner"]],
            )
        self.month_end("dark_arr", 0)
        self.month_end("dark_accounts", 0)
        self.month_end("poor_health_count", 0)
        renews = self.today + timedelta(days=20)
        for i in range(8):
            owner = self.csm if i % 2 else self.other
            self.customer(f"Shaky {i}", owner, 60_000 + i, "2.0", renewal_date=renews)
        many = {user.pk: self.queries(user) for user in (self.admin, self.lee)}

        self.assertEqual(few, many)


class PersonaTests(WhyFixture):
    def test_the_persona_says_to_answer_why_from_the_given_reasons(self):
        self.assertIn(
            "answer from the cuts, drivers, accounts and saved explanations", BRAIN_PERSONA
        )
        self.assertIn("say which data would", BRAIN_PERSONA)
        self.assertIn(
            'When accounts are listed under a move that got worse ("accounts:"), name them as '
            "the reason for that move.",
            BRAIN_PERSONA,
        )
        self.assertIn(
            'Under a move that improved ("still counted:"), the accounts are what remains, '
            "not the cause; say so.",
            BRAIN_PERSONA,
        )
