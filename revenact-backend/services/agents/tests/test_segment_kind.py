"""segment.create (contract): the Ops agent's whole segment, workspace-level;
its preview counts the reader's own members; applied, it is the approver's
private segment; undo deletes it while untouched and unused."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.agents import evidence
from services.agents.actions import segments
from services.agents.kinds import ChangedSince, Invalid, Stale
from services.agents.tests.builder_fixtures import builder_action, definition
from services.agents.tests.fixtures import AgentsFixture
from services.campaigns.models import Campaign
from services.segments.models import Segment

CREATE = segments.CREATE


class SegmentKindTests(AgentsFixture):
    def ctx(self):
        return evidence.build(Organisation.objects.get(pk=self.org.pk), "ops", today=self.today)

    def action(self):
        return builder_action(self.org, "segment.create", definition())

    def applied(self):
        action = self.action()
        action.after, action.result = CREATE.apply(action, self.admin)
        action.status = "applied"
        action.save(update_fields=["after", "result", "status"])
        return action

    def undo(self, action, actor=None):
        with transaction.atomic():
            CREATE.undo(action, actor or self.admin)

    def test_the_kind(self):
        self.assertEqual(
            (CREATE.label, CREATE.max_level, CREATE.agents),
            ("Build a segment", "ask", ("ops",)),
        )
        self.assertTrue(CREATE.workspace_level and CREATE.builder and CREATE.per_reader)

    def test_validate_keeps_the_clean_definition_and_refuses_a_record(self):
        ctx = self.ctx()
        clean = CREATE.validate(definition(name=" Poor "), None, ctx, [])
        self.assertEqual(clean["name"], "Poor")
        self.assertEqual(CREATE.target(clean), "segment:customer:poor")
        self.assertEqual(CREATE.texts(clean), ["Poor", clean["description"]])
        row = ctx.records[f"customer:{self.pizza.pk}"]
        with self.assertRaises(Invalid):
            CREATE.validate(definition(), row, ctx, [])

    def test_the_preview_counts_the_readers_own_members(self):
        action = self.action()
        admin = CREATE.preview(action, self.admin)["segment"]
        self.assertEqual(
            {k: admin[k] for k in ("kind", "name", "conditions")},
            {"kind": "customer", "name": "Poor health", "conditions": 1},
        )
        self.assertGreaterEqual(admin["members"], 2)
        self.assertEqual(CREATE.preview(action, self.lee)["segment"]["members"], 0)

    def test_apply_makes_the_approvers_private_segment(self):
        action = self.applied()
        segment = Segment.objects.get(pk=action.result["segment_id"])
        self.assertEqual(
            (segment.owner, segment.sharing, segment.agent_action),
            (self.admin, "private", action),
        )
        self.assertEqual(
            action.after,
            {"segment_id": segment.pk, "updated_at": segment.updated_at.isoformat()},
        )
        self.assertIsNone(CREATE.current(action))
        with self.assertRaises(Stale):
            CREATE.apply(self.action_for("Other"), None)

    def action_for(self, name):
        return builder_action(self.org, "segment.create", definition(name=name))

    def test_undo_deletes_it_and_audits_the_undoer(self):
        action = self.applied()
        self.undo(action, self.lee)
        self.assertFalse(Segment.objects.exists())
        self.assertEqual(AuditEvent.objects.get(action="segment.deleted").actor, self.lee)

    def test_undo_refuses_with_the_contracts_sentences(self):
        action = self.applied()
        segment = Segment.objects.get(pk=action.result["segment_id"])
        Campaign.objects.create(organisation=self.org, owner=self.admin, name="C", segment=segment)
        with self.assertRaises(ChangedSince) as caught:
            self.undo(action)
        self.assertEqual(
            caught.exception.detail, "A scenario, campaign or survey uses this segment now."
        )
        later = timezone.now() + timedelta(minutes=1)
        Segment.objects.filter(pk=segment.pk).update(updated_at=later)
        with self.assertRaises(ChangedSince) as caught:
            self.undo(action)
        self.assertEqual(caught.exception.detail, "This segment has been edited since.")
        Segment.objects.filter(pk=segment.pk).delete()
        with self.assertRaises(ChangedSince) as caught:
            self.undo(action)
        self.assertEqual(caught.exception.detail, "This segment has been deleted.")
