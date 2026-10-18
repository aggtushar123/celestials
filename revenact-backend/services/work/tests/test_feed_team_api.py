"""GET /work/feed/team/ (delivery 2 contract §1): the scope's people's
decisions, overdue tasks and suggestions, minus the reader's own; access
and refusals; paging; partial failure; privacy."""

import json
from datetime import timedelta
from unittest.mock import patch

from rest_framework.test import APIClient

from services.customers.models import Task
from services.metrics.models import AgentAction
from services.rules.models import Rule
from services.work import feed_team_decide
from services.work.models import Recommendation
from services.work.tests.feed_fixtures import TEAM, FeedFixture


class TeamQueueApiTests(FeedFixture):
    def everything(self):
        """Carl's items Mona may see, Mona's own, and what she may not."""
        self.review_ = self.review(self.csm, sharing=Rule.Sharing.WORKSPACE)
        self.action = self.proposal(self.pizza)
        self.asked = self.question(self.csm, customer=self.pizza)
        for days, row in ((3, self.review_), (2, self.action.bundle), (1, self.asked)):
            self.age(row, days)
        self.late = self.due(self.csm, self.pizza, due_in=-1, title="Chase the sponsor")
        self.rec = self.suggestion(self.csm, self.dough)
        # Never on Mona's queue:
        self.proposal(self.soup, title="Mona's own play")
        self.todo(self.csm, due_in=-2, title="Renew my passport")
        self.reply(self.csm, self.dough)
        self.due(self.csm, self.west, due_in=-1, title="West handover")  # hidden

    def test_the_whole_queue(self):
        self.everything()
        body = self.queue_body(self.mona, scope="team")
        self.assertEqual(body["scope"], "team")
        self.assertEqual([g["key"] for g in body["groups"]], ["decide", "overdue", "suggested"])
        self.assertEqual(
            [i["key"] for i in self.group(body, "decide")["items"]],
            [
                f"rule_review:{self.review_.pk}",
                f"bundle:{self.action.bundle_id}",
                f"question:{self.asked.pk}",
            ],
        )
        self.assertEqual([i["id"] for i in self.group(body, "overdue")["items"]], [self.late.pk])
        self.assertEqual([i["id"] for i in self.group(body, "suggested")["items"]], [self.rec.pk])
        self.assertEqual((body["hidden"], body["failed"]), (1, []))
        for group in body["groups"]:
            for item in group["items"]:
                self.assertEqual(item["for"], {"id": self.csm.pk, "name": "Carl CSM"})
                self.assertFalse(item["private"])
        text = json.dumps(body)
        for secret in ("Mona's own play", "Renew my passport", "West handover", "draft:"):
            self.assertNotIn(secret, text)

    def test_the_default_scope(self):
        self.assertEqual(self.queue_body(self.mona)["scope"], "team")
        self.assertEqual(self.queue_body(self.admin)["scope"], "company")
        self.assertEqual(self.queue_body(self.lee)["scope"], "company")

    def test_access_and_refusals(self):
        not_allowed = {"code": "SCOPE_NOT_ALLOWED", "detail": "You can't see that view."}
        unknown = {"code": "SCOPE_UNKNOWN", "detail": "Choose team or company."}
        for user, params, status, body in (
            (self.csm, {}, 403, not_allowed),
            (self.csm, {"scope": "team"}, 403, not_allowed),
            (self.other, {"scope": "company"}, 403, not_allowed),
            (self.mona, {"scope": "company"}, 403, not_allowed),
            (self.admin, {"scope": "team"}, 403, not_allowed),
            (self.mona, {"scope": "me"}, 400, unknown),
            (self.mona, {"scope": ""}, 400, unknown),
            (self.mona, {"scope": "everyone"}, 400, unknown),
            (
                self.mona,
                {"scope": "team", "cursor": "x"},
                400,
                {"cursor": ["Say which group to page."]},
            ),
            (
                self.mona,
                {"scope": "team", "group": "today"},
                400,
                {"group": ["Choose decide, overdue or suggested."]},
            ),
            (
                self.mona,
                {"scope": "team", "group": "overdue", "cursor": "nope"},
                400,
                {"cursor": ["That list has changed. Reload Work."]},
            ),
        ):
            with self.subTest(user=user.name, params=params):
                response = self.queue(user, **params)
                self.assertEqual((response.status_code, response.json()), (status, body))
        self.assertEqual(APIClient().get(TEAM).status_code, 401)

    def test_a_scope_refusal_comes_before_a_bad_group(self):
        response = self.queue(self.csm, scope="team", group="today")
        self.assertEqual(response.status_code, 403)

    def test_paging_one_group(self):
        late = [self.due(self.csm, self.pizza, due_in=-1 - n, title=f"Late {n}") for n in range(52)]
        body = self.queue_body(self.mona, scope="team")
        overdue = self.group(body, "overdue")
        self.assertEqual((overdue["count"], len(overdue["items"])), (52, 50))
        page = self.queue_body(self.mona, scope="team", group="overdue", cursor=overdue["next"])
        self.assertEqual(page["scope"], "team")
        self.assertEqual([i["id"] for i in page["group"]["items"]], [late[1].pk, late[0].pk])
        self.assertIsNone(page["group"]["next"])
        first = self.queue_body(self.mona, scope="team", group="overdue")
        self.assertEqual(len(first["group"]["items"]), 50)

    def test_a_failing_source_only_adds_its_kind_to_failed(self):
        self.everything()
        with patch.object(feed_team_decide.TeamQuestions, "count", side_effect=RuntimeError):
            body = self.queue_body(self.mona, scope="team")
        self.assertEqual(body["failed"], ["question"])
        self.assertEqual(self.group(body, "decide")["count"], 2)
        self.assertEqual(self.group(body, "overdue")["count"], 1)

    def test_company_for_view_all_names_workspace_level_bundles_for_the_whole_company(self):
        from services.agents.tests.builder_fixtures import builder_action, definition

        action = builder_action(self.org, "segment.create", definition())
        body = self.queue_body(self.admin, scope="company")
        decide = {i["id"]: i for i in self.group(body, "decide")["items"]}
        self.assertIsNone(decide[action.bundle_id]["for"])
        self.assertEqual(decide[action.bundle_id]["actions"], ["open"])
        self.assertIs(decide[action.bundle_id]["detail"]["can_run"], True)
        lee = self.queue_body(self.lee, scope="company")
        self.assertNotIn(action.bundle_id, [i["id"] for i in self.group(lee, "decide")["items"]])
        self.assertEqual(lee["hidden"], 0)

    def seed_globex(self):
        """Everything of Globex's the queue could name: an overdue task on its
        customer, a waiting agent action and an open renewal suggestion."""
        self.late_globex = Task.objects.create(
            customer=self.globex,
            title="Globex chase",
            assignee=self.stranger,
            assignee_name=self.stranger.name,
            created_by=self.stranger,
            due_date=self.today - timedelta(days=2),
        )
        AgentAction.objects.create(
            organisation=self.other_org,
            batch="b1",
            kind=AgentAction.Kind.TASK_CREATE,
            customer=self.globex,
            target="task:globex",
            title="Globex save play",
            payload={"title": "Globex save play", "priority": "high"},
        )
        Recommendation.objects.create(
            organisation=self.other_org,
            customer=self.globex,
            kind="renewal_due",
            title="Prepare Globex's renewal",
            why={"facts": ["Renews in 30 days"], "evidence": []},
            suggested_assignee=self.stranger,
            recipient=self.stranger,
        )

    def test_another_workspace_never_sees_ours(self):
        self.everything()
        ours = self.queue_body(self.admin, scope="company")
        self.seed_globex()
        theirs = self.queue_body(self.admin, scope="company")
        # Not named, not counted, not even as hidden: the queue is unchanged.
        self.assertEqual(theirs, ours)
        self.assertNotIn("Globex", json.dumps(theirs))
        self.assertEqual(self.queue(self.stranger).status_code, 403)
