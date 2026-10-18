"""/api/v1/email-agent/ (spec §2): a proposal's detail, Book and Dismiss;
Undo for a task the agent made from an email."""

from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime
from rest_framework import status, views
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import proposals
from .feed import proposal_item
from .models import EmailIntent


def _refused(refused):
    return Response({"code": refused.code, "detail": refused.message}, status=refused.http_status)


class ProposalView(views.APIView):
    """GET proposals/<id>/ — the approver's own."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(proposal_item(get_object_or_404(proposals.mine(request.user), pk=pk)))


class ProposalBookView(views.APIView):
    """POST proposals/<id>/book/ {starts_at?, length_minutes?} — book it on
    the approver's calendar with Meet; Google invites every attendee."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        proposal = get_object_or_404(proposals.mine(request.user), pk=pk)
        start = None
        if request.data.get("starts_at"):
            start = parse_datetime(str(request.data["starts_at"]))
            if start is None:
                return Response(
                    {"code": "INVALID_WINDOW", "detail": "Give starts_at as a date and time."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        length = request.data.get("length_minutes")
        if length is not None and (not isinstance(length, int) or not 15 <= length <= 240):
            return Response(
                {"code": "INVALID_WINDOW", "detail": "Length is 15 to 240 minutes."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            booked = proposals.book(
                proposal, request.user, starts_at=start, length_minutes=length, request=request
            )
        except proposals.Refused as refused:
            return _refused(refused)
        return Response({"status": booked.status, "meeting_id": booked.meeting_id})


class ProposalDismissView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        proposal = get_object_or_404(proposals.mine(request.user), pk=pk)
        try:
            proposals.dismiss(proposal, request.user, request=request)
        except proposals.Refused as refused:
            return _refused(refused)
        return Response({"status": "dismissed"})


class SuggestionDecideView(views.APIView):
    """POST suggestions/<id>/confirm/ or dismiss/ — the sender's yes or no
    to what the agent read in their own sent mail (decision B)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk, verb):
        from . import run

        if verb not in ("confirm", "dismiss"):
            return Response({"code": "NOT_FOUND", "detail": "No such action."}, status=404)
        intent = get_object_or_404(
            run.waiting_on(request.user).select_related("assignee", "organisation"), pk=pk
        )
        try:
            if verb == "confirm":
                made = run.confirm(intent, request.user, request=request)
                task_id = made.pk if intent.kind == EmailIntent.Kind.TASK else None
                return Response({"confirmed": True, "task_id": task_id})
            run.dismiss(intent, request.user, request=request)
        except run.Refused as refused:
            return _refused(refused)
        return Response({"dismissed": True})


class TaskUndoView(views.APIView):
    """POST tasks/<task_id>/undo/ — the asker or the assignee takes back a
    task the agent made from an email, within a day."""

    permission_classes = [IsAuthenticated]

    def post(self, request, task_id):
        intent = (
            EmailIntent.objects.filter(
                organisation_id=request.user.organisation_id, task_id=task_id
            )
            .select_related("task", "organisation")
            .first()
        )
        if intent is None:
            return Response({"code": "NOT_FOUND", "detail": "No such task."}, status=404)
        try:
            proposals.undo_task(intent, request.user, request=request)
        except proposals.Refused as refused:
            return _refused(refused)
        return Response({"undone": True})
