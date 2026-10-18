# Work, delivery 1 ("tasks you can work"): API contract

Backend plan: `docs/superpowers/plans/2026-10-07-work-tasks-backend.md`. Spec: react-ts-app
`docs/superpowers/specs/2026-10-07-work-round-design.md` §1.4. Every path is under `/api/v1/`,
every route is `IsAuthenticated`, every body is JSON. Dates are `YYYY-MM-DD`; timestamps are
ISO 8601 UTC as DRF writes them (`2026-10-07T09:30:00.123456Z`). "Today" is the server's date
(UTC) until delivery 3 moves it to the workspace timezone.

## Who reads a task

Every list, count and route below reads a task only when **both** hold:

- the task rule: the caller made it, is its assignee, is above either in the org chart, **or holds
  `view_all_accounts` or the Leadership function** (they read every task); a seeded task with
  neither creator nor assignee is everyone's;
- the record rule: the caller may open the task's organisation or account.

Whoever reads an ordinary task may also change and reassign it. A plan's task keeps the plan's
rules (see `editable` below). Anything else is counted in `hidden` where a route has one, and never
named.

## Shared shapes

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

## `GET /work/today/`

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

## `GET /work/team/?scope=me|team|company`

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

## `GET /work/tasks/?assignee=<id>&state=open|overdue|blocked`

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

## `GET /work/assignees/?customer=<id>` or `?account=<id>`

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

## `GET /tasks/<id>/`

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
  *Final fix wave:* `["status"]` only for those the plan's task route lets tick it (its editors,
  the task's assignee, its creator, via `plans.access.can_check`); `[]` for any other reader,
  view-all and Leadership included, whose status PATCH is 403 as on the plan route.
- `404 {"detail": "No such task."}` for a task the caller may not read: another workspace, a
  record they cannot open, or (for a caller without `view_all_accounts` or the Leadership function)
  outside the task's chain: its creator, its assignee and anyone above either.

## `PATCH /tasks/<id>/`

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
  nothing. *Final fix wave:* only fields whose value differs are checked against `editable`;
  unchanged fields sent with the whole form are ignored, never refused.
- `blocked_reason` is required (non-blank, at most 255) when the resulting status is `blocked`,
  may be sent alone to change the reason of a Blocked task, and is cleared when the status is
  anything else.
- Each changed field writes its event (see the table above). A changed assignee is told with a
  `task_assigned` notification, unless they are the caller; the previous assignee is not told.
  The change is audited as `task.update` with `fields`, and `from`/`to` when `status` changed.
- After a change that removes the caller's read access (e.g. handing the task outside their chain), the response still carries the task as saved, with `editable: []`; the next GET is 404.
- A plan's task is also audited as the plan's own task route audits it (`plan.task_changed`,
  `change: "edited"`), and a new assignee is told with `plan_task_assigned` instead of
  `task_assigned`, never the caller.
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

## `POST /tasks/<id>/comments/`

```json
{"body": "Called, left a voicemail."}
```

- `201` with the new `comment` Event. Anyone who may read the task may comment.
- Refusals: `400 {"body": ["Write a comment."]}`;
  `400 {"body": ["Keep a comment under 5,000 characters."]}`; `404 {"detail": "No such task."}`.

## Changed existing routes

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

## Notifications

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
