"""Discarding a draft (D3 contract §3, decisions 11, 12): the Drafts row goes
at once and nothing else is touched; a draft Gmail never had goes with its
pending create, and nothing reaches Gmail; one Gmail holds, or whose create
is in flight, leaves one draft_delete (pending updates collapse into it); a
linked ReplyDraft is deleted and audited; bulk is all or nothing; the query
count does not grow with the number of drafts."""

from django.db import connection as db
from django.test.utils import CaptureQueriesContext

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.customers.models import ReplyDraft
from services.mail.models import MailboxConnection, MailDraft, MailMessage, MailOutbox

from .draft_fixtures import URL, DraftFixture


class DiscardFixture(DraftFixture):
    def delete(self, pk):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.delete(f"{URL}drafts/{pk}/")

    def bulk(self, ids):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(f"{URL}drafts/discard/", {"ids": ids}, format="json")

    def in_gmail(self, pk, gmail_id):
        MailOutbox.objects.filter(draft_id=pk).update(status="sent")
        MailDraft.objects.filter(pk=pk).update(gmail_draft_id=gmail_id, gmail_state="saved")


class DiscardTests(DiscardFixture):
    def test_a_draft_gmail_never_had_goes_with_nothing_sent(self):
        draft = self.new_draft()
        self.assertEqual(self.delete(draft["id"]).status_code, 204)
        self.assertFalse(MailDraft.objects.exists())
        self.assertFalse(MailOutbox.objects.exists())
        self.assertFalse(MailMessage.objects.filter(pk=draft["message_id"]).exists())
        self.assertTrue(MailMessage.objects.filter(pk=self.quote.pk).exists())

    def test_a_draft_gmail_holds_leaves_one_delete_with_its_id(self):
        draft = self.new_draft()
        self.in_gmail(draft["id"], "r-7")
        self.patch_draft(draft["id"], {"subject": "x", "revision": 1})
        self.assertEqual(self.delete(draft["id"]).status_code, 204)
        stored = self.stored(draft["id"])
        self.assertEqual((stored.status, stored.message_id), ("discarded", None))
        self.assertEqual(
            list(MailOutbox.objects.filter(status="pending").values_list("op", "payload")),
            [("draft_delete", {"gmail_draft_id": "r-7"})],
        )
        self.assertFalse(MailMessage.objects.filter(pk=draft["message_id"]).exists())
        self.assertEqual(self.client.get(f"{URL}drafts/{draft['id']}/").status_code, 404)
        self.mailbox.refresh_from_db()
        self.assertIsNotNone(self.mailbox.wake_at)

    def test_a_create_in_flight_leaves_a_delete_that_waits_for_its_id(self):
        draft = self.new_draft()
        MailOutbox.objects.filter(draft_id=draft["id"]).update(status="sending")
        self.delete(draft["id"])
        self.assertEqual(self.stored(draft["id"]).status, "discarded")
        self.assertEqual(
            list(MailOutbox.objects.filter(status="pending").values_list("op", "payload")),
            [("draft_delete", {})],
        )

    def test_a_linked_agent_draft_goes_too_audited(self):
        draft = self.new_draft()
        reply = self.agent_reply(draft["id"])
        self.in_gmail(draft["id"], "r-8")
        self.delete(draft["id"])
        self.assertFalse(ReplyDraft.objects.exists())
        self.assertEqual(self.stored(draft["id"]).reply_draft_id, None)
        event = AuditEvent.objects.get(action="reply_draft.discarded")
        self.assertEqual((event.actor, event.target_id), (self.dana, str(reply.pk)))

    def test_the_refusals(self):
        draft = self.new_draft()
        self.client.force_authenticate(self.carl)
        self.assertEqual(self.delete(draft["id"]).status_code, 404)
        self.client.force_authenticate(self.dana)
        MailDraft.objects.filter(pk=draft["id"]).update(status="sending")
        response = self.delete(draft["id"])
        self.assertEqual((response.status_code, response.data["code"]), (409, "ALREADY_SENT"))

    def test_disconnected_refuses_only_a_draft_gmail_holds_and_paused_waits(self):
        local, held = self.new_draft(), self.new_draft(kind="new")
        self.in_gmail(held["id"], "r-9")
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")
        response = self.delete(held["id"])
        self.assertEqual((response.status_code, response.data["code"]), (409, "NO_MAILBOX"))
        self.assertEqual(self.delete(local["id"]).status_code, 204)


class BulkTests(DiscardFixture):
    def test_all_or_nothing(self):
        mine = [self.new_draft()["id"] for _ in range(2)]
        response = self.bulk([*mine, 999_999])
        self.assertEqual(response.status_code, 404)
        self.assertEqual(MailDraft.objects.filter(status="open").count(), 2)
        response = self.bulk(mine)
        self.assertEqual((response.status_code, response.data), (200, {"discarded": 2}))
        self.assertFalse(MailDraft.objects.exists())

    def test_someone_elses_or_a_sent_draft_fails_the_whole_request(self):
        mine = self.new_draft()["id"]
        sent = self.new_draft()["id"]
        MailDraft.objects.filter(pk=sent).update(status="sent")
        self.assertEqual(self.bulk([mine, sent]).status_code, 404)
        self.client.force_authenticate(self.carl)
        self.assertEqual(self.bulk([mine]).status_code, 404)

    def test_the_body(self):
        self.assertEqual(self.bulk([]).status_code, 400)
        self.assertEqual(self.bulk(list(range(1, 102))).status_code, 400)

    def test_the_cost_does_not_grow_with_the_drafts(self):
        one = [self.new_draft()["id"]]
        three = [self.new_draft()["id"] for _ in range(3)]
        for pk in [*one, *three]:
            self.in_gmail(pk, f"r-{pk}")
        with CaptureQueriesContext(db) as single:
            self.bulk(one)
        with CaptureQueriesContext(db) as several:
            self.bulk(three)
        self.assertEqual(len(single), len(several))
        self.assertLessEqual(len(several), 20)


class TwoMailboxBulkTests(DiscardFixture):
    def second_mailbox_draft(self, **fields):
        """A draft of Dana's moved onto a second mailbox (a user has one, so
        Alice's stands in); the lock and refusal logic only sees the mailbox."""
        other = getattr(self, "other", None) or self.google(self.alice, **fields)
        self.other = other
        draft = self.new_draft(kind="new")["id"]
        MailDraft.objects.filter(pk=draft).update(connection=other)
        return draft, other

    def test_each_mailbox_gets_its_delete_and_its_wake(self):
        first = self.new_draft()["id"]
        self.in_gmail(first, "r-1")
        second, other = self.second_mailbox_draft()
        self.in_gmail(second, "r-2")
        self.assertEqual(self.bulk([first, second]).data, {"discarded": 2})
        deletes = MailOutbox.objects.filter(op="draft_delete", status="pending")
        self.assertEqual(
            {(row.connection_id, row.draft_id) for row in deletes},
            {(self.mailbox.pk, first), (other.pk, second)},
        )
        for connection in (self.mailbox, other):
            connection.refresh_from_db()
            self.assertIsNotNone(connection.wake_at)

    def test_one_refused_mailbox_refuses_the_whole_request(self):
        first = self.new_draft()["id"]
        second, other = self.second_mailbox_draft()
        self.in_gmail(second, "r-3")
        MailboxConnection.objects.filter(pk=other.pk).update(status="disconnected")
        response = self.bulk([first, second])
        self.assertEqual((response.status_code, response.data["code"]), (409, "NO_MAILBOX"))
        self.assertEqual(MailDraft.objects.filter(status="open").count(), 2)

    def test_a_disconnected_mailbox_with_only_local_drafts_does_not_refuse(self):
        first = self.new_draft()["id"]
        second, other = self.second_mailbox_draft()
        MailboxConnection.objects.filter(pk=other.pk).update(status="disconnected")
        self.assertEqual(self.bulk([first, second]).data, {"discarded": 2})
