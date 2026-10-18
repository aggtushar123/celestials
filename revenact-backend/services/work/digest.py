"""Work's daily digest (spec §3.2 Digest, §4). Called every minute by the
`sender` service (`deliver_pending`). For each workspace with the digest on,
once its local time reaches `digest_hour` on one of its working days, each
member active for work (`standing`) with an email who has not opted out gets one plain-text email
for that local date, built through the feed's own task source
(`feed_tasks.Tasks`: the reader's tasks and their own to-dos) and
`/work/recommendations/`'s rules so it never names what they cannot open.

A `DigestSend` row is claimed before each send (at most once per person per
day). Without a mail server (`prefs.email_ready`) nothing is claimed or
sent, and that is logged once per process."""

import logging
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from services.customers.task_access import record_of
from services.email import send_work_digest

from .clock import working, zone
from .feed_shape import TASK, TODO
from .feed_tasks import Tasks
from .models import DigestSend, WorkSettings
from .prefs import email_ready, settings_for
from .rec_access import decidable, default_scope, openable
from .standing import working_q
from .tracking import plural

logger = logging.getLogger(__name__)

NAMED = 5
#: How long a DigestSend row is kept: past this nobody needs to know a day's
#: digest went, so `prune_sent` clears it.
PRUNE_AFTER = timedelta(days=30)
_told_unready = False


@dataclass
class DigestResult:
    sent: int = 0
    empty: int = 0
    failed: int = 0
    failed_workspaces: int = 0
    skipped: bool = False


def _short(day):
    return f"{day:%a} {day.day} {day:%b}"


def _item_date(day):
    return f"{day.day} {day:%b}"


def contents(reader, *, today):
    """(subject, body) for `reader` on `today`, or None with nothing to report."""
    tasks = Tasks(reader, today, frozenset({TASK, TODO}))
    counts = tasks.counts()
    # SOC2:AUTH-02 the badge's own count: what the reader may decide, on records they open
    waiting = openable(reader, decidable(reader, default_scope(reader))).count()
    overdue, due, blocked = counts["overdue"], counts["today"], counts["blocked"]
    if not (overdue or due or blocked or waiting):
        return None
    lines = [
        line
        for line, n in (
            (f"{overdue} overdue", overdue),
            (f"{due} due today", due),
            (f"{plural(waiting, 'recommendation')} waiting", waiting),
            (f"{blocked} blocked", blocked),
        )
        if n
    ]
    named = [("Overdue", task) for task in tasks.tasks("overdue", None, NAMED)]
    named += [("Due today", task) for task in tasks.tasks("today", None, NAMED)]
    items, heading = [], None
    for group, task in named[:NAMED]:
        if group != heading:
            items.append(group)
            heading = group
        when = "" if group == "Due today" else f", due {_item_date(task.due_date)}"
        record = record_of(task)
        where = "" if record is None else f" ({record.name})"
        items.append(f"- {task.title}{where}{when}")
    head = [p for p, n in ((f"{overdue} overdue", overdue), (f"{due} due today", due)) if n]
    if head:
        tail = ", ".join(head)
    elif waiting:
        tail = f"{plural(waiting, 'recommendation')} waiting"
    else:
        tail = f"{blocked} blocked"
    subject = f"Your work for {_short(today)}: {tail}"
    body = "\n".join(
        [
            *lines,
            "",
            *items,
            *([""] if items else []),
            f"Open Work: {settings.FRONTEND_URL}/work/mine",
            "",
            "You get this because daily digests are on for your workspace.",
        ]
    )
    return subject, body


def _members_due(organisation, day):
    from services.accounts.models import User

    return (
        User.objects.filter(
            working_q(organisation), organisation=organisation, digest_opt_out=False
        )
        .exclude(email="")
        .exclude(
            id__in=DigestSend.objects.filter(
                local_date=day, user__organisation=organisation
            ).values("user_id")
        )
        .order_by("id")
    )


def _claim(user, day):
    try:
        with transaction.atomic():
            return DigestSend.objects.create(user=user, local_date=day)
    except IntegrityError:
        return None


def _send_workspace(organisation, now, result):
    try:
        prefs = organisation.work_settings
    except WorkSettings.DoesNotExist:
        prefs = settings_for(organisation)
    if not prefs.digest_enabled:
        return
    local = now.astimezone(zone(prefs))
    if local.hour < prefs.digest_hour or local.weekday() not in working(prefs):
        return
    day = local.date()
    for user in _members_due(organisation, day):
        row = _claim(user, day)
        if row is None:
            continue
        try:
            built = contents(user, today=day)
            if built is None:
                row.status = DigestSend.Status.EMPTY
                result.empty += 1
            else:
                send_work_digest(user, *built)
                row.status = DigestSend.Status.SENT
                result.sent += 1
        except Exception as exc:  # noqa: BLE001 - one person never stops the rest
            logger.warning("work digest: user %s failed: %s", user.pk, type(exc).__name__)
            row.status = DigestSend.Status.FAILED
            result.failed += 1
        row.save(update_fields=["status"])


def send_due(now=None):
    """Every digest that is due now. See the module."""
    global _told_unready
    from services.accounts.models import Organisation
    from services.customers.models import Customer

    now = now or timezone.now()
    result = DigestResult()
    if not email_ready():
        if not _told_unready:
            logger.info("work digest: email isn't set up on this server; digests skipped")
            _told_unready = True
        result.skipped = True
        return result
    workspaces = (
        Organisation.objects.filter(
            id__in=Customer.objects.values("organisation_id"),
            # SOC2:AUTH-02 a suspended or archived workspace is not emailed
            status=Organisation.Status.ACTIVE,
        )
        .exclude(work_settings__digest_enabled=False)
        .select_related("work_settings")
    )
    for organisation in workspaces.order_by("id"):
        try:
            _send_workspace(organisation, now, result)
        except Exception as exc:  # noqa: BLE001 - one workspace never stops the next
            logger.warning(
                "work digest: organisation %s failed: %s", organisation.pk, type(exc).__name__
            )
            result.failed_workspaces += 1
    return result


def prune_sent(*, now=None, dry_run=False):
    """Delete DigestSend rows whose `local_date` is more than PRUNE_AFTER
    before today; the count. Called nightly from `run_health_maintenance`:
    table hygiene, since a claim only guards its own day."""
    now = now or timezone.now()
    rows = DigestSend.objects.filter(local_date__lt=timezone.localdate(now) - PRUNE_AFTER)
    count = rows.count()
    if not dry_run:
        rows.delete()
    return count
