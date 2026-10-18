"""A reply files on its original's thread when the provider names none
(Graph and SMTP never do), so it clears the original from the queue, and it
carries In-Reply-To when the original's id is a Message-ID (contract,
delivery 1 follow-ups)."""

from datetime import timedelta
from unittest.mock import patch

from services.customers import communications
from services.customers.models import Email
from services.mail.sync import looks_like_message_id, send_email
from services.mail.tests.test_mail import NOW, FakeProvider, Fixture


class Threadless(FakeProvider):
    """A provider whose send names no thread, as Graph and SMTP do."""

    def send(self, creds, *, to, subject, body, in_reply_to=""):
        sent = super().send(creds, to=to, subject=subject, body=body, in_reply_to=in_reply_to)
        sent.thread_id = ""
        return sent


class ThreadingTests(Fixture):
    def setUp(self):
        super().setUp()
        self.connection = self.connect(self.dana)
        self.original = Email.objects.create(
            customer=self.pizza,
            subject="Renewal terms",
            sender_name="Sam Pizza",
            recipient_name="Dana",
            body="Can we get the multi-year option?",
            sent_at=NOW - timedelta(hours=1),
            mailbox=self.connection,
            mailbox_owner=self.dana,
            direction=Email.Direction.RECEIVED,
            from_address="sam@pizzahut.com",
            thread_id="t1",
            provider_message_id="<abc@pizzahut.com>",
        )

    def send(self, provider):
        with patch("services.mail.sync.get_provider", return_value=provider):
            return send_email(
                self.connection,
                to=["sam@pizzahut.com"],
                subject="Re: Renewal terms",
                body="Yes.",
                customer=self.pizza,
                answering=self.original,
            )

    def test_a_threadless_send_takes_the_originals_thread(self):
        self.assertEqual(self.send(Threadless()).thread_id, "t1")

    def test_a_providers_own_thread_is_kept(self):
        self.assertEqual(self.send(FakeProvider()).thread_id, "t-sent")

    def test_a_message_id_goes_out_as_in_reply_to(self):
        self.send(FakeProvider())
        self.assertEqual(FakeProvider.replied_to[-1], "<abc@pizzahut.com>")

    def test_a_provider_id_that_is_not_a_message_id_is_not_sent(self):
        Email.objects.filter(pk=self.original.pk).update(provider_message_id="18c2f0a9")
        self.original.refresh_from_db()
        self.send(FakeProvider())
        self.assertEqual(FakeProvider.replied_to[-1], "")

    def test_what_looks_like_a_message_id(self):
        self.assertTrue(looks_like_message_id("<a.b@c.d>"))
        for value in ("", None, "18c2f0a9", "<nope>", "a@b", "<a@b> trailing"):
            self.assertFalse(looks_like_message_id(value))

    def test_the_queue_reply_clears_the_debt_on_a_threadless_provider(self):
        self.client.force_authenticate(self.dana)
        with patch("services.mail.sync.get_provider", return_value=Threadless()):
            response = self.client.post(
                f"/api/v1/communications/emails/{self.original.pk}/reply/",
                {"body": "Yes."},
                format="json",
            )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["thread_id"], "t1")
        self.assertEqual(FakeProvider.replied_to[-1], "<abc@pizzahut.com>")
        self.assertEqual(communications.replies_owed(self.dana).count(), 0)
