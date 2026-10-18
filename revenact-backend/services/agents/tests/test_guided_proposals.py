"""Proposing the guided agent (spec §4): a thread's read or a Slack message
proposes diagnose, write and send whole and in order (or none of them); the
bundle is high priority when the message is urgent or its record's health
fell, shows so in Work, and its people are told at once. The model is a fake."""

import json
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.utils import timezone

from services.accounts.models import Organisation
from services.agents import slack_bundles
from services.agents.models import AgentBundle
from services.agents.tests.outside_fixtures import OutsideFixture
from services.agents.tests.slack_bundle_fixtures import FEED, SlackBundleFixture
from services.agents.tests.slack_bundle_fixtures import MODEL as SLACK_MODEL
from services.customers.models import Customer, HealthSnapshot
from services.metrics.models import AgentAction
from services.notifications.models import Notification

TRIO = ["record.diagnose", "mail.compose", "mail.send_draft"]
PRIORITY = Notification.Kind.AGENT_BUNDLE_PRIORITY


def fell(record, start="7.8", now="6.1"):
    Customer.objects.filter(pk=record.pk).update(health_score=Decimal(now))
    HealthSnapshot.objects.create(
        customer=record,
        captured_on=timezone.localdate() - timedelta(days=14),
        health_score=Decimal(start),
    )
    record.refresh_from_db()


class ThreadProposalTests(OutsideFixture):
    def items(self, ctx, *kinds):
        line = self.thread_line(ctx, "message ")
        return [
            {
                "kind": kind,
                "record": ctx.thread_ref,
                "title": f"Do {kind}",
                "rationale": "Pizza Hut is unhappy.",
                "evidence": [line] if n == 0 else [],
                "payload": {},
            }
            for n, kind in enumerate(kinds)
        ]

    def thread(self, ts="1760339999.000100"):
        _conversation, thread = self.slack_thread(self.pizza, ts=ts)
        ctx, _ = self.thread_ctx(thread)
        return thread, ctx

    def test_the_thread_prompt_offers_the_trio_and_it_is_placed_whole(self):
        thread, ctx = self.thread()
        result, model = self.run_intake(self.answer(*self.items(ctx, *TRIO)))
        self.assertEqual(result.made, 1)
        system = model.call_args.kwargs["system"]
        self.assertIn("record.diagnose, then mail.compose, then mail.send_draft", system)
        steps = AgentAction.objects.filter(bundle__thread=thread).order_by("position")
        self.assertEqual([s.kind for s in steps], TRIO)
        self.assertEqual([s.position for s in steps], [1, 2, 3])
        # The compose and send borrowed the diagnosis's evidence.
        self.assertTrue(all(s.evidence for s in steps))

    def test_a_partial_or_out_of_order_trio_is_dropped_whole(self):
        for n, kinds in enumerate((TRIO[:2], [TRIO[1], TRIO[0], TRIO[2]])):
            with self.subTest(kinds=kinds):
                thread, ctx = self.thread(ts=f"176033999{n}.000100")
                note = {
                    "kind": "note.create",
                    "record": ctx.thread_ref,
                    "title": "File a note",
                    "rationale": "Keep it.",
                    "evidence": [self.thread_line(ctx, "message ")],
                    "payload": {"title": f"Login loop {n}", "body": "They can't log in."},
                }
                # Each run is due: the interval starts again.
                Organisation.objects.filter(pk=self.org.pk).update(ai_signals_ran_at=None)
                self.run_intake(self.answer(*self.items(ctx, *kinds), note))
                steps = AgentAction.objects.filter(bundle__thread=thread)
                self.assertEqual([s.kind for s in steps], ["note.create"])

    def test_a_health_drop_makes_it_priority_and_its_owner_is_told_at_once(self):
        fell(self.pizza)
        thread, ctx = self.thread()
        self.run_intake(self.answer(*self.items(ctx, *TRIO)))
        bundle = AgentBundle.objects.get(thread=thread)
        self.assertEqual(bundle.priority, "high")
        note = Notification.objects.get(kind=PRIORITY)
        self.assertEqual(note.recipient_id, self.csm.pk)
        self.assertEqual(note.link, f"/work?queue=mine&kind=bundle&bundle={bundle.pk}")
        self.assertTrue(note.message.startswith("Priority: "))
        feed = self.client_for(self.csm).get(FEED).json()
        rows = [i for g in feed["groups"] for i in g["items"] if i["kind"] == "bundle"]
        self.assertEqual(
            [(r["detail"]["priority"], r["detail"]["guided"]) for r in rows], [("high", True)]
        )

    def test_a_steady_record_and_a_calm_message_stay_normal_and_untold(self):
        thread, ctx = self.thread()
        self.run_intake(self.answer(*self.items(ctx, *TRIO)))
        self.assertEqual(AgentBundle.objects.get(thread=thread).priority, "normal")
        self.assertFalse(Notification.objects.filter(kind=PRIORITY).exists())

    def test_the_model_saying_urgent_makes_any_message_bundle_priority(self):
        thread, ctx = self.thread()
        note = {
            "kind": "note.create",
            "record": ctx.thread_ref,
            "title": "File a note",
            "rationale": "Keep it.",
            "evidence": [self.thread_line(ctx, "message ")],
            "payload": {"title": "Login loop", "body": "They can't log in."},
        }
        raw = json.dumps(
            {
                "title": "Pizza Hut: login",
                "reason": "Locked out.",
                "priority": "high",
                "actions": [note],
            }
        )
        self.run_intake(raw)
        self.assertEqual(AgentBundle.objects.get(thread=thread).priority, "high")
        self.assertEqual(Notification.objects.filter(kind=PRIORITY).count(), 1)

    def test_the_nightly_pass_never_proposes_it(self):
        from services.agents import intake, run
        from services.agents.policy import policy_for

        ctx, _ = self.thread_ctx(self.thread()[0])
        self.assertTrue(set(TRIO) <= set(intake.allowed_kinds(policy_for(self.org), "cs", ctx)))
        with (
            patch("services.agents.policy.plan_credits", return_value=3000),
            patch("services.agents.run.get_completion", return_value="[]") as model,
        ):
            run.run(self.org, "cs")
        system = model.call_args.kwargs.get("system") or model.call_args.args[0]
        self.assertFalse(any(kind in system for kind in TRIO))


class SlackProposalTests(SlackBundleFixture):
    def test_rescue_places_the_trio_first_and_tells_the_sender_when_health_fell(self):
        fell(self.pizza)
        row = self.slack_row(self.csm, self.pizza, text="Pizza Hut is unhappy, can you fix it?")
        answer = {
            "title": "Pizza Hut: unhappy",
            "reason": "Faiz says Pizza Hut is unhappy.",
            "rescue": {"use": True},
            "task": {"use": True, "title": "Call Pizza Hut", "due_in_days": 1},
        }
        with patch(SLACK_MODEL, return_value=json.dumps(answer)) as model:
            outcome = slack_bundles.propose(row, self.csm)
        self.assertIn('"rescue"', model.call_args.args[0])
        bundle = outcome.bundle
        self.assertEqual(
            [s.kind for s in bundle.steps.order_by("position")], [*TRIO, "task.create"]
        )
        self.assertEqual(bundle.priority, "high")
        self.assertEqual(Notification.objects.get(kind=PRIORITY).recipient_id, self.csm.pk)

    def test_urgent_without_the_trio_is_priority_too(self):
        row = self.slack_row(self.csm, self.pizza)
        answer = {
            "title": "Pizza Hut: SSO",
            "reason": "Admins are locked out.",
            "urgent": True,
            "task": {"use": True, "title": "Check SSO", "due_in_days": 1},
        }
        with patch(SLACK_MODEL, return_value=json.dumps(answer)):
            outcome = slack_bundles.propose(row, self.csm)
        self.assertEqual(outcome.bundle.priority, "high")
