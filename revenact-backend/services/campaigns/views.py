"""The campaign endpoints (spec §4). Readers read; only the owner writes,
previews, counts and sends. Every read is filtered by what the reader may
open. See docs/API_CONTRACTS.md, `campaigns`."""

from types import SimpleNamespace

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from services.accounts.models import User

from . import audit
from .access import get_owned, get_readable
from .audience import build
from .models import MAX_OWNED, Campaign, CampaignSend
from .payloads import (
    campaign_payload,
    deliveries_page,
    list_page,
    read_campaign,
    send_payload,
    sends_page,
)
from .rendering import PREVIEW_TOKEN, compose, link
from .sending import Refusal, before_claim, claim
from .serializers import CampaignWriteSerializer, PreviewSerializer
from .validation import CAMPAIGN_SENT, CHOOSE_SEGMENT, LIMIT_REACHED, NOBODY, NOT_IN_AUDIENCE

SHARING_FIELDS = frozenset({"sharing", "shared_with"})


def _limit_reached(user):
    """Whether `user` already owns the most campaigns allowed, archived ones
    included. Call inside the transaction that creates the new one: the
    owner's row is locked first, so two creates at once queue."""
    list(User.objects.select_for_update().filter(pk=user.pk).values_list("pk", flat=True))
    return Campaign.objects.filter(owner=user).count() >= MAX_OWNED


class CampaignListCreateView(APIView):
    """GET /api/v1/campaigns/?tab=mine|shared&archived=1&cursor=. POST
    creates a draft owned by the caller."""

    # SOC2:AUTH-02 authentication here; `readable_campaigns` scopes every read
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(list_page(request.user, request.query_params))

    def post(self, request):
        serializer = CampaignWriteSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            if _limit_reached(request.user):
                return Response(
                    {"non_field_errors": [LIMIT_REACHED]}, status=status.HTTP_400_BAD_REQUEST
                )
            campaign = serializer.save(
                owner=request.user, organisation_id=request.user.organisation_id
            )
            audit.record(
                "created", campaign, request=request, metadata={"segment": campaign.segment_id}
            )
            if campaign.sharing != Campaign.Sharing.PRIVATE:
                audit.record_shared(request, campaign)
        return Response(campaign_payload(campaign, request.user), status=status.HTTP_201_CREATED)


class CampaignDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/campaigns/<id>/. Readers read; only the
    owner writes (403 for another reader, 404 for anyone else). DELETE is
    409 once it has been sent."""

    # SOC2:AUTH-02 authentication here; `read_campaign` (readable_campaigns) and
    # `get_owned` check the campaign
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(campaign_payload(read_campaign(request.user, pk), request.user))

    def patch(self, request, pk):
        campaign = get_owned(request.user, pk)
        with transaction.atomic():
            # The row lock a send's claim takes, so an edit never lands mid-claim.
            campaign = (
                Campaign.objects.select_for_update(no_key=True, of=("self",))
                .select_related("owner", "segment", "organisation")
                .get(pk=campaign.pk)
            )
            serializer = CampaignWriteSerializer(
                campaign, data=request.data, partial=True, context={"request": request}
            )
            serializer.is_valid(raise_exception=True)
            changed = audit.changed_fields(campaign, serializer.validated_data)
            campaign = serializer.save()
            if "status" in changed and campaign.status == Campaign.Status.ARCHIVED:
                changed.remove("status")
                audit.record("archived", campaign, request=request)
            fields = [name for name in changed if name not in SHARING_FIELDS]
            if fields:
                audit.record("updated", campaign, request=request, metadata={"fields": fields})
            if SHARING_FIELDS & set(changed):
                audit.record_shared(request, campaign)
        return Response(campaign_payload(campaign, request.user))

    def delete(self, request, pk):
        campaign = get_owned(request.user, pk)
        with transaction.atomic():
            # A send's claim holds this row; a delete waits for it, then sees the send.
            campaign = (
                Campaign.objects.select_for_update(of=("self",))
                .select_related("organisation")
                .get(pk=campaign.pk)
            )
            if campaign.sends.exists():
                return Response(
                    {"code": "CAMPAIGN_SENT", "detail": CAMPAIGN_SENT},
                    status=status.HTTP_409_CONFLICT,
                )
            audit.record("deleted", campaign, request=request)
            campaign.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _no_segment():
    return Response({"detail": CHOOSE_SEGMENT}, status=status.HTTP_400_BAD_REQUEST)


class CampaignAudienceView(APIView):
    """GET /api/v1/campaigns/<id>/audience/: who a send would email now and
    who it would skip, counted as the owner (the only caller). Nothing is
    written."""

    # SOC2:AUTH-02 authentication here; `get_owned` is the owner check, `build` reads as them
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        campaign = get_owned(request.user, pk)
        if campaign.segment_id is None:
            return _no_segment()
        reach = build(campaign, today=timezone.localdate(), now=timezone.now())
        return Response(reach.payload())


class CampaignPreviewView(APIView):
    """POST /api/v1/campaigns/<id>/preview/ with `{contact?, subject?,
    body?}`: the email as one person in the audience would read it, the
    stored words unless unsaved ones are sent, and a placeholder link.
    Nothing is written."""

    # SOC2:AUTH-02 authentication here; `get_owned` is the owner check, `build` reads as them
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        campaign = get_owned(request.user, pk)
        serializer = PreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if campaign.segment_id is None:
            return _no_segment()
        queued = build(campaign, today=timezone.localdate(), now=timezone.now()).queued
        wanted = data.get("contact")
        if wanted is not None:
            # SOC2:AUTH-02 only someone the owner's send would email, never any contact by id
            person = next((p for p in queued if p.pk == wanted), None)
            if person is None:
                return Response({"contact": [NOT_IN_AUDIENCE]}, status=status.HTTP_400_BAD_REQUEST)
        elif queued:
            person = queued[0]
        else:
            return Response({"detail": NOBODY}, status=status.HTTP_400_BAD_REQUEST)
        source = SimpleNamespace(
            subject=data.get("subject", campaign.subject), body=data.get("body", campaign.body)
        )
        subject, body = compose(
            source,
            person,
            sender_name=campaign.owner.name,
            workspace=campaign.organisation.name,
            url=link(PREVIEW_TOKEN),
        )
        return Response({"subject": subject, "body": body})


class CampaignSendsView(APIView):
    """GET /api/v1/campaigns/<id>/sends/?cursor=, newest first. POST sends
    now, owner only: it claims the send and answers it at once (201),
    `sending`, with everyone queued; the `deliver_pending` runner (every
    minute) emails them and finishes it."""

    # SOC2:AUTH-02 authentication here; `get_readable` checks the campaign
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        campaign = get_readable(request.user, pk)
        return Response(sends_page(campaign, request.user, request.query_params))

    def post(self, request, pk):
        campaign = get_owned(request.user, pk)
        refusal = before_claim(campaign)
        if refusal:
            return Response(refusal, status=status.HTTP_400_BAD_REQUEST)
        try:
            send = claim(
                campaign.pk,
                kind=CampaignSend.Kind.MANUAL,
                by=request.user,
                today=timezone.localdate(),
                now=timezone.now(),
                request=request,
            )
        except Refusal as refused:
            return Response(refused.body, status=refused.status)
        send = CampaignSend.objects.select_related("sent_by", "rule").get(pk=send.pk)
        return Response(send_payload(send, request.user), status=status.HTTP_201_CREATED)


def _send(request, pk, send_id):
    campaign = get_readable(request.user, pk)
    return get_object_or_404(campaign.sends.select_related("sent_by", "rule"), pk=send_id)


class CampaignSendDetailView(APIView):
    """GET /api/v1/campaigns/<id>/sends/<send_id>/."""

    # SOC2:AUTH-02 authentication here; `get_readable` checks the campaign
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, send_id):
        return Response(send_payload(_send(request, pk, send_id), request.user))


class CampaignDeliveriesView(APIView):
    """GET /api/v1/campaigns/<id>/sends/<send_id>/deliveries/?status=&reason=&cursor=."""

    # SOC2:AUTH-02 authentication here; `get_readable` checks the campaign, the page each row
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, send_id):
        send = _send(request, pk, send_id)
        return Response(deliveries_page(send, request.user, request.query_params))
