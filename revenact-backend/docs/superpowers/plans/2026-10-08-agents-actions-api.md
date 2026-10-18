# Agents, delivery 1 ("the action layer"): API contract

**Sources:**
- Backend plan: `docs/superpowers/plans/2026-10-08-agents-actions-backend.md`.
- Spec: react-ts-app `docs/superpowers/specs/2026-10-08-agents-round-design.md`, §1 and §4 to §6.

**Conventions:**
- Every path is under `/api/v1/`.
- Every route is `IsAuthenticated`, and every body is JSON.
- Timestamps are ISO 8601 UTC, as DRF writes them.
- "This month" is the calendar month in the workspace timezone (`WorkSettings.timezone`).

## The agents

There are three agents per workspace:

| `kind` | Label | Looks at |
|---|---|---|
| `cs` | CS agent | Organisations and accounts whose owner's function is CS |
| `sales` | Sales agent | Organisations and accounts whose owner's function is Sales |
| `ops` | Ops agent | The whole workspace. This is the agent formerly called "the Ops agent" in Brain. |

Agents are not people. An action an agent took shows `agent` and has no actor.

## Shared shapes

**AgentCard** (in `GET /agents/settings/` → `agents`):

```json
{
  "kind": "cs",
  "label": "CS agent",
  "enabled": true,
  "monthly_credits": 133,
  "spent_this_month": 12,
  "resets_on": "2026-11-01",
  "last_run": {
    "at": "2026-10-08T00:40:00Z",
    "proposed": 4,
    "applied": 1,
    "dropped": 0,
    "skipped_reason": null
  }
}
```

- `last_run` is `null` when the agent has never run.
- `skipped_reason` is one of `null`, `"ai_off"`, `"disabled"`, `"no_actions"`, `"budget"`, `"credits"` or `"failed"`.

**ActionKind** (in `GET /agents/settings/` → `kinds`, in this order):

| `kind` | `label` | `max_level` | `agents` |
|---|---|---|---|
| `record.lifecycle` | Change lifecycle stage | auto | cs, sales |
| `record.owner` | Change owner | ask | cs, sales |
| `record.attribute` | Set an AI attribute | auto | cs, sales |
| `task.create` | Create a task | auto | cs, sales, ops |
| `task.reassign` | Reassign a task | auto | cs, sales, ops |
| `task.redate` | Change a task's due date | auto | cs, sales, ops |
| `task.complete` | Mark a task done | ask | cs, sales, ops |
| `task.snooze` | Snooze a task | auto | cs, sales, ops |
| `note.create` | File a note | auto | cs, sales, ops |
| `initiative.create` | Start an initiative | ask | ops |

Each kind is sent as `{kind, label, example, max_level, agents}`. The `example` is one sentence, such as "Move Dough Co from Live to Renewal".

**AgentAction** (in the Activity list, and in `detail` of Recommended and Waiting items):

```json
{
  "id": 81,
  "agent": "cs",
  "kind": "record.lifecycle",
  "title": "Move Dough Co to Renewal",
  "status": "applied",
  "record": {"kind": "customer", "id": 2, "name": "Dough Co"},
  "preview": {"field": "Lifecycle stage", "from": "Live", "to": "Renewal"},
  "rationale": "Renewal is in 21 days and the renewal task is open.",
  "evidence": [{"label": "Renews 29 Oct", "link": "/organizations/2"}],
  "decided_by": {"id": 2, "name": "Mona Manager"},
  "decided_at": "...",
  "auto": false,
  "applied_at": "...",
  "undo": {"allowed": true, "until": "2026-10-15T09:00:00Z", "reason": null},
  "undone_by": null,
  "undone_at": null,
  "result": {"task_id": null, "note_id": null, "initiative_id": null},
  "created_at": "..."
}
```

- **`status`:** `proposed`, `applied`, `rejected`, `expired` or `undone`.
- **`record`:**
  - `null` for workspace-level kinds (`initiative.create`).
  - `kind` is `customer` (link `/organizations/<id>`) or `account` (link `/accounts/<id>`).
- **`preview`** is always present. Its shape depends on the kind:

  | Kinds | `preview` |
  |---|---|
  | `record.*` | `{field, from, to}` |
  | `task.create` | `{task: {title, assignee: {id, name} \| null, due_date, priority}}` |
  | `task.reassign`, `task.redate`, `task.complete`, `task.snooze` | `{task: {id, title}, field, from, to}`. For `task.snooze`, `to` is the new due date plus " (snoozed: <reason>)". |
  | `note.create` | `{note: {title}}` |
  | `initiative.create` | `{initiative: {metric, target}}`, both display strings |

  `from` and `to` are display strings: labels, people's names, or dates as `YYYY-MM-DD`. An existing task's `title` is shown only to a reader who may read that task; anyone else gets "A task you can't see".
- **`evidence`** is a list of `{label, link}`. `label` is the action's own evidence line that the model cited (matched whole or as a fragment), and `link` is the action's record link (`null` for workspace-level actions). It is `[]` unless the reader has `view_all_accounts`. Evidence is written by the model from the whole book, so it can't be filtered line by line. This is the same rule as Brain's proposals. `rationale` is shown to anyone who may read the action.
- **`auto`** is `true` when the action was applied without a person (Auto); `decided_by` is then `null`.
- **`undo`** is `null` unless `status` is `applied`. `reason` is one of `null`, `"expired"` (more than 7 days since it applied), `"cant_decide"` (the reader could not have approved it; for `record.owner`, also without the owner-change right), or `"changed_since"` (best effort at read time; the POST is the judge).

## `GET /agents/settings/` (any member)

```json
{
  "ai_enabled": true,
  "tone": "professional",
  "agents": ["AgentCard", "AgentCard", "AgentCard"],
  "kinds": ["ActionKind", "..."],
  "levels": {"cs": {"record.lifecycle": "ask"}, "sales": {"...": "..."}, "ops": {"...": "..."}},
  "plan_monthly_credits": 2000,
  "can_edit": true,
  "can_run": true
}
```

- `levels` always has every agent and every kind that agent can use. The value is `"auto"`, `"ask"` or `"never"`.
- A fresh workspace is all `"ask"`.
- `agents` are in the order cs, sales, ops.
- `can_edit` is `manage_org_settings`.
- `can_run` is `manage_org_settings` or `view_all_accounts`, the Run now rule.

## `PATCH /agents/settings/` (manage_org_settings)

Send any subset:

```json
{
  "ai_enabled": false,
  "tone": "concise",
  "agents": {"cs": {"enabled": false, "monthly_credits": 200}},
  "levels": {"cs": {"record.lifecycle": "auto"}}
}
```

- Without `manage_org_settings`: 403.
- A value equal to what is stored is not a change.
- The response is the GET shape.
- Every problem comes back at once as a 400, `{field: [message]}`. Nested fields use nested objects, the same style as `PATCH /work/settings/`. There are two shapes:
  - A problem with an agent or level key itself is a list at that key, for example `{"agents": {"xx": ["Unknown agent."]}}` or `{"levels": {"ops": {"record.owner": ["That agent doesn't use this action."]}}}`.
  - A problem with a field's value is a list at the field, for example `{"agents": {"cs": {"monthly_credits": ["Choose a whole number from 0 to 2000."]}}}`.

| Field | Refused with |
|---|---|
| `ai_enabled` | "Choose on or off." |
| `tone` | "Choose professional, friendly or concise." |
| `agents.<kind>` (unknown kind) | "Unknown agent." |
| `agents.<kind>.enabled` | "Choose on or off." |
| `agents.<kind>.monthly_credits` | "Choose a whole number from 0 to <plan_monthly_credits>." |
| `levels.<agent>.<kind>` (unknown or not used by that agent) | "That agent doesn't use this action." |
| `levels.<agent>.<kind>` (bad value) | "Choose auto, ask or never." |
| `levels.<agent>.<kind>` (above `max_level`) | "This action can't be set to auto." |

`ai_enabled` and `tone` are the same fields as `Organisation.ai_agent_enabled` and `ai_agent_tone`. Settings › AI agent's own endpoint keeps working.

## `POST /agents/<kind>/run/` (manage_org_settings or view_all_accounts)

Runs that agent's pass now. It returns `200` with the AgentCard after the run.

| Refusal | When |
|---|---|
| `404` | Unknown kind. |
| `403` | The caller is neither an admin nor view-all. |
| `409 {"code": "AI_OFF", "detail": "AI is switched off for this workspace."}` | The workspace's AI switch is off. |
| `409 {"code": "AGENT_OFF", "detail": "This agent is switched off."}` | The agent is switched off. |
| `409 {"code": "BUDGET_USED", "detail": "This agent's budget is used up: it resumes on 1 Nov.", "resets_on": "2026-11-01"}` | The agent's monthly budget is spent. |
| `409 {"code": "NO_ACTIONS", "detail": "Every action is set to never for this agent."}` | Nothing is left for the agent to do. |
| `429 {"detail": "The workspace has no credits left."}` | The workspace credits are exhausted. |

A failed model call returns 200 with `skipped_reason: "failed"`. A model call that fails is refunded; a reply that can't be read still costs its credit.

The budget is checked before the call, not reserved: a nightly pass and a Run now running at the same moment can each spend one call past the budget.

A Run now whose pass raises is audited (`agents.run`, outcome `failure`) before the 500.

`POST /metrics/proposals/generate/` keeps working for one release. It runs the `ops` agent and answers in the old proposals list shape (see Compatibility).

## `GET /agents/actions/` (any member): Activity

Query parameters:

| Parameter | Values |
|---|---|
| `agent` | `cs`, `sales` or `ops` |
| `kind` | any kind |
| `status` | any status |
| `customer`, `account` | a record id |
| `page` | page number; 50 per page, newest first |

```json
{"count": 112, "next": "...?page=2", "previous": null, "results": ["AgentAction", "..."], "hidden": 3}
```

- **What a reader sees:** actions on records the reader may open. Workspace-level actions (`record: null`) are shown to view-all readers only.
- **`hidden`:** how many actions match the filters but sit on records the reader cannot open. They are never named.
- **Hidden workspace-level actions are not counted.** `hidden` counts only actions on records. Workspace-level actions that a reader without view-all can't see are left out of it.
- **Filtering on a record the reader can't open** (`customer=` or `account=`) returns an empty page with `hidden: 0`, so the filter can't be used to probe hidden records.
- An invalid filter value is a 400, for example `{"agent": ["Choose cs, sales or ops."]}`.

## `GET /agents/actions/<id>/` (any member)

Returns one AgentAction, written for the reader. It answers 404 when the action is outside the workspace or on a record the reader cannot open. A workspace-level action (`record: null`) is a 404 for anyone without view-all. The undo notification's link `/work/activity?action=<id>` uses this route.

## `POST /agents/actions/<id>/approve/` (a decider)

The body is optional. For `task.create` only, it may carry overrides, which are checked exactly as Recommended's Assign checks them. A body with overrides needs `assignee_id`; with no body the suggested assignee is used:

```json
{"assignee_id": 3, "title": "...", "due_date": "2026-10-20", "priority": "high"}
```

**Who decides:**
- An action on a record: its owner, anyone above that owner in the org chart, or a reader with `view_all_accounts`.
- `initiative.create`: view-all only.

The response is `200 {"action": AgentAction}`. Its status is now `applied`.

The errors come in this order:

1. `404` (`NO_SUCH_ACTION`): the action is outside the workspace, or on a record the reader cannot open.
2. `403 {"code": "CANT_DECIDE", ...}`: the reader may not decide it.
3. `400`: a bad override (the field errors), or `ASSIGNEE_CANNOT_OPEN`.
4. `409 {"code": "ALREADY_DECIDED", "detail": "Mona Manager already applied this.", "action": AgentAction}`: someone else decided it first. The detail says "rejected" when it was rejected.
5. `409 {"code": "EXPIRED", "detail": "This action has expired: the record changed since.", "action": AgentAction}`: the action has expired. The reason is one of "the record changed since", "its date has passed" (a task's date passed while the action waited), "the agent no longer proposes it", "this action is now set to never", or "it waited 14 days".

## `POST /agents/actions/<id>/reject/` (a decider)

The body is `{"note": "..."}`. The note is optional, up to 255 characters; a longer one is refused with "Keep the note under 255 characters.". The errors are the same as for approve. The response is `200 {"action": AgentAction}`.

## `POST /agents/actions/<id>/undo/` (anyone who could have approved it)

The response is `200 {"action": AgentAction}`, with status `undone`.

The errors come in this order:

1. `404`: the action is outside the workspace, or on a record the reader cannot open.
2. `403 CANT_DECIDE`: the reader could not have approved it.
3. `409 {"code": "ALREADY_DECIDED", "detail": "Mona Manager already undid this.", "action": AgentAction}`: someone else undid it first. This comes before the checks below, so it also answers after the 7 days have passed.
4. `409 {"code": "NOT_APPLIED", "detail": "Only an applied action can be undone."}`: the action was never applied.
5. `410 {"code": "UNDO_EXPIRED", "detail": "Undo is available for 7 days after an action applies."}`: the 7 days have passed.
6. `409 {"code": "CHANGED_SINCE", "detail": "Lifecycle stage has changed since: it is now Churn.", "current": "Churn", "applied": "Renewal"}`: the thing has changed since the agent applied it.
   - For `task.create`: "This task has been worked on since: it can't be removed."
   - For `note.create`: "This note has been edited since."
   - For `initiative.create`: "Work is linked to this initiative now."


**Who is told:** whoever approved the action, or the record owner when it ran on Auto, gets `agent_action_undone`. They are not told when they did the undo themselves.

## Work › Recommended (`GET /work/recommendations/`)

- Recommendation kind `agent` is renamed **`agent_action`**.
- The row's `proposal` field becomes **`agent_action`**: the full AgentAction, written for the reader (`evidence` follows the rule above).
- `title`, `record`, `suggested_assignee` and `defaults` are unchanged. For non-`task.create` kinds, `defaults` is `null`.
- For `agent_action` rows, `why` is `{"facts": [], "evidence": []}`. The card shows the action's own `rationale` and `evidence`.
- The Work settings source key stays **`agent`** (`sources.agent`). Only the row kind is renamed.

How each item is decided:
- **`task.create`:** deciding still goes through `/work/recommendations/<id>/assign/` and `/dismiss/`. Assign approves the action with its overrides, and dismiss rejects it with the reason. This is today's behaviour. When the action has gone stale, Assign answers Recommended's existing 409 `ALREADY_DECIDED`, with `recommendation.status: "expired"`. The `EXPIRED` code is used only on the `/agents/actions/` routes.
- **Any other kind:** Assign answers `400 {"code": "USE_APPLY", "detail": "Apply or reject this one instead."}`; Dismiss works for every kind and rejects the action. Otherwise use `POST /agents/actions/<id>/approve/` (the button is labelled **Apply**) or `/reject/` (labelled **Reject**). The recommendation settles with the action.

## Brain › Waiting on you (`GET /brain/waiting/`)

- Workspace-level actions (`initiative.create`) are shown in Waiting only to readers with `view_all_accounts`, the same rule as Activity. Before, every reader saw them with the evidence removed.
- Item kind `proposal` becomes **`agent_action`**, and the `counts` key `proposal` becomes **`agent_action`**.
- `detail` is the AgentAction, written for the reader, in place of `{proposal_kind, action, evidence, session}`. `detail.session` is kept for facilitator actions: `{id, title}` or `null`.

## Notifications

- New kind: **`agent_action_undone`**. It links to `/work/activity?action=<id>`.
- The message names the record only to a recipient who can open it:
  - "Mona Manager undid the CS agent's lifecycle change on Dough Co."
  - "Mona Manager undid an agent action on an organisation you can't open."
- `recommendations_waiting` is unchanged. Agent actions waiting on a person count as recommendations.

## Compatibility

- **Record shapes differ for now.** Waiting items keep their existing `record: {type, id, name}`. AgentAction uses `record: {kind, id, name}`. Unifying them is out of scope.
- **The Brain graph is unchanged.** `/brain/graph/` keeps its `proposal` nodes, read from the legacy `Proposal` rows, which are kept. Agent actions on the graph is delivery 2.

- **Old proposals become actions in place.** The `Proposal` model is renamed `AgentAction`, keeping its table (`metrics_proposal`) and its ids. Every old proposal is an action of agent `ops` and kind `task.create` or `initiative.create`. Its status maps as proposed → proposed, approved → applied, rejected → rejected. A proposal's id is its action's id.
- **The old routes keep working for one release, as thin wrappers:**
  - `GET /metrics/proposals/` lists ops actions of those two kinds in the old shape.
  - `POST /metrics/proposals/<id>/approve|reject/` takes a proposal id. Ids are unchanged, so a proposal id is an action id.
  - The frontend moves off them in this delivery. The wrappers go away in delivery 2.
- **`POST /metrics/proposals/generate/` changes its refusals** (the frontend no longer calls it and it goes away in delivery 2): a provider that isn't configured is now 502 (was 503); a used budget or no credits is 429 and a failed pass 502, each with a new `detail` sentence; an empty book is `422 {"detail": "There are no live customers to act on."}` and makes no model call.
- **`Organisation.ai_agent_enabled` now really stops agent runs**, including Run now and the generate wrapper.
