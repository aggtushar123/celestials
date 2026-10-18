"""Pull a ticket source and file what belongs to a customer.

For every ticket the provider hands back: if it is already here (same
connector, same external id) update what changed — status, priority,
assignee, resolution; otherwise find the organisation or account its
requester belongs to (a known contact's address first, then the domain,
the same lookup mail uses) and create it there, stamped with the
connector's department. A ticket whose requester matches nothing — and
whose connector is not scoped to exactly one company — is counted and
skipped: a source is synced, not copied. Slack and Jira also keep it,
minimised, for a person to match (services/connectors/unmatched.py).

Slack is not a ticket source (Slack escalations D1): a Slack connector's
threads are filed as conversations (`sync_conversations`), on the customer
the channel is set to or the one its message names.
"""

import functools
import logging

from django.db import transaction
from django.utils import timezone

from services.customers.models import Account, Customer, SlackConversation, Ticket

from . import unmatched
from .models import Connector
from .providers import get_provider
from .providers.base import ProviderError

logger = logging.getLogger(__name__)


def _scoped(connector):
    """The one customer or account a connector is set to, else (None, None)."""
    customers = list(connector.customers.all()[:2])
    accounts = list(connector.accounts.all()[:2])
    if len(customers) == 1 and not accounts:
        return customers[0], None
    if len(accounts) == 1 and not customers:
        return None, accounts[0]
    return None, None


def _parent_for(connector, remote):
    """(customer, account) for one remote ticket, or (None, None)."""
    from services.mail.sync import match_parent

    customer = account = None
    if remote.requester_email:
        customer, account = match_parent(connector.organisation, [remote.requester_email])
    if customer is None and account is None:
        customer, account = _scoped(connector)
    if (customer or account) and not connector.covers(customer=customer, account=account):
        return None, None
    return customer, account


def _apply(ticket, remote):
    ticket.title = remote.title[:255] or ticket.title
    ticket.status = remote.status
    ticket.priority = remote.priority
    ticket.assignee_name = (remote.assignee_name or ticket.assignee_name or "Unassigned")[:150]
    ticket.description = remote.description
    ticket.external_url = remote.url[:500]
    ticket.requester_name = remote.requester_name[:150]
    ticket.requester_email = remote.requester_email[:254]
    if remote.opened_at:
        ticket.opened_at = remote.opened_at
    if remote.status in Ticket.RESOLVED_STATUSES:
        ticket.resolved_at = remote.resolved_at or ticket.resolved_at or timezone.now().date()
    else:
        ticket.resolved_at = None
    ticket.synced_at = timezone.now()


def _new_words(before, ticket):
    """D2-1: a ticket touches its thread when its title or description
    changed, or it went from resolved or closed back to open."""
    title, description, status = before
    reopened = status in Ticket.RESOLVED_STATUSES and ticket.status not in Ticket.RESOLVED_STATUSES
    return title != ticket.title or description != ticket.description or reopened


def file_ticket(connector, remote):
    """Create or update the Ticket for one remote ticket. Returns
    "created", "updated" or "unmatched"; the created Ticket comes back as
    the second element so the caller can classify it."""
    from services.agents import issue_waits
    from services.agents.threads import touch_ticket

    try:
        with transaction.atomic():  # a savepoint: a wait never stops the batch
            # Slack bundles: a resolved issue makes a held-back survey due (one UPDATE).
            issue_waits.seen(connector, remote)
    except Exception as exc:  # noqa: BLE001
        logger.warning("issue wait not marked: %s", type(exc).__name__)
    existing = Ticket.objects.filter(connector=connector, external_id=remote.external_id).first()
    if existing is not None:
        before = (existing.title, existing.description, existing.status)
        _apply(existing, remote)
        existing.save()
        if connector.provider in unmatched.SOURCES:
            unmatched.forget(connector, remote.external_id)
        if _new_words(before, existing) and not remote.extra.get("made_here"):
            # Agent bundles D2: the thread is touched; no agent work at sync time.
            touch_ticket(existing)
        return "updated", None
    customer, account = _parent_for(connector, remote)
    if customer is None and account is None:
        # Round 2 D3 (R2D3-2): Slack and Jira keep it for a person to match.
        if connector.provider in unmatched.SOURCES:
            try:
                with transaction.atomic():  # a savepoint: one bad item never stops the batch
                    unmatched.keep(connector, remote)
            except Exception as exc:  # noqa: BLE001
                logger.warning("unmatched keep failed: %s", type(exc).__name__)
        return "unmatched", None
    ticket = Ticket(
        customer=customer,
        account=account,
        connector=connector,
        department=connector.department,
        external_id=remote.external_id[:128],
        ticket_number=(remote.number or f"{remote.external_id}")[:32],
        opened_at=remote.opened_at or timezone.now().date(),
    )
    _apply(ticket, remote)
    ticket.save()
    # Matched by itself now (a contact was added meanwhile): its waiting row goes (R2D3-6).
    if connector.provider in unmatched.SOURCES:
        unmatched.forget(connector, remote.external_id)
    # D3-26: an issue an agent step made is filed but never wakes an agent.
    if not remote.extra.get("made_here"):
        touch_ticket(ticket, first_seen=True)
    return "created", ticket


def file_tickets(connector, remotes):
    """File a batch. Returns (summary dict, created tickets)."""
    counts = {"created": 0, "updated": 0, "unmatched": 0}
    created = []
    with transaction.atomic():
        for remote in remotes:
            outcome, ticket = file_ticket(connector, remote)
            counts[outcome] += 1
            if ticket is not None:
                created.append(ticket)
    return counts, created


def summary_line(counts):
    parts = [f"{counts['created']} new", f"{counts['updated']} updated"]
    if counts["unmatched"]:
        parts.append(f"{counts['unmatched']} without a matching account")
    return ", ".join(parts)


def classify_new(connector, tickets):
    """Sentiment now, not at the next scheduled pass: the pulse counts
    only classified conversations (services/customers/pulse.py)."""
    if not tickets:
        return
    from services.customers.classification import classify_records

    classify_records(tickets, organisation=connector.organisation)


def _nothing():
    return {"created": 0, "updated": 0, "unmatched": 0}


def _failed(connector, exc):
    """The provider refused or broke: mark the connector (the admin sees why)."""
    connector.status = Connector.Status.ERROR
    connector.error = str(exc)[:255]
    connector.save(update_fields=["status", "error"])
    logger.warning("connector %s: %s", connector, type(exc).__name__)
    return _nothing()


def _synced(connector, counts, *, cursor, now):
    """A pass went through: its cursor, a clean status and its summary."""
    connector.sync_cursor = (cursor or "")[:512]
    connector.status = Connector.Status.CONNECTED
    connector.error = ""
    connector.last_synced_at = now
    connector.last_sync_note = summary_line(counts)[:255]
    connector.save()


def _apply_thread(conversation, remote, now):
    """Fold one read into a conversation; True when a human message is new
    (SE1-8). Replies merge by ts with the stored ones (D3, SC3-27): a read
    brings only what is new, and an edit replaces its own message; a reply
    made through our app is stored but wakes nothing (SC3-24)."""
    from services.connectors.providers.base import first_line
    from services.connectors.providers.slack import ts_time

    top = {
        "ts": remote.thread_ts,
        "user_id": remote.user_id,
        "name": remote.user_name,
        "text": remote.text[: SlackConversation.TEXT_CHARS],
        "bot": False,
    }
    stored = conversation.messages or []
    merged = {m["ts"]: m for m in stored[1:]}
    merged.update({m["ts"]: m for m in remote.replies or []})
    replies = sorted(merged.values(), key=lambda m: float(m["ts"]))
    messages = [top, *replies[-(SlackConversation.MAX_MESSAGES - 1) :]]
    before = {m.get("ts") for m in stored}
    conversation.messages = messages
    conversation.title = (first_line(remote.text) or "(empty message)")[:255]
    if remote.replies is not None and remote.latest_reply:
        mark = conversation.latest_reply or "0"
        if float(remote.latest_reply) > float(mark):
            conversation.latest_reply = remote.latest_reply[:32]
    conversation.last_message_at = max(ts_time(m["ts"]) for m in messages)
    conversation.synced_at = now
    # R1, SC3-24: a person's post made through our app (D4) never wakes the agent
    return any(not m["bot"] and not m.get("via_app") and m["ts"] not in before for m in messages)


#: What a read can change on a stored conversation (`synced_at` alone is no change).
_READ_FIELDS = (
    "messages",
    "title",
    "latest_reply",
    "last_message_at",
    "external_shared",
    "people",
    "channel_name",
)


def _as_unmatched(connector, remote, name):
    """The thread as R2-D3 keeps an unmatched item (SE1-9): the top message only."""
    from services.connectors.providers.base import RemoteTicket, first_line
    from services.connectors.providers.slack import ts_time

    latest = ts_time(remote.latest_reply) if remote.latest_reply else remote.posted_at
    return RemoteTicket(
        external_id=unmatched.slack_key(remote.channel, remote.thread_ts),
        number=f"#{name or remote.channel}"[:32],
        title=first_line(remote.text) or "(empty message)",
        description=remote.text,
        requester_email=remote.user_email,
        requester_name=remote.user_name,
        url=remote.url,
        opened_at=remote.posted_at.date(),
        extra={"updated_at": max(latest, remote.posted_at).isoformat()},
    )


def linked_members(connector):
    """{Slack user id: member} for the people who linked their Slack account in
    the connector's Slack team (Connections spec §3 "show who I am"): one query."""
    from .models import SlackLink

    team = str((connector.config or {}).get("team_id") or "")
    if not team:
        return {}
    # SOC2:AUTH-02 only this workspace's people
    links = SlackLink.objects.filter(
        organisation_id=connector.organisation_id, team_id=team, user__is_active=True
    ).select_related("user")
    return {link.slack_user_id: link.user for link in links}


def _started_by(connector, remote, linked):
    """Who in Revenact wrote the thread's top message: the member who linked
    that Slack user, else the member with the poster's email."""
    members = linked() if linked is not None else linked_members(connector)
    return members.get(remote.user_id) or unmatched.member_for_email(
        connector.organisation_id, remote.user_email
    )


def _members_by_email(organisation_id, emails):
    """{lower-case email: active member} for `emails`: one query, none for none."""
    from django.db.models.functions import Lower

    from services.accounts.models import User

    wanted = sorted({e.lower() for e in emails if e})
    if not wanted:
        return {}
    # SOC2:AUTH-02 only this workspace's active people
    rows = (
        User.objects.filter(organisation_id=organisation_id, is_active=True)
        .annotate(folded=Lower("email"))
        .filter(folded__in=wanted)
    )
    return {row.folded: row for row in rows}


def resolved_people(people):
    """The Slack ids in a stored `people` map already known as a member (F11)."""
    return {uid for uid, p in (people or {}).items() if (p or {}).get("member")}


def merge_people(connector, read, linked, stored):
    """SE4-24: the thread's people as stored, {id: {"name", "member"}}, with
    `read` ({id: {"name", "email"}}, from the catch-up or an event) folded in:
    the member who linked that Slack user, else the member with that Slack
    email. People seen before are kept, and one already known as a member is
    not resolved again (F11); the email is used here and never kept
    (SOC2:DATA-04 minimised)."""
    found = dict(stored or {})
    done = resolved_people(found)
    fresh = {uid: p for uid, p in (read or {}).items() if uid not in done}
    if not fresh:
        return found
    members = linked() if linked is not None else linked_members(connector)
    by_email = _members_by_email(
        connector.organisation_id, [p.get("email") for p in fresh.values()]
    )
    for user_id, person in fresh.items():
        member = members.get(user_id) or by_email.get(str(person.get("email") or "").lower())
        # a lookup that answered no name keeps the name seen before
        name = person.get("name") or (found.get(user_id) or {}).get("name")
        found[user_id] = {
            "name": str(name or "")[:150],
            "member": member.pk if member is not None else None,
        }
    return found


def _channel_row(connector, channel_id):
    """A lone call's channel row (a pass and an event hand it in), or None."""
    from .models import SlackChannel

    return SlackChannel.objects.filter(connector=connector, channel_id=channel_id).first()


def _pinned(connector, channel):
    """SC3-8, SC3-9: the channel's own record, while the connection covers it."""
    if channel is None or (channel.customer_id is None and channel.account_id is None):
        return None, None
    customer, account = channel.customer, channel.account
    # SOC2:AUTH-02 only a record the connection covers (Ticket.clean's rule)
    if not connector.covers(customer=customer, account=account):
        return None, None
    return customer, account


def file_conversation(connector, remote, names, *, now, channel=None, linked=None):
    """Contract §2 step 4 (D1), per channel (D3): ("created" | "updated" |
    "unchanged" | "unmatched", the conversation or None). `channel` is the
    SlackChannel row of `remote.channel`; a lone call reads it. `linked`
    returns `linked_members`, read once a pass. Callers are inside
    `transaction.atomic` (the events' top and reply, the catch-up's `_file`):
    a stored conversation is read under its row lock, so an event and the
    catch-up filing one thread at once never overwrite each other (F3)."""
    from services.agents.threads import touch_conversation

    from . import naming, slack_tag_checks

    if channel is None:
        channel = _channel_row(connector, remote.channel)
    name = channel.name if channel is not None else ""
    shared = bool(channel.external_shared) if channel is not None else False
    key = unmatched.slack_key(remote.channel, remote.thread_ts)
    existing = (
        SlackConversation.objects.select_for_update()
        .filter(connector=connector, channel=remote.channel, thread_ts=remote.thread_ts)
        .first()
    )
    if existing is not None:
        before = [getattr(existing, field) for field in _READ_FIELDS]
        seen = {m.get("ts") for m in existing.messages or []}
        # SC3-12: the channel's flag and name, as now known
        existing.external_shared = shared
        existing.channel_name = name or existing.channel_name
        # SE4-24: who the thread's people are, without their emails
        existing.people = merge_people(connector, remote.people, linked, existing.people)
        fresh = _apply_thread(existing, remote, now)
        if [getattr(existing, field) for field in _READ_FIELDS] == before:
            return "unchanged", existing
        existing.save()
        unmatched.forget(connector, key)
        if fresh:
            touch_conversation(existing, now)
            # Channel tag to-dos: a new message that tags colleagues is checked on the tick.
            slack_tag_checks.enqueue(connector, existing, seen, now)
        return "updated", existing
    customer, account = _pinned(connector, channel)
    how, candidates = SlackConversation.MatchedBy.CHANNEL, []
    if customer is None and account is None:
        found, near = naming.find(remote.text, names)
        how = SlackConversation.MatchedBy.NAME
        if found is not None:
            # The match is a pk from this workspace's own covered names, never user input.
            customer, account = (
                (Customer.objects.get(pk=found.id), None)
                if found.type == "customer"
                else (None, Account.objects.get(pk=found.id))
            )
        candidates = [{"type": n.type, "id": n.id} for n in near]
    if customer is None and account is None:
        try:
            with transaction.atomic():  # a savepoint: one bad item never stops the batch
                unmatched.keep(
                    connector, _as_unmatched(connector, remote, name), candidates=candidates
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning("unmatched keep failed: %s", type(exc).__name__)
        return "unmatched", None
    conversation = SlackConversation(
        customer=customer,
        account=account,
        connector=connector,
        department=connector.department,
        channel=remote.channel[:32],
        channel_name=name[:80],
        thread_ts=remote.thread_ts[:32],
        started_by=_started_by(connector, remote, linked),
        started_by_name=remote.user_name[:150],
        started_by_email=remote.user_email[:254],
        url=remote.url[:500],
        matched_by=how,
        external_shared=shared,
        people=merge_people(connector, remote.people, linked, {}),
    )
    _apply_thread(conversation, remote, now)
    conversation.save()
    unmatched.forget(connector, key)
    touch_conversation(conversation, now)
    slack_tag_checks.enqueue(connector, conversation, set(), now)
    return "created", conversation


def stored_remote(conversation, replies):
    """A stored conversation as a RemoteThread carrying `replies` (new ones,
    or an edited one): the events' and the catch-up's way to add to a thread
    whose top they don't re-read (SC3-24, SC3-27)."""
    from services.connectors.providers.base import RemoteThread
    from services.connectors.providers.slack import ts_time

    top = (conversation.messages or [{}])[0]
    marks = [conversation.latest_reply or "0", *(m["ts"] for m in replies or [])]
    latest = max(marks, key=float)
    return RemoteThread(
        thread_ts=conversation.thread_ts,
        channel=conversation.channel,
        text=top.get("text", ""),
        user_id=top.get("user_id", ""),
        user_name=top.get("name", ""),
        user_email=conversation.started_by_email,
        posted_at=ts_time(conversation.thread_ts),
        latest_reply="" if latest == "0" else latest,
        replies=replies,
        url=conversation.url,
    )


#: SC3-25: what a deleted top message reads as (Slack's own words).
DELETED = "This message was deleted."


def edit_message(conversation, ts, text):
    """SC3-25: a stored message takes its edited text; the agent is not woken."""
    from services.connectors.providers.base import first_line

    changed = False
    for message in conversation.messages or []:
        if message.get("ts") == ts and message.get("text") != text:
            message["text"], changed = text[: SlackConversation.TEXT_CHARS], True
    if not changed:
        return False
    if ts == conversation.thread_ts:
        conversation.title = (first_line(text) or "(empty message)")[:255]
    conversation.save(update_fields=["messages", "title"])
    return True


def delete_message(conversation, ts):
    """SC3-25: a deleted reply goes; a deleted top keeps its place as DELETED."""
    messages = conversation.messages or []
    if ts == conversation.thread_ts:
        if not messages or messages[0].get("text") == DELETED:
            return False
        messages[0]["text"] = DELETED
        conversation.title = DELETED
    else:
        kept = [m for m in messages if m.get("ts") != ts]
        if len(kept) == len(messages):
            return False
        conversation.messages = kept
    conversation.save(update_fields=["messages", "title"])
    return True


def sync_conversations(connector):
    """One Slack pass (D3 contract §4): list the channels, join new ones and,
    at most once a minute, catch up one page and one thread. Events file the
    rest as they happen (slack_events.py)."""
    from . import naming, slack_catchup, slack_channels

    provider = get_provider(connector.provider)
    now = timezone.now()
    counts = _nothing()
    try:
        creds = connector.get_credentials()
        rows = slack_channels.refresh(connector, provider, creds, now=now)
        slack_channels.join_missing(connector, provider, creds, rows)
        if slack_channels.history_due(connector, now):
            names = naming.covered_names(connector)
            linked = functools.cache(lambda: linked_members(connector))
            slack_catchup.run(
                connector,
                provider,
                creds,
                rows,
                now=now,
                counts=counts,
                names=names,
                linked=linked,
            )
    except (ProviderError, ValueError, KeyError) as exc:
        return _failed(connector, exc)
    _synced(connector, counts, cursor=connector.sync_cursor, now=now)
    return counts


def sync_connector(connector):
    """One pass for one connector. Returns the summary counts. Marks the
    connector when the provider needs the admin to reconnect."""
    if not connector.has_credentials or not connector.is_enabled:
        return _nothing()
    if connector.provider == Connector.Provider.SLACK:
        return sync_conversations(connector)
    provider = get_provider(connector.provider)
    try:
        creds = connector.get_credentials()
        remotes, cursor, creds = provider.fetch_tickets(
            connector.config, creds, connector.sync_cursor
        )
    except (ProviderError, ValueError, KeyError) as exc:
        return _failed(connector, exc)
    counts, created = file_tickets(connector, remotes)
    connector.set_credentials(creds)
    _synced(connector, counts, cursor=cursor, now=timezone.now())
    classify_new(connector, created)
    return counts
