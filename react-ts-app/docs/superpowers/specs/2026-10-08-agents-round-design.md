# Agents: actions with approvals (round 1)

**Owner's request (2026-10-08).** Revenact's agents should do real work inside
the product, not only suggest tasks:

- **Act inside the product.** Agents change records and tasks, file notes,
  draft replies and start plans.
- **Build.** Agents notice something in the business and build the response: a
  scenario (rule), a segment, a campaign, a plan or a canvas. A person then
  launches it.
- **Stay governed.** Settings decides what each agent may do, Activity shows
  everything it did, and undo reverses it.

Settings round 1 (2026-10-06) left room for an **Agents** group; this is that
round. It builds on the Work round: recommendations, task events,
`WorkSettings`, and the nudge and notification patterns.

**Decisions taken in brainstorming (2026-10-08):**

| Question | Decision |
|---|---|
| Scope | **Internal actions first.** Agents only act inside Revenact. Nothing leaves the product unless a person sends it. Write-back to connected tools and talking to customers are later rounds. |
| Builder reach | **The agent builds drafts and a person launches them.** Scenarios, campaigns and canvas are created switched off or unsent. Segments and internal plan templates may go live directly when Actions & approvals allows it. Anything that reaches customers always needs a person. |
| Triggers | **A nightly pass plus on demand.** One pass per workspace each night, after health, signals and Recommended are fresh. "Ask the agent" (Run now) still works at any time. |
| Agent shape | **One agent per function.** CS, Sales and Ops. Each agent has its own switch, allowed actions and credit budget. |
| Approver | **The record owner or anyone above them, or view-all**, as for today's proposals and Work recommendations. Builder drafts go to a manager in the agent's function, or to view-all (§3). |
| Undo | **7 days.** It restores exactly what changed, unless someone has changed that thing since. |
| Defaults | **Everything on Ask, agents on.** Each agent gets a monthly credit budget (20% of the plan's credits, split across the three). |
| Engine | **Approach A: one structured call per agent per pass, checked against a registry.** A tool-using loop may come later. |

Three deliveries, each with its own plans and its own backend and frontend PRs,
merged backend first:

1. **The action layer and its controls:**
   - the agents and their nightly pass;
   - the registry, with today's proposals moved onto it;
   - record changes, task changes and notes;
   - Settings › Agents;
   - Activity with undo;
   - budgets.
2. **Drafts:** reply drafts, and starting plans.
3. **The builder:** segments, scenarios, campaigns, canvas and plan templates.

## 0. What exists

Backend origin/main 2026-10-08 (after Work delivery 3), frontend 86d38fe.

**The AI agent** (`services/metrics/proposals.py`):

| Part | Today |
|---|---|
| Evidence | `build_evidence` gathers metrics, signals, cuts by owner and product, the top 8 at-risk accounts with their account teams, members and open initiatives. |
| Generation | `generate_proposals` makes one Claude call that returns 2 to 5 proposals. `_validate` drops anything that names something outside the evidence. |
| Action kinds | Two (`Proposal.Kind`): `task` `{customer_id, title, assignee, due_in_days, priority}` and `initiative` `{metric, dimension, member, target_value, target_by}`. |
| Running | On demand only: `POST /metrics/proposals/generate/` (view-all) and Brain's "Ask the agent". There is no schedule. |
| Other producers | `services/metrics/facilitator.py` writes proposals from closed Copilot sessions. |
| Deciding | `approve` and `reject` run under row locks. `brain/waiting.decided_as` sets who decides (owner, chain or company). |
| Approval result | A task is made through `add_task(source=AGENT)` and the assignee is notified, or an initiative through `initiatives.create_initiative`. A `Feedback` row is written. |
| Where people decide | Brain › Waiting on you, and Work › Recommended (`Recommendation.Kind.AGENT`, one per proposal; deciding in either place settles both). |
| Undo | None anywhere. |

**Settings:**
- `Organisation.ai_agent_enabled` and `ai_agent_tone` live on Settings › AI agent.
- The switch blocks Copilot, anomaly detection, AI attributes and knowledge. It does **not** block proposals.

**Budgets:**
- `copilot/usage.py`: `ModelBudget` is per organisation, per purpose, per month, in tokens.
- Billing credits (`billing/credits.py`, `CreditLedger`) charge per model call.
- Nothing is per agent.

**Write paths agents will reuse:**
- the task PATCH logic (`customers/task_changes`);
- lifecycle and owner changes (audited);
- attribute values;
- `Note`;
- plans (`plans/views`, templates);
- segments, rules, campaigns and canvas services (Impact);
- personal mailboxes (compose, drafts).

**Rules that bind this round** (the same as the Work round):
- **Postgres 16:** use `id__in`, never a join plus DISTINCT.
- **The twice-filter:** visibility is checked on the object and on its record.
- **Counted, not named.**
- **Tokens only** in the UI.
- **No setting for a feature that does not exist.**

## 1. Delivery 1: the action layer and its controls

### 1.1 Agents

**`AgentProfile`** (one per workspace and kind, made the first time it is
needed):
- `kind`: `cs`, `sales` or `ops`.
- `enabled`: default true.
- `monthly_credits`: default `round(plan.monthly_credits * 0.2 / 3)`.
- `last_run_at`
- `last_run`: `{proposed, applied, dropped, skipped_reason}`.

**Book** (what each agent looks at):

| Agent | Records it looks at |
|---|---|
| **CS** | Organisations and accounts whose `owner.function` is CS. |
| **Sales** | Organisations and accounts whose `owner.function` is Sales. |
| **Ops** | The whole workspace. It takes over today's agent: initiatives and workspace-level tasks. |

A record with no owner belongs to Ops only. Books are built with `id__in`
subqueries.

**What an agent acts as.**
- Agents are not users. Every action records `agent=<kind>` with `actor=None`, the same pattern as `SystemActor`.
- The evidence an agent reads is what that function's members may open, the union of their visibility. An agent therefore never sees more than the people it works for.

### 1.2 The nightly pass

`services/agents/run.py:run(organisation, kind, *, now)` is called from
`run_health_maintenance`, just **before** Recommended (`recommend.refresh_all`), so Recommended routes the night's new actions in the same pass:

1. Skip the agent when:
   - the workspace's `ai_agent_enabled` is off;
   - the agent is disabled;
   - every action kind is Never for this agent;
   - the agent's budget for the month is spent ("budget");
   - the workspace's credits are exhausted ("credits").

   Record the reason in `last_run.skipped_reason`.
2. Build the evidence for the agent's book. This is the existing `build_evidence`, cut to the book, plus the per-kind inputs the registry asks for (current lifecycle, attribute values, open tasks with due dates, recent notes).
3. Make **one** model call (purpose `agent_<kind>`). The prompt lists the kinds the agent may use, meaning those not set to Never. It returns at most 8 actions as JSON.
4. Drop each action that:
   - fails `validate`;
   - names anything outside the evidence;
   - uses a kind that is Never for this agent;
   - duplicates an open action (same kind, record and field);
   - repeats one rejected or undone in the last 14 days with the same payload.
5. Create each surviving action. Under **Auto** it is `applied` at once (`apply`). Under **Ask** it is `proposed` and routed to an approver.
6. Charge the call to the agent's budget. Update `last_run`.

Each workspace and each agent fails on its own. Exceptions are logged by class
name only.

**Run now.** `POST /agents/<kind>/run/` (admin or view-all) runs the same path
immediately and returns `last_run`. Brain's "Ask the agent" calls it for Ops.

### 1.3 `AgentAction` and the registry

**`AgentAction` fields:**
- `organisation`, `agent`, `kind`
- `customer` or `account` (the record; both null for workspace-level kinds)
- `title`, `rationale`, `evidence[]`, `payload`
- `before`: the values it will change, captured at apply time
- `status`: `proposed`, `applied`, `rejected`, `expired` or `undone`
- `decided_by`, `decided_at`, `decision_note`
- `applied_at`, `undone_by`, `undone_at`
- `result`: for example `{task_id}` or `{note_id}`
- `created_at`

There is one open action per kind, record and field. This is a partial unique
constraint over `proposed` rows.

**Registry.** `services/agents/actions/<kind>.py`, each exposing:

| Member | Job |
|---|---|
| `validate(payload, evidence)` | Checks the shape. Every id must appear in the evidence. |
| `preview(action, reader)` | The before and after shown in the UI, written for the reader. |
| `apply(action, actor)` | Runs through the same write path a person uses, so every rule, event, audit row and notification fires as normal. Captures `before`. |
| `undo(action, actor)` | Restores `before`. Refuses with `CHANGED_SINCE` when the current value no longer equals what `apply` set. |
| `approvers(action)` | Who may decide it (§1.4). |
| `max_level` | The furthest Actions & approvals may go: `auto`, `ask` or `never`. |
| `agents` | Which agents may use this kind. |

**Round-1 kinds:**

| Kind | Payload | Max | Agents |
|---|---|---|---|
| `record.lifecycle` | `{stage}` | auto | CS, Sales |
| `record.owner` | `{owner_id}` (an active member who can open the record) | **ask** | CS, Sales |
| `record.attribute` | `{attribute_id, value}` (workspace attributes only, valid for the attribute's type) | auto | CS, Sales |
| `task.create` | `{title, assignee_id, due_date, priority}` (today's) | auto | all |
| `task.reassign` | `{task_id, assignee_id}` | auto | all |
| `task.redate` | `{task_id, due_date}` | auto | all |
| `task.complete` | `{task_id, evidence_ref}`: must cite an evidence item showing the work is done | ask | all |
| `task.snooze` | `{task_id, until, reason}` | auto | all |
| `note.create` | `{title, body}` | auto | all |
| `initiative.create` | today's initiative payload | ask | Ops |

**Moving today's proposals over.**
- `Proposal` is renamed `AgentAction` in place (same table, same ids), and its rows become:
  - kinds `task.create` and `initiative.create`, agent `ops`;
  - `proposed` stays `proposed`;
  - `approved` becomes `applied`, with `result` kept;
  - `rejected` stays `rejected`.
- `Recommendation.proposal` becomes `Recommendation.agent_action`, and the recommendation kind `agent` is renamed `agent_action`.
- `/metrics/proposals/…` stays for one release as a thin wrapper over the new endpoints, then goes away.
- The facilitator writes `AgentAction` rows (agent `ops`).

### 1.4 Deciding

**Who decides.** For a record's action: its record owner, anyone above that
owner, or a reader with `view_all_accounts`. This is `brain/waiting.decided_as`
generalised. For a workspace-level action (`initiative.create`): view-all.

**Where it is decided.**
- A `proposed` action is a Work › Recommended item of kind `agent_action`, with its preview, rationale and evidence. It also appears in Brain › Waiting on you.
- Deciding in either place settles both.
- Recommended's routing and notification run unchanged (`recommendations_waiting`).

**The API:**
- `POST /agents/actions/<id>/approve/` takes an optional body. For `task.*` kinds it may carry overrides (assignee, due date, title), as Assign does today.
- `POST /agents/actions/<id>/reject/` takes `{note}`.
- Both run under a row lock, and both are audited.
- The errors match Recommended:
  - 404 when the reader cannot open the record;
  - 403 `CANT_DECIDE`;
  - 409 `ALREADY_DECIDED`, with the name of whoever decided;
  - 409 `EXPIRED`.

**Expiry.** A `proposed` action expires:
- when the field it would change no longer equals the evidence's value, checked at decision time and at the next pass;
- when the agent's next pass does not propose it again;
- when its kind is set to Never;
- after 14 days.

### 1.5 Undo

`POST /agents/actions/<id>/undo/` works for 7 days after `applied_at`.
- **Who may undo:** anyone who could have approved the action.
- **When it refuses:** with `409 CHANGED_SINCE` (both values in the body) when the thing has changed since, and with `410 UNDO_EXPIRED` after 7 days.
- **What it does:**
  - `record.*`: restores the old value through the same write path, so the change appears in history like any edit.
  - `task.create`: deletes the task only if it has no comments, no events after `created`, and is not completed. Otherwise it refuses with `CHANGED_SINCE`.
  - `task.reassign`, `task.redate`, `task.snooze`, `task.complete`: restore the old value or status.
  - `note.create`: deletes the note unless it has been edited.
  - `initiative.create`: closes the initiative if nothing is linked to it yet.
- **Who is told.** Undo writes `undone_by`/`undone_at` and an Activity entry. It notifies whoever approved the action, or the record owner when it ran on Auto, with the new kind `agent_action_undone`. The notice names the record only if the recipient can open it.
- An undo cannot itself be undone; the person simply makes the change again.

### 1.6 Actions & approvals

**`AgentPolicy`** (one per workspace, made with the defaults when first needed):
- `levels`: `{agent: {kind: "auto"|"ask"|"never"}}`. A missing entry means **ask**. A stored value above the kind's `max_level` reads as `max_level`.
- `updated_by`, `updated_at`

**API:**
- `GET /agents/settings/` (any member) returns:
  - the agents (switch, budget, this month's spend, last run);
  - the grid;
  - each kind's label, example and `max_level`;
  - `can_edit` (`manage_org_settings`).
- `PATCH /agents/settings/` (admin) accepts any subset. It validates levels against `max_level` and budgets as whole credits from 0 to the plan's monthly credits. Every problem comes back at once, and the change is audited.

### 1.7 Budgets

- Each agent's model calls are charged to the workspace credits as today, purpose `agent_<kind>`.
- They are also counted against `AgentProfile.monthly_credits` by summing that purpose's ledger rows this month.
- A pass that would exceed the agent's budget is skipped (reason "budget").
- The workspace credit limit still applies on top.
- Settings shows spend against budget per agent, and the reset date, which is the first of the next month in the workspace timezone.

### 1.8 Frontend

**Settings › Agents** is a new group in `WORKSPACE_SETTINGS_NAV`, after Work.
- **Agents** (`/settings/agents`):
  - The workspace AI switch and tone move here from Settings › AI agent. The old URL redirects.
  - One card per agent, showing its switch, budget (an input, plus a bar of this month's spend), last run ("Last night: 4 proposed, 1 applied"), and **Run now**.
  - A skipped run explains why: "Budget used up: resumes on 1 Nov".
- **Actions & approvals** (`/settings/agent-actions`):
  - A grid with kinds as rows and agents as columns. Each cell is a select of Auto, Ask or Never, limited by `max_level`.
  - Cells for kinds an agent cannot use show "Not used".
  - An "What each action does" list sits below the grid.
  - Admins get the form with one primary, Save changes. Members get text.

**Work › Activity** (`/work/activity`) is a new tab in Work.
- It lists every agent action, newest first, with filters for agent, kind, status and record.
- Each row shows:
  - the agent's name;
  - the preview ("Lifecycle: Healthy → At risk on Dough Co");
  - the status;
  - who decided it, or "Auto";
  - when;
  - **Undo** while it is allowed.
- A `CHANGED_SINCE` refusal shows both values.
- Rows about records the reader cannot open are counted in a hidden line.

**Work › Recommended** renders `agent_action` items with the preview, rationale and evidence, and the agent's name as the source. Approve becomes "Apply" (or "Assign" for `task.create`); Dismiss becomes "Reject".

**Brain › Waiting on you** renders the same items through the shared component.

**The bell** gets an icon for `agent_action_undone`.

## 2. Delivery 2: drafts and plans

These are new kinds in the same registry, grid, Activity and undo.

**Owner decisions (2026-10-08).** Research found that no connected provider can hold a draft: Gmail is read and send only, Microsoft is `Mail.Read`/`Mail.Send`, and IMAP has no APPEND. No ticket connector writes back either. The owner's direction is that Revenact becomes the one place people communicate, with mail and ticket tools connected both ways in a later "two-way connectors" round. Until then:

- **Drafts live in Revenact.** Mail drafts are listed in Communications' Drafts, where a person can edit, send or discard them. Send uses today's send path. A ticket draft is shown on its ticket: a person copies it into the source tool and marks it sent. The two-way round will sync drafts into the real mailbox and send ticket replies.
- **Only source readers see a draft reply.** An action is listed, previewed and decided only by people who may read its source email or ticket. Everyone else has it counted, never named.
- **Undoing an agent-started plan returns it to Draft.** Its tasks are deleted, only while none is done. The plan stays on the record, editable, with its history. Starting a Draft recreates its tasks.

The binding detail is the backend contract `docs/superpowers/plans/2026-10-08-agents-drafts-api.md`.

**`draft.reply`** `{email_id | ticket_id, body}`:
- The agent writes a reply to the record's newest unanswered customer email, from the record owner's connected mailbox, or to the record's newest open ticket the owner may read.
- **Applied means a draft exists**: a Revenact reply draft owned by the record owner, who is told (`agent_draft_ready`).
- The agent never sends anything. A person sends the draft (email) or copies it and marks it sent (ticket).
- Max level: auto.
- Undo deletes the draft unless it was sent or edited since.
- An email draft works only when the owner has a connected mailbox. Without one, the action is dropped at validate.
- A draft never names a task or note title, because it goes to a customer.

**`plan.start`** `{template_id}`:
- Starts a plan from a built-in or workspace-shared template on a record, through the existing plans service.
- Max level: ask.
- Undo returns the plan to Draft while none of its tasks is done.

**Delivery 1 follow-ups:**
- Hidden and removed tasks send `task.id: null`.
- The legacy `/metrics/proposals/*` routes are removed.
- The Ops agent's figures are read without DISTINCT.
- A reply sent from Revenact threads on its original.

## 3. Delivery 3: the builder

Mostly the Ops agent; function agents work within their own book.

**Who decides builder kinds.** They span records, so record ownership doesn't
decide them:
- **Ops agent:** any reader with `view_all_accounts`.
- **CS and Sales agents:** any active member of that function who has reports,
  or any view-all reader. When nobody qualifies, the workspace owner decides.

| Kind | Created as | Max | Undo |
|---|---|---|---|
| `segment.create` | A live segment (filters, name, why) | auto | Deletes it if unedited and unused by a rule or campaign |
| `scenario.create` | A rule, **switched off**, with its trigger and actions | ask | Deletes it while still off and unedited |
| `campaign.create` | A campaign **draft**: audience, wording, schedule, unsent | ask | Deletes the draft while unsent and unedited |
| `canvas.create` | A canvas laid out from the records and links in the evidence | auto | Deletes it if unedited |
| `plan.template` | A reusable internal plan template | auto | Deletes it if unused |

- **A person launches anything that reaches customers.** That means sending a campaign, or switching on a rule with survey or campaign actions. "Applied" for these means only that the draft exists.
- Builder kinds have the same privacy as their objects: a segment or campaign shows the reader only records they can open.

## 4. Privacy

- **Lists and counts.** Every Activity, Recommended and Waiting list uses the twice-filter: the action's own rule, and a record the reader may open, both built from `id__in` subqueries. An action about a record the reader cannot open is counted, never named.
- **Evidence and rationale.** These are shown only to readers who may open the record. This matches Brain delivery 2: evidence goes only to people allowed to see it.
- **The model only sees the agent's book.** Evidence is built through the union of what the function's members may open. Validation drops any id outside it.
- **Notifications** name a record only to a recipient who can open it.

## 5. Edge cases

- **The record changed before anyone decided:** the action expires, with the reason "Changed since".
- **The same kind, record and field from two passes:** the open action is kept. If the new payload differs, the old action expires and the new one replaces it.
- **The approver lost access:** routing moves to the next person up, as in Recommended. Someone who can no longer open the record gets a 404.
- **An agent is switched off:** its pending actions stay decidable. Its next pass does not run.
- **A kind is set to Never:** pending actions of that kind expire.
- **The budget runs out mid-month:** the pass is skipped. Run now refuses with `BUDGET_USED`, which names the reset date.
- **The nightly pass runs twice:** the duplicate rule and the unique constraint make the second run a no-op for unchanged actions.
- **Deactivated people:** an action never assigns or routes to an inactive member. A `task.reassign` to someone deactivated before approval expires.
- **The model returns junk:** the pass records `dropped`. It is never fatal.

## 6. Testing

**Backend:**
- **Each kind:** validate, apply, undo, `CHANGED_SINCE`, `max_level`, and which agents may use it.
- **The nightly pass, with a mocked model call:**
  - each skip reason;
  - the drop rules;
  - Auto versus Ask;
  - budget charging;
  - one workspace or agent failing without stopping the others;
  - running twice.
- **Deciding:** who may decide, the race between two deciders, overrides, expiry, and settling in both places.
- **Undo:** the window, who may undo, the refusals, and the notification.
- **The migration** from `Proposal` and recommendations of kind `agent`.
- **Privacy:** every endpoint with a member, a manager, a view-all reader and a stranger.
- **Postgres 16:** a no-DISTINCT test over `services/agents`.

**Frontend:**
- **The pages:** Settings › Agents (cards, Run now, budget), Actions & approvals (the grid with its caps, admin versus member) and Activity (filters, Undo, `CHANGED_SINCE`, hidden count). Each covers loading, empty and error states.
- **Rendering:** Recommended and Waiting with `agent_action` items, the bell kind, and phone width.
- **An end-to-end journey:** an agent proposes a lifecycle change, the owner applies it in Recommended, it shows in Activity, and it is undone.
- **Docs:** the six product docs are updated in the same PRs.

## 7. Out of scope

- Write-back to connected tools (Zendesk, Jira, Slack, CRM fields).
- Agents that send anything to customers. Drafts are the limit.
- Waking agents on signals as they happen. The nightly pass and Run now are the only triggers.
- Admin-defined custom agents, and per-agent prompts.
- A tool-using agent loop (approach B).
- Account-settings UI.
