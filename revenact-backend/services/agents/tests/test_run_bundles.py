"""The nightly pass makes bundles (contract D1, D2, D4, §6.1): one per
record per pass in the model's order, Auto steps in their own done bundle,
re-proposed steps staying where they are, placeholders renumbered to the
bundle's positions, and expiries settling bundles."""

import json
from unittest.mock import patch

from services.accounts.models import Organisation
from services.agents import evidence, prompt, run
from services.agents.models import AgentBundle, AgentPolicy
from services.agents.policy import profiles_for
from services.agents.tests.fixtures import AgentsFixture
from services.metrics.models import AgentAction
from services.work.clock import today_for

PATH = "services.agents.run.get_completion"


class RunBundlesTests(AgentsFixture):
    def setUp(self):
        with patch("services.agents.policy.plan_credits", return_value=3000):
            profiles_for(self.org)

    def org_now(self):
        return Organisation.objects.get(pk=self.org.pk)

    def line(self, record):
        org = self.org_now()
        ctx = evidence.build(org, "cs", today=today_for(org))
        ref = f"customer:{record.pk}"
        return next(x for x in sorted(evidence.record_lines(ctx, ref)) if x.startswith("- "))

    def item(self, record, kind, payload, title):
        return {
            "kind": kind,
            "record": f"customer:{record.pk}",
            "title": title,
            "rationale": f"Because of {record.name}.",
            "evidence": [self.line(record)],
            "payload": payload,
        }

    def pass_(self, *items):
        with patch(PATH, return_value=json.dumps(list(items))):
            return run.run(self.org_now(), "cs")

    def test_one_bundle_per_record_in_the_models_order(self):
        result = self.pass_(
            self.item(
                self.pizza, "note.create", {"title": "Sponsor left", "body": "B"}, "File the news"
            ),
            self.item(
                self.dough, "record.lifecycle", {"stage": "renewal"}, "Move Dough Co to renewal"
            ),
            self.item(
                self.pizza, "record.lifecycle", {"stage": "renewal"}, "Move Pizza Hut to renewal"
            ),
        )
        self.assertEqual(result.proposed, 3)
        pizza = AgentBundle.objects.get(customer=self.pizza)
        self.assertEqual(pizza.title, "File the news, and 1 more")
        self.assertEqual(pizza.reason, "Because of Pizza Hut.")
        self.assertEqual(
            list(pizza.steps.order_by("position").values_list("kind", "position")),
            [("note.create", 1), ("record.lifecycle", 2)],
        )
        dough = AgentBundle.objects.get(customer=self.dough)
        self.assertEqual(
            (dough.title, dough.steps.count(), dough.status),
            ("Move Dough Co to renewal", 1, "waiting"),
        )
        self.assertEqual((pizza.routed_to, pizza.routed_user_id), ("owner", self.csm.pk))

    def test_an_auto_step_gets_its_own_done_bundle(self):
        AgentPolicy.objects.update_or_create(
            organisation=self.org, defaults={"levels": {"cs": {"note.create": "auto"}}}
        )
        self.pass_(
            self.item(
                self.pizza, "note.create", {"title": "Sponsor left", "body": "B"}, "File the news"
            ),
            self.item(
                self.pizza, "record.lifecycle", {"stage": "renewal"}, "Move Pizza Hut to renewal"
            ),
        )
        auto = AgentAction.objects.get(kind="note.create")
        self.assertEqual(
            (auto.status, auto.bundle.status, auto.bundle.run_by_id), ("applied", "done", None)
        )
        self.assertEqual(auto.bundle.steps.count(), 1)
        ask = AgentAction.objects.get(kind="record.lifecycle")
        self.assertEqual(
            (ask.bundle.status, ask.bundle.title), ("waiting", "Move Pizza Hut to renewal")
        )

    def test_a_reproposed_step_stays_and_an_unproposed_one_settles_its_bundle(self):
        note = self.item(
            self.pizza, "note.create", {"title": "Sponsor left", "body": "B"}, "File the news"
        )
        move = self.item(
            self.pizza, "record.lifecycle", {"stage": "renewal"}, "Move Pizza Hut to renewal"
        )
        self.pass_(note, move)
        first = AgentBundle.objects.get(customer=self.pizza)
        self.pass_(note)
        self.assertEqual(AgentBundle.objects.filter(customer=self.pizza).count(), 1)
        first.refresh_from_db()
        self.assertEqual(first.status, "waiting")
        self.assertEqual(
            sorted(first.steps.values_list("kind", "status")),
            [("note.create", "proposed"), ("record.lifecycle", "expired")],
        )
        self.pass_()  # an empty answer: nothing proposed
        first.refresh_from_db()
        self.assertEqual(first.status, "expired")

    def test_placeholders_are_renumbered_or_dropped(self):
        task = {
            "title": "Call the sponsor",
            "assignee_id": None,
            "due_in_days": 3,
            "priority": "high",
        }
        self.pass_(
            self.item(self.dough, "note.create", {"title": "Other", "body": "B"}, "Note Dough"),
            self.item(self.pizza, "task.create", task, "Call"),
            self.item(
                self.pizza,
                "note.create",
                {"title": "Logged", "body": "See {{step 1.task_url}}"},
                "Log",
            ),
            self.item(
                self.pizza,
                "note.create",
                {"title": "Bad", "body": "See {{step 5.task_url}}"},
                "Bad",
            ),
        )
        bundle = AgentBundle.objects.get(customer=self.pizza)
        self.assertEqual(
            list(bundle.steps.order_by("position").values_list("kind", "payload__body")),
            [("task.create", None), ("note.create", "See {{step 1.task_url}}")],
        )

    def test_a_stuck_run_is_settled_by_the_pass(self):
        with patch("services.agents.run.settle_stuck_all") as sweep:
            self.pass_()
        sweep.assert_called_once()

    def test_a_skipped_pass_still_settles_a_stuck_run(self):
        # D15: AI agents off skips the pass, but not the stuck-run sweep.
        from datetime import timedelta

        from django.utils import timezone

        self.pass_(self.item(self.pizza, "record.lifecycle", {"stage": "renewal"}, "Move"))
        bundle = AgentBundle.objects.get(customer=self.pizza)
        bundle.steps.update(selected=True)
        AgentBundle.objects.filter(pk=bundle.pk).update(
            status="running", run_by=self.csm, run_started_at=timezone.now() - timedelta(minutes=20)
        )
        Organisation.objects.filter(pk=self.org.pk).update(ai_agent_enabled=False)
        result = self.pass_()
        self.assertEqual(result.skipped_reason, "ai_off")
        bundle.refresh_from_db()
        self.assertEqual(bundle.status, "partly_done")
        self.assertEqual(bundle.steps.get().status, "failed")

    def test_the_prompt_names_placeholder_keys_of_allowed_kinds_only(self):
        system = prompt.system("cs", ["task.create", "record.lifecycle"], "concise")
        self.assertIn("run together, in the order you write them", system)
        self.assertIn("{{step N.key}}", system)
        self.assertIn("task_id, task_url (task.create)", system)
        self.assertNotIn("note_id", system)
        bare = prompt.system("cs", ["record.lifecycle"], "concise")
        self.assertNotIn("{{step N.key}}", bare)

    def test_a_placeholder_maps_the_models_index_past_a_reproposed_twin(self):
        note = self.item(
            self.pizza, "note.create", {"title": "Sponsor left", "body": "B"}, "File the news"
        )
        self.pass_(note)
        old = AgentBundle.objects.get(customer=self.pizza)
        task = {
            "title": "Call the sponsor",
            "assignee_id": None,
            "due_in_days": 3,
            "priority": "high",
        }
        self.pass_(
            note,  # the model's 1st for Pizza Hut: re-proposed, stays in its bundle
            self.item(self.pizza, "task.create", task, "Call"),  # 2nd: position 1
            self.item(
                self.pizza,
                "note.create",
                {"title": "Logged", "body": "See {{step 2.task_url}}"},
                "Log",
            ),
            self.item(
                self.pizza,
                "note.create",
                {"title": "Twin", "body": "See {{step 1.note_id}}"},
                "Names the twin",
            ),
        )
        self.assertEqual(old.steps.count(), 1)
        new = AgentBundle.objects.filter(customer=self.pizza).exclude(pk=old.pk).get()
        self.assertEqual(
            list(new.steps.order_by("position").values_list("kind", "position", "payload__body")),
            [("task.create", 1, None), ("note.create", 2, "See {{step 1.task_url}}")],
        )
        self.assertEqual(new.title, "Call, and 1 more")

    def task(self):
        return self.item(
            self.pizza,
            "task.create",
            {
                "title": "Call the sponsor",
                "assignee_id": None,
                "due_in_days": 3,
                "priority": "high",
            },
            "Call",
        )

    def test_a_dependent_pair_proposed_again_stays_whole(self):
        # D4: the task is a twin, and the note naming it is its twin too.
        logged = self.item(
            self.pizza, "note.create", {"title": "Logged", "body": "See {{step 1.task_url}}"}, "Log"
        )
        self.pass_(self.task(), logged)
        bundle = AgentBundle.objects.get(customer=self.pizza)
        result = self.pass_(self.task(), logged)
        self.assertEqual((result.proposed, result.dropped), (2, 0))
        self.assertEqual(AgentBundle.objects.filter(customer=self.pizza).count(), 1)
        bundle.refresh_from_db()
        self.assertEqual(bundle.status, "waiting")
        self.assertEqual(
            list(bundle.steps.order_by("position").values_list("kind", "status", "payload__body")),
            [
                ("task.create", "proposed", None),
                ("note.create", "proposed", "See {{step 1.task_url}}"),
            ],
        )
        self.assertFalse(AgentAction.objects.filter(status="expired").exists())

    def test_a_step_naming_an_earlier_bundle_is_only_its_twin_there(self):
        self.pass_(self.task())
        old = AgentBundle.objects.get(customer=self.pizza)
        # The twin task stays in its bundle; a new note naming it can't join that
        # bundle, nor the new one: it is dropped.
        result = self.pass_(
            self.task(),
            self.item(
                self.pizza, "note.create", {"title": "New", "body": "See {{step 1.task_url}}"}, "N"
            ),
        )
        self.assertEqual((result.proposed, result.dropped), (1, 1))
        self.assertEqual(list(old.steps.values_list("kind", flat=True)), ["task.create"])
        self.assertEqual(AgentBundle.objects.filter(customer=self.pizza).count(), 1)

    def test_a_step_naming_steps_of_two_bundles_is_dropped(self):
        self.pass_(self.task())
        other = {
            "title": "Send the deck",
            "assignee_id": None,
            "due_in_days": 5,
            "priority": "low",
        }
        result = self.pass_(
            self.task(),  # a twin in the earlier bundle
            self.item(self.pizza, "task.create", other, "Deck"),  # new bundle, position 1
            self.item(
                self.pizza,
                "note.create",
                {"title": "Both", "body": "{{step 1.task_url}} and {{step 2.task_url}}"},
                "Both",
            ),
        )
        self.assertEqual((result.proposed, result.dropped), (2, 1))
        self.assertFalse(AgentAction.objects.filter(kind="note.create").exists())

    def test_a_twin_naming_another_bundles_step_is_replaced_not_kept(self):
        # Night 1: [task A, note "step 1"] in B. Night 2: task Z is new (position 1
        # of a new bundle) and the same note text now names Z: not B's note.
        logged = self.item(
            self.pizza, "note.create", {"title": "Logged", "body": "See {{step 1.task_url}}"}, "Log"
        )
        self.pass_(self.task(), logged)
        old = AgentBundle.objects.get(customer=self.pizza)
        other = {"title": "Send the deck", "assignee_id": None, "due_in_days": 5, "priority": "low"}
        self.pass_(self.item(self.pizza, "task.create", other, "Deck"), logged)
        new = AgentBundle.objects.filter(customer=self.pizza).exclude(pk=old.pk).get()
        self.assertEqual(
            list(new.steps.order_by("position").values_list("kind", "payload__body")),
            [("task.create", None), ("note.create", "See {{step 1.task_url}}")],
        )
        self.assertEqual(
            old.steps.get(kind="note.create").expired_reason,
            "replaced",
        )

    def test_a_customer_facing_field_takes_no_placeholder(self):
        from services.agents import placeholders
        from services.agents.kinds import Invalid
        from services.agents.registry import REGISTRY

        kinds = {1: "task.create"}
        for kind, field in (
            ("draft.reply", "body"),
            ("campaign.create", "subject"),
            ("campaign.create", "body"),
            ("campaign.send", "subject"),
            ("campaign.send", "body"),
            ("survey.send", "subject"),
            ("survey.send", "intro"),
        ):
            with self.subTest(kind=kind, field=field):
                payload = {field: "See {{step 1.task_url}}"}
                with self.assertRaises(Invalid):
                    placeholders.check(payload, 2, kinds, REGISTRY[kind].customer_facing)
        # An internal field still may.
        placeholders.check(
            {"name": "{{step 1.task_id}}"}, 2, kinds, REGISTRY["campaign.create"].customer_facing
        )
        placeholders.check({"body": "See {{step 1.task_url}}"}, 2, kinds)

    def test_the_pass_drops_a_placeholder_in_a_customer_facing_field(self):
        from dataclasses import replace

        from services.agents.registry import REGISTRY

        # A note's body is internal; were it the customer's, the pass drops it.
        note = self.item(
            self.pizza, "note.create", {"title": "L", "body": "See {{step 1.task_url}}"}, "L"
        )
        facing = replace(REGISTRY["note.create"], customer_facing=("body",))
        with patch.dict(REGISTRY, {"note.create": facing}):
            result = self.pass_(self.task(), note)
        self.assertEqual((result.proposed, result.dropped), (1, 1))
        self.assertFalse(AgentAction.objects.filter(kind="note.create").exists())

    def test_a_bundle_decided_mid_pass_takes_no_more_steps(self):
        consider = run._consider
        calls = []

        def then_reject(*args, **kwargs):
            if calls:
                AgentBundle.objects.filter(customer=self.pizza).update(status="rejected")
            calls.append(1)
            return consider(*args, **kwargs)

        with patch("services.agents.run._consider", side_effect=then_reject):
            result = self.pass_(
                self.item(
                    self.pizza, "note.create", {"title": "Sponsor left", "body": "B"}, "File it"
                ),
                self.item(self.pizza, "record.lifecycle", {"stage": "renewal"}, "Move to renewal"),
            )
        self.assertEqual((result.proposed, result.dropped), (1, 1))
        bundle = AgentBundle.objects.get(customer=self.pizza)
        self.assertEqual(list(bundle.steps.values_list("kind", flat=True)), ["note.create"])
        self.assertFalse(AgentAction.objects.filter(kind="record.lifecycle").exists())
