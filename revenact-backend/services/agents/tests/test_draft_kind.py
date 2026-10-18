"""draft.reply (contract): it answers its record's own unanswered email or
open ticket and cites only that line; applied, it makes a ReplyDraft owned
by the record's owner, whoever approved it, and tells them; it goes stale
when the source moves on; undo deletes a draft that is still as written."""

import json
from datetime import timedelta
from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext

from core.models import AuditEvent
from services.accounts.models import Organisation, User
from services.agents import bulk, evidence, prompt, run
from services.agents.actions import drafts
from services.agents.kinds import ChangedSince, Invalid, Stale
from services.agents.registry import REGISTRY
from services.agents.tests.drafts_fixtures import (
    draft_action,
    inbound,
    mailbox,
    outbound,
    ticket,
)
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import ReplyDraft, Task
from services.mail.models import MailboxConnection
from services.metrics.models import AgentAction
from services.notifications.models import Notification


class DraftKindTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.connection = mailbox(cls.csm)
        cls.mail = inbound(cls.pizza, cls.csm)
        cls.issue = ticket(cls.pizza)
        cls.ref = f"customer:{cls.pizza.pk}"

    def ctx(self):
        return evidence.build(Organisation.objects.get(pk=self.org.pk), "cs", today=self.today)

    def validate(self, payload, evidence_lines=None, ctx=None):
        ctx = ctx or self.ctx()
        if evidence_lines is None:
            evidence_lines = [ctx.emails[self.mail.pk]["line"].strip()]
        return drafts.REPLY.validate(payload, ctx.records[self.ref], ctx, evidence_lines)

    def test_an_email_draft_validates_and_caches_what_it_shows(self):
        clean = self.validate({"email_id": self.mail.pk, "body": " Hi Ann, two years works. "})
        self.assertEqual(
            clean,
            {
                "email_id": self.mail.pk,
                "body": "Hi Ann, two years works.",
                "to": "Ann Lee <ann@x.com>",
                "subject": "Re: Renewal terms",
            },
        )
        self.assertEqual(drafts.target(clean), f"draft:email:{self.mail.pk}")

    def test_a_ticket_draft_validates(self):
        ctx = self.ctx()
        clean = self.validate(
            {"ticket_id": self.issue.pk, "body": "We're on it."},
            [ctx.tickets[self.issue.pk]["line"].strip()],
            ctx,
        )
        self.assertEqual(
            clean,
            {
                "ticket_id": self.issue.pk,
                "body": "We're on it.",
                "ticket": "TKT-1042",
                "subject": "Export fails",
            },
        )
        self.assertEqual(drafts.target(clean), f"draft:ticket:{self.issue.pk}")

    def test_what_is_refused(self):
        ctx = self.ctx()
        header = next(x for x in sorted(evidence.record_lines(ctx, self.ref)) if x.startswith("- "))
        email = {"email_id": self.mail.pk, "body": "Hi"}
        for payload, lines in (
            ({"email_id": self.mail.pk, "ticket_id": self.issue.pk, "body": "Hi"}, None),
            ({"body": "Hi"}, None),
            ({"email_id": self.mail.pk, "body": " "}, None),
            ({"email_id": self.mail.pk, "body": "x" * 4001}, None),
            ({"email_id": self.mail.pk + 999, "body": "Hi"}, None),
            (email, [header]),
            ({"ticket_id": self.issue.pk, "body": "Hi"}, None),
        ):
            with self.assertRaises(Invalid, msg=str(payload)):
                self.validate(payload, lines, ctx)
        ctx.mailboxes.clear()
        with self.assertRaises(Invalid):
            self.validate(email, None, ctx)

    def test_the_same_source_is_the_same_proposal(self):
        a = {"email_id": 1, "body": "One", "to": "x", "subject": "y"}
        b = {"email_id": 1, "body": "Two", "to": "x", "subject": "y"}
        self.assertTrue(drafts.REPLY.same(a, b))
        self.assertFalse(drafts.REPLY.same(a, {**b, "email_id": 2}))

    def test_current_is_the_threads_newest_email_and_the_tickets_open_or_resolved(self):
        email_action = draft_action(self.org, self.mail)
        self.assertEqual(email_action.before, self.mail.pk)
        answer = outbound(self.mail, hours=0)
        self.assertEqual(drafts.current(email_action), answer.pk)
        ticket_action = draft_action(self.org, self.issue)
        self.assertEqual(ticket_action.before, "open")
        for status in ("in-progress", "on-hold"):
            type(self.issue).objects.filter(pk=self.issue.pk).update(status=status)
            self.assertEqual(drafts.current(ticket_action), "open")
        for status in ("resolved", "closed"):
            type(self.issue).objects.filter(pk=self.issue.pk).update(status=status)
            self.assertEqual(drafts.current(ticket_action), "resolved")
        type(self.issue).objects.filter(pk=self.issue.pk).delete()
        self.assertIsNone(drafts.current(ticket_action))

    def test_the_previews(self):
        email_action = draft_action(self.org, self.mail, body="x" * 300)
        self.assertEqual(
            drafts.REPLY.preview(email_action),
            {
                "draft": {
                    "channel": "email",
                    "to": "Ann Lee <ann@x.com>",
                    "subject": "Re: Renewal terms",
                    "excerpt": "x" * 280,
                }
            },
        )
        ticket_action = draft_action(self.org, self.issue, body="On it.")
        self.assertEqual(
            drafts.REPLY.preview(ticket_action),
            {
                "draft": {
                    "channel": "ticket",
                    "ticket": "TKT-1042",
                    "subject": "Export fails",
                    "excerpt": "On it.",
                }
            },
        )

    def test_apply_drafts_for_the_record_owner_and_tells_them(self):
        action = draft_action(self.org, self.mail)
        after, result = drafts.REPLY.apply(action, self.mona)
        made = ReplyDraft.objects.get(pk=after)
        self.assertEqual(result, {"draft_id": made.pk})
        self.assertEqual(
            (made.owner, made.channel, made.email, made.to, made.subject, made.agent_action),
            (self.csm, "email", self.mail, [["Ann Lee", "ann@x.com"]], "Re: Renewal terms", action),
        )
        self.assertFalse(made.edited)
        event = AuditEvent.objects.get(action="reply_draft.created")
        self.assertEqual(event.metadata, {"channel": "email", "agent_action": action.pk})
        notice = Notification.objects.get(kind="agent_draft_ready")
        self.assertEqual(
            (notice.recipient, notice.message, notice.link),
            (
                self.csm,
                "The CS agent drafted a reply to Ann Lee on Pizza Hut.",
                f"/communications?draft={made.pk}",
            ),
        )

    def test_a_ticket_draft_says_a_ticket_and_the_owner_who_approves_is_not_told(self):
        # Applied rows: the one-open rule keeps one proposed action per target.
        mine = draft_action(self.org, self.issue, status="applied")
        drafts.REPLY.apply(mine, self.csm)
        self.assertFalse(Notification.objects.filter(kind="agent_draft_ready").exists())
        ReplyDraft.objects.all().delete()
        drafts.REPLY.apply(draft_action(self.org, self.issue, status="applied"), None)
        notice = Notification.objects.get(kind="agent_draft_ready")
        self.assertEqual(notice.message, "The CS agent drafted a reply to a ticket on Pizza Hut.")

    def test_apply_refuses_when_the_source_moved_on(self):
        action = draft_action(self.org, self.mail)
        outbound(self.mail, hours=0)
        with self.assertRaises(Stale):
            drafts.REPLY.apply(action, self.mona)

    def test_apply_refuses_without_a_connected_mailbox_or_an_active_owner(self):
        action = draft_action(self.org, self.mail)
        MailboxConnection.objects.filter(pk=self.connection.pk).update(status="error")
        with self.assertRaises(Stale):
            drafts.REPLY.apply(action, self.mona)
        MailboxConnection.objects.filter(pk=self.connection.pk).update(status="connected")
        User.objects.filter(pk=self.csm.pk).update(is_active=False)
        with self.assertRaises(Stale):
            drafts.REPLY.apply(action, self.mona)

    def test_apply_refuses_a_resolved_ticket_and_a_second_open_draft(self):
        action = draft_action(self.org, self.issue, status="applied")
        drafts.REPLY.apply(action, self.mona)
        with self.assertRaises(Stale):
            drafts.REPLY.apply(draft_action(self.org, self.issue), self.mona)
        type(self.issue).objects.filter(pk=self.issue.pk).update(status="closed")
        ReplyDraft.objects.all().delete()
        with self.assertRaises(Stale):
            drafts.REPLY.apply(action, self.mona)

    def test_undo_deletes_an_untouched_draft_and_refuses_otherwise(self):
        for change, sentence in (
            ({"status": "sent"}, "This draft has been sent."),
            ({"body": "Edited."}, "This draft has been edited since."),
            ({"subject": "Re: other"}, "This draft has been edited since."),
        ):
            ReplyDraft.objects.all().delete()
            action = draft_action(self.org, self.mail, status="applied")
            action.after, action.result = drafts.REPLY.apply(action, self.mona)
            ReplyDraft.objects.filter(pk=action.after).update(**change)
            with self.assertRaises(ChangedSince) as caught:
                drafts.REPLY.undo(action, self.mona)
            self.assertEqual(caught.exception.detail, sentence)
        ReplyDraft.objects.all().delete()
        with self.assertRaises(ChangedSince) as caught:
            drafts.REPLY.undo(action, self.mona)
        self.assertEqual(caught.exception.detail, "This draft was discarded.")
        action = draft_action(self.org, self.mail, status="applied")
        action.after, action.result = drafts.REPLY.apply(action, self.mona)
        drafts.REPLY.undo(action, self.mona)
        self.assertFalse(ReplyDraft.objects.exists())

    def test_the_undo_hint_reads_the_draft(self):
        action = draft_action(self.org, self.mail)
        action.after, action.result = drafts.REPLY.apply(action, self.mona)
        self.assertTrue(drafts.REPLY.unchanged(action, drafts.current(action)))
        ReplyDraft.objects.filter(pk=action.after).update(body="Edited.")
        self.assertFalse(drafts.REPLY.unchanged(action, drafts.current(action)))

    def test_a_page_reads_heads_statuses_and_drafts_once(self):
        email_action = draft_action(self.org, self.mail)
        email_action.after, email_action.result = drafts.REPLY.apply(email_action, self.mona)
        ticket_action = draft_action(self.org, self.issue)
        with CaptureQueriesContext(connection) as reads:
            page = bulk.Bulk([email_action, ticket_action])
        self.assertEqual(len(reads), 3)
        self.assertEqual(page.heads, {self.mail.pk: self.mail.pk})
        self.assertEqual(page.ticket_status, {self.issue.pk: "open"})
        with bulk.using([email_action, ticket_action]):
            with self.assertNumQueries(0):
                self.assertEqual(drafts.current(email_action), self.mail.pk)
                self.assertEqual(drafts.current(ticket_action), "open")
                self.assertTrue(drafts.REPLY.unchanged(email_action, self.mail.pk))


class DraftConsiderTests(AgentsFixture):
    """A generated draft.reply through `run._consider` (the kind is not yet
    in REGISTRY or the prompt's payloads, so these tests put it there)."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        mailbox(cls.csm)
        cls.mail = inbound(cls.pizza, cls.csm)
        Task.objects.create(
            customer=cls.pizza,
            title="Call the exec sponsor",
            assignee=cls.csm,
            assignee_name=cls.csm.name,
            created_by=cls.csm,
            due_date=cls.today + timedelta(days=2),
            priority="high",
        )
        cls.ref = f"customer:{cls.pizza.pk}"

    def pass_(self, body):
        org = Organisation.objects.get(pk=self.org.pk)
        line = evidence.build(org, "cs", today=self.today).emails[self.mail.pk]["line"]
        item = {
            "kind": "draft.reply",
            "record": self.ref,
            "title": "Reply to Ann Lee",
            "rationale": "She asked about the renewal.",
            "evidence": [line.strip()],
            "payload": {"email_id": self.mail.pk, "body": body},
        }
        with (
            patch.dict(REGISTRY, {"draft.reply": drafts.REPLY}),
            patch.dict(prompt.PAYLOADS, {"draft.reply": '{"email_id": <id>, "body": <reply>}'}),
            patch("services.agents.policy.plan_credits", return_value=3000),
            patch("services.agents.run.get_completion", return_value=json.dumps([item])),
        ):
            return run.run(org, "cs")

    def test_a_draft_whose_body_names_a_task_title_is_dropped(self):
        named = self.pass_("Hi Ann, I'll call the exec sponsor about it.")
        self.assertEqual((named.proposed, named.dropped), (0, 1))
        self.assertFalse(AgentAction.objects.filter(kind="draft.reply").exists())

    def test_a_plain_draft_is_proposed_with_its_email_id(self):
        plain = self.pass_("Hi Ann, yes: two years works.")
        self.assertEqual((plain.proposed, plain.dropped), (1, 0))
        action = AgentAction.objects.get(kind="draft.reply")
        self.assertEqual(action.payload["email_id"], self.mail.pk)
        self.assertEqual(action.before, self.mail.pk)
