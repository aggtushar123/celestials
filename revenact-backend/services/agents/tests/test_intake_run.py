"""The intake run (agent bundles D2 contract §2.2, D2-15, D2-21 to
D2-25): due workspaces only, claimed once; quiet threads wait; at most 25
a run, oldest first; off means not read; out of credits waits; one model
call per thread with the agent's purpose; failures retry three times; one
thread or workspace failing never stops the others."""

import json
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.utils import timezone

from services.accounts.models import Organisation
from services.agents import intake
from services.agents.models import AgentBundle, AgentProfile, SignalThread
from services.agents.policy import profiles_for
from services.agents.tests.bundle_fixtures import note
from services.agents.tests.drafts_fixtures import outbound
from services.agents.tests.intake_fixtures import QUIET_AGO, IntakeFixture
from services.copilot.anthropic_client import BudgetExceeded, CopilotRequestFailed
from services.customers.models import Ticket


class IntakeRunTests(IntakeFixture):
    def note(self, thread, title="Login loop after reset"):
        ctx, _ = self.thread_ctx(thread)
        line = (
            self.thread_line(ctx, "ticket ")
            if thread.source_kind != "mail"
            else self.thread_line(ctx, "email ")
        )
        return {
            "kind": "note.create",
            "record": ctx.thread_ref,
            "title": f"Log: {title}",
            "rationale": "Locked out.",
            "evidence": [line],
            "payload": {"title": title, "body": "Customer locked out."},
        }

    def reread(self, thread):
        return SignalThread.objects.get(pk=thread.pk)

    def test_a_due_workspace_makes_one_bundle_per_thread(self):
        _, thread = self.ticket_thread(self.pizza)
        result, model = self.run_intake(self.answer(self.note(thread)))
        self.assertEqual((result.threads, result.made), (1, 1))
        bundle = AgentBundle.objects.get(thread=thread)
        self.assertEqual(
            (bundle.source, bundle.routed_user_id, bundle.agent), ("thread", self.csm.pk, "cs")
        )
        self.assertEqual(model.call_args.kwargs["purpose"], "agent_cs")
        thread = self.reread(thread)
        self.assertEqual(
            (thread.status, thread.processed_through, thread.claimed_at),
            ("processed", thread.last_message_at, None),
        )
        self.assertIsNotNone(Organisation.objects.get(pk=self.org.pk).ai_signals_ran_at)

    def test_the_interval_lane_is_unmarked_and_audited_as_interval(self):
        from core.models import AuditEvent

        _, thread = self.ticket_thread(self.pizza)
        _, model = self.run_intake(self.answer(self.note(thread)))
        self.assertEqual(model.call_args.kwargs["scope_key"], "")
        event = AuditEvent.objects.get(action="agent_signals.run")
        self.assertEqual(event.metadata["lane"], "interval")
        self.assertNotIn("capped", event.metadata)

    def test_the_interval_with_its_grace(self):
        org = Organisation.objects.get(pk=self.org.pk)
        now = timezone.now()
        self.assertTrue(intake.due(org, now))
        org.ai_signals_ran_at = now - timedelta(minutes=57)
        self.assertFalse(intake.due(org, now))
        org.ai_signals_ran_at = now - timedelta(minutes=58)
        self.assertTrue(intake.due(org, now))
        org.ai_signal_interval, org.ai_signals_ran_at = "30m", now - timedelta(minutes=28)
        self.assertTrue(intake.due(org, now))

    def test_a_workspace_is_claimed_once(self):
        # Two overlapping runs read the same value; only the first takes it.
        first = Organisation.objects.get(pk=self.org.pk)
        second = Organisation.objects.get(pk=self.org.pk)
        now = timezone.now()
        self.assertTrue(intake.claim_workspace(first, now))
        self.assertFalse(intake.claim_workspace(second, now))

    def test_a_busy_thread_waits_for_quiet(self):
        _, thread = self.ticket_thread(self.pizza, ago=timedelta(minutes=5))
        result, model = self.run_intake()
        self.assertEqual(
            (result.threads, model.call_count, self.reread(thread).status), (0, 0, "waiting_quiet")
        )

    def test_at_most_25_a_run_oldest_first(self):
        connector = self.connector()
        made = [
            self.ticket_thread(
                self.pizza, connector=connector, number=f"ZD-{n}", ago=timedelta(minutes=100 - n)
            )[1]
            for n in range(27)
        ]
        result, _ = self.run_intake(self.answer())
        self.assertEqual(result.threads, 25)
        self.assertEqual(self.reread(made[26]).processed_through, None)
        self.assertIsNotNone(self.reread(made[0]).processed_through)

    def test_off_means_not_read(self):
        from services.agents import threads
        from services.customers.tests.slack_fixtures import conversation

        now = timezone.now()
        slack = threads.touch_conversation(
            conversation(self.pizza, self.connector("slack", "cs")), now, at=now - QUIET_AGO
        )
        Organisation.objects.filter(pk=self.org.pk).update(ai_signal_sources={"slack": False})
        result, model = self.run_intake()
        self.assertEqual((model.call_count, self.reread(slack).skip_reason), (0, "source_off"))
        _, other = self.ticket_thread(self.pizza, number="ZD-2")
        Organisation.objects.filter(pk=self.org.pk).update(
            ai_agent_enabled=False, ai_signals_ran_at=None
        )
        self.run_intake()
        self.assertEqual(self.reread(other).skip_reason, "ai_off")
        _, third = self.ticket_thread(self.pizza, number="ZD-3")
        Organisation.objects.filter(pk=self.org.pk).update(
            ai_agent_enabled=True, ai_signals_ran_at=None
        )
        AgentProfile.objects.filter(organisation=self.org, kind="cs").update(enabled=False)
        self.run_intake()
        self.assertEqual(self.reread(third).skip_reason, "agent_off")

    def test_answered_resolved_stale_and_unreadable_threads_cost_nothing(self):
        email, answered = self.mail_thread(self.pizza, self.csm)
        outbound(email, hours=0)
        _, resolved = self.ticket_thread(self.pizza, status=Ticket.Status.RESOLVED)
        # Carl's mail on Mona's Soup Co, which Carl can't open: nobody may read it.
        _, unreadable = self.mail_thread(self.soup, self.csm, thread="t7")
        _, stale = self.ticket_thread(self.pizza, number="ZD-8")
        SignalThread.objects.filter(pk=stale.pk).update(
            last_message_at=timezone.now() - timedelta(days=8)
        )
        result, model = self.run_intake()
        self.assertEqual(model.call_count, 0)
        reasons = {t: self.reread(t).skip_reason for t in (answered, resolved, unreadable, stale)}
        self.assertEqual(list(reasons.values()), ["answered", "resolved", "no_reader", "stale"])

    def test_the_gates_keep_their_order(self):
        # No reader beats a used-up budget; answered beats an agent that is off.
        # Carl's mail on Mona's Soup Co, which Carl can't open: nobody may read it.
        _, unreadable = self.mail_thread(self.soup, self.csm, thread="t7")
        email, answered = self.mail_thread(self.pizza, self.csm, thread="t8")
        outbound(email, hours=0)
        with patch("services.agents.policy.plan_credits", return_value=3000):
            profiles_for(self.org)
        AgentProfile.objects.filter(organisation=self.org, kind="cs").update(
            monthly_credits=0, enabled=False
        )
        AgentProfile.objects.filter(organisation=self.org, kind="sales").update(
            monthly_credits=0, enabled=False
        )
        self.run_intake()
        found = {t: self.reread(t) for t in (unreadable, answered)}
        self.assertEqual(
            [(t.status, t.skip_reason) for t in found.values()],
            [("skipped", "no_reader"), ("skipped", "answered")],
        )

    def test_out_of_credits_waits(self):
        _, thread = self.ticket_thread(self.pizza)
        with patch("services.agents.policy.plan_credits", return_value=3000):
            profiles_for(self.org)  # the profiles exist before their budget changes
        AgentProfile.objects.filter(organisation=self.org, kind="cs").update(monthly_credits=0)
        self.run_intake()
        thread = self.reread(thread)
        self.assertEqual(
            (thread.status, thread.skip_reason, thread.agent, thread.processed_through),
            ("waiting_credits", "budget", "cs", None),
        )
        AgentProfile.objects.filter(organisation=self.org, kind="cs").update(monthly_credits=600)
        Organisation.objects.filter(pk=self.org.pk).update(ai_signals_ran_at=None)
        self.run_intake(side_effect=BudgetExceeded())
        self.assertEqual(self.reread(thread).skip_reason, "credits")

    def test_a_failed_call_retries_three_times(self):
        _, thread = self.ticket_thread(self.pizza)
        for n in (1, 2):
            Organisation.objects.filter(pk=self.org.pk).update(ai_signals_ran_at=None)
            with self.assertLogs("services.agents.intake", "WARNING"):
                self.run_intake(side_effect=CopilotRequestFailed("down"))
            self.assertEqual(
                (self.reread(thread).failures, self.reread(thread).processed_through), (n, None)
            )
        Organisation.objects.filter(pk=self.org.pk).update(ai_signals_ran_at=None)
        with self.assertLogs("services.agents.intake", "WARNING"):
            self.run_intake(side_effect=CopilotRequestFailed("down"))
        self.assertEqual(
            (self.reread(thread).status, self.reread(thread).skip_reason), ("skipped", "failed")
        )

    def test_one_thread_failing_never_stops_the_next(self):
        _, first = self.ticket_thread(self.pizza, ago=timedelta(minutes=40))
        _, second = self.ticket_thread(self.pizza, number="ZD-2")
        real = intake.intake_bundles.place
        calls = []

        def place(*args, **kwargs):
            calls.append(1)
            if len(calls) == 1:
                raise RuntimeError("boom")
            return real(*args, **kwargs)

        with (
            patch("services.agents.intake.intake_bundles.place", side_effect=place),
            self.assertLogs("services.agents.intake", "WARNING"),
        ):
            result, _ = self.run_intake(self.answer(self.note(second)))
        self.assertEqual((result.failed, result.made), (1, 1))
        self.assertEqual(self.reread(first).failures, 1)

    def test_one_workspace_failing_never_stops_the_next(self):
        self.ticket_thread(self.pizza)
        with (
            patch("services.agents.intake.run_workspace", side_effect=[RuntimeError("boom")]),
            patch("services.agents.intake.get_completion"),
            self.assertLogs("services.agents.intake", "WARNING") as logs,
        ):
            result = intake.run_all()
        self.assertEqual(result.errors, [f"organisation {self.org.pk}"])
        self.assertIn("RuntimeError", logs.output[0])

    def test_an_edited_bundle_is_flagged_with_no_call(self):
        _, thread = self.ticket_thread(self.pizza)
        self.run_intake(self.answer(self.note(thread)))
        bundle = AgentBundle.objects.get(thread=thread)
        AgentBundle.objects.filter(pk=bundle.pk).update(edited_at=timezone.now())
        SignalThread.objects.filter(pk=thread.pk).update(
            last_message_at=timezone.now() - timedelta(minutes=20)
        )
        Organisation.objects.filter(pk=self.org.pk).update(ai_signals_ran_at=None)
        result, model = self.run_intake()
        bundle.refresh_from_db()
        self.assertEqual((model.call_count, result.flagged, bundle.has_newer_message), (0, 1, True))
        self.assertEqual(self.reread(thread).status, "processed")

    def test_a_message_during_the_call_leaves_the_thread_due(self):
        _, thread = self.ticket_thread(self.pizza)

        def answer_and_touch(**_kwargs):
            SignalThread.objects.filter(pk=thread.pk).update(last_message_at=timezone.now())
            return self.answer()

        self.run_intake(side_effect=answer_and_touch)
        thread = self.reread(thread)
        self.assertLess(thread.processed_through, thread.last_message_at)

    def test_the_command(self):
        self.ticket_thread(self.pizza)
        out = StringIO()
        with (
            patch("services.agents.policy.plan_credits", return_value=3000),
            patch(
                "services.agents.intake.get_completion",
                return_value=json.dumps({"title": "", "reason": "", "actions": []}),
            ),
        ):
            call_command("run_agent_signals", stdout=out)
        self.assertIn("read 1 thread(s): 0 new bundle(s)", out.getvalue())
        self.assertIn("failed (interval)", out.getvalue())
        self.assertIn("fast lane: read 0 thread(s) in 0 workspace(s), 0 capped", out.getvalue())


class IntakeNoticeTests(IntakeFixture):
    """The two Bundles waiting notices fail apart (final review I2, contract
    §6): a queue notice that fails never undoes the Mine notices."""

    def test_a_failed_queue_notice_keeps_the_mine_notices(self):
        from services.notifications.models import Notification

        _, thread = self.ticket_thread(self.pizza)
        bundle = self.message_bundle(thread, note())
        result = intake.IntakeResult(bundles=[bundle.pk])
        with (
            patch("services.work.proposal_notice.notify_queues", side_effect=RuntimeError("down")),
            self.assertLogs("services.agents.intake", level="WARNING"),
        ):
            intake._notify(self.org, result, today=self.today, now=timezone.now())
        self.assertTrue(
            Notification.objects.filter(kind="agent_proposal_waiting", recipient=self.csm).exists()
        )
