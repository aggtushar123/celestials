"""A brief per scope: kept, stale when the figures move, written once at a
time, refused as today."""

import threading
import time
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.db import connection
from django.test import RequestFactory, TransactionTestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.brain import briefs
from services.brain.models import ScopeSnapshot
from services.brain.scope import resolve
from services.brain.tests.fixtures import BrainFixture
from services.copilot.anthropic_client import (
    BudgetExceeded,
    CopilotNotConfigured,
    CopilotRequestFailed,
)
from services.copilot.models import ModelCall
from services.customers.models import Customer
from services.metrics import brief as metrics_brief
from services.metrics.models import Brief
from services.segments.tests.fixtures import person

PATH = "services.metrics.brief.get_completion"
URL = "/api/v1/brain/brief/"
ANSWER = (
    '{"headline": "Dough Co carries the team\'s risk.", "body": "One.\\n\\nTwo.", '
    '"watch": ["Dough Co renewal"]}'
)
BRIEF_KEYS = {
    "id",
    "scope",
    "as_of",
    "baseline",
    "headline",
    "body",
    "watch",
    "generated_at",
    "generated_by",
    "stale",
}


def provider(text):
    response = SimpleNamespace(
        content=[SimpleNamespace(type="text", text=text)],
        usage=SimpleNamespace(input_tokens=10, output_tokens=5),
    )
    return SimpleNamespace(messages=SimpleNamespace(create=lambda **kw: response))


class BriefReadTests(BrainFixture):
    def write(self, user, key):
        with patch(PATH, return_value=ANSWER):
            return self.as_user(user).post(f"{URL}?scope={key}")

    def test_none_yet_reads_null(self):
        self.assertEqual(self.as_user(self.mona).get(f"{URL}?scope=team").json(), {"brief": None})

    def test_a_kept_brief_is_fresh_until_the_numbers_move(self):
        response = self.write(self.mona, "team")
        self.assertEqual(response.status_code, 201)
        brief = response.json()["brief"]
        self.assertEqual(set(brief), BRIEF_KEYS)
        self.assertEqual(
            (brief["scope"], brief["generated_by"], brief["stale"], brief["baseline"]),
            ("team", "Mona Manager", False, self.today.isoformat()),
        )
        client = self.as_user(self.mona)
        self.assertFalse(client.get(f"{URL}?scope=team").json()["brief"]["stale"])
        Customer.objects.filter(pk=self.soup.pk).update(arr_billed_at_account=Decimal(60_000))
        self.assertTrue(client.get(f"{URL}?scope=team").json()["brief"]["stale"])

    def test_a_newer_month_end_makes_it_stale(self):
        self.write(self.mona, "team")
        team = resolve(self.mona, "team")
        ScopeSnapshot.objects.filter(scope_key=team.stored_key).update(
            taken_on=self.today - timedelta(days=40)
        )
        Brief.objects.update(baseline=self.today - timedelta(days=40))
        ScopeSnapshot.objects.create(
            organisation=self.org,
            scope_key=team.stored_key,
            taken_on=self.today - timedelta(days=5),
            kind="month_end",
            owner_ids=sorted(team.owner_ids),
        )
        self.assertTrue(self.as_user(self.mona).get(f"{URL}?scope=team").json()["brief"]["stale"])

    def test_a_scope_brief_is_its_owners_alone(self):
        self.write(self.mona, "team")
        self.assertIsNone(self.as_user(self.csm).get(f"{URL}?scope=me").json()["brief"])
        self.assertIsNone(self.as_user(self.lee).get(f"{URL}?scope=company").json()["brief"])

    def test_a_stored_brief_naming_a_customer_the_reader_cannot_open_reads_null(self):
        # Globex Corp belongs to another organisation entirely: Mona's
        # visible_customers can never include it, however her own team
        # changes — the clean case for first_readable's denial branch.
        team = resolve(self.mona, "team")
        Brief.objects.create(
            organisation=self.org,
            scope_key=team.stored_key,
            as_of=self.today,
            headline="h",
            body="b",
            evidence={"customer_ids": [self.globex.pk]},
            generated_at=timezone.now(),
        )
        self.assertIsNone(self.as_user(self.mona).get(f"{URL}?scope=team").json()["brief"])


class BriefWriteTests(BrainFixture):
    def test_the_team_prompt_names_its_customers_and_the_company_prompt_does_not(self):
        with patch(PATH, return_value=ANSWER) as call:
            self.as_user(self.mona).post(f"{URL}?scope=team")
            self.as_user(self.admin).post(f"{URL}?scope=company")
        team_prompt = call.call_args_list[0].kwargs["messages"][0]["content"]
        company_prompt = call.call_args_list[1].kwargs["messages"][0]["content"]
        self.assertTrue(team_prompt.startswith("Scope: My team."))
        self.assertIn("- Dough Co (owner Carl CSM)", team_prompt)
        self.assertNotIn("Taco Bell", team_prompt)
        self.assertNotIn("Scope:", company_prompt)
        self.assertNotIn("Dough Co", company_prompt)
        self.assertEqual(
            [c.kwargs["scope_key"] for c in call.call_args_list],
            [f"team:{self.mona.id}", "company"],
        )

    def test_a_request_that_waited_gets_the_brief_written_meanwhile(self):
        team = resolve(self.mona, "team")
        request = RequestFactory().post(URL)
        request.user = self.mona
        requested_at = timezone.now()
        written = Brief.objects.create(
            organisation=self.org,
            scope_key=team.stored_key,
            as_of=self.today,
            headline="h",
            body="b",
            evidence={},
            generated_at=timezone.now(),
        )
        with patch(PATH) as call:
            row, created = briefs.write(team, request, requested_at=requested_at, today=self.today)
        self.assertEqual((row.pk, created), (written.pk, False))
        call.assert_not_called()

    def test_the_write_takes_and_releases_the_scope_advisory_lock(self):
        with CaptureQueriesContext(connection) as queries, patch(PATH, return_value=ANSWER):
            self.as_user(self.mona).post(f"{URL}?scope=team")
        sqls = [q["sql"] for q in queries]
        key = f"brief:team:{self.mona.id}"
        self.assertTrue(any("pg_advisory_lock" in sql and key in sql for sql in sqls))
        self.assertTrue(any("pg_advisory_unlock" in sql and key in sql for sql in sqls))

    def test_refusals_keep_the_previous_brief(self):
        client = self.as_user(self.mona)
        with patch(PATH, return_value=ANSWER):
            client.post(f"{URL}?scope=team")
        cases = (
            (CopilotNotConfigured("No model provider is configured."), 503),
            (CopilotRequestFailed("rate limited"), 502),
            (BudgetExceeded("Monthly token budget spent."), 429),
        )
        for exc, code in cases:
            with self.subTest(code=code), patch(PATH, side_effect=exc):
                response = client.post(f"{URL}?scope=team")
                self.assertEqual(
                    (response.status_code, response.json()), (code, {"detail": str(exc)})
                )
        with patch(PATH, return_value="not json"):
            self.assertEqual(client.post(f"{URL}?scope=team").status_code, 502)
        self.assertEqual(Brief.objects.filter(scope_key=f"team:{self.mona.id}").count(), 1)

    def test_an_empty_book_has_nothing_to_brief(self):
        response = self.as_user(self.lee).post(f"{URL}?scope=me")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(
            response.json(), {"detail": "There are no customers to write a brief about yet."}
        )

    def test_a_422_still_keeps_the_baseline_it_recorded(self):
        # Lee's Me has no customers at all: evidence_from raises
        # NothingToBrief, but changed.compare already wrote (and committed)
        # his first-view baseline before that — there is no longer a
        # transaction.atomic wrapping the two, so the 422 cannot undo it.
        key = f"me:{self.lee.id}"
        self.assertEqual(ScopeSnapshot.objects.filter(scope_key=key).count(), 0)
        self.assertEqual(self.as_user(self.lee).post(f"{URL}?scope=me").status_code, 422)
        self.assertEqual(ScopeSnapshot.objects.filter(scope_key=key).count(), 1)

    def test_the_model_call_is_logged_with_its_scope_even_when_the_answer_is_unusable(self):
        build = "services.copilot.anthropic_client._build_client_and_model"
        client = self.as_user(self.mona)
        with patch(build, return_value=(provider(ANSWER), "m")):
            self.assertEqual(client.post(f"{URL}?scope=team").status_code, 201)
        with patch(build, return_value=(provider("not json"), "m")):
            self.assertEqual(client.post(f"{URL}?scope=team").status_code, 502)
        self.assertEqual(
            list(ModelCall.objects.values_list("scope_key", flat=True)),
            [f"team:{self.mona.id}"] * 2,
        )

    def test_writing_is_audited_with_ids_only(self):
        with patch(PATH, return_value=ANSWER):
            self.as_user(self.mona).post(f"{URL}?scope=team")
            Customer.objects.filter(pk=self.soup.pk).update(arr_billed_at_account=Decimal(1))
            self.as_user(self.mona).post(f"{URL}?scope=team")
        events = AuditEvent.objects.filter(action="brain.brief_written").order_by("id")
        self.assertEqual(
            [e.metadata for e in events],
            [
                {"scope": f"team:{self.mona.id}", "stale_before": False},
                {"scope": f"team:{self.mona.id}", "stale_before": True},
            ],
        )
        self.assertEqual(events[0].target_type, "metrics.brief")


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


class ConcurrentBriefWriteTests(TransactionTestCase):
    """Two requests for the same scope at once: the advisory lock (not a
    transaction) serialises them, so exactly one pays for a model call and
    the other gets its brief back. Real threads on real connections, the
    same design as services.brain.tests.test_explanations'
    ConcurrentExplanationWriteTests: the first model call is held open until
    Postgres itself (`pg_stat_activity`, this test database only) reports a
    second backend blocked waiting on an advisory lock — which can only
    happen if the lock is actually taken and actually held. Without the
    lock both threads reach `fake`, nobody ever waits, the poll times out
    and the call-count/outcome assertions fail (proven by removing
    `locks.held` from `briefs.write`; see the fix-wave report).

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
                row, created = briefs.write(scope, request, requested_at=requested_at, today=today)
                outcomes[label] = (row.pk, created)
            except Exception as exc:  # noqa: BLE001 - the test must see any failure
                outcomes[label] = f"error: {exc!r}"
            finally:
                connection.close()

        threads = [threading.Thread(target=run, args=(label,)) for label in ("a", "b")]
        original = metrics_brief.get_completion
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
        self.assertIs(metrics_brief.get_completion, original)

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
        self.assertEqual(Brief.objects.filter(scope_key=scope.stored_key).count(), 1)
