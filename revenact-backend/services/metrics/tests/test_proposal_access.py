"""`served_proposals` — what a reader may see of a batch of proposals
served through session/decisions/ and session/close/ (owner-approved
privacy contract, 2026-10-06): evidence and rationale are model-written
from organisation-wide data, so they're withheld from anyone who doesn't
already see everything; a task proposal naming a customer the reader
can't open (or one that no longer exists) is left out and counted, never
served with a stand-in. Mirrors the rule services/brain/desk.py
already applies to the Me/My team/Company desk."""

import uuid
from datetime import timedelta
from decimal import Decimal

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.accounts.models import Organisation, User
from services.customers.models import Customer
from services.metrics.models import AgentAction, Initiative
from services.metrics.proposal_access import served_proposals

GONE = 999_999


def _org():
    org = Organisation.objects.create(name="Acme Inc", currency="USD")
    admin = User.objects.create_user(
        email="alice@acme.io", password="x", name="Alice", organisation=org, role=User.Role.ADMIN
    )
    carl = User.objects.create_user(
        email="carl@acme.io", password="x", name="Carl", organisation=org, role=User.Role.CSM
    )
    # No org-chart relation to Carl and no shared account: Carl cannot open
    # whatever Zed owns.
    zed = User.objects.create_user(
        email="zed@acme.io", password="x", name="Zed", organisation=org, role=User.Role.CSM
    )
    mine = Customer.objects.create(
        organisation=org, name="Pizza Hut", owner=carl, arr_billed_at_account=Decimal(100_000)
    )
    mine2 = Customer.objects.create(
        organisation=org, name="Fine Co", owner=carl, arr_billed_at_account=Decimal(75_000)
    )
    theirs = Customer.objects.create(
        organisation=org, name="Secret Co", owner=zed, arr_billed_at_account=Decimal(50_000)
    )
    return org, admin, carl, zed, mine, mine2, theirs


def _open_initiative(org):
    return Initiative.objects.create(
        organisation=org,
        title="Halve ARR at risk on Product B",
        metric="at_risk_arr",
        target_value=200_000,
        target_by=timezone.localdate() + timedelta(days=60),
        baseline_as_of=timezone.localdate(),
    )


def _task(org, customer_id, *, customer_name=None, session=None, initiative=None, **extra):
    """A task action on `customer_id`. `GONE` builds `customer=None`: the FK
    cascades, so deleting a customer deletes its actions, and a task action
    with no customer is only ever a migrated row. (`customer_name` is read
    from the FK, so it is unused.)"""
    if customer_id == GONE:
        customer_id = None
    action = AgentAction.objects.create(
        organisation=org,
        batch="b1",
        kind=AgentAction.Kind.TASK_CREATE,
        title="Call the exec sponsor",
        rationale="Carl agreed to it on the call, citing Q3 churn risk org-wide.",
        evidence=["Pizza Hut: USD 100,000 ARR, renews in 30 days"],
        customer_id=customer_id,
        target=f"task:{uuid.uuid4().hex}",
        payload={
            "title": "Call the exec sponsor",
            "assignee_id": None,
            "assignee_name": "Carl",
            "due_date": "2026-11-01",
            "priority": "high",
        },
        session=session,
        initiative=initiative,
        **extra,
    )
    # Served as its callers serve it: with the organisation already loaded.
    return AgentAction.objects.select_related(
        "customer", "initiative", "decided_by", "generated_by", "session__conversation"
    ).get(pk=action.pk)


def _initiative(org, **extra):
    return AgentAction.objects.create(
        organisation=org,
        batch="b1",
        kind=AgentAction.Kind.INITIATIVE_CREATE,
        title="Halve ARR at risk on Product B",
        rationale="Product B carries all of the downside org-wide.",
        evidence=["at_risk_arr by product: Product B $400,000"],
        target=f"initiative:{uuid.uuid4().hex}",
        payload={
            "metric": "at_risk_arr",
            "metric_label": "ARR at risk",
            "dimension": "",
            "member": "",
            "member_label": "",
            "target_value": 200_000,
            "target_by": "2026-12-01",
        },
        **extra,
    )


class ServedProposalsTests(TestCase):
    def setUp(self):
        self.org, self.admin, self.carl, self.zed, self.mine, self.mine2, self.theirs = _org()

    def test_a_non_view_all_reader_gets_no_evidence_or_rationale(self):
        proposal = _task(self.org, self.mine.id, customer_name=self.mine.name)

        payloads, hidden = served_proposals(self.carl, [proposal])

        self.assertEqual(hidden, 0)
        (payload,) = payloads
        self.assertEqual(payload["evidence"], [])
        self.assertIsNone(payload["rationale"])

    def test_a_task_on_a_customer_the_reader_can_open_keeps_its_action(self):
        proposal = _task(self.org, self.mine.id, customer_name=self.mine.name)

        payloads, hidden = served_proposals(self.carl, [proposal])

        self.assertEqual(hidden, 0)
        (payload,) = payloads
        self.assertEqual(payload["action"]["customer_id"], self.mine.id)
        self.assertEqual(payload["action"]["title"], "Call the exec sponsor")

    def test_a_task_on_a_customer_the_reader_cannot_open_is_hidden(self):
        proposal = _task(self.org, self.theirs.id, customer_name=self.theirs.name)

        payloads, hidden = served_proposals(self.carl, [proposal])

        self.assertEqual(payloads, [])
        self.assertEqual(hidden, 1)

    def test_a_task_on_a_customer_that_no_longer_exists_is_hidden(self):
        proposal = _task(self.org, GONE)

        payloads, hidden = served_proposals(self.carl, [proposal])

        self.assertEqual(payloads, [])
        self.assertEqual(hidden, 1)

    def test_an_initiative_is_kept_with_evidence_and_rationale_withheld(self):
        proposal = _initiative(self.org)

        payloads, hidden = served_proposals(self.carl, [proposal])

        self.assertEqual(hidden, 0)
        (payload,) = payloads
        self.assertEqual(payload["evidence"], [])
        self.assertIsNone(payload["rationale"])
        self.assertEqual(payload["action"]["metric"], "at_risk_arr")

    def test_a_mix_counts_hidden_and_keeps_the_openable_one(self):
        openable = _task(self.org, self.mine.id, customer_name=self.mine.name)
        unopenable = _task(self.org, self.theirs.id, customer_name=self.theirs.name)
        gone = _task(self.org, GONE)
        initiative = _initiative(self.org)

        payloads, hidden = served_proposals(self.carl, [openable, unopenable, gone, initiative])

        self.assertEqual(hidden, 2)
        self.assertEqual({p["id"] for p in payloads}, {openable.id, initiative.id})

    def test_a_linked_initiative_is_withheld_from_a_non_view_all_reader(self):
        open_one = _open_initiative(self.org)
        proposal = _task(self.org, self.mine.id, customer_name=self.mine.name, initiative=open_one)

        payloads, hidden = served_proposals(self.carl, [proposal])

        self.assertEqual(hidden, 0)
        (payload,) = payloads
        self.assertIsNone(payload["initiative"])

    def test_a_linked_initiative_is_kept_for_a_view_all_reader(self):
        open_one = _open_initiative(self.org)
        proposal = _task(self.org, self.mine.id, customer_name=self.mine.name, initiative=open_one)

        payloads, hidden = served_proposals(self.admin, [proposal])

        self.assertEqual(hidden, 0)
        (payload,) = payloads
        self.assertEqual(payload["initiative"], {"id": open_one.id, "title": open_one.title})

    def test_decision_note_is_withheld_on_an_initiative_for_a_non_view_all_reader(self):
        proposal = _initiative(
            self.org, status=AgentAction.Status.APPLIED, decision_note="Figures org-wide agree."
        )

        payloads, hidden = served_proposals(self.carl, [proposal])

        self.assertEqual(hidden, 0)
        (payload,) = payloads
        self.assertIsNone(payload["decision_note"])

    def test_decision_note_is_kept_on_a_task_for_a_non_view_all_reader(self):
        proposal = _task(
            self.org,
            self.mine.id,
            customer_name=self.mine.name,
            status=AgentAction.Status.APPLIED,
            decision_note="Go ahead.",
        )

        payloads, hidden = served_proposals(self.carl, [proposal])

        self.assertEqual(hidden, 0)
        (payload,) = payloads
        self.assertEqual(payload["decision_note"], "Go ahead.")

    def test_decision_note_is_kept_for_a_view_all_reader(self):
        proposal = _initiative(
            self.org, status=AgentAction.Status.APPLIED, decision_note="Figures org-wide agree."
        )

        payloads, hidden = served_proposals(self.admin, [proposal])

        (payload,) = payloads
        self.assertEqual(payload["decision_note"], "Figures org-wide agree.")

    def test_a_view_all_reader_gets_the_full_payload_and_hidden_is_zero(self):
        openable = _task(self.org, self.mine.id, customer_name=self.mine.name)
        unopenable = _task(self.org, self.theirs.id, customer_name=self.theirs.name)
        gone = _task(self.org, GONE)

        payloads, hidden = served_proposals(self.admin, [openable, unopenable, gone])

        self.assertEqual(hidden, 0)
        self.assertEqual(len(payloads), 3)
        kept = {p["id"]: p for p in payloads}
        self.assertEqual(kept[openable.id]["evidence"], openable.evidence)
        self.assertEqual(kept[openable.id]["rationale"], openable.rationale)

    def _fresh_carl(self):
        """A cold instance of Carl: none of his per-instance caches
        (`has_capability`'s membership lookup, `subtree_ids`) are warm
        yet — otherwise the second measurement would look cheaper for
        having reused the first call's cache, not for being a real
        query-count improvement."""
        return User.objects.get(pk=self.carl.pk)

    def test_query_count_is_constant_in_the_number_of_proposals(self):
        from services.copilot.models import Conversation, CopilotSession

        conversation = Conversation.objects.create(
            organisation=self.org, user=self.carl, title="Renewal risk"
        )
        session = CopilotSession.objects.create(
            conversation=conversation, status=CopilotSession.Status.LIVE
        )
        open_one = _open_initiative(self.org)

        def seed():
            # Several distinct customers (two openable, one not), one gone,
            # one with a session and one with a linked initiative — a
            # per-row lookup of any of these would show up as growth below.
            return [
                _task(self.org, self.mine.id, customer_name=self.mine.name),
                _task(self.org, self.mine2.id, customer_name=self.mine2.name),
                _task(self.org, self.theirs.id, customer_name=self.theirs.name),
                _task(self.org, GONE),
                _task(self.org, self.mine.id, customer_name=self.mine.name, session=session),
                _task(self.org, self.mine2.id, customer_name=self.mine2.name, initiative=open_one),
            ]

        proposals = seed()
        with CaptureQueriesContext(connection) as few:
            served_proposals(self._fresh_carl(), list(proposals))

        # Grow with NEW, never-before-seen customers — half openable
        # (Carl's own), half not (Zed's) — not more proposals on the same
        # four customers `few` already named. A regression that queries
        # once per *distinct* customer id rather than once for the whole
        # batch would show up as growth here; repeating an already-seen
        # customer id (as this test used to) would let it pass unnoticed.
        for i in range(6):
            fresh_open = Customer.objects.create(
                organisation=self.org,
                name=f"Fresh Open {i}",
                owner=self.carl,
                arr_billed_at_account=Decimal(1_000),
            )
            proposals.append(_task(self.org, fresh_open.id, customer_name=fresh_open.name))
        for i in range(6):
            fresh_shut = Customer.objects.create(
                organisation=self.org,
                name=f"Fresh Shut {i}",
                owner=self.zed,
                arr_billed_at_account=Decimal(1_000),
            )
            proposals.append(_task(self.org, fresh_shut.id, customer_name=fresh_shut.name))

        with CaptureQueriesContext(connection) as many:
            served_proposals(self._fresh_carl(), list(proposals))

        self.assertEqual(len(many.captured_queries), len(few.captured_queries))
        for query in many.captured_queries:
            self.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])
