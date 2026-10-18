"""GET /api/v1/slack-conversations/<id>/ (Slack escalations D1, contract §4):
one Slack thread, read under the story's two rules: the record the reader may
open, then its department (personal.visible_conversations)."""

from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from services.connectors.providers.slack import ts_time
from services.connectors.slack_text import named

from . import conversation_links
from .models import Account, SlackConversation
from .personal import visible_conversations
from .scoping import can_open

NOT_FOUND = {"detail": "Not found."}


def _at(ts):
    return ts_time(ts).isoformat(timespec="seconds").replace("+00:00", "Z")


class SlackConversationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        user = request.user
        # SOC2:AUTH-02 the reader's workspace (defence in depth: the record
        # check covers it too; an `id IN` subquery, never a DISTINCT join),
        # the department, then the record: any refusal reads the same 404
        org = user.organisation_id
        own = SlackConversation.objects.filter(pk=pk).filter(
            Q(customer__organisation_id=org)
            | Q(account_id__in=Account.objects.filter(customers__organisation_id=org).values("id"))
        )
        row = (
            visible_conversations(user, own)
            .select_related("customer", "account", "started_by")
            .first()
        )
        if row is None or not can_open(user, row.record):
            return Response(NOT_FOUND, status=404)
        # SOC2:AUTH-02 SE4-17: each ticket only for a reader who may read it on its own
        tickets, hidden = conversation_links.tickets_for(user, row)
        return Response(
            {
                "id": row.pk,
                "record": {
                    "type": "account" if row.account_id else "customer",
                    "id": row.record.pk,
                    "name": row.record.name,
                },
                "channel": f"#{row.channel_name}" if row.channel_name else "",
                "url": row.url,
                # CC-14: a mention reads as the person it names
                "title": named(row.title, row.people),
                "started_by": {
                    "id": row.started_by_id,
                    "name": row.started_by.name if row.started_by else row.started_by_name,
                },
                "matched_by": row.matched_by,
                "messages": [
                    {
                        "ts": m["ts"],
                        "name": m.get("name", ""),
                        "at": _at(m["ts"]),
                        "text": named(m.get("text", ""), row.people),
                        "bot": bool(m.get("bot")),
                    }
                    for m in row.messages or []
                ],
                "tickets": tickets,
                "hidden_links": hidden,
            }
        )
