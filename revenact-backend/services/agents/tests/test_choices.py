"""Delivery 2's new choices (contract): two action kinds, after note.create
and before initiative.create, and the agent_draft_ready notification."""

from django.test import SimpleTestCase

from services.metrics.models import AgentAction
from services.notifications.models import Notification


class NewChoicesTests(SimpleTestCase):
    def test_the_two_kinds_sit_between_note_and_initiative(self):
        keys = list(AgentAction.Kind.values)
        at = keys.index("note.create")
        self.assertEqual(keys[at + 1 : at + 3], ["draft.reply", "plan.start"])
        self.assertEqual(AgentAction.Kind.DRAFT_REPLY.label, "Draft a reply")
        self.assertEqual(AgentAction.Kind.PLAN_START.label, "Start a plan")

    def test_the_draft_ready_notification(self):
        self.assertEqual(Notification.Kind.AGENT_DRAFT_READY, "agent_draft_ready")
        self.assertEqual(Notification.Kind.AGENT_DRAFT_READY.label, "Agent draft ready")
