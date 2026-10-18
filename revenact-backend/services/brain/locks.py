"""Serialising one write at a time, per organisation and key, without
holding a database transaction open across it.

`BriefLock` + `select_for_update()` did the same serialising, but only by
riding inside a transaction. Nest a slow call (a real model request) inside
that transaction and every *other* row lock taken inside it is held for
exactly as long — a brief write's `select_for_update` on `BriefLock` also
held the organisation's `BillingAccount` row lock (taken by the credit
ledger on every model call) for the whole provider round trip, which
stalled every other AI call and billing write in the organisation. That is
what this module replaces.

A Postgres **session-level** advisory lock has no such passenger: it is
held by the *session* (the DB connection), not by a transaction, so code
inside `held()` is free to open and close its own ordinary transactions —
commits and all — while the lock itself stays up. Releasing it is this
module's job, in a `finally`, not Postgres's: a session-level lock
(`pg_advisory_lock`, unlike `pg_advisory_xact_lock`) outlives a commit *and*
a rollback of whatever transaction happens to be open when it is taken or
released.

`key` is a short, stable string naming what is being serialised (a scope's
stored key, a metric's explanation key, ...) — hashed with Postgres's own
`hashtextextended` and namespaced by `organisation_id`, so two
organisations' identical keys take different locks.

MUST be entered outside any `transaction.atomic()` block in production
code. A session-level advisory lock taken while inside a transaction is
still held after that transaction commits or rolls back — Postgres does not
release it early — so nesting is not what reintroduces the bug; running the
*slow call this exists to protect* inside a transaction is. Keeping
`held()` itself outside any atomic block is the simplest way to guarantee
that whatever runs inside it — including a real model call — never drags a
database transaction, and the row locks it holds, along for the ride.

Releasing is best-effort, deliberately. If whatever ran inside `held()`
left the connection in an aborted atomic block (`needs_rollback`), issuing
the unlock statement would itself raise `TransactionManagementError` —
masking whatever real exception the `with` block is already propagating.
In that case this logs a warning (the key only) and leaves the lock for
Postgres to free when the session ends, rather than trade a clear error
for a confusing one.
"""

import logging
from contextlib import contextmanager

from django.db import connection

logger = logging.getLogger(__name__)

_LOCK_SQL = "SELECT pg_advisory_lock(hashtextextended(%s, 0))"
_UNLOCK_SQL = "SELECT pg_advisory_unlock(hashtextextended(%s, 0))"


@contextmanager
def held(organisation_id, key):
    """Hold the named lock for the duration of the `with` block. Blocks
    until any other holder releases it; always releases on the way out,
    success or exception — see `_release` for when that release is only
    best-effort."""
    name = f"brain:{organisation_id}:{key}"
    with connection.cursor() as cursor:
        cursor.execute(_LOCK_SQL, [name])
    try:
        yield
    finally:
        _release(name)


def _release(name):
    """Unlock `name`, never at the cost of hiding an exception already in
    flight from the `with` block.

    A connection left inside an aborted atomic block (`needs_rollback`)
    cannot run any statement, including the unlock, until it is rolled
    back — something `held()` has no business doing on its caller's behalf.
    Skip the attempt in that case; the session ending (normally or by a
    crash) frees the lock regardless. Any other failure to unlock (the
    connection closed, a network blip) is caught the same way: logged, not
    raised, so a release problem is never what the caller sees instead of
    whatever their own code actually failed on."""
    if connection.in_atomic_block and connection.needs_rollback:
        logger.warning("brain lock release skipped, connection unusable: key=%s", name)
        return
    try:
        with connection.cursor() as cursor:
            cursor.execute(_UNLOCK_SQL, [name])
    except Exception:  # noqa: BLE001 - deliberately broad: a release
        # failure must never replace or hide the original exception.
        logger.warning("brain lock release failed: key=%s", name)
