"""My team and Rest of company over bundles (contract §10.2, D7, D23): bundle
rows say who they are for; Rest of company holds nothing in Mine or My team;
the kind filter; workspace-level bundles for view-all only."""

from services.accounts.models import User
from services.work.tests.feed_fixtures import FeedFixture


class TeamBundleTests(FeedFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        # Alice (view-all) manages Dana, so Dana's work is Alice's My team.
        User.objects.filter(pk=cls.other.pk).update(reports_to=cls.admin)

    def test_my_team_lists_a_reports_bundle_for_them(self):
        action = self.proposal(self.pizza, title="Save play")
        body = self.queue_body(self.mona, scope="team")
        (row,) = self.group(body, "decide")["items"]
        self.assertEqual((row["key"], row["kind"]), (f"bundle:{action.bundle_id}", "bundle"))
        self.assertEqual(row["for"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(row["actions"], ["open"])

    def test_rest_of_company_leaves_out_mine_and_my_team(self):
        dana = self.proposal(self.taco, title="Dana's")  # Alice's My team
        carl = self.proposal(self.pizza, title="Carl's")  # neither: Rest of company
        team = self.queue_body(self.admin, scope="team")
        rest = self.queue_body(self.admin, scope="company")
        self.assertEqual([i["id"] for i in self.group(team, "decide")["items"]], [dana.bundle_id])
        self.assertEqual([i["id"] for i in self.group(rest, "decide")["items"]], [carl.bundle_id])

    def test_rest_of_company_tasks_and_suggestions_leave_out_my_team_too(self):
        self.due(self.other, self.taco, due_in=-1, title="Dana late")
        self.due(self.csm, self.pizza, due_in=-1, title="Carl late")
        dana = self.suggestion(self.other, self.taco)
        carl = self.suggestion(self.csm, self.dough)
        rest = self.queue_body(self.admin, scope="company")
        self.assertEqual([i["title"] for i in self.group(rest, "overdue")["items"]], ["Carl late"])
        self.assertEqual([i["id"] for i in self.group(rest, "suggested")["items"]], [carl.pk])
        team = self.queue_body(self.admin, scope="team")
        self.assertEqual([i["id"] for i in self.group(team, "suggested")["items"]], [dana.pk])

    def test_rest_of_company_reviews_and_questions_leave_out_my_team_too(self):
        from services.rules.models import Rule

        dana_review = self.review(self.other, name="Dana's", sharing=Rule.Sharing.WORKSPACE)
        carl_review = self.review(self.csm, name="Carl's", sharing=Rule.Sharing.WORKSPACE)
        dana_asked = self.question(self.other, customer=self.taco)
        carl_asked = self.question(self.csm, customer=self.pizza)
        rest = self.group(self.queue_body(self.admin, scope="company"), "decide")["items"]
        keys = {i["key"] for i in rest}
        self.assertIn(f"rule_review:{carl_review.pk}", keys)
        self.assertIn(f"question:{carl_asked.pk}", keys)
        self.assertNotIn(f"rule_review:{dana_review.pk}", keys)
        self.assertNotIn(f"question:{dana_asked.pk}", keys)
        team = self.group(self.queue_body(self.admin, scope="team"), "decide")["items"]
        self.assertEqual(
            {i["key"] for i in team},
            {f"rule_review:{dana_review.pk}", f"question:{dana_asked.pk}"},
        )

    def test_the_kind_filter(self):
        self.proposal(self.pizza, title="Save play")
        self.due(self.csm, self.pizza, due_in=-1, title="Late")
        body = self.queue_body(self.mona, scope="team", kind="task")
        self.assertEqual(self.group(body, "decide")["items"], [])
        self.assertEqual([i["title"] for i in self.group(body, "overdue")["items"]], ["Late"])
        approval = self.queue_body(self.mona, scope="team", kind="approval")
        self.assertEqual([i["kind"] for i in self.group(approval, "decide")["items"]], ["bundle"])
        response = self.queue(self.mona, scope="team", kind="todo")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(), {"kind": ["Choose bundle, rule_review, question, task or suggestion."]}
        )

    def test_a_workspace_level_bundle_is_view_all_only(self):
        from services.agents.tests.builder_fixtures import builder_action, definition

        built = builder_action(self.org, "segment.create", definition())
        rest = self.queue_body(self.admin, scope="company")
        row = next(i for i in self.group(rest, "decide")["items"] if i["id"] == built.bundle_id)
        self.assertIsNone(row["for"])
        lee = self.queue_body(self.lee, scope="company")
        self.assertNotIn(built.bundle_id, [i["id"] for i in self.group(lee, "decide")["items"]])
        self.assertEqual(lee["hidden"], 0)

    def test_a_failing_bundle_source_is_named_in_failed(self):
        from unittest.mock import patch

        from services.work import feed_team_decide

        self.proposal(self.pizza, title="Save play")
        with patch.object(feed_team_decide.TeamBundles, "count", side_effect=RuntimeError):
            body = self.queue_body(self.mona, scope="team")
        self.assertEqual(body["failed"], ["bundle"])
        self.assertEqual(self.group(body, "decide")["items"], [])

    def test_the_queue_count_is_decide_plus_overdue(self):
        from services.work.feed_team import counts
        from services.work.team_scope import resolve_team

        self.proposal(self.pizza, title="Save play")
        self.due(self.csm, self.pizza, due_in=-1, title="Late")
        self.suggestion(self.csm, self.dough)
        mona = User.objects.get(pk=self.mona.pk)
        self.assertEqual(counts(mona, resolve_team(mona, "team"), today=self.today), (2, []))
