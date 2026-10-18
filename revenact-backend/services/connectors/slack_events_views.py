"""POST /api/v1/connectors/slack/events/ (Slack escalations D3, contract
§3.3): Slack's Events API request URL. Public by necessity: who is calling
is proved by Slack's request signature alone, checked against the raw body
(#139's verifier) before anything in it is read. Every verified delivery
answers 200, so our own failures never turn Slack's subscription off; what
could not be filed waits for the catch-up (SC3-26)."""

import json
import logging
import re

from django.http import HttpResponse, JsonResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from core.throttling import SlackEventsThrottle

from . import slack_events, slack_interactivity

logger = logging.getLogger(__name__)

#: Anything but Slack's reason words (`http_timeout`, `http_error`, ...) is dropped.
_REASON = re.compile(r"[^a-z_]")


class SlackEventsView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    # SOC2:API-04 a public URL: per source IP
    throttle_classes = [SlackEventsThrottle]

    @extend_schema(
        operation_id="slack_events",
        summary="Slack Events API request URL (signed by Slack; no token)",
        auth=[],
        request=OpenApiTypes.OBJECT,
        responses={200: OpenApiTypes.OBJECT, 400: None, 401: None, 429: None},
    )
    def post(self, request):
        body = request.body  # the raw bytes Slack signed; request.data is never read
        # SOC2:API-11 Slack's v0 signature and timestamp, constant-time; no secret: refused
        if not slack_interactivity.verified(
            body,
            request.headers.get("X-Slack-Request-Timestamp", ""),
            request.headers.get("X-Slack-Signature", ""),
        ):
            return HttpResponse(status=401)
        try:
            envelope = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            return HttpResponse(status=400)
        if not isinstance(envelope, dict):
            return HttpResponse(status=400)
        if envelope.get("type") == "url_verification":
            return JsonResponse({"challenge": str(envelope.get("challenge") or "")[:200]})
        if envelope.get("type") == "app_rate_limited":
            logger.warning("slack events rate limited for a minute")
            return HttpResponse(status=200)
        if envelope.get("type") != "event_callback":
            return HttpResponse(status=200)
        retry = request.headers.get("X-Slack-Retry-Num", "")
        if retry:
            # SC3-7: a retry is filed like a first delivery (idempotent). The retry
            # headers are not signed: only digits and Slack's reason word are logged.
            number = "".join(c for c in retry[:2] if c.isdigit()) or "?"
            reason = _REASON.sub("", request.headers.get("X-Slack-Retry-Reason", ""))[:32]
            logger.info("slack event retry %s: %s", number, reason or "?")
        try:
            slack_events.handle(envelope)
        except Exception as exc:  # noqa: BLE001 - Slack gets its 200; the type is logged
            logger.warning("slack event failed: %s", type(exc).__name__)
        return HttpResponse(status=200)
