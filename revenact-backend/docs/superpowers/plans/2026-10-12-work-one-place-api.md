# Work in one place, delivery 1 ("My work"): API contract

Backend plan: `docs/superpowers/plans/2026-10-12-work-one-place-backend.md`. Spec: react-ts-app
`docs/superpowers/specs/2026-10-12-work-one-place-design.md` §3, §4.1, §4.2 (delivery 1 of §8).
Every path is under `/api/v1/`, every route is `IsAuthenticated` (401 without a token), every
body is JSON. Dates are `YYYY-MM-DD`; timestamps are ISO 8601 UTC as DRF writes them
(`"2026-10-11T09:00:00Z"`). "Today" is the workspace's date (`work.clock.today_for`), as for
every Work route since Work delivery 3.

Not in this delivery, and unchanged by it: `GET /work/feed/team/`, the retired recommendation
kinds (`overdue_tasks`, `open_questions`, `agent_action` are still produced and still listed by
`GET /work/recommendations/`), `GET /brain/waiting/`, `GET /brain/waiting/count/` and
`GET /work/today/`. All keep working exactly as today.

---

## 1. To-dos

A **to-do** is a `customers.Task` with neither `customer` nor `account`. There is no flag: a task
with no record is a to-do, and attaching a record makes it an ordinary task.

| Rule | Detail |
|---|---|
| Who reads it | Its creator (`created_by`) only. Not their manager, not view-all, not Leadership. Anyone else gets `404 {"detail": "No such task."}` from `GET`/`PATCH /tasks/<id>/` and `POST /tasks/<id>/comments/`. |
| Who it is assigned to | Always its creator. Any other assignee is `400 {"assignee": ["A to-do without a record can only be yours."]}`. |
| Due date | Optional. A to-do may have no date (`due_date: null`). A task **with** a record always has a date (see Decision 1). |
| Where it appears | `GET /work/feed/` (kind `todo`) and its count, the task panel, and the creator's own daily digest. Nowhere else: not `GET /tasks/`, not a record's Tasks tab, not `GET /work/today/`, `GET /work/team/`, `GET /work/tasks/`, Brain (Waiting, graph, doing), Copilot, the agents' evidence, recommendations or exports. |
| Tracking | Never nudged or escalated (only tasks with a record and a date are tracked). |
| Agents | No agent action may target a to-do: the evidence never contains one, so a proposal naming one is dropped at generation. |

### 1.1 `POST /work/todos/`

Creates a to-do, or, with a record, an ordinary task (the same task the record's own
`POST /customers/<id>/tasks/` or `POST /accounts/<id>/tasks/` would make).

Request:

```json
{
  "title": "Book the QBR room",
  "due_date": "2026-10-14",
  "priority": "high",
  "customer_id": 7,
  "account_id": null,
  "assignee_id": 3
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string, 1–255 after trimming | yes | |
| `due_date` | `YYYY-MM-DD` or `null` | no (to-do); **yes** with a record | |
| `priority` | `"high" \| "medium" \| "low"` | no | Default `"medium"`. |
| `customer_id` | integer or `null` | no | An organisation the caller may open. |
| `account_id` | integer or `null` | no | An account the caller may open. Never together with `customer_id`. |
| `assignee_id` | integer or `null` | no | Default: the caller. Without a record it may only be the caller. With a record: an active member who may open that record. |

Unknown keys are ignored. `description` is not accepted here (write it in the task panel).

Response `201`:

```json
{
  "task": { "...": "TaskDetail (§1.3)" },
  "item": { "...": "FeedItem (§2.2), or null" },
  "group": "no_date"
}
```

- `task`: the task panel's shape (`GET /tasks/<id>/`), as saved.
- `item`: the new row exactly as `GET /work/feed/` would show it to the caller, or `null` when the
  task is not on the caller's desk (it was given to someone else).
- `group`: the feed group the item belongs in (`overdue | today | week | later | no_date | blocked`),
  or `null` with a `null` item.

Side effects: a `created` TaskEvent (`source: "manual"`); a `task_assigned` notification to the
assignee when the assignee is not the caller (record tasks only; a to-do is always the caller's).
Not audited (record task creation is not audited either; edits are, as `task.update`).

Errors (400 unless stated; all fields are validated together, then the record, then the rest):

| When | Body |
|---|---|
| `title` missing, blank, null or not a string | `{"title": ["Give the task a title."]}` |
| `title` over 255 | `{"title": ["Keep the title under 255 characters."]}` |
| `due_date` not a date | `{"due_date": ["Choose a date."]}` |
| `priority` not one of the three | `{"priority": ["Choose high, medium or low."]}` |
| `customer_id` / `account_id` not an integer | `{"customer_id": ["Choose an organisation or account you can open."]}` (or `account_id`) |
| `assignee_id` not an integer | `{"assignee_id": ["Choose who does it."]}` |
| both `customer_id` and `account_id` | `{"record": ["Choose an organisation or an account, not both."]}` |
| the record does not exist, is another workspace's, or the caller cannot open it | `{"record": ["Choose an organisation or account you can open."]}` |
| no record and `assignee_id` is someone else | `{"assignee": ["A to-do without a record can only be yours."]}` |
| a record and no `due_date` (missing or null) | `{"due_date": ["Choose a date."]}` |
| a record and an assignee who is not an active member able to open it | `{"code": "ASSIGNEE_CANNOT_OPEN", "detail": "That person can't open this organisation."}` (`account` for an account) |

### 1.2 `PATCH /tasks/<id>/` (existing route, extended)

Unchanged for ordinary tasks except the two new keys below are refused on them. For a to-do:

- Every existing field works (`title`, `description`, `status` with `blocked_reason`, `due_date`,
  `priority`). **Done** is `{"status": "completed"}`; **undo** is `{"status": "<previous status>"}`
  (with `"blocked_reason"` when the previous status was `blocked`).
- `due_date: null` clears a to-do's date. On a task with a record it is
  `400 {"due_date": ["Choose a date."]}` (as before).
- `assignee_id` other than the creator: `400 {"assignee": ["A to-do without a record can only be yours."]}`.
- **Attaching a record**: send `customer_id` or `account_id` (an integer). The to-do becomes an
  ordinary task under record rules from then on (its creator's chain, view-all and Leadership may
  read it, it is tracked, agents see it).
  - The record must be one the caller may open: else `400 {"record": ["Choose an organisation or account you can open."]}`.
  - Both at once: `400 {"record": ["Choose an organisation or an account, not both."]}`.
  - Not an integer: `400 {"customer_id": ["Choose an organisation or account you can open."]}` (or `account_id`).
  - The task must end up with a date: a to-do with no date needs `due_date` in the same PATCH,
    else `400 {"due_date": ["Choose a date."]}`.
  - `assignee_id` in the same PATCH is checked against the new record (`ASSIGNEE_CANNOT_OPEN` as above).
  - It writes an `edited` TaskEvent `{"field": "record", "from": null, "to": {"kind": "customer", "id": 7, "name": "Pizza Hut"}}`
    and the `task.update` audit lists `"record"` in `fields`.
- `customer_id`/`account_id` sent as `null`, or equal to the task's current record, change nothing.
- `customer_id`/`account_id` naming a different record on a task that already has one:
  `400 {"record": ["A task's organisation or account can't be changed."]}`. A record cannot be removed.

### 1.3 Shape changes (TaskRow, TaskDetail)

Both shapes stay as documented in `docs/API_CONTRACTS.md` (`work`, "Shared shapes"), plus:

- `private` (boolean, new, on TaskRow and so on TaskDetail): `true` for a to-do.
- For a to-do: `parent: null`, `parent_name: null`, `parent_type: null`.
- `due_date` may be `null`, for a to-do only.
- `editable` on a to-do's TaskDetail is
  `["title", "description", "status", "due_date", "priority", "assignee", "record"]`; on every
  other task it is unchanged (never contains `"record"`).

The record endpoints (`/customers/<id>/tasks/`, `/accounts/<id>/tasks/`, `/tasks/`) never return a
to-do, and `due_date` stays **required** on their `POST` (`{"due_date": ["This field is required."]}`
as today).

---

## 2. The feed

### 2.1 `GET /work/feed/`

The caller's desk, one list in eight groups. Query parameters:

| Param | Values | Default |
|---|---|---|
| `kind` | comma-separated subset of `approval, rule_review, question, draft, task, todo, suggestion` | every kind |
| `group` | one of the eight group keys | absent: the whole feed |
| `cursor` | a group's `next` value, exactly as received | absent: the first page |

Without `group`: the whole feed (shape below). With `group` (and an optional `cursor`): one
group's page (§2.5).

Response `200`:

```json
{
  "groups": [
    {"key": "decide", "count": 3, "items": [], "next": null},
    {"key": "overdue", "count": 1, "items": [], "next": null},
    {"key": "today", "count": 0, "items": [], "next": null},
    {"key": "week", "count": 0, "items": [], "next": null},
    {"key": "later", "count": 0, "items": [], "next": null},
    {"key": "no_date", "count": 2, "items": [], "next": null},
    {"key": "blocked", "count": 0, "items": [], "next": null},
    {"key": "suggested", "count": 4, "items": [], "next": null}
  ],
  "hidden": 2,
  "failed": []
}
```

- `groups`: always all eight, always in this order, empty ones included (`count: 0`,
  `items: []`, `next: null`). The page hides empty groups.
- `count`: the group's full total for the asked kinds (not just this page). Each group returns
  at most **50** items; `next` is a cursor string when more exist, else `null`.
- `hidden`: how many items of the asked kinds wait on the caller's desk about records they can
  no longer open. Never named, never listed (§2.4).
- `failed`: the asked kinds whose source failed to load, in the order
  `approval, rule_review, question, draft, task, todo, suggestion`. Their items are absent and
  their counts are 0; the rest of the feed is complete. Still `200`. `task` and `todo` share one
  source and always fail together.

| Group key | Holds | Order |
|---|---|---|
| `decide` | `approval`, `rule_review`, `question`, `draft` | oldest `at` first; ties: `rule_review`, `approval`, `question`, `draft`, then id |
| `overdue` | `task`, `todo` past due and not Blocked | `due_date`, then priority (high, medium, low), then `created_at`, then id |
| `today` | due today, not Blocked | same |
| `week` | due in 1 to 7 days, not Blocked | same |
| `later` | due in more than 7 days, not Blocked | same |
| `no_date` | no due date, not Blocked (to-dos only: see Decision 1) | priority, `created_at`, id |
| `blocked` | status `blocked`, whatever the date | `due_date` (no date last), priority, `created_at`, id |
| `suggested` | `suggestion` | newest `at` first, then id descending |

An item is in exactly one group. A Blocked task is only in `blocked`, never `overdue`.

### 2.2 FeedItem

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
  "detail": {}
}
```

| Field | Type | Meaning |
|---|---|---|
| `key` | string | `<source>:<id>`, stable and unique across the feed. Sources: `agent_action`, `rule_review`, `question`, `draft`, `task` (tasks **and** to-dos: a to-do keeps its key when a record is attached), `recommendation`. |
| `kind` | `approval \| rule_review \| question \| draft \| task \| todo \| suggestion` | |
| `id` | integer | The source row's id: what its action endpoint takes. |
| `title` | string | See the per-kind table. |
| `record` | `{"type": "customer" \| "account", "id", "name"}` or `null` | `customer` links `/organizations/<id>`, `account` links `/accounts/<id>`. Always a record the caller may open. |
| `from` | `{"type": "agent" \| "rule" \| "person" \| "revenact", "label": string}` | Who put it there. |
| `at` | timestamp | When it was proposed, asked, drafted, created or recommended (`created_at` of the row). |
| `due_date` | date or `null` | Tasks and to-dos only; `null` for every other kind and for a dateless to-do. |
| `priority` | `"high" \| "medium" \| "low"` or `null` | Tasks and to-dos only. |
| `private` | boolean | `true` for a to-do only ("Only you"). |
| `actions` | string[] | What the caller may do from the row (§2.3). Empty means read-only. |
| `detail` | object | Kind-specific payload so existing components render without another request (per-kind table). |

| kind | Source (unchanged rules) | `title` | `record` | `from` | `detail` |
|---|---|---|---|---|---|
| `approval` | `AgentAction` status `proposed` on the caller's Me desk (`brain.desk.agent_actions(reader, Me, sessions)`) | the action's title | its record, or `null` (workspace-level) | `{"type": "agent", "label": "CS agent" \| "Sales agent" \| "Ops agent"}` | Brain Waiting's agent-action `detail`: the ActionPayload (`GET /agents/actions/<id>/`) plus `"session": {"id", "title"} \| null` (title `"Shared conversation"` unless the caller sees the whole conversation) |
| `rule_review` | `RuleReview` waiting on one of the caller's rules (`brain.desk.rule_reviews`) | `"<Survey\|Campaign> from <rule name>"` | `null` | `{"type": "rule", "label": "<rule name>"}` | `{"rule_id", "rule_name", "review_kind": "survey" \| "campaign", "counts": RuleReview.counts as stored — survey `{"people", "records"}`, campaign `{"reach", "skipped"}`, "review": RuleReview payload \| null}` (`review` only when the caller owns the rule, always true on My work) |
| `question` | `knowledge.Question` open and assigned to the caller (`brain.desk.questions`) | the question's text, first 200 characters | its organisation or `null` | `{"type": "person", "label": "<asker's name>"}` | `{"text": "<full text>", "asked_by": {"id", "name"}}` |
| `draft` | the caller's own `ReplyDraft` with status `open` (Communications › Drafts) on a record they may open | email: the draft's subject, or `"Reply to an email"` when blank; ticket: `"Reply on <ticket number>"` | its record | `{"type": "agent", "label": "CS agent" \| "Sales agent"}` | `{"channel": "email" \| "ticket"}` |
| `task` | open `Task` (not completed) with a record, assigned to the caller, that they may read (`task_access.openable_tasks`) | the task's title | its record | `agent` → `{"type": "agent", "label": "AI agent"}`; `rule` → `{"type": "rule", "label": "A rule"}`; `recommendation` → `{"type": "revenact", "label": "Revenact"}`; otherwise the creator `{"type": "person", "label": "<name>"}`, or `{"type": "revenact", "label": "Revenact"}` with no creator | the TaskRow (§1.3) |
| `todo` | open `Task` with no record created by the caller | the title | `null` | `{"type": "person", "label": "<caller's name>"}` | the TaskRow (§1.3), `private: true`, `parent: null` |
| `suggestion` | open `Recommendation` with the caller as recipient (`rec_access.decidable(reader, "me")`) of kind `renewal_due`, `health_drop`, `urgent_tickets` or `anomaly`, on a record they may open | the recommendation's title | its record | `{"type": "revenact", "label": "Revenact"}` | the RecommendationRow (`GET /work/recommendations/` item: `id, kind, title, why, record, suggested_assignee, recipient, defaults, agent_action: null, created_at`) |

Recommendations of the kinds `overdue_tasks`, `open_questions` and `agent_action` never appear in
the feed (an overdue task is already in `overdue`, a question in `decide`, an agent action as an
`approval`), so nothing is shown twice.

### 2.3 Actions and the endpoints they call

The feed never decides anything itself: each action calls the item's existing route, unchanged.

| kind | action | When offered | Call | Success | Conflicts and refusals |
|---|---|---|---|---|---|
| approval | `approve` | `agents.deciding.may_decide(reader, action)` (owner, above the owner, or view-all; an owner change also needs the owner-change right) | `POST /agents/actions/<id>/approve/` body `{}`; a `task.create` may send `{"assignee_id", "title", "due_date", "priority"}` | `200 {"action": ActionPayload}` | `409 {"code": "ALREADY_DECIDED", "detail": "<Name> already applied this.", "action": ...}` (verbs: applied, rejected, undid, expired; `Revenact` when nobody); `409 {"code": "EXPIRED", "detail": "This action has expired: <reason>.", "action": ...}`; `409 CHANGED_SINCE`, `409 OWNER_LIMIT` (detail as sent); `403 {"code": "CANT_DECIDE", "detail": "You can't decide this action."}`; `404 {"code": "NO_SUCH_ACTION", "detail": "No such action."}` |
| approval | `reject` | same | `POST /agents/actions/<id>/reject/` body `{"note"?: string ≤ 255}` | `200 {"action": ...}` | as approve; `400 {"note": ["Keep the note under 255 characters."]}` |
| approval | (undo, from the toast) | after an approve | `POST /agents/actions/<id>/undo/` | `200 {"action": ...}` | `409 NOT_APPLIED`, `410 {"code": "UNDO_EXPIRED", "detail": "Undo is available for 7 days after an action applies."}`, `409 CHANGED_SINCE` |
| rule_review | `approve` | the caller owns the rule | `POST /rules/reviews/<id>/approve/` | `200 {"survey_send_id"}` or `200 {"campaign_send_id"}` | `400` Surveys'/Campaigns' own body (stored on the review); `409 {"detail": "This review has already been decided."}`; `404 {"detail": "Not found."}` |
| rule_review | `skip` | same | `POST /rules/reviews/<id>/skip/` | `200` the review | same 409/404 |
| question | `answer` | the caller is the assignee, or holds `manage_users` | client only: opens Copilot on the question, as Brain › Waiting does today | | |
| draft | `open` | always | client only: Communications › Drafts on `detail`'s draft (`GET /communications/drafts/<id>/`) | | |
| task, todo | `done` | always (every task on the desk is the caller's to tick; Decision 12) | `PATCH /tasks/<id>/` body `{"status": "completed"}` | `200` TaskDetail | `404 {"detail": "No such task."}` (lost access or deleted); undo: `PATCH` `{"status": "<previous>"}` (+ `blocked_reason` if it was blocked) |
| task, todo | `open` | always | client only: the task panel (`GET /tasks/<id>/`) | | |
| suggestion | `add` | always on My work (the caller is the recipient) | `POST /work/recommendations/<id>/assign/` body `{"assignee_id": <caller's id>}` (title, date and priority default server-side from `detail.defaults`) | `201 {"recommendation": Decided, "task": TaskRow}` | `409 {"code": "ALREADY_DECIDED", "detail": "<Name> already assigned this." \| "This recommendation has expired." \| "This recommendation was already dismissed.", "recommendation": ...}`; `403 {"code": "CANT_DECIDE", "detail": "You can't decide this recommendation."}`; `404 {"detail": "No such recommendation."}` |
| suggestion | `assign` | same | same route, `{"assignee_id": <chosen>, "title"?, "due_date"?, "priority"?}`; the picker is `GET /work/assignees/?customer=<id>` or `?account=<id>` | same | as add, plus `400 ASSIGNEE_CANNOT_OPEN` |
| suggestion | `dismiss` | same | `POST /work/recommendations/<id>/dismiss/` body `{"reason": "already_handled" \| "not_relevant" \| "wrong_person" \| "other", "note"?: string}` (note required, ≤ 255, for `other`) | `200 {"recommendation": Decided}` | `400 {"reason": ["Choose already handled, not relevant, wrong person or other."]}`, `400 {"note": ["Say why."]}`; 409/403/404 as add |

`actions` values in order: approval `["approve", "reject"]` (or `[]`), rule_review
`["approve", "skip"]` (or `[]`), question `["answer"]` (or `[]`), draft `["open"]`, task and todo
`["done", "open"]`, suggestion `["add", "assign", "dismiss"]`.

A 404 or 403 from an action means the caller lost access: remove the row and add one to the
page's `hidden`. A 409 means someone else decided first: remove the row with the `detail`
sentence when it names a person, else "Already decided."

### 2.4 Privacy

- Every source is the existing rule, reused: `brain.desk` for approvals, reviews and questions;
  `task_access.openable_tasks` for tasks; `rec_access.decidable` + `openable` for suggestions.
  Nobody sees more than they see today.
- `hidden` counts, for the asked kinds: approvals, reviews and questions on the caller's Me desk
  they can no longer open (`waiting - readable`, as Brain › Waiting); open tasks assigned to them
  on records they can no longer open (as `GET /work/today/`); their own open drafts on records
  they can no longer open; open suggestions of the four kinds sent to them about records they
  can no longer open. To-dos are never hidden.
- A to-do is only ever in its creator's feed.

### 2.5 Paging: `GET /work/feed/?group=<key>&cursor=<next>`

Returns one group's next page (or, without `cursor`, its first page: the page's "Try again" for
one failed group uses this):

```json
{
  "group": {"key": "overdue", "count": 61, "items": [], "next": null},
  "failed": []
}
```

- Same `kind` filter as the feed request (send the same `kind`).
- The cursor is opaque (URL-safe text). It is a keyset position ("after this item"), not an
  offset: rows the caller acted on since the first page never cause another row to be skipped
  or repeated. `count` is the group's current total.
- `failed` lists the asked kinds of **this group** whose source failed (their items absent).
- Errors (400):

| When | Body |
|---|---|
| `group` not one of the eight | `{"group": ["Choose decide, overdue, today, week, later, no_date, blocked or suggested."]}` |
| `cursor` without `group` | `{"cursor": ["Say which group to page."]}` |
| `cursor` malformed, or made for another group | `{"cursor": ["That list has changed. Reload Work."]}` |
| `kind` empty or naming an unknown kind (feed, page and filter alike) | `{"kind": ["Choose approval, rule_review, question, draft, task, todo or suggestion."]}` |

### 2.6 `GET /work/feed/count/`

The one Work badge. No parameters (`kind` is ignored).

```json
{"decide": 3, "overdue": 1, "badge": 4, "failed": []}
```

- `decide`: the full `decide` group count (approvals, reviews, questions and drafts the caller
  may open).
- `overdue`: the full `overdue` group count (tasks and to-dos past due, not Blocked).
- `badge`: `decide + overdue`. Suggestions are not in the badge.
- `failed`: as in the feed; a failed source counts 0.
- Counts only: no rows are read. This replaces the Work badge's two calls
  (`/work/recommendations/` and `/work/today/`) and `/brain/waiting/count/`, which keep working
  in this delivery.

### 2.7 Performance

- `GET /work/feed/`: the query count does not grow with the number of items (pinned by a test
  that adds every kind five more times and compares). Ceiling: `FEED_CEILING` in
  `services/work/tests/test_feed_queries.py`, set at the measured value (Task 9 of the backend plan).
- `GET /work/feed/count/`: same, ceiling `COUNT_CEILING`.
- No query uses `DISTINCT` (Postgres 16: a join made unique with DISTINCT plans badly); every
  visibility rule is an `id IN` subquery. A test asserts it over every query of both routes.

---

## 3. Decisions (gaps the spec left, decided here)

| # | Decision | Cost if wrong |
|---|---|---|
| 1 | Only a to-do may be dateless. A task with a record always has a date: DB constraint `task_dated_unless_todo`, `POST /work/todos/` with a record requires `due_date`, attaching a record to a dateless to-do requires one, and `PATCH due_date: null` is refused on a task with a record. About forty existing readers (agents' evidence, task events, tracking, plans, Brain, digests) call `due_date.isoformat()` or compare it. | Medium: if the owner wants dateless record tasks, drop the constraint and audit those readers (about one task's work). |
| 2 | `customers.personal.visible_tasks` drops every to-do, for everyone including the creator. The creator reads their to-dos only through the new `task_access.readable_tasks` (task panel, feed, digest). The spec put a "creator only" rule in `visible_tasks`; some callers read `visible_tasks(reader, Task.objects.all())` (Brain graph, agents' payload and evidence checks) and would then show the creator's to-dos there. Same privacy, fewer leaks. | Low: a future surface that should show one's own to-dos must call `readable_tasks`. |
| 3 | `key` uses the source row's name (`agent_action:41`, as the spec's example), not the item kind; a to-do keeps `task:<id>` when a record is attached. | Low: the frontend uses `key` only to identify rows. |
| 4 | Items carry a `detail` object (not in the spec's item shape) reusing today's Waiting, Recommended and TaskRow payloads, so `AgentActionDecision`, `ReviewDecision`, the assign form and the task panel work without a request per row. | Low: payload size. |
| 5 | The cursor is a keyset position bound to its group; `?group=` without a cursor returns the first page (per-group retry). | Low. |
| 6 | Tasks and to-dos come from one source (one query per group, so they interleave in date order); they fail together. | Low. |
| 7 | "Overdue" is Work's (`work.states`: past due and not Blocked). Brain › Waiting counts a Blocked past-due task as overdue, so the new badge can be lower than the old Brain badge. | Low. |
| 8 | `draft` items are the caller's own open drafts (as Communications › Drafts), not drafts by others that the caller may also read (a report's), and only on records the caller may still open (the rest in `hidden`). | Low: a manager wanting reports' drafts belongs in the Team queue (delivery 2). |
| 9 | `suggested` is newest first (as Recommended today); `decide` ties order rule_review, approval, question, draft. | Trivial. |
| 10 | `hidden`, `count` and `failed` all honour `?kind=`; the eight groups are always returned. | Trivial. |
| 11 | The count adds `failed` to the spec's shape; a failed source counts 0. | Trivial. |
| 12 | Task and to-do rows always offer `done`: everything on the desk is assigned to the caller, who may always move its status (an ordinary task: whoever reads it may edit it; a plan's task: its assignee may tick it). No per-row permission query. | Low: if a rule later stops an assignee ticking a task, compute it per row. |
| 13 | A record id the caller cannot open (or that does not exist) is a `400` on the `record` field, not a 404, on both POST and PATCH. | Low. |
| 14 | A record can be attached to a to-do, never removed or changed on a task. | Low: add later if asked. |
| 15 | `POST /work/todos/` returns `{task, item, group}`, so quick-add can place the row without reloading the feed. | Low. |
| 16 | To-do creation is not audited (record task creation is not either); edits are, as `task.update`, with `"record"` among `fields` when one is attached. | Low: add a `task.create` event later. |
| 17 | Notification links and the digest's link stay `/work/today?task=<id>` and `/work/today` in this delivery: the delivery-1 frontend redirects `/work/today` to `/work/mine` keeping the query. They move in delivery 2 with `/work/today`'s removal. | None if the frontend redirect ships; else links land on the old page. |
| 18 | `from` for a task: agent, rule and recommendation by `source`; otherwise the creator's name, or Revenact. `priority` and `due_date` are `null` for non-task kinds. | Trivial. |
| 19 | The digest counts the caller's open to-dos with their tasks (overdue, due today, blocked), naming a to-do without a record; nobody else's digest ever counts them. | Low. |
