"""Retry a failed step and reject a bundle (contract §5.2, §5.3, D16)."""

import dataclasses
from unittest.mock import patch

from rest_framework.exceptions import ValidationError

from core.models import AuditEvent
from services.agents.models import AgentBundle
from services.agents.registry import REGISTRY
from services.agents.tests.bundle_fixtures import BUNDLES, BundleFixture, lifecycle, note
from services.agents.tests.fixtures import viewer
from services.metrics.models import AgentAction


def boom(action, actor, **_):
    raise ValidationError("This campaign's audience is empty now.")


class RetryTests(BundleFixture):
    def partly(self):
        bundle = self.bundle_of(self.pizza, note(), lifecycle())
        steps = [{"id": s.pk, "selected": True} for s in bundle.steps.order_by("position")]
        with patch.dict(
            REGISTRY, {"note.create": dataclasses.replace(REGISTRY["note.create"], apply=boom)}
        ):
            self.client_for(self.csm).post(
                f"{BUNDLES}{bundle.pk}/run/", {"steps": steps}, format="json"
            )
        return bundle, bundle.steps.get(position=1)

    def retry(self, user, bundle, step, fields=None):
        url = f"{BUNDLES}{bundle.pk}/steps/{step.pk}/retry/"
        return self.client_for(user).post(url, {"fields": fields} if fields else {}, format="json")

    def test_a_retry_that_works_finishes_the_bundle(self):
        bundle, step = self.partly()
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).status, "partly_done")
        response = self.retry(self.csm, bundle, step, {"title": "Second try"})
        self.assertEqual(response.status_code, 200, response.data)
        body = response.json()["bundle"]
        self.assertEqual(
            (body["status"], body["steps"][0]["status"], body["steps"][0]["error"]),
            ("done", "applied", ""),
        )
        self.assertTrue(AuditEvent.objects.filter(action="agent_bundle.retried").exists())

    def test_a_retry_that_fails_again_says_so(self):
        bundle, step = self.partly()
        with patch.dict(
            REGISTRY, {"note.create": dataclasses.replace(REGISTRY["note.create"], apply=boom)}
        ):
            body = self.retry(self.csm, bundle, step).json()["bundle"]
        self.assertEqual((body["status"], body["steps"][0]["status"]), ("partly_done", "failed"))

    def test_refusals(self):
        bundle, step = self.partly()
        applied = bundle.steps.get(position=2)
        response = self.retry(self.csm, bundle, applied)
        self.assertEqual(
            (response.status_code, response.json()["code"], response.json()["detail"]),
            (409, "NOT_FAILED", "Only a failed step can be retried."),
        )
        self.assertEqual(self.retry(self.other, bundle, step).status_code, 404)
        other = self.bundle_of(self.pizza, note("X", "Y"))
        self.assertEqual(self.retry(self.csm, other, step).status_code, 404)
        AgentBundle.objects.filter(pk=bundle.pk).update(status="running", run_by=self.mona)
        AgentAction.objects.filter(pk=step.pk).update(status="failed")
        response = self.retry(self.csm, bundle, step)
        self.assertEqual((response.status_code, response.json()["code"]), (409, "BUNDLE_RUNNING"))


class RejectTests(BundleFixture):
    def reject(self, user, bundle, **body):
        return self.client_for(user).post(f"{BUNDLES}{bundle.pk}/reject/", body, format="json")

    def test_reject_with_a_reason_and_note(self):
        bundle = self.bundle_of(self.pizza, note(), lifecycle())
        response = self.reject(self.csm, bundle, reason="already_handled", note="We called them.")
        self.assertEqual(response.status_code, 200, response.data)
        body = response.json()["bundle"]
        self.assertEqual(
            (body["status"], body["reject_reason"], body["reject_note"]),
            ("rejected", "already_handled", "We called them."),
        )
        self.assertEqual({s["status"] for s in body["steps"]}, {"rejected"})
        event = AuditEvent.objects.get(action="agent_bundle.rejected")
        self.assertEqual(event.metadata, {"reason": "already_handled"})
        again = self.reject(self.mona, bundle, reason="other")
        self.assertEqual(
            (again.status_code, again.json()["detail"]), (409, "Carl CSM rejected this.")
        )

    def test_refusals(self):
        bundle = self.bundle_of(self.pizza, ("record.owner", {"owner_id": self.other.pk}), note())
        vic = viewer(self.org)
        response = self.reject(vic, bundle, reason="other")
        self.assertEqual(
            (response.status_code, response.json()),
            (403, {"code": "CANT_REJECT", "detail": "You can't reject this bundle."}),
        )
        response = self.reject(self.csm, bundle, reason="retired")
        self.assertEqual(
            response.json(),
            {"reason": ["Choose already handled, not relevant, wrong person or other."]},
        )
        response = self.reject(self.csm, bundle, reason="other", note="x" * 256)
        self.assertEqual(response.json(), {"note": ["Keep the note under 255 characters."]})
        self.assertEqual(self.reject(self.other, bundle, reason="other").status_code, 404)

    def test_rights_lost_before_the_lock_refuse_the_reject(self):
        from services.agents import bundle_run

        bundle = self.bundle_of(self.pizza, note(), lifecycle())
        checks = iter([True, True, False, True])
        with patch.object(bundle_run, "may_decide", lambda *_: next(checks)):
            response = self.reject(self.csm, bundle, reason="other")
        self.assertEqual(
            (response.status_code, response.json()),
            (403, {"code": "CANT_REJECT", "detail": "You can't reject this bundle."}),
        )
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).status, "waiting")
        self.assertEqual(set(bundle.steps.values_list("status", flat=True)), {"proposed"})
