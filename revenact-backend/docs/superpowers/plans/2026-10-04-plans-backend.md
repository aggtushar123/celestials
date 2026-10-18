# Plans (Project Management), backend (delivery 4 of the Impact section) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `services/plans` app: plans of milestones and tasks on one organisation or account, started from four built-in or personal templates, read by whoever may open the record, edited by the plan's owner and their managers, moved to at risk or done nightly, and started by a fifth rule action, "Start a plan".

**Architecture:**
- `PlanTemplate` holds milestones as validated JSON (offsets in days, assignee roles). `Plan` sits on exactly one `Customer` or `Account` and holds ordered `Milestone` rows. A plan's work is ordinary `customers.Task` rows with two new optional links (`Task.plan`, `Task.milestone`), so the activity feed, Cockpit's My Tasks, the Copilot and `/tasks/<id>/` keep working.
- One service starts every plan (`starting.start_plan`): the API and the rule action both call it. It locks the workspace, the record, then the template, checks for an open plan from that template, and copies the template. A partial unique constraint is the backstop.
- One module moves milestones and plans (`status.py`), always under the plan's `FOR NO KEY UPDATE` row lock: the API's edits, the existing task route and the nightly step (`nightly.refresh_plans`, run before the rules) all call it.
- Every read is twice filtered: a plan is visible when its record is (`id__in` subqueries over `visible_customers`/`visible_accounts`), and each of its tasks keeps `personal.visible_tasks`. Counts of tasks are over the tasks the reader can see; the rest are `hidden_tasks`.

**Tech Stack:** Django 5.2, DRF 3.18, PostgreSQL (partial unique constraints, `FOR NO KEY UPDATE`), `TestCase`/`APIClient`, `LiveServerTestCase` for e2e.

**Spec:** `react-ts-app/docs/superpowers/specs/2026-10-04-plans-design.md`, agreed with the owner on 2026-10-04. This plan covers its backend half: §0, §1 and §4 (the API contract, binding). §2 is the frontend and is read here for context only.

**Branch:** `feat/plans` (already checked out). Stay on it and do not push. **Merge order:** this backend PR merges and deploys **before** the frontend PR. Nothing here removes or changes a field in an existing response:
- `customers.Task` gains two nullable foreign keys, and the task payload (`TaskSerializer`) gains `plan` and `milestone`, both `null` for every existing task;
- `Notification.kind` gains two choices;
- `Rule.Paused` gains one choice, and a rule's `actions` gains a fifth type; `POST rules/test/` gains an optional `plans` key.

## Contract notes

The frontend plan is reconciled against these. Each one either follows the real code where spec §4 disagrees with it, or settles something §4 leaves open.

1. **A rule night's "already had one" is `unchanged`, not `skipped`.** Spec §4 says the `plan` action's result is `skipped` (detail "already had one"). In `services/rules` today, `skipped` means the action reached nobody, and a record whose every action was skipped is itself skipped with reason `nobody` and starts no cooldown (`nightly.skip_reason`). The state already being in place is `unchanged` (the lifecycle action's "already that stage"), which counts as acting. So the `plan` action reports:
   - `{"action": "plan", "status": "done", "detail": "started"}`;
   - `{"action": "plan", "status": "unchanged", "detail": "already had one"}` (the record fires and its cooldown starts);
   - `{"action": "plan", "status": "failed", "detail": "its template can't be used"}` when the rule's owner can no longer read the template, or `"<ExceptionClass>: could not be done"` for any other failure.
2. **A rule's `plan` action is read back as `{action: "plan", template: {id, name} | null}`** (as §4), and is **accepted on write either as `template: <id>` or as `template: {id, ...}`**, so the builder can send back what it read.
3. **`Plan.started_by_rule` is `{id, name}` only for a reader who may read that rule.** Anyone else gets `{"id": null, "name": "a rule"}`. A rule's name is its owner's words and is classified confidential; §4's type becomes `{id: number | null; name: string} | null`.
4. **Status codes for the structure routes.** `POST plans/:id/milestones/` and `POST plans/:id/tasks/` answer **201** with the `Plan`. Every other milestone and task route (PATCH, DELETE, reorder) answers **200** with the `Plan`.
5. **`PATCH plans/:id/` takes `name`, `owner` and `status` only** (§4). §1.4 also mentions "target" and "dates": the target date is not writable, because it is always the latest milestone due date, recomputed whenever milestones change, and the start date is fixed once a plan starts.
6. **A finished plan refuses structure edits with 400.** On a `done` or `cancelled` plan, any PATCH of the plan, any milestone route and any task route other than a task's `status` answers `400 {"non_field_errors": ["This plan is finished; only its tasks can change."]}`. Ticking a task on a finished plan still works and moves nothing else.
7. **`PATCH plans/:id/ {status: "done"}`** before every milestone is done answers `400 {"status": ["Mark every milestone done first."]}`.
8. **A plan has 1 to 12 milestones** (§1.1 says "up to 12"). A template or an edited copy with none is refused ("Choose 1 to 12 milestones."), and deleting a plan's last milestone answers `400 {"non_field_errors": ["A plan needs at least one milestone."]}`.
9. **Overdue flags only on open plans.** `PlanRow.is_overdue` and `Milestone.is_overdue` are `false` on a `done` or `cancelled` plan.
10. **The list's order and paging.** `GET plans/` is newest first (`created_at`, then id). `next` is an opaque base64 cursor; a malformed one reads as the first page.
11. **The 51st personal template** answers `400 {"non_field_errors": ["You can own at most 50 templates."]}` (the spec names no status; segments answer 400 for the same kind of limit).
12. **A task the reader cannot see is 404 on the plan's task routes**, for editors too, the same as a missing one (the twice-filter rule). Editors see "N tasks you can't see" and cannot reach them by id.
13. **`PlanTask.can_check`** is true for the task's assignee, its creator and the plan's editors (§1.3, §4). The existing `PATCH /api/v1/tasks/<id>/` keeps its own rule (anyone who may read the task), so a manager of the assignee can still tick it there.
14. **Nested refusals are aligned lists**, as the rules app's `actions`: `{"milestones": [{}, {"name": ["Give it a name."]}, {"tasks": [{}, {"priority": ["Choose high, medium or low."]}]}]}`.
15. **Template ids in `Plan.template` and in a rule's `plan` action are always given** (template names are internal business data, §1.7). Reading a template the reader may not read is still a 404.
16. **`POST plans/:id/save-as-template/` is for plan editors only** (403 otherwise; the UI shows it to editors only) and copies only the tasks the caller can see.
17. **A record the caller cannot open, on `POST plans/`,** is `400 {"customer": ["Choose an organisation you can open."]}` or `400 {"account": ["Choose an account you can open."]}`, the same for a missing id, so the answer never says whether it exists.

18. **Reconciled with the frontend plan (controller ruling):** story items of kind `task` gain `plan`/`milestone` (Task 6 addendum), because the record pages show tasks through the Story. The frontend's 403 wording matches `NOT_EDITOR`, `BUILTIN_READ_ONLY` and `NOT_TEMPLATE_OWNER` here verbatim.

## Global Constraints

These are copied from the spec. Quoted text is verbatim.

- **Where a plan sits.** "On exactly one organisation **or** one account, the same shape as Task."
- **Templates.** "Four built-in templates (Onboarding, Success, Save, QBR), read-only. Anyone can make their own, from scratch or by saving a plan as a template. Personal templates are shared like segments and rules."
- **Who sees a plan.** "Anyone who can open its record sees the plan, its milestones and its progress. Each task keeps today's rule (creator, assignee, their managers). Anyone else sees "N tasks you can't see"."
- **Approach.** "A new `services/plans` app. A plan's tasks are ordinary `customers.Task` rows with two new optional links, so every existing task surface keeps working."
- **`PlanTemplate` (§1.1).** `name` "(max 120)", `kind` "(`onboarding`, `success`, `save`, `qbr`, `other`)", `description` "(max 500, blank allowed)", "`sharing` (`private`/`people`/`workspace`) and `shared_with` (M2M users), following `segments.Segment`". `milestones`: "an ordered list of up to 12 items: `{name ≤120, offset_days 0–365, tasks: [...]}`. Each task is `{title ≤255, priority, offset_days 0–365, assignee_role: "plan_owner"|"record_owner"}`. A template holds at most 50 tasks in total. A milestone may have no tasks."
- **`Plan` (§1.1).** "`template` (FK, SET_NULL) is kept for reference and for the one-open-plan rule. Starting a plan *copies* the template, so later template edits never change a running plan." "`owner` (FK, PROTECT, an active member)." "The target date is the last milestone's due date, recomputed when milestones change." Status "`not_started`, `on_track`, `at_risk`, `done`, `cancelled`"; "**Open** means one of the first three"; "`status_set_by`: `person` or `system`"; "`at_risk_cleared_on` (date, null) records when a person cleared at-risk". "`started_by`: the person who started the plan, or null when a rule did. `started_by_rule` (FK to `rules.Rule`, SET_NULL)". "A partial unique constraint on `(customer, template)` and on `(account, template)` applies **while the plan is open and the template is not null**."
- **`Milestone` (§1.1).** "`plan` (FK, CASCADE), `name` (max 120), `position` and `due_date`." "`done_at` (null) and `done_by` (FK, null). `done_by` is null when the milestone completed because its tasks did."
- **`customers.Task` (§1.1).** "`plan` (FK `plans.Plan`, CASCADE, null)." "`milestone` (FK `plans.Milestone`, CASCADE, null). When it is set, `plan` is set and is the milestone's plan. `full_clean` checks this, and a CheckConstraint also enforces that `milestone` set implies `plan` set."
- **Limits.** "up to 12 milestones per plan and 50 tasks per plan; up to 50 personal templates per owner; one open plan per record per template."
- **Status rules (§1.2).**
  - "It becomes `on_track` the first time a task in it is completed or a milestone is marked done, or when the owner sets it by hand."
  - "A milestone is **done** when all of its tasks are completed. A milestone with no tasks, or one the owner closes early, is marked done by hand. Re-opening a task under a milestone that completed on its own re-opens the milestone. A milestone marked done by hand stays done."
  - At risk: "The nightly step (§1.5) sets an open plan to `at_risk` (`system`) when any milestone is past its `due_date` and not done." "The owner may set `on_track` by hand. That records `at_risk_cleared_on = today`. The nightly step does not set at-risk again unless a milestone becomes overdue **after** that date: its `due_date` must fall on or after `at_risk_cleared_on`."
  - "**Done:** when every milestone is done, the plan becomes `done` with `done_at` set, in the same transaction as the change that finished it."
  - "**Cancelled** is set by hand only and is final. A cancelled plan's open tasks stay as they are". "Done and cancelled plans are read-only, apart from the tasks themselves."
- **Permissions (§1.3).**
  - "**Read a plan:** the record (`customer` or `account`) is in the reader's `visible_customers`/`visible_accounts`. Write this as `id__in` subqueries, never as joins plus `.distinct()`." "Plans on records the reader cannot open are never listed or counted. Asking for one directly returns 404."
  - "**Read a plan's tasks:** `visible_tasks(user, plan.tasks)`. The response carries `hidden_tasks` per milestone and in total. Progress counts on the list and the board use **the tasks the reader can see**, and milestone counts are visible to all."
  - "**Edit a plan:** … Allowed for the plan's `owner` and anyone above them … Everyone else gets 403 on writes to a plan they can read."
  - "**Owner and assignees** must be active members of the workspace who can open the record. Otherwise the field shows the refusal "They can't open this record.""
  - "**Delete a plan:** allowed for plan editors only while none of its tasks is completed. Otherwise the answer is 409 with "Cancel it instead: some of its work is done.""
  - "**Templates:** a person reads the built-in templates, their own, and those shared with them or with the workspace. Only the owner can edit or delete a template. Built-in templates are read-only (403)."
- **API (§1.4, §4).** Every path and field in §4 is binding and is not renamed. "Every write is validated and returns `{field: [message]}` refusals. These messages are exact UI copy, held in `services/plans/validation.py`." 409 bodies: `{code: 'PLAN_OPEN', plan_id, detail}` and `{code: 'PLAN_HAS_DONE_WORK', detail: "Cancel it instead: some of its work is done."}`.
- **Concurrency (§1.4).** "Starting a plan locks, in order, the workspace `Organisation`, the record (`select_for_update(no_key=True)`), then the template row. It then checks for an open plan." "Task completion recomputes milestone and plan status after locking the plan row (`no_key`)." "The partial unique constraint is the backstop. An `IntegrityError` becomes 409 `PLAN_OPEN`."
- **Nightly (§1.5).** "`services.plans.nightly.refresh_plans(today)` runs in `run_health_maintenance` **before** the rules step". "It works per workspace, with a savepoint per plan". "Running it twice in one day is safe". "It logs counts only."
- **Built-in templates (§1.6)** are seeded exactly as listed there (Task 2 copies them verbatim).
- **Notifications (§1.7).** "new kinds `plan_started` and `plan_task_assigned`". "`plan_started` goes to the plan's owner when a rule, or another person, started the plan for them." "`plan_task_assigned` is **one per person per action** (starting a plan, or reassigning), naming how many tasks. It is never sent to the person acting." "Both link to `/projects/:id`."
- **Audit (§1.7, ids only).** "`plan.started`, `plan.updated`, `plan.status_changed` (old/new, person or system), `plan.cancelled`, `plan.deleted`; `plan.milestone_changed`; `plan_template.created`, `plan_template.updated`, `plan_template.shared`, `plan_template.deleted`."
- **Rules (§1.8).** "a new action type `plan`, `{action: "plan", template: id}`". "the template must be readable by the rule's owner. The refusal is "Choose a template you can use." A rule still has one to three actions, each type at most once." "the plan goes on the record or, for a contact, on the contact's organisation or account (`parent_of`, as for tasks). One plan per parent per night." "The plan's owner is the parent's owner if they are active and can open the record; otherwise it is the rule's owner." "If the template is deleted, the rule pauses itself with a new paused reason, `template_gone` ("Its plan template was deleted.")" "checked when the night starts, in the same place `segment_gone` is." Dry run: `plans: {would_start: number, already_open: number}` "when the rule has a plan action".
- **Docs (§1.9).** "Update API_CONTRACTS, audit-events, data-classification, PRD, TRD, the schema doc and the plan doc in the same PR."
- **Out of scope (§3).** "Gantt charts, task dependencies, time tracking and comments on plans. Plans on contacts. Changing templates for plans already running. Plans in Copilot answers beyond what tasks already give it. Reminder emails for overdue tasks."

House rules (every task):

- **Visibility is `id__in` subqueries, never joins plus `.distinct()`.** CI and production run PostgreSQL 16, where the join-and-DISTINCT shape cost about a second a call (fixed in #86). Plans are filtered with `customer_id__in=visible_customers(user).values("pk")` and `account_id__in=visible_accounts(user).values("pk")`; sharing by name is `pk__in` over the through table. Tests assert that no read of `plans_plan` starts with `SELECT DISTINCT`.
- **Row locks.** Every `select_for_update` runs inside `transaction.atomic()`. Locks for non-key updates are `select_for_update(no_key=True)` (`of=("self",)` when the query joins). Deleting a row takes a plain `select_for_update(of=("self",))`. The order is fixed: workspace `Organisation` → record (`Customer`/`Account`) → `PlanTemplate` → `Plan`. A rule's night takes its rule's row lock first (as today), then, when it has a `plan` action, the workspace lock before any action runs, so a lifecycle action's record lock never precedes it.
- **Access checks carry `# SOC2:AUTH-02 <why>`**, and every `audit.record` call carries `# SOC2:LOG-01`. Audit `target_repr` is `"Plan <id>"`, `"Plan template <id>"`: never a name. Metadata carries ids, field names, codes and counts, never names or titles.
- **Log lines carry ids and exception class names only**, never `str(exc)`, a name, a title or an address.
- Tests come in three tiers (skill `backend-testing`): unit (`TestCase`), integration (`APIClient`), e2e (`LiveServerTestCase` in `e2e/`). The privacy world is the rules fixture's: Carl (CSM) can open Pizza Hut and Pizza EMEA but not Taco Bell or Taco West; Dana is the reverse; Alice (admin) opens everything but is nobody's manager; Gus is another tenant. This plan adds **Mona, Carl's manager** (`Carl.reports_to = Mona`), so Mona can open Carl's records and edit Carl's plans.
- **The CI budget is tight** (about 27 minutes): each test class builds its data once with `setUpTestData`; nothing sleeps; dates are passed in (`today=`, `now=`); page size and limits are tested by patching or by `bulk_create`, never by 50 API calls.
- Commands:
  - one module: `venv/bin/python manage.py test services.plans.tests.test_<area> --noinput`;
  - the app: `venv/bin/python manage.py test services.plans --noinput`;
  - the full suite: `venv/bin/python manage.py test --parallel --noinput` (serial runs hit the 30-minute CI timeout);
  - migrations: `venv/bin/python manage.py makemigrations --check --dry-run`;
  - the CI shard check: `venv/bin/python scripts/ci_shard_labels.py --check 4`;
  - lint: `venv/bin/ruff check .` and `venv/bin/ruff format --check .` (line length 100; rules E, F, I). Ruff also formats the Python fences inside Markdown, so run `venv/bin/ruff format <file.md>` on any doc you edit.
- Read endpoints pin their query counts: a test asserts that the count with one row equals the count with several, so an N+1 fails.
- Semgrep runs in CI. Return an opaque cursor string (`next`), never a built URL.
- Commits are conventional (`feat(plans): …`, `feat(rules): …`, `test(e2e): …`, `docs(plans): …`). Every commit message ends with a blank line and exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Do not push.

## Decisions made while planning

The spec left these open. The owner may overrule any of them; each is applied in the tasks below.

1. **Who creates a plan's tasks.** `Task.created_by` is the person acting: whoever started the plan, or added the task. For a plan a rule started, it is the rule's owner (as the rules' task action does). So the person who starts a plan always sees its tasks; a plan owner who did not start it sees the tasks assigned to them or their reports.
2. **The target date** is the latest milestone due date (the spec's "last milestone"), recomputed after every milestone add, re-date, removal and reorder.
3. **Due dates** of milestones and tasks lie from the plan's start date to 365 days after it, on start (the edited copy) and on every later edit: "Choose a date from the start date to a year after it."
4. **Automatic moves are `system`.** `not_started → on_track` on the first completed task or milestone marked done, and `→ done` when the last milestone is done, set `status_set_by = "system"`; a status set through `PATCH plans/:id/` is `person`. `at_risk_cleared_on` is set only when a person moves the plan from `at_risk` to `on_track`.
5. **A finished plan's ticks move nothing.** Ticking or re-opening a task on a `done` or `cancelled` plan changes only the task: no milestone re-opens and the plan stays finished.
6. **Delete** is allowed in any status while no task is completed (the spec's only condition). It counts every task, hidden ones included.
7. **Save as template** copies the plan's milestones in order and only the tasks the caller can see. Offsets are days from the plan's start date, clamped to 0–365. A task whose assignee is the record's owner gets `record_owner`; every other task gets `plan_owner`. The template's kind is the plan's; its description is blank.
8. **`record_owner` resolution** (starting and the rule action alike): the record's own owner when they are an active member of the workspace who can open it; otherwise the plan's owner.
9. **Plan task edits are audited as `plan.task_changed`** `{task, change: added|edited|removed, fields}`: the spec's list has no event for them, and `task.update` stays the existing task route's.
10. **Built-in templates** have a blank description (the spec gives none) and `sharing = "workspace"`. They are seeded by `services/plans/builtins.seed_builtins(model)`, which the data migration calls with its historical model. It is idempotent by kind, so an e2e test can re-seed after another `LiveServerTestCase` flushed the database.
11. **Notification wording.**
    - `plan_started`: "{who} started the plan {plan name} for you.", where `who` is the starter's name or the rule's name.
    - `plan_task_assigned`: "1 task on {plan name} was assigned to you." / "N tasks on {plan name} were assigned to you."
    - Both link to `/projects/<id>`, push on commit, and go only to active members. A rule-started plan has no actor, so its assignees, the rule's owner included, are all told.
12. **The rule action's "one plan per parent per night"** keys its `made` entries as `("plan", <model name>, <pk>)`, so they never collide with the task action's `(<model name>, <pk>)` keys in the same night.
13. **Turning a rule on re-checks its actions** (`clean_actions` on the stored actions), so a rule whose template was deleted or unshared cannot be switched back on until it is edited.
14. **The plans step's place in `run_health_maintenance`**: after the segments and before the rules, with the same `try/except` and `--dry-run` skip as its neighbours.
15. **The record sections' order** (`customers/:id/plans/`, `accounts/:id/plans/`): open plans first, then by `created_at` descending; unpaginated.
16. **`q`** matches the plan's name or its record's name, case-insensitive, at most 120 characters (the rest is ignored).

## Reuse map

Each helper below was read in the current code before this plan relied on it.

| Need | Source | Use |
|---|---|---|
| Records a viewer may open | `customers.scoping.visible_customers(user)`, `visible_accounts(user)` (both `id IN` subqueries, no outer DISTINCT) | `access.visible_plans`, `access.can_open` |
| A record by URL, 404 when hidden | `customers.scoping` (`get_object_or_404(visible_customers(user), pk=…)`) | `views.RecordPlansView` |
| A task's own rule | `customers.personal.visible_tasks(user, queryset)` (creator, assignee, anyone above either; neither = everyone's) | payloads, task routes, save as template |
| The org chart | `accounts.hierarchy.subtree_ids(user)` (memoised on the user instance) | `access.editor_ids` |
| Sharing like segments and rules | `rules.access.readable_rules` (`pk__in` over the through table), `rules.serializers.RuleWriteSerializer._check_sharing` | `access.readable_templates`, `serializers.TemplateWriteSerializer` |
| Rule read access | `rules.access.readable_rules(user)` | `payloads.started_by_rule_ref` |
| Owner row lock for a limit | `rules.views._limit_reached` | `views._template_limit_reached` |
| Workspace lock | `surveys.sending.claim` (`Organisation.objects.select_for_update(no_key=True)…values_list`) | `starting.start_plan`, `rules.nightly.run_rule` |
| Record lock | `rules.actions.change_lifecycle` (`select_for_update(no_key=True, of=("self",))`) | `starting.start_plan` |
| Payload helpers | `organizations.rows.iso`, `person` | `payloads` |
| Notifications | `notifications.realtime.notify(*, recipient, actor, kind, message, link, push_on_commit)` | `notices` |
| Audit | `core.audit.record(action, *, request, actor, organisation, target, target_repr, metadata)` | views, `starting`, `status`, `nightly` |
| A rule's actions | `rules.validation.CLEANERS`, `clean_actions`; `rules.actions.INTERNAL`, `parent_of`, `result`, `DONE`, `UNCHANGED`, `FAILED`; `rules.nightly.pause_reason`, `run_rule`; `rules.payloads._row`, `list_rows`, `rule_payload`; `rules.views.RuleTestView` | Task 11 |
| Test world | `rules.tests.fixtures.RuleFixture` (itself `SurveyFixture` → `SegmentFixture`: `org`, `admin`, `csm`, `other`, `stranger`, `pizza`, `taco`, `emea`, `west`, `dough`, `book`, `today`, `now`, contacts `ann`, `ben`, `dot`; `make_rule`, `changed`, `pinned`), `segments.tests.fixtures.person` | `plans.tests.fixtures.PlanFixture` |
| Nightly pattern | `run_health_maintenance`'s `if not options["dry_run"]: try … except Exception` steps; `rules.nightly.evaluate_rules(organisation=None, *, today=None, now=None)` | Task 10 |
| e2e HTTP | `e2e/http.py` `http_get`, `http_post`, `http_patch`, `http_delete` | Task 12 |

## File Structure

| File | Responsibility |
|---|---|
| `services/plans/__init__.py`, `apps.py` (new) | App config (`PlansConfig`) |
| `services/plans/models.py` (new) | `PlanTemplate`, `Plan`, `Milestone`; `Kind`, `Sharing`, `OPEN`; the limits |
| `services/plans/builtins.py` (new) | `BUILTINS` (spec §1.6, verbatim) and `seed_builtins(model)` |
| `services/plans/migrations/0001_initial.py` (generated), `0002_builtin_templates.py` (new) | The three tables; the four built-ins |
| `services/customers/models.py`, `migrations/0051_task_plan.py` (generated) | `Task.plan`, `Task.milestone`, their CheckConstraint and `Task.clean` |
| `services/notifications/models.py`, `migrations/0005_plan_kinds.py` (generated) | `plan_started`, `plan_task_assigned` |
| `services/plans/access.py` (new) | `readable_templates`, `get_readable_template`, `get_owned_template`, `visible_plans`, `get_visible_plan`, `editor_ids`, `can_edit`, `require_editor`, `record_of`, `can_open`; 403 messages |
| `services/plans/validation.py` (new) | Every refusal's UI copy; `clean_template_milestones`, `clean_plan_milestones`, `assignable`, `in_range`, `task_count` |
| `services/plans/serializers.py` (new) | `TemplateWriteSerializer`, `PlanStartSerializer`, `PlanPatchSerializer`, `MilestoneWriteSerializer`, `PlanTaskSerializer` |
| `services/plans/payloads.py` (new) | `template_payload`, `record_ref`, `plan_rows`, `plan_payload` |
| `services/plans/listing.py` (new) | `GET plans/`: `statuses`, `filtered`, `counts`, `page`, cursors |
| `services/plans/copying.py` (new) | `copy_template` (template → dated steps), `template_steps` (plan → template JSON) |
| `services/plans/notices.py` (new) | `tell_owner_started`, `tell_assignees`, `assigned_message` |
| `services/plans/starting.py` (new) | `PlanOpen`, `TemplateGone`, `owner_for`, `open_plan_id`, `start_plan` |
| `services/plans/status.py` (new) | `lock_plan`, `set_status`, `sync_milestones`, `advance`, `finish_if_done`, `after_work`, `set_task_status`, `refresh_target`, `milestones_done` |
| `services/plans/nightly.py` (new) | `PlansResult`, `refresh_plans` |
| `services/plans/views.py`, `urls.py` (new) | `/api/v1/plans/…`, and the two record routes |
| `config/settings.py`, `config/urls.py` (modify) | App registration, the mounts |
| `services/customers/serializers.py`, `views.py` (modify) | `TaskSerializer.plan`/`milestone`; the task lists' `select_related`; `TaskDetailView` through `set_task_status` |
| `services/customers/management/commands/run_health_maintenance.py` (modify) | The plans step |
| `services/rules/models.py`, `migrations/0003_template_gone.py` (generated), `validation.py`, `serializers.py`, `actions.py`, `nightly.py`, `payloads.py`, `views.py` (modify) | The `plan` action, `template_gone`, the dry run's `plans` |
| `services/plans/tests/` (new) | `__init__.py`, `fixtures.py`, `test_models.py`, `test_builtins.py`, `test_templates.py`, `test_reading.py`, `test_starting.py`, `test_status.py`, `test_editing.py`, `test_structure.py`, `test_save_as_template.py`, `test_nightly.py` |
| `services/rules/tests/test_plan_action.py` (new) | The rule action end to end inside the rules app |
| `e2e/test_plans_flow.py` (new) | Start from a template, tick a task, mark a milestone done, the board moves |
| docs (modify) | `API_CONTRACTS.md`, `audit-events.md`, `data-classification.md`, `product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md` |

---

### Task 1: The app, its three tables, the task links and the two notification kinds

Spec §1.1 and §1.7 (kinds). Decision 1 (the fixture's creator default).

**Files:**
- Create:
  - `services/plans/__init__.py` (empty)
  - `services/plans/apps.py`
  - `services/plans/models.py`
  - `services/plans/migrations/__init__.py` (empty)
  - `services/plans/migrations/0001_initial.py` (generated)
  - `services/customers/migrations/0051_task_plan.py` (generated)
  - `services/notifications/migrations/0005_plan_kinds.py` (generated)
- Modify:
  - `services/customers/models.py` (`Task`: two fields, one constraint, `clean`)
  - `services/notifications/models.py` (`Notification.Kind`)
  - `config/settings.py` (`INSTALLED_APPS`)
- Test:
  - `services/plans/tests/__init__.py` (empty)
  - `services/plans/tests/fixtures.py`
  - `services/plans/tests/test_models.py`

**Interfaces:**
- Consumes: `rules.tests.fixtures.RuleFixture` (see the reuse map) and `segments.tests.fixtures.person(email, name, organisation, **extra)`.
- Produces:
  - `services.plans.models`:
    - constants `MAX_MILESTONES = 12`, `MAX_TASKS = 50`, `MAX_OWNED_TEMPLATES = 50`, `MAX_SHARED = 50`, `MAX_NAME = 120`, `MAX_DESCRIPTION = 500`, `MAX_TASK_TITLE = 255`, `MAX_OFFSET = 365`, `OPEN = ("not_started", "on_track", "at_risk")`;
    - `Kind` (`ONBOARDING`, `SUCCESS`, `SAVE`, `QBR`, `OTHER`) and `Sharing` (`PRIVATE`, `WORKSPACE`, `PEOPLE`), module-level `TextChoices`;
    - `PlanTemplate` with `AssigneeRole` (`PLAN_OWNER = "plan_owner"`, `RECORD_OWNER = "record_owner"`); fields `organisation, owner, name, kind, description, sharing, shared_with, milestones, is_builtin, created_at, updated_at`; `str() == f"Plan template {pk}"`;
    - `Plan` with `Status` (`NOT_STARTED`, `ON_TRACK`, `AT_RISK`, `DONE`, `CANCELLED`) and `SetBy` (`PERSON`, `SYSTEM`); fields `organisation, customer, account, template, name, kind, owner, start_date, target_date, status, status_set_by, at_risk_cleared_on, started_by, started_by_rule, created_at, updated_at, done_at`; related names `milestones`, `tasks`; `str() == f"Plan {pk}"`;
    - `Milestone`: fields `plan, name, position, due_date, done_at, done_by`; related name `tasks`; `str() == f"Milestone {pk}"`.
  - `customers.models.Task.plan`, `Task.milestone`; `Task.clean()` raises `{"milestone": ["A task's milestone must be in its own plan."]}`.
  - `Notification.Kind.PLAN_STARTED = "plan_started"` ("Plan started"), `Notification.Kind.PLAN_TASK_ASSIGNED = "plan_task_assigned"` ("Plan tasks assigned").
  - Test helpers in `services/plans/tests/fixtures.py`:
    - `STEPS` (a two-milestone template's JSON) and `iso(day)`;
    - `PlanFixture(RuleFixture)` adds `cls.mona` (Carl's manager), `cls.builtin` (`{kind: PlanTemplate}`; empty until Task 2 seeds them) and `cls.mine` (Carl's private template "Carl's kick-off");
    - classmethods `make_template(*, owner=None, milestones=None, **fields) -> PlanTemplate` and `build_plan(record=None, *, owner=None, template=None, steps=None, status="not_started", created_by=None, start=None, **fields) -> Plan`, where `steps` is `[(name, due_in_days, [(title, assignee, status[, creator]), ...]), ...]`;
    - `api(user)` (an `APIClient` signed in as `user`), `events(action)` and `notes(kind)`.

- [ ] **Step 1: Write the fixture and the failing tests**

Create `services/plans/tests/__init__.py` (empty) and `services/plans/tests/fixtures.py`:

```python
"""The plans tests' shared world, built once per test class
(`setUpTestData`): the rules fixture (Alice the admin opens everything and
is nobody's manager; Carl owns Pizza Hut, Pizza EMEA and Dough Co, Dana
owns Taco Bell and Taco West, and neither CSM can open the other's; Gus is
another tenant), plus Mona, Carl's manager, who may open Carl's records and
edit Carl's plans. The four built-in templates come from the data
migration (Task 2)."""

from copy import deepcopy
from datetime import timedelta

from rest_framework.test import APIClient

from core.models import AuditEvent
from services.accounts.models import User
from services.customers.models import Customer, Task
from services.notifications.models import Notification
from services.plans.models import Milestone, Plan, PlanTemplate
from services.rules.tests.fixtures import RuleFixture
from services.segments.tests.fixtures import person

STEPS = [
    {
        "name": "Kick-off",
        "offset_days": 0,
        "tasks": [
            {
                "title": "Hold the call",
                "priority": "high",
                "offset_days": 0,
                "assignee_role": "record_owner",
            }
        ],
    },
    {
        "name": "Review",
        "offset_days": 14,
        "tasks": [
            {
                "title": "Run the review",
                "priority": "medium",
                "offset_days": 14,
                "assignee_role": "plan_owner",
            }
        ],
    },
]


def iso(day):
    return day.isoformat()


class PlanFixture(RuleFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.mona = person("mona@acme.io", "Mona Manager", cls.org)
        User.objects.filter(pk=cls.csm.pk).update(reports_to=cls.mona)
        cls.csm.refresh_from_db()
        cls.builtin = {t.kind: t for t in PlanTemplate.objects.filter(is_builtin=True)}
        cls.mine = cls.make_template(name="Carl's kick-off")

    @classmethod
    def make_template(cls, *, owner=None, milestones=None, **fields):
        """Carl's private two-milestone template unless told otherwise."""
        values = {"name": "Kick-off", "kind": "other", **fields}
        return PlanTemplate.objects.create(
            organisation=cls.org,
            owner=owner or cls.csm,
            milestones=deepcopy(STEPS) if milestones is None else milestones,
            **values,
        )

    @classmethod
    def build_plan(
        cls,
        record=None,
        *,
        owner=None,
        template=None,
        steps=None,
        status="not_started",
        created_by=None,
        start=None,
        **fields,
    ):
        """A plan made row by row (not through `starting.start_plan`), on
        Pizza Hut and owned by Carl unless told otherwise. `steps` is
        `[(name, due_in_days, [(title, assignee, status[, creator]), ...])]`;
        a task's creator defaults to `created_by`, then to the owner."""
        record = record or cls.pizza
        owner = owner or cls.csm
        start = start or cls.today
        if steps is None:
            steps = [
                ("Kick-off", 7, [("Hold the call", owner, "pending")]),
                ("Review", 14, [("Run the review", owner, "pending")]),
            ]
        on = {"customer": record} if isinstance(record, Customer) else {"account": record}
        fields.setdefault("started_by", owner)
        plan = Plan.objects.create(
            organisation=cls.org,
            template=template,
            name=fields.pop("name", "Kick-off · Pizza Hut"),
            kind=fields.pop("kind", "other"),
            owner=owner,
            start_date=start,
            target_date=start + timedelta(days=max((step[1] for step in steps), default=0)),
            status=status,
            **on,
            **fields,
        )
        for position, (name, due_in, tasks) in enumerate(steps):
            milestone = Milestone.objects.create(
                plan=plan, name=name, position=position, due_date=start + timedelta(days=due_in)
            )
            for title, assignee, task_status, *creator in tasks:
                Task.objects.create(
                    **on,
                    plan=plan,
                    milestone=milestone,
                    title=title,
                    assignee=assignee,
                    assignee_name=assignee.name if assignee else "",
                    created_by=creator[0] if creator else (created_by or owner),
                    due_date=milestone.due_date,
                    priority="medium",
                    status=task_status,
                )
        return plan

    def api(self, user):
        client = APIClient()
        client.force_authenticate(User.objects.get(pk=user.pk))
        return client

    def events(self, action):
        rows = AuditEvent.objects.filter(action=action).order_by("pk")
        return list(rows.values_list("target_id", "metadata"))

    def notes(self, kind):
        rows = Notification.objects.filter(kind=kind).order_by("pk")
        return list(rows.values_list("recipient_id", "message", "link"))
```

`api()` loads the user afresh for every client, as each real request does, so `subtree_ids`' per-instance memo never carries across requests.

Create `services/plans/tests/test_models.py`:

```python
"""The plan tables: one record per plan, one open plan per record and
template, a milestone only inside its own plan, built-ins without an owner,
and the two new notification kinds."""

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError

from services.customers.models import Task
from services.notifications.models import Notification
from services.plans import models as limits
from services.plans.models import Milestone, Plan, PlanTemplate
from services.plans.tests.fixtures import PlanFixture


class PlanModelTests(PlanFixture):
    def test_the_limits_are_the_specs(self):
        self.assertEqual(
            (
                limits.MAX_MILESTONES,
                limits.MAX_TASKS,
                limits.MAX_OWNED_TEMPLATES,
                limits.MAX_SHARED,
                limits.MAX_NAME,
                limits.MAX_DESCRIPTION,
                limits.MAX_TASK_TITLE,
                limits.MAX_OFFSET,
            ),
            (12, 50, 50, 50, 120, 500, 255, 365),
        )
        self.assertEqual(limits.OPEN, ("not_started", "on_track", "at_risk"))

    def test_a_new_plan_has_not_started(self):
        plan = self.build_plan()
        self.assertEqual(
            (plan.status, plan.status_set_by, plan.at_risk_cleared_on, plan.done_at),
            ("not_started", "system", None, None),
        )
        self.assertEqual(str(plan), f"Plan {plan.pk}")
        self.assertEqual(
            [(m.name, m.position) for m in plan.milestones.all()], [("Kick-off", 0), ("Review", 1)]
        )
        self.assertEqual(str(plan.milestones.first()), f"Milestone {plan.milestones.first().pk}")
        self.assertEqual(plan.tasks.count(), 2)

    def test_a_plan_sits_on_exactly_one_record(self):
        for on in ({}, {"customer": self.pizza, "account": self.emea}):
            with self.assertRaises(IntegrityError), transaction.atomic():
                Plan.objects.create(
                    organisation=self.org,
                    name="x",
                    kind="other",
                    owner=self.csm,
                    start_date=self.today,
                    target_date=self.today,
                    **on,
                )

    def test_one_open_plan_per_record_and_template(self):
        self.build_plan(template=self.mine)
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.build_plan(template=self.mine)
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.build_plan(template=self.mine, status="at_risk")

    def test_finished_or_templateless_plans_do_not_count(self):
        self.build_plan(template=self.mine, status="done")
        self.build_plan(template=self.mine, status="cancelled")
        self.build_plan(template=None)
        self.build_plan(template=None)
        self.build_plan(template=self.mine)
        self.build_plan(self.emea, template=self.mine)
        self.assertEqual(Plan.objects.count(), 6)

    def test_deleting_a_plan_deletes_its_milestones_and_tasks(self):
        plan = self.build_plan()
        plan.delete()
        self.assertFalse(Milestone.objects.exists())
        self.assertFalse(
            Task.objects.filter(title__in=["Hold the call", "Run the review"]).exists()
        )

    def test_deleting_its_template_keeps_the_plan(self):
        template = self.make_template(name="Short-lived")
        plan = self.build_plan(template=template)
        template.delete()
        plan.refresh_from_db()
        self.assertIsNone(plan.template)

    def test_an_owner_with_plans_cannot_be_deleted(self):
        self.build_plan(owner=self.mona)
        with self.assertRaises(ProtectedError):
            self.mona.delete()


class TaskLinkTests(PlanFixture):
    def task(self, **fields):
        values = {
            "customer": self.pizza,
            "title": "x",
            "assignee_name": "x",
            "due_date": self.today,
            "priority": "low",
            **fields,
        }
        return Task(**values)

    def test_a_milestone_needs_a_plan(self):
        milestone = self.build_plan().milestones.first()
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.task(milestone=milestone).save()

    def test_full_clean_refuses_a_milestone_from_another_plan(self):
        first, second = self.build_plan(), self.build_plan(self.emea)
        task = self.task(plan=first, milestone=second.milestones.first())
        with self.assertRaises(ValidationError) as caught:
            task.full_clean()
        self.assertEqual(
            caught.exception.message_dict["milestone"],
            ["A task's milestone must be in its own plan."],
        )

    def test_a_task_without_a_plan_is_as_before(self):
        task = self.task()
        task.full_clean()
        task.save()
        self.assertEqual((task.plan, task.milestone), (None, None))


class TemplateModelTests(PlanFixture):
    def test_a_personal_template_is_private_and_owned(self):
        self.assertEqual(
            (self.mine.sharing, self.mine.is_builtin, self.mine.description),
            ("private", False, ""),
        )
        self.assertEqual(str(self.mine), f"Plan template {self.mine.pk}")

    def test_built_in_means_no_workspace_and_no_owner(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            PlanTemplate.objects.create(
                organisation=self.org, owner=self.csm, name="x", kind="other", is_builtin=True
            )
        with self.assertRaises(IntegrityError), transaction.atomic():
            PlanTemplate.objects.create(name="x", kind="other")


class NotificationKindTests(PlanFixture):
    def test_plan_started_and_plan_task_assigned_are_real_kinds(self):
        choices = dict(Notification.Kind.choices)
        self.assertEqual(
            (choices["plan_started"], choices["plan_task_assigned"]),
            ("Plan started", "Plan tasks assigned"),
        )
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.plans.tests.test_models --noinput`
Expected: ERROR, `ModuleNotFoundError: No module named 'services.plans'`.

- [ ] **Step 3: Write the app and the models**

`services/plans/apps.py`:

```python
from django.apps import AppConfig


class PlansConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "services.plans"
    verbose_name = "Plans"
```

`services/plans/models.py`:

```python
"""Plans: a run of work, set out over weeks, on one customer.

Spec: react-ts-app docs/superpowers/specs/2026-10-04-plans-design.md. A
`Plan` sits on exactly one organisation or one account and holds ordered
`Milestone`s. Its work is ordinary `customers.Task` rows linked by
`Task.plan` and `Task.milestone`, so every existing task surface keeps
working. A `PlanTemplate` is copied when a plan starts (`starting.py`):
later edits to it never change a running plan. The four built-in templates
have no workspace and no owner, and every workspace reads them
(`builtins.py`).

Unrelated to `billing.Plan`, a workspace's subscription.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from services.accounts.models import Organisation

MAX_MILESTONES = 12
#: Tasks in one plan, and in one template in all.
MAX_TASKS = 50
#: Personal templates one person may own.
MAX_OWNED_TEMPLATES = 50
#: A template is shared by name with at most this many teammates.
MAX_SHARED = 50
MAX_NAME = 120
MAX_DESCRIPTION = 500
#: `customers.Task.title`'s own limit.
MAX_TASK_TITLE = 255
#: A template's offsets, and a plan's dates after its start, in days.
MAX_OFFSET = 365
#: The open statuses: the board's first three columns.
OPEN = ("not_started", "on_track", "at_risk")


class Kind(models.TextChoices):
    ONBOARDING = "onboarding", "Onboarding"
    SUCCESS = "success", "Success plan"
    SAVE = "save", "Save plan"
    QBR = "qbr", "QBR"
    OTHER = "other", "Other"


class Sharing(models.TextChoices):
    PRIVATE = "private", "Only me"
    WORKSPACE = "workspace", "Everyone in the workspace"
    PEOPLE = "people", "Chosen teammates"


class PlanTemplate(models.Model):
    class AssigneeRole(models.TextChoices):
        PLAN_OWNER = "plan_owner", "The plan's owner"
        RECORD_OWNER = "record_owner", "The record's owner"

    organisation = models.ForeignKey(
        Organisation,
        related_name="plan_templates",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        help_text="Null for a built-in template, which every workspace reads.",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="plan_templates",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=MAX_NAME)
    kind = models.CharField(max_length=16, choices=Kind.choices)
    description = models.CharField(max_length=MAX_DESCRIPTION, blank=True, default="")
    sharing = models.CharField(max_length=16, choices=Sharing.choices, default=Sharing.PRIVATE)
    shared_with = models.ManyToManyField(
        settings.AUTH_USER_MODEL, related_name="shared_plan_templates", blank=True
    )
    milestones = models.JSONField(
        default=list,
        blank=True,
        help_text="1-12 milestones with their tasks; see services/plans/validation.py.",
    )
    is_builtin = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "id"]
        indexes = [models.Index(fields=["organisation", "sharing"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(is_builtin=True, organisation__isnull=True, owner__isnull=True)
                | Q(is_builtin=False, organisation__isnull=False, owner__isnull=False),
                name="plan_template_builtin_has_no_owner",
            )
        ]

    def __str__(self):
        # The name is the owner's own words; an audit row carries the id only.
        return f"Plan template {self.pk}"


class Plan(models.Model):
    class Status(models.TextChoices):
        NOT_STARTED = "not_started", "Not started"
        ON_TRACK = "on_track", "On track"
        AT_RISK = "at_risk", "At risk"
        DONE = "done", "Done"
        CANCELLED = "cancelled", "Cancelled"

    class SetBy(models.TextChoices):
        PERSON = "person", "A person"
        SYSTEM = "system", "The system"

    organisation = models.ForeignKey(Organisation, related_name="plans", on_delete=models.CASCADE)
    customer = models.ForeignKey(
        "customers.Customer",
        related_name="plans",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    account = models.ForeignKey(
        "customers.Account",
        related_name="plans",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    template = models.ForeignKey(
        PlanTemplate,
        related_name="plans",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Kept for reference and the one-open-plan rule; the plan is a copy.",
    )
    name = models.CharField(max_length=MAX_NAME)
    kind = models.CharField(max_length=16, choices=Kind.choices)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="plans_owned", on_delete=models.PROTECT
    )
    start_date = models.DateField()
    target_date = models.DateField(help_text="The latest milestone due date.")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.NOT_STARTED)
    status_set_by = models.CharField(max_length=8, choices=SetBy.choices, default=SetBy.SYSTEM)
    at_risk_cleared_on = models.DateField(
        null=True,
        blank=True,
        help_text="When a person last moved the plan from at risk to on track.",
    )
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="+",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Null when a rule started the plan.",
    )
    started_by_rule = models.ForeignKey(
        "rules.Rule",
        related_name="plans",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    done_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["organisation", "status"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(customer__isnull=False, account__isnull=True)
                | Q(customer__isnull=True, account__isnull=False),
                name="plan_belongs_to_exactly_one_record",
            ),
            models.UniqueConstraint(
                fields=["customer", "template"],
                condition=Q(status__in=OPEN, template__isnull=False, customer__isnull=False),
                name="one_open_plan_per_customer_template",
            ),
            models.UniqueConstraint(
                fields=["account", "template"],
                condition=Q(status__in=OPEN, template__isnull=False, account__isnull=False),
                name="one_open_plan_per_account_template",
            ),
        ]

    def __str__(self):
        return f"Plan {self.pk}"


class Milestone(models.Model):
    plan = models.ForeignKey(Plan, related_name="milestones", on_delete=models.CASCADE)
    name = models.CharField(max_length=MAX_NAME)
    position = models.PositiveSmallIntegerField()
    due_date = models.DateField()
    done_at = models.DateTimeField(null=True, blank=True)
    done_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="+",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Who marked it done by hand; null when its tasks completed it.",
    )

    class Meta:
        ordering = ["position", "id"]

    def __str__(self):
        return f"Milestone {self.pk}"
```

In `services/customers/models.py`, inside `class Task`, add after the `initiative` field:

```python
    plan = models.ForeignKey(
        "plans.Plan",
        related_name="tasks",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        help_text="The plan this work belongs to (services/plans). CASCADE: a plan's tasks are "
        "the plan's, and a plan is deleted only while none of them is completed.",
    )
    milestone = models.ForeignKey(
        "plans.Milestone",
        related_name="tasks",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        help_text="The plan's milestone this task sits under. Set only with `plan`, and only "
        "to one of that plan's milestones (`clean` and the CheckConstraint below).",
    )
```

In the same class's `Meta.constraints`, add after `task_belongs_to_exactly_one_parent`:

```
            models.CheckConstraint(
                condition=models.Q(milestone__isnull=True) | models.Q(plan__isnull=False),
                name="task_milestone_needs_plan",
            ),
```

And add this method to `Task`, before `__str__` (`ValidationError` is already imported at the top of the module):

```python
    def clean(self):
        super().clean()
        if self.milestone_id is not None and self.milestone.plan_id != self.plan_id:
            raise ValidationError({"milestone": "A task's milestone must be in its own plan."})
```

In `services/notifications/models.py`, add to `Notification.Kind` after `RULE_REVIEW`:

```python
        PLAN_STARTED = "plan_started", "Plan started"
        PLAN_TASK_ASSIGNED = "plan_task_assigned", "Plan tasks assigned"
```

In `config/settings.py`, add `"services.plans",` to `INSTALLED_APPS` directly after `"services.rules",`.

Create `services/plans/__init__.py` and `services/plans/migrations/__init__.py` (both empty).

- [ ] **Step 4: Generate the migrations, in this order**

Run:
```bash
venv/bin/python manage.py makemigrations plans --name initial
venv/bin/python manage.py makemigrations customers --name task_plan
venv/bin/python manage.py makemigrations notifications --name plan_kinds
```
Expected: `services/plans/migrations/0001_initial.py` (three models; it depends on `customers`, `rules` and `accounts`), `services/customers/migrations/0051_task_plan.py` (two `AddField`, one `AddConstraint`; it depends on `plans.0001_initial`) and `services/notifications/migrations/0005_plan_kinds.py` (one `AlterField` on `kind`). Open each and check nothing else is in them.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.plans.tests.test_models --noinput`
Expected: PASS (14 tests).

Run: `venv/bin/python manage.py test services.customers services.notifications --parallel --noinput`
Expected: PASS: nothing in the existing task surfaces changed.

- [ ] **Step 6: Check and commit**

```bash
venv/bin/python manage.py makemigrations --check --dry-run
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/plans config/settings.py services/customers/models.py services/customers/migrations/0051_task_plan.py services/notifications/models.py services/notifications/migrations/0005_plan_kinds.py
git commit -m "feat(plans): the plans app, its tables, a task's plan and milestone, two notification kinds

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The four built-in templates

Spec §1.6 and §1.1 ("A data migration seeds the four built-in templates"). Decision 10.

**Files:**
- Create:
  - `services/plans/builtins.py`
  - `services/plans/migrations/0002_builtin_templates.py`
- Test: `services/plans/tests/test_builtins.py`

**Interfaces:**
- Consumes: `PlanTemplate` (Task 1).
- Produces: `services.plans.builtins.BUILTINS` (a list of four `{kind, name, description, milestones}`) and `seed_builtins(model) -> int` (how many it created). `PlanFixture.builtin` now holds `{"onboarding", "success", "save", "qbr"}`.

- [ ] **Step 1: Write the failing tests**

Create `services/plans/tests/test_builtins.py`:

```python
"""The four built-in templates, exactly as spec §1.6 lists them: no
workspace, no owner, read by every workspace, seeded once."""

from services.plans.builtins import seed_builtins
from services.plans.models import PlanTemplate
from services.plans.tests.fixtures import PlanFixture


def task(title, priority, offset, role="record_owner"):
    return {"title": title, "priority": priority, "offset_days": offset, "assignee_role": role}


class BuiltinTests(PlanFixture):
    def test_four_built_ins_without_a_workspace_or_an_owner(self):
        rows = PlanTemplate.objects.filter(is_builtin=True).order_by("pk")
        self.assertEqual(
            [
                (t.kind, t.name, t.organisation_id, t.owner_id, t.sharing, t.description)
                for t in rows
            ],
            [
                ("onboarding", "Onboarding", None, None, "workspace", ""),
                ("success", "Success plan", None, None, "workspace", ""),
                ("save", "Save plan", None, None, "workspace", ""),
                ("qbr", "QBR", None, None, "workspace", ""),
            ],
        )

    def test_onboarding_is_the_specs(self):
        self.assertEqual(
            self.builtin["onboarding"].milestones,
            [
                {
                    "name": "Kick-off",
                    "offset_days": 0,
                    "tasks": [
                        task("Hold the kick-off call", "high", 0),
                        task("Confirm goals and success criteria", "high", 3),
                    ],
                },
                {
                    "name": "Set up",
                    "offset_days": 14,
                    "tasks": [
                        task("Connect data sources", "high", 10),
                        task("Invite the customer's team", "medium", 14),
                    ],
                },
                {
                    "name": "First value",
                    "offset_days": 30,
                    "tasks": [task("Review first results with the champion", "high", 28)],
                },
                {
                    "name": "Hand-off",
                    "offset_days": 60,
                    "tasks": [
                        task("Run the onboarding review", "medium", 55),
                        task("Hand over to the account owner", "medium", 60, "plan_owner"),
                    ],
                },
            ],
        )

    def test_success_save_and_qbr_are_the_specs(self):
        def outline(kind):
            return [
                (
                    m["name"],
                    m["offset_days"],
                    [(t["title"], t["priority"], t["offset_days"]) for t in m["tasks"]],
                )
                for m in self.builtin[kind].milestones
            ]

        self.assertEqual(
            outline("success"),
            [
                ("Agree outcomes", 0, [("Write the success plan with the customer", "high", 7)]),
                ("Check-in", 30, [("Review progress against outcomes", "medium", 30)]),
                ("Expand adoption", 60, [("Find the next team or use case", "medium", 60)]),
                ("Review", 90, [("Run the quarterly success review", "high", 90)]),
            ],
        )
        self.assertEqual(
            outline("save"),
            [
                (
                    "Diagnose",
                    0,
                    [
                        ("Talk to the champion about the risk", "high", 2),
                        ("Write down the root cause", "high", 5),
                    ],
                ),
                (
                    "Act",
                    14,
                    [
                        ("Agree a recovery plan with the customer", "high", 10),
                        ("Bring in an executive sponsor", "medium", 14),
                    ],
                ),
                ("Confirm", 30, [("Check health and usage have recovered", "high", 30)]),
            ],
        )
        self.assertEqual(
            outline("qbr"),
            [
                (
                    "Prepare",
                    0,
                    [
                        ("Pull the quarter's usage and outcomes", "medium", 0),
                        ("Draft the deck", "medium", 5),
                    ],
                ),
                ("Meet", 10, [("Hold the business review", "high", 10)]),
                (
                    "Follow up",
                    14,
                    [
                        ("Send notes and next steps", "high", 12),
                        ("Log decisions on the account", "medium", 14),
                    ],
                ),
            ],
        )

    def test_only_two_tasks_go_to_the_plan_owner(self):
        owned = sorted(
            t["title"]
            for template in self.builtin.values()
            for m in template.milestones
            for t in m["tasks"]
            if t["assignee_role"] == "plan_owner"
        )
        self.assertEqual(owned, ["Bring in an executive sponsor", "Hand over to the account owner"])

    def test_seeding_again_adds_nothing(self):
        self.assertEqual(seed_builtins(PlanTemplate), 0)
        self.assertEqual(PlanTemplate.objects.filter(is_builtin=True).count(), 4)

    def test_seeding_puts_back_a_missing_one(self):
        PlanTemplate.objects.filter(kind="qbr", is_builtin=True).delete()
        self.assertEqual(seed_builtins(PlanTemplate), 1)
        self.assertEqual(PlanTemplate.objects.get(kind="qbr", is_builtin=True).name, "QBR")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.plans.tests.test_builtins --noinput`
Expected: ERROR, `ModuleNotFoundError: No module named 'services.plans.builtins'`.

- [ ] **Step 3: Write the data and the migration**

`services/plans/builtins.py`:

```python
"""The four built-in templates (spec §1.6), read by every workspace.

Data only, plus `seed_builtins(model)`, which takes the model so the data
migration can pass its historical one. It is idempotent by kind: an e2e
test re-seeds after another `LiveServerTestCase` has flushed the tables.
"""

RECORD_OWNER, PLAN_OWNER = "record_owner", "plan_owner"


def _task(title, priority, offset_days, assignee_role=RECORD_OWNER):
    return {
        "title": title,
        "priority": priority,
        "offset_days": offset_days,
        "assignee_role": assignee_role,
    }


def _milestone(name, offset_days, *tasks):
    return {"name": name, "offset_days": offset_days, "tasks": list(tasks)}


BUILTINS = [
    {
        "kind": "onboarding",
        "name": "Onboarding",
        "milestones": [
            _milestone(
                "Kick-off",
                0,
                _task("Hold the kick-off call", "high", 0),
                _task("Confirm goals and success criteria", "high", 3),
            ),
            _milestone(
                "Set up",
                14,
                _task("Connect data sources", "high", 10),
                _task("Invite the customer's team", "medium", 14),
            ),
            _milestone(
                "First value", 30, _task("Review first results with the champion", "high", 28)
            ),
            _milestone(
                "Hand-off",
                60,
                _task("Run the onboarding review", "medium", 55),
                _task("Hand over to the account owner", "medium", 60, PLAN_OWNER),
            ),
        ],
    },
    {
        "kind": "success",
        "name": "Success plan",
        "milestones": [
            _milestone(
                "Agree outcomes", 0, _task("Write the success plan with the customer", "high", 7)
            ),
            _milestone("Check-in", 30, _task("Review progress against outcomes", "medium", 30)),
            _milestone(
                "Expand adoption", 60, _task("Find the next team or use case", "medium", 60)
            ),
            _milestone("Review", 90, _task("Run the quarterly success review", "high", 90)),
        ],
    },
    {
        "kind": "save",
        "name": "Save plan",
        "milestones": [
            _milestone(
                "Diagnose",
                0,
                _task("Talk to the champion about the risk", "high", 2),
                _task("Write down the root cause", "high", 5),
            ),
            _milestone(
                "Act",
                14,
                _task("Agree a recovery plan with the customer", "high", 10),
                _task("Bring in an executive sponsor", "medium", 14, PLAN_OWNER),
            ),
            _milestone("Confirm", 30, _task("Check health and usage have recovered", "high", 30)),
        ],
    },
    {
        "kind": "qbr",
        "name": "QBR",
        "milestones": [
            _milestone(
                "Prepare",
                0,
                _task("Pull the quarter's usage and outcomes", "medium", 0),
                _task("Draft the deck", "medium", 5),
            ),
            _milestone("Meet", 10, _task("Hold the business review", "high", 10)),
            _milestone(
                "Follow up",
                14,
                _task("Send notes and next steps", "high", 12),
                _task("Log decisions on the account", "medium", 14),
            ),
        ],
    },
]


def seed_builtins(model):
    """Creates each built-in template whose kind is missing; returns how many."""
    have = set(model.objects.filter(is_builtin=True).values_list("kind", flat=True))
    made = 0
    for template in BUILTINS:
        if template["kind"] in have:
            continue
        model.objects.create(
            is_builtin=True,
            organisation=None,
            owner=None,
            sharing="workspace",
            description="",
            kind=template["kind"],
            name=template["name"],
            milestones=template["milestones"],
        )
        made += 1
    return made
```

`services/plans/migrations/0002_builtin_templates.py`:

```python
from django.db import migrations

from services.plans.builtins import seed_builtins


def forwards(apps, schema_editor):
    seed_builtins(apps.get_model("plans", "PlanTemplate"))


def backwards(apps, schema_editor):
    apps.get_model("plans", "PlanTemplate").objects.filter(is_builtin=True).delete()


class Migration(migrations.Migration):
    dependencies = [("plans", "0001_initial")]

    operations = [migrations.RunPython(forwards, backwards)]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.plans.tests.test_builtins services.plans.tests.test_models --noinput`
Expected: PASS.

- [ ] **Step 5: Check and commit**

```bash
venv/bin/python manage.py makemigrations --check --dry-run
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/plans/builtins.py services/plans/migrations/0002_builtin_templates.py services/plans/tests/test_builtins.py
git commit -m "feat(plans): seed the four built-in templates

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Templates: who reads them, what they may say, and their endpoints

Spec §1.1 (`PlanTemplate`), §1.3 (templates), §1.4/§4 (`GET/POST plans/templates/`, `GET/PATCH/DELETE plans/templates/:id/`), §1.7 (`plan_template.*`). Contract notes 8, 11 and 14.

**Files:**
- Create:
  - `services/plans/access.py`
  - `services/plans/validation.py`
  - `services/plans/serializers.py`
  - `services/plans/payloads.py`
  - `services/plans/views.py`
  - `services/plans/urls.py`
- Modify: `config/urls.py` (the `api/v1/plans/` mount)
- Test: `services/plans/tests/test_templates.py`

**Interfaces:**
- Consumes: `PlanTemplate`, `Sharing`, `Kind`, the limits (Task 1); `PlanFixture`, `STEPS` (Task 1); the built-ins (Task 2).
- Produces:
  - `access.readable_templates(user) -> QuerySet[PlanTemplate]`, `get_readable_template(user, pk)` (404), `get_owned_template(user, pk)` (404, or 403 with `BUILTIN_READ_ONLY` / `NOT_TEMPLATE_OWNER`);
  - `validation`: every message constant listed in Step 3 (later tasks import them by these names), `integer(value) -> bool`, `task_count(milestones) -> int`, `clean_template_milestones(value) -> list`, and the private helpers `_text`, `_offset`, `_priority`, `_aligned`, `_tasks`, `_milestones` that Task 5 reuses;
  - `serializers.TemplateWriteSerializer` (context `{"request"}`);
  - `payloads.length_days(milestones) -> int`, `payloads.template_payload(template, viewer) -> dict` (needs `owner` loaded and `shared_with` prefetched);
  - `views`: `_audit(request, action, target, **metadata)`, `_changed(instance, data) -> list[str]`, `_template_limit_reached(user) -> bool`, `_templates(user)`, `_template_response(request, pk, status_code=200)`, `_audit_shared(request, template)`, `SHARING_FIELDS`, `TemplateListCreateView`, `TemplateDetailView`;
  - URL names `plan-template-list`, `plan-template-detail`.

- [ ] **Step 1: Write the failing tests**

Create `services/plans/tests/test_templates.py`:

```python
"""Templates: built-ins for everyone, read-only; personal ones shared like
segments and rules; only the owner writes; at most 50 each; every refusal
at its field in the UI's words; every write audited by id."""

from copy import deepcopy

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from services.plans import validation as say
from services.plans.access import BUILTIN_READ_ONLY, NOT_TEMPLATE_OWNER
from services.plans.models import PlanTemplate
from services.plans.tests.fixtures import STEPS, PlanFixture

URL = "/api/v1/plans/templates/"
TEMPLATE_KEYS = {
    "id", "name", "kind", "description", "is_builtin", "is_owner", "owner", "sharing",
    "shared_with", "milestones", "milestone_count", "task_count", "length_days", "updated_at",
}  # fmt: skip
TASK = {"title": "t", "priority": "low", "offset_days": 0}


class TemplateValidationTests(PlanFixture):
    def refused(self, steps):
        with self.assertRaises(ValidationError) as caught:
            say.clean_template_milestones(steps)
        return caught.exception.detail

    def test_a_good_template_is_normalised(self):
        steps = [
            {
                "name": "  Kick-off ",
                "offset_days": 0,
                "extra": 1,
                "tasks": [{"title": " Call ", "priority": "high", "offset_days": 2, "x": 0}],
            }
        ]
        self.assertEqual(
            say.clean_template_milestones(steps),
            [
                {
                    "name": "Kick-off",
                    "offset_days": 0,
                    "tasks": [
                        {
                            "title": "Call",
                            "priority": "high",
                            "offset_days": 2,
                            "assignee_role": "record_owner",
                        }
                    ],
                }
            ],
        )

    def test_one_to_twelve_milestones(self):
        for steps in ([], [STEPS[0]] * 13, "x", None):
            self.assertEqual(self.refused(steps), {"milestones": [say.MILESTONE_COUNT]})

    def test_at_most_fifty_tasks_in_all(self):
        steps = [{"name": f"M{i}", "offset_days": 0, "tasks": [TASK] * 10} for i in range(6)]
        self.assertEqual(self.refused(steps), {"milestones": [say.TOO_MANY_TASKS]})

    def test_errors_point_at_the_milestone_and_its_task(self):
        steps = [
            STEPS[0],
            {"name": "", "offset_days": 0, "tasks": []},
            {"name": "Late", "offset_days": 366, "tasks": []},
            {"name": "T", "offset_days": 1, "tasks": [TASK, {**TASK, "priority": "urgent"}]},
            {"name": "R", "offset_days": 1, "tasks": [{**TASK, "assignee_role": "boss"}]},
            "not a milestone",
        ]
        self.assertEqual(
            self.refused(steps),
            {
                "milestones": [
                    {},
                    {"name": [say.CHOOSE_NAME]},
                    {"offset_days": [say.OFFSET_RANGE]},
                    {"tasks": [{}, {"priority": [say.CHOOSE_PRIORITY]}]},
                    {"tasks": [{"assignee_role": [say.CHOOSE_ROLE]}]},
                    {"name": [say.CHOOSE_NAME]},
                ]
            },
        )

    def test_long_text_is_refused_in_words(self):
        long_name = [{"name": "x" * 121, "offset_days": 0, "tasks": []}]
        self.assertEqual(self.refused(long_name), {"milestones": [{"name": [say.LONG_NAME]}]})
        long_title = [{"name": "M", "offset_days": 0, "tasks": [{**TASK, "title": "x" * 256}]}]
        self.assertEqual(
            self.refused(long_title), {"milestones": [{"tasks": [{"title": [say.LONG_TITLE]}]}]}
        )

    def test_a_milestone_may_have_no_tasks(self):
        steps = [{"name": "Wait", "offset_days": 5}]
        self.assertEqual(
            say.clean_template_milestones(steps), [{"name": "Wait", "offset_days": 5, "tasks": []}]
        )

    def test_every_built_in_passes(self):
        for template in self.builtin.values():
            self.assertEqual(
                say.clean_template_milestones(template.milestones), template.milestones
            )


class TemplateEndpoint(PlanFixture):
    def body(self, **fields):
        return {
            "name": "Renewal prep",
            "kind": "other",
            "description": "",
            "milestones": deepcopy(STEPS),
            **fields,
        }


class TemplateReadTests(TemplateEndpoint):
    def test_requires_authentication(self):
        self.assertEqual(APIClient().get(URL).status_code, 401)
        self.assertEqual(APIClient().post(URL, self.body(), format="json").status_code, 401)

    def test_built_ins_mine_and_shared_with_me(self):
        self.make_template(owner=self.other, name="Dana's", sharing="workspace")
        self.make_template(owner=self.other, name="Dana's own")
        named = self.make_template(owner=self.admin, name="For Carl", sharing="people")
        named.shared_with.set([self.csm])
        data = self.api(self.csm).get(URL).data
        self.assertEqual(set(data), {"builtin", "mine", "shared"})
        self.assertEqual(
            [t["name"] for t in data["builtin"]], ["Onboarding", "Success plan", "Save plan", "QBR"]
        )
        self.assertEqual([t["id"] for t in data["mine"]], [self.mine.pk])
        self.assertEqual([t["name"] for t in data["shared"]], ["Dana's", "For Carl"])

    def test_a_template_reads_with_its_counts(self):
        data = self.api(self.csm).get(f"{URL}{self.mine.pk}/").data
        self.assertEqual(set(data), TEMPLATE_KEYS)
        self.assertEqual(
            (
                data["milestone_count"],
                data["task_count"],
                data["length_days"],
                data["is_owner"],
                data["owner"],
                data["shared_with"],
            ),
            (2, 2, 14, True, {"id": self.csm.pk, "name": "Carl CSM"}, []),
        )

    def test_a_built_in_has_no_owner(self):
        data = self.api(self.csm).get(f"{URL}{self.builtin['onboarding'].pk}/").data
        self.assertEqual(
            (data["is_builtin"], data["is_owner"], data["owner"], data["sharing"]),
            (True, False, None, "workspace"),
        )
        self.assertEqual(
            (data["milestone_count"], data["task_count"], data["length_days"]), (4, 7, 60)
        )

    def test_another_workspace_sees_only_the_built_ins(self):
        data = self.api(self.stranger).get(URL).data
        self.assertEqual((len(data["builtin"]), data["mine"], data["shared"]), (4, [], []))
        self.assertEqual(self.api(self.stranger).get(f"{URL}{self.mine.pk}/").status_code, 404)

    def test_a_private_template_is_404_to_anyone_else(self):
        self.assertEqual(self.api(self.other).get(f"{URL}{self.mine.pk}/").status_code, 404)
        self.assertEqual(self.api(self.other).get(f"{URL}999999/").status_code, 404)

    def test_the_list_reads_in_a_fixed_number_of_queries(self):
        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.api(self.csm).get(URL)
            return len(ctx.captured_queries)

        first = self.make_template(owner=self.other, name="A", sharing="people")
        first.shared_with.set([self.csm])
        one = count()
        for name in ("B", "C"):
            more = self.make_template(owner=self.other, name=name, sharing="people")
            more.shared_with.set([self.csm, self.admin])
        self.assertEqual(count(), one)


class TemplateWriteTests(TemplateEndpoint):
    def post(self, user=None, **fields):
        return self.api(user or self.csm).post(URL, self.body(**fields), format="json")

    def test_a_template_is_created_for_its_owner(self):
        response = self.post()
        self.assertEqual(response.status_code, 201, response.content)
        data = response.data
        self.assertEqual(set(data), TEMPLATE_KEYS)
        self.assertEqual(
            (data["owner"], data["is_owner"], data["sharing"], data["is_builtin"]),
            ({"id": self.csm.pk, "name": "Carl CSM"}, True, "private", False),
        )
        self.assertEqual(
            self.events("plan_template.created"),
            [(str(data["id"]), {"kind": "other", "milestones": 2, "tasks": 2})],
        )
        self.assertEqual(self.events("plan_template.shared"), [])

    def test_400_at_the_field_named(self):
        cases = [
            ({"name": ""}, {"name": [say.CHOOSE_NAME]}),
            ({"name": "x" * 121}, {"name": [say.LONG_NAME]}),
            ({"kind": "big"}, {"kind": [say.CHOOSE_KIND]}),
            ({"description": "x" * 501}, {"description": [say.LONG_DESCRIPTION]}),
            ({"milestones": []}, {"milestones": [say.MILESTONE_COUNT]}),
            ({"sharing": "people"}, {"shared_with": [say.NO_TEAMMATES]}),
        ]
        for fields, errors in cases:
            response = self.post(**fields)
            self.assertEqual((response.status_code, response.data), (400, errors), fields)

    def test_the_51st_template_is_refused(self):
        PlanTemplate.objects.bulk_create(
            [
                PlanTemplate(
                    organisation=self.org,
                    owner=self.csm,
                    name=f"T{i}",
                    kind="other",
                    milestones=STEPS,
                )
                for i in range(49)
            ]
        )
        response = self.post()
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"non_field_errors": [say.TEMPLATE_LIMIT]}),
        )
        self.assertEqual(self.post(user=self.other).status_code, 201)

    def test_sharing_by_name_is_audited(self):
        data = self.post(sharing="people", shared_with=[self.other.pk]).data
        self.assertEqual(data["shared_with"], [{"id": self.other.pk, "name": "Dana CSM"}])
        self.assertEqual(
            self.events("plan_template.shared"),
            [(str(data["id"]), {"sharing": "people", "shared_with": [self.other.pk]})],
        )
        self.assertIn(data["id"], [t["id"] for t in self.api(self.other).get(URL).data["shared"]])

    def test_only_the_owner_edits_or_deletes(self):
        shared = self.make_template(name="Shared", sharing="workspace")
        url = f"{URL}{shared.pk}/"
        response = self.api(self.other).patch(url, {"name": "Mine now"}, format="json")
        self.assertEqual(
            (response.status_code, response.data), (403, {"detail": NOT_TEMPLATE_OWNER})
        )
        self.assertEqual(self.api(self.other).delete(url).status_code, 403)

    def test_built_ins_are_read_only(self):
        url = f"{URL}{self.builtin['qbr'].pk}/"
        response = self.api(self.admin).patch(url, {"name": "Ours"}, format="json")
        self.assertEqual(
            (response.status_code, response.data), (403, {"detail": BUILTIN_READ_ONLY})
        )
        self.assertEqual(self.api(self.admin).delete(url).status_code, 403)

    def test_an_edit_records_the_fields_changed_never_their_values(self):
        url = f"{URL}{self.mine.pk}/"
        response = self.api(self.csm).patch(
            url, {"name": "New", "description": "Why", "kind": "other"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            self.events("plan_template.updated"),
            [(str(self.mine.pk), {"fields": ["description", "name"]})],
        )

    def test_an_edit_checks_the_milestones(self):
        response = self.api(self.csm).patch(
            f"{URL}{self.mine.pk}/",
            {"milestones": [{"name": "M", "offset_days": -1}]},
            format="json",
        )
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"milestones": [{"offset_days": [say.OFFSET_RANGE]}]}),
        )

    def test_delete_is_audited_and_keeps_its_plans(self):
        plan = self.build_plan(template=self.mine)
        response = self.api(self.csm).delete(f"{URL}{self.mine.pk}/")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(
            self.events("plan_template.deleted"), [(str(self.mine.pk), {"kind": "other"})]
        )
        plan.refresh_from_db()
        self.assertIsNone(plan.template)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.plans.tests.test_templates --noinput`
Expected: ERROR, `ImportError: cannot import name 'validation' from 'services.plans'`.

- [ ] **Step 3: Write access, validation, the serializer and the payload**

`services/plans/access.py`:

```python
"""Who may read or change plans and templates (spec §1.3).

A template is read when it is built in, or inside the reader's own
workspace when it is theirs, shared with the workspace, or shared with them
by name. Only its owner changes it, and nobody changes a built-in. Sharing
by name is a `pk__in` over the through table, never a `.distinct()` over a
join."""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied

from .models import PlanTemplate, Sharing

NOT_TEMPLATE_OWNER = "Only the template's owner can change it."
BUILTIN_READ_ONLY = "Built-in templates can't be changed."


def readable_templates(user):
    named = PlanTemplate.shared_with.through.objects.filter(user_id=user.pk).values(
        "plantemplate_id"
    )
    shared = Q(owner=user) | Q(sharing=Sharing.WORKSPACE) | Q(sharing=Sharing.PEOPLE, pk__in=named)
    # SOC2:AUTH-02 a template is read when built in, owned, or shared with the reader
    return PlanTemplate.objects.filter(
        Q(is_builtin=True) | (Q(organisation_id=user.organisation_id) & shared)
    )


def get_readable_template(user, pk):
    """The template, or a 404 that reads the same for a missing one and one
    `user` may not read."""
    return get_object_or_404(readable_templates(user).select_related("owner"), pk=pk)


def get_owned_template(user, pk):
    template = get_readable_template(user, pk)
    # SOC2:AUTH-02 built-ins are read-only, and only the owner changes their own
    if template.is_builtin:
        raise PermissionDenied(BUILTIN_READ_ONLY)
    if template.owner_id != user.pk:
        raise PermissionDenied(NOT_TEMPLATE_OWNER)
    return template
```

`services/plans/validation.py`:

```python
"""What a plan or a template may say (spec §1.1, §1.4), and the exact UI
copy of every refusal: the frontend shows these words as they are.

Each check raises a DRF `ValidationError` keyed by the field at fault. A
template's (or a plan's) milestones are checked one by one, and the errors
are a list aligned with them (`{}` for a good one), each milestone's task
errors aligned under its `tasks`, so a 400 points at the exact field. Text
is trimmed and unknown keys are dropped."""

from rest_framework.exceptions import ValidationError

from services.customers.models import Task

from .models import (
    MAX_DESCRIPTION,
    MAX_MILESTONES,
    MAX_NAME,
    MAX_OFFSET,
    MAX_OWNED_TEMPLATES,
    MAX_SHARED,
    MAX_TASK_TITLE,
    MAX_TASKS,
    PlanTemplate,
)

CHOOSE_NAME = "Give it a name."
LONG_NAME = f"Keep the name to {MAX_NAME} characters."
LONG_DESCRIPTION = f"Keep the description to {MAX_DESCRIPTION} characters."
CHOOSE_KIND = "Choose a kind."
CHOOSE_SHARING = "Choose who can see it."
NO_TEAMMATES = "Choose at least one teammate."
TOO_MANY_SHARED = f"Share with at most {MAX_SHARED} teammates."
TEMPLATE_LIMIT = f"You can own at most {MAX_OWNED_TEMPLATES} templates."
MILESTONE_COUNT = f"Choose 1 to {MAX_MILESTONES} milestones."
TOO_MANY_MILESTONES = f"A plan holds at most {MAX_MILESTONES} milestones."
LAST_MILESTONE = "A plan needs at least one milestone."
TOO_MANY_TASKS = f"Keep it to {MAX_TASKS} tasks in all."
CHOOSE_TASKS = "List the milestone's tasks."
NO_TITLE = "Give the task a title."
LONG_TITLE = f"Keep the title to {MAX_TASK_TITLE} characters."
CHOOSE_PRIORITY = "Choose high, medium or low."
CHOOSE_TASK_STATUS = "Choose pending, in progress or completed."
OFFSET_RANGE = f"Choose 0 to {MAX_OFFSET} days."
CHOOSE_ROLE = "Choose the plan's owner or the record's owner."
CHOOSE_TEMPLATE = "Choose a template you can use."
CHOOSE_RECORD = "Choose an organisation or an account."
CANT_OPEN_ORGANISATION = "Choose an organisation you can open."
CANT_OPEN_ACCOUNT = "Choose an account you can open."
CANT_OPEN = "They can't open this record."
CHOOSE_OWNER = "Choose who owns the plan."
CHOOSE_ASSIGNEE = "Choose who does it."
CHOOSE_DATE = "Choose a date."
DATE_RANGE = "Choose a date from the start date to a year after it."
CHOOSE_MILESTONE = "Choose a milestone in this plan."
REORDER = "List every milestone once."
YES_OR_NO = "Must be true or false."
CHOOSE_STATUS = "Choose on track, at risk, cancelled or done."
DONE_NEEDS_MILESTONES = "Mark every milestone done first."
PLAN_FINISHED = "This plan is finished; only its tasks can change."
PLAN_OPEN = "This record already has an open plan from this template."
HAS_DONE_WORK = "Cancel it instead: some of its work is done."


def integer(value):
    return isinstance(value, int) and not isinstance(value, bool)


def task_count(milestones):
    return sum(len(milestone["tasks"]) for milestone in milestones)


def _text(item, key, limit, too_long, missing):
    """`item[key]`, required, trimmed, at most `limit` characters."""
    value = item.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValidationError({key: [missing]})
    value = value.strip()
    if len(value) > limit:
        raise ValidationError({key: [too_long]})
    return value


def _offset(item):
    value = item.get("offset_days")
    if not integer(value) or not 0 <= value <= MAX_OFFSET:
        raise ValidationError({"offset_days": [OFFSET_RANGE]})
    return value


def _priority(item):
    priority = item.get("priority")
    if priority not in Task.Priority.values:
        raise ValidationError({"priority": [CHOOSE_PRIORITY]})
    return priority


def _aligned(items, clean):
    """`clean` each item (a non-object reads as `{}`); the errors are a list
    aligned with the items, `{}` for a good one."""
    cleaned, errors = [], []
    for item in items:
        try:
            cleaned.append(clean(item if isinstance(item, dict) else {}))
            errors.append({})
        except ValidationError as exc:
            errors.append(exc.detail)
    return cleaned, errors


def _tasks(item, clean):
    tasks = item.get("tasks", [])
    if not isinstance(tasks, list):
        raise ValidationError({"tasks": [CHOOSE_TASKS]})
    if len(tasks) > MAX_TASKS:
        raise ValidationError({"tasks": [TOO_MANY_TASKS]})
    cleaned, errors = _aligned(tasks, clean)
    if any(errors):
        raise ValidationError({"tasks": errors})
    return cleaned


def _milestones(value, clean):
    if not isinstance(value, list) or not 1 <= len(value) <= MAX_MILESTONES:
        raise ValidationError({"milestones": [MILESTONE_COUNT]})
    cleaned, errors = _aligned(value, clean)
    if any(errors):
        raise ValidationError({"milestones": errors})
    if task_count(cleaned) > MAX_TASKS:
        raise ValidationError({"milestones": [TOO_MANY_TASKS]})
    return cleaned


def _template_task(item):
    title = _text(item, "title", MAX_TASK_TITLE, LONG_TITLE, NO_TITLE)
    priority = _priority(item)
    offset = _offset(item)
    role = item.get("assignee_role", PlanTemplate.AssigneeRole.RECORD_OWNER)
    if role not in PlanTemplate.AssigneeRole.values:
        raise ValidationError({"assignee_role": [CHOOSE_ROLE]})
    return {"title": title, "priority": priority, "offset_days": offset, "assignee_role": role}


def _template_milestone(item):
    name = _text(item, "name", MAX_NAME, LONG_NAME, CHOOSE_NAME)
    offset = _offset(item)
    return {"name": name, "offset_days": offset, "tasks": _tasks(item, _template_task)}


def clean_template_milestones(value):
    """A template's 1-12 milestones, at most 50 tasks in all, normalised:
    `assignee_role` defaults to `record_owner`."""
    return _milestones(value, _template_milestone)
```

`services/plans/serializers.py`:

```python
"""What a template's owner and a plan's editors write. The owner and the
workspace come from the request, never the body. Every refusal's words are
`validation.py`'s."""

from rest_framework import serializers

from services.accounts.models import User

from .models import MAX_DESCRIPTION, MAX_NAME, MAX_SHARED, Kind, PlanTemplate, Sharing
from .validation import (
    CHOOSE_KIND,
    CHOOSE_NAME,
    CHOOSE_SHARING,
    LONG_DESCRIPTION,
    LONG_NAME,
    MILESTONE_COUNT,
    NO_TEAMMATES,
    TOO_MANY_SHARED,
    clean_template_milestones,
)

NAME_ERRORS = {
    "required": CHOOSE_NAME,
    "blank": CHOOSE_NAME,
    "null": CHOOSE_NAME,
    "invalid": CHOOSE_NAME,
    "max_length": LONG_NAME,
}


class TemplateWriteSerializer(serializers.ModelSerializer):
    name = serializers.CharField(max_length=MAX_NAME, error_messages=NAME_ERRORS)
    kind = serializers.ChoiceField(
        choices=Kind.choices,
        error_messages={
            "required": CHOOSE_KIND,
            "null": CHOOSE_KIND,
            "invalid_choice": CHOOSE_KIND,
        },
    )
    description = serializers.CharField(
        max_length=MAX_DESCRIPTION,
        required=False,
        allow_blank=True,
        error_messages={"max_length": LONG_DESCRIPTION, "invalid": LONG_DESCRIPTION},
    )
    milestones = serializers.JSONField(error_messages={"required": MILESTONE_COUNT})
    sharing = serializers.ChoiceField(
        choices=Sharing.choices,
        required=False,
        error_messages={"null": CHOOSE_SHARING, "invalid_choice": CHOOSE_SHARING},
    )
    shared_with = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.objects.none(), required=False
    )

    class Meta:
        model = PlanTemplate
        fields = ["name", "kind", "description", "milestones", "sharing", "shared_with"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        user = self.context["request"].user
        # SOC2:AUTH-02 shared only with active teammates in the owner's workspace
        self.fields["shared_with"].child_relation.queryset = User.objects.filter(
            organisation_id=user.organisation_id, is_active=True
        ).exclude(pk=user.pk)

    def validate(self, attrs):
        if "milestones" in attrs:
            attrs["milestones"] = clean_template_milestones(attrs["milestones"])
        self._check_sharing(attrs)
        return attrs

    def _check_sharing(self, attrs):
        instance = self.instance
        default_sharing = instance.sharing if instance is not None else Sharing.PRIVATE
        if attrs.get("sharing", default_sharing) == Sharing.PEOPLE:
            if "shared_with" in attrs:
                people = attrs["shared_with"]
            else:
                people = list(instance.shared_with.all()) if instance is not None else []
            if not people:
                raise serializers.ValidationError({"shared_with": [NO_TEAMMATES]})
            if len(people) > MAX_SHARED:
                raise serializers.ValidationError({"shared_with": [TOO_MANY_SHARED]})
        elif "sharing" in attrs or "shared_with" in attrs:
            attrs["shared_with"] = []

    def update(self, instance, validated_data):
        """Writes only the fields the request names (and `updated_at`)."""
        people = validated_data.pop("shared_with", None)
        for name, value in validated_data.items():
            setattr(instance, name, value)
        instance.save(update_fields=[*validated_data, "updated_at"])
        if people is not None:
            instance.shared_with.set(people)
        return instance
```

`services/plans/payloads.py`:

```python
"""Plans and templates as the API returns them (spec §4). Every count of a
plan's tasks is over the tasks the reader can see; the rest are
`hidden_tasks`."""

from services.organizations.rows import iso, person

from .validation import task_count


def length_days(milestones):
    """A template's length: its largest offset, over milestones and tasks."""
    offsets = [m["offset_days"] for m in milestones]
    offsets += [t["offset_days"] for m in milestones for t in m["tasks"]]
    return max(offsets, default=0)


def template_payload(template, viewer):
    """Needs `owner` loaded and `shared_with` prefetched."""
    # SOC2:AUTH-02 teammates are named only from the viewer's own workspace
    teammates = sorted(
        (u for u in template.shared_with.all() if u.organisation_id == viewer.organisation_id),
        key=lambda user: (user.name, user.pk),
    )
    milestones = template.milestones
    return {
        "id": template.pk,
        "name": template.name,
        "kind": template.kind,
        "description": template.description,
        "is_builtin": template.is_builtin,
        "is_owner": template.owner_id is not None and template.owner_id == viewer.pk,
        "owner": person(template.owner),
        "sharing": template.sharing,
        "shared_with": [person(user) for user in teammates],
        "milestones": milestones,
        "milestone_count": len(milestones),
        "task_count": task_count(milestones),
        "length_days": length_days(milestones),
        "updated_at": iso(template.updated_at),
    }
```

- [ ] **Step 4: Write the template views and routes**

`services/plans/views.py`:

```python
"""The plan endpoints (spec §4). Reads are filtered by what the reader may
open; plans are written by their editors (the owner and anyone above
them), templates by their owners. See docs/API_CONTRACTS.md, `plans`."""

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit
from services.accounts.models import User

from .access import get_owned_template, readable_templates
from .models import MAX_OWNED_TEMPLATES, PlanTemplate, Sharing
from .payloads import template_payload
from .serializers import TemplateWriteSerializer
from .validation import TEMPLATE_LIMIT, task_count

SHARING_FIELDS = frozenset({"sharing", "shared_with"})


def _audit(request, action, target, **metadata):
    audit.record(action, request=request, target=target, metadata=metadata)  # SOC2:LOG-01


def _changed(instance, data):
    """The names of the fields `data` would change, never their values."""
    changed = []
    for name, value in data.items():
        if name == "shared_with":
            before = set(instance.shared_with.values_list("pk", flat=True))
            if {user.pk for user in value} != before:
                changed.append(name)
        elif getattr(instance, name) != value:
            changed.append(name)
    return sorted(changed)


def _template_limit_reached(user):
    """Whether `user` already owns the most templates allowed. Call inside
    the transaction that creates the new one: the owner's row is locked
    first, so two creates at once queue instead of both passing the count."""
    list(
        User.objects.select_for_update(no_key=True).filter(pk=user.pk).values_list("pk", flat=True)
    )
    owned = PlanTemplate.objects.filter(owner=user, is_builtin=False).count()
    return owned >= MAX_OWNED_TEMPLATES


def _templates(user):
    rows = readable_templates(user).select_related("owner").prefetch_related("shared_with")
    return rows.order_by("name", "pk")


def _template_response(request, pk, status_code=status.HTTP_200_OK):
    template = _templates(request.user).get(pk=pk)
    return Response(template_payload(template, request.user), status=status_code)


def _audit_shared(request, template):
    _audit(
        request,
        "plan_template.shared",
        template,
        sharing=template.sharing,
        shared_with=sorted(template.shared_with.values_list("pk", flat=True)),
    )


class TemplateListCreateView(APIView):
    """GET /api/v1/plans/templates/: `{builtin, mine, shared}`, every template
    the caller may read (built-ins in the spec's order, the rest by name).
    POST makes one owned by the caller (at most 50)."""

    # SOC2:AUTH-02 authentication here; `readable_templates` scopes every read
    permission_classes = [IsAuthenticated]

    def get(self, request):
        groups = {"builtin": [], "mine": [], "shared": []}
        for template in _templates(request.user):
            if template.is_builtin:
                groups["builtin"].append(template)
            elif template.owner_id == request.user.pk:
                groups["mine"].append(template)
            else:
                groups["shared"].append(template)
        groups["builtin"].sort(key=lambda template: template.pk)
        return Response(
            {
                name: [template_payload(template, request.user) for template in rows]
                for name, rows in groups.items()
            }
        )

    def post(self, request):
        serializer = TemplateWriteSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            if _template_limit_reached(request.user):
                raise ValidationError({"non_field_errors": [TEMPLATE_LIMIT]})
            template = serializer.save(
                owner=request.user, organisation_id=request.user.organisation_id
            )
            _audit(
                request,
                "plan_template.created",
                template,
                kind=template.kind,
                milestones=len(template.milestones),
                tasks=task_count(template.milestones),
            )
            if template.sharing != Sharing.PRIVATE:
                _audit_shared(request, template)
        return _template_response(request, template.pk, status.HTTP_201_CREATED)


class TemplateDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/plans/templates/<id>/. Readers read; only the
    owner writes: 403 for a built-in or someone else's, 404 for anyone who
    may not read it. Deleting keeps the plans started from it."""

    # SOC2:AUTH-02 authentication here; `_templates`/`get_owned_template` check the template
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        template = get_object_or_404(_templates(request.user), pk=pk)
        return Response(template_payload(template, request.user))

    def patch(self, request, pk):
        template = get_owned_template(request.user, pk)
        with transaction.atomic():
            locked = PlanTemplate.objects.select_for_update(no_key=True, of=("self",))
            template = get_object_or_404(locked, pk=template.pk)
            serializer = TemplateWriteSerializer(
                template, data=request.data, partial=True, context={"request": request}
            )
            serializer.is_valid(raise_exception=True)
            changed = set(_changed(template, serializer.validated_data))
            template = serializer.save()
            edited = sorted(changed - SHARING_FIELDS)
            if edited:
                _audit(request, "plan_template.updated", template, fields=edited)
            if changed & SHARING_FIELDS:
                _audit_shared(request, template)
        return _template_response(request, template.pk)

    def delete(self, request, pk):
        template = get_owned_template(request.user, pk)
        with transaction.atomic():
            locked = PlanTemplate.objects.select_for_update(of=("self",))
            template = get_object_or_404(locked, pk=template.pk)
            _audit(request, "plan_template.deleted", template, kind=template.kind)
            template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
```

`services/plans/urls.py`:

```python
from django.urls import path

from . import views

urlpatterns = [
    path("templates/", views.TemplateListCreateView.as_view(), name="plan-template-list"),
    path("templates/<int:pk>/", views.TemplateDetailView.as_view(), name="plan-template-detail"),
]
```

In `config/urls.py`, directly after the `api/v1/rules/` line, add:

```
    # Plans (services/plans): milestones and tasks on one organisation or
    # account, started from a template by a person or by a rule's
    # "Start a plan". The record sections are mounted further up.
    path("api/v1/plans/", include("services.plans.urls")),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.plans --noinput`
Expected: PASS.

- [ ] **Step 6: Check and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/plans config/urls.py
git commit -m "feat(plans): templates: shared like segments, owner-only writes, built-ins read-only

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Reading plans: the list, the board's counts, the plan page and the record sections

Spec §1.3 (read a plan, read its tasks), §4 (`GET plans/`, `GET plans/:id/`, `GET customers/:id/plans/`, `GET accounts/:id/plans/`, `PlanRow`, `Plan`, `Milestone`, `PlanTask`). Contract notes 3, 9, 10 and 15. Decisions 15 and 16.

**Files:**
- Create: `services/plans/listing.py`
- Modify:
  - `services/plans/access.py` (plan visibility and editors)
  - `services/plans/payloads.py` (rows and the detail)
  - `services/plans/views.py` (`PlanListCreateView.get`, `PlanDetailView.get`, `RecordPlansView`)
  - `services/plans/urls.py`
  - `config/urls.py` (the two record routes)
- Test: `services/plans/tests/test_reading.py`

**Interfaces:**
- Consumes: Tasks 1–3; `customers.scoping.visible_customers`, `visible_accounts`; `customers.personal.visible_tasks`; `accounts.hierarchy.subtree_ids`; `rules.access.readable_rules`.
- Produces:
  - `access`: `NOT_EDITOR`, `NOT_CHECKER`, `visible_plans(user)`, `get_visible_plan(user, pk)` (404; loads `customer`, `account`, `owner`, `template`, `started_by`, `started_by_rule`), `editor_ids(user) -> set[int]`, `can_edit(user, plan) -> bool`, `require_editor(user, plan)` (403 `NOT_EDITOR`), `record_of(plan)`, `can_open(user, record) -> bool`;
  - `payloads`: `record_ref(plan)`, `plan_rows(plans, viewer, *, today=None) -> list[dict]`, `started_by_rule_ref(plan, viewer)`, `plan_payload(plan, viewer, *, today=None) -> dict`;
  - `listing`: `PAGE_SIZE = 50`, `MAX_QUERY = 120`, `statuses(params) -> set`, `filtered(plans, viewer, params)`, `counts(plans) -> dict`, `page(plans, cursor) -> (list, str | None)`, `encode_cursor(plan)`, `decode_cursor(cursor)`;
  - `views`: `PlanListCreateView` (GET), `PlanDetailView` (GET), `RecordPlansView` (`kind` = `"customer"` or `"account"`);
  - URL names `plan-list`, `plan-detail`, `customer-plans`, `account-plans`.

- [ ] **Step 1: Write the failing tests**

Create `services/plans/tests/test_reading.py`:

```python
"""Reading plans: whoever may open the record reads the plan, and nobody
else ever sees it listed or counted; each task keeps its own rule, so counts
are over the tasks the reader can see and the rest are `hidden_tasks`; the
list's filters, counts and cursor; the record sections; fixed query counts
and no outer DISTINCT."""

from datetime import timedelta
from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from services.plans import listing
from services.plans.tests.fixtures import PlanFixture, iso

URL = "/api/v1/plans/"
ROW_KEYS = {
    "id", "name", "kind", "status", "record", "owner", "start_date", "target_date",
    "milestones_done", "milestones_total", "tasks_done", "tasks_total", "next_due",
    "is_overdue", "can_edit",
}  # fmt: skip
DETAIL_KEYS = ROW_KEYS | {
    "template", "started_by", "started_by_rule", "status_set_by", "done_at", "created_at",
    "milestones", "hidden_tasks", "can_delete",
}  # fmt: skip
MILESTONE_KEYS = {
    "id", "name", "position", "due_date", "done_at", "is_overdue", "tasks", "hidden_tasks",
    "tasks_done", "tasks_total",
}  # fmt: skip
TASK_KEYS = {"id", "title", "priority", "status", "due_date", "assignee", "can_check"}
STATUSES = ("not_started", "on_track", "at_risk", "done", "cancelled")


def counted(**found):
    return {status: found.get(status, 0) for status in STATUSES}


class VisibilityTests(PlanFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.carls = cls.build_plan()
        cls.danas = cls.build_plan(cls.taco, owner=cls.other, name="Taco plan")

    def ids(self, user):
        return [row["id"] for row in self.api(user).get(URL).data["results"]]

    def test_requires_authentication(self):
        self.assertEqual(APIClient().get(URL).status_code, 401)
        self.assertEqual(APIClient().get(f"{URL}{self.carls.pk}/").status_code, 401)

    def test_a_plan_is_read_by_whoever_may_open_its_record(self):
        self.assertEqual(self.ids(self.csm), [self.carls.pk])
        self.assertEqual(self.ids(self.mona), [self.carls.pk])
        self.assertEqual(self.ids(self.other), [self.danas.pk])
        self.assertEqual(self.ids(self.admin), [self.danas.pk, self.carls.pk])
        self.assertEqual(self.ids(self.stranger), [])

    def test_a_plan_on_a_record_you_cannot_open_is_404(self):
        for user in (self.other, self.stranger):
            self.assertEqual(self.api(user).get(f"{URL}{self.carls.pk}/").status_code, 404)
        self.assertEqual(self.api(self.csm).get(f"{URL}999999/").status_code, 404)

    def test_counts_never_include_what_you_cannot_open(self):
        self.assertEqual(self.api(self.csm).get(URL).data["counts"], counted(not_started=1))

    def test_no_read_of_plans_starts_with_distinct(self):
        with CaptureQueriesContext(connection) as ctx:
            self.api(self.csm).get(URL)
            self.api(self.csm).get(f"{URL}{self.carls.pk}/")
            self.api(self.csm).get(f"/api/v1/customers/{self.pizza.pk}/plans/")
        reads = [q["sql"] for q in ctx.captured_queries if 'FROM "plans_plan"' in q["sql"]]
        self.assertTrue(reads)
        for sql in reads:
            self.assertFalse(sql.lstrip().upper().startswith("SELECT DISTINCT"), sql)


class PlanWorld(PlanFixture):
    """Carl's plan on Pizza Hut, started two days ago: Kick-off (due
    yesterday) with Carl's "Call" (done) and "Mail"; Review with Alice's own
    "Review", which Carl cannot see."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.plan = cls.build_plan(
            start=cls.today - timedelta(days=2),
            steps=[
                (
                    "Kick-off",
                    1,
                    [("Call", cls.csm, "completed"), ("Mail", cls.csm, "pending")],
                ),
                ("Review", 14, [("Review", cls.admin, "pending", cls.admin)]),
            ],
        )


class RowTests(PlanWorld):
    def row(self, user):
        (row,) = self.api(user).get(URL).data["results"]
        return row

    def test_a_row_counts_the_tasks_the_reader_can_see(self):
        row = self.row(self.csm)
        self.assertEqual(set(row), ROW_KEYS)
        self.assertEqual(
            row["record"], {"kind": "organization", "id": self.pizza.pk, "name": "Pizza Hut"}
        )
        self.assertEqual(
            (
                row["milestones_done"],
                row["milestones_total"],
                row["tasks_done"],
                row["tasks_total"],
                row["next_due"],
                row["is_overdue"],
                row["can_edit"],
            ),
            (0, 2, 1, 2, iso(self.today - timedelta(days=1)), True, True),
        )
        self.assertEqual(row["owner"], {"id": self.csm.pk, "name": "Carl CSM"})

    def test_a_manager_edits_and_an_admin_only_reads(self):
        self.assertEqual(self.row(self.mona)["can_edit"], True)
        admin = self.row(self.admin)
        self.assertEqual(
            (admin["can_edit"], admin["tasks_done"], admin["tasks_total"]), (False, 0, 1)
        )

    def test_an_account_plan_names_its_account(self):
        plan = self.build_plan(self.emea, name="EMEA plan")
        data = self.api(self.csm).get(f"{URL}{plan.pk}/").data
        self.assertEqual(
            data["record"], {"kind": "account", "id": self.emea.pk, "name": "Pizza EMEA"}
        )

    def test_a_finished_plan_is_never_overdue(self):
        self.plan.status = "cancelled"
        self.plan.save(update_fields=["status"])
        data = self.api(self.csm).get(f"{URL}{self.plan.pk}/").data
        self.assertEqual((data["is_overdue"], data["milestones"][0]["is_overdue"]), (False, False))


class DetailTests(PlanWorld):
    def test_the_plan_page(self):
        data = self.api(self.csm).get(f"{URL}{self.plan.pk}/").data
        self.assertEqual(set(data), DETAIL_KEYS)
        first, second = data["milestones"]
        self.assertEqual(set(first), MILESTONE_KEYS)
        self.assertEqual(
            (first["name"], first["position"], first["is_overdue"], first["hidden_tasks"]),
            ("Kick-off", 0, True, 0),
        )
        self.assertEqual([t["title"] for t in first["tasks"]], ["Call", "Mail"])
        self.assertEqual((first["tasks_done"], first["tasks_total"]), (1, 2))
        self.assertEqual(set(first["tasks"][0]), TASK_KEYS)
        self.assertEqual(first["tasks"][0]["assignee"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual((second["tasks"], second["hidden_tasks"]), ([], 1))
        self.assertEqual(
            (
                data["hidden_tasks"],
                data["can_delete"],
                data["status_set_by"],
                data["template"],
                data["started_by"],
                data["started_by_rule"],
            ),
            (1, False, "system", None, {"id": self.csm.pk, "name": "Carl CSM"}, None),
        )

    def test_a_task_is_checkable_by_its_assignee_its_creator_or_an_editor(self):
        admin = self.api(self.admin).get(f"{URL}{self.plan.pk}/").data
        (review,) = admin["milestones"][1]["tasks"]
        self.assertEqual((review["title"], review["can_check"]), ("Review", True))
        mona = self.api(self.mona).get(f"{URL}{self.plan.pk}/").data
        self.assertTrue(all(t["can_check"] for t in mona["milestones"][0]["tasks"]))

    def test_the_template_is_named(self):
        plan = self.build_plan(self.emea, template=self.mine)
        data = self.api(self.csm).get(f"{URL}{plan.pk}/").data
        self.assertEqual(data["template"], {"id": self.mine.pk, "name": "Carl's kick-off"})

    def test_a_rule_is_named_only_to_readers_of_the_rule(self):
        rule = self.make_rule(name="Save them")
        plan = self.build_plan(self.emea, started_by=None, started_by_rule=rule)
        carl = self.api(self.csm).get(f"{URL}{plan.pk}/").data
        self.assertEqual(
            (carl["started_by"], carl["started_by_rule"]),
            (None, {"id": rule.pk, "name": "Save them"}),
        )
        mona = self.api(self.mona).get(f"{URL}{plan.pk}/").data
        self.assertEqual(mona["started_by_rule"], {"id": None, "name": "a rule"})

    def test_the_page_reads_in_a_fixed_number_of_queries(self):
        def count(plan):
            with CaptureQueriesContext(connection) as ctx:
                self.api(self.csm).get(f"{URL}{plan.pk}/")
            return len(ctx.captured_queries)

        small = self.build_plan(self.emea, name="Small")
        big = self.build_plan(
            self.dough,
            name="Big",
            steps=[
                ("A", 1, [("1", self.csm, "pending"), ("2", self.mona, "pending")]),
                ("B", 2, [("3", self.csm, "completed"), ("4", self.admin, "pending")]),
                ("C", 3, []),
            ],
        )
        self.assertEqual(count(small), count(big))


class FilterTests(PlanFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.onboarding = cls.build_plan(kind="onboarding", name="Onboarding · Pizza Hut")
        cls.save = cls.build_plan(
            cls.emea, kind="save", owner=cls.mona, name="Save · Pizza EMEA", status="at_risk"
        )
        cls.old = cls.build_plan(name="Old", status="done")

    def ids(self, query="", user=None):
        data = self.api(user or self.csm).get(f"{URL}{query}").data
        return [row["id"] for row in data["results"]]

    def test_open_is_the_default_and_counts_ignore_status(self):
        data = self.api(self.csm).get(URL).data
        self.assertEqual([r["id"] for r in data["results"]], [self.save.pk, self.onboarding.pk])
        self.assertEqual(data["counts"], counted(not_started=1, at_risk=1, done=1))
        self.assertIsNone(data["next"])

    def test_status_is_repeatable_and_open_is_shorthand(self):
        self.assertEqual(self.ids("?status=done&status=at_risk"), [self.old.pk, self.save.pk])
        self.assertEqual(self.ids("?status=open"), [self.save.pk, self.onboarding.pk])

    def test_kind_owner_and_record(self):
        self.assertEqual(self.ids("?kind=save"), [self.save.pk])
        self.assertEqual(self.ids("?owner=me"), [self.onboarding.pk])
        self.assertEqual(self.ids(f"?owner={self.mona.pk}"), [self.save.pk])
        self.assertEqual(self.ids(f"?account={self.emea.pk}"), [self.save.pk])
        self.assertEqual(self.ids(f"?customer={self.pizza.pk}"), [self.onboarding.pk])

    def test_has_my_tasks(self):
        self.assertEqual(self.ids("?mine=tasks", user=self.mona), [self.save.pk])
        self.assertEqual(self.ids("?mine=tasks"), [self.onboarding.pk])

    def test_q_matches_the_plan_or_its_record(self):
        self.assertEqual(self.ids("?q=emea"), [self.save.pk])
        self.assertEqual(self.ids("?q=ONBOARDING"), [self.onboarding.pk])

    def test_counts_follow_the_other_filters(self):
        data = self.api(self.csm).get(f"{URL}?kind=save").data
        self.assertEqual(data["counts"], counted(at_risk=1))

    def test_bad_values_are_ignored(self):
        self.assertEqual(
            self.ids("?status=x&kind=y&owner=z&customer=q"), [self.save.pk, self.onboarding.pk]
        )

    def test_pages_with_an_opaque_cursor(self):
        with patch.object(listing, "PAGE_SIZE", 1):
            first = self.api(self.csm).get(URL).data
            self.assertEqual([r["id"] for r in first["results"]], [self.save.pk])
            self.assertIsInstance(first["next"], str)
            second = self.api(self.csm).get(URL, {"cursor": first["next"]}).data
            self.assertEqual([r["id"] for r in second["results"]], [self.onboarding.pk])
            self.assertIsNone(second["next"])
            garbled = self.api(self.csm).get(URL, {"cursor": "not-a-cursor"}).data
            self.assertEqual([r["id"] for r in garbled["results"]], [self.save.pk])

    def test_the_list_reads_in_a_fixed_number_of_queries(self):
        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.api(self.csm).get(URL)
            return len(ctx.captured_queries)

        before = count()
        self.build_plan(self.dough, name="Dough plan")
        self.build_plan(self.emea, name="EMEA plan", status="on_track")
        self.assertEqual(count(), before)


class RecordPlansTests(PlanFixture):
    def test_open_first_then_newest(self):
        done = self.build_plan(status="done")
        fresh = self.build_plan()
        cancelled = self.build_plan(status="cancelled")
        on_track = self.build_plan(status="on_track")
        data = self.api(self.csm).get(f"/api/v1/customers/{self.pizza.pk}/plans/").data
        self.assertEqual(
            [r["id"] for r in data["results"]], [on_track.pk, fresh.pk, cancelled.pk, done.pk]
        )
        self.assertEqual(set(data["results"][0]), ROW_KEYS)

    def test_an_account_reads_its_own(self):
        plan = self.build_plan(self.emea)
        self.build_plan()
        data = self.api(self.csm).get(f"/api/v1/accounts/{self.emea.pk}/plans/").data
        self.assertEqual([r["id"] for r in data["results"]], [plan.pk])

    def test_a_record_you_cannot_open_is_404(self):
        self.build_plan()
        api = self.api(self.other)
        self.assertEqual(api.get(f"/api/v1/customers/{self.pizza.pk}/plans/").status_code, 404)
        self.assertEqual(api.get(f"/api/v1/accounts/{self.emea.pk}/plans/").status_code, 404)
        self.assertEqual(api.get("/api/v1/customers/999999/plans/").status_code, 404)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.plans.tests.test_reading --noinput`
Expected: FAIL: every request answers 404 (no route yet), and `listing` fails to import.

- [ ] **Step 3: Add plan visibility to `access.py`**

Add these imports to `services/plans/access.py`:

```python
from services.accounts.hierarchy import subtree_ids
from services.customers.models import Customer
from services.customers.scoping import visible_accounts, visible_customers

from .models import Plan, PlanTemplate, Sharing
```

(replacing the existing `from .models import PlanTemplate, Sharing`), and append:

```python
NOT_EDITOR = "Only the plan's owner or their managers can change it."
NOT_CHECKER = "Only the task's assignee, its creator or the plan's editors can tick it."


def visible_plans(user):
    """Plans on records `user` may open, in their own workspace. Two `id IN`
    subqueries: never joins de-duplicated with DISTINCT, which PostgreSQL
    16 planned at about a second a call (#86)."""
    # SOC2:AUTH-02 a plan is read by whoever may open its record
    return Plan.objects.filter(organisation_id=user.organisation_id).filter(
        Q(customer_id__in=visible_customers(user).values("pk"))
        | Q(account_id__in=visible_accounts(user).values("pk"))
    )


def get_visible_plan(user, pk):
    """The plan, or a 404 that reads the same for a missing plan and one on
    a record `user` may not open."""
    plans = visible_plans(user).select_related(
        "customer", "account", "owner", "template", "started_by", "started_by_rule"
    )
    return get_object_or_404(plans, pk=pk)


def editor_ids(user):
    """The owners whose plans `user` edits: themselves and everyone below them."""
    return {user.pk, *subtree_ids(user)}


def can_edit(user, plan):
    return plan.owner_id in editor_ids(user)


def require_editor(user, plan):
    # SOC2:AUTH-02 a plan is changed by its owner and anyone above them in the chart
    if not can_edit(user, plan):
        raise PermissionDenied(NOT_EDITOR)


def record_of(plan):
    return plan.customer if plan.customer_id is not None else plan.account


def can_open(user, record):
    """Whether `user` is active and may open `record` (a Customer or an Account)."""
    if user is None or not user.is_active:
        return False
    rows = visible_customers(user) if isinstance(record, Customer) else visible_accounts(user)
    # SOC2:AUTH-02 a plan's owner and assignees are people who can open its record
    return rows.filter(pk=record.pk).exists()
```

- [ ] **Step 4: Write the rows, the detail and the listing**

Add to `services/plans/payloads.py` (imports at the top, the rest appended):

```python
from collections import defaultdict

from django.db.models import Count, Min, Q
from django.utils import timezone

from services.customers.models import Task
from services.customers.personal import visible_tasks
from services.rules.access import readable_rules

from .access import editor_ids
from .models import OPEN, Milestone

COMPLETED = Task.Status.COMPLETED


def record_ref(plan):
    """Needs `customer` and `account` loaded."""
    if plan.customer_id is not None:
        return {"kind": "organization", "id": plan.customer_id, "name": plan.customer.name}
    return {"kind": "account", "id": plan.account_id, "name": plan.account.name}


def _row(
    plan, *, editable, milestones_done, milestones_total, tasks_done, tasks_total, next_due, today
):
    is_open = plan.status in OPEN
    return {
        "id": plan.pk,
        "name": plan.name,
        "kind": plan.kind,
        "status": plan.status,
        "record": record_ref(plan),
        "owner": person(plan.owner),
        "start_date": iso(plan.start_date),
        "target_date": iso(plan.target_date),
        "milestones_done": milestones_done,
        "milestones_total": milestones_total,
        "tasks_done": tasks_done,
        "tasks_total": tasks_total,
        "next_due": iso(next_due),
        "is_overdue": is_open and next_due is not None and next_due < today,
        "can_edit": editable,
    }


def plan_rows(plans, viewer, *, today=None):
    """The list's, the board's and a record section's rows, in a fixed number
    of queries whatever their number: the plans, their milestones' counts,
    the visible tasks' counts. Needs `customer`, `account` and `owner` loaded."""
    plans = list(plans)
    if not plans:
        return []
    today = today or timezone.localdate()
    ids = [plan.pk for plan in plans]
    milestone_rows = (
        Milestone.objects.filter(plan_id__in=ids)
        .order_by()
        .values("plan_id")
        .annotate(
            total=Count("id"),
            done=Count("id", filter=Q(done_at__isnull=False)),
            next_due=Min("due_date", filter=Q(done_at__isnull=True)),
        )
    )
    milestones = {row["plan_id"]: row for row in milestone_rows}
    # SOC2:AUTH-02 progress counts only the tasks the viewer may read
    task_rows = (
        visible_tasks(viewer, Task.objects.filter(plan_id__in=ids))
        .order_by()
        .values("plan_id")
        .annotate(total=Count("id"), done=Count("id", filter=Q(status=COMPLETED)))
    )
    tasks = {row["plan_id"]: row for row in task_rows}
    editors = editor_ids(viewer)
    rows = []
    for plan in plans:
        found = milestones.get(plan.pk, {"total": 0, "done": 0, "next_due": None})
        seen = tasks.get(plan.pk, {"total": 0, "done": 0})
        rows.append(
            _row(
                plan,
                editable=plan.owner_id in editors,
                milestones_done=found["done"],
                milestones_total=found["total"],
                tasks_done=seen["done"],
                tasks_total=seen["total"],
                next_due=found["next_due"],
                today=today,
            )
        )
    return rows


def started_by_rule_ref(plan, viewer):
    """The rule that started the plan: by name for someone who may read the
    rule, else only that a rule did. None when a person started it."""
    rule = plan.started_by_rule
    if rule is None:
        return None
    # SOC2:AUTH-02 a rule's name is its owner's words, shown only to its readers
    if readable_rules(viewer).filter(pk=rule.pk).exists():
        return {"id": rule.pk, "name": rule.name}
    return {"id": None, "name": "a rule"}


def _task(task, viewer, editable):
    return {
        "id": task.pk,
        "title": task.title,
        "priority": task.priority,
        "status": task.status,
        "due_date": iso(task.due_date),
        "assignee": person(task.assignee),
        "can_check": editable or viewer.pk in (task.assignee_id, task.created_by_id),
    }


def plan_payload(plan, viewer, *, today=None):
    """The plan page. Needs what `access.get_visible_plan` loads."""
    today = today or timezone.localdate()
    editable = plan.owner_id in editor_ids(viewer)
    is_open = plan.status in OPEN
    milestones = list(plan.milestones.order_by("position", "pk"))
    tasks = list(plan.tasks.select_related("assignee").order_by("due_date", "pk"))
    # SOC2:AUTH-02 a plan's task is shown only to someone who may read it; the rest are counted
    seen = set(visible_tasks(viewer, plan.tasks.all()).values_list("pk", flat=True))
    shown, hidden = defaultdict(list), defaultdict(int)
    for task in tasks:
        if task.pk in seen:
            shown[task.milestone_id].append(task)
        else:
            hidden[task.milestone_id] += 1
    visible = [task for task in tasks if task.pk in seen]
    body = _row(
        plan,
        editable=editable,
        milestones_done=sum(m.done_at is not None for m in milestones),
        milestones_total=len(milestones),
        tasks_done=sum(task.status == COMPLETED for task in visible),
        tasks_total=len(visible),
        next_due=min((m.due_date for m in milestones if m.done_at is None), default=None),
        today=today,
    )
    body.update(
        {
            "template": None
            if plan.template is None
            else {"id": plan.template_id, "name": plan.template.name},
            "started_by": person(plan.started_by),
            "started_by_rule": started_by_rule_ref(plan, viewer),
            "status_set_by": plan.status_set_by,
            "done_at": iso(plan.done_at),
            "created_at": iso(plan.created_at),
            "milestones": [
                {
                    "id": m.pk,
                    "name": m.name,
                    "position": m.position,
                    "due_date": iso(m.due_date),
                    "done_at": iso(m.done_at),
                    "is_overdue": is_open and m.done_at is None and m.due_date < today,
                    "tasks": [_task(task, viewer, editable) for task in shown[m.pk]],
                    "hidden_tasks": hidden[m.pk],
                    "tasks_done": sum(task.status == COMPLETED for task in shown[m.pk]),
                    "tasks_total": len(shown[m.pk]),
                }
                for m in milestones
            ],
            "hidden_tasks": sum(hidden.values()),
            "can_delete": editable and not any(task.status == COMPLETED for task in tasks),
        }
    )
    return body
```

Create `services/plans/listing.py`:

```python
"""`GET plans/`: the filters, the board's counts and the cursor (spec §4).

Every filter narrows the plans the reader may open (`access.visible_plans`).
`counts` covers the same filters ignoring `status`. Pages are newest first
under an opaque cursor; a malformed one reads as the first page."""

import json
from base64 import urlsafe_b64decode, urlsafe_b64encode
from datetime import datetime

from django.db.models import Count, Q

from services.customers.models import Task

from .models import OPEN, Kind, Plan

PAGE_SIZE = 50
#: A search is cut to this many characters.
MAX_QUERY = 120


def statuses(params):
    """The `status` values asked for (`open` for the first three); open by default."""
    wanted = set()
    for value in params.getlist("status"):
        if value == "open":
            wanted.update(OPEN)
        elif value in Plan.Status.values:
            wanted.add(value)
    return wanted or set(OPEN)


def _id(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def filtered(plans, viewer, params):
    """Every filter but `status`; unknown values are ignored."""
    kind = params.get("kind")
    if kind in Kind.values:
        plans = plans.filter(kind=kind)
    owner = params.get("owner")
    if owner == "me":
        plans = plans.filter(owner=viewer)
    elif _id(owner) is not None:
        plans = plans.filter(owner_id=_id(owner))
    if params.get("mine") == "tasks":
        mine = Task.objects.filter(assignee=viewer, plan__isnull=False).values("plan_id")
        plans = plans.filter(pk__in=mine)
    for field in ("customer", "account"):
        pk = _id(params.get(field))
        if pk is not None:
            plans = plans.filter(**{f"{field}_id": pk})
    q = (params.get("q") or "").strip()[:MAX_QUERY]
    if q:
        plans = plans.filter(
            Q(name__icontains=q) | Q(customer__name__icontains=q) | Q(account__name__icontains=q)
        )
    return plans


def counts(plans):
    """`{status: n}` for all five statuses."""
    found = dict(plans.order_by().values_list("status").annotate(n=Count("id")))
    return {status: found.get(status, 0) for status in Plan.Status.values}


def encode_cursor(plan):
    raw = json.dumps([plan.created_at.isoformat(), plan.pk])
    return urlsafe_b64encode(raw.encode()).decode()


def decode_cursor(cursor):
    """(created_at, id) after which the next page starts, or None."""
    if not cursor:
        return None
    try:
        at, pk = json.loads(urlsafe_b64decode(cursor.encode()))
        return datetime.fromisoformat(at), int(pk)
    except (ValueError, TypeError):
        return None


def page(plans, cursor):
    """One page, newest first, and the cursor for the next (None at the end)."""
    plans = plans.order_by("-created_at", "-pk")
    after = decode_cursor(cursor)
    if after is not None:
        at, pk = after
        plans = plans.filter(Q(created_at__lt=at) | Q(created_at=at, pk__lt=pk))
    rows = list(plans[: PAGE_SIZE + 1])
    more = len(rows) > PAGE_SIZE
    rows = rows[:PAGE_SIZE]
    return rows, encode_cursor(rows[-1]) if more else None
```

- [ ] **Step 5: Write the read views and routes**

Add to `services/plans/views.py` (imports merged into the existing import block):

```python
from django.db.models import Case, IntegerField, Value, When

from services.customers.scoping import visible_accounts, visible_customers

from .access import get_visible_plan, visible_plans
from .listing import counts, filtered, page, statuses
from .models import OPEN, Plan
from .payloads import plan_payload, plan_rows


class PlanListCreateView(APIView):
    """GET /api/v1/plans/: the list and the board. Plans on records the
    caller may open, filtered, newest first, 50 a page, with `counts` per
    status over the same filters ignoring `status`."""

    # SOC2:AUTH-02 authentication here; `visible_plans` scopes every read
    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        plans = filtered(visible_plans(request.user), request.user, params)
        wanted = plans.filter(status__in=statuses(params)).select_related(
            "customer", "account", "owner"
        )
        rows, cursor = page(wanted, params.get("cursor"))
        return Response(
            {"results": plan_rows(rows, request.user), "next": cursor, "counts": counts(plans)}
        )


class PlanDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/plans/<id>/. 404 for a plan on a record the
    caller cannot open."""

    # SOC2:AUTH-02 authentication here; `get_visible_plan` checks the plan
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(plan_payload(get_visible_plan(request.user, pk), request.user))


class RecordPlansView(APIView):
    """GET /api/v1/customers/<id>/plans/ and /api/v1/accounts/<id>/plans/:
    the record's plans, open first, then newest. 404 for a record the caller
    cannot open, whether or not it exists."""

    # SOC2:AUTH-02 authentication here; the record must be one the caller may open
    permission_classes = [IsAuthenticated]
    kind = "customer"

    def get(self, request, record_id):
        if self.kind == "customer":
            record = get_object_or_404(visible_customers(request.user), pk=record_id)
            plans = Plan.objects.filter(customer=record)
        else:
            record = get_object_or_404(visible_accounts(request.user), pk=record_id)
            plans = Plan.objects.filter(account=record)
        open_first = Case(
            When(status__in=OPEN, then=Value(0)), default=Value(1), output_field=IntegerField()
        )
        plans = plans.select_related("customer", "account", "owner").order_by(
            open_first, "-created_at", "-pk"
        )
        return Response({"results": plan_rows(plans, request.user)})
```

Replace `services/plans/urls.py` with:

```python
from django.urls import path

from . import views

urlpatterns = [
    path("", views.PlanListCreateView.as_view(), name="plan-list"),
    path("templates/", views.TemplateListCreateView.as_view(), name="plan-template-list"),
    path("templates/<int:pk>/", views.TemplateDetailView.as_view(), name="plan-template-detail"),
    path("<int:pk>/", views.PlanDetailView.as_view(), name="plan-detail"),
]
```

In `config/urls.py`, add the import `from services.plans.views import RecordPlansView` beside the other view imports, and directly above `path("api/v1/customers/", include("services.customers.urls")),` add:

```
    # A record's plans (services/plans), for the Plans section on the
    # organisation and account pages. Neither app's own routes use
    # `<id>/plans/`, so the order is only for reading.
    path(
        "api/v1/customers/<int:record_id>/plans/",
        RecordPlansView.as_view(kind="customer"),
        name="customer-plans",
    ),
    path(
        "api/v1/accounts/<int:record_id>/plans/",
        RecordPlansView.as_view(kind="account"),
        name="account-plans",
    ),
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.plans --noinput`
Expected: PASS.

- [ ] **Step 7: Check and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/plans config/urls.py
git commit -m "feat(plans): read plans twice filtered: the list, board counts, the plan page, record sections

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Starting a plan: the one service, its locks, its notices, and `POST plans/`

Spec §1.1 (copying), §1.3 (owner and assignees), §1.4 (`POST plans/`, concurrency), §1.7 (`plan_started`, `plan_task_assigned`, `plan.started`). Contract note 17. Decisions 1, 3, 8 and 11.

**Files:**
- Create:
  - `services/plans/copying.py`
  - `services/plans/notices.py`
  - `services/plans/starting.py`
- Modify:
  - `services/plans/validation.py` (dates, assignees, the edited copy)
  - `services/plans/serializers.py` (`PlanStartSerializer`)
  - `services/plans/views.py` (`PlanListCreateView.post`)
- Test: `services/plans/tests/test_starting.py`

**Interfaces:**
- Consumes: Tasks 1–4 (`access.can_open`, `access.readable_templates`, `access.get_visible_plan`, `payloads.plan_payload`, the `validation` helpers).
- Produces:
  - `validation`: `in_range(day, start_date) -> bool`, `parse_date(value) -> date | None`, `assignable(organisation_id, pk, record, field) -> User` (raises `{field: [CANT_OPEN]}`, or `CHOOSE_OWNER`/`CHOOSE_ASSIGNEE` for a non-integer), `clean_plan_milestones(value, *, start_date, organisation_id, record) -> list` (`[{name, due_date: date, tasks: [{title, priority, due_date: date, assignee: User}]}]`);
  - `copying.copy_template(template, *, start_date, record_owner, plan_owner) -> list` (the same shape);
  - `notices.link(plan)`, `notices.assigned_message(plan, count)`, `notices.tell_owner_started(plan, *, actor, rule=None)`, `notices.tell_assignees(plan, tasks, *, actor)`;
  - `starting`: `PlanOpen(plan_id)` (`.plan_id`), `TemplateGone`, `on_record(record) -> dict`, `record_meta(record) -> dict`, `open_plan_id(record, template_id)`, `owner_for(record, fallback) -> User`, `default_name(template, record)`, `start_plan(template_id, record, *, owner, start_date, actor=None, rule=None, name="", milestones=None, request=None) -> Plan`;
  - `serializers.PlanStartSerializer` (context `{"request"}`; `validated_data` holds `template` (a `PlanTemplate`), `record`, `owner` (a `User`), `start_date`, and optionally `name` and `milestones`).

- [ ] **Step 1: Write the failing tests**

Create `services/plans/tests/test_starting.py`:

```python
"""Starting a plan: the template copied with dates and people, one open
plan per record and template, the locks in order, the notices, the audit;
and `POST plans/` with its refusals in the UI's words."""

from datetime import timedelta

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.accounts.models import User
from services.plans import validation as say
from services.plans.copying import copy_template
from services.plans.starting import PlanOpen, TemplateGone, start_plan
from services.plans.tests.fixtures import PlanFixture, iso

URL = "/api/v1/plans/"


class CopyTests(PlanFixture):
    def test_a_template_is_copied_with_dates_and_people(self):
        steps = copy_template(
            self.builtin["save"], start_date=self.today, record_owner=self.csm, plan_owner=self.mona
        )
        self.assertEqual(
            [(step["name"], step["due_date"]) for step in steps],
            [
                ("Diagnose", self.today),
                ("Act", self.today + timedelta(days=14)),
                ("Confirm", self.today + timedelta(days=30)),
            ],
        )
        self.assertEqual(
            [(t["title"], t["priority"], t["due_date"], t["assignee"]) for t in steps[1]["tasks"]],
            [
                (
                    "Agree a recovery plan with the customer",
                    "high",
                    self.today + timedelta(days=10),
                    self.csm,
                ),
                (
                    "Bring in an executive sponsor",
                    "medium",
                    self.today + timedelta(days=14),
                    self.mona,
                ),
            ],
        )


class StartFixture(PlanFixture):
    def start(self, template=None, record=None, **kwargs):
        kwargs.setdefault("owner", self.csm)
        kwargs.setdefault("actor", self.csm)
        kwargs.setdefault("start_date", self.today)
        template = template or self.builtin["onboarding"]
        return start_plan(template.pk, record or self.pizza, **kwargs)


class StartTests(StartFixture):
    def test_starting_copies_the_template(self):
        plan = self.start()
        self.assertEqual(
            (plan.name, plan.kind, plan.status, plan.target_date, plan.started_by, plan.owner),
            (
                "Onboarding · Pizza Hut",
                "onboarding",
                "not_started",
                self.today + timedelta(days=60),
                self.csm,
                self.csm,
            ),
        )
        self.assertEqual(
            list(plan.milestones.values_list("name", "position")),
            [("Kick-off", 0), ("Set up", 1), ("First value", 2), ("Hand-off", 3)],
        )
        tasks = plan.tasks.order_by("due_date", "pk")
        self.assertEqual(tasks.count(), 7)
        self.assertEqual(
            {(t.customer_id, t.created_by_id, t.assignee_id, t.status) for t in tasks},
            {(self.pizza.pk, self.csm.pk, self.csm.pk, "pending")},
        )
        first = tasks.first()
        self.assertEqual(
            (
                first.title,
                first.priority,
                first.due_date,
                first.milestone.name,
                first.assignee_name,
            ),
            ("Hold the kick-off call", "high", self.today, "Kick-off", "Carl CSM"),
        )

    def test_record_owner_tasks_go_to_the_record_owner_the_rest_to_the_plan_owner(self):
        plan = self.start(owner=self.mona, actor=self.mona)
        assignees = dict(plan.tasks.values_list("title", "assignee_id"))
        self.assertEqual(assignees["Hold the kick-off call"], self.csm.pk)
        self.assertEqual(assignees["Hand over to the account owner"], self.mona.pk)

    def test_an_inactive_record_owner_hands_their_tasks_to_the_plan_owner(self):
        User.objects.filter(pk=self.csm.pk).update(is_active=False)
        plan = self.start(owner=self.mona, actor=self.mona)
        self.assertEqual(set(plan.tasks.values_list("assignee_id", flat=True)), {self.mona.pk})

    def test_an_account_plan_puts_its_tasks_on_the_account(self):
        plan = self.start(record=self.emea)
        self.assertEqual(plan.account, self.emea)
        self.assertEqual(
            set(plan.tasks.values_list("account_id", "customer_id")), {(self.emea.pk, None)}
        )

    def test_one_open_plan_per_record_and_template(self):
        first = self.start()
        with self.assertRaises(PlanOpen) as caught:
            self.start()
        self.assertEqual(caught.exception.plan_id, first.pk)
        self.start(self.builtin["save"])
        self.start(record=self.emea)

    def test_a_finished_plan_does_not_block_a_new_one(self):
        first = self.start()
        first.status = "cancelled"
        first.save(update_fields=["status"])
        self.assertNotEqual(self.start().pk, first.pk)

    def test_a_deleted_template_is_refused(self):
        template = self.make_template(name="Gone")
        pk = template.pk
        template.delete()
        with self.assertRaises(TemplateGone):
            start_plan(pk, self.pizza, owner=self.csm, actor=self.csm, start_date=self.today)

    def test_the_edited_copy_is_used_as_sent(self):
        steps = [
            {
                "name": "Only",
                "due_date": self.today + timedelta(days=5),
                "tasks": [
                    {
                        "title": "Do it",
                        "priority": "low",
                        "due_date": self.today + timedelta(days=3),
                        "assignee": self.mona,
                    }
                ],
            }
        ]
        plan = self.start(milestones=steps, name="Custom")
        self.assertEqual((plan.name, plan.target_date), ("Custom", self.today + timedelta(days=5)))
        (task,) = plan.tasks.all()
        self.assertEqual(
            (task.title, task.assignee, task.milestone.name), ("Do it", self.mona, "Only")
        )

    def test_started_and_audited_by_id(self):
        plan = self.start()
        event = AuditEvent.objects.get(action="plan.started")
        self.assertEqual(
            (event.actor, event.target_id, event.target_repr),
            (self.csm, str(plan.pk), f"Plan {plan.pk}"),
        )
        self.assertEqual(
            event.metadata,
            {
                "template": self.builtin["onboarding"].pk,
                "record_kind": "customer",
                "record_id": self.pizza.pk,
                "rule": None,
                "milestones": 4,
                "tasks": 7,
            },
        )

    def test_the_locks_come_in_order(self):
        with CaptureQueriesContext(connection) as ctx:
            self.start()
        locks = [q["sql"] for q in ctx.captured_queries if "FOR NO KEY UPDATE" in q["sql"]]
        tables = ['"accounts_organisation"', '"customers_customer"', '"plans_plantemplate"']
        order = [next(t for t in tables if f"FROM {t}" in sql) for sql in locks]
        self.assertEqual(order, tables)


class StartNoticeTests(StartFixture):
    def test_someone_else_starting_tells_the_owner_and_the_assignees(self):
        plan = self.start(owner=self.csm, actor=self.mona)
        link = f"/projects/{plan.pk}"
        self.assertEqual(
            self.notes("plan_started"),
            [(self.csm.pk, "Mona Manager started the plan Onboarding · Pizza Hut for you.", link)],
        )
        self.assertEqual(
            self.notes("plan_task_assigned"),
            [(self.csm.pk, "7 tasks on Onboarding · Pizza Hut were assigned to you.", link)],
        )

    def test_starting_your_own_plan_tells_nobody(self):
        self.start()
        self.assertEqual(self.notes("plan_started") + self.notes("plan_task_assigned"), [])

    def test_one_notice_per_person_never_to_the_person_acting(self):
        plan = self.start(owner=self.mona, actor=self.csm)
        link = f"/projects/{plan.pk}"
        self.assertEqual(
            self.notes("plan_started"),
            [(self.mona.pk, "Carl CSM started the plan Onboarding · Pizza Hut for you.", link)],
        )
        self.assertEqual(
            self.notes("plan_task_assigned"),
            [(self.mona.pk, "1 task on Onboarding · Pizza Hut was assigned to you.", link)],
        )

    def test_a_rule_tells_the_owner_by_the_rules_name(self):
        rule = self.make_rule(name="Onboard new")
        plan = self.start(actor=None, rule=rule)
        self.assertEqual((plan.started_by, plan.started_by_rule), (None, rule))
        self.assertEqual(
            self.notes("plan_started"),
            [
                (
                    self.csm.pk,
                    "Onboard new started the plan Onboarding · Pizza Hut for you.",
                    f"/projects/{plan.pk}",
                )
            ],
        )
        self.assertEqual(len(self.notes("plan_task_assigned")), 1)
        self.assertEqual(set(plan.tasks.values_list("created_by_id", flat=True)), {self.csm.pk})


class StartEndpointTests(PlanFixture):
    def post(self, user=None, **body):
        body.setdefault("template", self.builtin["onboarding"].pk)
        if "account" not in body:
            body.setdefault("customer", self.pizza.pk)
        return self.api(user or self.csm).post(URL, body, format="json")

    def test_requires_authentication(self):
        self.assertEqual(APIClient().post(URL, {}, format="json").status_code, 401)

    def test_201_with_the_plan(self):
        response = self.post()
        self.assertEqual(response.status_code, 201, response.content)
        data = response.data
        self.assertEqual(
            (data["name"], data["start_date"], data["owner"]["id"], len(data["milestones"])),
            ("Onboarding · Pizza Hut", iso(self.today), self.csm.pk, 4),
        )
        self.assertEqual(
            (data["tasks_total"], data["hidden_tasks"], data["can_edit"]), (7, 0, True)
        )

    def test_409_when_one_is_open(self):
        first = self.post().data
        response = self.post()
        self.assertEqual(
            (response.status_code, response.data),
            (409, {"code": "PLAN_OPEN", "plan_id": first["id"], "detail": say.PLAN_OPEN}),
        )

    def test_exactly_one_record(self):
        both = self.post(account=self.emea.pk, customer=self.pizza.pk)
        neither = self.api(self.csm).post(URL, {"template": self.builtin["qbr"].pk}, format="json")
        for response in (both, neither):
            self.assertEqual(
                (response.status_code, response.data),
                (400, {"non_field_errors": [say.CHOOSE_RECORD]}),
            )

    def test_a_record_you_cannot_open_reads_like_a_missing_one(self):
        for customer in (self.pizza.pk, 999999):
            response = self.post(user=self.other, customer=customer)
            self.assertEqual(
                (response.status_code, response.data),
                (400, {"customer": [say.CANT_OPEN_ORGANISATION]}),
            )
        response = self.post(user=self.other, account=self.emea.pk)
        self.assertEqual(response.data, {"account": [say.CANT_OPEN_ACCOUNT]})

    def test_a_template_you_cannot_read_is_refused(self):
        danas = self.make_template(owner=self.other, name="Dana's")
        response = self.post(template=danas.pk)
        self.assertEqual(
            (response.status_code, response.data), (400, {"template": [say.CHOOSE_TEMPLATE]})
        )

    def test_the_owner_must_be_able_to_open_the_record(self):
        for owner in (self.other.pk, self.stranger.pk, 999999):
            response = self.post(owner=owner)
            self.assertEqual(
                (response.status_code, response.data), (400, {"owner": [say.CANT_OPEN]})
            )
        response = self.post(owner=self.mona.pk)
        self.assertEqual((response.status_code, response.data["owner"]["id"]), (201, self.mona.pk))

    def test_an_edited_copy(self):
        due = iso(self.today + timedelta(days=3))
        steps = [
            {
                "name": "Only",
                "due_date": due,
                "tasks": [
                    {"title": "Do it", "priority": "low", "due_date": due, "assignee": self.mona.pk}
                ],
            }
        ]
        response = self.post(milestones=steps, name="Custom")
        self.assertEqual(response.status_code, 201, response.content)
        (milestone,) = response.data["milestones"]
        self.assertEqual(
            (response.data["name"], milestone["name"], milestone["tasks"][0]["assignee"]["id"]),
            ("Custom", "Only", self.mona.pk),
        )

    def test_an_edited_copy_is_checked_where_it_is_wrong(self):
        due = iso(self.today + timedelta(days=3))
        task = {"title": "Do it", "priority": "low", "due_date": due, "assignee": self.other.pk}
        response = self.post(milestones=[{"name": "M", "due_date": due, "tasks": [task]}])
        self.assertEqual(
            response.data, {"milestones": [{"tasks": [{"assignee": [say.CANT_OPEN]}]}]}
        )
        early = iso(self.today - timedelta(days=1))
        response = self.post(milestones=[{"name": "M", "due_date": early, "tasks": []}])
        self.assertEqual(response.data, {"milestones": [{"due_date": [say.DATE_RANGE]}]})
        late = iso(self.today + timedelta(days=366))
        response = self.post(milestones=[{"name": "M", "due_date": late, "tasks": []}])
        self.assertEqual(response.data, {"milestones": [{"due_date": [say.DATE_RANGE]}]})
        response = self.post(milestones=[{"name": "M", "due_date": "soon", "tasks": []}])
        self.assertEqual(response.data, {"milestones": [{"due_date": [say.CHOOSE_DATE]}]})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.plans.tests.test_starting --noinput`
Expected: ERROR, `ModuleNotFoundError: No module named 'services.plans.copying'`.

- [ ] **Step 3: Add dates, assignees and the edited copy to `validation.py`**

Add the imports:

```python
from datetime import date, timedelta

from services.accounts.models import User

from .access import can_open
```

and append:

```python
def in_range(day, start_date):
    """A plan's dates lie from its start to a year after it."""
    return start_date <= day <= start_date + timedelta(days=MAX_OFFSET)


def parse_date(value):
    """A `YYYY-MM-DD` string (or a date) as a date; None for anything else."""
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _date(item, start_date):
    day = parse_date(item.get("due_date"))
    if day is None:
        raise ValidationError({"due_date": [CHOOSE_DATE]})
    if not in_range(day, start_date):
        raise ValidationError({"due_date": [DATE_RANGE]})
    return day


def assignable(organisation_id, pk, record, field):
    """The active member `pk` of the workspace who may open `record`; else a
    refusal at `field` ("They can't open this record.")."""
    if not integer(pk):
        raise ValidationError({field: [CHOOSE_OWNER if field == "owner" else CHOOSE_ASSIGNEE]})
    user = User.objects.filter(pk=pk, organisation_id=organisation_id, is_active=True).first()
    # SOC2:AUTH-02 a plan's owner and assignees are teammates who can open its record
    if user is None or not can_open(user, record):
        raise ValidationError({field: [CANT_OPEN]})
    return user


def clean_plan_milestones(value, *, start_date, organisation_id, record):
    """The New plan modal's edited copy: 1-12 milestones `{name, due_date,
    tasks: [{title, priority, due_date, assignee}]}`, at most 50 tasks, every
    date from the start to a year after it, every assignee someone who can
    open the record. Returns the same shape with dates and `User`s."""
    people = {}

    def assignee(pk):
        if integer(pk) and pk in people:
            return people[pk]
        user = assignable(organisation_id, pk, record, "assignee")
        people[pk] = user
        return user

    def task(item):
        return {
            "title": _text(item, "title", MAX_TASK_TITLE, LONG_TITLE, NO_TITLE),
            "priority": _priority(item),
            "due_date": _date(item, start_date),
            "assignee": assignee(item.get("assignee")),
        }

    def milestone(item):
        return {
            "name": _text(item, "name", MAX_NAME, LONG_NAME, CHOOSE_NAME),
            "due_date": _date(item, start_date),
            "tasks": _tasks(item, task),
        }

    return _milestones(value, milestone)
```

- [ ] **Step 4: Write copying, the notices and the service**

`services/plans/copying.py`:

```python
"""A template and a plan, one into the other. `copy_template` dates a
template's milestones and tasks from a start date and names their people:
the shape `starting.start_plan` takes."""

from datetime import timedelta


def copy_template(template, *, start_date, record_owner, plan_owner):
    """`[{name, due_date, tasks: [{title, priority, due_date, assignee}]}]`."""
    people = {"record_owner": record_owner, "plan_owner": plan_owner}

    def day(offset):
        return start_date + timedelta(days=offset)

    return [
        {
            "name": milestone["name"],
            "due_date": day(milestone["offset_days"]),
            "tasks": [
                {
                    "title": task["title"],
                    "priority": task["priority"],
                    "due_date": day(task["offset_days"]),
                    "assignee": people[task["assignee_role"]],
                }
                for task in milestone["tasks"]
            ],
        }
        for milestone in template.milestones
    ]
```

`services/plans/notices.py`:

```python
"""The two plan notifications (spec §1.7). Both link to the plan, push only
once the surrounding transaction commits, and go only to active members of
the plan's workspace."""

from collections import Counter

from services.accounts.models import User
from services.notifications.models import Notification
from services.notifications.realtime import notify


def link(plan):
    return f"/projects/{plan.pk}"


def tell_owner_started(plan, *, actor, rule=None):
    """`plan_started` to the plan's owner when a rule, or someone else,
    started it for them."""
    if actor is not None and actor.pk == plan.owner_id:
        return
    if not plan.owner.is_active:
        return
    who = actor.name if actor is not None else rule.name
    notify(
        recipient=plan.owner,
        actor=actor,
        kind=Notification.Kind.PLAN_STARTED,
        message=f"{who} started the plan {plan.name} for you.",
        link=link(plan),
        push_on_commit=True,
    )


def assigned_message(plan, count):
    if count == 1:
        return f"1 task on {plan.name} was assigned to you."
    return f"{count} tasks on {plan.name} were assigned to you."


def tell_assignees(plan, tasks, *, actor):
    """One `plan_task_assigned` per person for this action, naming how many
    of `tasks` are theirs; never to the person acting."""
    counts = Counter(task.assignee_id for task in tasks if task.assignee_id is not None)
    if actor is not None:
        counts.pop(actor.pk, None)
    if not counts:
        return
    people = User.objects.filter(
        pk__in=list(counts), organisation_id=plan.organisation_id, is_active=True
    ).order_by("pk")
    for user in people:
        notify(
            recipient=user,
            actor=actor,
            kind=Notification.Kind.PLAN_TASK_ASSIGNED,
            message=assigned_message(plan, counts[user.pk]),
            link=link(plan),
            push_on_commit=True,
        )
```

`services/plans/starting.py`:

```python
"""Starting a plan (spec §1.4, §1.8): the one way a plan is made, by the API
and by a rule's "Start a plan" action alike.

It locks, in order, the workspace `Organisation`, the record, then the
template, each `FOR NO KEY UPDATE`: nothing here writes a key, so the
`FOR KEY SHARE` locks that foreign-key inserts take on the same rows never
wait on them. Then it checks for an open plan from that template on that
record. The partial unique constraint is the backstop, and its
`IntegrityError` becomes `PlanOpen` too. The template is copied (or the
modal's edited copy is used): later edits to the template never change the
plan. It opens its own transaction, nested in the caller's if there is one.
"""

from django.db import IntegrityError, transaction

from core import audit
from services.accounts.models import Organisation, User
from services.customers.models import Customer, Task

from .access import can_open
from .copying import copy_template
from .models import MAX_NAME, OPEN, Milestone, Plan, PlanTemplate
from .notices import tell_assignees, tell_owner_started


class PlanOpen(Exception):
    """The record already has an open plan from the template."""

    def __init__(self, plan_id):
        super().__init__(plan_id)
        self.plan_id = plan_id


class TemplateGone(Exception):
    """The template was deleted."""


def on_record(record):
    return {"customer": record} if isinstance(record, Customer) else {"account": record}


def record_meta(record):
    kind = "customer" if isinstance(record, Customer) else "account"
    return {"record_kind": kind, "record_id": record.pk}


def open_plan_id(record, template_id):
    plans = Plan.objects.filter(**on_record(record), template_id=template_id, status__in=OPEN)
    return plans.values_list("pk", flat=True).first()


def owner_for(record, fallback):
    """The record's own owner when they are an active member of `fallback`'s
    workspace who can open it; otherwise `fallback`. The owner is read
    afresh, never from a cached relation, so a deactivation is seen."""
    owner = None if record.owner_id is None else User.objects.filter(pk=record.owner_id).first()
    if (
        owner is not None
        and owner.organisation_id == fallback.organisation_id
        and can_open(owner, record)
    ):
        return owner
    return fallback


def default_name(template, record):
    return f"{template.name} · {record.name}"[:MAX_NAME]


def _lock(organisation_id, record):
    list(
        Organisation.objects.select_for_update(no_key=True)
        .filter(pk=organisation_id)
        .values_list("pk", flat=True)
    )
    list(
        type(record)
        .objects.select_for_update(no_key=True, of=("self",))
        .filter(pk=record.pk)
        .values_list("pk", flat=True)
    )


def start_plan(
    template_id,
    record,
    *,
    owner,
    start_date,
    actor=None,
    rule=None,
    name="",
    milestones=None,
    request=None,
):
    """Starts a plan from template `template_id` on `record` (a Customer or
    an Account), owned by `owner`, and returns it.

    - `actor` is the person starting it; for a rule it is None and `rule` is
      set. The plan's tasks are created by the actor, or the rule's owner.
    - `milestones` is the modal's edited copy (the shape
      `validation.clean_plan_milestones` returns). Without it the template
      is copied: `record_owner` tasks go to `owner_for(record, owner)`,
      `plan_owner` tasks to `owner`.

    Raises `PlanOpen` or `TemplateGone`."""
    creator = actor if actor is not None else rule.owner
    with transaction.atomic():
        _lock(owner.organisation_id, record)
        locked = PlanTemplate.objects.select_for_update(no_key=True, of=("self",))
        template = locked.filter(pk=template_id).first()
        if template is None:
            raise TemplateGone(template_id)
        existing = open_plan_id(record, template.pk)
        if existing is not None:
            raise PlanOpen(existing)
        steps = milestones
        if steps is None:
            steps = copy_template(
                template,
                start_date=start_date,
                record_owner=owner_for(record, owner),
                plan_owner=owner,
            )
        try:
            with transaction.atomic():
                plan = Plan.objects.create(
                    organisation_id=owner.organisation_id,
                    **on_record(record),
                    template=template,
                    name=name or default_name(template, record),
                    kind=template.kind,
                    owner=owner,
                    start_date=start_date,
                    target_date=max(step["due_date"] for step in steps),
                    started_by=actor,
                    started_by_rule=rule,
                )
        except IntegrityError:
            raise PlanOpen(open_plan_id(record, template.pk)) from None
        rows = Milestone.objects.bulk_create(
            [
                Milestone(
                    plan=plan, name=step["name"], position=position, due_date=step["due_date"]
                )
                for position, step in enumerate(steps)
            ]
        )
        tasks = Task.objects.bulk_create(
            [
                Task(
                    **on_record(record),
                    plan=plan,
                    milestone=milestone,
                    title=item["title"],
                    priority=item["priority"],
                    due_date=item["due_date"],
                    assignee=item["assignee"],
                    assignee_name=item["assignee"].name[:150],
                    created_by=creator,
                )
                for milestone, step in zip(rows, steps)
                for item in step["tasks"]
            ]
        )
        audit.record(  # SOC2:LOG-01
            "plan.started",
            request=request,
            actor=actor,
            organisation=plan.organisation,
            target=plan,
            metadata={
                "template": template.pk,
                **record_meta(record),
                "rule": None if rule is None else rule.pk,
                "milestones": len(rows),
                "tasks": len(tasks),
            },
        )
        tell_owner_started(plan, actor=actor, rule=rule)
        tell_assignees(plan, tasks, actor=actor)
    return plan
```

- [ ] **Step 5: The serializer and `POST plans/`**

Add to `services/plans/serializers.py` (imports merged into the existing block):

```python
from django.utils import timezone

from services.customers.scoping import visible_accounts, visible_customers

from .access import readable_templates
from .validation import (
    CANT_OPEN_ACCOUNT,
    CANT_OPEN_ORGANISATION,
    CHOOSE_DATE,
    CHOOSE_OWNER,
    CHOOSE_RECORD,
    CHOOSE_TEMPLATE,
    assignable,
    clean_plan_milestones,
)

DATE_ERRORS = {"required": CHOOSE_DATE, "null": CHOOSE_DATE, "invalid": CHOOSE_DATE}


class PlanStartSerializer(serializers.Serializer):
    """`POST plans/`: `{template, customer | account, name?, owner?,
    start_date?, milestones?}`. `owner` defaults to the caller, `start_date`
    to today, and without `milestones` the template is copied as it is."""

    template = serializers.IntegerField(
        error_messages={
            "required": CHOOSE_TEMPLATE,
            "null": CHOOSE_TEMPLATE,
            "invalid": CHOOSE_TEMPLATE,
        }
    )
    customer = serializers.IntegerField(
        required=False, allow_null=True, error_messages={"invalid": CANT_OPEN_ORGANISATION}
    )
    account = serializers.IntegerField(
        required=False, allow_null=True, error_messages={"invalid": CANT_OPEN_ACCOUNT}
    )
    name = serializers.CharField(
        required=False, allow_blank=True, max_length=MAX_NAME, error_messages=NAME_ERRORS
    )
    owner = serializers.IntegerField(
        required=False, allow_null=True, error_messages={"invalid": CHOOSE_OWNER}
    )
    start_date = serializers.DateField(required=False, error_messages=DATE_ERRORS)
    milestones = serializers.JSONField(required=False)

    def validate_template(self, value):
        user = self.context["request"].user
        # SOC2:AUTH-02 a plan starts only from a template its starter may read
        template = readable_templates(user).filter(pk=value).first()
        if template is None:
            raise serializers.ValidationError(CHOOSE_TEMPLATE)
        return template

    def validate(self, attrs):
        user = self.context["request"].user
        customer_id, account_id = attrs.get("customer"), attrs.get("account")
        if (customer_id is None) == (account_id is None):
            raise serializers.ValidationError({"non_field_errors": [CHOOSE_RECORD]})
        # SOC2:AUTH-02 a plan starts only on a record its starter may open;
        # a hidden one is refused in the same words as a missing one
        if customer_id is not None:
            record = visible_customers(user).filter(pk=customer_id).first()
            if record is None:
                raise serializers.ValidationError({"customer": [CANT_OPEN_ORGANISATION]})
        else:
            record = visible_accounts(user).filter(pk=account_id).first()
            if record is None:
                raise serializers.ValidationError({"account": [CANT_OPEN_ACCOUNT]})
        attrs["record"] = record
        owner = attrs.get("owner")
        attrs["owner"] = assignable(
            user.organisation_id, user.pk if owner is None else owner, record, "owner"
        )
        attrs["start_date"] = attrs.get("start_date") or timezone.localdate()
        if "milestones" in attrs:
            attrs["milestones"] = clean_plan_milestones(
                attrs["milestones"],
                start_date=attrs["start_date"],
                organisation_id=user.organisation_id,
                record=record,
            )
        return attrs
```

Add to `services/plans/views.py` (imports merged):

```python
from .serializers import PlanStartSerializer
from .starting import PlanOpen, TemplateGone, start_plan
from .validation import CHOOSE_TEMPLATE, PLAN_OPEN
```

and this method to `PlanListCreateView` (and add "POST starts a plan: 201 with the plan, 409 `PLAN_OPEN` when the record already has an open one from the template." to its docstring):

```python
    def post(self, request):
        serializer = PlanStartSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            plan = start_plan(
                data["template"].pk,
                data["record"],
                owner=data["owner"],
                start_date=data["start_date"],
                actor=request.user,
                name=data.get("name", ""),
                milestones=data.get("milestones"),
                request=request,
            )
        except PlanOpen as exc:
            return Response(
                {"code": "PLAN_OPEN", "plan_id": exc.plan_id, "detail": PLAN_OPEN},
                status=status.HTTP_409_CONFLICT,
            )
        except TemplateGone:
            raise ValidationError({"template": [CHOOSE_TEMPLATE]}) from None
        plan = get_visible_plan(request.user, plan.pk)
        return Response(plan_payload(plan, request.user), status=status.HTTP_201_CREATED)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.plans --noinput`
Expected: PASS.

- [ ] **Step 7: Check and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/plans
git commit -m "feat(plans): start a plan from a template: locks in order, one open per template, notices

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: How milestones and plans move, through the existing task route too; the task payload names its plan

Spec §1.2 (status rules), §1.4 ("Task completion recomputes milestone and plan status after locking the plan row (`no_key`)"), §2.5/§4 (the task serializer addition). Decisions 4 and 5.

**Files:**
- Create: `services/plans/status.py`
- Modify:
  - `services/customers/views.py` (`TaskDetailView.patch`; `CustomerTaskListView` and `AccountTaskListView` `select_related`)
  - `services/customers/serializers.py` (`TaskSerializer.plan`, `TaskSerializer.milestone`)
- Test: `services/plans/tests/test_status.py`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces, in `services.plans.status`:
  - `COMPLETED`;
  - `lock_plan(pk) -> Plan` (`FOR NO KEY UPDATE`, 404 once deleted; loads `organisation`, `customer`, `account`, `owner`);
  - `set_status(plan, new, *, by, now, today, request=None, actor=None) -> bool` (audits `plan.status_changed`, and `plan.cancelled` for a cancel);
  - `milestones_done(plan) -> (done, total)`;
  - `sync_milestones(milestone_ids, *, now)`;
  - `advance(plan, *, now, today, request=None, actor=None)`;
  - `finish_if_done(plan, *, now, today, request=None, actor=None) -> bool`;
  - `after_work(plan, milestone_ids, *, progressed, now, today, request=None, actor=None)`;
  - `refresh_target(plan)`;
  - `set_task_status(task, new_status, *, request=None, actor=None, now=None, today=None)`.
- The task payload of `GET customers/<id>/tasks/` and `GET …/accounts/<id>/tasks/` gains `plan: {id, name} | null` and `milestone: {id, name} | null`.

- [ ] **Step 1: Write the failing tests**

Create `services/plans/tests/test_status.py`:

```python
"""How a plan moves: the first completed task puts it on track; a
milestone is done when its tasks are, and re-opens with them unless a person
closed it; the last milestone finishes the plan in the same transaction; a
finished plan moves no more. The existing task route goes through the same
rules, under the plan's row lock. The task payload names its plan."""

from django.db import connection, transaction
from django.test.utils import CaptureQueriesContext

from services.customers.models import Task
from services.plans.models import Plan
from services.plans.status import lock_plan, set_status
from services.plans.tests.fixtures import PlanFixture


class StatusFixture(PlanFixture):
    def tick(self, task, status="completed", user=None):
        return self.api(user or self.csm).patch(
            f"/api/v1/tasks/{task.pk}/", {"status": status}, format="json"
        )

    def fresh(self, plan):
        return Plan.objects.get(pk=plan.pk)


class TaskRouteTests(StatusFixture):
    def test_the_first_completed_task_puts_the_plan_on_track(self):
        plan = self.build_plan()
        response = self.tick(plan.tasks.get(title="Hold the call"))
        self.assertEqual(response.status_code, 200, response.content)
        plan = self.fresh(plan)
        self.assertEqual((plan.status, plan.status_set_by), ("on_track", "system"))
        kickoff = plan.milestones.get(name="Kick-off")
        self.assertIsNotNone(kickoff.done_at)
        self.assertIsNone(kickoff.done_by)
        self.assertEqual(
            self.events("plan.status_changed"),
            [(str(plan.pk), {"old": "not_started", "new": "on_track", "by": "system"})],
        )
        self.assertEqual(len(self.events("task.update")), 1)

    def test_reopening_a_task_reopens_the_milestone_its_tasks_completed(self):
        plan = self.build_plan()
        call = plan.tasks.get(title="Hold the call")
        self.tick(call)
        self.tick(call, "pending")
        self.assertIsNone(plan.milestones.get(name="Kick-off").done_at)
        self.assertEqual(self.fresh(plan).status, "on_track")

    def test_a_milestone_marked_done_by_hand_stays_done(self):
        plan = self.build_plan()
        kickoff = plan.milestones.get(name="Kick-off")
        kickoff.done_at, kickoff.done_by = self.now, self.csm
        kickoff.save()
        call = plan.tasks.get(title="Hold the call")
        self.tick(call)
        self.tick(call, "pending")
        self.assertIsNotNone(plan.milestones.get(name="Kick-off").done_at)

    def test_the_last_milestone_done_finishes_the_plan(self):
        plan = self.build_plan()
        for task in plan.tasks.all():
            self.tick(task)
        plan = self.fresh(plan)
        self.assertEqual((plan.status, plan.status_set_by), ("done", "system"))
        self.assertIsNotNone(plan.done_at)
        self.assertEqual(
            [meta for _, meta in self.events("plan.status_changed")],
            [
                {"old": "not_started", "new": "on_track", "by": "system"},
                {"old": "on_track", "new": "done", "by": "system"},
            ],
        )

    def test_a_finished_plan_only_changes_the_task(self):
        plan = self.build_plan(status="cancelled")
        call = plan.tasks.get(title="Hold the call")
        self.assertEqual(self.tick(call).status_code, 200)
        self.assertEqual(Task.objects.get(pk=call.pk).status, "completed")
        self.assertEqual(self.fresh(plan).status, "cancelled")
        self.assertIsNone(plan.milestones.get(name="Kick-off").done_at)

    def test_a_task_without_a_plan_is_as_before(self):
        task = Task.objects.create(
            customer=self.pizza,
            title="Plain",
            assignee=self.csm,
            assignee_name="Carl CSM",
            created_by=self.csm,
            due_date=self.today,
            priority="low",
        )
        self.assertEqual(self.tick(task).status_code, 200)
        self.assertEqual(Task.objects.get(pk=task.pk).status, "completed")

    def test_the_plan_is_locked_before_the_task_is_written(self):
        plan = self.build_plan()
        with CaptureQueriesContext(connection) as ctx:
            self.tick(plan.tasks.get(title="Hold the call"))
        sqls = [q["sql"] for q in ctx.captured_queries]
        lock = next(
            i for i, sql in enumerate(sqls) if "FOR NO KEY UPDATE" in sql and '"plans_plan"' in sql
        )
        write = next(i for i, sql in enumerate(sqls) if sql.startswith('UPDATE "customers_task"'))
        self.assertLess(lock, write)


class SetStatusTests(StatusFixture):
    def set(self, plan, new, by="person"):
        with transaction.atomic():
            return set_status(
                lock_plan(plan.pk), new, by=by, now=self.now, today=self.today, actor=self.csm
            )

    def test_clearing_at_risk_by_hand_records_the_day(self):
        plan = self.build_plan(status="at_risk")
        self.assertTrue(self.set(plan, "on_track"))
        plan = self.fresh(plan)
        self.assertEqual(
            (plan.status, plan.status_set_by, plan.at_risk_cleared_on),
            ("on_track", "person", self.today),
        )

    def test_the_same_status_is_no_change(self):
        plan = self.build_plan()
        self.assertFalse(self.set(plan, "not_started"))
        self.assertEqual(self.events("plan.status_changed"), [])

    def test_cancelling_is_audited_twice(self):
        plan = self.build_plan()
        self.set(plan, "cancelled")
        self.assertEqual(self.events("plan.cancelled"), [(str(plan.pk), {})])
        self.assertEqual(
            self.events("plan.status_changed"),
            [(str(plan.pk), {"old": "not_started", "new": "cancelled", "by": "person"})],
        )


class TaskPayloadTests(StatusFixture):
    def tasks(self, url):
        return {row["title"]: row for row in self.api(self.csm).get(url).data}

    def test_a_task_names_its_plan_and_milestone(self):
        plan = self.build_plan()
        Task.objects.create(
            customer=self.pizza,
            title="Plain",
            assignee_name="x",
            due_date=self.today,
            priority="low",
        )
        rows = self.tasks(f"/api/v1/customers/{self.pizza.pk}/tasks/")
        kickoff = plan.milestones.get(name="Kick-off")
        self.assertEqual(rows["Hold the call"]["plan"], {"id": plan.pk, "name": plan.name})
        self.assertEqual(rows["Hold the call"]["milestone"], {"id": kickoff.pk, "name": "Kick-off"})
        self.assertEqual((rows["Plain"]["plan"], rows["Plain"]["milestone"]), (None, None))

    def test_an_account_task_names_its_plan_too(self):
        plan = self.build_plan(self.emea)
        rows = self.tasks(f"/api/v1/customers/{self.pizza.pk}/accounts/{self.emea.pk}/tasks/")
        self.assertEqual(rows["Hold the call"]["plan"], {"id": plan.pk, "name": plan.name})

    def test_the_list_does_not_grow_with_plan_tasks(self):
        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.api(self.csm).get(f"/api/v1/customers/{self.pizza.pk}/tasks/")
            return len(ctx.captured_queries)

        self.build_plan()
        one = count()
        self.build_plan(name="Second")
        self.build_plan(name="Third")
        self.assertEqual(count(), one)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.plans.tests.test_status --noinput`
Expected: ERROR, `ModuleNotFoundError: No module named 'services.plans.status'`.

- [ ] **Step 3: Write `status.py`**

```python
"""How a plan's milestones and status move (spec §1.2).

Every function here runs inside a transaction holding the plan's row lock
(`lock_plan`, `FOR NO KEY UPDATE`: only non-key columns change). The API's
edits, the existing task route (`set_task_status`) and the nightly step all
come through here, so the rules hold the same way everywhere:

- a milestone is done when all of its tasks are completed (`done_by` null),
  and re-opens when one of them re-opens, unless a person marked it done
  (`done_by` set);
- the first completed task, or a milestone marked done, moves a plan from
  `not_started` to `on_track`;
- the last milestone done finishes the plan, in the same transaction;
- a finished plan (`done`, `cancelled`) moves no more: its tasks may still be
  ticked, and nothing else follows.
"""

from django.db import transaction
from django.db.models import Count, Max, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone

from core import audit
from services.customers.models import Task

from .models import OPEN, Milestone, Plan

COMPLETED = Task.Status.COMPLETED


def lock_plan(pk):
    """The plan under its `FOR NO KEY UPDATE` row lock; 404 once deleted.
    Call inside a transaction."""
    plans = Plan.objects.select_for_update(no_key=True, of=("self",)).select_related(
        "organisation", "customer", "account", "owner"
    )
    return get_object_or_404(plans, pk=pk)


def set_status(plan, new, *, by, now, today, request=None, actor=None):
    """Moves the plan to `new` and audits it. False when it is there already."""
    old = plan.status
    if old == new:
        return False
    plan.status, plan.status_set_by = new, by
    fields = ["status", "status_set_by", "updated_at"]
    if new == Plan.Status.DONE:
        plan.done_at = now
        fields.append("done_at")
    if old == Plan.Status.AT_RISK and new == Plan.Status.ON_TRACK and by == Plan.SetBy.PERSON:
        plan.at_risk_cleared_on = today
        fields.append("at_risk_cleared_on")
    plan.save(update_fields=fields)
    audit.record(  # SOC2:LOG-01
        "plan.status_changed",
        request=request,
        actor=actor,
        organisation=plan.organisation,
        target=plan,
        metadata={"old": old, "new": new, "by": by},
    )
    if new == Plan.Status.CANCELLED:
        audit.record(  # SOC2:LOG-01
            "plan.cancelled",
            request=request,
            actor=actor,
            organisation=plan.organisation,
            target=plan,
            metadata={},
        )
    return True


def milestones_done(plan):
    """(done, total) over the plan's milestones."""
    found = plan.milestones.aggregate(
        total=Count("id"), done=Count("id", filter=Q(done_at__isnull=False))
    )
    return found["done"], found["total"]


def sync_milestones(milestone_ids, *, now):
    """Each milestone as its tasks say: done (by nobody) once it has tasks
    and all are completed; re-opened when they are not, unless a person
    marked it done."""
    ids = sorted({pk for pk in milestone_ids if pk is not None})
    if not ids:
        return
    rows = Milestone.objects.filter(pk__in=ids).annotate(
        total=Count("tasks"), unfinished=Count("tasks", filter=~Q(tasks__status=COMPLETED))
    )
    for milestone in rows:
        complete = milestone.total > 0 and milestone.unfinished == 0
        if complete and milestone.done_at is None:
            milestone.done_at, milestone.done_by = now, None
            milestone.save(update_fields=["done_at", "done_by"])
        elif not complete and milestone.done_at is not None and milestone.done_by_id is None:
            milestone.done_at = None
            milestone.save(update_fields=["done_at"])


def advance(plan, *, now, today, request=None, actor=None):
    """`not_started` → `on_track`: the first work done."""
    if plan.status == Plan.Status.NOT_STARTED:
        set_status(
            plan,
            Plan.Status.ON_TRACK,
            by=Plan.SetBy.SYSTEM,
            now=now,
            today=today,
            request=request,
            actor=actor,
        )


def finish_if_done(plan, *, now, today, request=None, actor=None):
    """An open plan whose milestones are all done becomes `done`."""
    if plan.status not in OPEN:
        return False
    done, total = milestones_done(plan)
    if not total or done < total:
        return False
    return set_status(
        plan,
        Plan.Status.DONE,
        by=Plan.SetBy.SYSTEM,
        now=now,
        today=today,
        request=request,
        actor=actor,
    )


def after_work(plan, milestone_ids, *, progressed, now, today, request=None, actor=None):
    """After tasks changed under `milestone_ids`: those milestones, then the
    plan. `progressed` when a task became completed or a milestone was
    marked done. Nothing moves on a finished plan."""
    if plan.status not in OPEN:
        return
    sync_milestones(milestone_ids, now=now)
    if progressed:
        advance(plan, now=now, today=today, request=request, actor=actor)
    finish_if_done(plan, now=now, today=today, request=request, actor=actor)


def refresh_target(plan):
    """The target date is the latest milestone due date."""
    latest = plan.milestones.aggregate(latest=Max("due_date"))["latest"]
    if latest is not None and latest != plan.target_date:
        plan.target_date = latest
        plan.save(update_fields=["target_date", "updated_at"])


def set_task_status(task, new_status, *, request=None, actor=None, now=None, today=None):
    """A plan task ticked through the existing task route: the plan's row
    lock first, then the task, then its milestone and the plan move on."""
    now = now or timezone.now()
    today = today or timezone.localdate()
    with transaction.atomic():
        plan = lock_plan(task.plan_id)
        old = Task.objects.filter(pk=task.pk).values_list("status", flat=True).get()
        task.status = new_status
        task.save(update_fields=["status"])
        after_work(
            plan,
            [task.milestone_id],
            progressed=new_status == COMPLETED and old != COMPLETED,
            now=now,
            today=today,
            request=request,
            actor=actor,
        )
```

- [ ] **Step 4: Route the existing task tick through it, and name the plan in the payload**

In `services/customers/views.py`, `TaskDetailView.patch`, replace:

```python
        if new_status != previous:
            task.status = new_status
            task.save(update_fields=["status"])
```

with:

```python
        if new_status != previous:
            if task.plan_id is not None:
                from services.plans.status import set_task_status

                # A plan's task moves its milestone and plan too, under the
                # plan's row lock (services/plans/status.py). Who may tick it
                # is this route's own rule, above, unchanged.
                set_task_status(task, new_status, request=request)
            else:
                task.status = new_status
                task.save(update_fields=["status"])
```

In the same file, in both `CustomerTaskListView.get_queryset` and `AccountTaskListView.get_queryset`, change `select_related("assignee", "created_by")` to `select_related("assignee", "created_by", "plan", "milestone")`.

In `services/customers/serializers.py`, `TaskSerializer`: add the two fields beside the other `SerializerMethodField`s:

```python
    plan = serializers.SerializerMethodField()
    milestone = serializers.SerializerMethodField()
```

add `"plan"` and `"milestone"` to the end of `Meta.fields`, and add these methods after `get_initiative`:

```
    def get_plan(self, task):
        # The plan this work belongs to (services/plans), read by anyone who
        # may read the task: the plan's own rule is that its record's readers
        # read it, and the task's record is the plan's.
        if task.plan_id is None:
            return None
        return {"id": task.plan_id, "name": task.plan.name}

    def get_milestone(self, task):
        if task.milestone_id is None:
            return None
        return {"id": task.milestone_id, "name": task.milestone.name}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.plans services.customers --parallel --noinput`
Expected: PASS, the customers tests included (their task payload assertions compare named keys, and the two new keys are additions).

If a customers test compares a task payload's whole key set, add `"plan", "milestone"` to that expected set in the same commit.

- [ ] **Step 6: Check and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/plans services/customers/views.py services/customers/serializers.py services/customers/tests
git commit -m "feat(plans): milestones and plans move with their tasks, through the task route too

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

- [ ] **Step (addendum, reconciled with the frontend plan): plan tasks in the activity story**

The record pages' live feed is the Story (`GET organizations/:id/story/`, `GET accounts/:id/story/`), not the task list. A story item of kind `task` carries the same two fields as the task payload: `"plan": {"id", "name"} | null` and `"milestone": {"id", "name"} | null`. Other kinds do not gain them.

In `services/organizations/story/sources.py`, the `"task"` `Source` gets `related=("assignee", "plan", "milestone")`. In `services/organizations/story/items.py`, `_task(row)` returns `plan`/`milestone`, and `make_item` passes extra keys through:

```python
def _ref(row):
    return {"id": row.pk, "name": row.name} if row is not None else None


def _task(row):
    return {
        "title": row.title,
        "summary": " · ".join(
            [
                f"Due {row.due_date.isoformat()}",
                row.get_priority_display(),
                row.get_status_display(),
            ]
        ),
        "actor": person(row.assignee, row.assignee_name),
        "extra": {"plan": _ref(row.plan), "milestone": _ref(row.milestone)},
    }
```

`make_item(..., extra=None)` merges `extra` into the item it returns (`item.update(extra or {})`). Test (in `services/plans/tests/test_status.py` or the story's own tests): an organisation story with one plan task and one plain task, read by the task's creator: the plan task's item has `plan == {"id": plan.pk, "name": plan.name}` and `milestone == {"id": m.pk, "name": m.name}`; the plain task's item has `plan is None` and `milestone is None`; a note item has no `plan` key; and the story's query count is the same with one plan task as with three (no N+1). Run the story tests (`services.organizations services.account_story`) as well before committing.

### Task 7: Editing and deleting a plan

Spec §1.2 (by hand: on track, at risk, cancelled, done), §1.3 (edit, delete, owners), §4 (`PATCH plans/:id/`, `DELETE plans/:id/`). Contract notes 5, 6 and 7. Decision 6.

**Files:**
- Modify:
  - `services/plans/serializers.py` (`PlanPatchSerializer`)
  - `services/plans/views.py` (`PlanDetailView.patch`, `.delete`; the shared helpers below)
- Test: `services/plans/tests/test_editing.py`

**Interfaces:**
- Consumes: Tasks 1–6 (`status.lock_plan`, `status.set_status`, `status.milestones_done`; `starting.record_meta`; `access.require_editor`, `access.record_of`).
- Produces, in `views.py` (Tasks 8 and 9 use them):
  - `_plan_response(request, plan, status_code=200) -> Response` (the plan as the caller reads it);
  - `_editable(user, pk) -> Plan` (404 for a plan the caller cannot read, 403 for a reader who does not edit it);
  - `_require_open(plan)` (400 `PLAN_FINISHED`);
  - `_lock_for_edit(user, pk) -> Plan` (`lock_plan`, then the editor check again, then open);
- `serializers.PlanPatchSerializer` (context `{"plan"}`; `validated_data` may hold `name`, `owner` (a `User`), `status`).

- [ ] **Step 1: Write the failing tests**

Create `services/plans/tests/test_editing.py`:

```python
"""Editing a plan: its owner and their managers change the name, the owner
and the status; any other reader gets 403, anyone who cannot open the record
404. Cancelled is final; done only when every milestone is. Deleting is for
editors while no task is completed; otherwise 409, cancel it instead."""

from services.customers.models import Task
from services.plans import validation as say
from services.plans.access import NOT_EDITOR
from services.plans.models import Plan
from services.plans.tests.fixtures import PlanFixture

URL = "/api/v1/plans/"


class PlanEditTests(PlanFixture):
    def patch(self, plan, user=None, **body):
        return self.api(user or self.csm).patch(f"{URL}{plan.pk}/", body, format="json")

    def test_the_owner_and_their_manager_edit(self):
        plan = self.build_plan()
        self.assertEqual(self.patch(plan, name="Renamed").data["name"], "Renamed")
        self.assertEqual(self.patch(plan, user=self.mona, name="Again").status_code, 200)
        self.assertEqual(
            self.events("plan.updated"),
            [(str(plan.pk), {"fields": ["name"]}), (str(plan.pk), {"fields": ["name"]})],
        )

    def test_a_reader_who_does_not_edit_gets_403(self):
        plan = self.build_plan()
        response = self.patch(plan, user=self.admin, name="Mine")
        self.assertEqual((response.status_code, response.data), (403, {"detail": NOT_EDITOR}))

    def test_someone_who_cannot_open_the_record_gets_404(self):
        plan = self.build_plan()
        for user in (self.other, self.stranger):
            self.assertEqual(self.patch(plan, user=user, name="x").status_code, 404)

    def test_a_new_owner_must_be_able_to_open_the_record(self):
        plan = self.build_plan()
        response = self.patch(plan, owner=self.other.pk)
        self.assertEqual((response.status_code, response.data), (400, {"owner": [say.CANT_OPEN]}))
        response = self.patch(plan, owner=self.mona.pk)
        self.assertEqual((response.status_code, response.data["owner"]["id"]), (200, self.mona.pk))
        self.assertEqual(self.events("plan.updated"), [(str(plan.pk), {"fields": ["owner"]})])

    def test_an_edit_that_changes_nothing_records_nothing(self):
        plan = self.build_plan()
        self.assertEqual(self.patch(plan, name=plan.name).status_code, 200)
        self.assertEqual(self.events("plan.updated"), [])

    def test_status_by_hand(self):
        plan = self.build_plan()
        self.assertEqual(self.patch(plan, status="at_risk").data["status"], "at_risk")
        self.assertEqual(self.patch(plan, status="on_track").data["status"], "on_track")
        plan = Plan.objects.get(pk=plan.pk)
        self.assertEqual((plan.status_set_by, plan.at_risk_cleared_on), ("person", self.today))
        self.assertEqual(
            [meta for _, meta in self.events("plan.status_changed")],
            [
                {"old": "not_started", "new": "at_risk", "by": "person"},
                {"old": "at_risk", "new": "on_track", "by": "person"},
            ],
        )

    def test_done_only_when_every_milestone_is(self):
        plan = self.build_plan()
        response = self.patch(plan, status="done")
        self.assertEqual(
            (response.status_code, response.data), (400, {"status": [say.DONE_NEEDS_MILESTONES]})
        )
        plan.milestones.update(done_at=self.now, done_by=self.csm)
        response = self.patch(plan, status="done")
        self.assertEqual(response.data["status"], "done")
        self.assertIsNotNone(Plan.objects.get(pk=plan.pk).done_at)

    def test_only_the_four_statuses_by_hand(self):
        plan = self.build_plan()
        for value in ("not_started", "paused"):
            response = self.patch(plan, status=value)
            self.assertEqual(
                (response.status_code, response.data), (400, {"status": [say.CHOOSE_STATUS]})
            )

    def test_cancelled_is_final(self):
        plan = self.build_plan()
        self.assertEqual(self.patch(plan, status="cancelled").data["status"], "cancelled")
        self.assertEqual(self.events("plan.cancelled"), [(str(plan.pk), {})])
        for body in ({"name": "Back"}, {"status": "on_track"}):
            response = self.patch(plan, **body)
            self.assertEqual(
                (response.status_code, response.data),
                (400, {"non_field_errors": [say.PLAN_FINISHED]}),
            )


class PlanDeleteTests(PlanFixture):
    def delete(self, plan, user=None):
        return self.api(user or self.csm).delete(f"{URL}{plan.pk}/")

    def test_an_editor_deletes_a_plan_with_no_completed_work(self):
        plan = self.build_plan()
        self.assertEqual(self.delete(plan).status_code, 204)
        self.assertFalse(Plan.objects.filter(pk=plan.pk).exists())
        self.assertFalse(Task.objects.filter(title="Hold the call").exists())
        self.assertEqual(
            self.events("plan.deleted"),
            [
                (
                    str(plan.pk),
                    {"template": None, "record_kind": "customer", "record_id": self.pizza.pk},
                )
            ],
        )

    def test_completed_work_means_cancel_instead(self):
        plan = self.build_plan()
        plan.tasks.filter(title="Hold the call").update(status="completed")
        response = self.delete(plan)
        self.assertEqual(
            (response.status_code, response.data),
            (409, {"code": "PLAN_HAS_DONE_WORK", "detail": say.HAS_DONE_WORK}),
        )
        self.assertTrue(Plan.objects.filter(pk=plan.pk).exists())

    def test_hidden_completed_work_counts_too(self):
        plan = self.build_plan(
            steps=[("Only", 3, [("Secret", self.admin, "completed", self.admin)])]
        )
        self.assertEqual(self.delete(plan).status_code, 409)

    def test_only_editors_delete(self):
        plan = self.build_plan()
        self.assertEqual(self.delete(plan, user=self.admin).status_code, 403)
        self.assertEqual(self.delete(plan, user=self.other).status_code, 404)
        self.assertEqual(self.delete(plan, user=self.mona).status_code, 204)

    def test_can_delete_on_the_plan_page(self):
        plan = self.build_plan()
        page = f"{URL}{plan.pk}/"
        self.assertTrue(self.api(self.csm).get(page).data["can_delete"])
        self.assertFalse(self.api(self.admin).get(page).data["can_delete"])
        plan.tasks.filter(title="Hold the call").update(status="completed")
        self.assertFalse(self.api(self.csm).get(page).data["can_delete"])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.plans.tests.test_editing --noinput`
Expected: FAIL: PATCH and DELETE answer 405.

- [ ] **Step 3: The serializer**

Add to `services/plans/serializers.py` (imports merged):

```python
from .access import record_of
from .validation import CHOOSE_STATUS

#: The statuses a person may set by hand (spec §1.2, §4).
BY_HAND = ["on_track", "at_risk", "cancelled", "done"]


class PlanPatchSerializer(serializers.Serializer):
    """`PATCH plans/:id/`: any of `name`, `owner`, `status`. The new owner
    must be an active teammate who can open the record."""

    name = serializers.CharField(max_length=MAX_NAME, required=False, error_messages=NAME_ERRORS)
    owner = serializers.IntegerField(
        required=False, error_messages={"invalid": CHOOSE_OWNER, "null": CHOOSE_OWNER}
    )
    status = serializers.ChoiceField(
        choices=BY_HAND,
        required=False,
        error_messages={"invalid_choice": CHOOSE_STATUS, "null": CHOOSE_STATUS},
    )

    def validate(self, attrs):
        plan = self.context["plan"]
        if "owner" in attrs:
            attrs["owner"] = assignable(
                plan.organisation_id, attrs["owner"], record_of(plan), "owner"
            )
        return attrs
```

- [ ] **Step 4: The helpers and the two methods**

Add to `services/plans/views.py` (imports merged):

```python
from services.customers.models import Task

from .access import require_editor
from .serializers import PlanPatchSerializer
from .starting import record_meta
from .status import lock_plan, milestones_done, set_status
from .validation import DONE_NEEDS_MILESTONES, HAS_DONE_WORK, PLAN_FINISHED


def _plan_response(request, plan, status_code=status.HTTP_200_OK):
    """The plan as the caller reads it now."""
    plan = get_visible_plan(request.user, plan.pk)
    return Response(plan_payload(plan, request.user), status=status_code)


def _editable(user, pk):
    """Before any lock: 404 for a plan the caller cannot read, 403 for a
    reader who does not edit it."""
    plan = get_visible_plan(user, pk)
    require_editor(user, plan)
    return plan


def _require_open(plan):
    if plan.status not in OPEN:
        raise ValidationError({"non_field_errors": [PLAN_FINISHED]})


def _lock_for_edit(user, pk):
    """The plan under its row lock, for an editor (checked again under the
    lock: its owner may just have changed), while it is open."""
    plan = lock_plan(pk)
    require_editor(user, plan)
    _require_open(plan)
    return plan
```

Add these methods to `PlanDetailView`:

```
    def patch(self, request, pk):
        plan = _editable(request.user, pk)
        serializer = PlanPatchSerializer(data=request.data, context={"plan": plan})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        now, today = timezone.now(), timezone.localdate()
        with transaction.atomic():
            plan = _lock_for_edit(request.user, plan.pk)
            if data.get("status") == Plan.Status.DONE:
                done, total = milestones_done(plan)
                if done < total:
                    raise ValidationError({"status": [DONE_NEEDS_MILESTONES]})
            changed = []
            if "name" in data and data["name"] != plan.name:
                plan.name = data["name"]
                changed.append("name")
            if "owner" in data and data["owner"].pk != plan.owner_id:
                plan.owner = data["owner"]
                changed.append("owner")
            if changed:
                plan.save(update_fields=[*changed, "updated_at"])
                _audit(request, "plan.updated", plan, fields=sorted(changed))
            if "status" in data:
                set_status(
                    plan, data["status"], by=Plan.SetBy.PERSON, now=now, today=today, request=request
                )
        return _plan_response(request, plan)

    def delete(self, request, pk):
        plan = _editable(request.user, pk)
        with transaction.atomic():
            # A delete takes the full row lock: the plan's key goes.
            locked = Plan.objects.select_for_update(of=("self",)).select_related(
                "customer", "account"
            )
            plan = get_object_or_404(locked, pk=plan.pk)
            require_editor(request.user, plan)
            if plan.tasks.filter(status=Task.Status.COMPLETED).exists():
                return Response(
                    {"code": "PLAN_HAS_DONE_WORK", "detail": HAS_DONE_WORK},
                    status=status.HTTP_409_CONFLICT,
                )
            record = plan.customer if plan.customer_id is not None else plan.account
            _audit(
                request, "plan.deleted", plan, template=plan.template_id, **record_meta(record)
            )
            plan.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
```

Add `from django.utils import timezone` to the view imports, and update `PlanDetailView`'s docstring: "PATCH (`name`, `owner`, `status`) and DELETE (only while no task is completed, else 409 `PLAN_HAS_DONE_WORK`) are for the plan's owner and anyone above them: 403 for another reader."

- [ ] **Step 5: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.plans --noinput`
Expected: PASS.

- [ ] **Step 6: Check and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/plans
git commit -m "feat(plans): edit a plan's name, owner and status; delete while no work is done

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: A plan's milestones and tasks

Spec §1.2 (marked done by hand, re-opening), §1.3 (edits, assignees, task status), §1.7 (`plan.milestone_changed`, `plan_task_assigned` on reassigning), §4 (the milestone and task routes). Contract notes 4, 6, 8, 12 and 13. Decisions 2, 3 and 9.

**Files:**
- Modify:
  - `services/plans/serializers.py` (`MilestoneWriteSerializer`, `PlanTaskSerializer`)
  - `services/plans/views.py` (five views)
  - `services/plans/urls.py`
- Test: `services/plans/tests/test_structure.py`

**Interfaces:**
- Consumes: Tasks 1–7 (`_editable`, `_lock_for_edit`, `_require_open`, `_plan_response`, `_audit`; `status.after_work`, `advance`, `finish_if_done`, `refresh_target`, `lock_plan`; `notices.tell_assignees`; `access.can_edit`, `NOT_EDITOR`, `NOT_CHECKER`).
- Produces:
  - `serializers.MilestoneWriteSerializer` and `serializers.PlanTaskSerializer` (both take context `{"plan"}`);
  - views `MilestoneCreateView`, `MilestoneDetailView`, `MilestoneReorderView`, `PlanTaskCreateView`, `PlanTaskDetailView`;
  - URL names `plan-milestones`, `plan-milestone-detail`, `plan-milestones-reorder`, `plan-tasks`, `plan-task-detail`.

- [ ] **Step 1: Write the failing tests**

Create `services/plans/tests/test_structure.py`:

```python
"""A plan's milestones and tasks: editors add, rename, re-date, reorder,
mark done or undone and remove; dates stay within a year of the start; at
most 12 milestones and 50 tasks; a task's assignee, creator and the plan's
editors tick it; a task the caller cannot see is 404; every change audited
by id; a finished plan's structure is read-only."""

from datetime import timedelta

from services.customers.models import Task
from services.plans import validation as say
from services.plans.access import NOT_CHECKER, NOT_EDITOR
from services.plans.models import Milestone, Plan
from services.plans.tests.fixtures import PlanFixture, iso

URL = "/api/v1/plans/"


class StructureFixture(PlanFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.plan = cls.build_plan()
        cls.kickoff = cls.plan.milestones.get(name="Kick-off")
        cls.review = cls.plan.milestones.get(name="Review")

    def call(self, method, path, user=None, **body):
        client = self.api(user or self.csm)
        return getattr(client, method)(f"{URL}{self.plan.pk}/{path}", body, format="json")

    def day(self, days):
        return iso(self.today + timedelta(days=days))

    def fresh(self):
        return Plan.objects.get(pk=self.plan.pk)


class MilestoneTests(StructureFixture):
    def test_add_one_at_the_end(self):
        response = self.call("post", "milestones/", name="Wrap-up", due_date=self.day(30))
        self.assertEqual(response.status_code, 201, response.content)
        names = [(m["name"], m["position"]) for m in response.data["milestones"]]
        self.assertEqual(names, [("Kick-off", 0), ("Review", 1), ("Wrap-up", 2)])
        self.assertEqual(response.data["target_date"], self.day(30))
        added = Milestone.objects.get(name="Wrap-up")
        self.assertEqual(
            self.events("plan.milestone_changed"),
            [(str(self.plan.pk), {"milestone": added.pk, "change": "added"})],
        )

    def test_dates_stay_within_a_year_of_the_start(self):
        for due in (self.day(-1), self.day(366)):
            response = self.call("post", "milestones/", name="x", due_date=due)
            self.assertEqual(
                (response.status_code, response.data), (400, {"due_date": [say.DATE_RANGE]})
            )
        response = self.call("post", "milestones/", name="", due_date=self.day(3))
        self.assertEqual(response.data, {"name": [say.CHOOSE_NAME]})

    def test_at_most_twelve(self):
        Milestone.objects.bulk_create(
            [
                Milestone(plan=self.plan, name=f"M{i}", position=2 + i, due_date=self.today)
                for i in range(10)
            ]
        )
        response = self.call("post", "milestones/", name="13th", due_date=self.day(3))
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"non_field_errors": [say.TOO_MANY_MILESTONES]}),
        )

    def test_only_editors_while_open(self):
        response = self.call("post", "milestones/", user=self.admin, name="x", due_date=self.day(3))
        self.assertEqual((response.status_code, response.data), (403, {"detail": NOT_EDITOR}))
        Plan.objects.filter(pk=self.plan.pk).update(status="done")
        response = self.call("post", "milestones/", name="x", due_date=self.day(3))
        self.assertEqual(response.data, {"non_field_errors": [say.PLAN_FINISHED]})

    def test_rename_and_redate_move_the_target(self):
        response = self.call(
            "patch", f"milestones/{self.review.pk}/", name="Final review", due_date=self.day(40)
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            (response.data["milestones"][1]["name"], response.data["target_date"]),
            ("Final review", self.day(40)),
        )
        self.assertEqual(
            self.events("plan.milestone_changed"),
            [
                (
                    str(self.plan.pk),
                    {
                        "milestone": self.review.pk,
                        "change": "edited",
                        "fields": ["due_date", "name"],
                    },
                )
            ],
        )

    def test_marked_done_by_hand_puts_the_plan_on_track(self):
        response = self.call("patch", f"milestones/{self.kickoff.pk}/", done=True)
        self.assertIsNotNone(response.data["milestones"][0]["done_at"])
        self.assertEqual(response.data["status"], "on_track")
        self.assertEqual(Milestone.objects.get(pk=self.kickoff.pk).done_by, self.csm)
        self.assertEqual(
            self.events("plan.milestone_changed"),
            [(str(self.plan.pk), {"milestone": self.kickoff.pk, "change": "done"})],
        )

    def test_the_last_one_marked_done_finishes_the_plan(self):
        self.call("patch", f"milestones/{self.kickoff.pk}/", done=True)
        response = self.call("patch", f"milestones/{self.review.pk}/", done=True)
        self.assertEqual(response.data["status"], "done")

    def test_marked_undone(self):
        self.call("patch", f"milestones/{self.kickoff.pk}/", done=True)
        response = self.call("patch", f"milestones/{self.kickoff.pk}/", done=False)
        self.assertIsNone(response.data["milestones"][0]["done_at"])
        self.assertEqual(response.data["status"], "on_track")

    def test_remove_takes_its_tasks_and_closes_the_gap(self):
        response = self.call("delete", f"milestones/{self.kickoff.pk}/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            [(m["name"], m["position"]) for m in response.data["milestones"]], [("Review", 0)]
        )
        self.assertFalse(Task.objects.filter(title="Hold the call").exists())
        self.assertEqual(
            self.events("plan.milestone_changed"),
            [(str(self.plan.pk), {"milestone": self.kickoff.pk, "change": "removed"})],
        )

    def test_removing_the_open_one_left_finishes_the_plan(self):
        self.call("patch", f"milestones/{self.review.pk}/", done=True)
        response = self.call("delete", f"milestones/{self.kickoff.pk}/")
        self.assertEqual(response.data["status"], "done")

    def test_the_last_milestone_stays(self):
        self.call("delete", f"milestones/{self.kickoff.pk}/")
        response = self.call("delete", f"milestones/{self.review.pk}/")
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"non_field_errors": [say.LAST_MILESTONE]}),
        )

    def test_a_milestone_of_another_plan_is_404(self):
        other = self.build_plan(self.emea).milestones.first()
        self.assertEqual(self.call("patch", f"milestones/{other.pk}/", name="x").status_code, 404)

    def test_reorder(self):
        response = self.call("post", "milestones/reorder/", order=[self.review.pk, self.kickoff.pk])
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual([m["name"] for m in response.data["milestones"]], ["Review", "Kick-off"])
        self.assertEqual(
            self.events("plan.milestone_changed"),
            [
                (
                    str(self.plan.pk),
                    {
                        "milestone": None,
                        "change": "reordered",
                        "order": [self.review.pk, self.kickoff.pk],
                    },
                )
            ],
        )

    def test_reorder_lists_every_milestone_once(self):
        for order in (
            [self.review.pk],
            [self.review.pk, self.review.pk],
            [self.review.pk, 999999],
            "x",
        ):
            response = self.call("post", "milestones/reorder/", order=order)
            self.assertEqual(
                (response.status_code, response.data), (400, {"order": [say.REORDER]}), order
            )


class TaskTests(StructureFixture):
    def body(self, **fields):
        return {
            "milestone": self.kickoff.pk,
            "title": "Send the deck",
            "priority": "high",
            "due_date": self.day(5),
            "assignee": self.mona.pk,
            **fields,
        }

    def test_add_a_task_and_tell_its_assignee(self):
        response = self.call("post", "tasks/", **self.body())
        self.assertEqual(response.status_code, 201, response.content)
        task = Task.objects.get(title="Send the deck")
        self.assertEqual(
            (
                task.plan,
                task.milestone,
                task.customer,
                task.created_by,
                task.assignee,
                task.assignee_name,
            ),
            (self.plan, self.kickoff, self.pizza, self.csm, self.mona, "Mona Manager"),
        )
        self.assertEqual(
            self.notes("plan_task_assigned"),
            [
                (
                    self.mona.pk,
                    "1 task on Kick-off · Pizza Hut was assigned to you.",
                    f"/projects/{self.plan.pk}",
                )
            ],
        )
        self.assertEqual(
            self.events("plan.task_changed"),
            [(str(self.plan.pk), {"task": task.pk, "change": "added"})],
        )

    def test_assigning_yourself_tells_nobody(self):
        self.call("post", "tasks/", **self.body(assignee=self.csm.pk))
        self.assertEqual(self.notes("plan_task_assigned"), [])

    def test_a_task_is_checked_where_it_is_wrong(self):
        cases = [
            ({"assignee": self.other.pk}, {"assignee": [say.CANT_OPEN]}),
            (
                {"milestone": self.build_plan(self.emea).milestones.first().pk},
                {"milestone": [say.CHOOSE_MILESTONE]},
            ),
            ({"title": ""}, {"title": [say.NO_TITLE]}),
            ({"priority": "urgent"}, {"priority": [say.CHOOSE_PRIORITY]}),
            ({"due_date": self.day(400)}, {"due_date": [say.DATE_RANGE]}),
        ]
        for fields, errors in cases:
            response = self.call("post", "tasks/", **self.body(**fields))
            self.assertEqual((response.status_code, response.data), (400, errors), fields)

    def test_at_most_fifty_tasks(self):
        Task.objects.bulk_create(
            [
                Task(
                    customer=self.pizza,
                    plan=self.plan,
                    milestone=self.kickoff,
                    title=f"T{i}",
                    assignee_name="",
                    due_date=self.today,
                    priority="low",
                )
                for i in range(48)
            ]
        )
        response = self.call("post", "tasks/", **self.body())
        self.assertEqual(
            (response.status_code, response.data), (400, {"non_field_errors": [say.TOO_MANY_TASKS]})
        )

    def test_a_new_task_reopens_a_milestone_its_tasks_completed(self):
        call = self.plan.tasks.get(title="Hold the call")
        self.call("patch", f"tasks/{call.pk}/", status="completed")
        self.assertIsNotNone(Milestone.objects.get(pk=self.kickoff.pk).done_at)
        self.call("post", "tasks/", **self.body())
        self.assertIsNone(Milestone.objects.get(pk=self.kickoff.pk).done_at)

    def test_an_editor_edits_and_reassigns(self):
        call = self.plan.tasks.get(title="Hold the call")
        response = self.call(
            "patch", f"tasks/{call.pk}/", title="Hold the big call", assignee=self.mona.pk
        )
        self.assertEqual(response.status_code, 200, response.content)
        call.refresh_from_db()
        self.assertEqual(
            (call.title, call.assignee, call.assignee_name),
            ("Hold the big call", self.mona, "Mona Manager"),
        )
        self.assertEqual(len(self.notes("plan_task_assigned")), 1)
        self.assertEqual(
            self.events("plan.task_changed"),
            [
                (
                    str(self.plan.pk),
                    {"task": call.pk, "change": "edited", "fields": ["assignee", "title"]},
                )
            ],
        )

    def test_moving_a_task_moves_both_milestones(self):
        call = self.plan.tasks.get(title="Hold the call")
        review = self.plan.tasks.get(title="Run the review")
        self.call("patch", f"tasks/{review.pk}/", status="completed")
        self.assertIsNotNone(Milestone.objects.get(pk=self.review.pk).done_at)
        self.call("patch", f"tasks/{call.pk}/", milestone=self.review.pk)
        self.assertIsNone(Milestone.objects.get(pk=self.review.pk).done_at)

    def test_the_assignee_ticks_but_does_not_edit(self):
        secret = Task.objects.create(
            customer=self.pizza,
            plan=self.plan,
            milestone=self.review,
            title="Alice's",
            assignee=self.admin,
            assignee_name="Alice Admin",
            created_by=self.admin,
            due_date=self.today,
            priority="low",
        )
        response = self.call("patch", f"tasks/{secret.pk}/", user=self.admin, status="completed")
        self.assertEqual(response.status_code, 200, response.content)
        response = self.call("patch", f"tasks/{secret.pk}/", user=self.admin, title="Mine")
        self.assertEqual((response.status_code, response.data), (403, {"detail": NOT_EDITOR}))
        self.assertEqual(
            self.call("patch", f"tasks/{secret.pk}/", status="pending").status_code, 404
        )
        self.assertEqual(
            self.call("delete", f"tasks/{secret.pk}/", user=self.mona).status_code, 404
        )

    def test_a_reader_who_is_neither_cannot_tick(self):
        call = self.plan.tasks.get(title="Hold the call")
        Task.objects.filter(pk=call.pk).update(assignee=None, created_by=None)
        response = self.call("patch", f"tasks/{call.pk}/", user=self.admin, status="completed")
        self.assertEqual((response.status_code, response.data), (403, {"detail": NOT_CHECKER}))

    def test_ticking_on_a_finished_plan_changes_only_the_task(self):
        Plan.objects.filter(pk=self.plan.pk).update(status="cancelled")
        call = self.plan.tasks.get(title="Hold the call")
        self.assertEqual(
            self.call("patch", f"tasks/{call.pk}/", status="completed").status_code, 200
        )
        self.assertEqual(
            (self.fresh().status, Milestone.objects.get(pk=self.kickoff.pk).done_at),
            ("cancelled", None),
        )
        response = self.call("patch", f"tasks/{call.pk}/", title="x")
        self.assertEqual(response.data, {"non_field_errors": [say.PLAN_FINISHED]})

    def test_remove_a_task(self):
        call = self.plan.tasks.get(title="Hold the call")
        response = self.call("delete", f"tasks/{call.pk}/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["milestones"][0]["tasks"], [])
        self.assertEqual(
            self.events("plan.task_changed"),
            [(str(self.plan.pk), {"task": call.pk, "change": "removed"})],
        )
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.plans.tests.test_structure --noinput`
Expected: FAIL: every route answers 404.

- [ ] **Step 3: The serializers**

Add to `services/plans/serializers.py` (imports merged):

```python
from services.customers.models import Task

from .models import MAX_TASK_TITLE
from .validation import (
    CHOOSE_ASSIGNEE,
    CHOOSE_MILESTONE,
    CHOOSE_PRIORITY,
    CHOOSE_TASK_STATUS,
    DATE_RANGE,
    LONG_TITLE,
    NO_TITLE,
    YES_OR_NO,
    in_range,
)


class _PlanDates:
    """`due_date` from the plan's start to a year after it."""

    def validate_due_date(self, value):
        if not in_range(value, self.context["plan"].start_date):
            raise serializers.ValidationError(DATE_RANGE)
        return value


class MilestoneWriteSerializer(_PlanDates, serializers.Serializer):
    """POST `{name, due_date}`; PATCH any of `{name, due_date, done}`."""

    name = serializers.CharField(max_length=MAX_NAME, error_messages=NAME_ERRORS)
    due_date = serializers.DateField(error_messages=DATE_ERRORS)
    done = serializers.BooleanField(
        required=False, error_messages={"invalid": YES_OR_NO, "null": YES_OR_NO}
    )


class PlanTaskSerializer(_PlanDates, serializers.Serializer):
    """POST `{milestone, title, priority, due_date, assignee}`; PATCH any of
    those and `status`. `milestone` must be the plan's own, `assignee` an
    active teammate who can open the record."""

    milestone = serializers.IntegerField(
        error_messages={
            "required": CHOOSE_MILESTONE,
            "null": CHOOSE_MILESTONE,
            "invalid": CHOOSE_MILESTONE,
        }
    )
    title = serializers.CharField(
        max_length=MAX_TASK_TITLE,
        error_messages={
            "required": NO_TITLE,
            "blank": NO_TITLE,
            "null": NO_TITLE,
            "invalid": NO_TITLE,
            "max_length": LONG_TITLE,
        },
    )
    priority = serializers.ChoiceField(
        choices=Task.Priority.choices,
        error_messages={
            "required": CHOOSE_PRIORITY,
            "null": CHOOSE_PRIORITY,
            "invalid_choice": CHOOSE_PRIORITY,
        },
    )
    due_date = serializers.DateField(error_messages=DATE_ERRORS)
    assignee = serializers.IntegerField(
        error_messages={
            "required": CHOOSE_ASSIGNEE,
            "null": CHOOSE_ASSIGNEE,
            "invalid": CHOOSE_ASSIGNEE,
        }
    )
    status = serializers.ChoiceField(
        choices=Task.Status.choices,
        required=False,
        error_messages={"null": CHOOSE_TASK_STATUS, "invalid_choice": CHOOSE_TASK_STATUS},
    )

    def validate_milestone(self, value):
        milestone = self.context["plan"].milestones.filter(pk=value).first()
        if milestone is None:
            raise serializers.ValidationError(CHOOSE_MILESTONE)
        return milestone

    def validate(self, attrs):
        plan = self.context["plan"]
        if "assignee" in attrs:
            attrs["assignee"] = assignable(
                plan.organisation_id, attrs["assignee"], record_of(plan), "assignee"
            )
        return attrs
```

- [ ] **Step 4: The five views and their routes**

Add to `services/plans/views.py` (imports merged):

```python
from django.db.models import Max

from services.customers.personal import visible_tasks

from .access import NOT_CHECKER, NOT_EDITOR, can_edit
from .models import MAX_MILESTONES, MAX_TASKS, Milestone
from .notices import tell_assignees
from .serializers import MilestoneWriteSerializer, PlanTaskSerializer
from .starting import on_record
from .status import COMPLETED, advance, after_work, finish_if_done, refresh_target
from .validation import (
    CHOOSE_MILESTONE,
    LAST_MILESTONE,
    REORDER,
    TOO_MANY_MILESTONES,
    TOO_MANY_TASKS,
    integer,
)

#: The fields of a plan's task a PATCH may change; all but `status` are editors' only.
TASK_FIELDS = frozenset({"title", "priority", "due_date", "assignee", "milestone", "status"})


def _milestone_changed(request, plan, milestone_id, change, **extra):
    _audit(request, "plan.milestone_changed", plan, milestone=milestone_id, change=change, **extra)


def _task_changed(request, plan, task_id, change, **extra):
    _audit(request, "plan.task_changed", plan, task=task_id, change=change, **extra)


def _compact(plan):
    """Positions 0..n-1 in the current order, after a removal."""
    milestones = list(plan.milestones.order_by("position", "pk"))
    for position, milestone in enumerate(milestones):
        milestone.position = position
    Milestone.objects.bulk_update(milestones, ["position"])


class MilestoneCreateView(APIView):
    """POST /api/v1/plans/<id>/milestones/ `{name, due_date}`: a milestone at
    the end; 201 with the plan. Editors only, while the plan is open."""

    # SOC2:AUTH-02 authentication here; `_editable`/`_lock_for_edit` check the plan
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        plan = _editable(request.user, pk)
        serializer = MilestoneWriteSerializer(data=request.data, context={"plan": plan})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            plan = _lock_for_edit(request.user, plan.pk)
            if plan.milestones.count() >= MAX_MILESTONES:
                raise ValidationError({"non_field_errors": [TOO_MANY_MILESTONES]})
            last = plan.milestones.aggregate(last=Max("position"))["last"]
            milestone = Milestone.objects.create(
                plan=plan,
                name=data["name"],
                due_date=data["due_date"],
                position=0 if last is None else last + 1,
            )
            refresh_target(plan)
            _milestone_changed(request, plan, milestone.pk, "added")
        return _plan_response(request, plan, status.HTTP_201_CREATED)


class MilestoneDetailView(APIView):
    """PATCH /api/v1/plans/<id>/milestones/<mid>/ any of `{name, due_date,
    done}`; DELETE removes it with its tasks (never the last one). Both
    answer the plan. Editors only, while the plan is open."""

    # SOC2:AUTH-02 authentication here; `_editable`/`_lock_for_edit` check the plan
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk, mid):
        plan = _editable(request.user, pk)
        serializer = MilestoneWriteSerializer(
            data=request.data, partial=True, context={"plan": plan}
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        now, today = timezone.now(), timezone.localdate()
        with transaction.atomic():
            plan = _lock_for_edit(request.user, plan.pk)
            milestone = get_object_or_404(plan.milestones, pk=mid)
            fields = sorted(
                name
                for name in ("name", "due_date")
                if name in data and getattr(milestone, name) != data[name]
            )
            for name in fields:
                setattr(milestone, name, data[name])
            change = "edited"
            if data.get("done") is True and milestone.done_at is None:
                milestone.done_at, milestone.done_by = now, request.user
                fields, change = [*fields, "done_at", "done_by"], "done"
            elif data.get("done") is False and milestone.done_at is not None:
                milestone.done_at, milestone.done_by = None, None
                fields, change = [*fields, "done_at", "done_by"], "undone"
            if fields:
                milestone.save(update_fields=fields)
                if change == "edited":
                    _milestone_changed(request, plan, milestone.pk, change, fields=fields)
                else:
                    _milestone_changed(request, plan, milestone.pk, change)
            if "due_date" in fields:
                refresh_target(plan)
            if change == "done":
                advance(plan, now=now, today=today, request=request)
                finish_if_done(plan, now=now, today=today, request=request)
        return _plan_response(request, plan)

    def delete(self, request, pk, mid):
        plan = _editable(request.user, pk)
        now, today = timezone.now(), timezone.localdate()
        with transaction.atomic():
            plan = _lock_for_edit(request.user, plan.pk)
            milestone = get_object_or_404(plan.milestones, pk=mid)
            if plan.milestones.count() == 1:
                raise ValidationError({"non_field_errors": [LAST_MILESTONE]})
            _milestone_changed(request, plan, milestone.pk, "removed")
            milestone.delete()
            _compact(plan)
            refresh_target(plan)
            finish_if_done(plan, now=now, today=today, request=request)
        return _plan_response(request, plan)


class MilestoneReorderView(APIView):
    """POST /api/v1/plans/<id>/milestones/reorder/ `{order: [every milestone
    id, once]}`; answers the plan. Editors only, while the plan is open."""

    # SOC2:AUTH-02 authentication here; `_editable`/`_lock_for_edit` check the plan
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        plan = _editable(request.user, pk)
        order = request.data.get("order")
        with transaction.atomic():
            plan = _lock_for_edit(request.user, plan.pk)
            milestones = {milestone.pk: milestone for milestone in plan.milestones.all()}
            if (
                not isinstance(order, list)
                or not all(integer(pk) for pk in order)
                or len(order) != len(milestones)
                or set(order) != set(milestones)
            ):
                raise ValidationError({"order": [REORDER]})
            for position, milestone_id in enumerate(order):
                milestones[milestone_id].position = position
            Milestone.objects.bulk_update(list(milestones.values()), ["position"])
            _milestone_changed(request, plan, None, "reordered", order=order)
        return _plan_response(request, plan)


class PlanTaskCreateView(APIView):
    """POST /api/v1/plans/<id>/tasks/ `{milestone, title, priority, due_date,
    assignee}`: 201 with the plan. Created by the caller; its assignee is
    told unless that is the caller. Editors only, while the plan is open."""

    # SOC2:AUTH-02 authentication here; `_editable`/`_lock_for_edit` check the plan
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        plan = _editable(request.user, pk)
        serializer = PlanTaskSerializer(data=request.data, context={"plan": plan})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        now, today = timezone.now(), timezone.localdate()
        with transaction.atomic():
            plan = _lock_for_edit(request.user, plan.pk)
            if plan.tasks.count() >= MAX_TASKS:
                raise ValidationError({"non_field_errors": [TOO_MANY_TASKS]})
            milestone = plan.milestones.filter(pk=data["milestone"].pk).first()
            if milestone is None:
                raise ValidationError({"milestone": [CHOOSE_MILESTONE]})
            task = Task.objects.create(
                **on_record(record_of(plan)),
                plan=plan,
                milestone=milestone,
                title=data["title"],
                priority=data["priority"],
                due_date=data["due_date"],
                assignee=data["assignee"],
                assignee_name=data["assignee"].name[:150],
                created_by=request.user,
            )
            after_work(
                plan, [milestone.pk], progressed=False, now=now, today=today, request=request
            )
            _task_changed(request, plan, task.pk, "added")
            tell_assignees(plan, [task], actor=request.user)
        return _plan_response(request, plan, status.HTTP_201_CREATED)


class PlanTaskDetailView(APIView):
    """PATCH /api/v1/plans/<id>/tasks/<tid>/ any of `{title, priority,
    due_date, assignee, milestone, status}`; DELETE removes it. Both answer
    the plan. A task the caller cannot see is 404. `status` alone may come
    from the task's assignee, its creator or a plan editor, on any plan;
    everything else is for editors, while the plan is open."""

    # SOC2:AUTH-02 authentication here; the plan, the task and the writer are checked below
    permission_classes = [IsAuthenticated]

    def _task(self, user, plan, tid):
        # SOC2:AUTH-02 a plan's task is reached only by someone who may read it
        return get_object_or_404(visible_tasks(user, plan.tasks.all()), pk=tid)

    def patch(self, request, pk, tid):
        plan = get_visible_plan(request.user, pk)
        task = self._task(request.user, plan, tid)
        asked = set(request.data) & TASK_FIELDS
        editor = can_edit(request.user, plan)
        # SOC2:AUTH-02 editors change a task; its assignee and creator may only tick it
        if asked - {"status"} and not editor:
            raise PermissionDenied(NOT_EDITOR)
        if "status" in asked and not (
            editor or request.user.pk in (task.assignee_id, task.created_by_id)
        ):
            raise PermissionDenied(NOT_CHECKER)
        serializer = PlanTaskSerializer(data=request.data, partial=True, context={"plan": plan})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        now, today = timezone.now(), timezone.localdate()
        with transaction.atomic():
            plan = lock_plan(plan.pk)
            if asked - {"status"}:
                require_editor(request.user, plan)
                _require_open(plan)
            task = Task.objects.get(pk=task.pk)
            old_status, old_milestone = task.status, task.milestone_id
            changed = [
                name
                for name in ("title", "priority", "due_date", "status")
                if name in data and getattr(task, name) != data[name]
            ]
            for name in changed:
                setattr(task, name, data[name])
            if "assignee" in data and data["assignee"].pk != task.assignee_id:
                task.assignee = data["assignee"]
                task.assignee_name = data["assignee"].name[:150]
                changed.append("assignee")
            if "milestone" in data:
                milestone = plan.milestones.filter(pk=data["milestone"].pk).first()
                if milestone is None:
                    raise ValidationError({"milestone": [CHOOSE_MILESTONE]})
                if milestone.pk != task.milestone_id:
                    task.milestone = milestone
                    changed.append("milestone")
            if changed:
                extra = ["assignee_name"] if "assignee" in changed else []
                task.save(update_fields=[*changed, *extra])
                after_work(
                    plan,
                    [old_milestone, task.milestone_id],
                    progressed=task.status == COMPLETED and old_status != COMPLETED,
                    now=now,
                    today=today,
                    request=request,
                )
                _task_changed(request, plan, task.pk, "edited", fields=sorted(changed))
                if "assignee" in changed:
                    tell_assignees(plan, [task], actor=request.user)
        return _plan_response(request, plan)

    def delete(self, request, pk, tid):
        plan = _editable(request.user, pk)
        task = self._task(request.user, plan, tid)
        now, today = timezone.now(), timezone.localdate()
        with transaction.atomic():
            plan = _lock_for_edit(request.user, plan.pk)
            milestone_id = task.milestone_id
            _task_changed(request, plan, task.pk, "removed")
            Task.objects.filter(pk=task.pk).delete()
            after_work(
                plan, [milestone_id], progressed=False, now=now, today=today, request=request
            )
        return _plan_response(request, plan)
```

Also change the existing `from rest_framework.exceptions import ValidationError` to `from rest_framework.exceptions import PermissionDenied, ValidationError`, and add `record_of` to the `.access` import.

Replace `services/plans/urls.py` with:

```python
from django.urls import path

from . import views

urlpatterns = [
    path("", views.PlanListCreateView.as_view(), name="plan-list"),
    path("templates/", views.TemplateListCreateView.as_view(), name="plan-template-list"),
    path("templates/<int:pk>/", views.TemplateDetailView.as_view(), name="plan-template-detail"),
    path("<int:pk>/", views.PlanDetailView.as_view(), name="plan-detail"),
    path("<int:pk>/milestones/", views.MilestoneCreateView.as_view(), name="plan-milestones"),
    path(
        "<int:pk>/milestones/reorder/",
        views.MilestoneReorderView.as_view(),
        name="plan-milestones-reorder",
    ),
    path(
        "<int:pk>/milestones/<int:mid>/",
        views.MilestoneDetailView.as_view(),
        name="plan-milestone-detail",
    ),
    path("<int:pk>/tasks/", views.PlanTaskCreateView.as_view(), name="plan-tasks"),
    path("<int:pk>/tasks/<int:tid>/", views.PlanTaskDetailView.as_view(), name="plan-task-detail"),
]
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.plans --noinput`
Expected: PASS.

- [ ] **Step 6: Check and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/plans
git commit -m "feat(plans): milestones and tasks: add, edit, tick, reorder, remove, by editors

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Save a plan as a template

Spec §1.4/§4 (`POST plans/:id/save-as-template/`). Contract note 16. Decision 7.

**Files:**
- Modify:
  - `services/plans/copying.py` (`template_steps`)
  - `services/plans/views.py` (`SaveAsTemplateView`)
  - `services/plans/urls.py`
- Test: `services/plans/tests/test_save_as_template.py`

**Interfaces:**
- Consumes: Tasks 1–8 (`TemplateWriteSerializer`, `_template_limit_reached`, `_template_response`, `_audit`, `_audit_shared`, `_editable`; `access.record_of`).
- Produces: `copying.template_steps(plan, viewer) -> list` (template milestone JSON); `views.SaveAsTemplateView`; URL name `plan-save-as-template`.

- [ ] **Step 1: Write the failing tests**

Create `services/plans/tests/test_save_as_template.py`:

```python
"""Save as template: a plan's editors turn its milestones and the tasks they
can see into a personal template, offsets from the start date, assignees as
roles; the 50-template limit and sharing apply as for any template."""

from services.plans import validation as say
from services.plans.access import NOT_EDITOR
from services.plans.models import PlanTemplate
from services.plans.tests.fixtures import PlanFixture

URL = "/api/v1/plans/"


class SaveAsTemplateTests(PlanFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.plan = cls.build_plan(
            owner=cls.mona,
            kind="save",
            steps=[
                (
                    "Diagnose",
                    3,
                    [
                        ("Call the champion", cls.csm, "completed"),
                        ("Write it up", cls.mona, "pending"),
                    ],
                ),
                ("Confirm", 500, [("Secret", cls.admin, "pending", cls.admin)]),
            ],
        )

    def save(self, user=None, **body):
        return self.api(user or self.mona).post(
            f"{URL}{self.plan.pk}/save-as-template/", body, format="json"
        )

    def test_the_plan_becomes_a_template(self):
        response = self.save(name="Our save")
        self.assertEqual(response.status_code, 201, response.content)
        data = response.data
        self.assertEqual(
            (data["name"], data["kind"], data["description"], data["sharing"], data["is_owner"]),
            ("Our save", "save", "", "private", True),
        )
        self.assertEqual(
            data["milestones"],
            [
                {
                    "name": "Diagnose",
                    "offset_days": 3,
                    "tasks": [
                        {
                            "title": "Call the champion",
                            "priority": "medium",
                            "offset_days": 3,
                            "assignee_role": "record_owner",
                        },
                        {
                            "title": "Write it up",
                            "priority": "medium",
                            "offset_days": 3,
                            "assignee_role": "plan_owner",
                        },
                    ],
                },
                {"name": "Confirm", "offset_days": 365, "tasks": []},
            ],
        )
        template = PlanTemplate.objects.get(pk=data["id"])
        self.assertEqual((template.owner, template.organisation), (self.mona, self.org))
        self.assertEqual(
            self.events("plan_template.created"),
            [
                (
                    str(template.pk),
                    {"kind": "save", "milestones": 2, "tasks": 2, "plan": self.plan.pk},
                )
            ],
        )

    def test_shared_like_any_template(self):
        data = self.save(name="Team save", sharing="workspace").data
        self.assertEqual(data["sharing"], "workspace")
        self.assertEqual(
            self.events("plan_template.shared"),
            [(str(data["id"]), {"sharing": "workspace", "shared_with": []})],
        )

    def test_editors_only(self):
        response = self.save(user=self.admin, name="x")
        self.assertEqual((response.status_code, response.data), (403, {"detail": NOT_EDITOR}))
        self.assertEqual(self.save(user=self.other, name="x").status_code, 404)
        self.assertEqual(self.save(user=self.csm, name="x").status_code, 403)

    def test_a_name_is_needed(self):
        response = self.save()
        self.assertEqual((response.status_code, response.data), (400, {"name": [say.CHOOSE_NAME]}))

    def test_the_owners_limit_applies(self):
        PlanTemplate.objects.bulk_create(
            [
                PlanTemplate(
                    organisation=self.org,
                    owner=self.mona,
                    name=f"T{i}",
                    kind="other",
                    milestones=[],
                )
                for i in range(50)
            ]
        )
        response = self.save(name="One too many")
        self.assertEqual(
            (response.status_code, response.data), (400, {"non_field_errors": [say.TEMPLATE_LIMIT]})
        )
```

The plan's owner is Mona and the record's owner is Carl, so Carl's task becomes `record_owner` and Mona's `plan_owner`. Alice's "Secret" is hidden from Mona and is left out; "Confirm" is due 500 days after the start, clamped to 365. Carl is below Mona, not above, so he does not edit Mona's plan (403).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.plans.tests.test_save_as_template --noinput`
Expected: FAIL: 404 (no route).

- [ ] **Step 3: Write `template_steps` and the view**

Add to `services/plans/copying.py`:

```python
from collections import defaultdict

from services.customers.personal import visible_tasks

from .access import record_of
from .models import MAX_OFFSET

RECORD_OWNER, PLAN_OWNER = "record_owner", "plan_owner"


def template_steps(plan, viewer):
    """The plan read back as a template's milestones: every milestone in
    order, with the tasks `viewer` may read. Offsets are days from the
    plan's start, clamped to 0-365. A task assigned to the record's owner is
    `record_owner`; every other is `plan_owner`. Needs `customer`/`account`
    loaded."""
    record_owner_id = record_of(plan).owner_id

    def offset(day):
        return min(max((day - plan.start_date).days, 0), MAX_OFFSET)

    tasks = defaultdict(list)
    # SOC2:AUTH-02 only tasks the caller may read become a template's steps
    for task in visible_tasks(viewer, plan.tasks.all()).order_by("due_date", "pk"):
        tasks[task.milestone_id].append(task)
    return [
        {
            "name": milestone.name,
            "offset_days": offset(milestone.due_date),
            "tasks": [
                {
                    "title": task.title,
                    "priority": task.priority,
                    "offset_days": offset(task.due_date),
                    "assignee_role": RECORD_OWNER
                    if task.assignee_id is not None and task.assignee_id == record_owner_id
                    else PLAN_OWNER,
                }
                for task in tasks[milestone.pk]
            ],
        }
        for milestone in plan.milestones.order_by("position", "pk")
    ]
```

Add to `services/plans/views.py` (imports merged: `from .copying import template_steps`):

```python
class SaveAsTemplateView(APIView):
    """POST /api/v1/plans/<id>/save-as-template/ `{name, sharing?,
    shared_with?}`: the plan's milestones and the tasks the caller can see,
    as a new personal template of the plan's kind; 201 with the template.
    For the plan's editors; the 50-template limit applies."""

    # SOC2:AUTH-02 authentication here; `_editable` checks the plan, `template_steps` each task
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        plan = _editable(request.user, pk)
        body = {
            key: request.data[key]
            for key in ("name", "sharing", "shared_with")
            if key in request.data
        }
        body.update(kind=plan.kind, description="", milestones=template_steps(plan, request.user))
        serializer = TemplateWriteSerializer(data=body, context={"request": request})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            if _template_limit_reached(request.user):
                raise ValidationError({"non_field_errors": [TEMPLATE_LIMIT]})
            template = serializer.save(
                owner=request.user, organisation_id=request.user.organisation_id
            )
            _audit(
                request,
                "plan_template.created",
                template,
                kind=template.kind,
                milestones=len(template.milestones),
                tasks=task_count(template.milestones),
                plan=plan.pk,
            )
            if template.sharing != Sharing.PRIVATE:
                _audit_shared(request, template)
        return _template_response(request, template.pk, status.HTTP_201_CREATED)
```

Replace `services/plans/urls.py` with:

```python
from django.urls import path

from . import views

urlpatterns = [
    path("", views.PlanListCreateView.as_view(), name="plan-list"),
    path("templates/", views.TemplateListCreateView.as_view(), name="plan-template-list"),
    path("templates/<int:pk>/", views.TemplateDetailView.as_view(), name="plan-template-detail"),
    path("<int:pk>/", views.PlanDetailView.as_view(), name="plan-detail"),
    path(
        "<int:pk>/save-as-template/",
        views.SaveAsTemplateView.as_view(),
        name="plan-save-as-template",
    ),
    path("<int:pk>/milestones/", views.MilestoneCreateView.as_view(), name="plan-milestones"),
    path(
        "<int:pk>/milestones/reorder/",
        views.MilestoneReorderView.as_view(),
        name="plan-milestones-reorder",
    ),
    path(
        "<int:pk>/milestones/<int:mid>/",
        views.MilestoneDetailView.as_view(),
        name="plan-milestone-detail",
    ),
    path("<int:pk>/tasks/", views.PlanTaskCreateView.as_view(), name="plan-tasks"),
    path("<int:pk>/tasks/<int:tid>/", views.PlanTaskDetailView.as_view(), name="plan-task-detail"),
]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.plans --noinput`
Expected: PASS.

- [ ] **Step 5: Check and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/plans
git commit -m "feat(plans): save a plan as a template, from the tasks the caller can see

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The nightly step

Spec §1.2 (at risk, done), §1.5. Decision 14.

**Files:**
- Create: `services/plans/nightly.py`
- Modify: `services/customers/management/commands/run_health_maintenance.py`
- Test: `services/plans/tests/test_nightly.py`

**Interfaces:**
- Consumes: `status.lock_plan`, `status.set_status`, `status.finish_if_done` (Task 6).
- Produces: `nightly.PlansResult` (`at_risk`, `done`, `failed`), `nightly.NOT_AT_RISK`, `nightly.late_plans(scope, today) -> QuerySet`, `nightly.finished_plans(scope) -> QuerySet`, `nightly.refresh_plans(organisation=None, *, today=None, now=None) -> PlansResult`. The command prints `refreshed plans: N at risk, N done, N failed`, or `plans skipped: <ExceptionClass>`.

- [ ] **Step 1: Write the failing tests**

Create `services/plans/tests/test_nightly.py`:

```python
"""The nightly step: an open plan with an overdue milestone becomes at risk
(by the system), unless a person cleared it and nothing has fallen due
since; a plan whose milestones are all done becomes done. Per plan, safe to
run twice, after the segments and before the rules."""

from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command

from core.models import AuditEvent
from services.metrics import recording
from services.plans import nightly
from services.plans.models import Plan
from services.plans.nightly import PlansResult, refresh_plans
from services.plans.tests.fixtures import PlanFixture
from services.rules import nightly as rules_nightly
from services.rules.nightly import RulesResult
from services.segments import nightly as segments_nightly


class NightFixture(PlanFixture):
    def night(self, days=0, organisation=None):
        return refresh_plans(organisation, today=self.today + timedelta(days=days), now=self.now)

    def status(self, plan):
        return Plan.objects.values_list("status", "status_set_by").get(pk=plan.pk)


class AtRiskTests(NightFixture):
    def test_an_overdue_milestone_puts_the_plan_at_risk(self):
        plan = self.build_plan()
        self.assertEqual(self.night(days=7), PlansResult())
        result = self.night(days=8)
        self.assertEqual(result, PlansResult(at_risk=1))
        self.assertEqual(self.status(plan), ("at_risk", "system"))
        event = AuditEvent.objects.get(action="plan.status_changed")
        self.assertEqual(
            (event.actor, event.metadata),
            (None, {"old": "not_started", "new": "at_risk", "by": "system"}),
        )

    def test_a_done_milestone_is_never_late(self):
        plan = self.build_plan()
        plan.milestones.filter(name="Kick-off").update(done_at=self.now)
        self.assertEqual(self.night(days=8), PlansResult())

    def test_a_cleared_plan_waits_for_a_milestone_due_since(self):
        plan = self.build_plan(status="on_track")
        Plan.objects.filter(pk=plan.pk).update(at_risk_cleared_on=self.today + timedelta(days=9))
        self.assertEqual(self.night(days=10), PlansResult())
        self.assertEqual(self.night(days=15), PlansResult(at_risk=1))

    def test_finished_and_at_risk_plans_are_left_alone(self):
        for status in ("done", "cancelled", "at_risk"):
            self.build_plan(status=status)
        self.assertEqual(self.night(days=30), PlansResult())

    def test_twice_in_one_night_is_safe(self):
        self.build_plan()
        self.assertEqual(self.night(days=8), PlansResult(at_risk=1))
        self.assertEqual(self.night(days=8), PlansResult())
        self.assertEqual(AuditEvent.objects.filter(action="plan.status_changed").count(), 1)


class DoneTests(NightFixture):
    def test_every_milestone_done_finishes_the_plan(self):
        plan = self.build_plan(status="on_track")
        plan.milestones.update(done_at=self.now, done_by=self.csm)
        self.assertEqual(self.night(), PlansResult(done=1))
        self.assertEqual(self.status(plan), ("done", "system"))
        self.assertIsNotNone(Plan.objects.get(pk=plan.pk).done_at)


class IsolationTests(NightFixture):
    def test_one_plans_failure_never_stops_the_rest(self):
        first, second = self.build_plan(), self.build_plan(self.emea)
        real = nightly.set_status

        def flaky(plan, *args, **kwargs):
            if plan.pk == first.pk:
                raise RuntimeError("Pizza Hut boom")
            return real(plan, *args, **kwargs)

        with (
            patch.object(nightly, "set_status", side_effect=flaky),
            self.assertLogs("services.plans.nightly", "ERROR") as logs,
        ):
            result = self.night(days=8)
        self.assertEqual(result, PlansResult(at_risk=1, failed=1))
        self.assertEqual(
            (self.status(first)[0], self.status(second)[0]), ("not_started", "at_risk")
        )
        self.assertNotIn("boom", "\n".join(logs.output))
        self.assertIn("RuntimeError", "\n".join(logs.output))

    def test_one_workspace_at_a_time(self):
        self.build_plan()
        self.assertEqual(self.night(days=8, organisation=self.other_org), PlansResult())
        self.assertEqual(self.night(days=8, organisation=self.org), PlansResult(at_risk=1))


class MaintenanceStepTests(NightFixture):
    def run_job(self, *args):
        out = StringIO()
        call_command("run_health_maintenance", *args, org_email="alice@acme.io", stdout=out)
        return out.getvalue()

    def test_plans_run_after_segments_and_before_rules(self):
        calls = []

        def step(name, value):
            return lambda *args, **kwargs: calls.append(name) or value

        with (
            patch.object(
                segments_nightly,
                "evaluate_nightly",
                side_effect=step("segments", segments_nightly.NightlyResult()),
            ),
            patch.object(
                nightly, "refresh_plans", side_effect=step("plans", PlansResult(at_risk=2))
            ) as plans,
            patch.object(rules_nightly, "evaluate_rules", side_effect=step("rules", RulesResult())),
            patch.object(recording, "record_period_end", side_effect=step("metrics", (0, 0))),
        ):
            output = self.run_job()
        self.assertEqual(calls, ["segments", "plans", "rules", "metrics"])
        self.assertEqual(plans.call_args.args, (self.org,))
        self.assertIn("refreshed plans: 2 at risk, 0 done, 0 failed", output)

    def test_a_dry_run_skips_it(self):
        with patch.object(nightly, "refresh_plans") as plans:
            self.run_job("--dry-run")
        plans.assert_not_called()

    def test_a_failure_is_reported_by_class_and_the_job_goes_on(self):
        with patch.object(nightly, "refresh_plans", side_effect=RuntimeError("Pizza Hut")):
            output = self.run_job()
        self.assertIn("plans skipped: RuntimeError", output)
        self.assertNotIn("Pizza Hut", output)
        self.assertIn("metric snapshot(s)", output)
```

The default plan's Kick-off is due on day 7 and its Review on day 14: on day 7 nothing is late yet, on day 8 Kick-off is. In the cleared test, at-risk was cleared on day 9, so Kick-off (due day 7) no longer counts on day 10, and Review (due day 14, on or after day 9) makes it late again on day 15.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.plans.tests.test_nightly --noinput`
Expected: ERROR, `ImportError: cannot import name 'nightly' from 'services.plans'`.

- [ ] **Step 3: Write the step**

`services/plans/nightly.py`:

```python
"""The plans' nightly step (spec §1.5).

`run_health_maintenance` calls `refresh_plans` after the segments and before
the rules, so a rule that fires tonight sees tonight's plan status. In one
workspace or all of them, each plan in its own savepoint under its row lock:

1. an open plan not yet at risk, with a milestone past its due date and not
   done, becomes `at_risk` (by the system). Once a person has cleared
   at-risk, only a milestone due on or after `at_risk_cleared_on` counts;
2. an open plan whose milestones are all done becomes `done`.

Running it twice in one day is safe: a plan only moves from one state to
another, and the second run finds nothing to move. Log lines carry ids and
exception class names only.
"""

import logging
from dataclasses import dataclass

from django.db import transaction
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from .models import OPEN, Milestone, Plan
from .status import finish_if_done, lock_plan, set_status

logger = logging.getLogger(__name__)

#: The statuses the step may move to at risk.
NOT_AT_RISK = (Plan.Status.NOT_STARTED, Plan.Status.ON_TRACK)


@dataclass
class PlansResult:
    at_risk: int = 0
    done: int = 0
    failed: int = 0


def late_plans(scope, today):
    """Plans in `scope` that tonight's step moves to at risk."""
    late = Milestone.objects.filter(
        plan_id=OuterRef("pk"), done_at__isnull=True, due_date__lt=today
    )
    since = late.filter(due_date__gte=OuterRef("at_risk_cleared_on"))
    never_cleared = Plan.objects.filter(at_risk_cleared_on__isnull=True).filter(Exists(late))
    cleared = Plan.objects.filter(at_risk_cleared_on__isnull=False).filter(Exists(since))
    return scope.filter(status__in=NOT_AT_RISK).filter(
        Q(pk__in=never_cleared.values("pk")) | Q(pk__in=cleared.values("pk"))
    )


def finished_plans(scope):
    """Open plans in `scope` whose milestones are all done."""
    milestones = Milestone.objects.filter(plan_id=OuterRef("pk"))
    return (
        scope.filter(status__in=OPEN)
        .filter(Exists(milestones))
        .filter(~Exists(milestones.filter(done_at__isnull=True)))
    )


def _still_late(plan, today):
    if plan.status not in NOT_AT_RISK:
        return False
    late = plan.milestones.filter(done_at__isnull=True, due_date__lt=today)
    if plan.at_risk_cleared_on is not None:
        late = late.filter(due_date__gte=plan.at_risk_cleared_on)
    return late.exists()


def _each(ids, step, result, field):
    """`step(plan)` for each plan under its row lock, each in its own
    savepoint; one plan's failure is logged by id and counted, and the rest
    go on."""
    for pk in ids:
        try:
            with transaction.atomic():
                moved = step(lock_plan(pk))
        except Exception as exc:  # noqa: BLE001 - one plan's failure never stops the rest
            logger.error("Plan %s: nightly refresh failed: %s", pk, type(exc).__name__)
            result.failed += 1
            continue
        if moved:
            setattr(result, field, getattr(result, field) + 1)


def refresh_plans(organisation=None, *, today=None, now=None):
    """Tonight's moves in one workspace, or all of them."""
    today = today or timezone.localdate()
    now = now or timezone.now()
    scope = (
        Plan.objects.all()
        if organisation is None
        else Plan.objects.filter(organisation=organisation)
    )
    result = PlansResult()

    def to_at_risk(plan):
        return _still_late(plan, today) and set_status(
            plan, Plan.Status.AT_RISK, by=Plan.SetBy.SYSTEM, now=now, today=today
        )

    def to_done(plan):
        return finish_if_done(plan, now=now, today=today)

    late = list(late_plans(scope, today).order_by("pk").values_list("pk", flat=True))
    _each(late, to_at_risk, result, "at_risk")
    done = list(finished_plans(scope).order_by("pk").values_list("pk", flat=True))
    _each(done, to_done, result, "done")
    return result
```

In `services/customers/management/commands/run_health_maintenance.py`, insert this block between the segments step and the rules step (directly above the `# Rules: "when → then" …` comment):

```python
        # Plans: at risk when a milestone is overdue, done when every
        # milestone is, before the rules so a rule sees tonight's plan
        # status. A plan only ever moves forward, so a re-run is a no-op
        # (services.plans.nightly).
        if not options["dry_run"]:
            from services.plans import nightly as plans_nightly

            try:
                night = plans_nightly.refresh_plans(organisation)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"refreshed plans: {night.at_risk} at risk, {night.done} done, "
                        f"{night.failed} failed"
                    )
                )
            except Exception as exc:  # noqa: BLE001 - reported, never fatal
                # the class name only: an exception's text can quote a row's values
                self.stdout.write(self.style.WARNING(f"plans skipped: {type(exc).__name__}"))
```

(The module is imported and its function looked up at call time, so the tests' `patch.object(nightly, "refresh_plans", …)` reaches it.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.plans.tests.test_nightly services.rules.tests.test_nightly --noinput`
Expected: PASS, the rules' own maintenance tests included (they patch segments, rules and metrics; the plans step runs for real over no plans).

- [ ] **Step 5: Check and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/plans services/customers/management/commands/run_health_maintenance.py
git commit -m "feat(plans): nightly: at risk when a milestone is overdue, done when all are

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Rules: the "Start a plan" action

Spec §1.8, §4 "Rules additions". Contract notes 1 and 2. Decisions 8, 12 and 13.

**Files:**
- Create:
  - `services/rules/migrations/0003_template_gone.py` (generated)
- Modify:
  - `services/rules/models.py` (`Rule.Paused.TEMPLATE_GONE`)
  - `services/rules/validation.py` (`_plan`, `CLEANERS`)
  - `services/rules/serializers.py` (turning a rule on re-checks its actions)
  - `services/rules/actions.py` (`start_plan_action`, `INTERNAL`)
  - `services/rules/nightly.py` (`pause_reason`, the workspace lock in `run_rule`)
  - `services/rules/payloads.py` (`template_names`, `action_refs`, `_row`, `parent_keys`, `plan_preview`)
  - `services/rules/views.py` (`RuleTestView`)
- Test: `services/rules/tests/test_plan_action.py`

**Interfaces:**
- Consumes: `plans.access.readable_templates`; `plans.starting.start_plan`, `PlanOpen`, `owner_for`; `plans.models.Plan`, `PlanTemplate`, `OPEN`; `plans.tests.fixtures.PlanFixture` (Tasks 1–5).
- Produces:
  - `Rule.Paused.TEMPLATE_GONE = "template_gone"` ("Its plan template was deleted.");
  - `rules.validation.CHOOSE_PLAN_TEMPLATE = "Choose a template you can use."`; `CLEANERS["plan"]` normalises to `{"action": "plan", "template": <id>}`;
  - `rules.actions.STARTED = "started"`, `ALREADY_HAD_ONE = "already had one"`, `TEMPLATE_UNUSABLE = "its template can't be used"`, `start_plan_action(action, rule, record, kind, *, today, made)`, `INTERNAL["plan"]`;
  - `rules.payloads.template_names(rules) -> dict`, `action_refs(actions, names) -> list`, `parent_keys(kind, ids) -> set`, `plan_preview(rule, selection) -> dict | None`;
  - a rule's payload shows a `plan` action as `{"action": "plan", "template": {"id", "name"} | None}`; `POST rules/test/` adds `plans: {would_start, already_open}` when the rule has a `plan` action.

- [ ] **Step 1: Write the failing tests**

Create `services/rules/tests/test_plan_action.py`:

```python
"""The fifth rule action, "Start a plan" (plans spec §1.8): what it may say,
how the rule reads it back, the night (started, already had one, one per
parent, who owns it, a template since unshared), the pause when its
template is deleted, the lock order, and the builder's dry run."""

from datetime import timedelta

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.exceptions import ValidationError

from services.accounts.models import User
from services.customers.models import Customer, Task
from services.plans.models import Plan, PlanTemplate
from services.plans.tests.fixtures import PlanFixture
from services.rules import validation as say
from services.rules.models import Rule, RuleRunRecord
from services.rules.nightly import evaluate_rules
from services.rules.tests.fixtures import LIFECYCLE, NOTIFY_ME, TASK
from services.surveys.tests.fixtures import contact

RULES = "/api/v1/rules/"


class PlanActionFixture(PlanFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.onboarding = cls.builtin["onboarding"]

    def plan_action(self, template=None):
        return {"action": "plan", "template": (template or self.onboarding).pk}

    def night(self, days=0):
        return evaluate_rules(today=self.today + timedelta(days=days), now=self.now)

    def records(self, rule):
        rows = RuleRunRecord.objects.filter(run__rule=rule).order_by("record_id")
        return [(row.record_id, row.outcome, row.reason, row.actions) for row in rows]


class PlanValidationTests(PlanActionFixture):
    def refused(self, actions, kind="customer"):
        with self.assertRaises(ValidationError) as caught:
            say.clean_actions(actions, kind, self.csm)
        return caught.exception.detail

    def test_a_plan_action_is_normalised(self):
        cleaned = say.clean_actions(
            [{"action": "plan", "template": self.onboarding.pk, "x": 1}], "customer", self.csm
        )
        self.assertEqual(cleaned, [{"action": "plan", "template": self.onboarding.pk}])

    def test_the_template_may_be_sent_back_as_it_was_read(self):
        sent = [{"action": "plan", "template": {"id": self.mine.pk, "name": "Carl's kick-off"}}]
        self.assertEqual(
            say.clean_actions(sent, "contact", self.csm),
            [{"action": "plan", "template": self.mine.pk}],
        )

    def test_a_template_the_owner_cannot_read_is_refused(self):
        danas = self.make_template(owner=self.other, name="Dana's")
        for template in (danas.pk, None, "x", 999999, True):
            self.assertEqual(
                self.refused([{"action": "plan", "template": template}]),
                {"actions": [{"template": [say.CHOOSE_PLAN_TEMPLATE]}]},
                template,
            )

    def test_still_one_to_three_actions_each_once(self):
        self.assertEqual(
            self.refused([NOTIFY_ME, TASK, LIFECYCLE, self.plan_action()]),
            {"actions": [say.ACTION_COUNT]},
        )
        self.assertEqual(
            self.refused([self.plan_action(), self.plan_action()]),
            {"actions": [{}, {"action": [say.ONE_OF_EACH]}]},
        )


class PlanPayloadTests(PlanActionFixture):
    def test_the_rule_reads_its_template_by_name(self):
        body = {
            "name": "Onboard",
            "segment": self.book.pk,
            "trigger": "entered",
            "actions": [self.plan_action()],
        }
        response = self.api(self.csm).post(RULES, body, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(
            response.data["actions"],
            [{"action": "plan", "template": {"id": self.onboarding.pk, "name": "Onboarding"}}],
        )

    def test_a_deleted_template_reads_as_none_and_the_rule_cannot_be_turned_on(self):
        template = self.make_template(name="Gone soon")
        rule = self.make_rule(actions=[self.plan_action(template)], is_active=False)
        template.delete()
        data = self.api(self.csm).get(f"{RULES}{rule.pk}/").data
        self.assertEqual(data["actions"], [{"action": "plan", "template": None}])
        response = self.api(self.csm).patch(
            f"{RULES}{rule.pk}/", {"is_active": True}, format="json"
        )
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"actions": [{"template": [say.CHOOSE_PLAN_TEMPLATE]}]}),
        )

    def test_the_list_reads_in_a_fixed_number_of_queries(self):
        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.api(self.csm).get(RULES)
            return len(ctx.captured_queries)

        self.make_rule(name="A", actions=[self.plan_action()])
        one = count()
        self.make_rule(name="B", actions=[self.plan_action(self.mine)])
        self.make_rule(name="C", actions=[self.plan_action(self.builtin["qbr"])])
        self.assertEqual(count(), one)


class PlanNightTests(PlanActionFixture):
    def test_an_entered_record_gets_a_plan_owned_by_its_owner(self):
        rule = self.make_rule(actions=[TASK, self.plan_action()])
        self.changed(self.book, [self.pizza])
        result = self.night()
        self.assertEqual((result.ran, result.fired, result.failed), (1, 1, 0))
        plan = Plan.objects.get()
        self.assertEqual(
            (plan.customer, plan.owner, plan.started_by, plan.started_by_rule, plan.template),
            (self.pizza, self.csm, None, rule, self.onboarding),
        )
        self.assertEqual(
            self.records(rule),
            [
                (
                    self.pizza.pk,
                    "fired",
                    "",
                    [
                        {"action": "task", "status": "done", "detail": ""},
                        {"action": "plan", "status": "done", "detail": "started"},
                    ],
                )
            ],
        )
        self.assertEqual(Task.objects.filter(plan=plan).count(), 7)
        self.assertEqual(Task.objects.filter(plan__isnull=True, customer=self.pizza).count(), 1)
        self.assertEqual(
            self.notes("plan_started"),
            [
                (
                    self.csm.pk,
                    "Renewal watch started the plan Onboarding · Pizza Hut for you.",
                    f"/projects/{plan.pk}",
                )
            ],
        )

    def test_a_record_with_an_open_plan_is_unchanged_and_still_fires(self):
        self.build_plan(template=self.onboarding)
        rule = self.make_rule(actions=[self.plan_action()])
        self.changed(self.book, [self.pizza])
        self.night()
        self.assertEqual(
            self.records(rule),
            [
                (
                    self.pizza.pk,
                    "fired",
                    "",
                    [{"action": "plan", "status": "unchanged", "detail": "already had one"}],
                )
            ],
        )
        self.assertEqual(Plan.objects.count(), 1)

    def test_contacts_put_one_plan_on_their_organisation(self):
        amy = contact(self.pizza, "Amy")
        champions = self.pinned("contact", [self.ann, amy], name="Champions")
        rule = self.make_rule(segment=champions, actions=[self.plan_action()])
        self.changed(champions, [self.ann, amy])
        self.night()
        self.assertEqual(Plan.objects.filter(customer=self.pizza).count(), 1)
        started = [{"action": "plan", "status": "done", "detail": "started"}]
        self.assertEqual(
            self.records(rule),
            sorted([(self.ann.pk, "fired", "", started), (amy.pk, "fired", "", started)]),
        )

    def test_the_record_owner_owns_it_when_they_can(self):
        Customer.objects.filter(pk=self.pizza.pk).update(owner=self.mona)
        self.make_rule(actions=[self.plan_action()])
        self.changed(self.book, [self.pizza])
        self.night()
        self.assertEqual(Plan.objects.get().owner, self.mona)

    def test_an_inactive_record_owner_hands_it_to_the_rules_owner(self):
        Customer.objects.filter(pk=self.pizza.pk).update(owner=self.mona)
        User.objects.filter(pk=self.mona.pk).update(is_active=False)
        self.make_rule(actions=[self.plan_action()])
        self.changed(self.book, [self.pizza])
        self.night()
        self.assertEqual(Plan.objects.get().owner, self.csm)

    def test_a_template_no_longer_readable_fails_the_action(self):
        danas = self.make_template(owner=self.other, name="Dana's", sharing="workspace")
        rule = self.make_rule(actions=[self.plan_action(danas)])
        PlanTemplate.objects.filter(pk=danas.pk).update(sharing="private")
        self.changed(self.book, [self.pizza])
        self.night()
        self.assertEqual(
            self.records(rule),
            [
                (
                    self.pizza.pk,
                    "skipped",
                    "failed",
                    [
                        {
                            "action": "plan",
                            "status": "failed",
                            "detail": "its template can't be used",
                        }
                    ],
                )
            ],
        )
        self.assertFalse(Plan.objects.exists())

    def test_a_deleted_template_pauses_the_rule(self):
        template = self.make_template(name="Gone")
        rule = self.make_rule(actions=[self.plan_action(template)])
        template.delete()
        result = self.night()
        rule.refresh_from_db()
        self.assertEqual(
            (result.paused, rule.is_active, rule.paused_reason), (1, False, "template_gone")
        )
        self.assertEqual(Rule.Paused(rule.paused_reason).label, "Its plan template was deleted.")
        self.assertEqual(
            [message for _, message, _ in self.notes("rule_fired")],
            ["Renewal watch was switched off: Its plan template was deleted."],
        )

    def test_the_workspace_is_locked_before_any_record(self):
        self.make_rule(actions=[LIFECYCLE, self.plan_action()])
        self.changed(self.book, [self.pizza])
        with CaptureQueriesContext(connection) as ctx:
            self.night()
        locks = [q["sql"] for q in ctx.captured_queries if "FOR NO KEY UPDATE" in q["sql"]]
        workspace = next(i for i, sql in enumerate(locks) if 'FROM "accounts_organisation"' in sql)
        record = next(i for i, sql in enumerate(locks) if 'FROM "customers_customer"' in sql)
        self.assertLess(workspace, record)
        self.assertEqual(Plan.objects.count(), 1)


class PlanDryRunTests(PlanActionFixture):
    def body(self, actions):
        return {
            "segment": self.book.pk,
            "trigger": "schedule",
            "cadence": "weekly",
            "weekday": self.today.weekday(),
            "actions": actions,
        }

    def test_would_start_and_already_open(self):
        self.build_plan(template=self.onboarding)
        response = self.api(self.csm).post(
            f"{RULES}test/", self.body([self.plan_action()]), format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["plans"], {"would_start": 1, "already_open": 1})
        self.assertEqual(Plan.objects.count(), 1)

    def test_no_plan_action_no_plans(self):
        response = self.api(self.csm).post(f"{RULES}test/", self.body([NOTIFY_ME]), format="json")
        self.assertNotIn("plans", response.data)
```

`book` pins Pizza Hut and Dough Co, so a weekly rule due today reaches both: Pizza Hut already has an open Onboarding plan, Dough Co would get one.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.rules.tests.test_plan_action --noinput`
Expected: FAIL: `AttributeError: module 'services.rules.validation' has no attribute 'CHOOSE_PLAN_TEMPLATE'`, and the API answers 400 "Choose an action." for a `plan` action.

- [ ] **Step 3: The paused reason and the validation**

In `services/rules/models.py`, add to `Rule.Paused` after `OWNER_INACTIVE`:

```python
        TEMPLATE_GONE = "template_gone", "Its plan template was deleted."
```

Run: `venv/bin/python manage.py makemigrations rules --name template_gone`
Expected: `services/rules/migrations/0003_template_gone.py` with one `AlterField` on `paused_reason`.

In `services/rules/validation.py`, add the import `from services.plans.access import readable_templates`, the message beside the others:

```python
CHOOSE_PLAN_TEMPLATE = "Choose a template you can use."
```

this cleaner before `CLEANERS`:

```python
def _plan(item, kind, owner):
    """`{"action": "plan", "template": <id>}`. The template may be sent as an
    id or as the `{id, name}` the rule's payload shows."""
    template = item.get("template")
    if isinstance(template, dict):
        template = template.get("id")
    # SOC2:AUTH-02 a rule starts plans only from templates its owner may read
    if not _integer(template) or not readable_templates(owner).filter(pk=template).exists():
        raise ValidationError({"template": [CHOOSE_PLAN_TEMPLATE]})
    return {"action": "plan", "template": template}
```

and `"plan": _plan` to `CLEANERS`.

In `services/rules/serializers.py`, `RuleWriteSerializer.validate`, replace:

```python
        if creating or "actions" in attrs or "segment" in attrs:
            attrs["actions"] = clean_actions(self._current(attrs, "actions"), kind, user)
```

with:

```python
        if creating or "actions" in attrs or "segment" in attrs:
            attrs["actions"] = clean_actions(self._current(attrs, "actions"), kind, user)
        elif turning_on:
            # Turning a rule on checks what it would do: a plan template since
            # deleted or unshared, or a teammate since gone, is refused now
            # rather than failing at night.
            clean_actions(self._current(attrs, "actions"), kind, user)
```

- [ ] **Step 4: The action and the night**

In `services/rules/actions.py`, add the imports:

```python
from services.plans.access import readable_templates
from services.plans.starting import PlanOpen, owner_for, start_plan
```

the phrases beside the others:

```python
STARTED = "started"
#: The record already has an open plan from the template: nothing to do, as
#: the lifecycle action's "already that stage" (`unchanged`).
ALREADY_HAD_ONE = "already had one"
TEMPLATE_UNUSABLE = "its template can't be used"
```

this function after `change_lifecycle`:

```python
def start_plan_action(action, rule, record, kind, *, today, made):
    """A plan from the action's template on the record, or on a contact's own
    organisation or account, once per parent per night (`made` holds
    `("plan", <model>, <pk>)`, never colliding with the task action's keys).
    The plan's owner is the parent's own owner when they are active and can
    open it, else the rule's owner; it is started through the same
    `plans.starting.start_plan` as the API. A parent with an open plan from
    the template is `unchanged`."""
    parent = parent_of(kind, record)
    key = ("plan", type(parent).__name__, parent.pk)
    if key in made:
        return result("plan", DONE, STARTED)
    # SOC2:AUTH-02 the rule's owner must still be able to read the template
    if not readable_templates(rule.owner).filter(pk=action["template"]).exists():
        return result("plan", FAILED, TEMPLATE_UNUSABLE)
    try:
        start_plan(
            action["template"],
            parent,
            owner=owner_for(parent, rule.owner),
            start_date=today,
            rule=rule,
        )
    except PlanOpen:
        return result("plan", UNCHANGED, ALREADY_HAD_ONE)
    made.add(key)
    return result("plan", DONE, STARTED)
```

and change `INTERNAL` to:

```python
INTERNAL = {"task": create_task, "lifecycle": change_lifecycle, "plan": start_plan_action}
```

In `services/rules/nightly.py`, change `from services.accounts.models import User` to `from services.accounts.models import Organisation, User`, add `from services.plans.models import PlanTemplate`, and in `pause_reason`, before the final `return ""`:

```python
    templates = [action["template"] for action in rule.actions if action["action"] == "plan"]
    if templates and not PlanTemplate.objects.filter(pk__in=templates).exists():
        return Rule.Paused.TEMPLATE_GONE
```

In `run_rule`, directly after the `if reason: … return Outcome(paused=True)` block, add:

```python
    if any(action["action"] == "plan" for action in rule.actions):
        # Lock order: rule, workspace, record, template, plan. `start_plan`
        # takes the workspace lock too; taking it here first keeps a
        # lifecycle action's record lock from coming before it.
        list(
            Organisation.objects.select_for_update(no_key=True)
            .filter(pk=rule.organisation_id)
            .values_list("pk", flat=True)
        )
```

Update the module docstring's step 1 to read "lock the rule's row (the API's edits take the same lock), and, for a rule that starts plans, the workspace's; skip it if tonight's run exists".

- [ ] **Step 5: The payload and the dry run**

In `services/rules/payloads.py`, add the imports:

```python
from services.customers.models import Contact
from services.plans.models import OPEN, Plan, PlanTemplate
```

these functions after `segment_ref`:

```python
def template_names(rules):
    """`{template_id: name}` for every `plan` action of `rules`, in one query
    (none when no rule starts plans)."""
    ids = {a["template"] for rule in rules for a in rule.actions if a["action"] == "plan"}
    if not ids:
        return {}
    return dict(PlanTemplate.objects.filter(pk__in=ids).values_list("pk", "name"))


def action_refs(actions, names):
    """A rule's actions as the API reads them: a `plan` action's template as
    `{id, name}`, or None once deleted."""
    shown = []
    for action in actions:
        if action["action"] == "plan":
            pk = action["template"]
            ref = {"id": pk, "name": names[pk]} if pk in names else None
            action = {**action, "template": ref}
        shown.append(action)
    return shown
```

change `_row`'s signature to `def _row(rule, viewer, readable, run, names):` and its `"actions": rule.actions,` line to `"actions": action_refs(rule.actions, names),`; in `rule_payload`, pass `template_names([rule])` as the fifth argument; in `list_rows`, compute `names = template_names(rules)` after `runs = …` and pass `names` to each `_row`. Update `list_rows`' docstring: "four queries whatever their number (the rules, the readable segments, the last nights, and the templates when any rule starts plans)".

Append after `preview_payload`:

```python
def parent_keys(kind, ids):
    """The organisations and accounts `ids` would put plans on: the records
    themselves, or for contacts their own organisation or account."""
    if kind != "contact":
        return {(kind, pk) for pk in ids}
    rows = Contact.objects.filter(pk__in=list(ids)).values_list("customer_id", "account_id")
    return {("customer", c) if c is not None else ("account", a) for c, a in rows}


def plan_preview(rule, selection):
    """The builder's test for a `plan` action: how many plans tonight would
    start, and how many of tonight's records already have an open plan from
    the template. None for a rule without a `plan` action. At most one open
    plan per record and template (the partial unique constraint), so a count
    of open plans is a count of records."""
    action = next((a for a in rule.actions if a["action"] == "plan"), None)
    if action is None:
        return None
    parents = parent_keys(selection.kind, selection.fire)
    open_plans = Plan.objects.filter(template_id=action["template"], status__in=OPEN)
    customers = [pk for kind, pk in parents if kind == "customer"]
    accounts = [pk for kind, pk in parents if kind == "account"]
    already = 0
    if customers:
        already += open_plans.filter(customer_id__in=customers).count()
    if accounts:
        already += open_plans.filter(account_id__in=accounts).count()
    return {"would_start": len(parents) - already, "already_open": already}
```

In `services/rules/views.py`, import `plan_preview` with the other payload functions, and replace `RuleTestView.post`'s last line `return Response(preview_payload(selection))` with:

```python
        body = preview_payload(selection)
        plans = plan_preview(rule, selection)
        if plans is not None:
            body["plans"] = plans
        return Response(body)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.rules services.plans --parallel --noinput`
Expected: PASS, every existing rules test included. If an existing rules test turns a rule on whose stored actions no longer validate (Step 3's re-check), fix that test's data, not the check.

- [ ] **Step 7: Check and commit**

```bash
venv/bin/python manage.py makemigrations --check --dry-run
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/rules
git commit -m "feat(rules): a fifth action, Start a plan; template_gone; the dry run counts plans

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: End to end

Spec §2.6's end-to-end case, backend half ("start a plan from a template, tick a task, mark a milestone done, and see the board card move to On track").

**Files:**
- Test: `e2e/test_plans_flow.py`

**Interfaces:**
- Consumes: every route from Tasks 3–9; `/auth/signup/`, `/auth/users/`, `/auth/login/`; `/customers/`, `/customers/<id>/tasks/`; `/tasks/<id>/`; `/notifications/`; `plans.builtins.seed_builtins`.
- Produces: nothing.

- [ ] **Step 1: Write the test**

Create `e2e/test_plans_flow.py`:

```python
"""End-to-end tier: real server, real HTTP, real test DB.

Alice (admin) starts an Onboarding plan on Carl's organisation, for Carl.
Carl is told, sees it on the board as Not started, ticks a task through the
existing task route and marks the first milestone done; the board card moves
to On track. A second start from the same template is refused with the open
plan's id. The organisation's task list names the plan."""

from django.test import LiveServerTestCase

from e2e.http import http_get, http_patch, http_post
from services.plans.builtins import seed_builtins
from services.plans.models import PlanTemplate


class PlansFlowTests(LiveServerTestCase):
    def setUp(self):
        # Another LiveServerTestCase may have flushed the seeded built-ins.
        seed_builtins(PlanTemplate)

    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def created(self, path, payload, token):
        status, body = http_post(self.api(path), payload, token=token)
        self.assertEqual(status, 201, body)
        return body

    def test_full_flow(self):
        # 1. A workspace signs up; its admin adds Carl; Carl adds his organisation.
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
        carl_id = self.created(
            "/auth/users/",
            {"name": "Carl CSM", "email": "carl@acme.io", "password": "csmpassword1"},
            alice,
        )["id"]
        status, body = http_post(
            self.api("/auth/login/"), {"email": "carl@acme.io", "password": "csmpassword1"}
        )
        carl = body["access"]
        pizza = self.created("/customers/", {"name": "Pizza Hut"}, carl)["id"]

        # 2. The built-in templates.
        status, templates = http_get(self.api("/plans/templates/"), token=alice)
        self.assertEqual(status, 200, templates)
        onboarding = next(t for t in templates["builtin"] if t["kind"] == "onboarding")
        self.assertEqual((onboarding["milestone_count"], onboarding["task_count"]), (4, 7))

        # 3. Alice starts it for Carl; a second start is refused.
        plan = self.created(
            "/plans/", {"template": onboarding["id"], "customer": pizza, "owner": carl_id}, alice
        )
        self.assertEqual(
            (plan["status"], plan["owner"]["id"], plan["can_edit"]), ("not_started", carl_id, False)
        )
        status, body = http_post(
            self.api("/plans/"), {"template": onboarding["id"], "customer": pizza}, token=alice
        )
        self.assertEqual((status, body["code"], body["plan_id"]), (409, "PLAN_OPEN", plan["id"]))

        # 4. Carl is told, and sees it on the board.
        status, notes = http_get(self.api("/notifications/"), token=carl)
        self.assertLessEqual({"plan_started", "plan_task_assigned"}, {n["kind"] for n in notes})
        status, board = http_get(self.api("/plans/?owner=me"), token=carl)
        self.assertEqual(
            ([r["id"] for r in board["results"]], board["counts"]["not_started"]), ([plan["id"]], 1)
        )

        # 5. Carl ticks the first task through the existing task route.
        status, page = http_get(self.api(f"/plans/{plan['id']}/"), token=carl)
        kickoff = page["milestones"][0]
        first = kickoff["tasks"][0]
        status, body = http_patch(
            self.api(f"/tasks/{first['id']}/"), {"status": "completed"}, token=carl
        )
        self.assertEqual(status, 200, body)

        # 6. He marks the Kick-off milestone done.
        status, page = http_patch(
            self.api(f"/plans/{plan['id']}/milestones/{kickoff['id']}/"), {"done": True}, token=carl
        )
        self.assertEqual(status, 200, page)
        self.assertIsNotNone(page["milestones"][0]["done_at"])

        # 7. The board card has moved to On track.
        status, board = http_get(self.api("/plans/"), token=carl)
        self.assertEqual(board["counts"]["on_track"], 1)
        (row,) = board["results"]
        self.assertEqual(
            (row["status"], row["milestones_done"], row["tasks_done"]), ("on_track", 1, 1)
        )

        # 8. The organisation's tasks name the plan and the milestone.
        status, tasks = http_get(self.api(f"/customers/{pizza}/tasks/"), token=carl)
        ticked = next(t for t in tasks if t["id"] == first["id"])
        self.assertEqual(
            (ticked["plan"]["id"], ticked["milestone"]["name"]), (plan["id"], "Kick-off")
        )
```

- [ ] **Step 2: Run it**

Run: `venv/bin/python manage.py test e2e.test_plans_flow --noinput`
Expected: PASS. Tasks 1–11 already built everything it reaches; a failure here is a real integration bug, to be fixed in the task's own module, not here.

- [ ] **Step 3: Run the suites and the checks**

Run:
```bash
venv/bin/python manage.py test services.plans services.rules services.customers services.notifications e2e.test_plans_flow e2e.test_rules_flow --parallel --noinput
venv/bin/python manage.py makemigrations --check --dry-run
venv/bin/python scripts/ci_shard_labels.py --check 4
venv/bin/ruff check . && venv/bin/ruff format --check .
```
Expected:
- every test passes;
- `No changes detected`;
- the shard check prints four shards whose union is the full suite;
- ruff is clean.

- [ ] **Step 4: Commit**

```bash
git add e2e/test_plans_flow.py
git commit -m "test(e2e): start a plan, tick a task, mark a milestone done, the board moves

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: The docs

Spec §1.9; skill `api-contracts`; the house rule that the product documents change in the same PR.

**Files:**
- Modify:
  - `docs/API_CONTRACTS.md`
  - `docs/audit-events.md`
  - `docs/data-classification.md`
  - `docs/product/01-prd.md`
  - `docs/product/02-trd.md`
  - `docs/product/05-backend-schema.md`
  - `docs/product/06-implementation-plan.md`

**Interfaces:**
- Consumes: the routes, bodies, events and models from Tasks 1–11, exactly as named there.
- Produces: nothing in code.

- [ ] **Step 1: `docs/API_CONTRACTS.md`**

Insert this whole section directly above `## \`scenarios\` — Automation builder`:

````markdown
## `plans` — Project Management (`/projects`, the Plans section on organisation and account pages)

Built for the Impact section's fourth delivery (spec: react-ts-app `docs/superpowers/specs/2026-10-04-plans-design.md` §1, §4). A plan is a run of work on one organisation or one account: ordered milestones, each with ordinary `customers.Task` rows (`Task.plan`, `Task.milestone`), started from a template by a person or by a rule's "Start a plan". Unrelated to `billing.Plan`.

**Models.**
- `PlanTemplate`: `name` (≤ 120), `kind` (`onboarding`/`success`/`save`/`qbr`/`other`), `description` (≤ 500), `sharing` with `shared_with` (≤ 50), `milestones` (1–12 `{name, offset_days 0–365, tasks: [{title ≤ 255, priority, offset_days 0–365, assignee_role: plan_owner|record_owner}]}`, at most 50 tasks in all), `is_builtin`. Four built-ins (Onboarding, Success plan, Save plan, QBR) have no workspace and no owner and are read by everyone. At most 50 personal templates per owner.
- `Plan`: one `customer` or one `account`; `template` (a copy was made; SET_NULL); `name`, `kind`, `owner` (an active teammate who can open the record), `start_date`, `target_date` (the latest milestone due date), `status` (`not_started`/`on_track`/`at_risk`/`done`/`cancelled`; the first three are open), `status_set_by` (`person`/`system`), `at_risk_cleared_on`, `started_by` (null when a rule started it), `started_by_rule`, `done_at`. One open plan per record per template.
- `Milestone`: `plan`, `name`, `position`, `due_date`, `done_at`, `done_by` (null when its tasks completed it).

**How a plan moves.**
- The first completed task, or a milestone marked done, moves `not_started` to `on_track` (`system`).
- A milestone is done when all its tasks are completed, and re-opens when one re-opens, unless a person marked it done.
- The last milestone done makes the plan `done`, in the same transaction.
- Nightly (`run_health_maintenance`, after the segments and before the rules): an open plan with a milestone past its due date and not done becomes `at_risk` (`system`). After a person moves it from at risk to on track, only a milestone due on or after that day counts. A plan whose milestones are all done becomes `done`.
- `cancelled` is by hand only and final. On a `done` or `cancelled` plan only a task's status may change, and nothing else follows.

**Access.**
- A plan is read by whoever may open its record. Anyone else gets a 404 identical to a missing plan, and plans they cannot open are never listed or counted.
- A plan's tasks keep their own rule (creator, assignee, and anyone above either). Counts of tasks are over the tasks the reader can see; the rest are `hidden_tasks`. A task the caller cannot see is 404 on the plan's task routes.
- A plan is changed by its owner and anyone above them in the chart: another reader gets `403 {"detail": "Only the plan's owner or their managers can change it."}`. A task's status may also be changed by its assignee or its creator.
- A template is read when built in, owned, shared with the workspace or with the reader by name. Only its owner changes it: `403 {"detail": "Only the template's owner can change it."}`; built-ins answer `403 {"detail": "Built-in templates can't be changed."}`.

**Refusals.** 400 `{field: [message]}` in the UI's own words (`services/plans/validation.py`); `non_field_errors` for no field. Milestone and task errors are lists aligned with what was sent, e.g. `{"milestones": [{}, {"tasks": [{"priority": ["Choose high, medium or low."]}]}]}`. A finished plan's structure: `400 {"non_field_errors": ["This plan is finished; only its tasks can change."]}`.

### `GET /api/v1/plans/`

Query: `status` (repeatable; `open` = the first three; default `open`), `kind`, `owner` (`me` or an id), `mine=tasks` (plans with a task assigned to me), `customer`, `account`, `q` (the plan's or its record's name), `cursor`. Unknown values are ignored. Newest first, 50 a page:

```json
{"results": [{"id": 3, "name": "Onboarding · Pizza Hut", "kind": "onboarding",
  "status": "on_track", "record": {"kind": "organization", "id": 12, "name": "Pizza Hut"},
  "owner": {"id": 4, "name": "Carl CSM"}, "start_date": "2026-10-04",
  "target_date": "2026-12-03", "milestones_done": 1, "milestones_total": 4,
  "tasks_done": 2, "tasks_total": 7, "next_due": "2026-10-18", "is_overdue": false,
  "can_edit": true}],
 "next": "<opaque cursor or null>",
 "counts": {"not_started": 0, "on_track": 1, "at_risk": 0, "done": 0, "cancelled": 0}}
```

`counts` covers the same filters ignoring `status`. `next_due` is the earliest due date of a milestone not done; `is_overdue` is `next_due` before today, on an open plan only.

### `POST /api/v1/plans/`

`{template, customer | account, name?, owner?, start_date?, milestones?}`.
- Exactly one of `customer`/`account`: `400 {"non_field_errors": ["Choose an organisation or an account."]}`. A record the caller cannot open reads like a missing one: `400 {"customer": ["Choose an organisation you can open."]}` (or `account`).
- `template` must be one the caller may read: `400 {"template": ["Choose a template you can use."]}`.
- `owner` defaults to the caller; it must be an active teammate who can open the record: `400 {"owner": ["They can't open this record."]}`. `start_date` defaults to today, `name` to "<Template> · <Record>".
- Without `milestones` the template is copied: dates from the start date, `record_owner` tasks to the record's owner (or the plan's owner when they cannot take them), `plan_owner` tasks to the plan's owner. With them, the modal's edited copy: `[{name, due_date, tasks: [{title, priority, due_date, assignee}]}]`, 1–12 milestones, at most 50 tasks, dates from the start to a year after it, assignees who can open the record.
- 201 with the plan (below). `409 {"code": "PLAN_OPEN", "plan_id": 3, "detail": "This record already has an open plan from this template."}` when the record has one open.
- The owner gets `plan_started` when someone else started it; each assignee gets one `plan_task_assigned` naming how many tasks, never the person acting. Both link to `/projects/<id>`.

### `GET/PATCH/DELETE /api/v1/plans/<id>/`

GET returns the row plus:

```json
{"template": {"id": 1, "name": "Onboarding"}, "started_by": {"id": 9, "name": "Alice Admin"},
 "started_by_rule": null, "status_set_by": "system", "done_at": null,
 "created_at": "…", "hidden_tasks": 1, "can_delete": false,
 "milestones": [{"id": 21, "name": "Kick-off", "position": 0, "due_date": "2026-10-04",
   "done_at": "…", "is_overdue": false, "hidden_tasks": 0, "tasks_done": 2, "tasks_total": 2,
   "tasks": [{"id": 88, "title": "Hold the kick-off call", "priority": "high",
     "status": "completed", "due_date": "2026-10-04",
     "assignee": {"id": 4, "name": "Carl CSM"}, "can_check": true}]}]}
```

- `started_by_rule` is `{id, name}` for a reader who may read the rule, else `{"id": null, "name": "a rule"}`.
- `can_check` is true for the task's assignee, its creator and the plan's editors. `can_delete` is `can_edit` and no completed task.

PATCH (editors) takes any of `{name, owner, status}`; `status` is `on_track`, `at_risk`, `cancelled` or `done` (`400 {"status": ["Mark every milestone done first."]}` until every milestone is). Moving from at risk to on track records the day. Returns the plan.

DELETE (editors) returns 204 while no task is completed, else `409 {"code": "PLAN_HAS_DONE_WORK", "detail": "Cancel it instead: some of its work is done."}`. Its milestones and tasks go with it.

### Milestones and tasks

All answer the plan; the two POSTs answer 201. Editors only, while the plan is open (except a task's `status`).

| Route | Body |
|---|---|
| `POST plans/<id>/milestones/` | `{name, due_date}`: added at the end; at most 12 |
| `PATCH plans/<id>/milestones/<mid>/` | any of `{name, due_date, done}` |
| `DELETE plans/<id>/milestones/<mid>/` | removes it with its tasks; never the last one |
| `POST plans/<id>/milestones/reorder/` | `{order: [every milestone id, once]}` |
| `POST plans/<id>/tasks/` | `{milestone, title, priority, due_date, assignee}`: created by the caller; at most 50 |
| `PATCH plans/<id>/tasks/<tid>/` | any of `{title, priority, due_date, assignee, milestone, status}`; `status` also by the assignee or creator |
| `DELETE plans/<id>/tasks/<tid>/` | removes it |

Due dates lie from the start date to a year after it. A reassigned task's new assignee gets one `plan_task_assigned`. A task's status may also change through `PATCH /api/v1/tasks/<id>/`, which moves its milestone and plan the same way.

### `GET/POST /api/v1/plans/templates/`, `GET/PATCH/DELETE /api/v1/plans/templates/<id>/`

GET (list) returns `{builtin: [...], mine: [...], shared: [...]}`; each template:

```json
{"id": 1, "name": "Onboarding", "kind": "onboarding", "description": "", "is_builtin": true,
 "is_owner": false, "owner": null, "sharing": "workspace", "shared_with": [],
 "milestones": [{"name": "Kick-off", "offset_days": 0, "tasks": [{"title": "Hold the kick-off call",
   "priority": "high", "offset_days": 0, "assignee_role": "record_owner"}]}],
 "milestone_count": 4, "task_count": 7, "length_days": 60, "updated_at": "…"}
```

POST `{name, kind, description, milestones, sharing, shared_with}` returns 201; the 51st personal template is `400 {"non_field_errors": ["You can own at most 50 templates."]}`. PATCH takes the same fields; DELETE returns 204 and keeps the plans started from it.

### `POST /api/v1/plans/<id>/save-as-template/`

`{name, sharing?, shared_with?}` (editors): the plan's milestones and the tasks the caller can see, as a new personal template of the plan's kind. Offsets are days from the start date (0–365); a task assigned to the record's owner becomes `record_owner`, any other `plan_owner`. 201 with the template.

### `GET /api/v1/customers/<id>/plans/`, `GET /api/v1/accounts/<id>/plans/`

`{results: [row, ...]}`, open plans first, then newest; unpaginated. 404 for a record the caller cannot open.
````

In the `rules` section:
- Add this row to the actions table, after `survey`: `| \`plan\` | \`{"action": "plan", "template": <id>}\`; a template the owner may read ("Choose a template you can use."); the rule reads it back as \`{"action": "plan", "template": {"id", "name"} \| null}\` and accepts either form | At once. One plan per organisation or account per night (a contact's on its own), through the same service as \`POST /api/v1/plans/\`, owned by the record's owner when active and able to open it, else the rule's owner. Results: \`done\` "started", \`unchanged\` "already had one" (the record fires), \`failed\` "its template can't be used" |`.
- In "The night", change "a rule whose segment is gone or no longer the owner's, or whose owner is inactive," to "a rule whose segment is gone or no longer the owner's, whose owner is inactive, or whose plan template was deleted,".
- In `GET/POST /api/v1/rules/`, change the `paused_reason` line to: "`paused_reason` is `""`, `segment_gone`, `segment_not_owned`, `owner_inactive` or `template_gone` ("Its plan template was deleted."). `paused_message` is its sentence."
- In `GET/PATCH/DELETE /api/v1/rules/<id>/`, add the bullet: "Turning a rule on checks its actions again: a plan template since deleted or unshared is refused at `actions`."
- In `POST /api/v1/rules/test/`, add the bullet: "A rule with a `plan` action adds `"plans": {"would_start": 1, "already_open": 1}`: of tonight's organisations and accounts (a contact's own), how many would get a plan and how many already have one open from the template."

In the `segments` section's note on `Notification`'s kinds (search for `rule_fired` and `rule_review`), add `plan_started` and `plan_task_assigned`, from `plans`.

In the `customers` section, under `### Models — \`Task\``, add the paragraph: "`plan` and `milestone` (both nullable) link a task to a plan and one of its milestones (`services/plans`); a milestone is set only with its own plan. The task payload of `GET …/tasks/` carries `plan: {id, name} | null` and `milestone: {id, name} | null`."

- [ ] **Step 2: `docs/audit-events.md`**

Add these rows directly after the last `rule.*` row:

```markdown
| `plan.started` | `services.plans.starting.start_plan` (from `POST /plans/` or a rule's `plan` action) | user, or — for a rule | Plan (`target_repr` "Plan <id>", never the name) | `template`, `record_kind`, `record_id`, `rule` (id or null), `milestones`, `tasks` (counts) |
| `plan.updated` | `services.plans.views.PlanDetailView` (PATCH) | user | Plan | `fields`: the changed field names only (`name`, `owner`) |
| `plan.status_changed` | `services.plans.status.set_status` (a PATCH, a task or milestone finishing the plan's work, the nightly step) | user, or — for the nightly step | Plan | `old`, `new`, `by` (`person` or `system`) |
| `plan.cancelled` | `services.plans.status.set_status` | user | Plan | — |
| `plan.deleted` | `PlanDetailView` (DELETE) | user | Plan | `template`, `record_kind`, `record_id` |
| `plan.milestone_changed` | `services.plans.views` milestone routes | user | Plan | `milestone` (id), `change` (`added`, `edited`, `done`, `undone`, `removed`, `reordered`), plus `fields` for an edit and `order` (ids) for a reorder |
| `plan.task_changed` | `services.plans.views` task routes | user | Plan | `task` (id), `change` (`added`, `edited`, `removed`), plus `fields` for an edit |
| `plan_template.created` | `services.plans.views.TemplateListCreateView`, `SaveAsTemplateView` | user | PlanTemplate ("Plan template <id>") | `kind`, `milestones`, `tasks` (counts), plus `plan` (id) when saved from a plan |
| `plan_template.updated` | `TemplateDetailView` (PATCH) | user | PlanTemplate | `fields`: the changed field names only |
| `plan_template.shared` | a non-private create, or a PATCH changing `sharing` or `shared_with` | user | PlanTemplate | `sharing`, `shared_with` (user ids) |
| `plan_template.deleted` | `TemplateDetailView` (DELETE) | user | PlanTemplate | `kind` |
```

In the `rule.paused` row, add `template_gone` to the reasons.

- [ ] **Step 3: `docs/data-classification.md`**

Add after the `rules.*` row in the models table:

```markdown
| `plans.PlanTemplate`, `plans.Plan`, `plans.Milestone` | internal | — (ids only: `Plan.customer`/`account` reference the record, `owner`, `started_by`, `done_by` and `shared_with` reference users) | plan, milestone and template names and template task titles (internal business data, not PII), kinds, dates, statuses, offsets and assignee roles. A plan is read by whoever may open its record (AUTH-02); its tasks keep `customers.Task`'s own rule, and readers get a count of the rest; writes by the plan's owner and their managers, templates by their owners, audited by id (LOG-01) |
```

Add after the `Rule review notice` row in the flows table:

```markdown
| Plan started (in-app `Notification`, kind `plan_started`) | the starter's or the rule's name and the plan's name | internal | to the plan's owner only, when someone else or a rule started it; links to the plan |
| Plan tasks assigned (in-app `Notification`, kind `plan_task_assigned`) | how many tasks and the plan's name | internal | one per person per start or reassignment, never to the person acting; links to the plan |
```

- [ ] **Step 4: The product documents**

`docs/product/01-prd.md`:
- In the features table, add after the `Rules (when → then)` row: `| Plans (Project Management) | Built (backend) | Milestones and tasks on one organisation or account, from four built-in templates (Onboarding, Success, Save, QBR) or personal ones shared like segments; started by a person or by a rule's "Start a plan". Read by whoever may open the record, each task under its own rule ("N tasks you can't see"); edited by the plan's owner and their managers. On track with the first work done, at risk nightly when a milestone is overdue, done when every milestone is; one open plan per record per template |`.
- In the `Rules (when → then)` row, change "(notify, create a task, change the lifecycle stage, send a survey)" to "(notify, create a task, change the lifecycle stage, send a survey, start a plan)".
- In the changelog, add `| 2026-10-04 | Plans (backend): templates, plans on organisations and accounts, milestones moving with their tasks, nightly at-risk, the rules' "Start a plan" |`.

`docs/product/02-trd.md`:
- In the services table, add after `services/rules/`: `| \`services/plans/\` | Plans: \`starting.py\` is the one way a plan is made (API and rule alike), locking workspace, record, then template, and copying the template; \`status.py\` moves milestones and plans under the plan's \`FOR NO KEY UPDATE\` lock, for the API, the existing task route and \`nightly.py\` (at risk, done; in \`run_health_maintenance\` before the rules); visibility is the record's (\`id IN\` subqueries), each task keeping \`personal.visible_tasks\`; \`builtins.py\` seeds the four built-in templates |`.

`docs/product/05-backend-schema.md`:
- In the `Task` row (section 5), add `, plan, milestone (a plan's work; services/plans)` to its fields.
- In the `Notification` row, add `plan_started, plan_task_assigned` to the kinds.
- Add after the `### \`rules\`` section:

```markdown
### `plans`

| Model | Purpose |
|---|---|
| `PlanTemplate` | `name`, `kind`, `description`, `sharing` with `shared_with`, `milestones` (JSON: 1–12 milestones with offsets and tasks, at most 50 tasks), `is_builtin`. Built-ins have no `organisation` or `owner` (CheckConstraint). At most 50 personal templates per owner |
| `Plan` | On one `customer` or `account` (CheckConstraint); `template` (SET_NULL), `name`, `kind`, `owner` (PROTECT), `start_date`, `target_date`, `status`, `status_set_by`, `at_risk_cleared_on`, `started_by`, `started_by_rule`, `done_at`. Partial unique `(customer, template)` and `(account, template)` while open with a template |
| `Milestone` | `plan` (CASCADE), `name`, `position`, `due_date`, `done_at`, `done_by` |
```

- In the access table, add after the `Rules` row: `| Plans | Read by whoever may open the plan's record; its tasks by their own rule, the rest a count; written by the plan's owner and anyone above them, a task's status also by its assignee and creator; templates read when built in, owned or shared, written by their owner | \`services/plans/access.py\`, \`payloads.py\` |`.

`docs/product/06-implementation-plan.md`: add after the `### C7 to C9. The long tail` section:

```markdown
### C10. Plans (Project Management)

Built 2026-10-04 (backend, `services/plans`; spec: react-ts-app
`docs/superpowers/specs/2026-10-04-plans-design.md`): templates, plans on
organisations and accounts with milestones and ordinary tasks, the nightly
at-risk step and the rules' "Start a plan". The `/projects` pages, the
record sections and the rule builder's card are the frontend PR.
```

- [ ] **Step 5: Format and check the docs, then the whole suite**

Run:
```bash
venv/bin/ruff format docs/API_CONTRACTS.md docs/audit-events.md docs/data-classification.md docs/product/01-prd.md docs/product/02-trd.md docs/product/05-backend-schema.md docs/product/06-implementation-plan.md
venv/bin/ruff check . && venv/bin/ruff format --check .
venv/bin/python manage.py makemigrations --check --dry-run
venv/bin/python manage.py test --parallel --noinput
```
Expected: ruff is clean, no migration changes, and the full suite passes.

- [ ] **Step 6: Commit**

```bash
git add docs/API_CONTRACTS.md docs/audit-events.md docs/data-classification.md docs/product
git commit -m "docs(plans): API contracts, audit events, data classification, product docs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage** (backend scope: §0, §1, §4):

| Spec | Where |
|---|---|
| §1.1 `PlanTemplate` fields, sharing, milestone JSON and its limits | Task 1 (model), Task 3 (validation, sharing) |
| §1.1 data migration seeding the built-ins; §1.6 their exact content | Task 2 |
| §1.1 `Plan` fields, CheckConstraint, partial unique constraints, copying | Task 1, Task 5 |
| §1.1 `Milestone`; `Task.plan`/`Task.milestone`, `full_clean`, CheckConstraint, CASCADE | Task 1 |
| §1.1 limits (12, 50, 50 templates, one open per template) | Tasks 1, 3, 5, 8 |
| §1.2 on track, milestone done/re-open/by hand, done in the same transaction, cancelled final, finished read-only | Task 6 (engine), Task 7 (by hand), Task 8 (milestones and tasks) |
| §1.2 at risk nightly with `at_risk_cleared_on` | Task 6 (`set_status`), Task 10 |
| §1.3 read via `id__in`, 404, never listed or counted | Task 4 |
| §1.3 tasks under `visible_tasks`, `hidden_tasks`, visible-only counts | Task 4 |
| §1.3 editors (owner and chain), 403 | Tasks 4, 7, 8 |
| §1.3 task status by assignee, creator, editors | Task 8 (plan route), Task 6 (existing route) |
| §1.3 owners/assignees active and able to open, "They can't open this record." | Tasks 5, 7, 8 |
| §1.3 delete while nothing completed, 409 | Task 7 |
| §1.3 templates read/write, built-ins 403 | Task 3 |
| §1.4/§4 every route and shape | Tasks 3–9 |
| §1.4 refusals as UI copy in `validation.py` | Task 3 (constants), Tasks 5, 7, 8 |
| §1.4 locks in order, re-check, `IntegrityError` → 409 | Task 5 |
| §1.4 task completion under the plan lock | Task 6 |
| §1.5 nightly before rules, per workspace, savepoint per plan, idempotent, counts only | Task 10 |
| §1.7 notifications (kinds, rules, links) | Task 1 (kinds), Task 5 (start), Task 8 (reassign) |
| §1.7 audit events by id | Tasks 3, 5, 6, 7, 8, 9; catalogue Task 13 |
| §1.7 data classification | Task 13 |
| §1.8 the `plan` action: validation, running, owner, one per parent, same service, already open, `template_gone`, dry run | Task 11 |
| §1.9 docs | Task 13 |
| §2.5 task serializer `plan`/`milestone` (§4 "Task serializer addition") | Task 6 |
| §2.6 the end-to-end case (backend half) | Task 12 |

**Placeholder scan:** no "TBD", "TODO", "similar to", or code steps without code. Every test and implementation is written out; doc text is given verbatim.

**Type consistency, checked across tasks:**
- `start_plan(template_id, record, *, owner, start_date, actor=None, rule=None, name="", milestones=None, request=None) -> Plan` (Task 5) is called by `PlanListCreateView.post` (Task 5) and `rules.actions.start_plan_action` (Task 11); both catch `PlanOpen` (`.plan_id`).
- `owner_for(record, fallback)` (Task 5) is used by `start_plan` and the rule action (Task 11).
- `clean_plan_milestones(...)` (Task 5) returns the shape `copy_template` returns (Task 5) and `start_plan` takes.
- `lock_plan`, `set_status(plan, new, *, by, now, today, request=None, actor=None)`, `after_work(plan, milestone_ids, *, progressed, now, today, request=None, actor=None)`, `finish_if_done`, `advance`, `refresh_target`, `milestones_done` (Task 6) are used by Tasks 7, 8 and 10 with those keywords.
- `_editable`, `_lock_for_edit`, `_require_open`, `_plan_response` (Task 7) are used by Tasks 8 and 9.
- `_audit`, `_changed`, `_template_limit_reached`, `_template_response`, `_audit_shared` (Task 3) are used by Task 9.
- `readable_templates` (Task 3) is used by Tasks 5 and 11; `get_visible_plan`, `editor_ids`, `can_edit`, `require_editor`, `record_of`, `can_open` (Task 4) by Tasks 5–9.
- `plan_payload`, `plan_rows` (Task 4) back every plan response.
- URL names: `plan-list`, `plan-detail`, `plan-template-list`, `plan-template-detail`, `plan-milestones`, `plan-milestone-detail`, `plan-milestones-reorder`, `plan-tasks`, `plan-task-detail`, `plan-save-as-template`, `customer-plans`, `account-plans`.
- Test helpers `build_plan(record=None, *, owner, template, steps, status, created_by, start, **fields)`, `make_template`, `api`, `events`, `notes` (Task 1) are used with those names throughout.

## Spec gaps and conflicts found while planning

1. **§1.4 and §4 disagree on `PATCH plans/:id/`.** §1.4 lists "the name, owner, target, status … and dates"; §4 (binding) lists `{name, owner, status}`. This plan follows §4 (contract note 5): the target follows the milestones, and the start date is fixed.
2. **§4's night result "skipped (detail "already had one")" conflicts with the rules app**, where a record whose every action was skipped is itself skipped `nobody` and starts no cooldown. This plan reports `unchanged` (contract note 1). If the owner prefers `skipped`, `rules.nightly.skip_reason` would need a third kind of skip, and the run's `skipped` counts a new key.
3. **"Up to 12 milestones" leaves 0 open.** A plan with no milestones could never be done or at risk. This plan requires at least one (contract note 8).
4. **"The last milestone's due date"** could mean the last by position or the latest. After a reorder they differ; this plan uses the latest (decision 2).
5. **Who creates a plan's tasks is not said**, and it decides who sees them (`visible_tasks` reads `created_by`). This plan uses the person acting, or the rule's owner (decision 1), so a starter always sees what they started; a plan owner who did not start it sees only tasks assigned to them or their reports.
6. **`started_by_rule` names a rule to readers who may not read it.** A rule's name is its owner's words (confidential in the data classification). This plan names it only to the rule's readers (contract note 3).
7. **Save as template and hidden tasks.** Copying every task would put titles the caller cannot read into their template. This plan copies only the visible ones (contract note 16).
8. **The spec names no audit event for a plan's task edits.** This plan adds `plan.task_changed` (decision 9).
9. **`can_check` versus the existing task route.** §1.3 says the existing route is for "the assignee or the creator, unchanged"; the real route lets anyone who may read the task change its status (managers of either included). The route is left unchanged; the plan route follows §1.3 (contract note 13).
10. **The 50-template limit's status code is not given.** This plan answers 400 (contract note 11), as segments do; rules answer 429 for their limit.
