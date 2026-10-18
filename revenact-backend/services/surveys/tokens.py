"""The one-time link's secret: 32 random bytes, URL-safe. Only its SHA-256
is stored (`SurveyInvite.token_hash`) and links are looked up by that hash,
so the database never holds a working link (spec §1.1, §3)."""

import hashlib
import secrets


def hash_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_token():
    """(token, its hash). The token goes in the email and nowhere else."""
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)
