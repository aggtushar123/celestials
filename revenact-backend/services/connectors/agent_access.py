"""What agents may do through a connector (agent bundles D3 contract §1.1,
§4.3, D3-9). Round 1: Slack posts and Jira issues; every other tool is read
only. Can act needs the admin's switch, the tool's grant (Slack's
`chat:write`, Jira's create and assign permissions) and a working
connection."""

from django.conf import settings
from rest_framework import serializers

from services.customers.task_changes import person

from .models import Connector

P = Connector.Provider
KINDS = {P.SLACK: ("slack.reply",), P.JIRA: ("jira.create", "jira.assign", "jira.comment")}
SLACK_NEEDS = "chat:write"
JIRA_NEEDS = ("CREATE_ISSUES", "ASSIGN_ISSUES")
#: What the Jira check asks for. Create and assign are required; browsing and
#: commenting are stored, not required (round 2 D1 contract R2D1-5).
JIRA_CHECKED = ("CREATE_ISSUES", "ASSIGN_ISSUES", "BROWSE_PROJECTS", "ADD_COMMENTS")
_stamp = serializers.DateTimeField().to_representation


def kinds(connector):
    return KINDS.get(connector.provider, ())


def granted(connector):
    held = set(connector.granted_scopes or [])
    if connector.provider == P.SLACK:
        return SLACK_NEEDS in held
    if connector.provider == P.JIRA:
        return set(JIRA_NEEDS) <= held
    return False


def usable(connector):
    """The tool can be called at all: enabled, credentials held, not failing."""
    return (
        connector.is_enabled
        and connector.has_credentials
        and connector.status != Connector.Status.ERROR
    )


def can_act(connector):
    # SOC2:AUTH-02 an agent step acts only through a tool an admin allowed and the tool granted
    return (
        bool(kinds(connector))
        and connector.agents_can_act
        and granted(connector)
        and usable(connector)
    )


def _slack_sign_in():
    return bool(settings.SLACK_OAUTH_CLIENT_ID and settings.SLACK_OAUTH_CLIENT_SECRET)


def needs(connector):
    """What "Allow agents to act" will do: a reconnect first, consent, a
    token with the scope, or a Jira permission; None when it can act or never
    could (round 2 D1 contract R2D1-10)."""
    if not kinds(connector) or can_act(connector):
        return None
    if not usable(connector):
        return "reconnect"
    if connector.provider == P.JIRA:
        return "permission"
    if (connector.config or {}).get("via") == "oauth" and _slack_sign_in():
        return "consent"
    return "token"


def block(connector):
    """The contract's `agents` block (§4.3)."""
    on = connector.agents_can_act
    return {
        "kinds": list(kinds(connector)),
        "can_act": can_act(connector),
        "needs": needs(connector),
        "allowed_by": person(connector.agents_allowed_by) if on else None,
        "allowed_at": _stamp(connector.agents_allowed_at)
        if on and connector.agents_allowed_at
        else None,
    }
