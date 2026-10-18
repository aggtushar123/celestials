"""GET/POST /api/v1/canvases/ and the record lists (spec §1.4, §1.5, §4)."""

from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext

from core.models import AuditEvent
from services.customers.models import Canvas
from services.customers.tests.canvas_fixtures import CanvasFixture

CARL = "Carl CSM"


class CanvasCreateTests(CanvasFixture):
    def post(self, user, body):
        return self.as_user(user).post("/api/v1/canvases/", body, format="json")

    def test_from_people_lays_out_the_records_people_by_role(self):
        response = self.post(
            self.csm, {"name": " Pizza map ", "customer": self.pizza.pk, "start": "people"}
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            response.data["nodes"],
            [self.node(self.ben, 0, 0), self.node(self.cal, 240, 0), self.node(self.ann, 0, 160)],
        )
        canvas = Canvas.objects.get(pk=response.data["id"])
        self.assertEqual(
            (canvas.name, canvas.version, canvas.created_by, canvas.updated_by, canvas.edges),
            ("Pizza map", 1, self.csm, self.csm, []),
        )
        self.assertEqual(
            (response.data["version"], response.data["can_delete"], response.data["created_by"]),
            (1, True, {"id": self.csm.pk, "name": CARL}),
        )
        event = AuditEvent.objects.get(action="canvas.created")
        self.assertEqual(
            (event.target_repr, event.metadata, event.actor),
            (f"Canvas {canvas.pk}", {"start": "people", "nodes": 3}, self.csm),
        )

    def test_people_is_the_default_and_leaves_out_people_the_creator_may_not_open(self):
        response = self.post(self.csm, {"name": "Taco map", "customer": self.taco.pk})
        self.assertEqual(
            [n["data"]["contact_id"] for n in response.data["nodes"]], [self.tia.pk, self.eve.pk]
        )

    def test_blank_and_on_an_account(self):
        response = self.post(self.csm, {"name": "EMEA", "account": self.emea.pk, "start": "blank"})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            (response.data["nodes"], response.data["record"]),
            ([], {"kind": "account", "id": self.emea.pk, "name": "Pizza EMEA"}),
        )
        self.assertEqual(
            AuditEvent.objects.get(action="canvas.created").metadata, {"start": "blank", "nodes": 0}
        )

    def test_refusals(self):
        choose = {"non_field_errors": ["Choose an organisation or an account."]}
        cases = [
            ({"customer": self.pizza.pk}, {"name": ["Give the map a name."]}),
            (
                {"name": "x" * 121, "customer": self.pizza.pk},
                {"name": ["Keep the name to 120 characters."]},
            ),
            (
                {"name": "Map", "customer": self.pizza.pk, "start": "copy"},
                {"start": ["Choose people or blank."]},
            ),
            ({"name": "Map"}, choose),
            ({"name": "Map", "customer": self.pizza.pk, "account": self.emea.pk}, choose),
            ({"name": "Map", "customer_id": self.pizza.pk}, choose),
            ({"name": "Map", "customer": True}, choose),
        ]
        for body, errors in cases:
            with self.subTest(body=body):
                response = self.post(self.csm, body)
                self.assertEqual((response.status_code, response.data), (400, errors))
        self.assertFalse(Canvas.objects.exists())

    def test_a_record_the_creator_may_not_open_is_a_404(self):
        for body in (
            {"customer": self.globex.pk},
            {"account": self.west.pk},
            {"customer": 999_999},
        ):
            with self.subTest(body=body):
                self.assertEqual(self.post(self.csm, {"name": "Map", **body}).status_code, 404)
        self.assertFalse(Canvas.objects.exists())


class CanvasGalleryTests(CanvasFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.pizza_map = cls.make_canvas(cls.pizza, [cls.ann, cls.ben], updated_by=cls.csm)
        cls.taco_map = cls.make_canvas(cls.taco, [cls.tia], name="Renewal", created_by=cls.other)
        cls.west_map = cls.make_canvas(cls.west, [cls.tom], name="West map")
        cls.globex_map = cls.make_canvas(cls.globex, name="Globex map")

    def get(self, user=None, **params):
        return self.as_user(user or self.csm).get("/api/v1/canvases/", params)

    def ids(self, response):
        return [row["id"] for row in response.data["results"]]

    def test_maps_on_records_the_reader_may_open_newest_edit_first(self):
        response = self.get()
        self.assertEqual(self.ids(response), [self.taco_map.pk, self.pizza_map.pk])
        self.assertIsNone(response.data["next"])
        self.pizza_map.refresh_from_db()
        self.assertEqual(
            response.data["results"][1],
            {
                "id": self.pizza_map.pk,
                "name": "Pizza map",
                "record": {"kind": "organization", "id": self.pizza.pk, "name": "Pizza Hut"},
                "people": 2,
                "updated_at": self.pizza_map.updated_at.isoformat(),
                "updated_by": {"id": self.csm.pk, "name": CARL},
                "made_by": None,
            },
        )
        self.assertEqual(self.ids(self.get(self.other)), [self.west_map.pk, self.taco_map.pk])
        self.assertEqual(self.ids(self.get(self.stranger)), [self.globex_map.pk])

    def test_q_searches_map_and_record_names(self):
        self.assertEqual(self.ids(self.get(q="renewal")), [self.taco_map.pk])
        self.assertEqual(self.ids(self.get(q="TACO")), [self.taco_map.pk])
        self.assertEqual(self.ids(self.get(q="pizza")), [self.pizza_map.pk])

    def test_cursor_pages(self):
        with patch("services.customers.canvas_payloads.GALLERY_PAGE", 1):
            first = self.get()
            self.assertEqual(self.ids(first), [self.taco_map.pk])
            second = self.get(cursor=first.data["next"])
            self.assertEqual((self.ids(second), second.data["next"]), ([self.pizza_map.pk], None))
            self.assertEqual(self.ids(self.get(cursor="not-a-cursor")), [self.taco_map.pk])

    def test_no_distinct(self):
        with CaptureQueriesContext(connection) as ctx:
            self.get()
        canvas_sql = [q["sql"] for q in ctx.captured_queries if "customers_canvas" in q["sql"]]
        self.assertTrue(canvas_sql)
        self.assertFalse([sql for sql in canvas_sql if "DISTINCT" in sql.upper()])


class RecordCanvasListTests(CanvasFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.taco_map = cls.make_canvas(cls.taco, name="Taco map")
        cls.east_map = cls.make_canvas(cls.east, [cls.eve], name="East map")
        cls.west_map = cls.make_canvas(cls.west, name="West map")

    def get(self, user, path):
        return self.as_user(user).get(f"/api/v1{path}")

    def ids(self, response):
        return [row["id"] for row in response.data["results"]]

    def test_an_organisation_lists_its_maps_and_those_on_accounts_the_reader_may_open(self):
        path = f"/customers/{self.taco.pk}/canvases/"
        self.assertEqual(self.ids(self.get(self.csm, path)), [self.east_map.pk, self.taco_map.pk])
        self.assertEqual(
            self.ids(self.get(self.other, path)),
            [self.west_map.pk, self.east_map.pk, self.taco_map.pk],
        )

    def test_an_account_reads_the_same_on_both_routes(self):
        nested = self.get(self.csm, f"/customers/{self.taco.pk}/accounts/{self.east.pk}/canvases/")
        flat = self.get(self.csm, f"/accounts/{self.east.pk}/canvases/")
        self.assertEqual(nested.status_code, 200)
        self.assertEqual(self.ids(nested), [self.east_map.pk])
        self.assertEqual(nested.data, flat.data)
        self.assertEqual(set(nested.data), {"results"})

    def test_a_record_the_reader_may_not_open_is_a_404(self):
        for path in (
            f"/customers/{self.globex.pk}/canvases/",
            f"/customers/{self.taco.pk}/accounts/{self.west.pk}/canvases/",
            f"/accounts/{self.west.pk}/canvases/",
        ):
            with self.subTest(path=path):
                self.assertEqual(self.get(self.csm, path).status_code, 404)

    def test_at_most_100(self):
        with patch("services.customers.canvas_payloads.RECORD_LIMIT", 1):
            response = self.get(self.other, f"/customers/{self.taco.pk}/canvases/")
        self.assertEqual(self.ids(response), [self.west_map.pk])

    def test_maps_are_no_longer_made_here(self):
        client = self.as_user(self.csm)
        for path in (
            f"/api/v1/customers/{self.taco.pk}/canvases/",
            f"/api/v1/accounts/{self.east.pk}/canvases/",
        ):
            with self.subTest(path=path):
                self.assertEqual(client.post(path, {"name": "x"}, format="json").status_code, 405)
