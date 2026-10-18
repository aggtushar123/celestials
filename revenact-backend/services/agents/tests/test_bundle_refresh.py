"""Refresh suggestions (agent bundles D2 contract §4.2, D2-19) and a run
against replaced steps (§4.3, D2-20)."""

from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone

from services.accounts.models import Organisation
from services.agents.models import AgentBundle, AgentProfile
from services.agents.policy import profiles_for
from services.agents.tests.bundle_fixtures import BUNDLES, note
from services.agents.tests.intake_fixtures import IntakeFixture
from services.copilot.anthropic_client import BudgetExceeded, CopilotRequestFailed
from services.metrics.models import AgentAction


class RefreshTests(IntakeFixture):
    def setUp(self):
        _, self.thread = self.ticket_thread(self.pizza)
        self.ctx, _ = self.thread_ctx(self.thread)
        self.line = self.thread_line(self.ctx, "ticket ")
        self.bundle = self.message_bundle(
            self.thread, note("Old", "Unedited."), note("Kept", "Edited by Carl.")
        )
        _, kept = self.bundle.steps.order_by("position")
        AgentAction.objects.filter(pk=kept.pk).update(edited_at=timezone.now())
        AgentBundle.objects.filter(pk=self.bundle.pk).update(
            edited_at=timezone.now(), has_newer_message=True
        )

    def refresh(self, user, raw=None, side_effect=None):
        item = {
            "kind": "note.create",
            "record": self.ctx.thread_ref,
            "title": "Log the reopen",
            "rationale": "Reopened.",
            "evidence": [self.line],
            "payload": {"title": "Reopened", "body": "It is back."},
        }
        with (
            patch("services.agents.policy.plan_credits", return_value=3000),
            patch(
                "services.agents.intake.get_completion",
                return_value=raw or self.answer(item),
                side_effect=side_effect,
            ),
        ):
            return self.client_for(user).post(
                f"{BUNDLES}{self.bundle.pk}/refresh/", {}, format="json"
            )

    def test_it_replaces_what_nobody_edited_and_keeps_the_rest(self):
        self.assertTrue(AgentBundle.objects.get(pk=self.bundle.pk).has_newer_message)
        answer = self.refresh(self.csm)
        self.assertEqual(answer.status_code, 200)
        bundle = answer.json()["bundle"]
        # The brief's "Kept" is the note's own title (the step's title is generated).
        self.assertEqual([s["fields"]["title"] for s in bundle["steps"]], ["Kept", "Reopened"])
        self.assertEqual(bundle["steps"][1]["title"], "Log the reopen")
        self.assertEqual([s["position"] for s in bundle["steps"]], [1, 2])
        self.assertEqual(bundle["steps"][0]["fields"]["body"], "Edited by Carl.")
        self.assertEqual(bundle["steps"][1]["fields"]["body"], "It is back.")
        self.assertEqual(
            (bundle["steps"][0]["edited"], bundle["steps"][1]["edited"]), (True, False)
        )
        self.assertIs(bundle["has_newer_message"], False)
        self.assertFalse(AgentBundle.objects.get(pk=self.bundle.pk).has_newer_message)
        self.assertIsNotNone(bundle["refreshed_at"])

    def test_refusals(self):
        nightly = self.bundle_of(self.pizza, note("N", "B"))
        answer = self.client_for(self.csm).post(
            f"{BUNDLES}{nightly.pk}/refresh/", {}, format="json"
        )
        self.assertEqual((answer.status_code, answer.json()["code"]), (409, "NOT_A_THREAD"))
        self.assertEqual(self.refresh(self.other).status_code, 404)

    def test_what_is_switched_off(self):
        Organisation.objects.filter(pk=self.org.pk).update(ai_signal_sources={"zendesk": False})
        answer = self.refresh(self.csm)
        self.assertEqual((answer.status_code, answer.json()["code"]), (409, "SOURCE_OFF"))
        self.assertEqual(
            answer.json()["detail"], "Agents don't read Zendesk messages in this workspace."
        )
        Organisation.objects.filter(pk=self.org.pk).update(
            ai_signal_sources={}, ai_agent_enabled=False
        )
        self.assertEqual(self.refresh(self.csm).json()["code"], "AI_OFF")
        Organisation.objects.filter(pk=self.org.pk).update(ai_agent_enabled=True)
        with patch("services.agents.policy.plan_credits", return_value=3000):
            profiles_for(self.org)  # the profiles exist before their settings change
        AgentProfile.objects.filter(organisation=self.org, kind="cs").update(enabled=False)
        answer = self.refresh(self.csm)
        self.assertEqual(
            (answer.status_code, answer.json()["code"], answer.json()["detail"]),
            (409, "AGENT_OFF", "This agent is switched off."),
        )
        AgentProfile.objects.filter(organisation=self.org, kind="cs").update(
            enabled=True, monthly_credits=0
        )
        self.assertEqual(self.refresh(self.csm).json()["code"], "BUDGET_USED")

    def test_a_thread_nobody_may_read_any_more(self):
        # Reachable only as the routing changes between the page and the click.
        with patch("services.agents.routing.route", return_value=(None, "no_reader")):
            answer = self.refresh(self.csm)
        self.assertEqual((answer.status_code, answer.json()["code"]), (409, "NO_READER"))
        self.assertEqual(
            answer.json()["detail"], "Nobody this bundle is for may read its message any more."
        )

    def test_a_run_naming_a_malformed_id_is_a_400_not_a_500(self):
        self.refresh(self.csm)
        for bad in ([1], "5", True):
            body = {"steps": [{"id": bad, "selected": True}]}
            answer = self.client_for(self.csm).post(
                f"{BUNDLES}{self.bundle.pk}/run/", body, format="json"
            )
            self.assertEqual(answer.status_code, 400, bad)

    def test_credits_and_a_failed_call(self):
        self.assertEqual(self.refresh(self.csm, side_effect=BudgetExceeded()).status_code, 429)
        failed = self.refresh(self.csm, side_effect=CopilotRequestFailed("down"))
        self.assertEqual((failed.status_code, failed.json()["code"]), (503, "REFRESH_FAILED"))

    def test_a_bundle_changed_during_the_call_is_left_alone(self):
        def changed(**_kwargs):
            AgentBundle.objects.filter(pk=self.bundle.pk).update(
                updated_at=timezone.now() + timedelta(seconds=1)
            )
            return self.answer()

        answer = self.refresh(self.csm, side_effect=changed)
        self.assertEqual((answer.status_code, answer.json()["code"]), (409, "BUNDLE_CHANGED"))
        self.assertEqual(answer.json()["bundle"]["id"], self.bundle.pk)
        self.assertEqual(self.bundle.steps.count(), 2)

    def test_a_run_naming_replaced_steps_is_told_why(self):
        old = list(self.bundle.steps.values_list("pk", flat=True))
        self.refresh(self.csm)
        body = {"steps": [{"id": pk, "selected": True} for pk in old]}
        answer = self.client_for(self.csm).post(
            f"{BUNDLES}{self.bundle.pk}/run/", body, format="json"
        )
        self.assertEqual((answer.status_code, answer.json()["code"]), (409, "BUNDLE_REFRESHED"))
        self.assertEqual(
            answer.json()["detail"],
            "This bundle was updated with a newer message. Review it again.",
        )
