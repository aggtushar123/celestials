"""Sent MailDraft rows are pruned after MAIL_DRAFT_SENT_RETENTION_DAYS (D3
contract §9); the sent message stays. Open, sending and recent drafts stay,
and so does a sent draft whose draft_delete is still on its way to Gmail. A
discarded draft left behind (a disconnect deleted its pending draft_delete)
goes after the same days since it was discarded (final review 4)."""

from datetime import timedelta

from django.core.management import call_command

from services.mail.models import MailDraft, MailMessage, MailOutbox
from services.mail.prune import prune_drafts

from .draft_fixtures import DraftFixture


class PruneTests(DraftFixture):
    def sent(self, draft, days):
        MailDraft.objects.filter(pk=draft["id"]).update(
            status="sent", sent_at=self.now - timedelta(days=days)
        )

    def test_old_sent_drafts_go_and_their_messages_stay(self):
        old, recent, open_ = self.new_draft(), self.new_draft(), self.new_draft()
        self.sent(old, 8)
        self.sent(recent, 6)
        MailOutbox.objects.all().delete()  # a real send drops the pending saves
        self.assertEqual(prune_drafts(now=self.now, dry_run=True), 1)
        self.assertEqual(prune_drafts(now=self.now), 1)
        self.assertEqual(
            set(MailDraft.objects.values_list("pk", flat=True)), {recent["id"], open_["id"]}
        )
        self.assertTrue(MailMessage.objects.filter(pk=old["message_id"]).exists())

    def test_a_sent_draft_with_a_live_draft_delete_stays(self):
        held, free = self.new_draft(), self.new_draft()
        for draft in (held, free):
            self.sent(draft, 30)
        MailOutbox.objects.filter(draft_id__in=[held["id"], free["id"]]).delete()
        MailOutbox.objects.create(
            connection=self.mailbox,
            action_id="00000000-0000-0000-0000-000000000001",
            op=MailOutbox.Op.DRAFT_DELETE,
            draft_id=held["id"],
            payload={"gmail_draft_id": "g1"},
            next_attempt_at=self.now,
        )
        self.assertEqual(prune_drafts(now=self.now), 1)
        self.assertEqual(list(MailDraft.objects.values_list("pk", flat=True)), [held["id"]])
        self.assertTrue(MailOutbox.objects.filter(draft_id=held["id"]).exists())

    def test_the_nightly_job_runs_it(self):
        draft = self.new_draft()
        self.sent(draft, 30)
        MailOutbox.objects.filter(draft_id=draft["id"]).delete()
        call_command("run_health_maintenance", verbosity=0)
        self.assertFalse(MailDraft.objects.exists())

    def discarded(self, draft, days):
        MailDraft.objects.filter(pk=draft["id"]).update(
            status="discarded", message=None, updated_at=self.now - timedelta(days=days)
        )

    def test_old_discarded_drafts_with_no_live_row_go(self):
        old, recent, owed = self.new_draft(), self.new_draft(), self.new_draft()
        self.discarded(old, 8)
        self.discarded(recent, 6)
        self.discarded(owed, 30)
        MailOutbox.objects.filter(draft_id__in=[old["id"], recent["id"]]).delete()
        MailOutbox.objects.filter(draft_id=owed["id"]).update(op=MailOutbox.Op.DRAFT_DELETE)
        self.assertEqual(prune_drafts(now=self.now, dry_run=True), 1)
        self.assertEqual(prune_drafts(now=self.now), 1)
        self.assertEqual(
            set(MailDraft.objects.values_list("pk", flat=True)), {recent["id"], owed["id"]}
        )
        # A message row a draft no longer points at is never touched.
        self.assertTrue(MailMessage.objects.filter(pk=old["message_id"]).exists())
