"""Actions on one message (contract §3): PATCH changes the row at once and
queues it for Gmail, in the contract's check order (404, body, GMAIL_ONLY,
NO_MAILBOX, MAILBOX_PAUSED, TWO_WAY_OFF); mute is Revenact's own and always
allowed; Outlook and IMAP stay local; the reply marks the original read
through the outbox; disconnecting drops what was on its way."""

from unittest.mock import patch

from django.db import connection as db
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.billing.models import SeatAssignment
from services.mail import actions, gmail_store
from services.mail.models import MailboxConnection, MailLabel, MailMessage, MailOutbox

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture

URL = "/api/v1/mail/messages/"
READ_ONLY = ["https://www.googleapis.com/auth/gmail.readonly"]


class ActionFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)
        self.now = timezone.now()
        gmail_store.mirror_labels(self.mailbox, fixture("labels_list.json")["labels"])
        self.row, _ = gmail_store.store_gmail(self.mailbox, gmail_message("g1"), now=self.now)
        self.renewals = MailLabel.objects.get(gmail_id="Label_12")
        self.client.force_authenticate(self.dana)

    def patch(self, body, row=None):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.patch(f"{URL}{(row or self.row).pk}/", body, format="json")

    def queued(self):
        return list(
            MailOutbox.objects.filter(status="pending")
            .order_by("pk")
            .values_list("op", "label_key", "add")
        )

    def fresh(self):
        return MailMessage.objects.get(pk=self.row.pk)


class PatchTests(ActionFixture):
    def test_read_answers_the_detail_already_changed_and_queues_it(self):
        response = self.patch({"is_read": True})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["is_read"])
        self.assertIn("body", response.data)
        self.assertIsNone(response.data["sync_issue"])
        self.assertEqual(self.queued(), [("read", "UNREAD", False)])
        self.mailbox.refresh_from_db()
        self.assertIsNotNone(self.mailbox.wake_at)

    def test_done_archives_and_open_takes_it_back_with_nothing_sent(self):
        self.assertEqual(self.patch({"state": "done"}).data["state"], "done")
        self.assertEqual(self.queued(), [("archive", "INBOX", False)])
        self.assertEqual(self.patch({"state": "open"}).data["state"], "open")
        self.assertEqual(self.queued(), [])

    def test_trash_spam_and_labels(self):
        self.assertEqual(self.patch({"trashed": True}).data["folder"], "trash")
        self.assertEqual(self.patch({"trashed": False}).data["folder"], "inbox")
        self.assertEqual(self.patch({"spam": True}).data["folder"], "spam")
        self.assertEqual(self.patch({"spam": False}).data["folder"], "inbox")
        self.assertEqual(self.queued(), [])
        labels = self.patch({"add_labels": [self.renewals.pk]}).data["labels"]
        self.assertEqual([label["name"] for label in labels], ["Renewals"])
        self.assertEqual(self.queued(), [("label_add", "Label_12", True)])

    def test_several_fields_are_one_action(self):
        self.patch({"is_read": True, "is_starred": True})
        self.assertEqual(MailOutbox.objects.values("action_id").distinct().count(), 1)
        self.assertEqual(MailOutbox.objects.count(), 2)

    def test_mute_is_revenacts_own_and_open_unmutes(self):
        self.assertEqual(self.patch({"state": "muted"}).data["state"], "muted")
        self.assertFalse(MailOutbox.objects.exists())
        self.assertEqual(self.patch({"state": "open"}).data["state"], "open")
        self.assertFalse(MailOutbox.objects.exists())


class RefusalTests(ActionFixture):
    def test_bodies_that_are_refused_queue_nothing(self):
        system = MailLabel.objects.get(connection=self.mailbox, gmail_id="INBOX")
        for body, errors in (
            ({}, {"non_field_errors": ["Change at least one thing."]}),
            ({"folder": "trash"}, {"non_field_errors": ["Change at least one thing."]}),
            (
                {"state": "done", "trashed": True},
                {"non_field_errors": ["Change one of state, trashed or spam at a time."]},
            ),
            (
                {"add_labels": [self.renewals.pk, self.renewals.pk]},
                {"add_labels": ["Name each label once."]},
            ),
            (
                {"add_labels": [self.renewals.pk], "remove_labels": [self.renewals.pk]},
                {"non_field_errors": ["A label can't be added and removed at once."]},
            ),
            ({"add_labels": [system.pk]}, {"add_labels": ["Choose one of your labels."]}),
            ({"remove_labels": [999999]}, {"remove_labels": ["Choose one of your labels."]}),
        ):
            response = self.patch(body)
            self.assertEqual((response.status_code, response.data), (400, errors), body)
        self.assertEqual(self.patch({"state": "gone"}).status_code, 400)
        self.assertFalse(MailOutbox.objects.exists())

    def test_nobody_else_may_change_it(self):
        for person in (self.carl, self.alice, self.priya):
            self.client.force_authenticate(person)
            self.assertEqual(self.patch({"is_read": True}).status_code, 404)
        self.assertFalse(MailOutbox.objects.exists())

    def test_outlook_and_imap_are_local_and_refuse_gmail_fields(self):
        imap = self.connect(self.priya)
        row = MailMessage.objects.create(
            connection=imap,
            owner=self.priya,
            organisation=self.org,
            provider_message_id="<m1@x.io>",
            direction="received",
            subject="Hi",
            sent_at=self.now,
            is_read=False,
        )
        self.client.force_authenticate(self.priya)
        for body in ({"trashed": True}, {"spam": False}, {"add_labels": [self.renewals.pk]}):
            response = self.patch(body, row=row)
            self.assertEqual(
                (response.status_code, response.data),
                (400, {"code": "GMAIL_ONLY", "detail": "Only Gmail mailboxes have this."}),
            )
        response = self.patch({"is_read": True, "state": "done"}, row=row)
        self.assertEqual((response.data["is_read"], response.data["state"]), (True, "done"))
        row.refresh_from_db()
        self.assertIsNotNone(row.locally_changed_at)
        self.assertFalse(MailOutbox.objects.exists())

    def assertRefused(self, code, **extra):
        response = self.patch({"is_read": True})
        self.assertEqual((response.status_code, response.data["code"]), (409, code))
        for key, value in extra.items():
            self.assertEqual(response.data[key], value)
        self.assertEqual(self.patch({"state": "muted"}).status_code, 200)  # mute always works
        MailMessage.objects.filter(pk=self.row.pk).update(state="open")
        self.assertFalse(MailOutbox.objects.exists())

    def test_a_disconnected_mailbox(self):
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")
        self.assertRefused("NO_MAILBOX", detail="This message's mailbox is no longer connected.")

    def test_a_paused_mailbox(self):
        SeatAssignment.objects.filter(membership__user=self.dana).update(released_at=timezone.now())
        self.assertRefused("MAILBOX_PAUSED", paused_reason="no_seat")

    def test_a_lost_grant_is_paused(self):
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(
            status="error", paused_reason="token_revoked"
        )
        self.assertRefused("MAILBOX_PAUSED", paused_reason="token_revoked")

    def test_a_read_only_mailbox(self):
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(granted_scopes=READ_ONLY)
        self.assertRefused(
            "TWO_WAY_OFF",
            detail="Reconnect Google to turn on two-way: changes here can't reach Gmail yet.",
            needs_reconnect=True,
        )


class ReplyAndDisconnectTests(ActionFixture):
    def test_a_reply_marks_the_original_read_through_the_outbox(self):
        with patch("services.mail.views.reply_to", return_value=None):
            response = self.client.post(
                f"{URL}{self.row.pk}/reply/", {"body": "Yes."}, format="json"
            )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(self.fresh().is_read)
        self.assertEqual(self.queued(), [("read", "UNREAD", False)])

    def test_disconnecting_drops_what_was_on_its_way_without_reverting(self):
        self.use_gmail()
        made = self.client.post("/api/v1/mail/labels/", {"name": "Pilot"}, format="json").data
        self.patch({"state": "done", "add_labels": [made["id"]]})
        self.assertEqual(self.client.delete("/api/v1/mail/connection/").status_code, 204)
        self.assertFalse(MailOutbox.objects.exists())
        self.assertFalse(MailLabel.objects.filter(pk=made["id"]).exists())
        row = self.fresh()
        self.assertEqual(row.state, "done")
        self.assertNotIn(f"pending:{made['id']}", row.label_ids)

    def test_disconnect_locks_messages_before_it_deletes_outbox_rows(self):
        self.use_gmail()
        self.patch({"is_read": True})
        with CaptureQueriesContext(db) as queries:
            self.client.delete("/api/v1/mail/connection/")
        sql = [q["sql"] for q in queries]
        lock = next(i for i, q in enumerate(sql) if "FOR UPDATE" in q and "mail_mailmessage" in q)
        delete = next(i for i, q in enumerate(sql) if q.startswith("DELETE") and "mailoutbox" in q)
        self.assertLess(lock, delete)
        self.assertFalse(MailOutbox.objects.filter(status__in=MailOutbox.LIVE).exists())

    def test_disconnect_locks_a_message_carrying_a_made_here_key_with_no_live_row(self):
        self.use_gmail()
        made = self.client.post("/api/v1/mail/labels/", {"name": "Pilot"}, format="json").data
        key = f"pending:{made['id']}"
        MailMessage.objects.filter(pk=self.row.pk).update(label_ids=[*self.row.label_ids, key])
        self.assertFalse(MailOutbox.objects.filter(message=self.row).exists())
        with (
            patch("services.mail.views.outbox.unwind_label"),  # keep the key on the row
            CaptureQueriesContext(db) as queries,
        ):
            self.assertEqual(self.client.delete("/api/v1/mail/connection/").status_code, 204)
        sql = [q["sql"] for q in queries]
        lock = next(i for i, q in enumerate(sql) if "FOR UPDATE" in q and "mail_mailmessage" in q)
        delete = next(i for i, q in enumerate(sql) if q.startswith("DELETE") and "mailoutbox" in q)
        self.assertLess(lock, delete)
        with db.cursor() as cursor:
            cursor.execute(sql[lock])
            locked = [row[0] for row in cursor.fetchall()]
        self.assertIn(self.row.pk, locked)

    def test_patch_locks_the_connection_after_the_messages_and_checks_it_fresh(self):
        with CaptureQueriesContext(db) as queries:
            self.client.patch(f"{URL}{self.row.pk}/", {"is_read": True}, format="json")
        sql = [q["sql"] for q in queries]
        message = next(i for i, q in enumerate(sql) if "FOR UPDATE" in q and "mailmessage" in q)
        mailbox = next(
            i for i, q in enumerate(sql) if "FOR NO KEY UPDATE" in q and "mailboxconnection" in q
        )
        self.assertLess(message, mailbox)

    def test_a_disconnect_between_the_read_and_the_lock_refuses_the_patch(self):
        original = actions.lock_connection

        def disconnect_then_lock(conn):
            MailboxConnection.objects.filter(pk=conn.pk).update(status="disconnected")
            return original(conn)

        with patch.object(actions, "lock_connection", side_effect=disconnect_then_lock):
            response = self.patch({"is_read": True})
        self.assertEqual((response.status_code, response.data["code"]), (409, "NO_MAILBOX"))
        self.assertFalse(MailOutbox.objects.exists())


class PatchCeilingTests(ActionFixture):
    def test_a_patch_reads_a_fixed_number_of_queries(self):
        self.patch({"is_read": True})
        with CaptureQueriesContext(db) as queries:
            self.client.patch(f"{URL}{self.row.pk}/", {"state": "done"}, format="json")
        # contract §8: 12, plus the detail's own reads (5).
        self.assertLessEqual(len(queries), 17)
