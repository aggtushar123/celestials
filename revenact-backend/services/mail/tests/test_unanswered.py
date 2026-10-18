"""A send whose outcome is unknown vs one that certainly failed (cleanup
batch, fix round 1). `http_json` wraps a failure to reach the host
(`URLError`, even a connect timeout) in ProviderError; a timeout or a
dropped connection while waiting for the answer comes through raw. A token
refresh happens before anything is sent, so any failure there is a
ProviderError (the draft reopens), never an unconfirmed send."""

import http.client
import socket
import time
import urllib.error
from unittest.mock import patch

from django.test import SimpleTestCase

from services.mail.providers.base import Credentials, ProviderError, http_json
from services.mail.providers.google import GoogleProvider
from services.mail.providers.microsoft import MicrosoftProvider

URLOPEN = "services.mail.providers.base.urllib.request.urlopen"
EXPIRED = Credentials(
    address="me@example.com",
    display_name="Me",
    data={"access_token": "a", "refresh_token": "r", "expires_at": time.time() - 60},
)


class HttpJsonTests(SimpleTestCase):
    def call(self):
        return http_json("POST", "https://gmail.googleapis.com/x", data={})

    def test_a_connect_timeout_is_a_provider_error(self):
        with (
            patch(URLOPEN, side_effect=urllib.error.URLError(socket.timeout("timed out"))),
            self.assertRaises(ProviderError),
        ):
            self.call()

    def test_a_read_timeout_or_a_dropped_answer_comes_through_raw(self):
        for error in (TimeoutError("read timed out"), http.client.RemoteDisconnected("gone")):
            with self.subTest(error=type(error).__name__):
                with patch(URLOPEN, side_effect=error), self.assertRaises(type(error)):
                    self.call()


class TokenRefreshTests(SimpleTestCase):
    def test_a_refresh_that_times_out_or_drops_is_a_provider_error(self):
        for provider in (GoogleProvider(), MicrosoftProvider()):
            for error in (
                TimeoutError("read timed out"),
                http.client.RemoteDisconnected("gone"),
                http.client.IncompleteRead(b""),
                ConnectionResetError("reset"),
            ):
                with self.subTest(provider=provider.key, error=type(error).__name__):
                    with patch(URLOPEN, side_effect=error), self.assertRaises(ProviderError) as e:
                        provider._fresh(EXPIRED)
                    # Not a lost grant: the mailbox stays connected.
                    self.assertFalse(e.exception.reauth)
