"""Waiting on you's items (spec §1.1, §3): shape per kind, order, cap,
counts and hidden."""

from datetime import timedelta
from unittest import mock

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.accounts.models import User
from services.agents.tests.mixed import add_mixed_actions
from services.brain.scope import COMPANY, ME, TEAM, resolve
from services.brain.tests.waiting_fixtures import GONE, WaitingFixture
from services.brain.waiting import build
from services.metrics.models import AgentAction
from services.rules.models import RuleReview

#: `campaigns.audience.Reach.tally()`'s real stored shape: every
#: `SkipReason` present, not just the ones that fired (services/rules/
#: reviews.py:113, services/campaigns/audience.py `Reach.tally`).
CAMPAIGN_SKIPPED = {
    "unsubscribed": 1,
    "no_email": 0,
    "already_received": 0,
    "recent_campaign": 0,
    "over_limit": 0,
    "failed": 0,
}


class BuildFixture(WaitingFixture):
    def build(self, reader, key):
        return build(reader, resolve(reader, key), self.today)

    def aged(self, row, days):
        type(row).objects.filter(pk=row.pk).update(created_at=timezone.now() - timedelta(days=days))

    def fresh(self, user):
        """A cold instance of `user`: none of its per-instance caches
        (`subtree_ids`, `active_membership`, ...) are warm yet."""
        return User.objects.get(pk=user.pk)


class EvidenceTests(BuildFixture):
    def test_evidence_lines_are_for_view_all_readers_only(self):
        self.proposal(self.pizza)
        (item,) = self.build(self.admin, COMPANY)["items"]
        self.assertEqual(
            [line["label"] for line in item["detail"]["evidence"]], ["Pizza Hut: USD 300,000"]
        )
        for reader, key in ((self.csm, ME), (self.mona, TEAM)):
            (item,) = self.build(reader, key)["items"]
            self.assertEqual(item["detail"]["evidence"], [], reader.name)


class ItemShapeTests(BuildFixture):
    def test_carls_me_desk_names_every_kind(self):
        review = self.review(self.csm)
        proposal = self.proposal(self.pizza, title="Review Pizza Hut renewal pricing")
        question = self.question(self.csm, customer=self.pizza, text="Who signs off?")
        self.task(self.csm, account=self.emea, overdue_by=3)
        self.aged(review, 1)
        self.aged(proposal, 2)
        self.aged(question, 1)

        body = self.build(self.csm, ME)

        self.assertEqual(body["scope"], "me")
        self.assertEqual(
            body["counts"], {"rule_review": 1, "agent_action": 1, "question": 1, "overdue_task": 1}
        )
        self.assertEqual(body["hidden"], 0)
        by_kind = {item["kind"]: item for item in body["items"]}
        carl = {"id": self.csm.id, "name": "Carl CSM"}

        r = by_kind["rule_review"]
        self.assertEqual(r["id"], review.id)
        self.assertEqual(r["title"], "Survey from Detractor follow-up")
        self.assertEqual(r["waiting_on"], carl)
        self.assertIsNone(r["record"])
        self.assertTrue(r["can_decide"])
        self.assertEqual(
            {k: v for k, v in r["detail"].items() if k != "review"},
            {
                "rule_id": review.rule_id,
                "rule_name": "Detractor follow-up",
                "review_kind": "survey",
                "counts": {"people": 12, "records": 3},
            },
        )
        self.assertEqual(r["detail"]["review"]["id"], review.id)
        self.assertEqual(r["detail"]["review"]["rule"]["name"], "Detractor follow-up")

        p = by_kind["agent_action"]
        self.assertEqual(p["title"], "Review Pizza Hut renewal pricing")
        self.assertEqual(
            p["record"], {"type": "customer", "id": self.pizza.id, "name": "Pizza Hut"}
        )
        self.assertEqual(p["waiting_on"], carl)
        self.assertTrue(p["can_decide"])
        self.assertEqual(p["detail"]["id"], proposal.id)
        self.assertEqual(p["detail"]["kind"], "task.create")
        self.assertEqual(p["detail"]["status"], "proposed")
        # SOC2:AUTH-02 evidence is written from org-wide data: view_all only
        self.assertEqual(p["detail"]["evidence"], [])
        self.assertIsNone(p["detail"]["session"])

        q = by_kind["question"]
        self.assertEqual(q["title"], "Who signs off?")
        self.assertEqual(
            q["record"], {"type": "customer", "id": self.pizza.id, "name": "Pizza Hut"}
        )
        self.assertTrue(q["can_decide"])
        self.assertEqual(q["detail"], {"asked_by": "Alice Admin"})

        t = by_kind["overdue_task"]
        due = (self.today - timedelta(days=3)).isoformat()
        self.assertEqual(t["since"], due)
        self.assertEqual(t["record"], {"type": "account", "id": self.emea.id, "name": "Pizza EMEA"})
        self.assertTrue(t["can_decide"])
        self.assertEqual(t["detail"], {"due_date": due, "priority": "high"})

        self.assertEqual(
            [item["kind"] for item in body["items"]],
            ["overdue_task", "agent_action", "rule_review", "question"],
        )

    def test_my_team_names_who_it_waits_on_and_who_may_act(self):
        self.proposal(self.pizza)
        self.question(self.csm, customer=self.pizza)
        review = self.review(self.csm, sharing="workspace")
        items = {i["kind"]: i for i in self.build(self.mona, TEAM)["items"]}
        carl = {"id": self.csm.id, "name": "Carl CSM"}
        for kind in ("agent_action", "question", "rule_review"):
            self.assertEqual(items[kind]["waiting_on"], carl)
        self.assertTrue(items["agent_action"]["can_decide"])
        self.assertFalse(items["question"]["can_decide"])
        self.assertFalse(items["rule_review"]["can_decide"])
        self.assertIsNone(items["rule_review"]["detail"]["review"])
        self.assertEqual(items["rule_review"]["id"], review.id)

    def test_company_items_waiting_on_company_readers(self):
        self.proposal(kind="initiative", title="Halve ARR at risk")
        self.proposal(self.loose)
        self.proposal(customer_id=GONE)
        items = self.build(self.admin, COMPANY)["items"]
        self.assertEqual([i["waiting_on"] for i in items], [None, None, None])
        self.assertEqual(
            sorted((i["record"] or {}).get("name", "-") for i in items), ["-", "-", "Loose Ltd"]
        )
        self.assertTrue(all(i["can_decide"] for i in items))
        self.assertEqual(
            sorted(i["detail"]["kind"] for i in items),
            ["initiative.create", "task.create", "task.create"],
        )

    def test_a_campaign_review_is_titled_as_one(self):
        self.review(self.csm, kind="campaign", counts={"reach": 4, "skipped": CAMPAIGN_SKIPPED})
        (item,) = self.build(self.csm, ME)["items"]
        self.assertEqual(item["title"], "Campaign from Detractor follow-up")
        self.assertEqual(item["detail"]["counts"], {"reach": 4, "skipped": CAMPAIGN_SKIPPED})


class SessionItemTests(BuildFixture):
    def test_a_participant_reads_the_session_title_others_a_neutral_one(self):
        session = self.session(self.other, self.csm, title="Pizza war room")
        self.proposal(self.pizza, session=session)
        (carls,) = self.build(self.csm, ME)["items"]
        self.assertEqual(carls["detail"]["session"], {"id": session.id, "title": "Pizza war room"})
        (alices,) = self.build(self.admin, COMPANY)["items"]
        self.assertEqual(
            alices["detail"]["session"], {"id": session.id, "title": "Shared conversation"}
        )

    def test_seeing_a_session_proposal_does_not_grant_deciding_it(self):
        session = self.session(self.csm, self.other)
        self.proposal(kind="initiative", session=session)
        # Decision 11: a workspace-level action is not shown without view-all,
        # whatever the session; Ruling 10: nor is it counted as hidden.
        body = self.build(self.other, ME)
        self.assertEqual(body["items"], [])
        self.assertEqual(body["hidden"], 0)


class HiddenAndCapTests(BuildFixture):
    def test_unopenable_items_are_counted_not_named(self):
        self.task(self.csm, account=self.west)
        session = self.session(self.other, self.csm)
        self.proposal(self.soup, session=session)
        body = self.build(self.csm, ME)
        self.assertEqual(body["items"], [])
        self.assertEqual(body["hidden"], 2)
        self.assertEqual(
            body["counts"], {"rule_review": 0, "agent_action": 0, "question": 0, "overdue_task": 0}
        )

    def test_the_list_is_capped_oldest_first_and_counts_stay_whole(self):
        oldest = self.task(self.csm, customer=self.pizza, overdue_by=9)
        older = self.task(self.csm, customer=self.pizza, overdue_by=5)
        self.task(self.csm, customer=self.pizza, overdue_by=1)
        with mock.patch("services.brain.waiting.LIMIT", 2):
            body = self.build(self.csm, ME)
        self.assertEqual([i["id"] for i in body["items"]], [oldest.id, older.id])
        self.assertEqual(body["counts"]["overdue_task"], 3)

    # The proposals here are spread over 200 days for the merge order, so
    # their 14-day wait (agents.deciding.WAIT) is stretched to cover them.
    @mock.patch("services.agents.deciding.WAIT", timedelta(days=365))
    def test_the_cap_merges_every_kind_oldest_first_with_full_counts(self):
        """LIMIT is 200 for real here (no mock.patch of it): 201 items across
        all four kinds, so the merge across kinds is exercised right at the
        real cutoff, not a toy one."""
        review1 = self.review(self.csm)
        self.aged(review1, 201)
        proposal1 = self.proposal(self.pizza, title="Oldest proposal")
        self.aged(proposal1, 200)
        question = self.question(self.csm, customer=self.pizza)
        self.aged(question, 199)
        tasks = [
            self.task(self.csm, customer=self.pizza, overdue_by=age) for age in range(198, 2, -1)
        ]
        review2 = self.review(self.csm, name="Detractor follow-up 2")
        self.aged(review2, 2)
        excluded = self.proposal(self.pizza, title="Newest proposal, past the cap")
        self.aged(excluded, 1)

        body = self.build(self.csm, ME)

        self.assertEqual(len(body["items"]), 200)
        self.assertEqual(
            body["counts"],
            {"rule_review": 2, "agent_action": 2, "question": 1, "overdue_task": 196},
        )
        self.assertEqual(body["hidden"], 0)
        self.assertEqual(
            [(item["kind"], item["id"]) for item in body["items"][:4]],
            [
                ("rule_review", review1.id),
                ("agent_action", proposal1.id),
                ("question", question.id),
                ("overdue_task", tasks[0].id),
            ],
        )
        self.assertEqual(
            (body["items"][-1]["kind"], body["items"][-1]["id"]), ("rule_review", review2.id)
        )
        kept_proposals = {item["id"] for item in body["items"] if item["kind"] == "agent_action"}
        self.assertEqual(kept_proposals, {proposal1.id})

    def test_decided_things_leave_the_list(self):
        p = self.proposal(self.pizza)
        AgentAction.objects.filter(pk=p.pk).update(status=AgentAction.Status.REJECTED)
        r = self.review(self.csm)
        RuleReview.objects.filter(pk=r.pk).update(status=RuleReview.Status.SKIPPED)
        self.assertEqual(self.build(self.csm, ME)["items"], [])

    def test_bounded_queries_are_constant_in_item_count(self):
        """The query count must not grow with how many items each kind has
        — a per-row query in any one builder would be an N+1 that a loose
        `<= N` bound can't catch (see the review of 622cfe3)."""

        def seed():
            self.review(self.csm)
            self.proposal(self.pizza)
            self.question(self.csm, customer=self.pizza)
            self.task(self.csm, customer=self.pizza)

        seed()
        with CaptureQueriesContext(connection) as few:
            self.build(self.fresh(self.mona), TEAM)

        for _ in range(5):
            seed()
        with CaptureQueriesContext(connection) as many:
            self.build(self.fresh(self.mona), TEAM)

        self.assertEqual(len(few.captured_queries), len(many.captured_queries))
        for query in many.captured_queries:
            self.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])

    def test_an_item_the_reader_can_see_but_not_decide_says_so(self):
        # Carl opens Taco Bell through Taco East without owning it: he sees
        # Dana's action there, and may not decide it.
        session = self.session(self.other, self.csm)
        taco = self.proposal(self.taco, session=session)
        (item,) = self.build(self.csm, ME)["items"]
        self.assertEqual(item["id"], taco.id)
        self.assertEqual(item["record"]["name"], "Taco Bell")
        self.assertFalse(item["can_decide"])

    def test_non_task_agent_actions_add_no_queries(self):
        add_mixed_actions(self, 0)
        with CaptureQueriesContext(connection) as few:
            body = self.build(self.fresh(self.mona), TEAM)
        self.assertEqual(len(body["items"]), 3)

        for number in range(1, 5):
            add_mixed_actions(self, number)
        with CaptureQueriesContext(connection) as many:
            body = self.build(self.fresh(self.mona), TEAM)
        self.assertEqual(len(body["items"]), 15)

        self.assertEqual(len(few.captured_queries), len(many.captured_queries))
        for query in many.captured_queries:
            self.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])
