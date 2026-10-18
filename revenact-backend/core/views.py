import logging

from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit, ticks
from core.models import AuditEvent
from core.throttling import TickThrottle
from services.mail import push

logger = logging.getLogger(__name__)


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    """Liveness check. No auth required — used for local dev sanity checks
    and can double as an uptime probe once deployed."""
    return Response(
        {
            "status": "ok",
            "service": "revenact-backend",
            "time": timezone.now().isoformat(),
        }
    )


class TickView(APIView):
    """POST /api/v1/internal/tick/<task>/ — one scheduled run of a background
    task (core.ticks). Public by necessity (Cloud Scheduler sends no
    session); a Google-signed OIDC token for TICK_AUDIENCE and
    TICK_SERVICE_ACCOUNT is the only thing trusted, checked before the task
    name is even looked at. 200 when it ran or was already running, 500 when
    the task failed (Cloud Scheduler records the attempt as failed)."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [TickThrottle]

    def post(self, request, task):
        try:
            # SOC2:API-11 a Google-signed token for our audience and service account
            push.verify(
                request.headers.get("Authorization", ""),
                audience=settings.TICK_AUDIENCE,
                service_account=settings.TICK_SERVICE_ACCOUNT,
            )
        except push.Rejected as exc:
            audit.record(  # SOC2:LOG-01
                "tick.rejected",
                request=request,
                anonymous=True,
                outcome=AuditEvent.Outcome.FAILURE,
                metadata={"reason": exc.reason},
            )
            return Response(status=exc.status)
        if task not in ticks.TASKS:
            return Response(status=status.HTTP_404_NOT_FOUND)
        try:
            ran, summary, seconds = ticks.run(task)
        except Exception as exc:  # noqa: BLE001 - reported as a failed attempt
            # the class name only: an exception's text can quote customer data
            logger.error("tick %s failed: %s", task, type(exc).__name__)
            return Response({"task": task, "ran": True, "ok": False}, status=500)
        return Response(
            {"task": task, "ran": ran, "ok": True, "summary": summary, "seconds": seconds}
        )
