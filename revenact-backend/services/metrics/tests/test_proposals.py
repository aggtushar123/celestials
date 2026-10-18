"""The Ops agent and the review queue."""

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from services.accounts.models import Organisation, User
from services.agents import deciding
from services.customers.models import Customer, Product, Task
from services.metrics import proposals
from services.metrics.models import AgentAction, Initiative


def _store(org, raw, generated_by=None):
    """What a pass of the Ops agent does with the model's answer."""
    return proposals.store_answer(
        org,
        proposals.build_evidence(org),
        raw,
        limit=proposals.MAX_PROPOSALS,
        generated_by=generated_by,
    )


def _org():
    org = Organisation.objects.create(name="Acme Inc", currency="USD")
    admin = User.objects.create_user(
        email="alice@acme.io", password="x", name="Alice", organisation=org, role=User.Role.ADMIN
    )
    carl = User.objects.create_user(
        email="carl@acme.io", password="x", name="Carl", organisation=org, role=User.Role.CSM
    )
    b = Product.objects.create(organisation=org, name="Product B")
    shaky = Customer.objects.create(
        organisation=org,
        name="Pizza Hut",
        owner=carl,
        primary_product=b,
        arr_billed_at_account=Decimal(100_000),
        health_score=Decimal("2.0"),
        renewal_date=timezone.localdate() + timedelta(days=30),
    )
    Customer.objects.create(
        organisation=org,
        name="Fine",
        owner=carl,
        primary_product=b,
        arr_billed_at_account=Decimal(200_000),
        health_score=Decimal("8.5"),
    )
    return org, admin, carl, b, shaky


def _answer(customer_id, product_id, initiative_id="null"):
    return f"""[
  {{"kind": "task", "title": "Run a save play on Pizza Hut before renewal",
    "rationale": "Pizza Hut carries the downside and renews in 30 days.",
    "evidence": ["Pizza Hut: renews in 30 days, health poor"],
    "initiative_id": {initiative_id},
    "action": {{"customer_id": {customer_id}, "title": "Save play: Pizza Hut", "assignee": "Carl",
                "due_in_days": 7, "priority": "high"}}}},
  {{"kind": "initiative", "title": "Halve ARR at risk on Product B",
    "rationale": "Product B carries all of the risk.", "evidence": ["at_risk_arr by product"],
    "initiative_id": null,
    "action": {{"metric": "at_risk_arr", "dimension": "product", "member": "{product_id}",
                "target_value": 20000, "target_in_days": 60}}}},
  {{"kind": "task", "title": "Email everyone", "rationale": "x", "evidence": [],
    "initiative_id": null,
    "action": {{"customer_id": 999999, "title": "Nope", "assignee": "Nobody", "due_in_days": 3,
                "priority": "high"}}}}
]"""


class EvidenceTests(TestCase):
    def setUp(self):
        self.org, self.admin, self.carl, self.b, self.shaky = _org()

    def test_the_agent_sees_the_accounts_carrying_the_downside_and_who_owns_them(self):
        evidence = proposals.build_evidence(self.org)
        prompt = proposals.build_prompt(evidence)

        self.assertEqual([a["name"] for a in evidence["accounts"]], ["Pizza Hut"])
        self.assertEqual(evidence["accounts"][0]["owner"], "Carl")
        self.assertIn(
            f"- {self.shaky.id}: Pizza Hut — account owner Carl, product Product B", prompt
        )
        self.assertIn("renews in 30 days", prompt)
        self.assertIn("- Carl", prompt)
        # The healthy account carries no downside and is not offered as a target.
        self.assertNotIn("Fine", prompt)

    def test_an_empty_book_has_nothing_to_propose_from(self):
        empty = Organisation.objects.create(name="New Inc", currency="USD")

        with self.assertRaises(proposals.NothingToProposeFrom):
            proposals.build_evidence(empty)


class GenerationTests(TestCase):
    def setUp(self):
        self.org, self.admin, self.carl, self.b, self.shaky = _org()

    def test_valid_proposals_are_stored_and_invalid_ones_dropped(self):
        with self.assertLogs("services.metrics.proposals", "WARNING") as logs:
            stored = _store(self.org, _answer(self.shaky.id, self.b.id), generated_by=self.admin)

        self.assertEqual([p.kind for p in stored], ["task.create", "initiative.create"])
        self.assertIn("999999", logs.output[0])
        task = stored[0]
        self.assertEqual(task.customer_id, self.shaky.id)
        self.assertEqual(task.payload["assignee_name"], "Carl")
        self.assertEqual(task.payload["priority"], "high")
        self.assertEqual(
            task.payload["due_date"], (timezone.localdate() + timedelta(days=7)).isoformat()
        )
        initiative = stored[1]
        self.assertEqual(initiative.payload["member_label"], "Product B")
        self.assertEqual(initiative.payload["target_value"], 20000.0)
        self.assertTrue(all(p.batch == stored[0].batch for p in stored))
        self.assertTrue(all(p.status == "proposed" for p in stored))

    def test_an_unknown_assignee_falls_back_to_the_accounts_owner(self):
        answer = _answer(self.shaky.id, self.b.id).replace(
            '"assignee": "Carl"', '"assignee": "Zed"'
        )
        with self.assertLogs("services.metrics.proposals", "WARNING"):
            stored = _store(self.org, answer)

        self.assertEqual(stored[0].payload["assignee_name"], "Carl")

    def test_approving_a_task_that_serves_a_decision_links_the_work_to_it(self):
        open_one = Initiative.objects.create(
            organisation=self.org,
            title="Open",
            metric="at_risk_arr",
            target_value=1,
            target_by=timezone.localdate() + timedelta(days=30),
            baseline_as_of=timezone.localdate(),
        )
        with self.assertLogs("services.metrics.proposals", "WARNING"):
            stored = _store(self.org, _answer(self.shaky.id, self.b.id, initiative_id=open_one.id))

        deciding.approve(self.admin, stored[0].pk)

        task = Task.objects.get(customer=self.shaky)
        self.assertEqual(task.initiative, open_one)

    def test_a_link_to_an_open_decision_is_kept_and_a_bogus_one_dropped(self):
        open_one = Initiative.objects.create(
            organisation=self.org,
            title="Open",
            metric="at_risk_arr",
            target_value=1,
            target_by=timezone.localdate() + timedelta(days=30),
            baseline_as_of=timezone.localdate(),
        )
        with self.assertLogs("services.metrics.proposals", "WARNING"):
            stored = _store(self.org, _answer(self.shaky.id, self.b.id, initiative_id=open_one.id))

        self.assertEqual(stored[0].initiative, open_one)
        # Decided, so the same tasks may be proposed again (Decision 15).
        AgentAction.objects.update(status=AgentAction.Status.REJECTED)
        with self.assertLogs("services.metrics.proposals", "WARNING"):
            stored = _store(self.org, _answer(self.shaky.id, self.b.id, initiative_id=999))
        self.assertIsNone(stored[0].initiative)


def _action(org, customer, status_value, *, agent="ops", kind="task.create", **fields):
    fields.setdefault("target", f"t:{agent}:{kind}:{status_value}")
    return AgentAction.objects.create(
        organisation=org,
        agent=agent,
        batch="b",
        kind=kind,
        customer=customer,
        title=f"{agent} {kind} {status_value}",
        rationale="r",
        payload={"title": "t", "assignee_id": None, "assignee_name": "Carl", "priority": "low"},
        status=status_value,
        **fields,
    )


class StoreAnswerCollisionTests(TestCase):
    def setUp(self):
        self.org, self.admin, self.carl, self.b, self.shaky = _org()

    def test_an_item_colliding_with_an_open_action_is_skipped(self):
        existing = _action(self.org, self.shaky, "proposed", target="task:save play: pizza hut")
        before = AgentAction.objects.values().get(pk=existing.pk)
        evidence = proposals.build_evidence(self.org)
        raw = (
            """[{"kind": "task", "title": "Save play: Pizza Hut", "rationale": "x",
          "evidence": [], "action": {"customer_id": %d, "title": "Save play: Pizza Hut",
          "assignee": "Carl", "due_in_days": 7, "priority": "high"}}]"""
            % self.shaky.id
        )

        stored = proposals.store_answer(self.org, evidence, raw, limit=8)

        self.assertEqual(stored, [])
        self.assertEqual(AgentAction.objects.count(), 1)
        self.assertEqual(AgentAction.objects.values().get(pk=existing.pk), before)
