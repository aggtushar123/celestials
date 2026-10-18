"""An agent step's reply (agent bundles D3 contract §2.1, D3-1 to D3-3,
D3-11, D3-13): sent from the runner's own mailbox with the step's key,
threaded and signed where Gmail allows, and found again. Gmail and Graph
are fakes."""

from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone

from services.customers.models import Email
from services.mail import agent_send
from services.mail.models import MailboxConnection, MailMessage
from services.mail.providers.microsoft import STAMP_GUID
from services.mail.tests.gmail_fake import gmail_message
from services.mail.tests.gmail_fixtures import GmailFixture
from services.mail.tests.graph_fake import outlook_connection, use_graph


class AgentSendTests(GmailFixture):
    def source(self, connection, **fields):
        """A customer's email filed on Pizza Hut in `connection`'s mailbox."""
        values = {
            "customer": self.pizza,
            "subject": "Login loop",
            "sender_name": "Ann Lee",
            "recipient_name": connection.user.name,
            "body": "We can't log in.",
            "sent_at": timezone.now() - timedelta(hours=1),
            "mailbox": connection,
            "mailbox_owner": connection.user,
            "direction": Email.Direction.RECEIVED,
            "from_address": "ann@pizzahut.com",
            "to_addresses": [connection.address],
            "thread_id": "thread-1",
            "provider_message_id": "<m1@pizzahut.com>",
        }
        values.update(fields)
        return Email.objects.create(**values)

    def test_gmail_sends_with_the_key_the_signature_and_the_answering_headers(self):
        gmail = self.use_gmail("carl@acme.io")
        connection = self.google(self.carl)
        connection.signature_html = "<div>Carl CSM<br>Acme</div>"
        connection.save(update_fields=["signature_html"])
        source = self.source(connection)
        sent = agent_send.send(
            connection,
            source=source,
            to=["ann@pizzahut.com"],
            cc=["ops@pizzahut.com"],
            subject="Re: Login loop",
            body="We're on it.",
            key="b12-s41",
        )
        method, route, metadata, message = gmail.uploads[-1]
        self.assertEqual(message["X-Revenact-Step"], "b12-s41")
        self.assertEqual(message["In-Reply-To"], "<m1@pizzahut.com>")
        self.assertEqual(message["Cc"], "ops@pizzahut.com")
        html = message.get_body(("html",)).get_content()
        self.assertIn("Carl CSM<br>Acme", html)
        self.assertIn("We're on it.", message.get_body(("plain",)).get_content())
        # No mailbox copy of the source here: threaded by In-Reply-To, not Gmail's threadId.
        self.assertEqual(
            (sent.address, sent.provider, sent.threaded), ("carl@acme.io", "google", False)
        )
        filed = Email.objects.get(pk=sent.email_id)
        self.assertEqual(
            (filed.direction, filed.customer_id), (Email.Direction.SENT, self.pizza.pk)
        )
        self.assertTrue(MailMessage.objects.filter(pk=sent.message_id, owner=self.carl).exists())

    def test_gmail_finds_a_reply_by_its_key(self):
        self.use_gmail("carl@acme.io")
        connection = self.google(self.carl)
        source = self.source(connection)
        since = timezone.now() - timedelta(minutes=10)
        sent = agent_send.send(
            connection,
            source=source,
            to=["ann@pizzahut.com"],
            cc=[],
            subject="Re: Login loop",
            body="Hi",
            key="b12-s41",
        )
        found = agent_send.find(connection, key="b12-s41", since=since)
        self.assertEqual(found.provider_id, sent.provider_id)
        self.assertIsNone(agent_send.find(connection, key="b12-s99", since=since))

    def keyed_reply_under(self, newer):
        """A keyed reply with `newer` later sent messages above it in Sent mail."""
        gmail = self.use_gmail("carl@acme.io")
        connection = self.google(self.carl)
        since = timezone.now() - timedelta(minutes=10)
        sent = agent_send.send(
            connection,
            source=self.source(connection),
            to=["ann@pizzahut.com"],
            cc=[],
            subject="Re: Login loop",
            body="Hi",
            key="b12-s41",
        )
        later = timezone.now() + timedelta(minutes=1)
        for n in range(newer):
            gmail.add(
                gmail_message(f"later{n}", labels=["SENT"], sent_at=later + timedelta(seconds=n)),
                quietly=True,
            )
        return connection, since, sent

    def test_gmail_finds_a_reply_beyond_the_first_page(self):
        connection, since, sent = self.keyed_reply_under(30)
        found = agent_send.find(connection, key="b12-s41", since=since)
        self.assertEqual(found.provider_id, sent.provider_id)

    def test_gmail_reads_at_most_100_candidates(self):
        connection, since, _ = self.keyed_reply_under(100)
        self.assertIsNone(agent_send.find(connection, key="b12-s41", since=since))

    def test_outlook_sends_with_the_key_header_and_cc(self):
        graph = use_graph(self)
        connection = outlook_connection(self.carl)
        source = self.source(connection)
        since = timezone.now() - timedelta(minutes=10)
        sent = agent_send.send(
            connection,
            source=source,
            to=["ann@pizzahut.com"],
            cc=["ops@pizzahut.com"],
            subject="Re: Login loop",
            body="Hi",
            key="b12-s41",
        )
        self.assertEqual(graph.sent[-1]["cc"], ["ops@pizzahut.com"])
        self.assertEqual(
            graph.sent[-1]["internetMessageHeaders"],
            [{"name": "x-revenact-step", "value": "b12-s41"}],
        )
        self.assertEqual((sent.provider, sent.threaded), ("microsoft", False))
        # The key is stamped as an extended property too: Sent Items copies drop x-headers.
        self.assertEqual(
            graph.posted[-1]["singleValueExtendedProperties"],
            [{"id": f"String {{{STAMP_GUID}}} Name x-revenact-step", "value": "b12-s41"}],
        )
        found = agent_send.find(connection, key="b12-s41", since=since)
        self.assertEqual(found.provider_id, "graph-1")
        self.assertIsNone(agent_send.find(connection, key="b12-s99", since=since))

    def test_a_persons_outlook_send_posts_only_what_it_did_before(self):
        from services.mail.sync import send_via_provider

        graph = use_graph(self)
        connection = outlook_connection(self.carl)
        send_via_provider(connection, to=["ann@pizzahut.com"], subject="Hello", body="Hi")
        self.assertEqual(set(graph.posted[-1]), {"subject", "body", "toRecipients"})

    def test_a_lost_answer_is_unconfirmed(self):
        graph = use_graph(self)
        connection = outlook_connection(self.carl)
        graph.drop_next()
        with self.assertRaises(agent_send.Unconfirmed) as caught:
            agent_send.send(
                connection,
                source=self.source(connection),
                to=["ann@pizzahut.com"],
                cc=[],
                subject="Re: x",
                body="Hi",
                key="k",
            )
        self.assertEqual(caught.exception.sentence, agent_send.UNCONFIRMED)

    def test_outlook_refusing_the_token_marks_the_mailbox(self):
        graph = use_graph(self)
        connection = outlook_connection(self.carl)
        graph.refuse_next(401, reauth=True)
        with self.assertRaises(agent_send.Refused) as caught:
            agent_send.send(
                connection,
                source=self.source(connection),
                to=["ann@pizzahut.com"],
                cc=[],
                subject="Re: x",
                body="Hi",
                key="k",
            )
        self.assertEqual(caught.exception.sentence, agent_send.OUTLOOK_EXPIRED)
        connection.refresh_from_db()
        self.assertEqual(connection.status, MailboxConnection.Status.ERROR)

    def test_gmail_losing_its_grant_pauses_the_mailbox(self):
        gmail = self.use_gmail("carl@acme.io")
        connection = self.google(self.carl)
        gmail.fail(r"/messages/send", 401, "invalid_grant", times=2)
        with self.assertRaises(agent_send.Refused) as caught:
            agent_send.send(
                connection,
                source=self.source(connection),
                to=["ann@pizzahut.com"],
                cc=[],
                subject="Re: x",
                body="Hi",
                key="k",
            )
        self.assertEqual(caught.exception.sentence, agent_send.GMAIL_EXPIRED)
        connection.refresh_from_db()
        self.assertEqual(connection.paused_reason, MailboxConnection.PausedReason.TOKEN_REVOKED)

    def test_who_cannot_send(self):
        self.assertEqual(agent_send.blocked(None), agent_send.CONNECT)
        imap = MailboxConnection(
            provider=MailboxConnection.Provider.IMAP, status=MailboxConnection.Status.CONNECTED
        )
        self.assertEqual(agent_send.blocked(imap), agent_send.IMAP)
        google = self.google(self.carl)
        self.assertIsNone(agent_send.blocked(google))
        google.granted_scopes = ["https://www.googleapis.com/auth/gmail.modify"]
        self.assertEqual(agent_send.blocked(google), agent_send.RECONNECT)
        google.status = MailboxConnection.Status.DISCONNECTED
        self.assertEqual(agent_send.blocked(google), agent_send.CONNECT)

    def test_a_mailbox_with_no_credentials_cannot_send(self):
        # Round 2 D2 contract R2D2-19 (N1): Outlook was let through with blank credentials.
        outlook = outlook_connection(self.carl)
        self.assertIsNone(agent_send.blocked(outlook))
        outlook.credentials = ""
        self.assertEqual(agent_send.blocked(outlook), agent_send.RECONNECT)
        google = self.google(self.dana)
        google.credentials = ""
        self.assertEqual(agent_send.blocked(google), agent_send.RECONNECT)

    def test_a_failure_filing_the_sent_copy_never_fails_the_send(self):
        gmail = self.use_gmail("carl@acme.io")
        connection = self.google(self.carl)
        source = self.source(connection)
        with patch("services.mail.agent_send.file_sent", side_effect=RuntimeError("boom")):
            with self.assertLogs("services.mail.agent_send", level="WARNING") as logs:
                sent = agent_send.send(
                    connection,
                    source=source,
                    to=["ann@pizzahut.com"],
                    cc=[],
                    subject="Re: Login loop",
                    body="Hi",
                    key="b12-s41",
                )
        self.assertEqual(len(gmail.uploads), 1)
        self.assertTrue(sent.provider_id)
        self.assertEqual((sent.email_id, sent.message_id), (None, None))
        # LOG-03: the exception's type, never its text or a traceback.
        self.assertEqual(
            [(r.levelname, r.getMessage()) for r in logs.records],
            [
                (
                    "WARNING",
                    f"filing the sent agent reply failed for connection {connection.pk}: "
                    "RuntimeError",
                )
            ],
        )
        self.assertIsNone(logs.records[0].exc_info)

    def test_a_database_error_filing_the_copy_leaves_the_outer_transaction_usable(self):
        from django.db import IntegrityError

        self.use_gmail("carl@acme.io")
        connection = self.google(self.carl)
        source = self.source(connection)

        def clash(*args, **kwargs):
            # A real constraint violation inside the filing savepoint.
            Email.objects.create(pk=source.pk, subject="clash", sent_at=timezone.now())
            raise AssertionError("the duplicate key should have raised")

        with patch("services.mail.agent_send.file_sent", side_effect=clash):
            with self.assertLogs("services.mail.agent_send", level="WARNING") as logs:
                sent = agent_send.send(
                    connection,
                    source=source,
                    to=["ann@pizzahut.com"],
                    cc=[],
                    subject="Re: Login loop",
                    body="Hi",
                    key="b12-s41",
                )
        self.assertTrue(sent.provider_id)
        self.assertIn(IntegrityError.__name__, logs.records[0].getMessage())
        # The outer transaction (this test's) still answers queries.
        self.assertEqual(Email.objects.filter(pk=source.pk).count(), 1)

    def held_copy(self, connection, source, thread_id):
        """`connection`'s own copy of the filed `source`, in `thread_id`."""
        return MailMessage.objects.create(
            connection=connection,
            owner=connection.user,
            organisation=connection.organisation,
            provider_message_id=f"copy-{source.pk}",
            direction=MailMessage.Direction.RECEIVED,
            from_address=source.from_address,
            subject=source.subject,
            sent_at=source.sent_at,
            rfc_message_id=source.provider_message_id,
            thread_id=thread_id,
            email=source,
        )

    def test_a_gmail_reply_found_again_in_its_thread_says_so(self):
        # Round 2 D1 contract R2D1-12.
        self.use_gmail("carl@acme.io")
        connection = self.google(self.carl)
        source = self.source(connection)
        self.held_copy(connection, source, "thread-1")
        since = timezone.now() - timedelta(minutes=10)
        sent = agent_send.send(
            connection,
            source=source,
            to=["ann@pizzahut.com"],
            cc=[],
            subject="Re: Login loop",
            body="Hi",
            key="b12-s41",
        )
        self.assertTrue(sent.threaded)
        found = agent_send.find(connection, key="b12-s41", since=since, source=source)
        self.assertTrue(found.threaded)
        unheld = agent_send.find(connection, key="b12-s41", since=since)
        self.assertFalse(unheld.threaded)

    def test_an_outlook_reply_found_again_reads_its_conversation(self):
        graph = use_graph(self)
        connection = outlook_connection(self.carl)
        source = self.source(connection)
        self.held_copy(connection, source, "conv-1")
        since = timezone.now() - timedelta(minutes=10)
        agent_send.send(
            connection,
            source=source,
            to=["ann@pizzahut.com"],
            cc=[],
            subject="Re: Login loop",
            body="Hi",
            key="b12-s41",
        )
        graph.sent[-1]["conversationId"] = "conv-1"
        found = agent_send.find(connection, key="b12-s41", since=since, source=source)
        self.assertTrue(found.threaded)
        graph.sent[-1]["conversationId"] = "conv-other"
        self.assertFalse(
            agent_send.find(connection, key="b12-s41", since=since, source=source).threaded
        )
