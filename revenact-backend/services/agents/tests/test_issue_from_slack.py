"""Slack escalations D4, SE4-8: an issue made from a Slack conversation says
where it came from, is filed under the customer at once (linked to the
thread), and links back in Jira; a refused link is a note, never a failure.
Jira is a fake."""

from services.agents.actions import jira_issues
from services.agents.evidence import Context
from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors.providers.jira import adf_text
from services.customers.models import Ticket


class FromSlackTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.board = self.jira_connector(department="cs")
        self.support = self.slack_connector()
        self.conversation, self.thread = self.slack_thread(self.pizza, self.support)

    def payload(self):
        return {
            **self.jira_payload(self.board),
            "conversation_id": self.conversation.pk,
            "slack_url": self.conversation.url,
            "slack_channel": "support",
        }

    def run_it(self):
        bundle = self.outside_bundle(self.thread, ("jira.create", self.payload()))
        self.run_all_steps(self.csm, bundle)
        return bundle.steps.get()

    def test_validate_carries_the_thread_and_an_escalation_clears_the_assignee(self):
        ctx = Context(self.org, "cs", self.today)
        ctx.jira_connector = {"id": self.board.pk, "project": "SUP"}
        ctx.members = {self.erin.pk: {"id": self.erin.pk, "name": "Erin Eng"}}
        ref = f"customer:{self.pizza.pk}"
        ctx.thread_slack = {
            "id": self.conversation.pk,
            "record": ref,
            "url": self.conversation.url,
            "channel_name": "support",
        }
        model = {
            "summary": "Exports fail",
            "description": "All of them.",
            "assignee_id": self.erin.pk,
        }
        clean = jira_issues.validate(model, {"ref": ref}, ctx, [])
        self.assertEqual(
            (
                clean["conversation_id"],
                clean["slack_url"],
                clean["slack_channel"],
                clean["assignee_member_id"],
            ),
            (self.conversation.pk, self.conversation.url, "support", self.erin.pk),
        )
        ctx.escalation = object()
        self.assertIsNone(jira_issues.validate(model, {"ref": ref}, ctx, [])["assignee_member_id"])

    def test_the_description_ends_with_the_thread(self):
        step = self.run_it()
        fields = self.jira.issues[step.outputs["ticket_key"]]["fields"]
        text = adf_text(fields["description"])
        self.assertIn(f"From Slack: {self.conversation.url}", text)
        self.assertLess(text.index("From Slack"), text.index("Created by"))

    def test_it_is_filed_at_once_under_the_customer_and_linked_to_the_thread(self):
        step = self.run_it()
        self.assertEqual(step.status, "applied", step.error)
        ticket = Ticket.objects.get(connector=self.board, external_id="SUP-101")
        self.assertEqual(
            (
                ticket.customer_id,
                ticket.conversation_id,
                ticket.ticket_number,
                ticket.status,
                ticket.priority,
                ticket.department,
                ticket.assignee_name,
            ),
            (self.pizza.pk, self.conversation.pk, "SUP-101", "open", "high", "cs", "Unassigned"),
        )
        self.assertEqual(ticket.external_url, "https://acme.atlassian.net/browse/SUP-101")

    def test_a_retry_that_finds_a_dropped_create_files_the_issue(self):
        self.jira.drop_next("create")
        bundle = self.outside_bundle(self.thread, ("jira.create", self.payload()))
        self.run_all_steps(self.csm, bundle)
        step = bundle.steps.get()
        self.assertEqual(step.status, "failed")
        self.retry(self.csm, step)
        step.refresh_from_db()
        self.assertEqual(step.status, "applied", step.error)
        self.assertEqual(Ticket.objects.filter(external_id="SUP-101").count(), 1)

    def test_an_issue_already_filed_gets_only_its_conversation(self):
        """M-2: a sync filed the issue first; the run links it to the thread
        and changes nothing else."""
        Ticket.objects.create(
            connector=self.board,
            external_id="SUP-101",
            customer=self.pizza,
            ticket_number="SUP-101",
            title="Synced title",
            assignee_name="Erin Eng",
            department="cs",
            opened_at=self.today,
        )
        step = self.run_it()
        self.assertEqual(step.status, "applied", step.error)
        [ticket] = Ticket.objects.filter(external_id="SUP-101")
        self.assertEqual(
            (ticket.conversation_id, ticket.title, ticket.assignee_name),
            (self.conversation.pk, "Synced title", "Erin Eng"),
        )

    def test_a_failed_lookup_never_fails_the_step(self):
        """M-1: filing never fails the step, its lookups included."""
        from unittest.mock import patch

        with patch(
            "services.agents.outside.filing._conversation", side_effect=RuntimeError("boom")
        ):
            step = self.run_it()
        self.assertEqual(step.status, "applied", step.error)
        self.assertFalse(Ticket.objects.filter(external_id="SUP-101").exists())

    def test_a_link_that_breaks_is_a_note_not_a_failure(self):
        """M-4: anything but a refusal from the link call, after the issue
        exists, is the same note."""
        from unittest.mock import patch

        with patch.object(self.jira, "remote_link", side_effect=RuntimeError("boom")):
            step = self.run_it()
        self.assertEqual((step.status, step.result["note"]), ("applied", jira_issues.LINK_REFUSED))
        self.assertEqual(step.outputs["ticket_key"], "SUP-101")

    def test_it_links_back_to_the_thread_in_jira(self):
        step = self.run_it()
        self.assertEqual(
            self.jira.remote_links,
            [
                (
                    "SUP-101",
                    self.conversation.url,
                    "Slack: #support thread",
                    f"revenact-slack-{self.conversation.pk}",
                )
            ],
        )
        self.assertEqual(step.result.get("note", ""), "")

    def test_a_refused_link_is_a_note_not_a_failure(self):
        self.jira.refuse_next("remote_link", "Jira refused it.")
        step = self.run_it()
        self.assertEqual((step.status, step.result["note"]), ("applied", jira_issues.LINK_REFUSED))

    def test_a_connection_that_doesnt_cover_the_customer_files_nothing(self):
        self.board.customers.set([self.taco])
        step = self.run_it()
        self.assertEqual(step.status, "applied", step.error)
        self.assertFalse(Ticket.objects.filter(external_id="SUP-101").exists())

    def test_an_issue_from_no_conversation_is_as_before(self):
        bundle = self.outside_bundle(self.thread, ("jira.create", self.jira_payload(self.board)))
        self.run_all_steps(self.csm, bundle)
        self.assertFalse(Ticket.objects.filter(external_id="SUP-101").exists())
        self.assertEqual(self.jira.remote_links, [])
