"""An agent draft that is also a Gmail draft (D3 contract §3 "ReplyDraft
changes", decisions 3, 4, 31): made with the applied draft when its source
is in the owner's own two-way, live, unpaused Google mailbox; only the owner
sees mail_draft_id; a Communications edit, delete, send, confirm-sent or
reopen acts on both rows; undo discards both."""

from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.agents.actions import drafts as kinds
from services.agents.tests.drafts_fixtures import draft_action, share
from services.customers.models import Customer, Email, ReplyDraft
from services.mail import sending
from services.mail.models import MailboxConnection, MailDraft, MailOutbox
from services.mail.tests.draft_fixtures import DraftFixture

URL = "/api/v1/communications/drafts/"


class LinkedFixture(DraftFixture):
    def setUp(self):
        super().setUp()
        # The record's owner drafts it: make Dana own Pizza Hut.
        Customer.objects.filter(pk=self.pizza.pk).update(owner=self.dana)
        self.source = Email.objects.get(pk=self.filed.pk)

    def applied(self):
        action = draft_action(self.org, self.source, body="Hi Ann, yes: two years works.")
        action.after, action.result = kinds.REPLY.apply(action, self.dana)
        action.save(update_fields=["after", "result"])
        return action, ReplyDraft.objects.get(pk=action.result["draft_id"])


class LinkTests(LinkedFixture):
    def test_an_applied_draft_is_also_a_gmail_draft(self):
        _, reply = self.applied()
        linked = MailDraft.objects.get(reply_draft=reply)
        self.assertEqual(
            (linked.kind, linked.source_id, linked.customer_id, linked.record_chosen),
            ("reply", self.quote.pk, self.pizza.pk, True),
        )
        self.assertTrue(
            linked.html.startswith(
                '<p>Hi Ann, yes: two years works.</p><div data-revenact-signature="">'
            )
        )
        self.assertEqual(
            list(MailOutbox.objects.values_list("op", "status")), [("draft_create", "pending")]
        )
        reply.refresh_from_db()
        self.assertFalse(reply.edited)
        data = self.client.get(f"{URL}{reply.pk}/").data
        self.assertEqual(data["mail_draft_id"], linked.pk)
        self.client.force_authenticate(self.carl)
        # Mail is owner-only (2026-10-17): Dana's manager doesn't read the draft...
        self.assertEqual(self.client.get(f"{URL}{reply.pk}/").status_code, 404)
        # ...nor once she adds the email to Revenact: her unsent reply stays hers.
        share(self.filed)
        self.assertEqual(self.client.get(f"{URL}{reply.pk}/").status_code, 404)

    def test_no_gmail_draft_for_a_read_only_or_paused_mailbox(self):
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(granted_scopes=[])
        action, reply = self.applied()
        self.assertFalse(MailDraft.objects.exists())
        self.assertIsNone(self.client.get(f"{URL}{reply.pk}/").data["mail_draft_id"])
        # One open action per source: the next one answers the same email.
        reply.delete()
        action.delete()
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(
            granted_scopes=self.mailbox.granted_scopes
        )
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        self.applied()
        self.assertFalse(MailDraft.objects.exists())

    def test_undo_discards_both(self):
        action, reply = self.applied()
        kinds.REPLY.undo(action, self.dana)
        self.assertFalse(ReplyDraft.objects.exists())
        self.assertFalse(MailDraft.objects.exists())


class CommunicationsTests(LinkedFixture):
    def test_an_edit_rewrites_the_gmail_draft_keeping_the_signature(self):
        _, reply = self.applied()
        linked = MailDraft.objects.get(reply_draft=reply)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(
                f"{URL}{reply.pk}/",
                {"body": "Two years.\n\nThanks,\nDana\n-- \nold signature"},
                format="json",
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["body"], "Two years.\n\nThanks,\nDana\n-- \nold signature")
        linked.refresh_from_db()
        self.assertEqual(linked.revision, 2)
        self.assertTrue(
            linked.html.startswith(
                '<p>Two years.</p><p>Thanks,<br>Dana</p><div data-revenact-signature="">'
            )
        )
        self.assertNotIn("old signature", linked.html)

    def test_a_delete_discards_the_gmail_draft(self):
        _, reply = self.applied()
        self.tick()
        linked = MailDraft.objects.get(reply_draft=reply)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.client.delete(f"{URL}{reply.pk}/").status_code, 204)
        linked.refresh_from_db()
        self.assertEqual((linked.status, linked.reply_draft_id), ("discarded", None))
        self.assertEqual(
            list(MailOutbox.objects.filter(status="pending").values_list("op", flat=True)),
            ["draft_delete"],
        )
        self.assertEqual(AuditEvent.objects.filter(action="reply_draft.discarded").count(), 1)

    def test_a_send_goes_through_gmail_and_settles_both(self):
        _, reply = self.applied()
        self.tick()
        response = self.client.post(f"{URL}{reply.pk}/send/", {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(set(response.data), {"draft", "email"})
        self.assertEqual(response.data["draft"]["status"], "sent")
        self.assertEqual(self.fake.uploads[-1][1], "/drafts/send")
        self.assertEqual(MailDraft.objects.get(reply_draft=reply).status, "sent")
        self.assertEqual(AuditEvent.objects.filter(action="reply_draft.sent").count(), 1)
        self.assertEqual(AuditEvent.objects.filter(action="mailbox.reply").count(), 1)

    def test_confirm_sent_settles_both(self):
        _, reply = self.applied()
        old = timezone.now() - timedelta(minutes=11)
        ReplyDraft.objects.filter(pk=reply.pk).update(status="sending", updated_at=old)
        MailDraft.objects.filter(reply_draft=reply).update(status="sending", updated_at=old)
        response = self.client.post(f"{URL}{reply.pk}/confirm-sent/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(MailDraft.objects.get(reply_draft=reply).status, "sent")

    def test_reopen_settles_both(self):
        _, reply = self.applied()
        old = timezone.now() - timedelta(minutes=11)
        ReplyDraft.objects.filter(pk=reply.pk).update(status="sending", updated_at=old)
        MailDraft.objects.filter(reply_draft=reply).update(status="sending", updated_at=old)
        self.assertEqual(self.client.post(f"{URL}{reply.pk}/reopen/").status_code, 200)
        self.assertEqual(MailDraft.objects.get(reply_draft=reply).status, "open")


class LinkedSendRefusalTests(LinkedFixture):
    """A linked Communications send that does not go keeps this route's shapes."""

    def test_a_change_at_the_claim_answers_with_the_reply_draft(self):
        _, reply = self.applied()
        self.tick()
        parts_of = sending.parts_of

        def moved(draft):
            # A concurrent write lands between the checks and the claim.
            MailDraft.objects.filter(pk=draft.pk).update(revision=draft.revision + 1)
            return parts_of(draft)

        with patch("services.mail.sending.parts_of", side_effect=moved):
            response = self.client.post(f"{URL}{reply.pk}/send/", {}, format="json")
        self.assertEqual((response.status_code, response.data["code"]), (409, "DRAFT_CHANGED"))
        self.assertEqual(response.data["draft"]["id"], reply.pk)
        self.assertIn("mail_draft_id", response.data["draft"])
        self.assertEqual(response.data["draft"]["status"], "open")
        self.assertEqual(MailDraft.objects.get(reply_draft=reply).status, "open")

    def test_a_draft_gone_from_gmail_reopens_both_and_forgets_it(self):
        _, reply = self.applied()
        self.tick()
        self.fake.fail(r"/drafts/send$", 404)
        response = self.client.post(f"{URL}{reply.pk}/send/", {}, format="json")
        self.assertEqual((response.status_code, response.data["code"]), (409, "DRAFT_GONE"))
        reply.refresh_from_db()
        self.assertEqual(reply.status, "open")
        linked = MailDraft.objects.get(reply_draft=reply)
        self.assertEqual((linked.status, linked.gmail_draft_id), ("open", ""))

    def test_a_paused_mailbox_sends_neither(self):
        _, reply = self.applied()
        self.tick()
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        response = self.client.post(f"{URL}{reply.pk}/send/", {}, format="json")
        self.assertEqual((response.status_code, response.data["code"]), (409, "MAILBOX_PAUSED"))
        reply.refresh_from_db()
        self.assertEqual(reply.status, "open")
        self.assertEqual(MailDraft.objects.get(reply_draft=reply).status, "open")
        self.assertFalse(any(upload[1].endswith("/send") for upload in self.fake.uploads))

    def test_no_mailbox_answers_this_routes_sentence(self):
        _, reply = self.applied()
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")
        response = self.client.post(f"{URL}{reply.pk}/send/", {}, format="json")
        self.assertEqual(
            (response.status_code, response.data["code"], response.data["detail"]),
            (409, "NO_MAILBOX", "Connect your mailbox to send this."),
        )
