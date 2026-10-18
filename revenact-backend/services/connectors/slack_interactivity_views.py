"""POST /api/v1/connectors/slack/interactivity/ (Connections spec §3, Send
to Revenact): Slack's interactivity request URL. Public by necessity: who
is calling is proved by Slack's request signature alone, checked against
the raw body before anything in it is read."""

import json
import logging
from urllib.parse import parse_qs

from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from core.throttling import SlackInteractivityThrottle

from . import slack_interactivity

logger = logging.getLogger(__name__)


class SlackInteractivityView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    # SOC2:API-04 a public URL: per source IP
    throttle_classes = [SlackInteractivityThrottle]

    @extend_schema(
        operation_id="slack_interactivity",
        summary="Slack interactivity request URL (signed by Slack; no token)",
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
            raw = parse_qs(body.decode("utf-8")).get("payload", [""])[0]
            payload = json.loads(raw)
        except (UnicodeDecodeError, ValueError):
            return HttpResponse(status=400)
        if not isinstance(payload, dict):
            return HttpResponse(status=400)
        if (
            payload.get("type") != "message_action"
            or payload.get("callback_id") != slack_interactivity.CALLBACK_ID
        ):
            return HttpResponse(status=200)
        try:
            slack_interactivity.send_to_work(payload, request=request)
        except Exception as exc:  # noqa: BLE001 - Slack gets its 200; the type is logged
            logger.warning("slack send to work failed: %s", type(exc).__name__)
        # Slack wants an empty 200 within 3 s; the person's answer went by response_url.
        return HttpResponse(status=200)
