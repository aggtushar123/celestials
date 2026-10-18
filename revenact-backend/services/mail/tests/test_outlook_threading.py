"""Outlook replies thread (agent bundles round 2 D1 contract R2D1-13,
R2D1-14): when the mailbox holds the source and the reply goes to its
sender, Graph's reply is used (In-Reply-To and the conversation set by
Graph), carrying the step's stamp; otherwise sendMail, as before. Graph is
a fake."""

from datetime import timedelta

from django.utils import timezone

from services.customers.models import Email
from services.mail import agent_send, sync
from services.mail.models import MailMessage
from services.mail.providers.microsoft import STAMP_GUID
from services.mail.tests.gmail_fixtures import GmailFixture
from services.mail.tests.graph_fake import outlook_connection, use_graph

STAMP = f"String {{{STAMP_GUID}}} Name x-revenact-step"


class OutlookThreadingTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.graph = use_graph(self)
        self.connection = outlook_connection(self.carl)
        self.source = Email.objects.create(
            customer=self.pizza,
            subject="Login loop",
            sender_name="Ann Lee",
            recipient_name=self.carl.name,
            body="We can't log in.",
            sent_at=timezone.now() - timedelta(hours=1),
            mailbox=self.connection,
            mailbox_owner=self.carl,
            direction=Email.Direction.RECEIVED,
            from_address="ann@pizzahut.com",
            to_addresses=[self.connection.address],
            thread_id="conv-1",
            provider_message_id="graph-orig",
        )

    def hold(self):
        MailMessage.objects.create(
            connection=self.connection,
            owner=self.carl,
            organisation=self.org,
            provider_message_id="graph-orig",
            direction=MailMessage.Direction.RECEIVED,
            from_address="ann@pizzahut.com",
            subject="Login loop",
            sent_at=self.source.sent_at,
            rfc_message_id="<m1@pizzahut.com>",
            thread_id="conv-1",
            email=self.source,
        )
        self.graph.held["<m1@pizzahut.com>"] = ("graph-orig", "conv-1")

    def send(self, to=("ann@pizzahut.com",), cc=()):
        return agent_send.send(
            self.connection,
            source=self.source,
            to=list(to),
            cc=list(cc),
            subject="Re: Login loop",
            body="We're on it.",
            key="b12-s41",
        )

    def test_a_held_source_answered_to_its_sender_is_a_graph_reply(self):
        self.hold()
        sent = self.send(cc=["ops@pizzahut.com"])
        [reply] = self.graph.replies
        self.assertEqual(reply["id"], "graph-orig")
        message = reply["message"]
        self.assertNotIn("toRecipients", message)
        self.assertEqual(
            (message["subject"], message["body"], message["ccRecipients"]),
            (
                "Re: Login loop",
                {"contentType": "Text", "content": "We're on it."},
                [{"emailAddress": {"address": "ops@pizzahut.com"}}],
            ),
        )
        self.assertEqual(
            message["singleValueExtendedProperties"], [{"id": STAMP, "value": "b12-s41"}]
        )
        self.assertNotIn("internetMessageHeaders", message)
        self.assertEqual(self.graph.posted, [])  # no sendMail
        self.assertTrue(sent.threaded)
        since = timezone.now() - timedelta(minutes=10)
        found = agent_send.find(self.connection, key="b12-s41", since=since, source=self.source)
        self.assertTrue(found.threaded)

    def test_an_edited_to_keeps_send_mail(self):
        self.hold()
        sent = self.send(to=["boss@pizzahut.com"])
        self.assertEqual((self.graph.replies, len(self.graph.posted)), ([], 1))
        self.assertFalse(sent.threaded)

    def test_a_source_the_mailbox_doesnt_hold_keeps_send_mail(self):
        sent = self.send()
        self.assertEqual((self.graph.replies, len(self.graph.posted)), ([], 1))
        self.assertFalse(sent.threaded)

    def test_a_copy_gone_since_the_lookup_falls_back_to_send_mail(self):
        self.hold()
        self.graph.reply_gone = True
        self.send()
        self.assertEqual((self.graph.replies, len(self.graph.posted)), ([], 1))

    def test_a_persons_own_reply_threads_too(self):
        self.hold()
        sync.send_email(
            self.connection,
            to=["ann@pizzahut.com"],
            subject="Re: Login loop",
            body="Thanks Ann.",
            customer=self.pizza,
            answering=self.source,
        )
        [reply] = self.graph.replies
        self.assertNotIn("singleValueExtendedProperties", reply["message"])

    def test_a_refused_reply_is_never_resent_through_send_mail(self):
        self.hold()
        self.graph.refuse_next(500)
        with self.assertRaises(agent_send.Refused):
            self.send()
        self.assertEqual((self.graph.posted, self.graph.replies), ([], []))

    def test_a_dropped_reply_is_unconfirmed_and_never_resent(self):
        self.hold()
        self.graph.drop_next()
        with self.assertRaises(agent_send.Unconfirmed):
            self.send()
        self.assertEqual(self.graph.posted, [])
        self.assertEqual(len(self.graph.replies), 1)

    def test_a_refused_lookup_falls_back_to_send_mail(self):
        self.hold()
        self.graph.refuse_lookup(500)
        self.send()
        self.assertEqual((self.graph.replies, len(self.graph.posted)), ([], 1))

    def test_a_lookup_refused_as_a_lost_grant_raises_and_sends_nothing(self):
        self.hold()
        self.graph.refuse_lookup(401, reauth=True)
        with self.assertRaises(agent_send.Refused) as refused:
            self.send()
        self.assertEqual(
            str(refused.exception), "Your Outlook connection expired. Reconnect it, then Retry."
        )
        self.assertEqual((self.graph.posted, self.graph.replies), ([], []))
