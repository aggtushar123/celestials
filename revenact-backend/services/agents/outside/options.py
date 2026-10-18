"""The live pick lists (agent bundles D3 contract §5.2, D3-8): Jira's
projects, issue types, priorities and assignable people, read through
Revenact for a person who may run the step; Slack's channels are the Slack
connectors Revenact reads (D3-4) and, with `live`, the channels its bot is
in (round 2 D2 contract §4.1)."""

import re

from services.connectors import agent_access
from services.metrics.models import AgentAction

from .. import placeholders
from . import gates, sentences, tools

K = AgentAction.Kind
LISTS = {
    K.JIRA_CREATE: ("jira_projects", "jira_issue_types", "jira_priorities", "jira_assignees"),
    K.JIRA_ASSIGN: ("jira_assignees",),
    K.SLACK_REPLY: ("slack_channels",),
}
QUERY_LIMIT = 100
NO_SUCH_LIST = "This step has no such list."
LONG_QUERY = "Keep the search under 100 characters."
PROJECT_FIRST = "Choose a project first."
FROM_LIST = "Choose from Jira's list."
#: A Jira issue type's id: digits (fixes after the R2-D2 live test).
ISSUE_TYPE = re.compile(r"^\d{1,18}$")


class Refusal(Exception):
    def __init__(self, status, body):
        super().__init__(status)
        self.status, self.body = status, body


def _producer_project(step):
    """A placeholder issue's project: the producing step's (D3-7)."""
    named = placeholders.find({"issue": (step.payload or {}).get("issue", "")})
    if not named:
        return ""
    payload = (
        AgentAction.objects.filter(bundle_id=step.bundle_id, position=named[0][1])
        .values_list("payload", flat=True)
        .first()
    )
    return (payload or {}).get("project", "") if isinstance(payload, dict) else ""


def _priority_type(payload, project, issue_type):
    """The issue type whose create screen lists the priorities: the one asked
    for, else the step's own when it has an id and `project` is the step's."""
    if issue_type:
        return issue_type
    kept = payload.get("issue_type") if isinstance(payload.get("issue_type"), dict) else {}
    own = str(kept.get("id") or "")
    if project == payload.get("project") and ISSUE_TYPE.match(own):
        return own
    return ""


def options(step, reader, name, *, project="", query="", live=False, issue_type=""):
    if name not in LISTS.get(step.kind, ()):
        raise Refusal(400, {"list": [NO_SUCH_LIST]})
    payload = step.payload or {}
    issue = ""
    if name == "jira_priorities":
        if issue_type and not ISSUE_TYPE.match(issue_type):
            raise Refusal(400, {"issue_type": [FROM_LIST]})
        project = project or payload.get("project", "")
        issue_type = _priority_type(payload, project, issue_type)
    if name == "jira_issue_types" and not project:
        raise Refusal(400, {"project": [PROJECT_FIRST]})
    if name == "jira_assignees":
        if step.kind == K.JIRA_ASSIGN:
            raw = payload.get("issue", "")
            if placeholders.find({"issue": raw}):
                project = project or _producer_project(step)
            else:
                issue = raw
        else:
            project = project or payload.get("project", "")
        if not issue and not project:
            raise Refusal(400, {"project": [PROJECT_FIRST]})
    if len(query) > QUERY_LIMIT:
        raise Refusal(400, {"query": [LONG_QUERY]})
    if name == "slack_channels":
        from ..actions.slack_replies import channels
        from . import slack_channels

        if live:
            found, more, note = slack_channels.rows(step, reader, query=query)
            return {"options": found, "more": more, "note": note}
        return {"options": slack_channels.synced_rows(step, channels(step, reader)), "more": False}
    connector = gates.connector_of(step)
    # A read-only connector still lists: reading is not acting (D3-8).
    if connector is None or not connector.is_enabled or not agent_access.usable(connector):
        stop = gates.blocked(step, reader)
        detail = stop.sentence if stop is not None else gates.JIRA_GONE
        raise Refusal(409, {"code": "TOOL_BLOCKED", "detail": detail})
    from services.connectors import jira_links

    from .seats import link_of, lost_sentence

    try:
        # SOC2:AUTH-02 a person's lists are what their own Jira account may pick (R2D2-5)
        seat = jira_links.seat_for(connector, link_of(reader))
    except jira_links.LinkLost:
        raise Refusal(409, {"code": "TOOL_BLOCKED", "detail": lost_sentence(connector)}) from None
    except jira_links.LinkUnreachable:
        raise Refusal(
            502, {"code": "TOOL_UNREACHABLE", "detail": sentences.LIST_ATLASSIAN_UNREACHABLE}
        ) from None
    try:
        rows, more = tools.current().jira.options(
            connector,
            name,
            project=project,
            issue=issue,
            query=query,
            issue_type=issue_type,
            seat=seat,
        )
    except tools.ListFailed as exc:
        raise Refusal(exc.status, {"code": exc.code, "detail": exc.detail}) from None
    return {"options": rows, "more": more}
