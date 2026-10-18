"""`draft` on message and thread rows (D3 contract §2), joined at no extra
query; D2's actions skip drafts (decision 13): thread expansion leaves a
live draft's message out, and a message PATCH or a bulk message_ids naming
one is 409 IS_DRAFT. Outlook and IMAP rows carry draft: null."""

from django.db import connection as db
from django.test.utils import CaptureQueriesContext

from services.mail.models import MailDraft, MailMessage, MailOutbox

from .draft_fixtures import URL, DraftFixture

IS_DRAFT = {"code": "IS_DRAFT", "detail": "This message is a draft."}


class RowTests(DraftFixture):
    def test_a_drafts_row_names_its_draft_everywhere(self):
        draft = self.new_draft()
        expected = {"id": draft["id"], "agent": None, "reply_draft_id": None}
        listed = self.client.get(f"{URL}messages/?folder=drafts").data["results"][0]
        self.assertEqual(listed["draft"], expected)
        detail = self.client.get(f"{URL}messages/{draft['message_id']}/").data
        self.assertEqual(detail["draft"], expected)
        thread = self.client.get(f"{URL}messages/{self.quote.pk}/thread/").data
        by_id = {item["id"]: item["draft"] for item in thread["messages"]}
        self.assertEqual((by_id[draft["message_id"]], by_id[self.quote.pk]), (expected, None))
        rows = self.client.get(f"{URL}threads/?folder=drafts").data["results"]
        self.assertEqual(rows[0]["draft"], expected)

    def test_an_agent_drafts_row_names_the_agent(self):
        draft = self.new_draft()
        reply = self.agent_reply(draft["id"])
        listed = self.client.get(f"{URL}messages/?folder=drafts").data["results"][0]
        self.assertEqual(
            listed["draft"], {"id": draft["id"], "agent": "cs", "reply_draft_id": reply.pk}
        )

    def test_a_sent_or_discarded_draft_is_not_named(self):
        draft = self.new_draft()
        for status in ("sent", "discarded"):
            MailDraft.objects.filter(pk=draft["id"]).update(status=status)
            detail = self.client.get(f"{URL}messages/{draft['message_id']}/").data
            self.assertIsNone(detail["draft"])

    def test_the_list_costs_no_more_with_drafts(self):
        self.client.get(f"{URL}messages/?folder=all")
        with CaptureQueriesContext(db) as before:
            self.client.get(f"{URL}messages/?folder=all")
        for _ in range(3):
            self.new_draft()
        with CaptureQueriesContext(db) as after:
            self.client.get(f"{URL}messages/?folder=all")
        self.assertEqual(len(before), len(after))

    def test_the_thread_list_costs_no_more_with_drafts(self):
        self.client.get(f"{URL}threads/?folder=all")
        with CaptureQueriesContext(db) as before:
            self.client.get(f"{URL}threads/?folder=all")
        for _ in range(3):
            self.new_draft()
        with CaptureQueriesContext(db) as after:
            self.client.get(f"{URL}threads/?folder=all")
        self.assertEqual(len(before), len(after))


class ActionTests(DraftFixture):
    def setUp(self):
        super().setUp()
        self.draft = self.new_draft()

    def test_a_patch_on_a_drafts_message_is_refused(self):
        response = self.client.patch(
            f"{URL}messages/{self.draft['message_id']}/", {"is_read": False}, format="json"
        )
        self.assertEqual((response.status_code, response.data), (409, IS_DRAFT))
        self.assertFalse(MailOutbox.objects.exclude(op__startswith="draft_").exists())

    def test_a_thread_patch_leaves_the_draft_alone(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(
                f"{URL}messages/{self.quote.pk}/thread/", {"trashed": True}, format="json"
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(MailMessage.objects.get(pk=self.quote.pk).folder, "trash")
        self.assertEqual(MailMessage.objects.get(pk=self.draft["message_id"]).folder, "drafts")
        self.assertFalse(MailOutbox.objects.filter(message_id=self.draft["message_id"]).exists())

    def test_a_thread_of_only_drafts_is_refused(self):
        alone = self.post_draft({"kind": "new"}).data
        response = self.client.patch(
            f"{URL}messages/{alone['message_id']}/thread/", {"is_read": True}, format="json"
        )
        self.assertEqual((response.status_code, response.data), (409, IS_DRAFT))

    def test_bulk_message_ids_naming_a_draft_is_refused_and_thread_of_skips_it(self):
        response = self.client.post(
            f"{URL}actions/",
            {"op": "star", "message_ids": [self.quote.pk, self.draft["message_id"]]},
            format="json",
        )
        self.assertEqual((response.status_code, response.data), (409, IS_DRAFT))
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                f"{URL}actions/", {"op": "archive", "thread_of": [self.quote.pk]}, format="json"
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["messages"], 1)
        self.assertEqual(MailMessage.objects.get(pk=self.draft["message_id"]).label_ids, ["DRAFT"])
