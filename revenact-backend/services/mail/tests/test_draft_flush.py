"""Draft rows to Gmail (D3 contract §5 "The flush", decisions 6, 7, 9, 10):
after label creations and before label rows; the MIME built from the
content then; collapsed rows send once; an update waits while a create is in
flight; an update's 404 recreates the draft without a notice; a delete's 404
is done; 413 fails at once (too_large); refusals count, 5xx back off; a
failure keeps the writing (gmail.state failed) and tells the owner once; a
late answer for a draft that moved on deletes the new Gmail draft; at most
MAIL_OUTBOX_DRAFT_CALLS_PER_TICK calls; label rows on a placeholder wait
for its create; D1's reconcile and history keep a draft's row; a disconnect
settles saving drafts."""

from datetime import timedelta
from unittest import mock

from django.db import connection as db
from django.db import transaction
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.mail import outbox
from services.mail.models import MailboxConnection, MailDraft, MailMessage, MailOutbox
from services.mail.providers.google import GmailSession
from services.notifications.models import Notification

from .draft_fixtures import URL, DraftFixture


class FlushFixture(DraftFixture):
    def rows(self, pk):
        return list(
            MailOutbox.objects.filter(draft_id=pk).order_by("pk").values_list("op", "status")
        )

    def uploads(self, route):
        return [item for item in self.fake.uploads if item[1] == route]


class CreateAndUpdateTests(FlushFixture):
    def test_a_create_reaches_gmail_and_the_drafts_row_takes_its_message_id(self):
        draft = self.new_draft(html="<p>Works for us.</p>")
        self.assertEqual(self.tick().outcome, "ok")
        stored = self.stored(draft["id"])
        self.assertTrue(stored.gmail_draft_id.startswith("r-"))
        self.assertEqual(self.fake.drafts[stored.gmail_draft_id], stored.gmail_message_id)
        self.assertEqual(stored.gmail_state, "saved")
        row = MailMessage.objects.get(pk=draft["message_id"])
        self.assertEqual(row.provider_message_id, stored.gmail_message_id)
        method, route, metadata, message = self.fake.uploads[-1]
        self.assertEqual(
            (route, metadata), ("/drafts", {"message": {"threadId": self.quote.thread_id}})
        )
        self.assertEqual(message["In-Reply-To"], "<CAF=quote@mail.gmail.com>")
        self.assertIn("<CAF=first@mail.gmail.com>", str(message["References"]))
        self.assertEqual(self.rows(draft["id"]), [("draft_create", "sent")])
        # The next tick's history finds the row held: nothing new is stored.
        self.tick()
        self.assertEqual(MailMessage.objects.filter(folder="drafts").count(), 1)

    def test_create_then_edits_send_one_create_with_the_newest_content(self):
        draft = self.new_draft()
        self.patch_draft(draft["id"], {"html": "<p>Newest.</p>", "revision": 1})
        self.tick()
        [create] = self.uploads("/drafts")
        self.assertEqual(create[3].get_body(("plain",)).get_content().strip(), "Newest.")

    def test_an_update_replaces_gmails_message(self):
        draft = self.new_draft()
        self.tick()
        first = self.stored(draft["id"]).gmail_message_id
        self.patch_draft(draft["id"], {"subject": "Re: Terms", "revision": 1})
        self.tick()
        stored = self.stored(draft["id"])
        self.assertNotEqual(stored.gmail_message_id, first)
        self.assertNotIn(first, self.fake.messages)
        row = MailMessage.objects.get(pk=draft["message_id"])
        self.assertEqual(
            (row.provider_message_id, row.subject), (stored.gmail_message_id, "Re: Terms")
        )
        self.assertEqual(self.uploads(f"/drafts/{stored.gmail_draft_id}")[-1][0], "PUT")

    def test_an_update_waits_while_the_create_is_in_flight(self):
        draft = self.new_draft()
        MailOutbox.objects.filter(draft_id=draft["id"]).update(
            status="sending", updated_at=timezone.now()
        )
        self.patch_draft(draft["id"], {"subject": "Later", "revision": 1})
        self.tick()
        self.assertEqual(self.fake.uploads, [])
        self.assertEqual(
            self.rows(draft["id"]), [("draft_create", "sending"), ("draft_update", "pending")]
        )

    def test_an_update_gmail_answers_404_recreates_the_draft_quietly(self):
        draft = self.new_draft()
        self.tick()
        gone = self.stored(draft["id"]).gmail_draft_id
        self.fake.discard_in_gmail(gone)
        self.patch_draft(draft["id"], {"subject": "Still mine", "revision": 1})
        self.tick()
        stored = self.stored(draft["id"])
        self.assertEqual((stored.gmail_draft_id, stored.gmail_state), ("", "saving"))
        self.assertEqual(
            MailMessage.objects.get(pk=draft["message_id"]).provider_message_id,
            f"pending-draft:{stored.pk}",
        )
        self.tick()
        stored = self.stored(draft["id"])
        self.assertTrue(stored.gmail_draft_id)
        self.assertEqual(stored.gmail_state, "saved")
        self.assertFalse(Notification.objects.exists())


class DeleteTests(FlushFixture):
    def test_create_then_delete_sends_nothing(self):
        draft = self.new_draft()
        self.client.delete(f"{URL}drafts/{draft['id']}/")
        self.tick()
        self.assertEqual((self.fake.uploads, self.fake.drafts), ([], {}))

    def test_a_discarded_draft_gmail_holds_is_deleted_there_and_here(self):
        draft = self.new_draft()
        self.tick()
        self.patch_draft(draft["id"], {"subject": "x", "revision": 1})
        with self.captureOnCommitCallbacks(execute=True):
            self.client.delete(f"{URL}drafts/{draft['id']}/")
        self.tick()
        self.assertEqual(self.fake.drafts, {})
        self.assertEqual(len(self.uploads("/drafts")), 1)
        self.assertFalse(MailDraft.objects.exists())

    def test_a_delete_gmail_answers_404_is_done(self):
        draft = self.new_draft()
        self.tick()
        self.fake.discard_in_gmail(self.stored(draft["id"]).gmail_draft_id)
        self.client.delete(f"{URL}drafts/{draft['id']}/")
        self.tick()
        self.assertFalse(MailDraft.objects.exists())
        self.assertFalse(Notification.objects.exists())

    def test_a_late_create_for_a_draft_that_moved_on_is_deleted_in_gmail(self):
        draft = self.new_draft()
        MailDraft.objects.filter(pk=draft["id"]).update(status="sent")
        self.tick()
        self.tick()
        self.assertEqual(self.fake.drafts, {})
        self.assertEqual(self.stored(draft["id"]).status, "sent")

    def test_a_late_answer_never_repoints_a_sent_copy(self):
        # Ruling F3: the person sent while the create was out, and the send
        # turned the Drafts row into the sent copy. The late answer stores the
        # Gmail draft's id (to delete it) but leaves the sent copy's ids alone.
        draft = self.new_draft()
        MailDraft.objects.filter(pk=draft["id"]).update(status="sent")
        MailMessage.objects.filter(pk=draft["message_id"]).update(
            provider_message_id="sent-1", thread_id="thread-sent"
        )
        self.tick()
        stored = self.stored(draft["id"])
        self.assertTrue(stored.gmail_draft_id)
        row = MailMessage.objects.get(pk=draft["message_id"])
        self.assertEqual((row.provider_message_id, row.thread_id), ("sent-1", "thread-sent"))
        self.assertEqual(
            self.rows(draft["id"]), [("draft_create", "sent"), ("draft_delete", "pending")]
        )
        self.tick()
        self.assertEqual(self.fake.drafts, {})
        self.assertEqual(
            MailMessage.objects.get(pk=draft["message_id"]).provider_message_id, "sent-1"
        )

    def test_a_late_answer_on_a_sending_draft_stores_the_id_and_queues_no_delete(self):
        # A refused send reopens the draft: a delete queued now would remove
        # the open draft's Gmail copy. The send's settle owns the id.
        draft = self.new_draft()
        MailDraft.objects.filter(pk=draft["id"]).update(status="sending")
        self.tick()
        stored = self.stored(draft["id"])
        self.assertTrue(stored.gmail_draft_id)
        self.assertIn(stored.gmail_draft_id, self.fake.drafts)
        self.assertEqual(self.rows(draft["id"]), [("draft_create", "sent")])
        self.assertEqual(
            MailMessage.objects.get(pk=draft["message_id"]).provider_message_id,
            f"pending-draft:{stored.pk}",
        )

    def test_a_late_answer_on_a_disconnected_mailbox_revives_nothing(self):
        draft = self.new_draft()
        create = GmailSession.create_draft

        def disconnected_meanwhile(session, raw, thread_id=""):
            answer = create(session, raw, thread_id)
            MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")
            MailOutbox.objects.filter(connection=self.mailbox).delete()
            MailDraft.objects.filter(pk=draft["id"]).update(gmail_state="local")
            return answer

        with mock.patch.object(GmailSession, "create_draft", disconnected_meanwhile):
            self.tick()
        stored = self.stored(draft["id"])
        self.assertTrue(stored.gmail_draft_id)
        self.assertEqual(stored.gmail_state, "failed")
        self.assertFalse(MailOutbox.objects.exists())
        self.assertEqual(
            MailMessage.objects.get(pk=draft["message_id"]).provider_message_id,
            f"pending-draft:{stored.pk}",
        )


class HistoryTests(FlushFixture):
    """D1's history deletion keeps a draft's row mid-edit or mid-send."""

    def saved_then_gone_in_gmail(self):
        draft = self.new_draft()
        self.tick()
        stored = self.stored(draft["id"])
        self.fake.discard_in_gmail(stored.gmail_draft_id)
        return draft, stored

    def test_a_pending_update_keeps_the_row(self):
        draft, stored = self.saved_then_gone_in_gmail()
        self.patch_draft(draft["id"], {"subject": "Later", "revision": 1})
        # Not due yet: this tick only reads history.
        MailOutbox.objects.filter(draft_id=draft["id"], status="pending").update(
            next_attempt_at=timezone.now() + timedelta(hours=1)
        )
        self.tick()
        row = MailMessage.objects.get(pk=draft["message_id"])
        self.assertEqual(row.provider_message_id, stored.gmail_message_id)

    def test_a_sending_draft_keeps_the_row(self):
        draft, stored = self.saved_then_gone_in_gmail()
        MailDraft.objects.filter(pk=draft["id"]).update(status="sending")
        self.tick()
        row = MailMessage.objects.get(pk=draft["message_id"])
        self.assertEqual(row.provider_message_id, stored.gmail_message_id)

    def test_an_idle_saved_draft_loses_the_row(self):
        draft, _ = self.saved_then_gone_in_gmail()
        self.tick()
        self.assertFalse(MailMessage.objects.filter(pk=draft["message_id"]).exists())


class FailureTests(FlushFixture):
    def test_413_fails_at_once_keeps_the_writing_and_tells_the_owner_once(self):
        draft = self.new_draft(html="<p>Big.</p>")
        self.fake.fail(r"/drafts$", 413, "tooLarge")
        self.tick()
        stored = self.stored(draft["id"])
        self.assertEqual((stored.gmail_state, stored.html), ("failed", "<p>Big.</p>"))
        row = MailOutbox.objects.get(draft_id=draft["id"])
        self.assertEqual((row.status, row.reason), ("failed", "too_large"))
        notice = Notification.objects.get()
        self.assertEqual(
            notice.message, "Couldn't save the draft in Gmail: it is over Gmail's size limit."
        )
        self.assertEqual(
            notice.link, f"/communications?source=mailbox:google&folder=drafts&draft={stored.pk}"
        )
        data = self.client.get(f"{URL}drafts/{stored.pk}/").data
        self.assertEqual(data["sync_issue"]["text"], notice.message)
        self.assertEqual(data["gmail"], {"state": "failed"})
        # The next edit tries again.
        self.patch_draft(stored.pk, {"subject": "Again", "revision": 1})
        self.tick()
        self.assertEqual(self.stored(stored.pk).gmail_state, "saved")

    def test_a_refusal_counts_and_a_5xx_backs_the_mailbox_off(self):
        draft = self.new_draft()
        self.fake.fail(r"/drafts$", 400, "invalidArgument")
        self.tick()
        row = MailOutbox.objects.get(draft_id=draft["id"])
        self.assertEqual((row.status, row.attempts), ("pending", 1))
        MailOutbox.objects.update(next_attempt_at=timezone.now())
        self.fake.fail(r"/drafts$", 503)
        self.assertEqual(self.tick().outcome, "backoff")
        self.assertEqual(MailOutbox.objects.get(draft_id=draft["id"]).attempts, 2)

    def test_a_part_gmail_lost_fails_with_its_own_sentence(self):
        draft = self.post_draft({"kind": "forward", "source_message_id": self.quote.pk}).data
        self.fake.files.clear()
        self.tick()
        self.assertEqual(Notification.objects.get().message, outbox.PART_GONE)
        self.assertEqual(self.stored(draft["id"]).gmail_state, "failed")

    def test_a_failed_create_fails_the_label_rows_waiting_on_its_placeholder(self):
        draft = self.new_draft()
        placeholder = MailMessage.objects.get(pk=draft["message_id"])
        # A label row on the placeholder (Task 14 refuses one from the API; the
        # outbox still keeps the rule).
        with transaction.atomic():
            outbox.apply(self.mailbox, [(placeholder, c) for c in outbox.changes_for("star")])
        self.fake.fail(r"/drafts$", 413, "tooLarge")
        self.tick()
        self.assertEqual(
            set(MailOutbox.objects.values_list("op", "status")),
            {("draft_create", "failed"), ("star", "failed")},
        )


class PlacementTests(FlushFixture):
    @override_settings(MAIL_OUTBOX_DRAFT_CALLS_PER_TICK=1)
    def test_at_most_so_many_draft_calls_a_tick_the_rest_wait_uncounted(self):
        first, second = self.new_draft(), self.new_draft(kind="new")
        self.tick()
        self.assertEqual(len(self.uploads("/drafts")), 1)
        waiting = MailOutbox.objects.get(draft_id=second["id"])
        self.assertEqual((waiting.status, waiting.attempts), ("pending", 0))
        self.tick()
        self.assertEqual(len(self.uploads("/drafts")), 2)
        self.assertTrue(self.stored(first["id"]).gmail_draft_id)

    def test_d1s_reconcile_keeps_a_placeholder(self):
        draft = self.new_draft()
        MailOutbox.objects.update(status="failed")
        MailDraft.objects.filter(pk=draft["id"]).update(gmail_state="failed")
        self.mailbox.reconcile_started_at = timezone.now()
        self.mailbox.save(update_fields=["reconcile_started_at"])
        self.tick()
        self.assertTrue(MailMessage.objects.filter(pk=draft["message_id"]).exists())

    def test_a_disconnect_settles_saving_drafts(self):
        local, held = self.new_draft(), self.new_draft(kind="new")
        MailDraft.objects.filter(pk=held["id"]).update(gmail_draft_id="r-5")
        self.assertEqual(self.client.delete(f"{URL}connection/").status_code, 204)
        self.assertEqual(
            (self.stored(local["id"]).gmail_state, self.stored(held["id"]).gmail_state),
            ("local", "failed"),
        )

    def test_a_disconnect_settles_a_discarded_saving_draft_it_locked(self):
        draft = self.new_draft()
        self.tick()
        MailDraft.objects.filter(pk=draft["id"]).update(status="discarded", gmail_state="saving")
        with CaptureQueriesContext(db) as queries:
            self.assertEqual(self.client.delete(f"{URL}connection/").status_code, 204)
        self.assertEqual(self.stored(draft["id"]).gmail_state, "failed")
        # Every draft write names the locked pks: no draft is updated unlocked.
        updates = [
            q["sql"]
            for q in queries.captured_queries
            if q["sql"].startswith('UPDATE "mail_maildraft"')
        ]
        self.assertEqual(len(updates), 2)
        for sql in updates:
            self.assertIn('"mail_maildraft"."id" IN', sql)
