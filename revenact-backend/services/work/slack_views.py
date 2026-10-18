"""A Slack message a person sent to their own Work (Connections spec §3):
dismissing it deletes it, text and all. Its sender's alone: anyone else,
their manager and admins included, gets the same 404 as for a row that
doesn't exist."""

from datetime import timedelta

from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit

from . import slack_actions
from .feed_slack import mine
from .models import SlackSuggestion

#: SOC2:DATA-04 a Slack message sent to Work is deleted this long after it arrived.
KEEP_DAYS = 30


class SlackMessageView(APIView):
    """DELETE /api/v1/work/slack-messages/<id>/: dismiss (delete) it."""

    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        # SOC2:AUTH-02 only its owner, in their own workspace; anyone else gets 404
        row = mine(request.user).filter(pk=pk).first()
        if row is None:
            raise NotFound()
        with transaction.atomic():
            audit.record(  # SOC2:LOG-01 a person deleted a Slack message from their Work
                "slack.message_dismissed",
                request=request,
                target=row,
                target_repr=f"Slack suggestion {row.pk}",
            )
            row.delete()
        return Response(status=204)


def _own(request, pk):
    # SOC2:AUTH-02 only its owner, in their own workspace; anyone else gets 404
    row = mine(request.user).filter(pk=pk).first()
    if row is None:
        raise NotFound()
    return row


def _text(request, name, limit):
    value = request.data.get(name, "") if isinstance(request.data, dict) else ""
    return str(value or "")[:limit]


class SlackMessageJiraView(APIView):
    """POST /api/v1/work/slack-messages/<id>/jira/ {summary?, description?}:
    the Jira issue, made once. 200 {key, url}; 400 {detail} when refused."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        row = _own(request, pk)
        try:
            key, url = slack_actions.create_issue(
                row,
                request.user,
                summary=_text(request, "summary", 200),
                description=_text(request, "description", 4000),
                request=request,
            )
        except slack_actions.Refusal as exc:
            return Response({"detail": exc.sentence}, status=exc.status)
        return Response({"key": key, "url": url})


class SlackMessageReplyView(APIView):
    """POST /api/v1/work/slack-messages/<id>/reply/ {text}: the person's
    reply, posted once. 200 {url}; 400 or 409 {detail}."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        row = _own(request, pk)
        try:
            url = slack_actions.send_reply(
                row, request.user, _text(request, "text", 10_000), request=request
            )
        except slack_actions.Refusal as exc:
            return Response({"detail": exc.sentence}, status=exc.status)
        return Response({"url": url})


def purge(*, now=None):
    """Delete Slack messages sent to Work more than KEEP_DAYS ago; one audit
    row per workspace that lost any (counts only). Returns how many went."""
    from services.accounts.models import Organisation

    now = now or timezone.now()
    old = SlackSuggestion.objects.filter(created_at__lt=now - timedelta(days=KEEP_DAYS))
    per = list(
        old.values("organisation_id").annotate(deleted=Count("id")).order_by("organisation_id")
    )
    if not per:
        return 0
    workspaces = Organisation.objects.in_bulk([row["organisation_id"] for row in per])
    with transaction.atomic():
        deleted, _ = old.delete()
        for row in per:
            audit.record(  # SOC2:LOG-01 SOC2:DATA-04 retention ran: counts only, no actor
                "slack.messages_purged",
                actor=None,
                organisation=workspaces[row["organisation_id"]],
                metadata={"deleted": row["deleted"]},
            )
    return deleted
