"""A run never fills a placeholder into text a customer reads (agent bundles
D3 contract D3-17): a test kind stands in for a customer-facing one, since
the real ones talk to tools."""

import dataclasses
from unittest.mock import patch

from services.agents.registry import REGISTRY
from services.agents.tests.bundle_fixtures import BundleFixture, run_one
from services.customers.models import Note

FACING = dataclasses.replace(REGISTRY["note.create"], key="test.facing", customer_facing=("body",))


class CustomerFacingFillTests(BundleFixture):
    def setUp(self):
        patcher = patch.dict(REGISTRY, {"test.facing": FACING})
        patcher.start()
        self.addCleanup(patcher.stop)
        credits = patch("services.agents.policy.plan_credits", return_value=3000)
        credits.start()
        self.addCleanup(credits.stop)

    def test_a_customer_facing_field_runs_as_written(self):
        bundle = self.bundle_of(self.pizza)
        step = self.step(
            self.pizza,
            kind="test.facing",
            payload={"title": "For Ann", "body": "Logged as {{step 1.ticket_key}}"},
            bundle=bundle,
        )
        response = run_one(self.client_for(self.csm), step)
        self.assertEqual(response.status_code, 200, response.content)
        step.refresh_from_db()
        self.assertEqual(step.status, "applied")
        note = Note.objects.get(pk=step.result["note_id"])
        self.assertEqual(note.body, "Logged as {{step 1.ticket_key}}")
