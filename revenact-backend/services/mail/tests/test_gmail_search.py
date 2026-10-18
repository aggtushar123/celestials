"""Search older mail in Gmail (D3 contract §6, decision 28): a live
messages.list of the person's own query, spam and trash left out, chats
excluded, 20 a page with one metadata read each, held results naming their
stored copy; nothing stored until a result is opened, and opening stores
only that message (filed as any). The refusals, the pause, a lost grant,
Gmail's 400 and 429; never the query in a log; owner-only; three queries."""

import logging
from datetime import UTC, datetime, timedelta

from django.db import IntegrityError
from django.db import connection as db
from django.test.utils import CaptureQueriesContext

from services.accounts.models import Organisation
from services.mail.models import MailboxConnection, MailDraft, MailMessage

from .draft_fixtures import URL, DraftFixture
from .gmail_fake import gmail_message

SEARCH = f"{URL}gmail/search/"
OPEN = f"{URL}gmail/search/open/"


class SearchFixture(DraftFixture):
    def setUp(self):
        super().setUp()
        long_ago = datetime(2024, 9, 30, 15, 12, tzinfo=UTC)
        self.fake.add(
            gmail_message(
                "old1",
                sender="Ann Lee <ann@pizzahut.com>",
                to="Dana Ruiz <dana@acme.io>",
                subject="2024 renewal",
                text="Attached is last year's quote",
                sent_at=long_ago,
                attachments=[{"filename": "q.pdf", "mime_type": "application/pdf", "size": 9}],
            ),
            quietly=True,
        )
        self.fake.add(gmail_message("junk", subject="renewal offer", labels=["SPAM"]), quietly=True)


class SearchTests(SearchFixture):
    def test_a_page_of_results_with_what_is_already_held(self):
        response = self.client.get(f"{SEARCH}?q=renewal")
        self.assertEqual(response.status_code, 200, response.data)
        results = {item["gmail_id"]: item for item in response.data["results"]}
        self.assertEqual(set(results), {"old1", self.quote.provider_message_id})
        old = results["old1"]
        self.assertEqual(
            old,
            {
                "gmail_id": "old1",
                "thread_id": "old1",
                "subject": "2024 renewal",
                "from": {"name": "Ann Lee", "address": "ann@pizzahut.com"},
                "to": [["Dana Ruiz", "dana@acme.io"]],
                "snippet": "Attached is last year's quote",
                "sent_at": "2024-09-30T15:12:00Z",
                "has_attachments": True,
                "message_id": None,
            },
        )
        self.assertEqual(results[self.quote.provider_message_id]["message_id"], self.quote.pk)
        self.assertIsNone(response.data["next_page_token"])
        self.assertEqual(response.data["result_size_estimate"], 2)
        listed = next(query for _, where, query in self.fake.calls if where.endswith("/messages"))
        self.assertEqual(
            (listed["q"], listed["includeSpamTrash"], listed["maxResults"]),
            ("(renewal) -in:chats", "false", "20"),
        )
        self.assertFalse(MailMessage.objects.filter(provider_message_id="old1").exists())

    def test_the_query_checks(self):
        self.assertEqual(
            self.client.get(f"{SEARCH}?q=%20").data, {"q": ["Type something to search for."]}
        )
        self.assertEqual(
            self.client.get(f"{SEARCH}?q={'x' * 501}").data,
            {"q": ["Keep the search under 500 characters."]},
        )
        self.fake.fail(r"/messages$", 400, "invalidArgument")
        response = self.client.get(f"{SEARCH}?q=from:(")
        self.assertEqual(
            (response.status_code, response.data), (400, {"q": ["Gmail couldn't run that search."]})
        )

    def test_gmail_busy_leaves_the_backoff_alone(self):
        self.fake.fail(r"/messages$", 429, "", retry_after=30)
        response = self.client.get(f"{SEARCH}?q=renewal")
        self.assertEqual((response.status_code, response["Retry-After"]), (503, "30"))
        self.assertIsNone(MailboxConnection.objects.get(pk=self.mailbox.pk).backoff_until)

    def test_a_lost_grant_pauses_the_mailbox(self):
        self.fake.fail(r"/messages$", 403, "insufficientPermissions")
        response = self.client.get(f"{SEARCH}?q=renewal")
        self.assertEqual(
            (response.status_code, response.data["code"], response.data["paused_reason"]),
            (409, "MAILBOX_PAUSED", "token_revoked"),
        )

    def test_the_mailbox_checks(self):
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(paused_reason="no_seat")
        response = self.client.get(f"{SEARCH}?q=renewal")
        self.assertEqual((response.status_code, response.data["code"]), (409, "MAILBOX_PAUSED"))
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(
            paused_reason="", backoff_until=datetime.now(UTC) + timedelta(minutes=2)
        )
        self.assertEqual(self.client.get(f"{SEARCH}?q=renewal").status_code, 503)
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(
            backoff_until=None, granted_scopes=["https://www.googleapis.com/auth/gmail.readonly"]
        )
        self.assertEqual(self.client.get(f"{SEARCH}?q=renewal").status_code, 200)
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")
        self.assertEqual(self.client.get(f"{SEARCH}?q=renewal").data["code"], "NO_MAILBOX")
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(provider="imap")
        self.assertEqual(self.client.get(f"{SEARCH}?q=renewal").data["code"], "GMAIL_ONLY")

    def test_three_queries_whatever_the_page(self):
        for n in range(5):
            self.fake.add(gmail_message(f"r{n}", subject="renewal note"), quietly=True)
        self.client.get(f"{SEARCH}?q=renewal")
        with CaptureQueriesContext(db) as queries:
            self.assertEqual(self.client.get(f"{SEARCH}?q=renewal").status_code, 200)
        self.assertLessEqual(len(queries), 3)

    def test_the_query_is_never_logged(self):
        self.fake.fail(r"/messages$", 503)
        with self.assertLogs("services.mail", level="INFO") as logs:
            self.client.get(f"{SEARCH}?q=secret-codename")
            logging.getLogger("services.mail").info("marker")
        self.assertFalse(any("secret-codename" in line for line in logs.output))


class OpenTests(SearchFixture):
    def test_opening_stores_only_that_message_filed_as_any(self):
        response = self.client.post(OPEN, {"gmail_id": "old1"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        row = MailMessage.objects.get(provider_message_id="old1")
        self.assertEqual((response.data["id"], row.email.customer), (row.pk, self.pizza))
        self.assertEqual(MailMessage.objects.count(), 2)
        again = self.client.post(OPEN, {"gmail_id": "old1"}, format="json")
        self.assertEqual((again.status_code, again.data["id"]), (200, row.pk))

    def test_a_held_message_opens_the_stored_copy(self):
        response = self.client.post(
            OPEN, {"gmail_id": self.quote.provider_message_id}, format="json"
        )
        self.assertEqual((response.status_code, response.data["id"]), (200, self.quote.pk))

    def test_gone_from_gmail_and_the_body_check(self):
        response = self.client.post(OPEN, {"gmail_id": "nope"}, format="json")
        self.assertEqual(
            (response.status_code, response.data),
            (404, {"code": "NOT_IN_GMAIL", "detail": "This message is no longer in Gmail."}),
        )
        self.assertEqual(
            self.client.post(OPEN, {}, format="json").data,
            {"gmail_id": ["Choose a search result."]},
        )

    def test_another_persons_held_id_resolves_only_in_the_callers_mailbox(self):
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=True)
        self.google(self.carl)
        self.client.force_authenticate(self.carl)
        response = self.client.post(
            OPEN, {"gmail_id": self.quote.provider_message_id}, format="json"
        )
        # Carl's own Gmail (the same fake) answers: stored in Carl's mailbox, never Dana's row.
        self.assertEqual(response.status_code, 201, response.data)
        self.assertNotEqual(response.data["id"], self.quote.pk)
        self.assertEqual(MailMessage.objects.get(pk=response.data["id"]).owner, self.carl)


class OpenEdgeTests(SearchFixture):
    def test_a_store_that_loses_the_race_answers_the_winners_row(self):
        from unittest import mock

        from services.mail import draft_sync, gmail_store

        real = gmail_store.store_gmail

        def winner_lands_first(connection, ids, now):
            full = self.fake.messages["old1"]
            real(connection, full, now=now)
            return set()

        def loses(connection, full, *, now):
            raise IntegrityError("mail_message_once_per_mailbox")

        with (
            mock.patch.object(draft_sync, "own_messages", winner_lands_first),
            mock.patch.object(gmail_store, "store_gmail", loses),
        ):
            response = self.client.post(OPEN, {"gmail_id": "old1"}, format="json")
        row = MailMessage.objects.get(provider_message_id="old1")
        self.assertEqual((response.status_code, response.data["id"]), (200, row.pk))

    def test_a_live_drafts_message_opens_the_drafts_row(self):
        self.fake.add(gmail_message("dmsg", subject="my draft", labels=["DRAFT"]), quietly=True)
        draft = MailDraft.objects.get(pk=self.new_draft()["id"])
        MailDraft.objects.filter(pk=draft.pk).update(gmail_message_id="dmsg")
        before = MailMessage.objects.count()
        response = self.client.post(OPEN, {"gmail_id": "dmsg"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["id"], draft.message_id)
        self.assertEqual(MailMessage.objects.count(), before)

    def test_open_under_gmail_busy_a_lost_grant_and_a_pause(self):
        self.fake.fail(r"/messages/old1$", 429, "", retry_after=30)
        response = self.client.post(OPEN, {"gmail_id": "old1"}, format="json")
        self.assertEqual((response.status_code, response["Retry-After"]), (503, "30"))
        self.assertIsNone(MailboxConnection.objects.get(pk=self.mailbox.pk).backoff_until)
        self.fake.fail(r"/messages/old1$", 403, "insufficientPermissions")
        response = self.client.post(OPEN, {"gmail_id": "old1"}, format="json")
        self.assertEqual(
            (response.status_code, response.data["paused_reason"]), (409, "token_revoked")
        )
        response = self.client.post(OPEN, {"gmail_id": "old1"}, format="json")
        self.assertEqual((response.status_code, response.data["code"]), (409, "MAILBOX_PAUSED"))
