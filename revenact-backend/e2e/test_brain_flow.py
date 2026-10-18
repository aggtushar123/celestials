"""End-to-end tier: real server, real HTTP, real test DB.

A workspace with a manager (Mona) and her report (Carl), a CSM on another
branch (Dana) and a Leadership reader (Lee). Each reader is offered their
own scopes; Carl is refused My team. Mona's first view of My team writes
one baseline; a customer handed to Dana shows as a handover; a new report
resets the baseline. Lee's Company view has no month-end yet. Two clicks of
"Write my brief" at once make one model call: one 201, one 200."""

import threading
import time
from decimal import Decimal
from unittest.mock import patch

from django.db import connection
from django.test import LiveServerTestCase
from django.utils import timezone

from e2e.http import http_get, http_post
from services.accounts.models import User
from services.billing.models import BillingAccount
from services.brain.models import ScopeSnapshot
from services.copilot.anthropic_client import get_completion as real_get_completion
from services.customers.models import Customer
from services.metrics import brief as metrics_brief
from services.metrics.models import Brief

PATH = "services.metrics.brief.get_completion"
ANSWER = (
    '{"headline": "The team book is steady.", "body": "One.\\n\\nTwo.", '
    '"watch": ["Dough Co renewal"]}'
)


class BrainFlowTests(LiveServerTestCase):
    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def login(self, email, password):
        status, body = http_post(self.api("/auth/login/"), {"email": email, "password": password})
        self.assertEqual(status, 200, body)
        return body["access"]

    def member(self, admin, name, email):
        status, body = http_post(
            self.api("/auth/users/"),
            {"name": name, "email": email, "password": "memberpass12"},
            token=admin,
        )
        self.assertEqual(status, 201, body)
        return User.objects.get(pk=body["id"])

    def waiting_on_a_lock(self):
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT count(*) FROM pg_stat_activity "
                "WHERE datname = current_database() "
                "AND wait_event_type = 'Lock' AND wait_event = 'advisory'"
            )
            return cursor.fetchone()[0] > 0

    def test_full_flow(self):
        # 1. The workspace and its people; the chart and functions by hand.
        status, body = http_post(
            self.api("/auth/signup/"),
            {
                "organisation_name": "Acme Inc",
                "name": "Alice Admin",
                "email": "alice@acme.io",
                "password": "supersecret1",
            },
        )
        self.assertEqual(status, 201, body)
        alice = body["access"]
        # The trial plan ships 3 seats; this workspace needs five people
        # (Alice, Mona, Carl, Dana, Lee). Seats are their own feature
        # (services/billing), not this test's concern, so raise the limit
        # directly rather than spend the flow proving a different app.
        BillingAccount.objects.filter(organisation__name="Acme Inc").update(seats_limit=10)
        mona = self.member(alice, "Mona Manager", "mona@acme.io")
        carl = self.member(alice, "Carl CSM", "carl@acme.io")
        dana = self.member(alice, "Dana CSM", "dana@acme.io")
        lee = self.member(alice, "Lee Lead", "lee@acme.io")
        User.objects.filter(pk=carl.pk).update(reports_to=mona)
        User.objects.filter(pk=lee.pk).update(function=User.Function.LEADERSHIP)
        org = mona.organisation
        for name, owner, arr in (
            ("Pizza Hut", carl, 300_000),
            ("Dough Co", carl, 100_000),
            ("Soup Co", mona, 50_000),
            ("Taco Bell", dana, 200_000),
        ):
            Customer.objects.create(
                organisation=org, name=name, owner=owner, arr_billed_at_account=Decimal(arr)
            )
        tokens = {
            who: self.login(f"{who}@acme.io", "memberpass12") for who in ("mona", "carl", "lee")
        }

        # 2. Each reader's scopes.
        expected = {
            "carl": (["me"], "me"),
            "mona": (["me", "team"], "team"),
            "lee": (["me", "company"], "company"),
        }
        for who, (keys, default) in expected.items():
            status, body = http_get(self.api("/brain/scopes/"), token=tokens[who])
            self.assertEqual(status, 200, body)
            self.assertEqual(([s["key"] for s in body["scopes"]], body["default"]), (keys, default))

        # 3. Refusals.
        status, body = http_get(self.api("/brain/changed/?scope=team"), token=tokens["carl"])
        self.assertEqual((status, body["code"]), (403, "SCOPE_NOT_ALLOWED"))
        status, body = http_get(self.api("/brain/changed/?scope=all"), token=tokens["carl"])
        self.assertEqual((status, body["code"]), (400, "SCOPE_UNKNOWN"))

        # 4. Mona's first view of My team is its own baseline, written once.
        today = timezone.localdate().isoformat()
        team_key = f"team:{mona.pk}"
        for _ in range(2):
            status, body = http_get(self.api("/brain/changed/?scope=team"), token=tokens["mona"])
            self.assertEqual(status, 200, body)
            self.assertEqual((body["since"], body["since_kind"]), (today, "baseline"))
        self.assertEqual(ScopeSnapshot.objects.filter(scope_key=team_key).count(), 1)
        arr = next(m for m in body["metrics"] if m["key"] == "active_arr")
        self.assertEqual(arr["now"], 450_000.0)

        # 5. Dough Co handed to Dana: a handover on the money moves.
        Customer.objects.filter(name="Dough Co").update(owner=dana)
        status, body = http_get(self.api("/brain/changed/?scope=team"), token=tokens["mona"])
        moved = next(s for s in body["signals"] if s["key"] == "active_arr")
        self.assertEqual(moved["handover"], {"in": 0, "out": 1, "people": ["Dana CSM"]})

        # 6. A new report: the baseline starts again, still one row today.
        ed = self.member(alice, "Ed CSM", "ed@acme.io")
        User.objects.filter(pk=ed.pk).update(reports_to=mona)
        status, body = http_get(self.api("/brain/changed/?scope=team"), token=tokens["mona"])
        self.assertEqual((body["team_changed_on"], body["signals"]), (today, []))
        self.assertEqual(ScopeSnapshot.objects.filter(scope_key=team_key).count(), 1)

        # 7. Lee's Company view: no month-end yet.
        status, body = http_get(self.api("/brain/changed/?scope=company"), token=tokens["lee"])
        self.assertEqual((status, body["since"], body["signals"]), (200, None, []))
        self.assertTrue(all(m["then"] is None for m in body["metrics"]))

        # 8. Two "Write my brief" clicks at once: one model call, 201 and 200.
        calls, release, tick = [], threading.Event(), threading.Event()

        def slow(*args, **kwargs):
            calls.append(kwargs.get("scope_key"))
            release.wait(timeout=10)
            return ANSWER

        results = []

        def click():
            try:
                results.append(
                    http_post(self.api("/brain/brief/?scope=team"), None, token=tokens["mona"])
                )
            finally:
                # Each thread opened its own DB connection (Django's
                # thread-local connections); close it rather than leak it
                # past the test, same as a real request thread would.
                connection.close()

        with patch(PATH, side_effect=slow):
            first = threading.Thread(target=click)
            first.start()
            deadline = time.monotonic() + 10
            while not calls and time.monotonic() < deadline:
                tick.wait(0.02)
            second = threading.Thread(target=click)
            second.start()
            while not self.waiting_on_a_lock() and time.monotonic() < deadline:
                tick.wait(0.02)
            release.set()
            first.join(15)
            second.join(15)
        # The patch is restored on the way out, even though the model call
        # it replaced ran on other threads: this is the real get_completion
        # services.metrics.brief would call next, not the mock.
        self.assertIs(metrics_brief.get_completion, real_get_completion)
        self.assertEqual(sorted(status for status, _ in results), [200, 201])
        self.assertEqual(calls, [team_key])
        self.assertEqual(Brief.objects.filter(scope_key=team_key).count(), 1)
        self.assertEqual(results[0][1]["brief"]["id"], results[1][1]["brief"]["id"])

        # 9. The kept brief reads fresh for Mona; Lee has no Company brief.
        status, body = http_get(self.api("/brain/brief/?scope=team"), token=tokens["mona"])
        self.assertEqual(
            (body["brief"]["scope"], body["brief"]["stale"], body["brief"]["generated_by"]),
            ("team", False, "Mona Manager"),
        )
        status, body = http_get(self.api("/brain/brief/?scope=company"), token=tokens["lee"])
        self.assertEqual((status, body), (200, {"brief": None}))
