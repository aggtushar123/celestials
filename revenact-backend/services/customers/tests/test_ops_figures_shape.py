"""The Ops agent's figures read without DISTINCT (contract, delivery 1
follow-ups): an account's rows reach its organisations through `id IN`
subqueries over the link table, so no row repeats and none needs
de-duplicating (Postgres 16, #86)."""

from datetime import timedelta

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.agents.tests.fixtures import AgentsFixture
from services.customers import forecast
from services.customers.contact import parent_in_q
from services.customers.models import Task
from services.customers.scoping import SystemActor
from services.metrics.proposals import build_evidence


class OpsFiguresShapeTests(AgentsFixture):
    def test_counted_opportunities_and_risks_carry_no_distinct(self):
        actor = SystemActor(self.org)
        ids = [self.pizza.pk, self.taco.pk]
        for rows in (
            forecast.counted_opportunities(ids, actor),
            forecast.counted_risks(ids, actor),
        ):
            self.assertNotIn("DISTINCT", str(rows.query).upper())

    def test_an_account_under_two_counted_organisations_is_counted_once(self):
        self.emea.customers.add(self.dough)
        Task.objects.create(
            account=self.emea,
            title="Call EMEA",
            assignee=self.csm,
            assignee_name=self.csm.name,
            due_date=self.today + timedelta(days=2),
            priority="high",
        )
        rows = Task.objects.filter(parent_in_q([self.pizza.pk, self.dough.pk]))
        self.assertEqual(rows.count(), 1)
        self.assertNotIn("DISTINCT", str(rows.query).upper())

    def test_build_evidence_runs_no_distinct(self):
        with CaptureQueriesContext(connection) as queries:
            build_evidence(self.org)
        offenders = [q["sql"] for q in queries if "DISTINCT" in q["sql"].upper()]
        self.assertEqual(offenders, [])
