"""End to end over HTTP: the Waiting journeys, now on the Team queue and the
Work badge (a pending invite grants no visibility, and Company never leaks
another organisation's items)."""

from datetime import timedelta

from core.models import AuditEvent
from services.agents.tests.bundle_fixtures import BUNDLES, run_one
from services.copilot.models import SessionInvite
from services.customers.models import Task
from services.metrics.models import AgentAction
from services.work.tests.feed_fixtures import COUNT, FEED, TEAM, FeedFixture


def decide(proposal_id, decision="approve"):
    return f"/api/v1/agents/actions/{proposal_id}/{decision}/"


class TeamQueueJourneyTests(FeedFixture):
    def test_a_manager_approves_a_reports_task_proposal_from_my_team(self):
        self.proposal(self.pizza, title="Review Pizza Hut renewal pricing")
        mona = self.as_user(self.mona)

        (item,) = self.group(mona.get(f"{TEAM}?scope=team").json(), "decide")["items"]
        self.assertEqual(item["kind"], "bundle")
        self.assertEqual(item["for"], {"id": self.csm.id, "name": "Carl CSM"})
        self.assertEqual(item["actions"], ["open"])
        self.assertIs(item["detail"]["can_run"], True)

        (step,) = AgentAction.objects.filter(bundle_id=item["id"])
        response = run_one(mona, step)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["bundle"]["steps"][0]["status"], "applied")
        self.assertTrue(Task.objects.filter(customer=self.pizza).exists())
        self.assertEqual(
            AuditEvent.objects.get(action="agent_action.approved").metadata["decided_as"], "chain"
        )
        self.assertEqual(self.group(mona.get(f"{TEAM}?scope=team").json(), "decide")["items"], [])
        self.assertEqual(self.as_user(self.csm).get(COUNT).json()["decide"], 0)

    def test_a_csm_decides_a_proposal_on_their_own_customer(self):
        self.proposal(self.dough)
        carl = self.as_user(self.csm)
        self.assertEqual(carl.get(COUNT).json()["decide"], 1)
        body = carl.get(FEED, {"kind": "approval"}).json()
        (item,) = self.group(body, "decide")["items"]
        (step,) = AgentAction.objects.filter(bundle_id=item["id"])
        rejected = carl.post(f"{BUNDLES}{item['id']}/reject/", {"reason": "other"}, format="json")
        self.assertEqual(rejected.status_code, 200)
        self.assertEqual(rejected.json()["bundle"]["steps"][0]["status"], "rejected")
        self.assertEqual(
            AuditEvent.objects.get(action="agent_action.rejected").metadata["decided_as"], "owner"
        )
        self.assertEqual(carl.get(COUNT).json()["decide"], 0)

    def test_a_csm_without_view_all_cannot_decide_an_initiative(self):
        session = self.session(self.admin, self.csm)
        proposal = self.proposal(kind="initiative", session=session)
        carl = self.as_user(self.csm)
        # Decision 11: not shown to Carl at all, and the route reads it as missing.
        body = carl.get(FEED, {"kind": "approval"}).json()
        self.assertEqual(self.group(body, "decide")["items"], [])
        response = carl.post(decide(proposal.id))
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"code": "NO_SUCH_ACTION", "detail": "No such action."})

    def test_the_badge_for_a_member(self):
        self.review(self.other)
        self.question(self.other, customer=self.taco)
        self.task(self.other, customer=self.taco)
        self.proposal(self.taco)
        self.assertEqual(
            self.as_user(self.other).get(COUNT).json(),
            {"decide": 3, "overdue": 1, "badge": 4, "failed": []},
        )

    def test_a_pending_session_invite_grants_no_session_proposal_in_my_work(self):
        """`session()` only accepts invites and seats participants; a plain
        pending invite neither accepts nor seats one, so the invitee never
        sees the whole conversation and the session carries no proposal
        onto their desk (desk.session_ids_seen_whole)."""
        session = self.session(self.admin, self.mona)
        SessionInvite.objects.create(
            session=session,
            invited_user=self.csm,
            invited_by=self.admin,
            status=SessionInvite.Status.PENDING,
        )
        self.proposal(kind="initiative", session=session)
        carl = self.as_user(self.csm)
        self.assertEqual(self.group(carl.get(FEED).json(), "decide")["items"], [])
        self.assertEqual(carl.get(COUNT).json()["decide"], 0)

    def test_a_company_reader_never_sees_another_organisations_items(self):
        AgentAction.objects.create(
            organisation=self.other_org,
            batch="b1",
            kind=AgentAction.Kind.TASK_CREATE,
            customer_id=self.globex.id,
            target="task:globex save play",
            title="Globex save play",
            rationale="Because the figures say so.",
            evidence=["Globex Corp: USD 999,000"],
            payload={
                "title": "Globex save play",
                "assignee_name": "Gus Globex",
                "due_date": (self.today + timedelta(days=7)).isoformat(),
                "priority": "high",
            },
        )
        self.proposal(self.pizza, title="Review Pizza Hut renewal pricing")

        body = self.as_user(self.admin).get(f"{TEAM}?scope=company").json()
        (item,) = [i for i in self.group(body, "decide")["items"] if i["kind"] == "bundle"]
        self.assertEqual(
            item["record"],
            {"type": "customer", "id": self.pizza.id, "name": "Pizza Hut", "can_open": True},
        )
