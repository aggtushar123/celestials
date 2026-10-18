"""Bundles waiting, for the queues (agent bundles D2 contract D2-24): each
person who may read and run a step of a new department or Unassigned bundle
is told once a workspace day, with a link to the queue."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.accounts.capabilities import Capability
from services.accounts.models import Role, User
from services.agents.tests.bundle_fixtures import note
from services.agents.tests.intake_fixtures import IntakeFixture
from services.notifications.models import Notification
from services.segments.tests.fixtures import person
from services.work import proposal_notice


class QueueNoticeTests(IntakeFixture):
    def told(self):
        return dict(
            Notification.objects.filter(kind="agent_proposal_waiting").values_list(
                "recipient_id", "link"
            )
        )

    def test_the_departments_people_who_may_run_it_are_told_once(self):
        _, thread = self.ticket_thread(self.loose)
        bundle = self.message_bundle(thread, note(), routed_to="department", department="cs")
        told = proposal_notice.notify_queues(self.org, [bundle.pk], today=self.today)
        links = self.told()
        self.assertEqual(links[self.csm.pk], "/work?queue=department:cs&kind=bundle")
        self.assertIn(self.lee.pk, links)  # Leadership
        self.assertNotIn(self.erin.pk, links)
        self.assertEqual(told, len(links))
        self.assertEqual(proposal_notice.notify_queues(self.org, [bundle.pk], today=self.today), 0)

    def test_admins_are_told_of_unassigned(self):
        role = Role.objects.create(
            organisation=self.org,
            name="Settings",
            slug="settings",
            permissions=[Capability.MANAGE_ORG_SETTINGS],
        )
        ada = person("ada@acme.io", "Ada Admin", self.org)
        User.objects.filter(pk=ada.pk).update(role=role)
        _, thread = self.ticket_thread(self.loose, connector=self.connector("webhook", ""))
        bundle = self.message_bundle(thread, note(), routed_to="admins")
        proposal_notice.notify_queues(self.org, [bundle.pk], today=self.today)
        self.assertEqual(self.told().get(ada.pk), "/work?queue=unassigned&kind=bundle")
        self.assertNotIn(self.csm.pk, self.told())

    def test_an_owner_routed_bundle_is_not_a_queue_notice(self):
        _, thread = self.ticket_thread(self.pizza)
        bundle = self.message_bundle(thread, note())
        self.assertEqual(proposal_notice.notify_queues(self.org, [bundle.pk], today=self.today), 0)

    def test_queries_do_not_grow_with_the_bundles(self):
        def run(count):
            Notification.objects.all().delete()
            ids = []
            for _ in range(count):
                _, thread = self.ticket_thread(self.loose)
                ids.append(
                    self.message_bundle(thread, note(), routed_to="department", department="cs").pk
                )
            with CaptureQueriesContext(connection) as ctx:
                proposal_notice.notify_queues(self.org, ids, today=self.today)
            return len(ctx)

        run(1)  # warms the workspace's settings row, created once
        one = run(1)
        self.assertEqual(run(4), one)
