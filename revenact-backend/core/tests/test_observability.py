"""Request ids and log redaction (SOC2:API-05, LOG-03)."""

import io
import json
import logging
import pathlib

from django.conf import settings
from django.test import SimpleTestCase, TestCase, override_settings

from core.logging import JSONFormatter, RedactFilter, redact
from core.middleware import get_request_id


class RedactionTests(SimpleTestCase):
    def test_credentials_are_scrubbed(self):
        cases = {
            "Authorization: Bearer abc.def.ghi": "Authorization: Bearer [REDACTED]",
            "password=hunter22 user=bob": "password=[REDACTED] user=bob",
            '{"refresh": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijklmnop"}': (
                '{"refresh": "[REDACTED]"}'
            ),
            "api_key: sk-live-123": "api_key: [REDACTED]",
            "plain message with nothing secret": "plain message with nothing secret",
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(redact(raw), expected)

    def test_the_survey_links_token_is_scrubbed_from_a_logged_path(self):
        cases = {
            "Bad Request: /api/v1/public/surveys/XVz1Bta3olQ0FX6U4_eP6WvEnTdlwNBQ-sGR_fWRWyE/": (
                "Bad Request: /api/v1/public/surveys/[REDACTED]/"
            ),
            "GET /api/v1/public/surveys/abc-123_XYZ/ HTTP/1.1": (
                "GET /api/v1/public/surveys/[REDACTED]/ HTTP/1.1"
            ),
            "Not Found: /api/v1/public/surveys/not-a-token/": (
                "Not Found: /api/v1/public/surveys/[REDACTED]/"
            ),
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(redact(raw), expected)

    def test_the_unsubscribe_links_token_is_scrubbed_from_a_logged_path(self):
        cases = {
            "Not Found: /api/v1/campaigns/unsubscribe/XVz1Bta3olQ0FX6U4_eP6WvEnTd/": (
                "Not Found: /api/v1/campaigns/unsubscribe/[REDACTED]/"
            ),
            "POST /api/v1/campaigns/unsubscribe/abc-123/ HTTP/1.1": (
                "POST /api/v1/campaigns/unsubscribe/[REDACTED]/ HTTP/1.1"
            ),
            "GET /api/v1/campaigns/12/sends/ HTTP/1.1": "GET /api/v1/campaigns/12/sends/ HTTP/1.1",
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(redact(raw), expected)

    def test_filter_rewrites_the_record_before_formatting(self):
        record = logging.LogRecord(
            "x", logging.INFO, __file__, 1, "token=%s for %s", ("secret-value", "bob"), None
        )
        self.assertTrue(RedactFilter().filter(record))
        payload = json.loads(JSONFormatter().format(record))
        self.assertEqual(payload["message"], "token=[REDACTED] for bob")
        self.assertEqual(payload["level"], "INFO")
        self.assertIn("ts", payload)


class AccessLogRedactionTests(SimpleTestCase):
    """Whichever logger writes a request's path, it must come out redacted.

    `django.channels.server` is Daphne's own `manage.py runserver` access
    logger (daphne/management/commands/runserver.py); plain `daphne`-the-module
    loggers (daphne.cli, daphne.server, ...) log the same way in production.
    Neither is configured with its own handler in LOGGING (config/settings.py),
    so both propagate to root's single "console" handler, which carries
    RedactFilter. `assertLogs` would prove nothing here: it swaps the named
    logger's handlers for its own uninstrumented one and turns propagation
    off, bypassing RedactFilter entirely — so this drives the *real*
    configured handler directly instead.
    """

    def _logged_through_root(self, logger_name, message):
        root_handler = logging.getLogger().handlers[0]
        original_stream = root_handler.stream
        buffer = io.StringIO()
        root_handler.stream = buffer
        try:
            logging.getLogger(logger_name).warning(message)
        finally:
            root_handler.stream = original_stream
        return buffer.getvalue()

    def test_django_channels_server_is_redacted_through_the_real_handler(self):
        token = "XVz1Bta3olQ0FX6U4_eP6WvEnTdlwNBQ-sGR_fWRWyE"
        output = self._logged_through_root(
            "django.channels.server", f"HTTP GET /api/v1/public/surveys/{token}/ 200 [0.01]"
        )
        self.assertNotIn(token, output)
        self.assertIn("[REDACTED]", output)

    def test_daphne_is_redacted_through_the_real_handler(self):
        token = "XVz1Bta3olQ0FX6U4_eP6WvEnTdlwNBQ-sGR_fWRWyE"
        output = self._logged_through_root(
            "daphne.http_protocol", f"HTTP request for /api/v1/public/surveys/{token}/"
        )
        self.assertNotIn(token, output)
        self.assertIn("[REDACTED]", output)

    def test_production_daphne_does_not_run_its_own_unfiltered_access_log(self):
        """Daphne's CLI access log (daphne/access.py: `AccessLogGenerator`)
        writes one NCSA-style line per request *straight to a stream*,
        bypassing the `logging` module — and therefore RedactFilter —
        entirely. At its default verbosity (1) it turns this on for every
        request, 200s included, the moment no `--access-log` flag is given.
        The Dockerfile's `daphne` invocation must disable it explicitly
        (`-v 0`); nothing short of that keeps the raw path, and the raw
        token on a live link, off this container's stdout."""
        dockerfile = pathlib.Path(__file__).resolve().parents[2] / "Dockerfile"
        text = dockerfile.read_text()
        self.assertIn('"daphne"', text)
        cmd_line = next(line for line in text.splitlines() if '"daphne"' in line)
        self.assertTrue(
            '"-v", "0"' in cmd_line or '"--verbosity", "0"' in cmd_line,
            f"daphne's own access log must be disabled explicitly: {cmd_line}",
        )


class RequestIDTests(TestCase):
    def test_generated_when_missing_and_echoed_in_the_header(self):
        response = self.client.get("/api/v1/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response["X-Request-ID"]), 32)

    def test_client_supplied_id_is_kept_only_when_safe(self):
        kept = self.client.get("/api/v1/health/", HTTP_X_REQUEST_ID="trace-42")
        self.assertEqual(kept["X-Request-ID"], "trace-42")
        replaced = self.client.get("/api/v1/health/", HTTP_X_REQUEST_ID="bad id\nX-Injected: 1")
        self.assertNotEqual(replaced["X-Request-ID"], "bad id\nX-Injected: 1")
        self.assertEqual(len(replaced["X-Request-ID"]), 32)

    def test_context_is_cleared_after_the_request(self):
        self.client.get("/api/v1/health/", HTTP_X_REQUEST_ID="trace-42")
        self.assertEqual(get_request_id(), "")


class EmailTimeoutTests(SimpleTestCase):
    """A mail server that accepts the connection and goes silent must not
    hang the minute runner: every SMTP socket has a timeout."""

    def test_the_timeout_defaults_to_30_seconds(self):
        self.assertEqual(settings.EMAIL_TIMEOUT, 30)

    @override_settings(EMAIL_TIMEOUT=7)
    def test_the_smtp_backend_uses_it(self):
        from django.core.mail.backends.smtp import EmailBackend

        self.assertEqual(EmailBackend().timeout, 7)
