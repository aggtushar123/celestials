"""The Team queue's decide sources (delivery 2 contract §1.4): Brain's desk
at the scope, minus the reader's own Me desk, each row naming who it waits
on. Rule reviews are read-only here; bundles are opened, and say whether
the reader may run them exactly as may_decide allows; questions offer
Answer only with manage_users."""

from services.accounts.models import User
from services.brain import desk
from services.rules.models import Rule
from services.work.feed_decide import Bundles
from services.work.feed_team_decide import MAKERS, TeamBundles, TeamQuestions, TeamReviews
from services.work.team_scope import resolve_team
from services.work.tests.feed_fixtures import FeedFixture


class TeamDecideTests(FeedFixture):
    def team(self, user, key="team"):
        reader = User.objects.get(pk=user.pk)
        return reader, resolve_team(reader, key)

    def items(self, source):
        return [entry for _key, entry in source.page(None, 51)]

    def test_a_reports_bundle_is_listed_for_its_owner_and_decidable_by_the_manager(self):
        action = self.proposal(self.pizza)
        self.proposal(self.soup)  # Mona's own: on her My work, not here
        source = TeamBundles(*self.team(self.mona))
        (item,) = self.items(source)
        self.assertEqual(item["key"], f"bundle:{action.bundle_id}")
        self.assertEqual(item["for"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(item["actions"], ["open"])
        self.assertIs(item["detail"]["can_run"], True)
        self.assertEqual((source.count(), source.hidden()), (1, 0))

    def test_a_facilitator_proposal_on_my_work_is_not_on_the_team_queue(self):
        # Mona runs the session, so she sees it whole and it is on her My work
        # (Decision D1) although Carl, her report, owns the record.
        session = self.session(self.mona)
        action = self.proposal(self.pizza, session=session)
        plain = self.proposal(self.dough)
        reader, scope = self.team(self.mona)
        self.assertIn(session.pk, desk.session_ids_seen_whole(reader))
        self.assertIn(action.bundle_id, Bundles(reader).readable.values_list("id", flat=True))
        source = TeamBundles(reader, scope)
        self.assertEqual([item["id"] for item in self.items(source)], [plain.bundle_id])
        self.assertEqual((source.count(), source.hidden()), (1, 0))

    def test_a_workspace_level_action_is_for_the_whole_company_and_view_all_only(self):
        from services.agents.tests.builder_fixtures import builder_action, definition

        action = builder_action(self.org, "segment.create", definition())
        admin = TeamBundles(*self.team(self.admin, "company"))
        (item,) = self.items(admin)
        self.assertEqual((item["id"], item["for"], item["record"]), (action.bundle_id, None, None))
        lee = TeamBundles(*self.team(self.lee, "company"))
        self.assertEqual((lee.count(), lee.hidden()), (0, 0))

    def test_a_shared_rules_review_is_read_only_and_a_private_ones_is_hidden(self):
        shared = self.review(self.csm, name="Shared", sharing=Rule.Sharing.WORKSPACE)
        self.review(self.csm, name="Private")
        self.review(self.mona, name="Mine", sharing=Rule.Sharing.WORKSPACE)
        source = TeamReviews(*self.team(self.mona))
        (item,) = self.items(source)
        self.assertEqual(item["id"], shared.pk)
        self.assertEqual((item["actions"], item["detail"]["review"]), ([], None))
        self.assertEqual(item["for"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual((source.count(), source.hidden()), (1, 1))

    def test_a_reports_question_names_its_assignee_and_answer_needs_manage_users(self):
        asked = self.question(self.csm, customer=self.pizza)
        self.question(self.mona, customer=self.soup)  # Mona's own
        (item,) = self.items(TeamQuestions(*self.team(self.mona)))
        self.assertEqual((item["id"], item["actions"]), (asked.pk, []))
        self.assertEqual(item["for"], {"id": self.csm.pk, "name": "Carl CSM"})
        admin = self.items(TeamQuestions(*self.team(self.admin, "company")))
        self.assertEqual(next(i for i in admin if i["id"] == asked.pk)["actions"], ["answer"])

    def test_the_three_merge_by_rank_on_equal_times(self):
        from django.utils import timezone

        review = self.review(self.csm, sharing=Rule.Sharing.WORKSPACE)
        action = self.proposal(self.pizza)
        asked = self.question(self.csm, customer=self.pizza)
        stamp = timezone.now()
        for row in (review, action.bundle, asked):
            type(row).objects.filter(pk=row.pk).update(created_at=stamp)
        reader, scope = self.team(self.mona)
        rows = [
            row
            for kind in ("question", "bundle", "rule_review")
            for row in MAKERS[kind](reader, scope).page(None, 51)
        ]
        rows.sort(key=lambda row: row[0])
        self.assertEqual(
            [entry["key"] for _key, entry in rows],
            [f"rule_review:{review.pk}", f"bundle:{action.bundle_id}", f"question:{asked.pk}"],
        )
