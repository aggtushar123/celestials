"""The Gmail HTTP layer: error reasons and Retry-After, the narrowed token
refresh, the session's one retry on 401, revoke, the new consent scopes, and
an exchange that no longer reads the mailbox."""

import base64
import io
import json
import urllib.error
from email.message import Message as Headers
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.test import SimpleTestCase, override_settings

from services.mail import scopes
from services.mail.providers.base import Credentials, ProviderError, http_json
from services.mail.providers.google import GmailSession, GoogleProvider, revoke

from .gmail_fake import FakeGmail, fixture, gmail_message
from .test_unanswered import EXPIRED, URLOPEN

FRESH = Credentials(
    address="dana@acme.io",
    data={"access_token": "fake-a", "refresh_token": "fake-r", "expires_at": 9e12},
)


def http_error(status, body, retry_after=None):
    headers = Headers()
    if retry_after is not None:
        headers["Retry-After"] = str(retry_after)
    raw = body if isinstance(body, bytes) else json.dumps(body).encode()
    return urllib.error.HTTPError(
        "https://gmail.googleapis.com/x", status, "error", headers, io.BytesIO(raw)
    )


class ErrorReasonTests(SimpleTestCase):
    def call(self, error):
        with patch(URLOPEN, side_effect=error), self.assertRaises(ProviderError) as caught:
            http_json("GET", "https://gmail.googleapis.com/gmail/v1/users/me/profile")
        return caught.exception

    def test_a_rate_limit_is_not_a_lost_grant_and_keeps_retry_after(self):
        e = self.call(http_error(403, fixture("error_rate_limited.json"), retry_after=120))
        self.assertEqual(
            (e.status, e.reason, e.retry_after, e.reauth), (403, "rateLimitExceeded", 120, False)
        )

    def test_a_missing_permission_is_named(self):
        e = self.call(http_error(403, fixture("error_insufficient_permissions.json")))
        self.assertEqual((e.status, e.reason, e.reauth), (403, "insufficientPermissions", True))

    def test_oauth_errors_name_their_reason(self):
        e = self.call(http_error(400, fixture("error_invalid_grant.json")))
        self.assertEqual((e.status, e.reason, e.retry_after), (400, "invalid_grant", None))

    def test_a_body_that_is_not_json_has_no_reason(self):
        e = self.call(http_error(502, b"<html>bad gateway</html>"))
        self.assertEqual((e.status, e.reason, e.reauth), (502, "", False))


class RefreshTests(SimpleTestCase):
    def refresh(self, fake, creds=EXPIRED, **kw):
        with patch("services.mail.providers.google.http_json", fake):
            return GoogleProvider()._fresh(creds, **kw)

    def test_invalid_grant_is_a_lost_grant(self):
        fake = FakeGmail()
        fake.refresh_reason = "invalid_grant"
        with self.assertRaises(ProviderError) as caught:
            self.refresh(fake)
        self.assertEqual(
            (caught.exception.reauth, caught.exception.reason), (True, "invalid_grant")
        )

    def test_a_token_endpoint_outage_is_not(self):
        fake = FakeGmail()
        fake.fail(r"^/token$", 503)
        with self.assertRaises(ProviderError) as caught:
            self.refresh(fake)
        self.assertEqual((caught.exception.reauth, caught.exception.status), (False, 503))

    def test_force_refreshes_a_token_that_has_not_expired(self):
        creds = self.refresh(FakeGmail(), FRESH, force=True)
        self.assertTrue(creds.data["access_token"].startswith("fake-access-"))
        self.assertEqual(creds.data["refresh_token"], "fake-r")


class SessionTests(SimpleTestCase):
    def setUp(self):
        self.fake = FakeGmail()
        patcher = patch("services.mail.providers.google.http_json", self.fake)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_one_401_refreshes_the_token_and_retries(self):
        self.fake.fail(r"/profile$", 401)
        session = GmailSession(FRESH)
        self.assertEqual(session.profile()["emailAddress"], "dana@acme.io")
        self.assertNotEqual(session.creds.data["access_token"], "fake-a")

    def test_a_second_401_is_raised(self):
        self.fake.fail(r"/profile$", 401, times=2)
        with self.assertRaises(ProviderError) as caught:
            GmailSession(FRESH).profile()
        self.assertEqual(caught.exception.status, 401)

    def test_a_network_failure_is_a_provider_error_without_a_status(self):
        with (
            patch(
                "services.mail.providers.google.http_json", side_effect=TimeoutError("timed out")
            ),
            self.assertRaises(ProviderError) as caught,
        ):
            GmailSession(FRESH).labels()
        self.assertIsNone(caught.exception.status)

    def test_a_message_gmail_no_longer_has_is_none(self):
        self.assertIsNone(GmailSession(FRESH).get_message("gone"))

    def test_history_asks_for_the_four_kinds_of_change(self):
        GmailSession(FRESH).history(5, "2")
        _, where, query = self.fake.calls[-1]
        self.assertEqual(where, "gmail.googleapis.com/gmail/v1/users/me/history")
        self.assertEqual(
            query["historyTypes"],
            ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"],
        )
        self.assertEqual((query["startHistoryId"], query["pageToken"]), ("5", "2"))

    def test_listing_includes_spam_and_trash(self):
        GmailSession(FRESH).list_messages("after:1 -in:chats", max_results=7)
        _, _, query = self.fake.calls[-1]
        self.assertEqual(
            (query["q"], query["maxResults"], query["includeSpamTrash"]),
            ("after:1 -in:chats", "7", "true"),
        )

    def test_revoke_posts_the_token_and_reports_a_failure(self):
        self.assertTrue(revoke("fake-r"))
        self.assertEqual(self.fake.revoked, ["fake-r"])
        self.fake.fail(r"^/revoke$", 400, "invalid_token")
        self.assertFalse(revoke("fake-r"))
        self.assertFalse(revoke(""))


@override_settings(GOOGLE_OAUTH_CLIENT_ID="cid", GOOGLE_OAUTH_CLIENT_SECRET="sec")
class ConsentTests(SimpleTestCase):
    def test_the_consent_screen_asks_for_modify_send_and_compose(self):
        url = GoogleProvider().authorize_url("state", "https://api.test/cb/")
        query = parse_qs(urlsplit(url).query)
        self.assertEqual(query["scope"][0].split(), list(scopes.REQUESTED))
        self.assertNotIn("gmail.readonly", query["scope"][0])
        self.assertEqual((query["access_type"][0], query["prompt"][0]), ("offline", "consent"))

    def test_the_exchange_returns_the_grant_without_reading_the_mailbox(self):
        fake = FakeGmail()
        fake.granted_scope = f"{scopes.MODIFY} openid"
        with patch("services.mail.providers.google.http_json", fake):
            creds = GoogleProvider().exchange_code("code", "https://api.test/cb/")
        self.assertEqual((creds.scopes, creds.address), ([scopes.MODIFY, "openid"], ""))
        self.assertEqual(creds.data["refresh_token"], "fake-refresh")
        self.assertEqual([where for _, where, _ in fake.calls], ["oauth2.googleapis.com/token"])


class WriteCallTests(SimpleTestCase):
    """The calls D2's outbox and attachment route make, against the fake."""

    def setUp(self):
        self.fake = FakeGmail()
        self.fake.add(gmail_message("m1"), quietly=True)
        self.fake.add(gmail_message("m2"), quietly=True)
        patcher = patch("services.mail.providers.google.http_json", self.fake)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.session = GmailSession(FRESH)

    def labels(self, message_id):
        return self.fake.messages[message_id]["labelIds"]

    def test_batch_modify_changes_every_id_and_gmail_records_it(self):
        self.assertEqual(self.session.batch_modify(["m1", "m2"], ["STARRED"], ["UNREAD"]), {})
        self.assertEqual((self.labels("m1"), self.labels("m2")), (["INBOX", "STARRED"],) * 2)
        self.assertEqual(
            self.fake.writes[-1],
            (
                "/messages/batchModify",
                {"ids": ["m1", "m2"], "addLabelIds": ["STARRED"], "removeLabelIds": ["UNREAD"]},
            ),
        )
        # A labelsAdded and a labelsRemoved record per message, as Gmail's history has.
        self.assertEqual(len(self.fake.records), 4)

    def test_a_batch_with_an_unknown_id_or_label_changes_nothing(self):
        with self.assertRaises(ProviderError) as caught:
            self.session.batch_modify(["m1", "gone"], ["STARRED"], [])
        self.assertEqual(caught.exception.status, 404)
        with self.assertRaises(ProviderError) as caught:
            self.session.batch_modify(["m1"], ["Label_99"], [])
        self.assertEqual(caught.exception.status, 400)
        self.assertIn("Invalid label", str(caught.exception))
        self.assertEqual(self.labels("m1"), ["INBOX", "UNREAD"])

    def test_modify_trash_and_untrash_one_message(self):
        self.session.modify("m1", [], ["INBOX"])
        self.assertEqual(self.labels("m1"), ["UNREAD"])
        self.session.trash("m2")
        self.assertIn("TRASH", self.labels("m2"))
        self.session.untrash("m2")
        self.assertNotIn("TRASH", self.labels("m2"))
        with self.assertRaises(ProviderError) as caught:
            self.session.trash("gone")
        self.assertEqual(caught.exception.status, 404)

    def test_create_label_and_a_name_gmail_already_has(self):
        made = self.session.create_label("Pilot")
        self.assertEqual((made["name"], made["type"]), ("Pilot", "user"))
        self.assertTrue(made["id"].startswith("Label_"))
        self.assertEqual(
            self.fake.writes[-1],
            (
                "/labels",
                {
                    "name": "Pilot",
                    "labelListVisibility": "labelShow",
                    "messageListVisibility": "show",
                },
            ),
        )
        with self.assertRaises(ProviderError) as caught:
            self.session.create_label("renewals")  # Gmail's "Renewals"
        self.assertEqual(caught.exception.status, 409)

    def test_an_attachment_is_read_by_its_current_id(self):
        pdf = {"filename": "q.pdf", "mime_type": "application/pdf", "size": 10}
        self.fake.add(gmail_message("m3", attachments=[pdf]), quietly=True)
        self.fake.attach_file("m3", "1", b"%PDF-1.4 quote")
        current = self.session.get_message("m3")["payload"]["parts"][1]["body"]["attachmentId"]
        body = self.session.attachment("m3", current)
        self.assertEqual(base64.urlsafe_b64decode(body["data"] + "=="), b"%PDF-1.4 quote")
        self.assertIsNone(self.session.attachment("m3", "ANGjdJm31"))  # the rotated-away id
