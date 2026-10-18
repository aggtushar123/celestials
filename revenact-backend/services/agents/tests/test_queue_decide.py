"""Who may run a department or Unassigned bundle's steps (agent bundles D2
contract D2-6): today's rule, plus, on a record nobody owns, the department's
people and Leadership for a department bundle and admins for an Unassigned
one. On an owned record nothing changes."""

from services.accounts.capabilities import Capability
from services.accounts.models import Role, User
from services.agents.deciding import may_decide
from services.agents.tests.bundle_fixtures import BUNDLES, note
from services.agents.tests.intake_fixtures import IntakeFixture
from services.segments.tests.fixtures import person


def run_all(client, bundle):
    steps = [{"id": s.pk, "selected": True} for s in bundle.steps.filter(status="proposed")]
    return client.post(f"{BUNDLES}{bundle.pk}/run/", {"steps": steps}, format="json")


class QueueDecideTests(IntakeFixture):
    def test_a_department_runs_its_bundle_on_an_ownerless_record(self):
        _, thread = self.ticket_thread(self.loose)
        bundle = self.message_bundle(thread, note(), routed_to="department", department="cs")
        step = bundle.steps.get()
        self.assertTrue(may_decide(self.fresh(self.csm), step))  # Carl is in CS
        self.assertFalse(may_decide(self.fresh(self.erin), step))  # Engineering
        answer = run_all(self.client_for(self.csm), bundle)
        self.assertEqual((answer.status_code, answer.json()["bundle"]["status"]), (200, "done"))

    def test_leadership_runs_any_department_bundle_on_an_ownerless_record(self):
        engineering = self.connector("jira", "engineering")
        _, thread = self.ticket_thread(self.loose, connector=engineering, number="ENG-1")
        bundle = self.message_bundle(
            thread, note(), routed_to="department", department="engineering"
        )
        self.assertTrue(may_decide(self.fresh(self.lee), bundle.steps.get()))
        self.assertTrue(may_decide(self.fresh(self.erin), bundle.steps.get()))

    def test_an_admin_runs_an_unassigned_bundle_and_a_member_does_not(self):
        role = Role.objects.create(
            organisation=self.org,
            name="Settings",
            slug="settings",
            permissions=[Capability.MANAGE_ORG_SETTINGS],
        )
        admin = person("ada@acme.io", "Ada Admin", self.org)
        User.objects.filter(pk=admin.pk).update(role=role)
        _, thread = self.ticket_thread(self.loose, connector=self.connector("webhook", ""))
        bundle = self.message_bundle(thread, note(), routed_to="admins")
        self.assertTrue(may_decide(self.fresh(admin), bundle.steps.get()))
        self.assertFalse(may_decide(self.fresh(self.csm), bundle.steps.get()))

    def test_an_owned_record_keeps_todays_rule(self):
        engineering = self.connector("jira", "engineering")
        _, thread = self.ticket_thread(self.pizza, connector=engineering, number="ENG-2")
        bundle = self.message_bundle(
            thread, note(), routed_to="department", department="engineering"
        )
        self.assertFalse(may_decide(self.fresh(self.erin), bundle.steps.get()))

    def test_a_nightly_bundle_on_an_ownerless_record_keeps_todays_rule(self):
        bundle = self.bundle_of(self.loose, note())
        self.assertFalse(may_decide(self.fresh(self.csm), bundle.steps.get()))
