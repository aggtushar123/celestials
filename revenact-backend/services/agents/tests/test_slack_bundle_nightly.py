"""The nightly pass leaves a Slack bundle's steps alone (Slack bundles,
owner 2026-10-17): it never expires one it didn't propose again, never
replaces one with a different proposal, and the feedback log and a record's
rejected lines never quote one."""

import json
from unittest.mock import patch

from services.agents import evidence, run
from services.agents.registry import REGISTRY
from services.agents.tests.slack_bundle_fixtures import SlackBundleFixture
from services.metrics.feedback import MESSAGE_STEP_LABEL
from services.metrics.models import AgentAction, Feedback

REJECT = "/api/v1/agents/bundles/{}/reject/"


class SlackBundleNightlyTests(SlackBundleFixture):
    def nightly(self, *items):
        with patch("services.agents.run.get_completion", return_value=json.dumps(list(items))):
            return run.run(self.org, "cs")

    def test_the_nightly_pass_never_expires_a_slack_bundles_step(self):
        step = self.slack_bundle(self.slack_row(self.csm, self.pizza)).steps.get()
        plain = self.bundle_of(self.pizza, ("note.create", {"title": "T", "body": "B"}))
        self.nightly()
        step.refresh_from_db()
        self.assertEqual(step.status, "proposed")
        self.assertEqual(plain.steps.get().status, "expired")

    def test_no_pass_replaces_a_slack_bundles_step_with_a_different_proposal(self):
        payload = self.task_payload("Check the SSO settings")
        bundle = self.slack_bundle(self.slack_row(self.csm, self.pizza), ("task.create", payload))
        step = bundle.steps.get()
        AgentAction.objects.filter(pk=step.pk).update(
            target=REGISTRY["task.create"].target(payload)
        )
        ctx = evidence.build(self.org, "cs", today=self.today)
        ref = f"customer:{self.pizza.pk}"
        line = next(x for x in sorted(evidence.record_lines(ctx, ref)) if x.startswith("- "))
        result = self.nightly(
            {
                "kind": "task.create",
                "record": ref,
                "title": "Check the SSO settings",
                "rationale": "Renews soon.",
                "evidence": [line],
                "payload": {"title": "Check the SSO settings", "assignee_id": self.mona.pk},
            }
        )
        step.refresh_from_db()
        self.assertEqual((step.status, step.bundle_id), ("proposed", bundle.pk))
        self.assertEqual(result.dropped, 1)

    def test_rejecting_it_logs_no_word_of_the_message(self):
        bundle = self.slack_bundle(self.slack_row(self.csm, self.pizza))
        response = self.client_for(self.csm).post(
            REJECT.format(bundle.pk),
            {"reason": "other", "note": "Faiz already fixed it"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        entry = Feedback.objects.get(kind=Feedback.Kind.PROPOSAL)
        self.assertEqual((entry.subject_label, entry.note), (MESSAGE_STEP_LABEL, ""))
        self.assertEqual(entry.before["rationale"], "")

    def test_a_rejected_slack_bundle_is_named_only_as_a_suggestion_from_a_message(self):
        bundle = self.slack_bundle(self.slack_row(self.csm, self.pizza))
        self.client_for(self.csm).post(
            REJECT.format(bundle.pk), {"reason": "not_relevant"}, format="json"
        )
        ctx = evidence.build(self.org, "cs", today=self.today)
        lines = ctx.records[f"customer:{self.pizza.pk}"]["rejected"]
        self.assertEqual(len(lines), 1)
        self.assertIn(evidence.MESSAGE_TITLE, lines[0])
        self.assertNotIn("Jira", lines[0])
