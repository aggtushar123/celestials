"""Dana's two-way Gmail, for delivery 3's tests (on GmailFixture's world:
Dana reports to Carl, Carl to Alice; Pizza Hut is pizzahut.com). Imported,
labels mirrored, the send-as name and signature already read. Her inbox
holds Ann's "Renewal quote" (to Dana, cc Sam; a PDF and an inline logo),
filed on Pizza Hut. Gmail is a FakeGmail holding the PDF's and the logo's bytes."""

from datetime import timedelta

from django.utils import timezone

from services.customers.models import ReplyDraft
from services.mail import gmail_store, gmail_sync
from services.mail.models import MailboxConnection, MailDraft

from .gmail_fake import fixture
from .gmail_fixtures import GmailFixture

URL = "/api/v1/mail/"
PDF = b"%PDF-1.4 renewal quote"
LOGO = b"\x89PNG logo"
SIGNATURE = "Dana Ruiz<br>Acme"


class DraftFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = self.use_gmail()
        self.now = timezone.now()
        quote = fixture("message_full.json")
        quote["internalDate"] = str(int((self.now - timedelta(hours=2)).timestamp() * 1000))
        self.fake.add(quote, quietly=True)
        self.fake.attach_file(quote["id"], "1", PDF)
        self.fake.attach_file(quote["id"], "2", LOGO)
        self.mailbox = self.google(
            self.dana,
            history_id=self.fake.history_id,
            import_after=self.now - timedelta(days=365),
            import_before=self.now,
            import_done_at=self.now,
            send_as_name="Dana Ruiz",
            signature_html=SIGNATURE,
            send_as_synced_at=self.now,
        )
        gmail_store.mirror_labels(self.mailbox, fixture("labels_list.json")["labels"])
        self.quote, self.filed = gmail_store.store_gmail(self.mailbox, quote, now=self.now)
        self.client.force_authenticate(self.dana)

    def compose(self, kind, message=None):
        query = f"?kind={kind}" + (f"&message={message.pk}" if message is not None else "")
        return self.client.get(f"{URL}compose/{query}")

    def post_draft(self, body):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(f"{URL}drafts/", body, format="json")

    def patch_draft(self, pk, body):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.patch(f"{URL}drafts/{pk}/", body, format="json")

    def new_draft(self, **body):
        """A reply to the quote made through the API (Task 6); its payload."""
        response = self.post_draft({"kind": "reply", "source_message_id": self.quote.pk, **body})
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def agent_reply(self, draft_id, **fields):
        """Dana's CS agent reply to the quote, linked to draft `draft_id`."""
        reply = ReplyDraft.objects.create(
            **{
                "organisation": self.org,
                "owner": self.dana,
                "channel": "email",
                "customer": self.pizza,
                "email": self.filed,
                "to": [["Ann Lee", "ann@pizzahut.com"]],
                "subject": "Re: Renewal quote",
                "body": "Hi Ann",
                "written_body": "Hi Ann",
                "agent": "cs",
                **fields,
            }
        )
        MailDraft.objects.filter(pk=draft_id).update(reply_draft=reply)
        return reply

    def tick(self, now=None):
        connection = MailboxConnection.objects.get(pk=self.mailbox.pk)
        result = gmail_sync.tick(connection, now=now or timezone.now())
        self.mailbox.refresh_from_db()
        return result

    def stored(self, pk):
        return MailDraft.objects.get(pk=pk)
