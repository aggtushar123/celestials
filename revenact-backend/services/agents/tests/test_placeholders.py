"""`{{step N.key}}` (contract §6): found in top-level text, checked against
earlier steps' outputs at proposal, filled at run, and outputs carry links."""

from django.test import SimpleTestCase

from services.agents import placeholders
from services.agents.kinds import Invalid
from services.agents.registry import REGISTRY


class FindAndLabelTests(SimpleTestCase):
    def test_find_reads_top_level_text_and_allows_spaces(self):
        payload = {
            "title": "Follow up {{step 1.task_url}}",
            "body": "See {{ step 2.campaign_id }}",
            "n": 3,
        }
        self.assertEqual(
            placeholders.find(payload), [("title", 1, "task_url"), ("body", 2, "campaign_id")]
        )
        self.assertEqual(placeholders.find({"title": "{{step x.y}} and {braces}"}), [])

    def test_labels(self):
        self.assertEqual(placeholders.label(1, "task_url"), "Task link from step 1")
        self.assertEqual(placeholders.label(2, "campaign_id"), "Campaign from step 2")
        self.assertEqual(placeholders.label(1, "rule_url"), "Scenario link from step 1")
        self.assertEqual(placeholders.label(1, "canvas_id"), "Map from step 1")


class CheckTests(SimpleTestCase):
    def test_a_placeholder_must_name_an_earlier_producer(self):
        kinds = {1: "task.create", 2: "note.create"}
        placeholders.check({"body": "{{step 1.task_url}}"}, 2, kinds)
        for payload, position in (
            ({"body": "{{step 2.note_id}}"}, 2),  # itself
            ({"body": "{{step 3.task_url}}"}, 2),  # later
            ({"body": "{{step 1.campaign_url}}"}, 2),  # not what task.create makes
            ({"body": "{{step 9.task_url}}"}, 2),  # no such step
        ):
            with self.subTest(payload=payload), self.assertRaises(Invalid):
                placeholders.check(payload, position, kinds)


class FillTests(SimpleTestCase):
    def test_renumber(self):
        self.assertEqual(
            placeholders.renumber({"body": "See {{ step 2.task_url }}"}, {2: 1}),
            {"body": "See {{step 1.task_url}}"},
        )
        with self.assertRaises(Invalid):
            placeholders.renumber({"body": "{{step 3.task_url}}"}, {2: 1})

    def test_fill_replaces_from_outputs(self):
        filled = placeholders.fill(
            {"title": "Chase {{step 1.task_url}}", "priority": "high"},
            {1: {"task_id": 9, "task_url": "/work/mine?task=9"}},
        )
        self.assertEqual(filled, {"title": "Chase /work/mine?task=9", "priority": "high"})

    def test_a_step_that_did_not_run_is_needed(self):
        with self.assertRaises(placeholders.NeedsStep) as caught:
            placeholders.fill({"title": "Chase {{step 1.task_url}}"}, {})
        self.assertEqual(caught.exception.position, 1)
        self.assertEqual(placeholders.needs_sentence(1), "Needs step 1, which didn't run.")


class OutputsTests(SimpleTestCase):
    def test_ids_and_their_links(self):
        self.assertEqual(
            placeholders.outputs_for({"task_id": 9, "customer_id": 4}),
            {"task_id": 9, "task_url": "/work/mine?task=9"},
        )
        self.assertEqual(
            placeholders.outputs_for({"campaign_id": 3, "segment_id": 5}),
            {
                "campaign_id": 3,
                "campaign_url": "/campaigns/3",
                "segment_id": 5,
                "segment_url": "/segments/5",
            },
        )
        self.assertEqual(placeholders.outputs_for({"note_id": 2}), {"note_id": 2})
        self.assertEqual(placeholders.outputs_for(None), {})

    def test_every_kind_declares_what_it_makes(self):
        expected = {
            "task.create": ("task_id", "task_url"),
            "note.create": ("note_id",),
            "draft.reply": ("draft_id",),
            "campaign.create": ("campaign_id", "campaign_url", "segment_id", "segment_url"),
            "segment.create": ("segment_id", "segment_url"),
            "scenario.create": ("rule_id", "rule_url", "segment_id", "segment_url"),
            "canvas.create": ("canvas_id", "canvas_url"),
            "plan.start": ("plan_id",),
            "plan.template": ("template_id",),
            "initiative.create": ("initiative_id",),
        }
        for kind, outputs in expected.items():
            with self.subTest(kind=kind):
                self.assertEqual(REGISTRY[kind].outputs, outputs)


class OutsidePlaceholderTests(SimpleTestCase):
    """Agent bundles D3 contract D3-17: outside outputs are text, chips name
    them, and a customer-facing field is never filled."""

    def test_outside_outputs_are_kept_as_text(self):
        result = {
            "ticket_key": "SUP-123",
            "ticket_url": "https://acme.atlassian.net/browse/SUP-123",
            "slack_ts": "1760340000.000200",
            "slack_url": "https://slack.com/archives/C0SUPPORT/p1760340000000200",
            "email_id": 88,
            "attempted_by": 3,
            "ticket_title": "",
        }
        self.assertEqual(
            placeholders.outputs_for(result),
            {
                "email_id": 88,
                "ticket_key": "SUP-123",
                "ticket_url": "https://acme.atlassian.net/browse/SUP-123",
                "slack_ts": "1760340000.000200",
                "slack_url": "https://slack.com/archives/C0SUPPORT/p1760340000000200",
            },
        )

    def test_chips_name_a_jira_ticket_and_a_slack_message(self):
        self.assertEqual(placeholders.label(1, "ticket_key"), "Jira key from step 1")
        self.assertEqual(placeholders.label(2, "ticket_url"), "Jira link from step 2")
        self.assertEqual(placeholders.label(1, "slack_url"), "Slack message link from step 1")

    def test_a_skipped_field_is_left_as_written(self):
        payload = {"body": "See {{step 1.ticket_key}}", "title": "Fix {{step 1.ticket_key}}"}
        filled = placeholders.fill(payload, {1: {"ticket_key": "SUP-9"}}, skip=("body",))
        self.assertEqual(filled, {"body": "See {{step 1.ticket_key}}", "title": "Fix SUP-9"})

    def test_a_skipped_field_never_needs_its_step(self):
        payload = {"body": "See {{step 1.ticket_key}}"}
        self.assertEqual(placeholders.fill(payload, {}, skip=("body",)), payload)
