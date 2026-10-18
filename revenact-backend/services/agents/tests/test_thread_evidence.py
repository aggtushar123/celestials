"""What the model reads about one thread (agent bundles D2 contract D2-13,
§5.2): the thread's record only, as the bundle's recipient may read it; the
thread's newest 8 messages, oldest first, each quoted up to 600 characters;
a draft reply only where the owner's own connected mailbox holds the mail,
or an owner-routed ticket. The answer is one object (D2-14)."""

import json
from datetime import timedelta

from services.agents import evidence, prompt, routing
from services.agents.tests.intake_fixtures import IntakeFixture
from services.customers.models import Email, Note, Task


class SlackLineTests(IntakeFixture):
    def test_a_slack_line_names_the_people_it_mentions(self):
        """CC-14: the line (and so the evidence people read) names a known
        mention; an unknown one stays as written."""
        message = {"ts": "1760340099.000100", "name": "Jesh", "text": "<@U0FAIZ> take it <@U0WHO>"}
        line = evidence.slack_line(message, 2, {}, {"U0FAIZ": {"name": "Faiz Jamal"}})
        self.assertIn('"@Faiz Jamal take it <@U0WHO>"', line)


class ThreadEvidenceTests(IntakeFixture):
    def test_a_mail_thread_its_record_only_newest_eight_oldest_first(self):
        for n in range(10):
            self.mail_thread(
                self.pizza,
                self.csm,
                ago=timedelta(minutes=60 - n),
                body=f"Message {n}. " + "x" * 700,
            )
        thread = self.mail_thread(self.pizza, self.csm, body="Newest: still looping.")[1]
        ctx, _route = self.thread_ctx(thread)
        ref = f"customer:{self.pizza.pk}"
        self.assertEqual((list(ctx.records), ctx.thread_ref), ([ref], ref))
        self.assertEqual(len(ctx.thread_lines), 8)
        self.assertTrue(ctx.thread_lines[0].strip().startswith("message "))
        self.assertIn("Message 3.", ctx.thread_lines[0])  # 11 messages: the 3 oldest left out
        self.assertTrue(ctx.thread_lines[-1].strip().startswith("email "))
        self.assertIn('unanswered: "Newest: still looping."', ctx.thread_lines[-1])
        self.assertTrue(all(len(line) < 700 for line in ctx.thread_lines))  # 600 quoted at most
        lines = evidence.record_lines(ctx, ref)
        self.assertTrue({line.strip() for line in ctx.thread_lines} <= lines)
        self.assertEqual(
            evidence.source_lines(ctx, ref), {line.strip() for line in ctx.thread_lines}
        )
        self.assertIn(ctx.thread_lines[-1], prompt.render(ctx))

    def test_the_owners_own_mail_can_be_answered_and_nobody_else_gets_a_report_s(self):
        email, mine = self.mail_thread(self.pizza, self.csm)
        ctx, _ = self.thread_ctx(mine)
        self.assertEqual(list(ctx.emails), [email.pk])
        self.assertEqual(ctx.emails[email.pk]["line"], ctx.thread_lines[-1])
        # Carl's mail on Mona's record: mail is owner-only (2026-10-17), so it
        # no longer goes to Mona to read but not answer; Carl can't open the
        # record, so it goes to nobody and no context is built at all.
        _, below = self.mail_thread(self.soup, self.csm, thread="t2")
        self.assertEqual(routing.route(below), (None, routing.NO_READER))

    def test_a_ticket_answered_only_when_routed_to_the_owner(self):
        ticket, owned = self.ticket_thread(self.pizza)
        ctx, _ = self.thread_ctx(owned)
        self.assertEqual(list(ctx.tickets), [ticket.pk])
        self.assertEqual(ctx.thread_lines, [evidence.ticket_line(ticket, evidence.MESSAGE_CHARS)])
        _, queued = self.ticket_thread(self.loose, number="ZD-9")
        ctx, route = self.thread_ctx(queued)
        self.assertEqual((route.routed_to, ctx.tickets), ("department", {}))

    def test_a_queue_bundle_reads_only_ownerless_tasks(self):
        Task.objects.create(
            customer=self.loose,
            title="Carl's private follow up",
            assignee_name="Carl",
            assignee=self.csm,
            created_by=self.csm,
            due_date=self.today,
            priority="high",
        )
        Task.objects.create(
            customer=self.loose,
            title="Shared renewal prep",
            assignee_name="",
            due_date=self.today,
            priority="high",
        )
        _, thread = self.ticket_thread(self.loose, number="ZD-9")
        ctx, _ = self.thread_ctx(thread)
        self.assertEqual(sorted(t["title"] for t in ctx.tasks.values()), ["Shared renewal prep"])

    def test_an_owned_records_queue_bundle_leaves_out_the_owners_chain(self):
        Task.objects.create(
            customer=self.pizza,
            title="Carl's private follow up",
            assignee_name="Carl",
            assignee=self.csm,
            created_by=self.csm,
            due_date=self.today,
            priority="high",
        )
        Task.objects.create(
            customer=self.pizza,
            title="Shared renewal prep",
            assignee_name="",
            due_date=self.today,
            priority="high",
        )
        Note.objects.create(
            customer=self.pizza, title="Carl's private note", author=self.csm, logged_at=self.today
        )
        Note.objects.create(customer=self.pizza, title="Shared note", logged_at=self.today)
        engineering = self.connector("jira", "engineering")
        _, thread = self.ticket_thread(self.pizza, connector=engineering, number="ENG-1")
        ctx, route = self.thread_ctx(thread)
        self.assertEqual(route.routed_to, "department")
        self.assertEqual(sorted(t["title"] for t in ctx.tasks.values()), ["Shared renewal prep"])
        self.assertEqual(sorted(n["title"] for n in ctx.notes.values()), ["Shared note"])
        # the owner's own bundle does read their chain
        _, owned = self.ticket_thread(self.pizza, number="ZD-2")
        ctx, route = self.thread_ctx(owned)
        self.assertEqual(route.routed_to, "owner")
        self.assertEqual(len(ctx.tasks), 2)

    def test_an_email_filed_on_another_record_is_left_out(self):
        _, thread = self.mail_thread(self.pizza, self.csm, body="First, on Pizza Hut.")
        elsewhere, _ = self.mail_thread(self.soup, self.csm, body="Misfiled on Soup Co.")
        Email.objects.filter(pk=elsewhere.pk).update(thread_id="t1", mailbox=thread.mailbox)
        ctx, _ = self.thread_ctx(thread)
        self.assertEqual(len(ctx.thread_lines), 1)
        self.assertNotIn("Misfiled", " ".join(ctx.thread_lines))

    def test_a_message_we_sent_last_is_not_read_as_unanswered(self):
        _, thread = self.mail_thread(self.pizza, self.csm)
        sent = Email.objects.get(thread_id="t1")
        Email.objects.filter(pk=sent.pk).update(direction=Email.Direction.SENT)
        ctx, _ = self.thread_ctx(thread)
        self.assertTrue(ctx.thread_lines[-1].strip().startswith("message "))
        self.assertNotIn("unanswered", ctx.thread_lines[-1])
        self.assertEqual(ctx.emails, {})

    def test_the_thread_prompt_and_its_answer(self):
        _, thread = self.ticket_thread(self.loose, number="ZD-9")
        ctx, _ = self.thread_ctx(thread)
        system = prompt.thread_system(
            "cs", ["task.create", "note.create"], "friendly", ctx.thread_ref
        )
        self.assertIn("untrusted", system)
        self.assertIn(ctx.thread_ref, system)
        self.assertNotIn("draft.reply:", system)
        raw = json.dumps(
            {
                "title": "Loose: login loop",
                "reason": "They are locked out.",
                "actions": [{"kind": "note.create"}],
            }
        )
        answer = prompt.parse_thread(f"```json\n{raw}\n```")
        self.assertEqual(
            (answer.title, answer.reason, len(answer.items)),
            ("Loose: login loop", "They are locked out.", 1),
        )
        self.assertEqual(
            prompt.parse_thread('{"title": "x", "reason": "y", "actions": []}').items, []
        )
        self.assertEqual(prompt.parse_thread('[{"kind": "note.create"}]').title, "")
        with self.assertRaises(ValueError):
            prompt.parse_thread("I'd rather not.")
        with self.assertRaises(ValueError):
            prompt.parse_thread('{"title": "x"}')
