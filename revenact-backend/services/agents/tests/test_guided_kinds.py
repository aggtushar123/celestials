"""The guided agent's three steps (2026-10-18): diagnose, write an email, send
it, each run as its runner. The model is patched; Gmail is the outside fake."""

from datetime import timedelta

from django.utils import timezone

from core.models import AuditEvent
from services.agents.tests.drafts_fixtures import ticket
from services.agents.tests.guided_fixtures import BUNDLE, GuidedFixture
from services.customers.models import Call, Email, Note
from services.mail.agent_send import CONNECT
from services.mail.models import MailboxConnection, MailDraft
from services.mail.visibility import visible_emails

UNDO = "/api/v1/agents/actions/{}/undo/"
STORY = "/api/v1/organizations/{}/story/"


def private_mail(record, owner, body, *, days=1):
    """A synced email in `owner`'s own mailbox, filed on `record`, never shared."""
    return Email.objects.create(
        customer=record,
        subject="Private",
        sender_name="Ann Lee",
        recipient_name=owner.name,
        body=body,
        sent_at=timezone.now() - timedelta(days=days),
        mailbox_owner=owner,
        direction=Email.Direction.RECEIVED,
        from_address="ann@pizzahut.com",
        synced_at=timezone.now(),
    )


class Guided(GuidedFixture):
    def ran(self, user, bundle, kind, fields=None):
        step = self.steps_of(bundle)[kind]
        response = self.run_step(user, bundle, step, fields)
        self.assertEqual(response.status_code, 200, response.content)
        step.refresh_from_db()
        return step, response.json()["bundle"]

    def row(self, body, kind):
        return next(s for s in body["steps"] if s["kind"] == kind)


class DiagnoseTests(Guided):
    def test_it_reads_as_the_runner_and_points_at_its_sources(self):
        made = ticket(self.pizza, title="Login loop", number="ZD-9")
        Call.objects.create(
            customer=self.pizza,
            title="Renewal check-in",
            host_name="Carl",
            occurred_at=timezone.now() - timedelta(days=6),
            summary="They may not renew unless logins work.",
        )
        bundle = self.guided_bundle()
        self.model(
            findings=[
                self.finding("ticket", made.pk, "The login loop is open."),
                self.finding("health", self.pizza.pk, "Health is falling."),
            ]
        )
        step, body = self.ran(self.csm, bundle, "record.diagnose")
        self.assertEqual(step.status, "applied")
        preview = self.row(body, "record.diagnose")["preview"]["diagnose"]
        self.assertEqual(preview["summary"], "Pizza Hut can't log in and is losing trust.")
        self.assertEqual(
            preview["findings"][0],
            {
                "text": "The login loop is open.",
                "source": {
                    "kind": "ticket",
                    "label": "ZD-9: Login loop",
                    "url": f"/organizations/{self.pizza.pk}",
                },
            },
        )
        self.assertEqual(preview["counts"]["tickets"], 1)
        self.assertEqual(preview["counts"]["calls"], 1)
        event = AuditEvent.objects.get(action="agent_diagnose.ran")
        self.assertEqual(event.metadata["findings"], 2)
        self.assertNotIn("summary", event.metadata)

    def test_another_persons_private_mail_never_reaches_the_prompt(self):
        private_mail(self.pizza, self.other, "SECRET-OF-DANA")
        private_mail(self.pizza, self.csm, "CARL-OWN-MAIL")
        bundle = self.guided_bundle()
        mock = self.model()
        step, _ = self.ran(self.csm, bundle, "record.diagnose")
        prompt = self.prompt_of(mock, "agent_diagnose")
        self.assertIn("CARL-OWN-MAIL", prompt)
        self.assertNotIn("SECRET-OF-DANA", prompt)
        self.assertTrue(step.result["private"])
        self.ran(self.csm, bundle, "mail.compose")
        self.assertNotIn("SECRET-OF-DANA", self.prompt_of(mock, "agent_compose"))

    def test_findings_citing_an_unknown_or_unseen_source_are_dropped(self):
        danas = private_mail(self.pizza, self.other, "Dana's own")
        bundle = self.guided_bundle()
        self.model(
            findings=[
                self.finding("ticket", 999999, "Made up."),
                self.finding("email", danas.pk, "From mail Carl can't read."),
                self.finding("health", self.pizza.pk, "Health is falling."),
            ]
        )
        step, _ = self.ran(self.csm, bundle, "record.diagnose")
        self.assertEqual([f["text"] for f in step.result["findings"]], ["Health is falling."])

    def test_with_no_finding_left_the_step_fails_plainly(self):
        bundle = self.guided_bundle()
        self.model(findings=[self.finding("ticket", 999999)])
        step, body = self.ran(self.csm, bundle, "record.diagnose")
        self.assertEqual(step.status, "failed")
        self.assertEqual(step.error, "Couldn't diagnose this just now. Retry it.")
        self.assertEqual(body["status"], "waiting")

    def test_another_reader_sees_only_what_they_may_open(self):
        mine = private_mail(self.pizza, self.csm, "Carl's own")
        bundle = self.guided_bundle()
        self.model(
            findings=[
                self.finding("email", mine.pk, "Ann wrote to Carl."),
                self.finding("health", self.pizza.pk, "Health is falling."),
            ]
        )
        self.ran(self.csm, bundle, "record.diagnose")
        admin = self.client_for(self.admin).get(BUNDLE.format(bundle.pk)).json()
        preview = self.row(admin, "record.diagnose")["preview"]["diagnose"]
        self.assertEqual((preview["summary"], preview["summary_hidden"]), ("", True))
        self.assertEqual([f["text"] for f in preview["findings"]], ["Health is falling."])

    def test_it_files_a_note_in_the_runners_name_shown_on_the_story(self):
        made = ticket(self.pizza, title="Login loop", number="ZD-9")
        bundle = self.guided_bundle()
        self.model(
            findings=[
                self.finding("ticket", made.pk, "The login loop is open."),
                self.finding("health", self.pizza.pk, "Health is falling."),
            ]
        )
        step, body = self.ran(self.csm, bundle, "record.diagnose")
        note = Note.objects.get(customer=self.pizza)
        self.assertEqual((note.author, note.author_name), (self.csm, self.csm.name))
        self.assertEqual(note.title, "Diagnosis: Pizza Hut")
        self.assertEqual(
            note.body,
            "Pizza Hut can't log in and is losing trust.\n\nFindings:\n"
            "- The login loop is open. (ZD-9: Login loop)\n"
            "- Health is falling. (Pizza Hut's health)",
        )
        self.assertNotIn("/organizations", note.body)
        self.assertEqual(step.result["filed_note"]["id"], note.pk)
        row = self.row(body, "record.diagnose")
        # The step's own `note` (a skip or failure's reason) never carries the note's text.
        self.assertEqual(row["note"], "")
        self.assertEqual(
            row["preview"]["diagnose"]["note"], {"id": note.pk, "title": "Diagnosis: Pizza Hut"}
        )
        event = AuditEvent.objects.get(action="agent_diagnose.ran")
        self.assertEqual(event.metadata["note"], note.pk)
        story = self.client_for(self.csm).get(STORY.format(self.pizza.pk)).json()
        self.assertIn(
            ("note", "Diagnosis: Pizza Hut"), [(i["kind"], i["title"]) for i in story["items"]]
        )

    def test_with_private_mail_the_note_has_no_summary_and_only_shareable_findings(self):
        mine = private_mail(self.pizza, self.csm, "CARL-OWN-MAIL")
        bundle = self.guided_bundle()
        self.model(
            findings=[
                self.finding("email", mine.pk, "Ann wrote to Carl privately."),
                self.finding("contact", self.champion.pk, "Ann last replied privately."),
                self.finding("health", self.pizza.pk, "Health is falling."),
            ],
            summary="SUMMARY-FROM-PRIVATE-MAIL",
        )
        step, _ = self.ran(self.csm, bundle, "record.diagnose")
        note = Note.objects.get(customer=self.pizza)
        self.assertEqual(note.body, "Findings:\n- Health is falling. (Pizza Hut's health)")
        self.assertNotIn("SUMMARY-FROM-PRIVATE-MAIL", note.title + note.body)
        # The runner still sees their own summary on the step.
        self.assertEqual(step.result["summary"], "SUMMARY-FROM-PRIVATE-MAIL")

    def test_with_nothing_shareable_no_note_is_filed_and_no_undo_shown(self):
        mine = private_mail(self.pizza, self.csm, "CARL-OWN-MAIL")
        bundle = self.guided_bundle()
        self.model(findings=[self.finding("email", mine.pk, "Ann wrote to Carl privately.")])
        step, body = self.ran(self.csm, bundle, "record.diagnose")
        self.assertEqual(step.status, "applied")
        self.assertFalse(Note.objects.filter(customer=self.pizza).exists())
        row = self.row(body, "record.diagnose")
        self.assertEqual((row["undo"], row["irreversible"]), (None, False))
        self.assertIsNone(row["preview"]["diagnose"]["note"])
        response = self.client_for(self.csm).post(UNDO.format(step.pk))
        self.assertEqual(response.status_code, 409)
        self.assertIn("filed no note", str(response.json()))

    def test_another_reader_never_sees_the_note_or_private_derived_text(self):
        mine = private_mail(self.pizza, self.csm, "Carl's own")
        bundle = self.guided_bundle()
        self.model(
            findings=[
                self.finding("email", mine.pk, "PRIVATE-FINDING"),
                self.finding("health", self.pizza.pk, "Health is falling."),
            ],
            summary="PRIVATE-SUMMARY",
        )
        self.ran(self.csm, bundle, "record.diagnose")
        admin = self.client_for(self.admin)
        preview = self.row(admin.get(BUNDLE.format(bundle.pk)).json(), "record.diagnose")
        self.assertIsNone(preview["preview"]["diagnose"]["note"])
        story = str(admin.get(STORY.format(self.pizza.pk)).json())
        self.assertNotIn("PRIVATE-SUMMARY", story)
        self.assertNotIn("PRIVATE-FINDING", story)
        self.assertNotIn("Diagnosis: Pizza Hut", story)

    def test_undo_deletes_the_note_while_it_is_unchanged(self):
        bundle = self.guided_bundle()
        self.model()
        step, body = self.ran(self.csm, bundle, "record.diagnose")
        row = self.row(body, "record.diagnose")
        self.assertEqual((row["undo"]["allowed"], row["irreversible"]), (True, False))
        response = self.client_for(self.csm).post(UNDO.format(step.pk))
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(Note.objects.filter(customer=self.pizza).exists())

    def test_undo_refuses_once_the_note_was_edited(self):
        bundle = self.guided_bundle()
        self.model()
        step, _ = self.ran(self.csm, bundle, "record.diagnose")
        Note.objects.filter(customer=self.pizza).update(body="Rewritten by Carl.")
        body = self.client_for(self.csm).get(BUNDLE.format(bundle.pk)).json()
        self.assertEqual(self.row(body, "record.diagnose")["undo"]["reason"], "changed_since")
        response = self.client_for(self.csm).post(UNDO.format(step.pk))
        self.assertEqual(response.status_code, 409)
        self.assertTrue(Note.objects.filter(customer=self.pizza).exists())

    def test_before_it_runs_it_counts_what_it_will_read(self):
        ticket(self.pizza)
        bundle = self.guided_bundle()
        body = self.client_for(self.csm).get(BUNDLE.format(bundle.pk)).json()
        preview = self.row(body, "record.diagnose")["preview"]["diagnose"]
        self.assertEqual(preview["counts"], {"tickets": 1, "calls": 0, "emails": 0})
        self.assertIsNone(preview["summary"])
        self.assertIn("slack", preview["reads"])


class ComposeTests(Guided):
    def test_it_drafts_to_the_champion_in_the_runners_gmail_and_hands_it_on(self):
        bundle = self.guided_bundle()
        self.model()
        self.ran(self.csm, bundle, "record.diagnose")
        step, body = self.ran(self.csm, bundle, "mail.compose")
        draft = MailDraft.objects.get(pk=step.result["draft_id"])
        self.assertEqual(
            (draft.owner_id, draft.connection_id, draft.to, draft.subject, draft.customer_id),
            (
                self.csm.pk,
                self.inbox.pk,
                [["Ann Lee", "ann@pizzahut.com"]],
                "Our plan for your login issues",
                self.pizza.pk,
            ),
        )
        self.assertEqual(draft.status, MailDraft.Status.OPEN)
        send = self.steps_of(bundle)["mail.send_draft"]
        self.assertEqual(
            {k: send.payload[k] for k in ("draft_id", "to", "to_name", "subject")},
            {
                "draft_id": draft.pk,
                "to": "ann@pizzahut.com",
                "to_name": "Ann Lee",
                "subject": "Our plan for your login issues",
            },
        )
        compose = self.row(body, "mail.compose")["preview"]["compose"]
        self.assertEqual(compose["body"], "Hi Ann,\n\nWe hear you.")
        sent = self.row(body, "mail.send_draft")
        self.assertEqual(sent["fields"]["to"], "ann@pizzahut.com")
        self.assertEqual(sent["editable"], ["to", "subject", "body"])
        # Someone else reads the bundle: the draft's words are its owner's alone.
        admin = self.client_for(self.admin).get(BUNDLE.format(bundle.pk)).json()
        self.assertTrue(self.row(admin, "mail.compose")["preview"]["compose"]["private"])
        self.assertIsNone(self.row(admin, "mail.compose")["preview"]["compose"]["body"])
        self.assertEqual(
            (
                self.row(admin, "mail.send_draft")["fields"],
                self.row(admin, "mail.send_draft")["editable"],
            ),
            ({}, []),
        )

    def test_only_the_diagnoser_carries_on(self):
        bundle = self.guided_bundle()
        self.model()
        self.ran(self.admin, bundle, "record.diagnose")
        step, _ = self.ran(self.csm, bundle, "mail.compose")
        self.assertEqual(step.status, "failed")
        self.assertEqual(
            step.error, "Only Alice Admin can write this email: they ran the diagnosis."
        )

    def test_without_a_mailbox_it_asks_to_connect_gmail(self):
        MailboxConnection.objects.filter(user=self.csm).delete()
        bundle = self.guided_bundle()
        body = self.client_for(self.csm).get(BUNDLE.format(bundle.pk)).json()
        row = self.row(body, "mail.compose")
        self.assertEqual((row["can_run"], row["disabled_reason"]), (False, CONNECT))
        self.assertEqual(row["disabled_link"], "/settings/connections")

    def test_a_paused_gmail_neither_writes_nor_sends(self):
        from services.mail.gates import PAUSED_MESSAGES

        self.org.gmail_two_way_enabled = False
        self.org.save(update_fields=["gmail_two_way_enabled"])
        bundle = self.guided_bundle()
        body = self.client_for(self.csm).get(BUNDLE.format(bundle.pk)).json()
        for kind in ("mail.compose", "mail.send_draft"):
            row = self.row(body, kind)
            self.assertEqual(
                (row["can_run"], row["disabled_reason"]),
                (False, PAUSED_MESSAGES["workspace_off"]),
            )

    def test_undo_deletes_the_draft_and_empties_the_send(self):
        bundle = self.guided_bundle()
        self.model()
        self.ran(self.csm, bundle, "record.diagnose")
        step, _ = self.ran(self.csm, bundle, "mail.compose")
        response = self.client_for(self.csm).post(UNDO.format(step.pk))
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(
            MailDraft.objects.filter(
                pk=step.result["draft_id"], status=MailDraft.Status.OPEN
            ).exists()
        )
        self.assertNotIn("draft_id", self.steps_of(bundle)["mail.send_draft"].payload)


class SendTests(Guided):
    def written(self):
        bundle = self.guided_bundle()
        self.model()
        self.ran(self.csm, bundle, "record.diagnose")
        self.ran(self.csm, bundle, "mail.compose")
        return bundle

    def test_it_sends_from_the_owners_gmail_and_shares_it_on_the_record(self):
        bundle = self.written()
        step, body = self.ran(self.csm, bundle, "mail.send_draft")
        self.assertEqual(step.status, "applied")
        [sent] = self.mail.sent
        self.assertEqual((sent["mailbox"], sent["to"]), (self.inbox.pk, ["ann@pizzahut.com"]))
        email = Email.objects.get(pk=step.result["email_id"])
        self.assertIsNotNone(email.shared_at)
        self.assertTrue(step.result["shared"])
        # Shared: Carl's manager reads it on Pizza Hut's timeline.
        self.assertTrue(visible_emails(self.mona, Email.objects.filter(pk=email.pk)).exists())
        self.assertTrue(step.irreversible)
        self.assertEqual(body["status"], "done")
        self.assertTrue(AuditEvent.objects.filter(action="mail.agent_sent").exists())
        refused = self.client_for(self.csm).post(UNDO.format(step.pk))
        self.assertEqual(refused.status_code, 409)

    def test_an_edit_rewrites_the_draft_before_it_goes(self):
        bundle = self.written()
        step, _ = self.ran(
            self.csm,
            bundle,
            "mail.send_draft",
            {"subject": "A plan for Pizza Hut", "body": "Hi Ann, sorry."},
        )
        self.assertEqual(step.status, "applied")
        self.assertEqual(self.mail.sent[0]["subject"], "A plan for Pizza Hut")
        draft = MailDraft.objects.get(pk=step.payload["draft_id"])
        self.assertEqual(draft.subject, "A plan for Pizza Hut")

    def test_it_goes_only_to_one_of_the_records_contacts(self):
        bundle = self.written()
        send = self.steps_of(bundle)["mail.send_draft"]
        response = self.run_step(self.csm, bundle, send, {"to": "someone@elsewhere.com"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(),
            {"steps": {str(send.pk): {"to": ["Choose one of Pizza Hut's contacts."]}}},
        )
        self.assertEqual(self.mail.sent, [])

    def test_only_the_drafts_owner_sends_it(self):
        bundle = self.written()
        step, _ = self.ran(self.admin, bundle, "mail.send_draft")
        self.assertEqual(step.status, "failed")
        self.assertEqual(step.error, "Only Carl CSM can send this email: it is in their mailbox.")
        self.assertEqual(self.mail.sent, [])

    def test_an_unconfirmed_send_is_never_sent_twice(self):
        bundle = self.written()
        self.mail.drop_next()
        step, _ = self.ran(self.csm, bundle, "mail.send_draft")
        self.assertEqual(step.status, "failed")
        again = self.retry(self.csm, step)
        self.assertEqual(again.status_code, 200, again.content)
        step.refresh_from_db()
        self.assertEqual(step.status, "failed")
        self.assertIn("Check your Sent mail", step.error)
        self.assertEqual(len(self.mail.sent), 1)
