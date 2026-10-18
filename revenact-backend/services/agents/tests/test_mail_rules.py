"""The drop rules for mail and tickets (contract, `draft.reply`): only a
draft cites an email or ticket line; no other action names its record's
email subject or ticket title; a draft names no task, note or other source;
another record's subjects and titles are foreign to every action."""

import json
from datetime import timedelta
from unittest.mock import patch

from services.accounts.models import Organisation
from services.agents import evidence, run
from services.agents.tests.drafts_fixtures import inbound, mailbox, ticket
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import Task


class MailRulesTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        mailbox(cls.csm)
        cls.mail = inbound(cls.pizza, cls.csm, subject="Renewal pricing terms")
        cls.issue = ticket(cls.pizza, title="Export fails on large files")
        cls.elsewhere = ticket(cls.taco, title="Dashboard is very slow", number="TKT-9")
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

    def ctx(self):
        return evidence.build(Organisation.objects.get(pk=self.org.pk), "cs", today=self.today)

    def test_source_lines_are_the_records_email_and_ticket(self):
        ctx = self.ctx()
        self.assertEqual(
            evidence.source_lines(ctx, self.ref),
            {
                ctx.emails[self.mail.pk]["line"].strip(),
                ctx.tickets[self.issue.pk]["line"].strip(),
            },
        )
        self.assertEqual(evidence.source_lines(ctx, None), set())

    def test_naming_the_records_own_sources(self):
        ctx = self.ctx()
        self.assertTrue(
            evidence.source_mentions(ctx, self.ref, ["Revisit the renewal pricing terms"])
        )
        self.assertTrue(
            evidence.source_mentions(ctx, self.ref, ["", "export fails on large files"])
        )
        self.assertFalse(evidence.source_mentions(ctx, self.ref, ["Renew soon"]))

    def test_a_draft_names_nothing_internal(self):
        ctx = self.ctx()
        internal = evidence.internal_mentions
        self.assertTrue(internal(ctx, self.ref, ["Hi Ann, I'll call the exec sponsor."], "email"))
        self.assertTrue(internal(ctx, self.ref, ["Also: export fails on large files"], "email"))
        self.assertFalse(internal(ctx, self.ref, ["Re your renewal pricing terms"], "email"))
        self.assertFalse(internal(ctx, self.ref, ["The export fails on large files"], "ticket"))

    def test_a_draft_never_names_the_records_open_plan(self):
        from services.plans.models import Plan

        Plan.objects.create(
            organisation=self.org,
            customer=self.pizza,
            kind="onboarding",
            owner=self.csm,
            start_date=self.today,
            target_date=self.today,
            name="Churn rescue playbook",
        )
        ctx = self.ctx()
        text = ["Hi Ann, our churn rescue playbook starts Monday."]
        self.assertTrue(evidence.internal_mentions(ctx, self.ref, text, "email"))

    def test_another_records_ticket_is_foreign(self):
        ctx = self.ctx()
        self.assertTrue(evidence.foreign_mentions(ctx, self.ref, ["Dashboard is very slow"]))
        taco = f"customer:{self.taco.pk}"
        self.assertFalse(evidence.foreign_mentions(ctx, taco, ["Dashboard is very slow"]))

    def pass_(self, *items):
        with (
            patch("services.agents.policy.plan_credits", return_value=3000),
            patch("services.agents.run.get_completion", return_value=json.dumps(list(items))),
        ):
            return run.run(Organisation.objects.get(pk=self.org.pk), "cs")

    def note(self, title, cite):
        return {
            "kind": "note.create",
            "record": self.ref,
            "title": title,
            "rationale": "From the record.",
            "evidence": [cite],
            "payload": {"title": title, "body": "Worth a look."},
        }

    def test_only_a_draft_cites_an_email_or_ticket_line(self):
        ctx = self.ctx()
        email = ctx.emails[self.mail.pk]["line"].strip()
        result = self.pass_(self.note("Renewal call due", email))
        self.assertEqual((result.proposed, result.dropped), (0, 1))

    def test_no_other_kind_names_the_records_mail(self):
        ctx = self.ctx()
        header = next(x for x in sorted(evidence.record_lines(ctx, self.ref)) if x.startswith("- "))
        named = self.pass_(self.note("About the renewal pricing terms", header))
        self.assertEqual((named.proposed, named.dropped), (0, 1))
        plain = self.pass_(self.note("Renewal is near", header))
        self.assertEqual((plain.proposed, plain.dropped), (1, 0))
