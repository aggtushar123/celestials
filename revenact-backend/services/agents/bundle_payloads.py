"""The contract's Bundle and Step shapes (Agent bundles, contract §4), written
for one reader, and the feed row's detail. A step's preview, undo and
evidence are the agents' own rules (`payloads`)."""

from django.db.models import Count, OuterRef, Q, Subquery
from rest_framework import serializers
from rest_framework.exceptions import NotFound

from services.accounts.models import User
from services.customers.models import Customer, Email
from services.customers.scoping import sees_everything
from services.customers.task_changes import person
from services.metrics.models import AgentAction

from . import bulk, guided, placeholders
from .actions.slack_replies import ESCALATION_KEYS
from .bundles import fully_readable, readable, settle_stuck
from .deciding import may_decide
from .evidence import shown
from .models import PERSONAL_SOURCES, AgentBundle, SignalThread
from .outside import gates
from .payloads import preview_for, undo_block
from .registry import REGISTRY
from .source_access import may_read_source

S = AgentAction.Status
B = AgentBundle.Status
NO_SUCH_BUNDLE = "No such bundle."
CANT_RUN_STEP = "You can't run this step."
SOURCE_ONLY = "Only people who can read this {noun} can run this step."
SOURCE_LABELS = dict(AgentBundle.Source.choices)
AGENT_LABELS = dict(AgentAction.Agent.choices)
CHANNEL_LABELS = dict(SignalThread.SourceKind.choices)
DEPARTMENT_LABELS = dict(User.Function.choices)
_stamp = serializers.DateTimeField().to_representation
EMPTY_SOURCE = {
    "channel": None,
    "from": "",
    "messages": 0,
    "last_message_at": None,
    "ticket": None,
    "link": None,
}
NIGHTLY_SOURCE = {"kind": "nightly", "label": "Nightly review", **EMPTY_SOURCE}
#: A message bundle whose thread is gone (its record was deleted).
GONE_SOURCE = {"kind": "thread", "label": "Message", **EMPTY_SOURCE}


def no_such_bundle():
    return NotFound({"code": "NO_SUCH_BUNDLE", "detail": NO_SUCH_BUNDLE})


def bundle_for(reader, pk, *, lock=False):
    """The bundle `pk` if `reader` may read it (contract §8), else 404."""
    rows = AgentBundle.objects.filter(pk=pk)
    if lock:
        rows = rows.select_for_update(of=("self",))
    # SOC2:AUTH-02 a bundle the reader may not read is missing, never forbidden
    bundle = readable(reader, rows).first()
    if bundle is None:
        raise no_such_bundle()
    return bundle


def _stamp_or_none(value):
    return None if value is None else _stamp(value)


def _block(thread):
    mail = thread.source_kind == SignalThread.SourceKind.MAIL
    ticket = thread.ticket
    conversation = thread.conversation
    messages = 1
    link = None
    if mail:
        sender = thread.sender or ""
        messages = thread.messages or 0
    elif conversation is not None:
        # A Slack thread (Slack escalations D1): its poster's name, never an
        # email (SOC2:DATA-04 minimised), and the thread's own link.
        sender = conversation.started_by_name or ""
        messages = len(conversation.messages or []) or 1
        link = conversation.url or None
    elif ticket is not None:
        sender = ticket.requester_email or ticket.requester_name or ""
        link = ticket.external_url or None
    else:
        sender = ""
    return {
        "kind": "thread",
        "label": CHANNEL_LABELS[thread.source_kind],
        "channel": thread.source_kind,
        "from": sender,
        "messages": messages,
        "last_message_at": _stamp(thread.last_message_at),
        "ticket": ticket.ticket_number if ticket is not None else None,
        "link": link,
    }


SLACK_EXCERPT = 280


def _slack_block(row):
    """Slack bundles: the Slack message a bundle answers, for its sender (the
    bundle's only reader): who wrote it, its words and its link."""
    return {
        "kind": "slack_message",
        "label": SOURCE_LABELS[AgentBundle.Source.SLACK_MESSAGE],
        "sender": row.sender_name if row else "",
        "excerpt": row.text[:SLACK_EXCERPT] if row else "",
        "text": row.text if row else "",
        "link": (row.permalink or None) if row else None,
        "at": _stamp(row.created_at) if row else None,
        "private": True,
    }


def _slack_blocks(bundles):
    """{bundle id: its Slack message block}; the page's messages in one query."""
    from services.work.models import SlackSuggestion

    slack = [b for b in bundles if b.source == AgentBundle.Source.SLACK_MESSAGE]
    ids = sorted({b.slack_suggestion_id for b in slack if b.slack_suggestion_id})
    # SOC2:AUTH-02 only the bundle's own message, in its own workspace (dismissed: gone)
    rows = (
        {
            row.pk: row
            for row in SlackSuggestion.objects.filter(
                pk__in=ids, organisation_id__in={b.organisation_id for b in slack}
            )
        }
        if ids
        else {}
    )
    return {b.pk: _slack_block(rows.get(b.slack_suggestion_id)) for b in slack}


def _meeting_blocks(bundles):
    """{bundle id: its meeting block} (sales review report): the meeting a
    meeting bundle prepares for, from its step's payload, for its organiser
    (the bundle's only reader). The page's steps in one query."""
    ids = [b.pk for b in bundles if b.source == AgentBundle.Source.MEETING]
    if not ids:
        return {}
    payloads = {}
    for bundle_id, payload in AgentAction.objects.filter(
        bundle_id__in=ids, kind=AgentAction.Kind.REPORT_SALES
    ).values_list("bundle_id", "payload"):
        payloads[bundle_id] = payload if isinstance(payload, dict) else {}
    out = {}
    for pk in ids:
        payload = payloads.get(pk, {})
        out[pk] = {
            "kind": "meeting",
            "label": SOURCE_LABELS[AgentBundle.Source.MEETING],
            "title": str(payload.get("title") or ""),
            "starts_at": payload.get("starts_at"),
            "ends_at": payload.get("ends_at"),
            "meeting_id": payload.get("meeting_id"),
            "private": True,
        }
    return out


def source_blocks(bundles):
    """{bundle id: its source block} (contract §3.1); a page's threads in one query."""
    slack = {**_slack_blocks(bundles), **_meeting_blocks(bundles)}
    ids = sorted({bundle.thread_id for bundle in bundles if bundle.thread_id})
    found = {}
    if ids:
        # Only the thread's emails filed on the thread's own record, as the
        # evidence reads them (evidence._thread); a NULL parent matches nothing.
        emails = Email.objects.filter(
            Q(customer_id=OuterRef("customer_id")) | Q(account_id=OuterRef("account_id")),
            mailbox_id=OuterRef("mailbox_id"),
            thread_id=OuterRef("mail_thread"),
        )
        rows = (
            SignalThread.objects.filter(pk__in=ids)
            .select_related("ticket", "conversation")
            .annotate(
                messages=Subquery(
                    emails.order_by().values("thread_id").annotate(n=Count("id")).values("n")[:1]
                ),
                sender=Subquery(
                    emails.filter(direction=Email.Direction.RECEIVED)
                    .order_by("-sent_at", "-id")
                    .values("from_address")[:1]
                ),
            )
        )
        found = {thread.pk: _block(thread) for thread in rows}
    return {
        bundle.pk: (
            found.get(bundle.thread_id, GONE_SOURCE)
            if bundle.source == AgentBundle.Source.THREAD
            else slack.get(bundle.pk, NIGHTLY_SOURCE)
        )
        for bundle in bundles
    }


def department_of(bundle):
    if bundle.routed_to != AgentBundle.RoutedTo.DEPARTMENT or not bundle.department:
        return None
    return {
        "key": bundle.department,
        "label": DEPARTMENT_LABELS.get(bundle.department, bundle.department),
    }


def participant_only(reader, bundles):
    """SE4-26: the ids of `bundles` the reader reads only as a participant:
    one query for their participation (the page's), and one more only when
    there is any."""
    ids = {bundle.pk for bundle in bundles}
    page = bulk.active()
    if page is not None:
        # The page's `bundle_ids` holds every bundle with a step; a bundle with
        # no step is never an escalation, so the page's one read is enough.
        joined = page.participating(reader) & ids
    else:
        from .models import BundleParticipant

        joined = set(
            BundleParticipant.objects.filter(user=reader, bundle_id__in=sorted(ids)).values_list(
                "bundle_id", flat=True
            )
        )
    if not joined:
        return set()
    whole = fully_readable(reader, AgentBundle.objects.filter(pk__in=sorted(joined)))
    return joined - set(whole.values_list("pk", flat=True))


def _record_ref(record, can_open=True):
    if record is None:
        return None
    kind = "customer" if isinstance(record, Customer) else "account"
    # SE4-26: a participant who can't open it gets its name, not a way in
    return {"type": kind, "id": record.pk, "name": record.name, "can_open": can_open}


def editable_keys(step):
    """The step's `editable` keys, minus any field holding a placeholder (D12),
    but for a customer-facing field whose placeholders are all open (SE4-6).
    An escalation reply's Jira key and link never hold its text: once moved
    or shared they are no longer open, and the person must be able to take
    them out (the edit itself still refuses adding them there)."""
    spec = REGISTRY[step.kind]
    payload = step.payload if isinstance(step.payload, dict) else {}
    editable = spec.editable_for(payload) if spec.editable_for else spec.editable
    opened = spec.open_keys(payload) if spec.open_keys else ()
    if spec.open_keys and payload.get("escalation") is True:
        opened = ESCALATION_KEYS
    held = {
        field
        for field, _n, key in placeholders.find(payload)
        if not (field in spec.customer_facing and key in opened)
    }
    return [key for key in editable if key not in held]


def irreversible_now(step):
    """Contract §3: what the step would be if it ran now; what it was once it ran."""
    if step.status in (S.APPLIED, S.UNDONE):
        return step.irreversible
    spec = REGISTRY[step.kind]
    payload = step.payload if isinstance(step.payload, dict) else {}
    if "draft_only" in spec.editable and payload.get("draft_only"):
        return False
    if spec.undoable_for is not None and spec.undoable_for(payload):
        # Slack bundles: a survey held back for its Jira issue is undone while unsent.
        return False
    return spec.irreversible or spec.outside


def _disabled(step, reader):
    """(sentence, link, rights) for a waiting step `reader` can't run now;
    (None, None, True) when they can. Rights first (D1): `rights` is False
    only for those. Then the tool (D3-10), which leaves Reject open; its
    sentence carries a link when there is something to fix in Settings."""
    if not may_read_source(reader, step):
        noun = "email" if "email_id" in (step.payload or {}) else "ticket"
        return SOURCE_ONLY.format(noun=noun), None, False
    if not may_decide(reader, step):
        return CANT_RUN_STEP, None, False
    stop = gates.blocked(step, reader)
    if stop is not None:
        return stop.sentence, stop.link, True
    return None, None, True


#: D1 kinds' app links (contract §6.2), in the frontend's order.
APP_LINKS = (
    ("task_url", "Open task"),
    ("campaign_url", "Open campaign"),
    ("survey_url", "Open survey"),
    ("segment_url", "Open segment"),
    ("rule_url", "Open scenario"),
    ("canvas_url", "Open map"),
)
OUTSIDE_HOSTS = ("https://slack.com/",)


def _jira_url(url):
    from urllib.parse import urlsplit

    parts = urlsplit(url)
    return parts.scheme == "https" and (parts.hostname or "").endswith(".atlassian.net")


def links_for(step, reader):
    """The step's result links for `reader` (contract §4.1, D3-16): app
    paths, and the tool's own https pages for an outside step. A sent
    reply's link is its runner's own mailbox copy."""
    if step.status != S.APPLIED:
        return []
    out = step.outputs or {}
    links = [
        {"label": label, "url": out[key], "external": False}
        for key, label in APP_LINKS
        if isinstance(out.get(key), str) and out[key].startswith("/")
    ]
    comment = out.get("comment_url")
    ticket = out.get("ticket_url")
    if isinstance(comment, str) and _jira_url(comment):
        # R2D1-6: a comment links to itself, in place of its issue.
        links.append(
            {
                "label": f"Open the comment on {out.get('ticket_key', 'the issue')} in Jira",
                "url": comment,
                "external": True,
            }
        )
    elif isinstance(ticket, str) and _jira_url(ticket):
        links.append(
            {
                "label": f"Open {out.get('ticket_key', 'the issue')} in Jira",
                "url": ticket,
                "external": True,
            }
        )
    posted = out.get("slack_url")
    if isinstance(posted, str) and posted.startswith(OUTSIDE_HOSTS):
        links.append({"label": "Open the Slack message", "url": posted, "external": True})
    result = step.result if isinstance(step.result, dict) else {}
    # SOC2:AUTH-02 the sent copy is in the runner's own mailbox: only they get its link
    if (
        step.kind in ("mail.send_reply", "mail.send_draft")
        and result.get("message_id")
        and result.get("sent_by") == reader.pk
    ):
        provider = result.get("provider") or "google"
        links.append(
            {
                "label": "Open the sent email",
                "url": f"/communications?source=mailbox:{provider}&message={result['message_id']}",
                "external": False,
            }
        )
    return links


def _question(step, record, reader, ask, preview):
    from .outside.jira_projects import ASK

    jira = preview.get("jira") if isinstance(preview, dict) else None
    if isinstance(jira, dict) and jira.get("needs_project"):
        return ASK
    return guided.question(step, record, reader) if ask else None


def step_payload(step, reader, *, ask=False, record=None):
    """`ask`: the bundle is guided, so the step carries the question asked
    before it (naming `record`, the bundle's); else its `question` is None."""
    spec = REGISTRY[step.kind]
    payload = step.payload if isinstance(step.payload, dict) else {}
    keys = editable_keys(step)
    values = {**spec.field_defaults(payload), **payload} if spec.field_defaults else payload
    if spec.fields_for is not None:
        shown_values = spec.fields_for(step, reader, values)
        # SOC2:AUTH-02 a field a reader may not read is neither shown nor changeable by them
        if shown_values is None:
            values, keys = {}, []
        else:
            values = shown_values
    proposed = step.status == S.PROPOSED
    reason, link_to, rights = _disabled(step, reader) if proposed else (None, None, False)
    link = (
        f"/{'organizations' if step.customer_id else 'accounts'}/{step.record.pk}"
        if step.record
        else None
    )
    preview = preview_for(step, reader)
    return {
        "id": step.pk,
        "position": step.position,
        "kind": step.kind,
        "label": spec.label,
        "status": step.status,
        "selected": step.selected,
        "edited": step.edited_at is not None,
        "title": step.title,
        "rationale": step.rationale,
        "fields": {key: values.get(key) for key in keys if key in values},
        "editable": keys,
        "placeholders": [
            {"field": field, "step": n, "key": key, "label": placeholders.label(n, key)}
            for field, n, key in placeholders.find(payload)
        ],
        "preview": preview,
        "irreversible": irreversible_now(step),
        "outside": spec.outside,
        "can_run": proposed and reason is None,
        "disabled_reason": reason,
        "disabled_link": link_to,
        "links": links_for(step, reader),
        # Popped by `_one`: rights alone (a tool block leaves Reject open, D3-10).
        "_rights": proposed and rights,
        "outputs": step.outputs or {},
        "error": step.error,
        # SE4-11: why a step ended as it did, beside its state ("" for none).
        "note": str((step.result or {}).get("note") or "") if isinstance(step.result, dict) else "",
        "expired_reason": step.expired_reason if step.status == S.EXPIRED else "",
        "undo": undo_block(step, reader),
        # Guided agent: the server's own question for this step (names from the record).
        # A Jira issue with no project asks which (guided or not).
        "question": _question(step, record, reader, ask, preview),
        # SOC2:AUTH-02 evidence is written from the whole book: view_all_accounts only
        "evidence": [{"label": shown(line), "link": link} for line in step.evidence]
        if sees_everything(reader)
        else [],
    }


def _for(bundle, history):
    if history or bundle.source in PERSONAL_SOURCES:
        # A Slack bundle is for its sender, whoever owns the record; a
        # meeting's for its organiser.
        return person(bundle.routed_user)
    record = bundle.record
    return None if record is None else person(record.owner)


RELATED = ("customer__owner", "account__owner", "decided_by", "undone_by", "organisation", "bundle")


def bundle_payloads(bundles, reader, *, history=False):
    """The Bundles for `reader`, their steps read once for the whole page.
    `history`: `for` is who each was routed to."""
    # Only a running bundle is re-read here (a stuck run): the rest cost no query.
    bundles = [settle_stuck(bundle) for bundle in bundles]
    steps = {}
    rows = AgentAction.objects.filter(bundle_id__in=[bundle.pk for bundle in bundles])
    for step in rows.select_related(*RELATED).order_by("bundle_id", "position"):
        steps.setdefault(step.bundle_id, []).append(step)
    every = [step for found in steps.values() for step in found]
    blocks = source_blocks(bundles)
    # The previews' reads are done once for the page, not once per row; the
    # escalations' handlers ride on the steps' people read (F16).
    handlers = [(bundle.escalation or {}).get("user_id") for bundle in bundles]
    with bulk.using(every, users=bulk.ids(handlers)):
        only = participant_only(reader, bundles)
        return [
            _one(
                bundle,
                steps.get(bundle.pk, []),
                reader,
                history,
                blocks[bundle.pk],
                participant=bundle.pk in only,
            )
            for bundle in bundles
        ]


def bundle_payload(bundle, reader, *, history=False):
    """The Bundle for `reader`."""
    return bundle_payloads([bundle], reader, history=history)[0]


def _one(bundle, steps, reader, history, source, participant=False):
    is_guided = guided.is_guided(steps)
    record = bundle.record if is_guided else None
    rows = [step_payload(step, reader, ask=is_guided, record=record) for step in steps]
    if participant:
        # SOC2:AUTH-02 SE4-26: no reason, rationale or evidence for a participant
        # who can't open the record; the fields and previews are what they accept
        for row in rows:
            row["rationale"], row["evidence"] = "", []
    rights = [row.pop("_rights") for row in rows]
    deciders = [r for row, r in zip(rows, rights, strict=True) if row["status"] == S.PROPOSED]
    waiting = bundle.status == B.WAITING
    runnable = [row["can_run"] for row in rows if row["status"] == S.PROPOSED]
    return {
        "id": bundle.pk,
        "agent": bundle.agent,
        "agent_label": AGENT_LABELS.get(bundle.agent, "AI agent"),
        "title": bundle.title,
        "reason": "" if participant else bundle.reason,
        "participant_view": participant,
        "source": source,
        "record": _record_ref(bundle.record, can_open=not participant),
        "routed_to": bundle.routed_to,
        "department": department_of(bundle),
        "for": _for(bundle, history),
        "status": bundle.status,
        "created_at": _stamp(bundle.created_at),
        "updated_at": _stamp(bundle.updated_at),
        "edited_at": _stamp_or_none(bundle.edited_at),
        "edited_by": person(bundle.edited_by),
        "run_by": person(bundle.run_by),
        "run_started_at": _stamp_or_none(bundle.run_started_at),
        "run_finished_at": _stamp_or_none(bundle.run_finished_at),
        "reject_reason": bundle.reject_reason,
        "reject_note": bundle.reject_note,
        "rejected_by": person(bundle.rejected_by),
        "refreshed_at": _stamp_or_none(bundle.refreshed_at),
        "has_newer_message": bundle.has_newer_message,
        "step_count": len(steps),
        "can_run": waiting and any(runnable),
        # A guided bundle that has started keeps its steps: no Refresh replaces them.
        "can_refresh": waiting
        and bundle.source == AgentBundle.Source.THREAD
        and any(runnable)
        and not (is_guided and bundle.run_started_at is not None),
        "can_reject": waiting and bool(deciders) and all(deciders),
        "escalation": escalation_block(bundle, rows, rights),
        # Guided agent (2026-10-18): asked one step at a time.
        "guided": is_guided,
        "priority": bundle.priority,
        "next_step": guided.next_step(steps) if is_guided and waiting else None,
        "can_stop": waiting and is_guided and bool(deciders) and all(deciders),
        "steps": rows,
    }


def _handler(bundle, uid):
    """(name, function) of the escalation's handler `uid`, or None: the
    page's people read (`bulk`), else one query."""
    if not isinstance(uid, int) or isinstance(uid, bool):
        return None
    page = bulk.active()
    if page is not None and uid in page.names:
        return page.names[uid], page.functions[uid]
    # SOC2:AUTH-02 only a member of the bundle's own workspace is named
    return (
        User.objects.filter(pk=uid, organisation_id=bundle.organisation_id)
        .values_list("name", "function")
        .first()
    )


def escalation_block(bundle, rows, rights):
    """Contract §2.2 (SE4-12): who has an escalation and where that came from;
    None for any other bundle. The person's name and department, never an email."""
    from .escalation import PLATFORM

    data = bundle.escalation or {}
    if not data:
        return None
    uid = data.get("user_id")
    found = _handler(bundle, uid)
    function = data.get("function") or ""
    said = data.get("decision") or None
    deciders = [
        right
        for row, right in zip(rows, rights, strict=True)
        if row["kind"] in PLATFORM and row["status"] == S.PROPOSED
    ]
    return {
        "function": function,
        "function_label": DEPARTMENT_LABELS.get(function, ""),
        "handler": {
            "id": uid,
            "name": found[0],
            "function_label": DEPARTMENT_LABELS.get(found[1], ""),
        }
        if found
        else None,
        "via": data.get("via") or "nobody",
        # SOC2:AUTH-02 who decided and their words, already in the thread its readers read
        "decision": {k: said.get(k, "") for k in ("by", "quote", "named")} if said else None,
        "can_change": bundle.status == B.WAITING and bool(deciders) and all(deciders),
    }


def item_detail(bundle, reader, steps, participant=False):
    """The feed row's `detail` (contract §4.3) from the bundle's `steps`
    (already read for the page)."""
    waiting = [step for step in steps if step.status == S.PROPOSED]
    channel = bundle.thread.source_kind if bundle.thread_id and bundle.thread else None
    # The row names the channel as the bundle's source block does (§3.1);
    # `thread` is select_related by the feed, so this reads nothing.
    label = CHANNEL_LABELS[channel] if channel else SOURCE_LABELS[bundle.source]
    return {
        # SOC2:AUTH-02 SE4-26: no reason for a participant who can't open the record
        "reason": "" if participant else bundle.reason,
        "participant_view": participant,
        "step_count": len(steps),
        "source": {
            "kind": bundle.source,
            "label": label,
            "channel": channel,
        },
        "routed_to": bundle.routed_to,
        "department": department_of(bundle),
        "kinds": [REGISTRY[step.kind].label for step in waiting],
        "can_run": any(may_decide(reader, step) for step in waiting),
        # Guided agent: high sorts first in Ready to run and shows a Priority badge.
        "priority": bundle.priority,
        "guided": guided.is_guided(steps),
    }
