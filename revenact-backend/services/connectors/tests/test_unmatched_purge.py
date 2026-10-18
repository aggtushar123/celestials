"""Round 2 D3 R2D3-11: rows last seen more than 30 days ago go, waiting and
dismissed alike, audited per workspace as counts; sync_tickets runs it."""

from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.utils import timezone

from core.models import AuditEvent
from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors import unmatched
from services.connectors.models import UnmatchedItem
from services.connectors.tests.unmatched_fixtures import item

NO_SYNC = {"created": 0, "updated": 0, "unmatched": 0}


class PurgeTests(IntakeFixture):
    def test_old_rows_go_and_fresh_ones_stay(self):
        jira = self.connector("jira", "cs")
        old = timezone.now() - timedelta(days=31)
        item(jira, last_seen_at=old)
        item(jira, last_seen_at=old, status="dismissed", title="", excerpt="")
        fresh = item(jira)
        self.assertEqual(unmatched.purge(), 2)
        self.assertEqual(list(UnmatchedItem.objects.values_list("pk", flat=True)), [fresh.pk])
        event = AuditEvent.objects.get(action="unmatched.purged")
        self.assertEqual((event.actor, event.metadata), (None, {"deleted": 2, "dismissed": 1}))

    def test_the_boundary_is_thirty_days(self):
        jira = self.connector("jira", "cs")
        now = timezone.now()
        edge = item(jira, last_seen_at=now - timedelta(days=30))
        item(jira, last_seen_at=now - timedelta(days=30, seconds=1))
        self.assertEqual(unmatched.purge(now=now), 1)
        self.assertEqual(list(UnmatchedItem.objects.values_list("pk", flat=True)), [edge.pk])

    def test_a_failing_audit_keeps_the_rows(self):
        item(self.connector("jira", "cs"), last_seen_at=timezone.now() - timedelta(days=31))
        with (
            patch("services.connectors.unmatched.audit.record", side_effect=RuntimeError),
            self.assertRaises(RuntimeError),
        ):
            unmatched.purge()
        self.assertTrue(UnmatchedItem.objects.exists())

    def test_nothing_to_purge_writes_nothing(self):
        self.assertEqual(unmatched.purge(), 0)
        self.assertFalse(AuditEvent.objects.filter(action="unmatched.purged").exists())

    def test_sync_tickets_purges(self):
        item(self.connector("jira", "cs"), last_seen_at=timezone.now() - timedelta(days=40))
        with patch("services.connectors.management.commands.sync_tickets.sync_connector") as sync:
            sync.return_value = NO_SYNC
            call_command("sync_tickets", stdout=StringIO())
        self.assertFalse(UnmatchedItem.objects.exists())

    def test_a_failing_connector_does_not_skip_the_purge(self):
        item(self.connector("jira", "cs"), last_seen_at=timezone.now() - timedelta(days=40))
        out = StringIO()
        with (
            patch(
                "services.connectors.management.commands.sync_tickets.sync_connector",
                side_effect=RuntimeError("boom"),
            ),
            self.assertLogs("services.connectors.management.commands.sync_tickets", "ERROR"),
        ):
            call_command("sync_tickets", stdout=out, stderr=StringIO())
        self.assertFalse(UnmatchedItem.objects.exists())
        self.assertIn("synced", out.getvalue())

    def test_a_failing_purge_keeps_the_summary(self):
        out, err = StringIO(), StringIO()
        with (
            patch("services.connectors.management.commands.sync_tickets.sync_connector"),
            patch("services.connectors.unmatched.purge", side_effect=ValueError("secret")),
            self.assertLogs("services.connectors.management.commands.sync_tickets", "ERROR"),
        ):
            call_command("sync_tickets", stdout=out, stderr=err)
        self.assertIn("synced", out.getvalue())
        self.assertIn("ValueError", err.getvalue())
        self.assertNotIn("secret", err.getvalue())

    def test_single_connector_run_does_not_purge(self):
        jira = self.connector("jira", "cs")
        item(jira, last_seen_at=timezone.now() - timedelta(days=40))
        with patch("services.connectors.management.commands.sync_tickets.sync_connector") as sync:
            sync.return_value = NO_SYNC
            call_command("sync_tickets", connector=jira.pk, stdout=StringIO())
        self.assertTrue(UnmatchedItem.objects.exists())
