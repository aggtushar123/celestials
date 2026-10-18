"""`/api/v1/communications/drafts/` (contract): a person's reply drafts.
404 for a draft the reader may not read; then 403 `NOT_YOURS` for any
write by someone other than its owner; then the write's own refusals.
Every write takes the draft's row lock, and nothing else."""

import http.client

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit
from services.mail import draft_send, gates, gmail_sync
from services.mail import drafts as mail_drafts
from services.mail.models import MailboxConnection
from services.mail.providers.base import ProviderError
from services.mail.sync import send_email

from .drafts import (
    LIST_LIMIT,
    RELATED,
    UNCONFIRMED_AFTER,
    apply_edits,
    clean_edits,
    draft_payload,
    email_summary,
    readable_drafts,
)
from .models import ReplyDraft

CHOOSE_CHANNEL = "Choose email or ticket."
CHOOSE_STATUS = "Choose open or sent."
NO_SUCH_DRAFT = "No such draft."
ALREADY_SENT = "This draft has been sent."
SEND_EMAIL = "Send an email draft instead."
COPY_TICKET = "Copy a ticket reply into its source and mark it sent."
NO_MAILBOX = "Connect your mailbox to send this."
MAILBOX_REFUSED = "Your mailbox didn't accept the message. Try again."
SEND_UNCONFIRMED = "We couldn't confirm this was sent. Check your Sent folder."
NOT_UNCONFIRMED = "This draft isn't waiting for confirmation."
SEND_SUPERSEDED = "This reply already went out."


def _code(code, detail, http):
    return Response({"code": code, "detail": detail}, status=http)


def _audit(request, action, draft, **metadata):
    audit.record(action, request=request, target=draft, metadata=metadata)  # SOC2:LOG-01


def _readable(request, pk, *, lock=False):
    """The draft, or a 404 that reads the same for a missing draft and one
    the reader may not read. `lock` takes its row lock (in a transaction)."""
    # SOC2:AUTH-02 a draft the reader may not read is missing
    rows = readable_drafts(request.user).select_related(*RELATED)
    if lock:
        rows = rows.select_for_update(of=("self",))
    draft = rows.filter(pk=pk).first()
    if draft is None:
        raise NotFound(NO_SUCH_DRAFT)
    return draft


def _not_yours(draft, verb="change"):
    return _code(
        "NOT_YOURS",
        f"Only {draft.owner.name} can {verb} this draft.",
        status.HTTP_403_FORBIDDEN,
    )


class DraftListView(APIView):
    """GET: the reader's own drafts, newest first, at most 100, no pages.
    `channel` (email, ticket) and `status` (open by default, sent)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        errors = {}
        channel = params.get("channel")
        if channel is not None and channel not in ReplyDraft.Channel.values:
            errors["channel"] = [CHOOSE_CHANNEL]
        wanted = params.get("status", ReplyDraft.Status.OPEN)
        if wanted not in ("open", "sent"):
            errors["status"] = [CHOOSE_STATUS]
        if errors:
            raise ValidationError(errors)
        statuses = (
            [ReplyDraft.Status.OPEN]
            if wanted == "open"
            else [ReplyDraft.Status.SENDING, ReplyDraft.Status.SENT]
        )
        # SOC2:AUTH-02 the list is the reader's own drafts only
        rows = ReplyDraft.objects.filter(
            organisation_id=request.user.organisation_id,
            owner_id=request.user.pk,
            status__in=statuses,
        )
        if channel is not None:
            rows = rows.filter(channel=channel)
        drafts = rows.select_related(*RELATED).order_by("-created_at", "-id")[:LIST_LIMIT]
        return Response({"results": [draft_payload(d, request.user) for d in drafts]})


class DraftDetailView(APIView):
    """GET: one draft, for whoever may read it. PATCH, DELETE: its owner."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(draft_payload(_readable(request, pk), request.user))

    def patch(self, request, pk):
        """The owner's edit of `body` and, on an email draft, `subject`."""
        with transaction.atomic():
            draft = _readable(request, pk, lock=True)
            # SOC2:AUTH-02 only the owner changes a draft
            if draft.owner_id != request.user.pk:
                return _not_yours(draft)
            if draft.status != ReplyDraft.Status.OPEN:
                return _code("ALREADY_SENT", ALREADY_SENT, status.HTTP_409_CONFLICT)
            changed = apply_edits(draft, clean_edits(draft, request.data))
            if changed:
                _audit(request, "reply_draft.edited", draft, fields=changed)
                mail_drafts.follow_reply_edit(draft, changed, now=timezone.now())
        return Response(draft_payload(draft, request.user))

    def delete(self, request, pk):
        """The owner discards it: it no longer exists."""
        with transaction.atomic():
            draft = _readable(request, pk, lock=True)
            # SOC2:AUTH-02 only the owner discards a draft
            if draft.owner_id != request.user.pk:
                return _not_yours(draft)
            if draft.status != ReplyDraft.Status.OPEN:
                return _code("ALREADY_SENT", ALREADY_SENT, status.HTTP_409_CONFLICT)
            _audit(request, "reply_draft.discarded", draft)
            mail_drafts.discard_linked(draft, request=request, now=timezone.now())
            draft.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DraftMarkSentView(APIView):
    """POST: the owner copied a ticket draft into its source and says so."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        with transaction.atomic():
            draft = _readable(request, pk, lock=True)
            # SOC2:AUTH-02 only the owner marks a draft sent
            if draft.owner_id != request.user.pk:
                return _not_yours(draft)
            if draft.channel != ReplyDraft.Channel.TICKET:
                return _code("WRONG_CHANNEL", SEND_EMAIL, status.HTTP_400_BAD_REQUEST)
            if draft.status != ReplyDraft.Status.OPEN:
                return _code("ALREADY_SENT", ALREADY_SENT, status.HTTP_409_CONFLICT)
            draft.status = ReplyDraft.Status.SENT
            draft.sent_at, draft.sent_by = timezone.now(), request.user
            draft.save(update_fields=["status", "sent_at", "sent_by", "updated_at"])
            _audit(request, "reply_draft.marked_sent", draft)
        return Response(draft_payload(draft, request.user))


class DraftSendView(APIView):
    """POST `{body?, subject?}`: the owner sends an email draft from their
    own connected mailbox to its `to`, filed on its record and threaded on
    its source. The edit is saved first, under the PATCH rules, and kept
    even if the provider then refuses. The draft is claimed (`sending`) and
    committed before the provider is called, so it is never sent twice; a
    refusal opens it again, and a timeout leaves it claimed for its owner
    to settle (`_Unconfirmed`)."""

    permission_classes = [IsAuthenticated]

    def _refused(self, request, draft):
        # SOC2:AUTH-02 only the owner sends a draft, from their own mailbox
        if draft.owner_id != request.user.pk:
            return _not_yours(draft, "send")
        if draft.channel != ReplyDraft.Channel.EMAIL:
            return _code("WRONG_CHANNEL", COPY_TICKET, status.HTTP_400_BAD_REQUEST)
        if draft.status != ReplyDraft.Status.OPEN:
            return _code("ALREADY_SENT", ALREADY_SENT, status.HTTP_409_CONFLICT)
        return None

    def post(self, request, pk):
        data = request.data if request.data else {}
        with transaction.atomic():
            draft = _readable(request, pk, lock=True)
            refused = self._refused(request, draft)
            if refused is not None:
                return refused
            changed = apply_edits(draft, clean_edits(draft, data))
            if changed:
                _audit(request, "reply_draft.edited", draft, fields=changed)
                mail_drafts.follow_reply_edit(draft, changed, now=timezone.now())
            linked = mail_drafts.linked_open(draft)
            if linked is None:
                connection = MailboxConnection.objects.filter(user_id=request.user.pk).first()
                # A paused Gmail never sends, and the draft is never claimed
                # (decision 24); token_revoked answers this too, not NO_MAILBOX.
                refused = gates.paused_response(connection) if connection is not None else None
                if refused is not None:
                    return refused
                if connection is None or connection.status != MailboxConnection.Status.CONNECTED:
                    # The edit is kept: it commits with this block.
                    return _code("NO_MAILBOX", NO_MAILBOX, status.HTTP_409_CONFLICT)
                # The claim, committed before the provider is called: a second
                # Send, or a retry after a failure, finds it taken and never
                # sends it again. Every later write is conditional on its stamp.
                claimed_at = timezone.now()
                claimed = ReplyDraft.objects.filter(
                    pk=draft.pk, status=ReplyDraft.Status.OPEN
                ).update(status=ReplyDraft.Status.SENDING, updated_at=claimed_at)
                if not claimed:
                    return _code("ALREADY_SENT", ALREADY_SENT, status.HTTP_409_CONFLICT)
        if linked is not None:
            return self._send_linked(request, pk, linked)
        return self._send(request, pk, draft, connection, claimed_at)

    def _send_linked(self, request, pk, linked):
        """D3 §3: a linked draft goes through the Gmail path (the draft's own
        send, which claims and settles both rows); the answer keeps this
        route's {draft, email} shape."""
        sent = draft_send.send_open(request, mail_drafts.readable(request.user, linked))
        if isinstance(sent, Response):
            # This route's own shapes: its `draft` is the ReplyDraft, and its
            # NO_MAILBOX sentence its own; §4's other answers pass through.
            code = sent.data.get("code") if isinstance(sent.data, dict) else None
            if code == "DRAFT_CHANGED":
                sent.data["draft"] = draft_payload(_readable(request, pk), request.user)
            elif code == "NO_MAILBOX":
                sent.data["detail"] = NO_MAILBOX
            return sent
        if not sent.marked:
            return _code("SEND_SUPERSEDED", SEND_SUPERSEDED, status.HTTP_409_CONFLICT)
        return Response(
            {
                "draft": draft_payload(_readable(request, pk), request.user),
                "email": email_summary(sent.email),
            }
        )

    def _send(self, request, pk, draft, connection, claimed_at):
        """Today's path for an unlinked draft, after its claim."""
        to = [address for _, address in draft.to]
        try:
            email = send_email(
                connection,
                to=to,
                subject=draft.subject,
                body=draft.body,
                customer=draft.customer,
                account=draft.account,
                answering=draft.email,
            )
        except ProviderError as exc:
            # Nothing left: the draft is open again, to send once more.
            ReplyDraft.objects.filter(
                pk=draft.pk, status=ReplyDraft.Status.SENDING, updated_at=claimed_at
            ).update(status=ReplyDraft.Status.OPEN, updated_at=timezone.now())
            if connection.provider == MailboxConnection.Provider.GOOGLE:
                # Decisions 20/21/23: a lost grant or permission pauses it with a
                # fixed sentence; anything to wait out leaves it as it was.
                if gmail_sync.classify_failure(exc) != "backoff":
                    gmail_sync.pause_revoked(connection, exc)
            elif exc.reauth:
                connection.status = MailboxConnection.Status.ERROR
                connection.error = str(exc)[:255]
                connection.save(update_fields=["status", "error", "updated_at"])
            return Response({"detail": MAILBOX_REFUSED}, status=status.HTTP_502_BAD_GATEWAY)
        except (TimeoutError, ConnectionError, http.client.HTTPException):
            # The request went out and no answer came back (a timeout, a
            # dropped connection, a broken answer): it may have been sent.
            # Left `sending`, never reopened here; once UNCONFIRMED_AFTER has
            # passed its owner says which (confirm-sent, reopen).
            return _code("SEND_UNCONFIRMED", SEND_UNCONFIRMED, status.HTTP_504_GATEWAY_TIMEOUT)
        # Any other failure from here leaves it `sending`: never sent twice.
        source, subject = draft.email, draft.subject
        with transaction.atomic():
            now = timezone.now()
            marked = ReplyDraft.objects.filter(
                pk=draft.pk, status=ReplyDraft.Status.SENDING, updated_at=claimed_at
            ).update(
                status=ReplyDraft.Status.SENT,
                sent_at=now,
                sent_by=request.user,
                sent_email=email,
                updated_at=now,
            )
            if marked:
                draft = _readable(request, pk)
                _audit(request, "reply_draft.sent", draft, email=email.pk)
            # SOC2:LOG-01 mail left through a credential we hold: written
            # whatever became of the draft meanwhile, from what was read at
            # the claim (a draft discarded since still names its source)
            audit.record(
                "mailbox.reply",
                request=request,
                target=source,
                metadata={
                    "to": to,
                    "subject": subject,
                    "cc": [],
                    "bcc_count": 0,
                    "attachments": 0,
                    "bytes": 0,
                },
            )
        if not marked:
            # The draft moved on while this send was out (reopened, sent
            # again, discarded): the mail is filed and audited, the draft left
            # as it is; the client reads it again.
            return _code("SEND_SUPERSEDED", SEND_SUPERSEDED, status.HTTP_409_CONFLICT)
        return Response(
            {
                "draft": draft_payload(draft, request.user),
                "email": email_summary(email),
            }
        )


class _Unconfirmed(APIView):
    """POST: the owner settles a send that was never confirmed: a draft
    `sending` for at least UNCONFIRMED_AFTER. One conditional UPDATE, so two
    clicks (or confirm and reopen together) never both win."""

    permission_classes = [IsAuthenticated]
    action = ""
    #: True: a confirm-sent (a linked Gmail draft is settled as sent).
    confirm = False

    def settle(self, request, now):
        """The fields the UPDATE sets."""
        raise NotImplementedError

    def post(self, request, pk):
        with transaction.atomic():
            draft = _readable(request, pk, lock=True)
            # SOC2:AUTH-02 only the owner, who may send it, settles it
            if draft.owner_id != request.user.pk:
                return _not_yours(draft, "send")
            now = timezone.now()
            settled = ReplyDraft.objects.filter(
                pk=draft.pk,
                status=ReplyDraft.Status.SENDING,
                updated_at__lte=now - UNCONFIRMED_AFTER,
            ).update(updated_at=now, **self.settle(request, now))
            if not settled:
                return _code("NOT_UNCONFIRMED", NOT_UNCONFIRMED, status.HTTP_409_CONFLICT)
            draft.refresh_from_db()
            # A linked Gmail draft is settled with it (D3 §4).
            draft_send.settle_linked(draft.pk, confirm=self.confirm, now=now)
            _audit(request, self.action, draft)  # SOC2:LOG-01
        return Response(draft_payload(draft, request.user))


class DraftConfirmSentView(_Unconfirmed):
    """The owner found it in their Sent folder: sent, with no filed email."""

    action = "reply_draft.confirmed_sent"
    confirm = True

    def settle(self, request, now):
        return {"status": ReplyDraft.Status.SENT, "sent_at": now, "sent_by": request.user}


class DraftReopenView(_Unconfirmed):
    """The owner found it did not go: open again, to edit and send."""

    action = "reply_draft.reopened"

    def settle(self, request, now):
        return {"status": ReplyDraft.Status.OPEN}
