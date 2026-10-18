"""Gmail's Pub/Sub push (contract §7): only a Google-signed OIDC token for
the configured audience and service account gets in, and fails closed when
either is unset; a verified push only sets wake_at, and only on a live,
unpaused mailbox that holds older history; every push is acknowledged so
Pub/Sub never retries a useless one; rejections are audited."""

import base64
import io
import json
import time
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone

from core.models import AuditEvent
from core.throttling import GmailPushThrottle
from services.mail import push as push_module
from services.mail.models import MailboxConnection

from .gmail_fixtures import GmailFixture

URL = "/api/v1/mail/google/push/"
AUDIENCE = "https://revenact.test/api/v1/mail/google/push/"
ACCOUNT = "gmail-push@revenact-test.iam.gserviceaccount.com"
#: The real lookup, before PushTests patches it out.
REAL_SIGNING_KEY = push_module._signing_key
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def token(key=KEY, **claims):
    now = int(time.time())
    body = {
        "aud": AUDIENCE,
        "iss": "https://accounts.google.com",
        "iat": now,
        "exp": now + 300,
        "email": ACCOUNT,
        "email_verified": True,
        **claims,
    }
    return jwt.encode({k: v for k, v in body.items() if v is not None}, key, algorithm="RS256")


def envelope(address="dana@acme.io", history_id=5000):
    data = base64.b64encode(
        json.dumps({"emailAddress": address, "historyId": history_id}).encode()
    ).decode()
    return {
        "message": {
            "data": data,
            "messageId": "2070443601311540",
            "publishTime": "2026-10-10T09:14:01Z",
        },
        "subscription": "projects/revenact/subscriptions/gmail-push",
    }


@override_settings(
    GMAIL_PUBSUB_TOPIC="projects/revenact/topics/gmail",
    GMAIL_PUBSUB_AUDIENCE=AUDIENCE,
    GMAIL_PUBSUB_SERVICE_ACCOUNT=ACCOUNT,
)
class PushTests(GmailFixture):
    def setUp(self):
        super().setUp()
        cache.clear()
        patcher = patch("services.mail.push._signing_key", return_value=KEY.public_key())
        patcher.start()
        self.addCleanup(patcher.stop)
        self.mailbox = self.google(self.dana, history_id=4000)

    def push(self, body=None, bearer=None, raw=None):
        headers = {} if bearer is False else {"HTTP_AUTHORIZATION": f"Bearer {bearer or token()}"}
        payload = raw if raw is not None else json.dumps(body or envelope())
        return self.client.generic("POST", URL, payload, content_type="application/json", **headers)

    def woken(self):
        self.mailbox.refresh_from_db()
        return self.mailbox.wake_at

    def test_a_verified_push_wakes_the_mailbox_and_nothing_else(self):
        with patch("services.mail.providers.google.http_json") as google:
            response = self.push()
        self.assertEqual((response.status_code, response.content), (204, b""))
        self.assertIsNotNone(self.woken())
        google.assert_not_called()

    def test_an_earlier_wake_is_kept(self):
        earlier = timezone.now().replace(microsecond=0) - timezone.timedelta(minutes=5)
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(wake_at=earlier)
        self.push()
        self.assertEqual(self.woken(), earlier)

    def test_useless_pushes_are_acknowledged_and_ignored(self):
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(history_id=6000)
        for body, raw in (
            (envelope(history_id=5000), None),
            (envelope(address="stranger@acme.io"), None),
            ({"message": {"data": "not base64 json"}}, None),
            (None, "not json"),
        ):
            with self.subTest(body=body, raw=raw):
                self.assertEqual(self.push(body, raw=raw).status_code, 204)
        self.assertIsNone(self.woken())

    def test_a_paused_or_disconnected_mailbox_is_not_woken(self):
        for fields in ({"paused_reason": "workspace_off"}, {"status": "disconnected"}):
            with self.subTest(fields=fields):
                MailboxConnection.objects.filter(pk=self.mailbox.pk).update(
                    **{"paused_reason": "", "status": "connected", "wake_at": None, **fields}
                )
                self.assertEqual(self.push().status_code, 204)
                self.assertIsNone(self.woken())

    def test_bad_tokens_are_refused_and_audited(self):
        expired = token(exp=int(time.time()) - 10)
        for bearer, status_code, reason in (
            (False, 401, "missing"),
            ("not-a-jwt", 401, "invalid"),
            (token(OTHER_KEY), 401, "invalid"),
            (expired, 401, "invalid"),
            (token(aud="https://elsewhere.test/"), 401, "audience"),
            (token(iss="https://evil.example.com"), 401, "issuer"),
            (token(email="someone@evil.iam.gserviceaccount.com"), 403, "service_account"),
            (token(email_verified=False), 403, "service_account"),
        ):
            with self.subTest(reason=reason, status=status_code):
                AuditEvent.objects.all().delete()
                self.assertEqual(self.push(bearer=bearer).status_code, status_code)
                event = AuditEvent.objects.get(action="mailbox.push_rejected")
                self.assertEqual(
                    (event.outcome, event.actor, event.metadata),
                    ("failure", None, {"reason": reason}),
                )
        self.assertIsNone(self.woken())

    @override_settings(GMAIL_PUBSUB_AUDIENCE="")
    def test_without_an_audience_every_push_fails_closed(self):
        self.assertEqual(self.push().status_code, 401)
        self.assertEqual(
            AuditEvent.objects.get(action="mailbox.push_rejected").metadata,
            {"reason": "not_configured_audience"},
        )

    @override_settings(GMAIL_PUBSUB_SERVICE_ACCOUNT="")
    def test_without_a_service_account_every_push_fails_closed(self):
        self.assertEqual(self.push().status_code, 401)
        self.assertEqual(
            AuditEvent.objects.get(action="mailbox.push_rejected").metadata,
            {"reason": "not_configured_service_account"},
        )

    def claims(self, **extra):
        now = int(time.time())
        return {
            "aud": AUDIENCE,
            "iss": "https://accounts.google.com",
            "iat": now,
            "exp": now + 300,
            "email": ACCOUNT,
            "email_verified": True,
            **extra,
        }

    def assert_rejected(self, bearer, reason="invalid"):
        AuditEvent.objects.all().delete()
        self.assertEqual(self.push(bearer=bearer).status_code, 401)
        event = AuditEvent.objects.get(action="mailbox.push_rejected")
        self.assertEqual((event.outcome, event.metadata), ("failure", {"reason": reason}))
        self.assertIsNone(self.woken())

    def test_unsigned_and_hs256_tokens_are_refused(self):
        unsigned = jwt.encode(self.claims(), None, algorithm="none")
        hmac = jwt.encode(self.claims(), "a-shared-secret-of-enough-length!", algorithm="HS256")
        for bearer in (unsigned, hmac):
            with self.subTest(alg=jwt.get_unverified_header(bearer)["alg"]):
                self.assert_rejected(bearer)

    def test_the_bare_issuer_is_accepted(self):
        self.assertEqual(self.push(bearer=token(iss="accounts.google.com")).status_code, 204)
        self.assertIsNotNone(self.woken())

    def test_a_jwks_outage_fails_closed_and_is_audited(self):
        outage = jwt.PyJWKClientConnectionError("Fail to fetch data from the url")
        with patch("services.mail.push._signing_key", side_effect=outage):
            self.assert_rejected(token())

    def test_a_jwks_answer_that_is_not_json_fails_closed_and_is_audited(self):
        class Opener:
            def open(self, request, timeout=None):
                return io.BytesIO(b"<html>Service Unavailable</html>")

        with (
            patch("services.mail.push._signing_key", REAL_SIGNING_KEY),
            patch("services.mail.push._jwks", None),
            patch("jwt.jwks_client.urllib.request.build_opener", return_value=Opener()),
        ):
            self.assert_rejected(token())

    @override_settings(GMAIL_PUBSUB_TOPIC="")
    def test_push_off_is_404(self):
        self.assertEqual(self.push().status_code, 404)

    def test_a_body_over_64_kb_is_413(self):
        self.assertEqual(self.push(raw="x" * (64 * 1024 + 1)).status_code, 413)

    def test_it_is_throttled_per_source_ip(self):
        with patch.object(GmailPushThrottle, "rate", "2/min"):
            codes = [self.push().status_code for _ in range(3)]
        self.assertEqual(codes, [204, 204, 429])
