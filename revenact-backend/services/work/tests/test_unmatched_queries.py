"""Unmatched items cost the same however many rows there are (Round 2 D3
contract §9, R2D3-23): a queue's list and a match. No query uses DISTINCT
(Postgres 16)."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.agents.tests.intake_fixtures import IntakeFixture
from services.agents.tests.test_intake_queries import no_distinct
from services.connectors.tests.unmatched_fixtures import item
from services.customers.models import Account

#: Measured on this branch (Task 13); raise only with a reason in the commit.
#: 5 with Jira rows (no candidates); the `mentioned` names add one query per record type (SE1-19).
UNMATCHED_LIST_QUERIES = 7
UNMATCHED_MATCH_QUERIES = 22
LIST = "/api/v1/work/unmatched/?queue=department:cs"


class UnmatchedQueryTests(IntakeFixture):
    def measure(self, call):
        call()  # warm (sessions, workspace rows)
        with CaptureQueriesContext(connection) as queries:
            call()
        no_distinct(self, queries)
        return len(queries)

    def test_the_list_is_constant_in_its_rows(self):
        slack = self.connector("slack", "cs")
        group = Account.objects.create(name="Pizza Group", owner=self.csm)
        group.customers.add(self.pizza)
        near = [
            {"type": "customer", "id": self.pizza.pk},
            {"type": "customer", "id": self.taco.pk},
            {"type": "account", "id": group.pk},
        ]
        item(slack, candidates=near)
        client = self.client_for(self.csm)
        few = self.measure(lambda: client.get(LIST))
        for n in range(30):
            item(slack, requester_email=f"p{n}@newco.io", candidates=near)
        response = client.get(LIST)
        self.assertEqual(len(response.json()["items"]), 25)
        self.assertEqual(len(response.json()["items"][0]["mentioned"]), 3)
        many = self.measure(lambda: client.get(LIST))
        self.assertEqual(few, many)
        self.assertEqual(many, UNMATCHED_LIST_QUERIES)

    def test_a_match_costs_a_fixed_number(self):
        jira = self.connector("jira", "cs")
        warm, *rows = (item(jira, requester_email=f"w{n}@newco.io") for n in range(3))
        client = self.client_for(self.csm)
        # The first match in a session also reads the reader's membership and role.
        client.post(
            f"/api/v1/work/unmatched/{warm.pk}/match/",
            {"customer_id": self.pizza.pk},
            format="json",
        )
        counts = []
        for row in rows:
            with CaptureQueriesContext(connection) as queries:
                response = client.post(
                    f"/api/v1/work/unmatched/{row.pk}/match/",
                    {"customer_id": self.pizza.pk, "add_contact": True},
                    format="json",
                )
            self.assertEqual(response.status_code, 200, response.json())
            no_distinct(self, queries)
            counts.append(len(queries))
        self.assertEqual(counts[0], counts[1])
        self.assertEqual(counts[1], UNMATCHED_MATCH_QUERIES)
