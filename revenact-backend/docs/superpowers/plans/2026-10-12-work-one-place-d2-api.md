# Work in one place, delivery 2 ("Team and clean-up"): API contract

Backend plan: `docs/superpowers/plans/2026-10-12-work-one-place-d2-backend.md`. Frontend plan:
react-ts-app `docs/superpowers/plans/2026-10-12-work-one-place-d2-frontend.md`. Spec: react-ts-app
`docs/superpowers/specs/2026-10-12-work-one-place-design.md` §4.3, §4.4, §4.5, §5 (delivery 2 of §8).
Delivery 1's contract (`docs/superpowers/plans/2026-10-12-work-one-place-api.md`) still holds in
full; this file adds to it and lists what delivery 2 removes. Every path is under `/api/v1/`,
every route is `IsAuthenticated` (401 without a token), every body is JSON. Timestamps are ISO
8601 UTC as DRF writes them; "today" is the workspace's date (`work.clock.today_for`).

Merge order: backend #111 (delivery 1), frontend #138, then this delivery's backend, then its
frontend, back to back (owner decision: no "Ask the agent" gap in production).

## Decisions narrowing the spec

Where the spec left a choice, the conservative option was taken. Each line says what a person
will notice.

| # | Decision | Cost if wrong |
|---|---|---|
| D1 | **Nothing shows twice.** The Team queue leaves out everything already on the reader's own My work: their own approvals, rule reviews, questions, overdue tasks and suggestions. A manager sees what waits on the people below them, not on themselves. | Low: drop one `exclude` per source. |
| D2 | **Team offers My team and Company only.** "Me" leaves the Team switch (My work is your desk). My team needs reports; Company needs view-all or Leadership (Brain's rule, unchanged). `scope=me` is refused on the queue; `GET /work/team/?scope=me` keeps working for old clients. | Low. |
| D3 | **What the queue holds:** approvals, rule reviews, questions, overdue tasks (past due and not Blocked, Work's own meaning), and suggestions. Not drafts (a reply draft is its owner's alone), never to-dos (a to-do is its creator's alone, not even counted), not tasks that are only due soon or Blocked. | Low: another task group is one more source. |
| D4 | **Actions only where today's rules allow.** Approve/Reject an agent action only when the existing approver rule allows it (`agents.deciding.may_decide`). A rule review is read-only (only its rule's owner decides it, and the owner's own reviews are on their My work). Answer a question only with `manage_users` (the existing answer rule). An overdue task only opens the task panel: no Done from the queue. A suggestion offers Assign and Dismiss, not "Add to my work". | Low: Done for managers is one per-row rights check. |
| D5 | **Which suggestions:** open ones of the four live kinds that the reader may decide today (the rule behind Recommended's "My team"), on records they may open, whose recipient is someone in scope other than the reader. Ones the reader may not decide are not listed and not counted. | Low. |
| D6 | **"For" names the person it waits on:** an approval's record owner, a review's rule owner, a question's assignee, a task's assignee, a suggestion's recipient. `null` for an agent action with no record (workspace-level) or on a record nobody owns: the page says "For the whole company". | Trivial. |
| D7 | **Workspace-level agent actions** (no record, e.g. the Ops agent's) appear only in the Company queue and only to view-all readers, exactly as on Brain › Waiting. They are never counted as hidden for anyone else. | None: unchanged rule. |
| D8 | **The queue's shape is the feed's:** three groups (`decide`, `overdue`, `suggested`) with the feed's order, page size (50), keyset cursors and `failed`; no `kind` filter (the Team page has no chips). | Low. |
| D9 | **Retired recommendations are closed, not deleted:** open ones of the three retired kinds become `dismissed` with reason `retired`, no decider, at migration time. History rows keep their kind. Nobody can choose `retired` as a dismissal reason. | Low. |
| D10 | **Retired switches leave the settings API.** `GET /work/settings/` no longer lists `overdue_tasks`, `open_questions` or `agent`; a stored value for them is ignored; a `PATCH` naming one is `400 {"sources": {"<kind>": ["Unknown source."]}}` like any unknown source. | Low: an old browser tab toggling a retired switch sees the refusal. |
| D11 | **AI agent proposals get their own once-a-day notice** (owner decision on Q1). Their old "recommendations waiting" notice came from the mirror recommendation, which is retired; a new `agent_proposal_waiting` notice ("AI proposal waiting") replaces it: at most one per person per day, only to people who could decide a new proposal on their own My work, linking `/work/mine?kind=approval` (§4.1). | Low: one notification kind the bell renders like any other. |
| D12 | **"Run now" on an agent no longer refreshes recommendations** (its proposals are approvals now); it sends the AI proposal notice instead (§4.1). Its answer is unchanged. | None. |
| D13 | **Brain's Ask keeps "what's waiting" as background.** Only the two Waiting routes and the badge count are removed; `brain.waiting.build` stays as one of Ask Revenact's grounding sources (Ask history can name the old tab). | Low: a later round can drop it. |
| D14 | **Links into Work.** Task notices (assigned, overdue, escalated) open the task over My work: `/work/mine?task=<id>`, a manager's escalation included. The daily digest links `/work/mine`; the new-recommendations notice `/work/mine?kind=suggestion`; the rule-review notice `/work/mine?kind=approval`. Notifications already sent keep their old links; the frontend's redirects (`/work/today`, `/work/recommended`, `/brain/waiting`, `/brain/review`) stay, so no stored row is rewritten. | Low. |
| D15 | **`GET /work/recommendations/` stays** (unchanged shape). Nothing in the app reads it after this delivery; it is not removed here. | None. |

## 1. `GET /work/feed/team/`

What waits on the reader's team: the people in scope other than the reader (D1). Query parameters:

| Param | Values | Default |
|---|---|---|
| `scope` | `team` or `company` | the widest the reader has: `company` for view-all or Leadership, else `team` |
| `group` | `decide`, `overdue` or `suggested` | absent: the whole queue |
| `cursor` | a group's `next`, exactly as received | absent: the first page |

Any other parameter (including `kind`) is ignored.

### 1.1 Access

| Reader | `team` | `company` | no `scope` |
|---|---|---|---|
| Has reports (anyone below them in the chart) | 200 | 403 unless view-all or Leadership | `team` (or `company` if also view-all/Leadership) |
| View-all or Leadership, no reports | 403 | 200 | `company` |
| Neither | 403 | 403 | 403 |

Refusals (checked before anything is read, in this order):

| When | Status | Body |
|---|---|---|
| `scope` is `me`, empty, or not a scope | 400 | `{"code": "SCOPE_UNKNOWN", "detail": "Choose team or company."}` |
| the reader may not use that scope (or has neither) | 403 | `{"code": "SCOPE_NOT_ALLOWED", "detail": "You can't see that view."}` |
| `cursor` without `group` | 400 | `{"cursor": ["Say which group to page."]}` |
| `group` not one of the three | 400 | `{"group": ["Choose decide, overdue or suggested."]}` |
| `cursor` malformed, or made for another group | 400 | `{"cursor": ["That list has changed. Reload Work."]}` |

### 1.2 Response `200` (whole queue)

```json
{
  "scope": "team",
  "groups": [
    {"key": "decide", "count": 2, "items": [], "next": null},
    {"key": "overdue", "count": 1, "items": [], "next": null},
    {"key": "suggested", "count": 0, "items": [], "next": null}
  ],
  "hidden": 1,
  "failed": []
}
```

- `scope`: the scope read (the default when none was asked).
- `groups`: always these three, in this order, empty ones included.
- `count`: the group's full total; at most **50** items per group; `next` a cursor when more exist.
- `hidden`: items waiting on people in scope about records the reader cannot open (or, for a rule
  review, on a rule they cannot read). Counted, never named. To-dos and drafts are never counted.
- `failed`: the kinds whose source failed, in the order `approval, rule_review, question, task,
  suggestion`; their items are absent and their counts 0. Still `200`.

| Group | Holds | Order (the feed's) |
|---|---|---|
| `decide` | `approval`, `rule_review`, `question` | oldest `at` first; ties `rule_review`, `approval`, `question`, then id |
| `overdue` | `task`: open, with a record, past due and not Blocked | `due_date`, priority (high, medium, low), `created_at`, id |
| `suggested` | `suggestion` | newest `at` first, then id descending |

### 1.3 Paging: `?scope=<s>&group=<key>[&cursor=<next>]`

```json
{"scope": "team", "group": {"key": "overdue", "count": 61, "items": [], "next": null}, "failed": []}
```

The cursor is the feed's keyset position: acting on rows between pages never makes another row
skip or repeat. Without `cursor`, the group's first page (a failed group's Try again). `failed`
lists the failed kinds of this group only.

### 1.4 TeamItem

Delivery 1's FeedItem (§2.2 of its contract), plus `for`:

```json
{
  "key": "agent_action:41",
  "kind": "approval",
  "id": 41,
  "title": "Move Acme to At risk",
  "record": {"type": "customer", "id": 7, "name": "Acme"},
  "from": {"type": "agent", "label": "CS agent"},
  "at": "2026-10-11T09:00:00Z",
  "due_date": null,
  "priority": null,
  "private": false,
  "actions": ["approve", "reject"],
  "detail": {},
  "for": {"id": 3, "name": "Carl CSM"}
}
```

| kind | Source (existing rule, reused) | `for` | `actions` | `detail` |
|---|---|---|---|---|
| `approval` | `brain.desk.agent_actions(reader, scope, sessions)`, minus the reader's Me desk | the record's owner; `null` with no record or no owner | `["approve", "reject"]` when `agents.deciding.may_decide(reader, action)`, else `[]` | as delivery 1 (ActionPayload + `session`) |
| `rule_review` | `brain.desk.rule_reviews(reader, scope)`, minus the reader's own rules | the rule's owner | always `[]` (D4) | as delivery 1, `review: null` |
| `question` | `brain.desk.questions(reader, scope)`, minus those assigned to the reader | the assignee | `["answer"]` with `manage_users`, else `[]` | as delivery 1 |
| `task` | open `Task` with a record, assigned to someone in scope (not the reader), past due and not Blocked, that the reader may read (`task_access.openable_tasks`) | the assignee | always `["open"]` (D4) | the TaskRow |
| `suggestion` | `rec_access.decidable(reader, "team")` of the four live kinds, recipient in scope and not the reader, cut by `rec_access.openable` | the recipient | always `["assign", "dismiss"]` | the RecommendationRow |

`title`, `record`, `from`, `at`, `due_date`, `priority` and `private` follow delivery 1's per-kind
table. `private` is always `false` here: a to-do never reaches the queue.

### 1.5 Actions

Each action calls the item's existing route, unchanged (delivery 1 contract §2.3): approve/reject
`/agents/actions/<id>/approve|reject/` (and undo), assign/dismiss
`/work/recommendations/<id>/assign|dismiss/` (the picker is `GET /work/assignees/`), answer and
open are client-only. Their refusals are unchanged: 409 means someone else decided first; 404 or
403 means the reader lost access (the page removes the row and adds one to `hidden`).

### 1.6 Privacy

- Every source is the existing rule, reused; nobody sees more than Brain › Waiting showed them at
  the same scope.
- A to-do is never listed, counted or hidden. A draft is never listed, counted or hidden. Here "draft" is a reply draft (My work's `draft` kind); a proposed agent action that would send a draft reply is an approval, and when its source is one the reader cannot read it counts in `hidden` (as on Brain › Waiting) but is never named.
- Every AI-made row is filtered twice: on the way in, the source's own rule (the agents' evidence
  rules, `may_read_source` for a draft reply's recommendation, the recommender's record rule); on
  the way out, the reader's record rule (`agents.views.readable`, `rec_access.openable`,
  `task_access.openable_tasks`) before anything is named, and `may_decide` / `decidable` before an
  action is offered.

### 1.7 Performance

- The query count does not grow with the number of items (pinned by a test that adds every kind
  five more times and compares). Ceiling: `TEAM_CEILING` in
  `services/work/tests/test_feed_team_queries.py`, measured on the branch and pinned for both
  scopes. The suggestions' assignee check costs one or two queries per distinct suggested person
  on the page (as Recommended), never per row.
- No query uses `DISTINCT`; every visibility rule is an `id IN` subquery (Postgres 16). A test
  asserts it over every query of both scopes.

## 2. Retired recommendation kinds

`overdue_tasks`, `open_questions` and `agent_action` are no longer produced.

- **Recommender** (`work.recommend.refresh`, nightly and Settings › Work's Run now): reads the four
  live kinds only. `RefreshResult` keeps its shape; `failed` can only name live kinds and
  `recommendations_waiting`.
- **Data migration** `work.0006_retire_recommendation_kinds`: every open recommendation of a retired
  kind becomes `status: "dismissed"`, `dismiss_reason: "retired"`, `decided_at` = the migration's
  time, `decided_by: null`. Reverse: no-op. `Recommendation.DismissReason` gains `retired`
  ("Retired"); the enum `Kind` keeps all seven values for history.
- **Deciding a retired one** (an old tab): it is no longer open, so assign/dismiss answer the
  existing `409 {"code": "ALREADY_DECIDED", "detail": "This recommendation was already dismissed.", "recommendation": {... "dismiss_reason": "retired"}}`.
- **Dismiss reasons a person may send** stay the four: `already_handled`, `not_relevant`,
  `wrong_person`, `other`. `"retired"` is `400 {"reason": ["Choose already handled, not relevant, wrong person or other."]}`.
- **Settings:** `GET /work/settings/` `sources` has exactly `renewal_due`, `health_drop`,
  `urgent_tickets`, `anomaly`. `PATCH` with `overdue_tasks`, `open_questions` or `agent` under
  `sources` is `400 {"sources": {"<kind>": ["Unknown source."]}}` (D10).
- **Cross-settlement deleted:** deciding an agent action no longer settles a recommendation, and
  deciding a recommendation never applies or rejects an agent action. `POST
  /work/recommendations/<id>/assign/` no longer answers `400 USE_APPLY` (no open recommendation
  carries an agent action).
- **Agents:** `POST /agents/<kind>/run/` no longer runs the recommender afterwards; it sends the AI proposal notice (§4.1) instead (D12).

## 3. Removed

| Route | Was | Now |
|---|---|---|
| `GET /brain/waiting/?scope=` | Brain › Waiting on you | 404 (route gone). Team and company views: `GET /work/feed/team/`; the reader's own: `GET /work/feed/`. |
| `GET /brain/waiting/count/` | Brain's badge | 404. The one badge is `GET /work/feed/count/`. |
| `GET /work/today/` | Work › Today | 404. The reader's tasks are in `GET /work/feed/`. |

`brain.desk` stays (the feed's and the queue's building blocks); `brain.waiting.build` stays for
Ask Revenact's grounding only (D13).

## 4. Notification links (D14)

| Notification kind | Link before | Link now |
|---|---|---|
| `task_assigned`, `task_overdue`, `task_escalated` | `/work/today?task=<id>` | `/work/mine?task=<id>` |
| `recommendations_waiting` | `/work/recommended` | `/work/mine?kind=suggestion` |
| `rule_review` | `/brain/review` | `/work/mine?kind=approval` |
| `agent_proposal_waiting` (new, §4.1) | none | `/work/mine?kind=approval` |

The daily digest email's "Open Work" line links `<FRONTEND_URL>/work/mine`. Every other
notification link is unchanged.

### 4.1 The AI proposal notice (`agent_proposal_waiting`)

Owner decision (D11): AI agent proposals keep a bell notice after their mirror recommendation is
retired.

- **Kind:** `agent_proposal_waiting`, label "AI proposal waiting". Message: `AI proposals are
  waiting for your decision.` Link: `/work/mine?kind=approval`. No actor.
- **Who is told:** a person is told when at least one proposed agent action, made since they were
  last told (and inside the 14-day proposal window), is on their own My work's Approvals (the
  feed's own source, `feed_decide.Approvals`, so the feed's visibility rules exactly) **and** they
  may decide it (`agents.deciding.may_decide`). Someone who only sees a proposal (a session
  participant without the right) or could decide it only from Team (a manager above the owner, a
  view-all reader) is not told. A suspended or revoked member is never told; nor is the person who
  pressed Run now.
- **How often:** at most one per person per workspace day (`work.clock.start_of_day`), and only
  for proposals made after their previous notice of this kind: a proposal never causes a second
  notice.
- **When:** at the end of every recommender pass (`work.recommend.refresh`: nightly and Settings ›
  Work's Run now) and after an agent's Run now (`POST /agents/<kind>/run/`). A failed notice is
  logged and never fails the pass or the run; `RefreshResult` keeps its shape.
- **Cost:** the queries grow with the number of people who might be told, never with the number
  of proposals (pinned by a test, `PROPOSAL_NOTICE_CEILING`).
