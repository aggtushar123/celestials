"""Where a Me or My team scope's moves are measured from.

The latest ScopeSnapshot of the scope, if it covered the same owners. The
first time a scope is viewed there is none, so a baseline is written for
today; when the team has changed since (someone joined or left below the
reader), moves across the change would compare two different books, so a
new baseline starts them again. Month-end rows are written by the nightly
job and kept, never overwritten.
"""

import logging
import time
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from core import audit
from services.accounts.hierarchy import subtree_ids
from services.accounts.models import User
from services.customers.models import Account, Customer

from .metrics import figures, stored_slices
from .models import ScopeSnapshot
from .scope import ME, TEAM, resolve

logger = logging.getLogger(__name__)

FIRST_VIEW, TEAM_CHANGED = "first_view", "team_changed"


def latest(scope):
    return (
        ScopeSnapshot.objects.filter(
            organisation=scope.actor.organisation, scope_key=scope.stored_key
        )
        .order_by("-taken_on")
        .first()
    )


def _row_fields(scope, figs):
    return {
        "user": scope.user,
        "owner_ids": sorted(scope.owner_ids),
        "customer_ids": sorted(figs.book),
        "values": figs.values,
        "slices": stored_slices(figs.slices),
    }


def comparison_point(scope, figs, today, *, request=None):
    """The row this scope's moves are measured from, writing a baseline for
    `today` when there is none or the owners changed. Two first views at
    once write one row: the unique constraint decides, `get_or_create`
    returns the winner's. Company has no comparison point of its own — it
    compares against the whole organisation's month-end metric snapshots."""
    if scope.owner_ids is None:
        raise ValueError("Company compares against month-end metric snapshots.")
    row = latest(scope)
    if row is not None and set(row.owner_ids) == set(scope.owner_ids):
        return row
    reason = FIRST_VIEW if row is None else TEAM_CHANGED
    fields = {**_row_fields(scope, figs), "kind": ScopeSnapshot.Kind.BASELINE, "reason": reason}
    organisation = scope.actor.organisation
    with transaction.atomic():
        if row is not None and row.taken_on == today and row.kind == ScopeSnapshot.Kind.BASELINE:
            # Today's baseline is a starting line, not a record of a month:
            # a team change on the same day moves it. Locked, so two
            # concurrent changes on the same day update once and audit once
            # — the loser finds the winner already holds its own owners and
            # leaves the row alone.
            locked = ScopeSnapshot.objects.select_for_update().get(pk=row.pk)
            created = sorted(locked.owner_ids) != fields["owner_ids"]
            if created:
                ScopeSnapshot.objects.filter(pk=row.pk).update(**fields)
                locked.refresh_from_db()
            row = locked
        else:
            row, created = ScopeSnapshot.objects.get_or_create(
                organisation=organisation,
                scope_key=scope.stored_key,
                taken_on=today,
                defaults=fields,
            )
    if created:
        # SOC2:LOG-01 ids and the reason only, never the figures
        audit.record(
            "brain.scope_baseline_recorded",
            request=request,
            actor=scope.user,
            organisation=organisation,
            target=row,
            metadata={"scope": scope.stored_key, "reason": reason},
        )
    return row


def team_changed_on(row):
    if row.kind == ScopeSnapshot.Kind.BASELINE and row.reason == TEAM_CHANGED:
        return row.taken_on
    return None


def _owners(organisation):
    """Everyone owning a customer of the organisation or an account under one."""
    links = Account.customers.through.objects.filter(customer__organisation=organisation)
    customers = Customer.objects.filter(organisation=organisation, owner__isnull=False)
    accounts = Account.objects.filter(id__in=links.values("account_id"), owner__isnull=False)
    return set(customers.values_list("owner_id", flat=True)) | set(
        accounts.values_list("owner_id", flat=True)
    )


#: How long after a month ends its rows may still be written. Later than
#: this the figures are no longer that month's: a row dated the month-end but
#: computed from today's book would make "Since <month-end>" a lie. A scope
#: with no row then reads from its first-view baseline, which says so.
MONTH_END_WINDOW = timedelta(days=3)


def record_month_end(organisation, period_end, *, dry_run=False, today=None):
    """Me for every active member who owns a customer or an account, My team
    for every active member with reports, each recomputed over that book —
    counted by that member's own record rules (the scope's principal is its
    own user) — and dated `period_end`. Written only within
    `MONTH_END_WINDOW` of `period_end`; later, nothing is written. A row
    already there is kept. Deactivated members get nothing new. One scope
    failing never stops the rest. Returns `(written, kept)`; logs counts and
    time, never figures."""
    started = time.monotonic()
    today = today or timezone.localdate()
    if today > period_end + MONTH_END_WINDOW:
        logger.info(
            "brain month-end skipped organisation=%s period_end=%s days_after=%s",
            organisation.pk,
            period_end,
            (today - period_end).days,
        )
        return 0, 0
    owners = _owners(organisation)
    have = set(
        ScopeSnapshot.objects.filter(organisation=organisation, taken_on=period_end).values_list(
            "scope_key", flat=True
        )
    )
    written = kept = failed = 0
    for member in User.objects.filter(organisation=organisation, is_active=True).order_by("id"):
        keys = ([ME] if member.id in owners else []) + ([TEAM] if subtree_ids(member) else [])
        for key in keys:
            try:
                scope = resolve(member, key)
                if scope.stored_key in have:
                    kept += 1
                    continue
                if not dry_run:
                    ScopeSnapshot.objects.get_or_create(
                        organisation=organisation,
                        scope_key=scope.stored_key,
                        taken_on=period_end,
                        defaults={
                            **_row_fields(scope, figures(scope)),
                            "kind": ScopeSnapshot.Kind.MONTH_END,
                            "reason": "",
                        },
                    )
                written += 1
            except Exception as exc:  # noqa: BLE001 - one scope never stops the rest
                failed += 1
                # SOC2:LOG-01 ids and the class name only: an exception's text can quote values
                logger.warning(
                    "brain month-end scope failed organisation=%s member=%s scope=%s error=%s",
                    organisation.pk,
                    member.pk,
                    key,
                    type(exc).__name__,
                )
    logger.info(
        "brain month-end organisation=%s period_end=%s written=%s kept=%s failed=%s seconds=%.2f",
        organisation.pk,
        period_end,
        written,
        kept,
        failed,
        time.monotonic() - started,
    )
    return written, kept
