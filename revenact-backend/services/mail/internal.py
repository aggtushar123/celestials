"""Internal mail is never kept (owner decision D, 2026-10-17).

A message whose sender and every recipient are members of the workspace is
colleagues talking: Revenact does not store it, not even in its owner's
inbox. It is handed, in memory, to the email agent (only for someone who
switched it on: services.emailagent.inbox), and dropped. Mail with anyone
outside is stored as before.
"""

import time
from functools import lru_cache

from services.accounts.models import User


@lru_cache(maxsize=256)
def _members(organisation_id, minute):
    del minute  # part of the key: the list is re-read every minute
    return frozenset(
        e.lower()
        for e in User.objects.filter(organisation_id=organisation_id).values_list(
            "email", flat=True
        )
        if e
    )


def members(organisation_id):
    return _members(organisation_id, int(time.time() // 60))


def parties(message):
    """Every address on a provider Message (from, to, cc, bcc), lowercased."""
    pairs = [("", message.from_address), *message.to, *message.cc, *getattr(message, "bcc", [])]
    return {address.lower() for _, address in pairs if address}


def is_internal(connection, message):
    found = parties(message)
    return len(found) >= 2 and found <= members(connection.organisation_id)
