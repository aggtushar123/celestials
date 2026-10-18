"""Three of the recommender's sources, each at its threshold, one below and
one above (spec §6): renewals, health drops and urgent tickets, on
organisations and on accounts. Facts name only the record and counts."""

from datetime import timedelta
from decimal import Decimal

from services.customers.models import Account, Customer, HealthSnapshot, Ticket
from services.work.tests.recommend_fixtures import RecommendFixture


def named(signals):
    return {(s.record.name, s.value) for s in signals}


def short(value):
    return f"{value.day} {value:%b}"


class RenewalDueTests(RecommendFixture):
    def test_within_the_window_is_due_and_beyond_it_is_not(self):
        # Dough Co and Taco Bell renew in 30 days.
        self.assertEqual(
            named(self.signals("renewal_due", days=30)), {("Dough Co", 30.0), ("Taco Bell", 30.0)}
        )
        self.assertEqual(self.signals("renewal_due", days=29), [])
        self.assertEqual(len(self.signals("renewal_due", days=31)), 2)

    def test_its_title_facts_and_evidence(self):
        [dough] = [s for s in self.signals("renewal_due") if s.customer == self.dough]
        renews = self.today + timedelta(days=30)
        self.assertEqual(dough.title, "Prepare Dough Co's renewal")
        self.assertEqual(dough.facts, ("Renews in 30 days", f"Renewal date {short(renews)}"))
        self.assertEqual(
            dough.evidence, ({"label": "Dough Co", "link": f"/organizations/{self.dough.pk}"},)
        )
        self.assertEqual((dough.account, dough.key), (None, (self.dough.pk, None)))

    def test_an_overdue_renewal_is_due_and_says_so(self):
        Customer.objects.filter(pk=self.dough.pk).update(
            renewal_date=self.today - timedelta(days=3)
        )
        [dough] = [s for s in self.signals("renewal_due", days=30) if s.customer == self.dough]
        self.assertEqual((dough.value, dough.facts[0]), (-3.0, "Renewal is 3 days overdue"))

    def test_one_day_and_today_read_as_sentences(self):
        Customer.objects.filter(pk=self.dough.pk).update(
            renewal_date=self.today + timedelta(days=1)
        )
        Customer.objects.filter(pk=self.taco.pk).update(renewal_date=self.today)
        facts = {s.customer.name: s.facts[0] for s in self.signals("renewal_due")}
        self.assertEqual(facts, {"Dough Co": "Renews in 1 day", "Taco Bell": "Renews today"})

    def test_an_account_renews_on_its_own_under_its_first_organisation(self):
        Account.objects.filter(pk=self.west.pk).update(renewal_date=self.today + timedelta(days=9))
        [west] = [s for s in self.signals("renewal_due") if s.account is not None]
        self.assertEqual((west.account, west.customer, west.value), (self.west, self.taco, 9.0))
        self.assertEqual(west.key, (self.taco.pk, self.west.pk))
        self.assertEqual(
            west.evidence[0], {"label": "Taco West", "link": f"/accounts/{self.west.pk}"}
        )

    def test_churned_archived_and_other_workspaces_are_left_out(self):
        Customer.objects.filter(pk=self.dough.pk).update(
            lifecycle_stage=Customer.LifecycleStage.CHURN
        )
        Customer.objects.filter(pk=self.taco.pk).update(is_archived=True)
        Account.objects.filter(pk=self.west.pk).update(renewal_date=self.today)
        Customer.objects.filter(pk=self.globex.pk).update(renewal_date=self.today)
        # Taco West's only organisation is archived, so it goes too.
        self.assertEqual(self.signals("renewal_due"), [])


class HealthDropTests(RecommendFixture):
    def snapshot(self, on, score, days_ago):
        key = "customer" if isinstance(on, Customer) else "account"
        return HealthSnapshot.objects.create(
            **{key: on},
            captured_on=self.today - timedelta(days=days_ago),
            health_score=Decimal(score),
        )

    def test_a_fall_of_exactly_the_drop_is_a_signal(self):
        self.snapshot(self.pizza, "8.5", 14)  # Pizza Hut is 8.0 now
        [pizza] = self.signals("health_drop", drop=0.5, window_days=14)
        self.assertEqual((pizza.customer, pizza.value), (self.pizza, 0.5))
        self.assertEqual(pizza.title, "Find out why Pizza Hut's health fell")
        then = self.today - timedelta(days=14)
        self.assertEqual(pizza.facts, (f"Health fell 8.5 → 8.0 since {short(then)}",))
        self.assertEqual(self.signals("health_drop", drop=0.6, window_days=14), [])
        self.assertEqual(len(self.signals("health_drop", drop=0.4, window_days=14)), 1)

    def test_the_reading_compared_is_the_latest_on_or_before_the_window(self):
        self.snapshot(self.pizza, "9.5", 40)
        self.snapshot(self.pizza, "8.2", 20)
        self.snapshot(self.pizza, "9.9", 5)  # inside the window: not compared
        [pizza] = self.signals("health_drop", drop=0.1, window_days=14)
        self.assertAlmostEqual(pizza.value, 0.2)
        # A longer window reaches back past the 20-day reading to the 40-day one.
        [older] = self.signals("health_drop", drop=0.1, window_days=21)
        self.assertAlmostEqual(older.value, 1.5)

    def test_no_earlier_reading_or_a_rise_is_no_signal(self):
        self.snapshot(self.dough, "1.0", 30)  # Dough Co is 2.0 now: it rose
        self.assertEqual(self.signals("health_drop"), [])

    def test_an_account_falls_on_its_own(self):
        Account.objects.filter(pk=self.emea.pk).update(health_score=Decimal("4.0"))
        self.snapshot(self.emea, "6.0", 15)
        [emea] = self.signals("health_drop")
        self.assertEqual((emea.account, emea.customer, emea.value), (self.emea, self.pizza, 2.0))


class UrgentTicketsTests(RecommendFixture):
    def ticket(self, on, priority="high", status="open", days_ago=0):
        key = "customer" if isinstance(on, Customer) else "account"
        number = Ticket.objects.count() + 1
        return Ticket.objects.create(
            **{key: on},
            ticket_number=f"TKT-{number}",
            title="Login fails for every admin",
            assignee_name="Support",
            priority=priority,
            status=status,
            opened_at=self.today - timedelta(days=days_ago),
        )

    def test_open_urgent_tickets_at_the_minimum_are_a_signal(self):
        self.ticket(self.taco, "critical", days_ago=6)
        self.ticket(self.taco, "high")
        self.ticket(self.taco, "medium")
        self.ticket(self.taco, "high", status="resolved")
        self.ticket(self.taco, "critical", status="closed")
        [taco] = self.signals("urgent_tickets", min=2)
        self.assertEqual((taco.customer, taco.value), (self.taco, 2.0))
        self.assertEqual(taco.facts, ("2 urgent tickets open", "Oldest opened 6 days ago"))
        self.assertEqual(taco.title, "Get Taco Bell's urgent tickets moving")
        self.assertEqual(self.signals("urgent_tickets", min=3), [])
        self.assertEqual(len(self.signals("urgent_tickets", min=1)), 1)

    def test_an_accounts_tickets_are_its_own_and_never_quoted(self):
        self.ticket(self.west)
        [west] = self.signals("urgent_tickets")
        self.assertEqual((west.account, west.value), (self.west, 1.0))
        self.assertEqual(west.facts, ("1 urgent ticket open", "Oldest opened today"))
        self.assertNotIn("Login fails", repr(west))
