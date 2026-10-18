"""What the agents may propose outside (agent bundles D3 contract D3-18 to
D3-20, D3-28; spec §4.4): offered only where the thread or the workspace
allows, written from the conversation, checked on the way out. The model is
a fake."""

import json
from unittest.mock import patch

from services.agents import evidence, run
from services.agents.models import AgentPolicy
from services.agents.outside.offered import offered
from services.agents.tests.outside_fixtures import OutsideFixture
from services.customers.models import Task
from services.metrics.models import AgentAction
from services.work.clock import today_for

NIGHTLY = "services.agents.run.get_completion"


class OutsideProposalTests(OutsideFixture):
    def test_what_each_context_offers(self):
        self.jira_connector()
        _, mail = self.mail_thread(self.pizza, self.csm)
        _, slack = self.slack_thread(self.pizza)
        mail_ctx, _ = self.thread_ctx(mail)
        slack_ctx, _ = self.thread_ctx(slack)
        self.assertEqual(
            offered(mail_ctx), {"mail.send_reply", "jira.create", "jira.assign", "jira.comment"}
        )
        self.assertEqual(
            offered(slack_ctx), {"slack.reply", "jira.create", "jira.assign", "jira.comment"}
        )
        self.assertEqual(mail_ctx.thread_email["address"], "ann@x.com")
        self.assertEqual(
            (slack_ctx.thread_slack["channel"], slack_ctx.thread_channel), ("C0SUPPORT", "slack")
        )
        nightly = evidence.build(self.org, "cs", today=self.today)
        self.assertEqual(offered(nightly), {"jira.create", "jira.assign"})

    def test_no_jira_no_jira_kinds_in_the_prompt(self):
        _, slack = self.slack_thread(self.pizza)
        ctx, _ = self.thread_ctx(slack)
        self.assertEqual(offered(ctx), {"slack.reply"})
        _, model = self.run_intake(self.answer())
        system = model.call_args.kwargs["system"]
        self.assertIn("slack.reply", system)
        self.assertNotIn("jira.create", system)
        self.assertIn("never {{step N.key}} in a reply", system)

    def test_a_slack_thread_with_an_issue_becomes_an_escalation(self):
        board = self.jira_connector()
        support = self.slack_connector()
        conversation, thread = self.slack_thread(self.pizza, support)
        ctx, _ = self.thread_ctx(thread)
        line = self.thread_line(ctx, "message ")
        ref = ctx.thread_ref
        raw = self.answer(
            {
                "kind": "slack.reply",
                "record": ref,
                "title": "Tell Ann we're on it",
                "rationale": "She is locked out.",
                "evidence": [line],
                "payload": {"text": "Thanks Ann, we're on it.", "channel": "C0EVIL"},
            },
            {
                "kind": "jira.create",
                "record": ref,
                "title": "Log the login loop",
                "rationale": "Engineering must fix it.",
                "evidence": [line],
                "payload": {
                    "summary": "Login loop after password reset",
                    "description": "Nobody can log in.",
                    "priority": "high",
                    "assignee_id": None,
                },
            },
            {
                "kind": "jira.assign",
                "record": ref,
                "title": "Give it to Erin",
                "rationale": "She owns login.",
                "evidence": [line],
                "payload": {"issue": "{{step 2.ticket_key}}", "assignee_id": self.erin.pk},
            },
        )
        result, _ = self.run_intake(raw)
        self.assertEqual(result.made, 1)
        steps = list(AgentAction.objects.filter(bundle__thread=thread).order_by("position"))
        self.assertEqual(
            [s.kind for s in steps], ["jira.create", "jira.assign", "task.create", "slack.reply"]
        )
        self.assertEqual(
            (steps[0].payload["connector_id"], steps[0].payload["project"]), (board.pk, "SUP")
        )
        self.assertEqual(
            (steps[1].payload["issue"], steps[1].payload["assignee_member_id"]),
            ("{{step 1.ticket_key}}", None),
        )
        self.assertEqual(
            (steps[3].payload["channel"], steps[3].payload["thread_ts"], steps[3].payload["text"]),
            (
                "C0SUPPORT",
                conversation.thread_ts,
                "Thanks Faiz. Logged as {{step 1.ticket_key}} ({{step 1.ticket_url}}).",
            ),
        )
        self.assertTrue(all(s.status == "proposed" for s in steps))

    def test_one_reply_per_email(self):
        email, thread = self.mail_thread(self.pizza, self.csm)
        ctx, _ = self.thread_ctx(thread)
        line = self.thread_line(ctx, "email ")
        reply = {
            "kind": "mail.send_reply",
            "record": ctx.thread_ref,
            "title": "Answer Ann",
            "rationale": "She asked.",
            "evidence": [line],
            "payload": {"body": "We're on it."},
        }
        draft = {
            **reply,
            "kind": "draft.reply",
            "payload": {"email_id": email.pk, "body": "We're on it."},
        }
        self.run_intake(self.answer(reply, draft))
        self.assertEqual(
            list(AgentAction.objects.filter(bundle__thread=thread).values_list("kind", flat=True)),
            ["mail.send_reply"],
        )
        stored = AgentAction.objects.get(kind="mail.send_reply").payload
        self.assertEqual((stored["to"], stored["cc"]), (["ann@x.com"], []))

    def test_text_that_leaves_names_nothing_internal(self):
        Task.objects.create(
            customer=self.pizza,
            title="Escalate the billing dispute",
            assignee=self.csm,
            assignee_name=self.csm.name,
            created_by=self.csm,
            due_date=self.today,
        )
        _, thread = self.slack_thread(self.pizza)
        ctx, _ = self.thread_ctx(thread)
        line = self.thread_line(ctx, "message ")
        leak = {
            "kind": "slack.reply",
            "record": ctx.thread_ref,
            "title": "Reply",
            "rationale": "Why.",
            "evidence": [line],
            "payload": {"text": "We will Escalate the billing dispute today."},
        }
        result, _ = self.run_intake(self.answer(leak))
        self.assertFalse(AgentAction.objects.filter(kind="slack.reply").exists())

    def test_a_reply_cites_only_its_own_email(self):
        _, thread = self.mail_thread(self.pizza, self.csm)
        ctx, _ = self.thread_ctx(thread)
        other = self.thread_line(ctx, "- ")
        item = {
            "kind": "mail.send_reply",
            "record": ctx.thread_ref,
            "title": "Answer",
            "rationale": "Why.",
            "evidence": [other],
            "payload": {"body": "Hi"},
        }
        self.run_intake(self.answer(item))
        self.assertFalse(AgentAction.objects.filter(kind="mail.send_reply").exists())

    def test_the_nightly_pass_may_open_a_jira_issue_and_never_reply(self):
        self.jira_connector()
        ctx = evidence.build(self.org, "cs", today=today_for(self.org))
        ref = f"customer:{self.pizza.pk}"
        line = next(x for x in sorted(evidence.record_lines(ctx, ref)) if x.startswith("- "))
        items = [
            {
                "kind": "jira.create",
                "record": ref,
                "title": "Log the renewal blocker",
                "rationale": "Renews soon.",
                "evidence": [line],
                "payload": {
                    "summary": "Renewal blocker",
                    "description": "Check it.",
                    "priority": "medium",
                    "assignee_id": None,
                },
            },
            {
                "kind": "mail.send_reply",
                "record": ref,
                "title": "Email them",
                "rationale": "Why.",
                "evidence": [line],
                "payload": {"body": "Hi"},
            },
        ]
        with patch(NIGHTLY, return_value=json.dumps(items)) as model:
            run.run(self.org, "cs")
        self.assertEqual(list(AgentAction.objects.values_list("kind", flat=True)), ["jira.create"])
        self.assertNotIn("mail.send_reply", model.call_args.kwargs["system"])

    def test_every_other_kind_on_never_leaves_the_agent_off(self):
        self.jira_connector()
        _, thread = self.slack_thread(self.pizza)
        from services.agents.registry import REGISTRY, kinds_for

        AgentPolicy.objects.update_or_create(
            organisation=self.org,
            defaults={
                "levels": {"cs": {k: "never" for k in kinds_for("cs") if not REGISTRY[k].outside}}
            },
        )
        _, model = self.run_intake(self.answer())
        model.assert_not_called()
        thread.refresh_from_db()
        self.assertEqual((thread.status, thread.skip_reason), ("skipped", "agent_off"))

    # Positive twins (each absence above can't pass vacuously) and the out-check
    # on every outside kind's text (D3-19).

    def task(self, title):
        return Task.objects.create(
            customer=self.pizza,
            title=title,
            assignee=self.csm,
            assignee_name=self.csm.name,
            created_by=self.csm,
            due_date=self.today,
        )

    def slack_reply(self, ctx, text, evidence=None):
        return {
            "kind": "slack.reply",
            "record": ctx.thread_ref,
            "title": "Reply",
            "rationale": "Why.",
            "evidence": [self.thread_line(ctx, "message ")] if evidence is None else evidence,
            "payload": {"text": text},
        }

    def jira_create(self, ref, line, summary, description="Nobody can log in."):
        return {
            "kind": "jira.create",
            "record": ref,
            "title": "Log it",
            "rationale": "Engineering must fix it.",
            "evidence": [line] if line else [],
            "payload": {
                "summary": summary,
                "description": description,
                "priority": "high",
                "assignee_id": None,
            },
        }

    def test_text_that_names_nothing_internal_is_kept(self):
        self.task("Escalate the billing dispute")
        _, thread = self.slack_thread(self.pizza)
        ctx, _ = self.thread_ctx(thread)
        self.assertIn("Escalate the billing dispute", [t["title"] for t in ctx.tasks.values()])
        self.run_intake(self.answer(self.slack_reply(ctx, "We will look at it today.")))
        self.assertEqual(
            AgentAction.objects.get(kind="slack.reply").payload["text"],
            "We will look at it today.",
        )

    def test_a_reply_citing_its_own_email_is_kept(self):
        _, thread = self.mail_thread(self.pizza, self.csm)
        ctx, _ = self.thread_ctx(thread)
        other = self.thread_line(ctx, "- ")
        self.assertNotEqual(other, ctx.thread_email["line"])
        item = {
            "kind": "mail.send_reply",
            "record": ctx.thread_ref,
            "title": "Answer",
            "rationale": "Why.",
            "evidence": [ctx.thread_email["line"]],
            "payload": {"body": "Hi"},
        }
        self.run_intake(self.answer(item))
        self.assertTrue(AgentAction.objects.filter(kind="mail.send_reply").exists())

    def test_a_sent_reply_names_nothing_internal_in_its_body_or_subject(self):
        self.task("Escalate the billing dispute")
        _, thread = self.mail_thread(self.pizza, self.csm, subject="Billing question")
        ctx, _ = self.thread_ctx(thread)
        reply = {
            "kind": "mail.send_reply",
            "record": ctx.thread_ref,
            "title": "Answer",
            "rationale": "Why.",
            "evidence": [ctx.thread_email["line"]],
            "payload": {"body": "We will Escalate the billing dispute today."},
        }
        self.run_intake(self.answer(reply))
        self.assertFalse(AgentAction.objects.filter(kind="mail.send_reply").exists())

    def test_a_sent_reply_whose_subject_names_a_task_is_refused(self):
        # The subject comes from the thread ("Re: Billing question") and is
        # checked like the body: here it holds a task's title. Without the
        # task the same reply is kept (the twin below).
        self.task("Billing question")
        _, thread = self.mail_thread(self.pizza, self.csm, subject="Billing question")
        ctx, _ = self.thread_ctx(thread)
        self.run_intake(self.answer(self.mail_reply(ctx)))
        self.assertFalse(AgentAction.objects.filter(kind="mail.send_reply").exists())

    def test_a_sent_reply_whose_subject_names_nothing_internal_is_kept(self):
        _, thread = self.mail_thread(self.pizza, self.csm, subject="Billing question")
        ctx, _ = self.thread_ctx(thread)
        self.run_intake(self.answer(self.mail_reply(ctx)))
        self.assertEqual(
            AgentAction.objects.get(kind="mail.send_reply").payload["subject"],
            "Re: Billing question",
        )

    def mail_reply(self, ctx, body="We will look at it today."):
        return {
            "kind": "mail.send_reply",
            "record": ctx.thread_ref,
            "title": "Answer",
            "rationale": "Why.",
            "evidence": [ctx.thread_email["line"]],
            "payload": {"body": body},
        }

    def test_a_jira_issue_names_nothing_internal_in_its_summary_or_description(self):
        # A Jira thread: a Slack thread's answer is an escalation, which keeps one issue.
        board = self.jira_connector(department="cs")
        self.task("Escalate the billing dispute")
        _, thread = self.jira_thread(self.pizza, board, key="SUP-12")
        ctx, _ = self.thread_ctx(thread)
        line = self.thread_line(ctx, "ticket ")
        raw = self.answer(
            self.jira_create(ctx.thread_ref, line, "Escalate the billing dispute"),
            self.jira_create(
                ctx.thread_ref, line, "Billing is wrong", "Escalate the billing dispute."
            ),
            self.jira_create(ctx.thread_ref, line, "Login loop after password reset"),
        )
        self.run_intake(raw)
        self.assertEqual(
            list(
                AgentAction.objects.filter(kind="jira.create").values_list(
                    "payload__summary", flat=True
                )
            ),
            ["Login loop after password reset"],
        )

    def test_an_outside_step_cites_at_least_one_line(self):
        # A Jira thread: a Slack thread's answer is an escalation, which keeps one issue.
        board = self.jira_connector(department="cs")
        _, thread = self.jira_thread(self.pizza, board, key="SUP-12")
        ctx, _ = self.thread_ctx(thread)
        line = self.thread_line(ctx, "ticket ")
        raw = self.answer(
            {**self.jira_comment(ctx, "We're on it."), "evidence": []},
            self.jira_create(ctx.thread_ref, None, "Login loop"),
            self.jira_create(ctx.thread_ref, line, "Login loop after password reset"),
        )
        self.run_intake(raw)
        self.assertEqual(
            list(AgentAction.objects.values_list("kind", "payload__summary")),
            [("jira.create", "Login loop after password reset")],
        )

    def test_no_pass_writes_outside_even_set_to_auto(self):
        self.jira_connector()
        outside = ["mail.send_reply", "slack.reply", "jira.create", "jira.assign"]
        AgentPolicy.objects.update_or_create(
            organisation=self.org, defaults={"levels": {"cs": dict.fromkeys(outside, "auto")}}
        )
        _, thread = self.slack_thread(self.pizza)
        ctx, _ = self.thread_ctx(thread)
        line = self.thread_line(ctx, "message ")
        _, model = self.run_intake(
            self.answer(
                self.slack_reply(ctx, "We're on it."),
                self.jira_create(ctx.thread_ref, line, "Login loop after password reset"),
            )
        )
        self.assertIn("jira.create", model.call_args.kwargs["system"])
        ref = f"customer:{self.pizza.pk}"
        nightly = evidence.build(self.org, "cs", today=today_for(self.org))
        night_line = next(
            x for x in sorted(evidence.record_lines(nightly, ref)) if x.startswith("- ")
        )
        # (the default description names the record's ticket: the nightly
        # pass may not, D3-19)
        items = [self.jira_create(ref, night_line, "Renewal blocker", "Check the renewal.")]
        with patch(NIGHTLY, return_value=json.dumps(items)) as model:
            run.run(self.org, "cs")
        self.assertIn("jira.create", model.call_args.kwargs["system"])
        # The Slack thread's issue is an escalation: its assignment and to-do wait too.
        self.assertEqual(
            sorted(AgentAction.objects.values_list("kind", "status")),
            [
                ("jira.assign", "proposed"),
                ("jira.create", "proposed"),
                ("jira.create", "proposed"),
                ("slack.reply", "proposed"),
                ("task.create", "proposed"),
            ],
        )
        self.assertEqual(
            (self.mail.sent, self.slack.posts, self.jira.created, self.jira.assigned),
            ([], [], [], []),
        )

    def test_an_agent_with_another_kind_on_asks_the_model(self):
        _, thread = self.slack_thread(self.pizza)
        _, model = self.run_intake(self.answer())
        model.assert_called_once()
        thread.refresh_from_db()
        self.assertNotEqual(thread.skip_reason, "agent_off")

    def test_a_nightly_jira_issue_names_none_of_its_records_mail_or_tickets(self):
        # No thread: every source of the record is internal to the issue (D3-19).
        self.jira_connector()
        self.ticket_thread(self.pizza, title="Nobody can log in")
        ref = f"customer:{self.pizza.pk}"
        ctx = evidence.build(self.org, "cs", today=today_for(self.org))
        line = next(x for x in sorted(evidence.record_lines(ctx, ref)) if x.startswith("- "))
        items = [
            self.jira_create(ref, line, "Renewal blocker", "Nobody can log in, see the ticket."),
            self.jira_create(ref, line, "Renewal check", "Check the renewal."),
        ]
        with patch(NIGHTLY, return_value=json.dumps(items)):
            run.run(self.org, "cs")
        self.assertEqual(
            list(AgentAction.objects.values_list("payload__summary", flat=True)),
            ["Renewal check"],
        )

    def test_a_slack_thread_whose_connector_cant_be_used_offers_no_reply(self):
        from services.connectors.models import Connector

        support = self.slack_connector()
        _, thread = self.slack_thread(self.pizza, support)
        ctx, _ = self.thread_ctx(thread)
        self.assertEqual(offered(ctx), {"slack.reply"})
        usable = {"is_enabled": True, "credentials": support.credentials, "status": "connected"}
        for change in ({"is_enabled": False}, {"credentials": ""}, {"status": "error"}):
            Connector.objects.filter(pk=support.pk).update(**change)
            thread.refresh_from_db()  # the thread's conversation and connector, read again
            ctx, _ = self.thread_ctx(thread)
            self.assertEqual(offered(ctx), set(), change)
            Connector.objects.filter(pk=support.pk).update(**usable)

    def test_a_jira_thread_whose_connector_cant_be_used_falls_back_to_the_workspaces(self):
        # Contract §2.3: Jira is offered while the workspace has a usable Jira
        # connector, the thread's own first; "source" goes only through its own.
        from services.agents.actions.jira_issues import validate_assign
        from services.agents.kinds import Invalid
        from services.connectors.models import Connector

        own = self.jira_connector()
        _, thread = self.jira_thread(self.pizza, own)
        ctx, _ = self.thread_ctx(thread)
        self.assertEqual(ctx.jira_connector["id"], own.pk)
        row = {"ref": ctx.thread_ref}
        source = {"issue": "source", "assignee_id": self.erin.pk}
        self.assertEqual(validate_assign(source, row, ctx, [])["connector_id"], own.pk)
        Connector.objects.filter(pk=own.pk).update(is_enabled=False)
        thread.refresh_from_db()  # the thread's ticket and connector, read again
        ctx, _ = self.thread_ctx(thread)
        self.assertEqual(offered(ctx), set())
        self.assertIsNone(ctx.jira_connector)
        other = self.jira_connector(project="ENG")
        ctx, _ = self.thread_ctx(thread)
        self.assertEqual(offered(ctx), {"jira.create", "jira.assign", "jira.comment"})
        self.assertEqual(ctx.jira_connector, {"id": other.pk, "project": "ENG"})
        with self.assertRaises(Invalid):
            validate_assign(source, row, ctx, [])

    def jira_comment(self, ctx, body, issue="source"):
        return {
            "kind": "jira.comment",
            "record": ctx.thread_ref,
            "title": "Tell engineering",
            "rationale": "There is a new detail.",
            "evidence": [self.thread_line(ctx, "ticket ")],
            "payload": {"issue": issue, "body": body},
        }

    def test_a_jira_thread_gets_a_comment_on_its_own_issue(self):
        board = self.jira_connector(department="cs")
        _, thread = self.jira_thread(self.pizza, board, key="SUP-12")
        ctx, _ = self.thread_ctx(thread)
        _, model = self.run_intake(self.answer(self.jira_comment(ctx, "Seen on Chrome too.")))
        self.assertIn("A jira.comment adds an internal comment", model.call_args.kwargs["system"])
        stored = AgentAction.objects.get(kind="jira.comment")
        self.assertEqual(
            stored.payload,
            {"connector_id": board.pk, "issue": "SUP-12", "body": "Seen on Chrome too."},
        )

    def test_a_comment_naming_something_internal_is_dropped(self):
        self.task("Escalate the billing dispute")
        board = self.jira_connector(department="cs")
        _, thread = self.jira_thread(self.pizza, board, key="SUP-12")
        ctx, _ = self.thread_ctx(thread)
        self.run_intake(
            self.answer(self.jira_comment(ctx, "We will Escalate the billing dispute."))
        )
        self.assertFalse(AgentAction.objects.filter(kind="jira.comment").exists())

    def test_the_same_comment_without_the_task_is_kept(self):
        # The positive twin of the test above: the same world, a clean body.
        self.task("Escalate the billing dispute")
        board = self.jira_connector(department="cs")
        _, thread = self.jira_thread(self.pizza, board, key="SUP-12")
        ctx, _ = self.thread_ctx(thread)
        self.run_intake(self.answer(self.jira_comment(ctx, "Seen again today.")))
        self.assertTrue(AgentAction.objects.filter(kind="jira.comment").exists())
