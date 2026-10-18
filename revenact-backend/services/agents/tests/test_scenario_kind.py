"""scenario.create (contract): a segment, a trigger and one to three steps,
never a campaign step, a survey always reviewed; applied, a rule switched
off on the approver's own new segment; undo while never switched on."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.agents import evidence
from services.agents.actions import scenarios
from services.agents.kinds import ChangedSince, Invalid, OwnerLimit
from services.agents.tests.builder_fixtures import builder_action, definition
from services.agents.tests.fixtures import AgentsFixture
from services.campaigns.models import Campaign
from services.plans.models import PlanTemplate
from services.rules.models import Rule
from services.segments.models import Segment

TASK = {"action": "task", "title": "Call the champion", "assignee": "record_owner"}


def scenario(**fields):
    return {
        "name": "Rescue poor health",
        "segment": definition(),
        "trigger": {"trigger": "entered"},
        "actions": [TASK],
        **fields,
    }


class ScenarioGenerationTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.onboarding = PlanTemplate.objects.get(is_builtin=True, kind="onboarding")

    def setUp(self):
        self.ctx = evidence.build(Organisation.objects.get(pk=self.org.pk), "ops", today=self.today)

    def validate(self, **fields):
        return scenarios.validate(scenario(**fields), None, self.ctx, [])

    def test_a_good_scenario_and_its_sentences(self):
        notify = {"action": "notify", "to": "me", "message": "Look"}
        survey = {
            "action": "survey",
            "survey_type": "nps",
            "subject": "How are we doing?",
            "roles": ["champion"],
            "without_review": True,
        }
        clean = self.validate(actions=[TASK, notify, survey])
        self.assertEqual(clean["name"], "Rescue poor health")
        self.assertEqual(clean["trigger"]["trigger"], "entered")
        self.assertIs(clean["actions"][2]["without_review"], False)
        self.assertEqual(
            clean["shown"],
            {
                "trigger": "Entered the segment",
                "steps": ["Task the owner", "Notify me", "Send an NPS survey, reviewed first"],
            },
        )
        self.assertIn("Call the champion", scenarios.texts(clean))
        self.assertIn("How are we doing?", scenarios.texts(clean))

    def test_trigger_sentences(self):
        crossed = {"trigger": "crossed", "score": "health", "direction": "below", "threshold": 4}
        weekly = {"trigger": "schedule", "cadence": "weekly", "weekday": 0}
        monthly = {"trigger": "schedule", "cadence": "monthly"}
        cases = (
            ({"trigger": "left"}, "Left the segment"),
            (crossed, "Health goes below 4"),
            (weekly, "Every Monday"),
            (monthly, "On the 1st of each month"),
        )
        for trigger, sentence in cases:
            clean = scenarios.clean_trigger_for(trigger, "customer")
            self.assertEqual(scenarios.trigger_sentence(clean), sentence)
        self.assertEqual(scenarios.clean_trigger_for(crossed, "customer")["threshold"], 4.0)

    def test_a_plan_step_names_a_listed_template(self):
        step = {"action": "plan", "template": self.onboarding.pk}
        clean = self.validate(actions=[step])
        self.assertEqual(clean["actions"], [step])
        self.assertEqual(clean["shown"]["steps"], [f"Start a plan from {self.onboarding.name}"])

    def test_what_is_refused(self):
        crossed = {"trigger": "crossed", "score": "health", "direction": "below"}
        private = PlanTemplate.objects.create(
            organisation=self.org,
            owner=self.admin,
            name="Mine",
            kind="save",
            milestones=self.onboarding.milestones,
        )
        contacts = definition(
            kind="contact",
            rules={"match": "all", "conditions": [{"field": "role", "op": "is", "value": "other"}]},
        )
        for fields in (
            {"name": ""},
            {"segment": {"kind": "deal"}},
            {"trigger": {"trigger": "whenever"}},
            {"trigger": {**crossed, "threshold": 11}},
            {"trigger": {**crossed, "threshold": "4"}},
            {"trigger": {**crossed, "threshold": 4.125}},
            {"segment": contacts, "trigger": {**crossed, "threshold": 4}},
            {"actions": []},
            {"actions": [TASK, TASK]},
            {"actions": [TASK] * 4},
            {"actions": [{"action": "campaign", "campaign": 1}]},
            {"actions": [{"action": "plan", "template": private.pk}]},
            {"actions": [{"action": "notify", "to": "people", "people": [self.stranger.pk]}]},
            {"actions": [{"action": "task", "title": ""}]},
        ):
            with self.subTest(fields=fields), self.assertRaises(Invalid):
                self.validate(**fields)
        with self.assertRaises(Invalid):
            scenarios.validate(
                scenario(), self.ctx.records[f"customer:{self.pizza.pk}"], self.ctx, []
            )


class ScenarioApplyTests(AgentsFixture):
    def action(self, name="Rescue poor health"):
        ctx = evidence.build(Organisation.objects.get(pk=self.org.pk), "ops", today=self.today)
        payload = scenarios.validate(scenario(name=name), None, ctx, [])
        return builder_action(self.org, "scenario.create", payload)

    def applied(self):
        action = self.action()
        action.after, action.result = scenarios.CREATE.apply(action, self.admin)
        action.status = "applied"
        action.save(update_fields=["after", "result", "status"])
        return action

    def undo(self, action):
        with transaction.atomic():
            scenarios.CREATE.undo(action, self.lee)

    def test_the_kind_and_its_preview(self):
        spec = scenarios.CREATE
        self.assertEqual(
            (spec.label, spec.max_level, spec.agents), ("Build a scenario", "ask", ("ops",))
        )
        self.assertTrue(spec.workspace_level and spec.builder)
        self.assertFalse(spec.per_reader)
        action = self.action()
        self.assertEqual(spec.target(action.payload), "scenario:rescue poor health")
        self.assertEqual(
            spec.preview(action),
            {
                "scenario": {
                    "name": "Rescue poor health",
                    "segment": "Poor health",
                    "trigger": "Entered the segment",
                    "steps": ["Task the owner"],
                }
            },
        )

    def test_apply_makes_a_switched_off_rule_on_the_approvers_segment(self):
        action = self.applied()
        rule = Rule.objects.get(pk=action.result["rule_id"])
        self.assertEqual(
            (rule.owner, rule.is_active, rule.segment_id, rule.agent_action, rule.trigger),
            (self.admin, False, action.result["segment_id"], action, "entered"),
        )
        self.assertEqual(rule.segment.owner, self.admin)
        self.assertEqual(rule.actions[0]["title"], "Call the champion")
        event = AuditEvent.objects.get(action="rule.created")
        self.assertEqual(
            (event.actor, event.metadata),
            (self.admin, {"trigger": "entered", "actions": ["task"], "agent_action": action.pk}),
        )
        self.assertEqual(action.after["rule_updated_at"], rule.updated_at.isoformat())

    def test_past_fifty_rules_nothing_is_made(self):
        Rule.objects.bulk_create(
            Rule(organisation=self.org, owner=self.admin, name=f"R{i}", trigger="entered")
            for i in range(50)
        )
        with self.assertRaises(OwnerLimit) as caught, transaction.atomic():
            scenarios.CREATE.apply(self.action(), self.admin)
        self.assertEqual(caught.exception.detail, "You already own 50 scenarios.")
        self.assertFalse(Segment.objects.exists())

    def test_undo_deletes_the_rule_and_its_segment(self):
        action = self.applied()
        self.undo(action)
        self.assertFalse(Rule.objects.exists())
        self.assertFalse(Segment.objects.exists())
        self.assertEqual(AuditEvent.objects.get(action="rule.deleted").actor, self.lee)

    def test_a_shared_segment_survives(self):
        action = self.applied()
        segment = Segment.objects.get(pk=action.result["segment_id"])
        Campaign.objects.create(organisation=self.org, owner=self.admin, name="C", segment=segment)
        self.undo(action)
        self.assertFalse(Rule.objects.exists())
        self.assertTrue(Segment.objects.filter(pk=segment.pk).exists())

    def test_undo_refuses_with_the_contracts_sentences(self):
        action = self.applied()
        rule = Rule.objects.get(pk=action.result["rule_id"])
        later = timezone.now() + timedelta(minutes=1)
        Rule.objects.filter(pk=rule.pk).update(updated_at=later)
        with self.assertRaises(ChangedSince) as caught:
            self.undo(action)
        self.assertEqual(caught.exception.detail, "This scenario has been edited since.")
        # Switched on and off again still counts as switched on.
        AuditEvent.objects.create(
            organisation=self.org,
            action="rule.activated",
            target_type="rules.rule",
            target_id=str(rule.pk),
        )
        with self.assertRaises(ChangedSince) as caught:
            self.undo(action)
        self.assertEqual(caught.exception.detail, "This scenario has been switched on.")
        Rule.objects.filter(pk=rule.pk).delete()
        Segment.objects.filter(pk=action.result["segment_id"]).delete()
        with self.assertRaises(ChangedSince) as caught:
            self.undo(action)
        self.assertEqual(caught.exception.detail, "This scenario has been deleted.")

    def test_a_rule_deleted_by_a_person_still_releases_its_segment(self):
        action = self.applied()
        Rule.objects.filter(pk=action.result["rule_id"]).delete()
        self.undo(action)
        self.assertFalse(Segment.objects.exists())

    def test_an_edited_segment_survives(self):
        action = self.applied()
        later = timezone.now() + timedelta(minutes=1)
        Segment.objects.filter(pk=action.result["segment_id"]).update(updated_at=later)
        self.undo(action)
        self.assertFalse(Rule.objects.exists())
        self.assertTrue(Segment.objects.filter(pk=action.result["segment_id"]).exists())
        self.assertFalse(AuditEvent.objects.filter(action="segment.deleted").exists())

    def test_a_deleted_rule_on_an_edited_segment_is_refused_as_deleted(self):
        action = self.applied()
        Rule.objects.filter(pk=action.result["rule_id"]).delete()
        later = timezone.now() + timedelta(minutes=1)
        Segment.objects.filter(pk=action.result["segment_id"]).update(updated_at=later)
        with self.assertRaises(ChangedSince) as caught:
            self.undo(action)
        self.assertEqual(caught.exception.detail, "This scenario has been deleted.")
        self.assertTrue(Segment.objects.filter(pk=action.result["segment_id"]).exists())
