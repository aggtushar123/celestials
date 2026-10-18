"""Old action routes and links (contract D19, D20, §10.6, §10.7)."""

from services.agents.tests.bundle_fixtures import BundleFixture, note
from services.notifications.models import Notification
from services.work import proposal_notice
from services.work.clock import today_for

LIST = "/api/v1/agents/actions/"


class LegacyRouteTests(BundleFixture):
    def test_approve_and_reject_point_at_the_bundle(self):
        bundle = self.bundle_of(self.pizza, note())
        step = bundle.steps.get()
        for decision in ("approve", "reject"):
            with self.subTest(decision=decision):
                response = self.client_for(self.csm).post(
                    f"{LIST}{step.pk}/{decision}/", {}, format="json"
                )
                self.assertEqual(response.status_code, 409)
                self.assertEqual(
                    response.json(),
                    {
                        "code": "USE_BUNDLE",
                        "detail": "Open the bundle to decide this.",
                        "bundle": bundle.pk,
                    },
                )
        self.assertEqual(
            self.client_for(self.other).post(f"{LIST}{step.pk}/approve/").status_code, 404
        )

    def test_list_detail_and_undo_still_work(self):
        bundle = self.bundle_of(self.pizza, note())
        step = bundle.steps.get()
        self.run_one(self.csm, step)
        self.assertEqual(
            self.client_for(self.csm).get(LIST).json()["results"][0]["bundle"], bundle.pk
        )
        response = self.client_for(self.mona).post(f"{LIST}{step.pk}/undo/")
        self.assertEqual(response.status_code, 200, response.data)
        told = Notification.objects.get(recipient=self.csm, kind="agent_action_undone")
        self.assertEqual(told.link, f"/work?queue=history&bundle={bundle.pk}")

    def test_the_notice_is_bundles_waiting(self):
        self.bundle_of(self.pizza, note())
        told = proposal_notice.notify_proposals(self.org, today=today_for(self.org))
        self.assertEqual(told, 1)
        notice = Notification.objects.get(recipient=self.csm, kind="agent_proposal_waiting")
        self.assertEqual(
            (notice.message, notice.link, notice.get_kind_display()),
            (
                "Bundles are waiting for your decision.",
                "/work?queue=mine&kind=bundle",
                "Bundles waiting",
            ),
        )
