"""SOC2:AUTH-02 a scope's figures and named downside follow a real person's
record rules: the reader's for a live read, the scope's own user's for a
month-end row. The book is narrowed to the scope's owners; what is counted
inside it is what that person may read."""

from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone

from services.accounts.capabilities import Capability
from services.brain import changed, explanations, history
from services.brain.exposure import exposure
from services.brain.metrics import figures
from services.brain.models import ScopeSnapshot
from services.brain.scope import resolve
from services.brain.tests.fixtures import BrainFixture
from services.customers import activity_tracking, forecast
from services.customers.models import Email, Risk, Ticket
from services.customers.scoping import SystemActor
from services.metrics.models import Explanation


def risk(title, *, mrr, department="", customer=None, account=None):
    return Risk.objects.create(
        title=title,
        customer=customer,
        account=account,
        mrr=Decimal(mrr),
        priority=Risk.Priority.HIGH,
        department=department,
    )


class ScopeActorPrincipalTests(BrainFixture):
    def test_who_is_the_principal_and_the_book_is_the_scopes(self):
        actor = resolve(self.csm, "me").actor
        self.assertEqual((actor.id, actor.pk), (self.csm.id, self.csm.pk))
        self.assertEqual(actor.function, self.csm.function)
        self.assertIs(actor.principal, self.csm)
        self.assertFalse(actor.has_capability(Capability.VIEW_ALL_ACCOUNTS))
        self.assertTrue(
            resolve(self.admin, "me").actor.has_capability(Capability.VIEW_ALL_ACCOUNTS)
        )
        self.assertNotIsInstance(actor, SystemActor)
        self.assertEqual(actor.owner_scope, frozenset({self.csm.id}))


class MeFollowsTheReadersRecordRulesTests(BrainFixture):
    def test_me_forecast_excludes_a_risk_in_a_department_the_reader_cannot_read(self):
        before = figures(resolve(self.csm, "me")).values
        team_before = figures(resolve(self.mona, "team")).values["at_risk_arr"]
        risk("Sales worry", mrr=1000, department="sales", customer=self.pizza)
        after = figures(resolve(self.csm, "me")).values
        for key in ("at_risk_arr", "forecast_arr", "nrr"):
            self.assertEqual(after[key], before[key], key)
        # Mona (CS) reads no Sales pipeline either.
        self.assertEqual(figures(resolve(self.mona, "team")).values["at_risk_arr"], team_before)
        risk("CS worry", mrr=1000, department="cs", customer=self.pizza)
        self.assertGreater(
            figures(resolve(self.csm, "me")).values["at_risk_arr"], before["at_risk_arr"]
        )

    def test_me_open_tickets_exclude_another_departments(self):
        def ticket(number, department):
            Ticket.objects.create(
                customer=self.pizza,
                ticket_number=number,
                title="Down",
                status=Ticket.Status.OPEN,
                priority=Ticket.Priority.HIGH,
                opened_at=self.today,
                department=department,
            )

        ticket("T-1", "")
        ticket("T-2", "cs")
        ticket("T-3", "sales")
        self.assertEqual(figures(resolve(self.csm, "me")).values["open_tickets"], 2)
        self.assertEqual(figures(resolve(self.admin, "company")).values["open_tickets"], 3)

    def test_me_activity_counts_exclude_a_peers_private_mail(self):
        def email(owner, n):
            Email.objects.create(
                customer=self.pizza,
                subject="Hello",
                sender_name="Someone",
                recipient_name="Pizza",
                body="Body",
                sent_at=timezone.now() - timedelta(days=2),
                mailbox_owner=owner,
                provider_message_id=f"m-{n}",
            )

        email(self.csm, 1)
        email(self.other, 2)  # Dana is Carl's peer: her mailbox is hers
        stats = activity_tracking.build_stats(resolve(self.csm, "me").actor, {})
        emails = {row["key"]: row["count"] for row in stats["sources"]}["emails"]
        self.assertEqual(emails, 1)
        # Mona manages Carl, but mail is owner-only (2026-10-17): her Team
        # counts neither his private mail nor Dana's...
        stats = activity_tracking.build_stats(resolve(self.mona, "team").actor, {})
        self.assertEqual({row["key"]: row["count"] for row in stats["sources"]}["emails"], 0)
        # ...until Carl adds his to Revenact.
        Email.objects.filter(mailbox_owner=self.csm).update(shared_at=timezone.now())
        stats = activity_tracking.build_stats(resolve(self.mona, "team").actor, {})
        self.assertEqual({row["key"]: row["count"] for row in stats["sources"]}["emails"], 1)


class NamedDownsideIsTheReadersTests(BrainFixture):
    """Lee is Leadership without view_all_accounts: Company is his, but an
    account he cannot open is not his to count."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.loose_ops = cls.account("Loose Ops", cls.loose, cls.other)
        risk("Org-level", mrr=1000, customer=cls.loose)
        risk("On Dana's account", mrr=5000, account=cls.loose_ops)

    def downside(self, viewer):
        rows = forecast.build_rows([self.loose], self.org, viewer=viewer)
        return rows[0].downside

    def test_company_exposure_counts_only_risks_on_accounts_the_reader_can_open(self):
        scope = resolve(self.lee, "company")
        named, _hidden = exposure(scope, self.lee, limit=10)
        loose = next(row for row in named if row["id"] == self.loose.id)
        self.assertNotEqual(self.downside(self.lee), self.downside(SystemActor(self.org)))
        self.assertEqual(loose["downside"], round(self.downside(self.lee), 2))

    def test_the_explanation_prompt_carries_the_readers_downside(self):
        scope = resolve(self.lee, "company")
        figs = figures(scope)
        comparison = changed.compare(scope, figs, self.today, record=False)
        evidence = explanations.evidence(scope, self.lee, "at_risk_arr", figs, comparison)
        line = next(a for a in evidence["accounts"] if a["name"] == "Loose Ltd")
        self.assertEqual(line["downside"], round(self.downside(self.lee), 2))

    def test_a_company_explanation_written_by_a_wider_reader_is_not_reused(self):
        Explanation.objects.create(
            organisation=self.org,
            metric="at_risk_arr",
            as_of=self.today,
            text="Loose Ltd carries it.",
            evidence=[],
            inputs={"customer_ids": [self.loose.id], "hidden": 0},
            generated_by=self.admin,
            generated_at=timezone.now(),
            scope_key="company",
        )
        lee = self.as_user(self.lee).get("/api/v1/brain/explanations/at_risk_arr/?scope=company")
        self.assertIsNone(lee.json()["explanation"])
        alice = self.as_user(self.admin).get(
            "/api/v1/brain/explanations/at_risk_arr/?scope=company"
        )
        self.assertIsNotNone(alice.json()["explanation"])


class MonthEndIsTheScopesOwnUsersViewTests(BrainFixture):
    def test_a_month_end_me_row_equals_the_users_live_me_figures(self):
        period_end = date(2026, 9, 30)
        risk("Sales worry", mrr=1000, department="sales", customer=self.pizza)
        history.record_month_end(self.org, period_end, today=period_end + timedelta(days=1))
        row = ScopeSnapshot.objects.get(scope_key=f"me:{self.csm.id}", taken_on=period_end)
        live = figures(resolve(self.csm, "me")).values
        self.assertEqual(row.values, live)
        carls = forecast.build_bridge(
            forecast.build_rows(
                list(forecast.filtered_customers(self.csm, {}).filter(owner=self.csm)),
                self.org,
                viewer=self.csm,
            )
        )
        self.assertEqual(row.values["at_risk_arr"], round(carls["churn"] + carls["contraction"], 2))
