"""The framework the builder kinds stand on (contract): `result` names every
thing a kind can make, a per-reader preview is written for its reader, and
an owner limit is its own exception."""

import dataclasses
from unittest.mock import patch

from core.models import AuditEvent
from services.agents.kinds import OwnerLimit
from services.agents.payloads import action_payload
from services.agents.registry import REGISTRY
from services.agents.tests.bundle_fixtures import run_one
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import Note
from services.metrics.models import AgentAction


class FrameworkTests(AgentsFixture):
    def note(self, **fields):
        return AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="note.create",
            customer=self.pizza,
            target="note:t",
            title="t",
            rationale="r",
            payload={"title": "t", "body": "b"},
            **fields,
        )

    def test_result_carries_every_made_thing(self):
        action = self.note(status="applied", result={"segment_id": 4, "rule_id": 5})
        self.assertEqual(
            action_payload(action, self.admin)["result"],
            {
                "task_id": None,
                "note_id": None,
                "initiative_id": None,
                "draft_id": None,
                "plan_id": None,
                "segment_id": 4,
                "rule_id": 5,
                "campaign_id": None,
                "canvas_id": None,
                "template_id": None,
            },
        )

    def test_a_per_reader_preview_is_written_for_its_reader(self):
        spec = dataclasses.replace(
            REGISTRY["note.create"],
            per_reader=True,
            preview=lambda action, reader: {"note": {"title": reader.name}},
        )
        action = self.note()
        with patch.dict(REGISTRY, {"note.create": spec}):
            self.assertEqual(
                action_payload(action, self.csm)["preview"], {"note": {"title": "Carl CSM"}}
            )
            self.assertEqual(
                action_payload(action, self.admin)["preview"], {"note": {"title": "Alice Admin"}}
            )

    def test_the_defaults_change_no_existing_kind(self):
        builders = {
            "segment.create",
            "scenario.create",
            "campaign.create",
            "canvas.create",
            "survey.send",
            "campaign.send",
            "mail.send_reply",
            "slack.reply",
            "jira.create",
            "jira.assign",
            "jira.comment",
            # Slack bundles: a count or a link the reader's own rules decide.
            "survey.record",
            "segment.pin",
            "scenario.run",
            # Guided agent: what each reader may see of a diagnosis and a draft.
            "record.diagnose",
            "mail.compose",
            "mail.send_draft",
            # Sales review report: the counts the organiser may see.
            "report.sales",
        }
        for spec in REGISTRY.values():
            if spec.key in builders | {"plan.template"}:
                continue
            self.assertFalse(spec.per_reader, spec.key)
            self.assertFalse(spec.builder, spec.key)
            self.assertIsNone(spec.texts, spec.key)

    def test_an_owner_limit_carries_its_sentence(self):
        self.assertEqual(
            OwnerLimit("You already own 50 segments.").detail, "You already own 50 segments."
        )


class OwnerLimitDecisionTests(AgentsFixture):
    def test_a_limit_fails_the_step_and_rolls_it_back(self):
        def apply(action, actor, **_):
            Note.objects.create(
                customer=action.customer, title="Made first", body="b", logged_at=self.today
            )
            raise OwnerLimit("You already own 50 segments.")

        spec = dataclasses.replace(REGISTRY["note.create"], apply=apply)
        action = AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="note.create",
            customer=self.pizza,
            target="note:t",
            title="t",
            rationale="r",
            payload={"title": "t", "body": "b"},
        )
        with patch.dict(REGISTRY, {"note.create": spec}):
            response = run_one(self.client_for(self.csm), action)
        self.assertEqual(response.status_code, 200, response.data)
        (step,) = response.data["bundle"]["steps"]
        self.assertEqual(
            (step["status"], step["error"]), ("failed", "You already own 50 segments.")
        )
        self.assertEqual(response.data["bundle"]["status"], "partly_done")
        action.refresh_from_db()
        # The step's own transaction rolled back: it is failed, not applied.
        self.assertEqual((action.status, action.applied_at), ("failed", None))
        self.assertFalse(Note.objects.filter(title="Made first").exists())
        self.assertFalse(AuditEvent.objects.filter(action="agent_action.approved").exists())
