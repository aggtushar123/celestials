"""Who reads and decides builder actions (contract): the four workspace kinds,
view-all only, never hidden, never Recommended; a map, like any record
action. A decision past an owner limit changes nothing."""

from services.accounts.models import User
from services.agents.tests.builder_fixtures import builder_action, definition
from services.agents.tests.bundle_fixtures import run_one
from services.agents.tests.fixtures import AgentsFixture, viewer
from services.customers.models import Canvas, Product
from services.knowledge.models import FunctionOwner
from services.segments.models import Segment
from services.surveys.tests.fixtures import contact

ACTIONS = "/api/v1/agents/actions/"


class WorkspaceBuilderAccessTests(AgentsFixture):
    def setUp(self):
        self.action = builder_action(self.org, "segment.create", definition())

    def test_view_all_reads_it_and_nobody_else_counts_it(self):
        admin = self.client_for(self.admin).get(ACTIONS).json()
        (row,) = [r for r in admin["results"] if r["id"] == self.action.pk]
        self.assertIsNone(row["record"])
        self.assertEqual(row["preview"]["segment"]["name"], "Poor health")
        for reader in (self.mona, self.lee, self.csm):
            data = self.client_for(reader).get(ACTIONS).json()
            self.assertEqual((data["count"], data["hidden"]), (0, 0))
            detail = self.client_for(reader).get(f"{ACTIONS}{self.action.pk}/")
            self.assertEqual(detail.json()["code"], "NO_SUCH_ACTION")
            decide = self.client_for(reader).post(f"{ACTIONS}{self.action.pk}/approve/")
            self.assertEqual(decide.status_code, 404)

    def test_a_view_all_reader_approves_it_and_owns_the_segment(self):
        vic = viewer(self.org)
        response = run_one(self.client_for(vic), self.action)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["bundle"]["steps"][0]["status"], "applied")
        action = self.client_for(vic).get(f"{ACTIONS}{self.action.pk}/").data
        self.assertEqual(Segment.objects.get(pk=action["result"]["segment_id"]).owner, vic)
        self.assertEqual(action["decided_by"], {"id": vic.pk, "name": "Vic Viewer"})

    def test_past_the_owner_limit_the_step_fails(self):
        Segment.objects.bulk_create(
            Segment(organisation=self.org, owner=self.admin, name=f"S{i}", kind="customer")
            for i in range(50)
        )
        response = run_one(self.client_for(self.admin), self.action)
        self.assertEqual(response.status_code, 200, response.data)
        (step,) = response.data["bundle"]["steps"]
        self.assertEqual(
            (step["status"], step["error"]), ("failed", "You already own 50 segments.")
        )
        self.assertEqual(response.data["bundle"]["status"], "partly_done")
        self.assertEqual(Segment.objects.count(), 50)

    def test_a_check_failing_at_apply_expires_it_changed(self):
        product = Product.objects.create(organisation=self.org, name="Product B")
        rules = {
            "match": "all",
            "conditions": [{"field": "product", "op": "is", "value": product.pk}],
        }
        action = builder_action(self.org, "segment.create", definition(name="On B", rules=rules))
        product.delete()
        response = run_one(self.client_for(self.admin), action)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["bundle"]["status"], "expired")
        self.assertEqual(response.data["bundle"]["steps"][0]["status"], "expired")
        action.refresh_from_db()
        self.assertEqual((action.status, action.expired_reason), ("expired", "changed"))
        self.assertFalse(Segment.objects.exists())

    def test_the_team_queue_never_counts_it_hidden(self):
        url = "/api/v1/work/feed/team/?scope=company"

        def approvals(body):
            return [
                i
                for g in body["groups"]
                if g["key"] == "decide"
                for i in g["items"]
                if i["kind"] == "bundle"
            ]

        lee = self.client_for(self.lee).get(url).json()
        self.assertEqual(lee["hidden"], 0)
        self.assertEqual(approvals(lee), [])
        admin = self.client_for(self.admin).get(url).json()
        (item,) = approvals(admin)
        self.assertIsNone(item["for"])


class MapAccessTests(AgentsFixture):
    def test_a_map_is_read_by_the_records_openers_and_decided_by_its_owner(self):
        action = builder_action(
            self.org,
            "canvas.create",
            {"name": "People"},
            record=self.pizza,
            agent="cs",
            target="canvas",
        )
        for reader, status in ((self.csm, 200), (self.mona, 200), (self.other, 404)):
            response = self.client_for(reader).get(f"{ACTIONS}{action.pk}/")
            self.assertEqual(response.status_code, status, reader.name)
        self.assertEqual(self.client_for(self.other).get(ACTIONS).json()["hidden"], 1)

    def test_a_map_is_approved_by_its_records_owner_only_among_its_readers(self):
        contact(self.pizza, "Ann")
        action = builder_action(
            self.org,
            "canvas.create",
            {"name": "People"},
            record=self.pizza,
            agent="cs",
            target="canvas",
        )
        url = f"{ACTIONS}{action.pk}/approve/"
        # Sam answers for Sales on Pizza Hut: Sam may read the action but is
        # not Carl, above Carl, or view-all.
        FunctionOwner.objects.create(
            customer=self.pizza, function=User.Function.SALES, user=self.sam
        )
        self.assertEqual(self.client_for(self.sam).get(f"{ACTIONS}{action.pk}/").status_code, 200)
        refused = run_one(self.client_for(self.sam), action)
        self.assertEqual((refused.status_code, refused.data["code"]), (403, "CANT_RUN"))
        # Someone who may not open the record finds no such action, nor its bundle.
        missing = self.client_for(self.other).post(url)
        self.assertEqual((missing.status_code, missing.data["code"]), (404, "NO_SUCH_ACTION"))
        missing = run_one(self.client_for(self.other), action)
        self.assertEqual((missing.status_code, missing.data["code"]), (404, "NO_SUCH_BUNDLE"))
        response = run_one(self.client_for(self.csm), action)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["bundle"]["steps"][0]["status"], "applied")
        action.refresh_from_db()
        made = Canvas.objects.get(pk=action.result["canvas_id"])
        self.assertEqual((made.customer, made.created_by), (self.pizza, self.csm))
