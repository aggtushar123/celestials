"""Files on a draft (D3 contract §3 "Attachments", decisions 20, 21):
checked by the Files tab's validate_upload (type list, magic bytes, the
per-file limit, a safe name); at most 25 a draft; the decoded total within
MAIL_SEND_MAX_BYTES (413 DRAFT_TOO_LARGE); stored cached as an upload part
of the draft's row and queued like any edit; removing an upload deletes it
and its file, removing a forwarded file only leaves it out; owner-only."""

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext

from services.mail.models import MailAttachment, MailDraft, MailOutbox

from .draft_fixtures import URL, DraftFixture

PDF = b"%PDF-1.4 quote v2"
#: Exact counts, measured with the on-commit wake run and independent of how
#: many files the draft holds. Contract §8 says 10; the rest is structural:
#: the SAVEPOINT/RELEASE pair (TestCase only), the draft's reply_draft_id
#: lookup, the draft lock, the messages lock, the mailbox lock, the parts
#: read, the part's insert or delete, the outbox row lock, the draft's and
#: the Drafts row's updates, the total's read (delete only; upload reuses the
#: read it checked against) and the wake.
UPLOAD_QUERIES = 12
REMOVE_QUERIES = 13


def upload(name="Quote v2.pdf", data=PDF, content_type="application/pdf"):
    return SimpleUploadedFile(name, data, content_type=content_type)


class UploadTests(DraftFixture):
    def setUp(self):
        super().setUp()
        self.draft = self.new_draft()
        self.url = f"{URL}drafts/{self.draft['id']}/attachments/"

    def post(self, file=None):
        body = {} if file is None else {"file": file}
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(self.url, body, format="multipart")

    def test_a_file_is_stored_cached_on_the_drafts_row_and_queued(self):
        MailOutbox.objects.update(status="sent")
        response = self.post(upload())
        self.assertEqual(response.status_code, 201, response.data)
        part = MailAttachment.objects.get(pk=response.data["attachment"]["id"])
        self.assertEqual(
            response.data["attachment"],
            {
                "id": part.pk,
                "filename": "Quote v2.pdf",
                "mime_type": "application/pdf",
                "size": len(PDF),
                "origin": "upload",
                "download_url": f"/api/v1/mail/attachments/{part.pk}/download/",
            },
        )
        self.assertEqual(response.data["revision"], 2)
        self.assertTrue(part.part_id.startswith("upload:"))
        self.assertEqual((part.message_id, part.is_inline), (self.draft["message_id"], False))
        self.assertIsNotNone(part.fetched_at)
        with part.file.open("rb") as handle:
            self.assertEqual(handle.read(), PDF)
        self.assertTrue(part.message.has_attachments)
        read = self.client.get(f"{URL}drafts/{self.draft['id']}/").data
        self.assertEqual(response.data["total_bytes"], read["total_bytes"])
        self.assertEqual(MailOutbox.objects.filter(status="pending").count(), 1)
        downloaded = self.client.get(f"{URL}attachments/{part.pk}/download/")
        self.assertEqual(downloaded.status_code, 200)

    def test_the_file_checks(self):
        response = self.post()
        self.assertEqual((response.status_code, response.data), (400, {"file": ["Choose a file."]}))
        response = self.post(upload("tool.zip", b"PK\x03\x04", "application/zip"))
        self.assertEqual(response.data, {"file": [".zip is not an accepted file type."]})
        response = self.post(upload("fake.pdf", b"<html>", "application/pdf"))
        self.assertEqual(response.data, {"file": ["That does not look like a .pdf file."]})

    @override_settings(MAIL_DRAFT_MAX_ATTACHMENTS=1)
    def test_at_most_so_many_files(self):
        self.assertEqual(self.post(upload()).status_code, 201)
        response = self.post(upload("b.pdf"))
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"code": "TOO_MANY_ATTACHMENTS", "detail": "A message can carry 25 files."}),
        )

    @override_settings(MAIL_SEND_MAX_BYTES=2000)
    def test_the_total_stays_within_the_limit(self):
        response = self.post(upload(data=PDF + b"0" * 2000))
        self.assertEqual(
            (response.status_code, response.data),
            (
                413,
                {"code": "DRAFT_TOO_LARGE", "detail": "Attachments are limited to 25 MB in total."},
            ),
        )
        self.assertFalse(MailAttachment.objects.filter(part_id__startswith="upload:").exists())

    def test_someone_elses_or_a_sent_draft(self):
        self.client.force_authenticate(self.carl)
        self.assertEqual(self.post(upload()).status_code, 404)
        self.client.force_authenticate(self.dana)
        MailDraft.objects.filter(pk=self.draft["id"]).update(status="sent")
        response = self.post(upload())
        self.assertEqual((response.status_code, response.data["code"]), (409, "ALREADY_SENT"))

    def test_an_upload_costs_the_same_with_more_files_on_the_draft(self):
        self.post(upload("warm.pdf"))
        counts = []
        for name in ("b.pdf", "c.pdf", "d.pdf"):
            with CaptureQueriesContext(connection) as queries:
                self.assertEqual(self.post(upload(name)).status_code, 201)
            counts.append(len(queries))
        self.assertEqual(counts, [UPLOAD_QUERIES] * 3)

    @override_settings(MAIL_DRAFT_MAX_ATTACHMENTS=2)
    def test_the_count_includes_forwarded_files(self):
        draft = self.post_draft({"kind": "forward", "source_message_id": self.quote.pk}).data
        self.assertEqual(len(draft["attachments"]), 1)
        url = f"{URL}drafts/{draft['id']}/attachments/"
        self.assertEqual(
            self.client.post(url, {"file": upload()}, format="multipart").status_code, 201
        )
        response = self.client.post(url, {"file": upload("b.pdf")}, format="multipart")
        self.assertEqual(
            (response.status_code, response.data["code"]), (400, "TOO_MANY_ATTACHMENTS")
        )


class RemoveTests(DraftFixture):
    def test_an_upload_goes_with_its_file_and_a_forwarded_file_is_only_left_out(self):
        draft = self.post_draft({"kind": "forward", "source_message_id": self.quote.pk}).data
        url = f"{URL}drafts/{draft['id']}/attachments/"
        with self.captureOnCommitCallbacks(execute=True):
            added = self.client.post(url, {"file": upload()}, format="multipart").data
        part = MailAttachment.objects.get(pk=added["attachment"]["id"])
        storage, name = part.file.storage, part.file.name
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.delete(f"{url}{part.pk}/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(set(response.data), {"revision", "total_bytes"})
        self.assertFalse(MailAttachment.objects.filter(pk=part.pk).exists())
        self.assertFalse(storage.exists(name))
        [forwarded] = draft["attachments"]
        response = self.client.delete(f"{url}{forwarded['id']}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.stored(draft["id"]).forwarded, [])
        self.assertTrue(MailAttachment.objects.filter(pk=forwarded["id"]).exists())
        self.assertEqual(self.client.delete(f"{url}{forwarded['id']}/").status_code, 404)

    def test_a_removal_costs_the_same_with_more_files_on_the_draft(self):
        draft = self.new_draft()
        url = f"{URL}drafts/{draft['id']}/attachments/"
        ids = [
            self.client.post(url, {"file": upload(f"{n}.pdf")}, format="multipart").data[
                "attachment"
            ]["id"]
            for n in "abcd"
        ]
        counts = []
        for pk in ids[1:]:
            with (
                CaptureQueriesContext(connection) as queries,
                self.captureOnCommitCallbacks(execute=True),
            ):
                self.assertEqual(self.client.delete(f"{url}{pk}/").status_code, 200)
            counts.append(len(queries))
        self.assertEqual(counts, [REMOVE_QUERIES] * 3)

    def test_someone_elses_or_a_sent_draft(self):
        draft = self.new_draft()
        part = self.client.post(
            f"{URL}drafts/{draft['id']}/attachments/", {"file": upload()}, format="multipart"
        ).data["attachment"]["id"]
        url = f"{URL}drafts/{draft['id']}/attachments/{part}/"
        self.client.force_authenticate(self.carl)
        self.assertEqual(self.client.delete(url).status_code, 404)
        self.client.force_authenticate(self.dana)
        MailDraft.objects.filter(pk=draft["id"]).update(status="sent")
        response = self.client.delete(url)
        self.assertEqual((response.status_code, response.data["code"]), (409, "ALREADY_SENT"))
        self.assertTrue(MailAttachment.objects.filter(pk=part).exists())
