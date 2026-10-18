"""GET /work/unmatched/ (agent bundles round 2 D3, contract §3.1); the match
route joins it, dismiss follows."""

from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from services.brain.http import ScopeRefusals
from services.connectors import unmatched
from services.customers.models import Ticket


class UnmatchedListView(ScopeRefusals, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        try:
            return Response(unmatched.page(request.user, params.get("queue"), params.get("cursor")))
        except unmatched.BadCursor:
            raise ValidationError({"cursor": [unmatched.STALE_CURSOR]}) from None


class UnmatchedMatchView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            made, added = unmatched.match(request.user, pk, request.data, request=request)
        except unmatched.Refused as exc:
            return Response(exc.body, status=exc.status)
        record = made.customer or made.account
        kind = "customer" if made.customer_id else "account"
        ref = {"type": kind, "id": record.pk, "name": record.name}
        is_ticket = isinstance(made, Ticket)
        return Response(
            {
                "record": ref,
                "ticket": (
                    {"id": made.pk, "number": made.ticket_number, "record": ref}
                    if is_ticket
                    else None
                ),
                "conversation": None if is_ticket else {"id": made.pk},
                "contact_added": added,
            }
        )


class UnmatchedDismissView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            unmatched.dismiss(request.user, pk, request=request)
        except unmatched.Refused as exc:
            return Response(exc.body, status=exc.status)
        return Response({"dismissed": True})
