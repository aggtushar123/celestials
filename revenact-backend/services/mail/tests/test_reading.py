"""Reading the person's own Gmail (contract §6): user labels resolved by
name, CC and BCC, the sanitised HTML and the attachment details, all
owner-only (a manager or an admin sees only the filed copy, without any of
it), and the list and detail in a fixed number of queries."""

from django.db import connection as db
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.customers.models import Email
from services.mail import gmail_store
from services.mail.models import MailLabel, MailMessage

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture

RENEWALS_COLOR = {"background": "#16a766", "text": "#ffffff"}
PDF = {"filename": "q.pdf", "mime_type": "application/pdf", "size": 10}


class ReadingFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)
        gmail_store.mirror_labels(self.mailbox, fixture("labels_list.json")["labels"])
        self.row, self.filed = gmail_store.store_gmail(
            self.mailbox, fixture("message_full.json"), now=timezone.now()
        )
        self.renewals = MailLabel.objects.get(gmail_id="Label_12")
        self.vendors = MailLabel.objects.get(gmail_id="Label_19")


class OwnerReadsTests(ReadingFixture):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.dana)

    def test_a_row_carries_user_labels_cc_bcc_and_attachments(self):
        [row] = self.client.get("/api/v1/mail/messages/").data["results"]
        self.assertEqual(
            row["labels"],
            [
                {
                    "id": self.renewals.pk,
                    "name": "Renewals",
                    "color": RENEWALS_COLOR,
                    "pending": False,
                }
            ],
        )
        self.assertEqual(
            (row["cc"], row["bcc"], row["has_attachments"]),
            ([["Sam Pizza", "sam@pizzahut.com"]], [], True),
        )
        for hidden in ("html_body", "attachments", "label_ids", "rfc_message_id", "references"):
            self.assertNotIn(hidden, row)

    def test_labels_sort_by_name_and_unknown_ids_are_ignored(self):
        MailMessage.objects.filter(pk=self.row.pk).update(
            label_ids=["INBOX", "Label_19", "Label_gone", "Label_12"]
        )
        [row] = self.client.get("/api/v1/mail/messages/").data["results"]
        self.assertEqual(
            [label["name"] for label in row["labels"]], ["Renewals", "Vendors/Billing"]
        )
        self.assertIsNone(row["labels"][1]["color"])

    def test_the_detail_has_the_safe_html_and_every_part(self):
        detail = self.client.get(f"/api/v1/mail/messages/{self.row.id}/").data
        self.assertIn('src="cid:logo@pizzahut.com"', detail["html_body"])
        self.assertNotIn("<script", detail["html_body"])
        self.assertTrue(detail["body"].startswith("Hi Dana,"))
        parts = list(self.row.attachments.order_by("part_id"))
        self.assertEqual(
            detail["attachments"],
            [
                {
                    "id": parts[0].pk,
                    "filename": "Renewal quote.pdf",
                    "mime_type": "application/pdf",
                    "size": 182311,
                    "is_inline": False,
                    "content_id": "",
                    "available": True,
                    "preview": True,
                    "download_url": f"/api/v1/mail/attachments/{parts[0].pk}/download/",
                },
                {
                    "id": parts[1].pk,
                    "filename": "logo.png",
                    "mime_type": "image/png",
                    "size": 4210,
                    "is_inline": True,
                    "content_id": "logo@pizzahut.com",
                    "available": True,
                    "preview": True,
                    "download_url": f"/api/v1/mail/attachments/{parts[1].pk}/download/",
                },
            ],
        )
        for hidden in ("rfc_message_id", "references", "label_ids"):
            self.assertNotIn(hidden, detail)

    def test_the_label_list_is_my_user_labels_by_name(self):
        self.assertEqual(
            self.client.get("/api/v1/mail/labels/").data,
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

    def test_no_labels_without_a_live_google_mailbox(self):
        self.mailbox.status = "disconnected"
        self.mailbox.save(update_fields=["status"])
        self.client.force_authenticate(type(self.dana).objects.get(pk=self.dana.pk))
        self.assertEqual(self.client.get("/api/v1/mail/labels/").data, [])
        self.connect(self.priya)
        self.client.force_authenticate(self.priya)
        self.assertEqual(self.client.get("/api/v1/mail/labels/").data, [])

    def test_outlook_and_imap_rows_answer_the_new_fields_empty(self):
        imap = self.connect(self.carl)
        MailMessage.objects.create(
            connection=imap,
            owner=self.carl,
            organisation=self.org,
            provider_message_id="<m1@x.io>",
            direction="received",
            subject="Hi",
            sent_at=timezone.now(),
        )
        self.client.force_authenticate(self.carl)
        [row] = self.client.get("/api/v1/mail/messages/").data["results"]
        self.assertEqual(
            (row["cc"], row["bcc"], row["labels"], row["has_attachments"]), ([], [], [], False)
        )
        detail = self.client.get(f"/api/v1/mail/messages/{row['id']}/").data
        self.assertEqual((detail["html_body"], detail["attachments"]), ("", []))


class PrivacyTests(ReadingFixture):
    def test_nobody_else_reads_it_not_the_manager_nor_an_admin(self):
        # Carl is Dana's manager; Alice is an admin holding every capability.
        for viewer in (self.carl, self.alice):
            with self.subTest(viewer=viewer.name):
                self.client.force_authenticate(viewer)
                self.assertEqual(self.client.get("/api/v1/mail/messages/").data["count"], 0)
                self.assertEqual(
                    self.client.get(f"/api/v1/mail/messages/{self.row.id}/").status_code, 404
                )
                self.assertEqual(self.client.get("/api/v1/mail/labels/").data, [])
                # Mail is owner-only (2026-10-17): not even the filed copy...
                url = f"/api/v1/customers/{self.pizza.id}/emails/"
                self.assertEqual(self.client.get(url).data, [])
        # ...until Dana adds it to Revenact. Then they read the filed copy, and
        # nothing more of her mailbox.
        Email.objects.filter(pk=self.filed.pk).update(shared_at=timezone.now())
        for viewer in (self.carl, self.alice):
            with self.subTest(viewer=viewer.name, shared=True):
                self.client.force_authenticate(viewer)
                self.assertEqual(self.client.get("/api/v1/mail/messages/").data["count"], 0)
                filed = self.client.get(f"/api/v1/customers/{self.pizza.id}/emails/").data
                self.assertEqual([e["id"] for e in filed], [self.filed.id])
                for key in (
                    "labels",
                    "cc",
                    "bcc",
                    "html_body",
                    "attachments",
                    "has_attachments",
                    "label_ids",
                ):
                    self.assertNotIn(key, filed[0])

    def test_a_peer_does_not_see_the_filed_copy_either(self):
        self.client.force_authenticate(self.priya)
        self.assertEqual(self.client.get(f"/api/v1/customers/{self.pizza.id}/emails/").data, [])


class QueryCeilingTests(ReadingFixture):
    def test_the_list_and_the_detail_read_a_fixed_number_of_queries(self):
        self.client.force_authenticate(self.dana)
        with CaptureQueriesContext(db) as one:
            self.client.get("/api/v1/mail/messages/")
        now = timezone.now()
        for n in range(9):
            gmail_store.store_gmail(
                self.mailbox,
                gmail_message(f"q{n}", labels=["INBOX", "Label_12", "Label_19"], attachments=[PDF]),
                now=now,
            )
        with CaptureQueriesContext(db) as ten:
            data = self.client.get("/api/v1/mail/messages/").data
        self.assertEqual(data["count"], 10)
        self.assertEqual(len(one), len(ten))
        # count, page, labels, the page's sync_issue (contract §8: 4).
        self.assertLessEqual(len(ten), 4)
        row = MailMessage.objects.get(provider_message_id="q5")
        with CaptureQueriesContext(db) as detail:
            self.client.get(f"/api/v1/mail/messages/{row.id}/")
        # the message, labels, attachments, sync_issue (contract §8: 5).
        self.assertLessEqual(len(detail), 5)
