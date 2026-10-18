"""A contact keeps the sentiment it replaced, and when (Brain delivery 4
spec §1.1): set wherever `sentiment` changes value, by a recompute or by
hand, and never on a recompute that leaves it the same."""

from django.utils import timezone

from services.customers import contact_sentiment
from services.customers.models import Contact
from services.customers.tests.test_contact_sentiment import Fixture


class SentimentChangeTests(Fixture):
    def kept(self, contact):
        contact.refresh_from_db()
        return contact.previous_sentiment, contact.sentiment_changed_at

    def test_a_recompute_that_changes_the_value_keeps_the_old_one(self):
        self.call("negative", participants=[self.sam])
        before = timezone.now()
        self.assertEqual(contact_sentiment.recompute(self.sam), "negative")
        previous, changed_at = self.kept(self.sam)
        self.assertEqual(previous, "neutral")
        self.assertGreaterEqual(changed_at, before)

    def test_a_recompute_that_leaves_it_the_same_records_nothing(self):
        self.call("neutral", participants=[self.sam])
        self.assertEqual(contact_sentiment.recompute(self.sam), "neutral")
        self.assertEqual(self.kept(self.sam), ("", None))

    def test_the_latest_change_wins_and_a_steady_recompute_keeps_its_time(self):
        self.call("negative", participants=[self.sam])
        contact_sentiment.recompute(self.sam)
        for _ in range(3):
            self.call("positive", participants=[self.sam])
        self.assertEqual(contact_sentiment.recompute(self.sam), "positive")
        previous, changed_at = self.kept(self.sam)
        self.assertEqual(previous, "negative")
        contact_sentiment.recompute(self.sam)
        self.assertEqual(self.kept(self.sam), ("negative", changed_at))

    def test_note_change_returns_only_what_to_save(self):
        now = timezone.now()
        self.assertEqual(contact_sentiment.note_change(self.sam, "neutral", now), ["sentiment"])
        self.assertEqual(self.sam.previous_sentiment, "")
        self.assertEqual(
            contact_sentiment.note_change(self.sam, "negative", now),
            ["sentiment", "previous_sentiment", "sentiment_changed_at"],
        )
        self.assertEqual(
            (self.sam.sentiment, self.sam.previous_sentiment, self.sam.sentiment_changed_at),
            ("negative", "neutral", now),
        )

    def test_a_hand_edit_that_changes_it_is_kept(self):
        self.client.force_authenticate(self.carl)
        response = self.client.patch(
            f"/api/v1/contacts/{self.uma.id}/", {"sentiment": "negative"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        previous, changed_at = self.kept(self.uma)
        self.assertEqual(previous, "positive")
        self.assertIsNotNone(changed_at)
        self.assertNotIn("previous_sentiment", response.data)

    def test_a_hand_edit_to_the_same_value_or_another_field_records_nothing(self):
        self.client.force_authenticate(self.carl)
        path = f"/api/v1/contacts/{self.uma.id}/"
        self.client.patch(path, {"sentiment": "positive"}, format="json")
        self.client.patch(path, {"name": "Uma H."}, format="json")
        self.assertEqual(self.kept(self.uma), ("", None))

    def test_a_new_contact_has_no_change(self):
        fresh = Contact.objects.create(
            customer=self.pizza, name="Nia New", email="nia@pizzahut.com", sentiment="negative"
        )
        self.assertEqual(self.kept(fresh), ("", None))
