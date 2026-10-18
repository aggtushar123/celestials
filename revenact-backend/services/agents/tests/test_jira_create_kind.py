"""jira.create (agent bundles D3 contract §2.3, §3, §6, D3-5, D3-6, D3-11,
D3-24). Jira is a fake: nothing is created."""

from django.test import override_settings

from core.models import AuditEvent
from services.agents.actions import jira_issues
from services.agents.evidence import Context
from services.agents.kinds import FieldErrors, Invalid
from services.agents.tests.outside_fixtures import OutsideFixture

STEP = "/api/v1/agents/bundles/{}/steps/{}/"
DETAIL = "/api/v1/agents/bundles/{}/"


class JiraCreateTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.board = self.jira_connector()
        _, self.thread = self.slack_thread(self.pizza)
        self.bundle = self.outside_bundle(
            self.thread, ("jira.create", self.jira_payload(self.board, member=self.erin.pk))
        )
        self.step = self.bundle.steps.get()

    def test_the_model_proposes_words_and_a_member_never_a_project(self):
        ctx = Context(self.org, "cs", self.today)
        ctx.jira_connector = {"id": self.board.pk, "project": "SUP"}
        ctx.members = {self.erin.pk: {"id": self.erin.pk, "name": "Erin Eng"}}
        row = {"ref": f"customer:{self.pizza.pk}"}
        clean = jira_issues.validate(
            {
                "summary": "Login loop",
                "description": "Since Monday.",
                "priority": "high",
                "assignee_id": self.erin.pk,
                "project": "ENG",
            },
            row,
            ctx,
            [],
        )
        self.assertEqual(
            clean,
            {
                "connector_id": self.board.pk,
                "project": "SUP",
                "issue_type": {"id": "", "name": "Task"},
                "summary": "Login loop",
                "description": "Since Monday.",
                "priority": {"id": "", "name": "High"},
                "assignee": None,
                "assignee_member_id": self.erin.pk,
            },
        )
        for bad in (
            {"summary": ""},
            {"summary": "x" * 201},
            {"summary": "S", "priority": "urgent"},
            {"summary": "S", "assignee_id": 999999},
        ):
            with self.subTest(bad=bad), self.assertRaises(Invalid):
                jira_issues.validate(bad, row, ctx, [])
        ctx.jira_connector = None
        with self.assertRaises(Invalid):
            jira_issues.validate({"summary": "S"}, row, ctx, [])

    # Linking off whatever the developer's .env says: the preview reads "off".
    @override_settings(ATLASSIAN_OAUTH_CLIENT_ID="", ATLASSIAN_OAUTH_CLIENT_SECRET="")
    def test_the_preview_names_the_account_it_acts_as(self):
        step = self.client_for(self.csm).get(DETAIL.format(self.bundle.pk)).json()["steps"][0]
        self.assertEqual(
            step["preview"]["jira"],
            {
                "site": "acme.atlassian.net",
                "project": "SUP",
                "needs_project": False,
                "project_choices": [],
                "can_create_project": False,
                "suggested_project": None,
                "issue_type": "Task",
                "summary": "Login loop after password reset",
                "excerpt": "Since Monday nobody can log in after a reset.",
                "priority": "High",
                "assignee": {"name": "Erin Eng", "matched_later": True},
                "as": "Jira Bot",
                "as_you": False,
                "link": "off",
            },
        )

    def test_a_run_resolves_names_then_creates_once_with_its_label(self):
        self.assertEqual(self.run_all_steps(self.csm, self.bundle).status_code, 200)
        self.step.refresh_from_db()
        self.assertEqual(self.step.status, "applied", self.step.error)
        [key] = self.jira.created
        fields = self.jira.issues[key]["fields"]
        self.assertEqual(fields["project"], {"key": "SUP"})
        self.assertEqual(fields["issuetype"], {"id": "10001"})
        self.assertEqual(fields["priority"], {"id": "2"})
        self.assertEqual(fields["assignee"], {"accountId": "acc-erin"})
        self.assertEqual(fields["labels"], [f"revenact-b{self.bundle.pk}-s{self.step.pk}"])
        self.assertEqual(
            fields["description"]["content"][-1],
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "Created by Carl CSM from Revenact."}],
            },
        )
        self.assertEqual(
            self.step.outputs,
            {"ticket_key": key, "ticket_url": f"https://acme.atlassian.net/browse/{key}"},
        )

    def test_a_member_jira_doesnt_know_fails_and_a_picked_assignee_retries(self):
        self.step.payload = {**self.step.payload, "assignee_member_id": self.other.pk}
        self.step.save(update_fields=["payload"])
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(
            self.step.error,
            "Jira has no user with dana@acme.io. Choose the assignee from Jira's list, then Retry.",
        )
        self.assertEqual(self.jira.created, [])
        self.retry(self.csm, self.step, {"assignee": {"id": "acc-priya", "name": "Priya Shah"}})
        self.step.refresh_from_db()
        self.assertEqual(self.step.status, "applied")
        self.assertEqual(self.jira.issues[self.jira.created[0]]["assignee"], "acc-priya")

    def test_no_project_fails_before_any_call(self):
        self.step.payload = {**self.step.payload, "project": ""}
        self.step.save(update_fields=["payload"])
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(self.step.error, "Choose a Jira project, then Retry.")

    def test_jiras_refusal_is_a_sentence(self):
        self.jira.refuse_next("create", "Jira says the project SUP needs a component.")
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(self.step.error, "Jira says the project SUP needs a component.")

    def test_a_lost_answer_is_found_by_its_label_on_retry(self):
        self.jira.drop_next("create")
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(
            self.step.error, "We couldn't confirm Jira made the issue. Retry checks Jira first."
        )
        self.retry(self.csm, self.step)
        self.step.refresh_from_db()
        self.assertEqual((self.step.status, len(self.jira.created)), ("applied", 1))
        self.assertEqual(self.jira.lookups, [f"revenact-b{self.bundle.pk}-s{self.step.pk}"])

    def test_edits(self):
        url = STEP.format(self.bundle.pk, self.step.pk)
        client = self.client_for(self.csm)
        bad = client.patch(
            url, {"fields": {"project": "sup", "priority": {"id": 2}}}, format="json"
        )
        self.assertEqual(
            bad.json()["steps"][str(self.step.pk)],
            {"project": ["Choose a Jira project."], "priority": ["Choose from Jira's list."]},
        )
        self.step.payload = {**self.step.payload, "issue_type": {"id": "10002", "name": "Bug"}}
        self.step.save(update_fields=["payload"])
        moved = client.patch(
            url,
            {"fields": {"project": "ENG", "assignee": {"id": "acc-priya", "name": "Priya Shah"}}},
            format="json",
        )
        self.assertEqual(moved.status_code, 200, moved.content)
        self.step.refresh_from_db()
        self.assertEqual(self.step.payload["issue_type"], {"id": "", "name": "Bug"})
        self.assertEqual(
            (self.step.payload["assignee"]["id"], self.step.payload["assignee_member_id"]),
            ("acc-priya", None),
        )
        with self.assertRaises(FieldErrors) as caught:
            jira_issues.edit(self.step, {"summary": "", "description": "x" * 10_001}, self.csm)
        self.assertEqual(
            caught.exception.errors,
            {
                "summary": ["Write a summary."],
                "description": ["Keep the description under 10,000 characters."],
            },
        )

    def test_read_only_jira_disables_it(self):
        self.board.agents_can_act = False
        self.board.save(update_fields=["agents_can_act"])
        step = self.client_for(self.csm).get(DETAIL.format(self.bundle.pk)).json()["steps"][0]
        self.assertEqual(step["disabled_reason"], "Ask an admin to allow agents to act in Jira.")

    def test_it_cant_be_undone(self):
        self.run_all_steps(self.csm, self.bundle)
        undo = self.client_for(self.csm).post(f"/api/v1/agents/actions/{self.step.pk}/undo/")
        self.assertEqual(undo.json()["detail"], "This Jira issue has been created.")

    def test_an_explicit_null_assignee_clears_the_member_and_creates_unassigned(self):
        """CC-1: the frontend sends "assignee": null for Unassigned."""
        url = STEP.format(self.bundle.pk, self.step.pk)
        moved = self.client_for(self.csm).patch(url, {"fields": {"assignee": None}}, format="json")
        self.assertEqual(moved.status_code, 200, moved.content)
        self.step.refresh_from_db()
        self.assertIsNone(self.step.payload["assignee_member_id"])
        self.assertIsNone(self.step.payload["assignee"])
        shown = self.client_for(self.csm).get(DETAIL.format(self.bundle.pk)).json()["steps"][0]
        self.assertIsNone(shown["preview"]["jira"]["assignee"])
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(self.step.status, "applied", self.step.error)
        [key] = self.jira.created
        self.assertNotIn("assignee", self.jira.issues[key]["fields"])
        self.assertEqual(self.jira.user_lookups, [])

    def test_an_edit_without_an_assignee_keeps_the_member(self):
        url = STEP.format(self.bundle.pk, self.step.pk)
        done = self.client_for(self.csm).patch(url, {"fields": {"summary": "New"}}, format="json")
        self.assertEqual(done.status_code, 200, done.content)
        self.step.refresh_from_db()
        self.assertEqual(self.step.payload["assignee_member_id"], self.erin.pk)

    def test_a_refused_read_keeps_who_tried_and_when(self):
        self.step.payload = {**self.step.payload, "assignee_member_id": self.other.pk}
        self.step.save(update_fields=["payload"])
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(self.step.status, "failed")
        self.assertTrue(self.step.result["attempted_at"])
        self.assertEqual(self.step.result["attempted_by"], self.csm.pk)

    def test_a_refused_lookup_on_retry_keeps_the_first_attempt(self):
        self.jira.drop_next("create")
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        first = dict(self.step.result)
        self.assertTrue(first["attempted_at"])
        self.jira.refuse_next("find", "Jira refused the lookup.")
        self.retry(self.mona, self.step)
        self.step.refresh_from_db()
        self.assertEqual(self.step.error, "Jira refused the lookup.")
        self.assertEqual(self.step.result["attempted_at"], first["attempted_at"])
        self.assertEqual(self.step.result["attempted_by"], self.csm.pk)
        lookup = AuditEvent.objects.get(action="agent_outside.call", metadata__op="lookup")
        self.assertEqual((lookup.metadata["outcome"], lookup.metadata["where"]), ("refused", "SUP"))

    def test_the_trail_holds_ids_only(self):
        self.run_all_steps(self.csm, self.bundle)
        [key] = self.jira.created
        rows = AuditEvent.objects.filter(action="agent_outside.call", metadata__op="create")
        [row] = rows
        self.assertEqual((row.metadata["where"], row.metadata["returned"]), ("SUP", key))
        blob = str(row.metadata)
        self.assertNotIn("Login loop", blob)
        self.assertNotIn("Since Monday", blob)
