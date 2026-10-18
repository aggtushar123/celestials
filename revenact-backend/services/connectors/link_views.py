"""A person links their own Atlassian account (agent bundles round 2 D2
contract §2, R2D2-2 to R2D2-14). The round trip is bound to the starting
browser (core.oauth_browser); the callback is public, trusts its signed
state only alongside that browser's cookie, and keeps no token unless the
account covers one of the workspace's Jira sites."""

import logging
from urllib.parse import urlencode

from django.conf import settings
from django.core import signing
from django.db import IntegrityError, transaction
from django.http import HttpResponseRedirect
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit, oauth_browser

from . import jira_links
from .models import JiraLink
from .providers.base import ProviderError

STATE_SALT = "connectors.jira_link"
STATE_MAX_AGE = 15 * 60
COOKIE = "revenact_jira_link"
COOKIE_PATH = "/api/v1/connectors/jira-link/"
LINK_OFF = "Linking a Jira account isn't set up on this deployment."
NO_JIRA = "This workspace has no Jira connection yet."
DENIED = "You didn't allow Revenact to use your Jira account."
EXPIRED = "This link is invalid or has expired. Try again."
OTHER_BROWSER = "Open the link in the browser that started it."
EXCHANGE = "Atlassian didn't accept the sign-in. Try again."
NO_REFRESH = "Atlassian didn't allow Revenact to stay linked. Try again."
TAKEN = "Someone else here has linked that Atlassian account."
logger = logging.getLogger(__name__)
_stamp = serializers.DateTimeField().to_representation


def _redirect_uri(request):
    base = settings.MAIL_OAUTH_REDIRECT_BASE or request.build_absolute_uri("/").rstrip("/")
    # A URL for Atlassian, not an HTTP response body (semgrep's Flask rule misreads it).
    return f"{base}/api/v1/connectors/jira-link/callback/"  # nosemgrep


def _back(outcome, detail=""):
    """Back to the frontend only: the target never comes from the query."""
    query = {"jira_link": outcome}
    if detail:
        query["detail"] = detail[:200]
    return HttpResponseRedirect(f"{settings.FRONTEND_URL}/integrations?{urlencode(query)}")


def no_site(host):
    return f"Your Atlassian account can't open {host}, the site Revenact's Jira connection uses."


def _link_payload(link, connectors):
    if link is None:
        return None
    return {
        "name": link.name,
        "email": link.email,
        "status": link.status,
        "sites": [{"url": s.get("url", ""), "name": s.get("name", "")} for s in link.sites or []],
        "covers": [c.pk for c in connectors if jira_links.site_for(link, c)],
        "linked_at": _stamp(link.linked_at),
    }


def _refused(request, user, reason, sentence):
    audit.record(  # SOC2:LOG-01 a refused Jira link
        "jira.link_refused",
        request=request,
        actor=user,
        organisation=user.organisation,
        outcome="failure",
        metadata={"reason": reason},
    )
    return _back("error", sentence)


class JiraLinkView(APIView):
    """GET (my link), POST (start linking), DELETE (unlink): the caller's own only."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        connectors = list(jira_links.jira_connectors(request.user.organisation_id))
        # SOC2:AUTH-02 a person's link is theirs alone: never anyone else's (R2D2-11)
        link = JiraLink.objects.filter(user=request.user).defer("credentials").first()
        return Response(
            {
                "configured": jira_links.configured(),
                "connectors": [
                    {"id": c.pk, "name": c.name, "host": (c.config or {}).get("host", "")}
                    for c in connectors
                ],
                "link": _link_payload(link, connectors),
            }
        )

    def post(self, request):
        if not jira_links.configured():
            return Response({"code": "JIRA_LINK_OFF", "detail": LINK_OFF}, status=409)
        if not jira_links.jira_connectors(request.user.organisation_id).exists():
            return Response({"code": "NO_JIRA", "detail": NO_JIRA}, status=409)
        response = Response()
        # SOC2:AUTH-01 the callback finishes only in this browser
        browser = oauth_browser.bind(
            response, request, name=COOKIE, path=COOKIE_PATH, max_age=STATE_MAX_AGE
        )
        state = signing.dumps({"user": request.user.id, "browser": browser}, salt=STATE_SALT)
        response.data = {"authorize_url": jira_links.authorize_url(state, _redirect_uri(request))}
        return response

    def delete(self, request):
        # SOC2:AUTH-02 a person removes only their own link (R2D2-11)
        link = JiraLink.objects.filter(user=request.user).first()
        if link is not None:
            with transaction.atomic():
                audit.record(  # SOC2:LOG-01 a person's Jira tokens are removed
                    "jira.unlink",
                    request=request,
                    target=link,
                    target_repr=f"Jira link {link.pk}",
                    metadata={"reason": "person"},
                )
                link.delete()
        return Response(status=204)


class JiraLinkCallbackView(APIView):
    """GET /connectors/jira-link/callback/?code=&state= (contract §2.3):
    public by necessity; who the person is comes from the signed state only."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        try:
            response = self._finish(request)
        except Exception as exc:
            # The type only: an exception's text may hold a token or a code.
            logger.warning("Jira link callback failed: %s", type(exc).__name__)
            response = _back("error", EXCHANGE)
        oauth_browser.forget(response, request, name=COOKIE, path=COOKIE_PATH)
        return response

    def _finish(self, request):
        from services.accounts.models import User

        if request.query_params.get("error"):
            return _back("error", DENIED)
        try:
            state = signing.loads(
                request.query_params.get("state", ""), salt=STATE_SALT, max_age=STATE_MAX_AGE
            )
        except signing.BadSignature:
            return _back("error", EXPIRED)
        if not isinstance(state, dict):
            return _back("error", EXPIRED)
        # SOC2:AUTH-02 only an active person finishes a link
        user = User.objects.filter(pk=state.get("user"), is_active=True).first()
        if user is None:
            return _back("error", EXPIRED)
        # SOC2:AUTH-01 before the code exchange: a forwarded link gets no token
        if not oauth_browser.same_browser(request, state, name=COOKIE, path=COOKIE_PATH):
            return _refused(request, user, "other_browser", OTHER_BROWSER)
        try:
            tokens = jira_links.exchange(
                request.query_params.get("code", ""), _redirect_uri(request)
            )
            if not tokens["refresh_token"]:
                return _refused(request, user, "no_refresh", NO_REFRESH)
            sites = jira_links.resources(tokens["access_token"])
            connectors = list(jira_links.jira_connectors(user.organisation_id))
            probe = JiraLink(sites=sites)
            covering = next(
                (site for c in connectors if (site := jira_links.site_for(probe, c))), None
            )
            if covering is None:
                host = (connectors[0].config or {}).get("host") if connectors else ""
                return _refused(request, user, "no_site", no_site(host or "your Jira site"))
            me = jira_links.myself(tokens["access_token"], covering["cloud_id"])
        except ProviderError:
            return _refused(request, user, "exchange", EXCHANGE)
        account = str(me.get("accountId") or "") if isinstance(me, dict) else ""
        if not account:
            return _refused(request, user, "exchange", EXCHANGE)
        return self._store(request, user, tokens, sites, me, account)

    def _store(self, request, user, tokens, sites, me, account):
        # SOC2:AUTH-02 one person per Atlassian account in a workspace (R2D2-3)
        taken = (
            JiraLink.objects.filter(organisation_id=user.organisation_id, account_id=account)
            .exclude(user=user)
            .exists()
        )
        if taken:
            return _refused(request, user, "taken", TAKEN)
        try:
            with transaction.atomic():
                replaced = JiraLink.objects.filter(user=user).delete()[0] > 0
                link = JiraLink(
                    organisation=user.organisation,
                    user=user,
                    account_id=account,
                    name=str(me.get("displayName") or user.name)[:150],
                    email=str(me.get("emailAddress") or "")[:254],
                    sites=sites,
                    scopes=tokens["scope"].split(),
                )
                # SOC2:DATA-02 the tokens are stored encrypted, nowhere else
                link.set_credentials(
                    {k: tokens[k] for k in ("access_token", "refresh_token", "expires_at")}
                )
                link.save()
                audit.record(  # SOC2:LOG-01 a person linked their Atlassian account
                    "jira.link",
                    request=request,
                    actor=user,
                    organisation=user.organisation,
                    target=link,
                    target_repr=f"Jira link {link.pk}",
                    metadata={
                        "account_id": account,
                        "sites": len(sites),
                        "scopes": link.scopes,
                        "replaced": replaced,
                    },
                )
        except IntegrityError:
            # Another person linked the same account between the check and the save.
            return _refused(request, user, "taken", TAKEN)
        return _back("linked")
