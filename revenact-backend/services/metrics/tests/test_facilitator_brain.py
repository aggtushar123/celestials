"""The facilitator's transcript holds a Brain answer only for a requester the
Brain rule lets read it (services.copilot.views.per_reader): its asker, or a
same-organisation reader who sees everything and reads every ticket
department. Anyone else's prompt carries the redaction notice instead."""

from services.copilot.models import CopilotSession, SessionInvite, SessionParticipant
from services.copilot.tests.test_brain_whole_readers import ANSWER, BrainTurns
from services.copilot.views import REDACTED_REPLY
from services.metrics import facilitator


class FacilitatorBrainTests(BrainTurns):
    def setUp(self):
        super().setUp()
        self.session = CopilotSession.objects.create(
            conversation=self.conversation, status=CopilotSession.Status.LIVE
        )
        SessionInvite.objects.create(
            session=self.session,
            invited_user=self.other,
            invited_by=self.csm,
            status=SessionInvite.Status.ACCEPTED,
        )
        SessionParticipant.objects.create(session=self.session, user=self.other)
        self.store(self.other, self.ask_context("me", "waiting"))

    def prompt(self, requested_by):
        return facilitator.build_prompt(
            facilitator.build_evidence(self.session, requested_by=requested_by)
        )

    def test_a_teammates_brain_answer_never_reaches_a_non_view_all_requesters_prompt(self):
        prompt = self.prompt(self.csm)

        self.assertNotIn(ANSWER, prompt)
        self.assertIn(REDACTED_REPLY, prompt)

    def test_its_asker_and_a_view_all_leadership_requester_get_it(self):
        self.join(self.admin)

        self.assertIn(ANSWER, self.prompt(self.other))
        self.assertIn(ANSWER, self.prompt(self.admin))

    def test_a_requester_is_required(self):
        # No unchecked transcript: every read is someone's (SOC2:AUTH-02).
        with self.assertRaises(TypeError):
            facilitator.build_evidence(self.session)
        with self.assertRaises(TypeError):
            facilitator.capture_decisions(self.session)
