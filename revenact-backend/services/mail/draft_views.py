"""Two-way Gmail's delivery 3 routes (D3 contract §2-§6): the compose
prefill, drafts and their attachments, sending, and searching older mail in
Gmail. Owner-only throughout: a draft, a source, an upload and a search
result are found only among the caller's own (SOC2:AUTH-02)."""

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.throttling import MailDraftUploadThrottle, MailGmailSearchThrottle

from . import actions, compose, draft_send, drafts, gmail_search
from .models import MailDraft, MailMessage
from .serializers import message_detail


def _pk(raw):
    """A query-string id: ASCII digits, short enough for a bigint; else None."""
    return int(raw) if raw.isascii() and raw.isdigit() and len(raw) <= 18 else None


class MailComposeView(APIView):
    """GET /api/v1/mail/compose/?kind=&message= — the editor's prefill (§2).
    Nothing is stored and nothing goes to Gmail. A paused mailbox still
    prefills (decision 14)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        kind = request.query_params.get("kind", "")
        if kind not in MailDraft.Kind.values:
            return Response({"kind": [drafts.CHOOSE_KIND]}, status=status.HTTP_400_BAD_REQUEST)
        source = None
        if kind == MailDraft.Kind.NEW:
            connection = drafts.own_connection(request.user)
        else:
            pk = _pk(request.query_params.get("message", ""))
            if pk is None:
                return Response(
                    {"message": [drafts.CHOOSE_SOURCE]}, status=status.HTTP_400_BAD_REQUEST
                )
            source = drafts.own_message(request.user, pk)
            if drafts.is_draft(source):
                return drafts.is_draft_answer()
            connection = source.connection
        refused = drafts.refusal(connection)
        if refused is not None:
            return refused
        return Response(compose.prefill(connection, request.user, kind, source).payload())


class MailDraftListView(APIView):
    """POST /api/v1/mail/drafts/ — a new draft (§3). The content left out is
    the prefill's; the Drafts row and the draft_create row exist at once.
    There is no list route: Drafts is mail/messages/?folder=drafts."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        kind = data.get("kind")
        if kind not in MailDraft.Kind.values:
            return Response({"kind": [drafts.CHOOSE_KIND]}, status=status.HTTP_400_BAD_REQUEST)
        source = None
        if kind == MailDraft.Kind.NEW:
            connection = drafts.own_connection(request.user)
        else:
            pk = data.get("source_message_id")
            if not isinstance(pk, int) or isinstance(pk, bool):
                return Response(
                    {"source_message_id": [drafts.CHOOSE_SOURCE]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            source = drafts.own_message(request.user, pk)
            if drafts.is_draft(source):
                return drafts.is_draft_answer()
            connection = source.connection
        drafts.check_shape(data)
        refused = drafts.refusal(connection)
        if refused is not None:
            return refused
        with transaction.atomic():
            if source is not None:
                drafts.lock_rows([source.pk])
            # Checked again on the locked row: a disconnect that committed first refuses.
            connection = actions.lock_connection(connection)
            refused = drafts.refusal(connection)
            if refused is not None:
                return refused
            draft = drafts.create_from_request(
                connection, request.user, kind, source, data, now=timezone.now()
            )
        fresh = drafts.readable(request.user, draft.pk)
        fresh.suggestion = draft.suggestion
        return Response(drafts.payload(fresh, request.user), status=status.HTTP_201_CREATED)


class MailDraftView(APIView):
    """GET /api/v1/mail/drafts/<id>/ — the editor's read (§2). PATCH edits it
    (§3); DELETE discards it. Owner-only: 404 for anyone else."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(drafts.payload(drafts.readable(request.user, pk), request.user))

    def patch(self, request, pk):
        """Partial content plus `revision` (§3). 200 with the draft."""
        data = request.data if isinstance(request.data, dict) else {}
        with transaction.atomic():
            draft = drafts.lock(request.user, pk)
            refused = drafts.edit(draft, data, user=request.user, now=timezone.now())
            if refused is not None:
                return refused
        return Response(drafts.payload(drafts.readable(request.user, pk), request.user))

    def delete(self, request, pk):
        """Discard (decision 12): the draft only, never the conversation. 204."""
        with transaction.atomic():
            draft = drafts.lock(request.user, pk)
            refused = drafts.discard_refusal([draft])
            if refused is not None:
                return refused
            drafts.discard([draft], request=request, now=timezone.now())
        return Response(status=status.HTTP_204_NO_CONTENT)


class DiscardSerializer(serializers.Serializer):
    ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1), min_length=1, max_length=100
    )


class MailDraftDiscardView(APIView):
    """POST /api/v1/mail/drafts/discard/ {ids} — the Drafts folder's bulk
    Delete (§3). All or nothing: an id that is not the caller's open draft
    answers 404 for the whole request, naming none."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = DiscardSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids = set(serializer.validated_data["ids"])
        with transaction.atomic():
            found = drafts.lock_many(request.user, ids)
            # SOC2:AUTH-02 every id must be the caller's own open draft
            if {draft.pk for draft in found} != ids:
                return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
            refused = drafts.discard_refusal(found)
            if refused is not None:
                return refused
            drafts.discard(found, request=request, now=timezone.now())
        return Response({"discarded": len(found)})


def _locked_open(request, pk):
    """The caller's draft, locked, open, its mailbox passing the checks 1-3:
    (draft, None) or (None, the refusing answer). In a transaction."""
    draft = drafts.lock(request.user, pk)
    if draft.status != MailDraft.Status.OPEN:
        return None, drafts.error("ALREADY_SENT", drafts.ALREADY_SENT, status.HTTP_409_CONFLICT)
    refused = drafts.refusal(actions.lock_connection(draft.connection))
    return (None, refused) if refused is not None else (draft, None)


class MailDraftAttachmentsView(APIView):
    """POST /api/v1/mail/drafts/<id>/attachments/ (multipart `file`) — a file
    on the draft (§3). No revision: adding a file never conflicts."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [MailDraftUploadThrottle]
    parser_classes = [MultiPartParser]

    def post(self, request, pk):
        now = timezone.now()
        with transaction.atomic():
            draft, refused = _locked_open(request, pk)
            if refused is not None:
                return refused
            part, total, refused = drafts.add_upload(draft, request.FILES.get("file"), now=now)
            if refused is not None:
                return refused
        return Response(
            {
                "attachment": compose.attachment_row(part, "upload"),
                "revision": draft.revision,
                "total_bytes": total,
            },
            status=status.HTTP_201_CREATED,
        )


class MailDraftAttachmentView(APIView):
    """DELETE /api/v1/mail/drafts/<id>/attachments/<attachment_id>/ (§3)."""

    permission_classes = [IsAuthenticated]

    def delete(self, request, pk, attachment_id):
        now = timezone.now()
        with transaction.atomic():
            draft, refused = _locked_open(request, pk)
            if refused is not None:
                return refused
            drafts.remove_part(draft, attachment_id, now=now)
        return Response({"revision": draft.revision, "total_bytes": drafts.total_bytes(draft)})


class MailDraftSendView(APIView):
    """POST /api/v1/mail/drafts/<id>/send/ — optional content plus `revision`,
    saved first under PATCH's rules, then sent (§4). 200 {draft, message, email}."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        data = request.data if isinstance(request.data, dict) else {}
        sent = draft_send.send(request, pk, data)
        if isinstance(sent, Response):
            return sent
        if not sent.marked:
            return drafts.error(
                "SEND_SUPERSEDED", draft_send.SEND_SUPERSEDED, status.HTTP_409_CONFLICT
            )
        return Response(draft_send.answer(request, sent))


class _MailDraftUnconfirmed(APIView):
    permission_classes = [IsAuthenticated]
    confirm = False

    def post(self, request, pk):
        refused = draft_send.settle_unconfirmed(request, pk, confirm=self.confirm)
        if refused is not None:
            return refused
        return Response(drafts.payload(drafts.readable(request.user, pk), request.user))


class MailDraftConfirmSentView(_MailDraftUnconfirmed):
    """POST .../confirm-sent/ — it went: sent, nothing filed (§4)."""

    confirm = True


class MailDraftReopenView(_MailDraftUnconfirmed):
    """POST .../reopen/ — it did not go: open again, its Gmail id kept (§4)."""

    confirm = False


def _detail(request, row):
    row = MailMessage.objects.select_related(
        "connection", "email__customer", "email__account", "draft__reply_draft"
    ).get(pk=row.pk)
    return message_detail(request.user, row)


class GmailSearchView(APIView):
    """GET /api/v1/mail/gmail/search/?q=&page_token= — live, nothing stored (§6)."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [MailGmailSearchThrottle]

    def get(self, request):
        q = request.query_params.get("q", "").strip()
        if not q:
            return Response(
                {"q": ["Type something to search for."]}, status=status.HTTP_400_BAD_REQUEST
            )
        if len(q) > 500:
            return Response(
                {"q": ["Keep the search under 500 characters."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        connection, refused = gmail_search.mailbox(request.user)
        if refused is not None:
            return refused
        return gmail_search.search(connection, q, request.query_params.get("page_token", ""))


class GmailSearchOpenView(APIView):
    """POST /api/v1/mail/gmail/search/open/ {gmail_id} — a held id answers
    its stored copy (200); otherwise only that message is stored (201)."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [MailGmailSearchThrottle]

    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        gmail_id = data.get("gmail_id")
        if not isinstance(gmail_id, str) or not gmail_id.strip() or len(gmail_id) > 255:
            return Response(
                {"gmail_id": ["Choose a search result."]}, status=status.HTTP_400_BAD_REQUEST
            )
        connection, refused = gmail_search.mailbox(request.user)
        if refused is not None:
            return refused
        # SOC2:AUTH-02 an id is resolved only within the caller's own mailbox
        held = MailMessage.objects.filter(
            connection=connection, provider_message_id=gmail_id
        ).first()
        if held is not None:
            return Response(_detail(request, held))
        row, refused = gmail_search.open_message(connection, gmail_id)
        if refused is not None:
            return refused
        code = status.HTTP_201_CREATED if row.stored_now else status.HTTP_200_OK
        return Response(_detail(request, row), status=code)
