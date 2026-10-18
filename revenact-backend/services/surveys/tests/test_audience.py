"""Who a survey reaches: the segment's members as the builder sees them,
the contacts with a ticked role (at most three per organisation or
account), and the skips, counted and never named."""

from datetime import timedelta

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.accounts.models import User
from services.customers.models import Contact, Customer
from services.customers.tests.test_views import blind_to_one_account
from services.surveys.audience import resolve
from services.surveys.tests.fixtures import DECISION_MAKER, SurveyFixture, contact

BOTH = ["champion", "decision_maker"]


def names(audience):
    return [person.name for person in audience.people]


class AudienceTests(SurveyFixture):
    def reach(self, kind, records, roles=BOTH, viewer=None):
        viewer = viewer or self.csm
        segment = self.pinned(kind, records, owner=viewer)
        return resolve(segment, roles, viewer, today=self.today, now=self.now)

    def test_an_organisation_reaches_its_own_and_its_accounts_people(self):
        audience = self.reach("customer", [self.pizza])
        self.assertEqual(names(audience), ["Ann", "Ben"])
        self.assertEqual(audience.organisations, 2)

    def test_only_the_ticked_roles(self):
        self.assertEqual(names(self.reach("customer", [self.pizza], ["decision_maker"])), ["Ben"])

    def test_an_account_reaches_only_its_own_people(self):
        self.assertEqual(names(self.reach("account", [self.emea])), ["Ben"])

    def test_a_contact_segment_is_its_people_whatever_their_role(self):
        oli = contact(self.pizza, "Oli", Contact.Role.OTHER)
        self.assertEqual(names(self.reach("contact", [self.ann, oli], roles=[])), ["Ann", "Oli"])

    def test_only_records_the_builder_may_open(self):
        # Carl's segments pin Taco Bell and Tia too, but he cannot open them.
        self.assertEqual(names(self.reach("customer", [self.pizza, self.taco])), ["Ann", "Ben"])
        self.assertEqual(names(self.reach("contact", [self.ann, self.tia], roles=[])), ["Ann"])
        everyone = self.reach("customer", [self.pizza, self.taco], viewer=self.admin)
        self.assertEqual(names(everyone), ["Ann", "Tia", "Tom", "Ben"])

    def test_at_most_three_per_record_in_the_order_ticked_then_by_name(self):
        for name in ("Dan", "Cat", "Fay"):
            contact(self.pizza, name)
        contact(self.pizza, "Zed", DECISION_MAKER)
        audience = self.reach("customer", [self.pizza], ["decision_maker", "champion"])
        # Decision makers first (Ben on Pizza EMEA, Zed on Pizza Hut), then the
        # champions by name until Pizza Hut has three: Zed, Ann, Cat.
        self.assertEqual(names(audience), ["Ben", "Zed", "Ann", "Cat"])
        self.assertEqual(audience.skipped_cap, 2)

    def test_the_cap_does_not_apply_to_a_contact_segment(self):
        extra = [contact(self.pizza, name) for name in ("Cat", "Dan", "Fay")]
        audience = self.reach("contact", [self.ann, *extra], roles=[])
        self.assertEqual((len(audience.people), audience.skipped_cap), (4, 0))

    def test_anyone_asked_in_the_last_30_days_is_skipped(self):
        earlier = self.make_send(owner=self.admin)
        self.make_invite(earlier, self.ann, created_at=self.now - timedelta(days=29))
        self.make_invite(earlier, self.ben, created_at=self.now - timedelta(days=31))
        audience = self.reach("customer", [self.pizza])
        self.assertEqual((names(audience), audience.skipped_recent), (["Ben"], 1))

    def test_an_answered_invite_counts_as_asked(self):
        self.answered(self.make_send(owner=self.admin), self.ann, 9, days_ago=5)
        self.assertEqual(names(self.reach("customer", [self.pizza])), ["Ben"])

    def test_a_failed_invite_does_not_count_as_asked(self):
        earlier = self.make_send(owner=self.admin)
        self.make_invite(
            earlier,
            self.ann,
            status="failed",
            failure="bounced",
            created_at=self.now - timedelta(days=2),
        )
        self.assertEqual(names(self.reach("customer", [self.pizza])), ["Ann", "Ben"])

    def test_no_email_is_skipped_and_counted(self):
        contact(self.pizza, "Nia", email="")
        contact(self.pizza, "Noe", email="   ")
        audience = self.reach("customer", [self.pizza])
        self.assertEqual((names(audience), audience.skipped_no_email), (["Ann", "Ben"], 2))

    def test_inactive_people_are_left_out_and_not_counted(self):
        contact(self.pizza, "Ivy", status=Contact.Status.INACTIVE)
        self.assertEqual(
            self.reach("customer", [self.pizza]).counts(),
            {
                "audience": 2,
                "organisations": 2,
                "skipped_recent": 0,
                "skipped_no_email": 0,
                "skipped_cap": 0,
                "hidden_count": 0,
            },
        )

    def test_skips_come_before_the_cap(self):
        for name in ("Cat", "Dan", "Fay"):
            contact(self.pizza, name)
        self.make_invite(
            self.make_send(owner=self.admin), self.ann, created_at=self.now - timedelta(days=1)
        )
        audience = self.reach("customer", [self.pizza], ["champion"])
        self.assertEqual(names(audience), ["Cat", "Dan", "Fay"])
        self.assertEqual((audience.skipped_recent, audience.skipped_cap), (1, 0))

    def test_a_person_on_an_account_of_two_members_is_asked_once(self):
        self.emea.customers.add(self.taco)
        audience = self.reach("customer", [self.pizza, self.taco], viewer=self.admin)
        self.assertEqual(names(audience).count("Ben"), 1)

    def test_an_empty_segment_reaches_nobody(self):
        audience = self.reach("customer", [])
        self.assertEqual((audience.people, audience.organisations), ([], 0))


class HiddenPeopleTests(SurveyFixture):
    """Burger Barn: the builder opens it through the account they own
    (Seen); a colleague owns it and its other account (Hidden)."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.burger = Customer.objects.create(organisation=cls.org, name="Burger Barn")
        cls.viewer, cls.seen, cls.hidden = blind_to_one_account(cls.burger)
        contact(cls.burger, "Olga")
        contact(cls.seen, "Sid")
        contact(cls.hidden, "Hal")
        contact(cls.hidden, "Hil", Contact.Role.OTHER)

    def test_people_the_builder_cannot_open_are_a_count(self):
        segment = self.pinned("customer", [self.burger], owner=self.viewer)
        audience = resolve(segment, ["champion"], self.viewer, today=self.today, now=self.now)
        self.assertEqual(names(audience), ["Olga", "Sid"])
        # Hal is hidden; Hil is hidden too but has no ticked role, so is not counted.
        self.assertEqual(audience.hidden_count, 1)


class AudienceQueryTests(SurveyFixture):
    """`resolve` reads in a fixed number of queries, however many people."""

    def queries(self, kind, size):
        people = Contact.objects.bulk_create(
            Contact(customer=self.pizza, name=f"P{i}", email=f"p{i}@example.com", role="champion")
            for i in range(size)
        )
        segment = self.pinned(kind, [self.pizza] if kind == "customer" else people)
        viewer = User.objects.get(pk=self.csm.pk)  # fresh, as each request loads it
        with CaptureQueriesContext(connection) as ctx:
            resolve(segment, BOTH, viewer, today=self.today, now=self.now)
        Contact.objects.filter(pk__in=[person.pk for person in people]).delete()
        return len(ctx.captured_queries)

    def test_an_organisation_segment_reads_in_a_fixed_number_of_queries(self):
        # the viewer's workspace, membership, role and reports (once per
        # request), the hidden count, the people, who was asked in 30 days
        self.assertEqual((self.queries("customer", 3), self.queries("customer", 30)), (7, 7))

    def test_a_contact_segment_reads_in_a_fixed_number_of_queries(self):
        # the viewer's workspace, membership, role and reports, the people,
        # who was asked in 30 days
        self.assertEqual((self.queries("contact", 3), self.queries("contact", 30)), (6, 6))
