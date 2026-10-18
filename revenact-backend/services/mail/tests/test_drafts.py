"""POST and GET mail/drafts/ (D3 contract §2, §3): a draft is made with its
Drafts row (a placeholder) and one draft_create row at once, the content
left out taken from the prefill; recipients cleaned and de-duplicated; HTML
sanitised and the text derived; the record checked; the connection checks
(paused allowed); owner-only reads; six queries for a read."""

import uuid
from datetime import timedelta
from unittest.mock import patch

from django.db import connection as db
from django.test import override_settings
from django.test.utils import CaptureQueriesContext

from services.accounts.models import Organisation
from services.customers.models import Customer
from services.mail import actions
from services.mail.models import (
    MailAttachment,
    MailboxConnection,
    MailDraft,
    MailMessage,
    MailOutbox,
)

from .draft_fixtures import SIGNATURE, URL, DraftFixture

SIGNED = f"<p></p><div data-revenact-signature>{SIGNATURE}</div>"


class CreateTests(DraftFixture):
    def test_a_reply_from_the_prefill_shows_in_drafts_and_its_thread_at_once(self):
        data = self.new_draft()
        draft = self.stored(data["id"])
        self.assertEqual(
            (data["kind"], data["status"], data["sending"], data["revision"]),
            ("reply", "open", None, 1),
        )
        self.assertEqual(data["gmail"], {"state": "saving"})
        self.assertEqual(data["to"], [["Ann Lee", "ann@pizzahut.com"]])
        self.assertEqual(data["subject"], "Re: Renewal quote")
        self.assertTrue(data["html"].startswith(SIGNED.replace("signature>", 'signature="">')))
        self.assertIn("-- \nDana Ruiz\nAcme", data["text"])
        self.assertEqual(data["thread_id"], self.quote.thread_id)
        self.assertEqual(data["source"]["message_id"], self.quote.pk)
        self.assertEqual(data["source"]["from"], {"name": "Ann Lee", "address": "ann@pizzahut.com"})
        self.assertEqual(data["from"], {"name": "Dana Ruiz", "address": "dana@acme.io"})
        pizza = {"kind": "customer", "id": self.pizza.pk, "name": "Pizza Hut"}
        self.assertEqual((data["record"], data["suggested_record"]), (pizza, pizza))
        self.assertFalse(data["record_chosen"])
        self.assertEqual(data["attachments"], [])
        self.assertEqual(data["total_bytes"], len(draft.html.encode()) + len(draft.text.encode()))
        self.assertEqual(data["max_bytes"], 26_214_400)
        self.assertEqual(
            (data["sync_issue"], data["agent"], data["reply_draft_id"], data["can_resolve"]),
            (None, None, None, False),
        )
        row = MailMessage.objects.get(pk=data["message_id"])
        self.assertEqual(row.provider_message_id, f"pending-draft:{draft.pk}")
        self.assertEqual((row.label_ids, row.folder), (["DRAFT"], "drafts"))
        self.assertEqual((row.thread_id, row.subject), (self.quote.thread_id, "Re: Renewal quote"))
        self.assertEqual(row.to, [["Ann Lee", "ann@pizzahut.com"]])
        listed = self.client.get(f"{URL}messages/?folder=drafts").data
        self.assertEqual([item["id"] for item in listed["results"]], [row.pk])
        thread = self.client.get(f"{URL}messages/{self.quote.pk}/thread/").data
        self.assertIn(row.pk, [item["id"] for item in thread["messages"]])
        self.assertEqual(
            list(MailOutbox.objects.values_list("op", "status", "draft_id")),
            [("draft_create", "pending", draft.pk)],
        )
        self.mailbox.refresh_from_db()
        self.assertIsNotNone(self.mailbox.wake_at)

    def test_html_is_sanitised_and_the_text_derived_from_it(self):
        data = self.new_draft(html="<p>Works for us.</p><script>alert(1)</script>")
        self.assertEqual((data["html"], data["text"]), ("<p>Works for us.</p>", "Works for us."))

    def test_a_new_message_cleans_its_recipients_and_follows_the_suggestion(self):
        response = self.post_draft(
            {
                "kind": "new",
                "to": ["Ann <ANN@pizzahut.com>"],
                "cc": [["Sam", "sam@pizzahut.com"], "ann@pizzahut.com"],
                "bcc": ["carl@acme.io"],
                "subject": "Hello",
            }
        )
        self.assertEqual(response.status_code, 201, response.data)
        data = response.data
        self.assertEqual(data["to"], [["Ann", "ann@pizzahut.com"]])
        self.assertEqual(data["cc"], [["Sam", "sam@pizzahut.com"]])
        self.assertEqual(data["bcc"], [["", "carl@acme.io"]])
        self.assertEqual((data["thread_id"], data["source"]), ("", None))
        self.assertEqual(data["record"]["id"], self.pizza.pk)
        self.assertFalse(data["record_chosen"])

    def test_a_forward_keeps_the_originals_files(self):
        response = self.post_draft({"kind": "forward", "source_message_id": self.quote.pk})
        self.assertEqual(response.status_code, 201, response.data)
        [pdf] = response.data["attachments"]
        self.assertEqual((pdf["filename"], pdf["origin"]), ("Renewal quote.pdf", "forward"))
        self.assertGreater(response.data["total_bytes"], 182311)

    def test_a_cleared_record_is_chosen(self):
        data = self.new_draft(record=None)
        self.assertEqual((data["record"], data["record_chosen"]), (None, True))

    def test_a_paused_mailbox_still_takes_drafts(self):
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        self.assertEqual(
            self.post_draft({"kind": "reply", "source_message_id": self.quote.pk}).status_code,
            201,
        )


class CreateRefusalTests(DraftFixture):
    def answer(self, body):
        return self.post_draft(body)

    def test_the_kind_and_the_source(self):
        response = self.answer({"kind": "memo"})
        self.assertEqual(response.data, {"kind": ["Choose new, reply, reply_all or forward."]})
        response = self.answer({"kind": "reply"})
        self.assertEqual(response.data, {"source_message_id": ["Choose a message to answer."]})
        self.client.force_authenticate(self.carl)
        self.assertEqual(
            self.answer({"kind": "reply", "source_message_id": self.quote.pk}).status_code, 404
        )

    def test_field_errors(self):
        base = {"kind": "reply", "source_message_id": self.quote.pk}
        response = self.answer({**base, "to": ["not an address"]})
        self.assertEqual(
            (response.status_code, response.data), (400, {"to": ["Enter a valid email address."]})
        )
        response = self.answer({**base, "forwarded": [MailAttachment.objects.first().pk]})
        self.assertEqual(
            response.data, {"forwarded": ["Choose files from the message you are forwarding."]}
        )
        other = Organisation.objects.create(name="Elsewhere")
        hidden = Customer.objects.create(organisation=other, name="Hidden", domain="hidden.io")
        response = self.answer({**base, "record": {"kind": "customer", "id": hidden.pk}})
        self.assertEqual(response.data, {"record": ["Choose a record you can open."]})
        self.assertFalse(MailDraft.objects.exists())

    @override_settings(MAIL_SEND_MAX_RECIPIENTS=2, MAIL_HTML_MAX_BYTES=40)
    def test_the_limits(self):
        base = {"kind": "new"}
        response = self.answer({**base, "to": ["a@x.io", "b@x.io"], "cc": ["c@x.io"]})
        self.assertEqual(
            response.data, {"non_field_errors": ["A message can go to at most 2 people."]}
        )
        response = self.answer({**base, "html": "<p>" + "x" * 60 + "</p>"})
        self.assertEqual(response.data, {"html": ["This message is too long."]})

    def test_a_drafts_message_and_the_connection_checks(self):
        draft = self.new_draft()
        response = self.answer({"kind": "reply", "source_message_id": draft["message_id"]})
        self.assertEqual((response.status_code, response.data["code"]), (409, "IS_DRAFT"))
        self.mailbox.granted_scopes = []
        self.mailbox.save(update_fields=["granted_scopes"])
        response = self.answer({"kind": "new"})
        self.assertEqual((response.status_code, response.data["code"]), (409, "TWO_WAY_OFF"))

    def test_a_disconnect_between_the_read_and_the_lock_refuses_the_create(self):
        original = actions.lock_connection

        def disconnect_then_lock(conn):
            MailboxConnection.objects.filter(pk=conn.pk).update(status="disconnected")
            return original(conn)

        with patch.object(actions, "lock_connection", side_effect=disconnect_then_lock):
            response = self.answer({"kind": "new"})
        self.assertEqual((response.status_code, response.data["code"]), (409, "NO_MAILBOX"))
        self.assertFalse(MailDraft.objects.exists())


class ReadTests(DraftFixture):
    def test_the_owner_reads_it_and_nobody_else_does(self):
        draft = self.new_draft()
        self.assertEqual(self.client.get(f"{URL}drafts/{draft['id']}/").data["id"], draft["id"])
        for someone in (self.carl, self.alice, self.priya):
            self.client.force_authenticate(someone)
            self.assertEqual(self.client.get(f"{URL}drafts/{draft['id']}/").status_code, 404)

    def test_a_discarded_draft_is_missing(self):
        draft = self.new_draft()
        MailDraft.objects.filter(pk=draft["id"]).update(status="discarded")
        self.assertEqual(self.client.get(f"{URL}drafts/{draft['id']}/").status_code, 404)

    def test_six_queries_for_a_read(self):
        draft = self.new_draft(to=[f"p{n}@pizzahut.com" for n in range(20)])
        url = f"{URL}drafts/{draft['id']}/"
        self.client.get(url)
        with CaptureQueriesContext(db) as queries:
            self.assertEqual(self.client.get(url).status_code, 200)
        self.assertLessEqual(len(queries), 6)

    def test_a_create_stays_within_its_ceiling(self):
        # Measured 20: the prefill and the recipients' record match each run once (contract gap).
        self.new_draft()
        with CaptureQueriesContext(db) as queries:
            self.new_draft(to=[f"p{n}@pizzahut.com" for n in range(20)])
        self.assertLessEqual(len(queries), 20)


class SyncIssueTests(DraftFixture):
    def row(self, draft_id, status, **fields):
        return MailOutbox.objects.create(
            connection=self.mailbox,
            action_id=uuid.uuid4(),
            op="draft_update",
            draft_id=draft_id,
            status=status,
            next_attempt_at=self.now,
            **fields,
        )

    def test_the_newest_failed_row_shows_and_a_later_live_row_clears_it(self):
        draft = self.new_draft()
        MailOutbox.objects.all().delete()
        failed = self.row(draft["id"], "failed", reason="refused", failed_at=self.now)
        issue = self.client.get(f"{URL}drafts/{draft['id']}/").data["sync_issue"]
        self.assertEqual(
            issue["text"], "Couldn't save the draft in Gmail: Gmail refused the change."
        )
        self.assertIn("at", issue)
        self.row(draft["id"], "pending")
        MailOutbox.objects.filter(pk=failed.pk).update(created_at=self.now - timedelta(hours=1))
        self.assertIsNone(self.client.get(f"{URL}drafts/{draft['id']}/").data["sync_issue"])
