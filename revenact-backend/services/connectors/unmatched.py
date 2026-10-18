"""Slack and Jira items that match no customer (agent bundles round 2 D3,
contract §2, §3, R2D3-2 to R2D3-11): kept minimised in their own table,
listed in their department's queue, matched by hand or dismissed, and
deleted 30 days after they were last seen. No model ever reads one: no
SignalThread exists until a person matches it."""

import base64
import binascii
import json
from datetime import datetime, time, timedelta

from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.db.models.functions import Lower
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import serializers

from core import audit
from services.accounts.models import Organisation, User
from services.agents.threads import touch_conversation, touch_ticket
from services.brain.scope import ScopeNotAllowed, ScopeUnknown
from services.customers.models import Account, Contact, Customer, SlackConversation, Ticket
from services.customers.scoping import can_open
from services.work import queue_bundles
from services.work.clock import zone_for

from .models import Connector, UnmatchedItem

U = UnmatchedItem.Status
SOURCES = (Connector.Provider.SLACK, Connector.Provider.JIRA)
EXCERPT_CHARS = 2000
KEEP_DAYS = 30
#: D2-22's window: an item quiet for longer is not kept (Jira's first sync reads 90 days).
FRESH = timedelta(days=7)
MAX_WAITING_PER_CONNECTOR = 500
PAGE = 25


def _last_activity(remote):
    try:
        at = parse_datetime(str((remote.extra or {}).get("updated_at") or ""))
    except ValueError:  # well formed but not a real date: fall back to opened_at
        at = None
    if at is not None:
        return timezone.make_aware(at) if timezone.is_naive(at) else at
    if remote.opened_at is not None:
        return timezone.make_aware(datetime.combine(remote.opened_at, time.min))
    return timezone.now()


def _is_member(connector, email):
    return (
        bool(email)
        and User.objects.filter(
            organisation_id=connector.organisation_id, email__iexact=email
        ).exists()
    )


def member_for_email(organisation_id, email):
    """The active workspace member whose email is `email` (any case), else None:
    who started a Slack conversation (Slack escalations D1, SE1-3)."""
    if not email:
        return None
    # SOC2:AUTH-02 only this workspace's people
    return User.objects.filter(
        organisation_id=organisation_id, email__iexact=email, is_active=True
    ).first()


def _keepable(connector, remote, now):
    from services.agents.threads import source_on

    return (
        connector.is_enabled
        and connector.has_credentials
        and source_on(connector.organisation, connector.provider)
        and not (remote.extra or {}).get("made_here")
        and _last_activity(remote) >= now - FRESH
        # SE1-9: in Slack a colleague's message is the main case; Jira still drops members.
        and not (
            connector.provider == Connector.Provider.JIRA
            and _is_member(connector, remote.requester_email)
        )
    )


def _text(remote):
    return {
        "number": (remote.number or remote.external_id)[:32],
        "title": (remote.title or "")[:255],
        "excerpt": (remote.description or "")[:EXCERPT_CHARS],
        "requester_name": (remote.requester_name or "")[:150],
        "requester_email": (remote.requester_email or "").lower()[:254],
        "url": (remote.url or "")[:500],
        "priority": remote.priority or "medium",
    }


def keep(connector, remote, *, now=None, candidates=()):
    """Contract §2: keep, update or drop one item that matched no customer."""
    if connector.provider not in SOURCES:
        return
    now = now or timezone.now()
    rows = UnmatchedItem.objects.filter(connector=connector, external_id=remote.external_id[:128])
    row = rows.first()
    if row is not None and row.status == U.DISMISSED:
        # R2D3-6: a dismissed item stays dismissed, its text blank; the tombstone
        # lives while the source still reports the item (purged 30 days after it goes quiet).
        rows.filter(status=U.DISMISSED).update(last_seen_at=now)
        return
    if remote.status in Ticket.RESOLVED_STATUSES:
        rows.delete()
        return
    if not _keepable(connector, remote, now):
        return
    text = _text(remote)
    found = list(candidates)[:5]
    if row is not None:
        # Only while still waiting: a dismiss meanwhile keeps its text blank, a match
        # meanwhile (row deleted) updates nothing.
        UnmatchedItem.objects.filter(pk=row.pk, status=U.WAITING).update(
            **text, candidates=found, last_seen_at=now
        )
        return
    waiting = UnmatchedItem.objects.filter(connector=connector, status=U.WAITING).count()
    if waiting >= MAX_WAITING_PER_CONNECTOR:
        return
    UnmatchedItem.objects.create(
        organisation_id=connector.organisation_id,
        connector=connector,
        provider=connector.provider,
        department=connector.department,
        external_id=remote.external_id[:128],
        opened_on=remote.opened_at or now.date(),
        first_seen_at=now,
        last_seen_at=now,
        candidates=found,
        **text,
    )


def purge(*, now=None):
    """R2D3-11: rows last seen more than KEEP_DAYS ago go, waiting and dismissed
    alike; one audit row per workspace that lost any. Returns how many went."""
    now = now or timezone.now()
    old = UnmatchedItem.objects.filter(last_seen_at__lt=now - timedelta(days=KEEP_DAYS))
    per = list(
        old.values("organisation_id")
        .annotate(deleted=Count("id"), dismissed=Count("id", filter=Q(status=U.DISMISSED)))
        .order_by("organisation_id")
    )
    if not per:
        return 0
    workspaces = Organisation.objects.in_bulk([row["organisation_id"] for row in per])
    with transaction.atomic():  # the delete and its audit rows land together or not at all
        deleted, _ = old.delete()
        for row in per:
            audit.record(  # SOC2:LOG-01 SOC2:DATA-04 retention ran: counts only, no actor
                "unmatched.purged",
                actor=None,
                organisation=workspaces[row["organisation_id"]],
                metadata={"deleted": row["deleted"], "dismissed": row["dismissed"]},
            )
    return deleted


def forget(connector, external_id):
    """An item that now matches by itself (R2D3-6): its waiting row goes."""
    UnmatchedItem.objects.filter(connector=connector, external_id=external_id[:128]).delete()


def slack_key(channel, ts):
    """Slack escalations D3 (SC3-10): a Slack row's key carries its channel."""
    return f"{channel}:{ts}"[:128]


def split_slack_key(row):
    """(channel, ts) of a Slack row; a row kept before D3 is its connection's
    one channel (SC3-11 rewrote those, this reads any it missed)."""
    channel, sep, ts = row.external_id.partition(":")
    if sep:
        return channel, ts
    return str((row.connector.config or {}).get("channel", "")), row.external_id


STALE_CURSOR = "That list has changed. Reload Work."


class NotAQueue(ScopeUnknown):
    detail = "Choose a department or unassigned."


class BadCursor(Exception):
    pass


def queue_of(row):
    return (
        queue_bundles.UNASSIGNED
        if not row.department
        else f"{queue_bundles.DEPARTMENT}{row.department}"
    )


def waiting_in(reader, key):
    """The queue's waiting rows (R2D3-7), or NotAQueue / ScopeNotAllowed."""
    if not queue_bundles.is_queue_key(key):
        raise NotAQueue(key)
    if key != queue_bundles.UNASSIGNED and queue_bundles.code_of(key) not in queue_bundles.LABELS:
        raise NotAQueue(key)
    # SOC2:AUTH-02 the queue's people only: its department and Leadership; Unassigned admins
    if not queue_bundles.may_use(reader, key):
        raise ScopeNotAllowed(key)
    department = "" if key == queue_bundles.UNASSIGNED else queue_bundles.code_of(key)
    return UnmatchedItem.objects.filter(
        organisation_id=reader.organisation_id, status=U.WAITING, department=department
    )


def count(reader, key):
    return waiting_in(reader, key).count()


def _encode(key, row):
    raw = json.dumps({"q": key, "t": row.last_seen_at.isoformat(), "i": row.pk})
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode(key, cursor):
    try:
        data = json.loads(base64.urlsafe_b64decode(cursor.encode()))
        at = parse_datetime(data["t"])
        if data["q"] != key or at is None or not isinstance(data["i"], int):
            raise BadCursor
        return at, data["i"]
    except (binascii.Error, ValueError, KeyError, TypeError, UnicodeDecodeError):
        raise BadCursor from None


def _known_emails(organisation_id, emails):
    """The emails some contact in this workspace already has (plain queries,
    no join made unique), so nothing outside the workspace is revealed."""
    if not emails:
        return set()
    # SOC2:AUTH-02 only this workspace's contacts are read
    rows = Contact.objects.annotate(low=Lower("email")).filter(low__in=emails)
    on_customers = rows.filter(customer__organisation_id=organisation_id)
    on_accounts = rows.filter(
        account_id__in=Account.objects.filter(customers__organisation_id=organisation_id).values(
            "id"
        )
    )
    return set(on_customers.values_list("low", flat=True)) | set(
        on_accounts.values_list("low", flat=True)
    )


def row_payload(row, known, zone, mentioned=()):
    stamp = serializers.DateTimeField().to_representation
    email = row.requester_email
    slack = row.provider == Connector.Provider.SLACK
    return {
        "id": row.pk,
        "source": row.provider,
        "connector": {"id": row.connector_id, "name": row.connector.name},
        "number": row.number,
        "title": row.title,
        "text": row.excerpt,
        # a Slack poster is a colleague: their address is not shown
        "from": {"name": row.requester_name, "email": "" if slack else email},
        "url": row.url,
        "priority": row.priority,
        "opened_on": row.opened_on.isoformat(),
        "last_seen_at": stamp(row.last_seen_at),
        "deletes_on": (
            row.last_seen_at.astimezone(zone).date() + timedelta(days=KEEP_DAYS)
        ).isoformat(),
        "can_add_contact": not slack and bool(email) and email not in known,
        "mentioned": list(mentioned),
    }


def _mentioned(reader, rows):
    """{row id: [{type, id, name}]}: each row's candidates the reader may open,
    in stored order (SE1-12). One query per record type, no join."""
    from services.customers.scoping import visible_accounts, visible_customers

    wanted = {"customer": set(), "account": set()}
    for row in rows:
        for c in row.candidates or []:
            if c.get("type") in wanted and isinstance(c.get("id"), int):
                wanted[c["type"]].add(c["id"])
    names = {}
    # SOC2:AUTH-02 never name a record the reader may not open
    if wanted["customer"]:
        found = visible_customers(reader).filter(pk__in=wanted["customer"])
        names.update({("customer", pk): name for pk, name in found.values_list("id", "name")})
    if wanted["account"]:
        found = visible_accounts(reader).filter(pk__in=wanted["account"])
        names.update({("account", pk): name for pk, name in found.values_list("id", "name")})
    return {
        row.pk: [
            {"type": c["type"], "id": c["id"], "name": names[(c["type"], c["id"])]}
            for c in row.candidates or []
            if (c.get("type"), c.get("id")) in names
        ]
        for row in rows
    }


def page(reader, key, cursor=None):
    rows = waiting_in(reader, key)
    total = rows.count()
    if cursor:
        at, pk = _decode(key, cursor)
        rows = rows.filter(Q(last_seen_at__lt=at) | Q(last_seen_at=at, id__lt=pk))
    found = list(rows.select_related("connector").order_by("-last_seen_at", "-id")[: PAGE + 1])
    shown = found[:PAGE]
    known = _known_emails(
        reader.organisation_id, {r.requester_email for r in shown if r.requester_email}
    )
    zone = zone_for(reader.organisation)  # read once, not per row
    mentioned = _mentioned(reader, shown)
    return {
        "queue": key,
        "count": total,
        "items": [row_payload(r, known, zone, mentioned.get(r.pk, ())) for r in shown],
        "next": _encode(key, shown[-1]) if len(found) > PAGE else None,
    }


CHOOSE_RECORD = "Choose one customer or account."
CANT_OPEN = "Choose a customer or account you can open."
ON_OR_OFF = "Choose on or off."
NO_EMAIL = "This message has no sender email to add."
GONE = "Someone else dealt with this message. Reload the list."
NO_SLACK_CONTACT = "A Slack message is from a colleague. Match it without adding a contact."
NOT_COVERED = (
    "{connector} doesn't cover {record}. Choose another, or change the connection in Settings."
)


class Refused(Exception):
    def __init__(self, status, body):
        super().__init__(status)
        self.status = status
        self.body = body


def readable(reader, pk):
    """A waiting or dismissed row the reader's queue holds, else 404."""
    row = (
        UnmatchedItem.objects.filter(organisation_id=reader.organisation_id, pk=pk)
        .select_related("connector")
        .first()
    )
    # SOC2:AUTH-02 a row outside the reader's queues reads as missing
    if row is None or not queue_bundles.may_use(reader, queue_of(row)):
        raise Refused(404, {"detail": "Not found."})
    return row


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _which(data):
    """Contract §3.2 row 2: exactly one whole-number record id."""
    ids = {k: data.get(k) for k in ("customer_id", "account_id") if data.get(k) is not None}
    if len(ids) != 1 or not _whole(next(iter(ids.values()))):
        raise Refused(400, {"record": [CHOOSE_RECORD]})
    ((key, pk),) = ids.items()
    return (Customer if key == "customer_id" else Account), pk


def _record(reader, model, pk):
    record = model.objects.filter(pk=pk).first()
    # SOC2:AUTH-02 only a record the matcher may open (R2D3-8)
    if record is None or not can_open(reader, record):
        raise Refused(400, {"record": [CANT_OPEN]})
    return record


def _add_contact(row, parent):
    """The sender as a contact on the matched record, unless the workspace has them."""
    email = row.requester_email.lower()
    if email in _known_emails(row.organisation_id, {email}):
        return False
    name = row.requester_name or row.requester_email.split("@", 1)[0]
    Contact.objects.create(name=name[:150], email=row.requester_email, **parent)
    return True


def _conversation_from(row, parent, now):
    """SC3-10: the row's message as a conversation in its own channel; its
    replies come next pass."""
    from services.connectors.providers.slack import message_url, ts_time

    from .models import SlackChannel

    channel, ts = split_slack_key(row)
    found = SlackChannel.objects.filter(connector=row.connector, channel_id=channel).first()
    config = row.connector.config or {}
    try:
        at = ts_time(ts)
    except ValueError:
        at = row.first_seen_at
    starter = member_for_email(row.organisation_id, row.requester_email)
    return SlackConversation.objects.create(
        **parent,
        connector=row.connector,
        department=row.department,
        channel=channel[:32],
        channel_name=(
            found.name if found else str(config.get("channel_name") or row.number.lstrip("#"))
        )[:80],
        thread_ts=ts[:32],
        title=row.title or row.number,
        messages=[
            {
                "ts": ts,
                "user_id": "",
                "name": row.requester_name,
                "text": row.excerpt,
                "bot": False,
            }
        ],
        started_by=starter,
        started_by_name=row.requester_name,
        started_by_email=row.requester_email,
        url=row.url or message_url(channel, ts),
        last_message_at=at,
        matched_by=SlackConversation.MatchedBy.PERSON,
        external_shared=bool(found.external_shared) if found else False,
        synced_at=now,
    )


def match(reader, pk, data, *, request=None):
    """Contract §3.2, §6: (Ticket | SlackConversation, contact_added), or Refused."""
    row = readable(reader, pk)
    data = data if isinstance(data, dict) else {}
    model, record_id = _which(data)
    add = data.get("add_contact", False)
    if not isinstance(add, bool):
        raise Refused(400, {"add_contact": [ON_OR_OFF]})
    record = _record(reader, model, record_id)
    parent = {"customer": record} if isinstance(record, Customer) else {"account": record}
    slack = row.provider == Connector.Provider.SLACK
    if slack and add:
        raise Refused(400, {"add_contact": [NO_SLACK_CONTACT]})
    if not row.connector.covers(**parent):
        detail = NOT_COVERED.format(connector=row.connector.name, record=record.name)
        raise Refused(409, {"code": "NOT_COVERED", "detail": detail})
    if add and not row.requester_email:
        raise Refused(400, {"add_contact": [NO_EMAIL]})
    now = timezone.now()
    with transaction.atomic():
        # SOC2:AUTH-02 re-read under the lock: matched or dismissed meanwhile is gone
        row = (
            UnmatchedItem.objects.select_for_update(of=("self",))
            .filter(pk=row.pk, status=U.WAITING)
            .select_related("connector")
            .first()
        )
        if row is None:
            raise Refused(409, {"code": "GONE", "detail": GONE})
        slack = row.provider == Connector.Provider.SLACK
        # one existence check, for the kind of record this row would make
        if slack:
            channel, ts = split_slack_key(row)
            already = SlackConversation.objects.filter(
                connector_id=row.connector_id, channel=channel, thread_ts=ts[:32]
            )
        else:
            already = Ticket.objects.filter(
                connector_id=row.connector_id, external_id=row.external_id
            )
        if already.exists():
            raise Refused(409, {"code": "GONE", "detail": GONE})
        try:
            with transaction.atomic():  # a savepoint: a lost race is GONE, not a 500
                if slack:
                    made = _conversation_from(row, parent, now)
                else:
                    made = Ticket.objects.create(
                        **parent,
                        connector=row.connector,
                        department=row.department,
                        external_id=row.external_id,
                        ticket_number=row.number,
                        title=row.title or row.number,
                        description=row.excerpt,
                        priority=row.priority,
                        assignee_name="Unassigned",
                        requester_name=row.requester_name,
                        requester_email=row.requester_email,
                        external_url=row.url,
                        opened_at=row.opened_on,
                        synced_at=now,
                    )
        except IntegrityError:
            raise Refused(409, {"code": "GONE", "detail": GONE}) from None
        added = False if slack else add and _add_contact(row, parent)
        action = "conversation.matched" if slack else "ticket.matched"
        target_repr = f"{'Slack thread' if slack else 'Ticket'} {made.pk}"  # never the title
        item_id, provider, connector_id = row.pk, row.provider, row.connector_id
        row.delete()
        audit.record(  # SOC2:LOG-01 who put an outside message on which record (R2D3-20, SE1-20)
            action,
            request=request,
            actor=reader,
            organisation=reader.organisation,
            target=made,
            target_repr=target_repr,
            metadata={
                "item": item_id,
                "provider": provider,
                "connector": connector_id,
                "record": {"type": next(iter(parent)), "id": record.pk},
                "contact_added": added,
            },
        )
        # R2D3-9: due at the next run, whatever the item's age; no model call here.
        if slack:
            touch_conversation(made, now, at=now)
        else:
            touch_ticket(made, now)
    return made, added


def dismiss(reader, pk, *, request=None):
    """Contract §3.3: the row's text goes at once; the tombstone stays (R2D3-10)."""
    row = readable(reader, pk)
    with transaction.atomic():
        locked = (
            UnmatchedItem.objects.select_for_update().filter(pk=row.pk, status=U.WAITING).first()
        )
        if locked is None:
            raise Refused(409, {"code": "GONE", "detail": GONE})
        locked.status = U.DISMISSED
        locked.title = locked.excerpt = locked.requester_name = locked.requester_email = ""
        locked.dismissed_by = reader
        locked.dismissed_at = timezone.now()
        locked.save(
            update_fields=[
                "status",
                "title",
                "excerpt",
                "requester_name",
                "requester_email",
                "dismissed_by",
                "dismissed_at",
            ]
        )
        audit.record(  # SOC2:LOG-01 who set an outside message aside
            "unmatched.dismissed",
            request=request,
            actor=reader,
            organisation=reader.organisation,
            target=locked,
            target_repr=f"Unmatched item {locked.pk}",  # never the title
            metadata={"provider": locked.provider, "connector": locked.connector_id},
        )
