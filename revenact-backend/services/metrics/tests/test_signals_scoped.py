"""signals_for against a caller's own comparison point, and the digests that
say whether a stored brief or explanation still matches the figures."""

from datetime import date
from decimal import Decimal

from django.test import SimpleTestCase, TestCase

from services.accounts.models import Organisation
from services.metrics import signals
from services.metrics.models import MetricSnapshot
from services.metrics.registry import METRICS


def _values(**overrides):
    values = {metric.key: None for metric in METRICS}
    values.update(overrides)
    return values


class GivenComparisonTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organisation.objects.create(name="Acme Inc", currency="USD")

    def test_the_given_point_is_used_instead_of_the_month_end(self):
        MetricSnapshot.objects.create(
            organisation=self.org,
            metric="active_arr",
            period_end=date(2026, 8, 31),
            value=Decimal("1"),
        )
        payload = signals.signals_for(
            self.org,
            _values(active_arr=300_000.0, at_risk_arr=60_000.0),
            previous=_values(active_arr=400_000.0, at_risk_arr=10_000.0),
            previous_slices={"at_risk_arr": {"owner": {"7": 10_000.0}}},
            slices={"at_risk_arr": {"owner": [("7", "Carl CSM", 60_000.0)], "product": []}},
            baseline=date(2026, 10, 1),
        )
        by_key = {s["key"]: s for s in payload["signals"]}
        self.assertEqual(payload["baseline"], "2026-10-01")
        self.assertEqual(
            by_key["active_arr"]["previous"], {"period_end": "2026-10-01", "value": 400_000.0}
        )
        self.assertEqual(by_key["active_arr"]["change"], -100_000.0)
        self.assertIs(by_key["at_risk_arr"]["improved"], False)
        self.assertEqual(
            [(d["member"], d["change"]) for d in by_key["at_risk_arr"]["drivers"]],
            [("7", 50_000.0)],
        )
        # Both bad; ARR at risk moved 500%, ARR 25%.
        self.assertEqual([s["key"] for s in payload["signals"]], ["at_risk_arr", "active_arr"])

    def test_an_empty_point_makes_no_signal(self):
        payload = signals.signals_for(
            self.org, _values(active_arr=1.0), previous={}, previous_slices={}, slices={}
        )
        self.assertEqual((payload["signals"], payload["baseline"]), ([], None))

    def test_the_month_end_point_is_the_latest_row_per_metric_and_member(self):
        for period, value in ((date(2026, 8, 31), "1"), (date(2026, 9, 30), "2")):
            MetricSnapshot.objects.create(
                organisation=self.org, metric="active_arr", period_end=period, value=Decimal(value)
            )
            MetricSnapshot.objects.create(
                organisation=self.org,
                metric="at_risk_arr",
                dimension="owner",
                member="7",
                period_end=period,
                value=Decimal(value) + 4,
            )
        baseline, previous, cuts = signals.previous_from_snapshots(self.org)
        self.assertEqual(baseline, date(2026, 9, 30))
        self.assertEqual(previous, {"active_arr": 2.0})
        self.assertEqual(cuts, {"at_risk_arr": {"owner": {"7": 6.0}}})


class DigestTests(SimpleTestCase):
    def test_a_brief_digest_ignores_key_order_and_number_types(self):
        one = signals.brief_digest({"b": Decimal("1.5"), "a": None})
        self.assertEqual(one, signals.brief_digest({"a": None, "b": 1.5}))
        self.assertEqual(len(one), 64)
        self.assertNotEqual(one, signals.brief_digest({"a": None, "b": 1.6}))

    def test_an_explanation_digest_covers_values_not_labels(self):
        one = signals.explanation_digest(10.0, {"owner": [("7", "Carl", 4.0)]})
        self.assertEqual(one, signals.explanation_digest(10.0, {"owner": [("7", "Carl C.", 4.0)]}))
        self.assertNotEqual(one, signals.explanation_digest(10.0, {"owner": [("7", "Carl", 5.0)]}))
        self.assertNotEqual(one, signals.explanation_digest(11.0, {"owner": [("7", "Carl", 4.0)]}))
