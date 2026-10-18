"""The canvas tests' shared world, built once per test class
(`setUpTestData`): the plans fixture (Alice the admin opens everything and is
nobody's manager; Carl owns Pizza Hut, Pizza EMEA and Dough Co; Dana owns
Taco Bell and Taco West; Mona is Carl's manager; Gus is another tenant;
contacts Ann on Pizza Hut (champion), Ben on Pizza EMEA (decision maker), Tia
on Taco Bell, Tom on Taco West, Dot on Dough Co), plus Cal, an economic buyer
on Pizza Hut, and Taco East, an account of Taco Bell that Carl owns, with Eve
(influencer) on it. Carl may open Taco Bell through Taco East, and Tia and
Eve, but not Taco West or Tom. Dana may open all of Taco Bell, not Pizza Hut."""

from rest_framework.test import APIClient

from services.customers.models import Canvas, Contact, Customer, Email
from services.plans.tests.fixtures import PlanFixture
from services.surveys.tests.fixtures import contact


class CanvasFixture(PlanFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.cal = contact(cls.pizza, "Cal", Contact.Role.ECONOMIC_BUYER)
        cls.east = cls.make_account("Taco East", cls.taco, cls.csm)
        cls.eve = contact(cls.east, "Eve", Contact.Role.INFLUENCER)

    @staticmethod
    def node(person, x=0, y=0):
        return {
            "id": f"c{person.pk}",
            "position": {"x": x, "y": y},
            "data": {"contact_id": person.pk},
        }

    @staticmethod
    def line(a, b, label="Reports to", id=None):
        return {
            "id": id or f"e{a.pk}-{b.pk}-{label}",
            "source": f"c{a.pk}",
            "target": f"c{b.pk}",
            "label": label,
        }

    @classmethod
    def make_canvas(cls, record=None, people=(), *, lines=(), extra=(), created_by=None, **fields):
        """A map on Pizza Hut unless told otherwise: `people` in one row,
        then the raw `extra` nodes, then `lines`."""
        record = record or cls.pizza
        on = {"customer": record} if isinstance(record, Customer) else {"account": record}
        nodes = [cls.node(person, 240 * index) for index, person in enumerate(people)]
        return Canvas.objects.create(
            name=fields.pop("name", "Pizza map"),
            nodes=[*nodes, *extra],
            edges=list(lines),
            created_by=created_by,
            **on,
            **fields,
        )

    @classmethod
    def mail(cls, record, sent_at, **fields):
        on = {"customer": record} if isinstance(record, Customer) else {"account": record}
        return Email.objects.create(
            **on,
            subject="Hello",
            sender_name="Sam",
            recipient_name="Carl",
            body="x",
            sent_at=sent_at,
            **fields,
        )

    def as_user(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client
