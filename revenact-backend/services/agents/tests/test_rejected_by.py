"""History names who rejected a bundle (agent bundles D2-28)."""

from services.agents.models import AgentBundle
from services.agents.tests.bundle_fixtures import BUNDLES, HISTORY, BundleFixture, note


class RejectedByTests(BundleFixture):
    def reject(self, user, bundle):
        return self.client_for(user).post(
            f"{BUNDLES}{bundle.pk}/reject/", {"reason": "not_relevant"}, format="json"
        )

    def test_a_reject_stores_and_shows_who_rejected_it(self):
        bundle = self.bundle_of(self.pizza, note())
        answer = self.reject(self.csm, bundle).json()["bundle"]
        self.assertEqual(answer["rejected_by"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).rejected_by_id, self.csm.pk)
        row = self.client_for(self.csm).get(HISTORY).json()["results"][0]
        self.assertEqual(row["rejected_by"], {"id": self.csm.pk, "name": "Carl CSM"})

    def test_any_other_bundle_has_no_rejecter(self):
        bundle = self.bundle_of(self.pizza, note())
        detail = self.client_for(self.csm).get(f"{BUNDLES}{bundle.pk}/").json()
        self.assertIsNone(detail["rejected_by"])

    def test_running_a_rejected_bundle_names_the_rejecter(self):
        bundle = self.bundle_of(self.pizza, note())
        self.reject(self.csm, bundle)
        answer = self.client_for(self.mona).post(
            f"{BUNDLES}{bundle.pk}/run/", {"steps": []}, format="json"
        )
        self.assertEqual(answer.status_code, 409)
        self.assertEqual(answer.json()["detail"], "Carl CSM rejected this.")
