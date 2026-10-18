"""The five kinds registered (contract): in order, capped at Ask, the
workspace kinds the Ops agent's only; auto refused; undone, the approver is
told in the contract's nouns."""

from unittest.mock import patch

from services.agents import deciding, undo
from services.agents.bulk import Bulk
from services.agents.registry import REGISTRY, kinds_for
from services.agents.tests.builder_fixtures import builder_action, definition
from services.agents.tests.fixtures import AgentsFixture, viewer
from services.customers.models import Contact
from services.metrics.models import AgentAction
from services.notifications.models import Notification
from services.surveys.tests.fixtures import contact

FIVE = ["segment.create", "scenario.create", "campaign.create", "canvas.create", "plan.template"]
URL = "/api/v1/agents/settings/"
LIST = "/api/v1/agents/actions/"


class RegistryTests(AgentsFixture):
    def setUp(self):
        plan = patch("services.agents.policy.plan_credits", return_value=2000)
        plan.start()
        self.addCleanup(plan.stop)

    def test_the_settings_list_them_in_order_capped_at_ask(self):
        data = self.client_for(self.admin).get(URL).data
        keys = [kind["kind"] for kind in data["kinds"]]
        at = keys.index("plan.start")
        self.assertEqual(keys[at + 1 : at + 7], [*FIVE, "initiative.create"])
        shown = {kind["kind"]: kind for kind in data["kinds"]}
        self.assertEqual(
            shown["canvas.create"],
            {
                "kind": "canvas.create",
                "label": "Map a record's people",
                "example": "Map the people at Dough Co",
                "max_level": "ask",
                "agents": ["cs", "sales", "ops"],
                "irreversible": False,
                "outside": False,
                "locked": False,
            },
        )
        for kind in FIVE:
            self.assertEqual(shown[kind]["max_level"], "ask")
            self.assertEqual(data["levels"]["ops"][kind], "ask")
        self.assertEqual([k for k in FIVE if k in data["levels"]["cs"]], ["canvas.create"])
        self.assertIn("segment.create", kinds_for("ops"))
        self.assertNotIn("segment.create", kinds_for("sales"))

    def test_workspace_level_follows_the_registry(self):
        for kind in FIVE:
            expected = kind != "canvas.create"
            self.assertEqual(AgentAction(kind=kind).workspace_level, expected, kind)
            self.assertEqual(REGISTRY[kind].workspace_level, expected, kind)

    def test_auto_is_refused(self):
        response = self.client_for(self.admin).patch(
            URL,
            {"levels": {"ops": {"segment.create": "auto"}, "cs": {"canvas.create": "auto"}}},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["levels"],
            {
                "ops": {"segment.create": ["This action can't be set to auto."]},
                "cs": {"canvas.create": ["This action can't be set to auto."]},
            },
        )


class MapPageTests(AgentsFixture):
    def test_a_page_counts_each_readers_own_people(self):
        contact(self.taco, "Tia", Contact.Role.CHAMPION)
        contact(self.east, "Eve", Contact.Role.DECISION_MAKER)
        contact(self.west, "Tom", Contact.Role.OTHER)
        action = builder_action(
            self.org,
            "canvas.create",
            {"name": "Taco people"},
            record=self.taco,
            agent="cs",
            target="canvas",
        )
        counted = Bulk.people_count
        for reader, people in ((self.other, 3), (self.csm, 2)):
            with patch.object(Bulk, "people_count", autospec=True, side_effect=counted) as page:
                results = self.client_for(reader).get(LIST).data["results"]
            # The page's own count answered, not the single-row fallback.
            page.assert_called_once()
            (row,) = [r for r in results if r["id"] == action.pk]
            self.assertEqual(row["preview"]["canvas"], {"name": "Taco people", "people": people})


class UndoNoticeTests(AgentsFixture):
    def test_the_approver_is_told_in_the_contracts_nouns(self):
        self.assertEqual(
            [undo.CHANGE[kind] for kind in FIVE],
            ["segment", "scenario", "campaign", "map", "plan template"],
        )
        vic = viewer(self.org)
        action = builder_action(self.org, "segment.create", definition())
        deciding.approve(self.admin, action.pk)
        undo.undo(vic, action.pk)
        note = Notification.objects.get(recipient=self.admin)
        self.assertEqual(note.message, "Vic Viewer undid the Ops agent's segment.")

    def test_a_map_undo_names_its_record(self):
        contact(self.pizza, "Ann")
        action = builder_action(
            self.org,
            "canvas.create",
            {"name": "People"},
            record=self.pizza,
            agent="cs",
            target="canvas",
        )
        deciding.approve(self.mona, action.pk)
        undo.undo(self.csm, action.pk)
        note = Notification.objects.get(recipient=self.mona)
        self.assertEqual(note.message, "Carl CSM undid the CS agent's map on Pizza Hut.")
