"""A bundle and its steps (contract §1.1, §1.2, D3): a step saved without a
bundle gets a bundle of one; steps are ordered by position; the routing
follows the record."""

from django.db import IntegrityError, transaction

from services.agents.tests.bundle_fixtures import BundleFixture, lifecycle, note
from services.metrics.models import AgentAction


class BundleOfOneTests(BundleFixture):
    def test_a_step_saved_alone_gets_a_bundle_of_one(self):
        action = self.step(self.pizza, title="Move Pizza Hut to renewal", rationale="Renews in 30.")
        bundle = action.bundle
        self.assertEqual(
            (action.position, action.selected, action.outputs, action.error), (1, True, {}, "")
        )
        self.assertEqual(
            (bundle.title, bundle.reason, bundle.agent, bundle.source, bundle.status),
            ("Move Pizza Hut to renewal", "Renews in 30.", "cs", "nightly", "waiting"),
        )
        self.assertEqual((bundle.customer_id, bundle.account_id), (self.pizza.pk, None))
        self.assertEqual((bundle.routed_to, bundle.routed_user_id), ("owner", self.csm.pk))

    def test_workspace_level_and_ownerless_routing(self):
        from services.agents.tests.builder_fixtures import builder_action, definition

        built = builder_action(self.org, "segment.create", definition())
        self.assertEqual((built.bundle.routed_to, built.bundle.routed_user_id), ("admins", None))
        loose = self.step(self.loose)
        self.assertEqual((loose.bundle.routed_to, loose.bundle.routed_user_id), ("owner", None))

    def test_a_decided_step_alone_gets_a_finished_bundle(self):
        for status, expected in (
            ("applied", "done"),
            ("rejected", "rejected"),
            ("expired", "expired"),
            ("undone", "done"),
        ):
            with self.subTest(status=status):
                self.assertEqual(self.step(self.pizza, status=status).bundle.status, expected)

    def test_steps_keep_their_order_and_positions_are_unique(self):
        bundle = self.bundle_of(self.pizza, lifecycle(), note())
        self.assertEqual(
            list(bundle.steps.order_by("position").values_list("kind", "position")),
            [("record.lifecycle", 1), ("note.create", 2)],
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.step(self.pizza, bundle=bundle, position=1)

    def test_the_new_statuses_and_kinds_exist(self):
        self.assertIn("failed", AgentAction.Status.values)
        self.assertIn("skipped", AgentAction.Status.values)
        self.assertIn("survey.send", AgentAction.Kind.values)
        self.assertIn("campaign.send", AgentAction.Kind.values)
        bundle = self.step(self.pizza).bundle
        self.assertEqual(str(bundle), f"Agent bundle {bundle.pk}")
