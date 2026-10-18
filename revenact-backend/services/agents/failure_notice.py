"""`agent_step_failed` (agent bundles D3 contract §7, D3-15): once per run,
retry or settled stuck run that left any of its steps failed, to its
runner, linking the bundle in History. A failure here is logged and never
undoes the run."""

import logging

from django.db import transaction

from services.accounts.models import User
from services.metrics.models import AgentAction
from services.notifications.models import Notification
from services.notifications.realtime import notify

from .models import AgentBundle

logger = logging.getLogger(__name__)
TITLE_LIMIT = 120
MESSAGE_LIMIT = 500


def tell(bundle_id, runner_id, step_ids):
    if runner_id is None or not step_ids:
        return None
    try:
        # A savepoint: a database error here can't poison the caller's transaction.
        with transaction.atomic():
            failed = list(
                AgentAction.objects.filter(
                    pk__in=list(step_ids), bundle_id=bundle_id, status=AgentAction.Status.FAILED
                )
                .order_by("position")
                .values("position", "error")
            )
            if not failed:
                return None
            runner = User.objects.filter(pk=runner_id, is_active=True).first()
            title = AgentBundle.objects.filter(pk=bundle_id).values_list("title", flat=True).first()
            if runner is None or title is None:
                return None
            title = title[:TITLE_LIMIT]
            if len(failed) == 1:
                message = f"Step {failed[0]['position']} failed in “{title}”: {failed[0]['error']}"
            else:
                message = f"{len(failed)} steps failed in “{title}”."
            return notify(
                recipient=runner,
                actor=None,
                kind=Notification.Kind.AGENT_STEP_FAILED,
                message=message[:MESSAGE_LIMIT],
                link=f"/work?queue=history&bundle={bundle_id}",
                push_on_commit=True,
            )
    except Exception as exc:  # noqa: BLE001 - a notice never undoes a run
        logger.warning(
            "agents: the failed-step notice for bundle %s failed: %s", bundle_id, type(exc).__name__
        )
        return None
