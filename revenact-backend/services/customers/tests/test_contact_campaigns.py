"""A contact's campaign opt-out on the existing contact routes (campaigns
spec §1.6, contract note 1): every contact payload carries
`campaigns_unsubscribed_at`; `PATCH contacts/:id/ {campaigns_unsubscribed:
false}` re-subscribes, audited; only the person may unsubscribe."""

from core.models import AuditEvent
from services.campaigns import validation as say
from services.campaigns.tests.fixtures import CampaignFixture


class ContactOptOutTests(CampaignFixture):
    def setUp(self):
        self.ann.campaigns_unsubscribed_at = self.now
        self.ann.save(update_fields=["campaigns_unsubscribed_at"])

    def patch(self, user, **body):
        return self.api(user).patch(f"/api/v1/contacts/{self.ann.pk}/", body, format="json")

    def test_every_contact_payload_carries_it(self):
        detail = self.api(self.csm).get(f"/api/v1/contacts/{self.ann.pk}/").data
        # DRF writes UTC as "Z" (TIME_ZONE is UTC)
        self.assertEqual(
            detail["campaigns_unsubscribed_at"], self.now.isoformat().replace("+00:00", "Z")
        )
        rows = self.api(self.csm).get(f"/api/v1/customers/{self.pizza.pk}/contacts/").data
        self.assertIn("campaigns_unsubscribed_at", rows[0])
        self.assertNotIn("campaigns_unsubscribed", rows[0])

    def test_anyone_who_may_open_it_re_subscribes_and_it_is_audited(self):
        response = self.patch(self.admin, campaigns_unsubscribed=False)
        self.assertEqual(
            (response.status_code, response.data["campaigns_unsubscribed_at"]), (200, None)
        )
        self.ann.refresh_from_db()
        self.assertIsNone(self.ann.campaigns_unsubscribed_at)
        self.assertEqual(self.events("contact.campaigns_resubscribed"), [(str(self.ann.pk), {})])
        self.assertEqual(
            AuditEvent.objects.get(action="contact.campaigns_resubscribed").target_repr,
            f"Contact {self.ann.pk}",
        )

    def test_re_subscribing_a_subscribed_contact_is_not_audited(self):
        self.patch(self.csm, campaigns_unsubscribed=False)
        self.patch(self.csm, campaigns_unsubscribed=False)
        self.assertEqual(len(self.events("contact.campaigns_resubscribed")), 1)

    def test_only_the_person_unsubscribes(self):
        response = self.patch(self.csm, campaigns_unsubscribed=True)
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"campaigns_unsubscribed": [say.ONLY_THE_PERSON]}),
        )

    def test_someone_who_may_not_open_it_gets_404(self):
        self.assertEqual(self.patch(self.other, campaigns_unsubscribed=False).status_code, 404)
        self.ann.refresh_from_db()
        self.assertIsNotNone(self.ann.campaigns_unsubscribed_at)

    def test_other_edits_leave_it_alone(self):
        self.patch(self.csm, phone="123")
        self.ann.refresh_from_db()
        self.assertIsNotNone(self.ann.campaigns_unsubscribed_at)
