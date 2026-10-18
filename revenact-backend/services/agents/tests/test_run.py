"""One pass of one agent (spec §1.2, Decisions 4–9): skip reasons, one
model call, the drop rules, Auto versus Ask, re-proposal, budgets, and
isolation between agents and workspaces."""

import dataclasses
import json
from datetime import timedelta
from unittest.mock import patch

from django.db import connection
from django.utils import timezone

from services.accounts.models import Organisation
from services.agents import evidence, run
from services.agents.models import AgentPolicy, AgentProfile
from services.agents.policy import policy_for, profiles_for
from services.agents.registry import REGISTRY
from services.agents.tests.fixtures import AgentsFixture
from services.copilot.anthropic_client import CopilotRequestFailed
from services.customers.models import Customer
from services.metrics.models import AgentAction
from services.work.clock import today_for

PATH = "services.agents.run.get_completion"


def answer(*items):
    return json.dumps(list(items))


class RunTests(AgentsFixture):
    def setUp(self):
        with patch("services.agents.policy.plan_credits", return_value=3000):
            profiles_for(self.org)

    def org_now(self):
        return Organisation.objects.get(pk=self.org.pk)

    def lifecycle(self, record=None, stage="renewal", ref=None, cite=None):
        record = record or self.pizza
        return {
            "kind": "record.lifecycle",
            "record": ref or f"customer:{record.pk}",
            "title": f"Move {record.name} to {stage}",
            "rationale": "Renews soon.",
            "evidence": [cite or self.line(ref or f"customer:{record.pk}")],
            "payload": {"stage": stage},
        }

    def line(self, ref):
        """A real line of the record's own evidence, as the model reads it."""
        org = self.org_now()
        ctx = evidence.build(org, "cs", today=today_for(org))
        return next(x for x in sorted(evidence.record_lines(ctx, ref)) if x.startswith("- "))

    def pass_(self, *items, agent="cs"):
        with patch(PATH, return_value=answer(*items)) as call:
            result = run.run(self.org_now(), agent)
        return result, call

    def test_ask_creates_proposed_actions_with_their_basis(self):
        result, call = self.pass_(self.lifecycle())
        self.assertEqual((result.proposed, result.applied, result.dropped), (1, 0, 0))
        action = AgentAction.objects.get(kind="record.lifecycle")
        self.assertEqual(
            (action.status, action.agent, action.customer_id),
            ("proposed", "cs", self.pizza.pk),
        )
        self.assertEqual(action.before, self.pizza.lifecycle_stage)
        self.assertEqual(call.call_args.kwargs["purpose"], "agent_cs")
        profile = AgentProfile.objects.get(organisation=self.org, kind="cs")
        self.assertEqual(profile.last_run["proposed"], 1)

    def test_auto_applies_at_once(self):
        AgentPolicy.objects.filter(pk=policy_for(self.org).pk).update(
            levels={"cs": {"record.lifecycle": "auto"}}
        )
        result, _ = self.pass_(self.lifecycle())
        self.assertEqual(result.applied, 1)
        action = AgentAction.objects.get(kind="record.lifecycle")
        self.assertEqual((action.status, action.auto), ("applied", True))
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.lifecycle_stage, "renewal")

    def test_the_drop_rules(self):
        cite = self.line(f"customer:{self.pizza.pk}")
        result, _ = self.pass_(
            self.lifecycle(ref="customer:999999", cite=cite),  # not in the evidence
            self.lifecycle(record=self.deals, cite=cite),  # a Sales record: not in the CS book
            {**self.lifecycle(), "kind": "initiative.create"},  # not a CS kind
            self.lifecycle(stage="nonsense"),  # validate refuses
            self.lifecycle(),
            self.lifecycle(),  # a duplicate in the same answer
        )
        self.assertEqual((result.proposed, result.dropped), (1, 5))

    def test_evidence_must_be_the_actions_own_records(self):
        other = self.line(f"customer:{self.dough.pk}")
        stray = {**self.lifecycle(), "evidence": [other]}
        padded = {
            **self.lifecycle(),
            "evidence": ["  " + self.line(f"customer:{self.pizza.pk}") + "  "],
        }
        result, _ = self.pass_(stray, padded)
        self.assertEqual((result.proposed, result.dropped), (1, 1))
        self.assertEqual(
            AgentAction.objects.get().evidence, [self.line(f"customer:{self.pizza.pk}")]
        )

    def test_a_workspace_action_cites_the_workspace_figures_only(self):
        figures = "At risk ARR is 100 in Europe"
        payload = {"metric": "at_risk_arr", "dimension": "region", "member": "Europe"}
        spec = dataclasses.replace(REGISTRY["initiative.create"], validate=lambda *a: payload)

        def item(cited):
            return {
                "kind": "initiative.create",
                "record": None,
                "title": "Win-back",
                "rationale": "Churn.",
                "evidence": [cited],
                "payload": payload,
            }

        with (
            patch.dict(REGISTRY, {"initiative.create": spec}),
            patch("services.agents.evidence.figure_lines", return_value=[figures]),
        ):
            stray, _ = self.pass_(item(self.line(f"customer:{self.pizza.pk}")), agent="ops")
            fine, _ = self.pass_(item(figures), agent="ops")
        self.assertEqual((stray.proposed, stray.dropped), (0, 1))
        self.assertEqual((fine.proposed, fine.dropped), (1, 0))

    def test_an_action_without_evidence_is_dropped(self):
        result, _ = self.pass_({**self.lifecycle(), "evidence": ["  ", 7]})
        self.assertEqual((result.proposed, result.dropped), (0, 1))

    def test_auto_applies_run_in_their_own_savepoint(self):
        AgentPolicy.objects.filter(pk=policy_for(self.org).pk).update(
            levels={"cs": {"record.lifecycle": "auto"}}
        )
        depths = []
        real = run.apply_action

        def watching(*args, **kwargs):
            depths.append(len(connection.savepoint_ids))
            return real(*args, **kwargs)

        base = len(connection.savepoint_ids)
        with patch.object(run, "apply_action", side_effect=watching):
            self.pass_(self.lifecycle())
        self.assertEqual(len(depths), 1)
        self.assertGreater(depths[0], base)

    def test_one_failing_auto_apply_does_not_stop_the_others(self):
        AgentPolicy.objects.filter(pk=policy_for(self.org).pk).update(
            levels={"cs": {"record.lifecycle": "auto"}}
        )
        real = run.apply_action

        def flaky(action, *args, **kwargs):
            if action.customer_id == self.pizza.pk:
                raise RuntimeError("boom")
            return real(action, *args, **kwargs)

        with patch.object(run, "apply_action", side_effect=flaky):
            result, _ = self.pass_(self.lifecycle(), self.lifecycle(record=self.dough))
        self.assertEqual((result.applied, result.proposed), (1, 1))
        self.assertEqual(AgentAction.objects.get(customer=self.pizza).status, "proposed")

    def test_every_expiry_is_audited(self):
        from core.models import AuditEvent

        self.pass_(self.lifecycle())
        self.pass_(self.lifecycle(stage="expansion"))
        self.pass_()
        reasons = sorted(
            AuditEvent.objects.filter(action="agent_action.expired").values_list(
                "metadata__reason", flat=True
            )
        )
        self.assertEqual(reasons, ["not_reproposed", "replaced"])

    def test_never_kinds_are_neither_offered_nor_kept(self):
        AgentPolicy.objects.filter(pk=policy_for(self.org).pk).update(
            levels={"cs": {"record.lifecycle": "never"}}
        )
        result, call = self.pass_(self.lifecycle())
        self.assertEqual((result.proposed, result.dropped), (0, 1))
        self.assertNotIn("record.lifecycle", call.call_args.kwargs["system"].split("Rules:")[0])

    def test_reproposing_keeps_one_open_action_and_a_change_replaces_it(self):
        self.pass_(self.lifecycle())
        self.pass_(self.lifecycle())
        self.assertEqual(AgentAction.objects.filter(status="proposed").count(), 1)
        self.pass_(self.lifecycle(stage="expansion"))
        old, new = AgentAction.objects.order_by("id")
        self.assertEqual((old.status, old.expired_reason), ("expired", "replaced"))
        self.assertEqual((new.status, new.payload), ("proposed", {"stage": "expansion"}))

    def test_an_action_the_next_pass_drops_expires(self):
        self.pass_(self.lifecycle())
        self.pass_()
        action = AgentAction.objects.get()
        self.assertEqual((action.status, action.expired_reason), ("expired", "not_reproposed"))

    def test_a_rejected_action_is_not_reproposed_for_14_days(self):
        self.pass_(self.lifecycle())
        AgentAction.objects.update(status="rejected", decided_at=timezone.now())
        result, _ = self.pass_(self.lifecycle())
        self.assertEqual((result.proposed, result.dropped), (0, 1))

    def test_the_refusal_window_counts_from_the_decision(self):
        self.pass_(self.lifecycle())
        when = timezone.now()
        AgentAction.objects.update(
            status="rejected",
            decided_at=when - timedelta(days=2),
            created_at=when - timedelta(days=20),
        )
        result, _ = self.pass_(self.lifecycle())
        self.assertEqual((result.proposed, result.dropped), (0, 1))
        AgentAction.objects.update(decided_at=when - timedelta(days=15))
        result, _ = self.pass_(self.lifecycle())
        self.assertEqual((result.proposed, result.dropped), (1, 0))

    def test_an_undone_action_is_blocked_from_its_undo(self):
        self.pass_(self.lifecycle())
        when = timezone.now()
        AgentAction.objects.update(
            status="undone",
            undone_at=when - timedelta(days=1),
            created_at=when - timedelta(days=30),
        )
        result, _ = self.pass_(self.lifecycle())
        self.assertEqual((result.proposed, result.dropped), (0, 1))

    def task(self, due_in_days=7, title="Book the call", priority="medium"):
        return {
            "kind": "task.create",
            "record": f"customer:{self.pizza.pk}",
            "title": title,
            "rationale": "Renews soon.",
            "evidence": [self.line(f"customer:{self.pizza.pk}")],
            "payload": {"title": title, "due_in_days": due_in_days, "priority": priority},
        }

    def pass_on(self, days, *items):
        later = timezone.now() + timedelta(days=days)
        with patch(PATH, return_value=answer(*items)):
            return run.run(self.org_now(), "cs", now=later)

    def test_a_task_proposed_again_on_a_later_day_is_kept_not_replaced(self):
        self.pass_(self.task())
        first = AgentAction.objects.get()
        result = self.pass_on(1, self.task(due_in_days=7))
        self.assertEqual((result.proposed, result.dropped), (1, 0))
        first.refresh_from_db()
        self.assertEqual((AgentAction.objects.count(), first.status), (1, "proposed"))

    def test_a_changed_task_replaces_and_a_refused_one_stays_refused_next_day(self):
        self.pass_(self.task())
        self.pass_on(1, self.task(priority="high"))
        old, new = AgentAction.objects.order_by("id")
        self.assertEqual((old.status, old.expired_reason), ("expired", "replaced"))
        AgentAction.objects.filter(pk=new.pk).update(
            status="rejected", decided_at=timezone.now() - timedelta(days=1)
        )
        result = self.pass_on(1, self.task(due_in_days=5, priority="low"))
        self.assertEqual((result.proposed, result.dropped), (0, 1))

    def test_a_note_with_new_prose_is_the_same_note(self):
        note = {
            "kind": "note.create",
            "record": f"customer:{self.pizza.pk}",
            "title": "Invoicing worries",
            "rationale": "Two tickets.",
            "evidence": [self.line(f"customer:{self.pizza.pk}")],
            "payload": {"title": "Invoicing worries", "body": "Two urgent tickets."},
        }
        self.pass_(note)
        again = {**note, "payload": {**note["payload"], "body": "Two urgent tickets this week."}}
        result = self.pass_on(1, again)
        self.assertEqual(
            (result.proposed, AgentAction.objects.filter(status="proposed").count()), (1, 1)
        )

    def test_a_row_decided_before_the_expiry_stays_decided(self):
        self.pass_(self.lifecycle())
        real = run.locked

        def decided_first(pk):
            AgentAction.objects.filter(pk=pk).update(status="applied")
            return real(pk)

        with patch.object(run, "locked", side_effect=decided_first):
            self.pass_()
        self.assertEqual(AgentAction.objects.get().status, "applied")

    def test_a_concurrent_passs_fresh_proposal_is_not_expired(self):
        self.pass_(self.lifecycle())
        # Made after this pass began (a Run now beside the nightly pass).
        started = timezone.now() - timedelta(minutes=5)
        with patch(PATH, return_value=answer()):
            run.run(self.org_now(), "cs", now=started)
        self.assertEqual(AgentAction.objects.get().status, "proposed")

    def test_an_unexpected_failure_is_recorded_and_raised(self):
        with patch.object(run, "_consider", side_effect=RuntimeError("x")):
            with self.assertRaises(RuntimeError):
                self.pass_(self.lifecycle())
        profile = AgentProfile.objects.get(organisation=self.org, kind="cs")
        self.assertEqual(profile.last_run["skipped_reason"], "failed")

    def test_an_auto_action_stale_at_apply_expires_as_changed(self):
        AgentPolicy.objects.filter(pk=policy_for(self.org).pk).update(
            levels={"cs": {"record.lifecycle": "auto"}}
        )
        with patch.object(run, "stale_reason", side_effect=lambda *a: "changed"):
            result, _ = self.pass_(self.lifecycle())
        self.assertEqual(result.applied, 0)
        action = AgentAction.objects.get()
        self.assertEqual((action.status, action.expired_reason), ("expired", "changed"))

    def test_skip_reasons(self):
        Organisation.objects.filter(pk=self.org.pk).update(ai_agent_enabled=False)
        result, call = self.pass_(self.lifecycle())
        self.assertEqual(result.skipped_reason, "ai_off")
        call.assert_not_called()
        Organisation.objects.filter(pk=self.org.pk).update(ai_agent_enabled=True)

        AgentProfile.objects.filter(organisation=self.org, kind="cs").update(enabled=False)
        self.assertEqual(self.pass_()[0].skipped_reason, "disabled")
        AgentProfile.objects.filter(organisation=self.org, kind="cs").update(
            enabled=True, monthly_credits=0
        )
        self.assertEqual(self.pass_()[0].skipped_reason, "budget")

    def test_an_empty_book_still_expires_open_actions(self):
        self.pass_(self.lifecycle())
        empty = evidence.Context(
            organisation=self.org_now(), agent="cs", today=timezone.now().date()
        )
        with (
            patch.object(run.evidence_, "build", return_value=empty),
            patch(PATH) as call,
        ):
            result = run.run(self.org_now(), "cs")
        call.assert_not_called()
        self.assertTrue(result.empty)
        action = AgentAction.objects.get()
        self.assertEqual((action.status, action.expired_reason), ("expired", "not_reproposed"))

    def test_a_failed_call_is_reported_and_expires_nothing(self):
        self.pass_(self.lifecycle())
        with patch(PATH, side_effect=CopilotRequestFailed("down")):
            result = run.run(self.org_now(), "cs")
        self.assertEqual(result.skipped_reason, "failed")
        self.assertEqual(AgentAction.objects.get().status, "proposed")

    def test_run_all_keeps_going_when_one_agent_fails(self):
        real = run.run

        def flaky(organisation, agent, **kwargs):
            if agent == "cs":
                raise RuntimeError("Pizza Hut")
            return run.RunResult()

        with patch.object(run, "run", side_effect=flaky):
            result = run.run_all(self.org_now())
        self.assertIn(f"cs in organisation {self.org.pk}", result.failed)
        self.assertIs(run.run, real)

    def test_suspended_workspaces_are_skipped(self):
        Organisation.objects.filter(pk=self.org.pk).update(status=Organisation.Status.SUSPENDED)
        with patch.object(run, "run") as each:
            run.run_all()
        self.assertNotIn(self.org.pk, [c.args[0].pk for c in each.call_args_list])

    def test_an_account_action_stores_the_account(self):
        result, _ = self.pass_(self.lifecycle(record=self.emea, ref=f"account:{self.emea.pk}"))
        self.assertEqual(result.proposed, 1)
        action = AgentAction.objects.get()
        self.assertEqual((action.account_id, action.customer_id), (self.emea.pk, None))

    def test_records_gone_since_are_ignored(self):
        Customer.objects.filter(pk=self.dough.pk).update(is_archived=True)
        result, _ = self.pass_(
            self.lifecycle(record=self.dough, cite=self.line(f"customer:{self.pizza.pk}"))
        )
        self.assertEqual((result.proposed, result.dropped), (0, 1))


class NightlyCommandTests(AgentsFixture):
    def test_run_health_maintenance_runs_the_agents(self):
        from io import StringIO

        from django.core.management import call_command

        out = StringIO()
        with (
            patch(PATH, return_value="[]"),
            patch("services.agents.policy.plan_credits", return_value=3000),
        ):
            call_command("run_health_maintenance", stdout=out)
        text = out.getvalue()
        self.assertIn("agents proposed 0 action(s); applied 0", text)
        self.assertLess(text.index("agents proposed"), text.index("recommended"))


class EvidenceAndMentionTests(AgentsFixture):
    """Final review: evidence quotes are matched after normalising, an
    action naming something outside its own record is dropped, and a snooze
    and a redate of one task are twins."""

    setUp = RunTests.setUp
    org_now = RunTests.org_now
    lifecycle = RunTests.lifecycle
    line = RunTests.line
    pass_ = RunTests.pass_

    def test_a_fragment_of_an_own_line_is_kept_as_the_whole_line(self):
        ref = f"customer:{self.pizza.pk}"
        result, _ = self.pass_({**self.lifecycle(), "evidence": ["Pizza Hut, owner Carl CSM"]})
        self.assertEqual((result.proposed, result.dropped), (1, 0))
        self.assertEqual(AgentAction.objects.get().evidence, [self.line(ref)])

    def test_a_fragment_another_record_also_holds_is_dropped(self):
        shared = ', owner "Carl CSM", lifecycle'
        self.assertIn(shared, self.line(f"customer:{self.dough.pk}"))
        result, _ = self.pass_({**self.lifecycle(), "evidence": [shared]})
        self.assertEqual((result.proposed, result.dropped), (0, 1))

    def test_a_short_fragment_is_dropped(self):
        result, _ = self.pass_({**self.lifecycle(), "evidence": ["Pizza Hut"]})
        self.assertEqual((result.proposed, result.dropped), (0, 1))

    def test_an_unquoted_whole_line_matches(self):
        ref = f"customer:{self.pizza.pk}"
        bare = self.line(ref)[2:].replace('"', "").upper()
        result, _ = self.pass_({**self.lifecycle(), "evidence": [bare]})
        self.assertEqual((result.proposed, result.dropped), (1, 0))
        self.assertEqual(AgentAction.objects.get().evidence, [self.line(ref)])

    def test_naming_another_record_is_dropped(self):
        named = {**self.lifecycle(), "rationale": "Dough Co renewed at this stage too."}
        result, _ = self.pass_(named)
        self.assertEqual((result.proposed, result.dropped), (0, 1))

    def test_another_records_task_or_note_title_is_dropped(self):
        from services.customers.models import Note, Task

        Task.objects.create(
            customer=self.dough,
            title="Chase the signed contract",
            due_date=self.today + timedelta(days=3),
        )
        Note.objects.create(
            customer=self.dough, title="Legal review stalled", body="b", logged_at=self.today
        )
        by_task = {**self.lifecycle(), "rationale": "Like 'chase the signed contract'."}
        by_note = {**self.lifecycle(), "title": "Legal review stalled: move it"}
        result, _ = self.pass_(by_task, by_note)
        self.assertEqual((result.proposed, result.dropped), (0, 2))

    def engineer_on_pizza(self):
        """Someone who opens Pizza Hut (they answer for it in Engineering)
        but is outside Carl's chain, so Carl's own tasks and notes are not
        theirs to read."""
        from services.accounts.models import User
        from services.knowledge.models import FunctionOwner
        from services.segments.tests.fixtures import person

        eng = person("erin@acme.io", "Erin Engineer", self.org, function=User.Function.ENGINEERING)
        FunctionOwner.objects.create(
            customer=self.pizza, function=User.Function.ENGINEERING, user=eng
        )
        return eng

    def test_naming_an_own_task_a_record_reader_cannot_read_is_dropped(self):
        from services.customers.models import Task

        self.engineer_on_pizza()
        Task.objects.create(
            customer=self.pizza,
            title="Prepare the renewal deck",
            created_by=self.csm,
            assignee=self.csm,
            due_date=self.today + timedelta(days=3),
        )
        named = {**self.lifecycle(), "rationale": "Prepare the renewal deck first."}
        result, _ = self.pass_(named)
        self.assertEqual((result.proposed, result.dropped), (0, 1))

    def test_naming_an_own_note_a_record_reader_cannot_read_is_dropped(self):
        from services.customers.models import Note

        self.engineer_on_pizza()
        Note.objects.create(
            customer=self.pizza,
            title="Pricing pushback from finance",
            body="b",
            author=self.csm,
            logged_at=self.today,
        )
        named = {**self.lifecycle(), "title": "Pricing pushback from finance: move on"}
        result, _ = self.pass_(named)
        self.assertEqual((result.proposed, result.dropped), (0, 1))

    def test_naming_an_own_task_every_record_reader_can_read_is_kept(self):
        from services.customers.models import Task

        self.engineer_on_pizza()
        # Nobody's task (seeded): everyone who opens the record reads it.
        Task.objects.create(
            customer=self.pizza,
            title="Prepare the renewal deck",
            due_date=self.today + timedelta(days=3),
        )
        named = {**self.lifecycle(), "rationale": "Prepare the renewal deck first."}
        result, _ = self.pass_(named)
        self.assertEqual((result.proposed, result.dropped), (1, 0))

    def test_naming_an_own_chain_task_is_kept_when_only_the_chain_opens_it(self):
        from services.customers.models import Task

        Task.objects.create(
            customer=self.pizza,
            title="Prepare the renewal deck",
            created_by=self.csm,
            assignee=self.csm,
            due_date=self.today + timedelta(days=3),
        )
        named = {**self.lifecycle(), "rationale": "Prepare the renewal deck first."}
        result, _ = self.pass_(named)
        self.assertEqual((result.proposed, result.dropped), (1, 0))

    def test_a_short_name_inside_a_word_is_not_a_mention(self):
        Customer.objects.create(organisation=self.org, name="Art", owner=self.csm)
        kept = {**self.lifecycle(), "rationale": "Time to start the renewal."}
        result, _ = self.pass_(kept)
        self.assertEqual((result.proposed, result.dropped), (1, 0))

    def test_a_short_generic_title_on_another_record_does_not_drop(self):
        from services.customers.models import Task

        Task.objects.create(
            customer=self.dough, title="Call", due_date=self.today + timedelta(days=3)
        )
        kept = {**self.lifecycle(), "rationale": "Call them about the renewal."}
        result, _ = self.pass_(kept)
        self.assertEqual((result.proposed, result.dropped), (1, 0))

    def test_another_records_name_as_a_whole_word_still_drops(self):
        named = {**self.lifecycle(), "rationale": "Same as dough co, it renews soon."}
        result, _ = self.pass_(named)
        self.assertEqual((result.proposed, result.dropped), (0, 1))

    def test_an_initiative_may_name_a_record(self):
        figures = "At risk ARR is 100 in Europe"
        payload = {"metric": "at_risk_arr", "dimension": "region", "member": "Europe"}
        spec = dataclasses.replace(REGISTRY["initiative.create"], validate=lambda *a: payload)
        item = {
            "kind": "initiative.create",
            "record": None,
            "title": "Win-back",
            "rationale": "Pizza Hut and Dough Co drive it.",
            "evidence": [figures],
            "payload": payload,
        }
        with (
            patch.dict(REGISTRY, {"initiative.create": spec}),
            patch("services.agents.evidence.figure_lines", return_value=[figures]),
        ):
            result, _ = self.pass_(item, agent="ops")
        self.assertEqual((result.proposed, result.dropped), (1, 0))

    def test_a_snooze_replaces_an_open_redate_of_the_same_task(self):
        from services.customers.models import Task

        task = Task.objects.create(
            customer=self.pizza, title="Send the deck", due_date=self.today + timedelta(days=2)
        )
        ref = f"customer:{self.pizza.pk}"
        cite = next(x for x in evidence_lines(self, ref) if x.startswith("task "))
        common = {"record": ref, "title": "Move it", "rationale": "Busy.", "evidence": [cite]}
        later = (self.today + timedelta(days=9)).isoformat()
        redate = {
            **common,
            "kind": "task.redate",
            "payload": {"task_id": task.pk, "due_date": later},
        }
        snooze = {
            **common,
            "kind": "task.snooze",
            "payload": {"task_id": task.pk, "until": later, "reason": "Waiting on legal"},
        }
        self.pass_(redate)
        result, _ = self.pass_(snooze)
        self.assertEqual(result.proposed, 1)
        old, new = AgentAction.objects.order_by("id")
        self.assertEqual(
            (old.kind, old.status, old.expired_reason), ("task.redate", "expired", "replaced")
        )
        self.assertEqual((new.kind, new.status), ("task.snooze", "proposed"))


def evidence_lines(case, ref):
    org = case.org_now()
    ctx = evidence.build(org, "cs", today=today_for(org))
    return sorted(evidence.record_lines(ctx, ref))
