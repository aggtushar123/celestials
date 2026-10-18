"""Round 2 D3 contract §3.1, R2D3-7: a queue's unmatched items, for the
department's people and Leadership (Unassigned: admins), newest first, 25 a
page, the text and the sender included."""

from datetime import timedelta

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors.tests.unmatched_fixtures import item
from services.customers.scoping import can_open

URL = "/api/v1/work/unmatched/"


class UnmatchedListTests(IntakeFixture):
    def setUp(self):
        self.cs = self.connector("jira", "cs")
        self.eng = self.connector("jira", "engineering")
        self.everyone = self.connector("slack", "")

    def get(self, user, query):
        return self.client_for(user).get(f"{URL}?{query}")

    def test_the_department_sees_its_own_items(self):
        mine = item(self.cs, title="Export fails")
        item(self.eng, title="Engineering's")
        body = self.get(self.csm, "queue=department:cs").json()
        self.assertEqual([row["id"] for row in body["items"]], [mine.pk])
        row = body["items"][0]
        self.assertEqual(row["from"], {"name": "Ann Lee", "email": "ann@newco.io"})
        self.assertEqual(row["connector"]["id"], self.cs.pk)
        self.assertTrue(row["can_add_contact"])
        self.assertEqual(body["count"], 1)

    def test_another_department_and_view_all_are_refused(self):
        item(self.eng)
        response = self.get(self.csm, "queue=department:engineering")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "SCOPE_NOT_ALLOWED")

    def test_leadership_reads_every_department_and_admins_unassigned(self):
        item(self.eng)
        item(self.everyone)
        self.assertEqual(self.get(self.lee, "queue=department:engineering").json()["count"], 1)
        self.assertEqual(self.get(self.admin, "queue=unassigned").json()["count"], 1)
        self.assertEqual(self.get(self.csm, "queue=unassigned").status_code, 403)

    def test_a_queue_that_is_not_a_routed_one_is_refused(self):
        response = self.get(self.csm, "queue=mine")
        self.assertEqual(
            response.json(),
            {"code": "SCOPE_UNKNOWN", "detail": "Choose a department or unassigned."},
        )

    def test_dismissed_rows_are_not_listed(self):
        item(self.cs, status="dismissed", title="", excerpt="")
        self.assertEqual(self.get(self.csm, "queue=department:cs").json()["items"], [])

    def test_pages_of_25_newest_first(self):
        now = timezone.now()
        for n in range(30):
            item(self.cs, last_seen_at=now - timedelta(minutes=n))
        first = self.get(self.csm, "queue=department:cs").json()
        self.assertEqual(len(first["items"]), 25)
        rest = self.get(self.csm, f"queue=department:cs&cursor={first['next']}").json()
        self.assertEqual((len(rest["items"]), rest["next"]), (5, None))
        stale = self.get(self.csm, f"queue=department:engineering&cursor={first['next']}")
        self.assertEqual(stale.status_code, 403)
        wrong = self.get(self.lee, f"queue=department:engineering&cursor={first['next']}")
        self.assertEqual(wrong.json(), {"cursor": ["That list has changed. Reload Work."]})

    def test_a_known_contact_cannot_be_added_again(self):
        from services.customers.models import Contact

        Contact.objects.create(customer=self.pizza, name="Ann", email="ANN@newco.io")
        item(self.cs)
        row = self.get(self.csm, "queue=department:cs").json()["items"][0]
        self.assertFalse(row["can_add_contact"])

    def test_a_contact_in_another_workspace_is_not_revealed(self):
        from services.accounts.models import Organisation
        from services.customers.models import Contact, Customer

        other = Organisation.objects.create(name="Other Co")
        theirs = Customer.objects.create(organisation=other, name="Theirs")
        Contact.objects.create(customer=theirs, name="Ann", email="ann@newco.io")
        item(self.cs)
        row = self.get(self.csm, "queue=department:cs").json()["items"][0]
        self.assertTrue(row["can_add_contact"])

    def test_the_query_count_does_not_grow_with_rows(self):
        item(self.cs)
        self.get(self.csm, "queue=department:cs")  # warm any per-process caches
        with CaptureQueriesContext(connection) as few:
            self.get(self.csm, "queue=department:cs")
        for n in range(10):
            item(self.cs, requester_email=f"p{n}@newco.io")
        with CaptureQueriesContext(connection) as many:
            self.get(self.csm, "queue=department:cs")
        self.assertEqual(len(many), len(few))

    def test_mentioned_names_only_records_the_reader_may_open(self):
        slack = self.connector("slack", "cs")
        item(
            slack,
            number="#support",
            candidates=[
                {"type": "customer", "id": self.pizza.pk},
                {"type": "customer", "id": self.soup.pk},  # Mona's: Carl may not open it
            ],
        )
        self.assertFalse(can_open(self.csm, self.soup))
        row = next(
            r
            for r in self.get(self.csm, "queue=department:cs").json()["items"]
            if r["source"] == "slack"
        )
        self.assertEqual(
            row["mentioned"], [{"type": "customer", "id": self.pizza.pk, "name": "Pizza Hut"}]
        )
        self.assertFalse(row["can_add_contact"])

    def test_a_slack_row_hides_the_posters_email_and_others_keep_theirs(self):
        slack = self.connector("slack", "cs")
        item(slack, number="#support", requester_email="carl@acme.io")
        item(self.cs, requester_email="ann@newco.io")
        rows = {r["source"]: r for r in self.get(self.csm, "queue=department:cs").json()["items"]}
        self.assertEqual(rows["slack"]["from"], {"name": "Ann Lee", "email": ""})
        self.assertEqual(rows["jira"]["from"], {"name": "Ann Lee", "email": "ann@newco.io"})

    def test_a_jira_row_mentions_nobody(self):
        item(self.cs)
        row = self.get(self.csm, "queue=department:cs").json()["items"][0]
        self.assertEqual(row["mentioned"], [])

    def test_mentioned_names_only_accounts_the_reader_may_open(self):
        from services.customers.tests.test_views import create_account

        mine = create_account(self.pizza, name="Pizza EMEA", owner=self.csm)
        hidden = create_account(self.soup, name="Soup EMEA", owner=self.mona)
        self.assertTrue(can_open(self.csm, mine))
        self.assertFalse(can_open(self.csm, hidden))
        slack = self.connector("slack", "cs")
        item(
            slack,
            number="#support",
            candidates=[
                {"type": "account", "id": mine.pk},
                {"type": "account", "id": hidden.pk},
            ],
        )
        row = next(
            r
            for r in self.get(self.csm, "queue=department:cs").json()["items"]
            if r["source"] == "slack"
        )
        self.assertEqual(
            row["mentioned"], [{"type": "account", "id": mine.pk, "name": "Pizza EMEA"}]
        )
