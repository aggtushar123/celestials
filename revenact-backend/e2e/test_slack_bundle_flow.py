"""End-to-end tier: real server, real HTTP, real test DB; Slack's and Jira's
APIs are fakes (in memory) and so is the model. Nothing leaves the process.

Journey (Slack bundles, owner 2026-10-17): Alice connects Slack and Jira
and lets agents act in both. In #support, Carl clicks "Send to Revenact" on
Ann's message about Pizza Hut: Slack's signed request makes his private
card at once. On the next minute's tick the agent proposes a bundle for it:
a Jira issue, his reply in the message's thread, and a survey of Pizza Hut's
people once the issue is resolved. The bundle replaces the card in Carl's
Work; Alice, an admin with view-all, can't open it. Carl runs it: the issue
is made in the Slack project, his reply carries its key in the thread, and
the survey waits. Engineering resolves the issue in Jira; the next tick asks
Jira, sends the survey as Carl, and Ann gets her email."""

import hashlib
import hmac
import json
import secrets
import time
import urllib.error
import urllib.request
from unittest.mock import patch
from urllib.parse import urlencode

from django.core import mail
from django.core.management import call_command
from django.test import LiveServerTestCase, override_settings

from e2e.agent_round2_world import Round2World
from e2e.http import http_get, http_post
from services.agents.models import AgentBundle, IssueWait
from services.connectors.tests.slack_fake import FakeSlackApi
from services.customers.models import Contact
from services.work.models import SlackSuggestion

#: A fresh signing secret per run: never a real one.
SIGNING = secrets.token_hex(16)
HOOK = "https://hooks.slack.com/actions/T0ACME/1/e2e"
TRIAGE = {
    "summary": "Ann reports SSO is down at Pizza Hut.",
    "step": "jira.create",
    "jira_summary": "Pizza Hut: SSO down since 9am",
    "jira_description": "Ann's admins can't sign in since 9am.",
    "reply": "Thanks Ann, looking now.",
    "reply_with_issue": "Thanks Ann, logged as {issue}.",
}
STEPS = {
    "title": "Pizza Hut: SSO down",
    "reason": "Ann's admins can't sign in since 9am.",
    "jira": {
        "use": True,
        "summary": "Pizza Hut: SSO down since 9am",
        "description": "Ann's admins can't sign in since 9am.",
        "priority": "high",
    },
    "reply": {
        "use": True,
        "text": "Thanks Ann, looking now.",
        "text_with_issue": "Thanks Ann, I've logged this as {issue}.",
    },
    "survey": {
        "use": True,
        "survey_type": "csat",
        "subject": "How did we do with the SSO fix?",
        "intro": "One question, thirty seconds.",
        "roles": ["champion"],
        "timing": "after_jira",
    },
}


@override_settings(
    SLACK_OAUTH_CLIENT_ID="cid",
    SLACK_OAUTH_CLIENT_SECRET="secret",
    SLACK_SIGNING_SECRET=SIGNING,
    SLACK_JIRA_PROJECT="SUP",
)
class SlackBundleFlowTests(Round2World, LiveServerTestCase):
    def setUp(self):
        self.use_world_fakes(FakeSlackApi())
        credits = patch("services.agents.policy.plan_credits", return_value=3000)
        credits.start()
        self.addCleanup(credits.stop)

    def click(self, ts):
        payload = {
            "type": "message_action",
            "callback_id": "send_to_revenact",
            "team": {"id": "T0ACME"},
            "user": {"id": "U0CARL"},
            "channel": {"id": "C0SUPPORT"},
            "message": {"user": "U0ANN", "ts": ts, "text": "Carl, our SSO is down since 9am."},
            "response_url": HOOK,
        }
        body = urlencode({"payload": json.dumps(payload)}).encode()
        stamp = str(int(time.time()))
        signature = (
            "v0="
            + hmac.new(SIGNING.encode(), f"v0:{stamp}:".encode() + body, hashlib.sha256).hexdigest()
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

    def items(self, token, kind):
        status, body = http_get(self.api("/work/feed/"), token)
        self.assertEqual(status, 200, body)
        return [i for g in body["groups"] for i in g["items"] if i["kind"] == kind]

    def test_a_slack_message_becomes_carls_bundle_and_the_survey_goes_once_jira_is_resolved(self):
        alice, _carl, pizza = self.workspace()
        Contact.objects.create(
            customer=pizza, name="Ann Lee", email="ann@pizzahut.com", role="champion"
        )
        self.slack.scopes.append("chat:write")
        slack, jira, _ = self.connect_slack_and_jira(alice)
        for row in (slack, jira):
            status, body = http_post(
                self.api(f"/connectors/{row['id']}/agents/"), {"can_act": True}, token=alice
            )
            self.assertEqual(status, 200, body)
        carl = self.login("carl@acme.io")

        # Carl sends Ann's message to Revenact: the card at once, its bundle pending.
        ts = self.slack.say("C0SUPPORT", "U0ANN", "Carl, our SSO is down since 9am.")
        with patch(
            "services.copilot.anthropic_client.get_completion", return_value=json.dumps(TRIAGE)
        ):
            self.assertEqual(self.click(ts), 200)
        row = SlackSuggestion.objects.get()
        self.assertEqual((row.customer_id, row.bundle_state), (pizza.pk, "pending"))
        [card] = self.items(carl, "slack_message")
        self.assertEqual(card["id"], row.pk)

        # The next minute's tick proposes the bundle; it replaces the card.
        with patch(
            "services.agents.slack_bundles.get_completion", return_value=json.dumps(STEPS)
        ) as model:
            call_command("deliver_pending")
        self.assertEqual(model.call_count, 1)
        bundle = AgentBundle.objects.get()
        self.assertEqual(self.items(carl, "slack_message"), [])
        [item] = self.items(carl, "bundle")
        self.assertEqual((item["id"], item["detail"]["routed_to"]), (bundle.pk, "person"))
        status, _ = http_get(self.api(f"/agents/bundles/{bundle.pk}/"), alice)
        self.assertEqual(status, 404)
        self.assertEqual(self.items(alice, "bundle"), [])

        status, detail = http_get(self.api(f"/agents/bundles/{bundle.pk}/"), carl)
        self.assertEqual(status, 200, detail)
        self.assertEqual(
            [s["kind"] for s in detail["steps"]], ["jira.create", "slack.reply", "survey.record"]
        )
        self.assertEqual(
            (detail["source"]["kind"], detail["source"]["sender"]), ("slack_message", "Ann Lee")
        )

        # Carl runs it: the issue in SUP, his reply with its key, the survey waiting.
        rows = [{"id": s["id"], "selected": True} for s in detail["steps"]]
        status, body = http_post(
            self.api(f"/agents/bundles/{bundle.pk}/run/"), {"steps": rows}, token=carl
        )
        self.assertEqual(status, 200, body)
        steps = body["bundle"]["steps"]
        self.assertEqual([s["status"] for s in steps], ["applied", "applied", "applied"], steps)
        key = steps[0]["outputs"]["ticket_key"]
        self.assertTrue(key.startswith("SUP-"))
        [reply] = [c for c in self.slack.calls if c[0] == "chat.postMessage"]
        self.assertEqual(reply[1]["thread_ts"], ts)
        self.assertIn(key, reply[1]["text"])
        row.refresh_from_db()
        self.assertEqual(row.jira_key, key)
        self.assertIsNotNone(row.replied_at)
        self.assertEqual(steps[2]["note"], f"Sends when {key} is resolved.")
        self.assertEqual(
            steps[2]["preview"]["record_survey"]["wait"],
            {"status": "waiting", "label": f"Waiting for {key}"},
        )
        wait = IssueWait.objects.get()

        # Not resolved yet: the tick sends nothing.
        call_command("deliver_pending")
        self.assertEqual(mail.outbox, [])

        # Engineering resolves it in Jira: the next tick asks Jira and sends it as Carl.
        self.jira.issues[key]["category"] = "done"
        IssueWait.objects.filter(pk=wait.pk).update(checked_at=None)
        call_command("deliver_pending")
        wait.refresh_from_db()
        self.assertEqual(wait.status, "sent")
        self.assertEqual([m.to for m in mail.outbox], [["ann@pizzahut.com"]])
        self.assertEqual(mail.outbox[0].subject, "How did we do with the SSO fix?")
        status, detail = http_get(self.api(f"/agents/bundles/{bundle.pk}/"), carl)
        self.assertEqual(
            detail["steps"][2]["preview"]["record_survey"]["wait"],
            {"status": "sent", "label": "Sent"},
        )
