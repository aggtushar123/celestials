"""Running a bundle (contract §5.1, §6.3, §9): the body's checks, the claim,
steps in order each in its own transaction, partial failure, placeholders,
the 409s and 403s, and the audit trail."""

import dataclasses
from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from core.models import AuditEvent
from services.agents.models import AgentBundle
from services.agents.registry import REGISTRY
from services.agents.tests.bundle_fixtures import BUNDLES, BundleFixture, lifecycle, note
from services.agents.tests.fixtures import viewer
from services.customers.models import Note, Task
from services.metrics.models import AgentAction
from services.work.clock import local_now


def boom(action, actor, **_):
    raise ValidationError("Jira says the project SUP needs a component.")


class RunTests(BundleFixture):
    def run_as(self, user, bundle, steps):
        return self.client_for(user).post(
            f"{BUNDLES}{bundle.pk}/run/", {"steps": steps}, format="json"
        )

    def all_of(self, bundle, **fields):
        return [{"id": s.pk, "selected": True, **fields} for s in bundle.steps.order_by("position")]

    def test_run_with_one_edited_and_one_unticked(self):
        bundle = self.bundle_of(self.pizza, note(), lifecycle(), note("Second", "Two"))
        first, second, third = bundle.steps.order_by("position")
        response = self.run_as(
            self.csm,
            bundle,
            [
                {"id": first.pk, "selected": True, "fields": {"body": "Edited body"}},
                {"id": second.pk, "selected": False},
                {"id": third.pk, "selected": True},
            ],
        )
        self.assertEqual(response.status_code, 200, response.data)
        body = response.json()["bundle"]
        self.assertEqual(body["status"], "done")
        self.assertEqual([s["status"] for s in body["steps"]], ["applied", "skipped", "applied"])
        self.assertEqual(body["run_by"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(body["edited_by"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(
            Note.objects.get(pk=body["steps"][0]["outputs"]["note_id"]).body, "Edited body"
        )
        self.assertEqual(AgentAction.objects.get(pk=second.pk).selected, False)
        events = list(
            AuditEvent.objects.filter(action__startswith="agent_bundle.").values_list(
                "action", flat=True
            )
        )
        self.assertEqual(sorted(events), ["agent_bundle.run_finished", "agent_bundle.run_started"])
        self.assertEqual(AuditEvent.objects.filter(action="agent_action.approved").count(), 2)

    def test_untouched_fields_leave_edited_at_empty(self):
        bundle = self.bundle_of(self.pizza, note())
        self.run_as(self.csm, bundle, self.all_of(bundle, fields={"title": "Called the sponsor"}))
        self.assertIsNone(AgentBundle.objects.get(pk=bundle.pk).edited_at)

    def test_a_failure_does_not_stop_later_steps(self):
        broken = dataclasses.replace(REGISTRY["note.create"], apply=boom)
        bundle = self.bundle_of(self.pizza, note(), lifecycle())
        with patch.dict(REGISTRY, {"note.create": broken}):
            body = self.run_as(self.csm, bundle, self.all_of(bundle)).json()["bundle"]
        self.assertEqual(body["status"], "partly_done")
        failed, applied = body["steps"]
        self.assertEqual(
            (failed["status"], failed["error"]),
            ("failed", "Jira says the project SUP needs a component."),
        )
        self.assertEqual(applied["status"], "applied")
        self.assertEqual(Note.objects.filter(customer=self.pizza).count(), 0)
        self.assertTrue(AuditEvent.objects.filter(action="agent_action.failed").exists())

    def test_an_unknown_error_reads_as_a_plain_sentence(self):
        def crash(action, actor, **_):
            raise RuntimeError("secret internals")

        bundle = self.bundle_of(self.pizza, note())
        with patch.dict(
            REGISTRY, {"note.create": dataclasses.replace(REGISTRY["note.create"], apply=crash)}
        ):
            step = self.run_as(self.csm, bundle, self.all_of(bundle)).json()["bundle"]["steps"][0]
        self.assertEqual(step["error"], "Something went wrong running this step. Retry it.")

    def test_a_stale_step_expires_and_a_bundle_of_only_that_expires(self):
        bundle = self.bundle_of(self.pizza, lifecycle())
        type(self.pizza).objects.filter(pk=self.pizza.pk).update(lifecycle_stage="churn")
        body = self.run_as(self.csm, bundle, self.all_of(bundle)).json()["bundle"]
        self.assertEqual(body["status"], "expired")
        self.assertEqual(
            (body["steps"][0]["status"], body["steps"][0]["expired_reason"]), ("expired", "changed")
        )

    def test_a_selected_step_that_expires_before_the_claim_still_counts(self):
        """Contract §1.3: a run whose only selected step left `proposed`
        between the body check and the claim ends expired, not partly done."""
        from services.agents import bundle_run
        from services.agents.deciding import expire

        bundle = self.bundle_of(self.pizza, lifecycle(), note())
        first, second = bundle.steps.order_by("position")
        real = bundle_run.parse_body

        def then_expire(*args, **kwargs):
            parsed = real(*args, **kwargs)
            expire(AgentAction.objects.get(pk=first.pk), "changed")
            return parsed

        steps = [{"id": first.pk, "selected": True}, {"id": second.pk, "selected": False}]
        with patch.object(bundle_run, "parse_body", then_expire):
            response = self.run_as(self.csm, bundle, steps)
        self.assertEqual(response.status_code, 200, response.data)
        body = response.json()["bundle"]
        self.assertEqual(body["status"], "expired")
        self.assertEqual(
            AgentAction.objects.filter(bundle=bundle, selected=True).get().pk, first.pk
        )

    def test_placeholders_fill_from_earlier_steps_and_need_them(self):
        task = (
            "task.create",
            {
                "title": "Call the sponsor",
                "assignee_id": None,
                "assignee_name": "",
                "due_date": (self.today + timedelta(days=3)).isoformat(),
                "priority": "high",
            },
        )
        follow = ("note.create", {"title": "Logged", "body": "Task: {{step 1.task_url}}"})
        bundle = self.bundle_of(self.pizza, task, follow)
        body = self.run_as(self.csm, bundle, self.all_of(bundle)).json()["bundle"]
        task_id = body["steps"][0]["outputs"]["task_id"]
        self.assertEqual(body["steps"][0]["outputs"]["task_url"], f"/work/mine?task={task_id}")
        made = Note.objects.get(pk=body["steps"][1]["outputs"]["note_id"])
        self.assertEqual(made.body, f"Task: /work/mine?task={task_id}")
        self.assertTrue(Task.objects.filter(pk=task_id).exists())

        again = self.bundle_of(self.pizza, ("task.create", {**task[1], "title": "Other"}), follow)
        first, second = again.steps.order_by("position")
        body = self.run_as(
            self.csm,
            again,
            [{"id": first.pk, "selected": False}, {"id": second.pk, "selected": True}],
        ).json()["bundle"]
        self.assertEqual(body["status"], "partly_done")
        self.assertEqual(
            (body["steps"][1]["status"], body["steps"][1]["error"]),
            ("failed", "Needs step 1, which didn't run."),
        )


class RunRefusalTests(BundleFixture):
    def run_as(self, user, bundle, steps):
        return self.client_for(user).post(
            f"{BUNDLES}{bundle.pk}/run/", {"steps": steps}, format="json"
        )

    def test_404_then_403(self):
        bundle = self.bundle_of(self.soup, note())
        step = bundle.steps.get()
        self.assertEqual(
            self.run_as(self.csm, bundle, [{"id": step.pk, "selected": True}]).status_code, 404
        )
        vic = viewer(self.org)
        owner_only = self.bundle_of(self.pizza, ("record.owner", {"owner_id": self.other.pk}))
        response = self.run_as(
            vic, owner_only, [{"id": owner_only.steps.get().pk, "selected": True}]
        )
        self.assertEqual((response.status_code, response.json()["code"]), (403, "CANT_RUN"))
        self.assertEqual(response.json()["detail"], "You can't run this bundle.")

    def test_a_selected_step_the_runner_may_not_run_refuses_the_whole_run(self):
        vic = viewer(self.org)
        bundle = self.bundle_of(self.pizza, ("record.owner", {"owner_id": self.other.pk}), note())
        first, second = bundle.steps.order_by("position")
        response = self.run_as(
            vic, bundle, [{"id": first.pk, "selected": True}, {"id": second.pk, "selected": True}]
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(),
            {"code": "CANT_RUN_STEP", "detail": "You can't run step 1.", "step": first.pk},
        )
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).status, "waiting")

    def test_the_body_checks(self):
        bundle = self.bundle_of(self.pizza, note(), lifecycle())
        first, second = bundle.steps.order_by("position")
        listing = {"steps": ["List every waiting step once."]}
        for steps, errors in (
            ([{"id": first.pk, "selected": True}], listing),
            ([{"id": first.pk, "selected": True}, {"id": first.pk, "selected": True}], listing),
            (
                [{"id": first.pk, "selected": False}, {"id": second.pk, "selected": False}],
                {"steps": ["Choose at least one step to run."]},
            ),
            (
                [
                    {"id": first.pk, "selected": False, "fields": {"body": "x"}},
                    {"id": second.pk, "selected": True},
                ],
                {"steps": {str(first.pk): {"body": ["This can't be changed here."]}}},
            ),
            (
                [
                    {"id": first.pk, "selected": True},
                    {"id": second.pk, "selected": True, "fields": {"stage": "live"}},
                ],
                {"steps": {str(second.pk): {"stage": ["This can't be changed here."]}}},
            ),
            (
                [
                    {"id": first.pk, "selected": True, "fields": {"body": ""}},
                    {"id": second.pk, "selected": True},
                ],
                {"steps": {str(first.pk): {"body": ["Write the note."]}}},
            ),
        ):
            with self.subTest(steps=steps):
                response = self.run_as(self.csm, bundle, steps)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json(), errors)
        self.assertEqual(
            self.client_for(self.csm).post(f"{BUNDLES}{bundle.pk}/run/", {}, format="json").json(),
            listing,
        )
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).status, "waiting")

    def test_409s(self):
        bundle = self.bundle_of(self.pizza, note())
        step = bundle.steps.get()
        self.assertEqual(
            self.run_as(self.csm, bundle, [{"id": step.pk, "selected": True}]).status_code, 200
        )
        again = self.run_as(self.mona, bundle, [{"id": step.pk, "selected": True}])
        finished = AgentBundle.objects.get(pk=bundle.pk).run_finished_at
        at = local_now(self.org, finished).strftime("%H:%M")
        self.assertEqual(again.status_code, 409)
        self.assertEqual(
            (again.json()["code"], again.json()["detail"]),
            ("BUNDLE_RAN", f"Carl CSM ran this at {at}."),
        )
        self.assertEqual(again.json()["bundle"]["status"], "done")

        running = self.bundle_of(self.pizza, note("R", "R"))
        AgentBundle.objects.filter(pk=running.pk).update(
            status="running", run_by=self.csm, run_started_at=timezone.now()
        )
        response = self.run_as(
            self.mona, running, [{"id": running.steps.get().pk, "selected": True}]
        )
        self.assertEqual(
            (response.json()["code"], response.json()["detail"]),
            ("BUNDLE_RUNNING", "Carl CSM is running this."),
        )

        old = self.bundle_of(self.pizza, note("O", "O"))
        AgentBundle.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=15))
        response = self.run_as(self.csm, old, [{"id": old.steps.get().pk, "selected": True}])
        self.assertEqual(
            (response.status_code, response.json()["code"], response.json()["detail"]),
            (409, "BUNDLE_EXPIRED", "This bundle expired: it waited 14 days."),
        )
        self.assertEqual(AgentBundle.objects.get(pk=old.pk).status, "expired")

    def test_ran_on_another_day(self):
        from services.agents.bundle_run import ran_sentence

        bundle = self.bundle_of(self.pizza, note())
        when = timezone.now() - timedelta(days=2)
        AgentBundle.objects.filter(pk=bundle.pk).update(
            status="done", run_by=self.csm, run_finished_at=when
        )
        local = local_now(self.org, when)
        self.assertEqual(
            ran_sentence(AgentBundle.objects.get(pk=bundle.pk), timezone.now()),
            f"Carl CSM ran this on {local.day} {local:%b} at {local:%H:%M}.",
        )
