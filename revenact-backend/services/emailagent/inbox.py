"""Internal mail on its way past the store (owner decisions A and D).

Sync hands each internal message here instead of storing it. It is kept, in
this process's memory only, when its mailbox's owner switched the agent on
(`MailboxConnection.agent_reads_mail`), they sent it, and it is less than a
day old; `drain` then reads it once, after the sync pass has committed, and
lets it go. Nothing here is ever written to the database.
"""

import logging
from collections import defaultdict
from datetime import timedelta

from django.utils import timezone

logger = logging.getLogger(__name__)

LOOKBACK = timedelta(hours=24)
#: At most this many waiting per mailbox: a burst past it is not read.
MAX_WAITING = 20

_waiting = defaultdict(list)


def offer(connection, message, *, sent, now=None):
    now = now or timezone.now()
    if not getattr(connection, "agent_reads_mail", False) or not sent:
        return False
    if message.date is None or message.date < now - LOOKBACK:
        return False  # the 12-month import never sets the agent off
    queue = _waiting[connection.pk]
    if len(queue) >= MAX_WAITING:
        return False
    queue.append(message)
    return True


def drain(connection, *, now=None):
    """Read what this mailbox's pass offered. Returns how many were read."""
    messages = _waiting.pop(connection.pk, [])
    if not messages:
        return 0
    from .run import process

    read = 0
    for message in messages:
        try:
            process(connection, message, now=now or timezone.now())
            read += 1
        except Exception as exc:  # noqa: BLE001 - one message never stops the rest
            # the class name only: an exception's text can quote mail
            logger.error("email agent: a message failed: %s", type(exc).__name__)
    return read
