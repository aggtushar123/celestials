"""A Gmail draft edited in Revenact keeps its signature whole (agent bundles
round 2 D1 contract R2D1-16): the block the editor reduced to text is put
back from the mailbox's Gmail signature. Gmail is a fake."""

from services.mail import send_as
from services.mail.models import MailDraft

from .draft_fixtures import DraftFixture

RICH = '<div>Dana Ruiz<br><img src="https://dough.co/logo.png" alt="Dough Co"></div>'


class DraftSignatureTests(DraftFixture):
    def setUp(self):
        super().setUp()
        self.mailbox.signature_html = RICH
        self.mailbox.save(update_fields=["signature_html"])

    def test_an_edit_keeps_the_gmail_signature_whole(self):
        draft = self.new_draft()
        answer = self.patch_draft(
            draft["id"],
            {
                "html": '<p>Two years.</p><div data-revenact-signature="">Dana Ruiz</div>',
                "revision": draft["revision"],
            },
        )
        self.assertEqual(answer.status_code, 200, answer.data)
        stored = MailDraft.objects.get(pk=draft["id"]).html
        self.assertEqual(stored, "<p>Two years.</p>" + send_as.signature_block(self.mailbox))
        self.assertIn('src="https://dough.co/logo.png"', stored)

    def test_a_deleted_signature_stays_deleted(self):
        draft = self.new_draft()
        self.patch_draft(
            draft["id"], {"html": "<p>No signature.</p>", "revision": draft["revision"]}
        )
        self.assertEqual(MailDraft.objects.get(pk=draft["id"]).html, "<p>No signature.</p>")

    def test_a_new_draft_with_the_editors_block_is_whole_too(self):
        draft = self.new_draft(html='<p>Hi</p><div data-revenact-signature="">Dana Ruiz</div>')
        self.assertIn("dough.co/logo.png", MailDraft.objects.get(pk=draft["id"]).html)
