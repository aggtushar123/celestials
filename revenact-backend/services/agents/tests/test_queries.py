"""Postgres 16: no agents query uses DISTINCT, the Ops agent's figures included."""

import json
from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.accounts.models import Organisation, User
from services.agents import evidence, run
from services.agents.tests.fixtures import AgentsFixture, viewer
from services.agents.tests.mixed import add_draft_and_plan_actions


class QueryShapeTests(AgentsFixture):
    def test_no_distinct_anywhere(self):
        org = Organisation.objects.get(pk=self.org.pk)
        ref = f"customer:{self.pizza.pk}"
        ctx = evidence.build(org, "cs", today=self.today)
        line = next(x for x in sorted(evidence.record_lines(ctx, ref)) if x.startswith("- "))
        item = {
            "kind": "note.create",
            "record": ref,
            "title": "t",
            "rationale": "r",
            "evidence": [line],
            "payload": {"title": "t", "body": "b"},
        }
        with (
            patch("services.agents.policy.plan_credits", return_value=3000),
            CaptureQueriesContext(connection) as queries,
        ):
            for agent in ("cs", "sales"):
                evidence.build(org, agent, today=self.today)
            with patch("services.agents.run.get_completion", return_value=json.dumps([item])):
                result = run.run(org, "cs")
            for reader in (self.csm, self.mona, self.admin, self.lee):
                user = User.objects.get(pk=reader.pk)
                self.client_for(user).get("/api/v1/agents/actions/")
                self.client_for(user).get("/api/v1/agents/settings/")
        self.assertEqual(result.proposed, 1)
        offenders = [q["sql"] for q in queries if "DISTINCT" in q["sql"].upper()]
        self.assertEqual(offenders, [])


class DraftPageQueriesTests(AgentsFixture):
    """Activity and the Team queue with draft replies and plan starts: the query
    count does not grow with the rows, and nothing uses DISTINCT."""

    def count(self, user, url):
        self.client_for(user).get(url)  # warm per-process caches
        with CaptureQueriesContext(connection) as queries:
            response = self.client_for(user).get(url)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("DISTINCT", " ".join(q["sql"] for q in queries).upper())
        return len(queries)

    def test_the_count_does_not_grow(self):
        vic = viewer(self.org)
        add_draft_and_plan_actions(self, 0)
        pages = (
            (self.csm, "/api/v1/agents/actions/"),
            (self.admin, "/api/v1/agents/actions/"),
            (vic, "/api/v1/agents/actions/"),
            (self.mona, "/api/v1/work/feed/team/?scope=team"),
        )
        few = [self.count(user, url) for user, url in pages]
        for number in range(1, 5):
            add_draft_and_plan_actions(self, number)
        self.assertEqual([self.count(user, url) for user, url in pages], few)
