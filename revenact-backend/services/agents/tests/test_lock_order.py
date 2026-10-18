"""One lock order everywhere: a bundle's row before any of its steps' rows,
so a run's claim (bundle, then steps) and a step's decision (step, then its
bundle to settle it) can never deadlock."""

from django.db import connection, transaction
from django.test.utils import CaptureQueriesContext

from services.agents.deciding import locked
from services.agents.models import AgentBundle
from services.agents.tests.bundle_fixtures import BundleFixture, note
from services.metrics.models import AgentAction


def _locks(queries):
    """The tables each FOR UPDATE query locks, in order."""
    tables = (AgentBundle._meta.db_table, AgentAction._meta.db_table)
    return [
        table
        for query in queries
        if "FOR UPDATE" in query["sql"]
        for table in tables
        if f'FROM "{table}"' in query["sql"]
    ]


class LockOrderTests(BundleFixture):
    def test_locking_a_step_locks_its_bundle_first(self):
        bundle = self.bundle_of(self.pizza, note())
        step = bundle.steps.get()
        with transaction.atomic(), CaptureQueriesContext(connection) as queries:
            self.assertEqual(locked(step.pk).pk, step.pk)
        self.assertEqual(
            _locks(queries.captured_queries),
            [AgentBundle._meta.db_table, AgentAction._meta.db_table],
        )
