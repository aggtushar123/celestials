"""jira.assign (agent bundles D3 contract §2.4, D3-7, D3-17). Jira is a fake."""

from core.models import AuditEvent
from services.agents.actions import jira_issues
from services.agents.evidence import Context
from services.agents.kinds import Invalid
from services.agents.tests.outside_fixtures import OutsideFixture

DETAIL = "/api/v1/agents/bundles/{}/"
STEP = "/api/v1/agents/bundles/{}/steps/{}/"


class JiraAssignTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        # Customer Success's Jira: Carl reads its tickets, so he reads and runs the bundle.
        self.board = self.jira_connector(department="cs")
        self.ticket, self.thread = self.jira_thread(self.pizza, self.board, key="SUP-12")

    def ctx(self):
        ctx = Context(self.org, "cs", self.today)
        ctx.jira_connector = {"id": self.board.pk, "project": "SUP"}
        ctx.members = {self.erin.pk: {"id": self.erin.pk, "name": "Erin Eng"}}
        ctx.thread_ticket = {
            "id": self.ticket.pk,
            "record": f"customer:{self.pizza.pk}",
            "line": "",
            "provider": "jira",
            "connector_id": self.board.pk,
            "external_id": "SUP-12",
            "number": "SUP-12",
            "config": self.board.config,
            "usable": True,
        }
        return ctx

    def one_step(self, issue="SUP-12", **kw):
        kw = kw or {"member": self.erin.pk}
        bundle = self.outside_bundle(
            self.thread, ("jira.assign", self.assign_payload(self.board, issue, **kw))
        )
        return bundle, bundle.steps.get()

    def test_the_source_issue_or_an_earlier_steps(self):
        row = {"ref": f"customer:{self.pizza.pk}"}
        self.assertEqual(
            jira_issues.validate_assign(
                {"issue": "source", "assignee_id": self.erin.pk}, row, self.ctx(), []
            ),
            {
                "connector_id": self.board.pk,
                "issue": "SUP-12",
                "assignee": None,
                "assignee_member_id": self.erin.pk,
            },
        )
        self.assertEqual(
            jira_issues.validate_assign(
                {"issue": "{{step 1.ticket_key}}", "assignee_id": self.erin.pk}, row, self.ctx(), []
            )["issue"],
            "{{step 1.ticket_key}}",
        )
        for bad in (
            {"issue": "ENG-9", "assignee_id": self.erin.pk},
            {"issue": "source", "assignee_id": None},
        ):
            with self.subTest(bad=bad), self.assertRaises(Invalid):
                jira_issues.validate_assign(bad, row, self.ctx(), [])

    def test_a_run_assigns_the_source_issue(self):
        bundle, step = self.one_step()
        self.run_all_steps(self.csm, bundle)
        step.refresh_from_db()
        self.assertEqual(step.status, "applied", step.error)
        self.assertEqual(self.jira.assigned, [("SUP-12", "acc-erin")])
        self.assertEqual(
            step.outputs,
            {"ticket_key": "SUP-12", "ticket_url": "https://acme.atlassian.net/browse/SUP-12"},
        )

    def test_the_trail_holds_ids_only(self):
        bundle, _ = self.one_step()
        self.run_all_steps(self.csm, bundle)
        [row] = AuditEvent.objects.filter(action="agent_outside.call", metadata__op="assign")
        self.assertEqual((row.metadata["where"], row.metadata["returned"]), ("SUP-12", "SUP-12"))
        self.assertNotIn("Erin", str(row.metadata))

    def test_already_assigned_calls_nothing(self):
        self.jira.issues["SUP-12"]["assignee"] = "acc-erin"
        bundle, _ = self.one_step()
        self.run_all_steps(self.csm, bundle)
        self.assertEqual(self.jira.assigned, [])
        self.assertEqual(bundle.steps.get().status, "applied")
        lookup = AuditEvent.objects.get(action="agent_outside.call")
        self.assertEqual((lookup.metadata["op"], lookup.metadata["outcome"]), ("lookup", "found"))
        self.assertEqual(
            (lookup.metadata["where"], lookup.metadata["returned"]), ("SUP-12", "SUP-12")
        )

    def test_it_assigns_the_issue_an_earlier_step_made(self):
        bundle = self.outside_bundle(
            self.thread,
            ("jira.create", self.jira_payload(self.board)),
            (
                "jira.assign",
                self.assign_payload(self.board, "{{step 1.ticket_key}}", member=self.erin.pk),
            ),
        )
        detail = self.client_for(self.csm).get(DETAIL.format(bundle.pk)).json()
        self.assertEqual(detail["steps"][1]["placeholders"][0]["label"], "Jira key from step 1")
        self.run_all_steps(self.csm, bundle)
        [made] = self.jira.created
        self.assertEqual(self.jira.assigned, [(made, "acc-erin")])

    def test_it_needs_its_issue_to_have_been_made(self):
        self.jira.refuse_next("create", "Jira says the project SUP needs a component.")
        bundle = self.outside_bundle(
            self.thread,
            ("jira.create", self.jira_payload(self.board)),
            (
                "jira.assign",
                self.assign_payload(self.board, "{{step 1.ticket_key}}", member=self.erin.pk),
            ),
        )
        self.run_all_steps(self.csm, bundle)
        assign = bundle.steps.get(position=2)
        self.assertEqual(
            (assign.status, assign.error), ("failed", "Needs step 1, which didn't run.")
        )

    def test_it_cant_be_undone(self):
        bundle, step = self.one_step()
        self.run_all_steps(self.csm, bundle)
        undo = self.client_for(self.csm).post(f"/api/v1/agents/actions/{step.pk}/undo/")
        self.assertEqual(undo.json()["detail"], "This Jira issue has been assigned.")

    def test_no_assignee_fails_until_one_is_chosen(self):
        bundle, step = self.one_step(member=None)
        self.run_all_steps(self.csm, bundle)
        step.refresh_from_db()
        self.assertEqual(
            (step.status, step.error), ("failed", "Choose who to assign it to, then Retry.")
        )
        self.assertEqual(step.result["attempted_by"], self.csm.pk)
        self.assertEqual(self.jira.assigned, [])
        picked = {"assignee": {"id": "acc-erin", "name": "Erin Eng"}}
        self.retry(self.csm, step, fields=picked)
        step.refresh_from_db()
        self.assertEqual(step.status, "applied", step.error)
        self.assertEqual(self.jira.assigned, [("SUP-12", "acc-erin")])

    def test_choosing_from_the_list_clears_the_member(self):
        bundle, step = self.one_step()
        url = STEP.format(bundle.pk, step.pk)
        picked = {"assignee": {"id": "acc-zed", "name": "Zed"}}
        done = self.client_for(self.csm).patch(url, {"fields": picked}, format="json")
        self.assertEqual(done.status_code, 200, done.content)
        step.refresh_from_db()
        self.assertIsNone(step.payload["assignee_member_id"])
        self.assertEqual(step.payload["assignee"], {"id": "acc-zed", "name": "Zed"})
        null = self.client_for(self.csm).patch(url, {"fields": {"assignee": None}}, format="json")
        self.assertEqual(null.status_code, 400)

    def test_a_refused_read_keeps_who_tried_and_when(self):
        self.jira.refuse_next("assignee", "Jira can't find SUP-12.")
        bundle, step = self.one_step()
        self.run_all_steps(self.csm, bundle)
        step.refresh_from_db()
        self.assertEqual((step.status, step.error), ("failed", "Jira can't find SUP-12."))
        self.assertTrue(step.result["attempted_at"])
        self.assertEqual(step.result["attempted_by"], self.csm.pk)
        lookup = AuditEvent.objects.get(action="agent_outside.call", metadata__op="lookup")
        self.assertEqual(
            (lookup.metadata["outcome"], lookup.metadata["where"]), ("refused", "SUP-12")
        )

    def test_a_refused_assign_keeps_who_tried_and_when(self):
        self.jira.refuse_next("assign", "Jira won't assign SUP-12 to Erin Eng.")
        bundle, step = self.one_step()
        self.run_all_steps(self.csm, bundle)
        step.refresh_from_db()
        self.assertEqual(step.status, "failed")
        self.assertEqual(step.result["attempted_by"], self.csm.pk)
        self.assertTrue(step.result["attempted_at"])

    def test_a_retry_after_a_lost_answer_finds_it_done(self):
        self.jira.drop_next("assign")
        bundle, step = self.one_step()
        self.run_all_steps(self.csm, bundle)
        step.refresh_from_db()
        self.assertEqual(step.status, "failed")
        first = step.result["attempted_at"]
        self.retry(self.mona, step)
        step.refresh_from_db()
        self.assertEqual(step.status, "applied", step.error)
        self.assertEqual(self.jira.assigned, [("SUP-12", "acc-erin")])
        self.assertEqual(step.result["attempted_at"], first)

    def test_an_issue_someone_else_holds_is_looked_up_as_elsewhere(self):
        # Round 2 D1 contract R2D1-9.
        self.jira.issues["SUP-12"]["assignee"] = "acc-priya"
        bundle, _ = self.one_step()
        self.run_all_steps(self.csm, bundle)
        lookup = AuditEvent.objects.get(action="agent_outside.call", metadata__op="lookup")
        self.assertEqual(
            (lookup.metadata["outcome"], lookup.metadata["returned"]), ("elsewhere", "")
        )
        self.assertEqual(self.jira.assigned, [("SUP-12", "acc-erin")])

    def test_an_unassigned_issue_is_looked_up_as_not_found(self):
        bundle, _ = self.one_step()
        self.run_all_steps(self.csm, bundle)
        lookup = AuditEvent.objects.get(action="agent_outside.call", metadata__op="lookup")
        self.assertEqual(lookup.metadata["outcome"], "not_found")
