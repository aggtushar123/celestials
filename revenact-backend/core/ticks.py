"""Scheduled ticks: Cloud Scheduler's replacement for the sleep loops.

On Cloud Run nothing runs between requests, so the four loops revenact-infra
ran as containers (`sync_mail --loop`, `deliver_pending`, `sync_tickets`,
`run_agent_signals`) become one POST each, on a schedule, to
/api/v1/internal/tick/<task>/. Cloud Scheduler signs every call with an OIDC
token for TICK_SERVICE_ACCOUNT and TICK_AUDIENCE; the token is checked exactly
as Gmail's push is (services.mail.push.verify), failing closed when either
setting is unset. Only the tasks named in TASKS can run, and each one is
held by a Postgres advisory lock, so a tick that overruns its interval makes
the next one a no-op instead of a second copy. Every task was already safe
to overlap (each claims its rows); the lock only saves the duplicate work.
"""

import io
import logging
import time
import zlib

from django.core.management import call_command
from django.db import connection

logger = logging.getLogger(__name__)


def _mail():
    from services.calendar.sync import sync_due
    from services.mail.loop import Loop

    mailboxes = Loop().run_once()
    # Calendars ride the mail tick: same connections, no schedule of their own.
    # (The email agent reads in the sync pass itself: services.emailagent.inbox.)
    return f"{mailboxes} mailbox(es) synced; {sync_due()} calendar(s) synced"


def _command(name):
    def run():
        out = io.StringIO()
        call_command(name, stdout=out)
        lines = out.getvalue().strip().splitlines()
        return lines[-1] if lines else ""

    return run


#: task name -> callable answering a one-line summary (counts only, no content).
TASKS = {
    "mail": _mail,
    "deliver": _command("deliver_pending"),
    "tickets": _command("sync_tickets"),
    "agents": _command("run_agent_signals"),
}


def _lock_key(task):
    return zlib.crc32(f"revenact-tick:{task}".encode())


def _try_lock(key):
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_try_advisory_lock(%s)", [key])
        return cursor.fetchone()[0]


def _unlock(key):
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_unlock(%s)", [key])


def run(task):
    """Run one task unless another process is running it. Returns
    (ran, summary, seconds); a task's own exception propagates."""
    key = _lock_key(task)
    if not _try_lock(key):
        logger.info("tick %s skipped: already running", task)
        return False, "already running", 0.0
    started = time.monotonic()
    try:
        summary = TASKS[task]()
    finally:
        _unlock(key)
    seconds = round(time.monotonic() - started, 3)
    logger.info("tick %s: %s (%.1fs)", task, summary, seconds)
    return True, summary, seconds
