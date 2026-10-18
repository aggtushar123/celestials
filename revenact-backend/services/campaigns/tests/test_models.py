"""Unit tier: the tables, their defaults and constraints, and the two
fields other apps gain. No HTTP."""

from django.db import IntegrityError, transaction

from services.campaigns.models import (
    DEFAULT_ROLES,
    Campaign,
    CampaignDelivery,
    CampaignSend,
    SkipReason,
    empty_counts,
)
from services.campaigns.tests.fixtures import CampaignFixture
from services.notifications.models import Notification


class CampaignModelTests(CampaignFixture):
    def test_a_new_campaign_is_a_private_draft_with_the_default_roles(self):
        campaign = self.make_campaign()
        self.assertEqual(
            (campaign.status, campaign.sharing, campaign.roles, campaign.segment),
            ("draft", "private", list(DEFAULT_ROLES), None),
        )
        self.assertEqual(DEFAULT_ROLES, ("champion", "decision_maker"))

    def test_strings_name_the_row_by_id_only(self):
        campaign = self.make_campaign(name="Secret plan")
        send = self.make_send(campaign, [self.ann])
        delivery = send.deliveries.get()
        self.assertEqual(str(campaign), f"Campaign {campaign.pk}")
        self.assertEqual(str(send), f"Campaign send {send.pk}")
        self.assertEqual(str(delivery), f"Campaign delivery {delivery.pk}")

    def test_the_related_names(self):
        campaign = self.make_campaign(segment=self.people)
        send = self.make_send(campaign, [self.ann])
        self.assertEqual(list(self.csm.campaigns.all()), [campaign])
        self.assertEqual(list(self.people.campaigns.all()), [campaign])
        self.assertEqual(list(campaign.sends.all()), [send])
        self.assertEqual(self.ann.campaign_deliveries.get().send, send)

    def test_counts_start_empty_with_all_six_reasons(self):
        self.assertEqual(
            empty_counts(),
            {
                "reached": 0,
                "sent": 0,
                "skipped": {
                    "unsubscribed": 0,
                    "no_email": 0,
                    "already_received": 0,
                    "recent_campaign": 0,
                    "over_limit": 0,
                    "failed": 0,
                },
            },
        )
        send = CampaignSend.objects.create(
            campaign=self.make_campaign(), kind="manual", started_at=self.now
        )
        self.assertEqual(
            (send.status, send.counts, send.migrated), ("sending", empty_counts(), False)
        )
        self.assertEqual(len(SkipReason.values), 6)

    def test_one_delivery_per_send_and_contact(self):
        send = self.make_send(self.make_campaign(), [self.ann])
        with self.assertRaises(IntegrityError), transaction.atomic():
            CampaignDelivery.objects.create(send=send, contact=self.ann)

    def test_a_token_hash_is_unique_but_many_may_be_blank(self):
        send = self.make_send(self.make_campaign())
        CampaignDelivery.objects.create(send=send, contact=self.ann)
        CampaignDelivery.objects.create(send=send, contact=self.dot)
        CampaignDelivery.objects.filter(contact=self.ann).update(token_hash="a" * 64)
        with self.assertRaises(IntegrityError), transaction.atomic():
            CampaignDelivery.objects.filter(contact=self.dot).update(token_hash="a" * 64)

    def test_a_reason_only_on_a_skipped_delivery(self):
        send = self.make_send(self.make_campaign())
        CampaignDelivery.objects.create(
            send=send, contact=self.ann, status="skipped", reason="no_email"
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            CampaignDelivery.objects.create(
                send=send, contact=self.dot, status="sent", reason="failed"
            )

    def test_deleting_a_contact_deletes_its_deliveries_not_the_send(self):
        send = self.make_send(self.make_campaign(), [self.ann, self.dot])
        self.ann.delete()
        self.assertEqual(list(send.deliveries.values_list("contact", flat=True)), [self.dot.pk])

    def test_a_contact_starts_subscribed(self):
        self.ann.refresh_from_db()
        self.assertIsNone(self.ann.campaigns_unsubscribed_at)

    def test_the_new_notification_kind(self):
        self.assertEqual(Notification.Kind.CAMPAIGN_SENT, "campaign_sent")
        self.assertEqual(Notification.Kind.CAMPAIGN_SENT.label, "Campaign sent")

    def test_newest_edit_first(self):
        older = self.make_campaign(name="Older")
        newer = self.make_campaign(name="Newer")
        self.assertEqual(list(Campaign.objects.filter(pk__in=[older.pk, newer.pk])), [newer, older])
