"""GET/PATCH /agents/settings/ and POST /agents/<kind>/run/ (contract)."""

import re
from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.agents.models import AgentPolicy, AgentProfile
from services.agents.policy import profiles_for
from services.agents.tests.fixtures import AgentsFixture
from services.metrics.models import AgentAction

URL = "/api/v1/agents/settings/"


class SettingsApiTests(AgentsFixture):
    def setUp(self):
        self.plan = patch("services.agents.policy.plan_credits", return_value=2000)
        self.plan.start()
        self.addCleanup(self.plan.stop)

    def get(self, user):
        response = self.client_for(user).get(URL)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_any_member_reads_the_cards_kinds_and_grid(self):
        data = self.get(self.csm)
        self.assertEqual([a["kind"] for a in data["agents"]], ["cs", "sales", "ops"])
        card = data["agents"][0]
        self.assertEqual(card["label"], "CS agent")
        self.assertEqual(card["monthly_credits"], 133)
        self.assertEqual(card["spent_this_month"], 0)
        self.assertIsNone(card["last_run"])
        self.assertEqual(data["kinds"][0]["kind"], "record.lifecycle")
        self.assertEqual(data["kinds"][1]["max_level"], "ask")
        self.assertEqual(data["levels"]["cs"]["record.lifecycle"], "ask")
        self.assertNotIn("record.lifecycle", data["levels"]["ops"])
        self.assertEqual(data["plan_monthly_credits"], 2000)
        self.assertFalse(data["can_edit"])
        self.assertFalse(data["can_run"])
        self.assertTrue(self.get(self.admin)["can_edit"])
        self.assertTrue(self.get(self.admin)["can_run"])
        self.assertTrue(self.get(self.lee)["can_run"] is False)

    def test_admin_changes_and_it_is_audited(self):
        response = self.client_for(self.admin).patch(
            URL,
            {
                "tone": "concise",
                "agents": {"cs": {"enabled": False, "monthly_credits": 200}},
                "levels": {"cs": {"record.lifecycle": "auto"}},
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["tone"], "concise")
        self.assertFalse(response.data["agents"][0]["enabled"])
        self.assertEqual(response.data["levels"]["cs"]["record.lifecycle"], "auto")
        self.assertTrue(AuditEvent.objects.filter(action="agents.settings_update").exists())

    def test_every_problem_at_once(self):
        response = self.client_for(self.admin).patch(
            URL,
            {
                "ai_enabled": "yes",
                "tone": "shouty",
                "agents": {"hr": {}, "cs": {"enabled": 1, "monthly_credits": 5000}},
                "levels": {
                    "cs": {"initiative.create": "ask", "record.owner": "auto", "note.create": "x"}
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data,
            {
                "ai_enabled": ["Choose on or off."],
                "tone": ["Choose professional, friendly or concise."],
                "agents": {
                    "hr": ["Unknown agent."],
                    "cs": {
                        "enabled": ["Choose on or off."],
                        "monthly_credits": ["Choose a whole number from 0 to 2000."],
                    },
                },
                "levels": {
                    "cs": {
                        "initiative.create": ["That agent doesn't use this action."],
                        "record.owner": ["This action can't be set to auto."],
                        "note.create": ["Choose auto, ask or never."],
                    }
                },
            },
        )

    def test_never_expires_pending_actions_of_that_kind(self):
        action = AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="note.create",
            customer=self.pizza,
            target="note:x",
            title="t",
            rationale="r",
            payload={"title": "x", "body": "y"},
        )
        self.client_for(self.admin).patch(
            URL, {"levels": {"cs": {"note.create": "never"}}}, format="json"
        )
        action.refresh_from_db()
        self.assertEqual((action.status, action.expired_reason), ("expired", "never"))

    def test_never_expires_under_the_readers_name_and_skips_decided_rows(self):
        def make(target, status):
            return AgentAction.objects.create(
                organisation=self.org,
                agent="cs",
                batch="b",
                kind="note.create",
                customer=self.pizza,
                target=target,
                title="t",
                rationale="r",
                payload={"title": "x", "body": "y"},
                status=status,
            )

        waiting, applied = make("note:a", "proposed"), make("note:b", "applied")
        self.client_for(self.admin).patch(
            URL, {"levels": {"cs": {"note.create": "never"}}}, format="json"
        )
        waiting.refresh_from_db()
        applied.refresh_from_db()
        self.assertEqual(waiting.status, "expired")
        self.assertEqual(applied.status, "applied")
        event = AuditEvent.objects.get(action="agent_action.expired")
        self.assertEqual(event.actor, self.admin)

    def test_never_locks_bundles_in_ascending_id_order(self):
        # The nightly pass locks a twin's older bundle before its new one;
        # Never, holding every lock to the end, must take them the same way.
        def make(kind, target, payload):
            return AgentAction.objects.create(
                organisation=self.org,
                agent="cs",
                batch="b",
                kind=kind,
                customer=self.pizza,
                target=target,
                title="t",
                rationale="r",
                payload=payload,
            )

        older = make("note.create", "note:a", {"title": "x", "body": "y"})
        newer = make("record.lifecycle", "lifecycle", {"stage": "renewal"})
        with CaptureQueriesContext(connection) as queries:
            self.client_for(self.admin).patch(
                URL,
                {"levels": {"cs": {"record.lifecycle": "never", "note.create": "never"}}},
                format="json",
            )
        locked = []
        for query in queries.captured_queries:
            sql = query["sql"]
            if "FOR UPDATE" in sql and 'FROM "agents_agentbundle"' in sql:
                found = re.search(r'"agents_agentbundle"\."id" = (\d+)', sql)
                if found and int(found.group(1)) not in locked:
                    locked.append(int(found.group(1)))
        self.assertEqual(locked, [older.bundle_id, newer.bundle_id])
        self.assertLess(older.bundle_id, newer.bundle_id)

    def test_never_locks_bundles_before_updating_the_workspace(self):
        # A running send holds bundle -> organisation; a PATCH that also
        # changes the workspace must take the bundles first too.
        AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="note.create",
            customer=self.pizza,
            target="note:a",
            title="t",
            rationale="r",
            payload={"title": "x", "body": "y"},
        )
        with CaptureQueriesContext(connection) as queries:
            response = self.client_for(self.admin).patch(
                URL,
                {"tone": "concise", "levels": {"cs": {"note.create": "never"}}},
                format="json",
            )
        self.assertEqual(response.status_code, 200, response.data)
        sqls = [query["sql"] for query in queries.captured_queries]
        bundle_lock = next(
            n
            for n, sql in enumerate(sqls)
            if "FOR UPDATE" in sql and 'FROM "agents_agentbundle"' in sql
        )
        table = Organisation._meta.db_table
        org_update = next(n for n, sql in enumerate(sqls) if sql.startswith(f'UPDATE "{table}"'))
        self.assertLess(bundle_lock, org_update)
        self.assertEqual(Organisation.objects.get(pk=self.org.pk).ai_agent_tone, "concise")

    def test_the_settings_audit_carries_the_request(self):
        self.client_for(self.admin).patch(
            URL, {"tone": "concise"}, format="json", HTTP_USER_AGENT="settings-test"
        )
        event = AuditEvent.objects.get(action="agents.settings_update")
        self.assertEqual(event.user_agent, "settings-test")
        self.assertIsNotNone(event.ip)

    def test_a_no_op_patch_is_not_audited(self):
        self.client_for(self.admin).patch(URL, {"tone": "professional"}, format="json")
        self.assertFalse(AuditEvent.objects.filter(action="agents.settings_update").exists())

    def test_a_member_cannot_change_them(self):
        response = self.client_for(self.csm).patch(URL, {"tone": "concise"}, format="json")
        self.assertEqual(response.status_code, 403)


class RunNowTests(AgentsFixture):
    def setUp(self):
        self.plan = patch("services.agents.policy.plan_credits", return_value=2000)
        self.plan.start()
        self.addCleanup(self.plan.stop)

    def test_runs_and_returns_the_card(self):
        with patch("services.agents.run.get_completion", return_value="[]"):
            response = self.client_for(self.admin).post("/api/v1/agents/cs/run/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["kind"], "cs")
        self.assertEqual(response.data["last_run"]["proposed"], 0)
        event = AuditEvent.objects.get(action="agents.run")
        self.assertEqual((event.actor, event.metadata["agent"]), (self.admin, "cs"))

    def test_refusals(self):
        self.assertEqual(self.client_for(self.csm).post("/api/v1/agents/cs/run/").status_code, 403)
        self.assertEqual(
            self.client_for(self.admin).post("/api/v1/agents/hr/run/").status_code, 404
        )
        Organisation.objects.filter(pk=self.org.pk).update(ai_agent_enabled=False)
        response = self.client_for(self.admin).post("/api/v1/agents/cs/run/")
        self.assertEqual((response.status_code, response.data["code"]), (409, "AI_OFF"))
        Organisation.objects.filter(pk=self.org.pk).update(ai_agent_enabled=True)
        profiles_for(self.org)
        AgentProfile.objects.filter(organisation=self.org, kind="cs").update(monthly_credits=0)
        response = self.client_for(self.admin).post("/api/v1/agents/cs/run/")
        self.assertEqual(response.data["code"], "BUDGET_USED")
        self.assertIn("resets_on", response.data)


class RunNowRefusalTests(AgentsFixture):
    def setUp(self):
        self.plan = patch("services.agents.policy.plan_credits", return_value=2000)
        self.plan.start()
        self.addCleanup(self.plan.stop)
        profiles_for(self.org)

    def post(self):
        return self.client_for(self.admin).post("/api/v1/agents/cs/run/")

    def test_agent_off_and_no_actions(self):
        AgentProfile.objects.filter(organisation=self.org, kind="cs").update(enabled=False)
        response = self.post()
        self.assertEqual((response.status_code, response.data["code"]), (409, "AGENT_OFF"))
        self.assertEqual(response.data["detail"], "This agent is switched off.")
        AgentProfile.objects.filter(organisation=self.org, kind="cs").update(enabled=True)
        from services.agents.registry import kinds_for

        policy = AgentPolicy.objects.get(organisation=self.org)
        policy.levels = {"cs": {kind: "never" for kind in kinds_for("cs")}}
        policy.save()
        response = self.post()
        self.assertEqual((response.status_code, response.data["code"]), (409, "NO_ACTIONS"))
        self.assertEqual(response.data["detail"], "Every action is set to never for this agent.")

    def test_budget_used_says_when_it_resumes(self):
        AgentProfile.objects.filter(organisation=self.org, kind="cs").update(monthly_credits=0)
        response = self.post()
        self.assertEqual(response.data["code"], "BUDGET_USED")
        self.assertRegex(
            response.data["detail"], r"^This agent's budget is used up: it resumes on 1 \w{3}\.$"
        )
        self.assertRegex(response.data["resets_on"], r"^\d{4}-\d{2}-01$")

    def test_no_credits_is_a_429_and_is_audited(self):
        from services.agents.run import RunResult

        with patch("services.agents.views.run", return_value=RunResult(skipped_reason="credits")):
            response = self.post()
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data, {"detail": "The workspace has no credits left."})
        event = AuditEvent.objects.get(action="agents.run")
        self.assertEqual(event.metadata, {"agent": "cs", "refused": "CREDITS"})

    def test_a_member_is_told_who_can_run_an_agent(self):
        response = self.client_for(self.csm).post("/api/v1/agents/cs/run/")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.data["detail"],
            "Only admins and people who can see every account can run an agent.",
        )

    def test_a_run_that_raises_is_audited_before_the_500(self):
        with (
            patch("services.agents.views.run", side_effect=RuntimeError("boom")),
            self.assertRaises(RuntimeError),
        ):
            self.post()
        event = AuditEvent.objects.get(action="agents.run")
        self.assertEqual(event.outcome, AuditEvent.Outcome.FAILURE)
        self.assertEqual(event.metadata["agent"], "cs")
        self.assertEqual(event.metadata["error"], "RuntimeError")


class SettingsAuditValuesTests(AgentsFixture):
    def setUp(self):
        self.plan = patch("services.agents.policy.plan_credits", return_value=2000)
        self.plan.start()
        self.addCleanup(self.plan.stop)
        profiles_for(self.org)

    def test_the_audit_records_old_and_new_values_of_changed_keys(self):
        old_budget = AgentProfile.objects.get(organisation=self.org, kind="cs").monthly_credits
        response = self.client_for(self.admin).patch(
            URL,
            {
                "tone": "concise",
                "agents": {"cs": {"monthly_credits": 50, "enabled": True}},
                "levels": {"cs": {"record.lifecycle": "auto"}},
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        changes = AuditEvent.objects.get(action="agents.settings_update").metadata["changes"]
        self.assertEqual(
            changes,
            {
                "organisation": {"ai_agent_tone": {"old": "professional", "new": "concise"}},
                "agents": {"cs": {"monthly_credits": {"old": old_budget, "new": 50}}},
                "levels": {"cs": {"record.lifecycle": {"old": "ask", "new": "auto"}}},
            },
        )
