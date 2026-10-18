"""Made by the agent (contract): segment, scenario, campaign, map and plan
template payloads say which agent made the object and who approved it, and
their lists read no more rows for it."""

import re

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.agents.tests.builder_fixtures import builder_action, definition
from services.agents.tests.fixtures import AgentsFixture
from services.campaigns.models import Campaign
from services.customers.models import Canvas
from services.plans.models import PlanTemplate
from services.rules.models import Rule
from services.segments.models import Segment
from services.segments.tests.fixtures import person

UNAPPROVED = {"agent": "ops", "approved_by": None}


class MadeByFixture(AgentsFixture):
    def applied(self, kind="segment.create", payload=None, **fields):
        fields.setdefault("decided_by", self.admin)
        return builder_action(
            self.org,
            kind,
            payload or definition(name=f"Made {timezone.now().timestamp()}"),
            status="applied",
            **fields,
        )

    def approved(self):
        return {"agent": "ops", "approved_by": {"id": self.admin.pk, "name": "Alice Admin"}}

    def queries(self, user, url):
        with CaptureQueriesContext(connection) as captured:
            response = self.client_for(user).get(url)
        self.assertEqual(response.status_code, 200)
        # `DISTINCT ON` (the rules list's latest run per rule) is a per-group pick, not a
        # de-duplicated join.
        self.assertIsNone(
            re.search(r"DISTINCT(?! ON)", " ".join(q["sql"] for q in captured).upper())
        )
        return len(captured)


class SegmentMadeByTests(MadeByFixture):
    def segment(self, name, action=None):
        return Segment.objects.create(
            organisation=self.org, owner=self.admin, name=name, kind="customer", agent_action=action
        )

    def test_the_detail_and_the_row_say_who_made_it(self):
        made = self.segment("Made", self.applied())
        mine = self.segment("Mine")
        client = self.client_for(self.admin)
        self.assertEqual(
            client.get(f"/api/v1/segments/{made.pk}/").json()["made_by"], self.approved()
        )
        self.assertIsNone(client.get(f"/api/v1/segments/{mine.pk}/").json()["made_by"])
        rows = {row["id"]: row for row in client.get("/api/v1/segments/").json()}
        self.assertEqual(rows[made.pk]["made_by"], self.approved())
        self.assertIsNone(rows[mine.pk]["made_by"])

    def test_approved_by_is_null_once_the_decider_is_gone(self):
        # `decided_by` is SET_NULL: deleting the person leaves the agent's name only.
        gone = person("gone@acme.io", "Gone Person", self.org)
        made = self.segment("Made", self.applied(decided_by=gone))
        gone.delete()
        body = self.client_for(self.admin).get(f"/api/v1/segments/{made.pk}/").json()
        self.assertEqual(body["made_by"], UNAPPROVED)

    def test_the_list_reads_no_more_rows_for_made_segments(self):
        self.segment("First", self.applied())
        few = self.queries(self.admin, "/api/v1/segments/")
        for index in range(3):
            self.segment(f"More {index}", self.applied())
        self.assertEqual(self.queries(self.admin, "/api/v1/segments/"), few)


class RuleAndCampaignMadeByTests(MadeByFixture):
    def setUp(self):
        self.segment = Segment.objects.create(
            organisation=self.org, owner=self.admin, name="Base", kind="customer"
        )

    def rule(self, name, action=None):
        return Rule.objects.create(
            organisation=self.org,
            owner=self.admin,
            name=name,
            trigger="entered",
            segment=self.segment,
            actions=[{"action": "task", "title": "Call", "assignee": "record_owner"}],
            agent_action=action,
        )

    def campaign(self, name, action=None):
        return Campaign.objects.create(
            organisation=self.org,
            owner=self.admin,
            name=name,
            segment=self.segment,
            agent_action=action,
        )

    def test_a_rule_says_who_made_it(self):
        made = self.rule("Made", self.applied("scenario.create", {"name": "Made"}))
        mine = self.rule("Mine")
        client = self.client_for(self.admin)
        self.assertEqual(client.get(f"/api/v1/rules/{made.pk}/").json()["made_by"], self.approved())
        rows = {row["id"]: row for row in client.get("/api/v1/rules/").json()}
        self.assertEqual(rows[made.pk]["made_by"], self.approved())
        self.assertIsNone(rows[mine.pk]["made_by"])

    def test_a_campaign_says_who_made_it(self):
        made = self.campaign("Made", self.applied("campaign.create", {"name": "Made"}))
        mine = self.campaign("Mine")
        client = self.client_for(self.admin)
        detail = client.get(f"/api/v1/campaigns/{made.pk}/").json()
        self.assertEqual(detail["made_by"], self.approved())
        rows = {row["id"]: row for row in client.get("/api/v1/campaigns/").json()["results"]}
        self.assertEqual(rows[made.pk]["made_by"], self.approved())
        self.assertIsNone(rows[mine.pk]["made_by"])

    def test_the_lists_read_no_more_rows_for_made_objects(self):
        self.rule("First", self.applied("scenario.create", {"name": "R0"}))
        self.campaign("First", self.applied("campaign.create", {"name": "C0"}))
        few = [self.queries(self.admin, url) for url in ("/api/v1/rules/", "/api/v1/campaigns/")]
        for index in range(1, 4):
            self.rule(f"R{index}", self.applied("scenario.create", {"name": f"R{index}"}))
            self.campaign(f"C{index}", self.applied("campaign.create", {"name": f"C{index}"}))
        many = [self.queries(self.admin, url) for url in ("/api/v1/rules/", "/api/v1/campaigns/")]
        self.assertEqual(many, few)


class MapAndTemplateMadeByTests(MadeByFixture):
    def canvas(self, name, action=None):
        return Canvas.objects.create(customer=self.pizza, name=name, agent_action=action)

    def template(self, name, action=None):
        return PlanTemplate.objects.create(
            organisation=self.org,
            owner=self.admin,
            name=name,
            kind="save",
            sharing="workspace",
            milestones=[{"name": "Call", "offset_days": 0, "tasks": []}],
            agent_action=action,
        )

    def test_a_map_says_who_made_it(self):
        action = self.applied("canvas.create", {"name": "People"}, record=self.pizza)
        made = self.canvas("Made", action)
        mine = self.canvas("Mine")
        client = self.client_for(self.admin)
        self.assertEqual(
            client.get(f"/api/v1/canvases/{made.pk}/").json()["made_by"], self.approved()
        )
        rows = {row["id"]: row for row in client.get("/api/v1/canvases/").json()["results"]}
        self.assertEqual(rows[made.pk]["made_by"], self.approved())
        self.assertIsNone(rows[mine.pk]["made_by"])
        record = client.get(f"/api/v1/customers/{self.pizza.pk}/canvases/").json()["results"]
        self.assertEqual({row["id"]: row["made_by"] for row in record}[made.pk], self.approved())

    def test_a_template_says_who_wrote_it(self):
        made = self.template("Made", self.applied("plan.template", {"name": "Made"}))
        mine = self.template("Mine")
        groups = self.client_for(self.csm).get("/api/v1/plans/templates/").json()
        shared = {item["id"]: item for item in groups["shared"]}
        self.assertEqual(shared[made.pk]["made_by"], self.approved())
        self.assertIsNone(shared[mine.pk]["made_by"])
        detail = self.client_for(self.csm).get(f"/api/v1/plans/templates/{made.pk}/").json()
        self.assertEqual(detail["made_by"], self.approved())

    def test_the_lists_read_no_more_rows_for_made_objects(self):
        self.canvas("M0", self.applied("canvas.create", {"name": "M0"}, record=self.pizza))
        self.template("T0", self.applied("plan.template", {"name": "T0"}))
        urls = ("/api/v1/canvases/", "/api/v1/plans/templates/")
        few = [self.queries(self.admin, url) for url in urls]
        for index in range(1, 4):
            action = self.applied("canvas.create", {"name": f"M{index}"}, record=self.dough)
            self.canvas(f"M{index}", action)
            self.template(f"T{index}", self.applied("plan.template", {"name": f"T{index}"}))
        self.assertEqual([self.queries(self.admin, url) for url in urls], few)
