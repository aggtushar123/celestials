"""Editing a plan: its owner and their managers change the name, the owner
and the status; any other reader gets 403, anyone who cannot open the record
404. Cancelled is final; done only when every milestone is. Deleting is for
editors while no task is completed; otherwise 409, cancel it instead."""

from services.customers.models import Task
from services.plans import validation as say
from services.plans.access import NOT_EDITOR
from services.plans.models import Plan
from services.plans.tests.fixtures import PlanFixture

URL = "/api/v1/plans/"


class PlanEditTests(PlanFixture):
    def patch(self, plan, user=None, **body):
        return self.api(user or self.csm).patch(f"{URL}{plan.pk}/", body, format="json")

    def test_the_owner_and_their_manager_edit(self):
        plan = self.build_plan()
        self.assertEqual(self.patch(plan, name="Renamed").data["name"], "Renamed")
        self.assertEqual(self.patch(plan, user=self.mona, name="Again").status_code, 200)
        self.assertEqual(
            self.events("plan.updated"),
            [(str(plan.pk), {"fields": ["name"]}), (str(plan.pk), {"fields": ["name"]})],
        )

    def test_a_reader_who_does_not_edit_gets_403(self):
        plan = self.build_plan()
        response = self.patch(plan, user=self.admin, name="Mine")
        self.assertEqual((response.status_code, response.data), (403, {"detail": NOT_EDITOR}))

    def test_someone_who_cannot_open_the_record_gets_404(self):
        plan = self.build_plan()
        for user in (self.other, self.stranger):
            self.assertEqual(self.patch(plan, user=user, name="x").status_code, 404)

    def test_a_new_owner_must_be_able_to_open_the_record(self):
        plan = self.build_plan()
        response = self.patch(plan, owner=self.other.pk)
        self.assertEqual((response.status_code, response.data), (400, {"owner": [say.CANT_OPEN]}))
        response = self.patch(plan, owner=self.mona.pk)
        self.assertEqual((response.status_code, response.data["owner"]["id"]), (200, self.mona.pk))
        self.assertEqual(self.events("plan.updated"), [(str(plan.pk), {"fields": ["owner"]})])

    def test_an_edit_that_changes_nothing_records_nothing(self):
        plan = self.build_plan()
        self.assertEqual(self.patch(plan, name=plan.name).status_code, 200)
        self.assertEqual(self.events("plan.updated"), [])

    def test_status_by_hand(self):
        plan = self.build_plan()
        self.assertEqual(self.patch(plan, status="at_risk").data["status"], "at_risk")
        self.assertEqual(self.patch(plan, status="on_track").data["status"], "on_track")
        plan = Plan.objects.get(pk=plan.pk)
        self.assertEqual((plan.status_set_by, plan.at_risk_cleared_on), ("person", self.today))
        self.assertEqual(
            [meta for _, meta in self.events("plan.status_changed")],
            [
                {"old": "not_started", "new": "at_risk", "by": "person"},
                {"old": "at_risk", "new": "on_track", "by": "person"},
            ],
        )

    def test_done_only_when_every_milestone_is(self):
        plan = self.build_plan()
        response = self.patch(plan, status="done")
        self.assertEqual(
            (response.status_code, response.data), (400, {"status": [say.DONE_NEEDS_MILESTONES]})
        )
        plan.milestones.update(done_at=self.now, done_by=self.csm)
        response = self.patch(plan, status="done")
        self.assertEqual(response.data["status"], "done")
        self.assertIsNotNone(Plan.objects.get(pk=plan.pk).done_at)

    def test_only_the_four_statuses_by_hand(self):
        plan = self.build_plan()
        for value in ("not_started", "paused"):
            response = self.patch(plan, status=value)
            self.assertEqual(
                (response.status_code, response.data), (400, {"status": [say.CHOOSE_STATUS]})
            )

    def test_cancelled_is_final(self):
        plan = self.build_plan()
        self.assertEqual(self.patch(plan, status="cancelled").data["status"], "cancelled")
        self.assertEqual(self.events("plan.cancelled"), [(str(plan.pk), {})])
        self.assertEqual(
            self.events("plan.status_changed"),
            [(str(plan.pk), {"old": "not_started", "new": "cancelled", "by": "person"})],
        )
        for body in ({"name": "Back"}, {"status": "on_track"}):
            response = self.patch(plan, **body)
            self.assertEqual(
                (response.status_code, response.data),
                (400, {"non_field_errors": [say.PLAN_FINISHED]}),
            )


class PlanDeleteTests(PlanFixture):
    def delete(self, plan, user=None):
        return self.api(user or self.csm).delete(f"{URL}{plan.pk}/")

    def test_an_editor_deletes_a_plan_with_no_completed_work(self):
        plan = self.build_plan()
        self.assertEqual(self.delete(plan).status_code, 204)
        self.assertFalse(Plan.objects.filter(pk=plan.pk).exists())
        self.assertFalse(Task.objects.filter(title="Hold the call").exists())
        self.assertEqual(
            self.events("plan.deleted"),
            [
                (
                    str(plan.pk),
                    {"template": None, "record_kind": "customer", "record_id": self.pizza.pk},
                )
            ],
        )

    def test_completed_work_means_cancel_instead(self):
        plan = self.build_plan()
        plan.tasks.filter(title="Hold the call").update(status="completed")
        response = self.delete(plan)
        self.assertEqual(
            (response.status_code, response.data),
            (409, {"code": "PLAN_HAS_DONE_WORK", "detail": say.HAS_DONE_WORK}),
        )
        self.assertTrue(Plan.objects.filter(pk=plan.pk).exists())

    def test_hidden_completed_work_counts_too(self):
        plan = self.build_plan(
            steps=[("Only", 3, [("Secret", self.admin, "completed", self.admin)])]
        )
        self.assertEqual(self.delete(plan).status_code, 409)

    def test_only_editors_delete(self):
        plan = self.build_plan()
        self.assertEqual(self.delete(plan, user=self.admin).status_code, 403)
        self.assertEqual(self.delete(plan, user=self.other).status_code, 404)
        self.assertEqual(self.delete(plan, user=self.mona).status_code, 204)

    def test_can_delete_on_the_plan_page(self):
        plan = self.build_plan()
        page = f"{URL}{plan.pk}/"
        self.assertTrue(self.api(self.csm).get(page).data["can_delete"])
        self.assertFalse(self.api(self.admin).get(page).data["can_delete"])
        plan.tasks.filter(title="Hold the call").update(status="completed")
        self.assertFalse(self.api(self.csm).get(page).data["can_delete"])
