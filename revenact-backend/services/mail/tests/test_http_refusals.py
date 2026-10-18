"""A mail provider's refusal whose body can't be read is still a refusal
(agent bundles round 2 D1 contract R2D1-8). Nothing leaves the process."""

import urllib.error
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from services.mail.providers.base import ProviderError, http_json

URL = "https://graph.microsoft.com/v1.0/me/sendMail"


class MailRefusalTests(SimpleTestCase):
    def test_a_refusal_whose_body_times_out_keeps_its_status(self):
        error = urllib.error.HTTPError(URL, 403, "Forbidden", {}, None)
        error.read = MagicMock(side_effect=TimeoutError("read timed out"))
        with patch("urllib.request.urlopen", side_effect=error):
            with self.assertRaises(ProviderError) as caught:
                http_json("POST", URL, data={})
        self.assertEqual(caught.exception.status, 403)
