"""Round 2 D3 contract §3.2, R2D3-8, R2D3-9: matching makes the ticket,
deletes the item, may add the sender as a contact, is audited, and leaves
the thread due for the next run, with no model call in the request."""

import json
from datetime import timedelta
from unittest.mock import patch

from django.db import IntegrityError
from django.utils import timezone

from core.models import AuditEvent
from services.agents.models import SignalThread
from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors.models import UnmatchedItem
from services.connectors.tests.unmatched_fixtures import item
from services.customers.models import Contact, SlackConversation, Ticket


@patch("services.agents.intake.get_completion", side_effect=AssertionError("no model"))
@patch("services.customers.classification.get_completion", side_effect=AssertionError("no model"))
class MatchTests(IntakeFixture):
    def setUp(self):
        self.jira = self.connector("jira", "cs")
        self.row = item(self.jira, external_id="SUP-31", number="SUP-31")

    def match(self, user, body, pk=None):
        return self.client_for(user).post(
            f"/api/v1/work/unmatched/{pk or self.row.pk}/match/", body, format="json"
        )

    def test_carl_matches_it_to_pizza_hut_and_adds_the_sender(self, *_):
        response = self.match(self.csm, {"customer_id": self.pizza.pk, "add_contact": True})
        self.assertEqual(response.status_code, 200, response.json())
        body = response.json()
        ticket = Ticket.objects.get()
        self.assertEqual(
            body,
            {
                "record": {"type": "customer", "id": self.pizza.pk, "name": "Pizza Hut"},
                "ticket": {
                    "id": ticket.pk,
                    "number": "SUP-31",
                    "record": {"type": "customer", "id": self.pizza.pk, "name": "Pizza Hut"},
                },
                "conversation": None,
                "contact_added": True,
            },
        )
        self.assertEqual(
            (ticket.department, ticket.connector, ticket.external_id), ("cs", self.jira, "SUP-31")
        )
        self.assertFalse(UnmatchedItem.objects.exists())
        self.assertTrue(Contact.objects.filter(customer=self.pizza, email="ann@newco.io").exists())
        thread = SignalThread.objects.get()
        self.assertEqual(
            (thread.ticket, thread.status, thread.customer), (ticket, "new", self.pizza)
        )
        event = AuditEvent.objects.get(action="ticket.matched")
        self.assertEqual(
            event.metadata,
            {
                "item": self.row.pk,
                "provider": "jira",
                "connector": self.jira.pk,
                "record": {"type": "customer", "id": self.pizza.pk},
                "contact_added": True,
            },
        )

    def test_the_audit_row_carries_no_title_or_email(self, *_):
        self.match(self.csm, {"customer_id": self.pizza.pk, "add_contact": True})
        event = AuditEvent.objects.get(action="ticket.matched")
        self.assertEqual(event.target_repr, f"Ticket {Ticket.objects.get().pk}")
        stored = f"{event.target_repr} {event.metadata} {event.actor_email}"
        self.assertNotIn("Export fails", stored)
        self.assertNotIn("newco", stored)

    def test_the_thread_is_due_at_the_next_run_whatever_the_age(self, *_):
        UnmatchedItem.objects.filter(pk=self.row.pk).update(
            opened_on=timezone.localdate() - timedelta(days=40)
        )
        self.match(self.csm, {"customer_id": self.pizza.pk})
        thread = SignalThread.objects.get()
        self.assertEqual((thread.status, thread.skip_reason), ("new", ""))

    def test_an_account_gets_its_own_contact(self, *_):
        account = self.emea
        body = self.match(self.csm, {"account_id": account.pk, "add_contact": True}).json()
        self.assertEqual(body["ticket"]["record"]["type"], "account")
        self.assertTrue(Contact.objects.filter(account=account, email="ann@newco.io").exists())

    def test_the_refusals_in_order(self, *_):
        self.assertEqual(
            self.match(self.csm, {}).json(), {"record": ["Choose one customer or account."]}
        )
        self.assertEqual(
            self.match(self.csm, {"customer_id": self.pizza.pk, "add_contact": "yes"}).json(),
            {"add_contact": ["Choose on or off."]},
        )
        self.assertEqual(
            self.match(self.csm, {"customer_id": self.soup.pk, "add_contact": "yes"}).json(),
            {"add_contact": ["Choose on or off."]},
        )
        self.assertEqual(
            self.match(self.csm, {"customer_id": self.soup.pk}).json(),
            {"record": ["Choose a customer or account you can open."]},
        )
        self.assertEqual(
            self.match(self.csm, {"customer_id": self.pizza.pk}, pk=999999).status_code, 404
        )
        self.assertEqual(self.match(self.erin, {"customer_id": self.pizza.pk}).status_code, 404)

    def test_a_connector_that_does_not_cover_the_record(self, *_):
        self.jira.customers.add(self.soup)
        response = self.match(self.csm, {"customer_id": self.pizza.pk})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "NOT_COVERED")
        self.assertIn("doesn't cover Pizza Hut", response.json()["detail"])

    def test_no_email_to_add(self, *_):
        UnmatchedItem.objects.filter(pk=self.row.pk).update(requester_email="")
        self.assertEqual(
            self.match(self.csm, {"customer_id": self.pizza.pk, "add_contact": True}).json(),
            {"add_contact": ["This message has no sender email to add."]},
        )

    def test_matched_twice_is_gone(self, *_):
        self.match(self.csm, {"customer_id": self.pizza.pk})
        again = self.match(self.csm, {"customer_id": self.pizza.pk})
        self.assertEqual(again.status_code, 404)  # the row is gone

    def test_a_dismissed_row_is_gone(self, *_):
        UnmatchedItem.objects.filter(pk=self.row.pk).update(status="dismissed")
        response = self.match(self.csm, {"customer_id": self.pizza.pk})
        self.assertEqual(
            response.json(),
            {"code": "GONE", "detail": "Someone else dealt with this message. Reload the list."},
        )

    def test_an_existing_contact_is_not_added_twice(self, *_):
        Contact.objects.create(customer=self.pizza, name="Ann", email="Ann@NewCo.io")
        body = self.match(self.csm, {"customer_id": self.pizza.pk, "add_contact": True}).json()
        self.assertFalse(body["contact_added"])
        self.assertEqual(Contact.objects.count(), 1)

    def test_a_ticket_for_it_already_exists_is_gone(self, *_):
        Ticket.objects.create(
            customer=self.pizza,
            connector=self.jira,
            external_id="SUP-31",
            ticket_number="SUP-31",
            title="Already here",
            assignee_name="x",
            priority="medium",
            opened_at=timezone.localdate(),
        )
        response = self.match(self.csm, {"customer_id": self.pizza.pk})
        self.assertEqual((response.status_code, response.json()["code"]), (409, "GONE"))
        self.assertTrue(UnmatchedItem.objects.filter(pk=self.row.pk).exists())

    def slack_row(self, **fields):
        slack = self.connector("slack", "cs")
        slack.config = {"channel": "C0SUPPORT", "channel_name": "support", "bot_name": "revenact"}
        slack.save(update_fields=["config"])
        values = {"external_id": "1792041415.357099", "number": "#support"}
        values.update(excerpt="Exports fail.", **fields)
        return item(slack, **{**values})

    def test_matching_a_slack_row_makes_a_conversation(self, *_):
        row = self.slack_row()
        body = self.match(self.csm, {"customer_id": self.pizza.pk}, pk=row.pk).json()
        made = SlackConversation.objects.get()
        self.assertEqual(
            body,
            {
                "record": {"type": "customer", "id": self.pizza.pk, "name": "Pizza Hut"},
                "ticket": None,
                "conversation": {"id": made.pk},
                "contact_added": False,
            },
        )
        self.assertEqual((made.matched_by, made.latest_reply), ("person", ""))
        self.assertEqual(made.messages[0]["text"], "Exports fail.")
        self.assertFalse(Ticket.objects.exists())
        self.assertFalse(UnmatchedItem.objects.filter(pk=row.pk).exists())
        self.assertEqual(SignalThread.objects.get(conversation=made).status, "new")
        event = AuditEvent.objects.get(action="conversation.matched")
        self.assertEqual(event.target_repr, f"Slack thread {made.pk}")
        stored = f"{event.target_repr} {json.dumps(event.metadata)}"
        for secret in ("Exports", "Export fails", "newco"):
            self.assertNotIn(secret, stored)

    def test_a_slack_row_refuses_a_contact(self, *_):
        row = self.slack_row()
        answer = self.match(
            self.csm, {"customer_id": self.pizza.pk, "add_contact": True}, pk=row.pk
        )
        self.assertEqual(
            (answer.status_code, answer.json()),
            (
                400,
                {
                    "add_contact": [
                        "A Slack message is from a colleague. Match it without adding a contact."
                    ]
                },
            ),
        )
        self.assertFalse(SlackConversation.objects.exists())
        self.assertTrue(UnmatchedItem.objects.filter(pk=row.pk, status="waiting").exists())

    def test_a_conversation_for_it_already_exists_is_gone(self, *_):
        row = self.slack_row()
        SlackConversation.objects.create(
            customer=self.pizza,
            connector=row.connector,
            channel="C0SUPPORT",
            thread_ts=row.external_id,
            title="Already here",
            last_message_at=timezone.now(),
            matched_by="channel",
        )
        response = self.match(self.csm, {"customer_id": self.pizza.pk}, pk=row.pk)
        self.assertEqual((response.status_code, response.json()["code"]), (409, "GONE"))
        self.assertTrue(UnmatchedItem.objects.filter(pk=row.pk).exists())

    def test_a_lost_race_on_the_conversation_is_gone_not_a_500(self, *_):
        row = self.slack_row()
        with patch(
            "services.connectors.unmatched._conversation_from", side_effect=IntegrityError("dup")
        ):
            response = self.match(self.csm, {"customer_id": self.pizza.pk}, pk=row.pk)
        self.assertEqual((response.status_code, response.json()["code"]), (409, "GONE"))
        self.assertTrue(UnmatchedItem.objects.filter(pk=row.pk).exists())

    def test_a_jira_match_also_answers_its_record(self, *_):
        body = self.match(self.csm, {"customer_id": self.pizza.pk}).json()
        self.assertEqual(body["record"], body["ticket"]["record"])
        self.assertIsNone(body["conversation"])
