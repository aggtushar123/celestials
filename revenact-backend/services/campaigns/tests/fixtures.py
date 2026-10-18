"""The campaigns tests' shared world, built once per test class
(`setUpTestData`): the rules fixture (Alice the admin opens everything;
Carl owns Pizza Hut, Pizza EMEA and Dough Co, Dana owns Taco Bell and Taco
West, and neither CSM can open the other's; Gus is another tenant; Ann is
Pizza Hut's champion, Ben Pizza EMEA's decision maker, Dot Dough Co's
champion, Tia and Tom Dana's champions; Carl's segment "My book" pins Pizza
Hut and Dough Co), plus Carl's contact segment "Champions" pinning Ann and
Dot."""

from django.core import mail
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.accounts.models import User
from services.campaigns.models import Campaign, CampaignDelivery, CampaignSend
from services.notifications.models import Notification
from services.rules.tests.fixtures import RuleFixture

SUBJECT = "Hello {first_name}"
BODY = "We miss you at {organisation}.\n{sender_name}"


class CampaignFixture(RuleFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.people = cls.pinned("contact", [cls.ann, cls.dot], name="Champions")

    @classmethod
    def make_campaign(cls, *, owner=None, segment=None, **fields):
        """Carl's draft "Win-back" with a subject and body, on no segment
        unless told otherwise."""
        values = {"name": "Win-back", "subject": SUBJECT, "body": BODY, **fields}
        return Campaign.objects.create(
            organisation=cls.org, owner=owner or cls.csm, segment=segment, **values
        )

    @classmethod
    def make_send(cls, campaign, people=(), *, at=None, status="sent", kind="manual", **fields):
        """A send of `campaign` with one `sent` delivery per person, as if it
        went out at `at` (default: the fixture's `now`)."""
        at = at or cls.now
        send = CampaignSend.objects.create(
            campaign=campaign,
            kind=kind,
            status=status,
            started_at=at,
            finished_at=at if status == "sent" else None,
            subject=campaign.subject,
            body=campaign.body,
            **fields,
        )
        CampaignDelivery.objects.bulk_create(
            [CampaignDelivery(send=send, contact=p, status="sent", sent_at=at) for p in people]
        )
        return send

    def api(self, user):
        client = APIClient()
        client.force_authenticate(User.objects.get(pk=user.pk))
        return client

    def events(self, action):
        rows = AuditEvent.objects.filter(action=action).order_by("pk")
        return list(rows.values_list("target_id", "metadata"))

    def notes(self, kind):
        rows = Notification.objects.filter(kind=kind).order_by("pk")
        return list(rows.values_list("recipient_id", "message", "link"))

    def mail_to(self):
        return [message.to[0] for message in mail.outbox]
