"""The per-minute tick proposes Slack bundles (Slack bundles, owner
2026-10-17): Slack waits only 3 seconds for the shortcut, so the card is
made in the request and its bundle on the `deliver` tick. Each waiting
message is proposed for once, oldest first, only under an hour old; one
failing never stops the others, nor the sends that tick delivers."""

import io
import json
from datetime import timedelta
from unittest.mock import patch

from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone

from services.agents import slack_bundles
from services.agents.models import AgentBundle
from services.agents.tests.slack_bundle_fixtures import MODEL, SlackBundleFixture
from services.agents.tests.test_slack_bundle_proposer import FULL
from services.work.models import SlackSuggestion

PENDING = SlackSuggestion.BundleState.PENDING


@override_settings(SLACK_JIRA_PROJECT="KAN")
class TickTests(SlackBundleFixture):
    def setUp(self):
        super().setUp()
        self.slack_connector()
        self.jira_connector(project="")

    def pending(self, owner=None, record=None, **fields):
        return self.slack_row(
            owner or self.csm, record or self.pizza, bundle_state=PENDING, **fields
        )

    def test_a_waiting_message_gets_its_bundle_once(self):
        row = self.pending()
        with patch(MODEL, return_value=json.dumps(FULL)) as model:
            first = slack_bundles.propose_pending()
            again = slack_bundles.propose_pending()
        self.assertEqual(model.call_count, 1)
        self.assertEqual(first, {"made": 1, "none": 0, "failed": 0})
        self.assertEqual(again, {"made": 0, "none": 0, "failed": 0})
        row.refresh_from_db()
        self.assertEqual(row.bundle_state, "made")
        self.assertEqual(AgentBundle.objects.get().slack_suggestion_id, row.pk)

    def test_a_message_older_than_an_hour_is_left_as_its_card(self):
        row = self.pending()
        SlackSuggestion.objects.filter(pk=row.pk).update(
            created_at=timezone.now() - timedelta(hours=2)
        )
        with patch(MODEL) as model:
            counts = slack_bundles.propose_pending()
        model.assert_not_called()
        self.assertEqual(counts["none"], 1)
        row.refresh_from_db()
        self.assertEqual(row.bundle_state, "none")

    def test_a_card_from_before_never_gets_a_bundle(self):
        self.slack_row(self.csm, self.pizza)  # bundle_state ""
        with patch(MODEL) as model:
            slack_bundles.propose_pending()
        model.assert_not_called()

    def test_one_message_failing_never_stops_the_others(self):
        broken, fine = self.pending(), self.pending()
        real = slack_bundles.propose

        def flaky(row, person):
            if row.pk == broken.pk:
                raise RuntimeError("boom")
            return real(row, person)

        with (
            patch.object(slack_bundles, "propose", side_effect=flaky),
            patch(MODEL, return_value=json.dumps(FULL)),
        ):
            counts = slack_bundles.propose_pending()
        self.assertEqual((counts["made"], counts["failed"]), (1, 1))
        states = dict(
            SlackSuggestion.objects.filter(pk__in=[broken.pk, fine.pk]).values_list(
                "pk", "bundle_state"
            )
        )
        self.assertEqual((states[broken.pk], states[fine.pk]), ("failed", "made"))

    def test_at_most_a_tick_of_messages_oldest_first(self):
        rows = [self.pending() for _ in range(3)]
        with patch(MODEL, return_value=json.dumps(FULL)):
            slack_bundles.propose_pending(limit=2)
        states = [SlackSuggestion.objects.get(pk=r.pk).bundle_state for r in rows]
        self.assertEqual(states, ["made", "made", "pending"])

    def test_the_deliver_tick_runs_it_and_a_failure_never_stops_the_sends(self):
        self.pending()
        out = io.StringIO()
        with patch(MODEL, return_value=json.dumps(FULL)):
            call_command("deliver_pending", stdout=out)
        self.assertIn("Slack messages: 1 bundle(s) made", out.getvalue())
        out = io.StringIO()
        command = "services.campaigns.management.commands.deliver_pending"
        with (
            patch.object(slack_bundles, "propose_pending", side_effect=RuntimeError("boom")),
            patch(f"{command}.deliver_surveys", return_value=(0, 0)) as surveys,
        ):
            call_command("deliver_pending", stdout=out)
        self.assertIn("slack bundles skipped: RuntimeError", out.getvalue())
        surveys.assert_called_once()
