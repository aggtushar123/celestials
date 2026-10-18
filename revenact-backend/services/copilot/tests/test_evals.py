"""Copilot's evaluation harness (Google's "measure before you cut",
2026-10-16): the golden set is well formed, each case is answered the way a
person gets it and graded with an enforced verdict, leaks fail whatever the
judge says, and only people who may see every account read the results."""

import json
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from services.accounts.models import Organisation, User
from services.copilot import evals
from services.copilot.models import CopilotEvalRun
from services.customers.models import Customer

COMPLETE = "services.copilot.evals.get_completion"
URL = "/api/v1/copilot/evals/"
PASS = json.dumps(
    {"correct": 2, "grounded": 2, "private": True, "verdict": "pass", "reason": "Fine."}
)


def fake(answer="An answer.", verdict=PASS):
    """Copilot's answer for answer calls, the judge's verdict for judge calls."""

    def call(system, messages, **kwargs):
        return verdict if kwargs.get("purpose") == evals.JUDGE_PURPOSE else answer

    return call


class GoldenSetTests(TestCase):
    def test_every_case_is_complete_and_its_id_unique(self):
        cases = evals.golden()["cases"]
        self.assertGreaterEqual(len(cases), 15)
        self.assertEqual(len({c["id"] for c in cases}), len(cases))
        for case in cases:
            with self.subTest(case=case["id"]):
                self.assertTrue(case["question"].strip())
                self.assertTrue(case["expect"])
                self.assertIn(case["as"], ("admin", "csm_a", "csm_b"))
        kinds = {c["kind"] for c in cases}
        self.assertTrue({"fact", "privacy", "hallucination", "safety"} <= kinds)


class HarnessTests(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name="Alfee")
        self.other = Organisation.objects.create(name="Rival")

        def mk(email, role=None, org=None):
            extra = {"role": role} if role else {}
            return User.objects.create_user(
                email=email,
                password="x",
                name=email.split("@")[0].title(),
                organisation=org or self.org,
                **extra,
            )

        self.admin = mk("tushar@alfee.io", User.Role.ADMIN)
        self.faiz = mk("faiz@alfee.io")
        self.jesh = mk("jesh@alfee.io")
        self.zed = mk("zed@rival.io", User.Role.ADMIN, self.other)
        self.kraft = Customer.objects.create(
            organisation=self.org,
            name="Kraft Heinz",
            owner=self.faiz,
            arr_billed_at_account=Decimal("152600"),
            health_score=Decimal("7.2"),
        )
        Customer.objects.create(organisation=self.org, name="Uber", owner=self.faiz)
        Customer.objects.create(organisation=self.org, name="Zoom", owner=self.jesh)

    def test_the_cast_is_the_admin_the_biggest_book_and_another_csm(self):
        cast = evals.askers(self.org)
        self.assertEqual(
            (cast["admin"], cast["csm_a"], cast["csm_b"]), (self.admin, self.faiz, self.jesh)
        )

    def test_a_run_answers_each_case_as_copilot_and_saves_the_judges_verdicts(self):
        with patch(COMPLETE, side_effect=fake()) as complete:
            made = evals.run(self.org, only={"owner-kraft", "unknown-customer"})
        self.assertEqual((made.total, made.passed), (2, 2))
        self.assertEqual([r["id"] for r in made.results], ["owner-kraft", "unknown-customer"])
        answer_call = complete.call_args_list[0]
        self.assertEqual(answer_call.kwargs["purpose"], evals.ANSWER_PURPOSE)
        self.assertEqual(answer_call.kwargs["user"], self.admin)
        self.assertTrue(answer_call.kwargs["system"].startswith("You are"))
        judge_call = complete.call_args_list[1]
        self.assertEqual(judge_call.kwargs["purpose"], evals.JUDGE_PURPOSE)
        self.assertEqual(judge_call.kwargs["response_schema"], evals.JUDGE_SCHEMA)
        self.assertIn("<answer>An answer.</answer>", judge_call.args[1][0]["content"])

    def test_the_privacy_case_is_asked_by_someone_who_cannot_see_that_customer(self):
        # Live 2026-10-16: "csm_b" was Kraft Heinz's own owner on production
        # (book sizes differ from the seed's), so a correct answer was failed.
        from services.customers.scoping import visible_customers

        # As on production: the CSM with the smaller book owns Kraft Heinz.
        for name in ("Oracle", "Stripe"):
            Customer.objects.create(organisation=self.org, name=name, owner=self.jesh)
        self.assertEqual(evals.askers(self.org)["csm_b"], self.faiz)
        with patch(COMPLETE, side_effect=fake()) as complete:
            made = evals.run(self.org, only={"privacy-other-book"})
        asker = complete.call_args_list[0].kwargs["user"]
        self.assertFalse(visible_customers(asker).filter(pk=self.kraft.pk).exists())
        self.assertEqual(made.results[0]["asker"], "csm_b")

    def test_with_nobody_who_cannot_see_it_the_privacy_case_is_skipped(self):
        with patch.object(evals, "outsider", return_value=None):
            made = evals.run(self.org, only={"privacy-other-book"})
        self.assertTrue(made.results[0]["skipped"])

    def test_a_leaked_figure_fails_the_privacy_case_whatever_the_judge_says(self):
        with patch(COMPLETE, side_effect=fake(answer="Kraft Heinz is at $152,600 ARR.")):
            made = evals.run(self.org, only={"privacy-other-book"})
        [result] = made.results
        self.assertEqual(result["asker"], "csm_b")
        self.assertEqual((result["passed"], result["private"]), (False, False))

    def test_figures_inside_other_numbers_are_no_leak(self):
        case = {"forbid_customer": "Kraft Heinz"}
        self.assertEqual(evals.leaked(case, self.org, "Retention is 17.25 and 1152600 rows."), [])
        self.assertEqual(evals.leaked(case, self.org, "Health 7.2 here."), ["7.2"])

    def test_a_failing_judge_or_copilot_is_a_recorded_fail(self):
        with patch(COMPLETE, side_effect=fake(verdict="not json")):
            made = evals.run(self.org, only={"owner-kraft"})
        self.assertFalse(made.results[0]["passed"])
        with patch(COMPLETE, side_effect=RuntimeError("down")):
            made = evals.run(self.org, only={"owner-kraft"})
        self.assertIn("Copilot failed", made.results[0]["reason"])

    def test_only_the_newest_runs_are_kept(self):
        for _ in range(evals.KEEP + 3):
            CopilotEvalRun.objects.create(organisation=self.org, started_at=timezone.now())
        evals.prune(self.org)
        self.assertEqual(CopilotEvalRun.objects.filter(organisation=self.org).count(), evals.KEEP)

    def test_the_newest_run_is_read_by_those_who_see_every_account_in_their_workspace(self):
        client = APIClient()
        client.force_authenticate(self.admin)
        self.assertEqual(client.get(URL).json(), {"run": None, "history": []})
        with patch(COMPLETE, side_effect=fake()):
            evals.run(self.org, only={"owner-kraft"})
        body = client.get(URL).json()
        self.assertEqual((body["run"]["passed"], body["run"]["total"]), (1, 1))
        self.assertEqual(len(body["history"]), 1)
        client.force_authenticate(self.faiz)
        self.assertEqual(client.get(URL).status_code, 403)
        client.force_authenticate(self.zed)
        self.assertEqual(client.get(URL).json()["run"], None)


class RecordedLookupTests(TestCase):
    def test_every_lookup_and_its_result_reach_the_judge(self):
        log = []

        class Tool:
            name = "browse_knowledge"

            def __call__(self, args):
                return {"content": "NRR: forecast ARR over opening ARR."}

        recorded = evals.Recorded(Tool(), log)
        self.assertEqual(recorded.name, "browse_knowledge")
        recorded({"path": "metrics/nrr.md"})
        self.assertEqual(
            log,
            [
                {
                    "tool": "browse_knowledge",
                    "args": {"path": "metrics/nrr.md"},
                    "result": {"content": "NRR: forecast ARR over opening ARR."},
                }
            ],
        )


class ScheduledRunTests(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name="Alfee")
        User.objects.create_user(
            email="t@alfee.io", password="x", name="T", organisation=self.org, role=User.Role.ADMIN
        )

    def test_evaluation_calls_cost_the_workspace_no_credits(self):
        from services.billing import credits

        for purpose in (evals.ANSWER_PURPOSE, evals.JUDGE_PURPOSE):
            with self.subTest(purpose=purpose), patch.object(credits.ledger, "consume") as consume:
                self.assertFalse(
                    credits.charge(self.org, purpose=purpose, reference=f"r-{purpose}")
                )
                consume.assert_not_called()

    def test_a_drop_from_the_previous_run_is_logged_as_a_regression(self):
        from django.core.management import call_command

        CopilotEvalRun.objects.create(
            organisation=self.org, started_at=timezone.now(), total=2, passed=2
        )
        bad = json.dumps(
            {"correct": 0, "grounded": 0, "private": True, "verdict": "fail", "reason": "x"}
        )
        with (
            patch(COMPLETE, side_effect=fake(verdict=bad)),
            self.assertLogs("services.copilot.evals", level="WARNING") as logs,
        ):
            call_command(
                "run_copilot_evals",
                "--org",
                "Alfee",
                "--case",
                "owner-kraft",
                "--case",
                "unknown-customer",
            )
        self.assertTrue(
            any("copilot eval regressed" in line and "2 -> 0" in line for line in logs.output)
        )

    def test_without_org_it_runs_the_configured_workspaces(self):
        from django.core.management import call_command
        from django.test import override_settings

        with override_settings(COPILOT_EVAL_ORGS=["Alfee"]), patch(COMPLETE, side_effect=fake()):
            call_command("run_copilot_evals", "--case", "owner-kraft")
        self.assertEqual(CopilotEvalRun.objects.filter(organisation=self.org).count(), 1)
