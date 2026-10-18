"""Who may decide an Ops-agent proposal (spec §1.2), and the bundle run
route that asks it (agent bundles D19: a step is decided through its bundle)."""

import threading
import time
from decimal import Decimal
from unittest.mock import patch

from django.db import connection
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from services.accounts.models import Organisation
from services.agents.deciding import decided_as
from services.brain.tests.waiting_fixtures import GONE, WaitingFixture
from services.customers.models import Customer, Task
from services.metrics.models import AgentAction
from services.segments.tests.fixtures import person


def run_url(proposal):
    return f"/api/v1/agents/bundles/{proposal.bundle_id}/run/"


class DecidedAsTests(WaitingFixture):
    def test_a_task_proposal_is_the_owners_their_chains_and_view_all(self):
        p = self.proposal(self.pizza)
        self.assertEqual(decided_as(self.csm, p), "owner")
        self.assertEqual(decided_as(self.mona, p), "chain")
        self.assertEqual(decided_as(self.admin, p), "company")
        self.assertIsNone(decided_as(self.other, p))
        self.assertIsNone(decided_as(self.lee, p))

    def test_an_initiative_is_view_all_only(self):
        p = self.proposal(kind="initiative")
        self.assertEqual(decided_as(self.admin, p), "company")
        for reader in (self.csm, self.mona, self.lee):
            self.assertIsNone(decided_as(reader, p))

    def test_unowned_and_gone_customers_are_view_all_only(self):
        for p in (self.proposal(self.loose), self.proposal(customer_id=GONE)):
            self.assertEqual(decided_as(self.admin, p), "company")
            self.assertIsNone(decided_as(self.mona, p))


class ConcurrentApprovalTests(TransactionTestCase):
    """Two runs of the same task proposal's bundle at once: the bundle's row
    lock, not a status check alone, must serialise them, so exactly one
    creates a Task and the other is told the bundle is running or ran.
    `TransactionTestCase`, not `TestCase`: each thread needs its own real
    connection, and `setUpTestData` is not supported here (see
    services.brain.tests.test_briefs._solo_scope).

    `patch.object` is entered and exited once, here in the main thread,
    around starting and joining the threads — never inside `run()` itself:
    `mock.patch` is not thread-safe, and the two threads below only call
    the code under test."""

    WAIT_TIMEOUT = 10

    def setUp(self):
        self.org = Organisation.objects.create(name="Acme Inc", currency="USD")
        self.csm = person("carl@acme.io", "Carl CSM", self.org)
        self.pizza = Customer.objects.create(
            name="Pizza Hut",
            owner=self.csm,
            organisation=self.org,
            arr_billed_at_account=Decimal("300000"),
            health_score=Decimal("8.0"),
        )
        self.proposal = AgentAction.objects.create(
            organisation=self.org,
            batch="b1",
            kind=AgentAction.Kind.TASK_CREATE,
            customer_id=self.pizza.id,
            target="task:save play",
            title="Save play",
            rationale="Because the figures say so.",
            evidence=[],
            payload={
                "title": "Save play",
                "assignee_name": "Carl CSM",
                "due_date": (timezone.localdate()).isoformat(),
                "priority": "high",
            },
        )

    def test_two_concurrent_approvals_create_exactly_one_task(self):
        # The first thread to reach Task creation holds it open long enough
        # for the second to have made its own request in the meantime —
        # without a row lock in the view, both read the proposal as still
        # PROPOSED and both create a Task.
        started = threading.Event()
        original_create = Task.objects.create

        def slow_create(*args, **kwargs):
            if not started.is_set():
                started.set()
                time.sleep(0.5)
            return original_create(*args, **kwargs)

        outcomes = {}

        def run(label, wait_for_start):
            if wait_for_start:
                self.assertTrue(started.wait(timeout=self.WAIT_TIMEOUT))
            client = APIClient()
            client.force_authenticate(self.csm)
            try:
                response = client.post(
                    run_url(self.proposal),
                    {"steps": [{"id": self.proposal.pk, "selected": True}]},
                    format="json",
                )
                outcomes[label] = response.status_code
            finally:
                connection.close()

        threads = [
            threading.Thread(target=run, args=("a", False)),
            threading.Thread(target=run, args=("b", True)),
        ]
        with patch.object(Task.objects, "create", side_effect=slow_create):
            for t in threads:
                t.start()
            for t in threads:
                t.join(timeout=self.WAIT_TIMEOUT)

        self.assertFalse(
            [t for t in threads if t.is_alive()], "a thread did not finish within its join timeout"
        )
        self.assertEqual(Task.objects.filter(customer=self.pizza).count(), 1)
        self.assertEqual(sorted(outcomes.values()), [200, 409])
