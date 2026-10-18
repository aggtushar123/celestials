"""The Brain tests' shared world, built once per class (`setUpTestData`).

Acme (USD): Alice (admin, Leadership) sees everything and manages nobody;
Lee (CSM role, Leadership function) reads Company through his function and
owns nothing; Mona (CSM) manages Carl; Dana (CSM) manages nobody. Gus is
Globex's.

Customers: Pizza Hut (Carl, 300k, healthy), Dough Co (Carl, 100k, poor,
renews in 30 days), Soup Co (Mona, 50k, healthy), Taco Bell (Dana, 200k,
poor, renews in 30 days), Loose Ltd (nobody, 80k, healthy). Accounts: Pizza
EMEA (Carl, under Pizza Hut), Taco East (Carl, under Dana's Taco Bell), Taco
West (Dana, under Taco Bell).

Carl's Me: Pizza Hut and Dough Co (ARR 400k). Mona's My team: those and Soup
Co (450k). Company: 730k."""

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from services.accounts.models import Organisation, User
from services.customers.models import Account, Customer
from services.segments.tests.fixtures import person


class BrainFixture(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.today = timezone.localdate()
        cls.org = Organisation.objects.create(name="Acme Inc", currency="USD")
        cls.admin = person(
            "alice@acme.io",
            "Alice Admin",
            cls.org,
            role=User.Role.ADMIN,
            function=User.Function.LEADERSHIP,
        )
        cls.lee = person("lee@acme.io", "Lee Lead", cls.org, function=User.Function.LEADERSHIP)
        cls.mona = person("mona@acme.io", "Mona Manager", cls.org)
        cls.csm = person("carl@acme.io", "Carl CSM", cls.org, reports_to=cls.mona)
        cls.other = person("dana@acme.io", "Dana CSM", cls.org)
        cls.other_org = Organisation.objects.create(name="Globex", currency="USD")
        cls.stranger = person("gus@globex.io", "Gus Globex", cls.other_org)

        renews = cls.today + timedelta(days=30)
        cls.pizza = cls.customer("Pizza Hut", cls.csm, 300_000, "8.0")
        cls.dough = cls.customer("Dough Co", cls.csm, 100_000, "2.0", renewal_date=renews)
        cls.soup = cls.customer("Soup Co", cls.mona, 50_000, "8.0")
        cls.taco = cls.customer("Taco Bell", cls.other, 200_000, "2.0", renewal_date=renews)
        cls.loose = cls.customer("Loose Ltd", None, 80_000, "8.0")
        cls.globex = cls.customer(
            "Globex Corp", cls.stranger, 999_000, "8.0", organisation=cls.other_org
        )
        cls.emea = cls.account("Pizza EMEA", cls.pizza, cls.csm)
        cls.east = cls.account("Taco East", cls.taco, cls.csm)
        cls.west = cls.account("Taco West", cls.taco, cls.other)

    @classmethod
    def customer(cls, name, owner, arr, health, **fields):
        fields.setdefault("organisation", cls.org)
        return Customer.objects.create(
            name=name,
            owner=owner,
            arr_billed_at_account=Decimal(arr),
            health_score=Decimal(health),
            **fields,
        )

    @staticmethod
    def account(name, customer, owner):
        account = Account.objects.create(name=name, owner=owner)
        account.customers.add(customer)
        return account

    def as_user(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client
