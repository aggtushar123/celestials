"""The admin's "Finish the selected sends" and the demo seed in the new shape."""

from datetime import timedelta
from unittest import mock

from django.contrib import admin
from django.core import mail
from django.core.management import call_command
from django.test import RequestFactory

from services.campaigns.admin import CampaignSendAdmin
from services.campaigns.models import Campaign, CampaignDelivery, CampaignSend
from services.campaigns.tests.fixtures import CampaignFixture
from services.customers.models import Customer
from services.surveys.tests.fixtures import contact


class AdminTests(CampaignFixture):
    def test_finishing_a_cut_off_send(self):
        campaign = self.make_campaign(segment=self.people)
        send = self.make_send(campaign, status="sending", at=self.now - timedelta(hours=1))
        CampaignDelivery.objects.create(send=send, contact=self.ann)
        CampaignDelivery.objects.create(send=send, contact=self.dot, token_hash="t" * 64)
        model_admin = CampaignSendAdmin(CampaignSend, admin.site)
        request = RequestFactory().post("/")
        with mock.patch.object(model_admin, "message_user") as told:
            model_admin.finish_selected(request, CampaignSend.objects.filter(pk=send.pk))
        send.refresh_from_db()
        self.assertEqual(send.status, "sent")
        self.assertEqual(
            self.mail_to(), ["ann@example.com"]
        )  # Dot was mid-send: failed, not re-sent
        self.assertEqual(
            list(send.deliveries.order_by("pk").values_list("status", "reason")),
            [("sent", ""), ("skipped", "failed")],
        )
        told.assert_called_once_with(request, "1 send(s) finished.")


class SeedTests(CampaignFixture):
    def test_the_seed_builds_a_draft_and_a_sent_campaign_without_emailing(self):
        apple = Customer.objects.create(organisation=self.org, name="Apple Inc", owner=self.admin)
        for name in ("Tim", "Jony"):
            contact(apple, name)
        call_command("seed_demo_campaigns", "--org-email", self.admin.email, stdout=mock.Mock())
        call_command("seed_demo_campaigns", "--org-email", self.admin.email, stdout=mock.Mock())
        draft = Campaign.objects.get(name="Q4 Renewal Outreach")
        active = Campaign.objects.get(name="Product Update — September")
        self.assertEqual(
            (draft.status, draft.owner, draft.segment.kind), ("draft", self.admin, "contact")
        )
        self.assertEqual((active.status, active.sends.count()), ("active", 1))
        self.assertEqual(active.sends.get().deliveries.filter(status="sent").count(), 2)
        self.assertEqual(mail.outbox, [])
