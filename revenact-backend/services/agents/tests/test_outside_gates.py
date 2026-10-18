"""A step whose tool can't be used shows why, links to Settings ›
Connections, and doesn't stop a reject (agent bundles D3 contract §4,
§5.1, D3-10, D3-16). The kinds here are test stand-ins until Tasks 11-14."""

import dataclasses
from unittest.mock import patch

from services.agents import bulk
from services.agents.bundle_payloads import bundle_payload, links_for
from services.agents.outside import gates
from services.agents.registry import REGISTRY
from services.agents.tests.outside_fixtures import OutsideFixture
from services.mail.models import MailboxConnection

SLACKISH = dataclasses.replace(
    REGISTRY["note.create"], key="slack.reply", outside=True, irreversible=True
)
JIRAISH = dataclasses.replace(
    REGISTRY["note.create"], key="jira.create", outside=True, irreversible=True
)
MAILISH = dataclasses.replace(
    REGISTRY["note.create"], key="mail.send_reply", outside=True, irreversible=True
)


class GateTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        patcher = patch.dict(
            REGISTRY, {"slack.reply": SLACKISH, "jira.create": JIRAISH, "mail.send_reply": MAILISH}
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def bundle_with(self, kind, payload):
        _, thread = self.slack_thread(self.pizza)
        return self.outside_bundle(thread, (kind, {"title": "T", "body": "B", **payload}))

    def step_of(self, bundle, reader):
        return bundle_payload(bundle, reader)["steps"][0]

    def test_slack_read_only_asks_an_admin(self):
        connector = self.slack_connector(can_act=False)
        bundle = self.bundle_with("slack.reply", {"connector_id": connector.pk})
        carl = self.step_of(bundle, self.csm)
        self.assertEqual(
            (carl["can_run"], carl["disabled_reason"], carl["disabled_link"]),
            (False, "Ask an admin to allow Revenact to post in Slack.", "/settings/connections"),
        )
        alice = self.step_of(bundle, self.admin)
        self.assertEqual(alice["disabled_reason"], "Allow Revenact to post in Slack.")

    def test_a_blocked_step_still_lets_its_owner_reject(self):
        connector = self.slack_connector(can_act=False)
        bundle = self.bundle_with("slack.reply", {"connector_id": connector.pk})
        payload = bundle_payload(bundle, self.csm)
        self.assertEqual((payload["can_run"], payload["can_reject"]), (False, True))

    def test_jira_gone_disconnected_and_allowed(self):
        connector = self.jira_connector()
        bundle = self.bundle_with("jira.create", {"connector_id": connector.pk})
        self.assertIsNone(self.step_of(bundle, self.csm)["disabled_reason"])
        connector.status = "error"
        connector.save(update_fields=["status"])
        self.assertEqual(
            self.step_of(bundle, self.csm)["disabled_reason"], "Reconnect Jira to do this."
        )
        connector.delete()
        self.assertEqual(
            self.step_of(bundle, self.csm)["disabled_reason"],
            "The Jira connection this uses is gone.",
        )

    def test_mail_needs_the_readers_own_mailbox(self):
        bundle = self.bundle_with("mail.send_reply", {})
        MailboxConnection.objects.filter(user=self.csm).delete()
        self.assertEqual(
            self.step_of(bundle, self.csm)["disabled_reason"], "Connect your mailbox to send this."
        )
        self.gmail_for(self.csm)
        self.assertIsNone(self.step_of(bundle, self.csm)["disabled_reason"])

    def test_a_moved_slack_step_needs_its_channels_department(self):
        engineering = self.slack_connector(
            department="engineering", channel="C0ESCALATE", name="escalations"
        )
        bundle = self.bundle_with("slack.reply", {"connector_id": engineering.pk})
        self.assertEqual(
            self.step_of(bundle, self.csm)["disabled_reason"], "You can't post in #escalations."
        )

    def test_links_are_the_servers(self):
        _, thread = self.slack_thread(self.pizza)
        bundle = self.outside_bundle(thread, ("note.create", {"title": "T", "body": "B"}))
        step = bundle.steps.get()
        step.status = "applied"
        step.kind = "jira.create"
        step.outputs = {
            "ticket_key": "SUP-123",
            "ticket_url": "https://acme.atlassian.net/browse/SUP-123",
        }
        self.assertEqual(
            links_for(step, self.csm),
            [
                {
                    "label": "Open SUP-123 in Jira",
                    "url": "https://acme.atlassian.net/browse/SUP-123",
                    "external": True,
                }
            ],
        )
        step.kind = "task.create"
        step.outputs = {"task_id": 7, "task_url": "/work/mine?task=7"}
        self.assertEqual(
            links_for(step, self.csm),
            [{"label": "Open task", "url": "/work/mine?task=7", "external": False}],
        )
        step.kind = "mail.send_reply"
        step.outputs, step.result = (
            {},
            {"message_id": 41, "provider": "google", "sent_by": self.csm.pk},
        )
        self.assertEqual(
            links_for(step, self.csm),
            [
                {
                    "label": "Open the sent email",
                    "url": "/communications?source=mailbox:google&message=41",
                    "external": False,
                }
            ],
        )
        self.assertEqual(links_for(step, self.mona), [])
        step.kind, step.outputs = "slack.reply", {"slack_url": "https://evil.example/x"}
        self.assertEqual(links_for(step, self.csm), [])

    def test_a_page_reads_its_connectors_once(self):
        connector = self.slack_connector()
        bundles = [
            self.bundle_with("slack.reply", {"connector_id": connector.pk}) for _ in range(3)
        ]
        steps = [b.steps.get() for b in bundles]
        with bulk.using(steps):
            page = bulk.active()
            self.assertEqual(set(page.connectors), {connector.pk})
            with self.assertNumQueries(0):
                gates.connector_of(steps[0])
