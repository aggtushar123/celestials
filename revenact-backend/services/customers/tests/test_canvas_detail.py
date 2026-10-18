"""GET/PATCH/DELETE /api/v1/canvases/<id>/ (spec §1.2, §1.5, §4): reading,
saving under the row lock with the version, and the delete rule."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from core.models import AuditEvent
from services.customers.models import Canvas
from services.customers.tests.canvas_fixtures import CanvasFixture

CHANGED = {
    "code": "CANVAS_CHANGED",
    "detail": "Someone else changed this map. Reload to see their changes.",
}
NOT_DELETER = {"detail": "Only the map's creator or their managers can delete it."}


def url(canvas):
    return f"/api/v1/canvases/{canvas.pk}/"


class CanvasReadTests(CanvasFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.map = cls.make_canvas(
            people=[cls.ann, cls.ben, cls.cal],
            extra=[{"id": "gone", "position": {"x": 0, "y": 0}, "data": {"contact_id": 999_999}}],
            created_by=cls.csm,
        )
        cls.small = cls.make_canvas(people=[cls.ann], name="Small", created_by=cls.csm)
        cls.legacy = cls.make_canvas(
            name="Legacy",
            extra=[
                {
                    "id": "node_10",
                    "type": "contact",
                    "width": 180,
                    "position": {"x": 5, "y": 6},
                    "data": {"contact_id": cls.ann.pk},
                }
            ],
            lines=[{"id": "x", "source": "node_10", "target": "node_10", "type": "relationship"}],
        )
        cls.west_map = cls.make_canvas(cls.west, name="West map")

    def test_the_map_in_the_contract_shape(self):
        response = self.as_user(self.csm).get(url(self.legacy))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["nodes"],
            [{"id": "node_10", "position": {"x": 5, "y": 6}, "data": {"contact_id": self.ann.pk}}],
        )
        self.assertEqual(response.data["edges"], [])

    def test_a_map_on_a_record_the_reader_may_not_open_is_a_404(self):
        self.assertEqual(self.as_user(self.csm).get(url(self.west_map)).status_code, 404)
        self.assertEqual(self.as_user(self.stranger).get(url(self.map)).status_code, 404)

    def test_the_queries_do_not_grow_with_the_people_on_the_map(self):
        client = self.as_user(self.csm)
        client.get(url(self.small))  # Carl's chart walk, memoised on the user
        with CaptureQueriesContext(connection) as one:
            client.get(url(self.small))
        with CaptureQueriesContext(connection) as many:
            client.get(url(self.map))
        self.assertEqual(len(one), len(many))
        self.assertLessEqual(len(many), 12)
        canvas_sql = [q["sql"] for q in many.captured_queries if "customers_canvas" in q["sql"]]
        self.assertFalse([sql for sql in canvas_sql if "DISTINCT" in sql.upper()])


class CanvasSaveTests(CanvasFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.map = cls.make_canvas(
            people=[cls.ann, cls.cal], lines=[cls.line(cls.ann, cls.cal)], created_by=cls.csm
        )
        cls.taco_map = cls.make_canvas(
            cls.taco,
            [cls.tia, cls.tom],
            extra=[{"id": "gone", "position": {"x": 0, "y": 160}, "data": {"contact_id": 999_999}}],
            name="Taco map",
            created_by=cls.other,
        )
        cls.west_map = cls.make_canvas(cls.west, name="West map")

    def patch(self, user, body, canvas=None):
        return self.as_user(user).patch(url(canvas or self.map), body, format="json")

    def test_a_save_bumps_the_version_and_names_the_editor(self):
        body = {
            "name": "Renewal map",
            "version": 1,
            "nodes": [
                self.node(self.ann),
                {**self.node(self.ben, 240), "type": "contact", "selected": True},
                self.node(self.cal, 480),
            ],
            "edges": [
                self.line(self.ann, self.cal),
                {**self.line(self.ben, self.ann, "Influences"), "type": "relationship"},
            ],
        }
        response = self.patch(self.mona, body)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            (response.data["version"], response.data["updated_by"], response.data["name"]),
            (2, {"id": self.mona.pk, "name": "Mona Manager"}, "Renewal map"),
        )
        self.map.refresh_from_db()
        self.assertEqual(
            self.map.nodes,
            [self.node(self.ann), self.node(self.ben, 240), self.node(self.cal, 480)],
        )
        self.assertEqual(
            self.map.edges,
            [self.line(self.ann, self.cal), self.line(self.ben, self.ann, "Influences")],
        )
        self.assertEqual((self.map.version, self.map.updated_by), (2, self.mona))
        event = AuditEvent.objects.get(action="canvas.updated")
        self.assertEqual(
            (event.target_repr, event.metadata, event.actor),
            (f"Canvas {self.map.pk}", {"nodes": 3, "edges": 2, "renamed": True}, self.mona),
        )

    def test_a_stale_version_is_refused_and_nothing_changes(self):
        self.assertEqual(self.patch(self.csm, {"name": "Mine", "version": 1}).status_code, 200)
        second = self.patch(self.mona, {"name": "Theirs", "version": 1, "nodes": "bad"})
        self.assertEqual((second.status_code, second.data), (409, CHANGED))
        self.map.refresh_from_db()
        self.assertEqual((self.map.name, self.map.version), ("Mine", 2))
        self.assertEqual(AuditEvent.objects.filter(action="canvas.updated").count(), 1)

    def test_the_version_is_required(self):
        for version in (None, "1", 0, True, 1.5):
            body = {"name": "x"} if version is None else {"name": "x", "version": version}
            with self.subTest(version=version):
                response = self.patch(self.csm, body)
                self.assertEqual(
                    (response.status_code, response.data),
                    (400, {"version": ["Send the version you loaded."]}),
                )

    def test_field_refusals_change_nothing(self):
        cases = [
            (
                {"nodes": [self.node(self.tia)]},
                {"nodes": ["Add people from this organisation or account."]},
            ),
            (
                {"edges": [self.line(self.ann, self.cal, "Likes")]},
                {"edges": ["Choose Reports to, Introduced by, Blocks, Influences or no label."]},
            ),
            ({"name": "  "}, {"name": ["Give the map a name."]}),
        ]
        for body, errors in cases:
            with self.subTest(body=body):
                response = self.patch(self.csm, {**body, "version": 1})
                self.assertEqual((response.status_code, response.data), (400, errors))
        self.map.refresh_from_db()
        self.assertEqual((self.map.version, self.map.name), (1, "Pizza map"))
        self.assertFalse(AuditEvent.objects.filter(action="canvas.updated").exists())

    def test_nodes_without_edges_drop_the_lines_of_people_taken_off(self):
        response = self.patch(self.csm, {"version": 1, "nodes": [self.node(self.ann)]})
        self.assertEqual((response.status_code, response.data["edges"]), (200, []))
        self.assertEqual(
            AuditEvent.objects.get(action="canvas.updated").metadata,
            {"nodes": 1, "edges": 0, "renamed": False},
        )

    def test_hidden_and_removed_people_stay_when_someone_else_saves(self):
        page = self.as_user(self.csm).get(url(self.taco_map)).data
        self.assertEqual((page["hidden"], page["removed"]), ([f"c{self.tom.pk}"], ["gone"]))
        response = self.patch(
            self.csm,
            {"version": 1, "nodes": page["nodes"], "edges": [self.line(self.tia, self.tom)]},
            self.taco_map,
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.taco_map.refresh_from_db()
        self.assertEqual(
            [n["data"]["contact_id"] for n in self.taco_map.nodes],
            [self.tia.pk, self.tom.pk, 999_999],
        )
        blank = self.make_canvas(self.taco, name="Blank")
        response = self.patch(self.csm, {"version": 1, "nodes": [self.node(self.tom)]}, blank)
        self.assertEqual(response.status_code, 400)

    def test_the_save_holds_the_maps_row_lock(self):
        with CaptureQueriesContext(connection) as ctx:
            self.patch(self.csm, {"name": "Locked", "version": 1})
        self.assertTrue(
            [
                q["sql"]
                for q in ctx.captured_queries
                if '"customers_canvas"' in q["sql"] and "FOR NO KEY UPDATE" in q["sql"]
            ]
        )

    def test_a_map_on_a_record_the_reader_may_not_open_is_a_404(self):
        response = self.patch(self.csm, {"name": "x", "version": 1}, self.west_map)
        self.assertEqual(response.status_code, 404)

    def test_a_name_only_patch_of_a_legacy_map_normalises_the_stored_shape(self):
        """A map saved before duplicates were refused can hold React Flow's
        own keys, a missing label, a repeated node id, a repeated contact, a
        repeated edge id, a repeated link and an edge to a node a duplicate
        dropped. The first PATCH that only renames it still succeeds, bumps
        the version, and leaves the stored map in the clean contract shape
        — one its own next save would accept unchanged."""
        legacy_nodes = [
            {
                "id": "node_1",
                "type": "contact",
                "width": 180,
                "position": {"x": 0, "y": 0},
                "data": {"contact_id": self.ann.pk, "name": "Ann"},
            },
            {"id": "node_1", "position": {"x": 999, "y": 999}, "data": {"contact_id": self.cal.pk}},
            {"id": "node_2", "position": {"x": 240, "y": 0}, "data": {"contact_id": self.ann.pk}},
            {"id": "node_3", "position": {"x": 480, "y": 0}, "data": {"contact_id": self.ben.pk}},
        ]
        legacy_edges = [
            {
                "id": "edge_1",
                "source": "node_1",
                "target": "node_3",
                "type": "relationship",
                "sourceHandle": None,
            },
            {"id": "edge_1", "source": "node_1", "target": "node_3", "label": "Blocks"},
            {"id": "edge_2", "source": "node_1", "target": "node_3", "label": ""},
            {"id": "edge_3", "source": "node_1", "target": "node_2", "label": "Influences"},
        ]
        legacy = self.make_canvas(extra=legacy_nodes, lines=legacy_edges, name="Legacy")
        response = self.patch(self.csm, {"version": 1, "name": "Renamed"}, legacy)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["version"], 2)
        clean_nodes_shape = [
            {"id": "node_1", "position": {"x": 0, "y": 0}, "data": {"contact_id": self.ann.pk}},
            {"id": "node_3", "position": {"x": 480, "y": 0}, "data": {"contact_id": self.ben.pk}},
        ]
        clean_edges_shape = [{"id": "edge_1", "source": "node_1", "target": "node_3", "label": ""}]
        self.assertEqual(response.data["nodes"], clean_nodes_shape)
        self.assertEqual(response.data["edges"], clean_edges_shape)
        legacy.refresh_from_db()
        self.assertEqual(
            (legacy.nodes, legacy.edges, legacy.version),
            (clean_nodes_shape, clean_edges_shape, 2),
        )


class CanvasDeleteTests(CanvasFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.carls = cls.make_canvas(people=[cls.ann], created_by=cls.csm)
        cls.danas = cls.make_canvas(cls.taco, [cls.tia], name="Taco map", created_by=cls.other)
        cls.legacy = cls.make_canvas(name="Old")

    def delete(self, user, canvas):
        return self.as_user(user).delete(url(canvas))

    def test_a_manager_of_the_creator_may_delete(self):
        self.assertEqual(self.delete(self.mona, self.carls).status_code, 204)
        self.assertFalse(Canvas.objects.filter(pk=self.carls.pk).exists())
        event = AuditEvent.objects.get(action="canvas.deleted")
        self.assertEqual((event.target_repr, event.actor), (f"Canvas {self.carls.pk}", self.mona))

    def test_the_creator_may_delete(self):
        self.assertEqual(self.delete(self.other, self.danas).status_code, 204)

    def test_anyone_else_is_refused(self):
        for user, canvas in ((self.admin, self.carls), (self.csm, self.danas)):
            with self.subTest(user=user.name):
                response = self.delete(user, canvas)
                self.assertEqual((response.status_code, response.data), (403, NOT_DELETER))
        self.assertEqual(Canvas.objects.filter(pk__in=[self.carls.pk, self.danas.pk]).count(), 2)
        self.assertFalse(AuditEvent.objects.filter(action="canvas.deleted").exists())

    def test_a_map_without_a_creator_is_anyones_who_may_open_its_record(self):
        self.assertEqual(self.delete(self.admin, self.legacy).status_code, 204)

    def test_a_map_on_a_record_the_reader_may_not_open_is_a_404(self):
        self.assertEqual(self.delete(self.other, self.carls).status_code, 404)
        self.assertTrue(Canvas.objects.filter(pk=self.carls.pk).exists())
