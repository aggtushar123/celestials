"""Round 2 D3 contract R2D3-22 (F2, F3): switching a connector on or off,
changing its department or companies, creating and deleting it are audited."""

from unittest.mock import patch

from core.models import AuditEvent
from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors.models import Connector


class ConnectorAuditTests(IntakeFixture):
    def test_switching_off_and_on_is_audited_with_what_changed(self):
        connector = self.connector("jira", "engineering")
        client = self.client_for(self.admin)
        self.assertEqual(
            client.patch(
                f"/api/v1/connectors/{connector.pk}/", {"is_enabled": False}, format="json"
            ).status_code,
            200,
        )
        row = AuditEvent.objects.get(action="connector.update")
        self.assertEqual(row.metadata["changes"], {"is_enabled": {"old": True, "new": False}})
        self.assertEqual(row.actor, self.admin)

    def test_a_patch_that_changes_nothing_writes_nothing(self):
        connector = self.connector("jira", "engineering")
        self.client_for(self.admin).patch(
            f"/api/v1/connectors/{connector.pk}/", {"department": "engineering"}, format="json"
        )
        self.assertFalse(AuditEvent.objects.filter(action="connector.update").exists())

    def test_companies_are_recorded_as_ids(self):
        connector = self.connector("slack", "cs")
        self.client_for(self.admin).patch(
            f"/api/v1/connectors/{connector.pk}/",
            {"customer_ids": [self.pizza.pk], "department": ""},
            format="json",
        )
        changes = AuditEvent.objects.get(action="connector.update").metadata["changes"]
        self.assertEqual(changes["customer_ids"], {"old": [], "new": [self.pizza.pk]})
        self.assertEqual(changes["department"], {"old": "cs", "new": ""})

    def test_create_and_delete_are_audited(self):
        client = self.client_for(self.admin)
        made = client.post(
            "/api/v1/connectors/",
            {"provider": "jira", "name": "Jira SUP", "department": "cs"},
            format="json",
        ).json()
        self.assertEqual(
            AuditEvent.objects.get(action="connector.create").metadata,
            {"provider": "jira", "department": "cs"},
        )
        self.assertEqual(client.delete(f"/api/v1/connectors/{made['id']}/").status_code, 204)
        self.assertEqual(
            AuditEvent.objects.get(action="connector.delete").metadata,
            {"provider": "jira", "tickets_kept": 0},
        )

    def test_a_failing_audit_undoes_the_write(self):
        client = self.client_for(self.admin)
        connector = self.connector("jira", "engineering")
        url = f"/api/v1/connectors/{connector.pk}/"
        with (
            patch("services.connectors.views.audit.record", side_effect=RuntimeError),
            self.assertLogs("django.request", "ERROR"),
        ):
            with self.assertRaises(RuntimeError):
                client.post(
                    "/api/v1/connectors/",
                    {"provider": "jira", "name": "Jira SUP", "department": "cs"},
                    format="json",
                )
            with self.assertRaises(RuntimeError):
                client.patch(url, {"is_enabled": False}, format="json")
            with self.assertRaises(RuntimeError):
                client.delete(url)
        self.assertEqual(list(Connector.objects.values_list("pk", flat=True)), [connector.pk])
        connector.refresh_from_db()
        self.assertTrue(connector.is_enabled)
