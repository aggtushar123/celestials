"""Builder actions in a pass (contract): proposed only citing the workspace
figures (a map: its record's people line), never naming a record, task or
note in any text, and at most one a pass."""

import json
from unittest.mock import patch

from services.accounts.models import Organisation
from services.agents import evidence, run
from services.agents.policy import profiles_for
from services.agents.tests.builder_fixtures import FIGURES, definition
from services.agents.tests.fixtures import AgentsFixture
from services.agents.tests.test_campaign_kind import campaign
from services.agents.tests.test_scenario_kind import scenario
from services.customers.models import Contact, Task
from services.metrics.models import AgentAction
from services.surveys.tests.fixtures import contact

TASK = {"title": "Call the champion", "priority": "high", "offset_days": 2}


def item(kind, payload, *, cite=FIGURES, record=None, title="Build it", rationale=None):
    return {
        "kind": kind,
        "record": record,
        "title": title,
        "rationale": rationale or "Poor health is rising.",
        "evidence": [cite],
        "payload": payload,
    }


def segment(**fields):
    return item("segment.create", definition(**fields))


def template(**fields):
    milestones = [{"name": "Diagnose", "offset_days": 0, "tasks": [TASK]}]
    payload = {"kind": "save", "name": "Save plan", "description": "", "milestones": milestones}
    return item("plan.template", {**payload, **fields})


class BuilderRunTests(AgentsFixture):
    def setUp(self):
        with patch("services.agents.policy.plan_credits", return_value=3000):
            profiles_for(self.org)

    def org_now(self):
        return Organisation.objects.get(pk=self.org.pk)

    def pass_(self, *items, agent="ops"):
        with (
            patch("services.agents.run.get_completion", return_value=json.dumps(list(items))),
            patch("services.agents.evidence.figure_lines", return_value=[FIGURES]),
        ):
            return run.run(self.org_now(), agent)

    def test_a_segment_citing_the_figures_is_proposed(self):
        result = self.pass_(segment())
        self.assertEqual((result.proposed, result.dropped), (1, 0))
        action = AgentAction.objects.get(kind="segment.create")
        self.assertEqual((action.status, action.customer, action.account), ("proposed", None, None))
        self.assertEqual(action.payload["name"], "Poor health")
        self.assertEqual(action.evidence, [FIGURES])

    def test_a_builder_citing_a_record_line_is_dropped(self):
        ctx = evidence.build(self.org_now(), "ops", today=self.today)
        line = next(
            x
            for x in sorted(evidence.record_lines(ctx, f"customer:{self.pizza.pk}"))
            if x.startswith("- ")
        )
        result = self.pass_({**segment(), "evidence": [line]})
        self.assertEqual((result.proposed, result.dropped), (0, 1))

    def test_no_text_names_a_record_task_or_note(self):
        Task.objects.create(
            customer=self.pizza,
            title="Escalate the invoice dispute",
            due_date=self.today,
        )
        result = self.pass_(
            segment(name="Pizza Hut and friends"),
            segment(description="Like Dough Co, poor health."),
            segment(description="Escalate the invoice dispute first."),
            template(
                milestones=[
                    {"name": "M", "offset_days": 0, "tasks": [{**TASK, "title": "Call Soup Co"}]}
                ]
            ),
        )
        self.assertEqual((result.proposed, result.dropped), (0, 4))

    def test_one_builder_action_a_pass(self):
        result = self.pass_(segment(), template())
        self.assertEqual((result.proposed, result.dropped), (1, 1))
        self.assertEqual(
            list(AgentAction.objects.values_list("kind", flat=True)), ["segment.create"]
        )

    def test_a_dropped_builder_leaves_room_for_the_next(self):
        result = self.pass_(segment(kind="deal"), template())
        self.assertEqual((result.proposed, result.dropped), (1, 1))
        self.assertTrue(AgentAction.objects.filter(kind="plan.template").exists())

    def test_a_map_cites_its_records_people_line(self):
        contact(self.pizza, "Ann", Contact.Role.CHAMPION)
        ref = f"customer:{self.pizza.pk}"
        ctx = evidence.build(self.org_now(), "cs", today=self.today)
        line = ctx.records[ref]["people"]
        other = next(x for x in sorted(evidence.record_lines(ctx, ref)) if x.startswith("- "))
        result = self.pass_(
            item("canvas.create", {"name": "Pizza people"}, cite=other, record=ref),
            item("canvas.create", {"name": "Pizza people"}, cite=line, record=ref),
            agent="cs",
        )
        self.assertEqual((result.proposed, result.dropped), (1, 1))
        action = AgentAction.objects.get(kind="canvas.create")
        self.assertEqual(
            (action.customer, action.target, action.evidence), (self.pizza, "canvas", [line])
        )

    def test_a_rationale_may_name_a_figures_account(self):
        # Important 1 (final review): the title and rationale never reach the
        # built object, and a workspace builder is read by view-all only; the
        # prompt asks the rationale to quote the figures, accounts included.
        figures = {"accounts": [{"id": 1, "name": "Globex Corp"}]}
        rationale = "Globex Corp and Dough Co renew within 30 days at poor health."
        with patch("services.metrics.proposals.build_evidence", return_value=figures):
            result = self.pass_(
                item("segment.create", definition(), title="Globex Corp", rationale=rationale)
            )
        self.assertEqual((result.proposed, result.dropped), (1, 0))
        self.assertEqual(AgentAction.objects.get(kind="segment.create").rationale, rationale)

    def test_the_built_objects_own_text_still_names_no_figures_account(self):
        figures = {"accounts": [{"id": 1, "name": "Globex Corp"}]}
        with patch("services.metrics.proposals.build_evidence", return_value=figures):
            result = self.pass_(segment(name="Globex Corp lookalikes"))
            self.assertEqual((result.proposed, result.dropped), (0, 1))
            result = self.pass_(segment(description="Accounts like Globex Corp."))
            self.assertEqual((result.proposed, result.dropped), (0, 1))
        self.assertFalse(AgentAction.objects.exists())

    def test_one_builder_action_a_pass_across_kinds(self):
        # Ruling 9: a map on a record and a workspace segment share the budget.
        contact(self.pizza, "Ann", Contact.Role.CHAMPION)
        ref = f"customer:{self.pizza.pk}"
        ctx = evidence.build(self.org_now(), "ops", today=self.today)
        line = ctx.records[ref]["people"]
        result = self.pass_(
            item("canvas.create", {"name": "Pizza people"}, cite=line, record=ref),
            segment(),
        )
        self.assertEqual((result.proposed, result.dropped), (1, 1))
        self.assertEqual(
            list(AgentAction.objects.values_list("kind", flat=True)), ["canvas.create"]
        )

    def test_a_scenario_step_message_naming_a_record_is_dropped(self):
        notify = {"action": "notify", "to": "me", "message": "Dough Co entered the segment."}
        result = self.pass_(item("scenario.create", scenario(actions=[notify])))
        self.assertEqual((result.proposed, result.dropped), (0, 1))
        notify["message"] = "An organisation entered the segment."
        result = self.pass_(item("scenario.create", scenario(actions=[notify])))
        self.assertEqual((result.proposed, result.dropped), (1, 0))

    def test_a_campaign_subject_naming_a_record_is_dropped(self):
        result = self.pass_(item("campaign.create", campaign(subject="Dough Co, a quick check-in")))
        self.assertEqual((result.proposed, result.dropped), (0, 1))
        result = self.pass_(item("campaign.create", campaign()))
        self.assertEqual((result.proposed, result.dropped), (1, 0))
