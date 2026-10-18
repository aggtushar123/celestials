"""Round 2 D3 contract §3.3, R2D3-10: dismissing blanks the text at once,
keeps a tombstone so Jira can't list it again, and is audited."""

from core.models import AuditEvent
from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors import unmatched
from services.connectors.models import UnmatchedItem
from services.connectors.tests.unmatched_fixtures import item, remote


class DismissTests(IntakeFixture):
    def setUp(self):
        self.jira = self.connector("jira", "cs")
        self.row = item(self.jira, external_id="SUP-40")

    def dismiss(self, user, pk=None):
        return self.client_for(user).post(
            f"/api/v1/work/unmatched/{pk or self.row.pk}/dismiss/", {}, format="json"
        )

    def needs_customer(self, client):
        rail = client.get("/api/v1/work/queues/").json()["queues"]
        return next(q for q in rail if q["key"] == "department:cs")["needs_customer"]

    def test_dismiss_blanks_the_text_and_keeps_a_tombstone(self):
        before = UnmatchedItem.objects.get()
        text = [before.title, before.excerpt, before.requester_name, before.requester_email]
        client = self.client_for(self.csm)
        self.assertEqual(self.needs_customer(client), 1)
        self.assertEqual(self.dismiss(self.csm).json(), {"dismissed": True})
        listed = client.get("/api/v1/work/unmatched/?queue=department:cs").json()
        self.assertEqual((listed["count"], listed["items"]), (0, []))
        self.assertEqual(self.needs_customer(client), 0)
        row = UnmatchedItem.objects.get()
        self.assertEqual(
            (
                row.status,
                row.title,
                row.excerpt,
                row.requester_name,
                row.requester_email,
                row.dismissed_by,
            ),
            ("dismissed", "", "", "", "", self.csm),
        )
        unmatched.keep(self.jira, remote(external_id="SUP-40"))
        self.assertEqual(UnmatchedItem.objects.get().status, "dismissed")
        event = AuditEvent.objects.get(action="unmatched.dismissed")
        self.assertEqual(event.metadata, {"provider": "jira", "connector": self.jira.pk})
        stored = f"{event.target_repr} {event.metadata}"
        for piece in text:
            self.assertTrue(piece)
            self.assertNotIn(piece, stored)

    def test_twice_is_gone_and_another_department_is_not_found(self):
        self.dismiss(self.csm)
        self.assertEqual(self.dismiss(self.csm).json()["code"], "GONE")
        self.assertEqual(self.dismiss(self.erin).status_code, 404)
