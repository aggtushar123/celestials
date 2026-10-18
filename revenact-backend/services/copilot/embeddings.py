"""Text embeddings, stored in Postgres with pgvector.

Two providers (settings.EMBEDDINGS_PROVIDER):
- "gemini": Vertex AI `gemini-embedding-001` at EMBEDDINGS_DIMENSIONS (768),
  with the runtime's own Google credentials (no API key). The production
  choice on Cloud Run: no model in the image, nothing to load at start-up.
- "local": sentence-transformers `all-MiniLM-L6-v2` (384 dimensions) on this
  machine, for development without Google credentials. The package is a dev
  dependency only (requirements-dev.txt); it loads lazily at first use, or at
  ASGI start-up with EMBEDDINGS_PRELOAD.

Either way every vector is unit length, so cosine similarity is a dot
product. With a workspace (`organisation=`), embed() stores each text's
vector in `TextEmbedding` keyed by the SHA-256 of the text, so a text is sent
to the model once and read back after that, and rank_by_similarity() ranks
with pgvector's cosine distance in Postgres. Without one, vectors are made
and returned without being stored (tests, one-off scripts).

Vectors are confidential like the text they came from: rows are scoped to
the workspace (SOC2:DATA-08) and pruned when unused (prune_unused, nightly,
SOC2:DATA-04). Only the hash of the text is stored, never the text."""

import functools
import hashlib
import logging
import math
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

#: gemini-embedding-001 takes up to 250 inputs per request; stay well under.
GEMINI_BATCH = 100

_local_model = None


#: Gemini embeds a text differently for each use. "similarity" compares
#: texts with each other (clustering, matching); "query" and "document" are
#: the two sides of a search (Copilot ranking), which separated real
#: references from generic questions about 3x better in calibration.
GEMINI_TASKS = {
    "similarity": "SEMANTIC_SIMILARITY",
    "query": "RETRIEVAL_QUERY",
    "document": "RETRIEVAL_DOCUMENT",
}

#: Every threshold in the code is written on the local model's scale (and a
#: scenario's own conditionThreshold is set by people on that scale), so it
#: is mapped to the provider's scale, linearly between two measured anchor
#: points: (local, gemini) for the highest unrelated score and the lowest
#: related one. Measured 2026-10-16 on Vertex gemini-embedding-001 @768:
#: - similarity: unrelated report pairs <= 0.032 / 0.702, paraphrased
#:   reports >= 0.527 / 0.892;
#: - retrieval (query vs company profile): generic questions <= 0.144 /
#:   0.583, real brand references >= 0.426 / 0.628. The Gemini margin here
#:   is narrow; Copilot's tool-using retrieval does not lean on it.
CALIBRATION = {
    "similarity": ((0.032, 0.702), (0.527, 0.892)),
    "retrieval": ((0.144, 0.583), (0.426, 0.628)),
}


def threshold(local_value: float, kind: str = "similarity") -> float:
    """`local_value` (a threshold on the local model's scale) on the active
    provider's scale."""

    if settings.EMBEDDINGS_PROVIDER != "gemini":
        return local_value
    (local_low, gemini_low), (local_high, gemini_high) = CALIBRATION[kind]
    mapped = gemini_low + (local_value - local_low) * (gemini_high - gemini_low) / (
        local_high - local_low
    )
    return max(-1.0, min(1.0, mapped))


def _model_name(task: str = "similarity") -> str:
    if settings.EMBEDDINGS_PROVIDER == "gemini":
        return f"{settings.EMBEDDINGS_MODEL}@{settings.EMBEDDINGS_DIMENSIONS}:{task}"
    return "all-MiniLM-L6-v2"


def _normalise(vector) -> list[float]:
    values = [float(x) for x in vector]
    norm = math.sqrt(sum(x * x for x in values)) or 1.0
    return [x / norm for x in values]


@functools.lru_cache(maxsize=1)
def _gemini_client(project, location):
    from google import genai

    return genai.Client(vertexai=True, project=project, location=location)


def _compute_gemini(texts: list[str], task: str) -> list[list[float]]:
    from google.genai import types

    client = _gemini_client(settings.GOOGLE_CLOUD_PROJECT, settings.EMBEDDINGS_LOCATION)
    config = types.EmbedContentConfig(
        task_type=GEMINI_TASKS[task],
        output_dimensionality=settings.EMBEDDINGS_DIMENSIONS,
    )
    vectors = []
    for start in range(0, len(texts), GEMINI_BATCH):
        batch = texts[start : start + GEMINI_BATCH]
        response = client.models.embed_content(
            model=settings.EMBEDDINGS_MODEL, contents=batch, config=config
        )
        # Below the full 3072 dimensions Gemini's vectors are not unit length.
        vectors += [_normalise(item.values) for item in response.embeddings]
    return vectors


def _compute_local(texts: list[str]) -> list[list[float]]:
    global _local_model
    if _local_model is None:
        from sentence_transformers import SentenceTransformer

        _local_model = SentenceTransformer("all-MiniLM-L6-v2")
    return [v.tolist() for v in _local_model.encode(list(texts), normalize_embeddings=True)]


def _compute(texts: list[str], task: str = "similarity") -> list[list[float]]:
    if settings.EMBEDDINGS_PROVIDER == "gemini":
        return _compute_gemini(texts, task)
    return _compute_local(texts)


def _organisation_id(scope) -> int | None:
    """The workspace of `scope`: an Organisation id or Organisation, a
    record with `organisation_id` (Customer), or an Account (through its
    customers, else its owner). Resolved only when vectors are actually
    needed, so a caller can pass the company it already holds."""

    from services.accounts.models import Organisation

    if scope is None or isinstance(scope, int):
        return scope
    if isinstance(scope, Organisation):
        return scope.pk
    if hasattr(scope, "organisation_id"):
        return scope.organisation_id
    if hasattr(scope, "customers"):  # an Account
        found = scope.customers.values_list("organisation_id", flat=True).first()
        if found is None and getattr(scope, "owner_id", None):
            found = scope.owner.organisation_id
        return found
    return None


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def warm():
    """Run the model once so the first real request pays nothing
    (config/asgi.py, when settings.EMBEDDINGS_PRELOAD). For Gemini this only
    sets up the client: no model call at start-up."""

    if settings.EMBEDDINGS_PROVIDER == "gemini":
        _gemini_client(settings.GOOGLE_CLOUD_PROJECT, settings.EMBEDDINGS_LOCATION)
        return
    embed(["warm up"])


def embed(texts: list[str], organisation=None, task: str = "similarity") -> list[list[float]]:
    """Unit-length vectors for `texts`, in order (`task`: see GEMINI_TASKS).
    With `organisation` (see _organisation_id), read from and written to
    TextEmbedding: only texts not stored yet go to the model."""

    if not texts:
        return []
    organisation = _organisation_id(organisation)
    if organisation is None:
        return _compute(list(texts), task)

    from .models import TextEmbedding

    model = _model_name(task)
    hashes = [_hash(text) for text in texts]
    # SOC2:DATA-08 vectors are read and written only within this workspace
    rows = TextEmbedding.objects.filter(
        organisation_id=organisation, model=model, text_hash__in=set(hashes)
    )
    stored = {row.text_hash: [float(x) for x in row.vector] for row in rows}

    missing = {}
    for text, text_hash in zip(texts, hashes):
        if text_hash not in stored and text_hash not in missing:
            missing[text_hash] = text
    if missing:
        vectors = _compute(list(missing.values()), task)
        TextEmbedding.objects.bulk_create(
            [
                TextEmbedding(organisation_id=organisation, model=model, text_hash=h, vector=v)
                for h, v in zip(missing, vectors)
            ],
            ignore_conflicts=True,  # a concurrent request stored it first
        )
        stored.update(zip(missing, vectors))
    if len(stored) > len(missing):
        TextEmbedding.objects.filter(
            organisation_id=organisation, model=model, text_hash__in=set(hashes) - set(missing)
        ).update(last_used_at=timezone.now())
    return [stored[h] for h in hashes]


def rank_by_similarity(
    query: str, candidates: list[str], organisation=None
) -> list[tuple[int, float]]:
    """Every index into `candidates` with its cosine similarity to `query`,
    best first. With `organisation`, the vectors are stored and the ranking
    is pgvector's cosine distance in Postgres; without, it is computed here.
    The caller decides how many to keep and what counts as relevant."""

    if not candidates:
        return []
    organisation = _organisation_id(organisation)
    if organisation is None:
        query_vector = embed([query], task="query")[0]
        scored = [
            (i, sum(q * c for q, c in zip(query_vector, vector)))
            for i, vector in enumerate(embed(candidates, task="document"))
        ]
        scored.sort(key=lambda pair: pair[1], reverse=True)
        return scored

    from pgvector.django import CosineDistance

    from .models import TextEmbedding

    query_vector = embed([query], organisation=organisation, task="query")[0]
    embed(candidates, organisation=organisation, task="document")
    hashes = [_hash(text) for text in candidates]
    distance = dict(
        TextEmbedding.objects.filter(
            organisation_id=organisation, model=_model_name("document"), text_hash__in=set(hashes)
        )
        .annotate(distance=CosineDistance("vector", query_vector))
        .values_list("text_hash", "distance")
    )
    scored = [(i, 1.0 - distance[h]) for i, h in enumerate(hashes) if h in distance]
    scored.sort(key=lambda pair: pair[1], reverse=True)
    return scored


def prune_unused(now=None) -> int:
    """Delete stored vectors not used for EMBEDDING_RETENTION_DAYS
    (SOC2:DATA-04; nightly). Returns how many."""

    from .models import TextEmbedding

    # SOC2:DATA-04 derived vectors are kept only while something uses them
    cutoff = (now or timezone.now()) - timedelta(days=settings.EMBEDDING_RETENTION_DAYS)
    deleted, _ = TextEmbedding.objects.filter(last_used_at__lt=cutoff).delete()
    return deleted
