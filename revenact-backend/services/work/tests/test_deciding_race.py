"""Two deciders at once (spec §5, §6 "the race between two deciders (two
connections)"): a row lock serialises them, so exactly one task is made and
the other is told who decided. And Brain's approval racing Work's assign on
the same AI-agent proposal: both lock the proposal first, so neither
deadlocks and exactly one task is made.

`TransactionTestCase`: each thread needs its own real connection, and
`setUpTestData` is not supported. `patch.object` is entered and left once,
in the main thread, around starting and joining the threads (mock.patch is
not thread-safe); see services/brain/tests/test_deciding.py."""

import threading
import time
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.db import connection
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from services.accounts.models import Organisation, User
from services.customers.models import Customer, Task
from services.segments.tests.fixtures import person
from services.work.models import Recommendation


class RaceTests(TransactionTestCase):
    WAIT_TIMEOUT = 10

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
            renewal_date=timezone.localdate() + timedelta(days=30),
        )

    def race(self, requests):
        """Run each (user, url, body) at once; the first to make a Task holds
        it open long enough for the other to arrive. Returns the statuses."""
        started = threading.Event()
        original_create = Task.objects.create

        def slow_create(*args, **kwargs):
            if not started.is_set():
                started.set()
                time.sleep(0.5)
            return original_create(*args, **kwargs)

        outcomes = {}

        def run(label, user, url, body, wait_for_start):
            if wait_for_start:
                started.wait(timeout=self.WAIT_TIMEOUT)
            client = APIClient()
            client.force_authenticate(User.objects.get(pk=user.pk))
            try:
                outcomes[label] = client.post(url, body, format="json").status_code
            finally:
                connection.close()

        threads = [
            threading.Thread(target=run, args=(i, *request, i > 0))
            for i, request in enumerate(requests)
        ]
        with patch.object(Task.objects, "create", side_effect=slow_create):
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=self.WAIT_TIMEOUT)
        self.assertFalse([t for t in threads if t.is_alive()], "a thread did not finish in time")
        return sorted(outcomes.values())

    def test_two_deciders_at_once_make_exactly_one_task(self):
        rec = Recommendation.objects.create(
            organisation=self.org,
            customer=self.dough,
            kind="renewal_due",
            title="Prepare Dough Co's renewal",
            why={"facts": ["Renews in 30 days"], "evidence": []},
            suggested_assignee=self.csm,
            recipient=self.mona,
        )
        url = f"/api/v1/work/recommendations/{rec.pk}/assign/"
        body = {"assignee_id": self.csm.pk}
        statuses = self.race([(self.mona, url, body), (self.admin, url, body)])
        self.assertEqual(statuses, [201, 409])
        self.assertEqual(Task.objects.filter(customer=self.dough).count(), 1)
