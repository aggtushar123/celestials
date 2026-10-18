"""The department and Unassigned queues (agent bundles D2 contract §4.5,
§4.6, D2-5, D2-7): listed for their people while a connector feeds them,
holding only their bundles under the bundle read rule, paged like the team
queue, refused to anyone else."""

from services.accounts.capabilities import Capability
from services.accounts.models import Role, User
from services.agents.tests.bundle_fixtures import note
from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors.models import Connector
from services.segments.tests.fixtures import person

QUEUES = "/api/v1/work/queues/"
TEAM = "/api/v1/work/feed/team/"


class QueueBundlesTests(IntakeFixture):
    def keys(self, user):
        return [q["key"] for q in self.client_for(user).get(QUEUES).json()["queues"]]

    def test_a_department_queue_is_listed_for_its_people_and_leadership(self):
        self.connector("zendesk", "cs")
        self.assertIn("department:cs", self.keys(self.csm))
        self.assertIn("department:cs", self.keys(self.lee))
        self.assertNotIn("department:cs", self.keys(self.erin))
        self.assertEqual(self.keys(self.csm)[-2:], ["department:cs", "history"])

    def test_a_connector_without_credentials_still_lists_its_queue(self):
        made = self.connector("zendesk", "cs")
        Connector.objects.filter(pk=made.pk).update(credentials="")
        self.assertIn("department:cs", self.keys(self.csm))

    def test_unassigned_is_listed_for_admins_when_a_connector_has_no_department(self):
        self.assertNotIn("unassigned", self.keys(self.admin))
        self.connector("webhook", "")
        self.assertIn("unassigned", self.keys(self.admin))
        self.assertNotIn("unassigned", self.keys(self.csm))

    def test_the_queue_holds_its_bundles_and_counts_them(self):
        connector = self.connector("zendesk", "cs")
        _, thread = self.ticket_thread(self.loose, connector=connector)
        bundle = self.message_bundle(thread, note(), routed_to="department", department="cs")
        body = self.client_for(self.csm).get(f"{TEAM}?scope=department:cs").json()
        self.assertEqual(body["scope"], "department:cs")
        decide = body["groups"][0]
        self.assertEqual([i["id"] for i in decide["items"]], [bundle.pk])
        self.assertEqual([g["count"] for g in body["groups"]], [1, 0, 0])
        rail = {
            q["key"]: q["count"] for q in self.client_for(self.csm).get(QUEUES).json()["queues"]
        }
        self.assertEqual(rail["department:cs"], 1)

    def test_the_mine_count_leaves_out_the_departments_bundles(self):
        connector = self.connector("zendesk", "cs")
        rail = lambda: {  # noqa: E731
            q["key"]: q["count"] for q in self.client_for(self.csm).get(QUEUES).json()["queues"]
        }
        before = rail()["mine"]
        _, thread = self.ticket_thread(self.loose, connector=connector)
        self.message_bundle(thread, note(), routed_to="department", department="cs")
        after = rail()
        self.assertEqual((after["mine"], after["department:cs"]), (before, 1))

    def test_unreadable_bundles_are_hidden_not_named(self):
        connector = self.connector("jira", "engineering")
        _, thread = self.ticket_thread(self.pizza, connector=connector, number="ENG-1")
        self.message_bundle(thread, note(), routed_to="department", department="engineering")
        body = self.client_for(self.erin).get(f"{TEAM}?scope=department:engineering").json()
        self.assertEqual(
            (body["groups"][0]["items"], body["hidden"]), ([], 1)
        )  # Erin can't open Pizza Hut

    def test_refusals(self):
        self.assertEqual(
            self.client_for(self.csm).get(f"{TEAM}?scope=department:marketing").json()["code"],
            "SCOPE_UNKNOWN",
        )
        self.assertEqual(
            self.client_for(self.erin).get(f"{TEAM}?scope=department:cs").status_code, 403
        )
        self.assertEqual(self.client_for(self.csm).get(f"{TEAM}?scope=unassigned").status_code, 403)

    def test_an_admin_without_view_all_reads_unassigned(self):
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
        body = self.client_for(ada).get(f"{TEAM}?scope=unassigned").json()
        self.assertEqual([i["id"] for i in body["groups"][0]["items"]], [bundle.pk])

    def test_a_garbage_cursor_is_a_400_not_a_500(self):
        self.connector("zendesk", "cs")
        res = self.client_for(self.csm).get(
            f"{TEAM}?scope=department:cs&group=decide&cursor=garbage"
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["cursor"], ["That list has changed. Reload Work."])

    def test_a_long_queue_pages_with_a_real_cursor(self):
        connector = self.connector("zendesk", "cs")
        made = set()
        for n in range(51):
            _, thread = self.ticket_thread(self.loose, connector=connector, number=f"ZD-{n}")
            made.add(
                self.message_bundle(
                    thread, note(), routed_to="department", department="cs", title=f"B{n}"
                ).pk
            )
        client = self.client_for(self.csm)
        first = client.get(f"{TEAM}?scope=department:cs").json()["groups"][0]
        self.assertEqual((first["count"], len(first["items"])), (51, 50))
        second = client.get(
            f"{TEAM}?scope=department:cs&group=decide&cursor={first['next']}"
        ).json()["group"]
        self.assertEqual(len(second["items"]), 1)
        self.assertIsNone(second["next"])
        ids = {i["id"] for i in first["items"]} | {i["id"] for i in second["items"]}
        self.assertEqual(ids, made)

    def test_a_kind_filter_is_ignored(self):
        self.connector("zendesk", "cs")
        res = self.client_for(self.csm).get(f"{TEAM}?scope=department:cs&kind=task")
        self.assertEqual(res.status_code, 200)

    def test_the_unknown_department_says_what_to_choose(self):
        body = self.client_for(self.csm).get(f"{TEAM}?scope=department:marketing").json()
        self.assertEqual(body["detail"], "Choose team, company, a department or unassigned.")

    def test_unassigned_follows_the_departments_on_the_rail(self):
        self.connector("zendesk", "cs")
        self.connector("webhook", "")
        keys = self.keys(self.admin)
        self.assertEqual(keys[-3:], ["department:cs", "unassigned", "history"])
