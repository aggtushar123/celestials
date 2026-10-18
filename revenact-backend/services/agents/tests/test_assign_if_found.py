"""Slack escalations D4, SE4-9: an escalation's Jira assignment is skipped
with a note when the person has no Jira user by their login email, waits
for a choice when nobody is named, and writes the name on the filed ticket.
Jira is a fake."""

from services.accounts.models import User
from services.agents.actions import jira_issues
from services.agents.evidence import Context
from services.agents.kinds import Invalid
from services.agents.tests.outside_fixtures import OutsideFixture
from services.customers.models import Ticket
from services.segments.tests.fixtures import person


class IfFoundTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.board = self.jira_connector(department="cs")
        self.ticket, self.thread = self.jira_thread(self.pizza, self.board, key="SUP-12")
        self.jesh = person(
            "jesh@acme.io", "Jesh Sanghvi", self.org, function=User.Function.ENGINEERING
        )

    def run_assign(self, member, **flags):
        payload = {**self.assign_payload(self.board, "SUP-12", member=member), **flags}
        bundle = self.outside_bundle(self.thread, ("jira.assign", payload))
        self.run_all_steps(self.csm, bundle)
        return bundle, bundle.steps.get()

    def test_no_jira_user_skips_with_the_note(self):
        bundle, step = self.run_assign(self.jesh.pk, if_found=True)
        self.assertEqual(
            (step.status, step.result["note"]),
            (
                "skipped",
                "Jesh has no account in Jira, so the issue is unassigned. Their to-do is in Work.",
            ),
        )
        bundle.refresh_from_db()
        self.assertEqual(bundle.status, "done")
        self.assertEqual(self.jira.assigned, [])

    def test_without_if_found_it_fails_as_before(self):
        _, step = self.run_assign(self.jesh.pk)
        self.assertEqual(step.status, "failed")

    def test_a_jira_user_is_assigned_and_named_on_the_filed_ticket(self):
        Ticket.objects.filter(pk=self.ticket.pk).update(assignee_name="Unassigned")
        _, step = self.run_assign(self.erin.pk, if_found=True)
        self.assertEqual(step.status, "applied", step.error)
        self.assertEqual(self.jira.assigned, [("SUP-12", "acc-erin")])
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.assignee_name, "Erin Eng")

    def test_an_assignee_without_a_name_leaves_the_filed_ticket_s_name(self):
        """M-3: no real name, so the filed ticket is not named "the assignee"."""
        Ticket.objects.filter(pk=self.ticket.pk).update(assignee_name="Unassigned")
        _, step = self.run_assign(None, assignee={"id": "acc-erin", "name": ""})
        self.assertEqual(step.status, "applied", step.error)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.assignee_name, "Unassigned")

    def test_nobody_named_waits_for_a_choice(self):
        _, step = self.run_assign(None, if_found=True)
        self.assertEqual((step.status, step.error), ("failed", jira_issues.CHOOSE_ASSIGNEE))

    def context(self):
        ctx = Context(self.org, "cs", self.today)
        ctx.jira_connector = {"id": self.board.pk, "project": "SUP"}
        ctx.members = {self.erin.pk: {"id": self.erin.pk, "name": "Erin Eng"}}
        return ctx

    def test_only_an_escalation_proposes_nobody(self):
        ctx = self.context()
        row = {"ref": f"customer:{self.pizza.pk}"}
        model = {"issue": "{{step 1.ticket_key}}", "assignee_id": None}
        with self.assertRaises(Invalid):
            jira_issues.validate_assign(model, row, ctx, [])
        ctx.escalation = object()
        clean = jira_issues.validate_assign(model, row, ctx, [])
        self.assertEqual(
            (clean["assignee_member_id"], clean["if_found"], clean["escalation"]),
            (None, True, True),
        )

    def test_two_threads_on_one_record_each_keep_their_assign_step(self):
        """Ruling F4: the one-open-twin rule keys on the target, so an
        escalation's target names its conversation."""
        row = {"ref": f"customer:{self.pizza.pk}"}
        model = {"issue": "{{step 1.ticket_key}}", "assignee_id": None}
        targets = []
        for conversation in (11, 12):
            ctx = self.context()
            ctx.escalation = object()
            ctx.thread_slack = {"id": conversation, "record": row["ref"]}
            clean = jira_issues.validate_assign(model, row, ctx, [])
            self.assertEqual(clean["conversation_id"], conversation)
            targets.append(jira_issues.ASSIGN.target(clean))
        self.assertNotEqual(targets[0], targets[1])
        # the same thread proposing again is still one step; a plain assign is unchanged
        self.assertEqual(targets[0], jira_issues.ASSIGN.target(clean | {"conversation_id": 11}))
        plain = {"issue": "SUP-12"}
        self.assertEqual(jira_issues.ASSIGN.target(plain), "jira:assign:SUP-12")
