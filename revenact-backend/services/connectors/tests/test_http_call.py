"""The ticket sources' one HTTP helper (agent bundles D3 §3, D3-13): answer
headers come back, a write with no answer is NoAnswer, a refusal keeps its
status and body. Nothing leaves the process: urlopen is patched."""

import io
import json
import urllib.error
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from services.connectors.providers.base import NoAnswer, ProviderError, http_call, http_json

URL = "https://slack.com/api/auth.test"


def answering(body, headers=None):
    response = MagicMock()
    response.__enter__.return_value = response
    response.read.return_value = json.dumps(body).encode()
    response.headers.items.return_value = list((headers or {}).items())
    return response


class HttpCallTests(SimpleTestCase):
    def test_headers_come_back_lower_cased(self):
        with patch(
            "urllib.request.urlopen",
            return_value=answering({"ok": True}, {"X-OAuth-Scopes": "chat:write"}),
        ):
            body, headers = http_call("GET", URL)
        self.assertEqual((body, headers["x-oauth-scopes"]), ({"ok": True}, "chat:write"))

    def test_a_write_without_an_answer_is_no_answer(self):
        with patch("urllib.request.urlopen", side_effect=TimeoutError("read timed out")):
            with self.assertRaises(NoAnswer):
                http_json("POST", URL, data={}, write=True)

    def test_a_read_without_an_answer_is_a_plain_failure(self):
        with patch("urllib.request.urlopen", side_effect=TimeoutError("read timed out")):
            with self.assertRaises(ProviderError) as caught:
                http_json("GET", URL)
        self.assertNotIsInstance(caught.exception, NoAnswer)

    def test_a_request_that_never_left_is_a_plain_failure(self):
        with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("refused")):
            with self.assertRaises(ProviderError) as caught:
                http_json("POST", URL, data={}, write=True)
        self.assertNotIsInstance(caught.exception, NoAnswer)
        self.assertIsNone(caught.exception.status)

    def test_a_refusal_keeps_its_status_and_body(self):
        refusal = urllib.error.HTTPError(
            "https://acme.atlassian.net/rest/api/3/issue",
            400,
            "Bad Request",
            {},
            io.BytesIO(json.dumps({"errors": {"components": "Component/s is required."}}).encode()),
        )
        with patch("urllib.request.urlopen", side_effect=refusal):
            with self.assertRaises(ProviderError) as caught:
                http_json(
                    "POST", "https://acme.atlassian.net/rest/api/3/issue", data={}, write=True
                )
        self.assertEqual(caught.exception.status, 400)
        self.assertEqual(
            caught.exception.body, {"errors": {"components": "Component/s is required."}}
        )

    def test_a_refusal_whose_body_times_out_is_still_a_refusal(self):
        # Round 2 D1 contract R2D1-8: the tool answered with a status; only its
        # body was lost. Nothing was done, so it is a refusal, never NoAnswer.
        error = urllib.error.HTTPError(URL, 400, "Bad Request", {}, None)
        error.read = MagicMock(side_effect=TimeoutError("read timed out"))
        with patch("urllib.request.urlopen", side_effect=error):
            with self.assertRaises(ProviderError) as caught:
                http_json("POST", URL, data={}, write=True)
        self.assertNotIsInstance(caught.exception, NoAnswer)
        self.assertEqual((caught.exception.status, caught.exception.body), (400, None))
