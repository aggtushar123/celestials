"""The survey builder's endpoints. Only the owner writes; every read is
filtered by what the reader may open. See docs/API_CONTRACTS.md,
`surveys`."""

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit

from .access import get_owned, get_readable, readable_sends
from .answers import answers_page, pending_rows
from .audience import resolve
from .models import MAX_PEOPLE, SurveySend
from .payloads import list_rows, send_payload
from .sending import EMAIL_NOT_SET_UP, Refusal, claim, email_is_set_up
from .serializers import AudienceSerializer, SendWriteSerializer

CANNOT_DELETE = "Only a draft can be deleted; a sent survey's answers feed the scores."
SHARING_FIELDS = frozenset({"sharing", "shared_with"})


def _changed(send, data):
    """The names of the fields `data` would change, never their values."""
    changed = []
    for name, value in data.items():
        if name == "shared_with":
            before = set(send.shared_with.values_list("pk", flat=True))
            if {user.pk for user in value} != before:
                changed.append(name)
        elif getattr(send, name) != value:
            changed.append(name)
    return sorted(changed)


def _record_shared(request, send):
    audit.record(  # SOC2:LOG-01
        "survey.shared",
        request=request,
        target=send,
        metadata={
            "sharing": send.sharing,
            "shared_with": sorted(send.shared_with.values_list("pk", flat=True)),
        },
    )


class SendListCreateView(APIView):
    """GET /api/v1/surveys/sends/?scope=mine|shared|all, the sends the
    caller may read, newest first. POST creates a draft owned by the caller."""

    # SOC2:AUTH-02 authentication here; `readable_sends` scopes every read
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sends = readable_sends(request.user)
        scope = request.query_params.get("scope")
        if scope == "mine":
            sends = sends.filter(owner=request.user)
        elif scope == "shared":
            sends = sends.exclude(owner=request.user)
        sends = sends.select_related("owner", "segment").order_by("-created_at", "-pk")
        return Response(list_rows(sends, request.user))

    def post(self, request):
        serializer = SendWriteSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            send = serializer.save(owner=request.user, organisation_id=request.user.organisation_id)
            audit.record(  # SOC2:LOG-01
                "survey.created",
                request=request,
                target=send,
                metadata={"survey_type": send.survey_type},
            )
            if send.sharing != SurveySend.Sharing.PRIVATE:
                _record_shared(request, send)
        return Response(send_payload(send, request.user), status=status.HTTP_201_CREATED)


class SendDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/surveys/sends/<id>/. Readers read. Only the
    owner writes (403 for another reader, 404 for anyone who may not read
    it). After the claim, PATCH accepts only the name and sharing. Only a
    draft can be deleted."""

    # SOC2:AUTH-02 authentication here; `get_readable`/`get_owned` check the send
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(send_payload(get_readable(request.user, pk), request.user))

    def patch(self, request, pk):
        send = get_owned(request.user, pk)
        with transaction.atomic():
            # Under the row lock the send's claim takes, so an edit never
            # races a send that is starting.
            send = (
                SurveySend.objects.select_for_update(of=("self",))
                .select_related("owner", "segment")
                .get(pk=send.pk)
            )
            serializer = SendWriteSerializer(
                send, data=request.data, partial=True, context={"request": request}
            )
            serializer.is_valid(raise_exception=True)
            changed = _changed(send, serializer.validated_data)
            send = serializer.save()
            if changed:
                audit.record(  # SOC2:LOG-01
                    "survey.updated", request=request, target=send, metadata={"fields": changed}
                )
            if SHARING_FIELDS & set(changed):
                _record_shared(request, send)
        return Response(send_payload(send, request.user))

    def delete(self, request, pk):
        send = get_owned(request.user, pk)
        with transaction.atomic():
            send = SurveySend.objects.select_for_update().get(pk=send.pk)
            if send.status != SurveySend.Status.DRAFT:
                return Response({"detail": CANNOT_DELETE}, status=status.HTTP_409_CONFLICT)
            audit.record(  # SOC2:LOG-01
                "survey.deleted",
                request=request,
                target=send,
                metadata={"survey_type": send.survey_type},
            )
            send.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SendAudienceView(APIView):
    """POST /api/v1/surveys/sends/audience/ with `{segment, roles}`. Returns
    the counts the builder's modal shows, resolved on the server from the
    caller's own view. Nothing is created."""

    # SOC2:AUTH-02 authentication here; `owned_segment` and `resolve` check the rest
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = AudienceSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        audience = resolve(data["segment"], data["roles"], request.user, today=timezone.localdate())
        return Response({**audience.counts(), "limit": MAX_PEOPLE})


class SendNowView(APIView):
    """POST /api/v1/surveys/sends/<id>/send/, the real send, owner only. It
    refuses with 400 while email is not set up (console backend outside
    DEBUG), then claims the draft (409 if already sent or sending, 429 past the daily
    limit), resolves the audience again on the server (400 if empty or over
    500) and writes one queued invite per person. Answers the send at once,
    `sending`: the `deliver_pending` runner (every minute) emails each
    person their link, freezes the counts and audits `survey.sent`."""

    # SOC2:AUTH-02 authentication here; `get_owned` and `claim` check the send and its segment
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        get_owned(request.user, pk)
        if not email_is_set_up():
            return Response({"detail": EMAIL_NOT_SET_UP}, status=status.HTTP_400_BAD_REQUEST)
        try:
            send = claim(
                pk,
                request.user,
                today=timezone.localdate(),
                now=timezone.now(),
                actor=request.user,
                request=request,
            )
        except Refusal as refusal:
            return Response(refusal.body, status=refusal.status)
        return Response(send_payload(send, request.user))


class SendAnswersView(APIView):
    """GET /api/v1/surveys/sends/<id>/answers/?filter=&cursor=, the answers
    of people the caller may open, newest first, plus `hidden_count`."""

    # SOC2:AUTH-02 authentication here; `get_readable` checks the send, `answers_page` each row
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        send = get_readable(request.user, pk)
        return Response(answers_page(send, request.user, request.query_params))


class SendPendingView(APIView):
    """GET /api/v1/surveys/sends/<id>/pending/, the people the caller may
    open who have not answered (pending, expired or failed), plus
    `hidden_count`."""

    # SOC2:AUTH-02 authentication here; `get_readable` checks the send, `pending_rows` each row
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        send = get_readable(request.user, pk)
        return Response(pending_rows(send, request.user, now=timezone.now()))
