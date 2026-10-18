"""A proposal past its wait (agents.deciding.WAIT) can no longer be applied,
so it is never offered: not on My work, the badge, the Team queue, Brain's
desk or the "AI proposal waiting" notice, even before an agent run or a
decision marks it expired. One just inside the window still shows."""

from datetime import timedelta

from django.utils import timezone

from services.accounts.models import User
from services.agents.deciding import WAIT
from services.brain import desk
from services.brain.scope import ME, resolve
from services.work.feed_decide import Bundles
from services.work.feed_team_decide import TeamBundles
from services.work.proposal_notice import notify_proposals
from services.work.team_scope import resolve_team
from services.work.tests.feed_fixtures import COUNT, FeedFixture

PAST = WAIT + timedelta(minutes=1)
INSIDE = WAIT - timedelta(minutes=1)


class ExpiredProposalTests(FeedFixture):
    def aged(self, record, by, **kwargs):
        """A proposal and its bundle of one, both made `by` ago."""
        action = self.proposal(record, **kwargs)
        type(action).objects.filter(pk=action.pk).update(created_at=timezone.now() - by)
        type(action.bundle).objects.filter(pk=action.bundle_id).update(
            created_at=timezone.now() - by
        )
        return action

    def reader(self, user):
        return User.objects.get(pk=user.pk)

    def ids(self, items):
        return [item["id"] for item in items]

    def test_my_work_lists_and_counts_only_proposals_inside_the_wait(self):
        self.aged(self.pizza, PAST)
        fresh = self.aged(self.dough, INSIDE)
        source = Bundles(self.reader(self.csm))
        self.assertEqual(
            self.ids(entry for _key, entry in source.page(None, 10)), [fresh.bundle_id]
        )
        self.assertEqual((source.count(), source.hidden()), (1, 0))
        decide = self.group(self.body(self.csm), "decide")
        self.assertEqual(self.ids(decide["items"]), [fresh.bundle_id])
        self.assertEqual(decide["count"], 1)

    def test_the_badge_does_not_count_an_expired_proposal(self):
        self.aged(self.pizza, PAST)
        response = self.as_user(self.reader(self.csm)).get(COUNT)
        self.assertEqual(response.json(), {"decide": 0, "overdue": 0, "badge": 0, "failed": []})

    def test_the_team_queue_drops_an_expired_proposal(self):
        self.aged(self.pizza, PAST)
        fresh = self.aged(self.dough, INSIDE)
        reader = self.reader(self.mona)
        source = TeamBundles(reader, resolve_team(reader, "team"))
        self.assertEqual(
            self.ids(entry for _key, entry in source.page(None, 10)), [fresh.bundle_id]
        )
        self.assertEqual((source.count(), source.hidden()), (1, 0))
        decide = self.group(self.queue_body(self.mona), "decide")
        self.assertEqual(self.ids(decide["items"]), [fresh.bundle_id])

    def test_an_expired_company_proposal_leaves_the_company_queue(self):
        self.aged(self.taco, PAST)
        reader = self.reader(self.admin)
        source = TeamBundles(reader, resolve_team(reader, "company"))
        self.assertEqual((source.count(), source.hidden()), (0, 0))

    def test_brains_desk_does_not_wait_on_an_expired_proposal(self):
        self.aged(self.pizza, PAST)
        reader = self.reader(self.csm)
        found = desk.agent_actions(reader, resolve(reader, ME), frozenset())
        self.assertEqual((found.waiting.count(), found.readable.count()), (0, 0))

    def test_a_session_with_only_expired_proposals_is_not_read_for_them(self):
        session = self.session(self.csm)
        self.aged(self.pizza, PAST, session=session)
        self.assertEqual(desk.session_ids_seen_whole(self.reader(self.csm)), frozenset())

    def test_the_notice_ignores_an_expired_proposal(self):
        self.aged(self.pizza, PAST)
        self.assertEqual(notify_proposals(self.org, today=timezone.localdate()), 0)

    def test_shown_and_expired_split_exactly_at_the_wait(self):
        from services.agents.deciding import proposed, stale_reason
        from services.metrics.models import AgentAction

        now = timezone.now()
        action = self.proposal(self.pizza)
        for at, shown in ((now - WAIT, False), (now - WAIT + timedelta(seconds=1), True)):
            AgentAction.objects.filter(pk=action.pk).update(created_at=at)
            action.refresh_from_db()
            self.assertEqual(
                proposed(AgentAction.objects.filter(pk=action.pk), now).exists(), shown
            )
            self.assertEqual(stale_reason(action, now) == "waited", not shown)
