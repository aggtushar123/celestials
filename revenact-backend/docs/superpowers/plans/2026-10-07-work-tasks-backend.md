# Work, delivery 1: tasks you can work (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A task gets a description, Blocked with a reason, a source and an activity trail; every way a task is made stores a real assignee, writes a `created` event and tells the assignee; and the Work section reads Today, Team and a drill-down, with a task panel that edits, comments and reassigns.

**Architecture:** `customers.Task` gains `description`, `blocked_reason`, `source` and an `(assignee, status, due_date)` index, and `customers.TaskEvent` sits beside it. Three small customers modules hold the rules: `task_access.py` (the twice-filter, who may be given a task, which fields a reader may change), `task_changes.py` (`add_task`, one event per changed field, the `task_assigned` notification) and `task_payloads.py` (the row and panel shapes). `task_views.py` replaces the old status-only `TaskDetailView`. A new `services/work` app (no models yet; delivery 2 adds them) serves Today, Team, the drill-down and the assignee picker, every list built from `id IN` subqueries.

**Tech Stack:** Django 5.2, DRF 3.18, PostgreSQL 16 (CI/prod; local 15), Channels (in-memory layer under test), Django test runner with `--parallel`, ruff 0.16.

**Spec:** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/work-spec/docs/superpowers/specs/2026-10-07-work-round-design.md` (react-ts-app). This plan covers §0, §1.1–§1.4, §4 and §5 as they apply to delivery 1, and the backend half of §6. §1.5 is the frontend plan's; §2 and §3 are deliveries 2 and 3. Names are chosen so they slot in: `Task.Source.RECOMMENDATION`, the `recommended`/`nudged`/`escalated` event kinds, `add_task(..., facts=...)`, `Notification.kind` widened to 32 characters (`recommendations_waiting` is 23), and `services/work/clock.today_for` as the one place "today" is decided.

## Global Constraints

- **Postgres 16.** Every visibility filter is an `id__in` subquery; never a join made unique with `.distinct()`. `services/work` and the new customers modules get a no-DISTINCT test like `services/brain/tests/test_desk.py::test_no_distinct_in_any_desk_query`. The old `TaskListView`'s `.distinct()` goes too (its filters are already `id IN`).
- **Twice-filter.** Every Work list and count is `personal.visible_tasks(reader)` AND a record the reader may open (`visible_customers`/`visible_accounts`), through `task_access.openable_tasks`. Anything outside it is counted (`hidden`), never named. **Owner decision 2026-10-07:** a reader with `view_all_accounts` or the Leadership function reads every task (`visible_tasks` returns the queryset unfiltered for them), still only on records they may open; Task 2 widens `visible_tasks` and deliberately rewrites the test that pinned the old rule (`services/customers/tests/test_tasks_personal.py`).
- **Assignment.** A new assignee must be an active member of the workspace who can open the task's record (`scoping.can_open`), else `400 {"code": "ASSIGNEE_CANNOT_OPEN", "detail": ...}`.
- **`assignee_name`** equals `assignee.name` on every save that touches the assignee (`Task.save`), and `blocked_reason` is non-empty exactly when `status` is `blocked` (`Task.save` plus a CheckConstraint).
- **Migrations.** customers `0055_task_work` (schema) and `0056_task_source_backfill` (data: `plan_id` set → `plan`; else `initiative_id` set → `agent`; else `manual`), notifications `0007_task_assigned`. `makemigrations --check --dry-run` must report no changes.
- **Notifications** use `push_on_commit=True` and never go to the person acting. A record is named in a message only to a recipient who may open it.
- **Tests.** `venv/bin/python manage.py test <labels> --parallel --noinput`, in the foreground. Never run two Django test runs at once: they share the test database name.
- **Lint.** `venv/bin/ruff check .` and `venv/bin/ruff format --check .`. Ruff formats the Python inside Markdown fences in `docs/` too, so run `venv/bin/ruff format docs/` after editing docs.
- **Shards.** `venv/bin/python scripts/ci_shard_labels.py --check 4` after adding test modules.
- **Semgrep.** Never return a URL built with an f-string from a DRF view; notification links are stored strings, not responses, so none is added here.
- **Git.** Branch `feat/work-tasks`. `venv` and `.env` are symlinks: never commit them; always `git add <explicit paths>`. Never `git stash`. Every commit message ends with exactly this line:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

### API contract (binding for the frontend plan)

The same text is committed standalone as `docs/superpowers/plans/2026-10-07-work-tasks-api.md`; Task 8 copies it into `docs/API_CONTRACTS.md`.

Backend plan: `docs/superpowers/plans/2026-10-07-work-tasks-backend.md`. Spec: react-ts-app
`docs/superpowers/specs/2026-10-07-work-round-design.md` §1.4. Every path is under `/api/v1/`,
every route is `IsAuthenticated`, every body is JSON. Dates are `YYYY-MM-DD`; timestamps are
ISO 8601 UTC as DRF writes them (`2026-10-07T09:30:00.123456Z`). "Today" is the server's date
(UTC) until delivery 3 moves it to the workspace timezone.

#### Who reads a task

Every list, count and route below reads a task only when **both** hold:

- the task rule: the caller made it, is its assignee, is above either in the org chart, **or holds
  `view_all_accounts` or the Leadership function** (they read every task); a seeded task with
  neither creator nor assignee is everyone's;
- the record rule: the caller may open the task's organisation or account.

Whoever reads an ordinary task may also change and reassign it. A plan's task keeps the plan's
rules (see `editable` below). Anything else is counted in `hidden` where a route has one, and never
named.

#### Shared shapes

**TaskRow** (every Work list):

```json
{
  "id": 41,
  "title": "Call Pizza Hut",
  "due_date": "2026-10-05",
  "priority": "high",
  "status": "pending",
  "blocked_reason": "",
  "source": "manual",
  "parent": {"kind": "customer", "id": 7, "name": "Pizza Hut"},
  "assignee": {"id": 3, "name": "Carl CSM", "active": true},
  "plan": null
}
```

- `priority`: `high | medium | low`.
- `status`: `pending | in-progress | blocked | completed`. `blocked_reason` is non-empty exactly
  when `status` is `blocked`.
- `source`: `manual | plan | rule | recommendation | agent`.
- `parent.kind`: `customer` (an organisation, `/organizations/<id>`) or `account`
  (`/accounts/<id>`).
- `assignee`: `{id, name, active}`, or `null` for an old seeded task. `active: false` is a
  deactivated person ("Unassigned (was X)").
- `plan`: `{id, name}` or `null`.

**Event** (a task's activity trail, oldest first):

```json
{
  "id": 9,
  "kind": "status",
  "actor": {"id": 3, "name": "Carl CSM"},
  "data": {"from": "pending", "to": "blocked", "reason": "Waiting on legal"},
  "body": "",
  "created_at": "2026-10-07T09:30:00.123456Z"
}
```

`actor` is `null` when Revenact did it (a rule, a recommendation). `data` by `kind`:

| kind | data | body |
|---|---|---|
| `created` | `{source, assignee: {id, name} \| null}`, plus `plan: <id>` (plan), `rule: <id>` (rule; the rule is never named), `proposal: <id>` (agent), and for an agent task whose suggested person was not used `suggested: "<name>"`, `fallback: "no_member" \| "cannot_open"` | `""` |
| `recommended` | `{facts: ["Renews in 9 days", ...]}` (delivery 2 writes these) | `""` |
| `assigned` | `{from: {id, name} \| null, to: {id, name}}` | `""` |
| `status` | `{from, to}`, plus `reason` when `to` is `blocked` | `""` |
| `due_changed` | `{from: "YYYY-MM-DD", to: "YYYY-MM-DD"}` | `""` |
| `edited` | `{field: "title" \| "priority", from, to}` or `{field: "description"}` | `""` |
| `comment` | `{}` | the comment |
| `nudged`, `escalated` | delivery 3 | `""` |

#### `GET /work/today/`

The caller's own open tasks (assigned to them, not completed), on records they may open.

```json
{
  "today": "2026-10-07",
  "groups": {
    "overdue": [TaskRow],
    "today": [TaskRow],
    "week": [TaskRow],
    "later": [TaskRow],
    "blocked": [TaskRow]
  },
  "counts": {"overdue": 1, "today": 1, "week": 1, "later": 1, "blocked": 1},
  "hidden": 1
}
```

- A row is in exactly one group. `blocked` takes every Blocked task whatever its date; the rest
  go by `due_date`: before today `overdue`, today `today`, the next 7 days `week`, after that
  `later`.
- Rows in each group are ordered by `due_date`, then `id`; each group lists at most 100 rows.
  `counts` are the full totals.
- `hidden`: tasks assigned to the caller on records they can no longer open. Counted, never
  listed.
- The sidebar badge is `counts.overdue`.

#### `GET /work/team/?scope=me|team|company`

`scope` defaults to the caller's widest (`GET /brain/scopes/` lists them; Team is shown when the
caller has `team` or `company`). `me`: the caller; `team`: the caller and everyone below them;
`company`: every member of the workspace.

```json
{
  "scope": "team",
  "today": "2026-10-07",
  "people": [
    {
      "person": {"id": 3, "name": "Carl CSM", "active": true},
      "open": 5,
      "overdue": 1,
      "blocked": 1,
      "oldest_overdue": "2026-10-05"
    }
  ],
  "hidden": 1
}
```

- Counts are over open tasks the caller may read. `open` includes overdue and blocked;
  `overdue` is past due and not Blocked; `oldest_overdue` is `null` when nothing is overdue.
- Every active person in the scope has a row, zero or not. A deactivated person appears only
  while they hold readable open tasks (`active: false`).
- Ordered by `overdue` (most first), then `open`, then name.
- `hidden`: open tasks assigned to the scope's people that the caller may not read ("N tasks you
  can't open"). For a view-all reader that is only tasks on records they cannot open (normally
  none); for a Leadership reader without view-all, tasks on records outside what they may open;
  for anyone else, also tasks outside their chain.
- Refusals: `400 {"code": "SCOPE_UNKNOWN", "detail": "Choose me, team or company."}`;
  `403 {"code": "SCOPE_NOT_ALLOWED", "detail": "You can't see that view."}`.

#### `GET /work/tasks/?assignee=<id>&state=open|overdue|blocked`

The Team drill-down: that person's open tasks in that state that the caller may read. `state`
defaults to `open`.

```json
{"tasks": [TaskRow]}
```

- Ordered by `due_date`, then `id`, at most 200 rows. No `hidden` here: the Team row already
  carries the scope's hidden total.
- A person in another workspace, or one the caller reads nothing of, is `{"tasks": []}`.
- Refusals: `400 {"assignee": ["Choose a person."]}`;
  `400 {"state": ["Choose open, overdue or blocked."]}`.

#### `GET /work/assignees/?customer=<id>` or `?account=<id>`

The assignee picker for a record: every active member of the workspace, with whether they can
open it.

```json
{
  "people": [
    {"id": 1, "name": "Alice Admin", "function": "leadership", "can_open": true},
    {"id": 4, "name": "Dana CSM", "function": "cs", "can_open": false}
  ]
}
```

- Ordered by name. `can_open: false` people are shown disabled ("Can't open this account").
- Refusals: `400 {"detail": "Name one organisation or account."}` (neither, both, or not a
  number); `404 {"detail": "Not found."}` for a record the caller cannot open.

#### `GET /tasks/<id>/`

The task panel.

```json
{
  "id": 41,
  "title": "Call Pizza Hut",
  "description": "",
  "due_date": "2026-10-05",
  "priority": "high",
  "priority_display": "High",
  "status": "pending",
  "status_display": "Pending",
  "blocked_reason": "",
  "source": "manual",
  "parent": {"kind": "customer", "id": 7, "name": "Pizza Hut"},
  "parent_name": "Pizza Hut",
  "parent_type": "customer",
  "assignee": {"id": 3, "name": "Carl CSM", "active": true},
  "assignee_name": "Carl CSM",
  "created_by": {"id": 2, "name": "Mona Manager"},
  "created_at": "2026-10-01T08:00:00.000000Z",
  "plan": null,
  "milestone": null,
  "initiative": null,
  "editable": ["title", "description", "status", "due_date", "priority", "assignee"],
  "events": [Event]
}
```

- `plan`/`milestone`: `{id, name}` or `null`; `initiative`: `{id, title}` or `null`.
- `editable`: the fields this caller may change. All six on an ordinary task (for every reader of
  it, view-all and Leadership readers included). On a plan's task,
  all six for the plan's editors (its owner and anyone above them) while the plan is open,
  otherwise `["status"]`.
- `404 {"detail": "No such task."}` for a task the caller may not read: another workspace, a
  record they cannot open, or (for a caller without `view_all_accounts` or the Leadership function)
  outside the task's chain: its creator, its assignee and anyone above either.

#### `PATCH /tasks/<id>/`

Any of:

```json
{
  "title": "Call Pizza Hut again",
  "description": "Ask about the renewal.",
  "status": "blocked",
  "blocked_reason": "Waiting on legal",
  "due_date": "2026-10-10",
  "priority": "medium",
  "assignee_id": 2
}
```

- `200` with the `GET /tasks/<id>/` shape. Unknown keys are ignored; nothing changed writes
  nothing.
- `blocked_reason` is required (non-blank, at most 255) when the resulting status is `blocked`,
  may be sent alone to change the reason of a Blocked task, and is cleared when the status is
  anything else.
- Each changed field writes its event (see the table above). A changed assignee is told with a
  `task_assigned` notification, unless they are the caller; the previous assignee is not told.
  The change is audited as `task.update` with `fields`, and `from`/`to` when `status` changed.
- Refusals:
  - `400 {"code": "ASSIGNEE_CANNOT_OPEN", "detail": "That person can't open this organisation."}`
    (or `"... this account."`): the new assignee is not an active member of the workspace who
    can open the task's record;
  - `400 {"assignee_id": ["Choose who does it."]}` for `null` or not a number;
  - `400 {"status": ["Choose pending, in progress, blocked or completed."]}`;
  - `400 {"blocked_reason": ["Say what it's blocked on."]}` or
    `{"blocked_reason": ["Keep the reason under 255 characters."]}`;
  - `400 {"title": ["Give the task a title."]}` (blank or missing value) or
    `{"title": ["Keep the title under 255 characters."]}`;
  - `400 {"description": ["Keep the description under 10,000 characters."]}`;
  - `400 {"priority": ["Choose high, medium or low."]}`;
  - `400 {"due_date": ["Choose a date."]}`;
  - `400 {"non_field_errors": ["Send the fields as one object."]}` for a body that is not an
    object;
  - a plan's task: `403 {"detail": "Only the plan's owner or their managers can change it."}`
    for a field other than `status` from someone who doesn't edit the plan, and
    `400 {"non_field_errors": ["This plan is finished; only its tasks can change."]}` for one
    on a finished plan;
  - `404 {"detail": "No such task."}`.

#### `POST /tasks/<id>/comments/`

```json
{"body": "Called, left a voicemail."}
```

- `201` with the new `comment` Event. Anyone who may read the task may comment.
- Refusals: `400 {"body": ["Write a comment."]}`;
  `400 {"body": ["Keep a comment under 5,000 characters."]}`; `404 {"detail": "No such task."}`.

#### Changed existing routes

**`POST /customers/<id>/tasks/`, `POST /customers/<id>/accounts/<id>/tasks/`,
`POST /accounts/<id>/tasks/`** (New task):

```json
{
  "title": "Prep the QBR",
  "due_date": "2026-10-14",
  "priority": "medium",
  "assignee_id": 3,
  "description": ""
}
```

- `assignee_id` is optional (default: the caller). It must be an active member who can open the
  record, else `400 {"code": "ASSIGNEE_CANNOT_OPEN", ...}` as above.
- `status` (default `pending`) and `blocked_reason` are accepted as on PATCH.
- `201`, and the response row (and every row of these lists' `GET`) now also carries
  `description`, `blocked_reason`, `source` and `created_at`.
- The task gets a `created` event; its assignee is told (`task_assigned`) unless that is the
  caller.

**`GET /tasks/`** is unchanged in shape; a row's `status` may now be `blocked`.

**`PATCH /plans/<id>/tasks/<tid>/`** refuses `status: "blocked"`
(`400 {"status": ["Choose pending, in progress or completed."]}`): Blocked needs a reason, so it
is set from the task panel.

#### Notifications

New kind `task_assigned` on `GET /notifications/`:

```json
{
  "id": 12,
  "kind": "task_assigned",
  "message": "Mona Manager assigned you “Prep the QBR” on Pizza Hut.",
  "link": "/work/today?task=41",
  "actor": {"id": 2, "name": "Mona Manager"},
  "is_read": false,
  "created_at": "2026-10-07T09:30:00.123456Z"
}
```

- Sent when a task is created for someone else (a person, a rule or the AI agent), and when a
  task is reassigned through `PATCH /tasks/<id>/`. Plans keep their own `plan_task_assigned`.
- `actor` is `null` and the message starts "Revenact assigned you" for a rule's task.
- A recipient who cannot open the record reads
  "<who> assigned you a task on an account you can't open." (or "an organisation"), with no
  title or record name.

---

## Decisions (where the spec is silent or the code forces a detail)

1. **Read and edit (owner decision 2026-10-07).** `visible_tasks` is widened: the creator, the assignee, anyone above either, **or a reader with `view_all_accounts` or the Leadership function** reads a task, always combined with the record rule (they see tasks only on records they may open). §1.2's edit rule is then exactly that read rule, so whoever reads an ordinary task may change and reassign it: view-all and Leadership readers included, even outside the task's chain. A seeded task with neither creator nor assignee (readable by everyone) stays tickable by everyone, as the Cockpit tick-off has always allowed (`TaskStatusTests`). A plan's task keeps the plan's rules (Decision 2). The widening reaches every existing `visible_tasks` caller (organisation and account story, Brain's desk, doing and graph, plans, Copilot, activity tracking); a `SystemActor` passes the view-all check first, so it never reads `function`.
2. **Plan tasks through `/tasks/<id>/`.** `status` (and `blocked_reason`) may come from anyone who reads the task, as the existing route allowed, routed through `plans.status.set_task_status`. Every other field needs `plans.access.can_edit` (403 `NOT_EDITOR`) on an open plan (400 `PLAN_FINISHED`). The plan's row lock is taken before the task's, the order every plan write uses. `set_task_status` gains `blocked_reason=""` so the CheckConstraint holds.
3. **The plan route refuses Blocked.** `PATCH /plans/<id>/tasks/<tid>/` offers pending, in progress and completed only (its existing message). Blocked needs a reason and is set from the task panel. Leaving Blocked by any route clears the reason (`Task.save`).
4. **Plans keep `plan_task_assigned`.** §1.3 says every path notifies with `task_assigned`, but plans already notify once per person per action with a count. Sending `task_assigned` as well would double every plan start, so plan creation keeps `plan_task_assigned` and writes `created` events only. A plan task reassigned through `/tasks/<id>/` is told with `task_assigned`, like any task there.
5. **Rules notify the rule owner too.** A rule's task is Revenact's act (`actor` null, "Revenact assigned you …"), so "unless the assignee is the actor" never skips; the rule owner, when they are the assignee, is told as well. The rule is named nowhere (its id is in the event's `data` only): a rule's name is confidential (`rules.access.readable_rules`).
6. **The agent's fallback ladder.** The matched member must also be able to open the organisation; otherwise, or with no unique match, the organisation owner (if active), else the approver. The `created` event records `suggested` and `fallback` (`no_member` or `cannot_open`). The approver becomes `created_by` (until now agent tasks had none), so they can read the work they approved.
7. **Scenarios are untouched.** `scenarios/engine.py`'s Create Task is a canvas-era fifth path with a text-only assignee ("Scenario Automation"); the Scenarios round is deferred, so it stays as it is, with `source` defaulting to `manual`.
8. **What "overdue" means.** Past due and not Blocked, everywhere (`services/work/states.overdue_q`): Today's `overdue` group, Team's `overdue` count, the drill's `state=overdue` and the badge. A Blocked task is in the `blocked` group whatever its date.
9. **"week".** The next seven days after today (`today < due_date <= today + 7`).
10. **Team scope.** `me` is accepted as well as `team` and `company` (the frontend's switch has all three); the default is the reader's widest (`brain.scope.default_key`). People in a scope are the scope's `owner_ids`, or every member of the workspace for Company. A deactivated person gets a row only while they hold readable open tasks.
11. **No `hidden` on the drill-down.** It would count a named person's unreadable tasks for any caller; the Team row already carries the scope's `hidden` total, and the drill lists exactly what that row counted.
12. **The assignee picker needs its own route.** §1.5 asks for members with a "can open" flag; `GET /work/assignees/?customer=|account=` serves it (one `can_open` per member: a workspace's members are few).
13. **Assignee errors.** Every assignee that is not an active member who can open the record (another workspace, inactive, unknown id, can't open) answers the one 400 `ASSIGNEE_CANNOT_OPEN`, on PATCH and on the three nested creates. A null or non-numeric id is a field error (`Choose who does it.`).
14. **Comments notify nobody** in delivery 1 (the spec names no notification for them), and are not audited (the event is the record; `task.update` covers field changes).
15. **`TaskEvent` is not backfilled** for existing tasks; the panel shows `created_at` and an empty trail for them.
16. **Notification kind length.** `Notification.kind` grows from 20 to 32 characters now, so delivery 2's `recommendations_waiting` needs no second widening.

## File Structure

- Modify `services/customers/models.py`: `Task` (fields, `Status.BLOCKED`, `Source`, index, constraint, `save`, docstring) and the new `TaskEvent`.
- Create `services/customers/migrations/0055_task_work.py` (generated) and `0056_task_source_backfill.py` (hand-written).
- Modify `services/notifications/models.py` (`TASK_ASSIGNED`, `max_length=32`, the docstring) and create `services/notifications/migrations/0007_task_assigned.py` (generated).
- Modify `services/customers/scoping.py`: add `can_open`. Modify `services/plans/access.py` (drop its copy), `services/plans/starting.py` and `services/plans/validation.py` (import it from scoping).
- Create `services/customers/task_access.py`: `openable_tasks`, `assignee_for`, `AssigneeCannotOpen`, `editable_fields`, `record_of`, `SAY_WHY_BLOCKED`.
- Create `services/customers/task_changes.py`: `link`, `person`, `notify_assigned`, `created_event`, `created_events`, `add_task`, `snapshot`, `changed_fields`, `record_changes`.
- Create `services/customers/task_payloads.py`: `ROW_RELATED`, `DETAIL_RELATED`, `parent_payload`, `task_row`, `event_payload`, `task_detail`.
- Create `services/customers/task_views.py`: `TaskDetailView` (GET/PATCH) and `TaskCommentView`; remove the old `TaskDetailView` from `services/customers/views.py`.
- Modify `services/customers/views.py` (`_create_task`, `TaskListView` without `.distinct()`) and `services/customers/serializers.py` (`TaskSerializer`).
- Modify `services/rules/actions.py` (`create_task`), `services/plans/views.py` (task create and edit), `services/plans/starting.py` (bulk start), `services/plans/status.py` (`set_task_status`), `services/plans/serializers.py` (no Blocked), `services/metrics/proposals.py` (`match_member`, `approve`).
- Create the `services/work` app: `__init__.py`, `apps.py`, `clock.py`, `states.py`, `today.py`, `team.py`, `drill.py`, `assignees.py`, `views.py`, `urls.py`, `tests/__init__.py`, `tests/fixtures.py` and the test modules. Modify `config/settings.py` (`INSTALLED_APPS`) and `config/urls.py`.
- Create `e2e/test_work_flow.py`.
- Update `docs/API_CONTRACTS.md`, `docs/audit-events.md`, `docs/data-classification.md`, `docs/product/01-prd.md`, `docs/product/02-trd.md`, `docs/product/05-backend-schema.md`, `docs/product/06-implementation-plan.md`.

---

### Task 1: The model — Task fields, `TaskEvent`, the backfill and the `task_assigned` kind

**Files:**
- Modify: `services/customers/models.py` (the `Task` class at ~1333–1457; add `TaskEvent` right after it)
- Create: `services/customers/migrations/0055_task_work.py` (generated)
- Create: `services/customers/migrations/0056_task_source_backfill.py`
- Modify: `services/notifications/models.py`
- Create: `services/notifications/migrations/0007_task_assigned.py` (generated)
- Test: `services/customers/tests/test_task_model.py`

**Interfaces:**
- Produces `Task.Status.BLOCKED = "blocked"` (choices order: pending, in-progress, blocked, completed).
- Produces `Task.Source` with `MANUAL="manual"`, `PLAN="plan"`, `RULE="rule"`, `RECOMMENDATION="recommendation"`, `AGENT="agent"`.
- Produces `Task.description` (TextField, blank), `Task.blocked_reason` (CharField 255, blank), `Task.source` (CharField 16, default manual).
- Produces `TaskEvent(task, actor, kind, data, body, created_at)`, `related_name="events"`, ordering `["created_at", "id"]`, with `TaskEvent.Kind` `CREATED, ASSIGNED, STATUS, DUE_CHANGED, EDITED, COMMENT, RECOMMENDED, NUDGED, ESCALATED` (values `created, assigned, status, due_changed, edited, comment, recommended, nudged, escalated`).
- Produces `backfill(Task)` in migration `0056_task_source_backfill` (importable with `import_module`).
- Produces `Notification.Kind.TASK_ASSIGNED = "task_assigned"`; `Notification.kind` `max_length=32`.

- [ ] **Step 1: Write the failing tests**

Create `services/customers/tests/test_task_model.py`:

```python
"""The Work round's Task: a description, Blocked with its reason, where it
came from, its activity trail, and `assignee_name` kept equal to the
assignee's name. The backfill reads each existing task's source from its
links."""

from datetime import timedelta
from importlib import import_module

from django.db import IntegrityError, transaction
from django.utils import timezone

from services.customers.models import Task, TaskEvent
from services.metrics.models import Initiative
from services.notifications.models import Notification
from services.plans.tests.fixtures import PlanFixture

# A migration module's name is not an identifier; the backfill lives in the
# migration and is imported, not copied (see test_churn_reason_migration).
backfill = import_module("services.customers.migrations.0056_task_source_backfill").backfill


class TaskModelTests(PlanFixture):
    def task(self, **fields):
        values = {
            "customer": self.pizza,
            "title": "Call them",
            "due_date": self.today + timedelta(days=2),
            "priority": "medium",
            "assignee": self.csm,
            **fields,
        }
        return Task.objects.create(**values)

    def test_a_new_task_is_manual_pending_and_unblocked_with_no_description(self):
        task = self.task()
        self.assertEqual(
            (task.source, task.status, task.blocked_reason, task.description),
            ("manual", "pending", "", ""),
        )

    def test_assignee_name_follows_the_assignee_on_every_save(self):
        task = self.task(assignee_name="Someone else")
        self.assertEqual(Task.objects.get(pk=task.pk).assignee_name, "Carl CSM")
        task.assignee = self.other
        task.save(update_fields=["assignee"])
        self.assertEqual(Task.objects.get(pk=task.pk).assignee_name, "Dana CSM")

    def test_a_task_with_no_assignee_keeps_its_text_name(self):
        task = self.task(assignee=None, assignee_name="Edgar Holmes")
        self.assertEqual(Task.objects.get(pk=task.pk).assignee_name, "Edgar Holmes")

    def test_leaving_blocked_clears_the_reason_even_on_a_status_only_save(self):
        task = self.task(status="blocked", blocked_reason="Waiting on legal")
        task.status = "in-progress"
        task.save(update_fields=["status"])
        self.assertEqual(Task.objects.get(pk=task.pk).blocked_reason, "")

    def test_blocked_needs_a_reason_and_only_blocked_has_one(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.task(status="blocked", blocked_reason="")
        task = self.task()
        with self.assertRaises(IntegrityError), transaction.atomic():
            Task.objects.filter(pk=task.pk).update(blocked_reason="Stray")

    def test_events_read_oldest_first_and_go_with_their_task(self):
        task = self.task()
        first = TaskEvent.objects.create(task=task, kind="created", actor=self.csm)
        second = TaskEvent.objects.create(task=task, kind="comment", body="Called, no answer")
        self.assertEqual(list(task.events.all()), [first, second])
        self.assertIsNone(second.actor)
        self.assertEqual(second.data, {})
        task.delete()
        self.assertFalse(TaskEvent.objects.exists())

    def test_the_backfill_reads_plan_then_initiative_then_manual(self):
        plan = self.build_plan()
        initiative = Initiative.objects.create(
            organisation=self.org,
            title="Halve ARR at risk",
            metric="at_risk_arr",
            target_value=1,
            target_by=timezone.localdate() + timedelta(days=30),
            baseline_as_of=timezone.localdate(),
        )
        agent = self.task(title="Save play", initiative=initiative)
        both = plan.tasks.first()
        Task.objects.filter(pk=both.pk).update(initiative=initiative)
        manual = self.task(title="Plain")
        Task.objects.update(source="recommendation")

        backfill(Task)

        sources = dict(Task.objects.values_list("pk", "source"))
        self.assertEqual(sources[agent.pk], "agent")
        self.assertEqual(sources[both.pk], "plan")
        self.assertEqual(sources[manual.pk], "manual")
        self.assertEqual({sources[t.pk] for t in plan.tasks.all()}, {"plan"})

    def test_task_assigned_is_a_kind_with_room_for_delivery_twos(self):
        self.assertEqual(Notification.Kind.TASK_ASSIGNED, "task_assigned")
        width = Notification._meta.get_field("kind").max_length
        self.assertGreaterEqual(width, len("recommendations_waiting"))
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.customers.tests.test_task_model --parallel --noinput`
Expected: an import error (`cannot import name 'TaskEvent'`).

- [ ] **Step 3: Change `Task` and add `TaskEvent`**

In `services/customers/models.py`, in the `Task` docstring, replace the last paragraph (from `` `assignee_name` is plain text, not a FK `` to `seeded organisation."""`) with:

```text
    `assignee` is the real person; `assignee_name` is kept equal to their
    name on every save that touches the assignee (`save` below), and is the
    only name an old seeded task has. `source` says how the task was made;
    `blocked_reason` is set exactly while the status is Blocked (`save`, and
    the CheckConstraint). Its history is `TaskEvent` (`task.events`)."""
```

Replace the `Status` class and add `Source` after it:

```python
class Status(models.TextChoices):
    PENDING = "pending", "Pending"
    IN_PROGRESS = "in-progress", "In Progress"
    BLOCKED = "blocked", "Blocked"
    COMPLETED = "completed", "Completed"


class Source(models.TextChoices):
    MANUAL = "manual", "Added by a person"
    PLAN = "plan", "From a plan"
    RULE = "rule", "From a rule"
    RECOMMENDATION = "recommendation", "Recommended by Revenact"
    AGENT = "agent", "From the AI agent"
```

Directly below `title = models.CharField(max_length=255)` add:

```python
    description = models.TextField(blank=True)
```

Directly below the `status = ...` line add:

```python
    blocked_reason = models.CharField(max_length=255, blank=True)
    source = models.CharField(max_length=16, choices=Source.choices, default=Source.MANUAL)
```

In `Task.Meta`, add `indexes` and a third constraint:

```python
    class Meta:
        ordering = ["due_date", "-id"]
        indexes = [
            # Work's Today and Team: one person's open tasks by due date.
            models.Index(fields=["assignee", "status", "due_date"], name="task_assignee_status_due"),
        ]
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(customer__isnull=False, account__isnull=True)
                    | models.Q(customer__isnull=True, account__isnull=False)
                ),
                name="task_belongs_to_exactly_one_parent",
            ),
            models.CheckConstraint(
                condition=models.Q(milestone__isnull=True) | models.Q(plan__isnull=False),
                name="task_milestone_needs_plan",
            ),
            models.CheckConstraint(
                condition=(
                    (models.Q(status="blocked") & ~models.Q(blocked_reason=""))
                    | (~models.Q(status="blocked") & models.Q(blocked_reason=""))
                ),
                name="task_blocked_reason_only_when_blocked",
            ),
        ]
```

Add `save` to `Task`, between `clean` and `__str__`:

```python
def save(self, *args, **kwargs):
    """`assignee_name` follows `assignee`, and leaving Blocked clears the
    reason, on every save, a partial `update_fields` save included."""
    fields = kwargs.get("update_fields")
    touched = None if fields is None else set(fields)
    extra = set()
    if self.assignee_id is not None and (touched is None or touched & {"assignee", "assignee_id"}):
        self.assignee_name = self.assignee.name[:150]
        extra.add("assignee_name")
    if (
        self.status != self.Status.BLOCKED
        and self.blocked_reason
        and (touched is None or "status" in touched)
    ):
        self.blocked_reason = ""
        extra.add("blocked_reason")
    if touched is not None:
        kwargs["update_fields"] = sorted(touched | extra)
    super().save(*args, **kwargs)
```

Directly after the `Task` class (before `class Note`), add:

```python
class TaskEvent(models.Model):
    """One line of a task's activity trail (Work round, spec §1.1): who did
    what to it, and when. `actor` null means Revenact itself (a rule, a
    recommendation, a nudge). `data` holds the values a sentence is written
    from (from/to, the source, a recommendation's facts); `body` holds a
    comment. An event is read exactly where its task is
    (`task_access.openable_tasks`), never on its own."""

    class Kind(models.TextChoices):
        CREATED = "created", "Created"
        ASSIGNED = "assigned", "Assigned"
        STATUS = "status", "Status changed"
        DUE_CHANGED = "due_changed", "Due date changed"
        EDITED = "edited", "Edited"
        COMMENT = "comment", "Comment"
        RECOMMENDED = "recommended", "Recommended"
        NUDGED = "nudged", "Nudged"
        ESCALATED = "escalated", "Escalated"

    task = models.ForeignKey(Task, related_name="events", on_delete=models.CASCADE)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="+",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    kind = models.CharField(max_length=16, choices=Kind.choices)
    data = models.JSONField(default=dict, blank=True)
    body = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["task", "created_at"], name="taskevent_task_created")]

    def __str__(self):
        return f"{self.kind} on task {self.task_id}"
```

- [ ] **Step 4: Widen the notification kind and add `task_assigned`**

In `services/notifications/models.py`, add to `Kind` after `CAMPAIGN_SENT`:

```python
        TASK_ASSIGNED = "task_assigned", "Task assigned"
```

Replace the `kind` field with:

```python
    # 32: room for the Work round's longer kinds (`recommendations_waiting`).
    kind = models.CharField(max_length=32, choices=Kind.choices)
```

Replace the docstring's first paragraph (from `"""A real, personal notification` to `to notify there yet.`) with:

```text
    """A real, personal notification behind the Navbar's bell. Every kind
    has a real recipient: Copilot invites and hand-offs, owner assignment,
    questions, segment and rule digests, plans, campaigns, and tasks
    assigned to someone (`task_assigned`, services/customers/task_changes.py;
    a task's assignee is a real `User` since customers migration 0041).
```

- [ ] **Step 5: Generate the schema migrations**

Run: `venv/bin/python manage.py makemigrations customers --name task_work && venv/bin/python manage.py makemigrations notifications --name task_assigned`
Expected: `services/customers/migrations/0055_task_work.py` with exactly these operations: `AddField` `description`, `blocked_reason` and `source` on `task`; `AlterField` `status` (four choices); `CreateModel` `TaskEvent`; `AddIndex` `task_assignee_status_due`; `AddConstraint` `task_blocked_reason_only_when_blocked` (Django may order them differently). And `services/notifications/migrations/0007_task_assigned.py` with one `AlterField` on `kind` (`max_length=32`, thirteen choices). If anything else appears, the model edits above differ from what was intended: fix the model, delete the file, regenerate.

- [ ] **Step 6: Write the data migration**

Create `services/customers/migrations/0056_task_source_backfill.py`:

```python
"""Where each existing task came from (Work round, spec §1.1): a plan's tasks
carry `plan`; an approved AI-agent proposal's carry `initiative` when the
proposal served one; everything else is called manual. Rule-made tasks
cannot be told apart (no rule link is stored) and read as manual.

`backfill` takes the model so the test can run it on the real one
(services/customers/tests/test_task_model.py)."""

from django.db import migrations


def backfill(Task):
    Task.objects.filter(plan__isnull=False).update(source="plan")
    Task.objects.filter(plan__isnull=True, initiative__isnull=False).update(source="agent")
    Task.objects.filter(plan__isnull=True, initiative__isnull=True).update(source="manual")


def forwards(apps, schema_editor):
    backfill(apps.get_model("customers", "Task"))


class Migration(migrations.Migration):
    dependencies = [
        ("customers", "0055_task_work"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
```

- [ ] **Step 7: Run the tests and the migration check**

Run: `venv/bin/python manage.py makemigrations --check --dry-run && venv/bin/python manage.py test services.customers.tests.test_task_model --parallel --noinput`
Expected: `No changes detected`, then PASS (8 tests).

- [ ] **Step 8: Run the apps that make or read tasks**

Run: `venv/bin/python manage.py test services.customers services.plans services.rules services.notifications --parallel --noinput`
Expected: PASS. (`Task.save` now fills `assignee_name` from the assignee; no existing test sets a different name next to a real assignee except the one above.)

- [ ] **Step 9: Commit**

```bash
git add services/customers/models.py services/customers/migrations/0055_task_work.py services/customers/migrations/0056_task_source_backfill.py services/notifications/models.py services/notifications/migrations/0007_task_assigned.py services/customers/tests/test_task_model.py
git commit -m "feat(customers): tasks get a description, Blocked with a reason, a source and a trail

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Who may read and be given a task, and how a task is made and changed

**Files:**
- Modify: `services/customers/scoping.py` (add `can_open` after `get_url_account`)
- Modify: `services/plans/access.py` (remove `can_open` and the now-unused `Customer` import)
- Modify: `services/plans/starting.py:24` and `services/plans/validation.py:17` (import `can_open` from scoping)
- Modify: `services/customers/personal.py` (`visible_tasks`: view-all and Leadership read every task)
- Create: `services/customers/task_access.py`
- Create: `services/customers/task_changes.py`
- Test: `services/customers/tests/test_task_changes.py`
- Modify (deliberately rewritten): `services/customers/tests/test_tasks_personal.py`

**Interfaces:**
- Consumes `Task`, `TaskEvent`, `Task.Source`, `Notification.Kind.TASK_ASSIGNED` (Task 1); `personal.visible_tasks(user, queryset)`; `scoping.visible_customers(user)`, `visible_accounts(user)`.
- Produces, in `services/customers/scoping.py`: `can_open(user, record) -> bool` (active, and may open the Customer or Account).
- Produces, in `services/customers/personal.py`: `visible_tasks(user, queryset)` returns `queryset` unfiltered for a reader with `view_all_accounts` (`scoping.sees_everything`) or `function == "leadership"`; everyone else keeps the chain rule. Callers still add the record rule.
- Produces, in `services/customers/task_access.py`:
  - `ASSIGNEE_CANNOT_OPEN = "ASSIGNEE_CANNOT_OPEN"`, `SAY_WHY_BLOCKED = "Say what it's blocked on."`, `FIELDS = ("title", "description", "status", "due_date", "priority", "assignee")`;
  - `record_of(task) -> Customer | Account`;
  - `openable_tasks(user, queryset) -> QuerySet` (the twice-filter);
  - `assignee_for(organisation_id, pk, record) -> User`, raising `AssigneeCannotOpen(record)` (a DRF `ValidationError` whose detail is `{"code": "ASSIGNEE_CANNOT_OPEN", "detail": "That person can't open this organisation."}` or `"... this account."`);
  - `editable_fields(user, task) -> list[str]` (needs `task.plan` loaded for a plan task).
- Produces, in `services/customers/task_changes.py`:
  - `link(task) -> "/work/today?task=<id>"`; `person(user) -> {"id", "name"} | None`;
  - `notify_assigned(task, *, actor) -> Notification | None`;
  - `created_event(task, *, actor, **data) -> TaskEvent` (unsaved); `created_events(tasks, *, actor, **data) -> list[TaskEvent]` (bulk insert);
  - `add_task(*, parent, title, due_date, priority, assignee, created_by, actor, source, description="", status="pending", blocked_reason="", facts=None, notify_assignee=True, event_data=None, **links) -> Task`;
  - `snapshot(task) -> dict`; `changed_fields(task, before) -> list[str]` (API names, fixed order: title, description, priority, due_date, assignee, status, blocked_reason); `record_changes(task, before, *, actor) -> list[str]`.

- [ ] **Step 1: Write the failing tests**

Create `services/customers/tests/test_task_changes.py`:

```python
"""The task rules every Work route uses: the twice-filter, who may be given a
task, how a task is made (its event and its notification) and how an edit
becomes one event per field.

BrainFixture's world: Carl owns Pizza Hut, Dough Co, Pizza EMEA and Taco
East and reports to Mona; Dana owns Taco Bell and Taco West; Alice (admin)
sees every account; Lee (Leadership, no view-all) opens only Loose Ltd."""

from datetime import timedelta

from services.accounts.models import Organisation, User
from services.brain.tests.fixtures import BrainFixture
from services.customers.models import Task, TaskEvent
from services.customers.scoping import can_open
from services.customers.task_access import (
    AssigneeCannotOpen,
    assignee_for,
    editable_fields,
    openable_tasks,
)
from services.customers.task_changes import (
    add_task,
    changed_fields,
    record_changes,
    snapshot,
)
from services.notifications.models import Notification


class TaskChangesFixture(BrainFixture):
    def make(self, title="Call them", *, on=None, assignee=None, actor=None, **extra):
        values = {
            "parent": on or self.pizza,
            "title": title,
            "due_date": self.today + timedelta(days=2),
            "priority": "medium",
            "assignee": assignee or self.csm,
            "created_by": actor,
            "actor": actor,
            "source": Task.Source.MANUAL,
            **extra,
        }
        return add_task(**values)

    def fresh(self, user):
        return User.objects.get(pk=user.pk)


class OpenableTests(TaskChangesFixture):
    def test_the_task_rule_and_the_record_rule_both_apply(self):
        mine = self.make("On Pizza Hut", actor=self.csm)
        west = self.make("On Taco West", on=self.west, actor=self.other)
        everything = Task.objects.all()

        def readable(user):
            return set(openable_tasks(self.fresh(user), everything).values_list("title", flat=True))

        self.assertEqual(readable(self.csm), {"On Pizza Hut"})  # assigned, but can't open West
        self.assertEqual(readable(self.mona), {"On Pizza Hut"})  # above Carl; West is Dana's
        self.assertEqual(readable(self.other), {"On Taco West"})  # she made it
        # view-all reads every task, on every record it opens (owner decision 2026-10-07)
        self.assertEqual(readable(self.admin), {"On Pizza Hut", "On Taco West"})
        # Leadership reads every task too, but Lee opens neither record
        self.assertEqual(readable(self.lee), set())
        self.assertEqual(readable(self.stranger), set())
        self.assertEqual({mine.source, west.source}, {"manual"})

    def test_leadership_reads_any_task_on_a_record_it_opens(self):
        self.make("On Loose Ltd", on=self.loose, actor=self.csm)
        rows = openable_tasks(self.fresh(self.lee), Task.objects.all())
        self.assertEqual(list(rows.values_list("title", flat=True)), ["On Loose Ltd"])
        # Dana opens Loose Ltd too (nobody owns it), but the task is Carl's
        rows = openable_tasks(self.fresh(self.other), Task.objects.all())
        self.assertEqual(list(rows.values_list("title", flat=True)), [])


class VisibleTasksTests(TaskChangesFixture):
    """`personal.visible_tasks` alone (the task rule, before the record rule)."""

    def test_view_all_and_leadership_read_every_task_others_their_chain(self):
        from services.customers.personal import visible_tasks

        self.make("Carl's", actor=self.csm)
        self.make("Dana's", on=self.taco, assignee=self.other, actor=self.other)
        everything = Task.objects.all()

        def titles(user):
            return set(visible_tasks(self.fresh(user), everything).values_list("title", flat=True))

        self.assertEqual(titles(self.admin), {"Carl's", "Dana's"})  # view_all_accounts
        self.assertEqual(titles(self.lee), {"Carl's", "Dana's"})  # Leadership function
        self.assertEqual(titles(self.mona), {"Carl's"})  # above Carl only
        self.assertEqual(titles(self.other), {"Dana's"})


class AssigneeTests(TaskChangesFixture):
    def test_an_active_member_who_can_open_the_record(self):
        self.assertEqual(assignee_for(self.org.pk, self.mona.pk, self.pizza), self.mona)
        self.assertTrue(can_open(self.mona, self.pizza))

    def test_everyone_else_is_refused_with_one_code(self):
        gone = User.objects.create_user(
            email="gone@acme.io", password="x", name="Gone", organisation=self.org
        )
        User.objects.filter(pk=gone.pk).update(is_active=False)
        for pk in (self.other.pk, gone.pk, self.stranger.pk, 999_999, True, "3"):
            with self.subTest(pk=pk), self.assertRaises(AssigneeCannotOpen) as refused:
                assignee_for(self.org.pk, pk, self.pizza)
            self.assertEqual(
                refused.exception.detail,
                {
                    "code": "ASSIGNEE_CANNOT_OPEN",
                    "detail": "That person can't open this organisation.",
                },
            )

    def test_an_account_is_named_as_one(self):
        with self.assertRaises(AssigneeCannotOpen) as refused:
            assignee_for(self.org.pk, self.csm.pk, self.west)
        self.assertEqual(refused.exception.detail["detail"], "That person can't open this account.")

    def test_can_open_is_false_for_nobody_and_for_the_inactive(self):
        self.assertFalse(can_open(None, self.pizza))
        User.objects.filter(pk=self.csm.pk).update(is_active=False)
        self.assertFalse(can_open(self.fresh(self.csm), self.pizza))

    def test_an_ordinary_task_is_editable_in_every_field(self):
        task = self.make(actor=self.csm)
        self.assertEqual(
            editable_fields(self.csm, task),
            ["title", "description", "status", "due_date", "priority", "assignee"],
        )


class AddTaskTests(TaskChangesFixture):
    def notes(self):
        return list(
            Notification.objects.filter(kind="task_assigned").values_list(
                "recipient_id", "actor_id", "message", "link"
            )
        )

    def test_it_stores_the_person_writes_created_and_tells_the_assignee(self):
        task = self.make("Ship the deck", assignee=self.mona, actor=self.csm, description="Slides")
        self.assertEqual(
            (task.assignee, task.assignee_name, task.created_by, task.description),
            (self.mona, "Mona Manager", self.csm, "Slides"),
        )
        [event] = task.events.all()
        self.assertEqual((event.kind, event.actor), ("created", self.csm))
        self.assertEqual(
            event.data,
            {"source": "manual", "assignee": {"id": self.mona.pk, "name": "Mona Manager"}},
        )
        self.assertEqual(
            self.notes(),
            [
                (
                    self.mona.pk,
                    self.csm.pk,
                    "Carl CSM assigned you “Ship the deck” on Pizza Hut.",
                    f"/work/today?task={task.pk}",
                )
            ],
        )

    def test_nobody_is_told_about_their_own_task(self):
        self.make(assignee=self.csm, actor=self.csm)
        self.assertEqual(self.notes(), [])

    def test_revenact_tells_everyone_including_the_rule_owner(self):
        task = self.make(
            actor=None, created_by=self.csm, source=Task.Source.RULE, event_data={"rule": 7}
        )
        self.assertEqual(task.events.get().data["rule"], 7)
        self.assertIsNone(task.events.get().actor)
        [(recipient, actor, message, _)] = self.notes()
        self.assertEqual((recipient, actor), (self.csm.pk, None))
        self.assertEqual(message, "Revenact assigned you “Call them” on Pizza Hut.")

    def test_a_record_the_assignee_cannot_open_is_not_named(self):
        self.make("West handover", on=self.west, assignee=self.csm, actor=self.other)
        [(_, _, message, _)] = self.notes()
        self.assertEqual(message, "Dana CSM assigned you a task on an account you can't open.")

    def test_an_inactive_assignee_is_not_told(self):
        User.objects.filter(pk=self.mona.pk).update(is_active=False)
        self.make(assignee=self.fresh(self.mona), actor=self.csm)
        self.assertEqual(self.notes(), [])

    def test_a_recommendation_writes_its_facts(self):
        task = self.make(
            actor=None,
            source=Task.Source.RECOMMENDATION,
            facts=["Renews in 9 days", "Health fell 5.6 → 4.9 in 14 days"],
        )
        self.assertEqual(
            list(task.events.values_list("kind", "data")),
            [
                (
                    "created",
                    {
                        "source": "recommendation",
                        "assignee": {"id": self.csm.pk, "name": "Carl CSM"},
                    },
                ),
                (
                    "recommended",
                    {"facts": ["Renews in 9 days", "Health fell 5.6 → 4.9 in 14 days"]},
                ),
            ],
        )

    def test_notify_assignee_false_writes_the_event_only(self):
        task = self.make(assignee=self.mona, actor=self.csm, notify_assignee=False)
        self.assertEqual(task.events.count(), 1)
        self.assertEqual(self.notes(), [])


class RecordChangesTests(TaskChangesFixture):
    def test_one_event_per_changed_field(self):
        task = self.make(actor=self.csm)
        before = snapshot(task)
        task.title = "Call them again"
        task.description = "Ask about seats"
        task.priority = "high"
        task.due_date = self.today + timedelta(days=5)
        task.assignee = self.mona
        task.status, task.blocked_reason = "blocked", "Waiting on legal"
        task.save()

        names = record_changes(task, before, actor=self.csm)

        self.assertEqual(
            names,
            [
                "title",
                "description",
                "priority",
                "due_date",
                "assignee",
                "status",
                "blocked_reason",
            ],
        )
        rows = list(task.events.exclude(kind="created").values_list("kind", "data"))
        self.assertEqual(
            rows,
            [
                ("edited", {"field": "title", "from": "Call them", "to": "Call them again"}),
                ("edited", {"field": "priority", "from": "medium", "to": "high"}),
                ("edited", {"field": "description"}),
                (
                    "due_changed",
                    {
                        "from": (self.today + timedelta(days=2)).isoformat(),
                        "to": (self.today + timedelta(days=5)).isoformat(),
                    },
                ),
                (
                    "assigned",
                    {
                        "from": {"id": self.csm.pk, "name": "Carl CSM"},
                        "to": {"id": self.mona.pk, "name": "Mona Manager"},
                    },
                ),
                ("status", {"from": "pending", "to": "blocked", "reason": "Waiting on legal"}),
            ],
        )
        self.assertEqual(
            set(TaskEvent.objects.exclude(kind="created").values_list("actor", flat=True)),
            {self.csm.pk},
        )

    def test_a_new_reason_alone_is_a_status_event(self):
        task = self.make(actor=self.csm, status="blocked", blocked_reason="Legal")
        before = snapshot(task)
        task.blocked_reason = "Legal, then finance"
        self.assertEqual(changed_fields(task, before), ["blocked_reason"])
        record_changes(task, before, actor=self.csm)
        self.assertEqual(
            task.events.get(kind="status").data,
            {"from": "blocked", "to": "blocked", "reason": "Legal, then finance"},
        )

    def test_nothing_changed_writes_nothing(self):
        task = self.make(actor=self.csm)
        self.assertEqual(record_changes(task, snapshot(task), actor=self.csm), [])
        self.assertEqual(task.events.count(), 1)


class OtherWorkspaceTests(TaskChangesFixture):
    def test_a_stranger_is_never_assignable(self):
        other = Organisation.objects.get(pk=self.other_org.pk)
        with self.assertRaises(AssigneeCannotOpen):
            assignee_for(other.pk, self.csm.pk, self.pizza)
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.customers.tests.test_task_changes --parallel --noinput`
Expected: an import error (`cannot import name 'can_open' from 'services.customers.scoping'`).

- [ ] **Step 3: Move `can_open` into scoping**

Append to `services/customers/scoping.py`:

```python
def can_open(user, record) -> bool:
    """Whether `user` is active and may open `record` (a Customer or an
    Account): the one check behind every "who may this go to" rule (a plan's
    owner and assignees, a task's assignee, a notification naming a record)."""
    if user is None or not user.is_active:
        return False
    rows = visible_customers(user) if isinstance(record, Customer) else visible_accounts(user)
    # SOC2:AUTH-02 work goes only to people who can open its record
    return rows.filter(pk=record.pk).exists()
```

In `services/plans/access.py`, delete the `can_open` function and the line `from services.customers.models import Customer`. In `services/plans/starting.py` replace `from .access import can_open` with `from services.customers.scoping import can_open` (moving it up into the `services.` import block, sorted), and do the same in `services/plans/validation.py`.

- [ ] **Step 3b: Widen `visible_tasks` (owner decision 2026-10-07)**

In `services/customers/personal.py`, replace `visible_tasks` with:

```python
def visible_tasks(user, queryset):
    """A task is the creator's and the assignee's: either of them, or anyone
    above either, may read it. A reader with view_all_accounts or the
    Leadership function reads every task (owner decision 2026-10-07). A task
    with neither creator nor assignee (seeded) is everyone's. Callers always
    add the record rule: nobody reads a task on a record they cannot open."""
    from django.db.models import Q

    from services.accounts.hierarchy import subtree_ids
    from services.accounts.models import User

    from .scoping import sees_everything

    # SOC2:AUTH-02 view-all and Leadership read every task; the record rule still applies
    if sees_everything(user) or getattr(user, "function", None) == User.Function.LEADERSHIP:
        return queryset
    mine = {user.id, *subtree_ids(user)}
    # SOC2:AUTH-02 object-level rule for personal tasks
    return queryset.filter(
        Q(created_by__isnull=True, assignee__isnull=True)
        | Q(created_by_id__in=mine)
        | Q(assignee_id__in=mine)
    )
```

`sees_everything` runs first, so a `SystemActor` (no `function`) never reaches the second check; a Brain `ScopeActor` answers both with its principal's rights. No join and no DISTINCT is added: the widened branch filters nothing.

- [ ] **Step 3c: Rewrite the test that pinned the old rule, on purpose**

`services/customers/tests/test_tasks_personal.py` pinned "view-all does not widen task visibility" (Priya, holding `view_all_accounts`, saw only her own task). The owner reversed that on 2026-10-07, so this test is rewritten deliberately, not loosened to pass. It now pins: the chain rule for ordinary readers, every task for view-all and for Leadership, and the record rule for both. Replace the whole file with:

```python
"""Tasks are personal: the creator's, the assignee's, and their chains'. A
reader with view_all_accounts or the Leadership function reads every task
(owner decision 2026-10-07). Everyone, those two included, reads a task only
on a record they may open."""

from rest_framework import status
from rest_framework.test import APITestCase

from services.accounts.capabilities import Capability
from services.accounts.models import Organisation, Role, User
from services.customers.models import Customer, Task


class TaskVisibilityTests(APITestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name="Acme Inc")
        mk = lambda email, name, **kw: User.objects.create_user(  # noqa: E731
            email=email, password="x", name=name, organisation=self.org, **kw
        )
        self.alice = mk("alice@acme.io", "Alice", role=User.Role.ADMIN)
        self.carl = mk("carl@acme.io", "Carl", reports_to=self.alice)
        self.dana = mk("dana@acme.io", "Dana", reports_to=self.carl)
        self.priya = mk("priya@acme.io", "Priya", reports_to=self.alice)
        self.lena = mk("lena@acme.io", "Lena", function=User.Function.LEADERSHIP)
        lead = Role.objects.create(
            organisation=self.org,
            name="Lead",
            slug="lead",
            permissions=[Capability.VIEW_ALL_ACCOUNTS],
        )
        User.objects.filter(pk=self.priya.pk).update(role=lead)
        self.priya.refresh_from_db()
        # Dana's own customer: Carl and Alice open it from above, Priya by
        # view-all; Lena (Leadership, no view-all) cannot open it.
        self.pizza = Customer.objects.create(
            organisation=self.org, name="Pizza Hut", owner=self.dana
        )
        self.loose = Customer.objects.create(organisation=self.org, name="Loose Ltd")
        self.url = f"/api/v1/customers/{self.pizza.id}/tasks/"

    def task(self, title, created_by=None, assignee=None, customer=None):
        return Task.objects.create(
            customer=customer or self.pizza,
            title=title,
            assignee_name=assignee.name if assignee else "Seed",
            created_by=created_by,
            assignee=assignee,
            due_date="2026-09-30",
            priority="medium",
        )

    def seen_by(self, user, url=None):
        self.client.force_authenticate(user)
        return {row["title"] for row in self.client.get(url or self.url).data}

    def test_the_chain_reads_its_tasks_view_all_and_leadership_read_every_one(self):
        self.task("seeded")
        self.task("carl for dana", created_by=self.carl, assignee=self.dana)  # handed down
        self.task("dana for herself", created_by=self.dana, assignee=self.dana)
        self.task("alice for carl", created_by=self.alice, assignee=self.carl)
        self.task("priya's own", created_by=self.priya, assignee=self.priya)
        self.task("carl's loose", created_by=self.carl, assignee=self.carl, customer=self.loose)
        everything = {
            "seeded",
            "carl for dana",
            "dana for herself",
            "alice for carl",
            "priya's own",
            "carl's loose",
        }
        flat = "/api/v1/tasks/"

        # Dana sees what was handed to her and her own, never Carl's other tasks.
        self.assertEqual(self.seen_by(self.dana), {"seeded", "carl for dana", "dana for herself"})
        # Carl: his, his report's, and what Alice handed him.
        self.assertEqual(
            self.seen_by(self.carl, flat),
            {"seeded", "carl for dana", "dana for herself", "alice for carl", "carl's loose"},
        )
        # Changed on purpose (owner decision 2026-10-07): view-all reads every
        # task, not only its own. Before, Priya saw {"seeded", "priya's own"}.
        self.assertEqual(self.seen_by(self.priya, flat), everything)
        self.assertEqual(self.seen_by(self.alice, flat), everything)
        # Leadership reads every task too, on the records it may open (Loose Ltd only).
        self.assertEqual(self.seen_by(self.lena, flat), {"carl's loose"})
        self.client.force_authenticate(self.lena)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_404_NOT_FOUND)
        # The cross-company list follows the same rule.
        self.assertEqual(
            self.seen_by(self.dana, flat), {"seeded", "carl for dana", "dana for herself"}
        )

    def test_creating_a_task_stamps_the_creator_and_defaults_the_assignee_to_them(self):
        self.client.force_authenticate(self.carl)
        handed = self.client.post(
            self.url,
            {
                "title": "Ship the SSO fix",
                "due_date": "2026-09-30",
                "priority": "high",
                "assignee_id": self.dana.id,
            },
            format="json",
        )
        self.assertEqual(handed.status_code, status.HTTP_201_CREATED, handed.data)
        self.assertEqual(handed.data["created_by"]["name"], "Carl")
        self.assertEqual(handed.data["assignee"], {"id": self.dana.id, "name": "Dana"})
        self.assertEqual(handed.data["assignee_name"], "Dana")
        own = self.client.post(
            self.url,
            {"title": "Prep QBR", "due_date": "2026-10-01", "priority": "low"},
            format="json",
        )
        self.assertEqual(own.data["assignee"]["name"], "Carl")
        # Dana sees the one handed to her, not Carl's own.
        self.assertEqual(self.seen_by(self.dana), {"Ship the SSO fix"})
        # An assignee outside the organisation is refused.
        other = Organisation.objects.create(name="Globex")
        stranger = User.objects.create_user(
            email="z@globex.io", password="x", name="Zed", organisation=other
        )
        self.client.force_authenticate(self.carl)
        refused = self.client.post(
            self.url,
            {"title": "x", "due_date": "2026-10-01", "priority": "low", "assignee_id": stranger.id},
            format="json",
        )
        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)
```

- [ ] **Step 4: Write `task_access.py`**

Create `services/customers/task_access.py`:

```python
"""Who may read, change and be given a task (Work round, spec §1.2, §4).

**Read** is the twice-filter: the task's own rule (`personal.visible_tasks`:
its creator, its assignee, anyone above either, or any reader with
`view_all_accounts` or the Leadership function; a task with neither creator
nor assignee is everyone's) AND a record the reader may open. Both are
`id IN` subqueries, never a join made unique with DISTINCT (Postgres 16; see
scoping.visible_customers).

**Change** is read, for an ordinary task: §1.2's edit rule (creator,
assignee, anyone above either, view-all) is exactly the read rule, so
whoever reads it may change and reassign it. A plan's task keeps the plan's
rules: anyone who reads it may move its status (the task route's rule since
plans began); its other fields are the plan's editors' while the plan is
open.

**Given**: an active member of the workspace who may open the task's
record, else 400 `ASSIGNEE_CANNOT_OPEN`."""

from django.db.models import Q
from rest_framework.exceptions import ValidationError

from services.accounts.models import User

from .models import Customer
from .personal import visible_tasks
from .scoping import can_open, visible_accounts, visible_customers

ASSIGNEE_CANNOT_OPEN = "ASSIGNEE_CANNOT_OPEN"
SAY_WHY_BLOCKED = "Say what it's blocked on."
#: Every field `PATCH /tasks/<id>/` writes, in the API's names.
FIELDS = ("title", "description", "status", "due_date", "priority", "assignee")
STATUS_ONLY = ("status",)


class AssigneeCannotOpen(ValidationError):
    """400 `{"code": "ASSIGNEE_CANNOT_OPEN", "detail": ...}`. Raise it from a
    view, never inside a serializer's `validate`: DRF would wrap each string
    in a list there."""

    def __init__(self, record):
        noun = "organisation" if isinstance(record, Customer) else "account"
        super().__init__(
            {"code": ASSIGNEE_CANNOT_OPEN, "detail": f"That person can't open this {noun}."}
        )


def record_of(task):
    return task.customer if task.customer_id is not None else task.account


def openable_tasks(user, queryset):
    """`queryset` cut to the tasks `user` may read."""
    # SOC2:AUTH-02 the twice-filter: the task's own rule, on a record the reader may open
    return visible_tasks(user, queryset).filter(
        Q(customer_id__in=visible_customers(user).values("id"))
        | Q(account_id__in=visible_accounts(user).values("id"))
    )


def assignee_for(organisation_id, pk, record):
    """The active member `pk` of the workspace who may open `record`."""
    user = None
    if isinstance(pk, int) and not isinstance(pk, bool):
        user = User.objects.filter(pk=pk, organisation_id=organisation_id, is_active=True).first()
    # SOC2:AUTH-02 a task is given only to someone who can open its record
    if user is None or not can_open(user, record):
        raise AssigneeCannotOpen(record)
    return user


def editable_fields(user, task):
    """The fields `user` may change on a task they can read (see the module)."""
    if task.plan_id is None:
        return list(FIELDS)
    from services.plans.access import can_edit
    from services.plans.models import OPEN

    # SOC2:AUTH-02 a plan's task: status for its readers, the rest for the plan's editors
    if task.plan.status in OPEN and can_edit(user, task.plan):
        return list(FIELDS)
    return list(STATUS_ONLY)
```

- [ ] **Step 5: Write `task_changes.py`**

Create `services/customers/task_changes.py`:

```python
"""Every write to a task's people and history (Work round, spec §1.3, §1.4).

`add_task` is how a task is made, whatever made it: the real assignee (and
`assignee_name` with it), where it came from, a `created` event (and a
`recommended` one for a recommendation), and the assignee told unless they
are the one acting. A plan starts its tasks in one insert and tells
assignees its own way (`plans.notices`), so it calls `created_events`.

`snapshot` before an edit and `record_changes` after it turn the edit into
one event per changed field, for `PATCH /tasks/<id>/` and the plan's own
task route alike."""

from .models import Customer, Task, TaskEvent
from .scoping import can_open
from .task_access import record_of


def link(task):
    """The task panel, opened over Today."""
    return f"/work/today?task={task.pk}"


def person(user):
    return None if user is None else {"id": user.pk, "name": user.name}


def notify_assigned(task, *, actor):
    """`task_assigned` to the task's assignee, unless they are `actor` or
    inactive. `actor` None is Revenact. The record and the title are named
    only to an assignee who may open the record (spec §4)."""
    from services.notifications.models import Notification
    from services.notifications.realtime import notify

    assignee = task.assignee
    if assignee is None or not assignee.is_active:
        return None
    if actor is not None and actor.pk == assignee.pk:
        return None
    record = record_of(task)
    who = "Revenact" if actor is None else actor.name
    # SOC2:AUTH-02 a record is named only to someone who may open it
    if can_open(assignee, record):
        message = f"{who} assigned you “{task.title}” on {record.name}."
    else:
        noun = "an organisation" if isinstance(record, Customer) else "an account"
        message = f"{who} assigned you a task on {noun} you can't open."
    return notify(
        recipient=assignee,
        actor=actor,
        kind=Notification.Kind.TASK_ASSIGNED,
        message=message[:500],
        link=link(task),
        push_on_commit=True,
    )


def created_event(task, *, actor, **data):
    """The `created` event, unsaved: where the task came from and who has it."""
    return TaskEvent(
        task=task,
        actor=actor,
        kind=TaskEvent.Kind.CREATED,
        data={"source": task.source, "assignee": person(task.assignee), **data},
    )


def created_events(tasks, *, actor, **data):
    """One `created` event per task, in one insert."""
    return TaskEvent.objects.bulk_create([created_event(t, actor=actor, **data) for t in tasks])


def add_task(
    *,
    parent,
    title,
    due_date,
    priority,
    assignee,
    created_by,
    actor,
    source,
    description="",
    status=Task.Status.PENDING,
    blocked_reason="",
    facts=None,
    notify_assignee=True,
    event_data=None,
    **links,
):
    """A task on `parent` (a Customer or an Account). `links` are `plan`,
    `milestone` or `initiative`. `facts` (a recommendation's) writes a
    `recommended` event. The caller has already checked the assignee."""
    on = {"customer": parent} if isinstance(parent, Customer) else {"account": parent}
    task = Task.objects.create(
        **on,
        title=title,
        description=description,
        due_date=due_date,
        priority=priority,
        status=status,
        blocked_reason=blocked_reason,
        assignee=assignee,
        assignee_name="" if assignee is None else assignee.name[:150],
        created_by=created_by,
        source=source,
        **links,
    )
    created_event(task, actor=actor, **(event_data or {})).save()
    if facts is not None:
        TaskEvent.objects.create(
            task=task,
            actor=actor,
            kind=TaskEvent.Kind.RECOMMENDED,
            data={"facts": [str(fact) for fact in facts]},
        )
    if notify_assignee:
        notify_assigned(task, actor=actor)
    return task


TRACKED = (
    "title",
    "description",
    "priority",
    "due_date",
    "assignee_id",
    "status",
    "blocked_reason",
)


def snapshot(task):
    """The tracked values of `task` now, for `record_changes` after an edit."""
    return {**{name: getattr(task, name) for name in TRACKED}, "assignee": person(task.assignee)}


def changed_fields(task, before):
    """The API names of what changed since `before`, in a fixed order."""
    names = [
        n for n in ("title", "description", "priority", "due_date") if getattr(task, n) != before[n]
    ]
    if task.assignee_id != before["assignee_id"]:
        names.append("assignee")
    if task.status != before["status"]:
        names.append("status")
    if task.blocked_reason != before["blocked_reason"]:
        names.append("blocked_reason")
    return names


def _event(task, actor, kind, data):
    return TaskEvent(task=task, actor=actor, kind=kind, data=data)


def record_changes(task, before, *, actor):
    """One event per changed field since `before`; returns `changed_fields`.
    A description's text is not copied into its event."""
    names = changed_fields(task, before)
    kind = TaskEvent.Kind
    events = [
        _event(task, actor, kind.EDITED, {"field": n, "from": before[n], "to": getattr(task, n)})
        for n in ("title", "priority")
        if n in names
    ]
    if "description" in names:
        events.append(_event(task, actor, kind.EDITED, {"field": "description"}))
    if "due_date" in names:
        dates = {"from": before["due_date"].isoformat(), "to": task.due_date.isoformat()}
        events.append(_event(task, actor, kind.DUE_CHANGED, dates))
    if "assignee" in names:
        people = {"from": before["assignee"], "to": person(task.assignee)}
        events.append(_event(task, actor, kind.ASSIGNED, people))
    if "status" in names or "blocked_reason" in names:
        data = {"from": before["status"], "to": task.status}
        if task.status == Task.Status.BLOCKED:
            data["reason"] = task.blocked_reason
        events.append(_event(task, actor, kind.STATUS, data))
    TaskEvent.objects.bulk_create(events)
    return names
```

- [ ] **Step 6: Run the tests**

Run: `venv/bin/python manage.py test services.customers.tests.test_task_changes services.customers.tests.test_tasks_personal services.plans --parallel --noinput`
Expected: PASS (the plans suite proves `can_open` still reaches `starting` and `validation`).

- [ ] **Step 6b: Run every caller of `visible_tasks`**

Run: `venv/bin/python manage.py test services.customers services.organizations services.account_story services.brain services.copilot services.metrics services.plans --parallel --noinput`
(Add every test file this step changes to the commit below by its explicit path.)
Expected: PASS, except possibly assertions that a reader with `view_all_accounts` or the Leadership function does **not** see a task outside their chain (organisation and account story, Brain's desk, doing and graph, plans' `hidden_tasks`, Copilot grounding, activity tracking). Those are the owner's intended change: update each such assertion to the new rule and mark it `# view-all and Leadership read every task (owner decision 2026-10-07)`. Never change an assertion about a record the reader cannot open (the record rule is unchanged); any other failure is a bug in this task.

- [ ] **Step 7: Lint**

Run: `venv/bin/ruff check services/customers services/plans && venv/bin/ruff format services/customers services/plans`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add services/customers/scoping.py services/customers/personal.py services/plans/access.py services/plans/starting.py services/plans/validation.py services/customers/task_access.py services/customers/task_changes.py services/customers/tests/test_task_changes.py services/customers/tests/test_tasks_personal.py
git commit -m "feat(customers): task rules — view-all and Leadership read every task, assignees, add_task, per-field events

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Three creation paths — a person, a rule, a plan

**Files:**
- Modify: `services/customers/serializers.py` (`TaskSerializer`, ~862–932)
- Modify: `services/customers/views.py` (`_create_task`, ~1210)
- Modify: `services/rules/actions.py` (`create_task`, ~83–106)
- Modify: `services/plans/views.py` (`PlanTaskCreateView.post` ~592–621, `PlanTaskDetailView.patch` ~643–700)
- Modify: `services/plans/starting.py` (the task `bulk_create`, ~160–175)
- Modify: `services/plans/serializers.py` (`PlanTaskSerializer.status`)
- Test: `services/customers/tests/test_task_creation.py`

**Interfaces:**
- Consumes `add_task`, `created_events`, `snapshot`, `record_changes` (Task 2); `assignee_for`, `SAY_WHY_BLOCKED` (Task 2).
- Produces: the nested `POST .../tasks/` takes `assignee_id` (int, optional), `description`, `status`, `blocked_reason`, answers `400 ASSIGNEE_CANNOT_OPEN`, and its rows carry `description`, `blocked_reason`, `source`, `created_at`.
- Produces: rule tasks have `source="rule"`, a `created` event with `actor=None` and `data["rule"]`, and a `task_assigned` notification. Plan tasks have `source="plan"` and a `created` event with `data["plan"]`; plans keep `plan_task_assigned`. The plan route's PATCH writes per-field events and refuses `status: "blocked"`.

- [ ] **Step 1: Write the failing tests**

Create `services/customers/tests/test_task_creation.py`:

```python
"""Every way a task is made stores the real assignee, writes `created` and
tells the assignee (Work round §1.3). PlanFixture's world: Carl (CSM) owns
Pizza Hut and its account Pizza EMEA and reports to Mona; Dana owns Taco Bell
and cannot open Pizza Hut; Alice is an admin."""

from datetime import timedelta

from services.customers.models import Task, TaskEvent
from services.notifications.models import Notification
from services.plans.tests.fixtures import PlanFixture
from services.plans.tests.test_starting import StartFixture
from services.rules.actions import create_task
from services.rules.records import load
from services.rules.tests.fixtures import TASK


def told(kind="task_assigned"):
    return list(
        Notification.objects.filter(kind=kind).values_list("recipient_id", "message", "link")
    )


def person(user):
    return {"id": user.pk, "name": user.name}


class ManualTests(PlanFixture):
    def post(self, url, user=None, **body):
        values = {
            "title": "Ship the deck",
            "due_date": (self.today + timedelta(days=3)).isoformat(),
            "priority": "high",
            **body,
        }
        return self.api(user or self.csm).post(url, values, format="json")

    def test_a_task_for_someone_else_is_theirs_recorded_and_told(self):
        response = self.post(
            f"/api/v1/customers/{self.pizza.pk}/tasks/",
            assignee_id=self.mona.pk,
            description="The renewal deck",
        )
        self.assertEqual(response.status_code, 201, response.data)
        task = Task.objects.get()
        self.assertEqual(
            (task.assignee, task.assignee_name, task.created_by, task.source, task.description),
            (self.mona, "Mona Manager", self.csm, "manual", "The renewal deck"),
        )
        self.assertEqual(
            (
                response.data["source"],
                response.data["description"],
                response.data["blocked_reason"],
            ),
            ("manual", "The renewal deck", ""),
        )
        event = task.events.get()
        self.assertEqual(
            (event.kind, event.actor, event.data),
            ("created", self.csm, {"source": "manual", "assignee": person(self.mona)}),
        )
        self.assertEqual(
            told(),
            [
                (
                    self.mona.pk,
                    "Carl CSM assigned you “Ship the deck” on Pizza Hut.",
                    f"/work/today?task={task.pk}",
                )
            ],
        )

    def test_my_own_task_tells_nobody(self):
        response = self.post(f"/api/v1/customers/{self.pizza.pk}/tasks/")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Task.objects.get().assignee, self.csm)
        self.assertEqual(told(), [])

    def test_someone_who_cannot_open_the_record_is_refused(self):
        response = self.post(f"/api/v1/customers/{self.pizza.pk}/tasks/", assignee_id=self.other.pk)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data,
            {"code": "ASSIGNEE_CANNOT_OPEN", "detail": "That person can't open this organisation."},
        )
        self.assertFalse(Task.objects.exists())

    def test_an_account_task_is_checked_against_the_account(self):
        response = self.post(f"/api/v1/accounts/{self.emea.pk}/tasks/", assignee_id=self.mona.pk)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Task.objects.get().account, self.emea)
        refused = self.post(f"/api/v1/accounts/{self.emea.pk}/tasks/", assignee_id=self.other.pk)
        self.assertEqual(refused.data["detail"], "That person can't open this account.")

    def test_blocked_at_creation_needs_its_reason(self):
        url = f"/api/v1/customers/{self.pizza.pk}/tasks/"
        refused = self.post(url, status="blocked")
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(refused.data, {"blocked_reason": ["Say what it's blocked on."]})
        made = self.post(url, status="blocked", blocked_reason="  Waiting on legal ")
        self.assertEqual(made.status_code, 201, made.data)
        self.assertEqual(Task.objects.get().blocked_reason, "Waiting on legal")
        stray = self.post(url, blocked_reason="Ignored")
        self.assertEqual(stray.data["blocked_reason"], "")


class RuleTests(PlanFixture):
    def test_a_rule_task_is_revenacts_and_tells_its_assignee(self):
        rule = self.make_rule(actions=[TASK])
        [record] = load("customer", [self.pizza.pk])
        create_task(TASK, rule, record, "customer", today=self.today, made=set())

        task = Task.objects.get()
        self.assertEqual(
            (task.source, task.assignee, task.created_by), ("rule", self.csm, self.csm)
        )
        event = task.events.get()
        self.assertIsNone(event.actor)
        self.assertEqual(
            event.data, {"source": "rule", "assignee": person(self.csm), "rule": rule.pk}
        )
        self.assertEqual(
            told(),
            [
                (
                    self.csm.pk,
                    "Revenact assigned you “Call them” on Pizza Hut.",
                    f"/work/today?task={task.pk}",
                )
            ],
        )


class PlanTests(PlanFixture):
    def test_a_task_added_to_a_plan_is_recorded_and_told_the_plans_way(self):
        plan = self.build_plan()
        milestone = plan.milestones.get(name="Kick-off")
        response = self.api(self.csm).post(
            f"/api/v1/plans/{plan.pk}/tasks/",
            {
                "milestone": milestone.pk,
                "title": "Send the deck",
                "priority": "high",
                "due_date": (self.today + timedelta(days=3)).isoformat(),
                "assignee": self.mona.pk,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        task = plan.tasks.get(title="Send the deck")
        self.assertEqual(
            (task.source, task.assignee, task.created_by), ("plan", self.mona, self.csm)
        )
        self.assertEqual(
            task.events.get().data,
            {"source": "plan", "assignee": person(self.mona), "plan": plan.pk},
        )
        self.assertEqual(len(told("plan_task_assigned")), 1)
        self.assertEqual(told(), [])

    def test_the_plan_route_writes_an_event_per_change(self):
        plan = self.build_plan()
        task = plan.tasks.get(title="Hold the call")
        response = self.api(self.csm).patch(
            f"/api/v1/plans/{plan.pk}/tasks/{task.pk}/",
            {"title": "Hold the kick-off call", "priority": "high"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            list(task.events.values_list("kind", "data")),
            [
                (
                    "edited",
                    {"field": "title", "from": "Hold the call", "to": "Hold the kick-off call"},
                ),
                ("edited", {"field": "priority", "from": "medium", "to": "high"}),
            ],
        )

    def test_the_plan_route_does_not_offer_blocked_and_leaving_it_clears_the_reason(self):
        plan = self.build_plan()
        task = plan.tasks.get(title="Hold the call")
        url = f"/api/v1/plans/{plan.pk}/tasks/{task.pk}/"
        refused = self.api(self.csm).patch(url, {"status": "blocked"}, format="json")
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(refused.data, {"status": ["Choose pending, in progress or completed."]})
        Task.objects.filter(pk=task.pk).update(status="blocked", blocked_reason="Legal")
        moved = self.api(self.csm).patch(url, {"status": "in-progress"}, format="json")
        self.assertEqual(moved.status_code, 200, moved.content)
        task.refresh_from_db()
        self.assertEqual((task.status, task.blocked_reason), ("in-progress", ""))


class PlanStartTests(StartFixture):
    def test_every_task_of_a_started_plan_is_a_plan_task_with_its_event(self):
        plan = self.start()
        tasks = list(plan.tasks.all())
        self.assertEqual({t.source for t in tasks}, {"plan"})
        events = TaskEvent.objects.filter(task__plan=plan)
        self.assertEqual(events.count(), len(tasks))
        self.assertEqual(
            {(e.kind, e.actor_id, e.data["plan"]) for e in events},
            {("created", self.csm.pk, plan.pk)},
        )
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.customers.tests.test_task_creation --parallel --noinput`
Expected: FAIL — no `created` events, `source` is `manual` on plan and rule tasks, the refused create answers `{"assignee_id": [...]}` or 201.

- [ ] **Step 3: The nested create**

In `services/customers/serializers.py`, in `TaskSerializer`:

- Replace the `assignee_id = serializers.PrimaryKeyRelatedField(...)` declaration with:

```python
    assignee_id = serializers.IntegerField(
        write_only=True,
        required=False,
        allow_null=True,
        error_messages={"invalid": "Choose who does it."},
    )
    description = serializers.CharField(required=False, allow_blank=True, max_length=10_000)
    blocked_reason = serializers.CharField(required=False, allow_blank=True, max_length=255)
```

- In `Meta.fields`, add `"description"` after `"title"`, and `"blocked_reason"`, `"source"`, `"created_at"` after `"status"`. Set `read_only_fields = ["assignee_name", "source", "created_at"]`.
- Delete `validate_assignee_id` (the assignee is checked by the view: `task_access.assignee_for`).
- Add:

```python
    def validate(self, attrs):
        """Blocked needs its reason; any other status clears it."""
        from .task_access import SAY_WHY_BLOCKED

        if attrs.get("status") == Task.Status.BLOCKED:
            reason = attrs.get("blocked_reason", "").strip()
            if not reason:
                raise serializers.ValidationError({"blocked_reason": [SAY_WHY_BLOCKED]})
            attrs["blocked_reason"] = reason
        else:
            attrs["blocked_reason"] = ""
        return attrs
```

- Update the class docstring's last sentence to: ``On write, `assignee_id` names an active member who can open the record (default: the caller; else 400 `ASSIGNEE_CANNOT_OPEN`); `created_by` is always the caller.``

In `services/customers/views.py`, replace `_create_task` with:

```python
def _create_task(serializer, user, **parent):
    """A task made on a record's Tasks tab: the caller's, unless it names an
    assignee who may open the record (else 400 ASSIGNEE_CANNOT_OPEN), with
    its `created` event and its assignee told (task_changes.add_task)."""
    from .task_access import assignee_for
    from .task_changes import add_task

    (record,) = parent.values()
    data = dict(serializer.validated_data)
    pk = data.pop("assignee_id", None)
    assignee = user if pk is None else assignee_for(user.organisation_id, pk, record)
    serializer.instance = add_task(
        parent=record,
        created_by=user,
        actor=user,
        assignee=assignee,
        source=Task.Source.MANUAL,
        **data,
    )
```

- [ ] **Step 4: The rule's task**

In `services/rules/actions.py`, add `from services.customers.task_changes import add_task` to the imports (sorted with the other `services.customers` line), and replace the `on = ...` line and the `Task.objects.create(...)` call in `create_task` with:

```python
    add_task(
        parent=parent,
        title=action["title"],
        due_date=today + timedelta(days=action["due_in_days"]),
        priority=Task.Priority.MEDIUM,
        assignee=assignee,
        created_by=rule.owner,
        # Revenact acts: the rule is never named, only its id is kept.
        actor=None,
        source=Task.Source.RULE,
        event_data={"rule": rule.pk},
    )
```

Update `create_task`'s docstring: append `` The task is Revenact's (`actor` None): it writes a `created` event and tells the assignee, the rule owner included.``

- [ ] **Step 5: The plan's tasks**

In `services/plans/views.py`, add `from services.customers.task_changes import add_task, record_changes, snapshot` to the imports. In `PlanTaskCreateView.post`, replace the `task = Task.objects.create(...)` call with:

```python
            task = add_task(
                parent=record_of(plan),
                plan=plan,
                milestone=milestone,
                title=data["title"],
                priority=data["priority"],
                due_date=data["due_date"],
                assignee=data["assignee"],
                created_by=request.user,
                actor=request.user,
                source=Task.Source.PLAN,
                # A plan tells its assignees itself, one notice per action.
                notify_assignee=False,
                event_data={"plan": plan.pk},
            )
```

In `PlanTaskDetailView.patch`, directly after `task = get_object_or_404(plan.tasks, pk=task.pk)` add `before = snapshot(task)`, and directly after the `task.save(update_fields=[*changed, *extra])` line add:

```python
                record_changes(task, before, actor=request.user)
```

If `on_record` is now unused in `services/plans/views.py`, remove it from the `.starting` import (ruff F401 says so).

In `services/plans/starting.py`, add `from services.customers.task_changes import created_events` to the imports; in the `Task(...)` inside the `bulk_create`, add `source=Task.Source.PLAN,`; and directly after the `tasks = Task.objects.bulk_create(...)` statement add:

```python
        created_events(tasks, actor=actor, plan=plan.pk)
```

In `services/plans/serializers.py`, replace `PlanTaskSerializer.status`'s `choices=Task.Status.choices,` with:

```python
# Blocked needs a reason: it is set from the task panel (PATCH /tasks/<id>/).
choices = ([c for c in Task.Status.choices if c[0] != Task.Status.BLOCKED],)
```

- [ ] **Step 6: Run the tests**

Run: `venv/bin/python manage.py test services.customers.tests.test_task_creation services.customers.tests.test_tasks_personal --parallel --noinput`
Expected: PASS.

- [ ] **Step 7: Run the apps these paths live in**

Run: `venv/bin/python manage.py test services.customers services.plans services.rules --parallel --noinput`
Expected: PASS. A test that counts every `Notification` after a rule night now also sees the `task_assigned` row: narrow that assertion to the kind it was about (`.filter(kind=...)`), never drop it.

- [ ] **Step 8: Lint and commit**

Run: `venv/bin/ruff check . && venv/bin/ruff format services`
Expected: no errors.

```bash
git add services/customers/serializers.py services/customers/views.py services/rules/actions.py services/plans/views.py services/plans/starting.py services/plans/serializers.py services/customers/tests/test_task_creation.py
git commit -m "feat(tasks): people, rules and plans make tasks with a real assignee, an event and a notice

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The AI agent's tasks — a real assignee from the proposed name

**Files:**
- Modify: `services/metrics/proposals.py` (add `match_member`; the task branch of `approve`, ~419–431)
- Test: `services/metrics/tests/test_proposals.py` (new class `ApprovedTaskAssigneeTests` at the end)

**Interfaces:**
- Consumes `add_task` (Task 2), `scoping.can_open` (Task 2).
- Produces `match_member(organisation, name) -> User | None`: the one active member named `name` exactly, else the one matching ignoring case, else None.
- Produces: an approved task has `assignee` (matched member who can open the organisation, else the organisation's active owner, else the approver), `created_by` = approver, `source="agent"`, a `created` event by the approver with `data["proposal"]` (and `suggested`, `fallback` when the name was not used), and `task_assigned` to the assignee.

- [ ] **Step 1: Write the failing tests**

Append to `services/metrics/tests/test_proposals.py`:

```python
class ApprovedTaskAssigneeTests(TestCase):
    """Approving a task proposal gives the task to a real member: the one the
    agent named (exactly, then ignoring case), when they can open the
    organisation; otherwise the organisation's owner, else the approver."""

    def setUp(self):
        self.org, self.admin, self.carl, self.b, self.shaky = _org()

    def proposal(self, assignee_name):
        return Proposal.objects.create(
            organisation=self.org,
            batch="b1",
            kind=Proposal.Kind.TASK,
            title="Save play",
            rationale="Because.",
            evidence=[],
            action={
                "customer_id": self.shaky.id,
                "customer_name": "Pizza Hut",
                "title": "Save play: Pizza Hut",
                "assignee_name": assignee_name,
                "due_date": (timezone.localdate() + timedelta(days=7)).isoformat(),
                "priority": "high",
            },
        )

    def approved(self, assignee_name):
        proposal = self.proposal(assignee_name)
        proposals.approve(proposal, self.admin)
        return Task.objects.get(), proposal

    def member(self, email, name, **extra):
        return User.objects.create_user(
            email=email, password="x", name=name, organisation=self.org, **extra
        )

    def test_the_named_member_gets_it_and_is_told(self):
        task, proposal = self.approved("Carl")
        self.assertEqual(
            (task.assignee, task.assignee_name, task.created_by, task.source),
            (self.carl, "Carl", self.admin, "agent"),
        )
        event = task.events.get()
        self.assertEqual(
            (event.kind, event.actor, event.data),
            (
                "created",
                self.admin,
                {
                    "source": "agent",
                    "assignee": {"id": self.carl.id, "name": "Carl"},
                    "proposal": proposal.id,
                },
            ),
        )
        note = Notification.objects.get(kind="task_assigned")
        self.assertEqual((note.recipient, note.actor), (self.carl, self.admin))
        self.assertEqual(note.message, "Alice assigned you “Save play: Pizza Hut” on Pizza Hut.")

    def test_a_name_in_another_case_still_matches(self):
        task, _ = self.approved("carl")
        self.assertEqual(task.assignee, self.carl)
        self.assertNotIn("suggested", task.events.get().data)

    def test_no_such_member_goes_to_the_owner_and_says_so(self):
        task, _ = self.approved("Zed")
        self.assertEqual(task.assignee, self.carl)
        data = task.events.get().data
        self.assertEqual((data["suggested"], data["fallback"]), ("Zed", "no_member"))

    def test_two_members_of_that_name_is_no_match(self):
        self.member("sam1@acme.io", "Sam")
        self.member("sam2@acme.io", "Sam")
        task, _ = self.approved("Sam")
        self.assertEqual(task.assignee, self.carl)
        self.assertEqual(task.events.get().data["fallback"], "no_member")

    def test_a_member_who_cannot_open_the_organisation_is_passed_over(self):
        self.member("pat@acme.io", "Pat", role=User.Role.CSM)
        task, _ = self.approved("Pat")
        self.assertEqual(task.assignee, self.carl)
        self.assertEqual(task.events.get().data["fallback"], "cannot_open")

    def test_with_no_active_owner_the_approver_has_it_and_nobody_is_told(self):
        User.objects.filter(pk=self.carl.pk).update(is_active=False)
        task, _ = self.approved("Carl")
        self.assertEqual(task.assignee, self.admin)
        self.assertFalse(Notification.objects.filter(kind="task_assigned").exists())

    def test_match_member_is_exact_first_then_case_blind(self):
        self.member("carl2@acme.io", "CARL")
        self.assertEqual(proposals.match_member(self.org, "Carl"), self.carl)
        self.assertEqual(proposals.match_member(self.org, "CARL").email, "carl2@acme.io")
        self.assertIsNone(proposals.match_member(self.org, "carl"))
        self.assertIsNone(proposals.match_member(self.org, "  "))
```

Add `from services.notifications.models import Notification` to the file's imports.

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.metrics.tests.test_proposals --parallel --noinput`
Expected: FAIL — `task.assignee` is None, and `match_member` does not exist.

- [ ] **Step 3: Implement**

In `services/metrics/proposals.py`, add above `class AlreadyDecided`:

```python
def match_member(organisation, name):
    """The one active member of `organisation` called `name`: an exact match
    first, then one ignoring case. None when there is no single one."""
    name = (name or "").strip()
    if not name:
        return None
    members = User.objects.filter(organisation=organisation, is_active=True)
    exact = list(members.filter(name=name)[:2])
    if exact:
        return exact[0] if len(exact) == 1 else None
    loose = list(members.filter(name__iexact=name)[:2])
    return loose[0] if len(loose) == 1 else None


def _assignee(proposal, customer, approver):
    """Who an approved task goes to, and what the `created` event notes when
    it is not the person the agent named (Work round §1.3)."""
    from services.customers.scoping import can_open

    suggested = proposal.action.get("assignee_name", "")
    member = match_member(proposal.organisation, suggested)
    # SOC2:AUTH-02 a task goes only to someone who can open its organisation
    if member is not None and can_open(member, customer):
        return member, {}
    fallback = "no_member" if member is None else "cannot_open"
    owner = customer.owner
    chosen = owner if owner is not None and owner.is_active else approver
    return chosen, {"suggested": suggested, "fallback": fallback}
```

In `approve`, replace the task branch's `task = Task.objects.create(...)` call with:

```python
        from services.customers.task_changes import add_task

        assignee, note = _assignee(proposal, customer, user)
        task = add_task(
            parent=customer,
            title=action["title"],
            due_date=date.fromisoformat(str(action["due_date"])),
            priority=action["priority"],
            assignee=assignee,
            created_by=user,
            actor=user,
            source=Task.Source.AGENT,
            event_data={"proposal": proposal.pk, **note},
            # The decision this work serves, so the initiative shows it.
            initiative=proposal.initiative,
        )
```

and change `from datetime import timedelta` to `from datetime import date, timedelta`. Update `approve`'s docstring: append `` A task goes to a real member (`_assignee`), with its `created` event and its assignee told.``

- [ ] **Step 4: Run the tests**

Run: `venv/bin/python manage.py test services.metrics services.brain --parallel --noinput`
Expected: PASS (`test_approving_a_task_creates_it_on_the_account_and_records_the_result` still reads `assignee_name == "Carl"`: Carl is matched).

- [ ] **Step 5: Lint and commit**

Run: `venv/bin/ruff check . && venv/bin/ruff format services/metrics`

```bash
git add services/metrics/proposals.py services/metrics/tests/test_proposals.py
git commit -m "feat(metrics): an approved agent task goes to a real member, recorded and told

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The task panel API — `GET`/`PATCH /tasks/<id>/` and comments

**Files:**
- Create: `services/customers/task_payloads.py`
- Create: `services/customers/task_views.py`
- Modify: `services/customers/views.py` (delete the old `TaskDetailView` ~1215–1272; drop `.distinct()` in `TaskListView.get_queryset` and its comment)
- Modify: `services/plans/status.py` (`set_task_status` gains `blocked_reason`)
- Modify: `config/urls.py` (import the new views; add the comments route)
- Test: `services/customers/tests/test_task_detail.py`

**Interfaces:**
- Consumes everything from Tasks 1–2; `plans.status.lock_plan`, `set_task_status`; `plans.access.can_edit`, `NOT_EDITOR`; `plans.validation.PLAN_FINISHED`.
- Produces, in `services/customers/task_payloads.py`:
  - `ROW_RELATED = ("customer", "account", "assignee", "plan")`, `DETAIL_RELATED = (*ROW_RELATED, "created_by", "milestone", "initiative")`;
  - `parent_payload(task) -> {"kind": "customer"|"account", "id", "name"}`;
  - `task_row(task) -> dict` (the API's TaskRow; needs `ROW_RELATED` loaded);
  - `event_payload(event) -> dict` (the API's Event);
  - `task_detail(task, reader) -> dict` (the `GET /tasks/<id>/` shape).
- Produces `set_task_status(task, new_status, *, blocked_reason="", request=None, actor=None, now=None, today=None)`.
- Produces routes `GET/PATCH /api/v1/tasks/<id>/` (`name="task-detail"`) and `POST /api/v1/tasks/<id>/comments/` (`name="task-comments"`), exactly as the API contract above.

- [ ] **Step 1: Write the failing tests**

Create `services/customers/tests/test_task_detail.py`:

```python
"""The task panel: read a task with its trail, change any field (each
change its own event, a new assignee told), Blocked with its reason, and
comments. A task the reader may not read is a 404. A plan's task keeps the
plan's rules.

PlanFixture's world: Carl owns Pizza Hut and reports to Mona; Dana cannot
open Pizza Hut; Alice (admin) can open everything."""

from datetime import timedelta

from core.models import AuditEvent
from services.accounts.models import User
from services.customers.models import Customer, Task
from services.customers.task_changes import add_task
from services.notifications.models import Notification
from services.plans.models import Plan
from services.plans.tests.fixtures import PlanFixture
from services.segments.tests.fixtures import person


class DetailFixture(PlanFixture):
    def setUp(self):
        self.task = add_task(
            parent=self.pizza,
            title="Call Pizza Hut",
            due_date=self.today + timedelta(days=2),
            priority="medium",
            assignee=self.csm,
            created_by=self.csm,
            actor=self.csm,
            source=Task.Source.MANUAL,
        )
        self.url = f"/api/v1/tasks/{self.task.pk}/"

    def patch(self, body, user=None, url=None):
        return self.api(user or self.csm).patch(url or self.url, body, format="json")

    def kinds(self, task=None):
        return list((task or self.task).events.values_list("kind", flat=True))


class ReadTests(DetailFixture):
    def test_the_panel_reads_the_whole_task_and_its_trail(self):
        response = self.api(self.csm).get(self.url)
        self.assertEqual(response.status_code, 200, response.data)
        body = response.data
        self.assertEqual(
            {
                k: body[k]
                for k in ("id", "title", "description", "status", "blocked_reason", "source")
            },
            {
                "id": self.task.pk,
                "title": "Call Pizza Hut",
                "description": "",
                "status": "pending",
                "blocked_reason": "",
                "source": "manual",
            },
        )
        self.assertEqual(
            body["parent"], {"kind": "customer", "id": self.pizza.pk, "name": "Pizza Hut"}
        )
        self.assertEqual((body["parent_name"], body["parent_type"]), ("Pizza Hut", "customer"))
        self.assertEqual(body["assignee"], {"id": self.csm.pk, "name": "Carl CSM", "active": True})
        self.assertEqual(body["created_by"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(
            body["editable"], ["title", "description", "status", "due_date", "priority", "assignee"]
        )
        [event] = body["events"]
        self.assertEqual(
            {k: event[k] for k in ("kind", "actor", "body")},
            {"kind": "created", "actor": {"id": self.csm.pk, "name": "Carl CSM"}, "body": ""},
        )
        self.assertEqual((body["plan"], body["milestone"], body["initiative"]), (None, None, None))

    def test_the_chain_and_view_all_read_it_and_nobody_else(self):
        self.assertEqual(self.api(self.mona).get(self.url).status_code, 200)
        # Alice is outside Carl's chain; view-all reads every task (owner decision 2026-10-07).
        self.assertEqual(self.api(self.admin).get(self.url).status_code, 200)
        response = self.api(self.other).get(self.url)
        self.assertEqual((response.status_code, response.data), (404, {"detail": "No such task."}))


class ViewAllAndLeadershipTests(DetailFixture):
    """A reader with view_all_accounts or the Leadership function reads, edits
    and reassigns a task outside their chain, on a record they may open."""

    def test_view_all_edits_and_reassigns_a_task_outside_its_chain(self):
        alice = User.objects.get(pk=self.admin.pk)
        read = self.api(alice).get(self.url)
        self.assertEqual(
            read.data["editable"],
            ["title", "description", "status", "due_date", "priority", "assignee"],
        )
        response = self.patch(
            {"title": "Call Pizza Hut today", "assignee_id": self.mona.pk}, user=alice
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            (response.data["title"], response.data["assignee"]["id"]),
            ("Call Pizza Hut today", self.mona.pk),
        )
        self.assertEqual(self.task.events.get(kind="assigned").actor, alice)
        note = Notification.objects.get(kind="task_assigned")
        self.assertEqual((note.recipient, note.actor), (self.mona, alice))

    def test_leadership_edits_a_task_outside_its_chain_on_a_record_it_opens(self):
        lena = person("lena@acme.io", "Lena Lead", self.org, function=User.Function.LEADERSHIP)
        loose = Customer.objects.create(organisation=self.org, name="Loose Ltd")
        task = add_task(
            parent=loose,
            title="Tidy Loose Ltd",
            due_date=self.today + timedelta(days=2),
            priority="low",
            assignee=self.csm,
            created_by=self.csm,
            actor=self.csm,
            source=Task.Source.MANUAL,
        )
        url = f"/api/v1/tasks/{task.pk}/"
        self.assertEqual(self.api(lena).get(url).status_code, 200)
        response = self.patch({"priority": "high", "assignee_id": self.mona.pk}, user=lena, url=url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["priority"], "high")
        # ...but never on a record she cannot open: Pizza Hut is Carl's.
        self.assertEqual(self.api(lena).get(self.url).status_code, 404)
        self.assertEqual(self.patch({"title": "Mine"}, user=lena).status_code, 404)


class EditTests(DetailFixture):
    def test_each_changed_field_writes_its_event_and_is_audited(self):
        response = self.patch(
            {
                "title": "Call Pizza Hut again",
                "description": "Ask about seats",
                "priority": "high",
                "due_date": (self.today + timedelta(days=5)).isoformat(),
            }
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["title"], "Call Pizza Hut again")
        self.assertEqual(self.kinds(), ["created", "edited", "edited", "edited", "due_changed"])
        event = AuditEvent.objects.get(action="task.update")
        self.assertEqual(
            event.metadata, {"fields": ["title", "description", "priority", "due_date"]}
        )

    def test_the_same_values_write_nothing(self):
        response = self.patch({"title": "Call Pizza Hut", "priority": "medium"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.kinds(), ["created"])
        self.assertFalse(AuditEvent.objects.filter(action="task.update").exists())

    def test_blocked_needs_a_reason_and_leaving_it_clears_the_reason(self):
        refused = self.patch({"status": "blocked"})
        self.assertEqual(
            (refused.status_code, refused.data),
            (400, {"blocked_reason": ["Say what it's blocked on."]}),
        )
        blocked = self.patch({"status": "blocked", "blocked_reason": "Waiting on legal"})
        self.assertEqual(
            (blocked.data["status"], blocked.data["blocked_reason"]),
            ("blocked", "Waiting on legal"),
        )
        reason = self.patch({"blocked_reason": "Legal, then finance"})
        self.assertEqual(reason.data["blocked_reason"], "Legal, then finance")
        moved = self.patch({"status": "in-progress", "blocked_reason": "ignored"})
        self.assertEqual((moved.data["status"], moved.data["blocked_reason"]), ("in-progress", ""))
        statuses = list(self.task.events.filter(kind="status").values_list("data", flat=True))
        self.assertEqual(
            statuses,
            [
                {"from": "pending", "to": "blocked", "reason": "Waiting on legal"},
                {"from": "blocked", "to": "blocked", "reason": "Legal, then finance"},
                {"from": "blocked", "to": "in-progress"},
            ],
        )
        audited = AuditEvent.objects.filter(action="task.update").order_by("pk")
        self.assertEqual(
            audited.first().metadata,
            {"fields": ["status", "blocked_reason"], "from": "pending", "to": "blocked"},
        )

    def test_refusals_are_in_the_uis_words(self):
        cases = [
            (
                {"status": "done"},
                {"status": ["Choose pending, in progress, blocked or completed."]},
            ),
            ({"title": ""}, {"title": ["Give the task a title."]}),
            ({"priority": "urgent"}, {"priority": ["Choose high, medium or low."]}),
            ({"due_date": "soon"}, {"due_date": ["Choose a date."]}),
            ({"assignee_id": None}, {"assignee_id": ["Choose who does it."]}),
        ]
        for body, expected in cases:
            with self.subTest(body=body):
                response = self.patch(body)
                self.assertEqual((response.status_code, response.data), (400, expected))
        array = self.api(self.csm).patch(self.url, [1], format="json")
        self.assertEqual(array.data, {"non_field_errors": ["Send the fields as one object."]})
        self.assertEqual(self.kinds(), ["created"])

    def test_a_new_assignee_who_can_open_the_record_is_told(self):
        response = self.patch({"assignee_id": self.mona.pk})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["assignee"]["id"], self.mona.pk)
        self.assertEqual(response.data["assignee_name"], "Mona Manager")
        assigned = self.task.events.get(kind="assigned")
        self.assertEqual(
            assigned.data,
            {
                "from": {"id": self.csm.pk, "name": "Carl CSM"},
                "to": {"id": self.mona.pk, "name": "Mona Manager"},
            },
        )
        notes = Notification.objects.filter(kind="task_assigned")
        self.assertEqual(list(notes.values_list("recipient_id", flat=True)), [self.mona.pk])
        # Mona hands it back to herself: no change. To Carl: Carl is told, she isn't.
        self.patch({"assignee_id": self.csm.pk}, user=self.mona)
        self.assertEqual(
            list(notes.order_by("pk").values_list("recipient_id", flat=True)),
            [self.mona.pk, self.csm.pk],
        )

    def test_someone_who_cannot_open_the_record_is_refused(self):
        response = self.patch({"assignee_id": self.other.pk})
        self.assertEqual(
            (response.status_code, response.data),
            (
                400,
                {
                    "code": "ASSIGNEE_CANNOT_OPEN",
                    "detail": "That person can't open this organisation.",
                },
            ),
        )
        self.task.refresh_from_db()
        self.assertEqual(self.task.assignee, self.csm)

    def test_a_task_the_caller_cannot_read_is_404_and_untouched(self):
        response = self.patch({"title": "Mine now"}, user=self.other)
        self.assertEqual(response.status_code, 404)
        self.task.refresh_from_db()
        self.assertEqual(self.task.title, "Call Pizza Hut")


class CommentTests(DetailFixture):
    def comment(self, body, user=None):
        return self.api(user or self.csm).post(
            f"{self.url}comments/", {"body": body}, format="json"
        )

    def test_anyone_who_reads_it_comments(self):
        response = self.comment("  Called, left a voicemail. ")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            {k: response.data[k] for k in ("kind", "body", "actor", "data")},
            {
                "kind": "comment",
                "body": "Called, left a voicemail.",
                "actor": {"id": self.csm.pk, "name": "Carl CSM"},
                "data": {},
            },
        )
        self.assertEqual(self.comment("Thanks", user=self.mona).status_code, 201)
        self.assertEqual(self.kinds(), ["created", "comment", "comment"])

    def test_blank_too_long_and_unreadable(self):
        self.assertEqual(self.comment("  ").data, {"body": ["Write a comment."]})
        self.assertEqual(
            self.comment("x" * 5001).data, {"body": ["Keep a comment under 5,000 characters."]}
        )
        self.assertEqual(self.comment("Hi", user=self.other).status_code, 404)


class PlanTaskTests(DetailFixture):
    def setUp(self):
        super().setUp()
        # Alice (view-all) is given a task on Carl's plan: she reads it, but
        # she is neither the plan's owner nor above him, so she only ticks it.
        self.plan = self.build_plan(
            steps=[("Kick-off", 7, [("Hold the call", self.admin, "pending", self.csm)])]
        )
        self.plan_task = self.plan.tasks.get()
        self.plan_url = f"/api/v1/tasks/{self.plan_task.pk}/"

    def test_an_editor_changes_anything_through_the_panel(self):
        response = self.patch({"title": "Hold the kick-off call"}, url=self.plan_url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["plan"], {"id": self.plan.pk, "name": self.plan.name})

    def test_a_reader_who_is_not_an_editor_only_moves_its_status(self):
        alice = User.objects.get(pk=self.admin.pk)
        read = self.api(alice).get(self.plan_url)
        self.assertEqual(read.data["editable"], ["status"])
        refused = self.patch({"title": "Mine"}, user=alice, url=self.plan_url)
        self.assertEqual(
            (refused.status_code, refused.data["detail"]),
            (403, "Only the plan's owner or their managers can change it."),
        )
        blocked = self.patch(
            {"status": "blocked", "blocked_reason": "No room booked"}, user=alice, url=self.plan_url
        )
        self.assertEqual(blocked.status_code, 200, blocked.data)
        self.plan_task.refresh_from_db()
        self.assertEqual(
            (self.plan_task.status, self.plan_task.blocked_reason), ("blocked", "No room booked")
        )
        done = self.patch({"status": "completed"}, user=alice, url=self.plan_url)
        self.assertEqual(done.status_code, 200, done.data)
        self.assertEqual(Plan.objects.get(pk=self.plan.pk).status, "done")

    def test_a_finished_plan_keeps_only_its_status_open(self):
        Plan.objects.filter(pk=self.plan.pk).update(status="done")
        refused = self.patch({"title": "Late"}, url=self.plan_url)
        self.assertEqual(
            (refused.status_code, refused.data),
            (400, {"non_field_errors": ["This plan is finished; only its tasks can change."]}),
        )
        self.assertEqual(self.patch({"status": "completed"}, url=self.plan_url).status_code, 200)
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.customers.tests.test_task_detail --parallel --noinput`
Expected: FAIL — `GET` answers 405, and the PATCH refuses everything but `status`.

- [ ] **Step 3: Let a plan task carry a Blocked reason**

In `services/plans/status.py`, change `set_task_status`'s signature to:

```python
def set_task_status(
    task, new_status, *, blocked_reason="", request=None, actor=None, now=None, today=None
):
```

and replace its `task.status = new_status` / `task.save(update_fields=["status"])` pair with:

```python
        task.status = new_status
        task.blocked_reason = blocked_reason if new_status == Task.Status.BLOCKED else ""
        task.save(update_fields=["status", "blocked_reason"])
```

- [ ] **Step 4: Write the payloads**

Create `services/customers/task_payloads.py`:

```python
"""What the Work routes and the task panel return for a task (Work round,
spec §1.4): one row for every list (`task_row`) and the panel's whole task
with its trail (`task_detail`). Only ever built for tasks the reader already
reads (`task_access.openable_tasks`)."""

from rest_framework import serializers

from .models import Customer
from .task_access import editable_fields, record_of
from .task_changes import person

ROW_RELATED = ("customer", "account", "assignee", "plan")
DETAIL_RELATED = (*ROW_RELATED, "created_by", "milestone", "initiative")

_stamp = serializers.DateTimeField().to_representation


def parent_payload(task):
    record = record_of(task)
    kind = "customer" if isinstance(record, Customer) else "account"
    return {"kind": kind, "id": record.pk, "name": record.name}


def assignee_payload(user):
    return None if user is None else {"id": user.pk, "name": user.name, "active": user.is_active}


def task_row(task):
    return {
        "id": task.pk,
        "title": task.title,
        "due_date": task.due_date.isoformat(),
        "priority": task.priority,
        "status": task.status,
        "blocked_reason": task.blocked_reason,
        "source": task.source,
        "parent": parent_payload(task),
        "assignee": assignee_payload(task.assignee),
        "plan": None if task.plan_id is None else {"id": task.plan_id, "name": task.plan.name},
    }


def event_payload(event):
    return {
        "id": event.pk,
        "kind": event.kind,
        "actor": person(event.actor),
        "data": event.data,
        "body": event.body,
        "created_at": _stamp(event.created_at),
    }


def task_detail(task, reader):
    row = task_row(task)
    milestone = task.milestone
    initiative = task.initiative
    return {
        **row,
        "description": task.description,
        "status_display": task.get_status_display(),
        "priority_display": task.get_priority_display(),
        "assignee_name": task.assignee_name,
        "created_by": person(task.created_by),
        "created_at": _stamp(task.created_at),
        "parent_name": row["parent"]["name"],
        "parent_type": row["parent"]["kind"],
        "milestone": None if milestone is None else {"id": milestone.pk, "name": milestone.name},
        "initiative": None
        if initiative is None
        else {"id": initiative.pk, "title": initiative.title},
        "editable": editable_fields(reader, task),
        "events": [event_payload(e) for e in task.events.select_related("actor")],
    }
```

- [ ] **Step 5: Write the views**

Create `services/customers/task_views.py`:

```python
"""`GET`/`PATCH /api/v1/tasks/<id>/` and `POST /api/v1/tasks/<id>/comments/`:
the Work task panel (spec §1.4). A task the reader may not read (another
workspace, a record they can't open, outside its chain) is a 404, never a
403. See docs/API_CONTRACTS.md, `work`."""

from django.db import transaction
from django.http import Http404
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit

from .models import Task, TaskEvent
from .task_access import SAY_WHY_BLOCKED, assignee_for, editable_fields, openable_tasks, record_of
from .task_changes import changed_fields, notify_assigned, record_changes, snapshot
from .task_payloads import DETAIL_RELATED, event_payload, task_detail

NO_SUCH_TASK = "No such task."
SEND_AN_OBJECT = "Send the fields as one object."
CHOOSE_STATUS = "Choose pending, in progress, blocked or completed."
NO_TITLE = "Give the task a title."
LONG_TITLE = "Keep the title under 255 characters."
LONG_DESCRIPTION = "Keep the description under 10,000 characters."
LONG_REASON = "Keep the reason under 255 characters."
CHOOSE_PRIORITY = "Choose high, medium or low."
CHOOSE_DATE = "Choose a date."
CHOOSE_ASSIGNEE = "Choose who does it."
WRITE_A_COMMENT = "Write a comment."
LONG_COMMENT = "Keep a comment under 5,000 characters."
#: The body's keys that are not fields of their own in `editable_fields`.
RIDES_WITH_STATUS = {"blocked_reason"}


class TaskPatchSerializer(serializers.Serializer):
    title = serializers.CharField(
        required=False,
        max_length=255,
        error_messages={
            "blank": NO_TITLE,
            "null": NO_TITLE,
            "invalid": NO_TITLE,
            "max_length": LONG_TITLE,
        },
    )
    description = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=10_000,
        error_messages={"max_length": LONG_DESCRIPTION},
    )
    status = serializers.ChoiceField(
        required=False,
        choices=Task.Status.choices,
        error_messages={"invalid_choice": CHOOSE_STATUS, "null": CHOOSE_STATUS},
    )
    blocked_reason = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=255,
        error_messages={"max_length": LONG_REASON, "null": SAY_WHY_BLOCKED},
    )
    due_date = serializers.DateField(
        required=False,
        error_messages={"invalid": CHOOSE_DATE, "null": CHOOSE_DATE, "datetime": CHOOSE_DATE},
    )
    priority = serializers.ChoiceField(
        required=False,
        choices=Task.Priority.choices,
        error_messages={"invalid_choice": CHOOSE_PRIORITY, "null": CHOOSE_PRIORITY},
    )
    assignee_id = serializers.IntegerField(
        required=False,
        error_messages={
            "invalid": CHOOSE_ASSIGNEE,
            "null": CHOOSE_ASSIGNEE,
            "max_string_length": CHOOSE_ASSIGNEE,
        },
    )


class CommentSerializer(serializers.Serializer):
    body = serializers.CharField(
        max_length=5000,
        error_messages={
            "required": WRITE_A_COMMENT,
            "blank": WRITE_A_COMMENT,
            "null": WRITE_A_COMMENT,
            "invalid": WRITE_A_COMMENT,
            "max_length": LONG_COMMENT,
        },
    )


def _readable(user, pk, *, lock=False):
    rows = Task.objects.all()
    if lock:
        # `of=("self",)`: the parent and people joins are nullable (LEFT
        # OUTER), and Postgres refuses FOR UPDATE on their side.
        rows = rows.select_for_update(no_key=True, of=("self",))
    # SOC2:AUTH-02 the twice-filter; anything else reads as missing
    task = openable_tasks(user, rows).select_related(*DETAIL_RELATED).filter(pk=pk).first()
    if task is None:
        raise NotFound(NO_SUCH_TASK)
    return task


def _locked(user, pk):
    """The task again under its row lock. A plan's task takes its plan's lock
    first, the order every plan write uses (services/plans/status.py)."""
    task = _readable(user, pk)
    if task.plan_id is not None:
        from services.plans.status import lock_plan

        try:
            lock_plan(task.plan_id)
        except Http404:
            raise NotFound(NO_SUCH_TASK) from None
    return _readable(user, pk, lock=True)


def _refuse(user, task):
    """Only a plan's task has fields its reader may not change."""
    from services.plans.access import NOT_EDITOR, can_edit
    from services.plans.validation import PLAN_FINISHED

    # SOC2:AUTH-02 a plan's task: its fields are the plan's editors', while the plan is open
    if can_edit(user, task.plan):
        raise ValidationError({"non_field_errors": [PLAN_FINISHED]})
    raise PermissionDenied(NOT_EDITOR)


def _values(user, task, data):
    """The validated body as the values to write: the assignee looked up and
    checked, and the status with its reason (required for Blocked, cleared
    otherwise)."""
    values = {n: data[n] for n in ("title", "description", "priority", "due_date") if n in data}
    if "assignee_id" in data and data["assignee_id"] != task.assignee_id:
        values["assignee"] = assignee_for(
            user.organisation_id, data["assignee_id"], record_of(task)
        )
    new_status = data.get("status", task.status)
    if new_status == Task.Status.BLOCKED:
        reason = data["blocked_reason"].strip() if "blocked_reason" in data else task.blocked_reason
        if not reason:
            raise ValidationError({"blocked_reason": [SAY_WHY_BLOCKED]})
    else:
        reason = ""
    values["status"], values["blocked_reason"] = new_status, reason
    return values


class TaskDetailView(APIView):
    """GET the task panel; PATCH any of title, description, status (with
    blocked_reason), due_date, priority, assignee_id. Each changed field
    writes its event; a new assignee is told; changes are audited as
    `task.update`."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(task_detail(_readable(request.user, pk), request.user))

    def patch(self, request, pk):
        _readable(request.user, pk)
        if not isinstance(request.data, dict):
            raise ValidationError({"non_field_errors": [SEND_AN_OBJECT]})
        serializer = TaskPatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        asked = {"assignee" if n == "assignee_id" else n for n in data} - RIDES_WITH_STATUS
        with transaction.atomic():
            task = _locked(request.user, pk)
            if not asked <= set(editable_fields(request.user, task)):
                _refuse(request.user, task)
            self._write(request, task, _values(request.user, task, data))
        return Response(task_detail(_readable(request.user, pk), request.user))

    def _write(self, request, task, values):
        before = snapshot(task)
        for name in ("title", "description", "priority", "due_date", "assignee"):
            if name in values:
                setattr(task, name, values[name])
        moved = (values["status"], values["blocked_reason"]) != (task.status, task.blocked_reason)
        if moved and task.plan_id is not None:
            from services.plans.status import set_task_status

            # A plan's task moves its milestone and plan too, under the plan's lock.
            try:
                set_task_status(
                    task, values["status"], blocked_reason=values["blocked_reason"], request=request
                )
            except Task.DoesNotExist:
                raise NotFound(NO_SUCH_TASK) from None
        elif moved:
            task.status, task.blocked_reason = values["status"], values["blocked_reason"]
        names = changed_fields(task, before)
        if not names:
            return
        saved = [n for n in names if task.plan_id is None or n not in ("status", "blocked_reason")]
        if saved:
            task.save(update_fields=saved)
        record_changes(task, before, actor=request.user)
        metadata = {"fields": names}
        if "status" in names:
            metadata.update({"from": before["status"], "to": task.status})
        audit.record("task.update", request=request, target=task, metadata=metadata)  # SOC2:LOG-01
        if "assignee" in names:
            notify_assigned(task, actor=request.user)


class TaskCommentView(APIView):
    """POST `{body}`: a `comment` event on a task the caller reads."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        task = _readable(request.user, pk)
        serializer = CommentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event = TaskEvent.objects.create(
            task=task,
            actor=request.user,
            kind=TaskEvent.Kind.COMMENT,
            body=serializer.validated_data["body"],
        )
        return Response(event_payload(event), status=status.HTTP_201_CREATED)
```

- [ ] **Step 6: Wire the routes and retire the old view**

In `services/customers/views.py`, delete the whole `class TaskDetailView` (its docstring included). In `TaskListView.get_queryset`, delete the `.distinct()` call and the comment line above it that justifies it (`visible_children_q` is `customer__in`/`account__in` subqueries; a task has one parent, so nothing fans out). Run `grep -rn "TaskDetailView" services config`; the only remaining reference must be `config/urls.py`.

In `config/urls.py`, remove `TaskDetailView,` from the `services.customers.views` import and add:

```python
from services.customers.task_views import TaskCommentView, TaskDetailView
```

and below the `task-detail` route add:

```python
(path("api/v1/tasks/<int:pk>/comments/", TaskCommentView.as_view(), name="task-comments"),)
```

- [ ] **Step 7: Run the tests**

Run: `venv/bin/python manage.py test services.customers.tests.test_task_detail services.customers.tests.test_views services.plans.tests.test_status --parallel --noinput`
Expected: PASS. `TaskStatusTests` (the Cockpit tick-off) still passes: its seeded task is readable, and so editable, by the owner, and its audit metadata is `{"fields": ["status"], "from", "to"}`.

- [ ] **Step 8: Lint and commit**

Run: `venv/bin/ruff check . && venv/bin/ruff format services config`

```bash
git add services/customers/task_payloads.py services/customers/task_views.py services/customers/views.py services/plans/status.py config/urls.py services/customers/tests/test_task_detail.py
git commit -m "feat(tasks): the task panel API — read with its trail, edit every field, comment

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The Work app — Today, the drill-down and the assignee picker

**Files:**
- Create: `services/work/__init__.py` (empty), `services/work/apps.py`, `services/work/clock.py`, `services/work/states.py`, `services/work/today.py`, `services/work/drill.py`, `services/work/assignees.py`, `services/work/views.py`, `services/work/urls.py`
- Create: `services/work/tests/__init__.py` (empty), `services/work/tests/fixtures.py`
- Modify: `config/settings.py` (`INSTALLED_APPS`: `"services.work",` after `"services.brain",`), `config/urls.py`
- Test: `services/work/tests/test_today.py`, `services/work/tests/test_drill.py`, `services/work/tests/test_assignees.py`

**Interfaces:**
- Consumes `openable_tasks` (Task 2), `task_row`, `ROW_RELATED` (Task 5), `scoping.can_open`, `visible_customers`, `visible_accounts`.
- Produces `clock.today_for(organisation) -> date` (UTC today until delivery 3).
- Produces in `states.py`: `OPEN, OVERDUE, BLOCKED = "open", "overdue", "blocked"`, `STATES`, `open_tasks(queryset=None)`, `overdue_q(today)`, `state_q(state, today)`.
- Produces `today.GROUPS = ("overdue", "today", "week", "later", "blocked")`, `today.ROW_LIMIT = 100`, `today.bucket(task, today) -> str`, `today.build(reader, *, today) -> dict`.
- Produces `drill.LIMIT = 200`, `drill.build(reader, assignee_id, state, *, today) -> {"tasks": [...]}`.
- Produces `assignees.build(reader, record) -> {"people": [...]}`.
- Produces routes `GET /api/v1/work/today/` (`work-today`), `/work/tasks/` (`work-tasks`), `/work/assignees/` (`work-assignees`); Task 7 adds `/work/team/`.
- Produces `WorkFixture` (`services/work/tests/fixtures.py`): BrainFixture plus `make_task(...)`, `get(user, url)`, and Carl's tasks `overdue`, `due_today`, `this_week`, `later`, `blocked`, `done`, `handed` (on Taco West, made by Dana, which Carl cannot open) and Dana's `danas`.

- [ ] **Step 1: Write the fixture**

Create `services/work/tests/fixtures.py`:

```python
"""The Work tests' world: BrainFixture's people and book (Carl owns Pizza
Hut, Dough Co, Pizza EMEA and Taco East and reports to Mona; Dana owns Taco
Bell and Taco West; Alice (admin, Leadership) opens every record; Lee
(Leadership, no view-all) opens only Loose Ltd; Gus is Globex's), plus open
work:

Carl's: "Call Pizza Hut" (2 days overdue, high), "Prep the Dough Co QBR"
(today), "EMEA sync" (Pizza EMEA, in 3 days), "Plan next year" (in 20 days),
"Send the contract" (Blocked, "Waiting on legal", 5 days past due), "Old
call" (completed) and "West handover" (Taco West, made by Dana: Carl cannot
open Taco West, so it is his but hidden from him). Dana's: "Taco Bell
review" (3 days overdue). Every task but the handover is its assignee's own.
Alice reads every task (view-all) on records she opens: all of them; Lee
reads every task (Leadership) on records he opens: only Loose Ltd's."""

from datetime import timedelta

from services.accounts.models import User
from services.brain.tests.fixtures import BrainFixture
from services.customers.models import Customer, Task


class WorkFixture(BrainFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        mk = cls.make_task
        cls.overdue = mk(
            "Call Pizza Hut", on=cls.pizza, assignee=cls.csm, due_in=-2, priority="high"
        )
        cls.due_today = mk("Prep the Dough Co QBR", on=cls.dough, assignee=cls.csm, due_in=0)
        cls.this_week = mk("EMEA sync", on=cls.emea, assignee=cls.csm, due_in=3)
        cls.later = mk("Plan next year", on=cls.pizza, assignee=cls.csm, due_in=20)
        cls.blocked = mk(
            "Send the contract",
            on=cls.dough,
            assignee=cls.csm,
            due_in=-5,
            status="blocked",
            reason="Waiting on legal",
        )
        cls.done = mk("Old call", on=cls.pizza, assignee=cls.csm, due_in=-9, status="completed")
        cls.handed = mk(
            "West handover", on=cls.west, assignee=cls.csm, created_by=cls.other, due_in=-1
        )
        cls.danas = mk("Taco Bell review", on=cls.taco, assignee=cls.other, due_in=-3)

    @classmethod
    def make_task(
        cls,
        title,
        *,
        on,
        assignee,
        created_by=None,
        due_in=0,
        status="pending",
        reason="",
        priority="medium",
    ):
        parent = {"customer": on} if isinstance(on, Customer) else {"account": on}
        return Task.objects.create(
            **parent,
            title=title,
            assignee=assignee,
            assignee_name=assignee.name,
            created_by=created_by or assignee,
            due_date=cls.today + timedelta(days=due_in),
            status=status,
            blocked_reason=reason,
            priority=priority,
        )

    def get(self, user, url):
        """`url` as a fresh copy of `user` (no memoised org chart)."""
        return self.as_user(User.objects.get(pk=user.pk)).get(url)

    def ok(self, user, url):
        response = self.get(user, url)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data
```

- [ ] **Step 2: Write the failing tests**

Create `services/work/tests/test_today.py`:

```python
"""Today: my open tasks, grouped, on records I can open; the rest counted."""

from datetime import timedelta
from unittest.mock import patch

from services.work import today
from services.work.tests.fixtures import WorkFixture

URL = "/api/v1/work/today/"


def titles(body):
    return {key: [row["title"] for row in rows] for key, rows in body["groups"].items()}


class TodayTests(WorkFixture):
    def test_my_open_tasks_grouped_with_the_rest_counted(self):
        body = self.ok(self.csm, URL)
        self.assertEqual(
            titles(body),
            {
                "overdue": ["Call Pizza Hut"],
                "today": ["Prep the Dough Co QBR"],
                "week": ["EMEA sync"],
                "later": ["Plan next year"],
                "blocked": ["Send the contract"],
            },
        )
        self.assertEqual(
            body["counts"], {"overdue": 1, "today": 1, "week": 1, "later": 1, "blocked": 1}
        )
        self.assertEqual((body["hidden"], body["today"]), (1, self.today.isoformat()))

    def test_a_row_names_its_record_and_a_blocked_row_its_reason(self):
        body = self.ok(self.csm, URL)
        [row] = body["groups"]["overdue"]
        self.assertEqual(
            row,
            {
                "id": self.overdue.pk,
                "title": "Call Pizza Hut",
                "due_date": (self.today - timedelta(days=2)).isoformat(),
                "priority": "high",
                "status": "pending",
                "blocked_reason": "",
                "source": "manual",
                "parent": {"kind": "customer", "id": self.pizza.pk, "name": "Pizza Hut"},
                "assignee": {"id": self.csm.pk, "name": "Carl CSM", "active": True},
                "plan": None,
            },
        )
        self.assertEqual(body["groups"]["blocked"][0]["blocked_reason"], "Waiting on legal")
        self.assertEqual(
            body["groups"]["week"][0]["parent"],
            {"kind": "account", "id": self.emea.pk, "name": "Pizza EMEA"},
        )

    def test_the_week_ends_seven_days_out(self):
        self.make_task("Day seven", on=self.pizza, assignee=self.csm, due_in=7)
        self.make_task("Day eight", on=self.pizza, assignee=self.csm, due_in=8)
        groups = titles(self.ok(self.csm, URL))
        self.assertIn("Day seven", groups["week"])
        self.assertIn("Day eight", groups["later"])

    def test_someone_with_nothing_gets_empty_groups(self):
        body = self.ok(self.lee, URL)
        self.assertEqual(body["counts"], dict.fromkeys(today.GROUPS, 0))
        self.assertEqual((body["hidden"], titles(body)), (0, {key: [] for key in today.GROUPS}))

    def test_each_group_lists_at_most_the_limit_and_counts_them_all(self):
        self.make_task("Also overdue", on=self.pizza, assignee=self.csm, due_in=-1)
        with patch.object(today, "ROW_LIMIT", 1):
            body = self.ok(self.csm, URL)
        self.assertEqual(titles(body)["overdue"], ["Call Pizza Hut"])
        self.assertEqual(body["counts"]["overdue"], 2)

    def test_signed_out_is_refused(self):
        self.assertEqual(self.client.get(URL).status_code, 401)
```

Create `services/work/tests/test_drill.py`:

```python
"""The Team drill-down: one person's open tasks in one state, only those the
reader may read."""

from services.work.tests.fixtures import WorkFixture


class DrillTests(WorkFixture):
    def titles(self, reader, assignee, state=None):
        url = f"/api/v1/work/tasks/?assignee={assignee.pk}"
        if state:
            url += f"&state={state}"
        return [row["title"] for row in self.ok(reader, url)["tasks"]]

    def test_a_manager_drills_into_a_reports_tasks_by_state(self):
        self.assertEqual(
            self.titles(self.mona, self.csm),
            [
                "Send the contract",
                "Call Pizza Hut",
                "Prep the Dough Co QBR",
                "EMEA sync",
                "Plan next year",
            ],
        )
        self.assertEqual(self.titles(self.mona, self.csm, "overdue"), ["Call Pizza Hut"])
        self.assertEqual(self.titles(self.mona, self.csm, "blocked"), ["Send the contract"])

    def test_only_what_the_reader_reads(self):
        self.assertEqual(self.titles(self.other, self.csm), ["West handover"])  # she made it
        # View-all reads every task on records it opens (owner decision 2026-10-07).
        self.assertEqual(
            self.titles(self.admin, self.csm),
            [
                "Send the contract",
                "Call Pizza Hut",
                "West handover",
                "Prep the Dough Co QBR",
                "EMEA sync",
                "Plan next year",
            ],
        )
        # Leadership reads every task too, but Lee opens none of Carl's records.
        self.assertEqual(self.titles(self.lee, self.csm), [])
        self.assertEqual(self.titles(self.stranger, self.csm), [])

    def test_refusals(self):
        for query, expected in (
            ("", {"assignee": ["Choose a person."]}),
            ("?assignee=me", {"assignee": ["Choose a person."]}),
            (
                f"?assignee={self.csm.pk}&state=late",
                {"state": ["Choose open, overdue or blocked."]},
            ),
        ):
            with self.subTest(query=query):
                response = self.get(self.mona, f"/api/v1/work/tasks/{query}")
                self.assertEqual((response.status_code, response.data), (400, expected))
```

Create `services/work/tests/test_assignees.py`:

```python
"""The assignee picker: every active member, with whether they can open the record."""

from services.accounts.models import User
from services.work.tests.fixtures import WorkFixture


class AssigneeTests(WorkFixture):
    def test_every_active_member_with_whether_they_can_open_it(self):
        User.objects.filter(pk=self.lee.pk).update(is_active=False)
        body = self.ok(self.csm, f"/api/v1/work/assignees/?customer={self.pizza.pk}")
        self.assertEqual(
            [(p["name"], p["can_open"]) for p in body["people"]],
            [
                ("Alice Admin", True),
                ("Carl CSM", True),
                ("Dana CSM", False),
                ("Mona Manager", True),
            ],
        )
        self.assertEqual(body["people"][0]["function"], "leadership")

    def test_an_account_is_checked_as_an_account(self):
        body = self.ok(self.csm, f"/api/v1/work/assignees/?account={self.emea.pk}")
        self.assertEqual({p["name"]: p["can_open"] for p in body["people"]}["Dana CSM"], False)

    def test_a_record_the_caller_cannot_open_is_404_and_bad_queries_400(self):
        self.assertEqual(
            self.get(self.csm, f"/api/v1/work/assignees/?account={self.west.pk}").status_code, 404
        )
        self.assertEqual(
            self.get(
                self.stranger, f"/api/v1/work/assignees/?customer={self.pizza.pk}"
            ).status_code,
            404,
        )
        for query in ("", f"?customer={self.pizza.pk}&account={self.emea.pk}", "?customer=x"):
            with self.subTest(query=query):
                response = self.get(self.csm, f"/api/v1/work/assignees/{query}")
                self.assertEqual(
                    (response.status_code, response.data),
                    (400, {"detail": "Name one organisation or account."}),
                )
```

- [ ] **Step 3: Run them to see them fail**

Run: `venv/bin/python manage.py test services.work --parallel --noinput`
Expected: an import error (`No module named 'services.work.today'`).

- [ ] **Step 4: Write the app**

Create `services/work/apps.py`:

```python
from django.apps import AppConfig


class WorkConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "services.work"
    verbose_name = "Work"
```

Create `services/work/clock.py`:

```python
"""What "today" is for a workspace's Work lists: the server's date (UTC,
TIME_ZONE) until delivery 3 adds the workspace's own timezone. Every Work
route asks here, so that change is this one function."""

from django.utils import timezone


def today_for(organisation):
    return timezone.localdate()
```

Create `services/work/states.py`:

```python
"""The open-task states every Work list and count shares, so Today, Team and
the drill-down never disagree about what "overdue" means: past due and not
Blocked (a Blocked task waits on its reason, not its date)."""

from django.db.models import Q

from services.customers.models import Task

OPEN, OVERDUE, BLOCKED = "open", "overdue", "blocked"
STATES = (OPEN, OVERDUE, BLOCKED)


def open_tasks(queryset=None):
    rows = Task.objects.all() if queryset is None else queryset
    return rows.exclude(status=Task.Status.COMPLETED)


def overdue_q(today):
    return Q(due_date__lt=today) & ~Q(status=Task.Status.BLOCKED)


def state_q(state, today):
    if state == OVERDUE:
        return overdue_q(today)
    if state == BLOCKED:
        return Q(status=Task.Status.BLOCKED)
    return Q()
```

Create `services/work/today.py`:

```python
"""Today (Work round §1.4): the reader's own open tasks, on records they may
open, in five groups. Tasks assigned to them on records they can no longer
open are counted in `hidden`, never listed."""

from datetime import timedelta

from services.customers.models import Task
from services.customers.task_access import openable_tasks
from services.customers.task_payloads import ROW_RELATED, task_row

from .states import open_tasks

GROUPS = ("overdue", "today", "week", "later", "blocked")
#: Rows listed per group; `counts` are always the full totals.
ROW_LIMIT = 100
WEEK = timedelta(days=7)


def bucket(task, today):
    if task.status == Task.Status.BLOCKED:
        return "blocked"
    if task.due_date < today:
        return "overdue"
    if task.due_date == today:
        return "today"
    if task.due_date <= today + WEEK:
        return "week"
    return "later"


def build(reader, *, today):
    mine = open_tasks().filter(assignee_id=reader.pk)
    # SOC2:AUTH-02 only tasks the reader reads, on records they may open
    readable = openable_tasks(reader, mine).select_related(*ROW_RELATED).order_by("due_date", "id")
    groups = {key: [] for key in GROUPS}
    counts = dict.fromkeys(GROUPS, 0)
    for task in readable:
        key = bucket(task, today)
        counts[key] += 1
        if len(groups[key]) < ROW_LIMIT:
            groups[key].append(task_row(task))
    return {
        "today": today.isoformat(),
        "groups": groups,
        "counts": counts,
        "hidden": mine.count() - sum(counts.values()),
    }
```

Create `services/work/drill.py`:

```python
"""The Team drill-down (Work round §1.4): one person's open tasks in one
state, only those the reader may read. No hidden count here: the Team row the
reader opened already carries its scope's."""

from services.customers.task_access import openable_tasks
from services.customers.task_payloads import ROW_RELATED, task_row

from .states import open_tasks, state_q

LIMIT = 200


def build(reader, assignee_id, state, *, today):
    tasks = open_tasks().filter(assignee_id=assignee_id).filter(state_q(state, today))
    # SOC2:AUTH-02 only tasks the reader reads, on records they may open
    rows = openable_tasks(reader, tasks).select_related(*ROW_RELATED).order_by("due_date", "id")
    return {"tasks": [task_row(task) for task in rows[:LIMIT]]}
```

Create `services/work/assignees.py`:

```python
"""The assignee picker (Work round §1.5): every active member of the
workspace and whether they can open the record. One `can_open` per member;
a workspace's members are few."""

from services.accounts.models import User
from services.customers.scoping import can_open


def build(reader, record):
    members = User.objects.filter(organisation_id=reader.organisation_id, is_active=True).order_by(
        "name", "id"
    )
    return {
        "people": [
            {
                "id": member.pk,
                "name": member.name,
                "function": member.function,
                # SOC2:AUTH-02 only people who can open the record may be given its work
                "can_open": can_open(member, record),
            }
            for member in members
        ]
    }
```

Create `services/work/views.py`:

```python
"""The Work routes (spec §1.4). Every list is the twice-filter
(`task_access.openable_tasks`); what the reader may not read is counted,
never named. See docs/API_CONTRACTS.md, `work`."""

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from services.customers.scoping import visible_accounts, visible_customers

from . import assignees, drill, today
from .clock import today_for
from .states import OPEN, STATES

CHOOSE_PERSON = "Choose a person."
CHOOSE_STATE = "Choose open, overdue or blocked."
NAME_ONE_RECORD = "Name one organisation or account."


class TodayView(APIView):
    """GET /api/v1/work/today/ — the caller's open tasks, grouped."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(today.build(request.user, today=today_for(request.user.organisation)))


class TaskDrillView(APIView):
    """GET /api/v1/work/tasks/?assignee=<id>&state=open|overdue|blocked."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        assignee = request.query_params.get("assignee", "")
        state = request.query_params.get("state") or OPEN
        if not assignee.isdigit():
            raise ValidationError({"assignee": [CHOOSE_PERSON]})
        if state not in STATES:
            raise ValidationError({"state": [CHOOSE_STATE]})
        on = today_for(request.user.organisation)
        return Response(drill.build(request.user, int(assignee), state, today=on))


class AssigneesView(APIView):
    """GET /api/v1/work/assignees/?customer=<id> | ?account=<id>."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        customer = request.query_params.get("customer", "")
        account = request.query_params.get("account", "")
        if bool(customer) == bool(account) or not (customer or account).isdigit():
            raise ValidationError({"detail": NAME_ONE_RECORD})
        # SOC2:AUTH-02 a record the caller cannot open reads as missing
        if customer:
            record = get_object_or_404(visible_customers(request.user), pk=int(customer))
        else:
            record = get_object_or_404(visible_accounts(request.user), pk=int(account))
        return Response(assignees.build(request.user, record))
```

`ValidationError({"detail": NAME_ONE_RECORD})` is raised in the view, not a serializer, so DRF renders it as `{"detail": "Name one organisation or account."}`.

Create `services/work/urls.py`:

```python
from django.urls import path

from . import views

urlpatterns = [
    path("today/", views.TodayView.as_view(), name="work-today"),
    path("tasks/", views.TaskDrillView.as_view(), name="work-tasks"),
    path("assignees/", views.AssigneesView.as_view(), name="work-assignees"),
]
```

In `config/urls.py`, directly below the `api/v1/brain/` route add:

```python
# Work (services/work): Today, Team, the drill-down and the assignee picker.
(path("api/v1/work/", include("services.work.urls")),)
```

In `config/settings.py`, add `"services.work",` to `INSTALLED_APPS` directly after `"services.brain",`.

- [ ] **Step 5: Run the tests**

Run: `venv/bin/python manage.py test services.work --parallel --noinput`
Expected: PASS.

- [ ] **Step 6: Lint, shards and commit**

Run: `venv/bin/ruff check . && venv/bin/ruff format services/work config && venv/bin/python scripts/ci_shard_labels.py --check 4`

```bash
git add services/work config/settings.py config/urls.py
git commit -m "feat(work): Today, the Team drill-down and the assignee picker

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Team, and the privacy and query-shape guards

**Files:**
- Create: `services/work/team.py`
- Modify: `services/work/views.py` (add `TeamView`), `services/work/urls.py` (add `team/`)
- Test: `services/work/tests/test_team.py`, `services/work/tests/test_privacy.py`, `services/work/tests/test_queries.py`

**Interfaces:**
- Consumes `brain.scope.resolve`, `default_key`, `available`, `Scope` (`key`, `is_company`, `owner_ids`); `brain.http.ScopeRefusals`; `states.open_tasks`, `overdue_q`; `openable_tasks`; Task 6's `WorkFixture`, `today.build`, `drill.build`, `assignees.build`; Task 5's `task_detail`.
- Produces `team.build(reader, scope, *, today) -> {"scope", "today", "people", "hidden"}` and `GET /api/v1/work/team/?scope=` (`work-team`).

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_team.py`:

```python
"""Team: one row per person in the reader's scope with open, overdue and
blocked counts over what the reader reads; the rest counted in `hidden`."""

from datetime import timedelta

from services.accounts.models import User
from services.work.tests.fixtures import WorkFixture

URL = "/api/v1/work/team/"


def rows(body):
    return [
        (p["person"]["name"], p["open"], p["overdue"], p["blocked"], p["oldest_overdue"])
        for p in body["people"]
    ]


class TeamTests(WorkFixture):
    def test_a_manager_sees_their_team_with_the_unreadable_counted(self):
        body = self.ok(self.mona, f"{URL}?scope=team")
        self.assertEqual(
            rows(body),
            [
                ("Carl CSM", 5, 1, 1, (self.today - timedelta(days=2)).isoformat()),
                ("Mona Manager", 0, 0, 0, None),
            ],
        )
        self.assertEqual(
            (body["scope"], body["hidden"], body["today"]), ("team", 1, self.today.isoformat())
        )
        self.assertEqual(
            body["people"][0]["person"], {"id": self.csm.pk, "name": "Carl CSM", "active": True}
        )

    def test_the_default_is_the_widest_scope(self):
        self.assertEqual(self.ok(self.mona, URL)["scope"], "team")
        self.assertEqual(self.ok(self.csm, URL)["scope"], "me")
        self.assertEqual(self.ok(self.admin, URL)["scope"], "company")

    def test_me_is_my_own_row(self):
        body = self.ok(self.csm, f"{URL}?scope=me")
        self.assertEqual(
            rows(body), [("Carl CSM", 5, 1, 1, (self.today - timedelta(days=2)).isoformat())]
        )
        self.assertEqual(body["hidden"], 1)

    def test_view_all_counts_every_task_in_the_company(self):
        # View-all reads every task on the records it opens: all of them here,
        # so nothing is hidden (owner decision 2026-10-07).
        body = self.ok(self.admin, f"{URL}?scope=company")
        self.assertEqual(
            rows(body),
            [
                ("Carl CSM", 6, 2, 1, (self.today - timedelta(days=2)).isoformat()),
                ("Dana CSM", 1, 1, 0, (self.today - timedelta(days=3)).isoformat()),
                ("Alice Admin", 0, 0, 0, None),
                ("Lee Lead", 0, 0, 0, None),
                ("Mona Manager", 0, 0, 0, None),
            ],
        )
        self.assertEqual(body["hidden"], 0)

    def test_leadership_counts_every_task_on_records_it_opens(self):
        # Lee reads every task but opens only Loose Ltd: Carl's and Dana's are hidden.
        body = self.ok(self.lee, f"{URL}?scope=company")
        self.assertEqual({tuple(r[1:4]) for r in rows(body)}, {(0, 0, 0)})
        self.assertEqual(body["hidden"], 7)
        self.make_task(
            "Tidy Loose Ltd", on=self.loose, assignee=self.other, created_by=self.other, due_in=-1
        )
        body = self.ok(self.lee, f"{URL}?scope=company")
        self.assertEqual(rows(body)[0][:3], ("Dana CSM", 1, 1))
        self.assertEqual(body["hidden"], 7)

    def test_a_deactivated_person_stays_while_they_hold_work(self):
        User.objects.filter(pk=self.csm.pk).update(is_active=False)
        User.objects.filter(pk=self.lee.pk).update(is_active=False)
        team = self.ok(self.mona, f"{URL}?scope=team")
        self.assertEqual(team["people"][0]["person"]["active"], False)
        company = self.ok(self.admin, f"{URL}?scope=company")
        self.assertNotIn("Lee Lead", [name for name, *_ in rows(company)])

    def test_refusals(self):
        refused = self.get(self.other, f"{URL}?scope=team")
        self.assertEqual(
            (refused.status_code, refused.data),
            (403, {"code": "SCOPE_NOT_ALLOWED", "detail": "You can't see that view."}),
        )
        unknown = self.get(self.mona, f"{URL}?scope=everyone")
        self.assertEqual(
            (unknown.status_code, unknown.data),
            (400, {"code": "SCOPE_UNKNOWN", "detail": "Choose me, team or company."}),
        )
        self.assertEqual(self.get(self.stranger, f"{URL}?scope=company").status_code, 403)
```

Create `services/work/tests/test_privacy.py`:

```python
"""Counted, not named (spec §4): for a member, a manager, a view-all reader,
a Leadership reader and someone from another workspace, no Work response
names a task or record they cannot read. Carl's "West handover" sits on
Dana's Taco West: Dana reads it (she made it) and so does Alice (view-all
reads every task on records it opens, owner decision 2026-10-07); Carl and
Mona cannot open Taco West, Lee (Leadership) cannot open it either, and Gus
is in another workspace."""

import json

from services.work.tests.fixtures import WorkFixture

SECRET = ("West handover", "Taco West")


class PrivacyTests(WorkFixture):
    def bodies(self, reader):
        urls = [
            "/api/v1/work/today/",
            f"/api/v1/work/tasks/?assignee={self.csm.pk}",
            f"/api/v1/work/tasks/?assignee={self.csm.pk}&state=overdue",
        ]
        for scope in ("me", "team", "company"):
            urls.append(f"/api/v1/work/team/?scope={scope}")
        for url in urls:
            response = self.get(reader, url)
            if response.status_code == 200:
                yield url, json.dumps(response.data)
            else:
                self.assertEqual(response.status_code, 403, (url, response.data))

    def test_nobody_but_its_reader_sees_the_handover_named(self):
        for reader in (self.csm, self.mona, self.lee, self.stranger):
            for url, text in self.bodies(reader):
                for secret in SECRET:
                    with self.subTest(reader=reader.name, url=url, secret=secret):
                        self.assertNotIn(secret, text)
            with self.subTest(reader=reader.name, detail=True):
                self.assertEqual(
                    self.get(reader, f"/api/v1/tasks/{self.handed.pk}/").status_code, 404
                )

    def test_the_ones_who_read_it_do(self):
        body = self.ok(self.other, f"/api/v1/work/tasks/?assignee={self.csm.pk}")
        self.assertEqual([row["title"] for row in body["tasks"]], ["West handover"])
        self.assertEqual(self.get(self.other, f"/api/v1/tasks/{self.handed.pk}/").status_code, 200)
        body = self.ok(self.admin, f"/api/v1/work/tasks/?assignee={self.csm.pk}&state=overdue")
        self.assertIn("West handover", [row["title"] for row in body["tasks"]])
        self.assertEqual(self.get(self.admin, f"/api/v1/tasks/{self.handed.pk}/").status_code, 200)

    def test_another_workspace_sees_nothing_of_this_one(self):
        for url, text in self.bodies(self.stranger):
            with self.subTest(url=url):
                self.assertNotIn("Pizza Hut", text)
                self.assertNotIn("Carl CSM", text)
        self.assertEqual(
            self.get(self.stranger, f"/api/v1/tasks/{self.overdue.pk}/").status_code, 404
        )
        self.assertEqual(
            self.get(
                self.stranger, f"/api/v1/work/assignees/?customer={self.pizza.pk}"
            ).status_code,
            404,
        )
```

Create `services/work/tests/test_queries.py`:

```python
"""Postgres 16 plans a join made unique with DISTINCT badly (about a second
a call; services.customers.scoping). No Work query, and no task-panel or task
list query, may use DISTINCT."""

from types import SimpleNamespace

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.accounts.models import User
from services.brain.scope import available, resolve
from services.customers.models import Task
from services.customers.task_access import openable_tasks
from services.customers.task_payloads import DETAIL_RELATED, task_detail
from services.customers.views import TaskListView
from services.work import assignees, drill, team, today
from services.work.states import STATES
from services.work.tests.fixtures import WorkFixture


class QueryShapeTests(WorkFixture):
    def test_no_distinct_in_any_work_query(self):
        for reader in (self.csm, self.mona, self.admin, self.lee):
            reader = User.objects.get(pk=reader.pk)
            with CaptureQueriesContext(connection) as queries:
                today.build(reader, today=self.today)
                for key in available(reader):
                    team.build(reader, resolve(reader, key), today=self.today)
                for state in STATES:
                    drill.build(reader, self.csm.pk, state, today=self.today)
                assignees.build(reader, self.pizza)
                rows = openable_tasks(reader, Task.objects.filter(pk=self.overdue.pk))
                task = rows.select_related(*DETAIL_RELATED).first()
                if task is not None:
                    task_detail(task, reader)
            self.assertTrue(queries.captured_queries)
            for query in queries.captured_queries:
                self.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])

    def test_the_task_list_no_longer_uses_distinct(self):
        for mine in ("true", ""):
            view = TaskListView()
            view.request = SimpleNamespace(
                user=User.objects.get(pk=self.mona.pk), query_params={"mine": mine}
            )
            self.assertNotIn("DISTINCT", str(view.get_queryset().query).upper())
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.work --parallel --noinput`
Expected: an import error (`cannot import name 'team' from 'services.work'`).

- [ ] **Step 3: Write `team.py`**

Create `services/work/team.py`:

```python
"""Team (Work round §1.4): for each person in the reader's scope (Brain's Me,
My team, Company), their open, overdue and blocked counts and oldest overdue
date, over the open tasks the reader may read. The scope's other open tasks
are `hidden`: counted, never named.

The scope chooses whose tasks; the reader's own rights choose which are
counted (never the scope's actor: Company's is the whole organisation). A
view-all or Leadership reader reads every task, so their `hidden` is only
tasks on records they cannot open. One GROUP BY over `id IN` subqueries, no
DISTINCT."""

from django.db.models import Count, Min, Q

from services.accounts.models import User
from services.customers.models import Task
from services.customers.task_access import openable_tasks

from .states import open_tasks, overdue_q


def _members(reader, scope):
    members = User.objects.filter(organisation_id=reader.organisation_id)
    if scope.is_company:
        return members
    return members.filter(id__in=sorted(scope.owner_ids))


def build(reader, scope, *, today):
    members = _members(reader, scope)
    waiting = open_tasks().filter(assignee_id__in=members.values("id"))
    # SOC2:AUTH-02 counted only over tasks the reader reads, on records they may open
    readable = openable_tasks(reader, waiting)
    late = overdue_q(today)
    counted = {
        row["assignee_id"]: row
        for row in readable.order_by()
        .values("assignee_id")
        .annotate(
            open=Count("id"),
            overdue=Count("id", filter=late),
            blocked=Count("id", filter=Q(status=Task.Status.BLOCKED)),
            oldest_overdue=Min("due_date", filter=late),
        )
    }
    people = []
    for member in members.order_by("name", "id"):
        row = counted.get(member.pk)
        if row is None and not member.is_active:
            continue
        oldest = row["oldest_overdue"] if row else None
        people.append(
            {
                "person": {"id": member.pk, "name": member.name, "active": member.is_active},
                "open": row["open"] if row else 0,
                "overdue": row["overdue"] if row else 0,
                "blocked": row["blocked"] if row else 0,
                "oldest_overdue": None if oldest is None else oldest.isoformat(),
            }
        )
    people.sort(
        key=lambda p: (-p["overdue"], -p["open"], p["person"]["name"].lower(), p["person"]["id"])
    )
    return {
        "scope": scope.key,
        "today": today.isoformat(),
        "people": people,
        "hidden": waiting.count() - sum(p["open"] for p in people),
    }
```

`.order_by()` before `.values()` matters: `Task.Meta.ordering` would otherwise join the GROUP BY and split each person's row.

- [ ] **Step 4: The route**

In `services/work/views.py`, add to the imports:

```python
from services.brain.http import ScopeRefusals
from services.brain.scope import default_key, resolve
```

change `from . import assignees, drill, today` to `from . import assignees, drill, team, today`, and add:

```python
class TeamView(ScopeRefusals, APIView):
    """GET /api/v1/work/team/?scope=me|team|company (default: the widest)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        key = request.query_params.get("scope") or default_key(request.user)
        # SOC2:AUTH-02 a scope the reader may not use is refused before anything is read
        scope = resolve(request.user, key)
        on = today_for(request.user.organisation)
        return Response(team.build(request.user, scope, today=on))
```

In `services/work/urls.py` add:

```python
(path("team/", views.TeamView.as_view(), name="work-team"),)
```

- [ ] **Step 5: Run the tests**

Run: `venv/bin/python manage.py test services.work services.brain --parallel --noinput`
Expected: PASS.

- [ ] **Step 6: Lint, shards and commit**

Run: `venv/bin/ruff check . && venv/bin/ruff format services/work && venv/bin/python scripts/ci_shard_labels.py --check 4`

```bash
git add services/work/team.py services/work/views.py services/work/urls.py services/work/tests/test_team.py services/work/tests/test_privacy.py services/work/tests/test_queries.py
git commit -m "feat(work): Team by scope, counted not named; no DISTINCT anywhere in Work

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: End to end over HTTP, and the docs

**Files:**
- Create: `e2e/test_work_flow.py`
- Modify: `docs/API_CONTRACTS.md`, `docs/audit-events.md`, `docs/data-classification.md`, `docs/product/01-prd.md`, `docs/product/02-trd.md`, `docs/product/05-backend-schema.md`, `docs/product/06-implementation-plan.md`

**Interfaces:**
- Consumes every route above through real HTTP only (`e2e.http`).

- [ ] **Step 1: Write the end-to-end test**

Create `e2e/test_work_flow.py`:

```python
"""End-to-end tier: real server, real HTTP, real test DB.

Mona manages Carl. She gives him a task on his Pizza Hut; he is told, finds
it in Today, opens the panel, blocks it with a reason; Mona's Team shows it
blocked and she comments; Carl marks it done and it leaves Today. Dana, on
another branch, can neither open it nor be given it."""

from datetime import timedelta
from decimal import Decimal

from django.test import LiveServerTestCase
from django.utils import timezone

from e2e.http import http_get, http_patch, http_post
from services.accounts.models import User
from services.billing.models import BillingAccount
from services.customers.models import Customer


class WorkFlowTests(LiveServerTestCase):
    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def login(self, email, password="memberpass12"):
        status, body = http_post(self.api("/auth/login/"), {"email": email, "password": password})
        self.assertEqual(status, 200, body)
        return body["access"]

    def member(self, admin, name, email):
        status, body = http_post(
            self.api("/auth/users/"),
            {"name": name, "email": email, "password": "memberpass12"},
            token=admin,
        )
        self.assertEqual(status, 201, body)
        return User.objects.get(pk=body["id"])

    def test_full_flow(self):
        # 1. The workspace, its people and Carl's book.
        status, body = http_post(
            self.api("/auth/signup/"),
            {
                "organisation_name": "Acme Inc",
                "name": "Alice Admin",
                "email": "alice@acme.io",
                "password": "supersecret1",
            },
        )
        self.assertEqual(status, 201, body)
        alice = body["access"]
        # Seats are services/billing's concern, not this flow's.
        BillingAccount.objects.filter(organisation__name="Acme Inc").update(seats_limit=10)
        mona = self.member(alice, "Mona Manager", "mona@acme.io")
        carl = self.member(alice, "Carl CSM", "carl@acme.io")
        dana = self.member(alice, "Dana CSM", "dana@acme.io")
        User.objects.filter(pk=carl.pk).update(reports_to=mona)
        pizza = Customer.objects.create(
            organisation=mona.organisation,
            name="Pizza Hut",
            owner=carl,
            arr_billed_at_account=Decimal(300_000),
        )
        Customer.objects.create(organisation=mona.organisation, name="Taco Bell", owner=dana)
        tokens = {who: self.login(f"{who}@acme.io") for who in ("mona", "carl", "dana")}
        today = timezone.localdate()

        # 2. Mona gives Carl a task due today; Dana cannot be given it.
        tasks_url = self.api(f"/customers/{pizza.pk}/tasks/")
        new = {"title": "Prep the QBR", "due_date": today.isoformat(), "priority": "high"}
        status, body = http_post(tasks_url, {**new, "assignee_id": dana.pk}, token=tokens["mona"])
        self.assertEqual((status, body["code"]), (400, "ASSIGNEE_CANNOT_OPEN"))
        status, body = http_post(tasks_url, {**new, "assignee_id": carl.pk}, token=tokens["mona"])
        self.assertEqual(status, 201, body)
        task_id = body["id"]

        # 3. Carl is told, and finds it in Today.
        status, notes = http_get(self.api("/notifications/"), token=tokens["carl"])
        self.assertEqual(status, 200, notes)
        [note] = [n for n in notes if n["kind"] == "task_assigned"]
        self.assertEqual(note["link"], f"/work/today?task={task_id}")
        self.assertEqual(note["message"], "Mona Manager assigned you “Prep the QBR” on Pizza Hut.")
        status, body = http_get(self.api("/work/today/"), token=tokens["carl"])
        self.assertEqual([r["id"] for r in body["groups"]["today"]], [task_id])
        self.assertEqual(body["counts"]["overdue"], 0)

        # 4. The panel: Carl blocks it, with a reason.
        task_url = self.api(f"/tasks/{task_id}/")
        status, body = http_get(task_url, token=tokens["carl"])
        self.assertEqual((status, [e["kind"] for e in body["events"]]), (200, ["created"]))
        status, body = http_patch(task_url, {"status": "blocked"}, token=tokens["carl"])
        self.assertEqual((status, body), (400, {"blocked_reason": ["Say what it's blocked on."]}))
        status, body = http_patch(
            task_url,
            {"status": "blocked", "blocked_reason": "Waiting on the deck"},
            token=tokens["carl"],
        )
        self.assertEqual((status, body["status"]), (200, "blocked"))

        # 5. Mona's Team shows it blocked; she comments. Dana can't open it.
        status, body = http_get(self.api("/work/team/?scope=team"), token=tokens["mona"])
        self.assertEqual(status, 200, body)
        row = next(p for p in body["people"] if p["person"]["id"] == carl.pk)
        self.assertEqual((row["open"], row["blocked"], body["hidden"]), (1, 1, 0))
        status, body = http_post(
            f"{task_url}comments/", {"body": "Deck is in your inbox."}, token=tokens["mona"]
        )
        self.assertEqual(status, 201, body)
        status, _ = http_get(task_url, token=tokens["dana"])
        self.assertEqual(status, 404)

        # 6. Carl moves the date, then marks it done; it leaves Today.
        later = (today + timedelta(days=1)).isoformat()
        status, body = http_patch(task_url, {"due_date": later}, token=tokens["carl"])
        self.assertEqual(status, 200, body)
        status, body = http_patch(task_url, {"status": "completed"}, token=tokens["carl"])
        self.assertEqual((status, body["blocked_reason"]), (200, ""))
        self.assertEqual(
            [e["kind"] for e in body["events"]],
            ["created", "status", "comment", "due_changed", "status"],
        )
        status, body = http_get(self.api("/work/today/"), token=tokens["carl"])
        self.assertEqual(
            body["counts"], {"overdue": 0, "today": 0, "week": 0, "later": 0, "blocked": 0}
        )
```

- [ ] **Step 2: Run it**

Run: `venv/bin/python manage.py test e2e.test_work_flow --parallel --noinput`
Expected: PASS.

- [ ] **Step 3: API contracts**

In `docs/API_CONTRACTS.md`:

1. In the Status table's Tasks row (line ~67), replace `No create/update endpoint yet.` with `Created on the record's Tasks tab and worked in Work (see the `work` section): `GET/PATCH /api/v1/tasks/<id>/`, comments, Today, Team.`
2. Replace the whole `### Models — `Task`` section (from its heading down to, not including, `### `GET /api/v1/customers/<customer_id>/tasks/``) with:

````text
### Models — `Task`, `TaskEvent`

Mirrors: `src/components/shared/ActivityFeed.tsx`'s "Tasks" filter, the Work section and its task panel.

Same "belongs to exactly one of `Customer` or `Account`" shape as `Activity`/`Email`.

Fields: `title`, `description` (blank), `assignee` (a real `User`, SET_NULL) with `assignee_name` kept equal to its name on every save that touches it (the only name an old seeded task has), `created_by`, `due_date`, `priority` (`high`/`medium`/`low`), `status` (`pending`/`in-progress`/`blocked`/`completed`, default `pending`), `blocked_reason` (≤ 255; set exactly while Blocked — `Task.save` and the CheckConstraint `task_blocked_reason_only_when_blocked`), `source` (`manual`/`plan`/`rule`/`recommendation`/`agent`, default `manual`; customers migration 0056 backfilled `plan` from `plan_id`, then `agent` from `initiative_id`, else `manual`), `initiative`, `plan`, `milestone`, `created_at`. Index `(assignee, status, due_date)`. No `group` field: the date bucket is computed when read.

`TaskEvent` is a task's trail: `task` (CASCADE, `task.events`), `actor` (null = Revenact), `kind` (`created`, `assigned`, `status`, `due_changed`, `edited`, `comment`, `recommended`, `nudged`, `escalated`), `data` (JSON, the values a sentence is written from), `body` (a comment), `created_at`; oldest first. Read only with its task (`services/customers/task_access.openable_tasks`).

Every way a task is made (the record's Tasks tab, a plan, a rule, an approved AI-agent proposal) goes through `services/customers/task_changes.add_task` (a plan's start through `created_events`): it stores the real assignee, writes `created` and tells the assignee (`task_assigned`) unless they are the one acting; plans tell theirs with `plan_task_assigned` instead.

See `seed_demo_tasks` for demo data (run after `seed_demo_accounts`); its due dates are offsets from the day it runs.

`plan` and `milestone` (both nullable) link a task to a plan and one of its milestones (`services/plans`); a milestone is set only with its own plan. The nested task lists (`TaskSerializer`) carry `plan: {id, name} | null` and `milestone: {id, name} | null`; the cross-company `GET /api/v1/tasks/` (`TaskListSerializer`) does not.
````

3. In `### `GET /api/v1/customers/<customer_id>/tasks/``, replace its response sentence with: `**Response `200`** — a plain array, each entry: `id`, `title`, `description`, `assignee_name`, `assignee` (`{id, name}` or null), `created_by`, `due_date`, `priority`, `status`, `blocked_reason`, `source`, `created_at`, `initiative`, `plan`, `milestone`. **`POST`** takes the New task body in the `work` section's "Changed existing routes".`
4. Replace the whole `### `PATCH /api/v1/tasks/<id>/`` section (heading to, not including, `### Models — `Note``) with:

```text
### `GET` / `PATCH /api/v1/tasks/<id>/`, `POST /api/v1/tasks/<id>/comments/`

The task panel: see the `work` section below. The Cockpit tick-off is a PATCH of `status` alone; its
response is the panel's shape, which keeps `parent_name`, `parent_type`, `status_display` and
`priority_display`.
```

5. In the Segments paragraph that says `and `plan_started` and `plan_task_assigned`, from `plans`;`, replace that phrase with `` `plan_started` and `plan_task_assigned`, from `plans`, and `task_assigned`, from tasks (see `work`);``.
6. In the `plans` section, after `A task's status may also change through `PATCH /api/v1/tasks/<id>/`, which moves its milestone and plan the same way.`, append: ` That route also takes the task's other fields from the plan's editors while the plan is open; the plan route itself does not offer Blocked.`
7. Insert, directly above the template heading `## `<app_name>` — <Frontend feature name>`, a new section: the heading `## `work` — Work (`/work/today`, `/work/team`, the task panel)`, one line `Built for the Work round's first delivery (spec: react-ts-app `docs/superpowers/specs/2026-10-07-work-round-design.md` §1).`, then the whole body of `docs/superpowers/plans/2026-10-07-work-tasks-api.md` from `## Shared shapes` to the end, with every `## ` heading turned into `### `.

- [ ] **Step 4: Audit and data classification**

In `docs/audit-events.md`, replace the row `| `task.update` | `TaskDetailView` (Cockpit tick-off) | user | Task | `fields`, `from`, `to` |` with:

```text
| `task.update` | `services.customers.task_views.TaskDetailView` (the task panel, the Cockpit tick-off) | user | Task | `fields` (`title`, `description`, `priority`, `due_date`, `assignee`, `status`, `blocked_reason` that changed); `from`, `to` when `status` changed |
```

In `docs/data-classification.md`, in the `customers.Task, customers.CalendarEvent, customers.Activity` row, replace `titles and descriptions may quote customers — treat description as confidential.` with `titles, descriptions, Blocked reasons and task comments (`customers.TaskEvent.body`) may quote customers — treat them as confidential.`, replace `is **readable by those two and their management chains only** (`services/customers/personal.py`)` with `is **readable by those two, their management chains, and readers holding `view_all_accounts` or in the Leadership function** (`services/customers/personal.py`; widened 2026-10-07), always only on a record the reader may open`, and append to that row's last cell: ` Work lists (`services/work`) read the same rule AND the record's own, counting the rest.` Add, directly below the `| Plan tasks assigned (in-app `Notification`, kind `plan_task_assigned`) |` row:

```text
| Task assigned (in-app `Notification`, kind `task_assigned`) | who assigned it, the task's title and its organisation or account (only when the recipient may open it; otherwise "a task on an account you can't open") | internal | to the assignee, never to the person acting; links to `/work/today?task=<id>` |
```

- [ ] **Step 5: PRD, TRD, schema and implementation plan**

`docs/product/01-prd.md`: directly below the `| Plans (Project Management) | Built (backend) |` row add:

```text
| Work: tasks you can work | Built (backend) | Today (my open tasks: overdue, today, this week, later, blocked) and Team (Me / My team / Company: open, overdue and blocked per person, with a drill-down), only tasks and records the reader may open, the rest counted. A task panel edits title, description, status (Blocked needs a reason), due date, priority and assignee (only people who can open the record), takes comments and keeps an activity trail. Every task, however made (a person, a plan, a rule, the AI agent), has a real assignee who is told in-app |
```

and add as the last row of §9 Release history:

```text
| 2026-10-07 | Work delivery 1: tasks you can work (backend) |
```

`docs/product/02-trd.md`: directly below the `| `services/customers/personal.py` |` row add:

```text
| `services/customers/task_access.py`, `task_changes.py`, `task_payloads.py` | Tasks: the twice-filter (`openable_tasks`), who may be given one (`assignee_for`, 400 `ASSIGNEE_CANNOT_OPEN`), which fields a reader may change; `add_task`, the one way every path makes a task (event, `task_assigned`); one `TaskEvent` per changed field |
| `services/work/` | Work: Today, Team (Brain's scopes), the drill-down and the assignee picker, all over `openable_tasks` as `id IN` subqueries; `clock.today_for` is the one place "today" is decided |
```

and replace the two lines `- Notifications cover invites, hand-offs, owner assignment and questions only.` / `  Task, ticket and pipeline assignees are still plain text.` with:

```text
- Notifications are in-app only (no email yet). Ticket and pipeline assignees are still plain text.
```

`docs/product/05-backend-schema.md`: replace the `| `Task` | ...` row with:

```text
| `Task` | `title`, `description`, `assignee_name` (kept equal to `assignee.name`), `created_by`, `assignee`, `due_date`, `priority`, `status` (pending, in-progress, blocked, completed), `blocked_reason` (only while blocked; CheckConstraint), `source` (manual, plan, rule, recommendation, agent), `initiative` (links work to a decision), `plan`, `milestone` (a plan's work; services/plans). Index `(assignee, status, due_date)` |
| `TaskEvent` | A task's trail: `task` (CASCADE), `actor` (null = Revenact), `kind` (created, assigned, status, due_changed, edited, comment, recommended, nudged, escalated), `data` JSON, `body`, `created_at`; read only with its task |
```

in §11 Visibility rules replace the row `| Tasks | Creator, assignee and both chains; authorless seeded rows visible to all | same |` with `| Tasks | Creator, assignee and both chains, plus every reader with view_all_accounts or the Leadership function; authorless seeded rows visible to all; always only on a record the reader may open | same |`, and in the `Notification` row, replace `plan_started, plan_task_assigned;` with `plan_started, plan_task_assigned, campaign_sent, task_assigned (kind ≤ 32 characters);`.

`docs/product/06-implementation-plan.md`: replace the body of `### C6. Notifications for the rest of the assignees` with:

```text
Tasks done 2026-10-07 (Work delivery 1): every task has a real assignee, told in-app
(`task_assigned`) by whichever path made it. Ticket, risk and opportunity assignees are
still plain text and notify nobody. Work deliveries 2 and 3 (recommendations, nudges,
escalations, the daily digest) follow: react-ts-app
`docs/superpowers/specs/2026-10-07-work-round-design.md`.
```

and append to `### C4. Move the Ops agent's assignee rule into code`, after its Steps paragraph:

```text
Partly done 2026-10-07: on approval the proposed name is matched to an active member who can
open the organisation (exact, then ignoring case), else the organisation's owner, else the
approver (`metrics.proposals._assignee`). Choosing by function is still the prompt's.
```

- [ ] **Step 6: Format the docs, lint and check the shards**

Run: `venv/bin/ruff format docs/ && venv/bin/ruff format --check . && venv/bin/ruff check . && venv/bin/python scripts/ci_shard_labels.py --check 4 && venv/bin/python manage.py makemigrations --check --dry-run`
Expected: no errors; `No changes detected`.

- [ ] **Step 7: Run the affected apps, then the whole suite, one run at a time in the foreground**

Run: `venv/bin/python manage.py test services.customers services.work services.plans services.rules services.metrics services.brain services.notifications e2e.test_work_flow --parallel --noinput`
Expected: PASS.

Run: `venv/bin/python manage.py test --parallel --noinput` (timeout 600000 ms)
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add e2e/test_work_flow.py docs/API_CONTRACTS.md docs/audit-events.md docs/data-classification.md docs/product/01-prd.md docs/product/02-trd.md docs/product/05-backend-schema.md docs/product/06-implementation-plan.md
git commit -m "test(work): tasks end to end; document the Work API, the model and the notice

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage:**
- §1.1 model: `description`, `blocked` with `blocked_reason` (required when Blocked, cleared otherwise), `source` with the backfill as a data migration, the `(assignee, status, due_date)` index, `assignee_name` in sync, `TaskEvent` with all nine kinds, newest last, visible where its task is — Task 1 (+ Task 2's `openable_tasks`).
- §1.2 permissions: edit (Decision 1), plan tasks keep the plan's rules with status through `set_task_status` (Task 5, Decision 2), assign = active member who can open (`assignee_for`, Tasks 2, 3, 5), comment = whoever reads (Task 5).
- §1.3 fixes: real assignee, `created` (+ `recommended` via `facts`), `task_assigned` unless the actor, link `/work/today?task=<id>` — manual and rule (Task 3), plans (Task 3, Decision 4), agent with exact then case-blind matching and the owner fallback noted in the event (Task 4, Decision 6); the stale `Notification` docstring (Task 1).
- §1.4 API: Today (Task 6), Team with `hidden` (Task 7), drill (Task 6), `GET /tasks/<id>/` with events and `PATCH` with per-field events, notification and audit (Task 5), comments (Task 5); plus the assignee picker §1.5 needs (Task 6, Decision 12).
- §4 privacy: twice-filter on every list and count, counted not named, record named in a notification only to someone who can open it — Tasks 2, 6, 7 (`test_privacy`).
- Owner decision 2026-10-07 (view-all and Leadership read every task, on records they may open, and so edit and reassign it): `visible_tasks` widened in Task 2 (Step 3b) with `test_tasks_personal` rewritten on purpose (Step 3c) and every other caller's suite re-run (Step 6b); tests for view-all and Leadership seeing and editing a task outside their chain in Tasks 2 (`VisibleTasksTests`, `OpenableTests`), 5 (`ViewAllAndLeadershipTests`), 6 (drill) and 7 (Team, privacy); the widening adds no join and no DISTINCT (Task 7's query-shape test covers it); docs in Task 8.
- §5 edge cases in delivery 1: a deactivated assignee shows in Team as `active: false` (Task 7) and is not notified (Task 2); reassign tells only the new assignee and self-assignment tells nobody (Task 5).
- §6 backend tests: four creation paths (Tasks 3–4), name matching (Task 4), PATCH events and `ASSIGNEE_CANNOT_OPEN` (Task 5), privacy with a member, a manager, view-all, Leadership and an outsider (Task 7), the no-DISTINCT test over `services/work` (Task 7), e2e (Task 8); docs in the same PR (Task 8).
- Out of scope here: the Recommendation model, WorkSettings, jobs, digest, timezone (deliveries 2–3); names are reserved (`Source.RECOMMENDATION`, the event kinds, `kind` length 32, `clock.today_for`).

**Placeholder scan:** no TBD or TODO; every code step shows its code, every test step its tests, and the generated migrations list the operations they must contain.

**Type and name consistency:**
- `add_task(*, parent, title, due_date, priority, assignee, created_by, actor, source, description, status, blocked_reason, facts, notify_assignee, event_data, **links)` is defined in Task 2 and called that way in Tasks 3, 4 and 5's fixture.
- `snapshot` / `changed_fields` / `record_changes(task, before, *, actor)` are defined in Task 2, used in Task 3 (plan route) and Task 5.
- `assignee_for(organisation_id, pk, record)` and `AssigneeCannotOpen` (Task 2) are used in Tasks 3 and 5; `SAY_WHY_BLOCKED` in Tasks 3 and 5.
- `ROW_RELATED`, `DETAIL_RELATED`, `task_row`, `task_detail(task, reader)` (Task 5) are used in Tasks 6 and 7.
- `set_task_status(..., blocked_reason=...)` is changed in Task 5 and called only from Task 5's view.
- `states.open_tasks`, `overdue_q`, `state_q`, `STATES` (Task 6) are used in Tasks 6–7; `WorkFixture.make_task`, `get`, `ok` (Task 6) in Task 7.
- Event `data` keys match the API contract table: `created` (`source`, `assignee`, `plan`/`rule`/`proposal`, `suggested`, `fallback`), `assigned` (`from`, `to`), `status` (`from`, `to`, `reason`), `due_changed`, `edited` (`field`, `from`, `to`).

**Execution handoff:** Subagent-driven is recommended: one fresh subagent per task, with a review between tasks. Tasks are sequential: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 (each consumes the previous names; 3 and 4 could swap).
