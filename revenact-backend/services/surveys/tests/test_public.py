"""The public link: no sign-in, the question and the workspace's name
only, one 404 body for every bad link, one answer, range-checked, locked
against a double submit, audited without the token, rate limited per IP."""

import json
import logging
from datetime import timedelta
from unittest import mock

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.test import Client
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from core.logging import RedactFilter
from core.models import AuditEvent
from core.throttling import SurveyLinkThrottle
from services.customers.models import Survey
from services.surveys.tests.fixtures import SurveyFixture, contact


class _CapturingHandler(logging.Handler):
    """Captures what a logger actually emits once RedactFilter has run on
    it — unlike `assertLogs`, which swaps the named logger's handlers for
    its own unfiltered one and turns propagation off, bypassing
    RedactFilter (attached to the real "console" handler) entirely."""

    def __init__(self):
        super().__init__()
        self.addFilter(RedactFilter())
        self.lines = []

    def emit(self, record):
        self.lines.append(record.getMessage())


URL = "/api/v1/public/surveys/{}/"
EXPIRED = {"detail": "This link has expired."}


class LinkFixture(SurveyFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.send = cls.make_send(
            intro="Two minutes, promise.", status="sent", started_at=cls.now, sent_at=cls.now
        )
        cls.live = cls.make_invite(cls.send, cls.ann)

    def get(self, token, **extra):
        return APIClient().get(URL.format(token), **extra)

    def post(self, token, body, **extra):
        return APIClient().post(URL.format(token), body, format="json", **extra)


class ReadLinkTests(LinkFixture):
    def test_a_live_link_shows_the_question_and_nothing_about_the_person(self):
        response = self.get(self.live.token)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "survey_type": "nps",
                "question": "How likely are you to recommend Acme Inc to a friend or colleague?",
                "intro": "Two minutes, promise.",
                "organisation_name": "Acme Inc",
            },
        )

    def test_no_sign_in_is_needed_or_read(self):
        response = self.get(self.live.token, HTTP_AUTHORIZATION="Bearer not-a-jwt")
        self.assertEqual(response.status_code, 200)

    def test_every_bad_link_reads_the_same(self):
        expired = self.make_invite(self.send, self.ben, expires_at=self.now - timedelta(seconds=1))
        answered = self.answered(self.send, self.tia, 9)
        failed = self.make_invite(self.send, self.tom, status="failed", failure="bounced")
        for token in (expired.token, answered.token, failed.token, "not-a-token", "x" * 500):
            response = self.get(token)
            self.assertEqual((response.status_code, response.json()), (404, EXPIRED), token[:20])

    def test_a_token_at_the_length_limit_is_looked_up_normally(self):
        response = self.get("x" * 100)
        self.assertEqual((response.status_code, response.json()), (404, EXPIRED))

    @mock.patch("services.surveys.public_views.hash_token")
    def test_a_token_over_the_length_limit_skips_hashing(self, hash_token):
        response = self.get("x" * 101)
        self.assertEqual((response.status_code, response.json()), (404, EXPIRED))
        hash_token.assert_not_called()


class AnswerLinkTests(LinkFixture):
    def test_an_answer_is_recorded_once_and_moves_the_score(self):
        response = self.post(self.live.token, {"score": 10, "comment": "  Great service  "})
        self.assertEqual(response.status_code, 204, response.content)
        self.live.refresh_from_db()
        self.assertEqual(
            (self.live.status, self.live.score, self.live.comment),
            ("answered", 10, "Great service"),
        )
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.nps_score, 100)
        self.assertTrue(Survey.objects.filter(send=self.send, customer=self.pizza).exists())
        second = self.post(self.live.token, {"score": 0})
        self.assertEqual((second.status_code, second.json()), (404, EXPIRED))
        self.live.refresh_from_db()
        self.assertEqual(self.live.score, 10)

    def test_the_answer_is_audited_without_the_token(self):
        self.post(self.live.token, {"score": 7})
        event = AuditEvent.objects.get(action="survey.answered")
        self.assertEqual(
            (event.target_id, event.actor, event.organisation, event.metadata),
            (str(self.live.pk), None, self.org, {"send": self.send.pk}),
        )
        self.assertNotIn(self.live.token, json.dumps(event.metadata) + event.target_repr)

    def test_a_bad_score_on_a_live_link_does_not_log_the_token(self):
        """Django's `django.request` logger writes the request path for
        every response >= 400 (a bad score is a 400 on a *live* link, the
        one case a dead-link-shaped token can't hide behind). Captured
        through the real RedactFilter, not `assertLogs` — see
        `_CapturingHandler`."""
        capture = _CapturingHandler()
        request_logger = logging.getLogger("django.request")
        request_logger.addHandler(capture)
        try:
            response = self.post(self.live.token, {"score": 999})
        finally:
            request_logger.removeHandler(capture)
        self.assertEqual(response.status_code, 400)
        logged = " ".join(capture.lines)
        self.assertNotIn(self.live.token, logged)
        self.assertIn("[REDACTED]", logged)

    def test_a_signed_in_session_without_csrf_still_answers(self):
        """The view ignores sessions entirely (`authentication_classes =
        []`, and DRF's `APIView.as_view` is csrf_exempt): a session-signed-in
        client with no CSRF token still gets through, and the audit still
        shows no actor."""
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.csm)
        response = client.post(
            URL.format(self.live.token),
            data=json.dumps({"score": 8}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 204, response.content)
        event = AuditEvent.objects.get(action="survey.answered")
        self.assertIsNone(event.actor)

    def test_a_signed_in_caller_is_never_the_actor_but_the_ip_is_kept(self):
        """Even a DRF-authenticated caller (the strongest form a signed-in
        browser could take) leaves the actor null: the token is the only
        credential. The request's IP is still recorded."""
        client = APIClient()
        client.force_authenticate(self.csm)
        response = client.post(
            URL.format(self.live.token), {"score": 9}, format="json", REMOTE_ADDR="203.0.113.7"
        )
        self.assertEqual(response.status_code, 204, response.content)
        event = AuditEvent.objects.get(action="survey.answered")
        self.assertEqual((event.actor, event.actor_email, event.organisation), (None, "", self.org))
        self.assertEqual(event.ip, "203.0.113.7")

    def test_the_score_must_fit_the_type(self):
        for survey_type, bad, low, high in (
            ("nps", 11, 0, 10),
            ("csat", 0, 1, 5),
            ("ces", 8, 1, 7),
        ):
            send = self.make_send(survey_type=survey_type)
            invite = self.make_invite(send, contact(self.pizza, f"P{survey_type}"))
            response = self.post(invite.token, {"score": bad})
            self.assertEqual(
                (response.status_code, response.json()),
                (400, {"score": [f"Choose a score from {low} to {high}."]}),
            )
            invite.refresh_from_db()
            self.assertEqual(invite.status, "pending")

    def test_a_score_is_a_whole_number(self):
        for bad in ("high", 7.5, None, True):
            response = self.post(self.live.token, {"score": bad})
            self.assertEqual((response.status_code, set(response.json())), (400, {"score"}), bad)

    def test_a_comment_is_at_most_2000_characters(self):
        response = self.post(self.live.token, {"score": 9, "comment": "x" * 2001})
        self.assertEqual((response.status_code, set(response.json())), (400, {"comment"}))
        self.assertEqual(
            self.post(self.live.token, {"score": 9, "comment": "x" * 2000}).status_code, 204
        )

    def test_an_expired_link_takes_no_answer(self):
        expired = self.make_invite(self.send, self.ben, expires_at=self.now - timedelta(seconds=1))
        response = self.post(expired.token, {"score": 9})
        self.assertEqual((response.status_code, response.json()), (404, EXPIRED))
        expired.refresh_from_db()
        self.assertEqual(expired.status, "pending")

    def test_the_answer_locks_the_invite(self):
        with CaptureQueriesContext(connection) as ctx:
            self.post(self.live.token, {"score": 8})
        self.assertTrue(
            any(
                "FOR UPDATE" in query["sql"] and '"surveys_surveyinvite"' in query["sql"]
                for query in ctx.captured_queries
            )
        )


class LinkThrottleTests(LinkFixture):
    def setUp(self):
        cache.clear()

    @mock.patch.object(SurveyLinkThrottle, "rate", "2/min")
    def test_reads_and_answers_share_one_limit_per_ip(self):
        ip = {"REMOTE_ADDR": "203.0.113.9"}
        self.assertEqual(self.get("nope", **ip).status_code, 404)
        self.assertEqual(self.post("nope", {"score": 1}, **ip).status_code, 404)
        blocked = self.get(self.live.token, **ip)
        self.assertEqual(blocked.status_code, 429)
        self.assertIn("Retry-After", blocked)
        self.assertEqual(self.get(self.live.token, REMOTE_ADDR="198.51.100.1").status_code, 200)

    def test_the_rate_is_30_a_minute(self):
        self.assertEqual(settings.AUTH_THROTTLE_RATES["survey_link"], "30/min")
