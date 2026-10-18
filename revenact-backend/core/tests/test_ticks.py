"""Scheduled ticks (core/ticks.py): only a Google-signed OIDC token for the
tick audience and service account runs a task, failing closed when either
is unset; only the named tasks exist; a task already running is skipped, not
doubled; a failed task is a 500; rejections are audited. Gmail's push syncs
inline only when MAIL_SYNC_ON_PUSH is on."""

import base64
import json
import time
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from django.db import connections
from django.test import TestCase, TransactionTestCase, override_settings

from core import ticks
from core.models import AuditEvent

AUDIENCE = "https://revenact.test/api/v1/internal/tick/"
ACCOUNT = "scheduler-invoker@revenact-test.iam.gserviceaccount.com"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PUSH_AUDIENCE = "https://revenact.test/api/v1/mail/google/push/"
PUSH_ACCOUNT = "gmail-push@revenact-test.iam.gserviceaccount.com"


def token(**claims):
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
    return jwt.encode(body, KEY, algorithm="RS256")


def url(task):
    return f"/api/v1/internal/tick/{task}/"


@override_settings(TICK_AUDIENCE=AUDIENCE, TICK_SERVICE_ACCOUNT=ACCOUNT)
class TickViewTests(TestCase):
    def setUp(self):
        patcher = patch("services.mail.push._signing_key", return_value=KEY.public_key())
        patcher.start()
        self.addCleanup(patcher.stop)

    def tick(self, task="deliver", bearer=None):
        headers = {} if bearer is False else {"HTTP_AUTHORIZATION": f"Bearer {bearer or token()}"}
        return self.client.post(url(task), **headers)

    def test_a_signed_tick_runs_its_task_and_reports_the_summary(self):
        with patch.dict(ticks.TASKS, {"deliver": lambda: "3 sent"}):
            response = self.tick()
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(
            (body["task"], body["ran"], body["ok"], body["summary"]),
            ("deliver", True, True, "3 sent"),
        )

    def test_every_loop_has_a_task(self):
        self.assertEqual(set(ticks.TASKS), {"mail", "deliver", "tickets", "agents"})

    def test_the_command_tasks_run_their_management_command(self):
        for task, command in (
            ("deliver", "deliver_pending"),
            ("tickets", "sync_tickets"),
            ("agents", "run_agent_signals"),
        ):
            with self.subTest(task=task), patch("core.ticks.call_command") as call:
                self.assertEqual(self.tick(task).status_code, 200)
                self.assertEqual(call.call_args.args, (command,))

    def test_the_mail_task_runs_one_pass_of_the_mail_loop(self):
        with patch("services.mail.loop.Loop.run_once", return_value=2) as run_once:
            response = self.tick("mail")
        run_once.assert_called_once()
        self.assertEqual(
            response.json()["summary"],
            "2 mailbox(es) synced; 0 calendar(s) synced",
        )

    def test_an_unknown_task_is_404_after_the_token_is_checked(self):
        self.assertEqual(self.tick("migrate").status_code, 404)
        self.assertEqual(self.tick("migrate", bearer=False).status_code, 401)

    def test_a_failed_task_is_a_500_without_its_message(self):
        def boom():
            raise RuntimeError("dana@acme.io said something private")

        with patch.dict(ticks.TASKS, {"deliver": boom}), self.assertLogs("core.views") as logs:
            response = self.tick()
        self.assertEqual((response.status_code, response.json()["ok"]), (500, False))
        self.assertNotIn("dana", "".join(logs.output))
        self.assertNotIn("dana", response.content.decode())

    def test_bad_tokens_are_refused_and_audited(self):
        for bearer, status_code, reason in (
            (False, 401, "missing"),
            ("not-a-jwt", 401, "invalid"),
            (token(exp=int(time.time()) - 10), 401, "invalid"),
            (token(aud=PUSH_AUDIENCE), 401, "audience"),
            (token(iss="https://evil.example.com"), 401, "issuer"),
            (token(email=PUSH_ACCOUNT), 403, "service_account"),
            (token(email_verified=False), 403, "service_account"),
        ):
            with self.subTest(reason=reason), patch.dict(ticks.TASKS, {"deliver": None}):
                AuditEvent.objects.all().delete()
                self.assertEqual(self.tick(bearer=bearer).status_code, status_code)
                event = AuditEvent.objects.get(action="tick.rejected")
                self.assertEqual(
                    (event.outcome, event.actor, event.metadata),
                    ("failure", None, {"reason": reason}),
                )

    def test_unset_settings_fail_closed(self):
        for overrides, reason in (
            ({"TICK_AUDIENCE": ""}, "not_configured_audience"),
            ({"TICK_SERVICE_ACCOUNT": ""}, "not_configured_service_account"),
        ):
            with self.subTest(reason=reason), override_settings(**overrides):
                AuditEvent.objects.all().delete()
                self.assertEqual(self.tick().status_code, 401)
                self.assertEqual(
                    AuditEvent.objects.get(action="tick.rejected").metadata, {"reason": reason}
                )

    def test_a_gmail_push_token_is_not_a_tick_token(self):
        # Same signer, the push's own audience and account: refused.
        with override_settings(GMAIL_PUBSUB_AUDIENCE=AUDIENCE, GMAIL_PUBSUB_SERVICE_ACCOUNT="x@y"):
            response = self.tick(bearer=token(email="x@y"))
        self.assertEqual(response.status_code, 403)


class TickLockTests(TransactionTestCase):
    """The advisory lock is per session, so a second connection stands in
    for a second Cloud Run instance."""

    def test_a_task_already_running_elsewhere_is_skipped(self):
        key = ticks._lock_key("deliver")
        other = connections.create_connection("default")
        try:
            with other.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_lock(%s)", [key])
            with patch.dict(ticks.TASKS, {"deliver": lambda: self.fail("ran twice")}):
                self.assertEqual(ticks.run("deliver"), (False, "already running", 0.0))
            with other.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(%s)", [key])
            with patch.dict(ticks.TASKS, {"deliver": lambda: "ok"}):
                self.assertTrue(ticks.run("deliver")[0])
        finally:
            other.close()

    def test_the_lock_is_released_when_a_task_fails(self):
        def boom():
            raise RuntimeError

        with patch.dict(ticks.TASKS, {"deliver": boom}), self.assertRaises(RuntimeError):
            ticks.run("deliver")
        with patch.dict(ticks.TASKS, {"deliver": lambda: "ok"}):
            self.assertTrue(ticks.run("deliver")[0])


@override_settings(
    GMAIL_PUBSUB_TOPIC="projects/revenact/topics/gmail",
    GMAIL_PUBSUB_AUDIENCE=PUSH_AUDIENCE,
    GMAIL_PUBSUB_SERVICE_ACCOUNT=PUSH_ACCOUNT,
)
class PushSyncTests(TestCase):
    def setUp(self):
        patcher = patch("services.mail.push._signing_key", return_value=KEY.public_key())
        patcher.start()
        self.addCleanup(patcher.stop)

    def push(self, woken):
        data = base64.b64encode(
            json.dumps({"emailAddress": "dana@acme.io", "historyId": 5}).encode()
        ).decode()
        bearer = token(aud=PUSH_AUDIENCE, email=PUSH_ACCOUNT)
        with (
            patch("services.mail.push.wake", return_value=woken),
            patch("core.ticks.run") as run,
        ):
            response = self.client.post(
                "/api/v1/mail/google/push/",
                json.dumps({"message": {"data": data}}),
                content_type="application/json",
                HTTP_AUTHORIZATION=f"Bearer {bearer}",
            )
        return response, run

    def test_off_by_default_the_push_only_wakes(self):
        response, run = self.push(woken=1)
        self.assertEqual(response.status_code, 204)
        run.assert_not_called()

    @override_settings(MAIL_SYNC_ON_PUSH=True)
    def test_on_a_push_that_woke_a_mailbox_runs_the_mail_tick(self):
        response, run = self.push(woken=1)
        self.assertEqual(response.status_code, 204)
        run.assert_called_once_with("mail")

    @override_settings(MAIL_SYNC_ON_PUSH=True)
    def test_on_a_useless_push_syncs_nothing(self):
        response, run = self.push(woken=0)
        self.assertEqual(response.status_code, 204)
        run.assert_not_called()

    @override_settings(MAIL_SYNC_ON_PUSH=True)
    def test_a_failed_sync_still_acknowledges_the_push(self):
        with patch("core.ticks.run", side_effect=RuntimeError):
            data = base64.b64encode(
                json.dumps({"emailAddress": "dana@acme.io", "historyId": 5}).encode()
            ).decode()
            with patch("services.mail.push.wake", return_value=1):
                response = self.client.post(
                    "/api/v1/mail/google/push/",
                    json.dumps({"message": {"data": data}}),
                    content_type="application/json",
                    HTTP_AUTHORIZATION=f"Bearer {token(aud=PUSH_AUDIENCE, email=PUSH_ACCOUNT)}",
                )
        self.assertEqual(response.status_code, 204)
