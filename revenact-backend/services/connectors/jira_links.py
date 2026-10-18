"""A person's own Jira (agent bundles round 2 D2 contract §1 to §3,
R2D2-2 to R2D2-14). Atlassian's OAuth 2.0 (3LO) client, which of the
workspace's Jira connectors a link covers (by host), the `Seat` a call acts
from (the person, or the connection's account), and the access token kept
fresh. Atlassian rotates refresh tokens: every refresh stores the new pair
under a row lock, in its own transaction where it can (R2D2-8). Tokens never
leave `JiraLink.get_credentials` / a `Seat`'s creds: never logged, never
serialised, never in an audit row (R2D2-7)."""

import time
from dataclasses import dataclass, field
from urllib.parse import quote, urlencode, urlsplit

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from core import audit

from .models import Connector, JiraLink
from .providers.base import ProviderError, http_json

AUTH = "https://auth.atlassian.com"
API = "https://api.atlassian.com"
SCOPES = ("read:jira-work", "write:jira-work", "read:jira-user", "offline_access")
#: A resource is a Jira site when one of its scopes is a Jira one.
JIRA_SCOPE = (":jira-", ":jira.")
EXPIRY_MARGIN = 60
#: run_bundle and retry_step refresh a token expiring within this (R2D2-8, contract §9).
JIRA_LINK_WARM_SECONDS = 15 * 60


class LinkLost(Exception):
    """Atlassian refused the refresh token: the person must link again."""


class LinkUnreachable(Exception):
    """Atlassian didn't answer the refresh; the link is kept."""


@dataclass(frozen=True)
class Seat:
    """Who a Jira call acts as, and the base URL and auth it uses. `creds`
    holds a token: kept out of repr so a log line or a traceback never shows it."""

    config: dict
    creds: dict = field(repr=False)
    person: bool
    name: str
    link_id: int | None = None


def configured():
    return bool(settings.ATLASSIAN_OAUTH_CLIENT_ID and settings.ATLASSIAN_OAUTH_CLIENT_SECRET)


def authorize_url(state, redirect_uri):
    return f"{AUTH}/authorize?" + urlencode(
        {
            "audience": "api.atlassian.com",
            "client_id": settings.ATLASSIAN_OAUTH_CLIENT_ID,
            "scope": " ".join(SCOPES),
            "redirect_uri": redirect_uri,
            "state": state,
            "response_type": "code",
            "prompt": "consent",
        }
    )


def _with_expiry(tokens):
    try:
        lifetime = int(tokens.get("expires_in", 3600))
    except (TypeError, ValueError):
        lifetime = 3600
    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token", ""),
        "expires_at": time.time() + lifetime,
    }


def exchange(code, redirect_uri):
    """The first token pair, with `scope` kept. Raises ProviderError."""
    tokens = http_json(
        "POST",
        f"{AUTH}/oauth/token",
        data={
            "grant_type": "authorization_code",
            "client_id": settings.ATLASSIAN_OAUTH_CLIENT_ID,
            "client_secret": settings.ATLASSIAN_OAUTH_CLIENT_SECRET,
            "code": code,
            "redirect_uri": redirect_uri,
        },
        timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
    )
    if not isinstance(tokens, dict) or not tokens.get("access_token"):
        raise ProviderError("auth.atlassian.com answered without an access token")
    return {**_with_expiry(tokens), "scope": str(tokens.get("scope", ""))}


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def resources(access_token):
    rows = http_json(
        "GET",
        f"{API}/oauth/token/accessible-resources",
        headers=_bearer(access_token),
        timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
    )
    return [
        {
            "cloud_id": str(r["id"]),
            "url": str(r.get("url", "")),
            "name": str(r.get("name", ""))[:150],
        }
        for r in (rows if isinstance(rows, list) else [])
        if isinstance(r, dict)
        and r.get("id")
        and any(any(mark in str(s) for mark in JIRA_SCOPE) for s in r.get("scopes") or [])
    ]


def api_base(cloud_id):
    return f"{API}/ex/jira/{quote(cloud_id, safe='')}"


def myself(access_token, cloud_id):
    return http_json(
        "GET",
        f"{api_base(cloud_id)}/rest/api/3/myself",
        headers=_bearer(access_token),
        timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
    )


def host_of(url):
    return (urlsplit(url or "").hostname or "").lower()


def site_for(link, connector):
    """The link's site for `connector` (R2D2-4), or None."""
    host = str((connector.config or {}).get("host", "")).lower()
    if link is None or not host:
        return None
    return next((s for s in link.sites or [] if host_of(s.get("url")) == host), None)


def jira_connectors(organisation_id):
    """The workspace's Jira connections a link can cover: enabled, connected."""
    # SOC2:AUTH-02 only this workspace's Jira connections, never another tenant's
    return (
        Connector.objects.filter(
            organisation_id=organisation_id, provider=Connector.Provider.JIRA, is_enabled=True
        )
        .exclude(credentials="")
        .order_by("pk")
    )


def connection_name(connector):
    return (connector.config or {}).get("account_name") or connector.name


def connection_seat(connector):
    return Seat(
        config=connector.config or {},
        creds=connector.get_credentials(),
        person=False,
        name=connection_name(connector),
    )


def seat_for(connector, link):
    """Who a call through `connector` acts as for the person whose link is
    `link` (None: no link). Raises LinkLost, LinkUnreachable. While linking
    is off (`configured()` false) nothing acts as a person, a lost link
    included: the connection acts (contract, owner set-up)."""
    if link is None or not configured():
        return connection_seat(connector)
    if link.status == JiraLink.Status.LOST:
        raise LinkLost()
    site = site_for(link, connector)
    if site is None:
        return connection_seat(connector)
    return Seat(
        config={**(connector.config or {}), "api_base": api_base(site["cloud_id"])},
        creds={"access_token": fresh_token(link)},
        person=True,
        name=link.name,
        link_id=link.pk,
    )


def lose(link, reason):
    """Mark the link lost and audit it, once (a second call changes nothing)."""
    marked = JiraLink.objects.filter(pk=link.pk, status=JiraLink.Status.LINKED).update(
        status=JiraLink.Status.LOST, lost_at=timezone.now()
    )
    link.status = JiraLink.Status.LOST
    if not marked:
        return
    audit.record(  # SOC2:LOG-01 a person's Jira link stopped working
        "jira.link_lost",
        actor=link.user,
        organisation=link.organisation,
        target=link,
        target_repr=f"Jira link {link.pk}",
        outcome="failure",
        metadata={"reason": reason},
    )


def _refused(exc):
    """Atlassian said the refresh token is no good (revoked consent, rotated
    away, 90 days unused): `invalid_grant`, or `unauthorized_client` naming
    the refresh token ("refresh_token is invalid"). Anything else (our own
    client refused, `invalid_client`, a 5xx, no answer, a lost body) is no
    proof of that: the link is kept."""
    if exc.status not in (400, 401, 403):
        return False
    body = exc.body or {}
    error = body.get("error")
    if error == "invalid_grant":
        return True
    said = str(body.get("error_description", "")).lower()
    return error == "unauthorized_client" and ("refresh_token" in said or "refresh token" in said)


def fresh_token(link, *, within=EXPIRY_MARGIN):
    """An access token good for `within` seconds more; refreshed under the
    row's lock when not (two runs never spend one refresh token), the rotated
    pair stored before the lock is let go. Raises LinkLost (refused: the link
    is marked lost and audited) or LinkUnreachable (no answer: the link is
    kept)."""
    if link.status == JiraLink.Status.LOST:
        raise LinkLost()
    creds = link.get_credentials()
    if creds.get("expires_at", 0) > time.time() + within:
        return creds["access_token"]
    with transaction.atomic():
        locked = JiraLink.objects.select_for_update().get(pk=link.pk)
        if locked.status == JiraLink.Status.LOST:
            link.status = locked.status
            raise LinkLost()
        creds = locked.get_credentials()
        if creds.get("expires_at", 0) > time.time() + within:
            # Another run refreshed it while this one waited for the lock.
            link.credentials = locked.credentials
            return creds["access_token"]
        refresh_token = creds.get("refresh_token", "")
        if refresh_token:
            try:
                tokens = http_json(
                    "POST",
                    f"{AUTH}/oauth/token",
                    data={
                        "grant_type": "refresh_token",
                        "client_id": settings.ATLASSIAN_OAUTH_CLIENT_ID,
                        "client_secret": settings.ATLASSIAN_OAUTH_CLIENT_SECRET,
                        "refresh_token": refresh_token,
                    },
                    timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
                )
            except ProviderError as exc:
                if not _refused(exc):
                    raise LinkUnreachable() from None
            else:
                if not isinstance(tokens, dict) or not tokens.get("access_token"):
                    raise LinkUnreachable()
                fresh = _with_expiry(tokens)
                # Atlassian rotates: the used refresh token is spent, so the new one is kept now.
                fresh["refresh_token"] = fresh["refresh_token"] or refresh_token
                locked.set_credentials(fresh)
                locked.refreshed_at = timezone.now()
                locked.save(update_fields=["credentials", "refreshed_at"])
                link.credentials = locked.credentials
                link.refreshed_at = locked.refreshed_at
                return fresh["access_token"]
        # Refused (or nothing to refresh with). Marked under the lock and kept:
        # the block ends normally, so a run waiting for the lock reads `lost`
        # and never spends the token again (R2D2-9).
        lose(link, "invalid_grant")
    raise LinkLost()


def warm(link):
    """Refresh a token expiring within JIRA_LINK_WARM_SECONDS, before any
    step's transaction opens, so the rotated pair commits on its own
    (R2D2-8). A failure is left for the step to say."""
    if link is None or link.status != JiraLink.Status.LINKED:
        return
    try:
        fresh_token(link, within=JIRA_LINK_WARM_SECONDS)
    except (LinkLost, LinkUnreachable):
        pass


def preview_for(connector, link):
    """Who a reader's Jira step would act as (R2D2-10), read only: no call."""
    bot = connection_name(connector)
    if not configured():
        return {"as": bot, "as_you": False, "link": "off"}
    if link is not None and link.status == JiraLink.Status.LINKED and site_for(link, connector):
        return {"as": link.name, "as_you": True, "link": None}
    if link is not None and link.status == JiraLink.Status.LOST:
        return {"as": bot, "as_you": False, "link": None}
    if link is not None:
        return {"as": bot, "as_you": False, "link": "other_site"}
    return {"as": bot, "as_you": False, "link": "none"}
