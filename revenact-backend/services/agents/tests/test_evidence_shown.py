"""Evidence as people read it (by-eye C3): a ticket named by its number
(else its title), an email or a message without our own id. The stored
line keeps the ids the model quotes back, so citations and a draft
reply's source resolve as before; only the shown label changes."""

from django.test import SimpleTestCase
from django.utils import timezone

from services.agents import evidence, intake_bundles, prompt
from services.agents.bundle_payloads import step_payload
from services.agents.policy import policy_for
from services.agents.prompt import ThreadAnswer
from services.agents.tests.bundle_fixtures import BUNDLES
from services.agents.tests.intake_fixtures import IntakeFixture

ACTIONS = "/api/v1/agents/actions/"


class ShownLineTests(SimpleTestCase):
    def test_a_ticket_is_named_by_its_number(self):
        self.assertEqual(
            evidence.shown('ticket 738 "ZD-QA-1043": "[QA] SSO setup question", open since x'),
            'ticket ZD-QA-1043: "[QA] SSO setup question", open since x',
        )

    def test_a_ticket_without_a_number_is_named_by_its_title(self):
        self.assertEqual(
            evidence.shown('ticket 738 "": "SSO setup question", open since x'),
            'ticket: "SSO setup question", open since x',
        )

    def test_an_email_and_a_message_lose_our_id(self):
        self.assertEqual(
            evidence.shown('email 12: from "Ann <a@x.com>", subject "Hi"'),
            'email: from "Ann <a@x.com>", subject "Hi"',
        )
        self.assertEqual(
            evidence.shown('    message 13: we wrote, 2026-10-13T07:40: "On it."'),
            'message: we wrote, 2026-10-13T07:40: "On it."',
        )

    def test_other_lines_are_kept(self):
        for line in (
            "Renews in 30 days",
            'task 5: "Call Ann", assigned to nobody, due 2026-10-20, open',
            'note: "ticket 738 was escalated"',
        ):
            self.assertEqual(evidence.shown(line), line)


class ShownOverTheApiTests(IntakeFixture):
    def place(self, ctx, route, thread, *items):
        return intake_bundles.place(
            self.org,
            thread,
            route,
            "cs",
            ThreadAnswer("Pizza Hut: login loop", "They are locked out.", list(items)),
            ctx,
            policy_for(self.org),
            timezone.now(),
        ).bundle

    def item(self, ctx, line, kind="note.create", payload=None):
        return {
            "kind": kind,
            "record": ctx.thread_ref,
            "title": "Log the login loop",
            "rationale": "Locked out.",
            "evidence": [line],
            "payload": payload or {"title": "Login loop", "body": "Locked out since Monday."},
        }

    def labels(self, bundle):
        body = self.client_for(self.admin).get(f"{BUNDLES}{bundle.pk}/").json()
        return [[e["label"] for e in step["evidence"]] for step in body["steps"]]

    def test_a_ticket_step_cites_by_id_and_shows_the_number(self):
        ticket, thread = self.ticket_thread(self.pizza, number="ZD-1042")
        ctx, route = self.thread_ctx(thread)
        line = self.thread_line(ctx, "ticket ")
        bundle = self.place(
            ctx,
            route,
            thread,
            self.item(ctx, line),
            self.item(
                ctx,
                line,
                kind="draft.reply",
                payload={"ticket_id": ticket.pk, "body": "Hi Ann, we're on it."},
            ),
        )
        steps = list(bundle.steps.order_by("position"))
        # Stored as cited: the draft still names its source by id.
        self.assertEqual([s.evidence for s in steps], [[line.strip()], [line.strip()]])
        self.assertEqual(steps[1].payload["ticket_id"], ticket.pk)
        shown = f'ticket ZD-1042: "{ticket.title}"'
        for labels in self.labels(bundle):
            self.assertTrue(labels[0].startswith(shown), labels)
            self.assertNotIn(f"ticket {ticket.pk} ", labels[0])
        activity = self.client_for(self.admin).get(ACTIONS).json()["results"]
        self.assertTrue(all(r["evidence"][0]["label"].startswith(shown) for r in activity))

    def test_a_mail_step_shows_no_email_id(self):
        email, thread = self.mail_thread(self.pizza, self.csm)
        ctx, route = self.thread_ctx(thread)
        line = self.thread_line(ctx, "email ")
        bundle = self.place(ctx, route, thread, self.item(ctx, line))
        # Mail bundles are read only by the mailbox's readers: the step's
        # payload as a view-all reader would get it.
        (step,) = bundle.steps.all()
        self.assertEqual(step.evidence, [line.strip()])
        labels = [e["label"] for e in step_payload(step, self.admin)["evidence"]]
        self.assertTrue(labels[0].startswith("email: from "), labels)
        self.assertNotIn(f"email {email.pk}", labels[0])


class PromptNamesTicketsAsPeopleDoTests(SimpleTestCase):
    def test_both_prompts_ask_for_numbers_not_ids(self):
        nightly = prompt.system("cs", ["note.create"], "friendly")
        thread = prompt.thread_system("cs", ["note.create"], "friendly", "customer:1")
        for text in (nightly, thread):
            self.assertIn(prompt.NAME_SOURCES, text)
