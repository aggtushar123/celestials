"""The guided agent's tests' world (2026-10-18): OutsideFixture's people,
book and fakes (Carl `self.csm` owns Pizza Hut and reports to Mona; Alice
`self.admin` is an admin with view-all; Dana `self.other`), plus Carl's
connected Gmail, Pizza Hut's champion, a Slack thread about Pizza Hut and
the guided bundle made from it: diagnose, write an email, send it. The
model is always patched (`model`), keyed by purpose; nothing is sent."""

import json
from unittest.mock import patch

from services.agents.actions.diagnose import new_key
from services.agents.models import AgentBundle
from services.agents.tests.outside_fixtures import OutsideFixture
from services.customers.models import Contact

MODEL = "services.agents.diagnosis.get_completion"
BUNDLE = "/api/v1/agents/bundles/{}/"
STEP_RUN = "/api/v1/agents/bundles/{}/steps/{}/run/"
STOP = "/api/v1/agents/bundles/{}/stop/"
TRIO = ("record.diagnose", "mail.compose", "mail.send_draft")


class GuidedFixture(OutsideFixture):
    def setUp(self):
        super().setUp()
        # Two-way Gmail is on for the workspace: a paused mailbox never writes or sends.
        self.org.gmail_two_way_enabled = True
        self.org.save(update_fields=["gmail_two_way_enabled"])
        self.inbox = self.gmail_for(self.csm)
        self.champion = Contact.objects.create(
            customer=self.pizza,
            name="Ann Lee",
            email="ann@pizzahut.com",
            role=Contact.Role.CHAMPION,
        )
        self.findings = None
        self.email = {
            "subject": "Our plan for your login issues",
            "body": "Hi Ann,\n\nWe hear you.",
        }

    def guided_bundle(self, *extra, record=None):
        """A waiting guided bundle on a Slack thread about `record` (Pizza Hut)."""
        conversation, thread = self.slack_thread(record or self.pizza)
        self.conversation, self.thread = conversation, thread
        steps = [(kind, {"key": new_key()}) for kind in TRIO]
        return self.outside_bundle(thread, *steps, *extra)

    def steps_of(self, bundle):
        return {step.kind: step for step in bundle.steps.order_by("position")}

    def finding(self, kind, ref, text="Logins fail since the reset."):
        return {"text": text, "source": {"kind": kind, "ref": ref}}

    def model(self, *, findings=None, summary="Pizza Hut can't log in and is losing trust."):
        """The diagnosis and the email the model answers for the rest of the test."""
        answers = {
            "agent_diagnose": {
                "summary": summary,
                "findings": findings
                if findings is not None
                else [self.finding("health", self.pizza.pk, "Health is falling.")],
            },
            "agent_compose": self.email,
        }

        def answer(*args, **kwargs):
            return json.dumps(answers[kwargs["purpose"]])

        found = patch(MODEL, side_effect=answer)
        mock = found.start()
        self.addCleanup(found.stop)
        return mock

    def prompt_of(self, mock, purpose):
        """The user message the model was given for `purpose`."""
        for call in mock.call_args_list:
            if call.kwargs["purpose"] == purpose:
                return call.args[1][0]["content"]
        raise AssertionError(f"no {purpose} call")

    def run_step(self, user, bundle, step, fields=None):
        body = {"fields": fields} if fields else {}
        return self.client_for(user).post(STEP_RUN.format(bundle.pk, step.pk), body, format="json")

    def fresh_bundle(self, bundle):
        return AgentBundle.objects.get(pk=bundle.pk)
