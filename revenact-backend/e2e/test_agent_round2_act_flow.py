"""End-to-end tier: real server, real HTTP, real test DB; Atlassian, Jira
and Slack are fakes (their APIs in memory), the model is a fake. Nothing
leaves the process.

Journey (round 2 D2): Alice connects Jira and Slack and lets agents act in
both. Carl links his Atlassian account (the OAuth round trip in his
browser), sees "as you" on a Jira step, and runs it: the issue is created
with his Bearer token through api.atlassian.com. He moves the Slack step to
#escalations, which no connector syncs, from the live list; it posts there
as a new message. Atlassian then refuses his refresh token: his next Jira
step is blocked with the lost-link sentence, never run as the bot. He
unlinks, and the same step runs as Jira Bot."""

import json
import time
import urllib.error
import urllib.request
from urllib.parse import parse_qs, urlsplit

from django.core.cache import cache
from django.test import LiveServerTestCase, override_settings

from core.models import AuditEvent
from e2e.agent_round2_world import Round2World
from e2e.http import http_delete, http_get, http_post
from services.agents.models import SignalThread
from services.connectors.models import JiraLink, SlackChannel
from services.connectors.tests.atlassian_fake import use_atlassian
from services.connectors.tests.slack_fake import FakeSlackApi

LOG_IT = {
    "kind": "jira.create",
    "title": "Log the login loop",
    "rationale": "Engineering must fix it.",
    "payload": {
        "summary": "Login loop after password reset",
        "description": "Nobody can log in since the reset.",
        "priority": "high",
        "assignee_id": None,
    },
}


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


@override_settings(
    ATLASSIAN_OAUTH_CLIENT_ID="cid",
    ATLASSIAN_OAUTH_CLIENT_SECRET="secret",
    FRONTEND_URL="https://app.test",
)
class AgentActAsPersonFlowTests(Round2World, LiveServerTestCase):
    def setUp(self):
        cache.clear()
        self.use_world_fakes(
            FakeSlackApi(scopes=("channels:read", "groups:read", "channels:history", "chat:write"))
        )
        self.atlassian = use_atlassian(self)

    def world(self):
        """Alice connects Slack and Jira and lets agents act in both; the
        agents read the customer's Slack message and propose a Slack reply
        and a Jira issue. (alice token, carl, bundle)"""
        alice, carl, _ = self.workspace()
        slack, jira, _ = self.connect_slack_and_jira(alice)
        for connector in (jira, slack):
            status, body = http_post(
                self.api(f"/connectors/{connector['id']}/agents/"), {"can_act": True}, token=alice
            )
            self.assertEqual((status, body["agents"]["can_act"]), (200, True), body)
        self.alice, self.slack_id = alice, slack["id"]
        bundle = self.read_new_thread(
            carl,
            [
                {
                    "kind": "slack.reply",
                    "title": "Tell Ann we're on it",
                    "rationale": "She is locked out.",
                    "payload": {"text": "Thanks Ann, we're on it."},
                },
                LOG_IT,
            ],
        )
        return alice, carl, bundle

    def read_new_thread(self, user, actions):
        """Slack is synced and the agents read the thread it files, answering
        `actions`. The bundle made."""
        before = set(SignalThread.objects.values_list("pk", flat=True))
        # D3 (SC3-6): the catch-up reads at most once a minute; this is later
        SlackChannel.objects.update(asked_at=None)
        status, _ = http_post(self.api(f"/connectors/{self.slack_id}/sync/"), {}, token=self.alice)
        self.assertEqual(status, 200)
        [thread] = SignalThread.objects.exclude(pk__in=before)
        return self.read_thread(user.organisation, thread, "message ", actions)

    def another_jira_bundle(self, user):
        """The customer writes again in #support: a second thread, whose
        escalation bundle's first step is its jira.create."""
        # D3: a new message is newer than the catch-up's watermark (SC3-6)
        ts = f"{int(time.time())}.000100"
        self.slack.channels["C0SUPPORT"].append(
            {"ts": ts, "user": "U1", "text": "Pizza Hut again: still locked out, any news?"}
        )
        return self.read_new_thread(user, [LOG_IT])

    def start_link(self, token):
        request = urllib.request.Request(
            self.api("/connectors/jira-link/"),
            data=b"{}",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
            method="POST",
        )
        with urllib.request.urlopen(request) as response:
            body = json.loads(response.read())
            cookie = response.headers["Set-Cookie"].split(";", 1)[0]
        state = parse_qs(urlsplit(body["authorize_url"]).query)["state"][0]
        return state, cookie

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

    def test_carl_acts_as_himself_then_his_lost_link_blocks(self):
        alice, carl_user, bundle = self.world()
        carl = self.login("carl@acme.io")

        # Carl links his Atlassian account: the OAuth round trip in his browser.
        state, cookie = self.start_link(carl)
        landed = self.landing(
            self.api(f"/connectors/jira-link/callback/?code=good-code&state={state}"), cookie
        )
        self.assertEqual(landed, {"jira_link": "linked"})
        status, body = http_get(self.api("/connectors/jira-link/"), carl)
        self.assertEqual(body["link"]["name"], "Carl Lee")

        status, detail = http_get(self.api(f"/agents/bundles/{bundle.pk}/"), carl)
        # A Slack thread's issue is an escalation (Slack escalations D4): its
        # assignment and to-do sit between the issue and the reply, last.
        create, assign, todo, reply = detail["steps"]
        self.assertEqual(
            [s["kind"] for s in detail["steps"]],
            ["jira.create", "jira.assign", "task.create", "slack.reply"],
        )
        self.assertEqual(
            (create["preview"]["jira"]["as"], create["preview"]["jira"]["as_you"]),
            ("Carl Lee", True),
        )

        # He moves the reply to #escalations, which no connector syncs (a moved
        # reply never carries the Jira key, so he writes it plainly), and runs
        # the issue and the reply.
        status, body = http_get(
            self.api(
                f"/agents/bundles/{bundle.pk}/steps/{reply['id']}/options/slack_channels/?live=1&query=esc"
            ),
            carl,
        )
        [escalations] = body["options"]
        self.assertEqual(escalations["detail"], "Not synced")
        status, body = http_post(
            self.api(f"/agents/bundles/{bundle.pk}/run/"),
            {
                "steps": [
                    {"id": create["id"], "selected": True},
                    {"id": assign["id"], "selected": False},
                    {"id": todo["id"], "selected": False},
                    {
                        "id": reply["id"],
                        "selected": True,
                        "fields": {
                            "channel_choice": escalations["id"],
                            "text": "Thanks Ann, we're on it.",
                        },
                    },
                ]
            },
            token=carl,
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(
            [s["status"] for s in body["bundle"]["steps"]],
            ["applied", "skipped", "skipped", "applied"],
        )
        self.assertEqual(self.slack.posts("C0ESCALATE")[0].get("thread_ts"), None)
        self.assertIn("Bearer at-1", self.jira.callers)
        self.assertTrue(
            any(u.startswith("https://api.atlassian.com/ex/jira/") for u in self.jira.urls)
        )
        self.assertEqual(
            set(
                AuditEvent.objects.filter(
                    action="agent_outside.call", metadata__tool="jira"
                ).values_list("metadata__as", flat=True)
            ),
            {"person"},
        )

        # Atlassian refuses the refresh: the next Jira step fails with the
        # lost-link sentence and the link is lost; nothing runs as the bot.
        link = JiraLink.objects.get()
        creds = link.get_credentials()
        link.set_credentials({**creds, "expires_at": time.time() - 1})
        link.save()
        self.atlassian.refuse_refresh()
        second = self.another_jira_bundle(carl_user)
        calls_before = len(self.jira.calls)
        status, body = http_post(
            self.api(f"/agents/bundles/{second.pk}/run/"),
            {
                "steps": [
                    {"id": pk, "selected": kind == "jira.create"}
                    for pk, kind in second.steps.values_list("pk", "kind")
                ]
            },
            token=carl,
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(
            (body["bundle"]["steps"][0]["status"], body["bundle"]["steps"][0]["error"]),
            (
                "failed",
                "Your Jira link stopped working. Link Jira again, "
                "or remove the link to act as Jira Bot.",
            ),
        )
        self.assertEqual(self.jira.created[1:], [])
        self.assertNotIn("basic", self.jira.callers[calls_before:])
        self.assertEqual(JiraLink.objects.get().status, "lost")
        self.assertTrue(AuditEvent.objects.filter(action="jira.link_lost").exists())

        # Unlinked, the retry acts as the connection.
        self.assertEqual(http_delete(self.api("/connectors/jira-link/"), carl)[0], 204)
        status, body = http_post(
            self.api(
                f"/agents/bundles/{second.pk}/steps/{second.steps.get(kind='jira.create').pk}/retry/"
            ),
            {},
            token=carl,
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(body["bundle"]["steps"][0]["status"], "applied")
        self.assertEqual(self.jira.callers[-1], "basic")
        self.assertEqual(len(self.jira.created), 2)
