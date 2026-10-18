"""Stored embeddings (services/copilot/embeddings.py): a text is sent to the
model once per workspace and read back after that; Copilot ranks with
pgvector's cosine distance in Postgres; workspaces never share vectors;
unused vectors are pruned; thresholds follow the provider's scale; the
Gemini provider batches and normalises."""

from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings
from django.utils import timezone

from services.accounts.models import Organisation, User
from services.copilot import embeddings
from services.copilot.models import TextEmbedding
from services.customers.models import Account, Customer

#: Fixed unit vectors per text, so ranking is predictable.
AXES = {
    "ride sharing": [1.0, 0.0, 0.0],
    "Uber": [0.96, 0.28, 0.0],
    "Spotify": [0.0, 1.0, 0.0],
    "Zoom": [0.0, 0.0, 1.0],
}


def fake_compute(texts, task="similarity"):
    fake_compute.calls.append(list(texts))
    return [AXES.get(text, [0.577, 0.577, 0.577]) for text in texts]


class StoreTests(TestCase):
    def setUp(self):
        fake_compute.calls = []
        patcher = patch.object(embeddings, "_compute", side_effect=fake_compute)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.org = Organisation.objects.create(name="Alfee")
        self.other = Organisation.objects.create(name="Acme")

    def test_a_text_is_sent_to_the_model_once_and_read_back_after(self):
        first = embeddings.embed(["Uber", "Zoom"], organisation=self.org)
        again = embeddings.embed(["Zoom", "Uber", "Spotify"], organisation=self.org)

        self.assertEqual(fake_compute.calls, [["Uber", "Zoom"], ["Spotify"]])
        self.assertEqual(again[0], first[1])
        self.assertEqual(TextEmbedding.objects.filter(organisation=self.org).count(), 3)

    def test_only_a_hash_of_the_text_is_stored(self):
        embeddings.embed(["Uber"], organisation=self.org)
        row = TextEmbedding.objects.get()
        self.assertEqual(len(row.text_hash), 64)
        self.assertNotIn("Uber", row.text_hash)

    def test_workspaces_never_share_vectors(self):
        embeddings.embed(["Uber"], organisation=self.org)
        embeddings.embed(["Uber"], organisation=self.other)

        self.assertEqual(fake_compute.calls, [["Uber"], ["Uber"]])
        self.assertEqual(TextEmbedding.objects.count(), 2)

    def test_ranking_is_pgvector_cosine_distance_best_first(self):
        ranked = embeddings.rank_by_similarity(
            "ride sharing", ["Spotify", "Uber", "Zoom"], organisation=self.org
        )

        self.assertEqual([index for index, _ in ranked], [1, 0, 2])
        self.assertAlmostEqual(ranked[0][1], 0.96, places=4)
        self.assertAlmostEqual(ranked[1][1], 0.0, places=4)

    def test_duplicate_candidates_each_get_a_score(self):
        ranked = embeddings.rank_by_similarity(
            "ride sharing", ["Uber", "Uber"], organisation=self.org
        )
        self.assertEqual(sorted(index for index, _ in ranked), [0, 1])

    def test_without_a_workspace_nothing_is_stored(self):
        ranked = embeddings.rank_by_similarity("ride sharing", ["Spotify", "Uber"])
        self.assertEqual(ranked[0][0], 1)
        self.assertFalse(TextEmbedding.objects.exists())

    def test_a_customer_or_an_account_stands_for_its_workspace(self):
        owner = User.objects.create_user(
            email="faiz@alfee.io", password="pw-123456789", organisation=self.org
        )
        customer = Customer.objects.create(organisation=self.org, name="Uber", owner=owner)
        account = Account.objects.create(name="Uber Eats")
        account.customers.add(customer)

        embeddings.embed(["Uber"], organisation=customer)
        embeddings.embed(["Zoom"], organisation=account)

        self.assertEqual(
            set(TextEmbedding.objects.values_list("organisation_id", flat=True)), {self.org.pk}
        )

    def test_unused_vectors_are_pruned(self):
        embeddings.embed(["Uber", "Zoom"], organisation=self.org)
        old = timezone.now() - timedelta(days=31)
        TextEmbedding.objects.filter(text_hash=embeddings._hash("Uber")).update(last_used_at=old)

        self.assertEqual(embeddings.prune_unused(), 1)
        self.assertEqual(TextEmbedding.objects.count(), 1)

    def test_reading_a_vector_back_marks_it_used(self):
        embeddings.embed(["Uber"], organisation=self.org)
        old = timezone.now() - timedelta(days=31)
        TextEmbedding.objects.update(last_used_at=old)

        embeddings.embed(["Uber"], organisation=self.org)
        self.assertEqual(embeddings.prune_unused(), 0)


class ThresholdTests(TestCase):
    @override_settings(EMBEDDINGS_PROVIDER="local")
    def test_the_local_model_uses_the_written_threshold(self):
        self.assertEqual(embeddings.threshold(0.6), 0.6)

    @override_settings(EMBEDDINGS_PROVIDER="gemini")
    def test_gemini_maps_through_the_measured_anchor_points(self):
        self.assertAlmostEqual(embeddings.threshold(0.032), 0.702)
        self.assertAlmostEqual(embeddings.threshold(0.527), 0.892)
        self.assertAlmostEqual(embeddings.threshold(0.144, "retrieval"), 0.583)
        self.assertAlmostEqual(embeddings.threshold(0.426, "retrieval"), 0.628)
        self.assertLessEqual(embeddings.threshold(5.0), 1.0)


@override_settings(
    EMBEDDINGS_PROVIDER="gemini",
    GOOGLE_CLOUD_PROJECT="revenact-test",
    EMBEDDINGS_MODEL="gemini-embedding-001",
    EMBEDDINGS_DIMENSIONS=768,
)
class GeminiProviderTests(TestCase):
    def test_batches_requests_and_normalises_vectors(self):
        client = MagicMock()
        client.models.embed_content.side_effect = lambda model, contents, config: SimpleNamespace(
            embeddings=[SimpleNamespace(values=[3.0, 4.0]) for _ in contents]
        )
        with patch.object(embeddings, "_gemini_client", return_value=client):
            vectors = embeddings.embed([f"text {i}" for i in range(150)], task="query")

        self.assertEqual(client.models.embed_content.call_count, 2)
        first_call = client.models.embed_content.call_args_list[0].kwargs
        self.assertEqual(len(first_call["contents"]), embeddings.GEMINI_BATCH)
        self.assertEqual(first_call["config"].task_type, "RETRIEVAL_QUERY")
        self.assertEqual(first_call["config"].output_dimensionality, 768)
        self.assertEqual(vectors[0], [0.6, 0.8])

    def test_query_and_document_vectors_are_stored_apart(self):
        org = Organisation.objects.create(name="Alfee")
        client = MagicMock()
        client.models.embed_content.side_effect = lambda model, contents, config: SimpleNamespace(
            embeddings=[SimpleNamespace(values=[1.0, 0.0]) for _ in contents]
        )
        with patch.object(embeddings, "_gemini_client", return_value=client):
            embeddings.embed(["Uber"], organisation=org, task="query")
            embeddings.embed(["Uber"], organisation=org, task="document")

        self.assertEqual(
            sorted(TextEmbedding.objects.values_list("model", flat=True)),
            ["gemini-embedding-001@768:document", "gemini-embedding-001@768:query"],
        )
