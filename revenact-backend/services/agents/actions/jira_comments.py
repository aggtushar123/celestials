"""jira.comment (agent bundles round 2 D1 contract §2, §3, R2D1-2 to
R2D1-6): an internal comment on the conversation's own Jira issue, or on the
issue an earlier step made, as the connection's account (D3-5), when a
person presses Run. The model writes the body; the comment ends with who ran
it and the step's ref, which a Retry looks for first. Can't be undone."""

from rest_framework import serializers

from services.connectors.providers.jira import adf
from services.metrics.models import AgentAction

from .. import placeholders
from ..edits import checked, text_field
from ..kinds import ASK, RECORD_AGENTS, ChangedSince, Invalid, Kind, Stale, StepFailed
from ..outside import gates, keys, seats, tools, trail
from .jira_issues import _as, issue_and_connector

MODEL_BODY = 2000
BODY_LIMIT = 4000
EXCERPT = 280
NO_BODY = "Write the comment."
LONG_BODY = "Keep the comment under 4000 characters."
POSTED = "This Jira comment has been posted."


def marker(step):
    # SOC2:API-08 the step's key, written into the comment so a Retry finds it
    return f"ref {keys.key_for(step)}"


def validate(payload, row, ctx, evidence):
    if ctx.thread_id is None:
        # R2D1-2: the nightly pass never comments.
        raise Invalid("a comment answers a conversation")
    issue, connector_id = issue_and_connector(payload, row, ctx)
    body = str(payload.get("body") or "").strip()
    if not body or len(body) > MODEL_BODY:
        raise Invalid("a comment needs a body under 2000 characters")
    return {"connector_id": connector_id, "issue": issue, "body": body}


def preview(action, reader):
    payload = action.payload if isinstance(action.payload, dict) else {}
    where = _as(gates.connector_of(action), reader)
    return {
        "jira_comment": {
            "site": where["site"],
            "issue": payload.get("issue", ""),
            "excerpt": str(payload.get("body", ""))[:EXCERPT],
            "as": where["as"],
            "as_you": where["as_you"],
            "link": where["link"],
            "internal": True,
        }
    }


class _Text(serializers.Serializer):
    body = text_field(BODY_LIMIT, NO_BODY, LONG_BODY)


def edit(action, fields, runner):
    return {**action.payload, **checked(_Text, {k: fields[k] for k in ("body",) if k in fields})}


def _done(comment, attempt):
    return {"comment": comment.id}, {
        **attempt,
        "comment_id": comment.id,
        "ticket_key": comment.key,
        "ticket_url": comment.issue_url,
        "comment_url": comment.url,
    }


def apply(action, actor, **_):
    if actor is None:
        raise Stale("a person comments on a Jira issue")
    # SOC2:AUTH-02 the tool's gate again at run: the switch and the grant
    stop = gates.blocked(action, actor)
    if stop is not None:
        raise StepFailed(stop.sentence)
    connector = gates.connector_of(action)
    payload = action.payload
    issue = payload["issue"]
    named = placeholders.find({"issue": issue})
    if named:
        # run_step fills it first; an unfilled one never reaches Jira.
        raise StepFailed(placeholders.needs_sentence(named[0][1]))
    tool, attempt = tools.current().jira, keys.attempt(action, actor)
    # R2D2-11: as the runner (their link or the connection), one seat for every call
    seat, as_ = seats.for_run(connector, actor, attempt)
    if keys.retrying(action):
        try:
            found = tool.find_comment(connector, issue=issue, marker=marker(action), seat=seat)
        except tools.Refused as exc:
            trail.call(
                action, actor, tool="jira", op="lookup", outcome="refused", where=issue, as_=as_
            )
            raise StepFailed(exc.sentence, result=attempt) from None
        trail.call(
            action,
            actor,
            tool="jira",
            op="lookup",
            outcome="found" if found else "not_found",
            where=issue,
            returned=found.id if found else "",
            as_=as_,
        )
        if found is not None:
            return _done(found, attempt)
    body = adf(payload["body"], f"Posted by {actor.name} from Revenact · {marker(action)}.")
    try:
        made = tool.comment(connector, issue=issue, body=body, seat=seat)
    except tools.Unconfirmed as exc:
        trail.call(
            action, actor, tool="jira", op="comment", outcome="unconfirmed", where=issue, as_=as_
        )
        raise StepFailed(exc.sentence, result=attempt) from None
    except tools.Refused as exc:
        trail.call(
            action, actor, tool="jira", op="comment", outcome="refused", where=issue, as_=as_
        )
        raise StepFailed(exc.sentence, result=attempt) from None
    trail.call(
        action,
        actor,
        tool="jira",
        op="comment",
        outcome="ok",
        where=issue,
        returned=made.id,
        as_=as_,
    )
    return _done(made, attempt)


def undo(action, actor):
    raise ChangedSince(POSTED)


COMMENT = Kind(
    key=AgentAction.Kind.JIRA_COMMENT,
    label="Comment on a Jira issue",
    example="Add the customer's new detail to SUP-12",
    max_level=ASK,
    agents=RECORD_AGENTS,
    validate=validate,
    target=lambda payload: f"jira:comment:{payload['issue']}"[:160],
    current=lambda action: None,
    preview=preview,
    per_reader=True,
    apply=apply,
    undo=undo,
    texts=lambda payload: [payload.get("body")],
    irreversible=True,
    outside=True,
    editable=("body",),
    edit=edit,
    outputs=("ticket_key", "ticket_url", "comment_url"),
    cant_undo=POSTED,
)
