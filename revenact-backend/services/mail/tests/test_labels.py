"""Labels (contract §4): the sidebar list with unread conversations and
labels made here (pending), POST to make one (refusals in order), and the
flush creating it in Gmail: the pending key becomes Gmail's id everywhere,
a name Gmail already has is adopted, a refused name unwinds the label and
tells the owner once. Nobody else's labels, ever."""

from datetime import timedelta
from unittest.mock import patch

from django.db import connection as db
from django.db import transaction
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.billing.models import SeatAssignment
from services.mail import actions, gmail_store, outbox, outbox_flush
from services.mail.models import MailboxConnection, MailLabel, MailMessage, MailOutbox
from services.notifications.models import Notification

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture
from .test_outbox_flush import FlushFixture

URL = "/api/v1/mail/labels/"
RENEWALS_COLOR = {"background": "#16a766", "text": "#ffffff"}
READ_ONLY = ["https://www.googleapis.com/auth/gmail.readonly"]


class LabelFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)
        self.now = timezone.now()
        gmail_store.mirror_labels(self.mailbox, fixture("labels_list.json")["labels"])
        full = fixture("message_full.json")  # INBOX UNREAD IMPORTANT Label_12
        self.row, _ = gmail_store.store_gmail(self.mailbox, full, now=self.now)
        for message in (
            # The same conversation: still one unread conversation for Renewals.
            gmail_message("u2", labels=["INBOX", "UNREAD", "Label_12"], thread_id=full["threadId"]),
            gmail_message("u3", labels=["TRASH", "UNREAD", "Label_12"]),  # trash: not counted
            gmail_message("u4", labels=["INBOX", "Label_19"]),  # read: not counted
        ):
            gmail_store.store_gmail(self.mailbox, message, now=self.now)
        self.renewals = MailLabel.objects.get(gmail_id="Label_12")
        self.vendors = MailLabel.objects.get(gmail_id="Label_19")
        self.client.force_authenticate(self.dana)

    def create(self, name="Pilot"):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(URL, {"name": name}, format="json")


class LabelListTests(LabelFixture):
    def test_my_labels_by_name_with_unread_conversations(self):
        self.assertEqual(
            self.client.get(URL).data,
            [
                {
                    "id": self.renewals.pk,
                    "gmail_id": "Label_12",
                    "name": "Renewals",
                    "color": RENEWALS_COLOR,
                    "unread": 1,
                    "pending": False,
                },
                {
                    "id": self.vendors.pk,
                    "gmail_id": "Label_19",
                    "name": "Vendors/Billing",
                    "color": None,
                    "unread": 0,
                    "pending": False,
                },
            ],
        )

    def test_a_label_made_here_is_listed_and_shown_on_messages_as_pending(self):
        made = self.create().data
        label = MailLabel.objects.get(pk=made["id"])
        with transaction.atomic():
            outbox.apply(
                self.mailbox, [(self.row, c) for c in outbox.changes_for("label_add", label)]
            )
        listed = next(row for row in self.client.get(URL).data if row["id"] == label.pk)
        self.assertEqual(
            listed,
            {
                "id": label.pk,
                "gmail_id": None,
                "name": "Pilot",
                "color": None,
                "unread": 1,
                "pending": True,
            },
        )
        message = self.client.get(f"/api/v1/mail/messages/{self.row.pk}/").data
        self.assertIn(
            {"id": label.pk, "name": "Pilot", "color": None, "pending": True}, message["labels"]
        )

    def test_three_queries_whatever_the_number_of_labels(self):
        self.client.get(URL)
        with CaptureQueriesContext(db) as queries:
            self.client.get(URL)
        self.assertLessEqual(len(queries), 3)

    def test_nobody_elses_labels(self):
        for person in (self.carl, self.alice, self.priya):
            self.client.force_authenticate(person)
            self.assertEqual(self.client.get(URL).data, [])


class LabelCreateTests(LabelFixture):
    def test_a_label_is_made_here_at_once_and_queued_for_gmail(self):
        response = self.create("  Pilot  ")
        self.assertEqual(response.status_code, 201, response.data)
        label = MailLabel.objects.get(pk=response.data["id"])
        self.assertEqual(
            response.data,
            {
                "id": label.pk,
                "gmail_id": None,
                "name": "Pilot",
                "color": None,
                "unread": 0,
                "pending": True,
            },
        )
        self.assertEqual((label.gmail_id, label.type, label.connection), ("", "user", self.mailbox))
        row = MailOutbox.objects.get()
        self.assertEqual(
            (row.op, row.label, row.message, row.payload),
            ("label_create", label, None, {"name": "Pilot"}),
        )
        self.mailbox.refresh_from_db()
        self.assertIsNotNone(self.mailbox.wake_at)

    def test_names_gmail_would_refuse(self):
        for name, sentence in (
            ("   ", "Name the label."),
            ("x" * 226, "Keep the name under 225 characters."),
            ("inbox", "Gmail keeps that name for itself."),
            ("Category_Social", "Gmail keeps that name for itself."),
        ):
            response = self.create(name)
            self.assertEqual(
                (response.status_code, response.data), (400, {"name": [sentence]}), name
            )
        self.assertEqual(self.create("x" * 225).status_code, 201)

    def test_a_name_that_is_not_text_is_blank(self):
        for raw in (None, 5, ["a"]):
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post(URL, {"name": raw}, format="json")
            self.assertEqual(
                (response.status_code, response.data), (400, {"name": ["Name the label."]}), raw
            )
        self.assertFalse(MailOutbox.objects.exists())
        self.assertFalse(MailLabel.objects.filter(name__in=["None", "5", "['a']"]).exists())

    def test_a_name_i_already_have(self):
        response = self.create("renewals")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.data,
            {
                "code": "LABEL_EXISTS",
                "detail": "You already have a label called Renewals.",
                "label_id": self.renewals.pk,
            },
        )

    def test_the_mailbox_is_locked_and_checked_fresh(self):
        with CaptureQueriesContext(db) as queries:
            self.create()
        self.assertTrue(
            any(
                "FOR NO KEY UPDATE" in q["sql"] and "mailboxconnection" in q["sql"] for q in queries
            )
        )
        original = actions.lock_connection

        def disconnect_then_lock(conn):
            MailboxConnection.objects.filter(pk=conn.pk).update(status="disconnected")
            return original(conn)

        with patch.object(actions, "lock_connection", side_effect=disconnect_then_lock):
            response = self.create("Second")
        self.assertEqual((response.status_code, response.data["code"]), (409, "NO_MAILBOX"))
        self.assertFalse(MailLabel.objects.filter(name="Second").exists())

    def test_outlook_and_imap_have_no_labels(self):
        self.connect(self.priya)
        self.client.force_authenticate(self.priya)
        response = self.create()
        self.assertEqual((response.status_code, response.data["code"]), (400, "GMAIL_ONLY"))

    def test_no_mailbox_a_paused_one_and_a_read_only_one(self):
        self.client.force_authenticate(self.carl)
        self.assertEqual(self.create().data["code"], "NO_MAILBOX")
        self.client.force_authenticate(self.dana)
        SeatAssignment.objects.filter(membership__user=self.dana).update(released_at=timezone.now())
        paused = self.create()
        self.assertEqual(
            (paused.status_code, paused.data["code"], paused.data["paused_reason"]),
            (409, "MAILBOX_PAUSED", "no_seat"),
        )
        SeatAssignment.objects.filter(membership__user=self.dana).update(released_at=None)
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(granted_scopes=READ_ONLY)
        self.dana.refresh_from_db()
        self.client.force_authenticate(self.dana)
        off = self.create()
        self.assertEqual(
            (off.status_code, off.data),
            (
                409,
                {
                    "code": "TWO_WAY_OFF",
                    "detail": (
                        "Reconnect Google to turn on two-way: changes here can't reach Gmail yet."
                    ),
                    "needs_reconnect": True,
                },
            ),
        )
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")
        self.dana.refresh_from_db()
        self.client.force_authenticate(self.dana)
        self.assertEqual(
            self.create().data,
            {"code": "NO_MAILBOX", "detail": "This message's mailbox is no longer connected."},
        )
        self.assertFalse(MailOutbox.objects.exists())


class LabelFlushTests(FlushFixture):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.dana)

    def made(self, name="Pilot"):
        response = self.client.post(URL, {"name": name}, format="json")
        label = MailLabel.objects.get(pk=response.data["id"])
        # Queued a moment after the fixture's `now`: due at it, for tick().
        MailOutbox.objects.filter(op="label_create").update(next_attempt_at=self.now)
        with transaction.atomic():
            outbox.apply(
                self.mailbox,
                [(self.rows["g1"], c) for c in outbox.changes_for("label_add", label)],
                now=self.now,
            )
        return label

    def test_gmail_makes_it_and_the_pending_key_becomes_its_id(self):
        label = self.made()
        self.tick()
        label.refresh_from_db()
        self.assertTrue(label.gmail_id.startswith("Label_"))
        g1 = MailMessage.objects.get(pk=self.rows["g1"].pk)
        self.assertIn(label.gmail_id, g1.label_ids)
        self.assertNotIn(f"pending:{label.pk}", g1.label_ids)
        self.assertEqual(
            sorted(MailOutbox.objects.values_list("op", "label_key", "status")),
            [("label_add", label.gmail_id, "sent"), ("label_create", "", "sent")],
        )
        # Created first, then applied in the same tick.
        self.assertIn(label.gmail_id, self.fake.messages["g1"]["labelIds"])

    def test_a_name_gmail_already_has_is_adopted(self):
        self.fake.labels.append({"id": "Label_77", "name": "pilot", "type": "user"})
        label = self.made()
        self.tick()
        label.refresh_from_db()
        self.assertEqual(label.gmail_id, "Label_77")
        self.assertIn("Label_77", self.fake.messages["g1"]["labelIds"])

    def test_a_label_the_mirror_already_holds_is_merged(self):
        label = self.made()
        MailOutbox.objects.filter(op="label_create").update(
            next_attempt_at=self.now + timedelta(hours=1)
        )
        self.fake.labels.append({"id": "Label_77", "name": "Pilot", "type": "user"})
        self.tick()  # the mirror brings Gmail's Pilot in beside ours
        MailOutbox.objects.filter(op="label_create").update(next_attempt_at=self.now)
        self.tick()
        self.assertEqual(
            list(MailLabel.objects.filter(name="Pilot").values_list("gmail_id", flat=True)),
            ["Label_77"],
        )
        self.assertFalse(MailLabel.objects.filter(pk=label.pk).exists())
        self.assertIn("Label_77", MailMessage.objects.get(pk=self.rows["g1"].pk).label_ids)

    def test_a_name_gmail_refuses_unwinds_everything_and_tells_the_owner(self):
        self.fake.fail(r"/labels$", 400, "invalidArgument")
        label = self.made()
        self.tick()
        self.assertFalse(MailLabel.objects.filter(pk=label.pk).exists())
        self.assertNotIn(
            f"pending:{label.pk}", MailMessage.objects.get(pk=self.rows["g1"].pk).label_ids
        )
        self.assertFalse(MailOutbox.objects.exists())
        note = Notification.objects.get()
        self.assertEqual(
            (note.message, note.link),
            (
                'Couldn\'t create the label "Pilot" in Gmail: Gmail refused the name.',
                "/communications?source=mailbox:google",
            ),
        )

    def test_a_blank_id_from_gmail_is_a_refused_name(self):
        label = self.made()
        with patch.object(self.fake, "_create_label", return_value={"name": "Pilot", "id": " "}):
            self.tick()
        self.assertFalse(MailLabel.objects.filter(pk=label.pk).exists())
        g1 = MailMessage.objects.get(pk=self.rows["g1"].pk)
        self.assertNotIn(f"pending:{label.pk}", g1.label_ids)
        self.assertNotIn("", g1.label_ids)
        self.assertFalse(MailOutbox.objects.exists())
        self.assertEqual(
            Notification.objects.get().message,
            'Couldn\'t create the label "Pilot" in Gmail: Gmail refused the name.',
        )

    def test_a_label_a_disconnect_deleted_meanwhile_is_no_error(self):
        label = self.made()
        MailLabel.objects.filter(pk=label.pk).delete()
        kept = outbox.label_created(self.mailbox, label, "Label_88")
        self.assertEqual(kept.gmail_id, "Label_88")
        self.assertFalse(MailLabel.objects.filter(gmail_id="Label_88").exists())


class LabelLockOrderTests(FlushFixture):
    """Messages first, then outbox rows (the order requests and disconnect
    take), on the flush's failure paths too."""

    made = LabelFlushTests.made

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.dana)

    def order(self, queries, verb):
        sql = [q["sql"] for q in queries]
        lock = next(i for i, q in enumerate(sql) if "FOR UPDATE" in q and "mail_mailmessage" in q)
        write = next(i for i, q in enumerate(sql) if q.startswith(verb) and "mail_mailoutbox" in q)
        return lock, write

    def test_unwind_locks_the_messages_before_it_deletes_rows(self):
        label = self.made()
        with transaction.atomic(), CaptureQueriesContext(db) as queries:
            outbox.unwind_label(self.mailbox, label)
        lock, delete = self.order(queries, "DELETE")
        self.assertLess(lock, delete)
        self.assertFalse(MailOutbox.objects.exists())

    def test_a_failure_locks_the_messages_before_it_marks_rows(self):
        self.act("archive", "g1")
        MailOutbox.objects.update(status="sending")
        rows = list(MailOutbox.objects.select_related("message", "label"))
        with CaptureQueriesContext(db) as queries:
            outbox_flush.Flush(self.mailbox, None, self.now)._fail(rows, "not_found")
        lock, update = self.order(queries, "UPDATE")
        self.assertLess(lock, update)
        self.assertEqual(MailOutbox.objects.get().status, "failed")
