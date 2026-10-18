"""The knowledge graph for a scope (Brain delivery 4 spec §1.4): the
scope's customers the reader may open, figures counted as the reader, the
scope's open initiatives and waiting agent actions by the delivery 2 and 3
rules, for every member. /metrics/graph/ is unchanged."""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.brain import graph
from services.brain.tests.doing_fixtures import DoingFixture
from services.customers.models import Product, Task
from services.metrics.models import AgentAction, Initiative

GRAPH = "/api/v1/brain/graph/"


class ScopedGraphTests(DoingFixture):
    def graph(self, user, key):
        response = self.as_user(user).get(f"{GRAPH}?scope={key}")
        self.assertEqual(response.status_code, 200, response.json())
        return response.json()

    def ids(self, payload, kind):
        return {n["id"] for n in payload["nodes"] if n["kind"] == kind}

    def proposal(self, customer, title, *, session=None, initiative=None):
        return AgentAction.objects.create(
            organisation=self.org,
            batch="b1",
            kind=AgentAction.Kind.TASK_CREATE,
            title=title,
            rationale="Because.",
            customer=customer,
            target=f"task:{title.casefold()}",
            payload={"title": title},
            session=session,
            initiative=initiative,
        )

    def test_me_draws_the_readers_book(self):
        payload = self.graph(self.csm, "me")
        self.assertEqual(
            self.ids(payload, "customer"),
            {f"customer:{self.pizza.id}", f"customer:{self.dough.id}"},
        )
        self.assertEqual(self.ids(payload, "owner"), {f"owner:{self.csm.id}"})
        self.assertEqual(payload["hidden"], 0)
        self.assertEqual(set(payload), {"as_of", "currency", "nodes", "edges", "hidden"})

    def test_my_team_draws_the_managers_and_reports_books(self):
        payload = self.graph(self.mona, "team")
        self.assertEqual(
            self.ids(payload, "customer"),
            {f"customer:{c.id}" for c in (self.pizza, self.dough, self.soup)},
        )

    def test_in_company_a_leadership_reader_sees_only_what_they_may_open(self):
        payload = self.graph(self.lee, "company")
        self.assertEqual(self.ids(payload, "customer"), {f"customer:{self.loose.id}"})
        self.assertEqual(payload["hidden"], 4)
        everything = self.graph(self.admin, "company")
        self.assertEqual(len(self.ids(everything, "customer")), 5)
        self.assertEqual(everything["hidden"], 0)

    def test_open_tasks_count_only_tasks_the_reader_may_read(self):
        due = self.today + timedelta(days=3)
        Task.objects.create(
            customer=self.pizza,
            title="Call",
            assignee_name="Carl CSM",
            due_date=due,
            priority="high",
            assignee=self.csm,
        )
        Task.objects.create(
            customer=self.pizza,
            title="Dana's",
            assignee_name="Dana CSM",
            due_date=due,
            priority="high",
            assignee=self.other,
            created_by=self.other,
        )
        payload = self.graph(self.csm, "me")
        (pizza,) = [n for n in payload["nodes"] if n["id"] == f"customer:{self.pizza.id}"]
        self.assertEqual(pizza["open_tasks"], 1)

    def test_initiatives_and_actions_are_the_scopes(self):
        # Taco Bell carries this product, but Taco Bell is Dana's, outside
        # Carl's "me" book: the product node is real, drawn for Company, but
        # not for Carl, so the edge to it must be dropped, not dangling.
        on_taco = Product.objects.create(organisation=self.org, name="Product B")
        self.taco.primary_product = on_taco
        self.taco.save()
        mine = self.initiative(self.csm, cut=self.csm, title="Halve my ARR at risk")
        on_product = Initiative.objects.create(
            organisation=self.org,
            title="Fix Product B",
            metric="at_risk_arr",
            dimension="product",
            member=str(on_taco.id),
            member_label="Product B",
            target_value=Decimal("0"),
            target_by=self.today + timedelta(days=60),
            owner=self.csm,
            baseline_as_of=self.today,
        )
        theirs = self.initiative(self.other, cut=self.other, title="Dana's")
        self.initiative(self.csm, cut=self.csm, status="done", closed_days_ago=2)
        on_pizza = self.proposal(self.pizza, "Save play on Pizza Hut")
        self.proposal(self.taco, "Save play on Taco Bell")
        payload = self.graph(self.csm, "me")
        by = {n["id"]: n for n in payload["nodes"]}
        edges = {(e["from"], e["to"], e["kind"]) for e in payload["edges"]}
        self.assertEqual(
            self.ids(payload, "initiative"),
            {f"initiative:{mine.id}", f"initiative:{on_product.id}"},
        )
        self.assertNotIn(f"initiative:{theirs.id}", by)
        self.assertEqual(by[f"initiative:{mine.id}"]["member_label"], "Carl CSM")
        self.assertIn((f"initiative:{mine.id}", f"owner:{self.csm.id}", "targets"), edges)
        # A product cut's label and target are delivery 3's Company figures:
        # not for Carl.
        self.assertIsNone(by[f"initiative:{on_product.id}"]["member_label"])
        self.assertIsNone(by[f"initiative:{on_product.id}"]["target_value"])
        # Taco Bell is outside Carl's book, so its product node isn't drawn
        # and the initiative's edge to it is dropped.
        self.assertNotIn(f"product:{on_taco.id}", by)
        self.assertNotIn((f"initiative:{on_product.id}", f"product:{on_taco.id}", "targets"), edges)
        self.assertEqual(self.ids(payload, "agent_action"), {f"agent_action:{on_pizza.id}"})
        self.assertIn(
            (f"agent_action:{on_pizza.id}", f"customer:{self.pizza.id}", "acts_on"), edges
        )
        # In Company, Taco Bell is drawn, so the same initiative's edge to
        # its product is present: the drop above is the scope, not the data.
        company = self.graph(self.admin, "company")
        company_by = {n["id"]: n for n in company["nodes"]}
        company_edges = {(e["from"], e["to"], e["kind"]) for e in company["edges"]}
        self.assertIn(f"product:{on_taco.id}", company_by)
        self.assertIn(
            (f"initiative:{on_product.id}", f"product:{on_taco.id}", "targets"), company_edges
        )
        self.assertEqual(company_by[f"initiative:{on_product.id}"]["member_label"], "Product B")
        self.assertEqual(company_by[f"initiative:{on_product.id}"]["target_value"], 0.0)

    def test_open_to_every_member_while_metrics_graph_stays_gated(self):
        payload = self.graph(self.other, "me")
        self.assertEqual(self.ids(payload, "customer"), {f"customer:{self.taco.id}"})
        self.assertEqual(self.as_user(self.other).get("/api/v1/metrics/graph/").status_code, 403)
        self.assertEqual(self.as_user(self.admin).get("/api/v1/metrics/graph/").status_code, 200)

    def test_a_scope_the_reader_may_not_use_is_refused(self):
        response = self.as_user(self.csm).get(f"{GRAPH}?scope=company")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "SCOPE_NOT_ALLOWED")

    def act(self, kind="record.lifecycle", agent="cs", initiative=None, n=0, **on):
        return AgentAction.objects.create(
            organisation=self.org,
            agent=agent,
            batch="b",
            kind=kind,
            target=f"{kind}:{sorted(on)}:{n}",
            title=f"{kind} by {agent}",
            rationale="r",
            payload={},
            initiative=initiative,
            **on,
        )

    def test_every_readable_kind_and_agent_is_drawn(self):
        lifecycle = self.act(customer=self.pizza)
        task = self.act(kind="task.create", agent="ops", customer=self.dough)
        payload = self.graph(self.csm, "me")
        self.assertEqual(
            self.ids(payload, "agent_action"),
            {f"agent_action:{lifecycle.id}", f"agent_action:{task.id}"},
        )
        node = next(n for n in payload["nodes"] if n["id"] == f"agent_action:{lifecycle.id}")
        self.assertEqual(
            node,
            {
                "id": f"agent_action:{lifecycle.id}",
                "kind": "agent_action",
                "label": "record.lifecycle by cs",
                "agent": "cs",
                "action_kind": "record.lifecycle",
                "action_id": lifecycle.id,
            },
        )
        self.assertEqual(self.ids(payload, "proposal"), set())

    def test_an_account_action_acts_on_its_drawn_organisation_only(self):
        on_emea = self.act(account=self.emea)
        on_east = self.act(kind="task.create", account=self.east)
        payload = self.graph(self.csm, "me")
        edges = {(e["from"], e["to"], e["kind"]) for e in payload["edges"]}
        self.assertIn((f"agent_action:{on_emea.id}", f"customer:{self.pizza.id}", "acts_on"), edges)
        # Taco East's organisation, Taco Bell, is not in Carl's Me: no edge.
        self.assertIn(f"agent_action:{on_east.id}", self.ids(payload, "agent_action"))
        self.assertFalse([e for e in edges if e[0] == f"agent_action:{on_east.id}"])

    def test_a_workspace_action_is_view_alls_and_has_no_edge(self):
        built = self.act(kind="segment.create", agent="ops")
        company = self.graph(self.admin, "company")
        self.assertIn(f"agent_action:{built.id}", self.ids(company, "agent_action"))
        self.assertFalse([e for e in company["edges"] if e["from"] == f"agent_action:{built.id}"])
        self.assertNotIn(
            f"agent_action:{built.id}", self.ids(self.graph(self.lee, "company"), "agent_action")
        )

    def test_one_acts_on_edge_when_the_customer_and_its_account_both_point_at_it(self):
        both = self.act(customer=self.pizza, account=self.emea)
        edges = [(e["from"], e["to"], e["kind"]) for e in self.graph(self.csm, "me")["edges"]]
        self.assertEqual(
            edges.count((f"agent_action:{both.id}", f"customer:{self.pizza.id}", "acts_on")), 1
        )

    def test_agent_actions_are_capped_at_the_newest(self):
        made = [self.act(kind="task.create", customer=self.pizza, n=n) for n in range(3)]
        with patch("services.brain.graph.ACTION_LIMIT", 2):
            drawn = self.ids(self.graph(self.csm, "me"), "agent_action")
        self.assertEqual(drawn, {f"agent_action:{a.id}" for a in made[1:]})

    def test_an_action_serving_an_initiative_draws_the_serves_edge(self):
        initiative = self.initiative(self.csm, cut=self.csm, title="Halve ARR at risk")
        served = self.act(customer=self.pizza, initiative=initiative)
        edges = {(e["from"], e["to"], e["kind"]) for e in self.graph(self.csm, "me")["edges"]}
        self.assertIn((f"agent_action:{served.id}", f"initiative:{initiative.id}", "serves"), edges)


class GraphQueryGuardTests(DoingFixture):
    """`brain/graph.build` runs a fixed number of queries whatever its
    length, and none of them uses DISTINCT."""

    def proposal(self, customer, title):
        return AgentAction.objects.create(
            organisation=self.org,
            batch="b1",
            kind=AgentAction.Kind.TASK_CREATE,
            title=title,
            rationale="Because.",
            customer=customer,
            target=f"task:{title.casefold()}",
            payload={"title": title},
        )

    def fill(self, n):
        for i in range(n):
            customer = self.customer(f"Extra {i}", self.csm, 10_000, "8.0")
            self.initiative(self.csm, cut=self.csm, title=f"Cut {i}")
            self.proposal(customer, f"Save play {i}")
            account = self.account(f"Extra account {i}", customer, self.csm)
            AgentAction.objects.create(
                organisation=self.org,
                agent="cs",
                batch="b1",
                kind="record.lifecycle",
                account=account,
                target="lifecycle",
                title=f"Move {i}",
                rationale="r",
                payload={"stage": "renewal"},
            )
            Task.objects.create(
                customer=customer,
                title=f"Task {i}",
                assignee_name="Carl CSM",
                due_date=self.today + timedelta(days=3),
                priority="high",
                assignee=self.csm,
            )

    def queries(self, user, key):
        reader, scope = self.reader_and_scope(user, key)
        with CaptureQueriesContext(connection) as captured:
            graph.build(reader, scope, self.today)
        return captured.captured_queries

    def test_the_query_count_does_not_grow_and_no_query_uses_distinct(self):
        self.fill(1)
        few = self.queries(self.csm, "me")
        self.fill(5)
        many = self.queries(self.csm, "me")
        self.assertEqual(len(few), len(many))
        for query in many:
            self.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])
