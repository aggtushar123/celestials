# Agent bundles, delivery 1 ("Bundles and the new Work"): API contract

Backend plan: `docs/superpowers/plans/2026-10-13-agent-bundles-d1-backend.md`. Frontend plan:
react-ts-app `docs/superpowers/plans/2026-10-13-agent-bundles-d1-frontend.md`. Spec: react-ts-app
`docs/superpowers/specs/2026-10-13-agent-bundles-design.md` (approved 2026-10-13), §3, §5, §6, §7.1,
§7.2, §8 and the D1 row of §11. Work in one place's contracts
(`2026-10-12-work-one-place-api.md`, `2026-10-12-work-one-place-d2-api.md`) still hold except where
this file changes them. Every path is under `/api/v1/`, every route is `IsAuthenticated` (401
without a token), every body is JSON. Timestamps are ISO 8601 UTC as DRF writes them; "today" and
clock times shown in sentences are the workspace's (`work.clock`).

Merge order: this delivery's backend PR, then its frontend PR, back to back (the frontend's Work
reads `bundle` items and `/work/queues/`; the old frontend reads `approval` items, which this
backend no longer sends). Message intake (D2) and outside actions (D3) are later deliveries.

## Decisions narrowing the spec

Where the spec left a choice, the conservative option was taken. Each line says what a person
will notice.

| # | Decision | Cost if wrong |
|---|---|---|
| D1 | **The nightly review makes one bundle per record per pass.** Every new step an agent proposes for the same organisation or account in one pass goes into one bundle, in the order the model wrote them; workspace-level steps of one pass (the Ops agent's builders) share one bundle with no record. Title: the first step's title, plus ", and N more" when there are several. Reason: the first step's rationale. The model's output shape is unchanged (one list of steps); it may now use `{{step N.key}}` (§6). | Low: a model-written bundle title is one prompt field later. |
| D2 | **A step the policy applies on its own (Auto) gets its own bundle of one,** already `done`, run by nobody ("Applied on its own" in History). It never waits in a queue. | Low. |
| D3 | **Any step saved without a bundle gets a bundle of one** (the facilitator's session proposals, scripts, tests). Same title, reason and record as the step. | None. |
| D4 | **A step re-proposed by a later pass stays in its existing bundle.** A step the pass no longer proposes expires as today; when the last waiting step of a bundle expires, the bundle becomes `expired` (or `superseded` when every one of its steps was replaced by a newer proposal). A bundle with some steps expired and others waiting stays `waiting`; the expired steps show disabled with their reason. A re-proposed step can still be named by a later step of the same pass: a step whose placeholders all name steps of one earlier bundle (its re-proposed twins) is renumbered to that bundle's positions and stays only as its own twin there; one naming steps of two bundles, or of an earlier bundle as a new step, is dropped (§6.1). | Low. |
| D5 | **Queues follow the record's current owner,** as the Work feed does today: an owner change moves a waiting bundle to the new owner's Mine. `routed_user` keeps who it was routed to when it was made (History's "for"). | Low. |
| D6 | **Workspace-level bundles** (no record) are `routed_to: "admins"` and show, as today, in Rest of company to view-all readers only. Delivery 2 decides whether they move to the Unassigned queue (§11). | Low. |
| D7 | **Rest of company holds nothing that is in Mine or My team:** the company minus the reader and everyone below them. Its access is today's Company rule (view-all or Leadership). | None: the spec's rule. |
| D8 | **A queue's count is what needs action in it:** decide plus overdue (the badge's rule), for Mine, My team and Rest of company. History has no count. | Trivial. |
| D9 | **Feed kind `bundle` replaces `approval`** for agent proposals. The frontend's Approvals filter now means rule reviews. `?kind=approval` is read as `bundle` so old links and tabs keep working. | Low. |
| D10 | **Edits travel with Run (and Retry); nothing is saved without running.** Closing the panel with edits asks to discard them. Saved edits (and `edited_at` on a waiting bundle) come with delivery 2, where "New message since you edited" needs them. `edited_at`/`edited_by` are set when a run carries a change. | Low: one PATCH route in D2. |
| D11 | **Which steps can be edited in D1:** `task.create` (title, assignee, due date, priority, as today's Approve), `note.create` (title, body), `draft.reply` (body), `campaign.create` (name, subject, body), `campaign.send` and `survey.send` (§7). Every other step can be unticked but not edited. | Low: each kind adds its fields when wanted. |
| D12 | **A field holding a `{{step N.key}}` placeholder is not editable in D1;** it shows its text with a chip ("Task from step 1") and "Filled in from step 1 when it runs." | Low. |
| D13 | **A selected step the runner may not run refuses the whole run** (403, nothing runs). The panel shows such steps unticked and disabled with the reason, so this only happens to an old tab. | Low. |
| D14 | **What a failure is:** a step whose record moved on, or that waited 14 days, or whose kind is now Never, **expires** at Run ("Skipped: the record changed since.") and cannot be retried; any other refusal **fails** the step with a plain sentence and Retry. A step that needs an earlier step that did not run fails with "Needs step N, which didn't run." | Low. |
| D15 | **A run never stays stuck:** a bundle left `running` for 15 minutes (a crashed worker) is settled on its next read and by the nightly pass (even a pass that is then skipped, say with AI agents off): steps still `proposed` and selected become `failed` with "This step didn't finish. Retry it.", the bundle `partly_done`. Audited with no actor: `agent_action.failed` per step (`error: "StuckRun"`) and `agent_bundle.run_finished` (`stuck: true`). | Low. |
| D16 | **Reject bundle** needs the right to run every waiting step (`may_decide`), with a reason from today's four dismiss reasons and an optional note (255 characters). The agent is told the reason and the bundle's title for that record for 30 days, **never the note** (a note is a person's free text and could name what the record's readers can't see). | Low: the note can be added later behind the twice-filter. |
| D17 | **`survey.send` and `campaign.send` build a new segment** from the agent's definition, like today's `campaign.create`; picking an existing segment is not in D1 (the agent cannot know the runner's own segments). Both are the Ops agent's, workspace-level, capped at Ask. A survey's question is its type's fixed question (shown, not edited). | Low. |
| D18 | **The failed-step notice is delivery 3** (with the outside steps whose failures happen out of sight). In D1 every step runs while the runner watches the panel. | None. |
| D19 | **Old action routes.** `GET /agents/actions/`, `GET /agents/actions/<id>/` and `POST /agents/actions/<id>/undo/` stay (undo is per step). `POST /agents/actions/<id>/approve/` and `/reject/` answer `409 USE_BUNDLE` naming the bundle (§9). `GET /agents/actions/?status=` accepts every step status; a bad one is `400 {"status": ["Choose proposed, applied, rejected, expired, undone, failed or skipped."]}`. | Low. |
| D20 | **Links into Work.** Only links whose meaning changed are rewritten: "Bundles waiting" links `/work?queue=mine&kind=bundle`, the undo notice `/work?queue=history&bundle=<id>`. Every other stored and new link (`/work/mine?task=…`, `/work/mine?kind=approval|suggestion`) keeps working through the frontend's redirects. | None. |
| D21 | **Outside kinds are always Ask.** The registry gains `irreversible` and `outside`; `policy.level` reads Ask for an outside kind whatever is stored; `PATCH /agents/settings/` refuses auto or never on one with `"This action always asks."`. No outside kind exists until delivery 3; the rule is built and tested now with a test-only kind. | None. |
| D22 | **History** lists finished bundles the reader may read, 50 a page by page number (as Activity), newest change first, filtered by agent, step kind and status. | Low. |
| D23 | **My team keeps the per-person counts** (`GET /work/team/`, unchanged) under its list, as the Team tab showed them. Ask the agent stays on Rest of company for view-all readers. | Trivial. |

## 1. The bundle

### 1.1 `AgentBundle` (`services/agents/models.py`, new)

| Field | Type | Meaning |
|---|---|---|
| `organisation` | FK Organisation, cascade | workspace |
| `agent` | `cs`/`sales`/`ops` (`AgentAction.Agent`) | who proposed it |
| `title` | char 255 | D1 |
| `reason` | text | D1 |
| `source` | `nightly` / `thread` | always `nightly` in D1 (`thread` is delivery 2's) |
| `thread` | — | **not in D1**: delivery 2 adds the FK to `SignalThread` |
| `customer`, `account` | FK, nullable, cascade | the record; both null for workspace-level |
| `routed_to` | `owner` / `department` / `admins` | `owner` when there is a record, else `admins` (D6); `department` is delivery 2's |
| `routed_user` | FK User, nullable, set null | the record's owner when it was made (D5) |
| `department` | — | **not in D1**: delivery 2 adds it |
| `status` | `waiting`, `running`, `done`, `partly_done`, `rejected`, `expired`, `superseded` | §1.3 |
| `edited_at`, `edited_by` | nullable | the last run that carried an edit (D10) |
| `run_by`, `run_started_at`, `run_finished_at` | nullable | the run (and the last retry's finish) |
| `reject_reason` | `already_handled`, `not_relevant`, `wrong_person`, `other`, or `""` | D16 |
| `reject_note` | char 255, blank | D16 |
| `created_at`, `updated_at` | auto | |

Indexes: `(organisation, status)`, `(organisation, updated_at)`. A bundle's `__str__` is
`Agent bundle <id>` (an audit row records it; the title names a record).

### 1.2 Steps are `AgentAction` rows (`services/metrics/models.py`)

`AgentAction` gains:

| Field | Type | Meaning |
|---|---|---|
| `bundle` | FK `agents.AgentBundle`, **non-null** after the migration, cascade, `related_name="steps"` | |
| `position` | positive small int | 1-based order in the bundle; unique per bundle |
| `selected` | bool, default true | the last run's tick |
| `outputs` | JSON, default `{}` | §6.2 |
| `error` | char 500, blank | the last failure, a plain sentence (§9.3) |
| `irreversible` | bool, default false | what the step was when it ran (§3); set at run |

`AgentAction.Status` gains `failed` ("Failed") and `skipped` ("Skipped"). Every other field and
rule of `AgentAction` is unchanged: one open action per target (`agent_action_one_open`),
`before`/`after`, `result`, undo's 7 days, the session link, the 14-day `WAIT`.

`AgentAction.save()` on a row with no bundle first makes a bundle of one (D3):
`title=action.title`, `reason=action.rationale`, the action's record, `agent`, `source="nightly"`,
`routed_to`/`routed_user` by §1.1, `status="waiting"` for a proposed action (else the mapping in
§1.4), and `position=1`.

### 1.3 Status rules

| Bundle status | When |
|---|---|
| `waiting` | at least one step `proposed`, no run yet |
| `running` | a run or retry holds it (§5) |
| `done` | after a run: every selected step `applied` (or `undone` later) |
| `partly_done` | after a run: any selected step `failed` or `expired` |
| `rejected` | Reject bundle: every step `rejected` |
| `expired` | no step left `proposed` and none ran (they expired or waited), or a run where every selected step expired |
| `superseded` | no step left `proposed`, none ran, and every one expired with reason `replaced` |

`bundles.settle(bundle)` applies the rules after anything changes a step's status outside a run
(the nightly pass's expiries, a kind set to Never in Settings, a decision through a legacy path).

**Read-time expiry** (backend #113's rule, carried over): a `waiting` bundle whose `created_at` is
14 days old or more is never listed, counted or runnable, even before the nightly pass stores
`expired`. Running it answers `409 BUNDLE_EXPIRED` and stores `expired` (its steps `expired`,
reason `waited`).

### 1.4 Migration: bundles of one

`agents.0002_agent_bundle` (the model) → `metrics.0014_agent_action_steps` (the new fields,
`bundle` nullable; the two new statuses) → `agents.0003_bundles_of_one` (data) →
`metrics.0015_agent_action_bundle_required` (`bundle` non-null; unique `(bundle, position)`).

The data migration gives every existing `AgentAction` its own bundle, in batches of 500:

| Action status | Bundle status | Bundle run fields |
|---|---|---|
| `proposed` | `waiting` | none |
| `applied` | `done` | `run_by=decided_by`, `run_started_at=run_finished_at=decided_at` (null for Auto) |
| `rejected` | `rejected` | `reject_reason=""`, `reject_note=decision_note[:255]` |
| `expired` | `expired` (`superseded` when `expired_reason="replaced"`) | none |
| `undone` | `done` (the step keeps `undone`) | as applied |

`title=title`, `reason=rationale`, `agent`, record, `routed_to`/`routed_user` by §1.1,
`source="nightly"`, `created_at=action.created_at`, `updated_at=decided_at or created_at`;
the step gets `position=1`, `selected=true`, `outputs` from §6.2 over its `result`, and
`irreversible=false`. Session proposals keep their session link. Reverse: delete every bundle
(the step fields go with `metrics.0014`'s reverse).

## 2. The registry (`services/agents/kinds.py` `Kind`)

New fields, all with defaults so existing kinds are unchanged unless named:

| Field | Default | Meaning |
|---|---|---|
| `irreversible` | `False` | can't be undone once it ran (§3) |
| `outside` | `False` | acts outside Revenact; every outside kind is irreversible and always Ask (D21) |
| `editable` | `()` | the payload keys a person may change in the panel (D11) |
| `edit` | `None` | `(action, fields, runner) -> payload`: checks `fields` (only `editable` keys) and returns the new payload; raises `FieldErrors({key: [sentence]})` |
| `outputs` | `()` | the `outputs` keys a run of this kind fills (§6.2) |

Editable keys and outputs in D1:

| Kind | `editable` | `outputs` |
|---|---|---|
| `task.create` | `title`, `assignee_id`, `due_date`, `priority` (today's Approve overrides, same checks and sentences) | `task_id`, `task_url` |
| `note.create` | `title` (1–255, the kind's own limit), `body` (1–4000) | `note_id` |
| `draft.reply` | `body` (1–4000) | `draft_id` |
| `campaign.create` | `name`, `subject` (≤150), `body` (≤1,200) (the kind's own limits and merge-field rule; blank refused) | `campaign_id`, `campaign_url`, `segment_id`, `segment_url` |
| `campaign.send` (new) | `name`, `subject`, `body`, `roles`, `draft_only` | as `campaign.create`, plus `send_id` when sent |
| `survey.send` (new) | `name`, `survey_type`, `subject`, `intro`, `roles`, `draft_only` | `survey_id`, `survey_url`, `segment_id`, `segment_url` |
| `segment.create` | — | `segment_id`, `segment_url` |
| `scenario.create` | — | `rule_id`, `rule_url`, `segment_id`, `segment_url` |
| `canvas.create` | — | `canvas_id`, `canvas_url` |
| `plan.start`, `plan.template`, `initiative.create` | — | `plan_id` / `template_id` / `initiative_id` |
| record and other task kinds | — | — |

`irreversible=True` in D1: `campaign.send`, `survey.send` only. No D1 kind is `outside`.

**Policy (D21):** `policy.level(prefs, agent, kind)` returns `ask` for an `outside` kind whatever
is stored. `GET /agents/settings/` `kinds[]` rows gain `"irreversible": bool`, `"outside": bool`
and `"locked": bool` (true for outside kinds: the grid shows Ask, disabled). `PATCH` with
`auto` or `never` for an outside kind: `400 {"levels": {"<agent>": {"<kind>": ["This action always asks."]}}}`.
Storing `ask` for one is accepted (a no-op).

## 3. "Can't be undone"

A step is irreversible when its kind is `irreversible` and, for a kind with `draft_only` in
`editable`, `draft_only` is false. The step payload (§4.2) carries it, computed from the current
payload; the panel recomputes it as `draft_only` is toggled (`kind_irreversible && !draft_only`).
At Run the step's `irreversible` column stores what actually ran. Undo on an irreversible step
answers the existing `409 CHANGED_SINCE` sentence of its kind ("This campaign has been sent." /
"This survey has been sent."), checked before the 7-day window (so never `UNDO_EXPIRED`); its `undo` block reads `{"allowed": false, "reason": "irreversible", "until": null}`.

## 4. Shapes

### 4.1 Bundle

```json
{
  "id": 12,
  "agent": "cs",
  "agent_label": "CS agent",
  "title": "Move Acme to At risk, and 1 more",
  "reason": "Health fell from 72 to 41 in two weeks and the renewal is in 30 days.",
  "source": {"kind": "nightly", "label": "Nightly review"},
  "record": {"type": "customer", "id": 7, "name": "Acme"},
  "routed_to": "owner",
  "for": {"id": 3, "name": "Carl CSM"},
  "status": "waiting",
  "created_at": "2026-10-13T02:00:04Z",
  "updated_at": "2026-10-13T02:00:04Z",
  "edited_at": null,
  "edited_by": null,
  "run_by": null,
  "run_started_at": null,
  "run_finished_at": null,
  "reject_reason": "",
  "reject_note": "",
  "has_newer_message": false,
  "step_count": 2,
  "can_run": true,
  "can_reject": true,
  "steps": []
}
```

- `record`: the feed's record ref, or null for workspace-level.
- `for`: the record's current owner (D5); null for workspace-level or no owner ("For the whole
  company"). In History, the person it was routed to (`routed_user`).
- `edited_by`, `run_by`: `{"id", "name"}` or null.
- `has_newer_message`: always `false` in D1 (delivery 2's banner).
- `can_run`: the reader may run at least one waiting step. `can_reject`: they may run every
  waiting step (D16). Both false unless `status` is `waiting`.
- `steps`: in `position` order, every step (including unticked, expired and skipped ones).

### 4.2 Step

```json
{
  "id": 41,
  "position": 1,
  "kind": "task.create",
  "label": "Create a task",
  "status": "proposed",
  "selected": true,
  "title": "Book a save call with Acme's sponsor",
  "rationale": "Health 41, renewal in 30 days.",
  "fields": {"title": "Book a save call", "assignee_id": 3, "due_date": "2026-10-16", "priority": "high"},
  "editable": ["title", "assignee_id", "due_date", "priority"],
  "placeholders": [],
  "preview": {},
  "irreversible": false,
  "outside": false,
  "can_run": true,
  "disabled_reason": null,
  "outputs": {},
  "error": "",
  "expired_reason": "",
  "undo": null,
  "evidence": []
}
```

- `fields`: the payload's `editable` keys only, as stored (with `task.create`'s `due_in_days`
  already resolved to `due_date`); `{}` for a kind with nothing editable.
- `placeholders`: one row per placeholder found in a text value of the payload:
  `{"field": "title", "step": 1, "key": "task_url", "label": "Task link from step 1"}`. Labels:
  `<thing>_url` → "<Thing> link from step N", `<thing>_id` → "<Thing> from step N"; things are
  Task, Note, Draft, Campaign, Survey, Segment, Scenario, Map, Plan, Template, Initiative, Send.
  A field listed here is not editable (D12): it is left out of `editable`.
- `preview`: the kind's existing preview for the reader (unchanged per kind); `survey.send` and
  `campaign.send` in §7.
- `can_run` / `disabled_reason`: for a `proposed` step, whether the reader may run it, else the
  sentence: `"You can't run this step."` (`may_decide` false) or `"Only people who can read this
  email can run this step."` / `"... this ticket ..."` (a draft reply's source). For any other
  status: `can_run` false, `disabled_reason` null.
- `outputs`: §6.2, after it ran. `error`: the last failure (§9.3), `""` otherwise.
  `expired_reason`: today's reason key when `expired`, else `""`; the sentence is today's
  `deciding.REASONS`.
- `undo`: today's undo block for an `applied` step (D19), else null.
- `evidence`: today's rule (view-all readers only).

### 4.3 The feed item for a bundle (`kind: "bundle"`)

Work in one place's FeedItem with:

| Key | Value |
|---|---|
| `key` | `bundle:<id>` |
| `kind` | `bundle` |
| `id` | the bundle id |
| `title`, `record` | the bundle's |
| `from` | `{"type": "agent", "label": "CS agent"}` |
| `at` | `created_at` |
| `actions` | `["open"]` (decisions are made in the panel) |
| `detail` | `{"reason", "step_count", "source": {"kind", "label"}, "kinds": [labels of its waiting steps, in order], "can_run"}` |
| `for` | team and company queues only, §4.1's `for` |

## 5. Run, retry, reject

### 5.1 `POST /agents/bundles/<id>/run/`

```json
{"steps": [
  {"id": 41, "selected": true, "fields": {"title": "Book a save call this week"}},
  {"id": 42, "selected": false}
]}
```

1. **Before anything is locked** (the same order as today's decisions): 404 when the bundle is
   not the reader's to read (§8); 403 `CANT_RUN` when the reader may run none of its waiting steps.
2. **The body.** `steps` must name every `proposed` step exactly once (other statuses may not be
   named); at least one `selected: true`; `fields` only on selected steps, only `editable` keys,
   checked by the kind's `edit`. Refusals: §9.1. Nothing is locked or written when the body is
   refused.
3. **The claim** (one short transaction): the bundle's row is locked
   (`select_for_update(of=("self",))`); anything but `waiting` is a 409 (§9.2); the read-time
   expiry (§1.3) is a 409 and stores `expired`; every selected step is re-checked (`may_decide`,
   source) and a step the reader may not run is `403 CANT_RUN_STEP` (D13). Then: `status=running`,
   `run_by`, `run_started_at=now`, each step's `selected` stored, unticked steps `skipped`; edited
   payloads stored with `edited_at`/`edited_by` when any field differs from what was stored. Audit
   `agent_bundle.run_started` (who, bundle, selected step ids). Commit. **Lock order** (one order
   everywhere): a step's bundle is locked before the step (`deciding.locked()`); code that locks
   several bundles (a kind set to Never, the nightly pass's expiries) takes them in ascending id.
4. **The steps**, selected ones in `position` order, each in **its own transaction** (with the
   step's row locked): placeholders filled from earlier steps' `outputs` (§6); the existing
   checks (`stale_reason`, then the kind's `apply` through `deciding.apply_action` with the
   runner as decider). Success: `applied`, `outputs` stored, `irreversible` stored, audit
   `agent_action.approved` as today (`decided_as`, plus `bundle`). Expiry: `expired` with its
   reason (D14). Any other exception: the step's transaction rolls back, then in a new one the
   step becomes `failed` with `error` (§9.3); audit `agent_action.failed` (kind, bundle, the
   error's class name, never the sentence's record names). A failure never stops later steps,
   except those whose placeholders need it (§6).
5. **The finish** (one short transaction, bundle row locked): `done` or `partly_done` or
   `expired` by §1.3, `run_finished_at=now`. Audit `agent_bundle.run_finished` (status, counts
   per step status). The proposal notice is not sent (nothing new waits).

`200`: `{"bundle": <Bundle>}` (fresh, for the runner). A crash between 3 and 5 leaves the bundle
`running`; D15 settles it.

### 5.2 `POST /agents/bundles/<id>/steps/<step_id>/retry/`

Body: `{"fields": {...}}` (optional, editable keys only, as in 5.1). Order of refusals: 404
(bundle unreadable, or the step not in it); 403 `CANT_RUN_STEP` when the reader may not run it;
`409 NOT_FAILED` "Only a failed step can be retried." unless the step is `failed`; `409
BUNDLE_RUNNING` while another run holds the bundle. The retry holds the bundle's row lock for its
one step (a retry is short), clears `error`, then runs the step as 5.1.4 inside it; the bundle is
then re-settled (`done` when every selected step is `applied`). Audit `agent_bundle.retried`.
`200 {"bundle": <Bundle>}` whether the retry succeeded or failed again (the step says which).

### 5.3 `POST /agents/bundles/<id>/reject/`

Body: `{"reason": "not_relevant", "note": "We already called them."}`. Refusals: 404; 403
`CANT_REJECT` "You can't reject this bundle." unless the reader may run every waiting step (D16);
400 `{"reason": ["Choose already handled, not relevant, wrong person or other."]}`; 400
`{"note": ["Keep the note under 255 characters."]}`; the 409s of §9.2. Under the bundle's lock:
every `proposed` step `rejected` (`decided_by`, `decided_at`, `decision_note=note`,
`feedback_log` as today), `status=rejected`, `reject_reason`, `reject_note`. Audit
`agent_bundle.rejected` (reason, never the note). `200 {"bundle": <Bundle>}`.

**Feedback to the agent (spec §4.3):** for each record in an agent's evidence, that agent's own
bundles on it rejected in the last 30 days add one line to the record's block, newest first, at
most 3: `    rejected: "<bundle title>" (<reason label>, <date>)`. Never the note (D16). A bundle
holding a `draft.reply` step is titled `"A draft reply"` there (its title may quote mail or a
ticket; the twice-filter, as the feedback log masks it). These lines are
evidence the model may read but never quote (`match_line` skips them), so no step can cite them.

### 5.4 `GET /agents/bundles/<id>/`

The Bundle for the reader. Settles a stuck run first (D15). 404 by §8.

## 6. Placeholders (`{{step N.key}}`)

### 6.1 Grammar and checks

`{{step N.key}}` inside any string value at the top level of a step's payload, where `N` is a
position (1–99) and `key` matches `[a-z_]+`; spaces inside the braces are allowed
(`{{ step 1.task_url }}`). At proposal time (nightly pass) a step is dropped (`Invalid`) when a
placeholder names its own or a later position, or a key the producing step's kind does not list in
`outputs`, or sits in a field a customer reads (`draft.reply` `body`; `campaign.create` and
`campaign.send` `subject`, `body`; `survey.send` `subject`, `intro`). The model numbers its steps
for a record in its own order; a placeholder may name a step it re-proposed (D4) only when every
step it names is in that one earlier bundle and it is itself that bundle's re-proposed twin.
Text that looks like braces but does not match is left as written.

### 6.2 Outputs

After a step applies, `outputs` is its `result`'s ids plus a link per id that has a page:

| id key | link key | link |
|---|---|---|
| `task_id` | `task_url` | `/work/mine?task=<id>` |
| `campaign_id` | `campaign_url` | `/campaigns/<id>` |
| `survey_id` | `survey_url` | `/surveys/<id>` |
| `segment_id` | `segment_url` | `/segments/<id>` |
| `rule_id` | `rule_url` | `/scenarios/rules/<id>` |
| `canvas_id` | `canvas_url` | `/canvas/<id>` |

Other ids (`note_id`, `draft_id`, `plan_id`, `template_id`, `initiative_id`, `send_id`) are
outputs without links. Links are app paths, never absolute URLs.

### 6.3 Filling

Just before a step runs, each placeholder is replaced by the producing step's `outputs[key]`
(as text). When the producing step is not `applied` (unticked, failed, expired) or lacks the key,
the step fails with `"Needs step N, which didn't run."` without calling its kind; Retry works
once step N has applied. Filled values are what the step stores and History shows.

## 7. New Revenact steps

Both are the Ops agent's, workspace-level, `max_level` Ask, `builder=True`, `irreversible=True`
(D17). Their payload's `segment` is a `segment.create` definition (the agent's catalogue).
`draft_only` defaults to false. Applying runs as the **runner**, who becomes the owner of the
segment and the survey or campaign (today's builder rule).

### 7.1 `survey.send`

Payload: `{"name" (≤120), "survey_type": "nps"|"csat"|"ces", "subject" (≤120), "intro" (≤500,
may be ""), "segment": <definition>, "roles": [contact roles], "draft_only": false}`.

Preview (per reader):

```json
{"survey": {
  "name": "Q4 NPS for at-risk champions",
  "survey_type": "nps",
  "question": "How likely are you to recommend Acme to a friend or colleague?",
  "subject": "Two minutes for Acme?",
  "intro": "We'd love your view.",
  "segment": "At-risk champions",
  "roles": ["Champion"],
  "audience": {"contacts": 42, "records": 3, "record_noun": "organisations"},
  "limit": 500
}}
```

`audience` is counted as the reader sees it: the definition's matching records the reader may
open, and their contacts with a chosen role and an email (`builder.audience_counts`; one query
per definition, `id IN` subqueries). It is counted only while the step is `proposed`; once the
step has left `proposed` (History, a run's result) `audience` is `null`. The panel's sentence: "42 contacts across 3 organisations".
`question` is the type's fixed question (`surveys.questions.question_for`).

Apply: make the segment (`builder.create_segment`), then the draft (`SendWriteSerializer` as the
runner); with `draft_only` stop there. Else `surveys.sending.claim(...)` as the runner (email set
up, daily limit, the audience again, at most 500 people, quiet period, unsubscribes), exactly the
"Send now" button's rules. A `Refusal` fails the step with its `detail` sentence; the segment and
draft stay (so Retry sends the same draft: the step's `result` keeps `survey_id`, and a retry
claims that draft instead of making another). **Retry** reuses the kept survey by its id, whatever
its status: one already sent fails with claim's own sentence for a sent survey; a step another
person ran fails with "Only the person who ran this step can retry it."; Retry's edits are written
to the kept draft through the Surveys page's own serializer (`SendWriteSerializer`) as the runner,
with its update audit event. Outputs: `survey_id`, `survey_url`, `segment_id`,
`segment_url`. Undo: a draft-only run deletes the draft and its segment while unsent and
unedited (as `campaign.create`); a sent one is irreversible (§3).

### 7.2 `campaign.send`

Payload: `campaign.create`'s plus `"draft_only": false`. Preview: `campaign.create`'s plus
`"audience": {"contacts", "records", "record_noun"}` (counted for the reader as in 7.1; `null` once the step left `proposed`) and
`"limit": null` (a campaign has no audience cap). Apply: `campaign.create`'s apply, then (unless `draft_only`)
`campaigns.sending.claim(campaign, kind=MANUAL, by=runner, ...)`. Refusals fail the step with the
refusal's `detail`; a retry claims the campaign already made, by its id, and never re-sends: one
already sent fails with "This campaign has been sent."; a step another person ran fails with
"Only the person who ran this step can retry it."; Retry's edits are written to the kept draft
through the Campaigns page's own serializer (`CampaignWriteSerializer`) as the runner, with its
update audit event. Edits use `campaign.create`'s own limits (subject ≤150, body ≤1,200, blank
refused). Outputs as `campaign.create`, plus
`send_id` when sent. `campaign.create` stays for draft-only proposals.

### 7.3 Prompt

`prompt.PAYLOADS` gains the two kinds; the system prompt gains one paragraph: steps for the same
record are run together, in order; a later step may use an earlier step's output with
`{{step N.key}}`, the keys being those in §6.2 for the earlier step's kind. The paragraph lists
the outputs of the agent's allowed kinds only (a kind with no outputs is not named).

## 8. Who reads and runs a bundle

- **Read** (detail, run, retry, reject, a queue row): the bundle's record is one the reader may
  open (`visible_customers` / `visible_accounts`), or, workspace-level, the reader is view-all; and
  no step is a draft reply whose source the reader may not read (`source_access`). One `id IN`
  subquery per rule, never a join with DISTINCT. Anything else is `404 {"code": "NO_SUCH_BUNDLE",
  "detail": "No such bundle."}` and, in a queue, counted in `hidden`, never named.
- **Run a step**: today's `deciding.may_decide(reader, step)` (owner, chain, view-all; the
  owner-change right; source readers only).
- **Twice-filter**: every step's text was filtered on the way in by the pass (today's mention
  rules, unchanged); on the way out the bundle is read only by §8's rule and each step's preview by
  its kind's per-reader rule.

## 9. Errors

### 9.1 `400` bodies (run and retry)

| When | Body |
|---|---|
| `steps` missing or not a list | `{"steps": ["List every waiting step once."]}` |
| a waiting step missing, named twice, or a step that isn't waiting named | same |
| nothing selected | `{"steps": ["Choose at least one step to run."]}` |
| `fields` on an unticked step, or a key not in `editable` | `{"steps": {"<id>": {"<key>": ["This can't be changed here."]}}}` |
| the kind's `edit` refuses | `{"steps": {"<id>": {"<key>": ["<the kind's sentence>"]}}}` |

### 9.2 `409` bodies (run, retry, reject)

Each carries `"bundle": <Bundle>` as the reader sees it now.

| Status found | `code` | `detail` |
|---|---|---|
| `running` | `BUNDLE_RUNNING` | `"<name> is running this."` |
| `done` / `partly_done` | `BUNDLE_RAN` | `"<name> ran this at 10:42."` (today), `"<name> ran this on 12 Oct at 10:42."` (another day); "Revenact" for an Auto bundle |
| `rejected` | `BUNDLE_REJECTED` | `"<name> rejected this."` |
| `expired` (or read-time) | `BUNDLE_EXPIRED` | `"This bundle expired: <reason>."` with today's `REASONS` sentence (`it waited 14 days`, …) |
| `superseded` | `BUNDLE_SUPERSEDED` | `"A newer bundle replaced this one."` |
| retry on a step not `failed` | `NOT_FAILED` | `"Only a failed step can be retried."` |

`403`: `{"code": "CANT_RUN", "detail": "You can't run this bundle."}`, `{"code": "CANT_RUN_STEP",
"detail": "You can't run step 2.", "step": 42}`, `{"code": "CANT_REJECT", "detail": "You can't
reject this bundle."}`.

Every `AgentAction` payload (`GET /agents/actions/`, `GET /agents/actions/<id>/`, the undo
route's answer) gains `"bundle": <bundle id>`: the frontend's `/work/activity?action=<id>`
redirect opens that bundle in History. `POST /agents/actions/<step id>/undo/` stays the per-step
Undo and answers today's `{"action": <AgentAction>}`; History reads the bundle again after it.

`POST /agents/actions/<id>/approve|reject/` (D19): `409 {"code": "USE_BUNDLE", "detail": "Open the
bundle to decide this.", "bundle": 12}` after the existing 404/403 checks.

### 9.3 Step errors (`error`)

Plain sentences, never codes, at most 500 characters:

| Cause | Sentence |
|---|---|
| a survey or campaign `Refusal` | its `detail` (e.g. "Email isn't set up for this workspace yet, so surveys can't be sent.", "Nobody to send to.") |
| a DRF `ValidationError` | its first message |
| `OwnerLimit` | its `detail` |
| a placeholder's step didn't run | "Needs step N, which didn't run." |
| rights lost between claim and step | "You can no longer run this step." |
| a stuck run (D15) | "This step didn't finish. Retry it." |
| anything else | "Something went wrong running this step. Retry it." (logged with the class name) |

## 10. Work

### 10.1 Feed kinds (`GET /work/feed/`, "Mine")

`KINDS` = `bundle, rule_review, question, draft, task, todo, suggestion` (in `failed` order);
`DECIDE_KINDS` (ties) = `rule_review, bundle, question, draft`. `?kind=approval` is read as
`bundle` (D9). The unknown-kind sentence: `"Choose bundle, rule_review, question, draft, task,
todo or suggestion."`. The decide group's bundle rows: waiting bundles (not read-time expired) with
a waiting step on the reader's Me desk (`brain.desk.agent_actions(reader, ME, sessions)`'s
waiting steps), cut by §8; `hidden` adds the rest. Everything else in the feed is unchanged.

### 10.2 Queues (`GET /work/feed/team/`)

| `scope` | Queue | Who | What |
|---|---|---|---|
| `team` | My team | has reports | unchanged (Work in one place D2), bundles in place of approvals |
| `company` | **Rest of company** | view-all or Leadership | the company minus the reader and everyone below them (D7); workspace-level bundles for view-all only |

New `?kind=` on this route: `bundle, rule_review, question, task, suggestion` (comma list, as the
feed; `approval` read as `bundle`); others `400 {"kind": ["Choose bundle, rule_review, question,
task or suggestion."]}`. A kind filter drops the groups it empties' sources, exactly as the feed's.
Each bundle row carries `for` (§4.1).

### 10.3 `GET /work/queues/` (new)

```json
{
  "queues": [
    {"key": "mine", "label": "Mine", "count": 4},
    {"key": "team", "label": "My team", "count": 7},
    {"key": "company", "label": "Rest of company", "count": 12},
    {"key": "history", "label": "History", "count": null}
  ],
  "failed": []
}
```

Only the queues the reader may use, in this order. `count` = decide + overdue (D8), each source in
its own savepoint; a queue with any failed inner source (a count that would be wrong) has
`count: null` and its key in `failed`. **Delivery 2 plugs in
here:** department queues (`department:<id>`, label the department's name, after Rest of company)
and `unassigned` (admins), each also a `scope` of `GET /work/feed/team/`; this delivery's code
keeps the queue list a tuple of `(key, label, may_use, count)` makers so D2 adds rows, not shapes.

### 10.4 Badge (`GET /work/feed/count/`)

Shape unchanged. `decide` counts bundles in place of approvals. (Delivery 2 adds the reader's
department queues.)

### 10.5 History (`GET /agents/bundles/history/`)

Query: `agent` (`cs|sales|ops`), `step_kind` (any registry kind: a bundle with at least one step of
it), `status` (`done|partly_done|rejected|expired|superseded`), `page` (1-based). Unknown values:
`400 {"<param>": ["Choose cs, sales or ops."]}` / `["Choose an action kind."]` / `["Choose done,
partly done, rejected, expired or superseded."]`.

```json
{"count": 61, "next": "...?page=2", "previous": null, "results": [<Bundle>], "hidden": 2}
```

Bundles in a finished status the reader may read (§8), ordered `-updated_at, -id`, 50 a page,
each with its steps (results, `outputs`, `error`, `undo`). `hidden`: finished bundles on records
the reader can't open (workspace-level ones a reader isn't shown are not counted, as Activity).
Nothing waiting or running is listed.

### 10.6 "Bundles waiting" (was "AI proposal waiting")

`Notification.Kind.AGENT_PROPOSAL_WAITING` keeps its value; its label becomes "Bundles waiting"
(`notifications.0014`). Message: `"Bundles are waiting for your decision."` Link:
`/work?queue=mine&kind=bundle`. Who and how often: unchanged rules (Work in one place D2 §4.1)
over bundles: a person is told when a bundle made since they were last told is on their own Mine
and they may run at least one of its steps; once per workspace day.

### 10.7 Other links

The undo notice links `/work?queue=history&bundle=<bundle id>` (D20). `copilot/skills.py`'s Work
mentions say History (`/work?queue=history`). No other stored or new link changes.

## 11. Delivery 2 plug-in points (not built here)

- `AgentBundle.thread`, `department`, `has_newer_message` columns; `source="thread"`.
- `routed_to="department"`: bundles shown in `department:<id>` queues, excluded from Mine/My
  team/Rest of company; `routed_to="admins"` with a thread → `unassigned`. Whether today's
  workspace-level nightly bundles move to Unassigned is decided there (D6).
- `PATCH /agents/bundles/<id>/steps/<step_id>/` (saved edits; D10) and "Refresh suggestions".
- The badge and `/work/queues/` add department queues (10.3, 10.4).

## 12. Permissions, audit and performance

- Every route: `IsAuthenticated`; another workspace's bundle is 404. Every visibility filter is
  an `id IN` subquery with a `# SOC2:AUTH-02` comment; every audited write `# SOC2:LOG-01`.
- Audit events: `agent_bundle.run_started`, `agent_bundle.run_finished`, `agent_bundle.retried`,
  `agent_bundle.rejected`, `agent_action.approved` (per applied step, with `bundle`),
  `agent_action.failed`, plus the survey's and campaign's own send events. A stuck run settled
  (D15) writes `agent_action.failed` per step (`error: "StuckRun"`) and
  `agent_bundle.run_finished` (`stuck: true`), with no actor.
- **Query ceilings** (pinned by tests that add rows and compare; measured on the branch and
  written into `docs/API_CONTRACTS.md`): `BUNDLE_DETAIL_CEILING` (detail, constant in the number
  of steps up to 8), `HISTORY_CEILING` (a page of 50, constant in rows), `QUEUES_CEILING`
  (`/work/queues/`), and the existing feed, count and team ceilings re-measured (they must not
  grow with bundles). A run's queries grow with its steps, never with the workspace.
  **Measured on the branch** (`services/agents/tests/test_bundle_queries.py`,
  `services/work/tests/`):

  | Ceiling | Queries | Notes |
  |---|---|---|
  | `BUNDLE_DETAIL_CEILING` | 10 | constant for up to 8 `note.create`, `record.lifecycle` and `draft.reply` steps |
  | `AUDIENCE_STEP_QUERIES` | +3 per step | each `survey.send` or `campaign.send` step still `proposed` adds 3 (its audience count, read for the reader); pinned, not batched, so a waiting bundle's detail does grow with its send steps |
  | `HISTORY_CEILING` | 8 | a page of 50, constant in rows, send rows included (a finished step's `audience` is `null`, never counted) |
  | `QUEUES_CEILING` | 41 | a manager (41); view-all 40, Leadership only 40, a CSM 25 |
  | `FEED_CEILING` | 54 | was 53 |
  | `COUNT_CEILING` | 23 | unchanged |
  | `TEAM_CEILING` | 46 | `team` (was 45); `company` 45 |
  | `PROPOSAL_NOTICE_CEILING` | 41 | unchanged |
- No query uses `DISTINCT`; a test asserts it over every query of the feed, queues, history and
  detail (Postgres 16).

