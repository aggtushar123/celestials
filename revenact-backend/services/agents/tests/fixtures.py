"""The agents' tests' world: BrainFixture's people and book (Carl owns Pizza
Hut, Dough Co, Pizza EMEA and Taco East and reports to Mona; Dana owns Taco
Bell and Taco West; Mona owns Soup Co; Loose Ltd has no owner; Alice is an
admin with view-all; Lee is Leadership without it; Gus is Globex's). Every
person `person()` makes is in CS unless given another function. `sam` is a
Sales owner of `deals` (an organisation) so the Sales book is not empty."""

from decimal import Decimal

from services.accounts.capabilities import Capability
from services.accounts.models import Role, User
from services.brain.tests.fixtures import BrainFixture
from services.customers.models import Customer
from services.segments.tests.fixtures import person


class AgentsFixture(BrainFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.sam = person("sam@acme.io", "Sam Sales", cls.org, function=User.Function.SALES)
        cls.deals = Customer.objects.create(
            organisation=cls.org,
            name="Deals Ltd",
            owner=cls.sam,
            arr_billed_at_account=Decimal(70_000),
            health_score=Decimal("6.0"),
        )

    def client_for(self, user):
        return self.as_user(User.objects.get(pk=user.pk))


def viewer(organisation, email="vic@acme.io", name="Vic Viewer"):
    """Someone with view_all_accounts and no other right: not a settings
    manager, so they may not change an owner they are not above."""
    role = Role.objects.create(
        organisation=organisation,
        name="Viewer",
        slug="viewer",
        permissions=[Capability.VIEW_ALL_ACCOUNTS],
    )
    user = person(email, name, organisation)
    user.role = role
    user.save(update_fields=["role"])
    return User.objects.get(pk=user.pk)
