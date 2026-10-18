# Agents, delivery 3: the builder

**Status:** design approved by the owner on 2026-10-08, section by section.

**Parent spec:** `docs/superpowers/specs/2026-10-08-agents-round-design.md`. Its §3 is the first draft of this delivery. This file replaces that section wherever the two differ. Delivery 1 and delivery 2's contracts still hold unless this file changes them.

**Research:** the code was read before the design, because delivery 2 found that the first draft's assumptions were wrong. The findings that shaped this design are below.
- **Every object has a person as owner and runs as them.** That covers a segment, a rule, a campaign and a plan template. A segment's members are worked out through its owner's book.
- **Owners must match.** A rule or campaign may only use a segment that the same person owns.
- **Each person owns at most 50 of each object.**
- **Rules are created switched off, and campaigns as drafts.** Only the owner can switch one on or send one.
- **Campaigns have no schedule.**
- **A canvas is a map of one record's people.** The app stores no relationships between people.
- **Recommended can't hold an action without a record.**
- **One agent pass has about 3,000 tokens of output.**

## Owner decisions (2026-10-08)

1. **Builder kinds are capped at Ask, and the approver becomes the owner** of everything an action creates. Nothing is made on Auto without an owner.
2. **`canvas.create` is a record-level kind.** It lays out the record's people by role and draws **no links**. Links would be guesses.
3. **Builder kinds come from the Ops agent only.** View-all readers decide them.
4. **Approach A.** The agent proposes the whole object. A scenario or a campaign carries its own segment, so the pair is always owned by the same person.

## 1. The five kinds

They are added to `kinds` after `plan.start` and before `initiative.create`:

| `kind` | Label | Max | Agents | Level |
|---|---|---|---|---|
| `segment.create` | Build a segment | ask | ops | workspace |
| `scenario.create` | Build a scenario | ask | ops | workspace |
| `campaign.create` | Draft a campaign | ask | ops | workspace |
| `canvas.create` | Map a record's people | ask | cs, sales, ops | record |
| `plan.template` | Write a plan template | ask | ops | workspace |

Every object an action creates stores that action (an `agent_action` link), so its page can say "Made by the Ops agent, approved by Alice" and undo can find it.

### `segment.create`
- **Payload:**
  - `kind`: customer, account or contact;
  - `name` (up to 120 characters);
  - `description`, which says why (up to 500 characters);
  - `rules`, in the segment's own JSON, with at most 8 conditions.
- **Apply:** creates a **private** segment owned by the approver. It is checked again with `validate_rules` as the approver, so it may name only records the approver can open, and its baseline is set.
- **Undo:** deletes the segment unless it was edited (`updated_at` moved) or a rule, campaign or survey send uses it.

### `scenario.create` (a rule)
- **Payload:**
  - `name`;
  - `segment`, the same shape as `segment.create`;
  - `trigger`: entered, left, crossed or schedule, with its fields;
  - `actions`: 1 to 3 steps from notify, task, lifecycle, plan and survey.
- **Survey steps** are always created with `without_review: false`.
- **Campaign steps are not allowed.**
- **Apply:** creates the segment, then a rule **switched off** on that segment. Both are owned by the approver, and the steps are checked as the approver with `clean_trigger`/`clean_actions`.
- **Undo:**
  - Undo deletes the rule, and its segment unless something else uses that segment, while the rule is unedited and has never been switched on.
  - "Never switched on" means no `rule.activated` audit row.

### `campaign.create`
- **Payload:**
  - `name`;
  - `segment`, the same shape as `segment.create`;
  - `roles`, from the eight contact roles;
  - `subject`, up to 150 characters;
  - `body`: plain text up to 1,200 characters, with only `{first_name}`, `{organisation}` and `{sender_name}`.
- **Apply:** creates the segment and a campaign **draft** on it, both owned by the approver.
- **Undo:** deletes the draft, and its segment unless something else uses it, while nothing has been sent and the draft is unedited.

### `canvas.create`
- **Payload:** `name`, up to 120 characters.
- **Apply:** creates a map on the action's record from `people_nodes`, as the approver, with no edges. `created_by` is the approver.
- **Undo:** deletes the map while its `version` is still 1.

### `plan.template`
- **Payload:**
  - `kind`: onboarding, success, save, qbr or other;
  - `name`;
  - `description`;
  - `milestones`: at most 4, with 12 tasks in all, offsets from 0 to 365 days, assignee role `record_owner` or `plan_owner`.
- **Apply:** creates the template owned by the approver with `sharing="workspace"`, so that `plan.start` and members can use it.
- **Undo:** deletes it unless it was edited, a plan was started from it, a rule's plan step uses it, or an open `plan.start` action names it.

### For all five
- **Checked twice.** An action is checked at generation with the existing validators, and checked again at apply as the approver. A failure at apply expires the action (`changed`). Nothing is half-created: apply runs in one transaction.
- **No internal text.** No name, description, subject, body, milestone title or task title may name another record, a task title or a note title (`foreign_mentions` over every free-text payload field). A campaign body is checked as strictly as a draft reply (`internal_mentions`).
- **One builder action per pass.**
- **Ownership limits.** The 50-per-owner limits still apply. Approval past a limit is refused in the existing words, for example "You already own 50 segments.", and the action stays proposed.
- **Audit.** Apply and undo write the objects' own audit events (`segment.created`/`.deleted` and so on), with the approver as the actor.

## 2. Evidence, decisions and where actions show

**The Ops agent** gets a short catalogue in its prompt:
- segment fields by kind, with their operators and the allowed values (lifecycle stages, health and NPS bands, products);
- AI attributes, with their `api_name`;
- rule triggers and the steps it may use;
- template kinds and limits;
- the workspace-shared segments and plan templates, by name and kind, so it doesn't make duplicates. Private ones are never shown.

**Evidence:**
- Builder actions must cite a workspace-figures line, as initiatives already do.
- For `canvas.create`, every record gets one line counting its people by role, with no names: `people: 6 (decision maker 1, champion 2, other 3)`. The action cites it.

**Who decides, and where actions show:**
- **The four workspace kinds behave as initiatives do today.**
  - Only view-all readers see them: in Activity, and in Brain › Waiting at Company scope.
  - Only view-all readers decide them.
  - They never go to Recommended, and they are never counted in `hidden`.
- **`canvas.create` behaves like any record action.**
  - Anyone who may open the record sees it.
  - The record owner, anyone above them, or a view-all reader decides it.
  - It goes to Recommended for the record owner.

**Previews** are computed per reader:
- **Segment:** its definition, plus its member count as the reader sees it (`members.preview` with a `Draft`).
- **Scenario:** its segment, trigger and steps.
- **Campaign:** its segment, roles, subject and the body's opening lines.
- **Plan template:** its milestones and task counts.
- **Map:** its name and the people count.

Whoever may open a record action sees its rationale and evidence; the rationale counts people by role and never names them. Workspace-level actions are read and decided by view-all readers only.

**Notifications:**
- No new notification kinds. The approver is the owner, so an apply tells no one.
- The undo notice gains the nouns "segment", "scenario", "campaign", "map" and "plan template".

## 3. Undo

Undo is open for 7 days. It removes only what is untouched. When it refuses, it answers `CHANGED_SINCE` in plain words:

| Kind | Refused with |
|---|---|
| Segment | "This segment has been edited since." / "A scenario, campaign or survey uses this segment now." |
| Scenario | "This scenario has been switched on." / "This scenario has been edited since." |
| Campaign | "This campaign has been sent." / "This campaign has been edited since." |
| Map | "This map has been edited since." |
| Plan template | "This plan template has been edited since." / "Plans have been started from this template." / "A scenario or a plan start uses this template now." |

- **Whether something was edited.** For segments, rules, campaigns and templates, compare `updated_at` with the value recorded at apply, in `after`. For maps, compare `version`.
- **A shared segment survives.** When the segment of an undone scenario or campaign is used by something else, only the scenario or campaign goes.

## 4. Brain graph

- **What it shows.** The graph shows every waiting agent action the reader may read, of every kind and from every agent, through `desk.agent_actions(...).readable`. Draft replies and other gated actions drop out by the same rules as Activity.
- **Links.**
  - A record action links to its organisation.
  - An account action links to the account's organisation when the reader may open it.
  - A builder action has no link and sits in the Decisions column, labelled by kind.
- **Node type.** The node kind `proposal` becomes `agent_action {agent, kind, title}`.
- **Clicking a node** opens it in Activity (`/work/activity?action=<id>`).

## 5. Frontend

- **Agent actions:**
  - the five kinds in the types, labels and previews;
  - an "Open segment / scenario / campaign / map / template" link in Activity while the action is applied;
  - fixtures and stubs.
- **"Made by" line.** Segment, scenario, campaign, canvas and plan template pages show "Made by the Ops agent, approved by Alice" when the object has an `agent_action` link.
- **Recommended** must not crash on an action that has no record.
- **Brain graph:** `agent_action` nodes, their fill, their link and their detail.
- **Docs:** `03-ui-ux-design.md` and `04-app-flow.md`.

## 6. Also in this delivery

The delivery 2 follow-up: Send claims the draft before calling the provider (a conditional UPDATE to a sending state), so a draft can never go out twice. If the database fails afterwards, the draft is not re-sent.

## 7. Testing

- **Each kind** gets unit tests for validate, apply and undo. These cover every refusal, the half-create rollback, and ownership limits.
- **API tests** cover reads and decisions, view-all only for the workspace kinds.
- **Privacy tests:**
  - a segment preview's count follows the reader;
  - no internal text in names or bodies;
  - the graph follows `readable`.
- **Bounded-query tests** cover Activity and the graph with the new kinds.
- **Frontend:**
  - previews and links;
  - the "Made by" line on each object page;
  - Recommended with a record-less action;
  - graph nodes;
  - house rules;
  - one end-to-end journey: a segment approved in Waiting, opened from Activity, then undone.

## Out of scope

- Builder kinds from the CS and Sales agents.
- Auto for builder kinds.
- Links on agent-made maps.
- Two-way connectors.
