"""Slack escalations D4 contract §1, SE4-10, SE4-11: the new columns, and a
step that ends skipped at run, with its note, never failing its bundle."""

import dataclasses
from unittest.mock import patch

from django.db import IntegrityError, transaction

from core.models import AuditEvent
from services.agents.kinds import Skipped
from services.agents.models import AgentBundle, BundleParticipant
from services.agents.registry import REGISTRY
from services.agents.tests.bundle_fixtures import BundleFixture, note
from services.customers.models import Note, Ticket
from services.customers.tests.slack_fixtures import conversation
from services.metrics.models import AgentAction

RUN = "/api/v1/agents/bundles/{}/run/"
DETAIL = "/api/v1/agents/bundles/{}/"


class ColumnsTests(BundleFixture):
    def test_a_ticket_may_name_the_slack_thread_it_came_from(self):
        thread = conversation(self.pizza)
        ticket = Ticket.objects.create(
            customer=self.pizza,
            title="Exports fail",
            ticket_number="KAN-2",
            assignee_name="Unassigned",
            priority="high",
            opened_at=self.today,
            conversation=thread,
        )
        self.assertEqual(list(thread.tickets.all()), [ticket])
        thread.delete()
        ticket.refresh_from_db()
        self.assertIsNone(ticket.conversation_id)

    def test_a_bundle_is_no_escalation_until_told(self):
        self.assertEqual(self.bundle_of(self.pizza, note()).escalation, {})

    def test_a_conversation_knows_no_one_until_the_sync_says(self):
        self.assertEqual(conversation(self.pizza).people, {})

    def test_a_participant_is_stored_once_per_bundle(self):
        bundle = self.bundle_of(self.pizza, note())
        BundleParticipant.objects.create(bundle=bundle, user=self.csm)
        with self.assertRaises(IntegrityError), transaction.atomic():
            BundleParticipant.objects.create(bundle=bundle, user=self.csm)
        self.assertEqual([p.user_id for p in bundle.participants.all()], [self.csm.pk])


class SkippedStepTests(BundleFixture):
    def run_with_second_skipping(self, bundle):
        first, second = bundle.steps.order_by("position")
        real = REGISTRY["note.create"].apply

        def apply(action, actor, **kw):
            if action.pk == second.pk:
                real(action, actor, **kw)  # writes its note, then skips
                raise Skipped("Nothing to do here.", result={"tried": 1})
            return real(action, actor, **kw)

        kinds = {"note.create": dataclasses.replace(REGISTRY["note.create"], apply=apply)}
        rows = [{"id": s.pk, "selected": True} for s in (first, second)]
        with patch.dict(REGISTRY, kinds):
            answer = self.client_for(self.csm).post(
                RUN.format(bundle.pk), {"steps": rows}, format="json"
            )
        self.assertEqual(answer.status_code, 200, answer.content)
        return first, second, answer.json()["bundle"]

    def test_it_ends_skipped_with_its_note_and_the_bundle_is_done(self):
        bundle = self.bundle_of(self.pizza, note("One"), note("Two"))
        first, second, body = self.run_with_second_skipping(bundle)
        second.refresh_from_db()
        self.assertEqual(
            (second.status, second.result, second.decided_by_id, second.error),
            ("skipped", {"tried": 1, "note": "Nothing to do here."}, self.csm.pk, ""),
        )
        self.assertEqual(second.outputs, {})
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).status, "done")
        self.assertEqual(
            [(s["status"], s["note"]) for s in body["steps"]],
            [("applied", ""), ("skipped", "Nothing to do here.")],
        )
        event = AuditEvent.objects.get(action="agent_action.skipped")
        self.assertEqual(
            (event.metadata["bundle"], event.metadata["kind"]), (bundle.pk, "note.create")
        )

    def test_nothing_it_made_is_kept(self):
        bundle = self.bundle_of(self.pizza, note("One"), note("Two"))
        self.run_with_second_skipping(bundle)
        self.assertEqual(AgentAction.objects.filter(bundle=bundle, status="applied").count(), 1)
        # the skipped step wrote a note before it stopped; its savepoint took it back
        self.assertEqual(Note.objects.filter(title__in=["One", "Two"]).count(), 1)

    def test_a_skipped_step_cannot_be_retried(self):
        bundle = self.bundle_of(self.pizza, note("One"), note("Two"))
        _, second, _ = self.run_with_second_skipping(bundle)
        answer = self.client_for(self.csm).post(
            f"/api/v1/agents/bundles/{bundle.pk}/steps/{second.pk}/retry/", {}, format="json"
        )
        self.assertEqual((answer.status_code, answer.json()["code"]), (409, "NOT_FAILED"))

    def test_every_step_reads_a_note_even_when_there_is_none(self):
        bundle = self.bundle_of(self.pizza, note())
        body = self.client_for(self.csm).get(DETAIL.format(bundle.pk)).json()
        self.assertEqual(body["steps"][0]["note"], "")

    def test_a_bundle_whose_every_chosen_step_skipped_at_run_is_done(self):
        bundle = self.bundle_of(self.pizza, note("One"))
        (only,) = bundle.steps.all()

        def apply(action, actor, **kw):
            raise Skipped("Nothing to do here.")

        kinds = {"note.create": dataclasses.replace(REGISTRY["note.create"], apply=apply)}
        with patch.dict(REGISTRY, kinds):
            answer = self.client_for(self.csm).post(
                RUN.format(bundle.pk), {"steps": [{"id": only.pk, "selected": True}]}, format="json"
            )
        self.assertEqual(answer.status_code, 200, answer.content)
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).status, "done")

    def test_an_unticked_step_does_not_stop_the_bundle_being_done(self):
        bundle = self.bundle_of(self.pizza, note("One"), note("Two"))
        first, second = bundle.steps.order_by("position")
        answer = self.client_for(self.csm).post(
            RUN.format(bundle.pk),
            {"steps": [{"id": first.pk, "selected": True}, {"id": second.pk, "selected": False}]},
            format="json",
        )
        self.assertEqual(answer.status_code, 200, answer.content)
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).status, "done")
