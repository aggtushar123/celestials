"""The escalation bundle (Slack escalations D4, contract SE4-2 to SE4-5,
SE4-13, SE4-27): a colleague's Slack thread the agent judged something the
team must act on becomes one bundle: the Jira issue, its assignment and a
Work to-do for the person the thread gave it to (`decision.read`), else
whoever handles the department (`knowledge.ownership.handler_for`), the
model's other steps, then a reply in the thread, last. Every step the
platform adds goes through the same checks as the model's (`consider`,
which is `run._consider` for this pass)."""

from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone

from core import audit
from services.accounts.models import User
from services.customers.scoping import can_open
from services.metrics.models import AgentAction

from . import decision as decisions
from . import placeholders, prompt

K = AgentAction.Kind
S = AgentAction.Status
#: The steps the platform names a person in (SE4-3, SE4-13).
PLATFORM = (K.JIRA_ASSIGN, K.TASK_CREATE)
#: Room kept for the four escalation steps among prompt.MAX_ACTIONS.
ROOM = 4
TODO_DAYS = 3
PRIORITIES = ("high", "medium", "low")
LABELS = dict(User.Function.choices)
JIRA_KEYS = ("ticket_key", "ticket_url")


@dataclass
class Escalation:
    #: a User.Function value, or "" when the model named none
    function: str
    #: the handler (an active member of the workspace), or None
    user: object
    #: "thread" or "unresolved" (SE4-22), "team", "head", "nobody"
    #: (handler_for) or "chosen" (SE4-13)
    via: str
    #: the first name of whoever started the thread, "" when unknown
    first: str
    #: the channel is shared outside the workspace (SE4-7)
    shared: bool
    #: the thread's decision.Decision, or None
    decision: object = None
    #: a person changed who handles it (SE4-13, CC-8): a refresh keeps it
    changed: bool = False


def first_name(slack):
    name = str((slack or {}).get("started_by_name") or "").strip()
    return name.split()[0] if name else ""


def read(answer, ctx, record):
    """The thread's Escalation (SE4-2, SE4-4), or None when it isn't one."""
    slack = ctx.thread_slack
    if ctx.thread_channel != "slack" or slack is None or not answer.items:
        return None
    found = decisions.read(answer, ctx)
    has_issue = any(str(item.get("kind") or "") == K.JIRA_CREATE for item in answer.items)
    if not has_issue and not answer.function and found is None:
        return None
    first, shared = first_name(slack), bool(slack.get("external_shared"))
    if found is not None:
        # SE4-4: the thread's decision first; nobody found waits for Change
        via = "thread" if found.user is not None else "unresolved"
        return Escalation(answer.function or "", found.user, via, first, shared, found)
    user, via = None, "nobody"
    if answer.function:
        from services.knowledge.ownership import handler_for

        found, via = handler_for(record, answer.function, organisation_id=ctx.organisation.pk)
        # SOC2:AUTH-02 only an active member of this workspace handles it
        user = found if found is not None and found.pk in ctx.members else None
        if user is None:
            via = "nobody"
        else:
            # the steps' own member checks read them from here, not again
            ctx._users.setdefault(user.pk, user)
    return Escalation(answer.function or "", user, via, first, shared)


def chosen(esc, stored, ctx):
    """On a refresh, the person a reader picked with Change (SE4-13, CC-8),
    a member or whoever handled a department, stands: their `user_id`, `via`
    and `function` replace the thread's or the team's. The decision may
    still change."""
    if esc is None or not isinstance(stored, dict):
        return
    if stored.get("via") != "chosen" and not stored.get("changed"):
        return
    pk = stored.get("user_id")
    # SOC2:AUTH-02 still only an active member of this workspace
    esc.user = ctx.member(pk) if isinstance(pk, int) and not isinstance(pk, bool) else None
    esc.via = str(stored.get("via") or "nobody")
    if esc.user is None and esc.via in ("chosen", "team", "head"):
        esc.via = "nobody"
    esc.function = str(stored.get("function") or esc.function)
    esc.changed = True


def who(user):
    """SE4-27: "Faiz Jamal (Customer Success)": the person's own department."""
    if user is None:
        return ""
    label = LABELS.get(getattr(user, "function", "") or "", "")
    return f"{user.name} ({label})" if label else user.name


def template(esc, issue):
    """The reply the platform writes (contract §3); `issue` is the number of
    the jira.create step its placeholders name, or None."""
    thanks = f"Thanks {esc.first}." if esc.first else "Thanks."
    who_ = who(esc.user)
    if issue is not None and not esc.shared:
        logged = f"Logged as {{{{step {issue}.ticket_key}}}} ({{{{step {issue}.ticket_url}}}})"
        rest = f"{logged} with {who_}." if who_ else f"{logged}."
    elif issue is not None:
        rest = f"We've logged this with {who_}." if who_ else "We've logged this."
    else:
        rest = f"{who_} has this." if who_ else "We're looking into it."
    return f"{thanks} {rest}"


def _named(item):
    """The (step number, key) pairs an item's payload names."""
    payload = item.get("payload") if isinstance(item.get("payload"), dict) else {}
    return {(n, key) for _field, n, key in placeholders.find(payload)}


def split(items, ref, taken=0):
    """(the model's first jira.create, its other steps (room kept), its first
    slack.reply, how many it loses here, the issue's number among the
    model's actions for the record) (SE4-3). The model numbers its steps by
    their place among the record's actions (prompt.STEPS); here they run in
    another order, so another step it kept may name only the issue's key or
    link (pointed at its new step in `place`): one naming anything else is
    dropped (F13). `taken`: the steps a person kept on a refresh, which
    count against the room."""
    issue = reply = None
    number, seen = None, 0
    others, dropped = [], 0
    for item in items:
        kind = str(item.get("kind") or "")
        if item.get("record") == ref:
            seen += 1
        if kind == K.JIRA_CREATE and issue is None:
            issue, number = item, seen
        elif kind == K.SLACK_REPLY and reply is None:
            reply = item
        elif kind in (K.JIRA_CREATE, K.SLACK_REPLY, *PLATFORM):
            dropped += 1
        else:
            others.append(item)
    kept = []
    for item in others:
        if any(n != number or key not in JIRA_KEYS for n, key in _named(item)):
            dropped += 1
        else:
            kept.append(item)
    room = max(0, prompt.MAX_ACTIONS - ROOM - taken)
    return issue, kept[:room], reply, dropped + max(0, len(kept) - room), number


def _item(ctx, kind, title, rationale, payload):
    """A step the platform adds, citing the thread's first line."""
    line = ctx.thread_lines[0].strip() if ctx.thread_lines else ""
    return {
        "kind": kind,
        "record": ctx.thread_ref,
        "title": title,
        "rationale": rationale,
        "evidence": [line],
        "payload": payload,
    }


def _pointed(item, issue, number=None):
    """`item` with its Jira placeholders pointing at the issue's step
    `issue`: every one for the reply (`number` None), else only those of
    the model's issue `number`."""
    payload = dict(item.get("payload")) if isinstance(item.get("payload"), dict) else {}

    def point(match):
        wanted = number is None or int(match.group(1)) == number
        if issue is not None and wanted and match.group(2) in JIRA_KEYS:
            return f"{{{{step {issue}.{match.group(2)}}}}}"
        return match.group(0)

    for field, value in payload.items():
        if isinstance(value, str) and (field == "text" or number is not None):
            payload[field] = placeholders.PATTERN.sub(point, value)
    return {**item, "payload": payload}


def _carries_key(item, issue):
    return any(
        n == issue and key == "ticket_key" for _f, n, key in placeholders.find(item["payload"])
    )


def _todo_title(name, summary):
    """The to-do's title: the record's name, then the summary, unless the
    summary already starts with the name (any case)."""
    if summary and summary.casefold().startswith(name.casefold()):
        return summary[:255]
    return f"{name}: {summary}"[:255]


def _priority(payload):
    """The issue's priority as the to-do takes it: the model's word, or a
    kept step's Jira priority ({"name": "High"})."""
    value = payload.get("priority")
    if isinstance(value, dict):
        value = value.get("name")
    return str(value or "").casefold()


def place(esc, answer, ctx, record, consider, *, kept_issue=None, taken=0):
    """Consider the escalation's steps in run order (SE4-3, SE4-5);
    `consider(item)` answers the item's index among this pass's items when it
    landed in the bundle, else None. On a refresh, `kept_issue()` answers
    (index, payload) of a waiting jira.create a person kept, else None: it is
    the issue, and the model's is dropped; `taken` is how many steps were
    kept. Returns (model items dropped here, the issue's index or None,
    whether the template reply was placed)."""
    issue_item, others, reply_item, dropped, number = split(answer.items, ctx.thread_ref, taken)
    # Fix round 1, I-1: the person's kept issue is still the escalation's
    # issue, and the model's (however worded) is not a second one.
    found = kept_issue() if kept_issue is not None else None
    issue, model = found if found is not None else (None, {})
    if found is not None:
        dropped += issue_item is not None
    elif issue_item is not None:
        issue = consider(issue_item)
        if issue is not None and isinstance(issue_item.get("payload"), dict):
            model = issue_item["payload"]
    who_id = esc.user.pk if esc.user is not None else None
    name = esc.user.name if esc.user is not None else ""
    label = LABELS.get(esc.function, "")
    if issue is not None:
        summary = str(model.get("summary") or "").strip()
        priority = _priority(model)
        reason = (
            f"The thread gave it to {name}."
            if esc.via == "thread"
            else f"Whoever handles {label or 'it'} for {record.name} takes the issue."
        )
        consider(
            _item(
                ctx,
                K.JIRA_ASSIGN,
                f"Assign it to {name}" if name else "Assign the issue",
                reason,
                {"issue": f"{{{{step {issue}.ticket_key}}}}", "assignee_id": who_id},
            )
        )
        consider(
            _item(
                ctx,
                K.TASK_CREATE,
                f"A to-do for {name}" if name else "A to-do for whoever handles it",
                "The escalation has an owner in Work.",
                {
                    "title": _todo_title(record.name, summary),
                    "assignee_id": who_id,
                    "due_in_days": TODO_DAYS,
                    "priority": priority if priority in PRIORITIES else "medium",
                },
            )
        )
    for item in others:
        if _named(item) and issue is None:
            # F13: it names the issue, which isn't in the bundle
            dropped += 1
            continue
        consider(_pointed(item, issue, number))
    if reply_item is not None:
        mine = _pointed(reply_item, issue)
        wanted = issue is None or esc.shared or _carries_key(mine, issue)
        if wanted and consider(mine) is not None:
            return dropped, issue, False
    title = f"Reply to {esc.first} in Slack" if esc.first else "Reply in Slack"
    wrote = consider(
        _item(
            ctx,
            K.SLACK_REPLY,
            title,
            "The colleague who raised it hears what was done.",
            {"text": template(esc, issue)},
        )
    )
    return dropped, issue, wrote is not None


def stored(esc, bundle, issue, wrote):
    """`AgentBundle.escalation` (contract §1.2); `issue` the jira.create
    step's position, `wrote` whether the reply is the platform's template."""
    reply = ""
    if wrote:
        payload = (
            bundle.steps.filter(kind=K.SLACK_REPLY, status=S.PROPOSED)
            .values_list("payload", flat=True)
            .first()
        )
        reply = str((payload or {}).get("text") or "")
    found = esc.decision
    return {
        "function": esc.function,
        "user_id": esc.user.pk if esc.user is not None else None,
        "via": esc.via,
        "issue": issue,
        "shared": esc.shared,
        "first": esc.first,
        "decision": None
        if found is None
        else {
            "by": found.by.name,
            "by_id": found.by.pk,
            "quote": found.quote,
            "named": found.named,
            "ts": found.ts,
        },
        "reply": reply,
        # CC-8: not in the API block; a later refresh keeps the changed person
        **({"changed": True} if esc.changed else {}),
    }


NOT_AN_ESCALATION = "Only an escalation has someone who handles it."
CHOOSE_FUNCTION = "Choose a department."
REQUIRED = "This field is required."
NO_MEMBER = "No such member."


def _person(bundle, data, was):
    """((user | None, via), the function to store) for the Change body, or
    Refused(400) (contract §4, SE4-13, CC-8). A named person may be anyone
    active in the workspace (`via` "chosen"); `user_id: null` asks
    `handler_for` for `function` (`via` "team", "head" or "nobody")."""
    from .bundle_run import Refused

    if "user_id" not in data:
        raise Refused(400, {"user_id": [REQUIRED]})
    user_id, function = data["user_id"], data.get("function")
    if user_id is None:
        if not isinstance(function, str) or function not in User.Function.values:
            raise Refused(400, {"function": [CHOOSE_FUNCTION]})
        from services.knowledge.ownership import handler_for

        user, via = handler_for(bundle.record, function, organisation_id=bundle.organisation_id)
        # SOC2:AUTH-02 only an active member of the bundle's own workspace handles it
        if user is None or user.organisation_id != bundle.organisation_id or not user.is_active:
            return (None, "nobody"), function
        return (user, via), function
    whole = isinstance(user_id, int) and not isinstance(user_id, bool)
    # SOC2:AUTH-02 only a member of the bundle's own workspace
    user = (
        User.objects.filter(pk=user_id, organisation_id=bundle.organisation_id).first()
        if whole
        else None
    )
    if user is None:
        raise Refused(400, {"user_id": [NO_MEMBER]})
    if not user.is_active:
        raise Refused(400, {"user_id": [f"{user.name} is deactivated. Pick an active member."]})
    kept = function if function in User.Function.values else (was.get("function") or "")
    return (user, "chosen"), kept


def _renamed(step, user):
    """`step`'s payload naming `user` (None: nobody)."""
    payload = dict(step.payload)
    if step.kind == K.JIRA_ASSIGN:
        # A person picked from Jira's list is cleared: the member is matched again.
        payload.update({"assignee": None, "assignee_member_id": user.pk if user else None})
    else:
        # SOC2:AUTH-02 SE4-4: the to-do only for someone who can open its record;
        # otherwise it waits for the record's owner (task.create's own run rule)
        mine = user if user is not None and can_open(user, step.record) else None
        payload.update(
            {"assignee_id": mine.pk if mine else None, "assignee_name": mine.name if mine else ""}
        )
    return payload


def _reply_again(bundle, was, function, user, now):
    """The template reply written for the new handler, while it is still the
    one the platform wrote; "" once a person or the model wrote it."""
    from .deciding import locked

    stored_text = was.get("reply") or ""
    step = bundle.steps.filter(kind=K.SLACK_REPLY, status=S.PROPOSED).order_by("position").first()
    if not stored_text or step is None or (step.payload or {}).get("text") != stored_text:
        return ""
    esc = Escalation(function, user, "", was.get("first") or "", bool(was.get("shared")))
    text = template(esc, was.get("issue"))
    fresh = locked(step.pk)
    fresh.payload = {**fresh.payload, "text": text}
    fresh.edited_at = now
    fresh.save(update_fields=["payload", "edited_at"])
    return text


def change_handler(reader, pk, data):
    """PATCH /agents/bundles/<id>/handler/ (contract §4, SE4-13). Raises
    bundle_run.Refused or 404, in the contract's order."""
    from .bundle_payloads import bundle_for
    from .bundle_run import Refused, _step_not_waiting, cant_run_step, conflict
    from .bundles import settle_stuck
    from .deciding import locked, may_decide

    data = data if isinstance(data, dict) else {}
    bundle = settle_stuck(bundle_for(reader, pk))
    if not bundle.escalation:
        raise Refused(409, {"code": "NOT_AN_ESCALATION", "detail": NOT_AN_ESCALATION})
    waiting = list(
        bundle.steps.filter(kind__in=PLATFORM, status=S.PROPOSED)
        .select_related("customer", "account", "organisation", "bundle")
        .order_by("position")
    )
    for step in waiting:
        # SOC2:AUTH-02 only someone who may run the steps changes who they name
        if not may_decide(reader, step):
            raise cant_run_step(step)
    now = timezone.now()
    refused = conflict(bundle, reader, now)
    if refused is not None:
        raise refused
    if not waiting:
        raise _step_not_waiting(bundle, reader)
    (user, via), function = _person(bundle, data, bundle.escalation or {})
    with transaction.atomic():
        bundle = bundle_for(reader, pk, lock=True)
        refused = conflict(bundle, reader, now)
        if refused is not None:
            raise refused
        # A Refresh or a decision between the read and the lock: the steps the
        # reader was checked for must all still wait, else nothing changes.
        still = set(
            bundle.steps.filter(kind__in=PLATFORM, status=S.PROPOSED).values_list("pk", flat=True)
        )
        if not still or any(step.pk not in still for step in waiting):
            raise _step_not_waiting(bundle, reader)
        was = dict(bundle.escalation or {})
        for step in waiting:
            fresh = locked(step.pk)
            fresh.payload = _renamed(fresh, user)
            fresh.edited_at = now
            fresh.save(update_fields=["payload", "edited_at"])
        reply = _reply_again(bundle, was, function, user, now)
        bundle.escalation = {
            **was,
            "function": function,
            "user_id": user.pk if user else None,
            "via": via,
            "reply": reply,
            "changed": True,
        }
        bundle.edited_at, bundle.edited_by = now, reader
        bundle.save(update_fields=["escalation", "edited_at", "edited_by", "updated_at"])
        audit.record(  # SOC2:LOG-01 ids and codes only
            "agent_bundle.handler_changed",
            actor=reader,
            organisation=bundle.organisation,
            target=bundle,
            target_repr=str(bundle),
            metadata={
                "function": function,
                "from": was.get("user_id"),
                "to": user.pk if user else None,
                "via": via,
            },
        )
    return bundle
