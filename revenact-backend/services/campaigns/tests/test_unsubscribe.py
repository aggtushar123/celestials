"""The unsubscribe link (spec §1.6): no sign-in; the token is the
credential, looked up by its hash; every bad link reads the same 404; a
press, not a page load, unsubscribes; idempotent; audited without an actor
or the token; throttled per IP. Surveys are unaffected."""

from datetime import timedelta
from unittest import mock

from django.conf import settings
from django.core.cache import cache
from rest_framework.test import APIClient

from core.models import AuditEvent
from core.throttling import CampaignUnsubscribeThrottle
from services.campaigns.tests.fixtures import CampaignFixture
from services.surveys.tokens import hash_token, new_token

URL = "/api/v1/campaigns/unsubscribe/{}/"
EXPIRED = {"detail": "This link has expired."}


class UnsubscribeFixture(CampaignFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.token, token_hash = new_token()
        send = cls.make_send(cls.make_campaign(segment=cls.people), [cls.ann])
        send.deliveries.update(token_hash=token_hash)
        cls.delivery = send.deliveries.get()

    def get(self, token, **extra):
        return APIClient().get(URL.format(token), **extra)

    def post(self, token, **extra):
        return APIClient().post(URL.format(token), {}, format="json", **extra)


class LinkTests(UnsubscribeFixture):
    def test_a_good_link_names_the_workspace_and_nothing_else(self):
        response = self.get(self.token)
        self.assertEqual((response.status_code, response.data), (200, {"workspace": "Acme Inc"}))
        self.ann.refresh_from_db()
        self.assertIsNone(self.ann.campaigns_unsubscribed_at)  # reading never unsubscribes

    def test_the_press_unsubscribes_once_and_is_audited_without_an_actor(self):
        self.assertEqual(self.post(self.token).status_code, 204)
        self.ann.refresh_from_db()
        when = self.ann.campaigns_unsubscribed_at
        self.assertIsNotNone(when)
        self.assertEqual(self.post(self.token).status_code, 204)
        self.ann.refresh_from_db()
        self.assertEqual(self.ann.campaigns_unsubscribed_at, when)
        event = AuditEvent.objects.get(action="contact.campaigns_unsubscribed")
        self.assertEqual(
            (event.actor, event.target_id, event.target_repr, event.organisation, event.metadata),
            (
                None,
                str(self.ann.pk),
                f"Contact {self.ann.pk}",
                self.org,
                {"via": "link", "send": self.delivery.send_id},
            ),
        )
        self.assertNotIn(self.token, str(event.metadata))
        self.assertEqual(self.get(self.token).data, {"workspace": "Acme Inc"})

    def test_every_bad_link_reads_the_same(self):
        stale = self.make_send(
            self.make_campaign(name="Old", segment=self.people),
            [self.dot],
            at=self.now - timedelta(days=366),
        )
        old_token, old_hash = new_token()
        stale.deliveries.update(token_hash=old_hash)
        queued_token, queued_hash = new_token()
        queued = self.make_send(self.make_campaign(name="Q", segment=self.people), status="sending")
        queued.deliveries.create(contact=self.dot, token_hash=queued_hash)
        for token in ("nope", "x" * 101, old_token, queued_token, hash_token(self.token)):
            response = self.get(token)
            self.assertEqual((response.status_code, response.data), (404, EXPIRED), token[:10])
            self.assertEqual(self.post(token).status_code, 404)
        self.dot.refresh_from_db()
        self.assertIsNone(self.dot.campaigns_unsubscribed_at)

    def test_a_delivery_that_may_have_gone_out_keeps_a_working_link(self):
        # cut off between SMTP and the mark, then resumed as stale: skipped
        # `failed` with its hash kept; the link lives 365 days from the send
        token, token_hash = new_token()
        send = self.make_send(self.make_campaign(name="Cut", segment=self.people), status="sending")
        send.deliveries.create(
            contact=self.dot, status="skipped", reason="failed", token_hash=token_hash
        )
        self.assertEqual(self.get(token).data, {"workspace": "Acme Inc"})
        self.assertEqual(self.post(token).status_code, 204)
        self.dot.refresh_from_db()
        self.assertIsNotNone(self.dot.campaigns_unsubscribed_at)
        send.started_at = self.now - timedelta(days=366)
        send.save(update_fields=["started_at"])
        self.assertEqual(self.get(token).status_code, 404)

    def test_a_signed_in_caller_is_treated_the_same(self):
        client = self.api(self.stranger)
        self.assertEqual(client.get(URL.format(self.token)).data, {"workspace": "Acme Inc"})

    def test_a_signed_in_caller_who_presses_still_records_no_actor(self):
        # Nobody is signed in to a real browser following this link — no
        # cookie, no bearer token, `authentication_classes = []` — but a
        # caller who happens to be signed in elsewhere must not leak into
        # the audit row as the actor; this is a public, token-authenticated
        # action, full stop.
        client = self.api(self.stranger)
        response = client.post(URL.format(self.token), {}, format="json")
        self.assertEqual(response.status_code, 204)
        event = AuditEvent.objects.get(action="contact.campaigns_unsubscribed")
        self.assertIsNone(event.actor)
        self.assertEqual(event.metadata["via"], "link")

    def test_a_signed_in_press_still_records_the_ip(self):
        client = self.api(self.stranger)
        response = client.post(URL.format(self.token), {}, format="json", REMOTE_ADDR="203.0.113.8")
        self.assertEqual(response.status_code, 204)
        event = AuditEvent.objects.get(action="contact.campaigns_unsubscribed")
        self.assertEqual((event.actor, event.ip), (None, "203.0.113.8"))


class ThrottleTests(UnsubscribeFixture):
    def setUp(self):
        cache.clear()

    @mock.patch.object(CampaignUnsubscribeThrottle, "rate", "2/min")
    def test_reads_and_presses_share_one_limit_per_ip(self):
        ip = {"REMOTE_ADDR": "203.0.113.9"}
        self.assertEqual(self.get("nope", **ip).status_code, 404)
        self.assertEqual(self.post("nope", **ip).status_code, 404)
        blocked = self.get(self.token, **ip)
        self.assertEqual(blocked.status_code, 429)
        self.assertIn("Retry-After", blocked)
        self.assertEqual(self.get(self.token, REMOTE_ADDR="198.51.100.1").status_code, 200)

    def test_the_rate_is_30_a_minute(self):
        self.assertEqual(settings.AUTH_THROTTLE_RATES["campaign_unsubscribe"], "30/min")
