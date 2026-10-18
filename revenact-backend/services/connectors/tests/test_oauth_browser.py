"""A connector's OAuth link finishes only in the browser that started it
(agent bundles D3 contract §5.4, D3-22): a forwarded link connects nothing."""

from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.test import override_settings
from rest_framework.test import APITestCase

from core.models import AuditEvent
from services.accounts.models import Organisation, User
from services.connectors.models import Connector
from services.connectors.providers.slack import SlackProvider
from services.segments.tests.fixtures import person

START = "/api/v1/connectors/{}/connect/"
CALLBACK = "/api/v1/connectors/oauth/slack/callback/"
COOKIE = "revenact_connector_oauth"


@override_settings(SLACK_OAUTH_CLIENT_ID="id", SLACK_OAUTH_CLIENT_SECRET="secret")
class ConnectorOAuthBrowserTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organisation.objects.create(name="Acme Inc", currency="USD")
        cls.admin = person(
            "alice@acme.io",
            "Alice Admin",
            cls.org,
            role=User.Role.ADMIN,
            function=User.Function.LEADERSHIP,
        )
        cls.slack = Connector.objects.create(
            organisation=cls.org, provider="slack", name="Slack", department="cs"
        )

    def start(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            START.format(self.slack.pk), {"oauth": True, "channel": "C0SUPPORT"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        state = parse_qs(urlsplit(response.json()["authorize_url"]).query)["state"][0]
        # force_authenticate(None) logs the client out, which clears its cookies:
        # keep the browser's cookie while the public callback is called unauthenticated.
        cookies = self.client.cookies
        self.client.force_authenticate(None)
        self.client.cookies = cookies
        return response, state

    def test_the_start_sets_an_http_only_cookie(self):
        response, _ = self.start()
        cookie = response.cookies[COOKIE]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["path"], "/api/v1/connectors/oauth/")
        self.assertEqual(cookie["samesite"], "Lax")

    def test_over_https_the_cookie_is_host_prefixed(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            START.format(self.slack.pk),
            {"oauth": True, "channel": "C0SUPPORT"},
            format="json",
            secure=True,
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertNotIn(COOKIE, response.cookies)
        cookie = response.cookies[f"__Host-{COOKIE}"]
        self.assertEqual(cookie["path"], "/")
        self.assertTrue(cookie["secure"])
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Lax")
        self.assertEqual(cookie["max-age"], 900)

    def test_the_same_browser_connects(self):
        _, state = self.start()
        with patch.object(
            SlackProvider,
            "exchange_code",
            return_value=({"channel": "C0SUPPORT", "channel_name": "support"}, {"bot_token": "x"}),
        ) as exchange:
            answer = self.client.get(CALLBACK, {"code": "c", "state": state})
        self.assertEqual(answer.status_code, 302)
        self.assertIn("connector=connected", answer["Location"])
        exchange.assert_called_once()
        self.assertEqual(answer.cookies[COOKIE].value, "")

    def test_a_forwarded_link_is_refused_before_any_exchange(self):
        _, state = self.start()
        self.client.cookies.clear()
        with patch.object(SlackProvider, "exchange_code") as exchange:
            answer = self.client.get(CALLBACK, {"code": "c", "state": state})
        exchange.assert_not_called()
        self.assertEqual(answer.cookies[COOKIE]["max-age"], 0)
        self.assertIn("connector=error", answer["Location"])
        self.assertIn("Open+the+link+in+the+browser+that+started+it.", answer["Location"])
        event = AuditEvent.objects.get(action="connector.oauth_refused")
        self.assertEqual(event.metadata, {"provider": "slack", "reason": "other_browser"})
        self.slack.refresh_from_db()
        self.assertFalse(self.slack.has_credentials)

    def test_another_browsers_cookie_is_refused(self):
        _, state = self.start()
        self.client.cookies[COOKIE] = "someone-elses-nonce"
        with patch.object(SlackProvider, "exchange_code") as exchange:
            answer = self.client.get(CALLBACK, {"code": "c", "state": state})
        exchange.assert_not_called()
        self.assertEqual(answer.cookies[COOKIE]["max-age"], 0)
        self.assertIn("connector=error", answer["Location"])


@override_settings(SLACK_OAUTH_CLIENT_ID="id", SLACK_OAUTH_CLIENT_SECRET="secret")
class SlackReconnectTests(APITestCase):
    """Slack escalations D3 carries: SC3-13 (consent keeps chat:write) and R4
    (a token reconnect keeps the legacy single channel)."""

    @classmethod
    def setUpTestData(cls):
        cls.org = Organisation.objects.create(name="Acme Inc", currency="USD")
        cls.admin = person("alice@acme.io", "Alice Admin", cls.org, role=User.Role.ADMIN)
        cls.slack = Connector.objects.create(
            organisation=cls.org,
            provider="slack",
            name="Slack",
            granted_scopes=["channels:history", "chat:write"],
            config={"channel": "C0SUPPORT", "channel_name": "support"},
        )

    def test_an_oauth_connect_on_a_connection_that_can_post_asks_for_chat_write(self):
        self.client.force_authenticate(self.admin)
        answer = self.client.post(START.format(self.slack.pk), {"oauth": True}, format="json")
        self.assertEqual(answer.status_code, 200, answer.content)
        scopes = parse_qs(urlsplit(answer.json()["authorize_url"]).query)["scope"][0]
        self.assertIn("chat:write", scopes.split(","))

    def test_a_token_reconnect_keeps_the_legacy_channel(self):
        from services.connectors.tests.slack_fake import FakeSlackApi, use_slack

        use_slack(self, FakeSlackApi())
        self.client.force_authenticate(self.admin)
        answer = self.client.post(
            START.format(self.slack.pk), {"bot_token": "xoxb-test-only"}, format="json"
        )
        self.assertEqual(answer.status_code, 201, answer.content)
        self.slack.refresh_from_db()
        self.assertEqual(self.slack.config["channel"], "C0SUPPORT")
        self.assertEqual(self.slack.config["channel_name"], "support")
        self.assertEqual(self.slack.config["via"], "token")
