"""Proposal became AgentAction in place (Agents round Decision 1): same rows,
same ids, the old kinds and statuses renamed, the customer a real FK."""

from datetime import timedelta

from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone

from services.brain.tests.fixtures import BrainFixture
from services.metrics.models import AgentAction


def task_action(organisation, customer, *, title="Call the exec sponsor", **fields):
    return AgentAction.objects.create(
        organisation=organisation,
        batch="b1",
        kind=AgentAction.Kind.TASK_CREATE,
        customer=customer,
        target=f"task:{title.casefold()}",
        title=title,
        rationale="Because.",
        evidence=["Pizza Hut renews in 30 days"],
        payload={
            "title": title,
            "assignee_id": None,
            "assignee_name": "Carl CSM",
            "due_date": (timezone.localdate() + timedelta(days=7)).isoformat(),
            "priority": "high",
        },
        **fields,
    )


class AgentActionModelTests(BrainFixture):
    def test_defaults(self):
        action = task_action(self.org, self.pizza)
        self.assertEqual(action.agent, AgentAction.Agent.OPS)
        self.assertEqual(action.status, AgentAction.Status.PROPOSED)
        self.assertEqual(action.record, self.pizza)
        self.assertFalse(action.workspace_level)
        self.assertFalse(action.auto)

    def test_an_initiative_is_workspace_level(self):
        action = AgentAction.objects.create(
            organisation=self.org,
            batch="b1",
            kind=AgentAction.Kind.INITIATIVE_CREATE,
            target="initiative:nrr::",
            title="Lift NRR",
            rationale="x",
            payload={"metric": "nrr"},
        )
        self.assertIsNone(action.record)
        self.assertTrue(action.workspace_level)

    def test_one_open_action_per_kind_record_and_target(self):
        task_action(self.org, self.pizza)
        with self.assertRaises(IntegrityError), transaction.atomic():
            task_action(self.org, self.pizza)
        # A decided one does not count.
        AgentAction.objects.update(status=AgentAction.Status.REJECTED)
        task_action(self.org, self.pizza)

    def test_workspace_level_actions_are_one_open_too(self):
        def make():
            return AgentAction.objects.create(
                organisation=self.org,
                batch="b1",
                kind=AgentAction.Kind.INITIATIVE_CREATE,
                target="initiative:nrr::",
                title="Lift NRR",
                rationale="x",
                payload={},
            )

        make()
        with self.assertRaises(IntegrityError), transaction.atomic():
            make()


class ProposalMigrationTests(TransactionTestCase):
    """0011 turns yesterday's proposals into Ops agent actions."""

    # customers and accounts are pinned in both states, so the historical
    # Customer and Organisation models match the tables the database really has.
    customers = ("customers", "0057_task_tracking")
    accounts = ("accounts", "0015_organisation_gmail_two_way")
    before = [("metrics", "0010_initiative_baseline_scope"), customers, accounts]
    after = [("metrics", "0011_agent_action"), customers, accounts]

    def test_proposals_become_actions(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.before)
        old = executor.loader.project_state(self.before).apps
        Organisation = old.get_model("accounts", "Organisation")
        Customer = old.get_model("customers", "Customer")
        Proposal = old.get_model("metrics", "Proposal")
        org = Organisation.objects.create(name="Acme", currency="USD")
        pizza = Customer.objects.create(organisation=org, name="Pizza Hut")
        task = Proposal.objects.create(
            organisation=org,
            batch="b",
            kind="task",
            title="Call",
            rationale="x",
            action={"customer_id": pizza.pk, "title": "Call", "assignee_name": "Carl"},
            status="approved",
        )
        gone = Proposal.objects.create(
            organisation=org,
            batch="b",
            kind="task",
            title="Gone",
            rationale="x",
            action={"customer_id": 999999, "title": "Gone"},
        )
        executor = MigrationExecutor(connection)
        executor.migrate(self.after)
        new = executor.loader.project_state(self.after).apps
        AgentAction = new.get_model("metrics", "AgentAction")
        moved = AgentAction.objects.get(pk=task.pk)
        self.assertEqual(
            (moved.kind, moved.status, moved.agent, moved.customer_id),
            ("task.create", "applied", "ops", pizza.pk),
        )
        self.assertEqual(moved.payload["assignee_name"], "Carl")
        self.assertEqual(moved.target, f"legacy:{task.pk}")
        stale = AgentAction.objects.get(pk=gone.pk)
        self.assertEqual((stale.status, stale.expired_reason), ("expired", "changed"))
        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())
