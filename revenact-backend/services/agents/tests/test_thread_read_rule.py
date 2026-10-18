"""A message bundle is read only by people who may read its source
(agent bundles D2 contract §5.1, spec §4.4): mail by its mailbox owner alone
(owner-only, 2026-10-17), never by their managers or view-all; a ticket by
its department's people and Leadership. Anyone else gets 404, a queue counts it in `hidden`, and its
steps are missing from the old action routes too."""

from services.agents import threads
from services.agents.models import AgentBundle
from services.agents.tests.bundle_fixtures import BUNDLES, HISTORY, note
from services.agents.tests.intake_fixtures import IntakeFixture

ACTIONS = "/api/v1/agents/actions/"


class ThreadReadRuleTests(IntakeFixture):
    def status(self, user, bundle):
        return self.client_for(user).get(f"{BUNDLES}{bundle.pk}/").status_code

    def test_mail_is_read_by_its_mailbox_owner_alone(self):
        _, thread = self.mail_thread(self.pizza, self.csm)
        bundle = self.message_bundle(thread, note())
        self.assertEqual(self.status(self.csm, bundle), 200)
        self.assertEqual(self.status(self.mona, bundle), 404)  # Carl reports to Mona: not enough
        self.assertEqual(self.status(self.admin, bundle), 404)  # nor is view-all
        self.assertEqual(self.status(self.other, bundle), 404)

    def test_a_ticket_is_read_by_its_department_and_leadership(self):
        engineering = self.connector("jira", "engineering")
        _, thread = self.ticket_thread(self.loose, connector=engineering, number="ENG-1")
        bundle = self.message_bundle(
            thread, note(), routed_to="department", department="engineering"
        )
        self.assertEqual(self.status(self.erin, bundle), 200)
        self.assertEqual(self.status(self.lee, bundle), 200)
        self.assertEqual(self.status(self.csm, bundle), 404)  # Carl opens Loose Ltd, not the ticket

    def test_a_message_bundle_whose_thread_is_gone_is_nobodys(self):
        _, thread = self.ticket_thread(self.pizza)
        bundle = self.message_bundle(thread, note())
        AgentBundle.objects.filter(pk=bundle.pk).update(thread=None)
        self.assertEqual(self.status(self.csm, bundle), 404)

    def test_its_steps_are_missing_from_the_action_routes(self):
        _, thread = self.mail_thread(self.pizza, self.csm)
        step = self.message_bundle(thread, note()).steps.get()
        self.assertEqual(self.client_for(self.admin).get(f"{ACTIONS}{step.pk}/").status_code, 404)
        self.assertEqual(self.client_for(self.csm).get(f"{ACTIONS}{step.pk}/").status_code, 200)

    def test_history_counts_what_it_cannot_name(self):
        _, thread = self.mail_thread(self.pizza, self.csm)
        bundle = self.message_bundle(thread, note())
        AgentBundle.objects.filter(pk=bundle.pk).update(status="done", run_by=self.csm)
        body = self.client_for(self.admin).get(HISTORY).json()
        self.assertEqual((body["count"], body["hidden"]), (0, 1))

    def test_may_read_source_says_the_same(self):
        _, mail = self.mail_thread(self.pizza, self.csm)
        _, ticket = self.ticket_thread(self.loose, connector=self.connector("jira", "engineering"))
        self.assertEqual(
            [threads.may_read_source(u, mail) for u in (self.csm, self.mona, self.admin)],
            [True, False, False],
        )
        self.assertEqual(
            [threads.may_read_source(u, ticket) for u in (self.erin, self.lee, self.csm)],
            [True, True, False],
        )
