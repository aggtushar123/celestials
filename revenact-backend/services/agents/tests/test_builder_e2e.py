"""Builder actions end to end (contract): Activity, Waiting and the graph stay
bounded with every builder kind on the page, and a segment goes from
proposed to applied to undone over HTTP."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from core.models import AuditEvent
from services.agents.tests.builder_fixtures import add_builder_actions, builder_action, definition
from services.agents.tests.bundle_fixtures import run_one
from services.agents.tests.fixtures import AgentsFixture, viewer
from services.notifications.models import Notification
from services.segments.models import Segment

ACTIONS = "/api/v1/agents/actions/"


class BuilderPagesTests(AgentsFixture):
    def count(self, user, url):
        self.client_for(user).get(url)  # warm per-process caches
        with CaptureQueriesContext(connection) as queries:
            response = self.client_for(user).get(url)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("DISTINCT", " ".join(q["sql"] for q in queries).upper())
        return len(queries)

    def test_the_count_does_not_grow_with_builder_actions(self):
        vic = viewer(self.org)
        pages = (
            (self.admin, ACTIONS),
            (vic, ACTIONS),
            (self.csm, ACTIONS),
            (self.admin, "/api/v1/work/feed/team/?scope=company"),
            (self.admin, "/api/v1/brain/graph/?scope=company"),
            (self.csm, "/api/v1/brain/graph/?scope=me"),
        )
        add_builder_actions(self, 0)
        few = [self.count(user, url) for user, url in pages]
        for number in range(1, 4):
            add_builder_actions(self, number)
        self.assertEqual([self.count(user, url) for user, url in pages], few)

    def test_every_builder_preview_reads_for_its_reader(self):
        add_builder_actions(self, 0)
        rows = self.client_for(self.admin).get(ACTIONS).json()["results"]
        previews = {row["kind"]: row["preview"] for row in rows}
        self.assertEqual(previews["canvas.create"], {"canvas": {"name": "Map 0", "people": 1}})
        self.assertEqual(previews["segment.create"]["segment"]["conditions"], 1)
        self.assertEqual(
            set(previews),
            {
                "segment.create",
                "scenario.create",
                "campaign.create",
                "plan.template",
                "canvas.create",
            },
        )
        mine = self.client_for(self.csm).get(ACTIONS).json()["results"]
        self.assertEqual([row["kind"] for row in mine], ["canvas.create"])


class SegmentJourneyTests(AgentsFixture):
    def test_proposed_approved_opened_and_undone(self):
        action = builder_action(self.org, "segment.create", definition())
        client = self.client_for(self.admin)
        # Activity lists it, waiting on a person.
        waiting = client.get(ACTIONS).json()["results"]
        self.assertEqual([(row["id"], row["status"]) for row in waiting], [(action.pk, "proposed")])
        ran = run_one(client, action).json()["bundle"]["steps"][0]
        self.assertEqual(ran["status"], "applied")
        approved = client.get(f"{ACTIONS}{action.pk}/").json()
        segment_id = approved["result"]["segment_id"]
        made = client.get(f"/api/v1/segments/{segment_id}/").json()
        self.assertEqual(
            made["made_by"],
            {"agent": "ops", "approved_by": {"id": self.admin.pk, "name": "Alice Admin"}},
        )
        # The approver's own, and private.
        self.assertEqual((made["sharing"], made["owner"]["id"]), ("private", self.admin.pk))
        self.assertEqual(client.get(f"{ACTIONS}{action.pk}/").json()["undo"]["allowed"], True)
        # Another view-all reader undoes it; the approver is told.
        vic = viewer(self.org)
        undone = self.client_for(vic).post(f"{ACTIONS}{action.pk}/undo/").json()["action"]
        self.assertEqual(undone["status"], "undone")
        self.assertFalse(Segment.objects.filter(pk=segment_id).exists())
        note = Notification.objects.get(recipient=self.admin, kind="agent_action_undone")
        self.assertEqual(note.message, "Vic Viewer undid the Ops agent's segment.")
        actions = list(AuditEvent.objects.order_by("pk").values_list("action", flat=True))
        self.assertEqual(
            [a for a in actions if a.startswith(("segment.", "agent_action."))],
            ["segment.created", "agent_action.approved", "segment.deleted", "agent_action.undone"],
        )

    def test_undo_after_an_edit_says_so(self):
        action = builder_action(self.org, "segment.create", definition())
        client = self.client_for(self.admin)
        run_one(client, action)
        segment_id = client.get(f"{ACTIONS}{action.pk}/").json()["result"]["segment_id"]
        client.patch(f"/api/v1/segments/{segment_id}/", {"name": "Renamed"}, format="json")
        response = client.post(f"{ACTIONS}{action.pk}/undo/")
        self.assertEqual(
            (response.status_code, response.json()["code"], response.json()["detail"]),
            (409, "CHANGED_SINCE", "This segment has been edited since."),
        )
