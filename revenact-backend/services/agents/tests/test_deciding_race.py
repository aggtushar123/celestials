"""Two approvals of one action at once: the row lock lets the first win and
tells the second who decided. Also the guard that deciding opens its own
transaction. `TransactionTestCase`: each thread needs a real connection."""

import threading
from decimal import Decimal

from django.db import connection
from django.test import TransactionTestCase

from services.accounts.models import Organisation, User
from services.agents import deciding
from services.brain.tests.fixtures import person
from services.customers.models import Customer
from services.metrics.models import AgentAction


class DecidingRaceTests(TransactionTestCase):
    WAIT_TIMEOUT = 15

    def setUp(self):
        self.org = Organisation.objects.create(name="Acme Inc", currency="USD")
        self.admin = person("alice@acme.io", "Alice Admin", self.org, role=User.Role.ADMIN)
        self.mona = person("mona@acme.io", "Mona Manager", self.org)
        self.csm = person("carl@acme.io", "Carl CSM", self.org, reports_to=self.mona)
        self.dough = Customer.objects.create(
            organisation=self.org,
            name="Dough Co",
            owner=self.csm,
            arr_billed_at_account=Decimal("100000"),
        )
        self.action = AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="record.lifecycle",
            customer=self.dough,
            target="lifecycle",
            title="Move to renewal",
            rationale="r",
            payload={"stage": "renewal"},
            before=self.dough.lifecycle_stage,
        )

    def test_approve_opens_its_own_transaction(self):
        # select_for_update outside atomic raises TransactionManagementError
        applied, _ = deciding.approve(self.csm, self.action.pk)
        self.assertEqual(applied.status, "applied")

    def test_two_approvals_at_once_apply_exactly_once(self):
        barrier = threading.Barrier(2)
        outcomes = []
        losers = []

        def run(user):
            try:
                barrier.wait(timeout=self.WAIT_TIMEOUT)
                deciding.approve(User.objects.get(pk=user.pk), self.action.pk)
                outcomes.append("applied")
            except deciding.AlreadyDecided as exc:
                outcomes.append("already")
                losers.append(exc.action)
            finally:
                connection.close()

        threads = [threading.Thread(target=run, args=(u,)) for u in (self.csm, self.mona)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=self.WAIT_TIMEOUT)
        self.assertFalse([t for t in threads if t.is_alive()])
        self.assertEqual(sorted(outcomes), ["already", "applied"])
        self.assertEqual(AgentAction.objects.get(pk=self.action.pk).status, "applied")
        self.assertEqual(
            losers[0].decided_by_id, AgentAction.objects.get(pk=self.action.pk).decided_by_id
        )
