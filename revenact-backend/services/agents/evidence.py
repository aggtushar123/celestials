"""What an agent may know on one pass, indexed for validation (spec §1.2,
Decisions 2 and 3)."""

import datetime
import json
import re
from dataclasses import dataclass, field

from django.db.models import Exists, F, OuterRef, Q
from django.utils import timezone

from services.accounts.hierarchy import subtree_ids
from services.accounts.models import User
from services.attributes.models import AIAttribute, AIAttributeValue
from services.customers.models import Account, Customer, Note, Task
from services.customers.personal import visible_notes, visible_tasks
from services.customers.scoping import (
    SystemActor,
    live_customers,
    visible_accounts,
    visible_customers,
)


@dataclass
class Context:
    organisation: object
    agent: str
    today: object
    #: ref ("customer:12") -> row
    records: dict = field(default_factory=dict)
    #: user id -> {"id", "name"}
    members: dict = field(default_factory=dict)
    #: task id -> {"id", "record" (ref), "title", "assignee_id", "due_date", "status"}
    tasks: dict = field(default_factory=dict)
    #: note id -> {"record" (ref), "title"}, for the notes the evidence shows
    notes: dict = field(default_factory=dict)
    #: attribute id -> {"id", "name", "type", "options", "applies_to"}
    attributes: dict = field(default_factory=dict)
    #: the Ops agent's figures (`metrics.proposals.build_evidence`), else None
    figures: dict | None = None
    #: email id -> {"id", "record", "line", "to", "subject", "title"}: each CS
    #: or Sales record's newest unanswered customer email (contract, draft.reply)
    emails: dict = field(default_factory=dict)
    #: ticket id -> {"id", "record", "line", "number", "title"}
    tickets: dict = field(default_factory=dict)
    #: the book's owners with a connected mailbox
    mailboxes: set = field(default_factory=set)
    #: template id -> {"id", "name", "kind", "milestones", "tasks"}: what every
    #: member may start (contract, plan.start)
    templates: dict = field(default_factory=dict)
    #: segment id -> {"id", "name", "kind"}: the workspace-shared segments the
    #: Ops agent must not build again (contract, builder evidence)
    segments: dict = field(default_factory=dict)
    #: product id -> name, for a segment's `product` field (Ops only)
    products: dict = field(default_factory=dict)
    #: Delivery 2: the ref whose block carries a thread, and the thread's lines
    #: (contract D2-13). None and [] on the nightly pass.
    thread_ref: str | None = None
    thread_lines: list = field(default_factory=list)
    #: the SignalThread this context answers (None on the nightly pass): only
    #: its own rejected message bundles keep their titles (§5.2)
    thread_id: int | None = None
    #: Agent bundles D3 (contract D3-18), filled by Task 17 of the D3 plan:
    #: the thread's newest customer email a reply answers, its ticket (Jira
    #: and other ticket tools), its Slack conversation (Slack escalations D1,
    #: SE1-13: {"id", "record", "connector_id", "channel", "channel_name",
    #: "thread_ts", "usable"}), its own channel ("email", "ticket" or
    #: "slack"), and the workspace's Jira connector ({"id", "project"}) a Jira
    #: step goes through.
    thread_email: dict | None = None
    thread_ticket: dict | None = None
    thread_slack: dict | None = None
    thread_channel: str | None = None
    jira_connector: dict | None = None
    #: Slack escalations D4: the thread's Escalation while its answer is placed
    #: (`escalation.read`), else None. Kinds read it to shape an escalation's steps.
    escalation: object | None = None
    #: Slack bundles (owner, 2026-10-17), set only by `slack_bundles.context_for`:
    #: the Slack message a person sent to Work ({"id", "connector_id",
    #: "channel", "ts", "thread_ts", "direct"}), the segments of the record's
    #: kind they own and may change ({id: {"id", "name", "kind", "state"}}),
    #: the Organisations scenarios they may run ({id: {"id", "name"}}), and the
    #: position of the bundle's jira.create step once placed (None before).
    slack_message: dict | None = None
    editable_segments: dict = field(default_factory=dict)
    scenarios: dict = field(default_factory=dict)
    issue_step: int | None = None
    _users: dict = field(default_factory=dict, repr=False)
    _instances: dict = field(default_factory=dict, repr=False)
    #: ref (or None for the figures) -> [(line, normalised line)]
    _normalised: dict = field(default_factory=dict, repr=False)
    #: ref -> the active members who may open that record
    _openers: dict = field(default_factory=dict, repr=False)

    def member(self, pk):
        """The active member `pk` of the workspace, if the evidence lists them."""
        if pk not in self.members:
            return None
        if pk not in self._users:
            self._users[pk] = User.objects.filter(
                pk=pk, organisation=self.organisation, is_active=True
            ).first()
        return self._users[pk]

    def instance(self, ref):
        """The workspace's own Customer or Account `ref` names, else None."""
        if ref not in self._instances:
            kind, _, pk = str(ref).partition(":")
            found = None
            if pk.isdigit() and kind == "customer":
                found = Customer.objects.filter(pk=int(pk), organisation=self.organisation).first()
            elif pk.isdigit() and kind == "account":
                # Account has no organisation FK: reach it through its customers.
                mine = Customer.objects.filter(organisation=self.organisation).values("pk")
                inside = Account.customers.through.objects.filter(customer_id__in=mine).values(
                    "account_id"
                )
                found = Account.objects.filter(pk=int(pk), id__in=inside).first()
            self._instances[ref] = found
        return self._instances[ref]


#: Most records one agent is shown (Decision 2).
RECORD_LIMIT = 15
TASKS_PER_RECORD = 5
NOTES_PER_RECORD = 3
#: Rows read per owner group before the per-record cap, so a record with
#: thousands of notes does not pull them all.
FETCH_FACTOR = 4
FUNCTION = {"cs": User.Function.CS, "sales": User.Function.SALES}


def book(organisation, agent):
    """(organisations, accounts) the agent looks at: the function's own
    people's for CS and Sales, the whole workspace for Ops. `id IN`
    subqueries, never a join made unique with DISTINCT."""
    # SOC2:AUTH-02 a scheduled job reads as the workspace itself, never as a person
    customers = live_customers(SystemActor(organisation))
    linked = Account.customers.through.objects.filter(
        customer_id__in=customers.values("id")
    ).values("account_id")
    accounts = Account.objects.filter(id__in=linked)
    function = FUNCTION.get(agent)
    if function is not None:
        mine = Q(owner__function=function, owner__is_active=True)
        customers = customers.filter(mine)
        accounts = accounts.filter(mine)
    return customers, accounts


def _ordered(queryset, arr):
    """Nearest renewal first (none last), then the highest ARR, then id."""
    return queryset.select_related("owner").order_by(
        F("renewal_date").asc(nulls_last=True), F(arr).desc(), "id"
    )


def _sort_key(item):
    kind, record = item
    arr = record.arr_billed_at_account if kind == "customer" else record.arr
    return (record.renewal_date or datetime.date.max, -(arr or 0), kind, record.pk)


def _row(record, kind):
    owner = record.owner
    return {
        "ref": f"{kind}:{record.pk}",
        "kind": kind,
        "id": record.pk,
        "name": record.name,
        "owner": None if owner is None else {"id": owner.pk, "name": owner.name},
        "lifecycle": record.lifecycle_stage,
        "renewal_date": None if record.renewal_date is None else record.renewal_date.isoformat(),
        "health": record.health_category,
        "arr": float(record.arr_billed_at_account) if kind == "customer" else None,
        "attributes": [],
        "tasks": [],
        "notes": [],
        "email": None,
        "ticket": None,
        "plans": [],
        "people": None,
        "rejected": [],
    }


def build(organisation, agent, *, today):
    """Everything the agent may know on this pass, as a Context."""
    ctx = Context(organisation, agent, today)
    customers, accounts = book(organisation, agent)
    merged = [("customer", r) for r in _ordered(customers, "arr_billed_at_account")[:RECORD_LIMIT]]
    merged += [("account", r) for r in _ordered(accounts, "arr")[:RECORD_LIMIT]]
    merged.sort(key=_sort_key)
    picked = merged[:RECORD_LIMIT]
    owners = {}
    for kind, record in picked:
        row = _row(record, kind)
        ctx.records[row["ref"]] = row
        owners[row["ref"]] = record.owner
    customer_ids = [r.pk for k, r in picked if k == "customer"]
    account_ids = [r.pk for k, r in picked if k == "account"]

    ctx.members = {
        u.pk: {"id": u.pk, "name": u.name}
        for u in User.objects.filter(organisation=organisation, is_active=True).order_by("name")
    }
    _attributes(ctx, customer_ids, account_ids)
    _tasks_and_notes(ctx, owners)
    _people(ctx, customer_ids, account_ids)
    _rejected(ctx, customer_ids, account_ids, timezone.now())
    if agent in FUNCTION:
        _mail_and_tickets(ctx, owners)
        _templates(ctx)
        _open_plans(ctx, customer_ids, account_ids)
        _jira(ctx)
    if agent == "ops":
        from services.metrics.proposals import NothingToProposeFrom, build_evidence

        _templates(ctx)
        _shared_segments(ctx)
        _products(ctx)
        try:
            ctx.figures = build_evidence(organisation)
        except NothingToProposeFrom:
            ctx.figures = None
    return ctx


def _ref(kind, pk):
    return f"{kind}:{pk}"


def _ref_of(obj):
    return _ref("customer", obj.customer_id) if obj.customer_id else _ref("account", obj.account_id)


def _attributes(ctx, customer_ids, account_ids):
    for attribute in AIAttribute.objects.filter(organisation=ctx.organisation):
        applies = tuple(
            kind
            for kind, flag in (
                ("customer", attribute.applies_to_customer),
                ("account", attribute.applies_to_account),
            )
            if flag
        )
        ctx.attributes[attribute.pk] = {
            "id": attribute.pk,
            "name": attribute.name,
            "api_name": attribute.api_name,
            "type": attribute.value_type,
            "options": list(attribute.picklist_options or []),
            "applies_to": applies,
        }
    seen = set()
    values = AIAttributeValue.objects.filter(
        Q(customer_id__in=customer_ids) | Q(account_id__in=account_ids),
        attribute__organisation=ctx.organisation,
    ).order_by("-computed_at", "-id")
    for value in values:
        ref = _ref_of(value)
        attribute = ctx.attributes.get(value.attribute_id)
        if attribute is None or ref not in ctx.records or (ref, value.attribute_id) in seen:
            continue
        if ctx.records[ref]["kind"] not in attribute["applies_to"]:
            continue
        seen.add((ref, value.attribute_id))
        ctx.records[ref]["attributes"].append(
            {
                "id": value.attribute_id,
                "name": attribute["name"],
                "type": attribute["type"],
                "options": attribute["options"],
                "value": value.value,
            }
        )


def _on(refs):
    """Rows on any of these refs, as an `id IN` filter on each parent."""
    ids = {"customer": [], "account": []}
    for ref in refs:
        kind, _, pk = ref.partition(":")
        ids[kind].append(int(pk))
    return Q(customer_id__in=ids["customer"]) | Q(account_id__in=ids["account"])


def _people(ctx, customer_ids, account_ids):
    """Each record's people line: counts by role, never a name, so every
    agent may see it (contract, canvas.create)."""
    from services.customers.models import Contact

    from .people import people_line, record_people

    found = record_people(Contact.objects.all(), customer_ids, account_ids)
    for ref, row in ctx.records.items():
        row["people"] = people_line(found.get(ref, {}))


def _tasks_and_notes(ctx, owners):
    """Personal rules follow the record's owner, not the broadest member:
    only tasks and notes the owner may read (the owner or someone below them,
    or nobody) reach the model. Ownerless records show only unowned rows."""
    groups = {}
    for ref, owner in owners.items():
        groups.setdefault(None if owner is None else owner.pk, []).append(ref)
    for owner_id, refs in groups.items():
        mine = {owner_id, *subtree_ids(owners[refs[0]])} if owner_id is not None else set()
        # SOC2:AUTH-02 personal tasks and notes follow the record owner's chain
        task_rule = (
            Q(created_by__isnull=True, assignee__isnull=True)
            | Q(created_by_id__in=mine)
            | Q(assignee_id__in=mine)
        )
        note_rule = Q(author__isnull=True) | Q(author_id__in=mine)
        cap = len(refs) * FETCH_FACTOR
        tasks = (
            Task.objects.filter(_on(refs), task_rule, plan__isnull=True)
            .exclude(status=Task.Status.COMPLETED)
            .select_related("assignee")
            .order_by("due_date", "id")[: cap * TASKS_PER_RECORD]
        )
        for task in tasks:
            ref = _ref_of(task)
            row = ctx.records[ref]
            if len(row["tasks"]) >= TASKS_PER_RECORD:
                continue
            row["tasks"].append(task.pk)
            ctx.tasks[task.pk] = {
                "id": task.pk,
                "record": ref,
                "title": task.title,
                "assignee_id": task.assignee_id,
                "assignee": None if task.assignee is None else task.assignee.name,
                "due_date": task.due_date.isoformat(),
                "status": task.status,
            }
        notes = (
            Note.objects.filter(_on(refs), note_rule)
            .order_by("-logged_at", "-id")
            .only("id", "title", "customer_id", "account_id")[: cap * NOTES_PER_RECORD]
        )
        for note in notes:
            row = ctx.records[_ref_of(note)]
            if len(row["notes"]) < NOTES_PER_RECORD:
                row["notes"].append(note.title)
                ctx.notes[note.pk] = {"record": _ref_of(note), "title": note.title}


#: How much of a customer's words one evidence line quotes.
QUOTE_CHARS = 300
#: How long a ticket answered by an applied draft reply is not drafted again.
TICKET_REDRAFT_DAYS = 7


def _sender(email):
    name = email.sender_name.strip()
    return f"{name} <{email.from_address}>" if name else email.from_address


def _reply_subject(subject):
    return (subject if subject.lower().startswith("re:") else f"Re: {subject}")[:255]


def email_line(email, chars=QUOTE_CHARS):
    return (
        f"    email {email.pk}: from {_q(_sender(email))}, subject {_q(email.subject)}, "
        f"{email.sent_at.date().isoformat()}, unanswered: {_q(email.body[:chars])}"
    )


def ticket_line(ticket, chars=QUOTE_CHARS):
    who = ticket.requester_name or ticket.requester_email or "someone"
    return (
        f"    ticket {ticket.pk} {_q(ticket.ticket_number)}: {_q(ticket.title)}, "
        f"open since {ticket.opened_at.isoformat()}, from {_q(who)}: "
        f"{_q(ticket.description[:chars])}"
    )


#: A ticket, email or message line's own ids, which only the model needs: it
#: quotes them back (a draft reply names its source by id).
_IDS = re.compile(r'^\s*(ticket|email|message) \d+(?: ("(?:[^"\\]|\\.)*"))?:')


def shown(line):
    """An evidence line as people read it: a ticket named by its number
    (its title follows; a ticket without one is named by that), an email
    or a message without our id. The stored line keeps the ids."""
    line = str(line)
    found = _IDS.match(line)
    if found is None:
        return line
    kind, number = found.group(1), found.group(2)
    name = json.loads(number) if number else ""
    head = f"{kind} {name}:" if name else f"{kind}:"
    return head + line[found.end() :]


#: A thread's messages the model reads, and how much of each (contract D2-13).
THREAD_MESSAGES = 8
#: Slack escalations D4 (SE4-28): a Slack thread is read whole, its decision may be anywhere in it.
SLACK_MESSAGES = 50
MESSAGE_CHARS = 600


def message_line(email):
    """One earlier message of a mail thread, quoted as data."""
    from services.customers.models import Email

    who = "we wrote" if email.direction == Email.Direction.SENT else f"from {_q(_sender(email))}"
    when = email.sent_at.isoformat(timespec="minutes")
    return f"    message {email.pk}: {who}, {when}: {_q(email.body[:MESSAGE_CHARS])}"


def slack_line(message, n, config=None, people=None):
    """One message of a Slack conversation, quoted as data (SE1-13): our own
    bot's post as "we wrote" (I3), anyone else's, another app's included,
    under their own name; a mention of one of `people` as "@<name>" (CC-14)."""
    from services.connectors.providers.slack import ours, ts_time
    from services.connectors.slack_text import named

    bot = (config or {}).get("bot_name", "")
    if message.get("via_app"):
        # SE4-16: our reply posted with a person's own token
        who = f"we wrote (as {_q(message.get('name') or 'a teammate')})"
    else:
        who = (
            f"we wrote ({bot or 'the Slack app'})"
            if ours(message, config)
            else f"from {_q(message.get('name') or 'someone')}"
        )
    when = ts_time(message["ts"]).isoformat(timespec="minutes")
    text = named(str(message.get("text", "")), people)[:MESSAGE_CHARS]
    return f"    message {n}: {who}, {when}: {_q(text)}"


def people_line(people):
    """SE4-24: who each Slack id in the thread is, names only."""
    named = [f"<@{uid}> is {_q(p.get('name') or 'someone')}" for uid, p in people.items()]
    return f"    slack people: {'; '.join(named)}" if named else ""


def build_for_thread(organisation, agent, thread, route, *, today):
    """What an agent may know about one thread (contract D2-13): its record's
    block as the bundle's recipient may read it, and the thread's newest
    messages. Nothing from any other record (§5.2)."""
    record = thread.record
    kind = "account" if isinstance(record, Account) else "customer"
    ctx = Context(organisation, agent, today)
    row = _row(record, kind)
    ctx.records[row["ref"]] = row
    ctx.thread_ref = row["ref"]
    ctx.thread_id = thread.pk
    customer_ids = [record.pk] if kind == "customer" else []
    account_ids = [record.pk] if kind == "account" else []
    ctx.members = {
        u.pk: {"id": u.pk, "name": u.name}
        for u in User.objects.filter(organisation=organisation, is_active=True).order_by("name")
    }
    _attributes(ctx, customer_ids, account_ids)
    # SOC2:AUTH-02 tasks and notes follow the recipient (D2-13): the owner's
    # chain, or only ownerless rows for a department or Unassigned bundle
    _tasks_and_notes(ctx, {row["ref"]: route.user})
    _people(ctx, customer_ids, account_ids)
    _rejected(ctx, customer_ids, account_ids, timezone.now())
    _templates(ctx)
    _open_plans(ctx, customer_ids, account_ids)
    _thread(ctx, thread, row, route)
    _jira(ctx)
    return ctx


def _shared(conversation):
    """SE4-7, SC3-12: the conversation's flag, else its channel row's (one query)."""
    from services.connectors.models import SlackChannel

    if conversation.external_shared:
        return True
    if conversation.connector_id is None:
        return False
    return SlackChannel.objects.filter(
        connector_id=conversation.connector_id,
        channel_id=conversation.channel,
        external_shared=True,
    ).exists()


def _thread(ctx, thread, row, route):
    """The thread's lines; a draft reply's source only where one may be
    written (D2-14): the owner's own connected mailbox, or an owner-routed
    ticket."""
    from services.customers.models import Email
    from services.mail.models import MailboxConnection

    from .models import SignalThread

    owner = route.user
    if thread.source_kind == SignalThread.SourceKind.MAIL:
        emails = list(
            Email.objects.filter(
                _on([row["ref"]]), mailbox_id=thread.mailbox_id, thread_id=thread.mail_thread
            ).order_by("-sent_at", "-id")[:THREAD_MESSAGES]
        )[::-1]
        if not emails:
            return
        newest = emails[-1]
        ctx.thread_lines = [message_line(e) for e in emails[:-1]]
        # a message we sent is not an unanswered customer message
        sent = newest.direction == Email.Direction.SENT
        ctx.thread_lines.append(message_line(newest) if sent else email_line(newest, MESSAGE_CHARS))
        ctx.thread_channel = "email"
        if newest.direction == Email.Direction.RECEIVED and newest.from_address:
            # D3-18: the email a reply answers, whoever's mailbox it went to.
            ctx.thread_email = {
                "id": newest.pk,
                "record": row["ref"],
                "line": ctx.thread_lines[-1],
                "address": newest.from_address,
                "subject": _reply_subject(newest.subject),
                "mailbox_id": newest.mailbox_id,
            }
        draftable = (
            owner is not None
            and newest.direction == Email.Direction.RECEIVED
            and newest.mailbox_owner_id == owner.pk
            and newest.from_address
            and MailboxConnection.objects.filter(
                user=owner, status=MailboxConnection.Status.CONNECTED
            ).exists()
        )
        if draftable:
            ctx.mailboxes = {owner.pk}
            row["email"] = newest.pk
            ctx.emails[newest.pk] = {
                "id": newest.pk,
                "record": row["ref"],
                "line": ctx.thread_lines[-1],
                "to": _sender(newest),
                "subject": _reply_subject(newest.subject),
                "title": newest.subject,
            }
        return
    if thread.source_kind == SignalThread.SourceKind.SLACK:
        # SE1-21: only this filed conversation's own messages are read
        conversation = thread.conversation
        if conversation is None:
            return
        messages = conversation.messages or []
        shown = messages[-SLACK_MESSAGES:]
        first = len(messages) - len(shown) + 1
        connector = conversation.connector
        config = (connector.config or {}) if connector is not None else {}
        people = conversation.people or {}
        ctx.thread_lines = [slack_line(m, first + i, config, people) for i, m in enumerate(shown)]
        ctx.thread_channel = "slack"
        ctx.thread_slack = {
            "id": conversation.pk,
            "record": row["ref"],
            "connector_id": conversation.connector_id,
            "channel": conversation.channel,
            "channel_name": conversation.channel_name,
            "thread_ts": conversation.thread_ts,
            # D3-18: a tool is offered only while it is connected
            "usable": connector is not None and _usable(connector),
            # SE4-7: shared outside, read now (the conversation's own flag or its
            # channel row's, SC3-12)
            "external_shared": _shared(conversation),
            "started_by_id": conversation.started_by_id,
            "started_by_name": (
                conversation.started_by.name
                if conversation.started_by_id
                else conversation.started_by_name
            ),
            "url": conversation.url,
            # SE4-22, SE4-25: what the decision and the participants are read from
            "messages": shown,
            "first": first,
            "people": dict(conversation.people or {}),
        }
        return
    ticket = thread.ticket
    if ticket is None:
        return
    line = ticket_line(ticket, MESSAGE_CHARS)
    ctx.thread_lines = [line]
    ctx.thread_channel = "ticket"
    connector = ticket.connector
    ctx.thread_ticket = {
        "id": ticket.pk,
        "record": row["ref"],
        "line": line,
        "provider": connector.provider if connector is not None else "",
        "connector_id": ticket.connector_id,
        "external_id": ticket.external_id,
        "number": ticket.ticket_number,
        "config": dict(connector.config or {}) if connector is not None else {},
        # D3-18: a tool is offered only while it is connected (the same rule as `_jira`'s)
        "usable": connector is not None and _usable(connector),
    }
    if owner is not None:
        row["ticket"] = ticket.pk
        ctx.tickets[ticket.pk] = {
            "id": ticket.pk,
            "record": row["ref"],
            "line": line,
            "number": ticket.ticket_number,
            "title": ticket.title,
        }


def _usable(connector):
    """Enabled, with credentials and not in error: a connector a step may go
    through (read only or not: a read-only one shows its step disabled)."""
    from services.connectors.models import Connector

    return (
        connector.is_enabled
        and bool(connector.credentials)
        and connector.status != Connector.Status.ERROR
    )


def _jira(ctx):
    """D3-18 (contract §2.3): the Jira connector a Jira step goes through: the
    thread's own when it came from Jira and is usable, else the workspace's
    oldest enabled one with credentials and not in error. None without one."""
    from services.connectors.models import Connector

    ticket = ctx.thread_ticket
    if ticket is not None and ticket["provider"] == Connector.Provider.JIRA and ticket["usable"]:
        ctx.jira_connector = {
            "id": ticket["connector_id"],
            "project": (ticket["config"] or {}).get("project", ""),
        }
        return
    row = (
        Connector.objects.filter(
            organisation=ctx.organisation, provider=Connector.Provider.JIRA, is_enabled=True
        )
        .exclude(credentials="")
        .exclude(status=Connector.Status.ERROR)
        .order_by("pk")
        .values("pk", "config")
        .first()
    )
    ctx.jira_connector = (
        {"id": row["pk"], "project": (row["config"] or {}).get("project", "")} if row else None
    )


def _mail_and_tickets(ctx, owners):
    """Each record's newest unanswered customer email in its owner's own
    connected mailbox, and its newest open ticket the owner may read
    (contract, draft.reply). A source with an open draft is left out: it is
    drafted. So is one already answered by an applied draft reply: an email
    for good (a new customer email is a new source), a ticket for
    TICKET_REDRAFT_DAYS. `id IN` filters, no DISTINCT."""
    from django.db.models import BigIntegerField, Exists, OuterRef
    from django.db.models.fields.json import KeyTextTransform
    from django.db.models.functions import Cast
    from django.utils import timezone

    from services.customers.models import Email, ReplyDraft, Ticket
    from services.customers.personal import visible_tickets
    from services.mail.models import MailboxConnection
    from services.metrics.models import AgentAction

    groups = {}
    for ref, owner in owners.items():
        if owner is not None:
            groups.setdefault(owner.pk, []).append(ref)
    ctx.mailboxes = set(
        MailboxConnection.objects.filter(
            user_id__in=sorted(groups), status=MailboxConnection.Status.CONNECTED
        ).values_list("user_id", flat=True)
    )
    drafted = ReplyDraft.objects.filter(
        status__in=[ReplyDraft.Status.OPEN, ReplyDraft.Status.SENDING]
    )
    answered = AgentAction.objects.filter(
        organisation=ctx.organisation,
        kind=AgentAction.Kind.DRAFT_REPLY,
        status=AgentAction.Status.APPLIED,
    )

    def answered_ids(key, **since):
        # Never a NULL in the subquery: NOT IN with a NULL leaves nothing out.
        source = Cast(KeyTextTransform(key, "payload"), output_field=BigIntegerField())
        return (
            answered.filter(**since)
            .annotate(source_id=source)
            .filter(source_id__isnull=False)
            .values("source_id")
        )

    answered_emails = answered_ids("email_id")
    recent = timezone.now() - datetime.timedelta(days=TICKET_REDRAFT_DAYS)
    answered_tickets = answered_ids("ticket_id", applied_at__gte=recent)
    newer = Email.objects.filter(
        mailbox_owner_id=OuterRef("mailbox_owner_id"),
        thread_id=OuterRef("thread_id"),
        sent_at__gt=OuterRef("sent_at"),
    )
    for owner_id, refs in groups.items():
        cap = len(refs) * FETCH_FACTOR
        if owner_id in ctx.mailboxes:
            # SOC2:AUTH-02 only the owner's own mail: the draft goes out from their mailbox
            emails = (
                Email.objects.filter(
                    _on(refs), direction=Email.Direction.RECEIVED, mailbox_owner_id=owner_id
                )
                .exclude(thread_id="")
                .exclude(from_address="")
                .filter(~Exists(newer))
                .exclude(id__in=drafted.filter(email__isnull=False).values("email_id"))
                .exclude(id__in=answered_emails)
                .order_by("-sent_at", "-id")[:cap]
            )
            for email in emails:
                ref = _ref_of(email)
                if ctx.records[ref]["email"] is not None:
                    continue
                ctx.records[ref]["email"] = email.pk
                ctx.emails[email.pk] = {
                    "id": email.pk,
                    "record": ref,
                    "line": email_line(email),
                    "to": _sender(email),
                    "subject": _reply_subject(email.subject),
                    "title": email.subject,
                }
        # SOC2:AUTH-02 a ticket follows the owner's department rule
        tickets = (
            visible_tickets(owners[refs[0]], Ticket.objects.filter(_on(refs)))
            .exclude(status__in=Ticket.RESOLVED_STATUSES)
            .exclude(id__in=drafted.filter(ticket__isnull=False).values("ticket_id"))
            .exclude(id__in=answered_tickets)
            .order_by("-opened_at", "-id")[:cap]
        )
        for ticket in tickets:
            ref = _ref_of(ticket)
            if ctx.records[ref]["ticket"] is not None:
                continue
            ctx.records[ref]["ticket"] = ticket.pk
            ctx.tickets[ticket.pk] = {
                "id": ticket.pk,
                "record": ref,
                "line": ticket_line(ticket),
                "number": ticket.ticket_number,
                "title": ticket.title,
            }


def _q(text):
    """Free text, quoted and escaped: a customer's words stay data."""
    return json.dumps(text, ensure_ascii=False)


#: Most templates the prompt lists, and open plans per record.
TEMPLATE_LIMIT = 20
PLANS_PER_RECORD = 5


def _templates(ctx):
    """The templates every member may read: the built-ins and the
    workspace's shared ones, by name (contract, plan.start)."""
    from services.plans.models import PlanTemplate, Sharing
    from services.plans.validation import task_count

    # SOC2:AUTH-02 never a private or person-shared template: every reader
    # of the action must be able to read the template it names
    rows = PlanTemplate.objects.filter(
        Q(is_builtin=True) | Q(organisation=ctx.organisation, sharing=Sharing.WORKSPACE)
    ).order_by("name", "id")[:TEMPLATE_LIMIT]
    for template in rows:
        ctx.templates[template.pk] = {
            "id": template.pk,
            "name": template.name,
            "kind": template.kind,
            "milestones": len(template.milestones),
            "tasks": task_count(template.milestones),
        }


def template_lines(ctx):
    return [
        f"  template {t['id']}: {_q(t['name'])} ({t['kind']}), "
        f"{t['milestones']} milestones, {t['tasks']} tasks"
        for t in ctx.templates.values()
    ]


#: Most shared segments and products the Ops prompt lists.
SEGMENT_LIMIT = 20
PRODUCT_LIMIT = 50


def _shared_segments(ctx):
    """The workspace's `sharing="workspace"` segments, by name and kind."""
    from services.segments.models import Segment

    # SOC2:AUTH-02 never a private or person-shared segment: the prompt is
    # the whole workspace's, and only what every member may read reaches it
    rows = Segment.objects.filter(
        organisation=ctx.organisation, sharing=Segment.Sharing.WORKSPACE
    ).order_by("name", "id")[:SEGMENT_LIMIT]
    for segment in rows:
        ctx.segments[segment.pk] = {"id": segment.pk, "name": segment.name, "kind": segment.kind}


def segment_lines(ctx):
    return [f"  segment {s['id']}: {_q(s['name'])} ({s['kind']})" for s in ctx.segments.values()]


def _products(ctx):
    from services.customers.models import Product

    rows = Product.objects.filter(organisation=ctx.organisation).order_by("name", "id")
    ctx.products = dict(rows.values_list("id", "name")[:PRODUCT_LIMIT])


def _field_line(field):
    if field.choices:
        return f"{field.key} {field.type} ({'|'.join(field.choices)})"
    return f"{field.key} {field.type}"


def catalogue_lines(ctx):
    """What the Ops agent may build with (contract): segment fields by kind
    with their operators and values, AI attributes by api name, products,
    scenario triggers and steps, contact roles, merge fields and template
    limits. Workspace strings are quoted as data."""
    from services.campaigns.validation import MERGE_FIELDS
    from services.customers.models import Contact, Survey
    from services.plans.models import Kind as TemplateKind
    from services.rules.models import SCORE_RANGES
    from services.segments import registry

    scores = "|".join(f'"{s}"' for s in SCORE_RANGES)
    ranges = ", ".join(f"{s} {low}-{high}" for s, (low, high) in SCORE_RANGES.items())
    surveys = "|".join(f'"{t}"' for t in Survey.SurveyType.values)
    lines = [
        "- segment kinds: customer (organisations), account (accounts), contact (contacts)",
        "- operators: "
        + "; ".join(f"{kind} {'|'.join(ops)}" for kind, ops in registry.OPERATORS.items()),
        "- values: gt and lt take one value; between takes [low, high]; in takes a list of "
        "1-100; within_next and within_last take a number of days from 1 to 3650; dates are "
        '"YYYY-MM-DD"; is_empty and is_not_empty take no value; an owner is a member id or '
        '"unassigned"',
    ]
    for kind, fields in registry.FIELDS.items():
        lines.append(f"- {kind} fields: " + ", ".join(map(_field_line, fields.values())))
    lines.append("- contact rules may also name parent.<an organisation or account field>")
    for attribute in ctx.attributes.values():
        options = _q(attribute["options"]) if attribute["options"] else '"-"'
        lines.append(f"- attr:{attribute['api_name']} {attribute['type']}, options {options}")
    if ctx.products:
        shown = "; ".join(f"{pk}: {_q(name)}" for pk, name in ctx.products.items())
        lines.append(f"- products (id: name): {shown}")
    lines += [
        '- scenario triggers: {"trigger": "entered"} or {"trigger": "left"} (a record joined '
        f'or left the segment today); {{"trigger": "crossed", "score": {scores}, "direction": '
        f'"below"|"above", "threshold": <{ranges}>}} (not for contacts; accounts have no ces); '
        '{"trigger": "schedule", "cadence": "weekly", "weekday": 0-6} or {"trigger": '
        '"schedule", "cadence": "monthly"}',
        '- scenario steps, 1 to 3, each once: {"action": "notify", "to": "me"|"record_owner"|'
        '"people", "people": [member ids], "message": <at most 280>}; {"action": "task", '
        '"title": <at most 200>, "assignee": "record_owner"|"me", "due_in_days": 0-90}; '
        '{"action": "lifecycle", "stage": <a lifecycle stage>} (not for contacts); '
        '{"action": "plan", "template": <a template id under Plan templates>}; '
        f'{{"action": "survey", "survey_type": {surveys}, "subject": <at most 120>, '
        '"intro": <at most 500>, "roles": [contact roles]} (a person reviews every survey '
        "before it is sent). Never a campaign step.",
        "- contact roles: " + ", ".join(Contact.Role.values),
        "- campaign merge fields: " + ", ".join(f"{{{name}}}" for name in MERGE_FIELDS),
        "- template kinds: "
        + ", ".join(TemplateKind.values)
        + "; at most 4 milestones and 12 tasks in all, offsets 0-365 days",
    ]
    return lines


def plan_line(plan):
    from services.plans.models import Plan

    status = Plan.Status(plan.status).label.lower()
    origin = "no template" if plan.template_id is None else f"template {plan.template_id}"
    return f"    plan {plan.pk}: {_q(plan.name)}, {status}, from {origin}"


def _open_plans(ctx, customer_ids, account_ids):
    """Each record's open plans (a plan reads by the record rule, so the
    owner reads them all), so the agent never starts one twice."""
    from services.plans.models import OPEN, Plan

    plans = Plan.objects.filter(
        Q(customer_id__in=customer_ids) | Q(account_id__in=account_ids),
        organisation=ctx.organisation,
        status__in=OPEN,
    ).order_by("created_at", "id")
    for plan in plans:
        row = ctx.records.get(_ref_of(plan))
        if row is not None and len(row["plans"]) < PLANS_PER_RECORD:
            row["plans"].append(
                {
                    "id": plan.pk,
                    "template_id": plan.template_id,
                    "name": plan.name,
                    "line": plan_line(plan),
                }
            )


#: Rejected bundles a record's block names (contract §5.3, D16).
REJECTED_DAYS = 30
REJECTED_PER_RECORD = 3
REJECTED_PREFIX = "rejected: "
#: A draft reply's bundle title may quote a person's own mail or ticket, so
#: it is masked as the feedback log masks it (services/metrics/feedback.py).
DRAFT_TITLE = "A draft reply"
#: A message bundle's title may quote its thread (D2-12, D2-14), which only
#: that thread's readers may read: shown only to a run of that same thread.
MESSAGE_TITLE = "A suggestion from a message"


def rejected_line(bundle, thread_id=None):
    """A rejected bundle's title, reason and date: never its note (D16).
    A bundle annotated `drafted` (it holds a draft reply) shows DRAFT_TITLE;
    a message bundle shows MESSAGE_TITLE unless `thread_id` is its own thread.
    The reason is a fixed choice's label, never free text."""
    from .models import AgentBundle

    if getattr(bundle, "drafted", False):
        title = DRAFT_TITLE
    elif bundle.source == AgentBundle.Source.SLACK_MESSAGE:
        # SOC2:AUTH-02 a Slack message's bundle is its sender's alone: its title
        # may quote the message, which no other reader may read
        title = MESSAGE_TITLE
    elif bundle.source == AgentBundle.Source.THREAD and (
        thread_id is None or bundle.thread_id != thread_id
    ):
        # SOC2:AUTH-02 the model reads only what the recipient may read
        # (D2 contract §5.2): another thread's text is not theirs to read
        title = MESSAGE_TITLE
    else:
        title = bundle.title
    label = dict(AgentBundle.RejectReason.choices).get(bundle.reject_reason, "Other")
    day = bundle.updated_at.date().isoformat()
    return f"    {REJECTED_PREFIX}{_q(title)} ({label}, {day})"


def _rejected(ctx, customer_ids, account_ids, now):
    """This agent's bundles on the book's records rejected in the last 30
    days, newest first, three per record: their title (masked for a draft
    reply) and reason, never the note (D16)."""
    from services.metrics.models import AgentAction

    from .models import AgentBundle

    drafts = AgentAction.objects.filter(bundle=OuterRef("pk"), kind=AgentAction.Kind.DRAFT_REPLY)
    rows = (
        AgentBundle.objects.filter(
            organisation=ctx.organisation,
            # Feedback is for the agent that proposed the bundle.
            agent=ctx.agent,
            status=AgentBundle.Status.REJECTED,
            updated_at__gte=now - datetime.timedelta(days=REJECTED_DAYS),
        )
        .filter(Q(customer_id__in=customer_ids) | Q(account_id__in=account_ids))
        .only(
            "title",
            "reject_reason",
            "updated_at",
            "customer_id",
            "account_id",
            "source",
            "thread_id",
        )
        .annotate(drafted=Exists(drafts))
        .order_by("-updated_at", "-id")
    )
    for bundle in rows:
        row = ctx.records.get(_ref_of(bundle))
        if row is not None and len(row["rejected"]) < REJECTED_PER_RECORD:
            row["rejected"].append(rejected_line(bundle, ctx.thread_id))


def record_block(ctx, row):
    """The evidence lines for one record, exactly as the model reads them."""
    owner = _q(row["owner"]["name"]) if row["owner"] else "nobody"
    renewal = row["renewal_date"] or "no renewal date"
    arr = f", ARR {row['arr']:,.0f}" if row["arr"] is not None else ""
    lines = [
        f"- {row['ref']}: {_q(row['name'])}, owner {owner}, lifecycle {row['lifecycle']}, "
        f"renews {renewal}, health {row['health']}{arr}"
    ]
    if row.get("people"):
        lines.append(f"    {row['people']}")
    for a in row["attributes"]:
        lines.append(f"    attribute {a['id']} {_q(a['name'])} = {_q(a['value'])}")
    for task_id in row["tasks"]:
        task = ctx.tasks[task_id]
        who = _q(task["assignee"]) if task["assignee"] else "nobody"
        lines.append(
            f"    task {task_id}: {_q(task['title'])}, assigned to {who},"
            f" due {task['due_date']}, {task['status']}"
        )
    lines.extend(f"    note: {_q(title)}" for title in row["notes"])
    if ctx.thread_ref is not None and row["ref"] == ctx.thread_ref:
        # Delivery 2: the conversation, oldest first (its newest email or the
        # ticket is a draft reply's source when `_thread` allowed one).
        lines.extend(ctx.thread_lines)
        slack = ctx.thread_slack
        if slack is not None and slack.get("people"):
            # SE4-28: the model reads who <@U...> is
            lines.append(people_line(slack["people"]))
    else:
        if row.get("email") is not None:
            lines.append(ctx.emails[row["email"]]["line"])
        if row.get("ticket") is not None:
            lines.append(ctx.tickets[row["ticket"]]["line"])
    lines.extend(plan["line"] for plan in row.get("plans", []))
    lines.extend(row.get("rejected", []))
    return lines


def figure_lines(ctx):
    if ctx.figures is None:
        return []
    from services.metrics.proposals import build_prompt

    return build_prompt(ctx.figures).split("\n")


def record_lines(ctx, ref):
    """The lines an action on `ref` may quote as evidence (stripped), or the
    workspace figures' lines when `ref` is None (initiative.create)."""
    if ref is None:
        lines = figure_lines(ctx)
    elif ref in ctx.records:
        lines = record_block(ctx, ctx.records[ref])
    else:
        lines = []
    # A rejection line is read, never cited (contract §5.3).
    stripped = (line.strip() for line in lines)
    return {line for line in stripped if line and not line.startswith(REJECTED_PREFIX)}


#: The shortest quoted fragment matched inside a line rather than whole.
FRAGMENT = 12


def normalise(text):
    """An evidence line as compared: no leading "- ", no quotes, single
    spaces, casefolded. The model often drops the quoting or the bullet."""
    text = str(text).strip()
    if text.startswith("- "):
        text = text[2:]
    text = text.replace('"', "").strip().strip("'")
    return " ".join(text.split()).casefold()


def _normalised_lines(ctx, ref):
    if ref not in ctx._normalised:
        ctx._normalised[ref] = [(line, normalise(line)) for line in sorted(record_lines(ctx, ref))]
    return ctx._normalised[ref]


def match_line(ctx, ref, quoted):
    """The line of `ref`'s own evidence (the figures' for None) that `quoted`
    cites, or None. A quote matches a line equal to it once both are
    normalised, or is a fragment (at least FRAGMENT characters) of exactly one
    of the record's own lines and of no other record's: a line quoted from
    another record never lands on this one."""
    wanted = normalise(quoted)
    if not wanted:
        return None
    own = _normalised_lines(ctx, ref)
    for line, normal in own:
        if normal == wanted:
            return line
    if len(wanted) < FRAGMENT:
        return None
    hits = [line for line, normal in own if wanted in normal]
    if len(hits) != 1:
        return None
    for other in ctx.records:
        if other != ref and any(wanted in normal for _, normal in _normalised_lines(ctx, other)):
            return None
    return hits[0]


#: The shortest record name, and the shortest task or note title (with at
#: least TITLE_WORDS words), the mention guard looks for: shorter ones are
#: too generic ("Art", "Call") to say anything about another record.
NAME_MIN = 3
TITLE_MIN = 12
TITLE_WORDS = 2


def _mentions(term, text):
    """`term` as whole words in `text`, case-insensitive."""
    return re.search(rf"(?<!\w){re.escape(term)}(?!\w)", text, re.IGNORECASE) is not None


def _telling_title(title):
    return len(title) >= TITLE_MIN and len(title.split()) >= TITLE_WORDS


def foreign_mentions(ctx, ref, texts):
    """Whether any of `texts` names something from outside `ref`'s own block,
    as whole words: another book record's name (record-level actions only),
    or a task or note title, an email subject or a ticket title that the
    evidence holds but `ref`'s own block does not. Names under NAME_MIN
    characters and short or one-word titles are ignored."""
    text = " ".join(str(t) for t in texts if t).casefold()
    own = ctx.records.get(ref) if ref is not None else None
    if own is not None:
        mine = own["name"].casefold()
        if mine:
            # A longer own name may contain a shorter other one.
            text = re.sub(rf"(?<!\w){re.escape(mine)}(?!\w)", " ", text)
        for other_ref, row in ctx.records.items():
            name = row["name"].casefold().strip()
            if other_ref != ref and len(name) >= NAME_MIN and _mentions(name, text):
                return True
    own_titles = set()
    if own is not None:
        own_titles = {ctx.tasks[t]["title"].casefold() for t in own["tasks"]}
        own_titles |= {title.casefold() for title in own["notes"]}
        own_titles |= {title.casefold() for title in _sources(ctx, ref).values()}
    titles = {task["title"].casefold() for task in ctx.tasks.values() if task["record"] != ref}
    for other_ref, row in ctx.records.items():
        if other_ref != ref:
            titles |= {title.casefold() for title in row["notes"]}
            titles |= {title.casefold() for title in _sources(ctx, other_ref).values()}
    return any(
        _mentions(title.strip(), text)
        for title in titles - own_titles
        if _telling_title(title.strip())
    )


def record_mentions(ctx, texts):
    """Whether `texts` name, as whole words, any record the evidence holds:
    a book record, or an account under the workspace figures. An object a
    builder action makes is read by people who may not open that record, so
    it names none (contract)."""
    text = " ".join(str(t) for t in texts if t).casefold()
    names = {row["name"] for row in ctx.records.values()}
    names |= {a["name"] for a in (ctx.figures or {}).get("accounts", [])}
    return any(
        _mentions(name.casefold().strip(), text) for name in names if len(name.strip()) >= NAME_MIN
    )


def _named(title, text):
    title = title.casefold().strip()
    return _telling_title(title) and _mentions(title, text)


def _openers(ctx, ref):
    """The workspace's active members who may open `ref`'s record."""
    if ref not in ctx._openers:
        record = ctx.instance(ref)
        visible = visible_accounts if str(ref).startswith("account:") else visible_customers
        members = User.objects.filter(organisation=ctx.organisation, is_active=True)
        ctx._openers[ref] = (
            []
            if record is None
            else [m for m in members if visible(m).filter(pk=record.pk).exists()]
        )
    return ctx._openers[ref]


def withheld_mentions(ctx, ref, texts):
    """Whether any of `texts` names, as whole words, a task or note from
    `ref`'s own block that someone who may open `ref` may not read (owner
    decision 2026-10-08). A preview hides such a title per reader; an
    action's free text cannot, so the action is not kept. Short or one-word
    titles are ignored, as in `foreign_mentions`."""
    own = ctx.records.get(ref) if ref is not None else None
    if own is None:
        return False
    text = " ".join(str(t) for t in texts if t).casefold()
    tasks = [pk for pk in own["tasks"] if _named(ctx.tasks[pk]["title"], text)]
    notes = [pk for pk, n in ctx.notes.items() if n["record"] == ref and _named(n["title"], text)]
    if not tasks and not notes:
        return False
    # SOC2:AUTH-02 free text never carries a personal title past its readers
    for reader in _openers(ctx, ref):
        if tasks and visible_tasks(reader, Task.objects.filter(pk__in=tasks)).count() < len(tasks):
            return True
        if notes and visible_notes(reader, Note.objects.filter(pk__in=notes)).count() < len(notes):
            return True
    return False


def _sources(ctx, ref):
    """{"email": subject, "ticket": title} of `ref`'s own block."""
    row = ctx.records.get(ref) if ref is not None else None
    found = {}
    if row is not None and row.get("email") is not None:
        found["email"] = ctx.emails[row["email"]]["title"]
    if row is not None and row.get("ticket") is not None:
        found["ticket"] = ctx.tickets[row["ticket"]]["title"]
    return found


def source_lines(ctx, ref):
    """`ref`'s own email and ticket lines (stripped): only a draft reply may
    cite them, since only its source's readers read it (owner decision 2)."""
    row = ctx.records.get(ref) if ref is not None else None
    if row is None:
        return set()
    if ctx.thread_ref is not None and ref == ctx.thread_ref:
        return {line.strip() for line in ctx.thread_lines}
    lines = set()
    if row.get("email") is not None:
        lines.add(ctx.emails[row["email"]]["line"].strip())
    if row.get("ticket") is not None:
        lines.add(ctx.tickets[row["ticket"]]["line"].strip())
    return lines


def source_mentions(ctx, ref, texts):
    """Whether `texts` name `ref`'s own email subject or ticket title, as
    whole words (a telling title, as in `foreign_mentions`): only a draft
    reply's readers may read those."""
    text = " ".join(str(t) for t in texts if t).casefold()
    return any(_named(title, text) for title in _sources(ctx, ref).values())


def internal_mentions(ctx, ref, texts, channel):
    """Whether text that leaves Revenact (a draft or sent reply, a Slack
    message, a Jira issue: D3-19) names a task or note title from any record,
    its record's open plan, or a source of its record other than `channel`
    (the thread's own; None, as on the nightly pass, makes every source
    internal): internal titles never leave."""
    text = " ".join(str(t) for t in texts if t).casefold()
    titles = [task["title"] for task in ctx.tasks.values()]
    titles += [note["title"] for note in ctx.notes.values()]
    row = ctx.records.get(ref) if ref is not None else None
    titles += [plan["name"] for plan in (row or {}).get("plans", [])]
    titles += [title for kind, title in _sources(ctx, ref).items() if kind != channel]
    return any(_named(title, text) for title in titles)
