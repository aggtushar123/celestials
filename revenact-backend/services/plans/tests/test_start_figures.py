"""Plans keep their starting figures (Brain delivery 3 spec §1.1): the
record's health score and ARR, as the rest of the app reads them, written
once when a plan starts by a person or a rule, and never again. Plans made
before this delivery read null."""

from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APIClient

from services.accounts.models import Organisation, User
from services.customers.models import Account, Customer
from services.fx_rates.models import FxRate
from services.plans.figures import record_figures
from services.plans.models import Plan
from services.plans.tests.test_starting import StartFixture


class StartFiguresTests(StartFixture):
    def setUp(self):
        Customer.objects.filter(pk=self.pizza.pk).update(
            arr_billed_at_account=Decimal("40000"),
            arr_billed_at_hq=Decimal("90000"),
            health_score=Decimal("6.2"),
        )
        self.pizza.refresh_from_db()
        self.carl = User.objects.get(pk=self.csm.pk)

    def started(self, record=None, **kwargs):
        kwargs.setdefault("owner", self.carl)
        kwargs.setdefault("actor", self.carl)
        plan = self.start(record=record or self.pizza, **kwargs)
        plan.refresh_from_db()
        return plan

    def test_a_plan_started_by_a_person_keeps_the_records_figures(self):
        plan = self.started()
        self.assertEqual(
            plan.start_figures,
            {
                "health_score": 6.2,
                "arr": 40000.0,
                "currency": "USD",
                "taken_on": timezone.localdate().isoformat(),
            },
        )

    def test_a_plan_started_by_a_rule_keeps_them_too(self):
        rule = self.make_rule(name="Onboard new")
        plan = self.started(actor=None, rule=rule)
        self.assertEqual(plan.start_figures["health_score"], 6.2)
        self.assertEqual(plan.start_figures["arr"], 40000.0)

    def test_arr_is_the_column_the_workspace_maps(self):
        Organisation.objects.filter(pk=self.org.pk).update(
            global_attributes={"arr": "arr_billed_at_hq"}
        )
        self.carl = User.objects.get(pk=self.csm.pk)
        self.assertEqual(self.started().start_figures["arr"], 90000.0)

    def test_another_currency_is_converted_or_left_null(self):
        Customer.objects.filter(pk=self.pizza.pk).update(currency="EUR")
        self.pizza.refresh_from_db()
        self.assertIsNone(record_figures(self.pizza, self.org)["arr"])
        FxRate.objects.create(organisation=self.org, currency="EUR", rate_to_org_currency="1.1")
        self.assertEqual(record_figures(self.pizza, self.org)["arr"], 44000.0)

    def test_an_account_reads_its_own_arr_and_health(self):
        Account.objects.filter(pk=self.emea.pk).update(arr=Decimal("12000"), health_score="7.5")
        self.emea.refresh_from_db()
        plan = self.started(record=self.emea)
        self.assertEqual(
            (plan.start_figures["health_score"], plan.start_figures["arr"]), (7.5, 12000.0)
        )

    def test_they_are_never_updated_afterwards(self):
        plan = self.started()
        kept = dict(plan.start_figures)
        Customer.objects.filter(pk=self.pizza.pk).update(health_score=Decimal("9.9"))
        client = APIClient()
        client.force_authenticate(self.carl)
        response = client.patch(f"/api/v1/plans/{plan.pk}/", {"name": "Renamed"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        plan.refresh_from_db()
        self.assertEqual(plan.start_figures, kept)

    def test_plans_from_before_read_null(self):
        field = Plan._meta.get_field("start_figures")
        self.assertTrue(field.null)
        self.assertIsNone(self.build_plan().start_figures)
