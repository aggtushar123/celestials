"""The once-a-day "Bundles waiting" notice (Work in one place, delivery
2 contract §4.1): told only to the people with a new proposal on their own
My work that they may decide, at most once per workspace day,
for proposals made since their last notice; never the person who ran it."""

import itertools
from datetime import timedelta
from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.accounts.models import User
from services.agents.tests.drafts_fixtures import draft_action, ticket
from services.agents.tests.fixtures import viewer
from services.brain import desk
from services.brain.scope import ME, resolve
from services.customers.models import Customer
from services.identity.models import OrganizationMembership
from services.metrics.models import AgentAction
from services.notifications.models import Notification
from services.segments.tests.fixtures import person
from services.work import recommend
from services.work.clock import start_of_day
from services.work.proposal_notice import (
    KIND,
    MESSAGE,
    PROPOSALS_LINK,
    candidates,
    notify_proposals,
)
from services.work.tests.feed_fixtures import FeedFixture

_numbers = itertools.count(1)

#: Measured on this branch (Task 13); raise only with a reason in the commit.
#: SE4-25: +1, a reader no record right holds reads their participation, once per pass.
PROPOSAL_NOTICE_CEILING = 42


def on_my_work(user):
    """The readable agent actions on `user`'s Me desk (what the notice reads)."""
    reader = User.objects.get(pk=user.pk)
    sessions = desk.session_ids_seen_whole(reader)
    return desk.agent_actions(reader, resolve(reader, ME), sessions).readable


class NoticeFixture(FeedFixture):
    def tell(self, organisation=None, **kwargs):
        kwargs.setdefault("today", self.today)
        return notify_proposals(organisation or self.org, **kwargs)

    def told(self):
        return set(Notification.objects.filter(kind=KIND).values_list("recipient_id", flat=True))


class WhoIsToldTests(NoticeFixture):
    def test_the_owner_of_a_fresh_proposal_is_told_once(self):
        self.proposal(self.pizza)
        self.assertEqual(self.tell(), 1)
        notice = Notification.objects.get(kind=KIND)
        self.assertEqual(
            (notice.recipient, notice.kind, notice.link, notice.message, notice.actor),
            (self.csm, "agent_proposal_waiting", PROPOSALS_LINK, MESSAGE, None),
        )
        self.assertEqual(PROPOSALS_LINK, "/work?queue=mine&kind=bundle")
        self.assertEqual(MESSAGE, "Bundles are waiting for your decision.")

    def test_the_label(self):
        self.assertEqual(Notification.Kind(KIND).label, "Bundles waiting")

    def test_the_manager_and_a_view_all_reader_are_not_told(self):
        # Mona and Alice could decide it only from Team: not on their own My work.
        self.proposal(self.pizza)
        self.tell()
        self.assertEqual(self.told(), {self.csm.pk})

    def test_a_participant_who_sees_but_may_not_decide_is_not_told(self):
        session = self.session(self.other, self.csm)
        self.proposal(self.taco, session=session)
        self.assertIn(self.csm.pk, candidates(self.org, timezone.now() - timedelta(days=1)))
        self.tell()
        self.assertEqual(self.told(), {self.other.pk})

    def test_a_participant_who_may_decide_is_told(self):
        # Mona, invited by Carl, sees the session whole and decides as his manager.
        session = self.session(self.csm, self.mona)
        self.proposal(self.pizza, session=session)
        self.assertEqual(self.tell(), 2)
        self.assertEqual(self.told(), {self.csm.pk, self.mona.pk})

    def setUp(self):
        self.vic = viewer(self.org)

    def owner_change(self, record, *, session=None):
        return AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind=AgentAction.Kind.RECORD_OWNER,
            customer=record,
            target="owner",
            title="Hand it over",
            rationale="r",
            payload={"owner_id": self.mona.pk},
            before=record.owner_id,
            session=session,
        )

    def test_a_view_all_participant_without_the_owner_right_is_not_told_of_an_owner_change(self):
        # Vic has view_all_accounts only and sees Carl's session whole, but
        # is neither above Carl nor a settings manager: his desk lists it,
        # may_decide refuses it (the owner-change right), so no notice.
        session = self.session(self.csm, self.vic)
        self.owner_change(self.pizza, session=session)
        self.assertIn(self.vic.pk, candidates(self.org, timezone.now() - timedelta(days=1)))
        self.assertTrue(on_my_work(self.vic).exists())
        self.tell()
        self.assertEqual(self.told(), {self.csm.pk})

    def test_a_reader_with_a_blocked_group_and_a_decidable_one_is_told_once(self):
        # Vic may decide a plain task on Carl's record (view-all) but not its
        # owner change: of his two (kind, owner) groups one is blocked, one is
        # not, whichever the loop meets first, and he is told exactly once.
        session = self.session(self.csm, self.vic)
        blocked = self.owner_change(self.pizza, session=session)
        decidable = self.proposal(self.pizza, session=session)
        for order in ((blocked, decidable), (decidable, blocked)):
            with self.subTest(first=order[0].kind):
                Notification.objects.filter(kind=KIND).delete()
                for n, action in enumerate(order):
                    self.age(action, 3 - n)  # the first is the older
                self.tell()
                self.assertEqual(
                    Notification.objects.filter(kind=KIND, recipient=self.vic).count(), 1
                )

    def test_a_suspended_or_revoked_owner_is_not_told(self):
        self.proposal(self.pizza)
        for status in ("suspended", "revoked"):
            with self.subTest(status=status):
                OrganizationMembership.objects.filter(organisation=self.org, user=self.csm).update(
                    status=status
                )
                self.assertEqual(self.tell(), 0)

    def test_the_person_who_ran_it_is_not_told(self):
        self.proposal(self.pizza)
        self.assertEqual(self.tell(actor=self.csm), 0)
        self.assertEqual(self.told(), set())

    def test_a_workspace_level_proposal_without_a_session_tells_nobody(self):
        self.proposal(kind="initiative")
        self.assertEqual(self.tell(), 0)

    def test_a_decided_or_too_old_proposal_tells_nobody(self):
        decided = self.proposal(self.pizza)
        AgentAction.objects.filter(pk=decided.pk).update(status=AgentAction.Status.REJECTED)
        self.assertEqual(self.tell(), 0)
        old = self.proposal(self.dough)
        self.age(old, 15)
        self.assertEqual(self.tell(), 0)

    def test_each_workspace_tells_its_own(self):
        self.proposal(self.pizza)
        AgentAction.objects.create(
            organisation=self.other_org,
            batch="b1",
            kind=AgentAction.Kind.TASK_CREATE,
            customer=self.globex,
            target="task:globex",
            title="Save play",
            payload={"title": "Save play", "priority": "high"},
        )
        self.assertEqual(self.tell(), 1)
        self.assertEqual(self.told(), {self.csm.pk})
        self.assertEqual(self.tell(self.other_org), 1)
        self.assertEqual(self.told(), {self.csm.pk, self.stranger.pk})


class HowOftenTests(NoticeFixture):
    def test_at_most_once_a_workspace_day(self):
        self.proposal(self.pizza)
        self.assertEqual(self.tell(), 1)
        self.proposal(self.dough)
        self.assertEqual(self.tell(), 0)
        self.assertEqual(Notification.objects.filter(kind=KIND).count(), 1)

    def next_day(self):
        tomorrow = self.today + timedelta(days=1)
        return {"today": tomorrow, "now": start_of_day(self.org, tomorrow) + timedelta(hours=1)}

    def test_next_day_only_for_a_proposal_made_since(self):
        self.proposal(self.pizza)
        self.tell()
        self.assertEqual(self.tell(**self.next_day()), 0)
        self.proposal(self.dough)
        self.assertEqual(self.tell(**self.next_day()), 1)
        self.assertEqual(Notification.objects.filter(kind=KIND).count(), 2)


class CostTests(NoticeFixture):
    """The queries grow with the people who might be told, never with the
    proposals. Pat (Loose Ltd), Dana (Taco Bell, in her session with Carl)
    and Mona (Soup Co) are told; Carl sees every proposal in Dana's session
    and may decide none, so he is checked against all of them and not told.
    Dana's are draft replies, whose `may_decide` reads the source per row."""

    def setUp(self):
        self.pat = person("pat@acme.io", "Pat CSM", self.org)
        Customer.objects.filter(pk=self.loose.pk).update(owner=self.pat)

    def queries(self):
        Notification.objects.filter(kind=KIND).delete()
        with CaptureQueriesContext(connection) as captured:
            told = self.tell()
        self.assertEqual(told, 3)
        self.assertEqual(self.told(), {self.pat.pk, self.other.pk, self.mona.pk})
        return captured

    def make(self, session):
        # A draft reply: may_decide reads its source per row unless asked once.
        action = draft_action(self.org, ticket(self.taco, number=f"TKT-{next(_numbers)}"))
        AgentAction.objects.filter(pk=action.pk).update(session=session)
        self.proposal(self.loose)
        self.proposal(self.soup)

    def test_a_fixed_number_of_queries(self):
        session = self.session(self.other, self.csm)
        self.make(session)
        self.queries()  # the first pass also makes the workspace's Work settings
        one = self.queries()
        for _ in range(5):
            self.make(session)
        six = self.queries()
        self.assertEqual(on_my_work(self.csm).count(), 6)
        self.assertEqual(len(one), len(six))
        self.assertLessEqual(len(six), PROPOSAL_NOTICE_CEILING)
        for query in six.captured_queries:
            self.assertNotIn("DISTINCT", query["sql"].upper())


class WiringTests(NoticeFixture):
    def test_refresh_sends_it_after_the_waiting_notice(self):
        now = timezone.now()
        with patch("services.work.proposal_notice.notify_proposals", return_value=0) as sent:
            recommend.refresh(self.org, today=self.today, now=now, actor=self.admin)
        sent.assert_called_once_with(self.org, today=self.today, now=now, actor=self.admin)

    def test_refresh_keeps_its_result_when_it_fails(self):
        with (
            patch(
                "services.work.proposal_notice.notify_proposals",
                side_effect=RuntimeError("Pizza Hut"),
            ),
            self.assertLogs("services.work.recommend", "WARNING") as logs,
        ):
            result = recommend.refresh(self.org, today=self.today)
        self.assertIsInstance(result, recommend.RefreshResult)
        self.assertNotIn("Pizza Hut", "\n".join(logs.output))
        self.assertIn("RuntimeError", "\n".join(logs.output))

    def run_now(self, **notice):
        with (
            patch("services.agents.policy.plan_credits", return_value=2000),
            patch("services.agents.run.get_completion", return_value="[]"),
            patch("services.work.proposal_notice.notify_proposals", **notice) as sent,
        ):
            response = self.as_user(self.admin).post("/api/v1/agents/cs/run/")
        return response, sent

    def test_run_now_sends_it(self):
        response, sent = self.run_now(return_value=0)
        self.assertEqual(response.status_code, 200, response.data)
        sent.assert_called_once()
        self.assertEqual(sent.call_args.args, (self.org,))
        self.assertEqual(sent.call_args.kwargs["actor"], self.admin)
        self.assertEqual(sent.call_args.kwargs["today"], self.today)

    def test_run_now_answers_200_when_it_fails(self):
        with self.assertLogs("services.agents.views", "WARNING") as logs:
            response, _ = self.run_now(side_effect=RuntimeError("Pizza Hut"))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertNotIn("Pizza Hut", "\n".join(logs.output))
