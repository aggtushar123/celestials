"""Settings › Agents for message intake (agent bundles D2 contract §4.8,
D2-21, D2-23, D2-26): the interval and one switch per source, every source
on and one hour by default; admins change them, all refusals at once,
audited with old and new; each agent says how many conversations wait on
its credits."""

from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.agents.models import SignalThread
from services.agents.tests.drafts_fixtures import mailbox
from services.agents.tests.intake_fixtures import IntakeFixture

SETTINGS = "/api/v1/agents/settings/"


class SignalSettingsTests(IntakeFixture):
    def get(self, user=None):
        return self.client_for(user or self.admin).get(SETTINGS).json()

    def patch(self, body, user=None):
        return self.client_for(user or self.admin).patch(SETTINGS, body, format="json")

    def test_the_defaults_and_what_is_connected(self):
        mailbox(self.csm)
        self.connector("zendesk", "cs")
        signals = self.get()["signals"]
        self.assertEqual(signals["interval"], "1h")
        self.assertEqual([i["value"] for i in signals["intervals"]], ["30m", "1h", "4h", "24h"])
        self.assertEqual(
            [(s["key"], s["label"], s["enabled"], s["connected"]) for s in signals["sources"]],
            [
                ("mail", "Email filed to a customer", True, True),
                ("slack", "Slack", True, False),
                ("zendesk", "Zendesk", True, True),
                ("freshdesk", "Freshdesk", True, False),
                ("jira", "Jira", True, False),
                ("webhook", "Webhooks", True, False),
            ],
        )
        self.assertIsNone(signals["last_run_at"])

    def test_an_admin_changes_the_interval_and_a_source(self):
        answer = self.patch({"signal_interval": "4h", "signal_sources": {"slack": False}})
        self.assertEqual(answer.status_code, 200)
        org = Organisation.objects.get(pk=self.org.pk)
        self.assertEqual((org.ai_signal_interval, org.ai_signal_sources), ("4h", {"slack": False}))
        event = AuditEvent.objects.filter(action="agents.settings_update").latest("id")
        changes = event.metadata["changes"]["organisation"]
        self.assertEqual(changes["ai_signal_interval"], {"old": "1h", "new": "4h"})
        self.assertEqual(changes["ai_signal_sources"], {"old": {}, "new": {"slack": False}})

    def test_every_refusal_at_once(self):
        answer = self.patch(
            {"signal_interval": "2h", "signal_sources": {"fax": True, "slack": "off"}}
        )
        self.assertEqual(answer.status_code, 400)
        self.assertEqual(
            answer.json(),
            {
                "signal_interval": [
                    "Choose every 30 minutes, every hour, every 4 hours or once a day."
                ],
                "signal_sources": {"fax": ["Unknown source."], "slack": ["Choose on or off."]},
            },
        )
        self.assertEqual(
            self.patch({"signal_sources": ["slack"]}).json(),
            {"signal_sources": ["Send the sources as one object."]},
        )

    def test_only_admins_change_them(self):
        self.assertEqual(self.patch({"signal_interval": "4h"}, user=self.csm).status_code, 403)

    def test_each_agent_says_how_many_wait_on_credits(self):
        _, one = self.ticket_thread(self.pizza)
        _, two = self.ticket_thread(self.pizza, number="ZD-2")
        SignalThread.objects.filter(pk=one.pk).update(
            status="waiting_credits", skip_reason="budget", agent="cs", updated_at=timezone.now()
        )
        SignalThread.objects.filter(pk=two.pk).update(
            status="waiting_credits", skip_reason="credits", agent="cs"
        )
        cards = {c["kind"]: c for c in self.get()["agents"]}
        self.assertEqual(
            (cards["cs"]["waiting_threads"], cards["sales"]["waiting_threads"]), (2, 0)
        )
        self.assertIn(cards["cs"]["waiting_reason"], ("budget", "credits"))
        self.assertIsNone(cards["sales"]["waiting_reason"])
