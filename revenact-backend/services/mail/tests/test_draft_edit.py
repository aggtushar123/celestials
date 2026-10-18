"""PATCH mail/drafts/<id>/ (D3 contract §3, decisions 8, 25, 31): partial
content plus the revision it was edited from; a stale revision is 409
DRAFT_CHANGED with the newest draft; one pending draft row (a pending
create needs nothing, a pending update is made due again, a create in
flight gets a waiting update); the Drafts row changes at once; a record
change is saved without a revision; the record follows the suggestion
until chosen; a linked ReplyDraft follows; a PATCH that changes nothing
queues nothing."""

from unittest.mock import patch

from django.db import connection as db
from django.test.utils import CaptureQueriesContext

from services.accounts.models import Organisation
from services.mail import actions
from services.mail.models import MailboxConnection, MailDraft, MailMessage, MailOutbox

from .draft_fixtures import DraftFixture


class EditTests(DraftFixture):
    def setUp(self):
        super().setUp()
        self.draft = self.new_draft()
        self.pk = self.draft["id"]

    def rows(self):
        return list(
            MailOutbox.objects.filter(draft_id=self.pk).order_by("pk").values_list("op", "status")
        )

    def in_gmail(self):
        MailOutbox.objects.filter(draft_id=self.pk).update(status="sent")
        MailDraft.objects.filter(pk=self.pk).update(gmail_draft_id="r-9", gmail_state="saved")

    def test_an_edit_shows_at_once_and_bumps_the_revision(self):
        response = self.patch_draft(
            self.pk, {"subject": "Re: Terms", "html": "<p>Two years.</p>", "revision": 1}
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            (response.data["revision"], response.data["gmail"]), (2, {"state": "saving"})
        )
        self.assertEqual(
            (response.data["subject"], response.data["text"]), ("Re: Terms", "Two years.")
        )
        row = MailMessage.objects.get(pk=self.draft["message_id"])
        self.assertEqual(
            (row.subject, row.snippet, row.body, row.html_body),
            ("Re: Terms", "Two years.", "Two years.", "<p>Two years.</p>"),
        )
        # The pending create builds from the content at flush time: nothing more.
        self.assertEqual(self.rows(), [("draft_create", "pending")])

    def test_once_gmail_has_it_an_edit_is_one_update_made_due_again(self):
        self.in_gmail()
        self.patch_draft(self.pk, {"subject": "One", "revision": 1})
        first = MailOutbox.objects.get(draft_id=self.pk, status="pending")
        self.patch_draft(self.pk, {"subject": "Two", "revision": 2})
        second = MailOutbox.objects.get(draft_id=self.pk, status="pending")
        self.assertEqual((first.pk, first.op), (second.pk, "draft_update"))
        self.assertNotEqual(first.action_id, second.action_id)

    def test_an_edit_while_the_create_is_in_flight_waits_as_an_update(self):
        MailOutbox.objects.filter(draft_id=self.pk).update(status="sending")
        self.patch_draft(self.pk, {"subject": "Later", "revision": 1})
        self.assertEqual(self.rows(), [("draft_create", "sending"), ("draft_update", "pending")])

    def test_a_stale_revision_is_refused_with_the_newest_draft(self):
        MailDraft.objects.filter(pk=self.pk).update(revision=5, subject="Changed in Gmail")
        response = self.patch_draft(self.pk, {"subject": "Mine", "revision": 1})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            (response.data["code"], response.data["detail"]),
            ("DRAFT_CHANGED", "This draft changed in Gmail. Here is the newest version."),
        )
        self.assertEqual(
            (response.data["draft"]["revision"], response.data["draft"]["subject"]),
            (5, "Changed in Gmail"),
        )
        self.assertEqual(self.stored(self.pk).subject, "Changed in Gmail")

    def test_the_revision_is_required(self):
        response = self.patch_draft(self.pk, {"subject": "Mine"})
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"revision": ["Send the revision you edited."]}),
        )

    def test_nothing_changed_queues_nothing(self):
        self.in_gmail()
        response = self.patch_draft(self.pk, {"subject": self.draft["subject"], "revision": 1})
        self.assertEqual((response.status_code, response.data["revision"]), (200, 1))
        self.assertEqual(self.rows(), [("draft_create", "sent")])

    def test_a_record_change_alone_is_not_sent_to_gmail(self):
        self.in_gmail()
        response = self.patch_draft(self.pk, {"record": None, "revision": 1})
        self.assertEqual(
            (response.data["record"], response.data["record_chosen"], response.data["revision"]),
            (None, True, 1),
        )
        self.assertEqual(self.rows(), [("draft_create", "sent")])

    def test_sent_and_sending_drafts_are_refused(self):
        for state in ("sending", "sent"):
            MailDraft.objects.filter(pk=self.pk).update(status=state)
            response = self.patch_draft(self.pk, {"subject": "x", "revision": 1})
            self.assertEqual(
                (response.status_code, response.data),
                (409, {"code": "ALREADY_SENT", "detail": "This draft has been sent."}),
            )

    def test_only_the_owner_and_never_a_discarded_draft(self):
        self.client.force_authenticate(self.carl)
        self.assertEqual(self.patch_draft(self.pk, {"revision": 1}).status_code, 404)
        self.client.force_authenticate(self.dana)
        MailDraft.objects.filter(pk=self.pk).update(status="discarded")
        self.assertEqual(self.patch_draft(self.pk, {"revision": 1}).status_code, 404)

    def test_the_connection_checks_and_a_pause(self):
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        self.assertEqual(
            self.patch_draft(self.pk, {"subject": "a", "revision": 1}).status_code, 200
        )
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(granted_scopes=[])
        response = self.patch_draft(self.pk, {"subject": "b", "revision": 2})
        self.assertEqual((response.status_code, response.data["code"]), (409, "TWO_WAY_OFF"))
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")
        response = self.patch_draft(self.pk, {"subject": "b", "revision": 2})
        self.assertEqual((response.status_code, response.data["code"]), (409, "NO_MAILBOX"))

    def test_a_disconnect_between_the_read_and_the_lock_refuses_the_patch(self):
        original = actions.lock_connection

        def disconnect_then_lock(conn):
            MailboxConnection.objects.filter(pk=conn.pk).update(status="disconnected")
            return original(conn)

        with patch.object(actions, "lock_connection", side_effect=disconnect_then_lock):
            response = self.patch_draft(self.pk, {"subject": "b", "revision": 1})
        self.assertEqual((response.status_code, response.data["code"]), (409, "NO_MAILBOX"))
        self.assertEqual(self.stored(self.pk).revision, 1)

    def test_a_patch_stays_within_its_ceiling(self):
        self.in_gmail()
        self.patch_draft(self.pk, {"subject": "warm", "revision": 1})
        with CaptureQueriesContext(db) as queries:
            self.patch_draft(
                self.pk,
                {"to": [f"p{n}@pizzahut.com" for n in range(20)], "subject": "x", "revision": 2},
            )
        self.assertLessEqual(len(queries), 18)


class RecordTests(DraftFixture):
    def test_a_new_message_follows_the_suggestion_until_the_person_chooses(self):
        draft = self.post_draft({"kind": "new"}).data
        self.assertIsNone(draft["record"])
        moved = self.patch_draft(draft["id"], {"to": ["x@pizzahut.com"], "revision": 1}).data
        self.assertEqual(moved["record"]["id"], self.pizza.pk)
        chosen = self.patch_draft(
            draft["id"], {"record": {"kind": "account", "id": self.apac.pk}, "revision": 2}
        ).data
        self.assertEqual((chosen["record"]["kind"], chosen["record_chosen"]), ("account", True))
        kept = self.patch_draft(draft["id"], {"to": ["y@else.io"], "revision": 2}).data
        self.assertEqual(kept["record"]["id"], self.apac.pk)

    def test_a_reply_keeps_its_sources_record(self):
        draft = self.new_draft()
        moved = self.patch_draft(draft["id"], {"to": ["y@else.io"], "revision": 1}).data
        self.assertEqual(moved["record"]["id"], self.pizza.pk)


class LinkedTests(DraftFixture):
    def setUp(self):
        super().setUp()
        self.draft = self.new_draft()
        self.reply = self.agent_reply(self.draft["id"])

    def test_recipients_subject_and_text_follow_to_the_agent_draft(self):
        response = self.patch_draft(
            self.draft["id"],
            {
                "to": [["Ann Lee", "ann@pizzahut.com"], "ops@pizzahut.com"],
                "cc": ["sam@pizzahut.com"],
                "subject": "Re: Terms",
                "html": "<p>Two years it is.</p>",
                "revision": 1,
            },
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            (response.data["agent"], response.data["reply_draft_id"]), ("cs", self.reply.pk)
        )
        self.reply.refresh_from_db()
        self.assertEqual(
            (self.reply.to, self.reply.subject, self.reply.body),
            (
                [["Ann Lee", "ann@pizzahut.com"], ["", "ops@pizzahut.com"]],
                "Re: Terms",
                "Two years it is.",
            ),
        )

    def test_an_agent_draft_stays_on_its_record(self):
        response = self.patch_draft(self.draft["id"], {"record": None, "revision": 1})
        self.assertEqual(response.data, {"record": ["An agent draft stays on its record."]})
