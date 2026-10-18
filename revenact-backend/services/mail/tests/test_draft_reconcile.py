"""Gmail's drafts back into Revenact (D3 contract §5 "Incoming drafts",
decisions 8, 26, 27): a tick whose history touched a draft runs one
drafts.list (every page) after history. A Gmail draft Revenact does not know
becomes a MailDraft on its stored row (a reply when its References name a
message in its thread); a known one edited in Gmail takes Gmail's version
and a new revision, unless a Revenact edit is on its way (then ours wins);
one that vanished was sent in Gmail when its message is now SENT (or a SENT
message of the owner's is stored in its thread since), else discarded
there, and a linked ReplyDraft follows, audited `in: gmail`. A draft being
sent is never settled here. The daily send-as refresh runs it too."""

from datetime import timedelta
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from core.models import AuditEvent
from services.customers.models import Email, ReplyDraft
from services.mail import draft_sync, gmail_store, gmail_sync
from services.mail.models import (
    MailAttachment,
    MailboxConnection,
    MailDraft,
    MailMessage,
    MailOutbox,
)

from .draft_fixtures import DraftFixture
from .gmail_fake import gmail_message


def mine(message_id, **fields):
    values = {
        "labels": ["DRAFT"],
        "sender": "Dana Ruiz <dana@acme.io>",
        "to": "Ann Lee <ann@pizzahut.com>",
        "subject": "Idea",
        "text": "Written in Gmail",
    }
    values.update(fields)
    return gmail_message(message_id, **values)


class AdoptTests(DraftFixture):
    def test_a_draft_written_in_gmail_appears(self):
        gmail_id = self.fake.write_draft(mine("w1"))
        self.tick()
        draft = MailDraft.objects.get(gmail_draft_id=gmail_id)
        self.assertEqual(
            (draft.kind, draft.status, draft.gmail_state, draft.revision),
            ("new", "open", "saved", 1),
        )
        self.assertEqual(draft.message.provider_message_id, "w1")
        self.assertEqual((draft.subject, draft.text), ("Idea", "Written in Gmail"))
        self.assertEqual(draft.to, [["Ann Lee", "ann@pizzahut.com"]])
        self.assertEqual((draft.customer_id, draft.record_chosen), (self.pizza.pk, False))
        listed = self.client.get("/api/v1/mail/messages/?folder=drafts").data["results"]
        self.assertEqual([item["id"] for item in listed], [draft.message_id])

    def test_a_reply_written_in_gmail_knows_its_source(self):
        gmail_id = self.fake.write_draft(
            mine(
                "w2",
                thread_id=self.quote.thread_id,
                references="<CAF=first@mail.gmail.com> <CAF=quote@mail.gmail.com>",
                subject="Re: Renewal quote",
            )
        )
        self.tick()
        draft = MailDraft.objects.get(gmail_draft_id=gmail_id)
        self.assertEqual((draft.kind, draft.source_id), ("reply", self.quote.pk))
        self.assertEqual(draft.in_reply_to, "<CAF=quote@mail.gmail.com>")

    def test_every_page_of_drafts_is_read(self):
        for n in range(3):
            self.fake.write_draft(mine(f"p{n}"))
        self.tick()
        self.assertEqual(MailDraft.objects.count(), 3)

    def test_the_daily_send_as_refresh_runs_it_for_drafts_imported_before(self):
        old = mine("imp1")
        self.fake.add(old, quietly=True)
        self.fake.drafts["r-old"] = "imp1"
        gmail_store.store_gmail(self.mailbox, old, now=self.now)
        self.mailbox.send_as_synced_at = None
        self.mailbox.save(update_fields=["send_as_synced_at"])
        self.tick()
        self.assertTrue(MailDraft.objects.filter(gmail_draft_id="r-old").exists())


class EditedInGmailTests(DraftFixture):
    def test_an_edit_in_gmail_replaces_the_content_and_bumps_the_revision(self):
        draft = self.new_draft()
        self.tick()
        gmail_id = self.stored(draft["id"]).gmail_draft_id
        self.fake.edit_draft(
            gmail_id,
            mine(
                "e2",
                subject="Re: Renewal quote",
                text="Edited in Gmail",
                thread_id=self.quote.thread_id,
            ),
        )
        self.tick()
        stored = self.stored(draft["id"])
        self.assertEqual(
            (stored.text, stored.revision, stored.gmail_message_id), ("Edited in Gmail", 2, "e2")
        )
        self.assertEqual(stored.message.provider_message_id, "e2")
        self.assertFalse(MailMessage.objects.filter(pk=draft["message_id"]).exists())
        stale = self.patch_draft(draft["id"], {"subject": "Mine", "revision": 1})
        self.assertEqual(stale.data["code"], "DRAFT_CHANGED")

    def test_a_revenact_edit_on_its_way_wins(self):
        draft = self.new_draft()
        self.tick()
        gmail_id = self.stored(draft["id"]).gmail_draft_id
        self.patch_draft(draft["id"], {"subject": "Mine", "revision": 1})
        later = timezone.now() + timedelta(hours=1)
        MailOutbox.objects.filter(status="pending").update(next_attempt_at=later)
        self.fake.edit_draft(gmail_id, mine("e3", text="Theirs"))
        self.tick()
        stored = self.stored(draft["id"])
        self.assertEqual((stored.subject, stored.revision), ("Mine", 2))
        self.assertTrue(MailMessage.objects.filter(pk=draft["message_id"]).exists())
        MailOutbox.objects.filter(status="pending").update(next_attempt_at=timezone.now())
        self.tick()
        self.tick()
        in_gmail = self.fake.messages[self.fake.drafts[gmail_id]]
        subject = next(h["value"] for h in in_gmail["payload"]["headers"] if h["name"] == "Subject")
        self.assertEqual(subject, "Mine")
        self.assertEqual(MailMessage.objects.filter(folder="drafts").count(), 1)


class VanishedTests(DraftFixture):
    def saved(self, link=False):
        draft = self.new_draft()
        self.tick()
        if link:
            self.agent_reply(draft["id"])
        return self.stored(draft["id"])

    def test_sent_in_gmail_settles_it_files_it_and_the_agent_draft(self):
        draft = self.saved(link=True)
        self.fake.send_in_gmail(draft.gmail_draft_id)
        self.tick()
        stored = self.stored(draft.pk)
        self.assertEqual(stored.status, "sent")
        self.assertEqual(stored.message.folder, "sent")
        filed = Email.objects.get(direction="sent")
        self.assertEqual((stored.sent_email, filed.customer), (filed, self.pizza))
        reply = ReplyDraft.objects.get()
        self.assertEqual(
            (reply.status, reply.sent_by, reply.sent_email), ("sent", self.dana, filed)
        )
        event = AuditEvent.objects.get(action="reply_draft.sent")
        self.assertEqual((event.actor, event.metadata), (None, {"email": filed.pk, "in": "gmail"}))

    def test_sent_in_gmail_under_a_new_id_is_found_in_its_thread(self):
        draft = self.saved()
        self.fake.discard_in_gmail(draft.gmail_draft_id)
        self.fake.add(
            gmail_message(
                "s9",
                labels=["SENT"],
                sender="Dana Ruiz <dana@acme.io>",
                to="ann@pizzahut.com",
                subject="Re: Renewal quote",
                thread_id=self.quote.thread_id,
            )
        )
        self.tick()
        stored = self.stored(draft.pk)
        self.assertEqual((stored.status, stored.message.provider_message_id), ("sent", "s9"))

    def test_discarded_in_gmail_both_go(self):
        draft = self.saved(link=True)
        self.fake.discard_in_gmail(draft.gmail_draft_id)
        self.tick()
        self.assertFalse(MailDraft.objects.exists())
        self.assertFalse(ReplyDraft.objects.exists())
        event = AuditEvent.objects.get(action="reply_draft.discarded")
        self.assertEqual((event.actor, event.metadata), (None, {"in": "gmail"}))

    def test_a_draft_being_sent_is_left_to_its_owner(self):
        draft = self.saved()
        MailDraft.objects.filter(pk=draft.pk).update(status="sending")
        self.fake.discard_in_gmail(draft.gmail_draft_id)
        self.tick()
        self.assertEqual(self.stored(draft.pk).status, "sending")
        self.assertTrue(MailMessage.objects.filter(pk=draft.message_id).exists())


class IgnoredTests(DraftFixture):
    """Task 11's carry: a sent or discarded draft keeps its Gmail id (a
    draft_delete may be on its way); the reconcile never touches it."""

    def settled(self, status):
        draft = self.new_draft()
        self.tick()
        MailDraft.objects.filter(pk=draft["id"]).update(status=status)
        return self.stored(draft["id"])

    def test_a_sent_or_discarded_draft_still_in_gmail_is_not_adopted_again(self):
        for status in ("sent", "discarded"):
            with self.subTest(status=status):
                MailDraft.objects.all().delete()
                draft = self.settled(status)
                self.fake.write_draft(mine(f"x-{status}"))  # marks the next tick
                self.tick()
                self.assertEqual(self.stored(draft.pk).status, status)
                self.assertEqual(
                    MailDraft.objects.filter(gmail_draft_id=draft.gmail_draft_id).count(), 1
                )

    def test_a_sent_draft_gone_from_gmail_stays_sent(self):
        draft = self.settled("sent")
        self.fake.discard_in_gmail(draft.gmail_draft_id)
        self.tick()
        stored = self.stored(draft.pk)
        self.assertEqual((stored.status, stored.gmail_draft_id), ("sent", draft.gmail_draft_id))
        self.assertFalse(AuditEvent.objects.filter(action__startswith="reply_draft.").exists())


class LateAnswerTests(DraftFixture):
    """Task 10's carry: a late flush answer on a sending draft stores the
    Gmail ids while its Drafts row stays on its placeholder. Gmail's message
    for it is never stored as a second Drafts row."""

    def drafts_rows(self):
        return list(
            MailMessage.objects.filter(folder="drafts").values_list("pk", "provider_message_id")
        )

    def test_history_skips_it_while_sending_and_the_reconcile_repoints_it_once_open(self):
        draft = self.new_draft()
        MailDraft.objects.filter(pk=draft["id"]).update(status="sending")
        self.tick()  # the late create answer, then history's messagesAdded
        stored = self.stored(draft["id"])
        self.assertEqual(self.fake.drafts[stored.gmail_draft_id], stored.gmail_message_id)
        self.assertEqual(self.drafts_rows(), [(draft["message_id"], f"pending-draft:{stored.pk}")])
        MailDraft.objects.filter(pk=stored.pk).update(status="open")  # a refused send
        self.mailbox.send_as_synced_at = None  # the daily refresh runs the reconcile
        self.mailbox.save(update_fields=["send_as_synced_at"])
        self.tick()
        again = self.stored(draft["id"])
        self.assertEqual(self.drafts_rows(), [(draft["message_id"], stored.gmail_message_id)])
        self.assertEqual((again.revision, again.message_id), (1, draft["message_id"]))

    def test_history_repoints_an_open_drafts_placeholder(self):
        draft = self.new_draft()
        MailOutbox.objects.all().delete()
        gmail_id = self.fake.write_draft(mine("late1", thread_id=self.quote.thread_id))
        MailDraft.objects.filter(pk=draft["id"]).update(
            gmail_draft_id=gmail_id, gmail_message_id="late1", gmail_state="saved"
        )
        self.tick()
        self.assertEqual(self.drafts_rows(), [(draft["message_id"], "late1")])
        stored = self.stored(draft["id"])
        self.assertEqual((stored.revision, stored.status, stored.text), (1, "open", draft["text"]))

    def test_the_reconcile_folds_a_second_row_into_the_drafts_own(self):
        draft = self.new_draft()
        MailOutbox.objects.all().delete()
        late = mine("late2", thread_id=self.quote.thread_id)
        self.fake.add(late, quietly=True)
        self.fake.drafts["r-late"] = "late2"
        gmail_store.store_gmail(self.mailbox, late, now=self.now)  # stored before the fix
        MailDraft.objects.filter(pk=draft["id"]).update(
            gmail_draft_id="r-late", gmail_message_id="late2", gmail_state="saved"
        )
        self.mailbox.send_as_synced_at = None
        self.mailbox.save(update_fields=["send_as_synced_at"])
        self.tick()
        self.assertEqual(self.drafts_rows(), [(draft["message_id"], "late2")])
        self.assertEqual(self.stored(draft["id"]).revision, 1)


class SweepTests(DraftFixture):
    """D1's re-list never deletes a live draft's row that holds a real Gmail
    id Gmail no longer lists (a sending draft whose late update replaced it)."""

    def test_a_live_drafts_row_survives_the_final_sweep(self):
        draft = self.new_draft()
        self.tick()
        MailDraft.objects.filter(pk=draft["id"]).update(status="sending")
        MailMessage.objects.filter(pk=draft["message_id"]).update(provider_message_id="old-1")
        started = timezone.now() + timedelta(seconds=1)
        self.mailbox.reconcile_started_at = started
        self.mailbox.save(update_fields=["reconcile_started_at"])
        self.tick(now=started + timedelta(seconds=1))
        self.mailbox.refresh_from_db()
        self.assertIsNone(self.mailbox.reconcile_started_at)
        self.assertTrue(MailMessage.objects.filter(pk=draft["message_id"]).exists())


class FixRoundTests(DraftFixture):
    """Review fix round 1: the settle re-reads the draft under lock, Gmail is
    asked before a vanished draft is taken as discarded, and a row another
    draft holds is never taken."""

    def saved(self):
        draft = self.new_draft()
        self.tick()
        return self.stored(draft["id"])

    def run_reconcile(self):
        self.mailbox.send_as_synced_at = None  # the daily refresh runs the reconcile
        self.mailbox.save(update_fields=["send_as_synced_at"])
        self.tick()

    def settle_from(self, snapshot):
        connection = MailboxConnection.objects.get(pk=self.mailbox.pk)
        draft_sync._vanished(connection, gmail_sync.session_for(connection), snapshot, self.now)

    def test_a_draft_reopened_after_draft_gone_is_not_discarded_from_an_old_snapshot(self):
        snapshot = self.saved()
        self.agent_reply(snapshot.pk)
        snapshot = self.stored(snapshot.pk)
        self.fake.discard_in_gmail(snapshot.gmail_draft_id)
        # The owner's send met DRAFT_GONE: reopened local, its Gmail ids cleared.
        MailDraft.objects.filter(pk=snapshot.pk).update(
            gmail_draft_id="", gmail_message_id="", gmail_state="local"
        )
        self.settle_from(snapshot)
        self.assertEqual(self.stored(snapshot.pk).status, "open")
        self.assertTrue(ReplyDraft.objects.exists())

    def test_a_draft_with_an_edit_queued_meanwhile_is_left(self):
        snapshot = self.saved()
        self.fake.discard_in_gmail(snapshot.gmail_draft_id)
        self.patch_draft(snapshot.pk, {"subject": "Mine", "revision": 1})
        self.settle_from(snapshot)
        self.assertEqual(self.stored(snapshot.pk).status, "open")

    def test_sent_in_gmail_after_history_was_read_settles_as_sent(self):
        draft = self.saved()
        message_id = self.fake.drafts.pop(draft.gmail_draft_id)
        self.fake.messages[message_id]["labelIds"] = ["SENT"]  # no history yet
        self.run_reconcile()
        stored = self.stored(draft.pk)
        self.assertEqual((stored.status, stored.message.folder), ("sent", "sent"))
        self.assertEqual(stored.message.provider_message_id, message_id)

    def test_gone_from_the_list_but_still_unsent_waits_a_tick(self):
        draft = self.saved()
        self.fake.drafts.pop(draft.gmail_draft_id)
        self.run_reconcile()
        self.assertEqual(self.stored(draft.pk).status, "open")

    def test_gone_from_gmail_altogether_is_discarded(self):
        draft = self.saved()
        self.fake.messages.pop(self.fake.drafts.pop(draft.gmail_draft_id))  # no history yet
        self.run_reconcile()
        self.assertFalse(MailDraft.objects.filter(pk=draft.pk).exists())

    def test_a_sent_row_another_draft_holds_is_not_taken_from_the_thread(self):
        vanishing, other = self.saved(), self.saved()
        held = gmail_message(
            "s7",
            labels=["SENT"],
            sender="Dana Ruiz <dana@acme.io>",
            to="ann@pizzahut.com",
            subject="Re: Renewal quote",
            thread_id=self.quote.thread_id,
        )
        self.fake.add(held, quietly=True)
        row, _ = gmail_store.store_gmail(self.mailbox, held, now=timezone.now())
        MailDraft.objects.filter(pk=other.pk).update(status="sent", message=row)
        self.fake.discard_in_gmail(vanishing.gmail_draft_id)
        self.tick()
        self.assertFalse(MailDraft.objects.filter(pk=vanishing.pk).exists())
        self.assertEqual(self.stored(other.pk).message_id, row.pk)

    def test_an_edit_in_gmail_onto_a_row_another_draft_holds_is_skipped(self):
        draft, other = self.saved(), self.saved()
        gmail_id = draft.gmail_draft_id
        # Gmail now says this draft's message is the one the other draft holds.
        self.fake.drafts[gmail_id] = other.gmail_message_id
        self.fake.drafts.pop(other.gmail_draft_id)
        MailDraft.objects.filter(pk=other.pk).update(status="sent")
        self.run_reconcile()
        stored = self.stored(draft.pk)
        self.assertEqual((stored.revision, stored.message_id), (1, draft.message_id))

    def test_sent_in_gmail_before_its_message_was_stored_stores_the_sent_copy(self):
        draft = self.new_draft()
        MailOutbox.objects.all().delete()
        self.fake.add(mine("late3", labels=["SENT"], thread_id=self.quote.thread_id), quietly=True)
        MailDraft.objects.filter(pk=draft["id"]).update(
            gmail_draft_id="r-gone", gmail_message_id="late3", gmail_state="saved"
        )
        self.run_reconcile()
        stored = self.stored(draft["id"])
        self.assertEqual((stored.status, stored.message.provider_message_id), ("sent", "late3"))
        self.assertFalse(MailMessage.objects.filter(pk=draft["message_id"]).exists())
        self.assertEqual(stored.sent_email.provider_message_id, "late3")


class RowKeptTests(DraftFixture):
    """Final review: an open draft never loses its Drafts row. History's
    delete of its old Gmail message leaves the row (the reconcile or the
    flush moves it); a live draft found with no row gets one back from the
    flush, the reconcile or history; an upload onto a draft with no row is
    refused, never a 500."""

    def saved(self):
        draft = self.new_draft()
        self.tick()
        return self.stored(draft["id"])

    def drafts_rows(self):
        return list(
            MailMessage.objects.filter(folder="drafts").values_list("pk", "provider_message_id")
        )

    def upload(self, pk):
        file = SimpleUploadedFile("Quote v2.pdf", b"%PDF-1.4 quote v2", "application/pdf")
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(
                f"/api/v1/mail/drafts/{pk}/attachments/", {"file": file}, format="multipart"
            )

    def test_a_gmail_edit_then_a_revenact_edit_before_the_reconcile_keeps_one_row(self):
        draft = self.saved()
        self.fake.edit_draft(
            draft.gmail_draft_id, mine("e9", subject="Re: Renewal quote", text="Theirs")
        )
        real = draft_sync.reconcile

        def edited_first(connection, session, now):
            self.patch_draft(draft.pk, {"subject": "Mine", "revision": 1})
            return real(connection, session, now)

        with patch("services.mail.draft_sync.reconcile", edited_first):
            self.tick()
        self.tick()  # the flush saves Revenact's edit; history stores Gmail's answer
        stored = self.stored(draft.pk)
        self.assertEqual(self.drafts_rows(), [(draft.message_id, stored.gmail_message_id)])
        self.assertEqual(stored.message_id, draft.message_id)
        self.assertEqual(self.upload(draft.pk).status_code, 201)

    def test_drafts_list_failing_then_a_revenact_edit_keeps_one_row(self):
        draft = self.saved()
        self.fake.edit_draft(draft.gmail_draft_id, mine("e8", text="Theirs"))
        self.fake.fail(r"/drafts$", 500, "backendError")
        with self.assertLogs("services.mail.gmail_sync", "WARNING"):
            self.tick()  # history ran; drafts.list failed
        self.patch_draft(draft.pk, {"subject": "Mine", "revision": 1})
        self.tick()
        stored = self.stored(draft.pk)
        self.assertEqual(self.drafts_rows(), [(draft.message_id, stored.gmail_message_id)])

    def test_the_flush_gives_a_live_draft_with_no_row_one(self):
        draft = self.saved()
        MailMessage.objects.filter(pk=draft.message_id).delete()
        self.patch_draft(draft.pk, {"subject": "Mine", "revision": 1})
        self.tick()
        stored = self.stored(draft.pk)
        self.assertIsNotNone(stored.message_id)
        self.assertEqual(self.drafts_rows(), [(stored.message_id, stored.gmail_message_id)])
        self.assertEqual(stored.message.subject, "Mine")

    def test_the_reconcile_adopts_the_held_row_of_a_live_draft_with_no_row(self):
        draft = self.saved()
        MailMessage.objects.filter(pk=draft.message_id).delete()
        held, _ = gmail_store.store_gmail(
            self.mailbox, self.fake.messages[draft.gmail_message_id], now=self.now
        )
        self.mailbox.send_as_synced_at = None  # the daily refresh runs the reconcile
        self.mailbox.save(update_fields=["send_as_synced_at"])
        self.tick()
        self.assertEqual(self.stored(draft.pk).message_id, held.pk)
        self.assertEqual(self.drafts_rows(), [(held.pk, draft.gmail_message_id)])

    def test_history_gives_a_live_draft_with_no_row_its_gmail_message(self):
        draft = self.saved()
        MailMessage.objects.filter(pk=draft.message_id).delete()
        self.fake.relabel(draft.gmail_message_id, ["DRAFT", "STARRED"])
        self.tick()
        stored = self.stored(draft.pk)
        self.assertIsNotNone(stored.message_id)
        self.assertEqual(self.drafts_rows(), [(stored.message_id, draft.gmail_message_id)])

    def test_an_upload_onto_a_draft_with_no_row_is_refused(self):
        draft = self.saved()
        MailMessage.objects.filter(pk=draft.message_id).delete()
        response = self.upload(draft.pk)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "DRAFT_SAVING")
        self.assertFalse(MailAttachment.objects.filter(part_id__startswith="upload:").exists())
