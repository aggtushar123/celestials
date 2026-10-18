# Work: one place for everything you need to do

Date: 2026-10-12. Status: approved 2026-10-12. Owner: D1 and D2 merge back-to-back (no 'Ask the agent' gap in production).
Repos: revenact-backend and react-ts-app. Two deliveries, each a backend PR merged before its frontend PR.

## 1. Why

Things a person must do are spread over several surfaces, and the same item often shows in more than one:

| Item | Shown today in |
|---|---|
| Your tasks | Work › Today, Copilot home "My Tasks", record pages |
| Recommendations | Work › Recommended |
| Agent actions waiting for approval | Brain › Waiting on you **and** Work › Recommended (a `Recommendation(kind=agent_action)` mirrors each one); Work › Activity read-only |
| Overdue tasks | Work › Today, Brain › Waiting (`overdue_task`), a `Recommendation(kind=overdue_tasks)`, the bell |
| Questions for you | Brain › Waiting, Communications "Questions for you", Copilot sidebar, a `Recommendation(kind=open_questions)` |
| Rule reviews | Brain › Waiting only |
| Agent reply drafts | Communications › Drafts |

The Work badge and the Brain badge count some of the same items. A person also cannot write a to-do for themselves: `Task` must belong to exactly one organisation or account (`task_belongs_to_exactly_one_parent`).

**Goal:** Work is the one place for everything a person needs to do: tasks, personal to-dos, approvals, rule reviews, questions, drafts ready to send, and suggestions. One list, one badge.

## 2. Owner decisions (2026-10-12)

1. **Scope:** Work owns every item. Brain › Waiting on you is removed (Brain keeps What changed, What's being done, What customers are saying). Settings › Work stays in Settings as admin configuration, linked from a gear on Work for admins.
2. **Personal to-dos:** the record is optional. A to-do with no record is private to its creator. With a record it is a normal task under today's rules.
3. **Layout:** one feed grouped by urgency, decisions on top, filter chips by kind. Tabs: My work · Team · Activity. Recommended stops being a tab and becomes the "Suggested" group.
4. **Duplicates:** Work is the home. Copilot's "My Tasks" and "Questions for you" become one "Next up" card that reads the feed. Communications keeps "Questions for you" and Drafts (mail flow), and drafts also show in My work. The overdue-tasks, open-questions and agent-action recommendation kinds are retired. Dashboard "Needs attention" stays. One badge, on Work.
5. **Team view:** My work is only your desk. Work › Team (managers, view-all, Leadership) gets a My team / Company switch and a "Waiting on your team" queue with the same actions where allowed, above today's per-person counts.
6. **Approach A:** one feed endpoint composed over the existing models. No new item table, no client-side merge.

## 3. Personal to-dos (data and privacy)

**Model changes to `customers.Task`:**
- `customer` and `account` both nullable. The CheckConstraint becomes `task_at_most_one_parent` (not both set).
- `due_date` nullable. A task with no date lands in the "No date" group and is never nudged or escalated (`work.tracking` skips null dates).
- No new fields. A task with neither record is a **to-do**. There is no separate flag.

**Visibility of a to-do (no record):**
- Visible only to `created_by`. `assignee` must equal `created_by` (the server rejects anything else with 400 `{"assignee": ["A to-do without a record can only be yours."]}`).
- Not visible to managers, view-all or Leadership. `customers.personal.visible_tasks` adds this rule before the existing chain and view-all branches.
- Not counted in Work › Team totals or the Team queue.

**Where to-dos stay out:**
- Agents: no `task.*` action may target a to-do. The agents' book loader only reads tasks with a record, and `validate` refuses a to-do id.
- Copilot tools, record feeds, exports and the brief: they read tasks through records, and a test pins that to-dos are absent.
- The daily digest counts your own to-dos in your own digest only.

**Creating:**
- `POST /work/todos/` with `{title, due_date?, priority?, customer_id? | account_id?, assignee_id?}`.
  - With no record it makes a to-do, and `assignee` defaults to the caller.
  - With a record it is equivalent to the existing record task endpoints, and their rules apply (assignee must be able to open the record).
- The existing `/customers/{id}/tasks/` and `/accounts/{id}/tasks/` endpoints stay.
- Editing, completing and blocking a to-do use the existing `PATCH /tasks/{id}/`. Attaching a record to a to-do later is allowed. It then follows record rules.

**Not included:** snooze, recurring to-dos, sub-tasks, lists or projects.

**Migration:** alter the constraint and nullability only. Existing rows are untouched, and a test pins that every existing task still has exactly one record.

## 4. The feed (backend)

### 4.1 `GET /work/feed/`

Returns the caller's desk:

```
{
  "groups": [
    {"key": "decide", "count": 3, "items": [...], "next": null},
    {"key": "overdue", ...}, {"key": "today", ...}, {"key": "week", ...},
    {"key": "later", ...}, {"key": "no_date", ...}, {"key": "blocked", ...},
    {"key": "suggested", ...}
  ],
  "hidden": 2,
  "failed": []
}
```

Every item has this shape:

```
{
  "key": "agent_action:41",           // kind:id, stable
  "kind": "approval" | "rule_review" | "question" | "draft" | "task" | "todo" | "suggestion",
  "id": 41,
  "title": "Move Acme to At risk",
  "record": {"type": "customer" | "account", "id": 7, "name": "Acme"} | null,
  "from": {"type": "agent" | "rule" | "person" | "revenact", "label": "CS agent"},
  "at": "2026-10-11T09:00:00Z",       // created/asked/proposed
  "due_date": "2026-10-12" | null,    // tasks only
  "priority": "high" | "medium" | "low" | null,
  "private": true | false,            // to-dos
  "actions": ["approve", "reject"]    // what this reader may do
}
```

| kind | Source | Group | actions → existing endpoint |
|---|---|---|---|
| approval | `AgentAction` status proposed on the reader's Me desk (`brain.desk.agent_actions(reader, "me", sessions)`) | decide | approve / reject → `/agents/actions/{id}/approve|reject/` |
| rule_review | `RuleReview` waiting (`brain.desk.rule_reviews`) | decide | approve / skip → existing review decision endpoints |
| question | `knowledge.Question` open, assigned to reader (`brain.desk.questions`) | decide | answer, in place (client) |
| draft | agent `ReplyDraft` ready to send that the reader may read | decide | open → Communications draft (client) |
| task | open `Task` with a record, assignee = reader (as `work.today.build`) | overdue/today/week/later/no_date/blocked by `work.today.bucket`, extended with no_date | done → `PATCH /tasks/{id}/`; open → task panel |
| todo | open `Task` with no record, created_by = reader | same as task | done; open |
| suggestion | `Recommendation` waiting for the reader, kinds renewal_due, health_drop, urgent_tickets, anomaly | suggested | add / assign / dismiss → `/work/recommendations/{id}/assign|dismiss/` ("add" = assign to self) |

**Rules:**
- **Privacy:** the desk functions and `visible_tasks` are reused unchanged, so no reader sees more than today. Items on records the reader can no longer open add to `hidden` and are never named.
- **Order:** "decide" oldest first. Task groups by due date, then priority (high first), then created.
- **Paging:** each group returns its first 50 items, `count`, and `next` (an opaque cursor). `GET /work/feed/?group=<key>&cursor=<next>` returns one group's next page.
- **Filter:** `?kind=approval,rule_review` limits groups and counts to those kinds. The chip "Approvals" maps to approval + rule_review.
- **Partial failure:** each source is built in its own try block. A failed source adds its kind to `failed` and is absent from groups. The response is still 200.
- **Performance:** the query count is constant in the number of items (pinned in a test, ceiling set after measuring). No `DISTINCT` on joins (PG16 rule, see backend notes).

### 4.2 `GET /work/feed/count/`

Returns `{"decide": n, "overdue": n, "badge": decide + overdue}`. Suggestions are not in the badge. This replaces the Work badge's two calls and `/brain/waiting/count/`.

### 4.3 Team queue: `GET /work/feed/team/?scope=team|company`

- Same item shape. The decide kinds (approval, rule_review, question), overdue tasks and suggestions (`Recommendation` waiting on people in scope, as today's `/work/recommendations/?scope=team`; actions assign / dismiss) for the people in scope, using the desk functions with `scope` = team or company. (Owner 2026-10-12: suggestions join the Team queue.)
- Each item adds `"for": {"id", "name"}`. `actions` are only those the reader may take (a manager may decide an agent action on a report's record if today's approver rule allows. Otherwise the row is read-only).
- To-dos never appear.
- Access matches today's Team tab: has reports, view-all or Leadership. Company scope needs view-all or Leadership. Everyone else gets 403.

### 4.4 Retired recommendation kinds

- `overdue_tasks`, `open_questions` and `agent_action` stop being produced (removed from `work.sources` and the refresh).
- Their waiting rows are closed by a data migration with status dismissed, reason `retired`.
- Their WorkSettings source toggles are removed from the API and from Settings › Work › Recommendations.
- The cross-settlement between a Recommendation and its AgentAction (`work/recommend.py`) is deleted.

### 4.5 Removed

- `GET /brain/waiting/` and `/brain/waiting/count/` are removed in delivery 2. The `brain.desk` functions stay as the feed's building blocks.
- `GET /work/today/` stays until delivery 2's frontend no longer calls it, then is removed.

## 5. The Work page (frontend)

**Routes:**
- `/work` → `/work/mine` (My work), `/work/team`, `/work/activity`.
- Redirects keep the query string: `/work/today` → `/work/mine`; `/work/recommended` → `/work/mine?kind=suggestion`; `/brain/waiting` → `/work/mine?kind=approval`.

**My work:**
- **Quick-add box** at the top: type a title, Enter adds a private to-do due "No date". A "More" disclosure gives record picker, due date, priority, and assignee (assignee only once a record is chosen). The old NewTaskSheet is replaced by this form, opened from record pages with the record prefilled.
- **Filter chips:** All · Tasks · To-dos · Approvals · Questions · Suggested. The chip lives in the URL (`?kind=`).
- **Groups** in the order: Needs your decision · Overdue · Today · This week · Later · No date · Blocked · Suggested. Empty groups are hidden. Each group has its count and "Show more".
- **Rows:**
  - Every row has an icon by kind, a title, the record link, a from/at or due line, and inline buttons per `actions`.
  - Approval rows reuse `AgentActionDecision`. Rule review rows reuse `ReviewDecision`. Question rows: Answer opens a box in the row and the answer is sent from there (the row leaves with a toast; owner 2026-10-13, after the Chrome test), with a quiet "Open thread" link to the organisation's Knowledge tab when the question is on one. Draft rows: Open draft goes to Communications. Task and to-do rows: a Done checkbox, and the row opens the existing task panel. Suggestion rows: Add to my work / Assign / Dismiss.
  - To-dos show a lock icon with "Only you".
- **After an action:**
  - The row leaves with a toast, with Undo where an undo exists (task done → reopen; agent action → existing 7-day undo). The toast takes focus. After Show more, focus moves to the first new row.
  - A 409 "already decided" removes the row with "Already decided by <name>."
- **Partial failure:** a failed kind shows "Couldn't load approvals · Try again" in its group's place. The rest of the page renders.
- **Empty:** "Nothing waiting on you." with the quick-add box still shown. Under a chip it names that kind ("No approvals waiting.") with a "Show all" link, since other kinds may still wait.
- **Phone:** single column. Buttons beyond the first move into the row menu.
- A gear (Settings › Work) shows for people who can manage workspace settings.

**Team:**
- A My team / Company switch (Company for view-all or Leadership). "Waiting on your team" lists `/work/feed/team/` items with a "for <person>" line and the allowed buttons.
- Today's per-person counts and drill-down stay below.
- "Ask the agent" (run the Ops agent) moves here from Brain › Waiting, Company scope, view-all only.

**Activity:** unchanged.

**Elsewhere:**
- **Brain:** the Waiting on you tab and its badge are removed. Its links go to `/work/mine?kind=approval`.
- **Copilot:** the home's "My Tasks" and the sidebar's "Questions for you" become one "Next up" card. It shows the first 5 feed items (decide first, then overdue, then today) and an "Open Work" link. Its buttons act in place, with My work's toast and Undo.
- **Communications:** unchanged ("Questions for you" and Drafts stay).
- **Dashboard:** "Needs attention" unchanged.
- **Sidebar:** one badge on Work from `/work/feed/count/` `badge`. The Brain badge is removed.
- **Bell:** notifications that linked to Brain › Waiting or Work › Recommended link to `/work/mine` with the item's kind filter.
- **Settings › Work › Recommendations:** the three retired signal toggles are removed.

## 6. Errors

- Feed source failure: per-group message with Try again (above).
- Decision conflicts (409): row removed with the deciding person's name when the server returns it, else "Already decided."
- Quick-add failure: text kept in the box, error line under it, focus stays.
- To-do with a non-self assignee: the server's 400 sentence shows under the assignee field.
- Lost access mid-session: the row's action returns 404/403 → row removed, `hidden` count goes up by one.

## 7. Testing

**Backend:**
- Feed and count, per kind.
- Ordering and grouping, including no_date.
- Paging cursor.
- Kind filter.
- Partial failure (one source raising).
- Privacy:
  - your to-dos are invisible to your manager, view-all and Leadership;
  - hidden items are counted, not named;
  - team and company scope access and 403s;
  - no to-dos in the Team queue.
- No duplicates: an overdue task appears only under overdue, and no retired recommendation kinds are produced.
- Migrations: the constraint, the nullable fields, retired rows closed.
- Agents refuse to-dos.
- Tracking skips null due dates.
- Digest counts only own to-dos.
- Query ceilings pinned for feed, count and team.
- One end-to-end API journey: create a to-do, see it in the feed, approve an agent action, finish a task, count drops.

**Frontend:**
- Unit tests for each row kind's buttons and states.
- Integration tests:
  - quick-add (plain and with record);
  - chips through the URL;
  - Show more;
  - 409 handling;
  - partial failure;
  - the redirects;
  - one badge;
  - Copilot Next up;
  - Team scope switch.
- One end-to-end journey matching the backend's.
- By eye at 1440px and 390px against a local backend on the branch.

## 8. Deliveries

1. **My work.**
   - Backend: to-do model changes and visibility, `POST /work/todos/`, `GET /work/feed/` and `/count/`, tracking/agents/digest guards, docs.
   - Frontend: My work page, quick-add, chips, groups and rows, single badge, redirects from `/work/today`, `/work/recommended` and `/brain/waiting`. Brain › Waiting tab hidden, its route redirects.
2. **Team and clean-up.**
   - Backend: `GET /work/feed/team/`, retire the three recommendation kinds (sources, settings toggles, data migration, cross-settlement), remove `/brain/waiting/*` and `/work/today/`, docs.
   - Frontend: Team queue with scope switch and Ask the agent, Copilot Next up, bell links, Settings › Work toggles removed, Brain Waiting code removed, docs (PRD, TRD, UI/UX, App Flow, Schema, Plan).

## 9. Out of scope

Snooze, recurring to-dos, sub-tasks, lists or projects, sharing a private to-do, mobile app, changes to Dashboard "Needs attention", and moving Settings › Work.
