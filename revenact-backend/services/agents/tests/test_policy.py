"""Each workspace has three agents, a grid of Auto/Ask/Never, and a monthly
credit budget per agent (spec §1.1, §1.6, §1.7)."""

from datetime import date, datetime, timedelta
from datetime import timezone as tz
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.test import override_settings
from django.utils import timezone

from services.agents import policy
from services.agents.kinds import ASK, AUTO, NEVER
from services.agents.models import AgentPolicy, AgentProfile
from services.agents.tests.fixtures import AgentsFixture
from services.copilot.models import ModelCall


class PolicyTests(AgentsFixture):
    def test_three_profiles_made_once_with_the_default_budget(self):
        with patch.object(policy, "plan_credits", return_value=2000):
            profiles = policy.profiles_for(self.org)
            again = policy.profiles_for(self.org)
        self.assertEqual(list(profiles), ["cs", "sales", "ops"])
        self.assertEqual(profiles["cs"].monthly_credits, 133)
        self.assertTrue(all(p.enabled for p in profiles.values()))
        self.assertEqual(AgentProfile.objects.filter(organisation=self.org).count(), 3)
        self.assertEqual(again["ops"].pk, profiles["ops"].pk)

    def test_everything_starts_on_ask(self):
        grid = policy.grid(policy.policy_for(self.org))
        self.assertEqual(set(grid), {"cs", "sales", "ops"})
        self.assertEqual(set(grid["cs"].values()), {ASK})
        self.assertNotIn("initiative.create", grid["cs"])
        self.assertNotIn("record.lifecycle", grid["ops"])
        self.assertIn("initiative.create", grid["ops"])

    def test_the_registry_is_the_contracts_table(self):
        from services.agents.registry import REGISTRY

        self.assertEqual(
            [(k.key, k.max_level, tuple(k.agents)) for k in REGISTRY.values()],
            [
                ("record.lifecycle", "auto", ("cs", "sales")),
                ("record.owner", "ask", ("cs", "sales")),
                ("record.attribute", "auto", ("cs", "sales")),
                ("task.create", "auto", ("cs", "sales", "ops")),
                ("task.reassign", "auto", ("cs", "sales", "ops")),
                ("task.redate", "auto", ("cs", "sales", "ops")),
                ("task.complete", "ask", ("cs", "sales", "ops")),
                ("task.snooze", "auto", ("cs", "sales", "ops")),
                ("note.create", "auto", ("cs", "sales", "ops")),
                ("draft.reply", "auto", ("cs", "sales")),
                ("plan.start", "ask", ("cs", "sales")),
                ("segment.create", "ask", ("ops",)),
                ("scenario.create", "ask", ("ops",)),
                ("campaign.create", "ask", ("ops",)),
                ("canvas.create", "ask", ("cs", "sales", "ops")),
                ("plan.template", "ask", ("ops",)),
                ("initiative.create", "ask", ("ops",)),
                ("survey.send", "ask", ("ops",)),
                ("campaign.send", "ask", ("ops",)),
                ("mail.send_reply", "ask", ("cs", "sales")),
                ("slack.reply", "ask", ("cs", "sales")),
                ("jira.create", "ask", ("cs", "sales")),
                ("jira.assign", "ask", ("cs", "sales")),
                ("jira.comment", "ask", ("cs", "sales")),
                # Slack bundles (owner, 2026-10-17): offered only for a Slack message.
                ("survey.record", "ask", ("cs", "sales")),
                ("segment.pin", "ask", ("cs", "sales")),
                ("scenario.run", "ask", ("cs", "sales")),
                # Guided agent (2026-10-18): offered only on a message bundle.
                ("record.diagnose", "ask", ("cs", "sales")),
                ("mail.compose", "ask", ("cs", "sales")),
                ("mail.send_draft", "ask", ("cs", "sales")),
                # Sales review report (2026-10-18): made only by the daily check.
                ("report.sales", "ask", ("sales",)),
            ],
        )

    def test_a_stored_level_above_the_cap_reads_as_the_cap(self):
        prefs = policy.policy_for(self.org)
        AgentPolicy.objects.filter(pk=prefs.pk).update(
            levels={
                "cs": {
                    "record.owner": AUTO,
                    "record.lifecycle": AUTO,
                    "record.attribute": "bogus",
                }
            }
        )
        prefs.refresh_from_db()
        self.assertEqual(policy.level(prefs, "cs", "record.owner"), ASK)  # capped
        self.assertEqual(policy.level(prefs, "cs", "record.lifecycle"), AUTO)
        self.assertEqual(policy.level(prefs, "cs", "record.attribute"), ASK)  # invalid
        # A kind an agent doesn't use, or that doesn't exist, is never.
        self.assertEqual(policy.level(prefs, "ops", "record.lifecycle"), NEVER)
        self.assertEqual(policy.level(prefs, "cs", "no.such.kind"), NEVER)

    @override_settings(BILLING_CREDITS_PER_MODEL_CALL=2)
    def test_spend_is_this_months_successful_calls(self):
        def call(purpose, outcome="ok"):
            return ModelCall.objects.create(
                organisation=self.org, purpose=purpose, outcome=outcome, model="m"
            )

        call("agent_cs")
        call("agent_cs")
        call("agent_cs", outcome="failed")
        call("agent_sales")
        last_month = call("agent_cs")
        ModelCall.objects.filter(pk=last_month.pk).update(
            created_at=timezone.now().replace(day=1) - timedelta(days=2)
        )
        today = timezone.localdate()
        self.assertEqual(policy.spent_this_month(self.org, "cs", today=today), 4)
        self.assertEqual(policy.spent_this_month(self.org, "ops", today=today), 0)

    @override_settings(BILLING_CREDITS_PER_MODEL_CALL=1)
    def test_the_month_starts_at_the_workspaces_local_midnight(self):
        from services.work.prefs import settings_for

        prefs = settings_for(self.org)
        prefs.timezone = "Asia/Kolkata"
        prefs.save()
        # 00:00 on the 1st in Kolkata is 18:30 UTC on the last day before.
        edge = datetime(2026, 9, 30, 18, 30, tzinfo=tz.utc)
        for when in (edge - timedelta(minutes=1), edge + timedelta(minutes=1)):
            call = ModelCall.objects.create(
                organisation=self.org, purpose="agent_cs", outcome="ok", model="m"
            )
            ModelCall.objects.filter(pk=call.pk).update(created_at=when)
        self.assertEqual(edge.astimezone(ZoneInfo("Asia/Kolkata")).date(), date(2026, 10, 1))
        self.assertEqual(policy.spent_this_month(self.org, "cs", today=date(2026, 10, 8)), 1)

    def test_the_default_budget_is_a_fifth_of_the_trial_plan_split_three_ways(self):
        # The trial plan has 200 credits: round(200 * 0.2 / 3) = 13.
        profiles = policy.profiles_for(self.org)
        self.assertEqual(
            {k: p.monthly_credits for k, p in profiles.items()}, dict(cs=13, sales=13, ops=13)
        )
        again = policy.profiles_for(self.org)
        self.assertEqual([p.monthly_credits for p in again.values()], [13, 13, 13])

    def test_resets_on_the_first_of_next_month(self):
        self.assertEqual(policy.resets_on(date(2026, 10, 8)), date(2026, 11, 1))
        self.assertEqual(policy.resets_on(date(2026, 12, 31)), date(2027, 1, 1))
