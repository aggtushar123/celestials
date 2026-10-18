"""A message bundle's text stays with the people who may read its source
(agent bundles D2 contract §5.1, §5.2): the feedback log, which view-all
users read, masks its steps as it masks a draft reply, and a rejected
message bundle's title reaches no prompt but a run of that same thread."""

from datetime import timedelta

from django.utils import timezone

from services.accounts.models import Organisation
from services.agents import evidence
from services.agents.models import AgentBundle
from services.agents.tests.bundle_fixtures import BUNDLES, note, run_one
from services.agents.tests.intake_fixtures import IntakeFixture
from services.metrics.models import AgentAction, Feedback

SECRET = "Jo says the refund is late"


class FeedbackLogMasksMessageStepsTests(IntakeFixture):
    def secret_bundle(self, number):
        _, thread = self.ticket_thread(self.pizza, number=number)
        bundle = self.message_bundle(thread, note(title=SECRET, body=SECRET), title=SECRET)
        AgentAction.objects.filter(bundle=bundle).update(title=SECRET, rationale=SECRET)
        return bundle

    def test_running_and_rejecting_steps_leave_no_thread_text_in_the_log(self):
        ran = run_one(self.client_for(self.csm), self.secret_bundle("ZD-1").steps.get())
        self.assertEqual(ran.status_code, 200, ran.content)
        rejected = self.client_for(self.csm).post(
            f"{BUNDLES}{self.secret_bundle('ZD-2').pk}/reject/", {"reason": "other"}, format="json"
        )
        self.assertEqual(rejected.status_code, 200, rejected.content)
        rows = Feedback.objects.filter(kind=Feedback.Kind.PROPOSAL)
        self.assertEqual(rows.count(), 2)
        for row in rows:
            self.assertNotIn(SECRET, f"{row.subject_label} {row.before} {row.after}")
            self.assertEqual(row.before, {"kind": "note.create", "action": None, "rationale": ""})
        served = self.client_for(self.admin).get("/api/v1/metrics/feedback/")
        self.assertEqual(served.status_code, 200)
        self.assertEqual(len(served.json()["feedback"]), 2)
        self.assertNotIn(SECRET, served.content.decode())

    def test_a_reject_note_stays_out_of_the_log(self):
        bundle = self.secret_bundle("ZD-3")
        rejected = self.client_for(self.csm).post(
            f"{BUNDLES}{bundle.pk}/reject/", {"reason": "other", "note": SECRET}, format="json"
        )
        self.assertEqual(rejected.status_code, 200, rejected.content)
        self.assertEqual(Feedback.objects.get(kind=Feedback.Kind.PROPOSAL).note, "")
        served = self.client_for(self.admin).get("/api/v1/metrics/feedback/")
        self.assertNotIn(SECRET, served.content.decode())
        # The bundle's own note, under the bundle read rule, is unchanged.
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).reject_note, SECRET)

    def test_a_nightly_steps_title_is_kept(self):
        bundle = self.bundle_of(self.pizza, note())
        run_one(self.client_for(self.csm), bundle.steps.get())
        row = Feedback.objects.get(kind=Feedback.Kind.PROPOSAL)
        self.assertEqual(row.subject_label, bundle.steps.get().title)


class RejectedMessageTitleTests(IntakeFixture):
    def reject(self, bundle):
        AgentBundle.objects.filter(pk=bundle.pk).update(
            status="rejected",
            reject_reason="not_relevant",
            updated_at=timezone.now() - timedelta(days=1),
        )

    def block(self, ctx):
        return "\n".join(evidence.record_block(ctx, ctx.records[f"customer:{self.pizza.pk}"]))

    def test_only_a_run_of_the_same_thread_reads_the_title(self):
        _, mail = self.mail_thread(self.pizza, self.csm)
        self.reject(self.message_bundle(mail, note(), title=SECRET))
        _, other = self.ticket_thread(self.pizza)

        nightly = evidence.build(Organisation.objects.get(pk=self.org.pk), "cs", today=self.today)
        self.assertNotIn(SECRET, self.block(nightly))
        self.assertIn('rejected: "A suggestion from a message" (Not relevant,', self.block(nightly))

        other_ctx, _ = self.thread_ctx(other)
        self.assertNotIn(SECRET, self.block(other_ctx))
        self.assertIn("A suggestion from a message", self.block(other_ctx))

        same_ctx, _ = self.thread_ctx(mail)
        self.assertIn(f'rejected: "{SECRET}" (Not relevant,', self.block(same_ctx))
