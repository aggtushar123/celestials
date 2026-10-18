"""Gmail's write calls for delivery 3 (decision 19): every call that carries
a message goes to the upload endpoint as multipart/related (JSON metadata,
then the message), under the same host allow-list; a send that got no
answer is SendUnconfirmed, never a plain failure; the draft, sendAs, search
and metadata calls, against the fake Gmail."""

import email
import json
from email import policy
from unittest.mock import patch

from django.test import SimpleTestCase

from services.mail import mime
from services.mail.providers.base import Credentials, ProviderError, SendUnconfirmed, http_upload
from services.mail.providers.google import GmailSession

from .gmail_fake import FakeGmail, gmail_message
from .gmail_fixtures import CREDENTIALS, GmailFixture

RAW = mime.build(
    mime.Outgoing(
        from_name="Dana Ruiz",
        from_address="dana@acme.io",
        to=[["Ann Lee", "ann@pizzahut.com"]],
        subject="Renewal",
        text="Works for us.",
    )
)


class Answer:
    def __init__(self, body):
        self.body = body

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class HttpUploadTests(SimpleTestCase):
    def test_metadata_then_the_message_as_multipart_related(self):
        seen = {}

        def urlopen(request, timeout):
            seen.update(request=request, timeout=timeout)
            return Answer(b'{"id": "s1"}')

        with patch("services.mail.providers.base.urllib.request.urlopen", urlopen):
            answer = http_upload(
                "POST",
                "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=multipart",
                headers={"Authorization": "Bearer t"},
                metadata={"threadId": "t1"},
                payload=RAW,
                timeout=120,
            )
        self.assertEqual(answer, {"id": "s1"})
        request = seen["request"]
        self.assertEqual((request.get_method(), seen["timeout"]), ("POST", 120))
        content_type = request.get_header("Content-type")
        self.assertTrue(content_type.startswith('multipart/related; boundary="'))
        boundary = content_type.split('boundary="', 1)[1].rstrip('"').encode()
        parts = request.data.split(b"--" + boundary)
        self.assertIn(b"Content-Type: application/json; charset=UTF-8", parts[1])
        self.assertEqual(json.loads(parts[1].split(b"\r\n\r\n", 1)[1]), {"threadId": "t1"})
        self.assertIn(b"Content-Type: message/rfc822", parts[2])
        self.assertIn(RAW, parts[2])
        self.assertEqual(parts[3].strip(), b"--")

    def test_a_host_off_the_list_is_refused_before_any_request(self):
        with patch("services.mail.providers.base.urllib.request.urlopen") as urlopen:
            with self.assertRaises(ProviderError):
                http_upload("POST", "https://example.com/upload", payload=RAW)
        urlopen.assert_not_called()


class SessionTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = self.use_gmail()
        self.session = GmailSession(Credentials(address="dana@acme.io", data=dict(CREDENTIALS)))

    def test_a_draft_is_created_updated_listed_and_deleted(self):
        made = self.session.create_draft(RAW, "t1")
        draft_id, first = made["id"], made["message"]["id"]
        self.assertEqual(made["message"]["threadId"], "t1")
        self.assertEqual(self.fake.messages[first]["labelIds"], ["DRAFT"])
        method, route, metadata, message = self.fake.uploads[-1]
        self.assertEqual(
            (method, route, metadata), ("POST", "/drafts", {"message": {"threadId": "t1"}})
        )
        self.assertEqual(str(message["Subject"]), "Renewal")
        updated = self.session.update_draft(draft_id, RAW, "t1")
        self.assertEqual(updated["id"], draft_id)
        self.assertNotEqual(updated["message"]["id"], first)
        self.assertNotIn(first, self.fake.messages)
        self.assertEqual(
            self.fake.uploads[-1][:3],
            ("PUT", f"/drafts/{draft_id}", {"id": draft_id, "message": {"threadId": "t1"}}),
        )
        listed = self.session.list_drafts()
        self.assertEqual(
            listed["drafts"],
            [{"id": draft_id, "message": {"id": updated["message"]["id"], "threadId": "t1"}}],
        )
        self.session.delete_draft(draft_id)
        self.assertEqual(self.fake.drafts, {})
        with self.assertRaises(ProviderError) as caught:
            self.session.delete_draft(draft_id)
        self.assertEqual(caught.exception.status, 404)

    def test_an_unknown_draft_is_a_404_on_update_and_send(self):
        for call in (self.session.update_draft, self.session.send_draft):
            with self.assertRaises(ProviderError) as caught:
                call("r-nope", RAW)
            self.assertEqual(caught.exception.status, 404)

    def test_sending_a_draft_and_a_message(self):
        draft_id = self.session.create_draft(RAW)["id"]
        sent = self.session.send_draft(draft_id, RAW)
        self.assertEqual(self.fake.messages[sent["id"]]["labelIds"], ["SENT"])
        self.assertEqual(self.fake.drafts, {})
        self.assertEqual(
            self.fake.uploads[-1][:3], ("POST", "/drafts/send", {"id": draft_id, "message": {}})
        )
        direct = self.session.send_message(RAW, "t9")
        self.assertEqual(direct["threadId"], "t9")
        self.assertEqual(self.fake.uploads[-1][:3], ("POST", "/messages/send", {"threadId": "t9"}))
        self.session.send_message(RAW)
        self.assertEqual(self.fake.uploads[-1][2], {})

    def test_no_answer_on_a_send_is_unconfirmed_and_on_a_draft_save_a_failure(self):
        with patch("services.mail.providers.google.http_upload", side_effect=TimeoutError()):
            with self.assertRaises(SendUnconfirmed):
                self.session.send_message(RAW)
            with self.assertRaises(ProviderError):
                self.session.create_draft(RAW)

    def test_a_refusal_on_a_send_is_a_provider_error(self):
        self.fake.fail(r"/messages/send$", 413, "tooLarge")
        with self.assertRaises(ProviderError) as caught:
            self.session.send_message(RAW)
        self.assertEqual(caught.exception.status, 413)

    def test_drafts_list_pages(self):
        for _ in range(3):
            self.session.create_draft(RAW)
        first = self.session.list_drafts()
        self.assertEqual(len(first["drafts"]), 2)
        second = self.session.list_drafts(first["nextPageToken"])
        self.assertEqual(len(second["drafts"]), 1)
        self.assertNotIn("nextPageToken", second)

    def test_send_as_and_metadata(self):
        [entry] = self.session.send_as()
        self.assertEqual((entry["sendAsEmail"], entry["isPrimary"]), ("dana@acme.io", True))
        self.fake.add(
            gmail_message(
                "g1",
                subject="Renewal",
                attachments=[{"filename": "q.pdf", "mime_type": "application/pdf", "size": 3}],
            ),
            quietly=True,
        )
        meta = self.session.metadata("g1", ["From", "Subject"])
        names = {header["name"] for header in meta["payload"]["headers"]}
        self.assertEqual(names, {"From", "Subject"})
        self.assertTrue(any(part.get("filename") for part in meta["payload"]["parts"]))
        self.assertIsNone(self.session.metadata("gone", ["From"]))

    def test_search_leaves_out_spam_and_trash_and_matches_words(self):
        self.fake.add(gmail_message("a", subject="2024 renewal", labels=["INBOX"]), quietly=True)
        self.fake.add(gmail_message("b", subject="renewal spam", labels=["SPAM"]), quietly=True)
        self.fake.add(
            gmail_message("c", subject="Lunch", text="Pizza on Friday", labels=["INBOX"]),
            quietly=True,
        )
        found = self.session.search("renewal -in:chats", max_results=20)
        self.assertEqual([stub["id"] for stub in found["messages"]], ["a"])
        query = self.fake.calls[-1][2]
        self.assertEqual((query["includeSpamTrash"], query["maxResults"]), ("false", "20"))


class FakeGmailUiTests(SimpleTestCase):
    def test_drafts_written_edited_sent_and_discarded_in_gmail(self):
        fake = FakeGmail()
        draft_id = fake.write_draft(gmail_message("d1", labels=["DRAFT"]))
        self.assertEqual(fake.drafts, {draft_id: "d1"})
        fake.edit_draft(draft_id, gmail_message("d2"))
        self.assertEqual((fake.drafts[draft_id], "d1" in fake.messages), ("d2", False))
        self.assertEqual(fake.messages["d2"]["labelIds"], ["DRAFT"])
        fake.send_in_gmail(draft_id)
        self.assertEqual((fake.drafts, fake.messages["d2"]["labelIds"]), ({}, ["SENT"]))
        other = fake.write_draft(gmail_message("d3"))
        fake.discard_in_gmail(other)
        self.assertNotIn("d3", fake.messages)

    def test_an_upload_is_parsed_into_a_stored_message_with_its_files(self):
        fake = FakeGmail()
        raw = mime.build(
            mime.Outgoing(
                from_name="Dana",
                from_address="dana@acme.io",
                to=[["", "ann@pizzahut.com"]],
                subject="Quote",
                text="Attached.",
                attachments=[mime.Part("q.pdf", "application/pdf", b"%PDF-1")],
            )
        )
        answer = fake.upload(
            "POST",
            "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=multipart",
            metadata={},
            payload=raw,
        )
        full = fake.messages[answer["id"]]
        self.assertEqual(full["labelIds"], ["SENT"])
        [part] = [p for p in full["payload"]["parts"] if p.get("filename")]
        self.assertEqual(part["filename"], "q.pdf")
        self.assertEqual(fake.files[part["body"]["attachmentId"]], b"%PDF-1")
        parsed = email.message_from_bytes(raw, policy=policy.default)
        self.assertEqual(fake.uploads[-1][3]["Subject"], parsed["Subject"])
