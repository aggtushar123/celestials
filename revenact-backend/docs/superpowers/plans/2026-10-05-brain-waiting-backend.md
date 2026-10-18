# Brain delivery 2: Waiting on you (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One list, per Brain scope, of everything waiting for a decision or answer (rule reviews, Ops-agent proposals, questions, overdue tasks), plus a Me-scope count for every member's sidebar badge, and the proposal decision moved from `view_all_accounts` to "the customer's owner, anyone above them, or `view_all_accounts`".

**Architecture:** `services/brain/desk.py` builds, per kind, two querysets: what waits on the scope's people (`waiting`) and the part the reader may open (`readable`). Both are `id IN (subquery)` filters, never joins with DISTINCT. `services/brain/waiting.py` holds the decision rule (`decided_as` / `can_decide`), turns the readable querysets into the §3 items (`build`), and sums the Me counts for the badge (`count`). Two `BrainView` routes serve them. `ProposalDecisionView` asks `decided_as` and records `proposal.approved` / `proposal.rejected` with `decided_as`.

**Tech Stack:** Django 5.2, DRF, PostgreSQL 16 (CI/prod), Django test runner with `--parallel`.

**Spec:** `/Users/tusharaggarwal/Desktop/Projects/Revenact/react-ts-app/docs/superpowers/specs/2026-10-05-brain-waiting-design.md` (this plan covers §0, Decisions, §1 and §3; §3 is the API contract shared with the frontend plan). Scope rules: `react-ts-app/docs/superpowers/specs/2026-10-05-brain-what-changed-design.md`.

## Global Constraints

- Postgres 16: visibility as `id__in` subqueries, never joins + `.distinct()`.
- Tests: `venv/bin/python manage.py test <labels> --parallel --noinput`.
- `venv/bin/ruff check .` and `venv/bin/ruff format --check .` (ruff also formats Markdown code blocks).
- `venv/bin/python manage.py makemigrations --check --dry-run` (this delivery adds no migration).
- `venv/bin/python scripts/ci_shard_labels.py --check 4`.
- Never two Django test runs at once.
- Every commit ends with exactly:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- SOC2 markers (`# SOC2:AUTH-02`) on the who-may-decide rule and on every item filter.
- Every item names only records the reader can open (twice-filter); the rest are counted in `hidden`.
- Stay on branch `feat/brain-waiting`; never push.

## Decisions (where the spec is silent)

1. `GET waiting/` with no or empty `?scope=` reads the reader's default (widest) scope, like every other Brain route (`BrainView.scope`).
2. **Accepted participant** (spec Decision 3) means `services.copilot.views.sees_whole_conversation`: the conversation's owner, or a present participant who holds a grant along the accepted-invite chain from the owner. The set is computed in Python over the sessions that have a waiting proposal (`desk.session_ids_seen_whole`). This avoids `_conversations_granted_to`, whose query uses join + DISTINCT.
3. **Rule reviews**: shown only on a rule in `services.rules.access.readable_rules(reader)`. Everything else is hidden, so a manager doesn't see a report's private rule. `can_decide` is true only for the rule's owner.
4. **Questions**: readable by `knowledge.views.visible_questions`' own rule, rewritten as `id IN` filters (asker in `scope_ids`, assignee the reader or below, the reader owns the customer or is its function owner). The customer it names, if any, must be in `visible_customers(reader)`. `can_decide` follows `QuestionAnswerView`: the assignee, or a holder of `manage_users`. The title is the question text, cut to 200 characters.
5. **Overdue tasks**: readable by `personal.visible_tasks` (no `view_all_accounts` exemption, the same as the Activity feed) on a customer or account the reader may open. `can_decide` is always true, because a task the reader can read is one they can open. A `view_all_accounts` reader sees other people's tasks in Company only through their own chain. The rest are hidden.
6. **Proposals**: readable when the reader has `view_all_accounts`, or it is an initiative, or the named customer is in `visible_customers(reader)`. A task proposal whose customer no longer exists is therefore readable only with `view_all_accounts`.
7. `decided_as` precedence: `owner` (the reader owns the customer), then `chain` (the owner is below the reader), then `company` (`view_all_accounts`).
8. Item order: `since` ascending, then kind (`rule_review`, `proposal`, `question`, `overdue_task`), then id. An overdue task's `since` sorts as the start of its due date in the server's time zone.
9. Audit `target_repr` is `"Proposal <id>"`, never the title, because a title can name a customer.

## Contract notes (real code that forces a §3 / §1 detail)

1. **There are no `proposal.approved` / `proposal.rejected` audit events today.** `proposals.approve`/`reject` write only a `Feedback` row (`metrics.feedback.record_proposal_decision`). §1.4 says to add `decided_as` to the existing events, so this plan adds the two events in `ProposalDecisionView`, with metadata `{"kind", "decided_as"}`, and catalogues them. They are new catalogue rows.
2. **Rule review `detail.counts`** is the stored `RuleReview.counts`: `{people, records}` for a survey and `{reach, skipped}` for a campaign. §3's `{"send", "skip"}` does not exist anywhere. The spec asks the frontend to reuse the existing `RuleReviews` component, which renders the full `rules.payloads.review_payload`, so `detail.review` is added. It holds that payload for the rule's owner and is `null` for anyone else (`ReviewListView` is owner-only). There is no stored review title, so `title` is `"Survey from <rule name>"` or `"Campaign from <rule name>"`.
3. **Proposal `detail.session`** is `{id, title}`. The title is the conversation's title only for a reader who sees the whole conversation. Anyone else gets `"Shared conversation"` (`copilot.views.NEUTRAL_TITLE`). `ProposalDecisionView`'s response applies the same rule to `source.title` for a non-`company` decider, since that response now reaches CSMs.
4. **Approving a task proposal whose customer is gone** raises `Customer.DoesNotExist` inside `proposals.approve` (a 500 today). The spec now shows these proposals to Company readers, so the view maps the exception to `409 {"detail": "This proposal's customer no longer exists."}`. Rejecting still works.
5. **Refusal order on `/metrics/proposals/<id>/approve|reject/`**: 404 (another organisation's proposal, or a missing one), then 403 `{"detail": "You can't decide this proposal."}`, then 409. Someone who may not decide can't learn whether the proposal was already decided.
6. **`counts` are readable totals.** `hidden` is the sum over kinds of waiting minus readable. `waiting/count/` is the sum of the Me `counts`, hidden excluded, so the badge equals the Me list's total.
7. `since` uses Python's `isoformat()` (`+00:00`, not `Z`), like the rest of the Brain payloads. An overdue task's `since` is a date (`"2026-10-02"`).

## File Structure

| File | Responsibility |
|---|---|
| Create `services/brain/waiting.py` | `decided_as`, `can_decide`, `customer_owner_id` (Task 1); `count` (Task 2); `build` and the item builders (Task 3) |
| Create `services/brain/desk.py` | `Source`, `KINDS`, the four per-kind sources, `session_ids_seen_whole`, `sources` (Task 2) |
| Modify `services/metrics/views.py` (`ProposalDecisionView`) | The new permission rule, gone-customer 409, audit with `decided_as`, neutral session title |
| Modify `services/brain/views.py`, `services/brain/urls.py` | `WaitingView`, `WaitingCountView`, routes |
| Create `services/brain/tests/waiting_fixtures.py` | `WaitingFixture(BrainFixture)`: proposals, sessions, reviews, questions, tasks |
| Create `services/brain/tests/test_deciding.py` | Task 1 tests |
| Create `services/brain/tests/test_desk.py` | Task 2 tests |
| Create `services/brain/tests/test_waiting.py` | Task 3 tests |
| Create `services/brain/tests/test_api_waiting.py` | Task 4 tests |
| Create `services/brain/tests/test_waiting_e2e.py` | Task 5 end-to-end |
| Modify `docs/API_CONTRACTS.md`, `docs/audit-events.md`, `docs/product/01-prd.md`, `docs/product/02-trd.md` | Task 5 |

---

### Task 1: Who may decide a proposal

**Files:**
- Create: `services/brain/waiting.py`
- Create: `services/brain/tests/waiting_fixtures.py`
- Create: `services/brain/tests/test_deciding.py`
- Modify: `services/metrics/views.py` (class `ProposalDecisionView`, currently lines 465-489)

**Interfaces:**
- Consumes: `BrainFixture` (`services/brain/tests/fixtures.py`): `self.org`, `self.admin` (view_all), `self.lee` (Leadership, no view_all), `self.mona` (manages Carl), `self.csm` (Carl), `self.other` (Dana), `self.stranger` (Globex); customers `self.pizza`/`self.dough` (Carl), `self.soup` (Mona), `self.taco` (Dana), `self.loose` (nobody); accounts `self.emea` (Carl, under Pizza Hut), `self.east` (Carl, under Taco Bell), `self.west` (Dana, under Taco Bell). `self.as_user(user)` returns an authenticated `APIClient`.
- Produces:
  - `services.brain.waiting.OWNER = "owner"`, `CHAIN = "chain"`, `COMPANY_DECIDER = "company"`
  - `customer_owner_id(proposal) -> int | None`
  - `decided_as(reader, proposal, *, owner_id=<lookup>) -> "owner" | "chain" | "company" | None`
  - `can_decide(reader, proposal, *, owner_id=<lookup>) -> bool`
  - `services.metrics.views.CANT_DECIDE = "You can't decide this proposal."`, `CUSTOMER_GONE = "This proposal's customer no longer exists."`
  - `WaitingFixture` with `proposal(customer=None, *, kind="task", session=None, title="Save play", customer_id=None)` and `session(owner, *members, title=...)`

- [ ] **Step 1: Write the fixture**

`services/brain/tests/waiting_fixtures.py`:

```python
"""Waiting on you: BrainFixture's people and book, plus makers for the
four kinds of waiting item. Carl (CSM) reports to Mona; Dana is nobody's;
Alice has view_all_accounts; Lee reads Company through Leadership only."""

from datetime import timedelta

from services.brain.tests.fixtures import BrainFixture
from services.copilot.models import (
    Conversation,
    CopilotSession,
    SessionInvite,
    SessionParticipant,
)
from services.metrics.models import Proposal

GONE = 999_999


class WaitingFixture(BrainFixture):
    def proposal(self, customer=None, *, kind="task", session=None, title="Save play", **extra):
        """A waiting proposal. A task names `customer` (or `customer_id`,
        for one that no longer exists); an initiative names a metric."""
        if kind == Proposal.Kind.TASK:
            customer_id = extra.get("customer_id", customer.id if customer else None)
            action = {
                "customer_id": customer_id,
                "customer_name": customer.name if customer else "Gone Ltd",
                "title": title,
                "assignee_name": "Carl CSM",
                "due_date": (self.today + timedelta(days=7)).isoformat(),
                "priority": "high",
            }
        else:
            action = {
                "metric": "at_risk_arr",
                "metric_label": "ARR at risk",
                "dimension": "",
                "member": "",
                "member_label": "",
                "target_value": 1000.0,
                "target_by": (self.today + timedelta(days=60)).isoformat(),
            }
        return Proposal.objects.create(
            organisation=self.org,
            batch="b1",
            kind=kind,
            title=title,
            rationale="Because the figures say so.",
            evidence=["Pizza Hut: USD 300,000"],
            action=action,
            session=session,
        )

    def session(self, owner, *members, title="What do we do about Pizza Hut?"):
        """A live session `owner` started; each member accepted the owner's
        invite and is present."""
        conversation = Conversation.objects.create(organisation=self.org, user=owner, title=title)
        session = CopilotSession.objects.create(
            conversation=conversation, status=CopilotSession.Status.LIVE
        )
        SessionParticipant.objects.create(session=session, user=owner)
        for member in members:
            SessionInvite.objects.create(
                session=session,
                invited_user=member,
                invited_by=owner,
                status=SessionInvite.Status.ACCEPTED,
            )
            SessionParticipant.objects.create(session=session, user=member)
        return session
```

- [ ] **Step 2: Write the failing tests**

`services/brain/tests/test_deciding.py`:

```python
"""Who may decide an Ops-agent proposal (spec §1.2), and the decision
route that asks it."""

from core.models import AuditEvent
from services.brain.tests.waiting_fixtures import GONE, WaitingFixture
from services.brain.waiting import can_decide, decided_as
from services.customers.models import Task
from services.metrics.models import Proposal


def url(proposal, decision="approve"):
    return f"/api/v1/metrics/proposals/{proposal.id}/{decision}/"


class DecidedAsTests(WaitingFixture):
    def test_a_task_proposal_is_the_owners_their_chains_and_view_all(self):
        p = self.proposal(self.pizza)
        self.assertEqual(decided_as(self.csm, p), "owner")
        self.assertEqual(decided_as(self.mona, p), "chain")
        self.assertEqual(decided_as(self.admin, p), "company")
        self.assertIsNone(decided_as(self.other, p))
        self.assertIsNone(decided_as(self.lee, p))

    def test_an_initiative_is_view_all_only(self):
        p = self.proposal(kind="initiative")
        self.assertEqual(decided_as(self.admin, p), "company")
        for reader in (self.csm, self.mona, self.lee):
            self.assertFalse(can_decide(reader, p))

    def test_unowned_and_gone_customers_are_view_all_only(self):
        for p in (self.proposal(self.loose), self.proposal(customer_id=GONE)):
            self.assertEqual(decided_as(self.admin, p), "company")
            self.assertFalse(can_decide(self.mona, p))

    def test_a_known_owner_skips_the_lookup(self):
        p = self.proposal(self.pizza)
        with self.assertNumQueries(0):
            self.assertEqual(decided_as(self.csm, p, owner_id=self.csm.id), "owner")


class DecisionRouteTests(WaitingFixture):
    def test_a_csm_approves_a_proposal_on_their_own_customer(self):
        p = self.proposal(self.pizza)
        response = self.as_user(self.csm).post(url(p), {"note": "On it"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["proposal"]["status"], "approved")
        self.assertTrue(Task.objects.filter(customer=self.pizza, title="Save play").exists())
        event = AuditEvent.objects.get(action="proposal.approved")
        self.assertEqual(event.actor, self.csm)
        self.assertEqual(event.metadata, {"kind": "task", "decided_as": "owner"})
        self.assertEqual(event.target_repr, f"Proposal {p.id}")

    def test_a_manager_rejects_a_reports_proposal(self):
        p = self.proposal(self.pizza)
        response = self.as_user(self.mona).post(url(p, "reject"), {}, format="json")
        self.assertEqual(response.status_code, 200)
        event = AuditEvent.objects.get(action="proposal.rejected")
        self.assertEqual(event.metadata["decided_as"], "chain")

    def test_anyone_else_is_refused_and_nothing_changes(self):
        p = self.proposal(self.pizza)
        response = self.as_user(self.other).post(url(p))
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json(), {"detail": "You can't decide this proposal."})
        p.refresh_from_db()
        self.assertEqual(p.status, Proposal.Status.PROPOSED)
        self.assertFalse(AuditEvent.objects.filter(action__startswith="proposal.").exists())

    def test_a_csm_cannot_decide_an_initiative(self):
        p = self.proposal(kind="initiative")
        self.assertEqual(self.as_user(self.csm).post(url(p)).status_code, 403)

    def test_403_comes_before_409_and_404_before_403(self):
        p = self.proposal(self.pizza)
        self.assertEqual(self.as_user(self.csm).post(url(p)).status_code, 200)
        self.assertEqual(self.as_user(self.other).post(url(p)).status_code, 403)
        self.assertEqual(self.as_user(self.admin).post(url(p, "reject")).status_code, 409)
        self.assertEqual(self.as_user(self.stranger).post(url(p)).status_code, 404)

    def test_a_gone_customer_is_a_409_not_a_500(self):
        p = self.proposal(customer_id=GONE)
        response = self.as_user(self.admin).post(url(p))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json(), {"detail": "This proposal's customer no longer exists."})
        self.assertFalse(Task.objects.exists())
        self.assertEqual(self.as_user(self.admin).post(url(p, "reject")).status_code, 200)

    def test_the_session_title_is_neutral_for_an_owner_outside_the_session(self):
        session = self.session(self.other, title="Dana's private thoughts")
        mine = self.proposal(self.pizza, session=session)
        body = self.as_user(self.csm).post(url(mine)).json()["proposal"]
        self.assertEqual(body["source"]["title"], "Shared conversation")
        theirs = self.proposal(self.dough, session=session)
        body = self.as_user(self.admin).post(url(theirs)).json()["proposal"]
        self.assertEqual(body["source"]["title"], "Dana's private thoughts")

    def test_a_participant_owner_reads_the_real_title(self):
        session = self.session(self.other, self.csm, title="Pizza plan")
        p = self.proposal(self.pizza, session=session)
        body = self.as_user(self.csm).post(url(p)).json()["proposal"]
        self.assertEqual(body["source"]["title"], "Pizza plan")
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.brain.tests.test_deciding --parallel --noinput`
Expected: FAIL. The import of `services.brain.waiting` fails (`ModuleNotFoundError`).

- [ ] **Step 4: Write the rule**

`services/brain/waiting.py`:

```python
"""Waiting on you: what waits for a person's decision or answer, and what
waits on the people under them (spec: react-ts-app
docs/superpowers/specs/2026-10-05-brain-waiting-design.md §1).

`decided_as` is the one rule for who may decide an Ops-agent proposal.
`ProposalDecisionView` asks it before deciding, and every proposal item's
`can_decide` asks it too, so the page offers exactly what the route allows.
"""

from services.accounts.hierarchy import subtree_ids
from services.customers.models import Customer
from services.customers.scoping import sees_everything
from services.metrics.models import Proposal

OWNER, CHAIN, COMPANY_DECIDER = "owner", "chain", "company"
_LOOKUP = object()


def customer_owner_id(proposal):
    """The owner of the customer a task proposal names. None when the
    customer has no owner or no longer exists, and for an initiative."""
    if proposal.kind != Proposal.Kind.TASK:
        return None
    return (
        Customer.objects.filter(
            organisation_id=proposal.organisation_id, pk=proposal.action.get("customer_id")
        )
        .values_list("owner_id", flat=True)
        .first()
    )


def decided_as(reader, proposal, *, owner_id=_LOOKUP):
    """How `reader` may decide `proposal`: "owner", "chain", "company", or
    None if they may not. Pass `owner_id` when the caller already knows the
    customer's owner (None for unowned or gone) to skip the lookup."""
    # SOC2:AUTH-02 a task proposal is decided by its customer's owner, anyone
    # above that owner, or view_all_accounts; an initiative only by view_all_accounts
    if proposal.kind == Proposal.Kind.TASK:
        if owner_id is _LOOKUP:
            owner_id = customer_owner_id(proposal)
        if owner_id is not None:
            if owner_id == reader.id:
                return OWNER
            if owner_id in subtree_ids(reader):
                return CHAIN
    if sees_everything(reader):
        return COMPANY_DECIDER
    return None


def can_decide(reader, proposal, *, owner_id=_LOOKUP):
    return decided_as(reader, proposal, owner_id=owner_id) is not None
```

- [ ] **Step 5: Move the decision route onto the rule**

In `services/metrics/views.py`, replace the whole `ProposalDecisionView` class with:

```python
CANT_DECIDE = "You can't decide this proposal."
CUSTOMER_GONE = "This proposal's customer no longer exists."


class ProposalDecisionView(views.APIView):
    """POST /api/v1/metrics/proposals/<id>/approve/ and .../reject/: a
    person's decision. Approving executes the action through the same path
    they would use by hand and records what it created. A proposal is
    decided once.

    Who may decide is `services.brain.waiting.decided_as`: a task proposal
    by its customer's owner, anyone above the owner, or view_all_accounts;
    an initiative by view_all_accounts. 404 for a proposal outside the
    caller's organisation, then 403, then 409 once decided, so someone who
    may not decide can't learn a proposal's state."""

    # SOC2:AUTH-02 authentication here; `decided_as` below is the decision check
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, decision):
        from django.shortcuts import get_object_or_404

        from services.brain.waiting import COMPANY_DECIDER, decided_as
        from services.copilot.views import NEUTRAL_TITLE, sees_whole_conversation
        from services.customers.models import Customer

        from .models import Proposal
        from .proposals import AlreadyDecided, approve, reject

        proposal = get_object_or_404(
            Proposal.objects.select_related("session__conversation"),
            organisation=request.user.organisation,
            pk=pk,
        )
        role = decided_as(request.user, proposal)
        # SOC2:AUTH-02 refused before anything about the proposal changes
        if role is None:
            return Response({"detail": CANT_DECIDE}, status=status.HTTP_403_FORBIDDEN)
        note = str(request.data.get("note") or "")
        try:
            if decision == "approve":
                approve(proposal, request.user, note)
            else:
                reject(proposal, request.user, note)
        except AlreadyDecided as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        except Customer.DoesNotExist:
            return Response({"detail": CUSTOMER_GONE}, status=status.HTTP_409_CONFLICT)
        audit.record(
            f"proposal.{proposal.status}",
            request=request,
            target=proposal,
            target_repr=f"Proposal {proposal.pk}",
            metadata={"kind": proposal.kind, "decided_as": role},
        )
        payload = _proposal_payload(proposal)
        if (
            payload["source"]
            and role != COMPANY_DECIDER
            and not sees_whole_conversation(proposal.session.conversation, request.user)
        ):
            # SOC2:AUTH-02 a conversation's title is for those who see it whole
            payload["source"]["title"] = NEUTRAL_TITLE
        return Response({"proposal": payload})
```

`status`, `IsAuthenticated` and `audit` are already imported at the top of the module. `ProposalListView` and `ProposalGenerateView` keep `CanViewAllAccounts`, and `CanViewAllAccounts` stays imported because they use it.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.brain.tests.test_deciding services.metrics.tests.test_proposals services.metrics.tests.test_facilitator --parallel --noinput`
Expected: PASS. The existing proposal and facilitator tests stay green, and `test_a_csm_is_refused` still covers `GET /metrics/proposals/`.

- [ ] **Step 7: Lint and commit**

```bash
venv/bin/ruff format services/brain services/metrics/views.py
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/brain/waiting.py services/brain/tests/waiting_fixtures.py services/brain/tests/test_deciding.py services/metrics/views.py
git commit -m "$(cat <<'EOF'
feat(brain): a task proposal is decided by its owner, their chain or view-all

ProposalDecisionView asks brain.waiting.decided_as instead of
CanViewAllAccounts: 404, then 403 "You can't decide this proposal.", then
409. Decisions are audited as proposal.approved/rejected with decided_as;
a gone customer is a 409, not a 500.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The desk (what waits, what the reader may open) and the badge count

**Files:**
- Create: `services/brain/desk.py`
- Modify: `services/brain/waiting.py` (append `count`)
- Modify: `services/brain/tests/waiting_fixtures.py` (append makers)
- Create: `services/brain/tests/test_desk.py`

**Interfaces:**
- Consumes: `Scope` from `services.brain.scope.resolve(reader, key)` (`.key`, `.owner_ids` frozenset or None for Company, `.is_company`), `ME`, `TEAM`, `COMPANY`; `WaitingFixture.proposal` / `.session` (Task 1).
- Produces:
  - `services.brain.desk.KINDS = ("rule_review", "proposal", "question", "overdue_task")`
  - `Source(kind: str, waiting: QuerySet, readable: QuerySet)` (frozen dataclass)
  - `session_ids_seen_whole(reader) -> frozenset[int]`
  - `rule_reviews(reader, scope) -> Source`, `proposals(reader, scope, sessions) -> Source`, `questions(reader, scope) -> Source`, `overdue_tasks(reader, scope, today) -> Source`
  - `sources(reader, scope, today, sessions) -> list[Source]` (in `KINDS` order)
  - `services.brain.waiting.count(reader, today) -> int`
  - Fixture makers `review(owner, *, name=..., kind="survey", sharing=Rule.Sharing.PRIVATE, counts=None)`, `question(assignee, *, customer=None, asked_by=None, text=...)`, `task(assignee, *, customer=None, account=None, overdue_by=1, status=..., created_by=None, title=...)`

- [ ] **Step 1: Add the makers to the fixture**

Replace `services/brain/tests/waiting_fixtures.py` with the version below. It is Task 1's file plus the imports and three makers:

```python
"""Waiting on you: BrainFixture's people and book, plus makers for the
four kinds of waiting item. Carl (CSM) reports to Mona; Dana is nobody's;
Alice has view_all_accounts; Lee reads Company through Leadership only."""

from datetime import timedelta

from django.utils import timezone

from services.brain.tests.fixtures import BrainFixture
from services.copilot.models import (
    Conversation,
    CopilotSession,
    SessionInvite,
    SessionParticipant,
)
from services.customers.models import Task
from services.knowledge.models import Question
from services.metrics.models import Proposal
from services.rules.models import Rule, RuleReview, RuleRun
from services.rules.tests.fixtures import SURVEY

GONE = 999_999


class WaitingFixture(BrainFixture):
    def proposal(self, customer=None, *, kind="task", session=None, title="Save play", **extra):
        """A waiting proposal. A task names `customer` (or `customer_id`,
        for one that no longer exists); an initiative names a metric."""
        if kind == Proposal.Kind.TASK:
            customer_id = extra.get("customer_id", customer.id if customer else None)
            action = {
                "customer_id": customer_id,
                "customer_name": customer.name if customer else "Gone Ltd",
                "title": title,
                "assignee_name": "Carl CSM",
                "due_date": (self.today + timedelta(days=7)).isoformat(),
                "priority": "high",
            }
        else:
            action = {
                "metric": "at_risk_arr",
                "metric_label": "ARR at risk",
                "dimension": "",
                "member": "",
                "member_label": "",
                "target_value": 1000.0,
                "target_by": (self.today + timedelta(days=60)).isoformat(),
            }
        return Proposal.objects.create(
            organisation=self.org,
            batch="b1",
            kind=kind,
            title=title,
            rationale="Because the figures say so.",
            evidence=["Pizza Hut: USD 300,000"],
            action=action,
            session=session,
        )

    def session(self, owner, *members, title="What do we do about Pizza Hut?"):
        """A live session `owner` started; each member accepted the owner's
        invite and is present."""
        conversation = Conversation.objects.create(organisation=self.org, user=owner, title=title)
        session = CopilotSession.objects.create(
            conversation=conversation, status=CopilotSession.Status.LIVE
        )
        SessionParticipant.objects.create(session=session, user=owner)
        for member in members:
            SessionInvite.objects.create(
                session=session,
                invited_user=member,
                invited_by=owner,
                status=SessionInvite.Status.ACCEPTED,
            )
            SessionParticipant.objects.create(session=session, user=member)
        return session

    def review(
        self, owner, *, name="Detractor follow-up", kind="survey", sharing="private", counts=None
    ):
        """A waiting rule review on a fresh rule of `owner`'s."""
        rule = Rule.objects.create(
            organisation=self.org, owner=owner, name=name, trigger="entered", sharing=sharing
        )
        run = RuleRun.objects.create(rule=rule, run_on=self.today, started_at=timezone.now())
        action = SURVEY if kind == "survey" else {"action": "campaign", "campaign": 1}
        return RuleReview.objects.create(
            rule=rule,
            run=run,
            kind=kind,
            action=action,
            records=[],
            counts=counts if counts is not None else {"people": 12, "records": 3},
        )

    def question(self, assignee, *, customer=None, asked_by=None, text="Who signs off renewals?"):
        return Question.objects.create(
            organisation=self.org,
            customer=customer,
            asked_by=asked_by or self.admin,
            assignee=assignee,
            text=text,
        )

    def task(
        self,
        assignee,
        *,
        customer=None,
        account=None,
        overdue_by=1,
        status=Task.Status.PENDING,
        created_by=None,
        title="Call the exec sponsor",
    ):
        """A task due `overdue_by` days ago (0 = due today, not overdue)."""
        return Task.objects.create(
            customer=customer,
            account=account,
            title=title,
            assignee_name=assignee.name,
            assignee=assignee,
            created_by=created_by,
            due_date=self.today - timedelta(days=overdue_by),
            priority=Task.Priority.HIGH,
            status=status,
        )
```

- [ ] **Step 2: Write the failing tests**

`services/brain/tests/test_desk.py`:

```python
"""The desk (spec §1.1): per kind, what waits on the scope's people and
the part the reader may open. The difference is `hidden`."""

from datetime import timedelta

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.brain import desk
from services.brain.scope import COMPANY, ME, TEAM, resolve
from services.brain.tests.waiting_fixtures import GONE, WaitingFixture
from services.brain.waiting import count
from services.customers.models import Task


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
        self.assertEqual(ids(self.source(self.csm, ME, "proposal").readable), {pizza.id})
        self.assertEqual(ids(self.source(self.mona, TEAM, "proposal").readable), {pizza.id})
        self.assertEqual(ids(self.source(self.other, ME, "proposal").readable), {taco.id})

    def test_unowned_gone_and_initiatives_wait_on_company_only(self):
        loose = self.proposal(self.loose)
        gone = self.proposal(customer_id=GONE)
        initiative = self.proposal(kind="initiative")
        self.assertFalse(self.source(self.mona, TEAM, "proposal").waiting.exists())
        company = self.source(self.admin, COMPANY, "proposal")
        self.assertEqual(ids(company.readable), {loose.id, gone.id, initiative.id})

    def test_company_without_view_all_hides_what_it_cannot_open(self):
        taco = self.proposal(self.taco)
        gone = self.proposal(customer_id=GONE)
        initiative = self.proposal(kind="initiative")
        lee = self.source(self.lee, COMPANY, "proposal")
        self.assertEqual(ids(lee.waiting), {taco.id, gone.id, initiative.id})
        self.assertEqual(ids(lee.readable), {initiative.id})

    def test_session_proposals_reach_participants_in_me_twice_filtered(self):
        # Carl opens Taco Bell through his Taco East account, so the hidden
        # one names Soup Co: Mona's, above him.
        session = self.session(self.other, self.csm)
        initiative = self.proposal(kind="initiative", session=session)
        soup = self.proposal(self.soup, session=session)
        carl = self.source(self.csm, ME, "proposal")
        self.assertEqual(ids(carl.waiting), {initiative.id, soup.id})
        self.assertEqual(ids(carl.readable), {initiative.id})
        # Mona is not in the session: only her own customer's proposal is hers.
        self.assertEqual(ids(self.source(self.mona, ME, "proposal").waiting), {soup.id})

    def test_a_participant_who_left_or_was_never_accepted_does_not_see_it(self):
        session = self.session(self.other, self.csm)
        session.participants.filter(user=self.csm).update(left_at=session.created_at)
        self.proposal(kind="initiative", session=session)
        self.assertFalse(self.source(self.csm, ME, "proposal").waiting.exists())


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

    def test_view_all_reads_tasks_through_the_chain_rule_only(self):
        self.task(self.other, customer=self.taco, created_by=self.other)
        company = self.source(self.admin, COMPANY, "overdue_task")
        self.assertEqual(company.waiting.count(), 1)
        self.assertEqual(company.readable.count(), 0)


class CountTests(DeskFixture):
    def test_the_badge_counts_the_me_desks_readable_items(self):
        self.review(self.csm)
        self.proposal(self.pizza)
        self.question(self.csm, customer=self.pizza)
        self.task(self.csm, customer=self.pizza)
        self.task(self.csm, account=self.west)  # hidden: not counted
        self.proposal(self.taco)  # Dana's
        self.assertEqual(count(self.csm, self.today), 4)
        self.assertEqual(count(self.other, self.today), 1)
        self.assertEqual(count(self.stranger, self.today), 0)

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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.brain.tests.test_desk --parallel --noinput`
Expected: FAIL with `ImportError: cannot import name 'desk' from 'services.brain'`.

- [ ] **Step 4: Write the desk**

`services/brain/desk.py`:

```python
"""The desk: for each kind of waiting item, everything waiting on the
scope's people (`waiting`) and the part of it the reader may open
(`readable`). `waiting` minus `readable` is the page's `hidden` count.

Whose desk: Me is the reader, My team is the reader and everyone below
them (the scope's `owner_ids`), and Company is everyone (`owner_ids` is
None). Inside it, every item is filtered by the reader's own rights,
never the scope's, because the reader is the one shown it.

One `id IN (subquery)` per way in, never a join de-duplicated with
DISTINCT: Postgres 16 plans that badly (services.customers.scoping).
A test checks every query here for DISTINCT."""

from dataclasses import dataclass

from django.db.models import IntegerField, Q
from django.db.models.fields.json import KT
from django.db.models.functions import Cast

from .scope import ME

KINDS = ("rule_review", "proposal", "question", "overdue_task")


@dataclass(frozen=True)
class Source:
    kind: str
    waiting: object
    readable: object


def _owners(scope):
    """The desk's people, or None for Company (everyone)."""
    return None if scope.is_company else sorted(scope.owner_ids)


def rule_reviews(reader, scope):
    from services.rules.access import readable_rules
    from services.rules.models import RuleReview

    waiting = RuleReview.objects.filter(
        status=RuleReview.Status.WAITING, rule__organisation_id=reader.organisation_id
    )
    owners = _owners(scope)
    if owners is not None:
        waiting = waiting.filter(rule__owner_id__in=owners)
    # SOC2:AUTH-02 a review is shown only on a rule the reader may read
    readable = waiting.filter(rule_id__in=readable_rules(reader).values("id"))
    return Source("rule_review", waiting, readable)


def session_ids_seen_whole(reader):
    """The sessions with a waiting proposal whose whole conversation
    `reader` sees: the owner, or a present participant whose accepted invite
    chains back to the owner (copilot.views.sees_whole_conversation)."""
    from services.copilot.models import CopilotSession
    from services.copilot.views import sees_whole_conversation
    from services.metrics.models import Proposal

    sessions = CopilotSession.objects.filter(
        id__in=Proposal.objects.filter(
            organisation_id=reader.organisation_id,
            status=Proposal.Status.PROPOSED,
            session__isnull=False,
        ).values("session_id")
    ).select_related("conversation")
    return frozenset(s.id for s in sessions if sees_whole_conversation(s.conversation, reader))


def proposals(reader, scope, sessions):
    """Task proposals wait on the named customer's owner. Unowned or gone
    customers and initiatives wait on Company. In Me, so do proposals from a
    session the reader took part in (`sessions`), whatever they name."""
    from services.customers.models import Customer
    from services.customers.scoping import sees_everything, visible_customers
    from services.metrics.models import Proposal

    base = Proposal.objects.filter(
        organisation_id=reader.organisation_id, status=Proposal.Status.PROPOSED
    ).annotate(customer_ref=Cast(KT("action__customer_id"), IntegerField()))
    owners = _owners(scope)
    if owners is None:
        waiting = base
    else:
        owned = Customer.objects.filter(
            organisation_id=reader.organisation_id, owner_id__in=owners
        ).values("id")
        on_desk = Q(kind=Proposal.Kind.TASK, customer_ref__in=owned)
        if scope.key == ME and sessions:
            on_desk |= Q(session_id__in=sorted(sessions))
        waiting = base.filter(on_desk)
    if sees_everything(reader):
        readable = waiting
    else:
        # SOC2:AUTH-02 a task proposal names a customer: shown only if the
        # reader may open it
        readable = waiting.filter(
            Q(kind=Proposal.Kind.INITIATIVE)
            | Q(customer_ref__in=visible_customers(reader).values("id"))
        )
    return Source("proposal", waiting, readable)


def questions(reader, scope):
    from services.accounts.hierarchy import scope_ids, subtree_ids
    from services.customers.models import Customer
    from services.customers.scoping import visible_customers
    from services.knowledge.models import FunctionOwner, Question

    waiting = Question.objects.filter(
        organisation_id=reader.organisation_id, status=Question.Status.OPEN
    )
    owners = _owners(scope)
    if owners is not None:
        waiting = waiting.filter(assignee_id__in=owners)
    responsible = Customer.objects.filter(
        organisation_id=reader.organisation_id, owner_id=reader.id
    ).values("id")
    # SOC2:AUTH-02 knowledge.views.visible_questions' rule as id-IN filters,
    # and the customer it names must be one the reader may open
    readable = waiting.filter(
        Q(asked_by_id__in=sorted(scope_ids(reader)))
        | Q(assignee_id__in=sorted({reader.id, *subtree_ids(reader)}))
        | Q(customer_id__in=responsible)
        | Q(customer_id__in=FunctionOwner.objects.filter(user_id=reader.id).values("customer_id"))
    ).filter(
        Q(customer_id__isnull=True) | Q(customer_id__in=visible_customers(reader).values("id"))
    )
    return Source("question", waiting, readable)


def overdue_tasks(reader, scope, today):
    from services.customers.models import Task
    from services.customers.personal import visible_tasks
    from services.customers.scoping import visible_accounts, visible_customers

    waiting = Task.objects.filter(
        assignee__organisation_id=reader.organisation_id, due_date__lt=today
    ).exclude(status=Task.Status.COMPLETED)
    owners = _owners(scope)
    if owners is not None:
        waiting = waiting.filter(assignee_id__in=owners)
    # SOC2:AUTH-02 a task is read by its chain rule, on a record the reader may open
    readable = visible_tasks(reader, waiting).filter(
        Q(customer_id__in=visible_customers(reader).values("id"))
        | Q(account_id__in=visible_accounts(reader).values("id"))
    )
    return Source("overdue_task", waiting, readable)


def sources(reader, scope, today, sessions):
    """The four sources in `KINDS` order. `sessions` is
    `session_ids_seen_whole(reader)`; it widens only the Me desk."""
    return [
        rule_reviews(reader, scope),
        proposals(reader, scope, sessions),
        questions(reader, scope),
        overdue_tasks(reader, scope, today),
    ]
```

- [ ] **Step 5: Add the count**

Append to `services/brain/waiting.py`:

```python
def count(reader, today):
    """The badge: how many items on the reader's Me desk they may open.
    Counts only, no rows."""
    from . import desk
    from .scope import ME, resolve

    scope = resolve(reader, ME)
    sessions = desk.session_ids_seen_whole(reader)
    return sum(source.readable.count() for source in desk.sources(reader, scope, today, sessions))
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.brain.tests.test_desk services.brain.tests.test_deciding --parallel --noinput`
Expected: PASS. If `test_no_distinct_in_any_desk_query` fails, fix the query that uses DISTINCT. Don't relax the test.

- [ ] **Step 7: Lint and commit**

```bash
venv/bin/ruff format services/brain services/metrics/views.py
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/brain/desk.py services/brain/waiting.py services/brain/tests/waiting_fixtures.py services/brain/tests/test_desk.py
git commit -m "$(cat <<'EOF'
feat(brain): the desk, what waits on a scope's people and what the reader may open

Rule reviews, proposals (owner's desk, Company for unowned, gone and
initiatives, Me for session participants), open questions and overdue
tasks, each twice-filtered by the reader's own rules as id-IN subqueries,
plus the Me count for the badge.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The items (`waiting.build`)

**Files:**
- Modify: `services/brain/waiting.py` (append the builders)
- Create: `services/brain/tests/test_waiting.py`

**Interfaces:**
- Consumes: `desk.KINDS`, `desk.sources(reader, scope, today, sessions)`, `desk.session_ids_seen_whole(reader)`, `Source.readable/.waiting` (Task 2); `can_decide(reader, proposal, *, owner_id=...)` (Task 1); `services.rules.payloads.review_payload(review, campaigns)` and `review_campaign_names(reviews)`; `services.copilot.views.NEUTRAL_TITLE`.
- Produces: `services.brain.waiting.LIMIT = 200`; `build(reader, scope, today) -> {"scope", "counts", "hidden", "items"}` in the §3 shape plus `detail.review` on rule reviews (Contract note 2).

- [ ] **Step 1: Write the failing tests**

`services/brain/tests/test_waiting.py`:

```python
"""Waiting on you's items (spec §1.1, §3): shape per kind, order, cap,
counts and hidden."""

from datetime import timedelta
from unittest import mock

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.brain.scope import COMPANY, ME, TEAM, resolve
from services.brain.tests.waiting_fixtures import GONE, WaitingFixture
from services.brain.waiting import build
from services.metrics.models import Proposal
from services.rules.models import RuleReview


class BuildFixture(WaitingFixture):
    def build(self, reader, key):
        return build(reader, resolve(reader, key), self.today)

    def aged(self, row, days):
        type(row).objects.filter(pk=row.pk).update(created_at=timezone.now() - timedelta(days=days))


class ItemShapeTests(BuildFixture):
    def test_carls_me_desk_names_every_kind(self):
        review = self.review(self.csm)
        proposal = self.proposal(self.pizza, title="Review Pizza Hut renewal pricing")
        question = self.question(self.csm, customer=self.pizza, text="Who signs off?")
        task = self.task(self.csm, account=self.emea, overdue_by=3)
        self.aged(review, 1)
        self.aged(proposal, 2)
        self.aged(question, 1)

        body = self.build(self.csm, ME)

        self.assertEqual(body["scope"], "me")
        self.assertEqual(
            body["counts"], {"rule_review": 1, "proposal": 1, "question": 1, "overdue_task": 1}
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

        p = by_kind["proposal"]
        self.assertEqual(p["title"], "Review Pizza Hut renewal pricing")
        self.assertEqual(
            p["record"], {"type": "customer", "id": self.pizza.id, "name": "Pizza Hut"}
        )
        self.assertEqual(p["waiting_on"], carl)
        self.assertTrue(p["can_decide"])
        self.assertEqual(
            p["detail"],
            {
                "proposal_kind": "task",
                "action": proposal.action,
                "evidence": ["Pizza Hut: USD 300,000"],
                "session": None,
            },
        )

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
            ["overdue_task", "proposal", "rule_review", "question"],
        )

    def test_my_team_names_who_it_waits_on_and_who_may_act(self):
        self.proposal(self.pizza)
        self.question(self.csm, customer=self.pizza)
        review = self.review(self.csm, sharing="workspace")
        items = {i["kind"]: i for i in self.build(self.mona, TEAM)["items"]}
        carl = {"id": self.csm.id, "name": "Carl CSM"}
        for kind in ("proposal", "question", "rule_review"):
            self.assertEqual(items[kind]["waiting_on"], carl)
        self.assertTrue(items["proposal"]["can_decide"])
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
            sorted(i["detail"]["proposal_kind"] for i in items), ["initiative", "task", "task"]
        )

    def test_a_campaign_review_is_titled_as_one(self):
        self.review(self.csm, kind="campaign", counts={"reach": 4, "skipped": 1})
        (item,) = self.build(self.csm, ME)["items"]
        self.assertEqual(item["title"], "Campaign from Detractor follow-up")
        self.assertEqual(item["detail"]["counts"], {"reach": 4, "skipped": 1})


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
        (item,) = self.build(self.other, ME)["items"]
        self.assertFalse(item["can_decide"])
        self.assertIsNone(item["waiting_on"])


class HiddenAndCapTests(BuildFixture):
    def test_unopenable_items_are_counted_not_named(self):
        self.task(self.csm, account=self.west)
        session = self.session(self.other, self.csm)
        self.proposal(self.soup, session=session)
        body = self.build(self.csm, ME)
        self.assertEqual(body["items"], [])
        self.assertEqual(body["hidden"], 2)
        self.assertEqual(
            body["counts"], {"rule_review": 0, "proposal": 0, "question": 0, "overdue_task": 0}
        )

    def test_the_list_is_capped_oldest_first_and_counts_stay_whole(self):
        oldest = self.task(self.csm, customer=self.pizza, overdue_by=9)
        older = self.task(self.csm, customer=self.pizza, overdue_by=5)
        self.task(self.csm, customer=self.pizza, overdue_by=1)
        with mock.patch("services.brain.waiting.LIMIT", 2):
            body = self.build(self.csm, ME)
        self.assertEqual([i["id"] for i in body["items"]], [oldest.id, older.id])
        self.assertEqual(body["counts"]["overdue_task"], 3)

    def test_decided_things_leave_the_list(self):
        p = self.proposal(self.pizza)
        Proposal.objects.filter(pk=p.pk).update(status=Proposal.Status.REJECTED)
        r = self.review(self.csm)
        RuleReview.objects.filter(pk=r.pk).update(status=RuleReview.Status.SKIPPED)
        self.assertEqual(self.build(self.csm, ME)["items"], [])

    def test_bounded_queries_and_no_distinct(self):
        for _ in range(3):
            self.review(self.csm)
            self.proposal(self.pizza)
            self.question(self.csm, customer=self.pizza)
            self.task(self.csm, customer=self.pizza)
        with CaptureQueriesContext(connection) as queries:
            self.build(self.mona, TEAM)
        self.assertLessEqual(len(queries), 30)
        for query in queries.captured_queries:
            self.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.brain.tests.test_waiting --parallel --noinput`
Expected: FAIL with `ImportError: cannot import name 'build' from 'services.brain.waiting'`.

- [ ] **Step 3: Write the builders**

Add to the top-level imports of `services/brain/waiting.py`:

```python
from datetime import datetime, time

from django.utils import timezone
```

Append to `services/brain/waiting.py`:

```python
#: Most items a list carries; `counts` stay the full totals.
LIMIT = 200
QUESTION_TITLE = 200


def _person(user):
    return {"id": user.id, "name": user.name} if user is not None else None


def _record(kind, row):
    return {"type": kind, "id": row.id, "name": row.name}


def _day_start(day):
    return timezone.make_aware(datetime.combine(day, time.min))


def _rule_review_rows(reader, readable):
    from services.rules.payloads import review_campaign_names, review_payload

    reviews = list(
        readable.select_related(
            "rule__owner", "rule__segment", "rule__organisation", "run"
        ).order_by("created_at", "id")[:LIMIT]
    )
    names = review_campaign_names([r for r in reviews if r.rule.owner_id == reader.id])
    rows = []
    for review in reviews:
        # SOC2:AUTH-02 only the rule's owner decides its review, and only they
        # read the review itself (ReviewListView's rule)
        mine = review.rule.owner_id == reader.id
        rows.append(
            (
                review.created_at,
                {
                    "kind": "rule_review",
                    "id": review.pk,
                    "title": f"{review.get_kind_display()} from {review.rule.name}",
                    "since": review.created_at.isoformat(),
                    "waiting_on": _person(review.rule.owner),
                    "record": None,
                    "can_decide": mine,
                    "detail": {
                        "rule_id": review.rule_id,
                        "rule_name": review.rule.name,
                        "review_kind": review.kind,
                        "counts": review.counts,
                        "review": review_payload(review, names) if mine else None,
                    },
                },
            )
        )
    return rows


def _proposal_rows(reader, readable, sessions):
    from services.copilot.views import NEUTRAL_TITLE

    proposals = list(
        readable.select_related("session__conversation").order_by("created_at", "id")[:LIMIT]
    )
    wanted = {
        p.action.get("customer_id")
        for p in proposals
        if p.kind == Proposal.Kind.TASK and isinstance(p.action.get("customer_id"), int)
    }
    customers = {
        c.id: c
        for c in Customer.objects.filter(
            organisation_id=reader.organisation_id, id__in=sorted(wanted)
        ).select_related("owner")
    }
    rows = []
    for p in proposals:
        customer = (
            customers.get(p.action.get("customer_id")) if p.kind == Proposal.Kind.TASK else None
        )
        owner = customer.owner if customer is not None else None
        session = None
        if p.session_id:
            # SOC2:AUTH-02 a conversation's title is for those who see it whole
            title = p.session.conversation.title if p.session_id in sessions else NEUTRAL_TITLE
            session = {"id": p.session_id, "title": title}
        rows.append(
            (
                p.created_at,
                {
                    "kind": "proposal",
                    "id": p.pk,
                    "title": p.title,
                    "since": p.created_at.isoformat(),
                    "waiting_on": _person(owner),
                    "record": _record("customer", customer) if customer is not None else None,
                    "can_decide": can_decide(
                        reader, p, owner_id=owner.id if owner is not None else None
                    ),
                    "detail": {
                        "proposal_kind": p.kind,
                        "action": p.action,
                        "evidence": p.evidence,
                        "session": session,
                    },
                },
            )
        )
    return rows


def _question_rows(reader, readable):
    questions = list(
        readable.select_related("assignee", "asked_by", "customer").order_by("created_at", "id")[
            :LIMIT
        ]
    )
    # SOC2:AUTH-02 QuestionAnswerView's rule: the person asked, or manage_users
    answers_any = reader.has_capability("manage_users")
    return [
        (
            q.created_at,
            {
                "kind": "question",
                "id": q.pk,
                "title": q.text[:QUESTION_TITLE],
                "since": q.created_at.isoformat(),
                "waiting_on": _person(q.assignee),
                "record": _record("customer", q.customer) if q.customer_id else None,
                "can_decide": q.assignee_id == reader.id or answers_any,
                "detail": {"asked_by": q.asked_by.name},
            },
        )
        for q in questions
    ]


def _task_rows(readable):
    tasks = list(
        readable.select_related("assignee", "customer", "account").order_by("due_date", "id")[
            :LIMIT
        ]
    )
    return [
        (
            _day_start(t.due_date),
            {
                "kind": "overdue_task",
                "id": t.pk,
                "title": t.title,
                "since": t.due_date.isoformat(),
                "waiting_on": _person(t.assignee),
                "record": (
                    _record("customer", t.customer)
                    if t.customer_id
                    else _record("account", t.account)
                ),
                # A task the reader may read is one they may open.
                "can_decide": True,
                "detail": {"due_date": t.due_date.isoformat(), "priority": t.priority},
            },
        )
        for t in tasks
    ]


def build(reader, scope, today):
    """The scope's waiting items `reader` may open, oldest first and capped
    at LIMIT; `counts` per kind are the full readable totals, and `hidden`
    is how many more wait on the desk about records the reader can't open."""
    from . import desk

    order = {kind: i for i, kind in enumerate(desk.KINDS)}
    sessions = desk.session_ids_seen_whole(reader)
    found = {s.kind: s for s in desk.sources(reader, scope, today, sessions)}
    counts = {kind: found[kind].readable.count() for kind in desk.KINDS}
    hidden = sum(found[kind].waiting.count() for kind in desk.KINDS) - sum(counts.values())
    rows = [
        *_rule_review_rows(reader, found["rule_review"].readable),
        *_proposal_rows(reader, found["proposal"].readable, sessions),
        *_question_rows(reader, found["question"].readable),
        *_task_rows(found["overdue_task"].readable),
    ]
    rows.sort(key=lambda row: (row[0], order[row[1]["kind"]], row[1]["id"]))
    return {
        "scope": scope.key,
        "counts": counts,
        "hidden": hidden,
        "items": [item for _at, item in rows[:LIMIT]],
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.brain.tests.test_waiting services.brain.tests.test_desk services.brain.tests.test_deciding --parallel --noinput`
Expected: PASS. If `test_bounded_queries_and_no_distinct` exceeds 30, look for a per-row query (a missing `select_related`) before raising the bound.

- [ ] **Step 5: Lint and commit**

```bash
venv/bin/ruff format services/brain services/metrics/views.py
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/brain/waiting.py services/brain/tests/test_waiting.py
git commit -m "$(cat <<'EOF'
feat(brain): Waiting on you items, oldest first, with counts and hidden

Each item names who it waits on, the record it is about, whether the
reader may act, and its kind's detail; a rule review carries the owner's
existing review payload, a session proposal a neutral title unless the
reader saw the session whole.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The routes `waiting/` and `waiting/count/`

**Files:**
- Modify: `services/brain/views.py` (import `waiting`; add two views)
- Modify: `services/brain/urls.py`
- Create: `services/brain/tests/test_api_waiting.py`

**Interfaces:**
- Consumes: `BrainView` (`self.scope(request)`; `handle_exception` maps `ScopeUnknown` → 400 and `ScopeNotAllowed` → 403); `waiting.build(reader, scope, today)` and `waiting.count(reader, today)`.
- Produces: `GET /api/v1/brain/waiting/?scope=` (name `brain-waiting`) and `GET /api/v1/brain/waiting/count/` (name `brain-waiting-count`).

- [ ] **Step 1: Write the failing tests**

`services/brain/tests/test_api_waiting.py`:

```python
"""`waiting/` and `waiting/count/` over HTTP (spec §1.3, §3)."""

from rest_framework.test import APIClient

from services.brain.tests.waiting_fixtures import WaitingFixture

WAITING = "/api/v1/brain/waiting/"
COUNT = "/api/v1/brain/waiting/count/"


class WaitingApiTests(WaitingFixture):
    def test_the_contract_shape(self):
        self.proposal(self.pizza)
        body = self.as_user(self.mona).get(f"{WAITING}?scope=team").json()
        self.assertEqual(set(body), {"scope", "counts", "hidden", "items"})
        self.assertEqual(body["scope"], "team")
        self.assertEqual(
            set(body["counts"]), {"rule_review", "proposal", "question", "overdue_task"}
        )
        (item,) = body["items"]
        self.assertEqual(
            set(item),
            {"kind", "id", "title", "since", "waiting_on", "record", "can_decide", "detail"},
        )

    def test_no_scope_reads_the_default(self):
        self.assertEqual(self.as_user(self.mona).get(WAITING).json()["scope"], "team")
        self.assertEqual(self.as_user(self.csm).get(WAITING).json()["scope"], "me")
        self.assertEqual(self.as_user(self.lee).get(WAITING).json()["scope"], "company")

    def test_scope_refusals(self):
        response = self.as_user(self.csm).get(f"{WAITING}?scope=team")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(), {"code": "SCOPE_NOT_ALLOWED", "detail": "You can't see that view."}
        )
        response = self.as_user(self.csm).get(f"{WAITING}?scope=everyone")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "SCOPE_UNKNOWN")

    def test_anonymous_is_refused(self):
        self.assertEqual(APIClient().get(WAITING).status_code, 401)
        self.assertEqual(APIClient().get(COUNT).status_code, 401)

    def test_another_tenant_sees_none_of_ours(self):
        self.proposal(self.pizza)
        self.question(self.csm, customer=self.pizza)
        body = self.as_user(self.stranger).get(f"{WAITING}?scope=me").json()
        self.assertEqual(body["items"], [])
        self.assertEqual(body["hidden"], 0)


class WaitingCountApiTests(WaitingFixture):
    def test_every_member_gets_their_me_count(self):
        self.proposal(self.pizza)
        self.question(self.csm, customer=self.pizza)
        self.task(self.csm, account=self.west)  # hidden: not counted
        self.assertEqual(self.as_user(self.csm).get(COUNT).json(), {"count": 2})
        self.assertEqual(self.as_user(self.mona).get(COUNT).json(), {"count": 0})

    def test_the_count_ignores_scope(self):
        self.proposal(self.pizza)
        self.assertEqual(self.as_user(self.mona).get(f"{COUNT}?scope=team").json(), {"count": 0})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.brain.tests.test_api_waiting --parallel --noinput`
Expected: FAIL with 404s (the routes don't exist yet).

- [ ] **Step 3: Add the views**

In `services/brain/views.py`, change `from . import briefs, changed, explanations` to:

```python
from . import briefs, changed, explanations, waiting
```

Append:

```python
class WaitingView(BrainView):
    """GET /api/v1/brain/waiting/?scope= — what waits on the scope's people
    for a decision or answer, oldest first: rule reviews, proposals,
    questions and overdue tasks, each naming only records the reader may
    open (the rest counted in `hidden`)."""

    def get(self, request):
        scope = self.scope(request)
        return Response(waiting.build(request.user, scope, timezone.localdate()))


class WaitingCountView(BrainView):
    """GET /api/v1/brain/waiting/count/ — the sidebar badge: the reader's
    Me scope total. Counts only, for every member; `?scope=` is ignored."""

    def get(self, request):
        return Response({"count": waiting.count(request.user, timezone.localdate())})
```

Replace `services/brain/urls.py` with:

```python
from django.urls import path

from . import views

urlpatterns = [
    path("scopes/", views.ScopesView.as_view(), name="brain-scopes"),
    path("changed/", views.ChangedView.as_view(), name="brain-changed"),
    path("brief/", views.BriefView.as_view(), name="brain-brief"),
    path(
        "explanations/<str:metric>/",
        views.ExplanationView.as_view(),
        name="brain-explanation",
    ),
    path("waiting/", views.WaitingView.as_view(), name="brain-waiting"),
    path("waiting/count/", views.WaitingCountView.as_view(), name="brain-waiting-count"),
]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.brain --parallel --noinput`
Expected: PASS (the whole brain app, delivery 1 included).

- [ ] **Step 5: Lint and commit**

```bash
venv/bin/ruff format services/brain services/metrics/views.py
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/brain/views.py services/brain/urls.py services/brain/tests/test_api_waiting.py
git commit -m "$(cat <<'EOF'
feat(brain): GET waiting/?scope= and waiting/count/ for every member

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: End-to-end, docs and the full gate

**Files:**
- Create: `services/brain/tests/test_waiting_e2e.py`
- Modify: `docs/API_CONTRACTS.md` (brain section after `POST /api/v1/brain/explanations/<metric>/?scope=`, about line 4475; the proposals `Auth:` line, about line 7669)
- Modify: `docs/audit-events.md` (after the `brain.scope_baseline_recorded` row, line 75)
- Modify: `docs/product/01-prd.md` (feature table near line 184 and line 189; role rows lines 85 and 88; changelog after line 342)
- Modify: `docs/product/02-trd.md` (module table after line 121)

**Interfaces:**
- Consumes: everything above, over HTTP only.
- Produces: nothing new in code.

- [ ] **Step 1: Write the end-to-end tests**

`services/brain/tests/test_waiting_e2e.py`:

```python
"""End to end over HTTP: the four journeys the spec names."""

from core.models import AuditEvent
from services.brain.tests.waiting_fixtures import WaitingFixture
from services.customers.models import Task

WAITING = "/api/v1/brain/waiting/"
COUNT = "/api/v1/brain/waiting/count/"


def decide(proposal_id, decision="approve"):
    return f"/api/v1/metrics/proposals/{proposal_id}/{decision}/"


class WaitingEndToEndTests(WaitingFixture):
    def test_a_manager_approves_a_reports_task_proposal_from_my_team(self):
        self.proposal(self.pizza, title="Review Pizza Hut renewal pricing")
        mona = self.as_user(self.mona)

        (item,) = mona.get(f"{WAITING}?scope=team").json()["items"]
        self.assertEqual(item["kind"], "proposal")
        self.assertEqual(item["waiting_on"], {"id": self.csm.id, "name": "Carl CSM"})
        self.assertTrue(item["can_decide"])

        response = mona.post(decide(item["id"]), {"note": "Go"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(Task.objects.filter(customer=self.pizza).exists())
        self.assertEqual(
            AuditEvent.objects.get(action="proposal.approved").metadata["decided_as"], "chain"
        )
        self.assertEqual(mona.get(f"{WAITING}?scope=team").json()["items"], [])
        self.assertEqual(self.as_user(self.csm).get(COUNT).json(), {"count": 0})

    def test_a_csm_decides_a_proposal_on_their_own_customer(self):
        self.proposal(self.dough)
        carl = self.as_user(self.csm)
        self.assertEqual(carl.get(COUNT).json(), {"count": 1})
        (item,) = carl.get(f"{WAITING}?scope=me").json()["items"]
        self.assertEqual(carl.post(decide(item["id"], "reject")).status_code, 200)
        self.assertEqual(
            AuditEvent.objects.get(action="proposal.rejected").metadata["decided_as"], "owner"
        )
        self.assertEqual(carl.get(COUNT).json(), {"count": 0})

    def test_a_csm_without_view_all_cannot_decide_an_initiative(self):
        session = self.session(self.admin, self.csm)
        proposal = self.proposal(kind="initiative", session=session)
        carl = self.as_user(self.csm)
        (item,) = carl.get(f"{WAITING}?scope=me").json()["items"]
        self.assertFalse(item["can_decide"])
        response = carl.post(decide(proposal.id))
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json(), {"detail": "You can't decide this proposal."})

    def test_waiting_count_for_a_member(self):
        self.review(self.other)
        self.question(self.other, customer=self.taco)
        self.task(self.other, customer=self.taco)
        self.proposal(self.taco)
        self.assertEqual(self.as_user(self.other).get(COUNT).json(), {"count": 4})
```

- [ ] **Step 2: Run them**

Run: `venv/bin/python manage.py test services.brain.tests.test_waiting_e2e --parallel --noinput`
Expected: PASS (Tasks 1 to 4 already built everything). A failure here is a real bug in an earlier task. Fix it there, with a unit test.

- [ ] **Step 3: Document the API**

In `docs/API_CONTRACTS.md`, insert after the `POST /api/v1/brain/explanations/<metric>/?scope=` subsection, before its closing `---`:

````markdown
### `GET /api/v1/brain/waiting/?scope=me|team|company`

Delivery 2 (spec: react-ts-app
`docs/superpowers/specs/2026-10-05-brain-waiting-design.md` §1, §3). What
waits for a decision or answer on the scope's people: **Me** is the
reader, **My team** is the reader and everyone below them, **Company** is
everyone. Scope refusals and the default scope are as above.

- **Rule review**: `status=waiting`, the rule's owner on the desk; shown
  only on a rule the reader may read (`readable_rules`). Only the owner
  decides; `detail.review` is the owner's `GET /rules/reviews/` row
  (`null` for anyone else). `detail.counts` is the stored counts: a
  survey's `{people, records}`, a campaign's `{reach, skipped}`.
- **Proposal**: `status=proposed`. A task proposal waits on the named
  customer's owner. Unowned or gone customers and initiatives wait on
  Company (`waiting_on: null`). In Me, a proposal from a session the
  reader sees whole (owner or accepted present participant) also shows,
  and seeing it doesn't grant deciding it. `detail.session.title` is
  `"Shared conversation"` for a reader who doesn't see that conversation
  whole.
- **Question**: open, its assignee on the desk. `can_decide` means "may
  answer" (the assignee, or `manage_users`).
- **Overdue task**: not completed, assigned to someone on the desk, due
  before today; `since` is the due date. `can_decide` means "may open".
- **Twice-filter**: an item about a customer, account, rule or task the
  reader may not open is left out and counted in `hidden`. `counts` are the
  full totals of what is shown, per kind. Oldest first, at most 200 items.

```json
{
  "scope": "team",
  "counts": {"rule_review": 1, "proposal": 1, "question": 0, "overdue_task": 0},
  "hidden": 0,
  "items": [
    {"kind": "rule_review", "id": 14, "title": "Survey from Detractor follow-up",
     "since": "2026-10-03T02:10:00+00:00", "waiting_on": {"id": 7, "name": "Dana CSM"},
     "record": null, "can_decide": false,
     "detail": {"rule_id": 3, "rule_name": "Detractor follow-up", "review_kind": "survey",
                "counts": {"people": 12, "records": 3}, "review": null}},
    {"kind": "proposal", "id": 22, "title": "Review Pizza Hut renewal pricing",
     "since": "2026-10-01T09:00:00+00:00", "waiting_on": {"id": 5, "name": "Carl CSM"},
     "record": {"type": "customer", "id": 6, "name": "Pizza Hut"}, "can_decide": true,
     "detail": {"proposal_kind": "task", "action": {"customer_id": 6, "customer_name": "Pizza Hut",
                "title": "…", "assignee_name": "Carl CSM", "due_date": "2026-10-12",
                "priority": "high"},
                "evidence": ["…"], "session": {"id": 4, "title": "Shared conversation"}}}
  ]
}
```

### `GET /api/v1/brain/waiting/count/`

`{"count": 3}`: the reader's Me total, as `waiting/?scope=me` would count
it (hidden items excluded). Every member; counts only; `?scope=` is
ignored.
````

In the same file, replace the proposals line `Auth: \`CanViewAllAccounts\`. The Ops agent (...)` with this text. Keep the rest of that paragraph as it is.

```markdown
Auth: `CanViewAllAccounts` for the list and `generate/`. `approve/` and
`reject/` are `IsAuthenticated` and ask `services.brain.waiting.decided_as`:
a task proposal is decided by its customer's owner, anyone above the owner,
or `view_all_accounts`; an initiative only by `view_all_accounts`. Otherwise
`403 {"detail": "You can't decide this proposal."}`. Order: `404` (another
organisation's), then `403`, then `409` (already decided). Approving a task
proposal whose customer no longer exists is
`409 {"detail": "This proposal's customer no longer exists."}`. For a
decider without `view_all_accounts` who doesn't see the session whole, the
response's `source.title` is `"Shared conversation"`. The Ops agent (...)
```

- [ ] **Step 4: Catalogue the audit events**

In `docs/audit-events.md`, after the `brain.scope_baseline_recorded` row:

```markdown
| `proposal.approved` / `proposal.rejected` | `services.metrics.views.ProposalDecisionView` | user | Proposal (`target_repr` is "Proposal <id>", never the title) | `kind` (`task`/`initiative`), `decided_as`: `owner` (the customer's owner), `chain` (someone above the owner) or `company` (`view_all_accounts`) |
```

- [ ] **Step 5: Update the PRD and TRD**

`docs/product/01-prd.md`:
- Feature table, after the "Brain scopes and What changed" row:
  `| Brain: Waiting on you (Me / My team / Company) | Built (backend) | Rule reviews, Ops-agent proposals, open questions and overdue tasks in one list, oldest first, each naming who it waits on; only records the reader may open (the rest counted); a badge count for every member |`
- Replace the "Ops agent proposals and review queue" row's note with: `Proposes tasks and initiatives only; answers validated against what the prompt offered; a task proposal is decided by its customer's owner, anyone above them, or view_all_accounts`.
- Role row "CSM": append `, Waiting on you` after `their own Brain (Me)`.
- Role row "Leadership": replace `Review Queue` with `Waiting on you (Company)`.
- Changelog, after `| 2026-10-05 | Brain delivery 1: scopes and What changed (backend) |`:
  `| 2026-10-05 | Brain delivery 2: Waiting on you (backend); proposal decisions open to the customer's owner and their chain |`

`docs/product/02-trd.md`, module table after the `services/brain/changed.py` row:

```markdown
| `services/brain/desk.py` | Waiting on you: per kind, what waits on a scope's people and what the reader may open, as `id IN` subqueries |
| `services/brain/waiting.py` | Waiting on you items and the badge count; `decided_as`, the one rule for who may decide a proposal |
```

- [ ] **Step 6: Run the full gate (one test run at a time)**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
venv/bin/python manage.py makemigrations --check --dry-run
venv/bin/python scripts/ci_shard_labels.py --check 4
venv/bin/python manage.py test --parallel --noinput
```

Expected: ruff is clean (including the Markdown code blocks), there are no migrations, the shards check passes, and every test is green. If `ruff format --check` flags a docs file, run `venv/bin/ruff format <file>` and re-check.

- [ ] **Step 7: Commit**

```bash
git add services/brain/tests/test_waiting_e2e.py docs/API_CONTRACTS.md docs/audit-events.md docs/product/01-prd.md docs/product/02-trd.md
git commit -m "$(cat <<'EOF'
docs(brain): Waiting on you contracts, proposal decision rule, audit, PRD and TRD

Plus the end-to-end journeys: a manager approves a report's proposal from
My team, a CSM decides on their own customer, a CSM can't decide an
initiative, and a member's badge count.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review

**Spec coverage**
- §0 Review Queue endpoints: `/rules/reviews/*` is unchanged, the frontend reuses it through `detail.review`. `ProposalListView`/`GenerateView` stay `view_all_accounts` (Task 1, Step 5).
- Decision 1 (whose desk): `desk._owners` plus `resolve` (Task 2).
- Decision 2, the four kinds and who decides: Tasks 1 to 3.
- Decision 3 (session proposals in Me, seeing doesn't grant deciding): Task 2 `proposals` plus Task 3 `SessionItemTests`.
- Decision 4 (Ask the agent stays Company): `ProposalGenerateView` is unchanged.
- Decision 5 (a badge for every member): `waiting/count/` (Task 4).
- Decisions 6 and 7 are frontend only.
- §1.1: `desk.py` (owners, the four sources, Company extras, Me sessions, twice-filter, id-IN, no DISTINCT test) and `build` (cap of 200, oldest first, full counts).
- §1.2: `decided_as` / `can_decide` and the `ProposalDecisionView` 403 (Task 1).
- §1.3: Task 4.
- §1.4: `decided_as` metadata; the events had to be added (Contract note 1). Docs are in Task 5.
- §3: every field is built in Task 3 and pinned by the shape tests. Deviations are listed under Contract notes 2, 3 and 7.

**Placeholder scan:** every code step has complete code. The "(...)" in the API_CONTRACTS Auth replacement marks where the existing paragraph continues unchanged.

**Type consistency**
- `decided_as(reader, proposal, *, owner_id=...)` / `can_decide`: defined in Task 1, used in Task 3.
- `desk.sources(reader, scope, today, sessions)` and `desk.session_ids_seen_whole(reader)`: defined in Task 2, used in `count` (Task 2) and `build` (Task 3).
- `Source.kind/.waiting/.readable` and `KINDS` match the keys of `counts`.
- Fixture makers `proposal`, `session`, `review`, `question`, `task`, and `GONE`, are used with the signatures defined in Tasks 1 and 2.
- `COMPANY_DECIDER` is imported in `metrics/views.py` from `services.brain.waiting`.
