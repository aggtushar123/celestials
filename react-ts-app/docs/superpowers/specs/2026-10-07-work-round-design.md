# Work: recommend, assign, notify, track (round 1)

**Owner's request (2026-10-06/07).** The app should cover the whole life of a
piece of work:
1. Revenact recommends important tasks from data across the company.
2. A manager assigns each one to the right person.
3. The assignee is notified.
4. Revenact keeps tracking the task until it is done.

This is the web half of the "Today" experience that Revenact Mobile will build
on later.

**Decisions taken in brainstorming (2026-10-07):**

| Question | Decision |
|---|---|
| Sources | **Signals first.** Round 1 recommends from data that exists today: renewal due, health drop, urgent tickets, overdue tasks, unanswered questions, anomalies, plus the existing AI agent's suggestions. "Not in the room" (AI pulling commitments out of emails, calls and tickets) is round 2 and feeds the same queue. |
| Recipients | **The manager assigns.** A recommendation lands in the manager's queue with a suggested person. A workspace setting can send it straight to the owner instead. Someone with no manager receives their own. |
| Where | **A new top-level Work section**, with Today, Recommended and Team. Brain keeps its read-only views. |
| Notifications | **In-app now, email ready.** The bell and realtime push now. A daily digest email is built and tested, but only sends once production SMTP exists. |
| Tracking | **A task panel with activity:** description, Blocked with a reason, reassign, due date, comments, and an activity trail. |
| Engine | **Approach A: rules over signals.** No AI in the recommender itself. Adding an AI-suggested next step is a later add-on. |

The spec covers three deliveries. Each gets its own plan and its own backend
and frontend PRs, merged backend first.

## 0. What exists

Backend origin/main, frontend f951764.

**Task** (`services/customers/models.py:1333`):
- **Parent.** Exactly one of `customer` or `account`.
- **People.** `assignee` is a real User FK (since migration `0041_task_people`).
  `assignee_name` is legacy text. `created_by` is a FK.
- **Status and dates.** `due_date`. `priority` is high, medium or low.
  `status` is pending, in-progress or completed.
- **Links.** `initiative`, `plan`, `milestone`.
- **Missing.** No description, no history and no index for assignee scans.

**Task creation sites:**

| Path | Assignee | Notifies? |
|---|---|---|
| Manual (`customers/views.py:1210 _create_task`) | real FK; defaults to the creator | **no** |
| Plans (`plans/views.py:584`, `plans/notices.py:tell_assignees`) | real FK | yes, `plan_task_assigned` |
| Rules (`rules/actions.py:88 create_task`) | record owner or rule owner | **no** |
| AI-agent proposal approval (`metrics/proposals.py:412 approve`) | **text name only, no FK** | **no** |

**Task API and visibility:**
- `PATCH /tasks/<id>/` only writes `status`. It is audited, and delegates to
  `plans/status.py` for plan tasks.
- `GET /tasks/?mine=true` means "my book" (I own the parent), not "assigned to
  me".
- `visible_tasks` (`customers/personal.py:17`): the creator, the assignee, or
  anyone above either of them. A task with neither is visible to everyone. It
  is always combined with the parent-record rule (the twice-filter).

**Signals already computed:**
- Organisation story Needs attention (`organizations/story/attention.py`), per
  organisation: renewal within 30 days, urgent tickets, overdue tasks, open
  questions, the latest anomaly.
- Health snapshots and health maintenance.
- Anomalies (`anomalies/detect.py`).
- Knowledge questions with aging (`knowledge/aging.py`: stale after 3 days, a
  nudge every 24 hours, `last_nudged_at`). This is the template for task
  nudges.

**Brain:**
- Waiting on you (`brain/desk.py`) already lists overdue tasks by scope.
- `brain/waiting.py:decided_as` says who may decide an AI-agent proposal: the
  owner, anyone above them, or `view_all_accounts`.
- Scopes: `brain/scope.py:resolve` gives Me, My team and Company.

**Routing data:**
- `User.reports_to` and `accounts/hierarchy.py` (`subtree_ids`, `ancestors`).
- `Customer.owner` and `Account.owner`.
- `knowledge.FunctionOwner`: one owner per organisation and function.
- `User.Function`: CS, ENGINEERING, SALES, ANALYTICS, LEADERSHIP, OTHER.

**Notifications** (`notifications/realtime.notify`, Channels, Redis):
- There are 12 kinds and none is about tasks.
- The model's docstring claims tasks cannot be notified because their assignee
  is text. That is stale.
- There is no email for notifications. `services/email.py` and the `sender`
  loop (`deliver_pending`, every 60s) exist for campaigns and surveys. Prod has
  no SMTP.

**Jobs:** `run_health_maintenance` runs about daily (the `scheduler` service),
as a list of steps that each fail on their own. There is no task queue, by
design.

**Settings:** the round-1 frame (`WORKSPACE_SETTINGS_NAV`) has room for a Work
group.

**Rules that bind every part of this round:**
- **Postgres 16.** Use `id__in` subqueries, never join plus `.distinct()`. The
  new modules get the same no-DISTINCT test that `brain/desk.py` has.
- **The twice-filter.** Every list or count combines the object rule with the
  record rule.
- **Counted, not named.** Anything the reader cannot open is counted, never
  named.
- **Tokens only.** The UI follows the revenact-design skill. Every list has
  empty, loading and error states.

## 1. Delivery 1: tasks you can work

### 1.1 Model

**Task gets:**
- `description` TextField (blank).
- Status `blocked`, with `blocked_reason` CharField(255). The reason is
  required when the status is blocked, and cleared otherwise.
- `source` CharField: manual, plan, rule, recommendation or agent, default
  manual. The data migration backfills it: `plan_id` set means plan;
  `initiative_id` set means agent; everything else means manual.
- `Index(fields=["assignee", "status", "due_date"])`.
- `assignee_name` is kept equal to `assignee.name` on every write.

**New `TaskEvent`** (in the customers app, beside Task):
- `task` FK, CASCADE.
- `actor` FK User, null. Null means Revenact.
- `kind`: created, assigned, status, due_changed, edited, comment, recommended,
  nudged, escalated.
- `data` JSON, for from/to values.
- `body` TextField, for comments.
- `created_at`.
- Ordering: newest last.
- An event is visible exactly where its task is.

### 1.2 Permissions

- **See a task.** Its creator, its assignee, anyone above either of them,
  and (owner's decision, 2026-10-07) anyone with `view_all_accounts` or the
  Leadership function. Before this round view-all did not widen task
  visibility; that rule changes on purpose. The record rule still applies on
  top: nobody sees a task on a record they cannot open.
- **Edit a task.** Its creator, its assignee, anyone above either of them,
  `view_all_accounts`, or the Leadership function. For an ordinary task,
  anyone who can see it can edit it (owner's decision, 2026-10-07).
  - A plan task keeps the plan's own edit rules (`plans/views.py`), with its
    status still routed through `plans/status.set_task_status`.
- **Assign a task.** The new assignee must be an active member of the workspace
  who can open the task's parent record: `visible_customers` or
  `visible_accounts` evaluated for them. Otherwise the request fails with 400
  `ASSIGNEE_CANNOT_OPEN`.
- **Comment on a task.** Anyone who can see it.

### 1.3 Fixes to existing paths

All four creation paths must:
1. store the real `assignee`;
2. write a `created` event (plus a `recommended` event when the task came from
   a recommendation);
3. notify the assignee with the new kind `task_assigned`, unless the assignee
   is the actor. The link is `/work/today?task=<id>`.

The AI-agent approval path additionally matches `action["assignee_name"]`
against active members of the workspace: an exact match first, then a
case-insensitive match. If there is no unique match, the task goes to the
organisation owner, and the `created` event notes "suggested <name>, no such
member".

The stale docstring on `Notification` is corrected.

### 1.4 API

| Method and path | What it does |
|---|---|
| `GET /work/today/` | My open tasks, grouped `overdue`, `today`, `week`, `later` and `blocked`. Each row has id, title, due date, priority, status, source, and the parent's `{kind, id, name}`. "Today" uses the workspace timezone (UTC until delivery 3). |
| `GET /work/team/?scope=team\|company` | Brain's `resolve` scopes. One row per person: open, overdue and blocked counts, and the oldest overdue date. Tasks the reader cannot see are left out of the counts, and a `hidden` total shows how many. |
| `GET /work/tasks/?assignee=<id>&state=open\|overdue\|blocked` | The drill-down. Only tasks visible to the reader. |
| `GET /tasks/<id>/` | The task, with `events`. |
| `PATCH /tasks/<id>/` | Writable: title, description, status (with `blocked_reason`), due date, priority, assignee. Each changed field writes its event. A changed assignee is notified. Status changes keep their existing audit record. |
| `POST /tasks/<id>/comments/` | `{body}`. Writes a `comment` event. |

### 1.5 Frontend

- **Sidebar.** A Work item, with a badge counting my overdue tasks (plus
  recommendations waiting, from delivery 2).
- **`/work/today`:**
  - grouped lists; Blocked rows show their reason;
  - a quick "Done" on each row;
  - "New task" (pick an organisation or account, title, due date, assignee).
- **`/work/team`:**
  - shown to people with reports or `view_all_accounts`;
  - a Me/My team/Company switch, as in Brain;
  - one row per person with counts and overdue highlighted;
  - a row expands into that person's tasks;
  - a "N tasks you can't open" line when tasks are hidden.
- **Task panel**, a side sheet at `?task=<id>` that works on any route:
  - editable title and description;
  - status, including Blocked with its reason input;
  - assignee picker (members who can open the record; others are disabled with
    "Can't open this account");
  - due date and priority;
  - comments;
  - the activity trail, written in plain sentences.
- **Opening the panel from elsewhere.** The organisation page's Tasks tab and
  Brain › Waiting on you open the same panel.
- **The old mock.** The mock `features/tasks/tasksSlice` used by CallSense's
  "Create tasks from actions" is left alone. That flow is round 2's.

## 2. Delivery 2: Recommended

### 2.1 Model

**New `Recommendation`** (new app `services/work`):
- **Where it applies.**
  - `organisation` FK.
  - `customer` FK, CASCADE.
  - `account` FK, null, CASCADE.
- **What it is.**
  - `kind`: renewal_due, health_drop, urgent_tickets, overdue_tasks,
    open_questions, anomaly, agent.
  - `title`: a CharField, phrased as an action, e.g. "Prepare Acme's renewal".
  - `why` JSON: `{facts: [str], evidence: [{label, link}]}`. The facts are
    plain sentences, e.g. "Renews in 9 days", "Health fell 5.6 → 4.9 in 14
    days".
  - `proposal` FK `metrics.Proposal`, null. Used only when the kind is agent.
- **Who.**
  - `suggested_assignee` FK User, null.
  - `recipient` FK User: the person whose queue it is in.
- **Outcome.**
  - `status`: open, assigned, dismissed or expired.
  - `dismiss_reason` CharField.
  - `decided_by` FK User, null; `decided_at`.
  - `task` OneToOne Task, null.
  - `signal_value` FloatField, null. This is the severity at creation (days to
    renewal, the size of the drop, the count), used to tell when a signal has
    worsened.
  - `created_at`.
- **Uniqueness.** Two partial unique constraints, both where status is
  open: (organisation, kind, customer) where account is null, and
  (organisation, kind, customer, account) where account is not null.

**New `WorkSettings`** (OneToOne Organisation, created lazily with defaults):
- `recommend_to`: `manager` (default) or `owner`.
- `sources` JSON, one entry per kind, with these defaults:
  - `renewal_due {enabled: true, days: 30}`
  - `health_drop {enabled: true, drop: 0.5, window_days: 14}`
  - `urgent_tickets {enabled: true, min: 1}`
  - `overdue_tasks {enabled: true, days: 2}`
  - `open_questions {enabled: true, days: 3}`
  - `anomaly {enabled: true}`
  - `agent {enabled: true}`
- `dismiss_cooldown_days`: default 14.

### 2.2 The job: `services/work/recommend.py:refresh(organisation, *, today)`

**What it does, per enabled source:**
- For every organisation (and, where the signal is per account, every account)
  in the workspace, it computes the signal with a SystemActor read.
- **Signal triggers:**
  - `renewal_due`: the renewal date is within `days`, or overdue.
  - `health_drop`: health now is at least `drop` below the health snapshot from
    `window_days` ago.
  - `urgent_tickets`: open tickets at support priority ≥ `min`.
  - `overdue_tasks`: tasks overdue by ≥ `days` on this record.
  - `open_questions`: Knowledge questions open ≥ `days`.
  - `anomaly`: a live anomaly whose evidence names this organisation.
  - `agent`: every pending task-kind Proposal without a Recommendation.
- **Reuse.** It uses the helpers `attention.py` already uses wherever the shape
  fits.

**Rules it follows:**
- **Upsert.**
  - An open recommendation for the key is updated (facts, `signal_value`).
  - If none exists, one is created, unless a dismissed one for the key is
    within the cooldown and its `signal_value` is no worse.
- **Expire.** An open recommendation whose signal no longer triggers becomes
  expired.
- **Safe to re-run.** It is idempotent, and one source failing never stops the
  others (try, log, continue).
- **Where it runs.** It is called from `run_health_maintenance` before
  `rules.nightly.evaluate_rules`. An admin can also run it with
  `POST /work/recommendations/refresh` (`manage_org_settings`).
- **Notification.** After each run, every recipient with new open items gets
  one `recommendations_waiting` notification ("3 tasks recommended for your
  team"), at most once a day per recipient.

**Routing:**
1. **The suggested assignee:**
   - **Function per kind.** CS for renewal_due, health_drop, open_questions,
     anomaly and urgent_tickets. (Mapping tickets to a department's function
     is a later refinement.) For overdue_tasks, nobody is suggested by
     function; go straight to the record owner. For agent, the person the
     proposal names (matched to a member as in §1.3).
   - **The person.** `FunctionOwner(customer, function)`, else the record
     owner (the account owner for an account-level signal, otherwise the
     organisation owner).
   - **Check.** Each candidate must be active and able to open the record.
     Otherwise try the next one.
2. **The recipient:**
   - If `recommend_to = manager` and the suggested assignee has an active
     `reports_to` who can open the record, the recipient is that manager.
   - Otherwise the recipient is the suggested assignee.
   - If there is no suggested assignee, the recipient is the first active
     member with `view_all_accounts`, else the workspace owner.

### 2.3 Deciding

**Who may decide.** The recipient, anyone above the suggested assignee, or
`view_all_accounts`. Reuse `brain/waiting.decided_as` semantics. The decision
runs under `select_for_update`. If the recommendation is no longer open, the
request fails with 409 `ALREADY_DECIDED`, naming who decided.

**Assign.** `POST /work/recommendations/<id>/assign
{assignee_id, due_date?, title?, priority?}`:
- The assignee check is §1.2.
- It creates a Task with source `recommendation`. The task's `description` is
  built from the `why` facts. Its due date defaults to:
  - the renewal date minus 7 days for renewal_due;
  - otherwise today plus 3 working days.

  It writes a `recommended` event that records the facts.
- For an agent recommendation, it calls the existing
  `metrics/proposals.approve` and links the resulting task. It does not create
  a second one.
- It notifies the assignee (`task_assigned`).

**Dismiss.** `POST /work/recommendations/<id>/dismiss {reason}`. The reason is
required, one of:
- "Already handled"
- "Not relevant"
- "Wrong person"
- "Other" (with text)

For an agent recommendation it also rejects the proposal.

**Read.** `GET /work/recommendations/?scope=me|team`:
- The open items I may decide, newest first, each with the title, why,
  suggested assignee, and record.
- Items about records I cannot open are left out and counted as `hidden`.

**Settings.**
- `GET /work/settings/`: any member.
- `PATCH /work/settings/`: `manage_org_settings`. It validates the numbers, for
  example days 1–120 and a drop between 0.1 and 5.

### 2.4 Frontend

- **`/work/recommended`.** Shown to anyone with open items to decide, or with
  reports.
  - Each card shows the title, the facts as a short list, evidence links, the
    record, and the suggested person.
  - **Assign** opens a small form with the person (prefilled), due date
    (prefilled) and title.
  - **Dismiss** asks for a reason.
  - A "N more about accounts you can't open" line when items are hidden.
- **Brain › Waiting on you.** It keeps showing AI-agent proposals. Deciding
  one in either place resolves both.
- **Settings › Work › Recommendations** (new nav group **Work**, between Data
  and AI):
  - who receives recommendations (manager or owner);
  - one row per source, with an on/off switch and its threshold input;
  - the dismiss cooldown;
  - "Run now" for admins.

  Members see it read-only.

## 3. Delivery 3: tracking that pushes

### 3.1 Model

- **Task** gets `last_nudged_at` and `escalated_at`, both null.
- **WorkSettings** gets:
  - `timezone`: an IANA name, default "UTC";
  - `working_days`: a list of weekday ints, default Monday to Friday;
  - `escalate_after_days`: default 2, in working days overdue;
  - `digest_enabled`: default true;
  - `digest_hour`: 0–23, default 8.
- **User** gets `digest_opt_out`, a BooleanField. It is a personal switch,
  exposed in account settings later and in the API now.

### 3.2 Jobs

**Nudges and escalations.** `services/work/tracking.py:run(organisation,
*, now)` is called from `run_health_maintenance`, on working days only (in
the workspace timezone).
- **Nudge.** A nudge goes at most once per task per workspace-local day:
  each open overdue task whose `last_nudged_at` is before the start of the
  local day sends a `task_overdue` notification to the assignee and writes
  a `nudged` event. Nightly tracking runs only for active workspaces; the
  digest skips suspended and archived ones.
- **Escalate.** Each open task overdue by at least `escalate_after_days`
  working days, with `escalated_at` null, sends a `task_escalated`
  notification to the assignee's active manager (if there is none, the
  workspace owner), and writes an `escalated` event. It escalates once.
  Reassigning, or changing the due date, clears `escalated_at`.

**Digest.** `services/work/digest.py:send_due(now)` is called from the
`sender` loop's `deliver_pending` command.
- **When.** For each workspace with `digest_enabled`, once its local time
  passes `digest_hour`, each member without `digest_opt_out` who has anything
  to report gets one email for that local date. This is tracked by a
  `DigestSend(user, local_date)` row, unique per user and date.
- **Contents:** overdue, due today, recommendations waiting and blocked
  counts, plus up to 5 named items, all through the reader's visibility. It
  links to `/work/today`.
- **Without SMTP.** If `EMAIL_BACKEND` is the console or locmem backend in
  production, or sending raises, the digest is logged as skipped and nothing
  else breaks.

**Timezone.** "Today" and "overdue" in every Work endpoint move to the
workspace timezone.

### 3.3 Settings and frontend

**Settings › Work:**
- **Tasks:** escalate after N working days; the timezone (a select of IANA
  names); working days.
- **Notifications:**
  - the digest on or off, and its hour;
  - a status line, "Email isn't set up on this server yet: digests are
    skipped", shown when the backend reports no SMTP via
    `GET /work/settings/`, field `email_ready`.
- **Briefs** moves from AI into Work › Notifications (`/settings/brief-delivery`
  keeps its URL).

**The bell.** `NotificationKindIcon` gets icons for `task_assigned`,
`recommendations_waiting`, `task_overdue` and `task_escalated`. Clicking one
opens the task panel or Recommended.

## 4. Privacy

**Lists and counts.** Every Work list and count is the twice-filter
(`visible_tasks` ∧ `visible_customers`/`visible_accounts`), built from
`id__in` subqueries. Items outside it are counted, never named.

**Recommendations.**
- Their recipient and suggested assignee must be able to open the record. This
  is checked at creation and again at decision time.
- If either has lost access by decision time, deciding still works for the
  decider, but the Assign picker only offers people who can open the record.

**Notifications.**
- `message` is rendered for its recipient. It names the record only if the
  recipient can open it. Otherwise the wording is generic, e.g. "A task on an
  account you can't open is overdue".
- Escalations to a manager follow the same rule.

**Digest.** Built per reader through the same functions as `/work/today` and
`/work/recommendations/`.

## 5. Edge cases

**People leaving or changing:**
- **Deactivated assignee.** Tasks keep the assignee and show as "Unassigned
  (was X)" in Team. They are not nudged, and they escalate straight to the
  manager.
- **No owner and no manager.** The fallback recipients in §2.2 apply. A
  recommendation is never dropped.
- **Reassign.** The new assignee is notified. The previous one gets only an
  `assigned` event. Assigning to yourself does not notify.

**Decisions:**
- **Two deciders at once.** The first wins; the second gets 409
  `ALREADY_DECIDED` with the decider's name.
- **Completed tasks** are never nudged or escalated. Re-opening a task clears
  `escalated_at`.
- **Assigned, dismissed or expired recommendations** are never notified about
  again.

**Running and timing:**
- **Daily job run twice.** No duplicates (the unique constraint plus upsert,
  and the nudge and escalate guards).
- **Weekends and non-working days** don't count toward escalation, and no
  nudges are sent on them.

## 6. Testing

**Backend** (TDD; run with `--parallel` as CI does):
- **Recommendation sources.** Each source at its threshold, one below and one
  above.
- **The recommendation lifecycle.**
  - The open-unique rule, expiry, the cooldown, and re-raising when a signal
    worsens.
  - The routing ladder (function owner → owner → manager → fallbacks), and the
    "can open the record" checks.
- **Deciding.**
  - Who may decide, and the race between two deciders (two connections).
  - An agent recommendation creates exactly one task through `approve`.
- **Task fixes.**
  - All four creation paths store the FK, write their event and notify.
  - The AI agent's name matching and its fallback.
  - PATCH writes the right event for each field, and refuses
    `ASSIGNEE_CANNOT_OPEN`.
- **Tracking.**
  - Nudge and escalate across timezones and weekends; the once-only
    guarantees.
  - The digest at the local hour, once per day, skipped without SMTP, and
    honouring opt-out.
- **Privacy.** Every endpoint is tested with a member, a manager, a view-all
  user, and a user without access: counted, not named.
- **Postgres 16.** A no-DISTINCT test over `services/work`.

**Frontend** (Vitest and Testing Library):
- Today, Recommended and Team, each with loading, empty, error and
  hidden-count states.
- The task panel: every edit, Blocked with its reason, the assignee picker's
  disabled people, comments, and the activity trail.
- The Settings › Work forms, admin versus member.
- The sidebar badge.
- The bell's new kinds.
- Phone width.
- An end-to-end test: a recommendation is assigned, the task appears in Today,
  is marked done, and leaves the badge.

**Docs.** The six product docs are updated in the same PRs.

## 7. Out of scope

- **"Not in the room"**: AI extraction from emails, calls and tickets. That is
  round 2, feeding `Recommendation` with a new kind.
- **AI next-step text** on recommendations (approach C).
- **Agent actions**, such as drafting a reply or updating a ticket. That is the
  Agents round.
- Subtasks, watchers, custom statuses.
- Slack DMs for assignments.
- Push to mobile.
- Account-settings UI for `digest_opt_out` (the API exists).
- Production SMTP. It is the owner's to provide; digests switch on when it
  exists.
