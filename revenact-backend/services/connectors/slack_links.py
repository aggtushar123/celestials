"""A person's own Slack (Connections page, 2026-10-16 spec §3 Slack): the
Slack app's OAuth v2 with user scopes only, which of the workspace's Slack
connections a link belongs to (by team id), the token a post acts with, and
who a Slack user is in Revenact. Mirrors `jira_links`. Slack user tokens do
not expire (no rotation), so there is nothing to refresh: a revoked token is
noticed when a post is refused, and the link is marked lost. The token never
leaves `SlackLink.get_credentials`: never logged, never serialised, never in
an audit row."""

from urllib.parse import urlencode

from django.conf import settings
from django.utils import timezone

from core import audit

from .models import Connector, SlackLink
from .providers import slack as slack_provider
from .providers.base import ProviderError

API = slack_provider.API
#: Never a DM scope (no im:history, mpim:history, im:read): the owner's rule.
USER_SCOPES = ("chat:write", "users:read")


def configured():
    return bool(settings.SLACK_OAUTH_CLIENT_ID and settings.SLACK_OAUTH_CLIENT_SECRET)


def authorize_url(state, redirect_uri):
    return "https://slack.com/oauth/v2/authorize?" + urlencode(
        {
            "client_id": settings.SLACK_OAUTH_CLIENT_ID,
            # user_scope only: no bot scope is asked for here.
            "user_scope": ",".join(USER_SCOPES),
            "redirect_uri": redirect_uri,
            "state": state,
        }
    )


def _checked(data):
    if not isinstance(data, dict) or not data.get("ok"):
        error = data.get("error", "unknown_error") if isinstance(data, dict) else "unknown_error"
        raise ProviderError(
            f"Slack: {error}", reauth=error in slack_provider.REAUTH_ERRORS, code=error
        )
    return data


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def exchange(code, redirect_uri):
    """{access_token, slack_user_id, team_id, scopes} for the person. Raises ProviderError."""
    data = _checked(
        slack_provider.http_json(
            "POST",
            f"{API}/oauth.v2.access",
            form={
                "code": code,
                "client_id": settings.SLACK_OAUTH_CLIENT_ID,
                "client_secret": settings.SLACK_OAUTH_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
            },
            timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
        )
    )
    person = data.get("authed_user") or {}
    team = data.get("team") or {}
    token = str(person.get("access_token") or "")
    if not token or not person.get("id") or not team.get("id"):
        raise ProviderError("Slack answered without a user token")
    scopes = [s.strip() for s in str(person.get("scope", "")).split(",") if s.strip()]
    return {
        "access_token": token,
        "slack_user_id": str(person["id"])[:32],
        "team_id": str(team["id"])[:32],
        "scopes": scopes,
    }


def user_info(token, slack_user_id):
    """users.info's {name, email, bot} for `slack_user_id` (email "" when the
    token lacks users:read.email). Raises ProviderError."""
    query = urlencode({"user": slack_user_id})
    data = _checked(
        slack_provider.http_json(
            "GET",
            f"{API}/users.info?{query}",
            headers=_bearer(token),
            timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
        )
    )
    user = data.get("user") or {}
    profile = user.get("profile") or {}
    return {
        "name": str(user.get("real_name") or profile.get("real_name") or user.get("name") or "")[
            :150
        ],
        "email": str(profile.get("email") or "").lower()[:254],
        # A bot or an app's user is never a colleague to hand a message to.
        "bot": bool(user.get("is_bot") or user.get("is_app_user")),
    }


def revoke(token):
    """auth.revoke a person's token, best effort: a refusal or no answer
    still lets the link go (the token is deleted with it). True when Slack
    said it is revoked."""
    if not token:
        return False
    try:
        _checked(
            slack_provider.http_json(
                "POST",
                f"{API}/auth.revoke",
                headers=_bearer(token),
                form={},
                timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
            )
        )
    except ProviderError:
        return False
    return True


def slack_connectors(organisation_id):
    """The workspace's Slack connections a link can belong to: enabled, connected."""
    # SOC2:AUTH-02 only this workspace's Slack connections, never another tenant's
    return (
        Connector.objects.filter(
            organisation_id=organisation_id, provider=Connector.Provider.SLACK, is_enabled=True
        )
        .exclude(credentials="")
        .order_by("pk")
    )


def team_ids(organisation_id):
    """The Slack team ids the workspace's connections are in."""
    return {
        str((c.config or {}).get("team_id") or "")
        for c in slack_connectors(organisation_id)
        if (c.config or {}).get("team_id")
    }


def link_of(user):
    """`user`'s own Slack link or None."""
    if user is None or not getattr(user, "pk", None):
        return None
    # SOC2:AUTH-02 a person acts only through their own link
    return SlackLink.objects.filter(user=user).first()


def person_token(link, connector):
    """The person's token for a post through `connector`, or None (no link,
    a lost link, a link in another Slack workspace, or linking turned off)."""
    if link is None or link.status != SlackLink.Status.LINKED or not configured():
        return None
    team = str((connector.config or {}).get("team_id") or "")
    if not team or team != link.team_id:
        return None
    return link.get_credentials().get("access_token") or None


def lose(link, reason):
    """Mark the link lost and audit it, once (a second call changes nothing)."""
    marked = SlackLink.objects.filter(pk=link.pk, status=SlackLink.Status.LINKED).update(
        status=SlackLink.Status.LOST, lost_at=timezone.now()
    )
    link.status = SlackLink.Status.LOST
    if not marked:
        return
    audit.record(  # SOC2:LOG-01 a person's Slack link stopped working
        "slack.link_lost",
        actor=link.user,
        organisation=link.organisation,
        target=link,
        target_repr=f"Slack link {link.pk}",
        outcome="failure",
        metadata={"reason": str(reason)[:40]},
    )
