"""The desk (spec §1.1): per kind, what waits on the scope's people and
the part the reader may open. The difference is `hidden`."""

from datetime import timedelta

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.brain import desk
from services.brain.scope import COMPANY, ME, TEAM, resolve
from services.brain.tests.waiting_fixtures import GONE, WaitingFixture
from services.customers.models import Task
from services.metrics.models import AgentAction


def ids(queryset):
    return set(queryset.values_list("id", flat=True))


class DeskFixture(WaitingFixture):
    def source(self, reader, key, kind):
        scope = resolve(reader, key)
        sessions = desk.session_ids_seen_whole(reader)
        (found,) = [s for s in desk.sources(reader, scope, self.today, sessions) if s.kind == kind]
        return found


class RuleReviewDeskTests(DeskFixture):
    def test_the_owner_reads_their_own_and_a_manager_only_shared_ones(self):
        private = self.review(self.csm)
        shared = self.review(self.csm, name="Shared one", sharing="workspace")
        mine = self.source(self.csm, ME, "rule_review")
        self.assertEqual(ids(mine.readable), {private.id, shared.id})
        team = self.source(self.mona, TEAM, "rule_review")
        self.assertEqual(ids(team.waiting), {private.id, shared.id})
        self.assertEqual(ids(team.readable), {shared.id})

    def test_someone_elses_review_is_not_on_my_desk(self):
        self.review(self.other)
        self.assertFalse(self.source(self.csm, ME, "rule_review").waiting.exists())

    def test_decided_reviews_do_not_wait(self):
        review = self.review(self.csm)
        review.status = "skipped"
        review.save()
        self.assertFalse(self.source(self.csm, ME, "rule_review").waiting.exists())


class ProposalDeskTests(DeskFixture):
    def test_a_task_proposal_waits_on_the_customers_owner_and_their_chain(self):
        pizza = self.proposal(self.pizza)
        taco = self.proposal(self.taco)
        self.assertEqual(ids(self.source(self.csm, ME, "agent_action").readable), {pizza.id})
        self.assertEqual(ids(self.source(self.mona, TEAM, "agent_action").readable), {pizza.id})
        self.assertEqual(ids(self.source(self.other, ME, "agent_action").readable), {taco.id})

    def test_the_desk_carries_every_agent_action_kind(self):
        mine = self.proposal(self.pizza)
        for agent, kind in (("cs", "task.create"), ("ops", "note.create")):
            AgentAction.objects.create(
                organisation=self.org,
                agent=agent,
                batch="b",
                kind=kind,
                customer=self.pizza,
                target="other",
                title="Not for Brain",
                rationale="r",
                payload={},
            )
        company = self.source(self.admin, COMPANY, "agent_action")
        # The desk carries every kind; only the graph keeps to the old two.
        self.assertEqual(len(ids(company.waiting)), 3)
        self.assertIn(mine.id, ids(company.readable))
        self.assertEqual(ids(company.readable), ids(company.waiting))

    def test_unowned_gone_and_initiatives_wait_on_company_only(self):
        loose = self.proposal(self.loose)
        gone = self.proposal(customer_id=GONE)
        initiative = self.proposal(kind="initiative")
        self.assertFalse(self.source(self.mona, TEAM, "agent_action").waiting.exists())
        company = self.source(self.admin, COMPANY, "agent_action")
        self.assertEqual(ids(company.readable), {loose.id, gone.id, initiative.id})

    def test_company_without_view_all_hides_what_it_cannot_open(self):
        taco = self.proposal(self.taco)
        gone = self.proposal(customer_id=GONE)
        initiative = self.proposal(kind="initiative")
        lee = self.source(self.lee, COMPANY, "agent_action")
        # Decision 11: a workspace-level action shows to view-all readers only,
        # and Ruling 10 keeps it off everyone else's desk, so never hidden
        self.assertEqual(ids(lee.waiting), {taco.id, gone.id})
        self.assertNotIn(initiative.id, ids(lee.waiting))
        self.assertEqual(ids(lee.readable), set())

    def test_session_proposals_reach_participants_in_me_twice_filtered(self):
        # Carl opens Taco Bell through his Taco East account, so the hidden
        # one names Soup Co: Mona's, above him.
        session = self.session(self.other, self.csm)
        initiative = self.proposal(kind="initiative", session=session)
        soup = self.proposal(self.soup, session=session)
        carl = self.source(self.csm, ME, "agent_action")
        # Ruling 10: the workspace-level one is off Carl's desk altogether.
        self.assertEqual(ids(carl.waiting), {soup.id})
        self.assertNotIn(initiative.id, ids(carl.waiting))
        self.assertEqual(ids(carl.readable), set())
        # Mona is not in the session: only her own customer's proposal is hers.
        self.assertEqual(ids(self.source(self.mona, ME, "agent_action").waiting), {soup.id})

    def test_a_session_action_on_a_record_the_reader_can_open_is_readable(self):
        # Carl opens Taco Bell through his Taco East account without owning it;
        # the session widens Me to Dana's customer, and the twice-filter keeps it.
        session = self.session(self.other, self.csm)
        taco = self.proposal(self.taco, session=session)
        carl = self.source(self.csm, ME, "agent_action")
        self.assertEqual(ids(carl.waiting), {taco.id})
        self.assertEqual(ids(carl.readable), {taco.id})

    def test_a_participant_who_left_or_was_never_accepted_does_not_see_it(self):
        session = self.session(self.other, self.csm)
        session.participants.filter(user=self.csm).update(left_at=session.created_at)
        self.proposal(kind="initiative", session=session)
        self.assertFalse(self.source(self.csm, ME, "agent_action").waiting.exists())


class QuestionDeskTests(DeskFixture):
    def test_a_question_waits_on_its_assignee_and_their_chain(self):
        q = self.question(self.csm, customer=self.pizza)
        self.assertEqual(ids(self.source(self.csm, ME, "question").readable), {q.id})
        self.assertEqual(ids(self.source(self.mona, TEAM, "question").readable), {q.id})
        self.assertFalse(self.source(self.other, ME, "question").waiting.exists())

    def test_a_question_on_a_customer_the_reader_cannot_open_is_hidden(self):
        q = self.question(self.other, customer=self.taco)
        lee = self.source(self.lee, COMPANY, "question")
        self.assertEqual(ids(lee.waiting), {q.id})
        self.assertFalse(lee.readable.exists())

    def test_answered_questions_do_not_wait(self):
        q = self.question(self.csm)
        q.status = "answered"
        q.save()
        self.assertFalse(self.source(self.csm, ME, "question").waiting.exists())


class OverdueTaskDeskTests(DeskFixture):
    def test_only_open_past_due_assigned_tasks_wait(self):
        late = self.task(self.csm, customer=self.pizza)
        self.task(self.csm, customer=self.pizza, overdue_by=0)
        self.task(self.csm, customer=self.pizza, status=Task.Status.COMPLETED)
        Task.objects.create(
            customer=self.pizza,
            title="Nobody's",
            assignee_name="x",
            due_date=self.today - timedelta(days=30),
            priority="low",
        )
        self.assertEqual(ids(self.source(self.csm, ME, "overdue_task").readable), {late.id})
        self.assertEqual(ids(self.source(self.mona, TEAM, "overdue_task").readable), {late.id})

    def test_a_task_on_an_account_the_reader_cannot_open_is_hidden(self):
        west = self.task(self.csm, account=self.west)
        mine = self.source(self.csm, ME, "overdue_task")
        self.assertEqual(ids(mine.waiting), {west.id})
        self.assertFalse(mine.readable.exists())

    def test_view_all_reads_every_task(self):
        # view-all and Leadership read every task (owner decision 2026-10-07);
        # before, the admin read only tasks in their own chain (0 here).
        self.task(self.other, customer=self.taco, created_by=self.other)
        company = self.source(self.admin, COMPANY, "overdue_task")
        self.assertEqual(company.waiting.count(), 1)
        self.assertEqual(company.readable.count(), 1)


class DeskQueryTests(DeskFixture):
    def test_no_distinct_in_any_desk_query(self):
        self.review(self.csm)
        self.proposal(self.pizza, session=self.session(self.csm, self.mona))
        self.question(self.csm, customer=self.pizza)
        self.task(self.csm, customer=self.pizza)
        for reader, key in ((self.mona, TEAM), (self.mona, ME), (self.admin, COMPANY)):
            scope = resolve(reader, key)
            with CaptureQueriesContext(connection) as queries:
                sessions = desk.session_ids_seen_whole(reader)
                for source in desk.sources(reader, scope, self.today, sessions):
                    source.waiting.count()
                    source.readable.count()
            for query in queries.captured_queries:
                self.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])
