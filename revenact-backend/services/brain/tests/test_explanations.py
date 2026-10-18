"""Why one number moved, per scope: built from the scope's figures, naming
only the customers the reader may open."""

import threading
import time
from decimal import Decimal
from unittest.mock import patch

from django.db import connection
from django.test import RequestFactory, TransactionTestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.brain import explanations
from services.brain.scope import resolve
from services.brain.tests.fixtures import BrainFixture
from services.copilot.anthropic_client import BudgetExceeded
from services.customers.models import Customer
from services.metrics import explain as metrics_explain
from services.metrics.models import Explanation
from services.segments.tests.fixtures import person

PATH = "services.metrics.explain.get_completion"
URL = "/api/v1/brain/explanations/at_risk_arr/"
ANSWER = '{"text": "ARR at risk sits on one renewal.", "evidence": ["one renewal"]}'
KEYS = {
    "id",
    "metric",
    "scope",
    "as_of",
    "text",
    "evidence",
    "hidden",
    "generated_at",
    "generated_by",
    "stale",
}


def prompt_of(call):
    return call.call_args.kwargs["messages"][0]["content"]


class ExplanationApiTests(BrainFixture):
    def test_the_scope_is_checked_before_the_metric(self):
        response = self.as_user(self.mona).get("/api/v1/brain/explanations/nope/?scope=team")
        self.assertEqual(
            (response.status_code, response.json()), (404, {"detail": "No such metric."})
        )
        response = self.as_user(self.csm).get("/api/v1/brain/explanations/nope/?scope=company")
        self.assertEqual(response.status_code, 403)

    def test_none_yet_reads_null(self):
        response = self.as_user(self.mona).get(f"{URL}?scope=team")
        self.assertEqual(response.json(), {"explanation": None})

    def test_written_from_the_scopes_figures_and_kept(self):
        client = self.as_user(self.mona)
        with patch(PATH, return_value=ANSWER) as call:
            response = client.post(f"{URL}?scope=team")
        self.assertEqual(response.status_code, 201)
        body = response.json()["explanation"]
        self.assertEqual(set(body), KEYS)
        self.assertEqual(
            (body["metric"], body["scope"], body["hidden"], body["generated_by"], body["stale"]),
            ("at_risk_arr", "team", 0, "Mona Manager", False),
        )
        self.assertIn("- Dough Co (owner Carl CSM)", prompt_of(call))
        self.assertNotIn("Taco Bell", prompt_of(call))
        self.assertEqual(call.call_args.kwargs["scope_key"], f"team:{self.mona.id}")
        self.assertEqual(client.get(f"{URL}?scope=team").json()["explanation"]["id"], body["id"])

    def test_a_company_reader_who_cannot_open_the_accounts_gets_a_count(self):
        with patch(PATH, return_value=ANSWER) as call:
            response = self.as_user(self.lee).post(f"{URL}?scope=company")
        self.assertEqual(response.json()["explanation"]["hidden"], 2)
        self.assertNotIn("Dough Co", prompt_of(call))
        self.assertNotIn("Taco Bell", prompt_of(call))
        self.assertIn("- 2 more that this reader cannot open; not named here", prompt_of(call))

    def test_an_explanation_naming_customers_reaches_only_readers_who_can_open_them(self):
        with patch(PATH, return_value=ANSWER):
            alices = self.as_user(self.admin).post(f"{URL}?scope=company").json()
        self.assertIsNone(self.as_user(self.lee).get(f"{URL}?scope=company").json()["explanation"])
        with patch(PATH, return_value=ANSWER):
            lees = self.as_user(self.lee).post(f"{URL}?scope=company").json()
        lee_reads = self.as_user(self.lee).get(f"{URL}?scope=company").json()["explanation"]
        alice_reads = self.as_user(self.admin).get(f"{URL}?scope=company").json()["explanation"]
        self.assertEqual(lee_reads["id"], lees["explanation"]["id"])
        self.assertEqual(alice_reads["id"], lees["explanation"]["id"])
        self.assertNotEqual(alices["explanation"]["id"], lees["explanation"]["id"])

    def test_refusals_and_the_audit(self):
        client = self.as_user(self.mona)
        with patch(PATH, side_effect=BudgetExceeded("Monthly token budget spent.")):
            response = client.post(f"{URL}?scope=team")
        self.assertEqual(
            (response.status_code, response.json()),
            (429, {"detail": "Monthly token budget spent."}),
        )
        response = self.as_user(self.lee).post(f"{URL}?scope=me")
        self.assertEqual(response.status_code, 422)
        with patch(PATH, return_value=ANSWER):
            client.post(f"{URL}?scope=team")
        event = AuditEvent.objects.get(action="brain.explanation_written")
        self.assertEqual(event.metadata, {"scope": f"team:{self.mona.id}", "metric": "at_risk_arr"})
        self.assertEqual(event.target_type, "metrics.explanation")

    def test_a_request_that_waited_gets_the_one_written_meanwhile(self):
        team = resolve(self.mona, "team")
        request = RequestFactory().post(URL)
        request.user = self.mona
        requested_at = timezone.now()
        written = Explanation.objects.create(
            organisation=self.org,
            metric="at_risk_arr",
            scope_key=team.stored_key,
            as_of=self.today,
            text="t",
            inputs={"customer_ids": []},
            generated_at=timezone.now(),
        )
        with patch(PATH) as call:
            row, created = explanations.write(
                team, request, "at_risk_arr", requested_at=requested_at, today=self.today
            )
        self.assertEqual((row.pk, created), (written.pk, False))
        call.assert_not_called()

    def test_a_waiting_reader_never_receives_a_row_naming_customers_they_cannot_open(self):
        # Alice (sees everything) writes first and names Dough Co. Lee's
        # request was "waiting" on the same lock (its requested_at is
        # before Alice's row's generated_at) but Lee cannot open Dough Co:
        # he must never be handed Alice's text, and pays for his own write.
        company = resolve(self.lee, "company")
        request = RequestFactory().post(URL)
        request.user = self.lee
        requested_at = timezone.now()
        alices = Explanation.objects.create(
            organisation=self.org,
            metric="at_risk_arr",
            scope_key=company.stored_key,
            as_of=self.today,
            text="Only Alice may read this: Dough Co drives the risk.",
            inputs={"customer_ids": [self.dough.pk]},
            generated_at=timezone.now(),
        )
        with patch(PATH, return_value=ANSWER) as call:
            row, created = explanations.write(
                company, request, "at_risk_arr", requested_at=requested_at, today=self.today
            )
        self.assertEqual(created, True)
        self.assertNotEqual(row.pk, alices.pk)
        self.assertEqual(call.call_count, 1)
        self.assertNotIn("Dough Co", prompt_of(call))

    def test_the_write_takes_and_releases_the_scope_metric_advisory_lock(self):
        with CaptureQueriesContext(connection) as queries, patch(PATH, return_value=ANSWER):
            self.as_user(self.mona).post(f"{URL}?scope=team")
        sqls = [q["sql"] for q in queries]
        key = f"explanation:team:{self.mona.id}:at_risk_arr"
        self.assertTrue(any("pg_advisory_lock" in sql and key in sql for sql in sqls))
        self.assertTrue(any("pg_advisory_unlock" in sql and key in sql for sql in sqls))
        self.assertEqual(explanations.lock_key(resolve(self.mona, "team"), "at_risk_arr"), key)


def _solo_scope():
    """A single owner, a single customer, nothing shared with BrainFixture:
    TransactionTestCase does not support setUpTestData, and these tests
    need their own real threads on their own real connections."""
    org = Organisation.objects.create(name="Acme Inc", currency="USD")
    owner = person("owner@acme.io", "Owner CSM", org)
    Customer.objects.create(
        name="Only Co",
        owner=owner,
        organisation=org,
        arr_billed_at_account=Decimal("50000"),
        health_score=Decimal("8.0"),
    )
    return org, owner, resolve(owner, "me")


class TheModelCallRunsOutsideAnyTransactionTests(TransactionTestCase):
    """TestCase wraps every test in its own transaction.atomic, which would
    make `not connection.in_atomic_block` trivially true regardless of the
    code under test. Only TransactionTestCase lets this assertion mean
    anything."""

    def test_the_model_call_runs_outside_any_transaction(self):
        _org, owner, _scope = _solo_scope()

        def fake(*args, **kwargs):
            self.assertFalse(connection.in_atomic_block)
            return ANSWER

        client = APIClient()
        client.force_authenticate(owner)
        with patch(PATH, side_effect=fake):
            response = client.post(f"{URL}?scope=me")
        self.assertEqual(response.status_code, 201)


class ConcurrentExplanationWriteTests(TransactionTestCase):
    """Two requests for the same scope and metric at once: the advisory lock
    (not a transaction) serialises them, so exactly one pays for a model
    call and the other gets its explanation back. Real threads on real
    connections, same shape as services.brain.tests.test_briefs — but
    unlike that one, this does not just give the second thread a head
    start and hope: it holds the first model call open until Postgres
    itself (`pg_stat_activity`) reports a second backend genuinely blocked
    waiting on an advisory lock, which can only happen if the lock is
    actually taken and actually held. Without the lock, both threads reach
    `fake` with nobody ever waiting on anything, the poll below times out
    on both, and the call-count/outcome assertions fail — proven by
    temporarily removing `locks.held` from `explanations.write` (see the
    fix report for task 8).

    `patch()` is entered and exited once, here in the main thread, around
    starting and joining the threads — never inside `run()` itself.
    `mock.patch` is not thread-safe: two threads each doing their own
    `patch(PATH, ...)`/unpatch race on the same module attribute, and
    whichever one "restores" last can leave `get_completion` permanently
    swapped for a `MagicMock` for the rest of the test process. The threads
    below only call the code under test."""

    #: Generous but bounded: a slow CI box still finishes well inside this,
    #: and a genuinely missing lock fails the test instead of hanging it.
    WAIT_TIMEOUT = 10

    def test_two_concurrent_writes_for_the_same_scope_make_one_model_call(self):
        _org, owner, scope = _solo_scope()
        today = timezone.localdate()
        requested_at = timezone.now()
        calls = []
        witnessed = {"second_backend_waited_on_advisory_lock": False}

        def fake(*args, **kwargs):
            calls.append(1)
            deadline = time.monotonic() + self.WAIT_TIMEOUT
            while time.monotonic() < deadline:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' "
                        "AND wait_event = 'advisory' AND pid <> pg_backend_pid() "
                        "AND datname = current_database()"
                    )
                    if cursor.fetchone()[0] > 0:
                        witnessed["second_backend_waited_on_advisory_lock"] = True
                        break
                time.sleep(0.05)
            return ANSWER

        outcomes = {}

        def run(label):
            request = RequestFactory().post(URL)
            request.user = owner
            try:
                row, created = explanations.write(
                    scope, request, "at_risk_arr", requested_at=requested_at, today=today
                )
                outcomes[label] = (row.pk, created)
            except Exception as exc:  # noqa: BLE001 - the test must see any failure
                outcomes[label] = f"error: {exc!r}"
            finally:
                connection.close()

        threads = [threading.Thread(target=run, args=(label,)) for label in ("a", "b")]
        original = metrics_explain.get_completion
        with patch(PATH, side_effect=fake):
            for t in threads:
                t.start()
            for t in threads:
                t.join(timeout=30)

        # Guard against the leak this test used to cause: once this `with`
        # has exited, the module must be holding the real function again —
        # not a MagicMock a second, unpatched thread stomped in afterwards —
        # or every TransactionTestCase that runs later in this process
        # would silently get a fake answer from a real-looking call.
        self.assertIs(metrics_explain.get_completion, original)

        self.assertFalse(
            [t for t in threads if t.is_alive()], "a thread did not finish within its join timeout"
        )
        self.assertTrue(
            witnessed["second_backend_waited_on_advisory_lock"],
            "no second backend was ever seen waiting on the advisory lock — "
            "this run proves nothing about serialisation",
        )
        self.assertEqual(len(calls), 1, calls)
        self.assertEqual(outcomes["a"][0], outcomes["b"][0], outcomes)
        self.assertEqual(
            sorted(outcomes[label][1] for label in ("a", "b")), [False, True], outcomes
        )
        self.assertEqual(
            Explanation.objects.filter(scope_key=scope.stored_key, metric="at_risk_arr").count(), 1
        )
