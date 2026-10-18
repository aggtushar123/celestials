"""campaign.send (contract §7.2): campaign.create plus sending on Run (the
send is only claimed: deliveries queued, nothing emailed), "Save as draft
only", a refusal failing the step with a Retry that claims the same campaign."""

from django.core import mail
from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.agents.kinds import FieldErrors
from services.agents.registry import REGISTRY
from services.agents.tests.builder_fixtures import definition
from services.agents.tests.bundle_fixtures import BUNDLES, BundleFixture
from services.agents.tests.fixtures import viewer
from services.campaigns.models import Campaign, CampaignSend
from services.surveys.tests.fixtures import contact

SPEC = REGISTRY["campaign.send"]


def payload(**fields):
    return {
        "name": "Check-in",
        "segment": definition(),
        "roles": ["champion"],
        "subject": "Hello",
        "body": "Hi {first_name}",
        "draft_only": False,
        **fields,
    }


class CampaignSendTests(BundleFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        contact(cls.dough, "Ann")

    def run_bundle(self, user, bundle, **fields):
        step = bundle.steps.get()
        body = {
            "steps": [{"id": step.pk, "selected": True, **({"fields": fields} if fields else {})}]
        }
        return self.client_for(user).post(f"{BUNDLES}{bundle.pk}/run/", body, format="json")

    def bundle(self, **fields):
        return self.bundle_of(
            None, ("campaign.send", payload(**fields)), agent="ops", title="Check in"
        )

    def test_the_registry_entry_and_preview(self):
        self.assertEqual((SPEC.irreversible, SPEC.max_level, SPEC.agents), (True, "ask", ("ops",)))
        self.assertEqual(SPEC.editable, ("name", "subject", "body", "roles", "draft_only"))
        self.assertEqual(
            SPEC.outputs, ("campaign_id", "campaign_url", "segment_id", "segment_url", "send_id")
        )
        body = self.client_for(self.admin).get(f"{BUNDLES}{self.bundle().pk}/").json()
        campaign = body["steps"][0]["preview"]["campaign"]
        self.assertEqual(
            campaign["audience"], {"contacts": 1, "records": 2, "record_noun": "organisations"}
        )
        self.assertEqual((campaign["subject"], campaign["limit"]), ("Hello", None))

    def test_run_sends_it_as_the_runner(self):
        step = self.run_bundle(self.admin, self.bundle()).json()["bundle"]["steps"][0]
        self.assertEqual(step["status"], "applied", step)
        made = Campaign.objects.get(pk=step["outputs"]["campaign_id"])
        sent = CampaignSend.objects.get(campaign=made)
        self.assertEqual(
            (made.owner_id, sent.sent_by_id, sent.kind), (self.admin.pk, self.admin.pk, "manual")
        )
        self.assertEqual(step["outputs"]["send_id"], sent.pk)
        self.assertEqual(step["outputs"]["campaign_url"], f"/campaigns/{made.pk}")
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(step["undo"]["reason"], "irreversible")

    def test_edits(self):
        step = self.bundle().steps.get()
        edited = SPEC.edit(
            step, {"subject": "Quick question", "draft_only": True}, self.fresh(self.admin)
        )
        self.assertEqual((edited["subject"], edited["draft_only"]), ("Quick question", True))
        with self.assertRaises(FieldErrors) as caught:
            SPEC.edit(step, {"body": "", "roles": []}, self.fresh(self.admin))
        self.assertEqual(
            caught.exception.errors,
            {"body": ["Write the message."], "roles": ["Choose at least one role."]},
        )

    def test_draft_only_and_a_refusal_with_retry(self):
        step = self.run_bundle(self.admin, self.bundle(), draft_only=True).json()["bundle"][
            "steps"
        ][0]
        self.assertFalse(
            CampaignSend.objects.filter(campaign_id=step["outputs"]["campaign_id"]).exists()
        )
        self.assertFalse(step["irreversible"])

        bundle = self.bundle(name="Second", segment=definition(name="Second segment"))
        with self.settings(
            DEBUG=False, EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend"
        ):
            step = self.run_bundle(self.admin, bundle).json()["bundle"]["steps"][0]
        self.assertEqual(step["status"], "failed")
        self.assertEqual(
            step["error"],
            "Email isn't set up for this workspace yet, so campaigns can't be sent.",
        )
        self.assertEqual(Campaign.objects.filter(name="Second").count(), 1)
        retried = (
            self.client_for(self.admin)
            .post(f"{BUNDLES}{bundle.pk}/steps/{step['id']}/retry/", {}, format="json")
            .json()["bundle"]
        )
        self.assertEqual(retried["steps"][0]["status"], "applied")
        self.assertEqual(Campaign.objects.filter(name="Second").count(), 1)

    def failed_once(self):
        """A bundle whose send was refused (email not set up), and its step."""
        bundle = self.bundle()
        with self.settings(
            DEBUG=False, EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend"
        ):
            step = self.run_bundle(self.admin, bundle).json()["bundle"]["steps"][0]
        self.assertEqual(step["status"], "failed")
        return bundle, step

    def retry(self, user, bundle, step, **fields):
        body = {"fields": fields} if fields else {}
        return (
            self.client_for(user)
            .post(f"{BUNDLES}{bundle.pk}/steps/{step['id']}/retry/", body, format="json")
            .json()["bundle"]["steps"][0]
        )

    def test_retry_never_sends_a_campaign_sent_since(self):
        bundle, step = self.failed_once()
        made = Campaign.objects.get(name="Check-in")
        sent = self.client_for(self.admin).post(f"/api/v1/campaigns/{made.pk}/sends/", {})
        self.assertEqual(sent.status_code, 201, sent.data)
        retried = self.retry(self.admin, bundle, step)
        self.assertEqual(
            (retried["status"], retried["error"]), ("failed", "This campaign has been sent.")
        )
        self.assertEqual(Campaign.objects.filter(name="Check-in").count(), 1)
        self.assertEqual(CampaignSend.objects.filter(campaign=made).count(), 1)

    def test_only_the_runner_retries_their_kept_campaign(self):
        bundle, step = self.failed_once()
        retried = self.retry(viewer(self.org), bundle, step)
        self.assertEqual(
            (retried["status"], retried["error"]),
            ("failed", "Only the person who ran this step can retry it."),
        )
        self.assertEqual(Campaign.objects.filter(name="Check-in").count(), 1)
        self.assertFalse(CampaignSend.objects.exists())

    def test_retry_edits_reach_the_kept_campaign(self):
        bundle, step = self.failed_once()
        with CaptureQueriesContext(connection) as queries:
            retried = self.retry(self.admin, bundle, step, subject="New")
        locks = [
            query["sql"]
            for query in queries.captured_queries
            if "FOR NO KEY UPDATE" in query["sql"]
        ]
        # claim's own lock order (workspace, then campaign), so a concurrent
        # "Send now" never deadlocks with the Retry
        self.assertIn('FROM "accounts_organisation"', locks[0])
        self.assertIn('FROM "campaigns_campaign"', locks[1])
        self.assertEqual(retried["status"], "applied", retried)
        made = Campaign.objects.get(name="Check-in")
        self.assertEqual(made.subject, "New")
        self.assertEqual(CampaignSend.objects.get(campaign=made).subject, "New")

    def test_a_different_runner_on_a_sent_campaign_is_told_whose_it_is(self):
        bundle, step = self.failed_once()
        made = Campaign.objects.get(name="Check-in")
        self.client_for(self.admin).post(f"/api/v1/campaigns/{made.pk}/sends/", {})
        retried = self.retry(viewer(self.org), bundle, step)
        self.assertEqual(retried["error"], "Only the person who ran this step can retry it.")
        self.assertEqual(CampaignSend.objects.filter(campaign=made).count(), 1)

    def test_a_refused_edit_fails_the_step_and_keeps_the_campaign(self):
        bundle, step = self.failed_once()
        Campaign.objects.filter(name="Check-in").update(sharing=Campaign.Sharing.PEOPLE)
        retried = self.retry(self.admin, bundle, step, subject="New")
        self.assertEqual(
            (retried["status"], retried["error"]), ("failed", "Choose at least one teammate.")
        )
        step = bundle.steps.get()
        self.assertEqual(step.result["campaign_id"], Campaign.objects.get(name="Check-in").pk)
        self.assertFalse(CampaignSend.objects.exists())
