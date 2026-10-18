"""POST mail/drafts/<id>/send/ (D3 contract §4): the carried edit first and
kept whatever follows; recipients, record, size, the connection checks
(paused included) and backoff before anything is claimed; every part cached
before the claim; the claim committed before Gmail is called; drafts.send
when Gmail holds the draft, messages.send otherwise; the draft's own row
becomes the sent copy, filed with get_or_create, its forwarded files copied,
its Message-ID read back; mailbox.reply or mailbox.sent; Gmail's refusals
reopen it, no answer leaves it sending for confirm-sent or reopen; a late
success on a draft that moved on is SEND_SUPERSEDED, still filed and
audited; a linked ReplyDraft is settled with it."""

import email
import uuid
from datetime import timedelta
from email import policy
from unittest.mock import patch

from django.db import connection as db
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.customers.models import Customer, Email, ReplyDraft
from services.mail import draft_send, gmail_store, sending
from services.mail.models import (
    MailAttachment,
    MailboxConnection,
    MailDraft,
    MailMessage,
    MailOutbox,
)

from .draft_fixtures import LOGO, PDF, URL, DraftFixture
from .gmail_fake import gmail_message


class SendFixture(DraftFixture):
    def send(self, pk, body=None):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(f"{URL}drafts/{pk}/send/", body or {}, format="json")

    def last_upload(self):
        method, route, metadata, message = self.fake.uploads[-1]
        return route, metadata, message


class SendTests(SendFixture):
    def test_a_saved_reply_goes_with_drafts_send_threaded_filed_and_audited(self):
        draft = self.new_draft(html="<p>Works for us.</p>")
        self.tick()
        gmail_id = self.stored(draft["id"]).gmail_draft_id
        response = self.send(draft["id"])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["draft"]["status"], "sent")
        self.assertIsNotNone(response.data["draft"]["sent_at"])
        route, metadata, message = self.last_upload()
        self.assertEqual(
            (route, metadata),
            ("/drafts/send", {"id": gmail_id, "message": {"threadId": self.quote.thread_id}}),
        )
        self.assertEqual(message["In-Reply-To"], "<CAF=quote@mail.gmail.com>")
        row = MailMessage.objects.get(pk=response.data["message"]["id"])
        self.assertEqual(row.pk, draft["message_id"])
        self.assertEqual((row.folder, row.label_ids, row.direction), ("sent", ["SENT"], "sent"))
        self.assertEqual(row.rfc_message_id, f"<{row.provider_message_id}@mail.gmail.com>")
        filed = Email.objects.get(pk=response.data["email"]["id"])
        self.assertEqual(
            (filed.customer, filed.direction, filed.to_addresses, filed.thread_id),
            (self.pizza, "sent", ["ann@pizzahut.com"], self.quote.thread_id),
        )
        self.assertEqual(row.email, filed)
        stored = self.stored(draft["id"])
        self.assertEqual(
            (stored.status, stored.sent_email, stored.message_id), ("sent", filed, row.pk)
        )
        event = AuditEvent.objects.get(action="mailbox.reply")
        self.assertEqual((event.actor, event.target_id), (self.dana, str(self.quote.pk)))
        self.assertEqual(
            {key: event.metadata[key] for key in ("to", "cc", "bcc_count", "attachments")},
            {"to": ["ann@pizzahut.com"], "cc": [], "bcc_count": 0, "attachments": 0},
        )
        self.assertGreater(event.metadata["bytes"], 0)
        self.assertEqual(self.fake.drafts, {})
        self.tick()  # history finds the sent copy held: nothing is filed twice
        self.assertEqual(Email.objects.filter(direction="sent").count(), 1)

    def test_a_draft_gmail_never_had_goes_with_messages_send(self):
        draft = self.new_draft()
        response = self.send(draft["id"])
        self.assertEqual(response.status_code, 200, response.data)
        route, metadata, _ = self.last_upload()
        self.assertEqual((route, metadata), ("/messages/send", {"threadId": self.quote.thread_id}))
        self.assertFalse(MailOutbox.objects.filter(status="pending").exists())
        self.assertEqual(self.fake.drafts, {})

    def test_a_new_message_on_no_record_is_sent_unfiled_and_audited_as_sent(self):
        draft = self.post_draft(
            {"kind": "new", "to": ["x@else.io"], "bcc": ["carl@acme.io"], "subject": "Hi"}
        ).data
        response = self.send(draft["id"])
        self.assertEqual((response.status_code, response.data["email"]), (200, None))
        self.assertEqual(self.last_upload()[1], {})
        event = AuditEvent.objects.get(action="mailbox.sent")
        self.assertEqual(
            (event.metadata["kind"], event.metadata["draft"], event.metadata["email"]),
            ("new", draft["id"], None),
        )
        self.assertEqual(event.metadata["bcc_count"], 1)
        self.assertFalse(Email.objects.filter(direction="sent").exists())

    def test_a_forward_fetches_its_files_first_and_its_sent_copy_keeps_them(self):
        draft = self.post_draft({"kind": "forward", "source_message_id": self.quote.pk}).data
        response = self.send(draft["id"], {"to": ["x@else.io"], "revision": 1})
        self.assertEqual(response.status_code, 200, response.data)
        message = self.last_upload()[2]
        files = {part.get_filename(): part for part in message.walk() if part.get_filename()}
        self.assertEqual(files["Renewal quote.pdf"].get_payload(decode=True), PDF)
        self.assertEqual(files["logo.png"]["Content-ID"], "<logo@pizzahut.com>")
        self.assertEqual(files["logo.png"].get_payload(decode=True), LOGO)
        copy = MailAttachment.objects.get(
            message_id=response.data["message"]["id"], part_id="sent:1"
        )
        with copy.file.open("rb") as handle:
            self.assertEqual(handle.read(), PDF)
        event = AuditEvent.objects.get(action="mailbox.sent")
        self.assertEqual((event.metadata["kind"], event.metadata["attachments"]), ("forward", 1))


class RefusalTests(SendFixture):
    def test_the_checks_before_the_claim(self):
        empty = self.post_draft({"kind": "new"}).data
        response = self.send(empty["id"])
        self.assertEqual(
            (response.status_code, response.data), (400, {"to": ["Add someone to send it to."]})
        )
        draft = self.new_draft()
        hidden = Customer.objects.create(
            organisation=Organisation.objects.create(name="Elsewhere"),
            name="Hidden",
            domain="hidden.io",
        )
        MailDraft.objects.filter(pk=draft["id"]).update(customer=hidden)
        response = self.send(draft["id"])
        self.assertEqual(response.data, {"record": ["Choose a record you can open."]})
        MailDraft.objects.filter(pk=draft["id"]).update(customer=self.pizza)
        with override_settings(MAIL_SEND_MAX_BYTES=10):
            response = self.send(draft["id"])
        self.assertEqual(
            (response.status_code, response.data["code"], response.data["detail"]),
            (
                413,
                "MESSAGE_TOO_LARGE",
                "This message is over Gmail's 25 MB limit. Remove an attachment.",
            ),
        )
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(
            backoff_until=timezone.now() + timedelta(seconds=90)
        )
        response = self.send(draft["id"])
        self.assertEqual((response.status_code, response.data["code"]), (503, "GMAIL_BUSY"))
        self.assertGreaterEqual(int(response["Retry-After"]), 89)
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        response = self.send(draft["id"], {"subject": "Edited", "revision": 1})
        self.assertEqual((response.status_code, response.data["code"]), (409, "MAILBOX_PAUSED"))
        stored = self.stored(draft["id"])
        self.assertEqual((stored.status, stored.subject), ("open", "Edited"))
        self.assertEqual(self.fake.uploads, [])

    def test_a_stale_revision_and_a_second_send(self):
        draft = self.new_draft()
        response = self.send(draft["id"], {"subject": "x", "revision": 9})
        self.assertEqual((response.status_code, response.data["code"]), (409, "DRAFT_CHANGED"))
        self.assertEqual(self.send(draft["id"]).status_code, 200)
        response = self.send(draft["id"])
        self.assertEqual((response.status_code, response.data["code"]), (409, "ALREADY_SENT"))

    def test_a_part_gmail_lost_refuses_before_the_claim(self):
        draft = self.post_draft(
            {"kind": "forward", "source_message_id": self.quote.pk, "to": ["x@else.io"]}
        ).data
        self.fake.files.clear()
        response = self.send(draft["id"])
        self.assertEqual((response.status_code, response.data["code"]), (410, "ATTACHMENT_GONE"))
        quote_parts = MailAttachment.objects.filter(message=self.quote).values_list("pk", flat=True)
        self.assertIn(response.data["attachment_id"], set(quote_parts))
        self.assertEqual(self.stored(draft["id"]).status, "open")

    def test_someone_elses_draft(self):
        draft = self.new_draft()
        self.client.force_authenticate(self.carl)
        self.assertEqual(self.send(draft["id"]).status_code, 404)


class GmailAnswerTests(SendFixture):
    def test_gmail_lost_the_draft(self):
        draft = self.new_draft()
        self.tick()
        self.fake.discard_in_gmail(self.stored(draft["id"]).gmail_draft_id)
        response = self.send(draft["id"])
        self.assertEqual(
            (response.status_code, response.data["detail"]),
            (409, "This draft was sent or discarded in Gmail. Check Sent before sending it again."),
        )
        stored = self.stored(draft["id"])
        self.assertEqual(
            (stored.status, stored.gmail_draft_id, stored.gmail_state), ("open", "", "local")
        )
        self.assertEqual(
            MailMessage.objects.get(pk=draft["message_id"]).provider_message_id,
            f"pending-draft:{stored.pk}",
        )

    def test_refusals_reopen_it(self):
        draft = self.new_draft()
        for status, reason, code, answer in (
            (429, "", "GMAIL_BUSY", 503),
            (413, "tooLarge", "MESSAGE_TOO_LARGE", 413),
            (400, "invalidArgument", "MAILBOX_REFUSED", 502),
        ):
            with self.subTest(status=status):
                self.fake.fail(r"/messages/send$", status, reason)
                response = self.send(draft["id"])
                self.assertEqual((response.status_code, response.data["code"]), (answer, code))
                self.assertEqual(self.stored(draft["id"]).status, "open")
        self.assertEqual(MailboxConnection.objects.get(pk=self.mailbox.pk).paused_reason, "")

    def test_a_lost_permission_pauses_the_mailbox(self):
        draft = self.new_draft()
        self.fake.fail(r"/messages/send$", 403, "insufficientPermissions")
        response = self.send(draft["id"])
        self.assertEqual(
            (response.status_code, response.data),
            (
                502,
                {
                    "code": "MAILBOX_REFUSED",
                    "detail": "Your mailbox didn't accept the message. Try again.",
                },
            ),
        )
        self.assertEqual(
            MailboxConnection.objects.get(pk=self.mailbox.pk).paused_reason, "token_revoked"
        )

    def test_no_answer_leaves_it_sending_for_its_owner_to_settle(self):
        first, second = self.new_draft(), self.new_draft(kind="new", to=["x@else.io"])
        with patch("services.mail.providers.google.http_upload", side_effect=TimeoutError()):
            response = self.send(first["id"])
        self.assertEqual((response.status_code, response.data["code"]), (504, "SEND_UNCONFIRMED"))
        self.assertEqual(self.stored(first["id"]).status, "sending")
        data = self.client.get(f"{URL}drafts/{first['id']}/").data
        self.assertEqual(
            (data["status"], data["sending"], data["sent_at"]), ("sent", "pending", None)
        )
        early = self.client.post(f"{URL}drafts/{first['id']}/confirm-sent/")
        self.assertEqual((early.status_code, early.data["code"]), (409, "NOT_UNCONFIRMED"))
        old = timezone.now() - timedelta(minutes=11)
        MailDraft.objects.filter(pk=first["id"]).update(updated_at=old)
        self.assertTrue(self.client.get(f"{URL}drafts/{first['id']}/").data["can_resolve"])
        confirmed = self.client.post(f"{URL}drafts/{first['id']}/confirm-sent/")
        self.assertEqual((confirmed.status_code, confirmed.data["status"]), (200, "sent"))
        self.assertFalse(MailMessage.objects.filter(pk=first["message_id"]).exists())
        with patch("services.mail.providers.google.http_upload", side_effect=TimeoutError()):
            self.send(second["id"])
        MailDraft.objects.filter(pk=second["id"]).update(updated_at=old)
        reopened = self.client.post(f"{URL}drafts/{second['id']}/reopen/")
        self.assertEqual((reopened.status_code, reopened.data["status"]), (200, "open"))

    def test_a_late_success_on_a_draft_that_moved_on_is_superseded_but_filed(self):
        draft = self.new_draft()
        real = self.fake.upload

        def racing(*args, **kwargs):
            MailDraft.objects.filter(pk=draft["id"]).update(
                status="open", updated_at=timezone.now()
            )
            return real(*args, **kwargs)

        with patch("services.mail.providers.google.http_upload", racing):
            response = self.send(draft["id"])
        self.assertEqual(
            (response.status_code, response.data),
            (409, {"code": "SEND_SUPERSEDED", "detail": "This reply already went out."}),
        )
        self.assertEqual(self.stored(draft["id"]).status, "open")
        self.assertEqual(MailMessage.objects.get(pk=draft["message_id"]).label_ids, ["DRAFT"])
        self.assertEqual(Email.objects.filter(direction="sent").count(), 1)
        self.assertTrue(AuditEvent.objects.filter(action="mailbox.reply").exists())

    def test_a_linked_agent_draft_is_sent_with_it(self):
        draft = self.new_draft()
        reply = self.agent_reply(draft["id"])
        response = self.send(draft["id"])
        self.assertEqual(response.status_code, 200, response.data)
        reply.refresh_from_db()
        self.assertEqual(
            (reply.status, reply.sent_by, reply.sent_email_id),
            ("sent", self.dana, response.data["email"]["id"]),
        )
        event = AuditEvent.objects.get(action="reply_draft.sent")
        self.assertEqual(event.metadata, {"email": response.data["email"]["id"]})

    def test_the_claim_stays_within_ten_queries(self):
        draft = self.new_draft()
        found = MailDraft.objects.get(pk=draft["id"])
        with CaptureQueriesContext(db) as queries:
            claimed_at, fresh = draft_send._claim(self.dana, found)
        self.assertIsNotNone(claimed_at)
        self.assertLessEqual(len(queries), 10)

    def test_the_mime_matches_the_draft(self):
        draft = self.new_draft(
            to=["Ann Lee <ann@pizzahut.com>"], cc=["sam@pizzahut.com"], bcc=["carl@acme.io"]
        )
        self.send(draft["id"])
        raw_message = self.last_upload()[2]
        parsed = email.message_from_bytes(raw_message.as_bytes(), policy=policy.default)
        self.assertEqual(parsed["Cc"].addresses[0].addr_spec, "sam@pizzahut.com")
        self.assertEqual(parsed["Bcc"].addresses[0].addr_spec, "carl@acme.io")
        self.assertEqual(parsed.get_content_type(), "multipart/alternative")


class LeftoverGmailDraftTests(SendFixture):
    """Task 10's carry: a late flush answer on a sending draft only stores its
    Gmail id. A send that did not take that Gmail draft has it deleted; a
    reopened draft queues its content again and reads `saving` with that row
    (final review 3), never `saving` with no row."""

    def late_answer(self, draft_id, *, fail=None):
        """http_upload, with a flush answer landing on the sending draft first:
        a new Gmail draft, its id stored as draft_flush._saved stores it."""
        real = self.fake.upload
        late = {}

        def racing(*args, **kwargs):
            late["id"] = self.fake.write_draft(gmail_message("late1", labels=["DRAFT"]))
            MailDraft.objects.filter(pk=draft_id).update(gmail_draft_id=late["id"])
            if fail is not None:
                self.fake.fail(r"/send$", *fail)
            return real(*args, **kwargs)

        return patch("services.mail.providers.google.http_upload", racing), late

    def deletes(self, draft_id):
        return list(
            MailOutbox.objects.filter(draft_id=draft_id, op="draft_delete").values_list(
                "payload", flat=True
            )
        )

    def test_a_send_that_took_its_gmail_draft_queues_no_delete(self):
        draft = self.new_draft()
        self.tick()
        self.assertEqual(self.send(draft["id"]).status_code, 200)
        self.assertEqual(self.deletes(draft["id"]), [])

    def test_messages_send_deletes_a_gmail_draft_a_late_create_made(self):
        draft = self.new_draft()
        racing, late = self.late_answer(draft["id"])
        with racing:
            response = self.send(draft["id"])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.last_upload()[0], "/messages/send")
        self.assertEqual(self.deletes(draft["id"]), [{"gmail_draft_id": late["id"]}])
        self.tick()
        self.assertEqual(self.fake.drafts, {})
        self.assertEqual(self.stored(draft["id"]).status, "sent")

    def test_drafts_send_deletes_a_different_gmail_draft_stored_meanwhile(self):
        draft = self.new_draft()
        self.tick()
        sent_id = self.stored(draft["id"]).gmail_draft_id
        racing, late = self.late_answer(draft["id"])
        self.fake.drafts["r-sent"] = self.fake.drafts[sent_id]  # what the send takes
        with racing:
            response = self.send(draft["id"])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.deletes(draft["id"]), [{"gmail_draft_id": late["id"]}])
        self.fake.drafts.pop("r-sent")  # the alias's message went with the send
        self.tick()
        self.assertNotIn(late["id"], self.fake.drafts)

    def test_a_refused_send_reopens_with_the_gmail_draft_kept_and_updated(self):
        draft = self.new_draft()
        MailOutbox.objects.filter(draft_id=draft["id"]).delete()
        racing, late = self.late_answer(draft["id"], fail=(400, "invalidArgument"))
        with racing:
            response = self.send(draft["id"])
        self.assertEqual(response.status_code, 502)
        stored = self.stored(draft["id"])
        self.assertEqual(
            (stored.status, stored.gmail_draft_id, stored.gmail_state),
            ("open", late["id"], "saving"),
        )
        self.assertEqual(self.deletes(draft["id"]), [])
        self.assertEqual(
            list(MailOutbox.objects.filter(draft_id=draft["id"]).values_list("op", flat=True)),
            ["draft_update"],
        )

    def test_a_refused_send_reopens_saving_with_its_content_queued(self):
        draft = self.new_draft()
        MailOutbox.objects.filter(draft_id=draft["id"]).delete()
        self.fake.fail(r"/messages/send$", 400, "invalidArgument")
        self.send(draft["id"])
        self.assertEqual(self.stored(draft["id"]).gmail_state, "saving")
        MailOutbox.objects.filter(draft_id=draft["id"]).delete()
        real = self.fake.upload

        def in_flight(*args, **kwargs):
            MailOutbox.objects.create(
                connection=self.mailbox,
                action_id=uuid.uuid4(),
                op="draft_create",
                status="sending",
                draft_id=draft["id"],
                next_attempt_at=timezone.now(),
            )
            self.fake.fail(r"/messages/send$", 400, "invalidArgument")
            return real(*args, **kwargs)

        with patch("services.mail.providers.google.http_upload", in_flight):
            self.send(draft["id"])
        stored = self.stored(draft["id"])
        self.assertEqual((stored.status, stored.gmail_state), ("open", "saving"))

    def test_the_reopen_route_reads_the_gmail_state_again(self):
        draft = self.new_draft()
        self.tick()
        MailDraft.objects.filter(pk=draft["id"]).update(gmail_state="saving")
        with patch("services.mail.providers.google.http_upload", side_effect=TimeoutError()):
            self.send(draft["id"])
        MailDraft.objects.filter(pk=draft["id"]).update(
            updated_at=timezone.now() - timedelta(minutes=11)
        )
        reopened = self.client.post(f"{URL}drafts/{draft['id']}/reopen/")
        self.assertEqual(
            (reopened.status_code, reopened.data["status"], reopened.data["gmail"]["state"]),
            (200, "open", "saving"),
        )
        self.assertTrue(MailOutbox.objects.filter(draft_id=draft["id"], status="pending").exists())

    def test_confirm_sent_deletes_the_gmail_draft_it_held(self):
        draft = self.new_draft()
        self.tick()
        gmail_id = self.stored(draft["id"]).gmail_draft_id
        with patch("services.mail.providers.google.http_upload", side_effect=TimeoutError()):
            self.send(draft["id"])
        MailDraft.objects.filter(pk=draft["id"]).update(
            updated_at=timezone.now() - timedelta(minutes=11)
        )
        with self.captureOnCommitCallbacks(execute=True):
            confirmed = self.client.post(f"{URL}drafts/{draft['id']}/confirm-sent/")
        self.assertEqual(confirmed.status_code, 200)
        self.assertEqual(self.deletes(draft["id"]), [{"gmail_draft_id": gmail_id}])
        self.tick()
        self.assertEqual(self.fake.drafts, {})
        self.assertEqual(self.stored(draft["id"]).status, "sent")


class SettleLinkedTests(SendFixture):
    """settle_linked: a Communications confirm-sent or reopen (Task 13)."""

    def claimed(self):
        draft = self.new_draft()
        reply = self.agent_reply(draft["id"], status="sending")
        MailDraft.objects.filter(pk=draft["id"]).update(status="sending")
        MailOutbox.objects.filter(draft_id=draft["id"]).delete()  # as the claim does
        return draft, reply

    def test_confirm_sent_settles_it_sent_and_drops_its_drafts_row(self):
        draft, reply = self.claimed()
        draft_send.settle_linked(reply.pk, confirm=True, now=timezone.now())
        self.assertEqual(self.stored(draft["id"]).status, "sent")
        self.assertFalse(MailMessage.objects.filter(pk=draft["message_id"]).exists())

    def test_reopen_settles_it_open_and_queues_its_content_again(self):
        draft, reply = self.claimed()
        draft_send.settle_linked(reply.pk, confirm=False, now=timezone.now())
        stored = self.stored(draft["id"])
        self.assertEqual((stored.status, stored.gmail_state), ("open", "saving"))
        self.assertEqual(
            list(MailOutbox.objects.filter(draft_id=draft["id"]).values_list("op", flat=True)),
            ["draft_create"],
        )
        self.assertTrue(MailMessage.objects.filter(pk=draft["message_id"]).exists())


class FixRoundTests(SendFixture):
    """Review fix round 1: a failure before the Gmail call, the reopen's
    requeue, a sent draft's leftover rows, the claim's checks again, and the
    settle routes on a linked draft."""

    def pending_writes(self, draft_id):
        return list(
            MailOutbox.objects.filter(
                draft_id=draft_id, status="pending", op__in=("draft_create", "draft_update")
            ).values_list("op", flat=True)
        )

    def back_to_pending(self, draft_id):
        """A draft_update the flush put back to pending while the draft was sending."""
        MailOutbox.objects.create(
            connection=self.mailbox,
            action_id=uuid.uuid4(),
            op="draft_update",
            draft_id=draft_id,
            next_attempt_at=timezone.now(),
        )

    def test_a_failure_before_the_gmail_call_reopens_both_rows(self):
        draft = self.post_draft(
            {"kind": "forward", "source_message_id": self.quote.pk, "to": ["x@else.io"]}
        ).data
        reply = self.agent_reply(draft["id"])
        with patch("services.mail.sending.read", side_effect=FileNotFoundError("gone")):
            response = self.send(draft["id"])
        self.assertEqual(
            (response.status_code, response.data),
            (502, {"code": "MAILBOX_REFUSED", "detail": draft_send.MAILBOX_REFUSED}),
        )
        self.assertEqual(self.stored(draft["id"]).status, "open")
        reply.refresh_from_db()
        self.assertEqual(reply.status, "open")
        self.assertEqual(self.fake.uploads, [])

    def test_a_refused_send_queues_the_content_the_claim_dropped(self):
        draft = self.new_draft()
        self.tick()
        self.patch_draft(draft["id"], {"subject": "Edited", "revision": draft["revision"]})
        self.assertEqual(self.pending_writes(draft["id"]), ["draft_update"])
        self.fake.fail(r"/drafts/send$", 400, "invalidArgument")
        self.assertEqual(self.send(draft["id"]).status_code, 502)
        stored = self.stored(draft["id"])
        self.assertEqual((stored.status, stored.gmail_state), ("open", "saving"))
        self.assertEqual(self.pending_writes(draft["id"]), ["draft_update"])
        self.tick()
        self.assertEqual(self.stored(draft["id"]).gmail_state, "saved")
        self.assertIn("Edited", [str(message["Subject"]) for _, _, _, message in self.fake.uploads])

    def test_a_sent_draft_drops_rows_put_back_while_sending(self):
        draft = self.new_draft()
        real = self.fake.upload

        def racing(*args, **kwargs):
            self.back_to_pending(draft["id"])
            return real(*args, **kwargs)

        with patch("services.mail.providers.google.http_upload", racing):
            self.assertEqual(self.send(draft["id"]).status_code, 200)
        self.assertEqual(self.pending_writes(draft["id"]), [])

    def test_confirm_sent_drops_rows_put_back_while_sending(self):
        draft = self.new_draft()
        with patch("services.mail.providers.google.http_upload", side_effect=TimeoutError()):
            self.send(draft["id"])
        self.back_to_pending(draft["id"])
        MailDraft.objects.filter(pk=draft["id"]).update(
            updated_at=timezone.now() - timedelta(minutes=11)
        )
        self.assertEqual(
            self.client.post(f"{URL}drafts/{draft['id']}/confirm-sent/").status_code, 200
        )
        self.assertEqual(self.pending_writes(draft["id"]), [])

    def change_before_the_claim(self, change):
        real = draft_send.sending.parts_of

        def parts_of(draft):
            change(draft)
            return real(draft)

        return patch("services.mail.sending.parts_of", parts_of)

    def test_the_claim_refuses_content_changed_since_the_checks(self):
        draft = self.new_draft()

        def edit(found):
            MailDraft.objects.filter(pk=found.pk).update(revision=found.revision + 1)

        with self.change_before_the_claim(edit):
            response = self.send(draft["id"])
        self.assertEqual((response.status_code, response.data["code"]), (409, "DRAFT_CHANGED"))
        self.assertEqual(response.data["draft"]["revision"], draft["revision"] + 1)
        self.assertEqual(self.stored(draft["id"]).status, "open")
        self.assertEqual(self.fake.uploads, [])

    def test_the_claim_refuses_a_mailbox_disconnected_since_the_checks(self):
        draft = self.new_draft()

        def disconnect(found):
            MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")

        with self.change_before_the_claim(disconnect):
            response = self.send(draft["id"])
        self.assertEqual((response.status_code, response.data["code"]), (409, "NO_MAILBOX"))
        self.assertEqual(self.stored(draft["id"]).status, "open")
        self.assertEqual(self.fake.uploads, [])

    def unconfirmed_linked(self):
        draft = self.new_draft()
        reply = self.agent_reply(draft["id"])
        with patch("services.mail.providers.google.http_upload", side_effect=TimeoutError()):
            self.send(draft["id"])
        old = timezone.now() - timedelta(minutes=11)
        MailDraft.objects.filter(pk=draft["id"]).update(updated_at=old)
        ReplyDraft.objects.filter(pk=reply.pk).update(updated_at=old)
        return draft, reply

    def test_confirm_sent_on_a_linked_draft_settles_the_agent_draft(self):
        draft, reply = self.unconfirmed_linked()
        response = self.client.post(f"{URL}drafts/{draft['id']}/confirm-sent/")
        self.assertEqual((response.status_code, response.data["status"]), (200, "sent"))
        reply.refresh_from_db()
        self.assertEqual((reply.status, reply.sent_by), ("sent", self.dana))
        event = AuditEvent.objects.get(action="reply_draft.confirmed_sent")
        self.assertEqual(event.target_id, str(reply.pk))

    def test_reopen_on_a_linked_draft_reopens_the_agent_draft(self):
        draft, reply = self.unconfirmed_linked()
        response = self.client.post(f"{URL}drafts/{draft['id']}/reopen/")
        self.assertEqual((response.status_code, response.data["status"]), (200, "open"))
        reply.refresh_from_db()
        self.assertEqual(reply.status, "open")
        self.assertTrue(AuditEvent.objects.filter(action="reply_draft.reopened").exists())


class FinalReviewTests(SendFixture):
    """Final review: history storing the sent id while the settle writes the
    sent copy, and every reopen queueing the content again."""

    def test_history_storing_the_sent_id_mid_settle_takes_the_held_row(self):
        draft = self.new_draft()
        self.tick()
        real_copy, real_derive = sending.sent_copy, gmail_store.derive

        def racing_copy(draft_, connection, answer, **kwargs):
            stored = []

            def derive(*args, **kw):
                if not stored:
                    # History stores the sent message between the read and the save.
                    stored.append(answer["id"])
                    full = gmail_message(
                        answer["id"], labels=["SENT"], sender="Dana Ruiz <dana@acme.io>"
                    )
                    gmail_store.store_gmail(connection, full, now=timezone.now())
                return real_derive(*args, **kw)

            with patch("services.mail.gmail_store.derive", derive):
                return real_copy(draft_, connection, answer, **kwargs)

        with patch("services.mail.sending.sent_copy", racing_copy):
            response = self.send(draft["id"])
        self.assertEqual(response.status_code, 200, response.data)
        stored = self.stored(draft["id"])
        self.assertEqual(stored.status, "sent")
        held = MailMessage.objects.get(provider_message_id=stored.message.provider_message_id)
        self.assertEqual((stored.message_id, held.folder), (held.pk, "sent"))
        self.assertNotEqual(held.pk, draft["message_id"])
        self.assertFalse(MailMessage.objects.filter(pk=draft["message_id"]).exists())
        self.assertTrue(AuditEvent.objects.filter(action="mailbox.reply").exists())

    def test_an_unconfirmed_reopen_queues_the_content_again(self):
        draft = self.new_draft()
        self.tick()
        with patch("services.mail.providers.google.http_upload", side_effect=TimeoutError()):
            self.send(draft["id"])
        MailDraft.objects.filter(pk=draft["id"]).update(
            updated_at=timezone.now() - timedelta(minutes=11)
        )
        with self.captureOnCommitCallbacks(execute=True):
            reopened = self.client.post(f"{URL}drafts/{draft['id']}/reopen/")
        self.assertEqual(
            (reopened.status_code, reopened.data["status"], reopened.data["gmail"]["state"]),
            (200, "open", "saving"),
        )
        self.assertEqual(
            list(
                MailOutbox.objects.filter(draft_id=draft["id"], status="pending").values_list(
                    "op", flat=True
                )
            ),
            ["draft_update"],
        )
        self.tick()
        self.assertEqual(self.stored(draft["id"]).gmail_state, "saved")

    def test_a_reopen_on_a_disconnected_mailbox_queues_nothing(self):
        draft = self.new_draft()
        reply = self.agent_reply(draft["id"], status="sending")
        MailDraft.objects.filter(pk=draft["id"]).update(status="sending")
        MailOutbox.objects.filter(draft_id=draft["id"]).delete()
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")
        draft_send.settle_linked(reply.pk, confirm=False, now=timezone.now())
        self.assertFalse(MailOutbox.objects.filter(draft_id=draft["id"]).exists())
        self.assertEqual(self.stored(draft["id"]).status, "open")
