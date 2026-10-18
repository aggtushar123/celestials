"""Book at a glance in Copilot's grounding (eval 2026-10-16: an admin who
owns no customers had no overview at all, so "Which customer has the
largest ARR?" and "How many active customers?" went unanswered). Built only
from the customers the asker may open."""

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from services.accounts.models import Organisation, User
from services.copilot.context import build_grounding
from services.customers.models import Customer


class BookGlanceTests(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name="Acme Inc")
        self.admin = User.objects.create_user(
            email="alice@acme.io",
            password="x",
            name="Alice",
            organisation=self.org,
            role=User.Role.ADMIN,
        )
        self.carl = User.objects.create_user(
            email="carl@acme.io", password="x", name="Carl", organisation=self.org
        )
        self.dana = User.objects.create_user(
            email="dana@acme.io", password="x", name="Dana", organisation=self.org
        )
        soon = timezone.localdate() + timedelta(days=30)

        def mk(name, owner, arr, health, **kw):
            return Customer.objects.create(
                organisation=self.org,
                name=name,
                owner=owner,
                arr_billed_at_hq=Decimal(arr),
                health_score=Decimal(health),
                **kw,
            )

        mk("Shopify", self.dana, 175000, "8.4")
        mk("Kraft Heinz", self.carl, 152600, "7.2", renewal_date=soon)
        mk("Uber", self.carl, 95000, "3.0")
        mk("Archived Co", self.carl, 999999, "1.0", is_archived=True)

    def summary(self, user):
        return build_grounding(self.org, user=user, query="").summary

    def test_an_admin_with_no_book_sees_the_count_the_largest_arr_poor_health_and_renewals(self):
        text = self.summary(self.admin)
        self.assertIn("Customers you can see: 3 live", text)
        self.assertIn("Largest ARR: Shopify", text)
        self.assertLess(text.index("Shopify"), text.index("Kraft Heinz"))
        self.assertIn("Poor health: Uber", text)
        self.assertIn("Renewing in the next 90 days: Kraft Heinz", text)
        self.assertNotIn("Archived Co", text)

    def test_a_csm_sees_only_the_customers_they_may_open(self):
        text = self.summary(self.dana)
        self.assertIn("Customers you can see: 1 live", text)
        self.assertNotIn("Kraft Heinz", text.split("Customers you can see")[1])
        self.assertNotIn("Uber", text)
