"""Opaque cursors: base64 of a JSON list. A malformed, tampered or naive one
reads as the first page (as `plans.listing`)."""

import json
from base64 import urlsafe_b64decode, urlsafe_b64encode
from datetime import datetime


def encode(*values):
    raw = json.dumps([v.isoformat() if isinstance(v, datetime) else v for v in values])
    return urlsafe_b64encode(raw.encode()).decode()


def _load(cursor):
    return json.loads(urlsafe_b64decode(cursor.encode()))


def decode_after(cursor):
    """(an aware datetime, an id) after which the next page starts, or None."""
    if not cursor:
        return None
    try:
        at, pk = _load(cursor)
        at, pk = datetime.fromisoformat(at), int(pk)
    except (OverflowError, ValueError, TypeError):
        return None
    if at.tzinfo is None:
        return None
    return at, pk


def decode_id(cursor):
    """The id after which the next page starts, or None."""
    if not cursor:
        return None
    try:
        (pk,) = _load(cursor)
        return int(pk)
    except (OverflowError, ValueError, TypeError):
        return None


def page(queryset, size):
    """(the first `size` rows, whether there are more)."""
    rows = list(queryset[: size + 1])
    return rows[:size], len(rows) > size
