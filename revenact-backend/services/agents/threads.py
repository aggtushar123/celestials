"""The conversations agents may read (agent bundles D2, contract §1.1, §2.1):
the sync touches a thread when it stores a message, and nothing else happens
at sync time (no model, no settings, no bundle). Who may read a thread's
source, and the workspace's sources, are here too (Tasks 6, 19)."""

from datetime import timedelta

from django.utils import timezone

from .models import SignalThread

K = SignalThread.SourceKind
T = SignalThread.Status
#: Every source, in the order Settings › Agents lists them (contract §4.8).
SOURCES = tuple(K.values)
TICKET_SOURCES = tuple(kind for kind in SOURCES if kind != K.MAIL)
SETTINGS_LABELS = {
    K.MAIL: "Email filed to a customer",
    K.SLACK: "Slack",
    K.ZENDESK: "Zendesk",
    K.FRESHDESK: "Freshdesk",
    K.JIRA: "Jira",
    K.WEBHOOK: "Webhooks",
}
#: A message older than this is not read (D2-22).
STALE = timedelta(days=7)


def _touch(*, organisation_id, source_kind, external_id, at, stale, fields, newest):
    """`newest`: fields that follow the thread's newest message (R2D3-15): an
    older message filed late neither sets nor clears them."""
    defaults = {"last_message_at": at, **fields, **newest}
    if stale:
        # D2-22: an old first message (a first import) is never read.
        defaults.update(
            status=T.SKIPPED, skip_reason="stale", processed_through=at, processed_at=at
        )
    thread, created = SignalThread.objects.get_or_create(
        organisation_id=organisation_id,
        source_kind=source_kind,
        external_id=external_id[:320],
        defaults=defaults,
    )
    if created:
        return thread
    if at >= thread.last_message_at:
        fields = {**fields, **newest}
    update = [*fields, "updated_at"]
    for name, value in fields.items():
        setattr(thread, name, value)
    if at > thread.last_message_at:
        thread.last_message_at = at
        update.append("last_message_at")
        if thread.status in (T.PROCESSED, T.SKIPPED):
            thread.status, thread.skip_reason = T.NEW, ""
            update += ["status", "skip_reason"]
    thread.save(update_fields=update)
    return thread


def touch_mail(email, now=None):
    """A filed email (contract §2.1): its mailbox's thread moves to the
    email's time (never later than now). Mail with no mailbox, owner or
    thread id never feeds agents (D2-1)."""
    if email.mailbox_id is None or email.mailbox_owner_id is None or not email.thread_id:
        return None
    from . import fast_lane

    now = now or timezone.now()
    at = min(email.sent_at, now)
    return _touch(
        organisation_id=email.mailbox.organisation_id,
        source_kind=K.MAIL,
        external_id=f"{email.mailbox_id}:{email.thread_id}",
        at=at,
        stale=at < now - STALE,
        fields={
            "customer_id": email.customer_id,
            "account_id": email.account_id,
            "department": "",
            "mailbox_id": email.mailbox_id,
            "mailbox_owner_id": email.mailbox_owner_id,
            "mail_thread": email.thread_id[:255],
        },
        newest={"urgent_rule": fast_lane.for_email(email)},
    )


def touch_ticket(ticket, now=None, *, first_seen=False):
    """A filed ticket, or one with new words or reopened (contract §2.1,
    D2-1): its thread moves to now. `first_seen`: the sync just filed it, so
    an old opening date makes it already skipped (D2-22)."""
    connector = ticket.connector
    if connector is None or connector.provider not in TICKET_SOURCES:
        return None
    from . import fast_lane

    now = now or timezone.now()
    opened = ticket.opened_at
    stale = first_seen and opened is not None and opened < (now - STALE).date()
    return _touch(
        organisation_id=connector.organisation_id,
        source_kind=connector.provider,
        external_id=f"{connector.pk}:{ticket.external_id or ticket.pk}",
        at=now,
        stale=stale,
        fields={
            "customer_id": ticket.customer_id,
            "account_id": ticket.account_id,
            "department": ticket.department,
            "ticket_id": ticket.pk,
        },
        newest={"urgent_rule": fast_lane.for_ticket(ticket)},
    )


def touch_conversation(conversation, now=None, *, at=None):
    """A filed Slack conversation with a new human message (Slack escalations
    D1, SE1-8): its thread moves to that message's time (never later than
    now). `at`: a person's match touches it now, whatever its age (R2D3-9).
    The bot's own reply never touches it; a conversation where only the bot
    spoke has no thread."""
    connector = conversation.connector
    if connector is None:
        return None
    from services.connectors.providers.slack import ts_time

    from . import fast_lane

    now = now or timezone.now()
    humans = [m for m in conversation.messages or [] if not m.get("bot")]
    if not humans:
        return None
    if at is None:
        at = min(ts_time(humans[-1]["ts"]), now)
    return _touch(
        organisation_id=connector.organisation_id,
        source_kind=K.SLACK,
        # Slack escalations D3 (SC3-10): one connection reads many channels
        external_id=f"{connector.pk}:{conversation.channel}:{conversation.thread_ts}",
        at=at,
        stale=at < now - STALE,
        fields={
            "customer_id": conversation.customer_id,
            "account_id": conversation.account_id,
            "department": conversation.department,
            "conversation_id": conversation.pk,
            "ticket_id": None,
        },
        newest={"urgent_rule": fast_lane.for_conversation(conversation)},
    )


def readable_threads(reader):
    """The threads whose source `reader` may read (contract §5.1): mail by its
    mailbox owner alone (owner decision 2026-10-17), never by their chain or
    view-all; a ticket by its department's people and Leadership. One query,
    no join."""
    from django.db.models import Q

    from services.customers.personal import reads_every_ticket_department

    # SOC2:AUTH-02 mail is personal: the mailbox owner only (mail.visibility)
    mail = Q(source_kind=K.MAIL, mailbox_owner__isnull=False, mailbox_owner_id=reader.pk)
    # SOC2:AUTH-02 a ticket follows its department (personal.visible_tickets)
    tickets = ~Q(source_kind=K.MAIL)
    if not reads_every_ticket_department(reader):
        tickets &= Q(department="") | Q(department=reader.function)
    return SignalThread.objects.filter(organisation_id=reader.organisation_id).filter(
        mail | tickets
    )


def may_read_source(user, thread):
    """`readable_threads`' rule for one thread, with no query."""
    from services.customers.personal import reads_every_ticket_department

    if thread.source_kind == K.MAIL:
        return thread.mailbox_owner_id is not None and thread.mailbox_owner_id == user.pk
    return reads_every_ticket_department(user) or thread.department in ("", user.function)


def source_on(organisation, kind):
    """D2-26: a source the workspace has not switched off reads as on."""
    return (organisation.ai_signal_sources or {}).get(kind, True) is not False


def connected_sources(organisation):
    """The sources the workspace has connected (contract §4.8): mail when
    any mailbox is connected; a ticket source when an enabled connector of
    that provider has credentials."""
    from services.connectors.models import Connector
    from services.mail.models import MailboxConnection

    found = set(
        Connector.objects.filter(
            organisation=organisation, is_enabled=True, provider__in=TICKET_SOURCES
        )
        .exclude(credentials="")
        .values_list("provider", flat=True)
    )
    if MailboxConnection.objects.filter(
        organisation=organisation, status=MailboxConnection.Status.CONNECTED
    ).exists():
        found.add(K.MAIL)
    return found


def waiting_for(organisation, agent):
    """(how many threads wait on `agent`'s credits, the newest one's reason)."""
    rows = SignalThread.objects.filter(
        organisation=organisation, agent=agent, status=T.WAITING_CREDITS
    )
    reason = rows.order_by("-updated_at", "-id").values_list("skip_reason", flat=True).first()
    return rows.count(), reason
