"""The Slack bundle proposer (Slack bundles, owner 2026-10-17): one model
call per Slack message sent to Work, its answer held to a shape; each step
checked by its kind and placed in a fixed order on the message's one record,
for its sender alone; the server fills the issue's placeholders. No record,
the agent off, a model failure or no valid step: no bundle, the card stays.
The model is always patched."""

import json
from unittest.mock import patch

from django.test import override_settings

from core.models import AuditEvent
from services.agents import slack_bundles
from services.agents.models import AgentBundle, AgentPolicy, AgentProfile
from services.agents.policy import profiles_for
from services.agents.tests.slack_bundle_fixtures import MODEL, SlackBundleFixture
from services.copilot.anthropic_client import BudgetExceeded, CopilotRequestFailed
from services.metrics.models import AgentAction
from services.plans.models import PlanTemplate, Sharing
from services.segments.models import Segment
from services.work.models import SlackSuggestion

FULL = {
    "title": "Pizza Hut: SSO fails after 2.4",
    "reason": "Faiz reports admins locked out since the 2.4 release.",
    "jira": {
        "use": True,
        "summary": "Pizza Hut: SSO fails after 2.4",
        "description": "Admins are locked out since the 2.4 release.",
        "priority": "high",
    },
    "reply": {
        "use": True,
        "text": "Thanks Faiz, looking now.",
        "text_with_issue": "Thanks Faiz, logged as {issue}. I'll keep you posted.",
    },
    "task": {"use": True, "title": "Check Pizza Hut's SSO settings", "due_in_days": 2},
    "survey": {
        "use": True,
        "survey_type": "csat",
        "subject": "How did we do?",
        "intro": "One question about the SSO fix.",
        "roles": ["champion"],
        "timing": "after_jira",
    },
}


@override_settings(SLACK_JIRA_PROJECT="KAN")
class ProposerTests(SlackBundleFixture):
    def setUp(self):
        super().setUp()
        self.chat = self.slack_connector()
        self.tracker = self.jira_connector(project="")

    def propose(self, row, answer=FULL, **kwargs):
        with patch(MODEL, return_value=json.dumps(answer), **kwargs) as model:
            outcome = slack_bundles.propose(row, row.owner)
        return outcome, model

    def test_one_call_makes_the_senders_bundle_in_order_with_the_issue_filled_in(self):
        row = self.slack_row(self.mona, self.pizza)
        outcome, model = self.propose(row)
        self.assertEqual(model.call_count, 1)
        self.assertEqual(model.call_args.kwargs["purpose"], "slack_bundle")
        self.assertIn("jira", model.call_args.kwargs["response_schema"]["properties"])
        bundle = outcome.bundle
        self.assertEqual(outcome.state, "made")
        self.assertEqual(
            (bundle.source, bundle.routed_to, bundle.routed_user_id, bundle.slack_suggestion_id),
            ("slack_message", "person", self.mona.pk, row.pk),
        )
        self.assertEqual((bundle.customer_id, bundle.agent), (self.pizza.pk, "cs"))
        steps = list(bundle.steps.order_by("position"))
        self.assertEqual(
            [s.kind for s in steps], ["jira.create", "slack.reply", "task.create", "survey.record"]
        )
        jira, reply, task, survey = steps
        self.assertEqual(
            (jira.payload["project"], jira.payload["slack_suggestion_id"]), ("KAN", row.pk)
        )
        self.assertEqual(
            reply.payload["text"],
            "Thanks Faiz, logged as {{step 1.ticket_key}} ({{step 1.ticket_url}}). "
            "I'll keep you posted.",
        )
        self.assertEqual(
            (reply.payload["slack_message_id"], reply.payload["thread_ts"]),
            (row.pk, row.message_ts),
        )
        # A task for nobody in particular is the sender's.
        self.assertEqual(task.payload["assignee_id"], self.mona.pk)
        self.assertEqual(survey.payload["issue"], "{{step 1.ticket_key}}")
        self.assertEqual(bundle.title, "Pizza Hut: SSO fails after 2.4")
        row.refresh_from_db()
        self.assertEqual(row.bundle_state, "made")
        event = AuditEvent.objects.get(action="agent_bundle.made")
        self.assertEqual(
            event.metadata,
            {
                "by_run": True,
                "source": "slack_message",
                "added": 4,
                "dropped": 0,
                "kinds": ["jira.create", "slack.reply", "task.create", "survey.record"],
            },
        )

    def test_the_message_never_reaches_beyond_its_one_record(self):
        row = self.slack_row(self.csm, self.pizza)
        _, model = self.propose(row)
        content = model.call_args.args[1][0]["content"]
        self.assertIn("Pizza Hut", content)
        for other in ("Taco Bell", "Dough Co", "Soup Co"):
            self.assertNotIn(other, content)
        self.assertIn(json.dumps(row.text), content)

    def test_without_jira_the_reply_has_no_issue_and_the_survey_waits_for_nothing(self):
        self.tracker.delete()
        row = self.slack_row(self.csm, self.pizza)
        outcome, model = self.propose(row)
        self.assertNotIn("jira", model.call_args.kwargs["response_schema"]["properties"])
        steps = list(outcome.bundle.steps.order_by("position"))
        self.assertEqual([s.kind for s in steps], ["slack.reply", "task.create"])
        self.assertEqual(steps[0].payload["text"], "Thanks Faiz, looking now.")

    def test_a_kind_on_never_is_neither_offered_nor_placed(self):
        AgentPolicy.objects.update_or_create(
            organisation=self.org, defaults={"levels": {"cs": {"task.create": "never"}}}
        )
        outcome, model = self.propose(self.slack_row(self.csm, self.pizza))
        self.assertNotIn("task", model.call_args.kwargs["response_schema"]["properties"])
        self.assertNotIn("task.create", outcome.bundle.steps.values_list("kind", flat=True))

    def test_invalid_items_are_dropped_one_by_one(self):
        theirs = Segment.objects.create(
            organisation=self.org, owner=self.other, name="Dana's", kind="customer"
        )
        mine = Segment.objects.create(
            organisation=self.org, owner=self.csm, name="Mine", kind="customer"
        )
        answer = {
            **FULL,
            "jira": {"use": True, "summary": "", "description": "No title."},
            "segment": {"use": True, "segment_id": theirs.pk},
            "plan": {"use": True, "template_id": 999_999},
        }
        outcome, model = self.propose(self.slack_row(self.csm, self.pizza), answer)
        lines = model.call_args.args[1][0]["content"]
        self.assertIn(f"segment {mine.pk}:", lines)
        self.assertNotIn(f"segment {theirs.pk}:", lines)
        kinds = list(outcome.bundle.steps.order_by("position").values_list("kind", flat=True))
        # No Jira step, so the survey has no issue to wait for either.
        self.assertEqual(kinds, ["slack.reply", "task.create"])
        event = AuditEvent.objects.get(action="agent_bundle.made")
        self.assertEqual((event.metadata["added"], event.metadata["dropped"]), (2, 4))

    def test_a_plan_from_a_shared_template_is_proposed(self):
        template = PlanTemplate.objects.create(
            organisation=self.org,
            owner=self.admin,
            name="Escalation recovery",
            kind="save",
            sharing=Sharing.WORKSPACE,
            milestones=[],
        )
        answer = {**FULL, "plan": {"use": True, "template_id": template.pk}}
        outcome, _ = self.propose(self.slack_row(self.csm, self.pizza), answer)
        plan = outcome.bundle.steps.get(kind="plan.start")
        self.assertEqual(plan.payload["template_id"], template.pk)
        self.assertEqual(plan.title, "Start the Escalation recovery plan on Pizza Hut")

    def test_a_placeholder_the_model_wrote_itself_is_never_kept(self):
        answer = {
            **FULL,
            "reply": {"use": True, "text": "See {{step 3.task_url}}", "text_with_issue": "x"},
        }
        outcome, _ = self.propose(self.slack_row(self.csm, self.pizza), answer)
        reply = outcome.bundle.steps.get(kind="slack.reply")
        # The card's own draft, with the issue the server fills in.
        self.assertEqual(
            reply.payload["text"],
            "Thanks Faiz, logged as {{step 1.ticket_key}} ({{step 1.ticket_url}}).",
        )

    def test_a_step_like_one_already_waiting_on_the_record_is_dropped(self):
        self.step(
            self.pizza,
            kind="task.create",
            payload=self.task_payload("Check Pizza Hut's SSO settings"),
            target="task:check pizza hut's sso settings",
        )
        outcome, _ = self.propose(self.slack_row(self.csm, self.pizza))
        self.assertNotIn("task.create", outcome.bundle.steps.values_list("kind", flat=True))

    def test_no_bundle_without_a_record_or_one_the_sender_may_open(self):
        for record in (None, self.soup):
            with self.subTest(record=getattr(record, "name", None)):
                outcome, model = self.propose(self.slack_row(self.csm, record))
                self.assertEqual((outcome.bundle, outcome.state), (None, "none"))
                model.assert_not_called()

    def test_the_agent_off_or_ai_off_makes_no_call(self):
        profiles_for(self.org)
        AgentProfile.objects.filter(organisation=self.org, kind="cs").update(enabled=False)
        outcome, model = self.propose(self.slack_row(self.csm, self.pizza))
        self.assertEqual(outcome.state, "none")
        model.assert_not_called()
        AgentProfile.objects.filter(organisation=self.org, kind="cs").update(enabled=True)
        self.org.ai_agent_enabled = False
        self.org.save(update_fields=["ai_agent_enabled"])
        row = self.slack_row(self.csm, self.pizza)
        row.owner.organisation.refresh_from_db()
        outcome, model = self.propose(row)
        self.assertEqual(outcome.state, "none")
        model.assert_not_called()

    def test_a_sales_person_gets_the_sales_agent(self):
        row = self.slack_row(self.sam, self.deals)
        outcome, _ = self.propose(row)
        self.assertEqual(outcome.bundle.agent, "sales")

    def test_a_model_failure_or_no_credits_leaves_the_card(self):
        for effect in (CopilotRequestFailed("down"), BudgetExceeded("spent"), None):
            with self.subTest(effect=type(effect).__name__):
                row = self.slack_row(self.csm, self.pizza)
                kwargs = {"side_effect": effect} if effect else {"return_value": "not json"}
                with patch(MODEL, **kwargs):
                    outcome = slack_bundles.propose(row, self.csm)
                self.assertEqual((outcome.bundle, outcome.state), (None, "failed"))
        self.assertFalse(AgentBundle.objects.exists())

    def test_nothing_valid_makes_no_bundle(self):
        answer = {"title": "Nothing", "reason": "", "task": {"use": False}}
        outcome, _ = self.propose(self.slack_row(self.csm, self.pizza), answer)
        self.assertEqual((outcome.bundle, outcome.state), (None, "none"))
        self.assertFalse(AgentBundle.objects.exists())
        self.assertFalse(AgentAction.objects.exists())

    def test_the_card_records_none_of_this_in_its_text_fields(self):
        row = self.slack_row(self.csm, self.pizza)
        self.propose(row)
        fresh = SlackSuggestion.objects.get(pk=row.pk)
        self.assertEqual((fresh.jira_key, fresh.replied_at), ("", None))
