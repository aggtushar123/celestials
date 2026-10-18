"""A builder action's segment (contract): made private for the approver, its
rules checked again as them, its baseline set and its event audited with
them as actor; refused past 50; released on undo only while untouched and
unused."""

from datetime import timedelta

from django.utils import timezone

from core.models import AuditEvent
from services.agents import builder
from services.agents.kinds import OwnerLimit, Stale
from services.agents.tests.builder_fixtures import builder_action, definition
from services.agents.tests.fixtures import AgentsFixture
from services.campaigns.models import Campaign
from services.segments.models import Segment


class CreateSegmentTests(AgentsFixture):
    def setUp(self):
        self.action = builder_action(self.org, "segment.create", definition())

    def test_it_is_the_approvers_private_segment_with_its_baseline(self):
        segment = builder.create_segment(self.action, definition(), self.admin)
        self.assertEqual(
            (segment.owner, segment.sharing, segment.agent_action, segment.kind),
            (self.admin, "private", self.action, "customer"),
        )
        segment.refresh_from_db()
        self.assertIsNotNone(segment.member_count)
        self.assertEqual(segment.last_evaluated_on, timezone.localdate())
        event = AuditEvent.objects.get(action="segment.created")
        self.assertEqual(
            (event.actor, event.metadata),
            (self.admin, {"kind": "customer", "agent_action": self.action.pk}),
        )
        self.assertEqual(
            builder.stamp(Segment, segment.pk),
            Segment.objects.get(pk=segment.pk).updated_at.isoformat(),
        )

    def test_rules_naming_what_the_approver_cannot_open_are_stale(self):
        rules = {
            "match": "all",
            "conditions": [{"field": "organisation", "op": "is", "value": self.pizza.pk}],
        }
        with self.assertRaises(Stale):
            builder.create_segment(self.action, definition(kind="account", rules=rules), self.lee)
        self.assertFalse(Segment.objects.exists())

    def test_past_fifty_it_is_an_owner_limit(self):
        Segment.objects.bulk_create(
            Segment(organisation=self.org, owner=self.admin, name=f"S{i}", kind="customer")
            for i in range(50)
        )
        with self.assertRaises(OwnerLimit) as caught:
            builder.create_segment(self.action, definition(), self.admin)
        self.assertEqual(caught.exception.detail, "You already own 50 segments.")

    def test_release_takes_only_an_untouched_unused_segment(self):
        def made():
            segment = builder.create_segment(self.action, definition(), self.admin)
            return segment, builder.stamp(Segment, segment.pk)

        segment, at = made()
        self.assertTrue(builder.release_segment(self.action, segment.pk, at, self.mona))
        self.assertFalse(Segment.objects.filter(pk=segment.pk).exists())
        event = AuditEvent.objects.get(action="segment.deleted")
        self.assertEqual((event.actor, event.metadata), (self.mona, {"kind": "customer"}))
        self.assertFalse(builder.release_segment(self.action, segment.pk, at, self.mona))

        edited, at = made()
        later = timezone.now() + timedelta(minutes=1)
        Segment.objects.filter(pk=edited.pk).update(updated_at=later)
        self.assertFalse(builder.release_segment(self.action, edited.pk, at, self.mona))

        used, at = made()
        Campaign.objects.create(organisation=self.org, owner=self.admin, name="C", segment=used)
        self.assertTrue(builder.segment_in_use(used))
        self.assertFalse(builder.release_segment(self.action, used.pk, at, self.mona))
        self.assertEqual(Segment.objects.filter(pk__in=[edited.pk, used.pk]).count(), 2)
