"""The rest of the recommender's sources (spec §2.2, §6): anomalies naming a
record. No fact quotes an anomaly's own words."""

from datetime import timedelta

from django.utils import timezone

from services.anomalies.models import Anomaly, AnomalyEvidence
from services.customers.models import Customer
from services.work.tests.recommend_fixtures import RecommendFixture


class AnomalyTests(RecommendFixture):
    def anomaly(self, *, on, status="live", seen_days_ago=2):
        now = timezone.now()
        found = Anomaly.objects.create(
            organisation=self.org,
            title="Pizza Hut and 7 others report login failures",
            status=status,
            first_seen_at=now - timedelta(days=9),
            last_seen_at=now - timedelta(days=seen_days_ago),
        )
        key = "customer" if isinstance(on, Customer) else "account"
        AnomalyEvidence.objects.create(
            anomaly=found,
            organisation=self.org,
            kind=AnomalyEvidence.Kind.TICKET,
            record_id=AnomalyEvidence.objects.count() + 1,
            **{key: on},
            snippet="Can't log in since the update",
            occurred_at=now,
        )
        return found

    def test_a_live_anomaly_naming_the_record_is_a_signal(self):
        self.anomaly(on=self.pizza)
        self.anomaly(on=self.dough, status="acknowledged")
        self.anomaly(on=self.west)
        found = {(s.record.name, s.value) for s in self.signals("anomaly")}
        self.assertEqual(found, {("Pizza Hut", 1.0), ("Taco West", 1.0)})
        [pizza] = [s for s in self.signals("anomaly") if s.account is None]
        self.assertEqual(pizza.facts, ("Named in 1 live anomaly", "Last seen 2 days ago"))
        self.assertEqual(pizza.title, "Check Pizza Hut against a live anomaly")
        self.assertEqual(pizza.evidence[1], {"label": "Anomalies", "link": "/brain/anomalies"})

    def test_two_anomalies_count_two(self):
        self.anomaly(on=self.pizza)
        self.anomaly(on=self.pizza, seen_days_ago=0)
        [pizza] = self.signals("anomaly")
        self.assertEqual(pizza.value, 2.0)
        self.assertEqual(pizza.facts, ("Named in 2 live anomalies", "Last seen today"))

    def test_the_anomalys_own_words_are_never_copied(self):
        self.anomaly(on=self.pizza)
        text = repr(self.signals("anomaly"))
        self.assertNotIn("login failures", text)
        self.assertNotIn("since the update", text)
