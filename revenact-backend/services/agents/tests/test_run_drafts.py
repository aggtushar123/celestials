"""The two kinds through a pass (contract): registered for CS and Sales,
asked for in the prompt, kept when they cite their own source line or a
listed template, and dropped when a draft names anything internal. A ticket
draft expires only when its ticket is resolved or closed."""

import json
from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone

from services.accounts.models import Organisation
from services.agents import evidence, prompt, run
from services.agents.deciding import stale_reason
from services.agents.models import AgentPolicy
from services.agents.payloads import action_payload
from services.agents.policy import policy_for
from services.agents.registry import kinds_for
from services.agents.tests.drafts_fixtures import draft_action, inbound, mailbox, ticket
from services.agents.tests.fixtures import AgentsFixture
from services.agents.undo import CHANGE
from services.customers.models import ReplyDraft, Task, Ticket
from services.metrics.models import AgentAction
from services.plans.models import PlanTemplate


class RunDraftsTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        mailbox(cls.csm)
        cls.mail = inbound(cls.pizza, cls.csm)
        cls.onboarding = PlanTemplate.objects.get(is_builtin=True, kind="onboarding")
        cls.ref = f"customer:{cls.pizza.pk}"

    def org_now(self):
        return Organisation.objects.get(pk=self.org.pk)

    def email_line(self):
        ctx = evidence.build(self.org_now(), "cs", today=self.today)
        return ctx.emails[self.mail.pk]["line"].strip()

    def pass_(self, *items):
        with (
            patch("services.agents.policy.plan_credits", return_value=3000),
            patch("services.agents.run.get_completion", return_value=json.dumps(list(items))),
        ):
            return run.run(self.org_now(), "cs")

    def reply(self, body="Hi Ann, two years works for us.", cite=None):
        return {
            "kind": "draft.reply",
            "record": self.ref,
            "title": "Reply to Ann Lee about the renewal",
            "rationale": "She is waiting on an answer.",
            "evidence": [cite or self.email_line()],
            "payload": {"email_id": self.mail.pk, "body": body},
        }

    def test_both_kinds_are_the_record_agents_and_asked_for(self):
        self.assertIn("draft.reply", kinds_for("cs"))
        self.assertIn("plan.start", kinds_for("sales"))
        self.assertNotIn("draft.reply", kinds_for("ops"))
        system = prompt.system("cs", ["draft.reply", "plan.start"], "plain")
        self.assertIn('"email_id"', system)
        self.assertIn('"template_id"', system)
        self.assertEqual((CHANGE["draft.reply"], CHANGE["plan.start"]), ("draft reply", "plan"))

    def test_moving_between_open_statuses_does_not_expire_a_ticket_draft(self):
        issue = ticket(self.pizza)
        ticket_action = draft_action(self.org, issue)
        Ticket.objects.filter(pk=issue.pk).update(status="in-progress")
        self.assertIsNone(stale_reason(ticket_action, timezone.now()))
        Ticket.objects.filter(pk=issue.pk).update(status="on-hold")
        self.assertIsNone(stale_reason(ticket_action, timezone.now()))
        Ticket.objects.filter(pk=issue.pk).update(status="resolved")
        self.assertEqual(stale_reason(ticket_action, timezone.now()), "changed")

    def test_a_draft_citing_its_own_email_is_proposed_and_applies_on_auto(self):
        result = self.pass_(self.reply())
        self.assertEqual((result.proposed, result.dropped), (1, 0))
        action = AgentAction.objects.get(kind="draft.reply")
        self.assertEqual((action.status, action.before), ("proposed", self.mail.pk))
        AgentAction.objects.all().delete()
        AgentPolicy.objects.filter(pk=policy_for(self.org).pk).update(
            levels={"cs": {"draft.reply": "auto"}}
        )
        result = self.pass_(self.reply())
        self.assertEqual(result.applied, 1)
        made = ReplyDraft.objects.get()
        self.assertEqual(made.owner, self.csm)
        applied = AgentAction.objects.get(kind="draft.reply")
        self.assertEqual(
            action_payload(applied, self.csm)["result"],
            {
                "task_id": None,
                "note_id": None,
                "initiative_id": None,
                "draft_id": made.pk,
                "plan_id": None,
                "segment_id": None,
                "rule_id": None,
                "campaign_id": None,
                "canvas_id": None,
                "template_id": None,
            },
        )

    def test_a_draft_naming_a_task_or_citing_the_header_is_dropped(self):
        Task.objects.create(
            customer=self.pizza,
            title="Call the exec sponsor",
            assignee=self.csm,
            assignee_name=self.csm.name,
            created_by=self.csm,
            due_date=self.today + timedelta(days=2),
            priority="high",
        )
        ctx = evidence.build(self.org_now(), "cs", today=self.today)
        header = next(x for x in sorted(evidence.record_lines(ctx, self.ref)) if x.startswith("- "))
        result = self.pass_(
            self.reply(body="Hi Ann, I'll call the exec sponsor first."),
        )
        self.assertEqual((result.proposed, result.dropped), (0, 1))
        result = self.pass_(self.reply(cite=header))
        self.assertEqual((result.proposed, result.dropped), (0, 1))

    def test_a_plan_from_a_listed_template_is_proposed(self):
        ctx = evidence.build(self.org_now(), "cs", today=self.today)
        header = next(x for x in sorted(evidence.record_lines(ctx, self.ref)) if x.startswith("- "))
        result = self.pass_(
            {
                "kind": "plan.start",
                "record": self.ref,
                "title": "Start onboarding",
                "rationale": "Just signed.",
                "evidence": [header],
                "payload": {"template_id": self.onboarding.pk},
            }
        )
        self.assertEqual((result.proposed, result.dropped), (1, 0))
        action = AgentAction.objects.get(kind="plan.start")
        self.assertEqual(action.target, f"plan:{self.onboarding.pk}")
        self.assertEqual(
            action_payload(action, self.csm)["preview"]["plan"]["template"], self.onboarding.name
        )
