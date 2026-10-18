"""Round 2 D3 contract §2, R2D3-6: a sync keeps an unmatched Slack or Jira
item, still counts it as unmatched, never classifies it, and forgets it when
the item later matches a customer."""

from unittest.mock import patch

from django.utils import timezone

from services.agents.models import SignalThread
from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors import unmatched
from services.connectors.models import UnmatchedItem
from services.connectors.providers.base import RemoteTicket
from services.connectors.sync import sync_connector
from services.connectors.tests.jira_fake import use_jira
from services.connectors.tests.unmatched_fixtures import remote
from services.customers.models import Contact, Ticket


def issue(key, email, name="Ann Lee", summary="Export fails"):
    now = timezone.now().isoformat()
    return {
        "key": key,
        "fields": {
            "summary": summary,
            "status": {"statusCategory": {"key": "new"}},
            "priority": {"name": "Highest"},
            "reporter": {"emailAddress": email, "displayName": name},
            "created": now,
            "updated": now,
            "description": None,
            "labels": [],
        },
    }


@patch(
    "services.customers.classification.get_completion",
    side_effect=AssertionError("no model at sync"),
)
class UnmatchedSyncTests(IntakeFixture):
    def setUp(self):
        self.api = use_jira(self)
        self.jira = self.connector("jira", "cs")
        self.jira.config = {"host": "acme.atlassian.net", "project": "SUP"}
        self.jira.set_credentials({"email": "bot@acme.io", "api_token": "fake"})
        self.jira.save()

    def test_an_unknown_reporter_is_kept_counted_and_never_read(self, _model):
        self.api.synced = [issue("SUP-31", "ann@newco.io")]
        counts = sync_connector(self.jira)
        self.assertEqual(counts["unmatched"], 1)
        row = UnmatchedItem.objects.get()
        self.assertEqual((row.number, row.priority), ("SUP-31", "critical"))
        self.assertFalse(Ticket.objects.exists())
        self.assertFalse(SignalThread.objects.exists())

    def test_it_is_forgotten_once_the_reporter_matches(self, _model):
        self.api.synced = [issue("SUP-31", "ann@newco.io")]
        sync_connector(self.jira)
        Contact.objects.create(customer=self.pizza, name="Ann Lee", email="ann@newco.io")
        with patch("services.connectors.sync.classify_new"):
            sync_connector(self.jira)
        self.assertFalse(UnmatchedItem.objects.exists())
        self.assertEqual(Ticket.objects.get().customer, self.pizza)

    def test_an_existing_ticket_clears_a_stray_waiting_row(self, _model):
        self.api.synced = [issue("SUP-31", "ann@pizza.io")]
        Contact.objects.create(customer=self.pizza, name="Ann Lee", email="ann@pizza.io")
        with patch("services.connectors.sync.classify_new"):
            sync_connector(self.jira)
        unmatched.keep(
            self.jira,
            RemoteTicket(
                external_id="SUP-31",
                number="SUP-31",
                title="Export fails",
                requester_email="x@nowhere.io",
                opened_at=timezone.now().date(),
            ),
        )
        self.assertTrue(UnmatchedItem.objects.exists())
        with patch("services.connectors.sync.classify_new"):
            sync_connector(self.jira)
        self.assertFalse(UnmatchedItem.objects.exists())


class KeepFailureTests(IntakeFixture):
    """R2D3 I3: one item that fails to keep does not stop the batch."""

    def test_a_failing_keep_does_not_stop_the_batch(self):
        from django.db import connection

        from services.connectors.sync import file_tickets

        jira = self.connector("jira", "cs")
        real = unmatched.keep
        calls = []

        def keep(connector, remote):
            calls.append(remote.external_id)
            if len(calls) == 1:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT 1/0")  # breaks the transaction, as a DB error would
            return real(connector, remote)

        with (
            patch("services.connectors.sync.unmatched.keep", side_effect=keep),
            self.assertLogs("services.connectors.sync", "WARNING") as logs,
        ):
            counts, _ = file_tickets(
                jira, [remote(external_id="SUP-1"), remote(external_id="SUP-2")]
            )
        self.assertEqual(counts["unmatched"], 2)
        self.assertEqual(
            list(UnmatchedItem.objects.values_list("external_id", flat=True)), ["SUP-2"]
        )
        self.assertEqual(
            logs.output, ["WARNING:services.connectors.sync:unmatched keep failed: DataError"]
        )

    def test_other_providers_never_touch_the_unmatched_table(self):
        from services.connectors.sync import file_ticket

        zendesk = self.connector("zendesk", "cs")
        zendesk.customers.add(self.pizza)
        with patch("services.connectors.sync.unmatched.forget") as forget:
            self.assertEqual(file_ticket(zendesk, remote(external_id="Z-1"))[0], "created")
            self.assertEqual(file_ticket(zendesk, remote(external_id="Z-1"))[0], "updated")
        forget.assert_not_called()
