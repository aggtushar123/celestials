# Agents, delivery 3 ("the builder"): API contract

**Sources:**
- Spec: react-ts-app `docs/superpowers/specs/2026-10-08-agents-builder-design.md`, approved by the owner on 2026-10-08, branch `feat/agents-builder`.
- Backend plan: `docs/superpowers/plans/2026-10-08-agents-builder-backend.md`.
- Frontend plan: react-ts-app `docs/superpowers/plans/2026-10-08-agents-builder-frontend.md`.
- Delivery 1 and delivery 2 contracts (`2026-10-08-agents-actions-api.md`, `2026-10-08-agents-drafts-api.md`) still hold unless this file changes them.

**Conventions:**
- Every path is under `/api/v1/`.
- Every route requires `IsAuthenticated`.
- Bodies are JSON.
- Timestamps are ISO 8601 UTC.

## Owner decisions (2026-10-08)
1. **Builder kinds are capped at Ask.** The person who approves becomes the owner of everything the action creates.
2. **`canvas.create` is record-level.** It lays out the record's people by role, with no links.
3. **Builder kinds come from the Ops agent only.** View-all readers decide them.
4. **Approach A.**
   - The agent proposes the whole object.
   - A scenario or campaign carries its own segment, so both are created together and owned by the approver.

## New kinds

They come after `plan.start` and before `initiative.create`, in this order:

| `kind` | `label` | `max_level` | `agents` | `example` |
|---|---|---|---|---|
| `segment.create` | Build a segment | ask | ops | "Build a segment of organisations renewing in 60 days with poor health" |
| `scenario.create` | Build a scenario | ask | ops | "Build a scenario that tasks the owner when health drops below 4" |
| `campaign.create` | Draft a campaign | ask | ops | "Draft a check-in campaign to champions of at-risk organisations" |
| `canvas.create` | Map a record's people | ask | cs, sales, ops | "Map the people at Dough Co" |
| `plan.template` | Write a plan template | ask | ops | "Write a save-plan template for at-risk renewals" |

- `segment.create`, `scenario.create`, `campaign.create` and `plan.template` are **workspace-level** (`record: null`). They behave like `initiative.create`:
  - Read and decide: view-all only.
  - Activity, and Brain › Waiting at Company scope.
  - Never in Recommended.
  - Never counted in `hidden`.
- `canvas.create` is **record-level**. It behaves like `record.*`:
  - Read: whoever may open the record.
  - Decide: the owner, anyone above them, or view-all.
  - It reaches Recommended for the record owner.
- Every kind's Auto/Ask/Never level starts at **ask**. Auto is refused with "This action can't be set to auto."
- `result` gains `segment_id`, `rule_id`, `campaign_id`, `canvas_id` and `template_id`. It is now `{task_id, note_id, initiative_id, draft_id, plan_id, segment_id, rule_id, campaign_id, canvas_id, template_id}`, and each key is null unless that kind made it.
  - `scenario.create` sets `rule_id` and `segment_id`.
  - `campaign.create` sets `campaign_id` and `segment_id`.

## Payloads (what the agent writes) and checks

A **segment definition**, used by all three kinds that need one:

```json
{"kind": "customer|account|contact", "name": "<=120", "description": "<=500, why",
 "rules": {"match": "all|any", "conditions": ["<= 8 leaf or group conditions, the segment rules shape"]}}
```

| Kind | Payload |
|---|---|
| `segment.create` | the segment definition |
| `scenario.create` | `{"name": "<=120", "segment": <segment definition>, "trigger": {"trigger": "entered\|left\|crossed\|schedule", ...its fields}, "actions": [1-3 of notify\|task\|lifecycle\|plan\|survey]}`. `survey` always has `without_review: false`. `campaign` is refused. |
| `campaign.create` | `{"name": "<=120", "segment": <segment definition>, "roles": [contact roles], "subject": "<=150", "body": "<=1200, plain text, merge fields {first_name} {organisation} {sender_name} only"}` |
| `canvas.create` | `{"name": "<=120"}` on a record |
| `plan.template` | `{"kind": "onboarding\|success\|save\|qbr\|other", "name": "<=120", "description": "<=500", "milestones": [<=4 milestones, <=12 tasks in all, offsets 0-365, assignee_role record_owner\|plan_owner]}` |

**At generation, the kind is dropped when:**
- it fails the object's own validator (segment rules, rule trigger and actions, merge fields, template milestones);
- it exceeds the caps above;
- a builder kind cites anything other than a workspace-figures line;
- any free-text field names another record, task or note (`foreign_mentions`);
- a campaign body names anything internal (`internal_mentions`);
- it is a second builder action in the same pass. At most one builder action is kept per pass.

**At apply, as the approver:**
- The kind is validated again, inside one transaction, so nothing is half-created.
- A failed check expires the action with reason `changed`.
- The 50-per-owner limits apply. Past a limit, the decision is refused with 409 and the action stays proposed:

  ```json
  {"code": "OWNER_LIMIT", "detail": "You already own 50 segments."}
  ```

  The detail names segments, scenarios, campaigns or plan templates as the limit hit requires.

## What apply creates

| Kind | Creates | Owner |
|---|---|---|
| `segment.create` | a **private** segment, with its baseline set | approver |
| `scenario.create` | a private segment, then a rule on it with `is_active: false` | approver (both) |
| `campaign.create` | a private segment, then a campaign with status `draft` on it | approver (both) |
| `canvas.create` | a map on the record from its people (`people_nodes`), `edges: []` | `created_by` = approver |
| `plan.template` | a template with `sharing: "workspace"` | approver |

- Each created object stores the action in a new nullable FK `agent_action`, with `SET_NULL`.
- Each object writes its existing audit event with the approver as actor: `segment.created`, `rule.created`, `campaign.created`, `canvas.created` or `plan_template.created`.

## Previews (per reader)

```json
{"segment": {"kind": "customer", "name": "...", "conditions": 3, "members": 12}}
{"scenario": {"name": "...", "segment": "...", "trigger": "Entered the segment", "steps": ["Task the owner", "Notify me"]}}
{"campaign": {"name": "...", "segment": "...", "roles": ["Champion"], "subject": "...", "excerpt": "<first 280 characters>"}}
{"canvas": {"name": "...", "people": 6}}
{"template": {"kind": "save", "name": "...", "milestones": 3, "tasks": 9}}
```

- **`members`** is the segment's member count as **this reader** sees it, through `members.preview` on the draft definition.
- **`people`** is the number of the record's people this reader may open.
- **`trigger` and `steps`** are display sentences.

## Undo

Undo is allowed for 7 days. It refuses with `409 CHANGED_SINCE` and these sentences:

| Kind | Sentences |
|---|---|
| segment | "This segment has been edited since." / "A scenario, campaign or survey uses this segment now." |
| scenario | "This scenario has been switched on." / "This scenario has been edited since." |
| campaign | "This campaign has been sent." / "This campaign has been edited since." |
| map | "This map has been edited since." |
| plan template | "This plan template has been edited since." / "Plans have been started from this template." / "A scenario or a plan start uses this template now." |

**How undo decides:**
- **Edited.** For a segment, rule, campaign or template, edited means `updated_at` differs from the value stored in `after` at apply. For a map, it means `version` differs.
- **Switched on.** Any `rule.activated` audit event for the rule counts as switched on, even if it was switched off again.
- **Shared segment.** When the segment of an undone scenario or campaign is used by anything else, only the scenario or campaign is deleted.
- **Audit.** Undo writes the objects' own `*.deleted` audit events with the undoer as actor.
- **Gone.** An object already deleted by a person is "This … has been deleted." Undo still succeeds as a no-op for the parts that remain.
- **Notification.** The `agent_action_undone` notification nouns are "segment", "scenario", "campaign", "map" and "plan template".

## Made by the agent

These payloads gain `"made_by": {"agent": "ops", "approved_by": {"id", "name"}} | null`:
- `GET /segments/<id>/` and the segments list rows;
- `/rules/<id>/` and rule rows;
- `/campaigns/<id>/` and campaign rows;
- `/canvases/<id>/` and canvas rows;
- `/plans/templates/` items.

The field is non-null when the object has an `agent_action`. `approved_by` is the action's decider, and is `null` when that person no longer exists (the UI then shows "Made by the Ops agent").

## Brain graph (`GET /brain/graph/?scope=`)

- The node kind `proposal` is replaced by `agent_action`:

  ```json
  {"id": "agent_action:91", "kind": "agent_action", "label": "<title>", "agent": "ops", "action_kind": "segment.create", "action_id": 91}
  ```

- **Source:** every **proposed** action that `desk.agent_actions(reader, scope, …).readable` returns, of any kind and agent. The graph no longer filters on agent or kind.
- **Edges:**
  - An `acts_on` edge from the action to `customer:<id>`, for a customer action on a customer in the graph.
  - For an account action, the edge goes to the account's organisation when the reader may open that organisation. Otherwise there is no edge.
  - Workspace-level actions have no edge.
- `serves` now runs from an `agent_action` node to an `initiative` node (`AgentAction.initiative`), as it did from `proposal`.
- The legacy `proposal` node and its `proposal_kind` are gone.

## Delivery 2 follow-up: Send claims first

`POST /communications/drafts/<id>/send/` now does three things in order:
1. It claims the draft with a conditional UPDATE from `open` to an internal `sending` state, and commits.
2. It calls the provider outside the lock.
3. It files the email and marks the draft `sent`.

Two rules follow from this:
- A provider error returns the draft to `open` and answers 502, as before.
- A second Send while a send is in progress answers `409 ALREADY_SENT`. A database failure after the provider accepted leaves the draft `sending`, never `open`, so it is not sent twice.

The API's `status` stays `open | sent`. A `sending` draft reads as `sent`, with `sent_at` null.

## Out of scope
- Builder kinds from the CS or Sales agents.
- Auto for builder kinds.
- Links between people on agent maps.
- Two-way connectors.

## Rulings from planning (accepted by the controller, 2026-10-09)

1. **A gone object.**
   - A segment, map or template refuses with "This … has been deleted.".
   - When a scenario's rule or a campaign's campaign is gone, its untouched, unused segment is still removed. The undo refuses only when nothing is left.
2. **Segment `members`.** It is counted per page with one aggregate per segment kind, and it equals `members.preview(Draft)["count"]`.
3. **Conditions.** A segment definition needs 1 to 8 top-level conditions. The preview's `conditions` counts every leaf.
4. **Scenario sentences.** A scenario's trigger and step sentences are worked out at generation and stored in the payload (`shown`).
5. **Undo notice.** The workspace-level undo notice names the change, initiatives included: "Vic Viewer undid the Ops agent's segment.".
6. **Audit events.**
   - Audit events for objects an agent made add `agent_action` (its id).
   - `plan.template` also writes `plan_template.shared`.
7. **Graph nodes.** The `agent_action` graph node has no `from_session`. `/metrics/graph/` keeps its `proposal` nodes.
8. **`canvas.create`.**
   - Its target is `canvas`, with one open per record.
   - It is dropped when it doesn't cite a people line.
   - It expires (`changed`) when the approver may open none of the record's people.
9. **One builder action per pass.** This limit counts `canvas.create` too.
10. **Waiting's `hidden`.** Brain › Waiting stops counting workspace-level actions in `hidden` for readers without view-all, matching Activity.
11. **Owner limits.** There are four messages: "You already own 50 segments / scenarios / campaigns / plan templates.".
12. **Survey steps.** A survey step's `without_review` is forced to false at generation and checked again at apply.
13. **Edited segments.** An edited segment survives a scenario or campaign undo, the same as one in use.
14. **Draft lists.** `?status=sent` lists `sending` drafts too. `?status=sending` is a 400: "Choose open or sent.".
