"""Vendor refusals as the contract's plain sentences (agent bundles D3
contract §6; spec §9): never a code, never a vendor's raw message except
Jira's own first sentence about a field."""

# one home per sentence: the mail one lives with the mail send
from services.mail.agent_send import UNCONFIRMED as MAIL_UNCONFIRMED  # noqa: F401

SLACK_EXPIRED = "Your Slack connection expired. Reconnect it, then Retry."
SLACK_ALLOW_RETRY = "Allow Revenact to post in Slack, then Retry."
SLACK_BUSY = "Slack is busy. Retry in a minute."
SLACK_OTHER = "Slack refused the post. Retry it."
SLACK_UNREACHABLE = "Couldn't reach Slack. Retry it."
SLACK_UNCONFIRMED = "We couldn't confirm the Slack post. Retry checks the channel first."
SLACK_BY_CODE = {
    "not_in_channel": "Slack refused the post: the app isn't in {channel}.",
    "channel_not_found": "Slack can't find {channel} any more.",
    "is_archived": "Slack refused the post: {channel} is archived.",
    "missing_scope": SLACK_ALLOW_RETRY,
    "not_allowed_token_type": SLACK_ALLOW_RETRY,
    "invalid_auth": SLACK_EXPIRED,
    "token_revoked": SLACK_EXPIRED,
    "account_inactive": SLACK_EXPIRED,
    "not_authed": SLACK_EXPIRED,
    "ratelimited": SLACK_BUSY,
    "msg_too_long": "Slack refused the post: the message is too long.",
}

JIRA_LOGIN = "Jira refused the login. Reconnect Jira, then Retry."
JIRA_BUSY = "Jira is busy. Retry in a minute."
JIRA_UNREACHABLE = "Couldn't reach Jira. Retry it."
JIRA_CREATE_UNCONFIRMED = "We couldn't confirm Jira made the issue. Retry checks Jira first."
JIRA_ASSIGN_UNCONFIRMED = "We couldn't confirm Jira assigned the issue. Retry checks Jira first."
JIRA_COMMENT_UNCONFIRMED = "We couldn't confirm Jira added the comment. Retry checks Jira first."
JIRA_NO_PROJECT = "Choose a Jira project, then Retry."
JIRA_PROJECT_UNCONFIRMED = "We couldn't confirm Jira made the project. Check Jira, then choose it."
PROJECT_KEY_TAKEN = "Jira already has a project with this key. Try another."
PROJECT_NAME_TAKEN = "Jira already has a project with this name. Try another."
JIRA_FIELDS = {
    "components": "a component",
    "duedate": "a due date",
    "fixVersions": "a fix version",
    "versions": "an affected version",
    "labels": "a label",
    "environment": "an environment",
    "reporter": "a reporter",
}
LIST_REFUSED = "Jira refused the login. Reconnect Jira, then try again."
LIST_UNREACHABLE = "Couldn't reach Jira. Try again."
LIST_BUSY = "Jira is busy. Try again in a minute."
LIST_NO_SITE = "Jira can't find this site. Check the Jira connection."
# Acting as the person through their own Jira link (round 2 D2 contract §3.6).
JIRA_LINK_REFUSED = "Jira refused your Jira link. Link Jira again, then Retry."
LIST_LINK_REFUSED = "Jira refused your Jira link. Link Jira again, then try again."
ATLASSIAN_UNREACHABLE = "Couldn't reach Atlassian to use your Jira link. Retry it."
LIST_ATLASSIAN_UNREACHABLE = "Couldn't reach Atlassian. Try again."
# The person's link works, but its OAuth scopes don't cover this call (Jira's
# 401 "scope does not match"), or Jira forbids the list (403): never "link again".
JIRA_LINK_SCOPE = "Your Jira link can't do this in Jira. Ask your Revenact admin, then Retry."
LIST_LINK_SCOPE = "Your Jira link can't do this in Jira."


def scope_refused(exc):
    """Jira's 401 for an OAuth token whose scopes don't cover the call: the
    token is good (the link is kept), the app's scopes are not."""
    body = exc.body if isinstance(exc.body, dict) else {}
    return exc.status == 401 and "scope does not match" in str(body.get("message", "")).lower()


def list_failure(exc, *, project="", issue="", person=False):
    """(code, detail, status) for a pick list Jira refused (round 2 D1
    contract R2D1-7): read as a Run reads it, never "unreachable" for a 404.
    `person`: the list was read through the reader's own Jira link, so a 401
    asks them to link again, unless Jira said the link's scopes don't cover
    the list (or forbade it, 403): then the link can't, and is kept."""
    if person and (exc.status == 403 or scope_refused(exc)):
        return "TOOL_REFUSED", LIST_LINK_SCOPE, 409
    if exc.status == 401 and person:
        return "TOOL_REFUSED", LIST_LINK_REFUSED, 409
    if exc.status in (401, 403):
        return "TOOL_REFUSED", LIST_REFUSED, 409
    if exc.status == 404:
        if issue:
            return "TOOL_NOT_FOUND", f"Jira can't find {issue}.", 409
        if project:
            return "TOOL_NOT_FOUND", f"Jira can't find the project {project}.", 409
        return "TOOL_NOT_FOUND", LIST_NO_SITE, 409
    if exc.status == 429:
        return "TOOL_BUSY", LIST_BUSY, 409
    return "TOOL_UNREACHABLE", LIST_UNREACHABLE, 502


def slack(exc, channel):
    """`exc` (a connectors ProviderError) for the channel named `channel` ("#support")."""
    if exc.status == 429:
        return SLACK_BUSY
    template = SLACK_BY_CODE.get(exc.code)
    if template:
        return template.format(channel=channel)
    if exc.status is None and not exc.code:
        return SLACK_UNREACHABLE
    return SLACK_OTHER


def jira(exc, *, project="", issue="", assignee="", person=False):
    """`person`: the call acted through the runner's own Jira link."""
    status = exc.status
    if status == 401 and person and scope_refused(exc):
        return JIRA_LINK_SCOPE
    if status == 401:
        return JIRA_LINK_REFUSED if person else JIRA_LOGIN
    if status == 403:
        if person:
            return (
                f"Your Jira account can't do this in {issue or project}. "
                "Ask a Jira admin for permission, then Retry."
            )
        return (
            f"The Jira account can't do this in {issue or project}. "
            "Give it permission in Jira, then Retry."
        )
    if status == 404:
        return f"Jira can't find {issue}." if issue else f"Jira can't find the project {project}."
    if status == 429:
        return JIRA_BUSY
    if status is None:
        return JIRA_UNREACHABLE
    body = exc.body if isinstance(exc.body, dict) else {}
    errors = body.get("errors") if isinstance(body.get("errors"), dict) else {}
    if "assignee" in errors and assignee:
        return f"Jira won't assign {issue or 'the issue'} to {assignee}."
    for field, message in errors.items():
        if "required" in str(message).lower():
            return (
                f"Jira says the project {project} needs {JIRA_FIELDS.get(field, 'another field')}."
            )
    first = next(iter(errors.values()), None) or next(iter(body.get("errorMessages") or []), "")
    if first:
        return f"Jira refused this: {str(first).strip().rstrip('.')[:200]}."
    return "Jira refused this. Retry it."


def no_user(email):
    return f"Jira has no user with {email}. Choose the assignee from Jira's list, then Retry."


def no_types(project):
    return f"Jira has no issue types to use in {project}."
