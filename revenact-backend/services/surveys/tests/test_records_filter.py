"""A rule's survey reaches only the records it fired on (rules spec §1.3):
`resolve` and `claim` take an optional `records` filter that replaces the
segment's members, still read through the sender's own visibility, with
every skip still applied."""

from services.customers.models import Customer
from services.surveys.audience import resolve
from services.surveys.models import SurveyInvite
from services.surveys.sending import claim
from services.surveys.tests.fixtures import SurveyFixture, contact


class RecordsFilterTests(SurveyFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.dough = Customer.objects.create(organisation=cls.org, name="Dough Co", owner=cls.csm)
        cls.dot = contact(cls.dough, "Dot")
        cls.segment = cls.pinned("customer", [cls.pizza, cls.dough])

    def names(self, audience):
        return [person.name for person in audience.people]

    def resolve(self, segment=None, roles=("champion",), **kwargs):
        return resolve(segment or self.segment, list(roles), self.csm, today=self.today, **kwargs)

    def test_without_records_the_segment_is_the_audience(self):
        self.assertEqual(self.names(self.resolve()), ["Ann", "Dot"])

    def test_records_limit_the_audience(self):
        self.assertEqual(self.names(self.resolve(records=[self.dough.pk])), ["Dot"])

    def test_no_records_is_nobody(self):
        self.assertEqual(self.resolve(records=[]).people, [])

    def test_a_record_the_sender_may_not_open_is_never_reached(self):
        audience = self.resolve(records=[self.taco.pk, self.dough.pk])
        self.assertEqual(self.names(audience), ["Dot"])

    def test_a_record_that_has_left_the_segment_is_still_reached(self):
        only_pizza = self.pinned("customer", [self.pizza], name="Pizza only")
        self.assertEqual(self.names(self.resolve(only_pizza, records=[self.dough.pk])), ["Dot"])

    def test_the_skips_still_apply(self):
        self.make_invite(self.make_send(), self.dot, created_at=self.now)
        audience = self.resolve(records=[self.dough.pk], now=self.now)
        self.assertEqual((audience.people, audience.skipped_recent), ([], 1))

    def test_a_contact_segment_is_limited_to_its_records(self):
        people = self.pinned("contact", [self.ann, self.dot], name="People")
        self.assertEqual(self.names(self.resolve(people, roles=(), records=[self.ann.pk])), ["Ann"])

    def test_the_claim_writes_invites_only_for_the_records(self):
        send = self.make_send(segment=self.segment, roles=["champion"])
        send = claim(send.pk, self.csm, today=self.today, now=self.now, records=[self.dough.pk])
        invited = SurveyInvite.objects.filter(send=send).values_list("contact__name", flat=True)
        self.assertEqual((list(invited), send.counts["audience"]), (["Dot"], 1))
