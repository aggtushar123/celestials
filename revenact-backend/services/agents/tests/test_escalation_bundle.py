"""Slack escalations D4, SE4-2 to SE4-5, SE4-22 to SE4-25 (spec §5.1 to
§5.5): a colleague's Slack thread the agent calls an escalation becomes one
bundle: the issue, its assignment and a to-do for the person the thread gave
it to (else whoever handles the department), then the reply, last; the
thread's members who wrote in it are its participants. Other answers are
placed as before. The model is a fake."""

import json

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.accounts.models import User
from services.agents.models import AgentBundle, AgentPolicy, BundleParticipant
from services.agents.tests.outside_fixtures import OutsideFixture
from services.customers.models import SlackConversation
from services.knowledge.models import FunctionHead, FunctionOwner
from services.metrics.models import AgentAction
from services.segments.tests.fixtures import person

TEMPLATE = (
    "Thanks Faiz. Logged as {{step 1.ticket_key}} ({{step 1.ticket_url}})"
    " with Erin Eng (Engineering)."
)
#: Contract §6 ESCALATION_RUN_QUERIES (CC-7), measured: a Slack thread's note
#: (37) + `handler_for`'s account-team read (1) + three more steps' savepoint,
#: twin, refused, lock, insert and release (18) + the to-do's record-open check
#: (5; its member is the one handler_for loaded) + the stored reply's read and
#: the escalation's store (2).
#: Slack escalations D3 on D4 (measured, +1): the thread's channel row's shared
#: flag (SE4-7, SC3-12), read once by the evidence while the conversation's is off.
ESCALATION_RUN_QUERIES = 64
#: The same with a decision: no `handler_for` read (-1), the decision's two
#: members (+2, the to-do's member then cached: -1), the participants' insert (+1).
#: +1 as above (the channel row's shared flag).
DECISION_RUN_QUERIES = 66


class EscalationBundleTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.board = self.jira_connector(department="cs")
        self.support = self.slack_connector()
        self.conversation, self.thread = self.slack_thread(self.pizza, self.support)
        self.jesh = person(
            "jesh@acme.io", "Jesh Sanghvi", self.org, function=User.Function.ENGINEERING
        )

    def discuss(self):
        """Carl starts the thread; Jesh asks Faiz (a Slack mention) to take it."""
        self.faiz = person("faiz@acme.io", "Faiz Jamal", self.org)
        SlackConversation.objects.filter(pk=self.conversation.pk).update(
            started_by_name="Carl Lee",
            messages=[
                {
                    "ts": "1760339999.000100",
                    "user_id": "U0CARL",
                    "name": "Carl Lee",
                    "text": "Pizza Hut CSV exports fail",
                    "bot": False,
                },
                {
                    "ts": "1760340099.000100",
                    "user_id": "U0JESH",
                    "name": "Jesh Sanghvi",
                    "text": "<@U0FAIZ> can you take this?",
                    "bot": False,
                },
            ],
            people={
                "U0CARL": {"name": "Carl Lee", "member": self.csm.pk},
                "U0JESH": {"name": "Jesh Sanghvi", "member": self.jesh.pk},
                "U0FAIZ": {"name": "Faiz Jamal", "member": self.faiz.pk},
            },
        )
        self.thread.refresh_from_db()

    def answer(
        self,
        *,
        function="engineering",
        issue=True,
        extra=(),
        reply=None,
        priority="high",
        decision=None,
        summary="CSV exports fail",
    ):
        ctx, _ = self.thread_ctx(self.thread)
        line = self.thread_line(ctx, "message ")
        ref = ctx.thread_ref
        items = []
        if issue:
            items.append(
                {
                    "kind": "jira.create",
                    "record": ref,
                    "title": "Log the export failure",
                    "rationale": "Exports fail for everyone.",
                    "evidence": [line],
                    "payload": {
                        "summary": summary,
                        "description": "Every CSV export fails since 9am.",
                        "priority": priority,
                        "assignee_id": self.erin.pk,
                    },
                }
            )
        items += [{**item, "record": ref, "evidence": [line]} for item in extra]
        if reply is not None:
            items.append(
                {
                    "kind": "slack.reply",
                    "record": ref,
                    "title": "Answer Faiz",
                    "rationale": "He asked.",
                    "evidence": [line],
                    "payload": {"text": reply},
                }
            )
        return json.dumps(
            {
                "title": "Pizza Hut: CSV exports fail",
                "reason": "Exports fail.",
                "function": function,
                "decision": decision,
                "actions": items,
            }
        )

    def place(self, raw):
        """`raw` placed for the thread as the run places it; its Placed (`result.dropped`)."""
        from django.utils import timezone

        from services.agents import intake_bundles, prompt
        from services.agents.policy import policy_for

        ctx, route = self.thread_ctx(self.thread)
        return intake_bundles.place(
            self.org,
            self.thread,
            route,
            "cs",
            prompt.parse_thread(raw),
            ctx,
            policy_for(self.org),
            timezone.now(),
        )

    def steps(self):
        return list(AgentAction.objects.filter(bundle__thread=self.thread).order_by("position"))

    def test_the_four_steps_in_run_order_for_the_account_team_s_engineer(self):
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.erin)
        result, _ = self.run_intake(self.answer())
        self.assertEqual(result.made, 1)
        steps = self.steps()
        self.assertEqual(
            [s.kind for s in steps], ["jira.create", "jira.assign", "task.create", "slack.reply"]
        )
        create, assign, todo, reply = (s.payload for s in steps)
        self.assertIsNone(create["assignee_member_id"])
        self.assertEqual(create["conversation_id"], self.conversation.pk)
        self.assertEqual(
            (assign["issue"], assign["assignee_member_id"], assign["if_found"]),
            ("{{step 1.ticket_key}}", self.erin.pk, True),
        )
        self.assertEqual(
            (todo["title"], todo["assignee_id"], todo["priority"]),
            ("Pizza Hut: CSV exports fail", self.erin.pk, "high"),
        )
        self.assertEqual(
            (reply["text"], reply["escalation"], reply["external_shared"]), (TEMPLATE, True, False)
        )
        self.assertEqual(steps[3].title, "Reply to Faiz in Slack")
        self.assertEqual(
            AgentBundle.objects.get(thread=self.thread).escalation,
            {
                "function": "engineering",
                "user_id": self.erin.pk,
                "via": "team",
                "issue": 1,
                "shared": False,
                "first": "Faiz",
                "decision": None,
                "reply": TEMPLATE,
            },
        )
        # No decision: nobody but the existing deciders (SE4-25 rows only with a thread's people).
        self.assertFalse(BundleParticipant.objects.exists())

    def test_the_thread_s_decision_names_the_person(self):
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.erin)
        self.discuss()
        said = {"message": 2, "quote": "<@U0FAIZ> can you take this?", "assignee": "<@U0FAIZ>"}
        result, _ = self.run_intake(self.answer(decision=said))
        self.assertEqual(result.made, 1)
        create, assign, todo, reply = (s.payload for s in self.steps())
        self.assertEqual(assign["assignee_member_id"], self.faiz.pk)
        # Faiz can't open Pizza Hut: the to-do goes to its owner (SE4-4).
        self.assertIsNone(todo["assignee_id"])
        self.assertEqual(
            reply["text"],
            "Thanks Carl. Logged as {{step 1.ticket_key}} ({{step 1.ticket_url}})"
            " with Faiz Jamal (Customer Success).",
        )
        self.assertEqual(self.steps()[1].rationale, "The thread gave it to Faiz Jamal.")
        bundle = AgentBundle.objects.get(thread=self.thread)
        self.assertEqual(
            (bundle.escalation["via"], bundle.escalation["user_id"], bundle.escalation["decision"]),
            (
                "thread",
                self.faiz.pk,
                {
                    "by": "Jesh Sanghvi",
                    "by_id": self.jesh.pk,
                    "quote": "@Faiz Jamal can you take this?",
                    "named": "Faiz Jamal",
                    "ts": "1760340099.000100",
                },
            ),
        )
        self.assertEqual(
            sorted(bundle.participants.values_list("user_id", flat=True)),
            sorted([self.csm.pk, self.jesh.pk]),
        )

    def test_a_decision_naming_no_member_waits_for_a_choice(self):
        self.discuss()
        said = {"message": 2, "quote": "<@U0FAIZ> can you take this?", "assignee": "Faiz Khan"}
        self.run_intake(self.answer(decision=said))
        _, assign, todo, _ = (s.payload for s in self.steps())
        self.assertIsNone(assign["assignee_member_id"])
        bundle = AgentBundle.objects.get(thread=self.thread)
        self.assertEqual(
            (bundle.escalation["via"], bundle.escalation["decision"]["named"]),
            ("unresolved", "Faiz Khan"),
        )

    def test_a_bare_mention_falls_back_to_the_account_team(self):
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.erin)
        self.discuss()
        SlackConversation.objects.filter(pk=self.conversation.pk).update(
            messages=[
                *SlackConversation.objects.get(pk=self.conversation.pk).messages[:1],
                {
                    "ts": "1760340099.000100",
                    "user_id": "U0JESH",
                    "name": "Jesh Sanghvi",
                    "text": "cc <@U0FAIZ>",
                    "bot": False,
                },
            ]
        )
        self.thread.refresh_from_db()
        said = {"message": 2, "quote": "cc <@U0FAIZ>", "assignee": "<@U0FAIZ>"}
        self.run_intake(self.answer(decision=said))
        bundle = AgentBundle.objects.get(thread=self.thread)
        self.assertEqual(
            (bundle.escalation["via"], bundle.escalation["user_id"], bundle.escalation["decision"]),
            ("team", self.erin.pk, None),
        )

    def test_a_decision_alone_makes_an_escalation(self):
        self.discuss()
        said = {"message": 2, "quote": "<@U0FAIZ> can you take this?", "assignee": "<@U0FAIZ>"}
        extra = [
            {
                "kind": "note.create",
                "title": "Log it",
                "rationale": "x",
                "payload": {"title": "Exports", "body": "All fail."},
            }
        ]
        self.run_intake(self.answer(function=None, issue=False, extra=extra, decision=said))
        steps = self.steps()
        self.assertEqual([s.kind for s in steps], ["note.create", "slack.reply"])
        self.assertEqual(
            steps[1].payload["text"], "Thanks Carl. Faiz Jamal (Customer Success) has this."
        )

    def test_the_head_takes_it_when_the_team_has_nobody(self):
        FunctionHead(organisation=self.org, function="engineering", user=self.jesh).save()
        self.run_intake(self.answer())
        _, assign, todo, reply = (s.payload for s in self.steps())
        self.assertEqual(assign["assignee_member_id"], self.jesh.pk)
        # Jesh can't open Pizza Hut: the to-do goes to its owner (SE4-4).
        self.assertIsNone(todo["assignee_id"])
        self.assertIn("with Jesh Sanghvi (Engineering).", reply["text"])
        self.assertEqual(AgentBundle.objects.get(thread=self.thread).escalation["via"], "head")

    def test_nobody_handles_it(self):
        self.run_intake(self.answer(function=None))
        _, assign, todo, reply = (s.payload for s in self.steps())
        self.assertIsNone(assign["assignee_member_id"])
        self.assertIsNone(todo["assignee_id"])
        self.assertEqual(
            reply["text"], "Thanks Faiz. Logged as {{step 1.ticket_key}} ({{step 1.ticket_url}})."
        )
        self.assertEqual(AgentBundle.objects.get(thread=self.thread).escalation["via"], "nobody")

    def test_a_shared_channel_s_reply_names_no_issue(self):
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.erin)
        SlackConversation.objects.filter(pk=self.conversation.pk).update(external_shared=True)
        self.thread.refresh_from_db()
        self.run_intake(self.answer())
        reply = self.steps()[-1].payload
        self.assertEqual(
            (reply["text"], reply["external_shared"]),
            ("Thanks Faiz. We've logged this with Erin Eng (Engineering).", True),
        )

    def test_the_model_s_reply_is_kept_when_it_carries_the_key(self):
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.erin)
        self.run_intake(self.answer(reply="Thanks Faiz, it is {{step 1.ticket_key}}; Erin has it."))
        steps = self.steps()
        self.assertEqual(
            steps[-1].payload["text"], "Thanks Faiz, it is {{step 1.ticket_key}}; Erin has it."
        )
        self.assertEqual(AgentBundle.objects.get(thread=self.thread).escalation["reply"], "")

    def test_the_model_s_reply_without_the_key_becomes_the_template(self):
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.erin)
        self.run_intake(self.answer(reply="Thanks Faiz, we're on it."))
        self.assertEqual(self.steps()[-1].payload["text"], TEMPLATE)

    def test_the_model_never_names_a_person(self):
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.erin)
        theirs = [
            {
                "kind": "jira.assign",
                "title": "Give it to Jesh",
                "rationale": "x",
                "payload": {"issue": "{{step 1.ticket_key}}", "assignee_id": self.jesh.pk},
            },
            {
                "kind": "task.create",
                "title": "Jesh fixes it",
                "rationale": "x",
                "payload": {"title": "Fix", "assignee_id": self.jesh.pk},
            },
        ]
        placed = self.place(self.answer(extra=theirs))
        self.assertEqual(
            [s.kind for s in self.steps()],
            ["jira.create", "jira.assign", "task.create", "slack.reply"],
        )
        self.assertEqual(self.steps()[1].payload["assignee_member_id"], self.erin.pk)
        self.assertEqual(placed.result.dropped, 2)

    def test_other_steps_sit_before_the_reply(self):
        extra = [
            {
                "kind": "note.create",
                "title": "Log it",
                "rationale": "x",
                "payload": {"title": "Exports", "body": "All fail."},
            }
        ]
        self.run_intake(self.answer(extra=extra))
        self.assertEqual(
            [s.kind for s in self.steps()],
            ["jira.create", "jira.assign", "task.create", "note.create", "slack.reply"],
        )

    def test_a_department_without_an_issue_gets_only_the_reply(self):
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.erin)
        extra = [
            {
                "kind": "note.create",
                "title": "Log it",
                "rationale": "x",
                "payload": {"title": "Exports", "body": "All fail."},
            }
        ]
        self.run_intake(self.answer(issue=False, extra=extra))
        steps = self.steps()
        self.assertEqual([s.kind for s in steps], ["note.create", "slack.reply"])
        self.assertEqual(steps[1].payload["text"], "Thanks Faiz. Erin Eng (Engineering) has this.")

    def test_small_talk_makes_no_bundle(self):
        self.run_intake(
            json.dumps(
                {
                    "title": "Pizza Hut: thanks",
                    "reason": "Nothing.",
                    "function": None,
                    "actions": [],
                }
            )
        )
        self.assertFalse(AgentBundle.objects.filter(thread=self.thread).exists())

    def test_a_reply_only_answer_with_no_department_is_as_before(self):
        self.discuss()
        ctx, _ = self.thread_ctx(self.thread)
        line = self.thread_line(ctx, "message ")
        item = {
            "kind": "slack.reply",
            "record": ctx.thread_ref,
            "title": "Answer",
            "rationale": "x",
            "evidence": [line],
            "payload": {"text": "Thanks, looking."},
        }
        self.run_intake(self.answer_of(item))
        [step] = self.steps()
        self.assertEqual(step.payload["text"], "Thanks, looking.")
        self.assertNotIn("escalation", step.payload)
        self.assertEqual(AgentBundle.objects.get(thread=self.thread).escalation, {})
        # CC-1 (spec §5.6): only an escalation bundle has participants.
        self.assertFalse(BundleParticipant.objects.exists())

    def answer_of(self, *items):
        return json.dumps(
            {"title": "Pizza Hut: question", "reason": "Asked.", "actions": list(items)}
        )

    def test_a_kind_on_never_is_left_out(self):
        # An outside kind is always Ask (policy.level): the to-do is the step a policy drops.
        AgentPolicy.objects.update_or_create(
            organisation=self.org, defaults={"levels": {"cs": {"task.create": "never"}}}
        )
        self.run_intake(self.answer())
        self.assertEqual(
            [s.kind for s in self.steps()], ["jira.create", "jira.assign", "slack.reply"]
        )

    def count_run(self, raw):
        """The queries one intake pass of this thread sends, answered with `raw`."""
        from unittest.mock import patch

        from services.accounts.models import Organisation
        from services.agents import intake
        from services.agents.policy import policy_for, profiles_for
        from services.work.clock import today_for

        org = Organisation.objects.get(pk=self.org.pk)
        with patch("services.agents.policy.plan_credits", return_value=3000):
            profiles, prefs = profiles_for(org), policy_for(org)
            with (
                patch("services.agents.intake.get_completion", return_value=raw),
                CaptureQueriesContext(connection) as queries,
            ):
                intake.process(
                    org,
                    self.thread,
                    now=self.thread.last_message_at + intake.QUIET,
                    today=today_for(org),
                    prefs=prefs,
                    profiles=profiles,
                    result=intake.IntakeResult(),
                )
        for query in queries.captured_queries:
            self.assertNotIn("DISTINCT", query["sql"].upper())
        return len(queries)

    def test_one_thread_s_run_costs_a_fixed_number_of_queries(self):
        """Contract §6 ESCALATION_RUN_QUERIES: measured, then pinned."""
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.erin)
        self.assertEqual(self.count_run(self.answer()), ESCALATION_RUN_QUERIES)

    def test_a_decided_thread_s_run_costs_a_fixed_number_of_queries(self):
        """Contract §6: a decision reads its members and stores the
        participants, never handler_for."""
        self.discuss()
        said = {"message": 2, "quote": "<@U0FAIZ> can you take this?", "assignee": "<@U0FAIZ>"}
        self.assertEqual(self.count_run(self.answer(decision=said)), DECISION_RUN_QUERIES)

    def test_the_model_s_other_steps_keep_pointing_at_the_issue(self):
        """F13: the model numbered its steps in its own order; in run order a
        kept step's `{{step N.ticket_key}}` of the issue follows the issue's
        new step, and a step naming any other of the model's steps is dropped."""
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.erin)
        ctx, _ = self.thread_ctx(self.thread)
        line = self.thread_line(ctx, "message ")
        ref = ctx.thread_ref

        def item(kind, payload):
            return {
                "kind": kind,
                "record": ref,
                "title": f"A {kind}",
                "rationale": "x",
                "evidence": [line],
                "payload": payload,
            }

        raw = json.dumps(
            {
                "title": "Pizza Hut: CSV exports fail",
                "reason": "Exports fail.",
                "function": "engineering",
                "actions": [
                    item("note.create", {"title": "Exports", "body": "All fail."}),
                    item(
                        "jira.create",
                        {"summary": "CSV exports fail", "description": "All fail."},
                    ),
                    item(
                        "jira.comment",
                        {"issue": "{{step 2.ticket_key}}", "body": "Customers are waiting."},
                    ),
                    item(
                        "jira.comment",
                        {"issue": "{{step 1.ticket_key}}", "body": "Names the note."},
                    ),
                ],
            }
        )
        placed = self.place(raw)
        steps = self.steps()
        self.assertEqual(
            [s.kind for s in steps],
            [
                "jira.create",
                "jira.assign",
                "task.create",
                "note.create",
                "jira.comment",
                "slack.reply",
            ],
        )
        self.assertEqual(
            (steps[4].payload["issue"], steps[4].payload["body"]),
            ("{{step 1.ticket_key}}", "Customers are waiting."),
        )
        self.assertEqual(placed.result.dropped, 1)

    def test_two_threads_on_one_record_each_keep_their_assignment(self):
        """F4: one open twin per target never folds one thread's assignment into another's."""
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.erin)
        # Started the same minute: both threads' first lines read alike.
        second, other = self.slack_thread(self.pizza, self.support, ts="1760339950.000100")
        ctx, _ = self.thread_ctx(self.thread)
        line = self.thread_line(ctx, "message ")

        def answer(summary):
            return json.dumps(
                {
                    "title": f"Pizza Hut: {summary}",
                    "reason": "Broken.",
                    "function": "engineering",
                    "actions": [
                        {
                            "kind": "jira.create",
                            "record": ctx.thread_ref,
                            "title": "Log it",
                            "rationale": "x",
                            "evidence": [line],
                            "payload": {"summary": summary, "priority": "high"},
                        }
                    ],
                }
            )

        result, _ = self.run_intake(
            side_effect=[answer("CSV exports fail"), answer("PDF exports fail")]
        )
        self.assertEqual(result.made, 2)
        for thread, conversation in ((self.thread, self.conversation), (other, second)):
            steps = list(AgentAction.objects.filter(bundle__thread=thread).order_by("position"))
            self.assertEqual(
                [s.kind for s in steps],
                ["jira.create", "jira.assign", "task.create", "slack.reply"],
            )
            self.assertEqual(
                (steps[1].payload["assignee_member_id"], steps[1].payload["conversation_id"]),
                (self.erin.pk, conversation.pk),
            )
            self.assertEqual(
                steps[1].target, f"jira:assign:{{{{step 1.ticket_key}}}}:c{conversation.pk}"
            )

    def test_the_to_do_title_names_the_record_once(self):
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.erin)
        self.run_intake(self.answer(summary="pizza hut: CSV exports fail"))
        todo = AgentAction.objects.get(bundle__thread=self.thread, kind="task.create")
        self.assertEqual(todo.payload["title"], "pizza hut: CSV exports fail")

    def test_the_thread_lines_name_the_people_mentioned(self):
        self.discuss()
        ctx, _ = self.thread_ctx(self.thread)
        self.assertIn("@Faiz Jamal can you take this?", ctx.thread_lines[1])

    def test_a_refresh_replaces_the_participants(self):
        """F19, CC-2: a refresh rewrites the waiting bundle in place, its
        participants those of the thread as it is now; F18: a refresh that is
        no escalation leaves none."""
        from django.utils import timezone

        from services.agents import intake_bundles, prompt
        from services.agents.policy import policy_for

        self.discuss()
        said = {"message": 2, "quote": "<@U0FAIZ> can you take this?", "assignee": "<@U0FAIZ>"}
        self.run_intake(self.answer(decision=said))
        bundle = AgentBundle.objects.get(thread=self.thread)
        conversation = SlackConversation.objects.get(pk=self.conversation.pk)
        SlackConversation.objects.filter(pk=conversation.pk).update(
            messages=[
                *conversation.messages,
                {
                    "ts": "1760340199.000100",
                    "user_id": "U0FAIZ",
                    "name": "Faiz Jamal",
                    "text": "On it.",
                    "bot": False,
                },
            ]
        )
        self.thread.refresh_from_db()

        def refresh(text, decision):
            ctx, route = self.thread_ctx(self.thread)
            line = self.thread_line(ctx, "message ")
            items = json.loads(self.answer(decision=decision))["actions"] if decision else []
            items.append(
                {
                    "kind": "slack.reply",
                    "record": ctx.thread_ref,
                    "title": "Answer",
                    "rationale": "x",
                    "evidence": [line],
                    "payload": {"text": text},
                }
            )
            answer = prompt.ThreadAnswer(
                title="Pizza Hut: exports",
                reason="Exports fail.",
                items=items,
                function="engineering" if decision else None,
                decision=decision,
            )
            current = AgentBundle.objects.get(pk=bundle.pk)
            return intake_bundles.place(
                self.org,
                self.thread,
                route,
                "cs",
                answer,
                ctx,
                policy_for(self.org),
                timezone.now(),
                into=current,
            )

        placed = refresh("Thanks Carl, {{step 1.ticket_key}} it is.", said)
        self.assertEqual(placed.bundle.pk, bundle.pk)
        self.assertEqual(
            sorted(bundle.participants.values_list("user_id", flat=True)),
            sorted([self.csm.pk, self.jesh.pk, self.faiz.pk]),
        )
        placed = refresh("Thanks, looking.", None)
        self.assertEqual(placed.bundle.pk, bundle.pk)
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).escalation, {})
        self.assertFalse(bundle.participants.exists())

    # Fix round 1: a person's Refresh of an escalation bundle they edited or Changed.

    def refresh(self, raw):
        """A person's Refresh of the thread's bundle, answered with `raw`
        (as intake.refresh places it)."""
        from django.utils import timezone

        from services.agents import intake_bundles, prompt
        from services.agents.policy import policy_for

        bundle = AgentBundle.objects.get(thread=self.thread)
        keep = intake_bundles.keep_set(list(bundle.steps.order_by("position")))
        ctx, route = self.thread_ctx(self.thread)
        return intake_bundles.place(
            self.org,
            self.thread,
            route,
            "cs",
            prompt.parse_thread(raw),
            ctx,
            policy_for(self.org),
            timezone.now(),
            into=bundle,
            keep=keep,
            expect=bundle.updated_at,
            by=self.csm,
        )

    def edit(self, kind, **payload):
        from django.utils import timezone

        step = AgentAction.objects.get(bundle__thread=self.thread, kind=kind)
        AgentAction.objects.filter(pk=step.pk).update(
            payload={**step.payload, **payload}, edited_at=timezone.now()
        )

    def note(self, title):
        return {
            "kind": "note.create",
            "title": f"Log {title}",
            "rationale": "x",
            "payload": {"title": title, "body": "All fail."},
        }

    def test_a_refresh_keeps_the_edited_issue_as_the_escalation_s_issue(self):
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.erin)
        self.run_intake(self.answer())
        self.edit("jira.create", summary="Exports are broken")
        self.refresh(self.answer())
        steps = self.steps()
        self.assertEqual(
            [s.kind for s in steps], ["jira.create", "jira.assign", "task.create", "slack.reply"]
        )
        create, assign, todo, reply = (s.payload for s in steps)
        self.assertEqual(create["summary"], "Exports are broken")
        self.assertEqual(
            (assign["issue"], assign["assignee_member_id"]), ("{{step 1.ticket_key}}", self.erin.pk)
        )
        self.assertEqual(todo["title"], "Pizza Hut: Exports are broken")
        self.assertEqual(reply["text"], TEMPLATE)
        self.assertEqual(AgentBundle.objects.get(thread=self.thread).escalation["issue"], 1)

    def assert_one_issue(self):
        """Exactly one jira.create; the assignment, the reply and the
        escalation's issue all point at it."""
        steps = self.steps()
        creates = [s.position for s in steps if s.kind == "jira.create"]
        self.assertEqual(len(creates), 1, [(s.kind, s.payload) for s in steps])
        key = f"{{{{step {creates[0]}.ticket_key}}}}"
        assign = next(s for s in steps if s.kind == "jira.assign")
        reply = next(s for s in steps if s.kind == "slack.reply")
        self.assertEqual(assign.payload["issue"], key)
        self.assertIn(key, reply.payload["text"])
        stored = AgentBundle.objects.get(thread=self.thread).escalation
        self.assertEqual(stored["issue"], creates[0])

    def test_a_refresh_with_a_reworded_issue_keeps_one_issue_after_the_reply_is_edited(self):
        """I-1: the edited reply keeps the create it names; the model's
        reworded issue is not a second create."""
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.erin)
        self.run_intake(self.answer())
        self.edit("slack.reply", text="On it, {{step 1.ticket_key}} is filed.")
        self.refresh(self.answer(summary="CSV export is broken for everyone"))
        self.assert_one_issue()

    def test_a_refresh_with_a_reworded_issue_keeps_one_issue_after_the_issue_is_edited(self):
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.erin)
        self.run_intake(self.answer())
        self.edit("jira.create", summary="Exports are broken")
        self.refresh(self.answer(summary="CSV export is broken for everyone"))
        self.assert_one_issue()
        create = AgentAction.objects.get(bundle__thread=self.thread, kind="jira.create")
        self.assertEqual(create.payload["summary"], "Exports are broken")

    def test_a_refresh_keeps_the_edited_assignment_and_its_issue(self):
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.erin)
        self.run_intake(self.answer())
        self.edit("jira.assign", assignee_member_id=self.jesh.pk)
        self.refresh(self.answer())
        steps = self.steps()
        self.assertEqual(
            [s.kind for s in steps], ["jira.create", "jira.assign", "task.create", "slack.reply"]
        )
        self.assertEqual(steps[1].payload["assignee_member_id"], self.jesh.pk)
        self.assertEqual(steps[3].payload["text"], TEMPLATE)
        self.assertEqual(AgentBundle.objects.get(thread=self.thread).escalation["issue"], 1)

    def test_a_refresh_keeps_the_person_chosen_with_change(self):
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.erin)
        self.run_intake(self.answer())
        bundle = AgentBundle.objects.get(thread=self.thread)
        AgentBundle.objects.filter(pk=bundle.pk).update(
            escalation={**bundle.escalation, "via": "chosen", "user_id": self.jesh.pk}
        )
        self.refresh(self.answer())
        _, assign, _, reply = (s.payload for s in self.steps())
        self.assertEqual(assign["assignee_member_id"], self.jesh.pk)
        self.assertIn("with Jesh Sanghvi (Engineering).", reply["text"])
        stored = AgentBundle.objects.get(pk=bundle.pk).escalation
        self.assertEqual(
            (stored["via"], stored["user_id"], stored["function"]),
            ("chosen", self.jesh.pk, "engineering"),
        )

    def test_a_refresh_keeps_the_department_change(self):
        """CC-8: a Change to whoever handles a department stands on a later
        Refresh, though the account team would now answer someone else."""
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.erin)
        self.run_intake(self.answer())
        bundle = AgentBundle.objects.get(thread=self.thread)
        FunctionOwner.objects.filter(customer=self.pizza).delete()
        FunctionHead(organisation=self.org, function="engineering", user=self.jesh).save()
        answer = self.client_for(self.csm).patch(
            f"/api/v1/agents/bundles/{bundle.pk}/handler/",
            {"user_id": None, "function": "engineering"},
            format="json",
        )
        self.assertEqual(answer.status_code, 200, answer.content)
        # The account team is back: a fresh read would name Erin again.
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.erin)
        self.refresh(self.answer())
        _, assign, todo, reply = (s.payload for s in self.steps())
        # Jesh can't open Pizza Hut: Jira gets Jesh, the to-do waits for the owner (SE4-4).
        self.assertEqual((assign["assignee_member_id"], todo["assignee_id"]), (self.jesh.pk, None))
        self.assertIn("with Jesh Sanghvi (Engineering).", reply["text"])
        stored = AgentBundle.objects.get(pk=bundle.pk).escalation
        self.assertEqual(
            (stored["via"], stored["user_id"], stored["function"], stored["changed"]),
            ("head", self.jesh.pk, "engineering", True),
        )

    def test_a_refresh_keeps_room_for_the_reply(self):
        """Minor 4: steps a person kept count against the room the model's steps get."""
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.erin)
        self.run_intake(self.answer(extra=[self.note("One"), self.note("Two")]))
        for title in ("One", "Two"):
            from django.utils import timezone

            AgentAction.objects.filter(bundle__thread=self.thread, payload__title=title).update(
                edited_at=timezone.now()
            )
        more = [self.note(t) for t in ("Three", "Four", "Five", "Six")]
        self.refresh(self.answer(extra=more))
        steps = self.steps()
        self.assertEqual(len(steps), 8)
        self.assertEqual(steps[-1].kind, "slack.reply")

    def test_an_issue_waiting_in_another_bundle_is_not_this_bundle_s(self):
        """Minor 3: the same issue already waits in another thread's bundle:
        this bundle names no issue, so it gets only the reply without a key."""
        FunctionOwner.objects.create(customer=self.pizza, function="engineering", user=self.erin)
        _, other = self.slack_thread(self.pizza, self.support, ts="1760339950.000100")
        self.run_intake(side_effect=[self.answer(), self.answer()])
        kinds = sorted(
            tuple(
                AgentAction.objects.filter(bundle__thread=thread)
                .order_by("position")
                .values_list("kind", flat=True)
            )
            for thread in (self.thread, other)
        )
        self.assertEqual(
            kinds,
            [("jira.create", "jira.assign", "task.create", "slack.reply"), ("slack.reply",)],
        )
        second = AgentBundle.objects.get(steps__kind="slack.reply", steps__position=1)
        self.assertEqual(
            second.steps.get().payload["text"], "Thanks Faiz. Erin Eng (Engineering) has this."
        )
        self.assertIsNone(second.escalation["issue"])
