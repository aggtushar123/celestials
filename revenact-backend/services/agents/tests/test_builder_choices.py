"""Delivery 3's choices (contract): five kinds after plan.start and before
initiative.create; whether a kind is workspace-level is the registry's
word, not the model's."""

from django.test import SimpleTestCase

from services.metrics.models import AgentAction

FIVE = ["segment.create", "scenario.create", "campaign.create", "canvas.create", "plan.template"]


class BuilderChoicesTests(SimpleTestCase):
    def test_the_five_kinds_sit_between_plan_start_and_initiative(self):
        keys = list(AgentAction.Kind.values)
        at = keys.index("plan.start")
        self.assertEqual(keys[at + 1 : at + 6], FIVE)
        self.assertEqual(keys[at + 6], "initiative.create")
        labels = [AgentAction.Kind(key).label for key in FIVE]
        self.assertEqual(
            labels,
            [
                "Build a segment",
                "Build a scenario",
                "Draft a campaign",
                "Map a record's people",
                "Write a plan template",
            ],
        )

    def test_workspace_level_is_the_registrys(self):
        self.assertTrue(AgentAction(kind="initiative.create").workspace_level)
        self.assertFalse(AgentAction(kind="record.lifecycle").workspace_level)
        self.assertFalse(AgentAction(kind="no.such.kind").workspace_level)
