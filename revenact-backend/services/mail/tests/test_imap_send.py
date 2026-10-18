"""ImapProvider.send over SMTP: once the server has accepted the message, a
failed goodbye (QUIT, or closing the connection) is logged and the send
counts as done, so a filed draft never reopens to be sent twice. A failure
before the server accepts it is still a ProviderError."""

import smtplib
from unittest.mock import patch

from django.test import SimpleTestCase

from services.mail.providers.base import Credentials, ProviderError, SendUnconfirmed
from services.mail.providers.imap import ImapProvider

CREDS = Credentials(
    address="me@example.com",
    display_name="Me",
    # Empty: the fake server never checks it.
    data={
        "smtp_host": "smtp.example.com",
        "smtp_port": 587,
        "username": "me@example.com",
        "password": "",
    },
)


class FakeSMTP(smtplib.SMTP):
    """The real class's `__exit__` (QUIT, then a non-221 raises), with the
    wire replaced."""

    quit_code = 221
    refuse_send = False
    sent = []

    def connect(self, host="localhost", port=0, source_address=None):
        return 220, b"ready"

    def starttls(self, *args, **kwargs):
        return 220, b"go ahead"

    def login(self, user, password, **kwargs):
        return 235, b"ok"

    def send_message(self, msg, *args, **kwargs):
        if self.refuse_send:
            raise smtplib.SMTPRecipientsRefused({"x@example.com": (550, b"no")})
        FakeSMTP.sent.append(msg["Subject"])
        return {}

    def docmd(self, cmd, args=""):
        return self.quit_code, b"bye"

    def close(self):
        pass


def fake(**fields):
    return type("Fake", (FakeSMTP,), fields)


class SmtpSendTests(SimpleTestCase):
    def setUp(self):
        FakeSMTP.sent = []

    def send(self):
        return ImapProvider().send(CREDS, to=["you@example.com"], subject="Hi", body="Hello")

    def test_a_failed_quit_after_the_server_accepted_counts_as_sent(self):
        with (
            patch("services.mail.providers.imap.smtplib.SMTP", fake(quit_code=421)),
            self.assertLogs("services.mail.providers.imap", level="WARNING") as logs,
        ):
            message = self.send()
        self.assertEqual(FakeSMTP.sent, ["Hi"])
        self.assertEqual(message.subject, "Hi")
        # The class name only, never the server's words.
        self.assertIn("SMTPResponseException", logs.output[0])
        self.assertNotIn("bye", logs.output[0])

    def test_a_close_that_raises_after_the_send_counts_as_sent(self):
        def close(self):
            raise OSError("connection reset")

        with patch("services.mail.providers.imap.smtplib.SMTP", fake(close=close)):
            self.assertEqual(self.send().subject, "Hi")

    def test_a_failure_before_the_server_accepted_is_a_provider_error(self):
        with (
            patch(
                "services.mail.providers.imap.smtplib.SMTP", fake(refuse_send=True, quit_code=421)
            ),
            self.assertRaises(ProviderError),
        ):
            self.send()
        self.assertEqual(FakeSMTP.sent, [])

    def test_a_clean_send(self):
        with patch("services.mail.providers.imap.smtplib.SMTP", FakeSMTP):
            self.assertEqual(self.send().subject, "Hi")


class HandedOverTests(SimpleTestCase):
    """Once the message was handed to the server, a dropped connection or a
    timeout with no answer may have sent it: SendUnconfirmed (a
    TimeoutError, never a ProviderError), so the draft is not reopened. A
    coded refusal is still a ProviderError."""

    def setUp(self):
        FakeSMTP.sent = []

    def send(self):
        return ImapProvider().send(CREDS, to=["you@example.com"], subject="Hi", body="Hello")

    def raising(self, error):
        def send_message(self, msg, *args, **kwargs):
            raise error

        return fake(send_message=send_message)

    def test_a_disconnect_during_the_send_is_unconfirmed(self):
        for error in (
            smtplib.SMTPServerDisconnected("Connection unexpectedly closed"),
            TimeoutError("timed out"),
            ConnectionResetError("reset"),
        ):
            with self.subTest(error=type(error).__name__):
                with (
                    patch("services.mail.providers.imap.smtplib.SMTP", self.raising(error)),
                    self.assertRaises(SendUnconfirmed) as caught,
                ):
                    self.send()
                self.assertIsInstance(caught.exception, TimeoutError)
                self.assertNotIsInstance(caught.exception, ProviderError)

    def test_a_coded_refusal_during_the_send_is_a_provider_error(self):
        for error in (
            smtplib.SMTPRecipientsRefused({"x@example.com": (550, b"no")}),
            smtplib.SMTPSenderRefused(553, b"no", "me@example.com"),
            smtplib.SMTPDataError(554, b"rejected"),
            smtplib.SMTPResponseException(451, b"try later"),
        ):
            with self.subTest(error=type(error).__name__):
                with (
                    patch("services.mail.providers.imap.smtplib.SMTP", self.raising(error)),
                    self.assertRaises(ProviderError),
                ):
                    self.send()

    def test_a_disconnect_before_the_send_is_a_provider_error(self):
        def login(self, user, password, **kwargs):
            raise smtplib.SMTPServerDisconnected("gone")

        with (
            patch("services.mail.providers.imap.smtplib.SMTP", fake(login=login)),
            self.assertRaises(ProviderError),
        ):
            self.send()
