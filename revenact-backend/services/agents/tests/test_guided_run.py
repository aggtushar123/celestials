"""A guided bundle run one question at a time (guided agent spec §3): the
next step only, the bundle open between answers, Not now, and the same
rights and conflicts as a whole run."""

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from core.models import AuditEvent
from services.agents.models import AgentBundle
from services.agents.tests.guided_fixtures import BUNDLE, STEP_RUN, STOP, GuidedFixture
from services.customers.models import Customer, HealthSnapshot


class GuidedRunTests(GuidedFixture):
    def test_the_payload_asks_one_question_per_step(self):
        Customer.objects.filter(pk=self.pizza.pk).update(health_score=Decimal("6.1"))
        HealthSnapshot.objects.create(
            customer=self.pizza,
            captured_on=timezone.localdate() - timedelta(days=14),
            health_score=Decimal("7.8"),
        )
        bundle = self.guided_bundle()
        body = self.client_for(self.csm).get(BUNDLE.format(bundle.pk)).json()
        self.assertTrue(body["guided"])
        self.assertEqual(body["priority"], "normal")
        self.assertEqual(
            [s["question"] for s in body["steps"]],
            [
                "Pizza Hut's health dropped from 7.8 to 6.1. Should I diagnose?",
                "Should I write an email to save Pizza Hut?",
                "Should I send it to Ann Lee?",
            ],
        )
        first = self.steps_of(bundle)["record.diagnose"]
        self.assertEqual(body["next_step"], first.pk)
        self.assertTrue(body["can_stop"])

    def test_a_bundle_without_a_diagnosis_asks_nothing(self):
        _conversation, thread = self.slack_thread(self.pizza)
        bundle = self.outside_bundle(thread, ("note.create", {"title": "Call", "body": "Done."}))
        body = self.client_for(self.csm).get(BUNDLE.format(bundle.pk)).json()
        self.assertEqual(
            (body["guided"], body["next_step"], body["can_stop"]), (False, None, False)
        )
        self.assertIsNone(body["steps"][0]["question"])
        step = bundle.steps.get()
        refused = self.run_step(self.csm, bundle, step)
        self.assertEqual((refused.status_code, refused.json()["code"]), (409, "NOT_GUIDED"))

    def test_steps_run_in_order_and_the_bundle_stays_open(self):
        bundle = self.guided_bundle()
        self.model()
        steps = self.steps_of(bundle)
        early = self.run_step(self.csm, bundle, steps["mail.compose"])
        self.assertEqual(early.status_code, 409)
        self.assertEqual(early.json()["code"], "NOT_NEXT")
        self.assertEqual(early.json()["detail"], "Answer step 1 first.")
        first = self.run_step(self.csm, bundle, steps["record.diagnose"])
        self.assertEqual(first.status_code, 200, first.content)
        self.assertEqual(first.json()["bundle"]["status"], "waiting")
        self.assertEqual(first.json()["bundle"]["next_step"], steps["mail.compose"].pk)
        self.assertFalse(first.json()["bundle"]["can_refresh"])
        again = self.run_step(self.csm, bundle, steps["record.diagnose"])
        self.assertEqual(again.json()["code"], "STEP_NOT_WAITING")
        self.run_step(self.csm, bundle, steps["mail.compose"])
        last = self.run_step(self.csm, bundle, steps["mail.send_draft"])
        self.assertEqual(last.json()["bundle"]["status"], "done")
        started = AuditEvent.objects.filter(action="agent_bundle.run_started")
        self.assertEqual(started.count(), 3)
        self.assertTrue(all(e.metadata["guided"] for e in started))

    def test_a_failed_step_holds_the_next_until_it_is_retried(self):
        bundle = self.guided_bundle()
        self.model(findings=[])
        steps = self.steps_of(bundle)
        self.run_step(self.csm, bundle, steps["record.diagnose"])
        blocked = self.run_step(self.csm, bundle, steps["mail.compose"])
        self.assertEqual(blocked.json()["detail"], "Step 1 didn't run. Retry it first.")

    def test_not_now_skips_what_is_left_and_finishes_it(self):
        bundle = self.guided_bundle()
        self.model()
        self.run_step(self.csm, bundle, self.steps_of(bundle)["record.diagnose"])
        response = self.client_for(self.csm).post(STOP.format(bundle.pk))
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()["bundle"]
        self.assertEqual(body["status"], "done")
        self.assertEqual(
            [(s["status"], s["note"]) for s in body["steps"]],
            [
                ("applied", ""),
                ("skipped", "Stopped by Carl CSM."),
                ("skipped", "Stopped by Carl CSM."),
            ],
        )
        event = AuditEvent.objects.get(action="agent_bundle.stopped")
        self.assertEqual(event.metadata["skipped"], 2)
        later = self.client_for(self.csm).post(STOP.format(bundle.pk))
        self.assertEqual((later.status_code, later.json()["code"]), (409, "BUNDLE_RAN"))

    def test_someone_who_may_not_read_it_finds_no_bundle(self):
        bundle = self.guided_bundle()
        step = self.steps_of(bundle)["record.diagnose"]
        # Dana can't open Pizza Hut: the bundle is missing for her, never forbidden.
        self.assertEqual(self.run_step(self.other, bundle, step).status_code, 404)
        self.assertEqual(self.client_for(self.other).post(STOP.format(bundle.pk)).status_code, 404)
        self.assertEqual(self.steps_of(bundle)["record.diagnose"].status, "proposed")

    def test_a_second_tab_is_told_the_bundle_is_running(self):
        bundle = self.guided_bundle()
        AgentBundle.objects.filter(pk=bundle.pk).update(
            status=AgentBundle.Status.RUNNING, run_by=self.csm, run_started_at=timezone.now()
        )
        step = self.steps_of(bundle)["record.diagnose"]
        response = self.client_for(self.csm).post(STEP_RUN.format(bundle.pk, step.pk), {})
        self.assertEqual((response.status_code, response.json()["code"]), (409, "BUNDLE_RUNNING"))

    def test_a_started_bundle_keeps_its_steps_when_a_newer_message_comes(self):
        from services.agents import intake_bundles

        bundle = self.guided_bundle()
        self.model()
        self.run_step(self.csm, bundle, self.steps_of(bundle)["record.diagnose"])
        self.assertTrue(intake_bundles.held(self.fresh_bundle(bundle)))

    def test_the_whole_run_still_works_and_needs_the_diagnosis_first(self):
        bundle = self.guided_bundle()
        self.model()
        response = self.run_all_steps(self.csm, bundle)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            [s.status for s in bundle.steps.order_by("position")], ["applied", "applied", "applied"]
        )
