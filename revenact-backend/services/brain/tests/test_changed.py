"""The "What changed" payload for each scope."""

from datetime import date
from decimal import Decimal

from services.accounts.models import User
from services.brain import changed
from services.brain.scope import resolve
from services.brain.tests.fixtures import BrainFixture
from services.customers.models import Customer
from services.metrics.models import MetricSnapshot
from services.metrics.registry import METRICS
from services.segments.tests.fixtures import person

METRIC_KEYS = {"key", "label", "unit", "better", "now", "then", "change", "material"}
SIGNAL_KEYS = {"key", "label", "unit", "better", "now", "then", "change", "improved", "drivers"}


def row(payload, key):
    return next(m for m in payload["metrics"] if m["key"] == key)


class CompanyTests(BrainFixture):
    def test_with_no_month_end_nothing_is_compared(self):
        payload = changed.build(resolve(self.admin, "company"), self.today)
        self.assertEqual(
            (payload["scope"], payload["since"], payload["since_kind"], payload["team_changed_on"]),
            ("company", None, "month_end", None),
        )
        self.assertEqual(
            (payload["empty"], payload["currency"], payload["signals"]), (False, "USD", [])
        )
        self.assertEqual(len(payload["metrics"]), len(METRICS))
        for metric in payload["metrics"]:
            self.assertEqual(set(metric), METRIC_KEYS)
            self.assertEqual(
                (metric["then"], metric["change"], metric["material"]), (None, None, False)
            )

    def test_moves_are_measured_from_the_latest_month_end(self):
        MetricSnapshot.objects.create(
            organisation=self.org,
            metric="active_arr",
            period_end=date(2026, 9, 30),
            value=Decimal("1000000"),
        )
        payload = changed.build(resolve(self.lee, "company"), self.today)
        arr = row(payload, "active_arr")
        self.assertEqual(
            (arr["then"], arr["now"], arr["change"], arr["material"]),
            (1_000_000.0, 730_000.0, -270_000.0, True),
        )
        self.assertEqual(payload["since"], "2026-09-30")
        [signal] = payload["signals"]
        self.assertEqual(set(signal), SIGNAL_KEYS)
        self.assertIs(signal["improved"], False)


class TeamTests(BrainFixture):
    def test_the_first_view_is_its_own_baseline(self):
        payload = changed.build(resolve(self.mona, "team"), self.today)
        self.assertEqual(
            (payload["since"], payload["since_kind"], payload["team_changed_on"]),
            (self.today.isoformat(), "baseline", None),
        )
        self.assertEqual(payload["signals"], [])
        arr = row(payload, "active_arr")
        self.assertEqual((arr["now"], arr["then"], arr["change"]), (450_000.0, 450_000.0, 0.0))

    def test_a_customer_handed_out_is_named_by_its_new_owner_on_money_moves(self):
        team = resolve(self.mona, "team")
        changed.build(team, self.today)
        Customer.objects.filter(pk=self.dough.pk).update(owner=self.other)

        payload = changed.build(team, self.today)
        by_key = {s["key"]: s for s in payload["signals"]}
        self.assertEqual(
            by_key["active_arr"]["handover"], {"in": 0, "out": 1, "people": ["Dana CSM"]}
        )
        self.assertIn("healthy_share", by_key)
        for signal in payload["signals"]:
            self.assertEqual("handover" in signal, signal["unit"] == "money")
        driver = by_key["at_risk_arr"]["drivers"][0]
        self.assertEqual(set(driver), {"dimension", "member", "label", "change"})
        self.assertNotIn("Dough Co", str(payload))

    def test_after_a_team_change_moves_start_again(self):
        team = resolve(self.mona, "team")
        changed.build(team, self.today)
        Customer.objects.filter(pk=self.soup.pk).update(owner=self.other)
        person("ed@acme.io", "Ed CSM", self.org, reports_to=self.mona)
        payload = changed.build(resolve(User.objects.get(pk=self.mona.pk), "team"), self.today)
        self.assertEqual(payload["team_changed_on"], self.today.isoformat())
        self.assertEqual(payload["signals"], [])


class EmptyTests(BrainFixture):
    def test_a_me_with_no_customers_is_flagged_empty(self):
        payload = changed.build(resolve(self.lee, "me"), self.today)
        self.assertTrue(payload["empty"])
        self.assertEqual(row(payload, "active_customers")["now"], 0)
