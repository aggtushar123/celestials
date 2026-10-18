"""The round trip over HTTP (contract): a pass drafts a reply on Auto, the
owner is told, the queue names the draft, the owner sends it threaded so
the debt clears, and undo then refuses; a plan.start is approved, undone
to Draft and started again."""

import json
from unittest.mock import patch

from django.utils import timezone

from services.accounts.models import Organisation
from services.agents import evidence, run
from services.agents.models import AgentPolicy
from services.agents.policy import policy_for
from services.agents.tests.bundle_fixtures import run_one
from services.agents.tests.drafts_fixtures import inbound, mailbox
from services.agents.tests.fixtures import AgentsFixture
from services.copilot.anthropic_client import CopilotNotConfigured
from services.customers import communications
from services.customers.models import ReplyDraft, Task
from services.mail.tests.test_mail import FakeProvider
from services.metrics.models import AgentAction
from services.notifications.models import Notification
from services.plans.models import Plan, PlanTemplate


class Threadless(FakeProvider):
    """Graph or SMTP: no thread named, sent now."""

    def send(self, creds, *, to, subject, body, in_reply_to=""):
        sent = super().send(creds, to=to, subject=subject, body=body, in_reply_to=in_reply_to)
        sent.thread_id, sent.date = "", timezone.now()
        return sent


class DraftsEndToEndTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        mailbox(cls.csm)
        cls.mail = inbound(cls.pizza, cls.csm)
        cls.ref = f"customer:{cls.pizza.pk}"

    def setUp(self):
        FakeProvider.queued, FakeProvider.sent, FakeProvider.replied_to = [], [], []
        for target, options in (
            ("services.agents.policy.plan_credits", {"return_value": 3000}),
            (
                "services.customers.classification.get_completion",
                {"side_effect": CopilotNotConfigured("no model in tests")},
            ),
            ("services.mail.sync.get_provider", {"return_value": Threadless()}),
        ):
            patcher = patch(target, **options)
            patcher.start()
            self.addCleanup(patcher.stop)

    def pass_(self, *items):
        with patch("services.agents.run.get_completion", return_value=json.dumps(list(items))):
            return run.run(Organisation.objects.get(pk=self.org.pk), "cs")

    def lines(self):
        ctx = evidence.build(Organisation.objects.get(pk=self.org.pk), "cs", today=self.today)
        header = next(x for x in sorted(evidence.record_lines(ctx, self.ref)) if x.startswith("- "))
        return ctx.emails[self.mail.pk]["line"].strip(), header

    def test_a_draft_from_the_pass_to_the_customer(self):
        AgentPolicy.objects.filter(pk=policy_for(self.org).pk).update(
            levels={"cs": {"draft.reply": "auto"}}
        )
        email_line, _ = self.lines()
        result = self.pass_(
            {
                "kind": "draft.reply",
                "record": self.ref,
                "title": "Reply to Ann Lee about the renewal",
                "rationale": "She is waiting.",
                "evidence": [email_line],
                "payload": {"email_id": self.mail.pk, "body": "Hi Ann, two years works."},
            }
        )
        self.assertEqual(result.applied, 1)
        made = ReplyDraft.objects.get()
        self.assertTrue(
            Notification.objects.filter(recipient=self.csm, kind="agent_draft_ready").exists()
        )
        carl = self.client_for(self.csm)
        row = next(
            r
            for r in carl.get("/api/v1/communications/").data["results"]
            if r["id"] == f"email:{self.mail.pk}"
        )
        self.assertEqual(row["draft"]["id"], made.pk)
        sent = carl.post(f"/api/v1/communications/drafts/{made.pk}/send/", {}, format="json")
        self.assertEqual(sent.status_code, 200, sent.data)
        self.assertEqual(sent.data["email"]["thread_id"], self.mail.thread_id)
        self.assertEqual(communications.replies_owed(self.csm).count(), 0)
        action = AgentAction.objects.get(kind="draft.reply")
        undo = carl.post(f"/api/v1/agents/actions/{action.pk}/undo/")
        self.assertEqual(
            (undo.status_code, undo.data["code"], undo.data["detail"]),
            (409, "CHANGED_SINCE", "This draft has been sent."),
        )

    def test_a_plan_approved_undone_to_draft_and_started_again(self):
        onboarding = PlanTemplate.objects.get(is_builtin=True, kind="onboarding")
        _, header = self.lines()
        self.pass_(
            {
                "kind": "plan.start",
                "record": self.ref,
                "title": "Start onboarding",
                "rationale": "Just signed.",
                "evidence": [header],
                "payload": {"template_id": onboarding.pk},
            }
        )
        action = AgentAction.objects.get(kind="plan.start")
        mona = self.client_for(self.mona)
        ran = run_one(mona, action)
        self.assertEqual(ran.status_code, 200, ran.data)
        self.assertEqual(ran.data["bundle"]["steps"][0]["status"], "applied")
        approved = mona.get(f"/api/v1/agents/actions/{action.pk}/")
        plan_id = approved.data["result"]["plan_id"]
        page = mona.get(f"/api/v1/plans/{plan_id}/").data
        self.assertEqual(page["started_by_agent"], "cs")
        undone = mona.post(f"/api/v1/agents/actions/{action.pk}/undo/")
        self.assertEqual(undone.status_code, 200, undone.data)
        plan = Plan.objects.get(pk=plan_id)
        self.assertEqual(plan.status, "draft")
        self.assertFalse(Task.objects.filter(plan=plan).exists())
        started = mona.post(f"/api/v1/plans/{plan_id}/start/", {}, format="json")
        self.assertEqual(started.status_code, 200, started.data)
        self.assertEqual(
            (started.data["status"], started.data["pending_tasks"]), ("not_started", 0)
        )
        self.assertTrue(Task.objects.filter(plan=plan).exists())
