"""Bulk actions (contract §3, POST mail/actions/): one op on many messages or
whole conversations; all or nothing, so an id that is not the caller's
makes the whole request 404 and names none; at most MAIL_ACTION_MAX_MESSAGES
after expansion; the counts; Outlook and IMAP local; a fixed number of
queries."""

from datetime import timedelta

from django.db import connection as db
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.billing.models import SeatAssignment
from services.mail import gmail_store
from services.mail.models import MailboxConnection, MailLabel, MailMessage, MailOutbox

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture

URL = "/api/v1/mail/actions/"


class BulkFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)
        self.now = timezone.now()
        gmail_store.mirror_labels(self.mailbox, fixture("labels_list.json")["labels"])
        self.renewals = MailLabel.objects.get(gmail_id="Label_12")
        self.m = {}
        for n, (gmail_id, thread) in enumerate(
            (("a1", "t-1"), ("a2", "t-1"), ("b1", "t-2"), ("c1", "c1"))
        ):
            full = gmail_message(
                gmail_id, thread_id=thread, sent_at=self.now - timedelta(minutes=10 - n)
            )
            self.m[gmail_id] = gmail_store.store_gmail(self.mailbox, full, now=self.now)[0]
        self.client.force_authenticate(self.dana)

    def post(self, body):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(URL, body, format="json")

    def ids(self, *gmail_ids):
        return [self.m[gmail_id].pk for gmail_id in gmail_ids]


class BulkTests(BulkFixture):
    def test_archive_whole_conversations(self):
        response = self.post({"op": "archive", "thread_of": self.ids("a1", "b1")})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            response.data, {"op": "archive", "messages": 3, "threads": 2, "unchanged": 0}
        )
        self.assertEqual(MailOutbox.objects.values("action_id").distinct().count(), 1)
        self.assertEqual(MailMessage.objects.filter(state="done").count(), 3)

    def test_label_only_the_messages_named(self):
        response = self.post(
            {"op": "label_add", "label_id": self.renewals.pk, "message_ids": self.ids("a1")}
        )
        self.assertEqual(
            response.data, {"op": "label_add", "messages": 1, "threads": 1, "unchanged": 0}
        )
        self.assertEqual(
            list(
                MailMessage.objects.filter(label_ids__contains=["Label_12"]).values_list(
                    "pk", flat=True
                )
            ),
            self.ids("a1"),
        )

    def test_what_is_already_true_is_unchanged(self):
        self.post({"op": "archive", "message_ids": self.ids("c1")})
        response = self.post({"op": "archive", "message_ids": self.ids("c1")})
        self.assertEqual(
            response.data, {"op": "archive", "messages": 0, "threads": 1, "unchanged": 1}
        )

    def test_starring_a_conversation_stars_its_newest(self):
        response = self.post({"op": "star", "thread_of": self.ids("a1")})
        self.assertEqual(response.data, {"op": "star", "messages": 1, "threads": 1, "unchanged": 1})
        self.assertEqual(
            list(MailMessage.objects.filter(is_starred=True).values_list("pk", flat=True)),
            self.ids("a2"),
        )

    def test_mute_and_unmute(self):
        self.post({"op": "mute", "message_ids": self.ids("c1")})
        self.assertEqual(MailMessage.objects.get(pk=self.m["c1"].pk).state, "muted")
        self.post({"op": "unmute", "message_ids": self.ids("c1")})
        self.assertEqual(MailMessage.objects.get(pk=self.m["c1"].pk).state, "open")
        self.assertFalse(MailOutbox.objects.exists())


class BulkRefusalTests(BulkFixture):
    def test_bodies_that_are_refused(self):
        a1 = self.ids("a1")
        for body, errors in (
            ({"op": "explode", "message_ids": a1}, {"op": ["Choose a known action."]}),
            ({"op": "archive"}, {"non_field_errors": ["Send message_ids or thread_of, not both."]}),
            (
                {"op": "archive", "message_ids": a1, "thread_of": a1},
                {"non_field_errors": ["Send message_ids or thread_of, not both."]},
            ),
            ({"op": "label_add", "message_ids": a1}, {"label_id": ["Choose one of your labels."]}),
            (
                {"op": "archive", "label_id": self.renewals.pk, "message_ids": a1},
                {"label_id": ["Only label actions take a label."]},
            ),
            (
                {"op": "label_add", "label_id": 999999, "message_ids": a1},
                {"label_id": ["Choose one of your labels."]},
            ),
        ):
            response = self.post(body)
            self.assertEqual((response.status_code, response.data), (400, errors), body)
        self.assertEqual(self.post({"op": "archive", "message_ids": []}).status_code, 400)
        self.assertFalse(MailOutbox.objects.exists())

    def test_one_id_that_is_not_mine_404s_the_whole_request(self):
        carls = self.google(self.carl)
        theirs = gmail_store.store_gmail(carls, gmail_message("z1"), now=self.now)[0]
        for ids in (self.ids("a1") + [theirs.pk], self.ids("a1") + [999999]):
            response = self.post({"op": "archive", "message_ids": ids})
            self.assertEqual((response.status_code, response.data), (404, {"detail": "Not found."}))
        self.client.force_authenticate(self.carl)  # her manager
        self.assertEqual(self.post({"op": "archive", "thread_of": self.ids("a1")}).status_code, 404)
        self.assertFalse(MailOutbox.objects.exists())

    @override_settings(MAIL_ACTION_MAX_MESSAGES=2)
    def test_too_many_after_expansion(self):
        response = self.post({"op": "read", "thread_of": self.ids("a1", "b1")})
        self.assertEqual((response.status_code, response.data["code"]), (400, "TOO_MANY"))

    def test_paused_refuses_gmail_ops_and_lets_mute_through(self):
        SeatAssignment.objects.filter(membership__user=self.dana).update(released_at=timezone.now())
        self.assertEqual(
            self.post({"op": "archive", "message_ids": self.ids("c1")}).data["code"],
            "MAILBOX_PAUSED",
        )
        self.assertEqual(self.post({"op": "mute", "message_ids": self.ids("c1")}).status_code, 200)

    def test_mute_and_unmute_pass_a_read_only_mailbox_for_whole_conversations(self):
        # A thread PATCH can only unmute by setting open or done, which writes to
        # Gmail; bulk mute and unmute are Revenact's own and always pass.
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(
            granted_scopes=["https://www.googleapis.com/auth/gmail.readonly"]
        )
        archive = self.post({"op": "archive", "thread_of": self.ids("a1")})
        self.assertEqual(archive.data["code"], "TWO_WAY_OFF")
        for op in ("mute", "unmute"):
            response = self.post({"op": op, "thread_of": self.ids("a1")})
            self.assertEqual(response.data, {"op": op, "messages": 2, "threads": 1, "unchanged": 0})
        states = MailMessage.objects.filter(pk__in=self.ids("a1", "a2")).values_list(
            "state", flat=True
        )
        self.assertEqual(set(states), {"open"})
        self.assertFalse(MailOutbox.objects.exists())

    @override_settings(MAIL_ACTION_MAX_MESSAGES=1)
    def test_mute_keeps_the_all_or_nothing_and_size_rules(self):
        self.assertEqual(
            self.post({"op": "mute", "thread_of": self.ids("a1")}).data["code"], "TOO_MANY"
        )
        self.assertEqual(self.post({"op": "mute", "message_ids": [999999]}).status_code, 404)

    def test_outlook_and_imap_are_local_and_refuse_gmail_ops(self):
        imap = self.connect(self.priya)
        rows = [
            MailMessage.objects.create(
                connection=imap,
                owner=self.priya,
                organisation=self.org,
                provider_message_id=f"<i{n}@x.io>",
                direction="received",
                subject="Hi",
                sent_at=self.now,
            )
            for n in range(2)
        ]
        ids = [row.pk for row in rows]
        self.client.force_authenticate(self.priya)
        response = self.post({"op": "archive", "message_ids": ids})
        self.assertEqual(
            response.data, {"op": "archive", "messages": 2, "threads": 2, "unchanged": 0}
        )
        self.assertEqual(
            set(MailMessage.objects.filter(pk__in=ids).values_list("state", flat=True)), {"done"}
        )
        for op, state in (("mute", "muted"), ("unmute", "open")):
            self.assertEqual(self.post({"op": op, "message_ids": ids}).data["messages"], 2)
            states = MailMessage.objects.filter(pk__in=ids).values_list("state", flat=True)
            self.assertEqual(set(states), {state})
        for body in (
            {"op": "trash", "message_ids": ids},
            {"op": "label_add", "label_id": self.renewals.pk, "message_ids": ids},
        ):
            self.assertEqual(self.post(body).data["code"], "GMAIL_ONLY")
        self.assertFalse(MailOutbox.objects.exists())


class BulkCeilingTests(BulkFixture):
    def test_a_fixed_number_of_queries_whatever_the_number_of_conversations(self):
        self.post({"op": "read", "thread_of": self.ids("c1")})
        with CaptureQueriesContext(db) as one:
            self.client.post(URL, {"op": "unread", "thread_of": self.ids("c1")}, format="json")
        with CaptureQueriesContext(db) as many:
            self.client.post(
                URL, {"op": "read", "thread_of": self.ids("a1", "b1", "c1")}, format="json"
            )
        self.assertEqual(len(one), len(many))
        self.assertLessEqual(len(many), 12)


class BulkDisconnectedTests(BulkFixture):
    def test_mute_and_unmute_pass_a_disconnected_mailbox(self):
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(
            status=MailboxConnection.Status.DISCONNECTED
        )
        self.assertEqual(
            self.post({"op": "archive", "message_ids": self.ids("c1")}).data["code"], "NO_MAILBOX"
        )
        for op in ("mute", "unmute"):
            response = self.post({"op": op, "message_ids": self.ids("c1")})
            self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(MailOutbox.objects.exists())
