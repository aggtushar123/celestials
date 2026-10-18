"""The rules tests' shared world, built once per test class
(`setUpTestData`): the surveys fixture (Alice the admin sees everything;
Carl owns Pizza Hut and Pizza EMEA, Dana owns Taco Bell and Taco West, and
neither CSM can open the other's; Ann, Ben, Tia and Tom are their contacts),
plus Dough Co, a second organisation of Carl's with Dot as its champion, and
Carl's segment "My book" pinning Pizza Hut and Dough Co."""

from decimal import Decimal

from services.customers.models import Customer
from services.rules.models import Rule
from services.segments.models import SegmentChange
from services.surveys.tests.fixtures import SurveyFixture, contact

NOTIFY_ME = {"action": "notify", "to": "me", "people": [], "message": ""}
TASK = {"action": "task", "title": "Call them", "assignee": "me", "due_in_days": 3}
LIFECYCLE = {"action": "lifecycle", "stage": "renewal"}
SURVEY = {
    "action": "survey",
    "survey_type": "nps",
    "subject": "A quick question",
    "intro": "",
    "roles": ["champion", "decision_maker"],
    "without_review": False,
}


class RuleFixture(SurveyFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.dough = Customer.objects.create(
            organisation=cls.org, name="Dough Co", owner=cls.csm, health_score=Decimal("6.0")
        )
        cls.dot = contact(cls.dough, "Dot")
        cls.book = cls.pinned("customer", [cls.pizza, cls.dough], name="My book")

    @classmethod
    def make_rule(cls, *, owner=None, segment=None, actions=None, **fields):
        """An active rule, Carl's by default, on "My book", that notifies its
        owner when a record enters, unless told otherwise."""
        values = {"name": "Renewal watch", "trigger": "entered", "is_active": True, **fields}
        return Rule.objects.create(
            organisation=cls.org,
            owner=owner or cls.csm,
            segment=segment or cls.book,
            actions=actions or [dict(NOTIFY_ME)],
            **values,
        )

    @classmethod
    def changed(cls, segment, records, change="entered", *, day=None):
        """Change rows, as the segments' nightly step writes them."""
        SegmentChange.objects.bulk_create(
            [
                SegmentChange(
                    segment=segment,
                    record_id=record.pk,
                    change=change,
                    changed_on=day or cls.today,
                )
                for record in records
            ]
        )
