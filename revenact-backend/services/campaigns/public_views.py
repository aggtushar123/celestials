"""The unsubscribe link a campaign email carries (spec §1.6): no sign-in.
The link's secret is the credential: it is looked up by its SHA-256 only,
and every bad link (unknown, malformed, older than 365 days, never sent)
reads the same 404. GET only names the workspace, so a link scanner that
follows it unsubscribes nobody; POST unsubscribes, once."""

from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit
from core.throttling import CampaignUnsubscribeThrottle
from services.customers.models import Contact
from services.surveys.public_views import MAX_TOKEN_LENGTH
from services.surveys.tokens import hash_token

from .models import LINK_DAYS, CampaignDelivery
from .validation import EXPIRED


def _live(token, now):
    """The delivery whose token this is, within 365 days, or None: a sent
    one, or one skipped with its hash kept, which was cut off between the
    email and its mark and so may have gone out (`sending.resume`); its
    365 days run from its send's start, having no `sent_at`."""
    if len(token) > MAX_TOKEN_LENGTH:
        return None
    since = now - timedelta(days=LINK_DAYS)
    return (
        CampaignDelivery.objects.filter(token_hash=hash_token(token))
        .filter(
            Q(status=CampaignDelivery.Status.SENT, sent_at__gt=since)
            | Q(status=CampaignDelivery.Status.SKIPPED, send__started_at__gt=since)
        )
        .select_related("send__campaign__organisation")
        .first()
    )


class UnsubscribeView(APIView):
    """GET/POST /api/v1/campaigns/unsubscribe/<token>/. GET returns
    `{workspace}`; POST answers 204, idempotent."""

    # SOC2:AUTH-02 public by design: the link's secret is the credential, looked up by
    # hash only, 365 days, one 404 body for every bad link
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [CampaignUnsubscribeThrottle]  # SOC2:AUTH-06

    def get(self, request, token):
        delivery = _live(token, timezone.now())
        if delivery is None:
            return Response(EXPIRED, status=status.HTTP_404_NOT_FOUND)
        return Response({"workspace": delivery.send.campaign.organisation.name})

    def post(self, request, token):
        now = timezone.now()
        delivery = _live(token, now)
        if delivery is None:
            return Response(EXPIRED, status=status.HTTP_404_NOT_FOUND)
        with transaction.atomic():
            # Re-read under the row lock, so two presses at once record one opt-out.
            contact = (
                Contact.objects.select_for_update(no_key=True)
                .only("pk", "campaigns_unsubscribed_at")
                .get(pk=delivery.contact_id)
            )
            if contact.campaigns_unsubscribed_at is None:
                contact.campaigns_unsubscribed_at = now
                contact.save(update_fields=["campaigns_unsubscribed_at"])
                audit.record(  # SOC2:LOG-01
                    "contact.campaigns_unsubscribed",
                    # Public: the token is the only credential. `anonymous`
                    # never reads `request.user`, which DRF's
                    # `force_authenticate` (or a cookie or bearer token from
                    # elsewhere) could fill even on this
                    # `authentication_classes = []` view, so the actor stays
                    # null while the IP and request id are kept.
                    anonymous=True,
                    request=request,
                    organisation=delivery.send.campaign.organisation,
                    target=contact,
                    target_repr=f"Contact {contact.pk}",
                    metadata={"via": "link", "send": delivery.send_id},
                )
        return Response(status=status.HTTP_204_NO_CONTENT)
