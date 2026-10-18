"""End-to-end tier: real server, real HTTP, real test DB; Slack and Gmail are
fakes (their APIs in memory) and so is the model. Nothing leaves the process.

Journey (guided agent, 2026-10-18): a colleague writes in #support "Carl, I
heard Pizza Hut is unhappy with our services, could you diagnose and get it
fixed?". Pizza Hut's health fell from 7.8 to 6.1 in two weeks. The agents
read the thread and propose diagnose, write an email, send it: a priority
bundle for Carl, who owns Pizza Hut, and he is told at once. In Work it is a
priority item. He opens it and answers each question in turn: the diagnosis
with its findings, the email drafted in his Gmail to Pizza Hut's champion,
then sent from his Gmail. The sent email is added to Revenact, so it is on
Pizza Hut's timeline for whoever opens Pizza Hut."""

import json
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import LiveServerTestCase
from django.utils import timezone

from e2e.agent_round2_world import Round2World
from e2e.http import http_get, http_post
from services.accounts.models import Organisation, User
from services.agents.models import SignalThread
from services.customers.models import Contact, Customer, Email, HealthSnapshot, SlackConversation
from services.identity.models import OrganizationDomain
from services.mail.models import MailDraft
from services.mail.tests.gmail_fake import FakeGmail
from services.mail.tests.gmail_fixtures import google_connection
from services.mail.visibility import visible_emails
from services.notifications.models import Notification

ASK = "Carl, I heard Pizza Hut is unhappy with our services, could you diagnose and get it fixed?"
TRIO = [
    {"kind": kind, "title": title, "rationale": "Pizza Hut is unhappy.", "payload": {}}
    for kind, title in (
        ("record.diagnose", "Diagnose Pizza Hut"),
        ("mail.compose", "Write to Pizza Hut"),
        ("mail.send_draft", "Send the email"),
    )
]


class GuidedAgentFlowTests(Round2World, LiveServerTestCase):
    def setUp(self):
        self.use_world_fakes()
        self.gmail = FakeGmail("carl@acme.io")
        for target, stand_in in (
            ("services.mail.providers.google.http_json", self.gmail),
            ("services.mail.providers.google.http_upload", self.gmail.upload),
        ):
            patcher = patch(target, stand_in)
            patcher.start()
            self.addCleanup(patcher.stop)

    def model(self, health):
        answers = {
            "agent_diagnose": {
                "summary": "Pizza Hut's health fell and nobody can log in since the reset.",
                "findings": [
                    {
                        "text": "Health fell from 7.8 to 6.1.",
                        "source": {"kind": "health", "ref": health},
                    },
                ],
            },
            "agent_compose": {
                "subject": "Fixing your login issues",
                "body": "Hi Ann,\n\nWe know logins have been failing. Here is our plan.",
            },
        }
        return patch(
            "services.agents.diagnosis.get_completion",
            side_effect=lambda *a, **k: json.dumps(answers[k["purpose"]]),
        )

    def answer_yes(self, token, bundle, step):
        status, body = http_post(
            self.api(f"/agents/bundles/{bundle}/steps/{step}/run/"), {}, token=token
        )
        self.assertEqual(status, 200, body)
        return body["bundle"]

    def test_a_thread_becomes_a_guided_priority_bundle_answered_one_question_at_a_time(self):
        alice, carl, pizza = self.workspace()
        Contact.objects.create(
            customer=pizza, name="Ann Lee", email="ann@pizzahut.com", role="champion"
        )
        Customer.objects.filter(pk=pizza.pk).update(health_score=Decimal("6.1"))
        HealthSnapshot.objects.create(
            customer=pizza,
            captured_on=timezone.localdate() - timedelta(days=14),
            health_score=Decimal("7.8"),
        )
        # Two-way Gmail is on for the workspace, its domain verified (Gmail D1's gate).
        Organisation.objects.filter(pk=carl.organisation_id).update(gmail_two_way_enabled=True)
        OrganizationDomain.objects.create(
            organisation=carl.organisation,
            domain="acme.io",
            verification_status=OrganizationDomain.VerificationStatus.VERIFIED,
        )
        google_connection(User.objects.get(pk=carl.pk))
        self.connect_slack_and_jira(alice)

        # The message is synced and read: the trio, priority, Carl told at once.
        self.slack.channels["C0SUPPORT"] = []
        self.slack.say("C0SUPPORT", "U0FAIZ", ASK)
        self.sync()
        thread = SignalThread.objects.get(conversation=SlackConversation.objects.get())
        bundle = self.read_thread(carl.organisation, thread, "message ", TRIO)
        self.assertEqual(bundle.priority, "high")
        note = Notification.objects.get(kind="agent_bundle_priority")
        self.assertEqual(note.recipient_id, carl.pk)

        token = self.login("carl@acme.io")
        status, feed = http_get(self.api("/work/feed/?kind=bundle"), token)
        self.assertEqual(status, 200, feed)
        [item] = [i for g in feed["groups"] for i in g["items"] if i["kind"] == "bundle"]
        self.assertEqual((item["id"], item["detail"]["priority"]), (bundle.pk, "high"))

        status, detail = http_get(self.api(f"/agents/bundles/{bundle.pk}/"), token)
        self.assertEqual(status, 200, detail)
        self.assertTrue(detail["guided"])
        diagnose, compose, send = detail["steps"]
        self.assertEqual(
            diagnose["question"], "Pizza Hut's health dropped from 7.8 to 6.1. Should I diagnose?"
        )
        self.assertEqual(send["question"], "Should I send it to Ann Lee?")
        self.assertEqual(detail["next_step"], diagnose["id"])

        with self.model(pizza.pk):
            # Should I diagnose? Yes.
            body = self.answer_yes(token, bundle.pk, diagnose["id"])
            self.assertEqual(body["status"], "waiting")
            found = body["steps"][0]["preview"]["diagnose"]
            self.assertEqual(found["findings"][0]["text"], "Health fell from 7.8 to 6.1.")
            self.assertEqual(body["next_step"], compose["id"])
            # Should I write an email to save Pizza Hut? Yes.
            body = self.answer_yes(token, bundle.pk, compose["id"])
            draft = MailDraft.objects.get(owner=carl)
            self.assertEqual(draft.to, [["Ann Lee", "ann@pizzahut.com"]])
            self.assertEqual(body["steps"][2]["fields"]["subject"], "Fixing your login issues")
            # Should I send it to Ann Lee? Yes.
            body = self.answer_yes(token, bundle.pk, send["id"])
        sent = body["steps"][2]
        self.assertEqual(body["status"], "done", [s["error"] for s in body["steps"]])
        self.assertEqual(sent["status"], "applied", sent["error"])
        self.assertTrue(sent["irreversible"])
        [upload] = [u for u in self.gmail.uploads if u[1] == "/messages/send"]
        self.assertEqual(upload[3]["To"], "Ann Lee <ann@pizzahut.com>")
        self.assertEqual(upload[3]["Subject"], "Fixing your login issues")
        draft.refresh_from_db()
        self.assertEqual(draft.status, MailDraft.Status.SENT)
        # Added to Revenact: on Pizza Hut's timeline for whoever opens it.
        email = Email.objects.get(pk=sent["outputs"]["email_id"])
        self.assertIsNotNone(email.shared_at)
        self.assertEqual(email.customer_id, pizza.pk)
        admin = User.objects.get(email="alice@acme.io")
        self.assertTrue(visible_emails(admin, Email.objects.filter(pk=email.pk)).exists())

    def sync(self, passes=3):
        from io import StringIO

        from django.core.management import call_command

        from services.connectors.models import SlackChannel

        for _ in range(passes):
            SlackChannel.objects.update(asked_at=timezone.now() - timedelta(minutes=2))
            call_command("sync_tickets", stdout=StringIO(), stderr=StringIO())
