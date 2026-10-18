"""Slack escalations D4, SE4-25, SE4-26: a waiting bundle from a thread the
reader took part in is in their Work › Mine, whoever it is routed to, in the
participant view when they can't open its record."""

from services.agents.models import BundleParticipant
from services.agents.tests.outside_fixtures import OutsideFixture

FEED = "/api/v1/work/feed/"


class FeedParticipantTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        board = self.jira_connector(department="")
        support = self.slack_connector(department="engineering")
        _, self.thread = self.slack_thread(self.pizza, support)
        self.bundle = self.outside_bundle(self.thread, ("jira.create", self.jira_payload(board)))

    def rows(self, user):
        body = self.client_for(user).get(FEED).json()
        group = next(g for g in body["groups"] if g["key"] == "decide")
        return [i for i in group["items"] if i["kind"] == "bundle"]

    def test_a_participant_finds_it_in_mine(self):
        self.assertEqual(self.rows(self.other), [])
        BundleParticipant.objects.create(bundle=self.bundle, user=self.other)
        (row,) = self.rows(self.other)
        self.assertEqual(
            (
                row["id"],
                row["record"]["can_open"],
                row["detail"]["participant_view"],
                row["detail"]["reason"],
            ),
            (self.bundle.pk, False, True, ""),
        )
        self.assertTrue(row["detail"]["can_run"])

    def test_the_owner_s_row_is_unchanged(self):
        # The owner reads the thread's department: today's read rule, read whole.
        self.thread.department = "cs"
        self.thread.save(update_fields=["department"])
        BundleParticipant.objects.create(bundle=self.bundle, user=self.csm)
        (row,) = self.rows(self.csm)
        self.assertEqual(
            (row["record"]["can_open"], row["detail"]["participant_view"]), (True, False)
        )

    def test_a_participant_s_bundle_is_on_mine_not_my_team(self):
        from services.accounts.models import User
        from services.work.feed_team_decide import TeamBundles
        from services.work.team_scope import resolve_team

        # Mona is above Carl: the bundle waits on her team desk, and she took part.
        mona = User.objects.get(pk=self.mona.pk)
        before = TeamBundles(mona, resolve_team(mona, "team"))
        self.assertEqual(before.waiting.count(), 1)
        BundleParticipant.objects.create(bundle=self.bundle, user=self.mona)
        team = TeamBundles(mona, resolve_team(mona, "team"))
        self.assertEqual((team.waiting.count(), team.count()), (0, 0))
        self.assertEqual([r["id"] for r in self.rows(self.mona)], [self.bundle.pk])
