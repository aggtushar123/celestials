"""The agent is told why bundles on a record were rejected (spec §4.3, D16):
the title and the reason, 30 days, three at most, never the note, and never
quotable as evidence."""

from datetime import timedelta

from django.utils import timezone

from services.accounts.models import Organisation
from services.agents import evidence
from services.agents.models import AgentBundle
from services.agents.tests.bundle_fixtures import BundleFixture, note


class RejectionFeedbackTests(BundleFixture):
    def rejected(
        self, record, title, reason, *, days=1, note_text="Secret: Soup Co churns", **fields
    ):
        bundle = self.bundle_of(record, note(), title=title, **fields)
        AgentBundle.objects.filter(pk=bundle.pk).update(
            status="rejected",
            reject_reason=reason,
            reject_note=note_text,
            updated_at=timezone.now() - timedelta(days=days),
        )
        return bundle

    def test_the_record_block_names_the_title_and_reason_never_the_note(self):
        self.rejected(self.pizza, "Move Pizza Hut to renewal", "not_relevant")
        self.rejected(self.pizza, "Old one", "other", days=31)
        ctx = evidence.build(Organisation.objects.get(pk=self.org.pk), "cs", today=self.today)
        lines = evidence.record_block(ctx, ctx.records[f"customer:{self.pizza.pk}"])
        found = [line for line in lines if line.strip().startswith("rejected:")]
        self.assertEqual(len(found), 1)
        self.assertIn('"Move Pizza Hut to renewal" (Not relevant,', found[0])
        self.assertNotIn("Secret", "\n".join(lines))
        self.assertNotIn("Old one", "\n".join(lines))

    def test_at_most_three_and_never_quotable(self):
        for number in range(5):
            self.rejected(self.pizza, f"Rejected {number}", "other", days=number + 1)
        ctx = evidence.build(Organisation.objects.get(pk=self.org.pk), "cs", today=self.today)
        ref = f"customer:{self.pizza.pk}"
        lines = [
            line for line in evidence.record_block(ctx, ctx.records[ref]) if "rejected:" in line
        ]
        self.assertEqual(len(lines), 3)
        self.assertIsNone(evidence.match_line(ctx, ref, lines[0].strip()))

    def block(self):
        ctx = evidence.build(Organisation.objects.get(pk=self.org.pk), "cs", today=self.today)
        return "\n".join(evidence.record_block(ctx, ctx.records[f"customer:{self.pizza.pk}"]))

    def test_only_the_agents_own_rejections(self):
        self.rejected(self.pizza, "Sales wanted an upsell", "other", agent="sales")
        self.rejected(self.pizza, "CS wanted a save call", "other")
        block = self.block()
        self.assertNotIn("Sales wanted an upsell", block)
        self.assertIn("CS wanted a save call", block)

    def test_a_draft_reply_bundles_title_is_masked(self):
        bundle = self.rejected(self.pizza, "Reply to Jo about the refund", "wrong_person")
        self.step(self.pizza, kind="draft.reply", payload={}, bundle=bundle)
        block = self.block()
        self.assertNotIn("Reply to Jo", block)
        self.assertIn('rejected: "A draft reply" (Wrong person,', block)
