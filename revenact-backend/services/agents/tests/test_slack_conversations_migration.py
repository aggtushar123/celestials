"""agents.0008_slack_tickets_to_conversations (SE1-18): a Slack ticket becomes
a conversation; its thread and its Slack reply steps follow; other tickets stay."""

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import SimpleTestCase, TransactionTestCase
from django.utils import timezone

BEFORE = [("agents", "0007_signal_thread_conversation")]
AFTER = [("agents", "0008_slack_tickets_to_conversations")]


class SlackTicketsMigrationTests(TransactionTestCase):
    def migrate(self, targets):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(targets)
        return executor.loader.project_state(targets).apps

    def tearDown(self):
        self.migrate(MigrationExecutor(connection).loader.graph.leaf_nodes())

    def test_a_slack_ticket_becomes_a_conversation(self):
        apps = self.migrate(BEFORE)
        Organisation = apps.get_model("accounts", "Organisation")
        User = apps.get_model("accounts", "User")
        Customer = apps.get_model("customers", "Customer")
        Connector = apps.get_model("connectors", "Connector")
        Ticket = apps.get_model("customers", "Ticket")
        Thread = apps.get_model("agents", "SignalThread")
        Bundle = apps.get_model("agents", "AgentBundle")
        Action = apps.get_model("metrics", "AgentAction")
        org = Organisation.objects.create(name="Alfiee", currency="USD")
        faiz = User.objects.create(email="faiz@alfee.io", name="Faiz", organisation=org)
        globex = Customer.objects.create(organisation=org, name="Globex (QA)", owner=faiz)
        slack = Connector.objects.create(
            organisation=org,
            provider="slack",
            name="Slack",
            config={"channel": "C0CA7PPRP7A", "channel_name": "all-alfiee"},
        )
        zendesk = Connector.objects.create(organisation=org, provider="zendesk", name="ZD")
        common = {
            "customer": globex,
            "assignee_name": "Unassigned",
            "priority": "high",
            "opened_at": timezone.localdate(),
        }
        ticket = Ticket.objects.create(
            **common,
            connector=slack,
            external_id="1792041415.357099",
            ticket_number="SL-15357099",
            title="CSV exports failing",
            description="Hi team, our CSV exports have been failing since this morning, urgent.",
            requester_name="Mohd faiz",
            requester_email="FAIZ@alfee.io",
            external_url="https://slack.com/archives/C0CA7PPRP7A/p1792041415357099",
            department="",
        )
        other = Ticket.objects.create(
            **common, connector=zendesk, external_id="9", ticket_number="ZD-9", title="Kept"
        )
        thread = Thread.objects.create(
            organisation=org,
            source_kind="slack",
            external_id=f"{slack.pk}:1792041415.357099",
            customer=globex,
            ticket=ticket,
            last_message_at=timezone.now(),
        )
        other_thread = Thread.objects.create(
            organisation=org,
            source_kind="zendesk",
            external_id=f"{zendesk.pk}:9",
            customer=globex,
            ticket=other,
            last_message_at=timezone.now(),
        )
        bundle = Bundle.objects.create(
            organisation=org, agent="cs", title="Globex", source="thread", thread=thread
        )
        step_common = {
            "organisation": org,
            "agent": "cs",
            "batch": "b",
            "customer": globex,
            "title": "Answer",
            "rationale": "Why.",
            "bundle": bundle,
        }
        step = Action.objects.create(
            **step_common,
            kind="slack.reply",
            target=f"draft:ticket:{ticket.pk}",
            payload={"ticket_id": ticket.pk, "connector_id": slack.pk, "text": "On it."},
            status="proposed",
            before="resolved",
            position=1,
        )
        applied = Action.objects.create(
            **step_common,
            kind="slack.reply",
            target=f"draft:ticket:{ticket.pk}",
            payload={"ticket_id": ticket.pk, "connector_id": slack.pk, "text": "Done."},
            status="applied",
            before="resolved",
            position=2,
        )
        zendesk_step = Action.objects.create(
            **step_common,
            kind="ticket.reply",
            target=f"draft:ticket:{other.pk}",
            payload={"ticket_id": other.pk, "text": "Kept."},
            status="proposed",
            before="open",
            position=3,
        )

        apps = self.migrate(AFTER)
        Conversation = apps.get_model("customers", "SlackConversation")
        Ticket = apps.get_model("customers", "Ticket")
        Thread = apps.get_model("agents", "SignalThread")
        Action = apps.get_model("metrics", "AgentAction")
        made = Conversation.objects.get()
        self.assertEqual(
            (made.customer_id, made.connector_id, made.thread_ts, made.matched_by),
            (globex.pk, slack.pk, "1792041415.357099", "earlier"),
        )
        self.assertEqual((made.channel, made.channel_name), ("C0CA7PPRP7A", "all-alfiee"))
        self.assertEqual(made.messages[0]["name"], "Mohd faiz")
        self.assertEqual(made.started_by_id, faiz.pk)  # email matched case-insensitively
        self.assertEqual(made.last_message_at.timestamp(), 1792041415.357099)
        self.assertEqual(list(Ticket.objects.values_list("pk", flat=True)), [other.pk])
        # A Slack thread with no conversation would get no evidence block (Task 7).
        moved = Thread.objects.get(pk=thread.pk)
        self.assertEqual((moved.conversation_id, moved.ticket_id), (made.pk, None))
        kept = Thread.objects.get(pk=other_thread.pk)
        self.assertEqual((kept.conversation_id, kept.ticket_id), (None, other.pk))
        step = Action.objects.get(pk=step.pk)
        self.assertEqual(step.payload["conversation_id"], made.pk)
        self.assertNotIn("ticket_id", step.payload)
        self.assertEqual((step.target, step.before), (f"draft:conversation:{made.pk}", "open"))
        # Whatever its status, a Slack reply step points at the conversation;
        # only a proposed one gets a new `before`.
        applied = Action.objects.get(pk=applied.pk)
        self.assertEqual(
            (applied.payload, applied.target, applied.before),
            (
                {"connector_id": slack.pk, "text": "Done.", "conversation_id": made.pk},
                f"draft:conversation:{made.pk}",
                "resolved",
            ),
        )
        zendesk_step = Action.objects.get(pk=zendesk_step.pk)
        self.assertEqual(
            (zendesk_step.payload, zendesk_step.target, zendesk_step.before),
            ({"ticket_id": other.pk, "text": "Kept."}, f"draft:ticket:{other.pk}", "open"),
        )

    def test_a_waiting_draft_reply_on_a_slack_ticket_expires_as_changed(self):
        """M6 (spec §15.8: not migrated): its ticket is gone, so it reads as
        changed and cannot apply; nothing raises past Stale."""
        apps = self.migrate(BEFORE)
        Organisation = apps.get_model("accounts", "Organisation")
        User = apps.get_model("accounts", "User")
        Customer = apps.get_model("customers", "Customer")
        Connector = apps.get_model("connectors", "Connector")
        Ticket = apps.get_model("customers", "Ticket")
        Action = apps.get_model("metrics", "AgentAction")
        org = Organisation.objects.create(name="Alfiee", currency="USD")
        faiz = User.objects.create(email="faiz@alfee.io", name="Faiz", organisation=org)
        globex = Customer.objects.create(organisation=org, name="Globex", owner=faiz)
        slack = Connector.objects.create(
            organisation=org, provider="slack", name="Slack", config={"channel": "C0X"}
        )
        ticket = Ticket.objects.create(
            customer=globex,
            connector=slack,
            external_id="1792041415.357099",
            ticket_number="SL-1",
            title="Exports fail",
            opened_at=timezone.localdate(),
        )
        thread = apps.get_model("agents", "SignalThread").objects.create(
            organisation=org,
            source_kind="slack",
            external_id=f"{slack.pk}:1792041415.357099",
            customer=globex,
            ticket=ticket,
            last_message_at=timezone.now(),
        )
        bundle = apps.get_model("agents", "AgentBundle").objects.create(
            organisation=org, agent="cs", title="Globex", source="thread", thread=thread
        )
        draft = Action.objects.create(
            bundle=bundle,
            position=1,
            organisation=org,
            agent="cs",
            batch="b",
            customer=globex,
            title="Draft",
            rationale="Why.",
            kind="draft.reply",
            target=f"draft:ticket:{ticket.pk}",
            payload={"ticket_id": ticket.pk, "body": "On it."},
            status="proposed",
            before="open",
        )

        self.migrate(AFTER)
        self.migrate(MigrationExecutor(connection).loader.graph.leaf_nodes())
        from services.agents.kinds import Stale
        from services.agents.registry import REGISTRY
        from services.metrics.models import AgentAction

        action = AgentAction.objects.get(pk=draft.pk)
        kind = REGISTRY["draft.reply"]
        self.assertIsNone(kind.current(action))  # != "open": it expires as changed
        with self.assertRaises(Stale):
            kind.apply(action, faiz)


class MigrationTimeTests(SimpleTestCase):
    """M2: a ts no clock can read falls back to the ticket's opened day."""

    def test_an_unreadable_ts_falls_back_to_the_opened_day(self):
        from datetime import UTC, date, datetime
        from importlib import import_module
        from types import SimpleNamespace

        at = import_module("services.agents.migrations.0008_slack_tickets_to_conversations")._at
        for external_id in ("inf", "1e30", "-1e30", "nan", "", None):
            with self.subTest(external_id=external_id):
                ticket = SimpleNamespace(external_id=external_id, opened_at=date(2026, 10, 1))
                self.assertEqual(at(ticket), datetime(2026, 10, 1, tzinfo=UTC))
