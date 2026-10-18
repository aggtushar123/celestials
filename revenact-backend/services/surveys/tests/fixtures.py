"""The surveys tests' shared world, built once per test class
(`setUpTestData`): the segments fixture's people and records, one contact on
each record, and helpers for segments, sends and invites."""

from datetime import timedelta

from django.utils import timezone

from services.customers.models import Account, Contact
from services.segments.models import Segment
from services.segments.tests.fixtures import SegmentFixture
from services.surveys.models import LINK_DAYS, SurveyInvite, SurveySend
from services.surveys.tokens import hash_token, new_token

CHAMPION = Contact.Role.CHAMPION
DECISION_MAKER = Contact.Role.DECISION_MAKER


def contact(parent, name, role=CHAMPION, **fields):
    """A contact on an organisation or an account, `<name>@example.com`."""
    key = "account" if isinstance(parent, Account) else "customer"
    values = {"email": f"{name.lower()}@example.com", **fields}
    return Contact.objects.create(**{key: parent}, name=name, role=role, **values)


class SurveyFixture(SegmentFixture):
    """SegmentFixture's world: Alice (admin) sees everything; Carl owns Pizza
    Hut and Pizza EMEA; Dana owns Taco Bell and Taco West; neither CSM can
    open the other's. Plus one contact on each record: Ann (Pizza Hut,
    champion), Ben (Pizza EMEA, decision maker), Tia (Taco Bell, champion),
    Tom (Taco West, champion)."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.now = timezone.now()
        cls.ann = contact(cls.pizza, "Ann")
        cls.ben = contact(cls.emea, "Ben", DECISION_MAKER)
        cls.tia = contact(cls.taco, "Tia")
        cls.tom = contact(cls.west, "Tom")

    @classmethod
    def pinned(cls, kind, records, *, owner=None, **fields):
        """A segment of exactly `records` (pins, no rules), owned by Carl
        unless `owner` says otherwise."""
        return Segment.objects.create(
            organisation=cls.org,
            owner=owner or cls.csm,
            name=fields.pop("name", "Renewal risk"),
            kind=kind,
            pinned_ids=[record.pk for record in records],
            **fields,
        )

    @classmethod
    def make_send(cls, *, owner=None, segment=None, **fields):
        values = {
            "name": "Q3 NPS",
            "survey_type": "nps",
            "subject": "A quick question",
            "roles": ["champion", "decision_maker"],
            **fields,
        }
        return SurveySend.objects.create(
            organisation=cls.org, owner=owner or cls.csm, segment=segment, **values
        )

    @classmethod
    def make_invite(cls, send, person, *, token=None, created_at=None, **fields):
        """An invite for `person` on their own record. `invite.token` holds
        the secret for the public-link tests; only its hash is stored."""
        token = token or new_token()[0]
        values = {"expires_at": cls.now + timedelta(days=LINK_DAYS), **fields}
        invite = SurveyInvite.objects.create(
            send=send,
            contact=person,
            customer_id=person.customer_id,
            account_id=person.account_id,
            email=person.email,
            token_hash=hash_token(token),
            **values,
        )
        if created_at is not None:
            SurveyInvite.objects.filter(pk=invite.pk).update(created_at=created_at)
            invite.created_at = created_at
        invite.token = token
        return invite

    @classmethod
    def answered(cls, send, person, score, *, days_ago=1, comment=""):
        return cls.make_invite(
            send,
            person,
            status=SurveyInvite.Status.ANSWERED,
            score=score,
            comment=comment,
            answered_at=cls.now - timedelta(days=days_ago),
        )
