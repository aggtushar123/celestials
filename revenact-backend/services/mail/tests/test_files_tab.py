"""The Files tab (contract §6, decisions 29 and 30): an organisation's or an
account's Files list gains the non-inline attachments of mail filed there,
each twice-filtered (the record, and the mail's owner-only rule: its
mailbox owner, or anyone once it is added to Revenact), merged newest first
with the uploads, linked to the mail download route; they go when the
person's copy goes, while the filed Email stays."""

from datetime import timedelta

from django.core.files.base import ContentFile
from django.db import connection as db
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.customers.models import Attachment, Email
from services.mail import gmail_store

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture

APAC_PDF = {"filename": "apac.pdf", "mime_type": "application/pdf", "size": 900}


class FilesTabFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.now = timezone.now()
        self.mailbox = self.google(self.dana)
        # 2026-10-09, from Pizza Hut: filed on the organisation, a PDF and an inline logo.
        self.row, self.filed = gmail_store.store_gmail(
            self.mailbox, fixture("message_full.json"), now=self.now
        )
        self.pdf = self.row.attachments.get(part_id="1")
        account_row, account_email = gmail_store.store_gmail(
            self.mailbox,
            gmail_message("acc1", attachments=[APAC_PDF], sent_at=self.now - timedelta(hours=1)),
            now=self.now,
        )
        Email.objects.filter(pk=account_email.pk).update(customer=None, account=self.apac)
        self.account_email = Email.objects.get(pk=account_email.pk)
        self.apac_pdf = account_row.attachments.get()
        self.upload = Attachment.objects.create(
            organisation=self.org,
            customer=self.pizza,
            file=ContentFile(b"%PDF-1.4", name="msa.pdf"),
            name="msa.pdf",
            content_type="application/pdf",
            size=8,
            uploaded_by=self.carl,
        )

    def files(self, person, url=None):
        self.client.force_authenticate(person)
        response = self.client.get(url or f"/api/v1/customers/{self.pizza.pk}/files/")
        self.assertEqual(response.status_code, 200, response.data)
        return response.data


class OrganisationFilesTests(FilesTabFixture):
    def test_filed_attachments_sit_beside_uploads_newest_first(self):
        rows = self.files(self.dana)  # her own mail, on Pizza Hut
        self.assertEqual(
            [(row["source"], row["id"]) for row in rows],
            [("upload", self.upload.pk), ("email", self.apac_pdf.pk), ("email", self.pdf.pk)],
        )
        self.assertIsNone(rows[0]["email"])
        pdf = rows[2]
        self.assertEqual(
            {key: pdf[key] for key in pdf if key != "created_at"},
            {
                "id": self.pdf.pk,
                "account_id": None,
                "account_name": None,
                "name": "Renewal quote.pdf",
                "content_type": "application/pdf",
                "size": 182311,
                "description": "",
                "source": "email",
                "uploaded_by": None,
                "download_url": f"/api/v1/mail/attachments/{self.pdf.pk}/download/",
                "email": {
                    "id": self.filed.pk,
                    "subject": self.filed.subject,
                    "from": self.filed.sender_name,
                },
            },
        )
        self.assertTrue(pdf["created_at"].startswith("2026-10-09T09:00:00"))
        self.assertEqual((rows[1]["account_id"], rows[1]["account_name"]), (self.apac.pk, "APAC"))

    def test_the_account_lists_its_own(self):
        rows = self.files(
            self.dana, f"/api/v1/customers/{self.pizza.pk}/accounts/{self.apac.pk}/files/"
        )
        self.assertEqual(
            [(row["source"], row["id"]) for row in rows], [("email", self.apac_pdf.pk)]
        )

    def test_only_through_the_twice_filter(self):
        self.assertEqual(len([r for r in self.files(self.dana) if r["source"] == "email"]), 2)
        # Mail is owner-only (2026-10-17): Carl manages Dana and owns Pizza Hut,
        # Priya may open it (view-all); neither reads Dana's private mail.
        self.assertEqual([r["source"] for r in self.files(self.carl)], ["upload"])
        self.assertEqual([r["source"] for r in self.files(self.priya)], ["upload"])
        # Dana adds the organisation's mail to Revenact: its files reach them both.
        Email.objects.filter(pk=self.filed.pk).update(shared_at=self.now)
        for person in (self.carl, self.priya):
            self.assertEqual(
                [(r["source"], r["id"]) for r in self.files(person)],
                [("upload", self.upload.pk), ("email", self.pdf.pk)],
            )

    def test_they_go_with_the_persons_copy_and_the_email_stays(self):
        self.row.delete()
        self.assertEqual(
            [r["id"] for r in self.files(self.dana) if r["source"] == "email"], [self.apac_pdf.pk]
        )
        self.assertTrue(Email.objects.filter(pk=self.filed.pk).exists())

    def test_one_more_query_however_many(self):
        self.files(self.dana)
        with CaptureQueriesContext(db) as few:
            self.client.get(f"/api/v1/customers/{self.pizza.pk}/files/")
        for n in range(3):
            gmail_store.store_gmail(
                self.mailbox, gmail_message(f"more{n}", attachments=[APAC_PDF]), now=self.now
            )
        with CaptureQueriesContext(db) as many:
            rows = self.client.get(f"/api/v1/customers/{self.pizza.pk}/files/").data
        self.assertEqual(len(rows), 6)
        self.assertEqual(len(few), len(many))


class RecordRuleTests(FilesTabFixture):
    """Shared mail alone is not enough: Dana added her mail to Revenact, but
    once Carl may no longer open Pizza Hut its filed attachments are not his
    to see."""

    def setUp(self):
        super().setUp()
        from services.accounts.models import Role
        from services.customers.models import Customer

        plain = Role.objects.create(organisation=self.org, name="Plain", slug="plain")
        User = type(self.carl)
        User.objects.filter(pk=self.carl.pk).update(role=plain)
        self.carl.refresh_from_db()
        Customer.objects.filter(pk=self.pizza.pk).update(owner=self.priya)
        self.pizza.refresh_from_db()
        Email.objects.filter(pk=self.filed.pk).update(shared_at=self.now)

    def test_filed_rows_need_the_record_too(self):
        from services.mail import attachments

        def ids(person):
            return {row["id"] for _, _, row in attachments.filed_rows(person, customer=self.pizza)}

        # The organisation's own filed PDF: it is shared, but the record does not pass.
        self.assertNotIn(self.pdf.pk, ids(self.carl))
        self.assertIn(self.pdf.pk, ids(self.dana))

    def test_the_download_is_404(self):
        self.client.force_authenticate(self.carl)
        response = self.client.get(f"/api/v1/mail/attachments/{self.pdf.pk}/download/")
        self.assertEqual(response.status_code, 404)
