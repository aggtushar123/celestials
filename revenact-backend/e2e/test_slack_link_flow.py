"""End-to-end tier: real server, real HTTP, real test DB; Slack's API is a
fake (in memory) and so is the model. Nothing leaves the process.

Journey (Connections spec §3 Slack): Alice connects #support. Carl links
his own Slack account (the OAuth round trip in his browser, user scopes
only). In a DM, he clicks "Send to Revenact" on Ann's message: Slack's
signed request lands, the message becomes a suggestion in Carl's Work
naming Pizza Hut, and Slack tells him so. Alice, an admin with view-all,
sees nothing of it and can't dismiss it. Carl dismisses it, then unlinks:
the token is revoked."""

import hashlib
import hmac
import json
import secrets
import time
import urllib.error
import urllib.request
from unittest.mock import patch
from urllib.parse import parse_qs, urlencode, urlsplit

from django.core.cache import cache
from django.test import LiveServerTestCase, override_settings

from core.models import AuditEvent
from e2e.agent_round2_world import Round2World
from e2e.http import http_delete, http_get, http_post
from services.connectors.models import SlackLink
from services.connectors.tests.slack_fake import FakeSlackApi
from services.customers.models import Contact

#: A fresh signing secret per run: never a real one.
SIGNING = secrets.token_hex(16)
HOOK = "https://hooks.slack.com/actions/T0ACME/1/e2e"


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


@override_settings(
    SLACK_OAUTH_CLIENT_ID="cid",
    SLACK_OAUTH_CLIENT_SECRET="secret",
    SLACK_SIGNING_SECRET=SIGNING,
    FRONTEND_URL="https://app.test",
)
class SlackLinkFlowTests(Round2World, LiveServerTestCase):
    def setUp(self):
        cache.clear()
        self.use_world_fakes(FakeSlackApi())
        model = patch(
            "services.copilot.anthropic_client.get_completion",
            return_value=json.dumps({"summary": "Ann reports SSO is down.", "step": "jira.create"}),
        )
        model.start()
        self.addCleanup(model.stop)

    def connect_slack(self, alice):
        status, slack = http_post(
            self.api("/connectors/"),
            {"provider": "slack", "name": "Support Slack", "department": "cs"},
            token=alice,
        )
        self.assertEqual(status, 201, slack)
        status, body = http_post(
            self.api(f"/connectors/{slack['id']}/connect/"),
            {"channel": "C0SUPPORT", "bot_token": "xoxb-e2e"},
            token=alice,
        )
        self.assertEqual(status, 201, body)

    def start_link(self, token):
        request = urllib.request.Request(
            self.api("/connectors/slack-link/"),
            data=b"{}",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
            method="POST",
        )
        with urllib.request.urlopen(request) as response:
            body = json.loads(response.read())
            cookie = response.headers["Set-Cookie"].split(";", 1)[0]
        query = parse_qs(urlsplit(body["authorize_url"]).query)
        self.assertEqual(query["user_scope"], ["chat:write,users:read"])
        return query["state"][0], cookie

    def landing(self, url, cookie):
        opener = urllib.request.build_opener(_NoRedirect)
        opener.addheaders.append(("Cookie", cookie))
        try:
            opener.open(url)
        except urllib.error.HTTPError as redirect:
            self.assertEqual(redirect.code, 302)
            return {
                k: v[0] for k, v in parse_qs(urlsplit(redirect.headers["Location"]).query).items()
            }
        self.fail("the callback did not redirect")

    def click_send_to_revenact(self, *, secret=SIGNING):
        payload = {
            "type": "message_action",
            "callback_id": "send_to_revenact",
            "team": {"id": "T0ACME"},
            "user": {"id": "U0CARL"},
            "channel": {"id": "D0DM"},
            "message": {
                "user": "U0ANN",
                "ts": "1760400000.000100",
                "text": "Carl, our SSO has been down since 9am.",
            },
            "response_url": HOOK,
        }
        body = urlencode({"payload": json.dumps(payload)}).encode()
        stamp = str(int(time.time()))
        signature = (
            "v0="
            + hmac.new(secret.encode(), f"v0:{stamp}:".encode() + body, hashlib.sha256).hexdigest()
        )
        request = urllib.request.Request(
            self.api("/connectors/slack/interactivity/"),
            data=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Slack-Request-Timestamp": stamp,
                "X-Slack-Signature": signature,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request) as response:
                return response.status
        except urllib.error.HTTPError as refused:
            return refused.code

    def slack_items(self, token, path="/work/feed/"):
        status, body = http_get(self.api(path), token)
        self.assertEqual(status, 200, body)
        return [i for g in body["groups"] for i in g["items"] if i["kind"] == "slack_message"]

    def test_carl_sends_a_dm_to_his_own_work_and_nobody_else_sees_it(self):
        alice, _carl, pizza = self.workspace()
        Contact.objects.create(customer=pizza, name="Ann Lee", email="ann@pizzahut.com")
        self.connect_slack(alice)
        carl = self.login("carl@acme.io")

        # Before linking, a forged click (wrong secret) is refused.
        self.assertEqual(self.click_send_to_revenact(secret="forged"), 401)

        # Carl links his Slack account in his browser.
        state, cookie = self.start_link(carl)
        landed = self.landing(
            self.api(f"/connectors/slack-link/callback/?code=good&state={state}"), cookie
        )
        self.assertEqual(landed, {"slack_link": "linked"})
        status, body = http_get(self.api("/connectors/slack-link/"), carl)
        self.assertEqual(
            (body["configured"], body["workspace_connected"], body["link"]["slack_user_id"]),
            (True, True, "U0CARL"),
        )

        # He sends Ann's DM to Revenact.
        self.assertEqual(self.click_send_to_revenact(), 200)
        self.assertEqual(self.slack.hooks[-1][1]["text"], "Sent to your Work.")
        [item] = self.slack_items(carl)
        self.assertEqual(
            (item["title"], item["record"]["name"], item["private"]),
            ("Ann reports SSO is down.", "Pizza Hut", True),
        )

        # Alice (admin, view-all) sees nothing and can't dismiss it.
        self.assertEqual(self.slack_items(alice), [])
        status, body = http_get(self.api("/work/feed/team/"), alice)
        self.assertNotIn("slack_message", json.dumps(body))
        status, _ = http_delete(self.api(f"/work/slack-messages/{item['id']}/"), alice)
        self.assertEqual(status, 404)

        # Carl dismisses it, then unlinks: Slack revokes the token.
        status, _ = http_delete(self.api(f"/work/slack-messages/{item['id']}/"), carl)
        self.assertEqual(status, 204)
        self.assertEqual(self.slack_items(carl), [])
        status, _ = http_delete(self.api("/connectors/slack-link/"), carl)
        self.assertEqual(status, 204)
        self.assertFalse(SlackLink.objects.exists())
        self.assertEqual(self.slack.revoked, ["xoxp-u0carl"])
        self.assertEqual(
            set(
                AuditEvent.objects.filter(action__startswith="slack.").values_list(
                    "action", flat=True
                )
            ),
            {"slack.link", "slack.message_sent_to_work", "slack.message_dismissed", "slack.unlink"},
        )
