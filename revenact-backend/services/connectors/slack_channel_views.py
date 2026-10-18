"""A Slack connection's channels in Settings › Connections (Slack
escalations D3, contract §3, SC3-15): the list, and including, excluding or
setting one channel to a customer or account. An integrations manager only,
as every connection setting."""

from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit
from services.accounts.permissions import CanManageIntegrations
from services.customers.models import Account, Customer, SlackConversation
from services.customers.task_changes import person

from . import slack_channels
from .models import Connector, SlackChannel
from .views import _own_connector

NOT_SLACK = "Only a Slack connection has channels."
NO_SUCH_CHANNEL = "No such channel."
NOTHING = "Change whether it syncs, or its customer."
ON_OR_OFF = "Choose on or off."
CHOOSE_RECORD = "Choose an organisation or an account."
_stamp = serializers.DateTimeField().to_representation


_REF = inline_serializer(
    "SlackChannelRecord",
    {
        "type": serializers.ChoiceField(choices=["customer", "account"]),
        "id": serializers.IntegerField(),
        "name": serializers.CharField(),
    },
    allow_null=True,
)
_ROW = {
    "id": serializers.CharField(),
    "name": serializers.CharField(),
    "included": serializers.BooleanField(),
    "member": serializers.BooleanField(),
    "shared": serializers.BooleanField(),
    "private": serializers.BooleanField(),
    "record": _REF,
    "conversations": serializers.IntegerField(),
    "join_error": serializers.CharField(allow_blank=True),
    "read_at": serializers.DateTimeField(allow_null=True),
    "chosen_by": inline_serializer(
        "SlackChannelChosenBy",
        {"id": serializers.IntegerField(), "name": serializers.CharField()},
        allow_null=True,
    ),
}
CHANNEL = inline_serializer("SlackChannelRow", _ROW)
LISTING = inline_serializer(
    "SlackChannelList",
    {
        "channels": inline_serializer("SlackChannelRows", _ROW, many=True),
        "can_join": serializers.BooleanField(),
        "synced": serializers.IntegerField(),
        "total": serializers.IntegerField(),
        "events_at": serializers.DateTimeField(allow_null=True),
    },
)
CHANGE = inline_serializer(
    "SlackChannelChange",
    {
        "included": serializers.BooleanField(required=False),
        "record": inline_serializer(
            "SlackChannelChangeRecord",
            {
                "type": serializers.ChoiceField(choices=["customer", "account"]),
                "id": serializers.IntegerField(),
            },
            allow_null=True,
            required=False,
        ),
    },
)


def _record_ref(row):
    record = row.record
    if record is None:
        return None
    kind = "account" if row.account_id else "customer"
    return {"type": kind, "id": record.pk, "name": record.name}


def channel_payload(row, conversations):
    """Contract §2.2."""
    return {
        "id": row.channel_id,
        "name": row.name,
        "included": row.included,
        "member": row.is_member,
        "shared": row.external_shared,
        "private": row.is_private,
        "record": _record_ref(row),
        "conversations": conversations,
        "join_error": row.join_error,
        "read_at": _stamp(row.read_at) if row.read_at else None,
        "chosen_by": person(row.chosen_by),
    }


def _slack(request, pk):
    connector = _own_connector(request, pk)
    if connector.provider != Connector.Provider.SLACK:
        return connector, Response(
            {"code": "NOT_SLACK", "detail": NOT_SLACK}, status=status.HTTP_409_CONFLICT
        )
    return connector, None


def _counts(connector):
    return dict(
        SlackConversation.objects.filter(connector=connector)
        .values("channel")
        .annotate(n=Count("id"))
        .values_list("channel", "n")
    )


class SlackChannelListView(APIView):
    """GET /api/v1/connectors/<id>/slack-channels/ (contract §3.1)."""

    # SOC2:AUTH-02 a connection's settings are an integrations manager's
    permission_classes = [CanManageIntegrations]

    @extend_schema(responses=LISTING)
    def get(self, request, pk):
        connector, refused = _slack(request, pk)
        if refused is not None:
            return refused
        rows = list(
            SlackChannel.objects.filter(connector=connector, is_archived=False)
            .select_related("customer", "account", "chosen_by")
            .order_by("name", "channel_id")
        )
        counts = _counts(connector)
        # public channels only: a kept private channel is listed but not counted
        public = [row for row in rows if not row.is_private]
        events_at = max((row.event_at for row in rows if row.event_at), default=None)
        return Response(
            {
                "channels": [channel_payload(row, counts.get(row.channel_id, 0)) for row in rows],
                "can_join": slack_channels.can_join(connector),
                "synced": sum(1 for row in public if row.included),
                "total": len(public),
                "events_at": _stamp(events_at) if events_at else None,
            }
        )


class _Refused(Exception):
    def __init__(self, body):
        super().__init__(body)
        self.body = body


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _record(connector, data):
    """(customer, account) for the PATCH's `record`, or _Refused (contract §3.2)."""
    if data is None:
        return None, None
    if not isinstance(data, dict) or data.get("type") not in ("customer", "account"):
        raise _Refused({"record": [CHOOSE_RECORD]})
    if not _whole(data.get("id")):
        raise _Refused({"record": [CHOOSE_RECORD]})
    org = connector.organisation_id
    if data["type"] == "customer":
        # SOC2:AUTH-02 only a record of this workspace
        found = Customer.objects.filter(pk=data["id"], organisation_id=org).first()
        if found is None:
            raise _Refused({"record": ["No such organisation."]})
        customer, account = found, None
    else:
        inside = Account.customers.through.objects.filter(customer__organisation_id=org).values(
            "account_id"
        )
        found = Account.objects.filter(pk=data["id"], id__in=inside).first()
        if found is None:
            raise _Refused({"record": ["No such account."]})
        customer, account = None, found
    # SOC2:AUTH-02 SC3-9: only a record the connection covers
    if not connector.covers(customer=customer, account=account):
        raise _Refused({"record": [f"{found.name} isn't covered by this Slack connection."]})
    return customer, account


def _ref(customer_id, account_id):
    if account_id:
        return f"account:{account_id}"
    return f"customer:{customer_id}" if customer_id else None


class SlackChannelDetailView(APIView):
    """PATCH /api/v1/connectors/<id>/slack-channels/<channel id>/ (contract §3.2)."""

    # SOC2:AUTH-02 a connection's settings are an integrations manager's
    permission_classes = [CanManageIntegrations]

    @extend_schema(request=CHANGE, responses=CHANNEL)
    def patch(self, request, pk, channel_id):
        connector, refused = _slack(request, pk)
        if refused is not None:
            return refused
        row = (
            SlackChannel.objects.filter(
                connector=connector, channel_id=channel_id, is_archived=False
            )
            .select_related("customer", "account", "chosen_by")
            .first()
        )
        if row is None:
            return Response(
                {"code": "NO_SUCH_CHANNEL", "detail": NO_SUCH_CHANNEL},
                status=status.HTTP_404_NOT_FOUND,
            )
        data = request.data if isinstance(request.data, dict) else {}
        try:
            if "included" not in data and "record" not in data:
                raise _Refused({"detail": NOTHING})
            if "included" in data and not isinstance(data["included"], bool):
                raise _Refused({"included": [ON_OR_OFF]})
            record = _record(connector, data["record"]) if "record" in data else None
        except _Refused as exc:
            return Response(exc.body, status=status.HTTP_400_BAD_REQUEST)
        changes = {}
        if "included" in data and data["included"] != row.included:
            changes["included"] = {"old": row.included, "new": data["included"]}
            row.included = data["included"]
        if record is not None:
            customer, account = record
            old = _ref(row.customer_id, row.account_id)
            new = _ref(customer.pk if customer else None, account.pk if account else None)
            if old != new:
                changes["record"] = {"old": old, "new": new}
                row.customer, row.account = customer, account
        if changes:
            with transaction.atomic():  # the change and its audit row land together
                row.chosen_by, row.chosen_at = request.user, timezone.now()
                row.join_error = row.read_error = ""
                # F4: only what this change sets; an event's event_at, missed
                # threads and the catch-up's walk written meanwhile survive
                row.save(
                    update_fields=[
                        "included",
                        "customer",
                        "account",
                        "chosen_by",
                        "chosen_at",
                        "join_error",
                        "read_error",
                        "updated_at",
                    ]
                )
                audit.record(  # SOC2:LOG-01 ids and codes only, never a channel name
                    "slack_channel.update",
                    request=request,
                    organisation=connector.organisation,
                    target=connector,
                    metadata={"channel": row.pk, "changes": changes},
                )
        return Response(channel_payload(row, _counts(connector).get(row.channel_id, 0)))
