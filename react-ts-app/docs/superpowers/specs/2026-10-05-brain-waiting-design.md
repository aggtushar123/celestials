# Brain, delivery 2: Waiting on you

Delivery 2 of the Brain rethink agreed with the owner on 2026-10-05 (see
`2026-10-05-brain-what-changed-design.md` for the decisions, the scopes and
`brain.scope.resolve`). Builds on delivery 1: it needs the scope switch,
the resolver and `ScopeActor`.

The second question: **what is waiting for a person's decision or answer,
and what is waiting on the people under them.**

## 0. What exists

- **Review Queue** `/brain/review` (`src/pages/brain/Review.tsx`).
  - "From your rules" (`components/rules/RuleReviews.tsx`) is open to
    everyone. It calls `GET /rules/reviews/?status=waiting`, which is
    filtered to `rule__owner=request.user`. Decisions go through
    `POST /rules/reviews/<id>/approve/` (answers `{survey_send_id}` or
    `{campaign_send_id}`; 400 refusal stored on the review; 409 already
    decided) and `POST /rules/reviews/<id>/skip/`.
  - AI proposals (`services/metrics` `Proposal`) are listed and decided
    only for `view_all_accounts` (`ProposalListView`, `/metrics/proposals/`,
    `/metrics/proposals/<id>/approve|reject/`). The frontend blanks them for
    other readers (`Review.tsx` `canSeeAll`).
  - A proposal of kind `task` names one customer in its `action`
    (`{customer_id, customer_name, title, assignee_name, due_date,
    priority}`). Kind `initiative` names a metric and an optional cut
    (`{metric, metric_label, dimension, member, member_label,
    target_value, target_by}`). `Proposal.session` is set when a
    multiplayer session's decisions produced it.
  - The sidebar badge (`pendingProposals`) is loaded and shown only for
    `view_all_accounts`.
- **Questions** (`services/knowledge` `Question`: `assignee`, `asked_by`,
  `customer`, `status` open/answered, `created_at`). `GET /questions/`
  is scoped by `visible_questions()`; `?mine=true&status=open` gives a
  person's own open questions. The Brain's `QuestionsWaitingPanel` is
  `view_all_accounts` only; delivery 1 shows it under What changed in the
  Company scope until this delivery.
- **Tasks** (`customers.Task`: `assignee` FK, `due_date`, `status`
  pending/in-progress/completed, `customer`/`account`).

## Decisions (made for this spec; for the owner's review)

1. The scope switch means **whose desk**:
   - **Me**: what waits for my decision or answer.
   - **My team**: what waits on me or anyone below me, each item naming
     who it waits on. I can act on the items I'm allowed to act on and
     see the rest.
   - **Company**: everything waiting in the organisation.
2. Four kinds of item, in one list ordered by how long they have waited:
   - **Rule review**: waits on the rule's owner. Only the owner decides
     (unchanged).
   - **Proposal (task)**: waits on the named customer's owner. The owner,
     anyone above the owner, or a `view_all_accounts` reader may decide.
     A customer with no owner waits on Company readers.
   - **Proposal (initiative)**: waits on Company readers. Deciding stays
     `view_all_accounts` (creating an initiative is a company decision
     until delivery 3).
   - **Question**: waits on its assignee. Answering happens on the
     question's existing page.
   - **Overdue task**: an open task with an `assignee` whose `due_date`
     is past. Waits on its assignee. Done from the task's record page.
3. Proposals that came from a session also show to that session's
   accepted participants, in their Me scope, with "Decided in session".
   Seeing one doesn't grant deciding it; rule 2 decides that.
4. **Ask the agent** (a paid Ops-agent run) stays a Company action.
5. The sidebar shows **Waiting on you** with a badge for every member: the
   count of items in their **Me** scope.
6. `/brain/review` redirects to `/brain/waiting`. Rule notifications that
   link to the Review Queue land on the new page.
7. The "Questions waiting" and "Knowledge by function" panels leave What
   changed. Questions are now items here. Knowledge by function moves to
   What's being done in delivery 3 (Company scope).

## 1. Backend

### 1.1 Collecting the items (`services/brain/waiting.py`)

`build(reader, scope, today) -> {counts, items, hidden}`.

- **Owners on the desk**: Me = `{reader}`; My team = `{reader} ∪
  subtree_ids(reader)`; Company = everyone.
- **Rule reviews**: `RuleReview` with `status=waiting` and
  `rule.owner_id` in the desk.
- **Task proposals**: `Proposal` with `status=proposed`, `kind=task`, whose
  `action.customer_id` names a customer owned by someone on the desk. In
  Company, also those whose customer has no owner or no longer exists.
- **Initiative proposals**: Company only.
- **Session proposals** (Me only): `Proposal.session` where the reader is
  an accepted participant, whatever the customer.
- **Questions**: `Question` with `status=open` and `assignee` on the desk.
- **Overdue tasks**: `customers.Task` with `status` not completed,
  `assignee` on the desk and `due_date < today`.
- Every item names only records the reader can open: an item whose
  customer or account the reader can't open is left out and counted in
  `hidden`. This matters in My team and for Leadership readers without
  `view_all_accounts`.
- No joins plus DISTINCT; one `id IN (subquery)` per source.
- Capped at 200 items, oldest first; `counts` are the full totals per kind.

### 1.2 Who may decide a proposal (`brain.waiting.can_decide`)

- Task proposal: `view_all_accounts`, or the named customer's owner is the
  reader or in `subtree_ids(reader)`.
- Initiative proposal: `view_all_accounts`.
- `ProposalDecisionView` (`/metrics/proposals/<id>/approve|reject/`) moves
  from `CanViewAllAccounts` to this rule: 403
  `{"detail": "You can't decide this proposal."}` otherwise. Everything
  else about approving is unchanged (409 when already decided).
- `ProposalListView` and `ProposalGenerateView` are unchanged
  (Company only).

### 1.3 API (`/api/v1/brain/`)

- `GET waiting/?scope=` (shapes in §3).
- `GET waiting/count/`: `{"count": n}` for the reader's Me scope; cheap
  (counts only), for the sidebar badge.

### 1.4 Audit, docs

- No new audit events. Proposal decisions already record
  `proposal.approved`/`rejected`; add `decided_as` (`owner`, `chain`,
  `company`) to the event's metadata.
- Docs: API_CONTRACTS (brain section, proposal decision permission),
  audit-events, PRD, TRD.

## 2. Frontend

### 2.1 Waiting on you (`/brain/waiting`, `src/pages/brain/Waiting.tsx`)

- Header: `h1` "Waiting on you", the scope switch, and the counts per kind
  as filter chips (All · Rule reviews · Proposals · Questions · Overdue
  tasks).
- One list, oldest first. Each row:
  - kind label, title, the record it is about (linked), how long it has
    waited ("3 days"), and in My team or Company who it waits on
    ("Waiting on Dana CSM");
  - **Rule review**: the counts and **Approve** / **Skip**, using the
    existing RuleReviews logic (shared component, not a copy). Refusals
    show at the button.
  - **Proposal**: the action in words, the evidence lines, "Decided in
    session …" when it came from one, and **Approve** / **Reject** when
    `can_decide`; otherwise "Waiting on Dana CSM to decide".
  - **Question**: the question text, who asked, and **Answer**, which
    opens the question where it is answered today.
  - **Overdue task**: the task, its due date, and **Open task**.
- Each decision sends once (`useSubmitOnce`); the row leaves the list on
  success and the badge drops.
- "N more items about records you can't open" when `hidden > 0`.
- Company: **Ask the agent** in the header, as today.
- Empty: "Nothing is waiting on you." (Me) / "Nothing is waiting on your
  team." / "Nothing is waiting."
- Skeleton, error with Retry, 375px layout, house rules as in delivery 1.

### 2.2 Sidebar and routes

- **Waiting on you** (`/brain/waiting`, icon `Inbox`) after What changed,
  with a badge from `waiting/count/` for every member. Review Queue leaves
  the sidebar. The old `pendingProposals` badge and the
  `view_all_accounts`-only `fetchProposals()` on mount are removed.
- `/brain/review` redirects to `/brain/waiting`.
- What changed drops the Company-only `QuestionsWaitingPanel`.

### 2.3 Tests

- The four kinds rendering, filters, who-it-waits-on in My team, can't
  decide, decide once and leave, hidden count, the badge for a member
  without `view_all_accounts`, the redirect, house rules, a contract stub
  and an e2e: a manager sees a report's task proposal in My team and
  approves it.

## 3. API contract

### `GET waiting/?scope=`

```json
{
  "scope": "team",
  "counts": {"rule_review": 1, "proposal": 2, "question": 1, "overdue_task": 0},
  "hidden": 0,
  "items": [
    {"kind": "rule_review", "id": 14, "title": "NPS survey for 12 detractors",
     "since": "2026-10-03T02:10:00Z", "waiting_on": {"id": 7, "name": "Dana CSM"},
     "record": null, "can_decide": false,
     "detail": {"rule_id": 3, "rule_name": "Detractor follow-up",
                "review_kind": "survey", "counts": {"send": 12, "skip": 2}}},
    {"kind": "proposal", "id": 22, "title": "Review Pizza Hut renewal pricing",
     "since": "2026-10-01T09:00:00Z", "waiting_on": {"id": 5, "name": "Carl CSM"},
     "record": {"type": "customer", "id": 6, "name": "Pizza Hut"},
     "can_decide": true,
     "detail": {"proposal_kind": "task", "action": {"…": "as today"},
                "evidence": ["…"], "session": {"id": 4, "title": "…"}}},
    {"kind": "question", "id": 31, "title": "Who signs off renewals at Uber?",
     "since": "2026-09-29T11:00:00Z", "waiting_on": {"id": 5, "name": "Carl CSM"},
     "record": {"type": "customer", "id": 3, "name": "Uber"}, "can_decide": true,
     "detail": {"asked_by": "Alice Admin"}},
    {"kind": "overdue_task", "id": 51, "title": "Call the exec sponsor",
     "since": "2026-10-02", "waiting_on": {"id": 5, "name": "Carl CSM"},
     "record": {"type": "account", "id": 9, "name": "Uber EMEA"}, "can_decide": true,
     "detail": {"due_date": "2026-10-02", "priority": "high"}}
  ]
}
```

- `since`: when it started waiting (review/proposal/question created; an
  overdue task's due date).
- `waiting_on` is `null` for items waiting on Company readers.
- `record` is `null` for rule reviews (they cover many records).
- `can_decide` for a question or task means "may answer / open it".
- 400 `SCOPE_UNKNOWN`, 403 `SCOPE_NOT_ALLOWED`.

### `GET waiting/count/`

`{"count": 3}`, the Me scope's total.

## 4. Out of scope

- Snoozing or re-assigning items.
- A scoped Ops-agent run.
