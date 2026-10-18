"""/api/v1/calendar/ (design §API): reading meetings, and booking one (D3).

Visibility (owner decision 2, 2026-10-17): the owner sees every field of
their own meetings; anyone else sees a meeting only through a customer they
can open, with the shared fields, never the description.
"""

from datetime import timedelta

from django.db.models import Q
from django.utils.dateparse import parse_datetime
from rest_framework import serializers, status, views
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from services.customers.scoping import get_visible_customer
from services.mail import gates, scopes
from services.mail.models import MailboxConnection

from . import booking
from .models import Meeting

MAX_WINDOW = timedelta(days=100)


def _error(code, message, http_status=status.HTTP_400_BAD_REQUEST):
    return Response({"success": False, "error": {"code": code, "message": message}}, http_status)


def _person(user):
    return {"id": user.id, "name": user.name} if user else None


def shared(meeting):
    """What a colleague who can open the customer may see."""
    return {
        "id": meeting.id,
        "title": meeting.title,
        "starts_at": meeting.starts_at,
        "ends_at": meeting.ends_at,
        "all_day": meeting.all_day,
        "status": meeting.status,
        "owner": _person(meeting.owner),
        "organizer_email": meeting.organizer_email,
        "attendee_count": len(meeting.attendees),
        "meet_url": meeting.meet_url,
        "customer": {"id": meeting.customer_id, "name": meeting.customer.name}
        if meeting.customer_id
        else None,
        "account": {"id": meeting.account_id, "name": meeting.account.name}
        if meeting.account_id
        else None,
    }


def owned(meeting):
    """The owner's own view: every field."""
    return {
        **shared(meeting),
        # SOC2:AUTH-02 description, location, attendee addresses: owner only.
        "description": meeting.description,
        "location": meeting.location,
        "attendees": meeting.attendees,
        "html_link": meeting.html_link,
        "booked_in_revenact": meeting.booked_in_revenact,
    }


class BookingSerializer(serializers.Serializer):
    customer_id = serializers.IntegerField()
    contact_ids = serializers.ListField(
        child=serializers.IntegerField(), min_length=1, max_length=50
    )
    title = serializers.CharField(max_length=255)
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    description = serializers.CharField(
        max_length=5000, required=False, allow_blank=True, default=""
    )
    request_id = serializers.CharField(max_length=100)


class MyMeetingsView(views.APIView):
    """GET meetings/?from=&to= — the caller's own meetings in a window.
    POST meetings/ — book one on the caller's calendar (booking.book)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        start = parse_datetime(request.query_params.get("from", "") or "")
        end = parse_datetime(request.query_params.get("to", "") or "")
        if start is None or end is None or end <= start or end - start > MAX_WINDOW:
            return _error("INVALID_WINDOW", "Give from and to, at most 100 days apart.")
        rows = Meeting.objects.filter(
            owner=request.user, starts_at__lt=end, ends_at__gt=start
        ).select_related("owner", "customer", "account")
        return Response({"meetings": [owned(m) for m in rows]})

    def post(self, request):
        data = BookingSerializer(data=request.data)
        if not data.is_valid():
            field = next(iter(data.errors))
            return _error("INVALID", f"{field}: {data.errors[field][0]}")
        values = data.validated_data
        connection = gates.live_mailbox(request.user)
        if connection is None or connection.provider != MailboxConnection.Provider.GOOGLE:
            return _error("CALENDAR_NOT_GRANTED", "Connect Google with Calendar first.")
        if not scopes.has_calendar(connection.granted_scopes):
            return _error("CALENDAR_NOT_GRANTED", "Add Calendar to your Google connection first.")
        paused = gates.paused_response(connection)
        if paused is not None:
            return paused
        customer = get_visible_customer(
            request, values["customer_id"]
        )  # SOC2:AUTH-02 404 outside visibility
        try:
            contacts = booking.invitees(customer, values["contact_ids"])
            meeting = booking.book(
                connection=connection,
                user=request.user,
                customer=customer,
                contacts=contacts,
                title=values["title"].strip(),
                starts_at=values["starts_at"],
                ends_at=values["ends_at"],
                description=values["description"],
                request_id=values["request_id"],
                request=request,
            )
        except booking.BookingRefused as refused:
            return _error(refused.code, refused.message, refused.http_status)
        meeting = Meeting.objects.select_related("owner", "customer", "account").get(pk=meeting.pk)
        return Response({"meeting": owned(meeting)}, status=status.HTTP_201_CREATED)


class CustomerMeetingsView(views.APIView):
    """GET customers/<id>/meetings/ — shared fields of every owner's meetings
    on a customer the caller can open, or on one of its accounts."""

    permission_classes = [IsAuthenticated]

    def get(self, request, customer_id):
        customer = get_visible_customer(request, customer_id)  # SOC2:AUTH-02 404 outside visibility
        rows = (
            Meeting.objects.filter(organisation_id=customer.organisation_id)
            .filter(Q(customer=customer) | Q(account__customers=customer))
            .select_related("owner", "customer", "account")
            .distinct()
            .order_by("-starts_at", "-id")[:200]
        )
        return Response(
            {"meetings": [owned(m) if m.owner_id == request.user.id else shared(m) for m in rows]}
        )


class CalendarStatusView(views.APIView):
    """GET status/ — connected, needs_consent (Gmail without Calendar) or not_connected."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        connection = (
            MailboxConnection.objects.filter(
                user=request.user, provider=MailboxConnection.Provider.GOOGLE
            )
            .exclude(status=MailboxConnection.Status.DISCONNECTED)
            .select_related("calendar_state")
            .first()
        )
        if connection is None:
            return Response({"calendar": "not_connected", "last_synced_at": None})
        if not scopes.has_calendar(connection.granted_scopes):
            return Response({"calendar": "needs_consent", "last_synced_at": None})
        state = getattr(connection, "calendar_state", None)
        return Response(
            {"calendar": "connected", "last_synced_at": state.synced_at if state else None}
        )
