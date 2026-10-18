"""A person links their own Slack account (Connections page, 2026-10-16
spec §3 Slack), mirroring the Jira link (`link_views`): the round trip is
bound to the starting browser (core.oauth_browser); the callback is public,
trusts its signed state only alongside that browser's cookie, and keeps no
token unless the account is in the Slack workspace Revenact's Slack
connection is in."""

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

from . import slack_links
from .models import SlackLink
from .providers.base import ProviderError

STATE_SALT = "connectors.slack_link"
STATE_MAX_AGE = 15 * 60
COOKIE = "revenact_slack_link"
COOKIE_PATH = "/api/v1/connectors/slack-link/"
LINK_OFF = "Linking a Slack account isn't set up on this deployment."
NO_SLACK = "This workspace has no Slack connection yet."
DENIED = "You didn't allow Revenact to use your Slack account."
EXPIRED = "This link is invalid or has expired. Try again."
OTHER_BROWSER = "Open the link in the browser that started it."
EXCHANGE = "Slack didn't accept the sign-in. Try again."
OTHER_TEAM = (
    "Your Slack account is in a different Slack workspace from Revenact's Slack connection."
)
TAKEN = "Someone else here has linked that Slack account."
logger = logging.getLogger(__name__)
_stamp = serializers.DateTimeField().to_representation


def _redirect_uri(request):
    base = settings.MAIL_OAUTH_REDIRECT_BASE or request.build_absolute_uri("/").rstrip("/")
    # A URL for Slack, not an HTTP response body (semgrep's Flask rule misreads it).
    return f"{base}/api/v1/connectors/slack-link/callback/"  # nosemgrep


def _back(outcome, detail=""):
    """Back to the frontend only: the target never comes from the query."""
    query = {"slack_link": outcome}
    if detail:
        query["detail"] = detail[:200]
    return HttpResponseRedirect(f"{settings.FRONTEND_URL}/settings/connections?{urlencode(query)}")


def _link_payload(link):
    if link is None:
        return None
    return {
        "name": link.name,
        "slack_user_id": link.slack_user_id,
        "team_id": link.team_id,
        "status": link.status,
        "linked_at": _stamp(link.linked_at),
    }


def _refused(request, user, reason, sentence):
    audit.record(  # SOC2:LOG-01 a refused Slack link
        "slack.link_refused",
        request=request,
        actor=user,
        organisation=user.organisation,
        outcome="failure",
        metadata={"reason": reason},
    )
    return _back("error", sentence)


class SlackLinkView(APIView):
    """GET (my link), POST (start linking), DELETE (unlink): the caller's own only."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # SOC2:AUTH-02 a person's link is theirs alone: never anyone else's
        link = SlackLink.objects.filter(user=request.user).defer("credentials").first()
        return Response(
            {
                "configured": slack_links.configured(),
                "workspace_connected": slack_links.slack_connectors(
                    request.user.organisation_id
                ).exists(),
                "link": _link_payload(link),
            }
        )

    def post(self, request):
        if not slack_links.configured():
            return Response({"code": "SLACK_LINK_OFF", "detail": LINK_OFF}, status=409)
        if not slack_links.slack_connectors(request.user.organisation_id).exists():
            return Response({"code": "NO_SLACK", "detail": NO_SLACK}, status=409)
        response = Response()
        # SOC2:AUTH-01 the callback finishes only in this browser
        browser = oauth_browser.bind(
            response, request, name=COOKIE, path=COOKIE_PATH, max_age=STATE_MAX_AGE
        )
        state = signing.dumps({"user": request.user.id, "browser": browser}, salt=STATE_SALT)
        response.data = {"authorize_url": slack_links.authorize_url(state, _redirect_uri(request))}
        return response

    def delete(self, request):
        # SOC2:AUTH-02 a person removes only their own link
        link = SlackLink.objects.filter(user=request.user).first()
        if link is not None:
            revoked = slack_links.revoke(link.get_credentials().get("access_token", ""))
            with transaction.atomic():
                audit.record(  # SOC2:LOG-01 a person's Slack token is revoked and removed
                    "slack.unlink",
                    request=request,
                    target=link,
                    target_repr=f"Slack link {link.pk}",
                    metadata={"reason": "person", "revoked": revoked},
                )
                link.delete()
        return Response(status=204)


class SlackLinkCallbackView(APIView):
    """GET /connectors/slack-link/callback/?code=&state=: public by
    necessity; who the person is comes from the signed state only."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        try:
            response = self._finish(request)
        except Exception as exc:
            # The type only: an exception's text may hold a token or a code.
            logger.warning("Slack link callback failed: %s", type(exc).__name__)
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
            granted = slack_links.exchange(
                request.query_params.get("code", ""), _redirect_uri(request)
            )
        except ProviderError:
            return _refused(request, user, "exchange", EXCHANGE)
        # SOC2:AUTH-02 only an account in the Slack workspace Revenact's connection is in
        if granted["team_id"] not in slack_links.team_ids(user.organisation_id):
            slack_links.revoke(granted["access_token"])  # kept nowhere
            return _refused(request, user, "other_team", OTHER_TEAM)
        try:
            me = slack_links.user_info(granted["access_token"], granted["slack_user_id"])
        except ProviderError:
            me = {"name": ""}
        return self._store(request, user, granted, me)

    def _store(self, request, user, granted, me):
        account = granted["slack_user_id"]
        # SOC2:AUTH-02 one person per Slack account in a workspace
        taken = (
            SlackLink.objects.filter(organisation_id=user.organisation_id, slack_user_id=account)
            .exclude(user=user)
            .exists()
        )
        if taken:
            return _refused(request, user, "taken", TAKEN)
        try:
            with transaction.atomic():
                replaced = SlackLink.objects.filter(user=user).delete()[0] > 0
                link = SlackLink(
                    organisation=user.organisation,
                    user=user,
                    team_id=granted["team_id"],
                    slack_user_id=account,
                    name=(me.get("name") or user.name or "")[:150],
                    scopes=granted["scopes"],
                )
                # SOC2:DATA-02 the token is stored encrypted, nowhere else
                link.set_credentials({"access_token": granted["access_token"]})
                link.save()
                audit.record(  # SOC2:LOG-01 a person linked their Slack account
                    "slack.link",
                    request=request,
                    actor=user,
                    organisation=user.organisation,
                    target=link,
                    target_repr=f"Slack link {link.pk}",
                    metadata={
                        "slack_user_id": account,
                        "team_id": granted["team_id"],
                        "scopes": link.scopes,
                        "replaced": replaced,
                    },
                )
        except IntegrityError:
            # Another person linked the same account between the check and the save.
            return _refused(request, user, "taken", TAKEN)
        return _back("linked")
