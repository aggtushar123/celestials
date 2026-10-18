"""jira.create and jira.assign (agent bundles D3 contract §2.3, §2.4): an
issue opened, or an issue assigned, in Jira as the connection's account
(D3-5) when a person presses Run. The model proposes words and a member;
the project, type, priority and assignee are Jira's, resolved by name when
it runs or picked from Jira's own lists (D3-6, D3-8). A created issue
carries its step's key as a label, so a Retry finds it (D3-11); assigning
reads the assignee first and is idempotent (D3-7). Can't be undone."""

import logging
import re

from rest_framework import serializers

from services.accounts.models import User
from services.connectors import jira_links
from services.connectors.providers.jira import adf, issue_url
from services.customers.models import Ticket
from services.metrics.models import AgentAction

from .. import bulk, placeholders
from ..edits import checked, text_field
from ..kinds import (
    ASK,
    RECORD_AGENTS,
    ChangedSince,
    FieldErrors,
    Invalid,
    Kind,
    Skipped,
    Stale,
    StepFailed,
)
from ..outside import filing, gates, jira_projects, keys, seats, sentences, tools, trail

logger = logging.getLogger(__name__)
DEFAULT_TYPE = "Task"
MODEL_SUMMARY = 200
MODEL_DESCRIPTION = 4000
SUMMARY_LIMIT = 255
DESCRIPTION_LIMIT = 10_000
EXCERPT = 280
PRIORITIES = {"high": "High", "medium": "Medium", "low": "Low"}
PROJECT = re.compile(r"^[A-Z][A-Z0-9_]{0,19}$")
STEP_KEY = re.compile(r"^\{\{\s*step\s+\d{1,2}\.ticket_key\s*\}\}$")
CHOOSE_PROJECT = "Choose a Jira project."
FROM_LIST = "Choose from Jira's list."
NO_SUMMARY = "Write a summary."
LONG_SUMMARY = "Keep the summary under 255 characters."
LONG_DESCRIPTION = "Keep the description under 10,000 characters."
CHOOSE_ASSIGNEE = "Choose who to assign it to, then Retry."
CREATED = "This Jira issue has been created."
ASSIGNED = "This Jira issue has been assigned."
LINK_REFUSED = "Couldn't add the Slack link in Jira. The description has it."


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _member_ok(ctx, member):
    return _whole(member) and member in ctx.members


def validate(payload, row, ctx, evidence):
    connector = ctx.jira_connector
    if connector is None:
        raise Invalid("no Jira connection")
    summary = str(payload.get("summary") or "").strip()
    if not summary or len(summary) > MODEL_SUMMARY:
        raise Invalid("a Jira issue needs a summary under 200 characters")
    description = str(payload.get("description") or "").strip()
    if len(description) > MODEL_DESCRIPTION:
        raise Invalid("a Jira description under 4000 characters")
    priority = payload.get("priority") or ""
    if priority not in ("", *PRIORITIES):
        raise Invalid("priority is high, medium or low")
    member = payload.get("assignee_id")
    if member is not None and not _member_ok(ctx, member):
        raise Invalid("the assignee is not a member")
    # D3-20: the project and type come from the connector, never the model.
    clean = {
        "connector_id": connector["id"],
        "project": connector["project"] or "",
        "issue_type": {"id": "", "name": DEFAULT_TYPE},
        "summary": summary,
        "description": description,
        "priority": {"id": "", "name": PRIORITIES[priority]} if priority else None,
        "assignee": None,
        "assignee_member_id": member,
    }
    slack = ctx.thread_slack
    if slack is not None and slack.get("record") == row["ref"]:
        # SE4-8: the thread it came from (its link goes in the description and Jira)
        clean["conversation_id"] = slack["id"]
        clean["slack_url"] = slack.get("url") or ""
        clean["slack_channel"] = slack.get("channel_name") or ""
    if getattr(ctx, "escalation", None) is not None:
        # SE4-3: an escalation assigns in its own step, never at create
        clean["assignee_member_id"] = None
    message = getattr(ctx, "slack_message", None)
    if message is not None:
        # Slack bundles: the issue is the Slack message's own, made once (its card's too)
        clean["slack_suggestion_id"] = message["id"]
    return clean


def target(payload):
    if payload.get("slack_suggestion_id"):
        # Slack bundles: one issue per Slack message, whatever its summary.
        return f"jira:create:slack:{payload['slack_suggestion_id']}"
    return f"jira:create:{payload['summary'].casefold()[:80]}"


def _message_issue(action):
    """Slack bundles: the issue the step's Slack message already has (its
    card made it first), else None."""
    from services.work.models import SlackSuggestion

    pk = (action.payload or {}).get("slack_suggestion_id")
    if not _whole(pk):
        return None
    # SOC2:AUTH-02 only the step's own workspace's message
    found = (
        SlackSuggestion.objects.filter(pk=pk, organisation_id=action.organisation_id)
        .exclude(jira_key="")
        .values_list("jira_key", "jira_url")
        .first()
    )
    return tools.Issue(key=found[0], url=found[1]) if found else None


def _keep_on_message(action, issue):
    """Slack bundles: the issue is written on its Slack message, so the card
    reuses it and never makes a second."""
    from services.work.models import SlackSuggestion

    pk = (action.payload or {}).get("slack_suggestion_id")
    if _whole(pk):
        SlackSuggestion.objects.filter(
            pk=pk, organisation_id=action.organisation_id, jira_key=""
        ).update(jira_key=issue.key[:32], jira_url=issue.url[:500])


def _member_name(pk):
    page = bulk.active()
    if page is not None and pk in page.names:
        return page.names[pk]
    return User.objects.filter(pk=pk).values_list("name", flat=True).first()


def assignee_preview(payload):
    chosen = payload.get("assignee")
    if isinstance(chosen, dict) and chosen.get("name"):
        return {"name": chosen["name"], "matched_later": False}
    member = payload.get("assignee_member_id")
    name = _member_name(member) if _whole(member) else None
    return {"name": name, "matched_later": True} if name else None


def assignee_name(payload):
    shown = assignee_preview(payload)
    return shown["name"] if shown else "the assignee"


class NoJiraAccount(tools.Refused):
    """No Jira user has the member's login email (spec 5.4, 14 Q2)."""


def no_account_note(payload):
    """SE4-9: the skipped step's note, by the member's first name."""
    name = assignee_name(payload)
    first = name.split()[0] if name and name != "the assignee" else "They"
    return f"{first} has no account in Jira, so the issue is unassigned. Their to-do is in Work."


def _as(connector, reader):
    """Where it acts and as whom, for `reader` (round 2 D2 contract §3.4)."""
    if connector is None:
        return {"site": "", "as": "Jira", "as_you": False, "link": None}
    config = connector.config or {}
    # While linking is off nobody acts as themselves: the link is not read.
    link = seats.link_of(reader) if jira_links.configured() else None
    return {"site": config.get("host", ""), **jira_links.preview_for(connector, link)}


def project_preview(action, reader):
    """The preview's project fields: the step's project (or the runner's one
    project), and when it has none, whether to ask and what to offer."""
    found = jira_projects.choice(action, reader)
    payload = action.payload if isinstance(action.payload, dict) else {}
    return {
        "project": found.get("project") or payload.get("project", ""),
        "needs_project": bool(found.get("needs_project")),
        "project_choices": found.get("project_choices") or [],
        "can_create_project": bool(found.get("can_create_project")),
        "suggested_project": found.get("suggested_project"),
    }


def preview(action, reader):
    payload = action.payload if isinstance(action.payload, dict) else {}
    where = _as(gates.connector_of(action), reader)
    return {
        "jira": {
            "site": where["site"],
            **project_preview(action, reader),
            "issue_type": (payload.get("issue_type") or {}).get("name") or DEFAULT_TYPE,
            "summary": payload.get("summary", ""),
            "excerpt": str(payload.get("description", ""))[:EXCERPT],
            "priority": (payload.get("priority") or {}).get("name") or None,
            "assignee": assignee_preview(payload),
            "as": where["as"],
            "as_you": where["as_you"],
            "link": where["link"],
        }
    }


def pick(value, *, nullable):
    """A pick-list value `{"id", "name"}` (contract §2.3), or None where allowed."""
    if value is None and nullable:
        return None
    if not isinstance(value, dict):
        raise ValueError(FROM_LIST)
    id_, name = value.get("id"), value.get("name")
    if not isinstance(id_, str) or len(id_) > 128 or not isinstance(name, str):
        raise ValueError(FROM_LIST)
    if not name.strip() or len(name) > 255:
        raise ValueError(FROM_LIST)
    return {"id": id_, "name": name.strip()}


class _Text(serializers.Serializer):
    summary = text_field(SUMMARY_LIMIT, NO_SUMMARY, LONG_SUMMARY)
    description = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=DESCRIPTION_LIMIT,
        error_messages={"max_length": LONG_DESCRIPTION},
    )


def _runners(action, runner, key):
    """False only when Jira lists the runner's projects and `key` is not one
    (Jira that can't say now leaves the run to answer)."""
    connector = gates.connector_of(action)
    if connector is None or runner is None:
        return True
    seat = jira_projects.seat_of(connector, runner)
    return seat is None or jira_projects.known(connector, seat, key) is not False


def edit(action, fields, runner):
    errors, clean = {}, {}
    if "project" in fields:
        value = fields["project"]
        ok = isinstance(value, str) and PROJECT.match(value)
        if not ok or not _runners(action, runner, value):
            errors["project"] = [CHOOSE_PROJECT]
        else:
            clean["project"] = value
            if value != action.payload.get("project"):
                # Another project: its type is resolved again by name (D3-6).
                kept = action.payload.get("issue_type") or {}
                clean["issue_type"] = {"id": "", "name": kept.get("name") or DEFAULT_TYPE}
    for key, nullable in (("issue_type", False), ("priority", True), ("assignee", True)):
        if key in fields:
            try:
                clean[key] = pick(fields[key], nullable=nullable)
            except ValueError as exc:
                errors[key] = [str(exc)]
    if "assignee" in fields:
        # Picked from the list, or an explicit null (Unassigned): either way
        # the model's member no longer applies (CC-1).
        clean["assignee_member_id"] = None
    text = {k: fields[k] for k in ("summary", "description") if k in fields}
    try:
        clean.update(checked(_Text, text))
    except FieldErrors as exc:
        errors.update(exc.errors)
    if errors:
        raise FieldErrors(errors)
    return {**action.payload, **clean}


def account(tool, connector, payload, seat):
    """The Jira accountId to assign: the one picked, else the model's member
    matched by email (D3-6); None for no assignee. Raises tools.Refused."""
    chosen = payload.get("assignee")
    if isinstance(chosen, dict) and chosen.get("id"):
        return chosen["id"]
    member = payload.get("assignee_member_id")
    if not _whole(member):
        return None
    email = (
        User.objects.filter(pk=member, organisation_id=connector.organisation_id)
        .values_list("email", flat=True)
        .first()
    )
    if not email:
        return None
    found = tool.account_for(connector, email=email, seat=seat)
    if found is None:
        raise NoJiraAccount(sentences.no_user(email))
    return found["id"]


def _by_name(rows, name):
    if not name:
        return None
    wanted = name.casefold()
    return next((r["id"] for r in rows if r["name"].casefold() == wanted), None)


def _described(payload):
    text = str(payload.get("description") or "")
    url = payload.get("slack_url")
    return f"{text}\n\nFrom Slack: {url}" if url else text


def _fields(tool, connector, payload, project, actor, label, seat):
    """What Jira is sent (reads first: the type, the priority, the assignee)."""
    issue_type = payload.get("issue_type") or {}
    type_id = issue_type.get("id")
    if not type_id:
        types = tool.issue_types(connector, project, seat=seat)
        type_id = _by_name(types, issue_type.get("name") or DEFAULT_TYPE) or (
            types[0]["id"] if types else None
        )
    if not type_id:
        raise tools.Refused(sentences.no_types(project))
    fields = {
        "project": {"key": project},
        "issuetype": {"id": type_id},
        "summary": payload["summary"],
        # D3-5: Jira readers see who ran it; SE4-8: and the thread it came from.
        "description": adf(_described(payload), f"Created by {actor.name} from Revenact."),
        "labels": [label],
    }
    priority = payload.get("priority") or {}
    priority_id = priority.get("id")
    if not priority_id and priority.get("name"):
        # Only a named priority is read, from the project's create screen for
        # this type (a person's link can read it); none is Jira's default.
        allowed = tool.priorities(connector, project=project, issue_type=type_id, seat=seat)
        priority_id = _by_name(allowed, priority["name"])
    if priority_id:
        fields["priority"] = {"id": priority_id}
    assignee = account(tool, connector, payload, seat)
    if assignee:
        fields["assignee"] = {"accountId": assignee}
    return fields


def _made(issue, attempt):
    return {"issue": issue.key}, {**attempt, "ticket_key": issue.key, "ticket_url": issue.url}


def _done(action, actor, tool, connector, issue, attempt, seat, as_):
    """`_made`, and for an issue made from a Slack conversation (SE4-8): filed
    at once, and linked back to the thread; a refused link is the step's note.
    For a Slack message's issue: written on the message (its card)."""
    after, result = _made(issue, attempt)
    payload = action.payload
    _keep_on_message(action, issue)
    if not payload.get("conversation_id"):
        return after, result
    filing.file_made_issue(action, connector, issue, actor)
    if not payload.get("slack_url"):
        return after, result
    try:
        tool.remote_link(
            connector,
            issue=issue.key,
            url=payload["slack_url"],
            title=f"Slack: #{payload.get('slack_channel') or 'channel'} thread",
            global_id=f"revenact-slack-{payload['conversation_id']}",
            seat=seat,
        )
    except Exception as exc:  # noqa: BLE001 - the issue exists: a link is only a note
        if not isinstance(exc, tools.Refused):
            logger.warning("agents: linking a made issue failed: %s", type(exc).__name__)
        trail.call(
            action,
            actor,
            tool="jira",
            op="remote_link",
            outcome="refused",
            where=issue.key,
            as_=as_,
        )
        return after, {**result, "note": LINK_REFUSED}
    trail.call(
        action,
        actor,
        tool="jira",
        op="remote_link",
        outcome="ok",
        where=issue.key,
        returned=issue.key,
        as_=as_,
    )
    return after, result


def apply(action, actor, **_):
    if actor is None:
        raise Stale("a person creates a Jira issue")
    # SOC2:AUTH-02 the tool's gate again at run: the switch and the grant
    stop = gates.blocked(action, actor)
    if stop is not None:
        raise StepFailed(stop.sentence)
    connector = gates.connector_of(action)
    payload = action.payload
    attempt = keys.attempt(action, actor)
    made = _message_issue(action)
    if made is not None:
        # Slack bundles: the message's card made the issue first; no second one.
        return _made(made, attempt)
    project = payload.get("project") or ""
    tool, key = tools.current().jira, keys.key_for(action)
    label = keys.jira_label(key)
    # R2D2-11: as the runner (their link or the connection), one seat for every call
    seat, as_ = seats.for_run(connector, actor, attempt)
    if not project:
        # The runner's one project is used, and kept on the step; else they choose.
        project = jira_projects.only_project(connector, seat)
        if not project:
            raise StepFailed(sentences.JIRA_NO_PROJECT, result=attempt)
        action.payload = payload = {**payload, "project": project}
        action.save(update_fields=["payload"])
    if keys.retrying(action):
        try:
            found = tool.find(connector, label=label, project=project, seat=seat)
        except tools.Refused as exc:
            trail.call(
                action, actor, tool="jira", op="lookup", outcome="refused", where=project, as_=as_
            )
            raise StepFailed(exc.sentence, result=attempt) from None
        trail.call(
            action,
            actor,
            tool="jira",
            op="lookup",
            outcome="found" if found else "not_found",
            where=project,
            returned=found.key if found else "",
            as_=as_,
        )
        if found is not None:
            return _done(action, actor, tool, connector, found, attempt, seat, as_)
    try:
        fields = _fields(tool, connector, payload, project, actor, label, seat)
    except tools.Refused as exc:
        raise StepFailed(exc.sentence, result=attempt) from None
    try:
        issue = tool.create(connector, fields=fields, project=project, seat=seat)
    except tools.Unconfirmed as exc:
        trail.call(
            action, actor, tool="jira", op="create", outcome="unconfirmed", where=project, as_=as_
        )
        raise StepFailed(exc.sentence, result=attempt) from None
    except tools.Refused as exc:
        trail.call(
            action, actor, tool="jira", op="create", outcome="refused", where=project, as_=as_
        )
        raise StepFailed(exc.sentence, result=attempt) from None
    trail.call(
        action,
        actor,
        tool="jira",
        op="create",
        outcome="ok",
        where=project,
        returned=issue.key,
        as_=as_,
    )
    return _done(action, actor, tool, connector, issue, attempt, seat, as_)


def undo_created(action, actor):
    raise ChangedSince(CREATED)


CREATE = Kind(
    key=AgentAction.Kind.JIRA_CREATE,
    label="Create a Jira issue",
    example="Log the login loop in Jira for engineering",
    max_level=ASK,
    agents=RECORD_AGENTS,
    validate=validate,
    target=target,
    same=lambda a, b: a.get("summary", "").casefold() == b.get("summary", "").casefold(),
    current=lambda action: None,
    preview=preview,
    per_reader=True,
    apply=apply,
    undo=undo_created,
    texts=lambda payload: [payload.get("summary"), payload.get("description")],
    irreversible=True,
    outside=True,
    editable=("project", "issue_type", "summary", "description", "priority", "assignee"),
    edit=edit,
    outputs=("ticket_key", "ticket_url"),
    cant_undo=CREATED,
)


def issue_and_connector(payload, row, ctx):
    """The issue a step acts on and its connector: the conversation's own
    ("source") or the one an earlier step made (`{{step N.ticket_key}}`).
    Raises Invalid."""
    issue = str(payload.get("issue") or "").strip()
    ticket = ctx.thread_ticket
    if issue == "source":
        if ticket is None or ticket["provider"] != "jira" or ticket["record"] != row["ref"]:
            raise Invalid("this conversation has no Jira issue")
        # D3-18: only through its own connector, and only while that is usable
        if not ticket.get("usable"):
            raise Invalid("this conversation's Jira connection is off")
        return ticket["external_id"], ticket["connector_id"]
    if STEP_KEY.match(issue):
        if ctx.jira_connector is None:
            raise Invalid("no Jira connection")
        return issue, ctx.jira_connector["id"]
    raise Invalid("an issue is the conversation's own or an earlier step's")


def validate_assign(payload, row, ctx, evidence):
    issue, connector_id = issue_and_connector(payload, row, ctx)
    member = payload.get("assignee_id")
    escalation = getattr(ctx, "escalation", None) is not None
    # SE4-9: only an escalation proposes nobody yet (the panel's Change names them)
    if not (escalation and member is None) and not _member_ok(ctx, member):
        raise Invalid("the assignee is not a member")
    clean = {
        "connector_id": connector_id,
        "issue": issue,
        "assignee": None,
        "assignee_member_id": member,
    }
    if escalation:
        clean["if_found"] = True
        clean["escalation"] = True
        slack = ctx.thread_slack
        if slack is not None and slack.get("record") == row["ref"]:
            # F4: two threads on one record each keep their own assign step
            clean["conversation_id"] = slack["id"]
    return clean


def assign_target(payload):
    where = payload.get("conversation_id") if payload.get("escalation") else None
    suffix = f":c{where}" if where else ""
    return f"jira:assign:{payload['issue']}{suffix}"[:160]


def preview_assign(action, reader):
    payload = action.payload if isinstance(action.payload, dict) else {}
    where = _as(gates.connector_of(action), reader)
    return {
        "jira_assign": {
            "site": where["site"],
            "issue": payload.get("issue", ""),
            "assignee": assignee_preview(payload),
            "as": where["as"],
            "as_you": where["as_you"],
            "link": where["link"],
        }
    }


def edit_assign(action, fields, runner):
    try:
        chosen = pick(fields.get("assignee"), nullable=False)
    except ValueError as exc:
        raise FieldErrors({"assignee": [str(exc)]}) from None
    return {**action.payload, "assignee": chosen, "assignee_member_id": None}


def apply_assign(action, actor, **_):
    if actor is None:
        raise Stale("a person assigns a Jira issue")
    # SOC2:AUTH-02 the tool's gate again at run: the switch and the grant
    stop = gates.blocked(action, actor)
    if stop is not None:
        raise StepFailed(stop.sentence)
    connector = gates.connector_of(action)
    payload = action.payload
    issue = payload["issue"]
    if placeholders.find({"issue": issue}):
        # run_step fills it first; an unfilled one never reaches Jira.
        raise StepFailed(placeholders.needs_sentence(placeholders.find({"issue": issue})[0][1]))
    tool = tools.current().jira
    attempt = keys.attempt(action, actor)
    # R2D2-11: as the runner (their link or the connection), one seat for every call
    seat, as_ = seats.for_run(connector, actor, attempt)
    try:
        wanted = account(tool, connector, payload, seat)
    except NoJiraAccount as exc:
        if payload.get("if_found"):
            raise Skipped(no_account_note(payload), result=attempt) from None
        raise StepFailed(exc.sentence, result=attempt) from None
    except tools.Refused as exc:
        raise StepFailed(exc.sentence, result=attempt) from None
    if wanted is None:
        raise StepFailed(CHOOSE_ASSIGNEE, result=attempt)
    try:
        now = tool.assignee(connector, issue=issue, seat=seat)
    except tools.Refused as exc:
        trail.call(action, actor, tool="jira", op="lookup", outcome="refused", where=issue, as_=as_)
        raise StepFailed(exc.sentence, result=attempt) from None
    done = now == wanted
    # D3-7: assigning reads first; already done is done. R2D1-9: say what was found.
    outcome = "found" if done else ("elsewhere" if now else "not_found")
    trail.call(
        action,
        actor,
        tool="jira",
        op="lookup",
        outcome=outcome,
        where=issue,
        returned=issue if done else "",
        as_=as_,
    )
    if not done:
        try:
            tool.assign(
                connector,
                issue=issue,
                account_id=wanted,
                assignee_name=assignee_name(payload),
                seat=seat,
            )
        except tools.Unconfirmed as exc:
            trail.call(
                action, actor, tool="jira", op="assign", outcome="unconfirmed", where=issue, as_=as_
            )
            raise StepFailed(exc.sentence, result=attempt) from None
        except tools.Refused as exc:
            trail.call(
                action, actor, tool="jira", op="assign", outcome="refused", where=issue, as_=as_
            )
            raise StepFailed(exc.sentence, result=attempt) from None
        trail.call(
            action,
            actor,
            tool="jira",
            op="assign",
            outcome="ok",
            where=issue,
            returned=issue,
            as_=as_,
        )
    # SE4-9: the filed ticket names who has it before the next sync reads Jira
    # (only a real name: never the fallback "the assignee")
    shown = assignee_preview(payload)
    if shown:
        Ticket.objects.filter(connector=connector, external_id=issue).update(
            assignee_name=shown["name"][:150]
        )
    url = issue_url(connector.config, issue)
    return {"assignee": wanted}, {**attempt, "ticket_key": issue, "ticket_url": url}


def undo_assigned(action, actor):
    raise ChangedSince(ASSIGNED)


ASSIGN = Kind(
    key=AgentAction.Kind.JIRA_ASSIGN,
    label="Assign a Jira issue",
    example="Assign SUP-12 to Erin in engineering",
    max_level=ASK,
    agents=RECORD_AGENTS,
    validate=validate_assign,
    target=assign_target,
    current=lambda action: None,
    preview=preview_assign,
    per_reader=True,
    apply=apply_assign,
    undo=undo_assigned,
    texts=lambda payload: [],
    irreversible=True,
    outside=True,
    editable=("assignee",),
    edit=edit_assign,
    outputs=("ticket_key", "ticket_url"),
    cant_undo=ASSIGNED,
)
