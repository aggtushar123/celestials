"""survey.send (contract §7.1): validated as the agent writes it, previewed
for the reader with the audience, made and sent as the runner on Run, or
saved as a draft only; a refused send keeps the draft for Retry. Nothing
leaves the building: the send is only claimed (invites queued)."""

from django.core import mail

from services.agents.kinds import Invalid
from services.agents.models import AgentBundle
from services.agents.registry import REGISTRY
from services.agents.tests.builder_fixtures import definition
from services.agents.tests.bundle_fixtures import BUNDLES, BundleFixture
from services.surveys.models import SurveyInvite, SurveySend
from services.surveys.tests.fixtures import contact

SPEC = REGISTRY["survey.send"]


def payload(**fields):
    return {
        "name": "Q4 NPS",
        "survey_type": "nps",
        "subject": "Two minutes?",
        "intro": "We'd love your view.",
        "segment": definition(),
        "roles": ["champion"],
        "draft_only": False,
        **fields,
    }


class SurveySendTests(BundleFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        contact(cls.dough, "Ann")
        contact(cls.taco, "Tia")

    def bundle(self, **fields):
        return self.bundle_of(
            None, ("survey.send", payload(**fields)), agent="ops", title="Ask for NPS"
        )

    def run_bundle(self, user, bundle, **fields):
        step = bundle.steps.get()
        body = {
            "steps": [{"id": step.pk, "selected": True, **({"fields": fields} if fields else {})}]
        }
        return self.client_for(user).post(f"{BUNDLES}{bundle.pk}/run/", body, format="json")

    def test_the_registry_entry(self):
        self.assertEqual(
            (SPEC.max_level, SPEC.agents, SPEC.workspace_level, SPEC.builder, SPEC.irreversible),
            ("ask", ("ops",), True, True, True),
        )
        self.assertEqual(
            SPEC.editable, ("name", "survey_type", "subject", "intro", "roles", "draft_only")
        )
        self.assertEqual(SPEC.outputs, ("survey_id", "survey_url", "segment_id", "segment_url"))

    def test_preview_counts_the_audience_for_the_reader(self):
        bundle = self.bundle()
        body = self.client_for(self.admin).get(f"{BUNDLES}{bundle.pk}/").json()
        survey = body["steps"][0]["preview"]["survey"]
        self.assertEqual(
            survey["audience"], {"contacts": 2, "records": 2, "record_noun": "organisations"}
        )
        self.assertEqual(
            survey["question"], "How likely are you to recommend Acme Inc to a friend or colleague?"
        )
        self.assertEqual(
            (survey["limit"], survey["segment"], survey["roles"]),
            (500, "Poor health", ["Champion"]),
        )
        self.assertTrue(body["steps"][0]["irreversible"])

    def test_run_makes_and_sends_it_as_the_runner(self):
        bundle = self.bundle()
        response = self.run_bundle(self.admin, bundle)
        self.assertEqual(response.status_code, 200, response.data)
        step = response.json()["bundle"]["steps"][0]
        self.assertEqual(step["status"], "applied")
        send = SurveySend.objects.get(pk=step["outputs"]["survey_id"])
        self.assertEqual(
            (send.owner_id, send.status, send.segment.owner_id),
            (self.admin.pk, "sending", self.admin.pk),
        )
        self.assertEqual(step["outputs"]["survey_url"], f"/surveys/{send.pk}")
        self.assertEqual(SurveyInvite.objects.filter(send=send, status="queued").count(), 2)
        self.assertEqual(len(mail.outbox), 0)  # delivery is the minute runner's; never run in tests
        self.assertTrue(step["irreversible"])
        self.assertEqual(step["undo"], {"allowed": False, "until": None, "reason": "irreversible"})

    def test_save_as_draft_only(self):
        bundle = self.bundle()
        step = self.run_bundle(self.admin, bundle, draft_only=True).json()["bundle"]["steps"][0]
        send = SurveySend.objects.get(pk=step["outputs"]["survey_id"])
        self.assertEqual(send.status, "draft")
        self.assertFalse(step["irreversible"])
        self.assertTrue(step["undo"]["allowed"])
        undone = self.client_for(self.admin).post(f"/api/v1/agents/actions/{step['id']}/undo/")
        self.assertEqual(undone.status_code, 200, undone.data)
        self.assertFalse(SurveySend.objects.filter(pk=send.pk).exists())

    def test_a_refused_send_keeps_the_draft_and_retry_sends_it(self):
        bundle = self.bundle()
        with self.settings(
            DEBUG=False, EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend"
        ):
            step = self.run_bundle(self.admin, bundle).json()["bundle"]["steps"][0]
        self.assertEqual(
            (step["status"], step["error"]),
            ("failed", "Email isn't set up for this workspace yet, so surveys can't be sent."),
        )
        drafts = SurveySend.objects.filter(owner=self.admin)
        self.assertEqual(list(drafts.values_list("status", flat=True)), ["draft"])
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).status, "partly_done")
        retried = (
            self.client_for(self.admin)
            .post(f"{BUNDLES}{bundle.pk}/steps/{step['id']}/retry/", {}, format="json")
            .json()["bundle"]
        )
        self.assertEqual((retried["status"], retried["steps"][0]["status"]), ("done", "applied"))
        self.assertEqual(list(drafts.values_list("status", flat=True)), ["sending"])

    def test_retry_reuses_the_kept_survey_even_once_it_is_sending(self):
        bundle = self.bundle()
        with self.settings(
            DEBUG=False, EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend"
        ):
            step = self.run_bundle(self.admin, bundle).json()["bundle"]["steps"][0]
        self.assertEqual(step["status"], "failed")
        SurveySend.objects.filter(owner=self.admin).update(status="sending")
        retried = (
            self.client_for(self.admin)
            .post(f"{BUNDLES}{bundle.pk}/steps/{step['id']}/retry/", {}, format="json")
            .json()["bundle"]["steps"][0]
        )
        self.assertEqual(
            (retried["status"], retried["error"]), ("failed", "This survey is being sent.")
        )
        self.assertEqual(SurveySend.objects.filter(owner=self.admin).count(), 1)

    def fail_for_email(self, bundle):
        with self.settings(
            DEBUG=False, EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend"
        ):
            step = self.run_bundle(self.admin, bundle).json()["bundle"]["steps"][0]
        self.assertEqual(step["status"], "failed")
        return step

    def retry(self, user, bundle, step, **fields):
        body = {"fields": fields} if fields else {}
        return (
            self.client_for(user)
            .post(f"{BUNDLES}{bundle.pk}/steps/{step['id']}/retry/", body, format="json")
            .json()["bundle"]["steps"][0]
        )

    def test_retry_by_someone_else_fails_and_makes_nothing(self):
        from services.agents.tests.fixtures import viewer

        bundle = self.bundle()
        step = self.fail_for_email(bundle)
        retried = self.retry(viewer(self.org), bundle, step)
        self.assertEqual(
            (retried["status"], retried["error"]),
            ("failed", "Only the person who ran this step can retry it."),
        )
        self.assertEqual(SurveySend.objects.count(), 1)

    def test_retry_edits_reach_the_kept_draft(self):
        bundle = self.bundle()
        step = self.fail_for_email(bundle)
        retried = self.retry(self.admin, bundle, step, subject="New")
        self.assertEqual(retried["status"], "applied")
        send = SurveySend.objects.get()
        self.assertEqual((send.subject, send.status), ("New", "sending"))

    def test_a_refusal_on_a_field_fails_with_its_sentence(self):
        bundle = self.bundle(roles=["decision_maker"])
        step = self.run_bundle(self.admin, bundle).json()["bundle"]["steps"][0]
        self.assertEqual((step["status"], step["error"]), ("failed", "Nobody to send to."))
        self.assertEqual(
            list(SurveySend.objects.filter(owner=self.admin).values_list("status", flat=True)),
            ["draft"],
        )

    def test_validate_refuses_what_the_agent_may_not_write(self):
        from services.accounts.models import Organisation
        from services.agents import evidence

        ctx = evidence.build(Organisation.objects.get(pk=self.org.pk), "ops", today=self.today)
        clean = SPEC.validate(payload(), None, ctx, [])
        self.assertEqual(clean["draft_only"], True)
        for bad in (
            payload(survey_type="poll"),
            payload(subject=""),
            payload(roles=[]),
            payload(segment={"kind": "customer"}),
        ):
            with self.subTest(bad=bad), self.assertRaises(Invalid):
                SPEC.validate(bad, None, ctx, [])

    def test_edits(self):
        bundle = self.bundle()
        step = bundle.steps.get()
        edited = SPEC.edit(
            step, {"subject": "Quick question", "survey_type": "csat"}, self.fresh(self.admin)
        )
        self.assertEqual((edited["subject"], edited["survey_type"]), ("Quick question", "csat"))
        from services.agents.kinds import FieldErrors

        with self.assertRaises(FieldErrors) as caught:
            SPEC.edit(step, {"survey_type": "poll", "roles": []}, self.fresh(self.admin))
        self.assertEqual(set(caught.exception.errors), {"survey_type", "roles"})
