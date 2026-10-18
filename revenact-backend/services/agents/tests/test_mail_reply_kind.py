"""mail.send_reply (agent bundles D3 contract §2.1, §3, §6, D3-1 to D3-3,
D3-11 to D3-14, D3-24). The mailbox is a fake: nothing is sent."""

from core.models import AuditEvent
from services.agents.actions import mail_replies
from services.agents.evidence import Context
from services.agents.kinds import FieldErrors, Invalid
from services.agents.tests.outside_fixtures import OutsideFixture
from services.mail.models import MailboxConnection
from services.metrics.models import AgentAction

STEP = "/api/v1/agents/bundles/{}/steps/{}/"
DETAIL = "/api/v1/agents/bundles/{}/"


class MailReplyTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.email, self.thread = self.mail_thread(self.pizza, self.csm)
        self.connection = self.gmail_for(self.csm)
        self.bundle = self.outside_bundle(
            self.thread, ("mail.send_reply", self.mail_payload(self.email))
        )
        self.step = self.bundle.steps.get()

    def source_ctx(self):
        ctx = Context(self.org, "cs", self.today)
        ctx.thread_email = {
            "id": self.email.pk,
            "record": f"customer:{self.pizza.pk}",
            "line": '    email 1: from Ann, unanswered: "help"',
            "address": "ann@x.com",
            "subject": "Re: Login loop",
            "mailbox_id": self.email.mailbox_id,
        }
        return ctx

    def test_the_model_writes_the_body_only(self):
        ctx = self.source_ctx()
        row = {"ref": f"customer:{self.pizza.pk}"}
        line = ctx.thread_email["line"].strip()
        clean = mail_replies.validate({"body": " Hi Ann ", "to": ["evil@x.com"]}, row, ctx, [line])
        self.assertEqual(
            clean,
            {
                "email_id": self.email.pk,
                "mailbox_id": self.email.mailbox_id,
                "to": ["ann@x.com"],
                "cc": [],
                "subject": "Re: Login loop",
                "body": "Hi Ann",
            },
        )
        for payload, evidence, record in (
            ({"body": ""}, [line], row),
            ({"body": "x" * 4001}, [line], row),
            ({"body": "Hi"}, ["another line"], row),
            ({"body": "Hi"}, [line], {"ref": "customer:999"}),
        ):
            with self.subTest(payload=payload, evidence=evidence):
                with self.assertRaises(Invalid):
                    mail_replies.validate(payload, record, ctx, evidence)

    def test_it_shows_who_it_goes_from_and_cant_be_undone(self):
        step = self.client_for(self.csm).get(DETAIL.format(self.bundle.pk)).json()["steps"][0]
        self.assertEqual(
            (step["label"], step["outside"], step["irreversible"], step["can_run"]),
            ("Send an email reply", True, True, True),
        )
        self.assertEqual(step["preview"]["mail"]["from"], "carl@acme.io")
        self.assertTrue(step["preview"]["mail"]["threaded"])
        self.assertEqual(step["editable"], ["to", "cc", "subject", "body"])
        # Mail is owner-only (2026-10-17): Carl's manager doesn't see it at all.
        self.assertEqual(
            self.client_for(self.mona).get(DETAIL.format(self.bundle.pk)).status_code, 404
        )
        # Without a mailbox that can send, Carl is told to connect one.
        MailboxConnection.objects.filter(pk=self.connection.pk).update(status="disconnected")
        carl = self.client_for(self.csm).get(DETAIL.format(self.bundle.pk)).json()["steps"][0]
        self.assertEqual(
            (carl["preview"]["mail"]["from"], carl["disabled_reason"], carl["disabled_link"]),
            (None, "Connect your mailbox to send this.", "/settings/connections"),
        )

    def test_a_run_sends_from_the_runners_mailbox_with_the_key(self):
        response = self.run_all_steps(self.csm, self.bundle)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            self.mail.sent,
            [
                {
                    "mailbox": self.connection.pk,
                    "source": self.email.pk,
                    "to": [self.email.from_address],
                    "cc": [],
                    "subject": f"Re: {self.email.subject}",
                    "body": "We're on it: the fix ships Friday.",
                    "key": f"b{self.bundle.pk}-s{self.step.pk}",
                }
            ],
        )
        self.step.refresh_from_db()
        self.assertEqual((self.step.status, self.step.irreversible), ("applied", True))
        self.assertEqual(
            (self.step.result["sent_by"], self.step.result["from"]), (self.csm.pk, "carl@acme.io")
        )
        call = AuditEvent.objects.get(action="agent_outside.call")
        self.assertEqual(
            {k: call.metadata[k] for k in ("tool", "op", "outcome", "returned")},
            {"tool": "mail", "op": "send", "outcome": "ok", "returned": "fake-1"},
        )
        reply = AuditEvent.objects.get(action="mailbox.reply")
        self.assertEqual(reply.metadata["to"], [self.email.from_address])
        undo = self.client_for(self.csm).post(f"/api/v1/agents/actions/{self.step.pk}/undo/")
        self.assertEqual(
            (undo.status_code, undo.json()["detail"]), (409, "This email has been sent.")
        )

    def test_a_refusal_fails_with_its_sentence_and_retry_sends(self):
        self.mail.refuse_next("Your mailbox didn't accept the message. Retry it.")
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(
            (self.step.status, self.step.error),
            ("failed", "Your mailbox didn't accept the message. Retry it."),
        )
        self.assertEqual(self.step.result["attempted_by"], self.csm.pk)
        self.assertEqual(self.retry(self.csm, self.step).status_code, 200)
        self.step.refresh_from_db()
        self.assertEqual(self.step.status, "applied")
        self.assertEqual(
            (len(self.mail.sent), self.mail.lookups), (1, [f"b{self.bundle.pk}-s{self.step.pk}"])
        )

    def test_a_lost_answer_is_found_on_retry_and_never_sent_twice(self):
        self.mail.drop_next()
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(
            self.step.error,
            "We couldn't confirm the email went out. Retry checks your Sent mail first.",
        )
        self.retry(self.csm, self.step)
        self.step.refresh_from_db()
        self.assertEqual(self.step.status, "applied")
        self.assertEqual(len(self.mail.sent), 1)
        lookup = AuditEvent.objects.filter(action="agent_outside.call", metadata__op="lookup").get()
        self.assertEqual(lookup.metadata["outcome"], "found")

    def test_a_refused_lookup_is_on_the_trail(self):
        self.mail.drop_next()
        self.run_all_steps(self.csm, self.bundle)
        self.mail.refuse_find("Your Gmail connection expired. Reconnect it, then Retry.")
        self.retry(self.csm, self.step)
        self.step.refresh_from_db()
        self.assertEqual(
            (self.step.status, self.step.error),
            ("failed", "Your Gmail connection expired. Reconnect it, then Retry."),
        )
        lookup = AuditEvent.objects.get(action="agent_outside.call", metadata__op="lookup")
        self.assertEqual(
            (lookup.metadata["outcome"], lookup.metadata["where"]),
            ("refused", f"mailbox {self.connection.pk}"),
        )
        self.assertEqual(len(self.mail.sent), 1)

    def test_only_the_runner_retries_a_reply(self):
        self.mail.refuse_next("Your mailbox didn't accept the message. Retry it.")
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        # Mail is owner-only (2026-10-17): Carl's manager can't even reach the step.
        self.assertEqual(self.retry(self.mona, self.step).status_code, 404)
        self.step.refresh_from_db()
        self.assertEqual(
            (self.step.status, self.step.error),
            ("failed", "Your mailbox didn't accept the message. Retry it."),
        )
        self.assertEqual(self.mail.sent, [])

    def test_a_stuck_settled_reply_is_still_its_runners_to_retry(self):
        # A crash leaves no attempt on the step: its runner is the bundle's (I1).
        from datetime import timedelta

        from django.utils import timezone

        from services.agents import bundles
        from services.agents.models import AgentBundle

        self.gmail_for(self.mona)
        AgentAction.objects.filter(pk=self.step.pk).update(selected=True)
        AgentBundle.objects.filter(pk=self.bundle.pk).update(
            status="running", run_by=self.csm, run_started_at=timezone.now() - timedelta(minutes=20)
        )
        bundles.settle_stuck(AgentBundle.objects.get(pk=self.bundle.pk))
        self.step.refresh_from_db()
        self.assertEqual((self.step.status, self.step.result), ("failed", {}))
        # Mail is owner-only (2026-10-17): Carl's manager can't even reach the step.
        self.assertEqual(self.retry(self.mona, self.step).status_code, 404)
        self.step.refresh_from_db()
        self.assertEqual(
            (self.step.status, self.step.error), ("failed", "This step didn't finish. Retry it.")
        )
        self.assertEqual((self.mail.sent, self.mail.lookups), ([], []))

    def test_a_runner_without_a_mailbox_that_can_send_fails_the_step(self):
        MailboxConnection.objects.filter(pk=self.connection.pk).update(provider="imap")
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(
            (self.step.status, self.step.error),
            ("failed", "Replies can't be sent from an IMAP mailbox yet."),
        )
        self.assertEqual(self.mail.sent, [])

    def test_edits(self):
        url = STEP.format(self.bundle.pk, self.step.pk)
        client = self.client_for(self.csm)
        bad = client.patch(
            url,
            {"fields": {"to": ["not-an-address"], "body": "Logged as {{step 1.ticket_key}}"}},
            format="json",
        )
        self.assertEqual(
            bad.json(),
            {
                "steps": {
                    str(self.step.pk): {
                        "to": ["Enter email addresses like ann@example.com."],
                        "body": ["This goes to a customer, so it can't use another step's result."],
                    }
                }
            },
        )
        empty = client.patch(url, {"fields": {"to": [], "subject": ""}}, format="json")
        self.assertEqual(
            empty.json()["steps"][str(self.step.pk)],
            {"to": ["Add someone to send it to."], "subject": ["Write a subject."]},
        )
        many = client.patch(
            url, {"fields": {"cc": [f"p{n}@x.com" for n in range(11)]}}, format="json"
        )
        self.assertEqual(
            many.json()["steps"][str(self.step.pk)], {"cc": ["Send to at most 10 people."]}
        )
        good = client.patch(url, {"fields": {"cc": ["Ops@PizzaHut.com"]}}, format="json")
        self.assertEqual(good.status_code, 200)
        self.step.refresh_from_db()
        self.assertEqual(self.step.payload["cc"], ["ops@pizzahut.com"])

    def test_the_edit_function_refuses_a_placeholder_in_the_subject(self):
        with self.assertRaises(FieldErrors) as caught:
            mail_replies.edit(self.step, {"subject": "Re: {{step 1.ticket_key}}"}, self.csm)
        self.assertEqual(caught.exception.errors, {"subject": [mail_replies.TO_CUSTOMER]})
