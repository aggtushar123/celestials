# Production image: Daphne (ASGI — HTTP and the multiplayer WebSockets) with
# static files collected for the admin and the API docs. Embeddings come from
# Gemini (EMBEDDINGS_PROVIDER=gemini), so there is no model and no PyTorch in
# the image; the local sentence-transformers provider is a dev dependency.
FROM python:3.13-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Admin + API-docs assets, served by WhiteNoise from inside the image.
RUN SECRET_KEY=build DEBUG=False python manage.py collectstatic --noinput

# SOC2:SEC-05 the server runs as an unprivileged user.
RUN useradd --system --uid 10001 --create-home --home-dir /home/app app \
    && chown -R app:app /app
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/api/v1/health/ || exit 1

# -v 0: at its default verbosity (1), Daphne writes its own NCSA-style
# access log line per request straight to a stream (daphne/access.py),
# bypassing Python's `logging` module — and core.logging.RedactFilter —
# entirely. That would put the raw path, including a live public survey
# link's token (services/surveys/public_views.py), on this container's
# stdout on every request, 200s included. Real errors still reach stdout,
# redacted, through Django's own "django.request" logger either way.
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "-v", "0", "config.asgi:application"]
