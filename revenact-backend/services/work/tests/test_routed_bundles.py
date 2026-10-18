"""A routed message bundle waits only in its queue (agent bundles D2
contract D2-8), and the badge counts Mine plus your own department's queue
(D2-9), never Unassigned. Mine's rail row does not take the department."""

from services.agents.tests.bundle_fixtures import note
from services.agents.tests.intake_fixtures import IntakeFixture

FEED = "/api/v1/work/feed/?kind=bundle"
TEAM = "/api/v1/work/feed/team/?scope=team&kind=bundle"
COMPANY = "/api/v1/work/feed/team/?scope=company&kind=bundle"
COUNT = "/api/v1/work/feed/count/"
QUEUES = "/api/v1/work/queues/"


def ids(body):
    return [i["id"] for g in body["groups"] for i in g["items"]]


class RoutedBundlesTests(IntakeFixture):
    def test_a_department_bundle_on_an_owned_record_is_not_on_mine_or_my_team(self):
        connector = self.connector("zendesk", "cs")
        _, thread = self.ticket_thread(self.pizza, connector=connector)
        bundle = self.message_bundle(thread, note(), routed_to="department", department="cs")
        self.assertNotIn(bundle.pk, ids(self.client_for(self.csm).get(FEED).json()))
        self.assertNotIn(bundle.pk, ids(self.client_for(self.mona).get(TEAM).json()))
        self.assertNotIn(bundle.pk, ids(self.client_for(self.admin).get(COMPANY).json()))

    def test_an_owner_routed_message_bundle_is_on_mine(self):
        _, thread = self.ticket_thread(self.pizza)
        bundle = self.message_bundle(thread, note())
        self.assertIn(bundle.pk, ids(self.client_for(self.csm).get(FEED).json()))

    def test_the_badge_counts_your_own_department_and_not_unassigned(self):
        _, cs = self.ticket_thread(self.loose, connector=self.connector("zendesk", "cs"))
        self.message_bundle(cs, note(), routed_to="department", department="cs")
        _, everyone = self.ticket_thread(
            self.loose, connector=self.connector("webhook", ""), number="WH-1"
        )
        self.message_bundle(everyone, note("U", "B"), routed_to="admins")
        carl = self.client_for(self.csm).get(COUNT).json()
        erin = self.client_for(self.erin).get(COUNT).json()
        self.assertEqual((carl["decide"], erin["decide"]), (1, 0))
        self.assertEqual(self.client_for(self.admin).get(COUNT).json()["decide"], 0)

    def test_the_mine_row_on_the_rail_does_not_count_the_department(self):
        _, cs = self.ticket_thread(self.loose, connector=self.connector("zendesk", "cs"))
        self.message_bundle(cs, note(), routed_to="department", department="cs")
        rows = self.client_for(self.csm).get(QUEUES).json()
        rows = rows["queues"] if isinstance(rows, dict) else rows
        mine = next(r for r in rows if r["key"] == "mine")
        self.assertEqual(mine["count"], 0)

    def test_a_reader_without_a_valid_function_counts_no_department(self):
        from unittest.mock import patch

        from services.accounts.models import User

        User.objects.filter(pk=self.csm.pk).update(function="")
        with patch("services.work.queue_bundles.count", return_value=0) as queue_count:
            answer = self.client_for(User.objects.get(pk=self.csm.pk)).get(COUNT)
        self.assertEqual(answer.status_code, 200)
        queue_count.assert_not_called()
