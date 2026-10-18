"""Edits are saved as they are made (agent bundles D2 contract §4.1,
D2-18): a waiting step's fields and tick, under the bundle's lock; the step
and the bundle are stamped edited; refusals in the run's order and words."""

from unittest.mock import patch

from core.models import AuditEvent
from services.agents.models import AgentBundle
from services.agents.tests.bundle_fixtures import BUNDLES, BundleFixture, lifecycle, note
from services.metrics.models import AgentAction


class StepSaveTests(BundleFixture):
    def patch(self, user, bundle, step, body):
        return self.client_for(user).patch(
            f"{BUNDLES}{bundle.pk}/steps/{step.pk}/", body, format="json"
        )

    def test_a_field_and_a_tick_are_saved_and_stamped(self):
        bundle = self.bundle_of(self.pizza, note(), lifecycle())
        first, second = bundle.steps.order_by("position")
        before = AgentBundle.objects.get(pk=bundle.pk).updated_at
        answer = self.patch(self.csm, bundle, first, {"fields": {"body": "Call the CFO."}})
        self.assertEqual(answer.status_code, 200)
        row = answer.json()["bundle"]["steps"][0]
        self.assertEqual((row["fields"]["body"], row["edited"]), ("Call the CFO.", True))
        self.assertEqual(
            answer.json()["bundle"]["edited_by"], {"id": self.csm.pk, "name": "Carl CSM"}
        )
        # Refresh detects a change during its model call by this stamp.
        self.assertGreater(AgentBundle.objects.get(pk=bundle.pk).updated_at, before)
        event = AuditEvent.objects.filter(action="agent_bundle.step_edited").latest("id")
        self.assertEqual(event.metadata, {"step": first.pk, "fields": ["body"], "selected": None})
        self.patch(self.csm, bundle, second, {"selected": False})
        second.refresh_from_db()
        self.assertEqual((second.selected, second.edited_at is not None), (False, True))
        event = AuditEvent.objects.filter(action="agent_bundle.step_edited").latest("id")
        self.assertEqual(event.metadata, {"step": second.pk, "fields": [], "selected": False})

    def test_refusals_in_order(self):
        bundle = self.bundle_of(self.pizza, note(), lifecycle())
        first, second = bundle.steps.order_by("position")
        other = self.bundle_of(self.pizza, note("Other", "B")).steps.get()
        self.assertEqual(self.patch(self.csm, bundle, other, {"selected": False}).status_code, 404)
        self.assertEqual(
            self.patch(self.other, bundle, first, {"selected": False}).status_code, 404
        )
        self.assertEqual(
            self.patch(self.csm, bundle, first, {}).json(), {"steps": ["Send fields or selected."]}
        )
        self.assertEqual(
            self.patch(self.csm, bundle, first, {"fields": {}}).json(),
            {"steps": ["Send fields or selected."]},
        )
        self.assertEqual(
            self.patch(self.csm, bundle, first, {"selected": "no"}).json(),
            {"steps": {str(first.pk): {"selected": ["Choose on or off."]}}},
        )
        self.assertEqual(
            self.patch(self.csm, bundle, second, {"fields": {"stage": "churn"}}).json(),
            {"steps": {str(second.pk): {"stage": ["This can't be changed here."]}}},
        )
        AgentAction.objects.filter(pk=second.pk).update(status="expired")
        refused = self.patch(self.csm, bundle, second, {"selected": False})
        self.assertEqual((refused.status_code, refused.json()["code"]), (409, "STEP_NOT_WAITING"))
        AgentBundle.objects.filter(pk=bundle.pk).update(status="done", run_by=self.csm)
        refused = self.patch(self.csm, bundle, first, {"selected": False})
        self.assertEqual((refused.status_code, refused.json()["code"]), (409, "BUNDLE_RAN"))

    def test_a_run_with_an_edit_stamps_the_step(self):
        bundle = self.bundle_of(self.pizza, note())
        step = bundle.steps.get()
        self.client_for(self.csm).post(
            f"{BUNDLES}{bundle.pk}/run/",
            {"steps": [{"id": step.pk, "selected": True, "fields": {"body": "New."}}]},
            format="json",
        )
        step.refresh_from_db()
        self.assertIsNotNone(step.edited_at)


class StepSaveUnderTheLockTests(BundleFixture):
    """The edit is worked out again on the step as it is under the lock
    (final review I1): a save that lands between this save's read and its
    lock is kept, and a step a Refresh removed answers STEP_NOT_WAITING."""

    def patch(self, user, bundle, step, body):
        return self.client_for(user).patch(
            f"{BUNDLES}{bundle.pk}/steps/{step.pk}/", body, format="json"
        )

    def before_the_lock(self, change):
        from services.agents import deciding

        real = deciding.locked

        def locked(pk):
            change(pk)
            return real(pk)

        return patch("services.agents.bundle_run.locked", side_effect=locked)

    def test_two_saves_of_different_fields_both_survive(self):
        bundle = self.bundle_of(self.pizza, note())
        step = bundle.steps.get()

        def other_save(pk):
            row = AgentAction.objects.get(pk=pk)
            AgentAction.objects.filter(pk=pk).update(
                payload={**row.payload, "title": "Saved by Mona"}
            )

        with self.before_the_lock(other_save):
            answer = self.patch(self.csm, bundle, step, {"fields": {"body": "Call the CFO."}})
        self.assertEqual(answer.status_code, 200, answer.content)
        step.refresh_from_db()
        self.assertEqual(
            (step.payload["title"], step.payload["body"]), ("Saved by Mona", "Call the CFO.")
        )

    def test_a_step_removed_before_the_lock_is_not_waiting(self):
        bundle = self.bundle_of(self.pizza, note(), lifecycle())
        first = bundle.steps.order_by("position").first()

        def refreshed(pk):
            AgentAction.objects.filter(pk=pk).delete()

        with self.before_the_lock(refreshed):
            answer = self.patch(self.csm, bundle, first, {"fields": {"body": "Call the CFO."}})
        self.assertEqual(answer.status_code, 409, answer.content)
        self.assertEqual(answer.json()["code"], "STEP_NOT_WAITING")
        self.assertEqual(answer.json()["bundle"]["id"], bundle.pk)
