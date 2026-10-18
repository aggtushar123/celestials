"""Round 2 D3 R2D3-16 to R2D3-18, R2D3-20: the fast tick reads urgent
threads after 2 quiet minutes, through the same gates and waiting-bundle
rule, marks its calls, stops at the caps and leaves the interval alone."""

from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import CommandError, call_command
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.agents import intake
from services.agents.models import AgentBundle, SignalThread
from services.agents.tests.bundle_fixtures import note
from services.agents.tests.intake_fixtures import MODEL, IntakeFixture
from services.agents.tests.test_intake_queries import no_distinct
from services.copilot.models import ModelCall

#: Measured on this branch (Task 13): a due tick with nothing urgent, the cost every
#: 5 minutes; raise only with a reason in the commit.
FAST_TICK_QUERIES = 8


class FastTickTests(IntakeFixture):
    def setUp(self):
        self.org.ai_fast_lane = {"on": True, "per_hour": 2, "per_day": 3}
        self.org.save(update_fields=["ai_fast_lane"])
        self.jira = self.connector("jira", "cs")

    def urgent(self, minutes_ago=3, number="SUP-1"):
        _, thread = self.ticket_thread(self.pizza, connector=self.jira, number=number)
        SignalThread.objects.filter(pk=thread.pk).update(
            urgent_rule="jira_priority",
            last_message_at=timezone.now() - timedelta(minutes=minutes_ago),
        )
        return SignalThread.objects.get(pk=thread.pk)

    def note_answer(self, thread, title="Login loop after reset"):
        """The model's answer holding one note.create item, as test_intake_run builds it."""
        ctx, _ = self.thread_ctx(thread)
        return self.answer(
            {
                "kind": "note.create",
                "record": ctx.thread_ref,
                "title": f"Log: {title}",
                "rationale": "Locked out.",
                "evidence": [self.thread_line(ctx, "ticket ")],
                "payload": {"title": title, "body": "Customer locked out."},
            }
        )

    @staticmethod
    def note_item(_thread):
        """A waiting bundle's step: a (kind, payload) pair (intake_fixtures.message_bundle)."""
        return note()

    def run_fast(self, answer):
        with (
            patch(MODEL, return_value=answer) as model,
            patch("services.agents.policy.plan_credits", return_value=3000),
        ):
            result = intake.run_fast()
        return result, model

    def test_an_urgent_thread_is_read_after_two_quiet_minutes(self):
        thread = self.urgent()
        result, model = self.run_fast(self.note_answer(thread))
        self.assertEqual(result.threads, 1)
        self.assertEqual(model.call_args.kwargs["scope_key"], "fast_lane")
        self.assertTrue(AgentBundle.objects.filter(thread=thread).exists())
        self.assertIsNone(Organisation.objects.get(pk=self.org.pk).ai_signals_ran_at)
        event = AuditEvent.objects.get(action="agent_signals.run")
        self.assertEqual((event.metadata["lane"], event.metadata["capped"]), ("fast", False))

    def test_a_busy_or_quiet_thread_waits(self):
        self.urgent(minutes_ago=1)
        _, plain = self.ticket_thread(self.pizza, connector=self.jira, number="SUP-2")
        result, model = self.run_fast("{}")
        self.assertEqual((result.threads, model.call_count), (0, 0))
        self.assertIsNone(SignalThread.objects.get(pk=plain.pk).claimed_at)
        self.assertFalse(AuditEvent.objects.filter(action="agent_signals.run").exists())

    def assert_left_alone(self, thread):
        """Not claimed, not read, no audit row: the interval run has it."""
        result, model = self.run_fast("{}")
        self.assertEqual((result.threads, model.call_count), (0, 0))
        self.assertIsNone(SignalThread.objects.get(pk=thread.pk).claimed_at)
        self.assertFalse(AuditEvent.objects.filter(action="agent_signals.run").exists())

    def test_a_thread_waiting_on_credits_is_left_to_the_interval(self):
        thread = self.urgent()
        SignalThread.objects.filter(pk=thread.pk).update(status=SignalThread.Status.WAITING_CREDITS)
        self.assert_left_alone(thread)

    def test_a_thread_whose_read_failed_is_left_to_the_interval(self):
        thread = self.urgent()
        SignalThread.objects.filter(pk=thread.pk).update(failures=1)
        self.assert_left_alone(thread)

    def test_off_or_ai_off_reads_nothing(self):
        self.urgent()
        Organisation.objects.filter(pk=self.org.pk).update(ai_agent_enabled=False)
        self.assertEqual(self.run_fast("{}")[0].threads, 0)
        Organisation.objects.filter(pk=self.org.pk).update(
            ai_agent_enabled=True, ai_fast_lane={"on": False}
        )
        result, model = self.run_fast("{}")
        self.assertEqual((result.threads, result.workspaces, model.call_count), (0, 0, 0))

    def fast_calls(self, count, ago=timedelta(0)):
        for _ in range(count):
            call = ModelCall.objects.create(
                organisation=self.org, purpose="agent_cs", scope_key="fast_lane", outcome="ok"
            )
            ModelCall.objects.filter(pk=call.pk).update(created_at=timezone.now() - ago)

    def test_the_daily_cap_leaves_threads_for_the_interval(self):
        self.fast_calls(3, ago=timedelta(hours=2))
        self.urgent()
        result, model = self.run_fast("{}")
        self.assertEqual((result.threads, model.call_count, result.capped), (0, 0, 1))

    def test_a_cap_reached_mid_tick_is_recorded(self):
        self.fast_calls(1)
        first = self.urgent(minutes_ago=4)
        second = self.urgent(number="SUP-2")
        result, model = self.run_fast(self.note_answer(first))
        self.assertEqual((result.threads, model.call_count, result.capped), (1, 1, 1))
        self.assertIsNone(SignalThread.objects.get(pk=second.pk).processed_through)
        event = AuditEvent.objects.get(action="agent_signals.run")
        self.assertTrue(event.metadata["capped"])

    def test_the_hourly_cap_leaves_threads_for_the_interval(self):
        for _ in range(2):
            ModelCall.objects.create(
                organisation=self.org, purpose="agent_cs", scope_key="fast_lane", outcome="ok"
            )
        self.urgent()
        result, model = self.run_fast("{}")
        self.assertEqual((result.threads, model.call_count, result.capped), (0, 0, 1))
        event = AuditEvent.objects.get(action="agent_signals.run")
        self.assertTrue(event.metadata["capped"])

    def test_a_tick_is_claimed_once_per_five_minutes(self):
        self.urgent()
        self.run_fast("{}")
        self.urgent(number="SUP-9")
        self.assertEqual(self.run_fast("{}")[0].threads, 0)

    def test_an_edited_waiting_bundle_is_flagged_without_a_call(self):
        thread = self.urgent()
        bundle = self.message_bundle(thread, self.note_item(thread))
        AgentBundle.objects.filter(pk=bundle.pk).update(edited_at=timezone.now())
        result, model = self.run_fast("{}")
        self.assertEqual((result.flagged, model.call_count), (1, 0))

    def test_the_command_runs_the_lane_asked_for(self):
        thread = self.urgent()
        out = StringIO()
        with (
            patch(MODEL, return_value=self.note_answer(thread)),
            patch("services.agents.policy.plan_credits", return_value=3000),
        ):
            call_command("run_agent_signals", "--lane", "fast", stdout=out, stderr=StringIO())
        self.assertIn("fast lane: read 1 thread(s) in 1 workspace(s), 0 capped", out.getvalue())
        self.assertNotIn("(interval)", out.getvalue())
        self.assertIsNone(Organisation.objects.get(pk=self.org.pk).ai_signals_ran_at)

    def test_one_lane_crashing_never_stops_the_other(self):
        thread = self.urgent()
        out, err = StringIO(), StringIO()
        with (
            patch(MODEL, return_value=self.note_answer(thread)),
            patch("services.agents.policy.plan_credits", return_value=3000),
            patch.object(intake, "run_all", side_effect=RuntimeError("secret text")),
            self.assertRaises(CommandError),
        ):
            call_command("run_agent_signals", stdout=out, stderr=err)
        self.assertIn("fast lane: read 1 thread(s) in 1 workspace(s), 0 capped", out.getvalue())
        self.assertIn("interval run failed: RuntimeError", err.getvalue())
        self.assertNotIn("secret text", err.getvalue())


class FastTickQueryTests(IntakeFixture):
    """The tick every 5 minutes costs the same however many threads wait."""

    def tick(self, minutes):
        with (
            patch(MODEL, side_effect=AssertionError("no model")),
            CaptureQueriesContext(connection) as queries,
        ):
            result = intake.run_fast(now=timezone.now() + timedelta(minutes=minutes))
        self.assertEqual((result.workspaces, result.threads), (1, 0))
        no_distinct(self, queries)
        return len(queries)

    def test_a_tick_with_nothing_urgent_costs_the_same_whatever_waits(self):
        Organisation.objects.filter(pk=self.org.pk).update(ai_fast_lane={"on": True})
        jira = self.connector("jira", "cs")
        self.tick(10)  # warm: the first claim of the workspace's tick
        few = self.tick(20)
        for n in range(10):
            self.ticket_thread(self.pizza, connector=jira, number=f"SUP-{n}")
        many = self.tick(30)
        self.assertEqual(few, many)
        self.assertEqual(many, FAST_TICK_QUERIES)
