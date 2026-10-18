"""The message list's D2 parts (contract §2, §5): folder=all is every message
outside trash and spam; label=<id> narrows to one of my own user labels (a
label made here included); sync_issue names the newest failed change on a
message for 7 days, until another action is made on it."""

import uuid
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from services.mail import gmail_store, outbox
from services.mail.models import MailLabel, MailMessage, MailOutbox

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture

URL = "/api/v1/mail/messages/"


class ListingFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)
        self.now = timezone.now()
        gmail_store.mirror_labels(self.mailbox, fixture("labels_list.json")["labels"])
        self.renewals = MailLabel.objects.get(gmail_id="Label_12")
        self.rows = {}
        for gmail_id, labels in (
            ("a", ["INBOX", "Label_12"]),
            ("b", ["Label_12"]),  # archived
            ("c", ["TRASH", "Label_12"]),
            ("d", ["SPAM"]),
        ):
            self.rows[gmail_id], _ = gmail_store.store_gmail(
                self.mailbox, gmail_message(gmail_id, labels=labels), now=self.now
            )
        self.client.force_authenticate(self.dana)

    def listed(self, query):
        response = self.client.get(f"{URL}?{query}")
        self.assertEqual(response.status_code, 200, response.data)
        ids = {row["id"] for row in response.data["results"]}
        return {gmail_id for gmail_id, row in self.rows.items() if row.pk in ids}

    def failed(self, message, **fields):
        values = {
            "connection": self.mailbox,
            "action_id": uuid.uuid4(),
            "op": "archive",
            "message": message,
            "label_key": "INBOX",
            "add": False,
            "previous": {"present": True},
            "status": "failed",
            "reason": "not_found",
            "failed_at": self.now,
            "next_attempt_at": self.now,
        }
        values.update(fields)
        return MailOutbox.objects.create(**values)


class AllMailAndLabelTests(ListingFixture):
    def test_all_is_everything_outside_trash_and_spam(self):
        self.assertEqual(self.listed("folder=all"), {"a", "b"})

    def test_a_label_view(self):
        self.assertEqual(self.listed(f"folder=all&label={self.renewals.pk}"), {"a", "b"})
        self.assertEqual(self.listed(f"folder=trash&label={self.renewals.pk}"), {"c"})

    def test_a_label_made_here(self):
        made = MailLabel.objects.create(connection=self.mailbox, name="Pilot", type="user")
        with transaction.atomic():
            outbox.apply(
                self.mailbox, [(self.rows["a"], c) for c in outbox.changes_for("label_add", made)]
            )
        self.assertEqual(self.listed(f"folder=all&label={made.pk}"), {"a"})

    def test_a_label_that_is_not_one_of_mine(self):
        carls = self.google(self.carl)
        theirs = MailLabel.objects.create(
            connection=carls, gmail_id="Label_5", name="X", type="user"
        )
        system = MailLabel.objects.get(connection=self.mailbox, gmail_id="INBOX")
        for raw in (str(theirs.pk), str(system.pk), "999999", "abc", "\u00b2", "9" * 40, "-1"):
            response = self.client.get(f"{URL}?folder=all&label={raw}")
            self.assertEqual(
                (response.status_code, response.data),
                (400, {"label": ["Choose one of your labels."]}),
            )


class SyncIssueTests(ListingFixture):
    def issue_of(self, gmail_id):
        rows = self.client.get(f"{URL}?folder=all").data["results"]
        return next(row for row in rows if row["id"] == self.rows[gmail_id].pk)["sync_issue"]

    def test_a_failed_change_shows_on_the_message_and_its_detail(self):
        self.failed(self.rows["a"])
        expected = {
            "text": "Couldn't archive in Gmail: the message no longer exists.",
            "at": self.now,
        }
        self.assertEqual(self.issue_of("a"), expected)
        self.assertIsNone(self.issue_of("b"))
        detail = self.client.get(f"{URL}{self.rows['a'].pk}/").data
        self.assertEqual(detail["sync_issue"], expected)

    def test_a_label_change_names_its_label(self):
        self.failed(
            self.rows["a"],
            op="label_remove",
            label_key="Label_12",
            payload={"label": "Renewals"},
            reason="label_gone",
        )
        self.assertEqual(
            self.issue_of("a")["text"],
            'Couldn\'t remove the label "Renewals" in Gmail: the label no longer exists.',
        )

    def test_a_later_action_clears_it(self):
        self.failed(self.rows["a"])
        MailOutbox.objects.create(
            connection=self.mailbox,
            action_id=uuid.uuid4(),
            op="read",
            message=self.rows["a"],
            label_key="UNREAD",
            add=False,
            previous={"present": True},
            status="sent",
            next_attempt_at=self.now,
        )
        self.assertIsNone(self.issue_of("a"))

    def test_after_seven_days_it_is_gone(self):
        self.failed(self.rows["a"], failed_at=self.now - timedelta(days=8))
        self.assertIsNone(self.issue_of("a"))

    def test_outlook_and_imap_rows_have_none(self):
        imap = self.connect(self.carl)
        MailMessage.objects.create(
            connection=imap,
            owner=self.carl,
            organisation=self.org,
            provider_message_id="<m1@x.io>",
            direction="received",
            subject="Hi",
            sent_at=self.now,
        )
        self.client.force_authenticate(self.carl)
        [row] = self.client.get(URL).data["results"]
        self.assertIsNone(row["sync_issue"])
