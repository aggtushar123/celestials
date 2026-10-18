"""Conversations (contract §2, §3): the thread list groups the person's mail
by thread and orders it by the newest message matching the view; counts and
flags leave trash and spam out except in their own views; the thread shows
every message oldest first, at most MAIL_THREAD_MAX_MESSAGES; PATCH on a
thread changes every message held (starring stars the newest only); all
owner-only, in a fixed number of queries."""

from datetime import timedelta

from django.db import connection as db
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.mail import gmail_store
from services.mail.models import MailLabel, MailMessage, MailOutbox

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture

LIST = "/api/v1/mail/threads/"
RENEWALS = {
    "name": "Renewals",
    "color": {"background": "#16a766", "text": "#ffffff"},
    "pending": False,
}


class ThreadFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)
        self.now = timezone.now()
        gmail_store.mirror_labels(self.mailbox, fixture("labels_list.json")["labels"])
        self.renewals = MailLabel.objects.get(gmail_id="Label_12")
        self.m = {}
        for gmail_id, hours, labels, sender, thread in (
            (
                "m1",
                3,
                ["INBOX", "UNREAD", "STARRED", "Label_12"],
                "Sam Pizza <sam@pizzahut.com>",
                "t-1",
            ),
            ("m2", 2, ["SENT"], "Dana <dana@acme.io>", "t-1"),
            ("m3", 1, ["INBOX", "UNREAD"], "Ann Lee <ann@pizzahut.com>", "t-1"),
            ("n1", 0.5, ["INBOX"], "X <x@else.io>", "t-2"),
            ("n2", 0.2, ["TRASH"], "X <x@else.io>", "t-2"),
            ("s1", 5, ["INBOX"], "Y <y@else.io>", "s1"),
        ):
            self.m[gmail_id] = self.store(gmail_id, hours, labels, sender, thread)
        self.client.force_authenticate(self.dana)

    def store(self, gmail_id, hours, labels, sender, thread):
        full = gmail_message(
            gmail_id,
            labels=labels,
            sender=sender,
            to="sam@pizzahut.com" if "dana@" in sender else "dana@acme.io",
            subject=f"Subject {gmail_id}",
            sent_at=self.now - timedelta(hours=hours),
            thread_id=thread,
        )
        return gmail_store.store_gmail(self.mailbox, full, now=self.now)[0]

    def results(self, query=""):
        response = self.client.get(f"{LIST}?{query}")
        self.assertEqual(response.status_code, 200, response.data)
        return response.data["results"]


class ThreadListTests(ThreadFixture):
    def test_newest_matching_message_first(self):
        self.assertEqual(
            [row["id"] for row in self.results()],
            [self.m["n1"].pk, self.m["m3"].pk, self.m["s1"].pk],
        )

    def test_a_thread_row(self):
        row = next(r for r in self.results() if r["thread_id"] == "t-1")
        self.assertEqual(
            {key: row[key] for key in row if key not in ("last_sent_at", "labels")},
            {
                "id": self.m["m3"].pk,
                "thread_id": "t-1",
                "subject": "Subject m3",
                "snippet": "Can we talk about the renewal?",
                "message_count": 3,
                "unread_count": 2,
                "participants": [
                    {"name": "Sam Pizza", "address": "sam@pizzahut.com"},
                    {"name": "Dana", "address": "dana@acme.io"},
                    {"name": "Ann Lee", "address": "ann@pizzahut.com"},
                ],
                "more_participants": 0,
                "is_read": False,
                "is_starred": True,
                "is_important": False,
                "priority": True,
                "state": "open",
                "folder": "inbox",
                "has_attachments": False,
                "account": {"id": self.pizza.pk, "name": "Pizza Hut", "type": "customer"},
                "sync_issue": None,
                "draft": None,
            },
        )
        self.assertEqual(row["last_sent_at"], self.m["m3"].sent_at)
        self.assertEqual(row["labels"], [{"id": self.renewals.pk, **RENEWALS}])

    def test_trash_counts_only_in_the_trash_view(self):
        inbox = next(r for r in self.results() if r["thread_id"] == "t-2")
        self.assertEqual((inbox["id"], inbox["message_count"]), (self.m["n1"].pk, 1))
        [trash] = self.results("folder=trash")
        self.assertEqual(
            (trash["id"], trash["message_count"], trash["folder"]), (self.m["n2"].pk, 2, "trash")
        )

    def test_up_to_three_participants(self):
        for n in range(4):
            self.store(f"p{n}", 6 + n, ["INBOX"], f"P{n} <p{n}@else.io>", "t-3")
        row = next(r for r in self.results() if r["thread_id"] == "t-3")
        self.assertEqual(
            ([p["address"] for p in row["participants"]], row["more_participants"]),
            (["p3@else.io", "p2@else.io", "p1@else.io"], 1),
        )

    def test_a_label_view_anchors_on_the_matching_message(self):
        [row] = self.results(f"folder=all&label={self.renewals.pk}")
        self.assertEqual((row["id"], row["message_count"]), (self.m["m1"].pk, 3))

    def test_unknown_folder_or_label(self):
        self.assertEqual(self.client.get(f"{LIST}?folder=nope").status_code, 400)
        self.assertEqual(
            self.client.get(f"{LIST}?label=999999").data, {"label": ["Choose one of your labels."]}
        )

    def test_outlook_and_imap_without_a_thread_id_are_one_message_each(self):
        imap = self.connect(self.carl)
        for n in range(2):
            MailMessage.objects.create(
                connection=imap,
                owner=self.carl,
                organisation=self.org,
                provider_message_id=f"<i{n}@x.io>",
                direction="received",
                subject="Hi",
                sent_at=self.now,
            )
        self.client.force_authenticate(self.carl)
        self.assertEqual(len(self.results()), 2)

    def test_nobody_elses_threads(self):
        for person in (self.carl, self.alice):
            self.client.force_authenticate(person)
            self.assertEqual(self.results(), [])

    def test_a_fixed_number_of_queries(self):
        self.results()
        with CaptureQueriesContext(db) as few:
            self.results()
        for n in range(5):
            self.store(f"q{n}", 7 + n, ["INBOX", "Label_12"], "Q <q@else.io>", f"tq-{n}")
            self.store(f"r{n}", 7 + n, ["INBOX"], "R <r@else.io>", f"tq-{n}")
        with CaptureQueriesContext(db) as many:
            self.results()
        self.assertEqual(len(few), len(many))
        self.assertLessEqual(len(many), 6)


class ThreadDetailTests(ThreadFixture):
    def test_every_message_oldest_first_trashed_included(self):
        data = self.client.get(f"/api/v1/mail/messages/{self.m['n1'].pk}/thread/").data
        self.assertEqual(
            {k: data[k] for k in ("thread_id", "subject", "truncated", "sync_issue", "account")},
            {
                "thread_id": "t-2",
                "subject": "Subject n1",
                "truncated": False,
                "sync_issue": None,
                "account": None,
            },
        )
        self.assertEqual(
            [(m["id"], m["folder"]) for m in data["messages"]],
            [(self.m["n1"].pk, "inbox"), (self.m["n2"].pk, "trash")],
        )
        self.assertIn("body", data["messages"][0])

    @override_settings(MAIL_THREAD_MAX_MESSAGES=2)
    def test_the_newest_ones_when_there_are_more(self):
        data = self.client.get(f"/api/v1/mail/messages/{self.m['m1'].pk}/thread/").data
        self.assertEqual(
            ([m["id"] for m in data["messages"]], data["truncated"], data["subject"]),
            ([self.m["m2"].pk, self.m["m3"].pk], True, "Subject m2"),
        )
        self.assertEqual(data["labels"], [])  # Renewals is on m1 only, which is not shown

    def test_nobody_else_opens_it(self):
        for person in (self.carl, self.alice, self.priya):
            self.client.force_authenticate(person)
            self.assertEqual(
                self.client.get(f"/api/v1/mail/messages/{self.m['m1'].pk}/thread/").status_code, 404
            )

    def test_seven_queries(self):
        url = f"/api/v1/mail/messages/{self.m['m1'].pk}/thread/"
        self.client.get(url)
        with CaptureQueriesContext(db) as queries:
            self.client.get(url)
        self.assertLessEqual(len(queries), 7)


class ThreadPatchTests(ThreadFixture):
    def patch(self, gmail_id, body):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.patch(
                f"/api/v1/mail/messages/{self.m[gmail_id].pk}/thread/", body, format="json"
            )

    def test_done_archives_every_message_held(self):
        response = self.patch("m1", {"state": "done"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual({m["state"] for m in response.data["messages"]}, {"done", "open"})
        self.assertEqual(
            sorted(MailOutbox.objects.values_list("message__provider_message_id", "label_key")),
            [("m1", "INBOX"), ("m3", "INBOX")],
        )

    def test_star_stars_the_newest_and_unstar_unstars_all(self):
        self.patch("m1", {"is_starred": True})
        self.assertEqual(
            list(MailOutbox.objects.values_list("message__provider_message_id", "add")),
            [("m3", True)],
        )
        self.patch("m1", {"is_starred": False})
        self.assertEqual(
            list(MailOutbox.objects.values_list("message__provider_message_id", "add")),
            [("m1", False)],
        )
        self.assertFalse(MailMessage.objects.filter(is_starred=True).exists())

    @override_settings(MAIL_ACTION_MAX_MESSAGES=2)
    def test_too_many_messages(self):
        response = self.patch("m1", {"is_read": True})
        self.assertEqual(
            (response.status_code, response.data),
            (
                400,
                {
                    "code": "TOO_MANY",
                    "detail": "Select fewer conversations: at most 2 messages at a time.",
                },
            ),
        )

    def test_nobody_else_changes_it(self):
        self.client.force_authenticate(self.carl)
        self.assertEqual(self.patch("m1", {"is_read": True}).status_code, 404)
        self.assertFalse(MailOutbox.objects.exists())

    def test_a_fixed_number_of_queries_whatever_the_thread_length(self):
        self.patch("s1", {"is_read": False})
        with CaptureQueriesContext(db) as one:
            self.client.patch(
                f"/api/v1/mail/messages/{self.m['s1'].pk}/thread/", {"is_read": True}, format="json"
            )
        with CaptureQueriesContext(db) as three:
            self.client.patch(
                f"/api/v1/mail/messages/{self.m['m1'].pk}/thread/", {"is_read": True}, format="json"
            )
        self.assertEqual(len(one), len(three))
        # contract §8: 12, plus the thread payload's own reads (7).
        self.assertLessEqual(len(three), 19)
