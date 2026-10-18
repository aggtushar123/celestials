# Plans (Project Management)

Agreed with the owner on 2026-10-04. This is delivery 4 of the Impact section. See
`2026-10-03-segments-design.md` §0 for the who → when → what loop. Segments
decide who, rules decide when, and plans are the internal "what": a run of
work, set out over weeks, on one customer.

## 0. Why, and what exists

- The sidebar's **Project Management** link (`/projects`, `Sidebar.tsx`)
  leads nowhere: no route renders it.
- **`customers.Task`** sits on exactly one organisation (`customer`) or one
  account (`account`), enforced by a CheckConstraint. It has these fields:
  - `title`, `assignee` (FK), `assignee_name` (text), `created_by` and
    `due_date`;
  - `priority` (high/medium/low) and `status` (pending/in-progress/completed);
  - an optional `initiative`.

  Tasks are personal (`services.customers.personal.visible_tasks`): the
  creator, the assignee and anyone above either may read one. A task with
  neither is everyone's. Tasks appear in the Tasks filter of the activity
  feed on organisation and account pages, and to the Copilot.
- **`metrics.Initiative`** is a workspace-wide decision measured against a
  metric. It is not work on one customer, and plans do not reuse it.
- **Rules** (delivery 3, `services/rules`) run nightly in
  `run_health_maintenance`. They take one to three actions (notify, task,
  lifecycle, survey). The task action puts one task on the record, or on a
  contact's parent. The assignee is the record's owner, falling back to the
  rule's owner.
- Segments and rules share three ways: `private`, `people` or `workspace`.

## Decisions (agreed 2026-10-04)

| Topic | Decision |
|---|---|
| Where a plan sits | On exactly one organisation **or** one account, the same shape as Task. |
| Templates | Four built-in templates (Onboarding, Success, Save, QBR), read-only. Anyone can make their own, from scratch or by saving a plan as a template. Personal templates are shared like segments and rules. |
| Who sees a plan | Anyone who can open its record sees the plan, its milestones and its progress. Each task keeps today's rule (creator, assignee, their managers). Anyone else sees "N tasks you can't see". |
| Rules | A fifth rule action, **Start a plan**. It is internal, so it runs at once. |
| Board | Columns by plan status: Not started · On track · At risk · Done. Cancelled is hidden by default. |
| Approach | A new `services/plans` app. A plan's tasks are ordinary `customers.Task` rows with two new optional links, so every existing task surface keeps working. |

## 1. Backend: `services/plans` (new app)

### 1.1 Models

**`PlanTemplate`**
- `organisation` (workspace FK). It is null for built-in templates, which every
  workspace reads.
- `owner` (FK, null for built-in templates).
- `name` (max 120), `kind` (`onboarding`, `success`, `save`, `qbr`, `other`)
  and `description` (max 500, blank allowed).
- `sharing` (`private`/`people`/`workspace`) and `shared_with` (M2M users),
  following `segments.Segment`.
- `milestones`: JSON, validated on write. It is an ordered list of up to 12
  items: `{name ≤120, offset_days 0–365, tasks: [...]}`. Each task is
  `{title ≤255, priority, offset_days 0–365, assignee_role:
  "plan_owner"|"record_owner"}`. A template holds at most 50 tasks in total.
  A milestone may have no tasks.
- `is_builtin` (bool), `created_at` and `updated_at`.
- A data migration seeds the four built-in templates. Their exact milestones
  and tasks are in §1.6.

**`Plan`**
- `organisation` (workspace FK).
- `customer` **or** `account` (FKs, CASCADE), with a CheckConstraint like
  Task's.
- `template` (FK, SET_NULL) is kept for reference and for the one-open-plan
  rule. Starting a plan *copies* the template, so later template edits never
  change a running plan.
- `name` (max 120), `kind` (the same choices) and `owner` (FK, PROTECT, an
  active member).
- `start_date` and `target_date`. The target date is the last milestone's due
  date, recomputed when milestones change.
- `status`: `not_started`, `on_track`, `at_risk`, `done`, `cancelled`.
  - **Open** means one of the first three.
  - `status_set_by`: `person` or `system`.
  - `at_risk_cleared_on` (date, null) records when a person cleared at-risk.
- `started_by`: the person who started the plan, or null when a rule did.
  `started_by_rule` (FK to `rules.Rule`, SET_NULL) records the rule.
- `created_at`, `updated_at` and `done_at`.
- A partial unique constraint on `(customer, template)` and on
  `(account, template)` applies **while the plan is open and the template is
  not null**.

**`Milestone`**
- `plan` (FK, CASCADE), `name` (max 120), `position` and `due_date`.
- `done_at` (null) and `done_by` (FK, null). `done_by` is null when the
  milestone completed because its tasks did.

**`customers.Task`** gets two new fields:
- `plan` (FK `plans.Plan`, CASCADE, null).
- `milestone` (FK `plans.Milestone`, CASCADE, null). When it is set, `plan`
  is set and is the milestone's plan. `full_clean` checks this, and a
  CheckConstraint also enforces that `milestone` set implies `plan` set.

  CASCADE is deliberate: a plan's tasks are the plan's. Deleting a plan
  removes them, and deleting is allowed only while none are completed (§1.3).

**Limits:**
- up to 12 milestones per plan and 50 tasks per plan;
- up to 50 personal templates per owner;
- one open plan per record per template.

### 1.2 Status rules

- A plan starts `not_started`. It becomes `on_track` the first time a task in
  it is completed or a milestone is marked done, or when the owner sets it by
  hand.
- A milestone is **done** when all of its tasks are completed. A milestone
  with no tasks, or one the owner closes early, is marked done by hand.
  Re-opening a task under a milestone that completed on its own re-opens the
  milestone. A milestone marked done by hand stays done.
- **At risk:**
  - The nightly step (§1.5) sets an open plan to `at_risk` (`system`) when any
    milestone is past its `due_date` and not done.
  - The owner may set `on_track` by hand. That records
    `at_risk_cleared_on = today`. The nightly step does not set at-risk again
    unless a milestone becomes overdue **after** that date: its `due_date`
    must fall on or after `at_risk_cleared_on`.
- **Done:** when every milestone is done, the plan becomes `done` with
  `done_at` set, in the same transaction as the change that finished it. The
  nightly step repeats the check in case something was missed.
- **Cancelled** is set by hand only and is final. A cancelled plan's open
  tasks stay as they are, and the cancel confirmation says so.
- Done and cancelled plans are read-only, apart from the tasks themselves.

### 1.3 Permissions and visibility (SOC2:AUTH-02)

- **Read a plan:** the record (`customer` or `account`) is in the reader's
  `visible_customers`/`visible_accounts`. Write this as `id__in` subqueries,
  never as joins plus `.distinct()`. Postgres 16 made that shape about one
  second per call (#86). Plans on records the reader cannot open are never
  listed or counted. Asking for one directly returns 404.
- **Read a plan's tasks:** `visible_tasks(user, plan.tasks)`. The response
  carries `hidden_tasks` per milestone and in total. Progress counts on the
  list and the board use **the tasks the reader can see**, and milestone
  counts are visible to all.
- **Edit a plan:** this covers the name, owner, dates, status, cancelling,
  milestones (add, rename, re-date, reorder, mark done or undone, remove), and
  adding, editing, removing and reassigning tasks. Allowed for the plan's
  `owner` and anyone above them (`chain_visible_q`-style: the owner or a
  manager in their chain). Everyone else gets 403 on writes to a plan they can
  read.
- **Change a task's status:** the existing task update, by the assignee or the
  creator, unchanged. A plan task is also editable by plan editors.
- **Owner and assignees** must be active members of the workspace who can open
  the record. Otherwise the field shows the refusal "They can't open this
  record."
- **Delete a plan:** allowed for plan editors only while none of its tasks is
  completed. Otherwise the answer is 409 with "Cancel it instead: some of its
  work is done."
- **Templates:** a person reads the built-in templates, their own, and those
  shared with them or with the workspace. Only the owner can edit or delete a
  template. Built-in templates are read-only (403).

### 1.4 API (`/api/v1/`)

| Method & path | What |
|---|---|
| `GET plans/` | The list and the board. Filters: `status` (repeatable; `open` is shorthand), `kind`, `owner` (`me` or an id), `mine=tasks` (plans with a task assigned to me), `customer`, `account`, `q` (name or record name). Cursor pages of 50 with `next`. Each row has its record (kind, id, name), owner, kind, status, dates, `milestones_done/total`, `tasks_done/total` (visible tasks only) and `next_due`. |
| `POST plans/` | Start a plan: `{template, customer\|account, name?, owner?, start_date?, milestones?}`. Without `milestones` the template is copied as it is. With them, the modal's edited copy is sent (same JSON shape, assignees resolved to user ids, still within the limits). Returns 201 with the plan. 409 `PLAN_OPEN` with `{plan_id}` when the record already has an open plan from that template. |
| `GET/PATCH/DELETE plans/:id/` | Detail: the plan, its milestones in order, and each milestone's visible tasks with a `hidden_tasks` count. A PATCH changes the name, owner, target, status (`on_track`/`at_risk`/`cancelled`; `done` only when every milestone is done) and dates. DELETE as in §1.3. |
| `POST plans/:id/milestones/`, `PATCH/DELETE plans/:id/milestones/:mid/`, `POST plans/:id/milestones/reorder/` | Milestone edits. `PATCH {done: true\|false}` marks one done or undone. |
| `POST plans/:id/tasks/`, `PATCH/DELETE plans/:id/tasks/:tid/` | A plan's tasks: title, assignee, due date, priority and milestone. The status of an existing task can also go through the existing task route. |
| `GET/POST plans/templates/`, `GET/PATCH/DELETE plans/templates/:id/` | Templates, including sharing. |
| `POST plans/:id/save-as-template/` | `{name, sharing?}`: the plan's current milestones and tasks as a new personal template. Offsets are worked out from the plan's start date. Assignees become `record_owner` when they are the record's owner, and `plan_owner` otherwise. |
| `GET customers/:id/plans/`, `GET accounts/:id/plans/` | A record's plans (404 if the reader cannot open the record), newest first. Open plans come first. |

- Every write is validated and returns `{field: [message]}` refusals. These
  messages are exact UI copy, held in `services/plans/validation.py`.
- Concurrency:
  - Starting a plan locks, in order, the workspace `Organisation`, the record
    (`select_for_update(no_key=True)`), then the template row. It then checks
    for an open plan.
  - Task completion recomputes milestone and plan status after locking the
    plan row (`no_key`).
  - The partial unique constraint is the backstop. An `IntegrityError` becomes
    409 `PLAN_OPEN`.

### 1.5 Nightly step

`services.plans.nightly.refresh_plans(today)` runs in `run_health_maintenance`
**before** the rules step, so that a rule triggered by health or segments sees
current plan status. It works per workspace, with a savepoint per plan:

1. Set at-risk as described in §1.2 (`status_set_by = system`).
2. Mark done any plan whose milestones are all done.

Running it twice in one day is safe: it only moves a plan from one state to
another. It logs counts only.

### 1.6 Built-in templates (seeded)

All tasks are assigned to `record_owner` unless marked *(plan owner)*. The
number before a milestone is its offset in days.

- **Onboarding** (kind `onboarding`):
  - 0 **Kick-off**: Hold the kick-off call (high, 0d) · Confirm goals and success criteria (high, 3d)
  - 14 **Set up**: Connect data sources (high, 10d) · Invite the customer's team (medium, 14d)
  - 30 **First value**: Review first results with the champion (high, 28d)
  - 60 **Hand-off**: Run the onboarding review (medium, 55d) · Hand over to the account owner *(plan owner)* (medium, 60d)
- **Success plan** (kind `success`):
  - 0 **Agree outcomes**: Write the success plan with the customer (high, 7d)
  - 30 **Check-in**: Review progress against outcomes (medium, 30d)
  - 60 **Expand adoption**: Find the next team or use case (medium, 60d)
  - 90 **Review**: Run the quarterly success review (high, 90d)
- **Save plan** (kind `save`):
  - 0 **Diagnose**: Talk to the champion about the risk (high, 2d) · Write down the root cause (high, 5d)
  - 14 **Act**: Agree a recovery plan with the customer (high, 10d) · Bring in an executive sponsor *(plan owner)* (medium, 14d)
  - 30 **Confirm**: Check health and usage have recovered (high, 30d)
- **QBR** (kind `qbr`):
  - 0 **Prepare**: Pull the quarter's usage and outcomes (medium, 0d) · Draft the deck (medium, 5d)
  - 10 **Meet**: Hold the business review (high, 10d)
  - 14 **Follow up**: Send notes and next steps (high, 12d) · Log decisions on the account (medium, 14d)

### 1.7 Notifications and audit

- **Notifications:** new kinds `plan_started` and `plan_task_assigned`, in a
  migration on the notifications app.
  - `plan_started` goes to the plan's owner when a rule, or another person,
    started the plan for them.
  - `plan_task_assigned` is **one per person per action** (starting a plan, or
    reassigning), naming how many tasks. It is never sent to the person
    acting.
  - Both link to `/projects/:id`.
- **Audit (`core/audit.py`, ids only):**
  - `plan.started`, `plan.updated`, `plan.status_changed` (old/new, person or
    system), `plan.cancelled`, `plan.deleted`;
  - `plan.milestone_changed`;
  - `plan_template.created`, `plan_template.updated`, `plan_template.shared`,
    `plan_template.deleted`.
- **Data classification:** plan, milestone and template names are internal
  business data, not PII.

### 1.8 Rules: the "Start a plan" action

- `services/rules`: a new action type `plan`, `{action: "plan", template: id}`.
  - **Validation:** the template must be readable by the rule's owner. The
    refusal is "Choose a template you can use." A rule still has one to three
    actions, each type at most once.
  - **Running:** the plan goes on the record or, for a contact, on the
    contact's organisation or account (`parent_of`, as for tasks). One plan
    per parent per night.
    - The plan's owner is the parent's owner if they are active and can open
      the record; otherwise it is the rule's owner. `started_by_rule` is the
      rule.
    - It runs through the same `services.plans.starting.start_plan` as the
      API.
    - A record that already has an open plan from the template is
      `skipped` with the detail "already had one". Results use the existing
      `done`/`skipped`/`failed` statuses.
  - If the template is deleted, the rule pauses itself with a new paused
    reason, `template_gone` ("Its plan template was deleted."). This is
    checked when the night starts, in the same place `segment_gone` is.
  - The dry run (`POST rules/test/`) reports "would start N plans · M already
    have one".

### 1.9 Docs

Update API_CONTRACTS, audit-events, data-classification, PRD, TRD, the schema
doc and the plan doc in the same PR.

## 2. Frontend

### 2.1 `/projects`: Project Management

- **Route:** `/projects`, signed in, in the app frame. The sidebar link
  already points here.
- **Header:** the title "Project Management", **New plan** (primary),
  **Templates** (a link to `/projects/templates`) and a **List / Board**
  toggle. The toggle is remembered in `localStorage`, wrapped in try/catch,
  and defaults to List.
- **Filter bar:** a scope segmented control, a kind select, an owner select,
  a status select (List only: Open by default, then Done, Cancelled or All)
  and search with a 300 ms debounce. All filters live in the URL query. The
  scope control has three options:
  - **Mine:** I own the plan.
  - **Has my tasks.**
  - **All I can see:** the default for people with reports; Mine is the
    default otherwise.
- **List:** one row per plan, with Show more on the cursor. Each row has:
  - the name;
  - the record as a link, with an organisation or account icon;
  - a kind chip and the owner's avatar and name;
  - a milestone progress bar with `3/5` in mono;
  - the next due date in mono, shown in danger with the word "Overdue" when
    past;
  - a status pill.

  A row links to `/projects/:id`.
- **Board:** four columns, Not started · On track · At risk · Done, each with
  a count. **Show cancelled** adds a fifth column. A card shows the name, the
  record, the owner, the progress bar and the next due date.
  - Plan editors can drag a card between Not started, On track and At risk.
    Dropping on Done is allowed only when every milestone is done. A refusal
    snaps the card back and shows a toast.
  - Each card has a **status menu** button as the keyboard and touch
    alternative to dragging.
  - Below 768px the board shows one column at a time, with a column picker of
    tabs and their counts. The page never scrolls sideways.
- **States:** skeleton rows or cards while loading; "No plans yet" with New
  plan when empty; "No plans match these filters" with Clear filters when
  filtered; an inline error with Retry.

### 2.2 New plan modal

- **Routes:** `/projects/new` over the list. From an organisation or account
  page it opens over that page at `/organizations/:id/plans/new` or
  `/accounts/:id/plans/new`, with the record already chosen. It uses the
  `BuilderDialog` frame of Segments, Surveys and Rules, and a scrim click
  keeps the draft.
- **Three steps in one scrolling modal:**
  1. **Record:** a search over organisations and accounts the user can open.
     It is pre-filled and locked when opened from a record.
  2. **Template:** cards for the four built-in templates, then "Yours" and
     "Shared with you". Each card shows the milestone count, the task count
     and the length in days.
  3. **Review:**
     - fields for the name (defaults to "<Template> · <Record>"), the owner
       (defaults to me) and the start date (defaults to today);
     - the milestones with their computed due dates;
     - each milestone's tasks, with the assignee role resolved to a real
       person: the record's owner, or the plan's owner.

     Before starting, a person can rename milestones, change their dates,
     remove or add tasks, and change assignees.
- **Start plan:** submits once, however often it is pressed.
  - A 409 `PLAN_OPEN` shows "This record already has an open <Template>
    plan." with a link to that plan.
  - Field refusals appear at their fields. A refusal with no field takes
    focus.
- On success the page goes to `/projects/:id`.

### 2.3 Plan page `/projects/:id`

- **Header:**
  - the name, the record (linked), the kind chip and the owner;
  - the start date → target date, in mono;
  - the status: a select for editors, a pill for everyone else;
  - for editors: **Edit**, **Save as template** and a **⋯** menu with Cancel
    plan and Delete. Delete is shown only when nothing is completed.
  - "Started by <rule>" when a rule started the plan, linking to
    `/scenarios/rules/:id`.
- **Timeline:** milestones in order down the page, joined by a vertical line.
  Each milestone has:
  - its name, due date (mono) and a done check (editors);
  - its progress;
  - its tasks. Each task has a checkbox (assignee, creator or editor), the
    title, the assignee, the due date (mono) and the priority.
  - "+ Add task" for editors;
  - "N tasks you can't see" when tasks are hidden.

  Overdue milestones are marked with an icon and the word "Overdue".
- **Edit:** milestone and task edits happen inline: rename, re-date, reorder
  with up and down buttons (no drag), and remove with a confirmation.
- **Cancel plan:** opens a confirm dialog. "Its open tasks stay on their
  owners' lists."
- **Delete:** opens a confirm dialog. A 409 shows "Cancel it instead: some of
  its work is done."
- **Done or cancelled plans:** a notice at the top. Only task checkboxes stay
  active.
- **States:** a skeleton timeline while loading; 404 shows "This plan doesn't
  exist or you can't open its record."

### 2.4 Templates `/projects/templates`

- Sections: **Built-in** (read-only, with a View action), **Yours** (Edit and
  Delete) and **Shared with you** (View, then Use).
- **Template editor modal** (`/projects/templates/new`,
  `/projects/templates/:id/edit`):
  - the name, kind and description;
  - milestones, each with a name and offset days, and its tasks (title,
    priority, offset days, assignee role);
  - sharing, with the same fields as Segments and Rules.

  Limits are shown as counts, e.g. `8/12 milestones`, `31/50 tasks`.
- **Save as template** opens a small dialog (name and sharing). It posts and
  then links to the new template.

### 2.5 Changes to existing pages

- **Organisation and account pages:** a **Plans** section with the record's
  open plans, in the same compact row as the list, plus **Start a plan**. Done
  and cancelled plans sit behind "Show finished (N)". It has its own empty,
  loading and error states.
- **Activity feed, Tasks filter:** a task with `plan` shows a small
  "<Plan> · <Milestone>" link under its title. The task serializer gains
  `plan: {id, name} | null` and `milestone: {id, name} | null`.
- **Rule builder:** a fifth Then card, **Start a plan**, with a template
  picker (built-in, yours and shared with you). The "each action type once"
  and "1–3 actions" rules still apply.
  - The rule's sentence reads "…then start a Save plan".
  - The rule's nights show "started" and "already had one" per record.
  - The paused notice handles `template_gone`.
- **Notifications:** `plan_started` and `plan_task_assigned` get an icon and
  link to the plan.

### 2.6 House rules and tests

- `revenact-design` §4 throughout:
  - tokens only, both themes, Lucide icons;
  - 44px touch targets and the 375/768/1024/1440 layouts;
  - at most four type sizes, with numbers in DM Mono `tabular-nums`;
  - no card inside a card, and no colour-only meaning;
  - motion within budget.
- Tests:
  - unit tests per component;
  - page tests for the list, board, plan page, templates and modal;
  - a Plans house-rules suite (reusing `rowsIconsTargetsSuite`);
  - one end-to-end-style test: start a plan from a template, tick a task,
    mark a milestone done, and see the board card move to On track.

## 3. Out of scope

- Gantt charts, task dependencies, time tracking and comments on plans.
- Plans on contacts.
- Changing templates for plans already running. Plans are copies.
- Plans in Copilot answers beyond what tasks already give it.
- Reminder emails for overdue tasks. The existing notification bell only.

## 4. API contract (binding for both plans)

All paths are under `/api/v1/`. Dates are `YYYY-MM-DD`; datetimes are ISO
8601. Ids are integers.

### Shared shapes

```ts
type PlanKind = 'onboarding' | 'success' | 'save' | 'qbr' | 'other';
type PlanStatus = 'not_started' | 'on_track' | 'at_risk' | 'done' | 'cancelled';
type Priority = 'high' | 'medium' | 'low';            // = customers.Task.Priority
type TaskStatus = 'pending' | 'in-progress' | 'completed'; // = customers.Task.Status
type AssigneeRole = 'plan_owner' | 'record_owner';
type Sharing = 'private' | 'people' | 'workspace';

type PersonRef = { id: number; name: string };
type RecordRef = { kind: 'organization' | 'account'; id: number; name: string };

type TemplateTask = { title: string; priority: Priority; offset_days: number; assignee_role: AssigneeRole };
type TemplateMilestone = { name: string; offset_days: number; tasks: TemplateTask[] };

type PlanTemplate = {
  id: number; name: string; kind: PlanKind; description: string;
  is_builtin: boolean; is_owner: boolean; owner: PersonRef | null;
  sharing: Sharing; shared_with: PersonRef[];
  milestones: TemplateMilestone[];
  milestone_count: number; task_count: number; length_days: number; // max offset over milestones and tasks
  updated_at: string;
};

type PlanRow = {               // list, board, record section
  id: number; name: string; kind: PlanKind; status: PlanStatus;
  record: RecordRef; owner: PersonRef;
  start_date: string; target_date: string;
  milestones_done: number; milestones_total: number;
  tasks_done: number; tasks_total: number;   // tasks the reader can see
  next_due: string | null;                   // earliest due date of a not-done milestone
  is_overdue: boolean;                       // next_due < today
  can_edit: boolean;
};

type PlanTask = {
  id: number; title: string; priority: Priority; status: TaskStatus;
  due_date: string; assignee: PersonRef | null; can_check: boolean;
};

type Milestone = {
  id: number; name: string; position: number; due_date: string;
  done_at: string | null; is_overdue: boolean;
  tasks: PlanTask[]; hidden_tasks: number;
  tasks_done: number; tasks_total: number;   // visible tasks
};

type Plan = PlanRow & {
  template: { id: number; name: string } | null;
  started_by: PersonRef | null;
  started_by_rule: { id: number; name: string } | null;
  status_set_by: 'person' | 'system';
  done_at: string | null; created_at: string;
  milestones: Milestone[]; hidden_tasks: number;
  can_delete: boolean;          // can_edit and no completed task
};
```

### Endpoints

| Method & path | Request | Response |
|---|---|---|
| `GET plans/` | query: `status` (repeatable; `open` = not_started+on_track+at_risk; default `open`), `kind`, `owner` (`me` or id), `mine=tasks`, `customer`, `account`, `q`, `cursor` | `{results: PlanRow[], next: string \| null, counts: Record<PlanStatus, number>}`; `counts` covers the same filters ignoring `status` (board column counts) |
| `POST plans/` | `{template: id, customer?: id, account?: id, name?, owner?: id, start_date?, milestones?: {name, due_date, tasks: {title, priority, due_date, assignee: id}[]}[]}` (exactly one of customer/account) | 201 `Plan`; 409 `{code: 'PLAN_OPEN', plan_id, detail}` |
| `GET plans/:id/` | | `Plan` |
| `PATCH plans/:id/` | any of `{name, owner, status: 'on_track'\|'at_risk'\|'cancelled'\|'done'}` | `Plan` |
| `DELETE plans/:id/` | | 204; 409 `{code: 'PLAN_HAS_DONE_WORK', detail: "Cancel it instead: some of its work is done."}` |
| `POST plans/:id/milestones/` | `{name, due_date}` | `Plan` |
| `PATCH plans/:id/milestones/:mid/` | any of `{name, due_date, done: boolean}` | `Plan` |
| `DELETE plans/:id/milestones/:mid/` | | `Plan` (its tasks are deleted with it) |
| `POST plans/:id/milestones/reorder/` | `{order: id[]}` (every milestone id, once) | `Plan` |
| `POST plans/:id/tasks/` | `{milestone: id, title, priority, due_date, assignee: id}` | `Plan` |
| `PATCH plans/:id/tasks/:tid/` | any of `{title, priority, due_date, assignee, milestone, status}` | `Plan` |
| `DELETE plans/:id/tasks/:tid/` | | `Plan` |
| `GET plans/templates/` | | `{builtin: PlanTemplate[], mine: PlanTemplate[], shared: PlanTemplate[]}` |
| `POST plans/templates/` | `{name, kind, description, milestones, sharing, shared_with: id[]}` | 201 `PlanTemplate` |
| `GET/PATCH/DELETE plans/templates/:id/` | PATCH: same fields | `PlanTemplate` / 204 |
| `POST plans/:id/save-as-template/` | `{name, sharing?, shared_with?}` | 201 `PlanTemplate` |
| `GET customers/:id/plans/`, `GET accounts/:id/plans/` | | `{results: PlanRow[]}` (open first, then newest) |

Refusals: 400 `{field: [message]}` (`non_field_errors` for no field); 403 for
writes by non-editors on a readable plan; 404 for plans whose record the reader
cannot open.

Task status may also change through the existing task update route; plan task
`PATCH ... {status}` is allowed for the assignee, the creator and plan editors.

### Task serializer addition (existing customers task payload)

`plan: {id: number, name: string} | null`, `milestone: {id: number, name: string} | null`.

### Rules additions

- Action: `{action: 'plan', template: id}`; rule payload shows it as
  `{action: 'plan', template: {id, name} | null}`.
- Paused reason `template_gone`, message "Its plan template was deleted."
- Night record action result for `plan`: `done` (detail "started") or
  `skipped` (detail "already had one"), or `failed`.
- Dry run (`POST rules/test/`) adds `plans: {would_start: number, already_open: number}` when the rule has a plan action.

### Notifications

Kinds `plan_started`, `plan_task_assigned`; `link` = `/projects/<id>`.
