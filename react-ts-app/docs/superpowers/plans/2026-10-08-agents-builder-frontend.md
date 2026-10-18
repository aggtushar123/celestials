# Agents, delivery 3 ("the builder"): frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People see, decide, open and undo the five builder kinds, and every object an agent made says so. This covers:
- `segment.create`, `scenario.create`, `campaign.create`, `canvas.create` and `plan.template` in the agents' types, words, previews, Activity, Waiting and Recommended;
- Activity's "Open segment / scenario / campaign / map / template" links while an action is applied;
- "Made by the Ops agent, approved by Alice" on a segment, a rule, a campaign, a map and a plan template, from the server's `made_by`;
- Recommended no longer assumes every row has a record;
- the Brain graph's `agent_action` node in place of the dead `proposal` node.

**Architecture:**
- **`features/agents`** gains the five kinds, their preview types, `ActionResult` (ten keys) and `MadeBy` in `agentTypes.ts`; their labels, `previewText` branches, `scenarioStepsText`, `builtLinks` and `madeByText` in `agentsText.ts`; fixtures and stub results in `testAgentsFixtures.ts` and `testAgents.ts`.
- **`components/agents/MadeByLine.tsx`** is the one shared made-by line. It sits under the agents house-rules suite. `SegmentHeader`, `RuleHeader`, `CampaignHeader`, `MapHeader`, `TemplatesPage` and the template editor mount it.
- **`components/agents/ActivityRow.tsx`** maps `builtLinks(action)` onto its meta line; `AgentActionBody` shows a scenario's steps and a campaign's opening lines.
- **Work:** `RecommendationRow.record` becomes nullable; `RecommendationCard` and `AssignForm` stop assuming it.
- **Brain graph:** `graphTypes.ts` swaps `ProposalNode` for `AgentActionNode`; `Graph.tsx` gives it the Decisions column, an `ink-faint` fill, a readable kind name, a detail and an "Open in Activity" link.
- No Redux slice: every read goes through a hook or a component's own effect, as deliveries 1 and 2 do.

**Tech Stack:**
- React 19, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`);
- react-router 7 and Tailwind v4 tokens;
- Vitest and Testing Library (jsdom), `@testing-library/user-event` 14;
- lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-08-agents-builder-design.md` (approved 2026-10-08), §1, §2, §4 and §5; §7 for testing.

**API contract (binding):** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/agents3-be/docs/superpowers/plans/2026-10-08-agents-builder-api.md`. It wins on shapes, sentences and codes. Deliveries 1 and 2's contracts (`2026-10-08-agents-actions-api.md`, `2026-10-08-agents-drafts-api.md` in revenact-backend) still hold where it is silent.

**House style and the code this plan extends:** `docs/superpowers/plans/2026-10-08-agents-drafts-frontend.md` (delivery 2), on `main` after frontend PR #125 merged.

Read the spec, the contract and this plan before starting.

## Contract questions

These are open with the backend. The plan takes the reading in brackets and never invents a field beyond it.
1. Can `made_by.approved_by` be null, for example when the approver's user was deleted? [Typed `PersonRef | null`. The line then reads "Made by the Ops agent" alone.]
2. "`serves` is unchanged": does it now run from an `agent_action` node to an `initiative` node? [`applyFilters` already treats `serves` by edge kind alone, so either reading works; no code depends on it.]

## Global Constraints

- **Worktree and branch.**
  - Work in the delivery 3 frontend worktree and branch the controller names (`feat/agents-builder`), based on `main` after delivery 2 (frontend PR #125) merged.
  - `node_modules` is a symlink: never commit it.
  - Always `git add <explicit paths>`, never `git add -A` or `git add .`.
- **Never run prettier. Never use `git stash`.** The stash stack is shared across worktrees; use a WIP commit if you must set work aside.
- **Commands:** `npx vitest run <path> --maxWorkers=2` for a task; the final check is `npx vitest run --maxWorkers=4`, `npm run lint`, `npm run build`. Run them in the foreground.
- **Every commit message** is a conventional commit and ends with exactly this line: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Tests:** Vitest with Testing Library. Fetch is stubbed only through the stub pattern: `vi.stubGlobal('fetch', spy)`, state kept in Maps, every answer a JSON copy, and a `passThrough` to chain stubs (brain in front of agents in front of work in front of segments).
- **Server words verbatim.** A refusal is shown as `refusalDetail(err)` first (`features/agents/agentsApi.ts`), then the field errors, then the client fallback. The contract's sentences ("You already own 50 segments.", "A scenario, campaign or survey uses this segment now.", "Entered the segment") are shown word for word, never rewritten or re-cased.
- **Rights come from the server only:** `can_decide`, `undo.allowed` and `undo.reason`, `is_owner`, membership of Recommended, the presence of `made_by`. The UI never guesses who made or owns an object.
- **Tokens only** (`src/test/houseRules.ts` `RAW`): no hex, no `rgb()`, no named Tailwind palette colours in any `.tsx`. The graph's fills are `var(--color-…)` tokens.
- **Type sizes:** only 11, 13 and 15 (`text-[11px]`, `text-[13px]`, `text-[15px]`) in every Agents, Work, Brain and Plans component this plan touches, and no named sizes. Page titles keep their existing 22px. `pages/brain/Graph.tsx` keeps its own styling (it is outside every house-rules suite); the lines this plan adds there copy the neighbouring lines' classes.
- **Figures in DM Mono:** counts and dates use `MONO` (`font-mono-brand tabular-nums`); a sentence with figures goes through `Figured` (`src/components/brain/Figured.tsx`), as `AgentActionBody` already does for previews.
- **44px targets:** every `<button>`, `<Link>`, `<select>`, `<input>` and `<textarea>` reaches `min-h-11` on phones, directly or through a compliant constant (`BUTTON`, `PRIMARY`, `QUIET`, `FILTER_SELECT`, `INPUT`, `LINK`, `META_LINK`, or a local `const` holding `min-h-11`).
- **One primary per form:** this plan adds no button. `MadeByLine` is text. Apply, Reject and Undo stay `BUTTON` or `QUIET`; no `PRIMARY` appears in any agents file outside `AgentsForm`, `ActionsGridForm` and `DraftForm`.
- **Live regions:** any `role="status"` line is never `display:none` (no `hidden`, no conditional `null` for the element itself). Keep it mounted and empty, with `empty:sr-only` or a steady `min-h`. This plan adds no status line; the ones it relies on (Activity's, Waiting's, Recommended's) stay as they are.
- **Icons:** Lucide only, each with `aria-hidden="true"`. No emoji.
- **States:** every page and list keeps its loading (a skeleton), empty and error (Try again) states.
- **No em dash (`—`)** in anything this plan writes under `components/agents`, `features/agents`, `components/work`, `pages/work`, `features/work`, `components/brain`, `features/brain`, `pages/brain`, `features/graph`, `components/plans`, `pages/plans`, `features/plans`, `components/segments`, `pages/segments`, `features/segments`, `components/rules`, `pages/rules`, `features/rules`, `components/campaigns`, `pages/campaigns`, `features/campaigns`, `components/canvas`, `pages/canvas`, `features/canvas` or `src/e2e/agents.test.tsx`, comments and tests included; use a colon or a full stop. Older lines that already have one are left alone. The agents suite checks every agents file, tests included.
- **Copy:** sentence case; "organisation" in sentences (as `KIND_NOUN` spells it).
- **Out of scope:** the backend; builder kinds from the CS and Sales agents; Auto for builder kinds; links between people on agent maps; a "made by" line on list rows (the contract sends `made_by` on rows too; the spec asks for pages only); the delivery 2 Send follow-up (server-only: the API's `status` stays `open | sent`).

## Decisions (where the spec or the contract leaves a choice)

1. **Preview lines.** One line per kind, then any detail below it:
   - segment: "Build a segment: Poor health renewals, 2 conditions, 12 organisations" (the noun from `KIND_NOUN`, singular at 1);
   - scenario: "Build a scenario: Health watch, on Poor health renewals", then a quiet line with the server's sentences joined by " · ": "Entered the segment · Task the owner · Notify me";
   - campaign: "Draft a campaign: Champion check-in (At-risk organisations, Champion): Checking in, {first_name}" (roles left out when empty), then the opening lines in the same quiet `blockquote` a reply draft uses;
   - map: "Map a record's people: Pizza Hut people, 6 people" ("1 person" at 1);
   - template: "Write a plan template: Save play for at-risk renewals (Save), 3 milestones, 9 tasks".
   No builder kind may reach the `from → to` fallback.
2. **Activity links.** `builtLinks(action)` returns one link per result key that is set, only while `status === 'applied'` (undo deletes what was made, as with a draft). The order is scenario, campaign, segment, map, template, so a scenario row reads "Open scenario · Open segment". Targets: `/scenarios/rules/<id>`, `/campaigns/<id>`, `/segments/<id>`, `/canvas/<id>`, `/projects/templates/<id>/edit` (templates have no page of their own; the editor is where a template opens).
3. **`made_by` is optional in the object types** (`made_by?: MadeBy | null`). The contract always sends it, but the five object types are built by dozens of fixtures; optional keeps them valid while the line reads `undefined` and `null` the same way. The stubs that build rows field by field (campaigns, canvases) copy it through.
4. **Where the line sits.** Directly under each header's owner or record line: segment and rule (after the 11px meta line), campaign (after the meta line), map (under the record and "Edited by" line), template (under the row's name line on `/projects/templates`, and at the top of its editor). The line is 11px `text-ink-muted` with Lucide `Bot`, `data-part="made-by"`.
5. **Recommended without a record.** The contract keeps workspace-level kinds out of Recommended, but the card must not crash on one: with `record: null` the meta line starts at the kind, the evidence is not filtered against a record link, and there is no Assign (Assign needs a record to choose people for).
6. **Graph.** An `agent_action` node sits in the Decisions column with initiatives, filled `var(--color-ink-faint)`, named "agent action" in its accessible name, the detail's kind label and the "Connected to" list (`NODE_LABEL`). Its detail shows Agent (`AGENT_LABEL`) and Action (`KIND_LABEL`), and "Open in Activity" links `/work/activity?action=<action_id>`. Filters are unchanged: an action acting on a kept customer is kept; a builder action (no edge) shows only while no filter is set.
7. **The journey's segment.** The segments stub already holds the built segment (`AGENT_SEGMENT`, id 61) before the approval, since the stubs do not share state; the journey asserts what the reader sees, not the creation.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/features/agents/agentTypes.ts` | modify | Five kinds, five preview types, `ActionResult`, `MadeBy` |
| `src/features/agents/agentsText.ts` | modify | Labels, `previewText` branches, `scenarioStepsText`, `builtLinks`, `madeByText`, Open words |
| `src/features/agents/testAgentsFixtures.ts` | modify | `KINDS`, result keys, `BUILT_*` ids, `MADE_BY_OPS`, five `ACT_*` fixtures |
| `src/features/agents/testAgents.ts` | modify | Result ids on approve |
| `src/components/agents/AgentActionBody.tsx` | modify | Scenario steps; campaign excerpt |
| `src/components/agents/ActivityRow.tsx` | modify | Open links for built objects |
| `src/components/agents/MadeByLine.tsx` | create | The shared made-by line |
| `src/components/agents/houseRules.test.ts` | modify | Coverage; the five pages use the shared line |
| `src/features/segments/segmentTypes.ts`, `testSegments.ts`; `src/components/segments/SegmentHeader.tsx` | modify | `made_by`; `AGENT_SEGMENT`; the line |
| `src/features/rules/ruleTypes.ts`; `src/components/rules/RuleHeader.tsx` | modify | `made_by`; the line |
| `src/features/campaigns/campaignTypes.ts`, `testCampaigns.ts`; `src/components/campaigns/CampaignHeader.tsx` | modify | `made_by`; row copy; the line |
| `src/features/canvas/canvasTypes.ts`, `testCanvasFixtures.ts`, `testCanvases.ts`; `src/components/canvas/MapHeader.tsx` | modify | `made_by`; row copy; the line |
| `src/features/plans/planTypes.ts`; `src/pages/plans/TemplatesPage.tsx`, `TemplateEditor.tsx` | modify | `made_by`; the line on the row and in the editor |
| `src/features/work/workTypes.ts`, `testWork.ts`, `testWorkFixtures.ts`; `src/components/work/RecommendationCard.tsx`, `AssignForm.tsx` | modify | Nullable record |
| `src/features/brain/testWaitingFixtures.ts` | modify | `SEGMENT_CREATE_ITEM` |
| `src/features/graph/graphTypes.ts`, `filters.ts`; `src/pages/brain/Graph.tsx`; `src/features/brain/testCustomersFixtures.ts` | modify | `agent_action` node |
| `src/features/graph/filters.test.ts` | create | Filters over agent actions |
| `src/pages/work/testPages.tsx` | modify | `renderWork(..., { brain, segments })` |
| `src/e2e/agents.test.tsx` | modify | The builder journey |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md` | modify | Delivery 3 described |

Tests sit beside their files.

---

### Task 1: The five kinds: types, labels, previews and fixtures

**Files:**
- Modify: `src/features/agents/agentTypes.ts:1-4` (header, imports), `:9-36` (kinds), `:100-116` (previews), `:118-150` (result, made-by)
- Modify: `src/features/agents/agentsText.ts:1-19` (imports), `:89-103` (`KIND_LABEL`), `:120-140` (`previewText`)
- Modify: `src/features/agents/testAgentsFixtures.ts`
- Test: `src/features/agents/agentsText.test.ts`, `src/pages/settings/AgentActionsPage.test.tsx`

**Interfaces:**
- Consumes: `KIND_NOUN` (`src/features/segments/segmentFields.ts`, `Record<SegmentKind, {one, many}>`); `KIND_LABEL` (`src/features/plans/planOptions.ts`, `Record<PlanKind, string>`).
- Produces:
  - `ActionKind` gains `'segment.create' | 'scenario.create' | 'campaign.create' | 'canvas.create' | 'plan.template'`, and `ACTION_KINDS` lists them after `'plan.start'` and before `'initiative.create'`.
  - `SegmentPreview {kind: SegmentKind; name; conditions: number; members: number}`, `ScenarioPreview {name; segment; trigger; steps: string[]}`, `CampaignPreview {name; segment; roles: string[]; subject; excerpt}`, `CanvasPreview {name; people: number}`, `TemplatePreview {kind: PlanKind; name; milestones: number; tasks: number}`; `ActionPreview` gains `segment?`, `scenario?`, `campaign?`, `canvas?`, `template?`.
  - `ActionResult` with ten `number | null` keys: `task_id`, `note_id`, `initiative_id`, `draft_id`, `plan_id`, `segment_id`, `rule_id`, `campaign_id`, `canvas_id`, `template_id`. `AgentAction.result: ActionResult`.
  - `MadeBy {agent: AgentKind; approved_by: PersonRef | null}`.
  - `scenarioStepsText(preview: ScenarioPreview): string`.
  - Fixtures: `BUILT_SEGMENT_ID = 61`, `BUILT_RULE_ID = 62`, `BUILT_CAMPAIGN_ID = 63`, `BUILT_CANVAS_ID = 64`, `BUILT_TEMPLATE_ID = 65`; `MADE_BY_OPS: MadeBy` (`{agent: 'ops', approved_by: {id: 1, name: 'Alice'}}`); `ACT_SEGMENT_CREATE` (94), `ACT_SCENARIO_CREATE` (95), `ACT_CAMPAIGN_CREATE` (96), all Ops, proposed, `record: null`; `ACT_CANVAS_CREATE` (97, CS, proposed, on Pizza Hut); `ACT_PLAN_TEMPLATE` (98, Ops, proposed, `record: null`). None is added to `ACTIONS`.

- [ ] **Step 1: Write the failing tests**

In `src/features/agents/agentsText.test.ts`:
- add `scenarioStepsText` to the `./agentsText` import;
- add `ACT_CAMPAIGN_CREATE`, `ACT_CANVAS_CREATE`, `ACT_PLAN_TEMPLATE`, `ACT_SCENARIO_CREATE`, `ACT_SEGMENT_CREATE` to the fixtures import;
- add `import type { ActionKind } from './agentTypes';` (keep the existing `ACTION_KINDS` import);
- in `describe('delivery 2 kinds (contract "New action kinds")', ...)`, replace `expect(ACTION_KINDS.slice(8)).toEqual(['note.create', 'draft.reply', 'plan.start', 'initiative.create']);` with:

```ts
    expect(ACTION_KINDS.slice(8, 11)).toEqual(['note.create', 'draft.reply', 'plan.start']);
    expect(ACTION_KINDS[ACTION_KINDS.length - 1]).toBe('initiative.create');
```

- in the same describe, replace `expect(ACT_PLAN_START.result).toEqual({ task_id: null, note_id: null, initiative_id: null, draft_id: null, plan_id: null });` with:

```ts
    expect(Object.values(ACT_PLAN_START.result).every((value) => value === null)).toBe(true);
```

- append:

```ts
describe('delivery 3 kinds (contract "New kinds")', () => {
  const BUILDER: ActionKind[] = ['segment.create', 'scenario.create', 'campaign.create', 'canvas.create', 'plan.template'];

  it('puts the five builder kinds after Start a plan and before Start an initiative, with the contract labels', () => {
    expect(ACTION_KINDS.slice(10)).toEqual(['plan.start', ...BUILDER, 'initiative.create']);
    expect(BUILDER.map((kind) => KIND_LABEL[kind])).toEqual(['Build a segment', 'Build a scenario', 'Draft a campaign', "Map a record's people", 'Write a plan template']);
  });

  it('words each builder preview, plurals included', () => {
    expect(previewText(ACT_SEGMENT_CREATE)).toBe('Build a segment: Poor health renewals, 2 conditions, 12 organisations');
    expect(previewText({ ...ACT_SEGMENT_CREATE, preview: { segment: { kind: 'contact', name: 'Champions', conditions: 1, members: 1 } } })).toBe(
      'Build a segment: Champions, 1 condition, 1 contact',
    );
    expect(previewText(ACT_SCENARIO_CREATE)).toBe('Build a scenario: Health watch, on Poor health renewals');
    expect(previewText(ACT_CAMPAIGN_CREATE)).toBe('Draft a campaign: Champion check-in (At-risk organisations, Champion): Checking in, {first_name}');
    expect(previewText({ ...ACT_CAMPAIGN_CREATE, preview: { campaign: { ...ACT_CAMPAIGN_CREATE.preview.campaign!, roles: [] } } })).toBe(
      'Draft a campaign: Champion check-in (At-risk organisations): Checking in, {first_name}',
    );
    expect(previewText(ACT_CANVAS_CREATE)).toBe("Map a record's people: Pizza Hut people, 6 people");
    expect(previewText({ ...ACT_CANVAS_CREATE, preview: { canvas: { name: 'Solo', people: 1 } } })).toBe("Map a record's people: Solo, 1 person");
    expect(previewText(ACT_PLAN_TEMPLATE)).toBe('Write a plan template: Save play for at-risk renewals (Save), 3 milestones, 9 tasks');
  });

  it("joins a scenario's trigger and steps, the server's sentences unchanged", () => {
    expect(scenarioStepsText(ACT_SCENARIO_CREATE.preview.scenario!)).toBe('Entered the segment · Task the owner · Notify me');
  });

  it('never falls back to "from → to" for a builder kind', () => {
    for (const action of [ACT_SEGMENT_CREATE, ACT_SCENARIO_CREATE, ACT_CAMPAIGN_CREATE, ACT_CANVAS_CREATE, ACT_PLAN_TEMPLATE]) {
      expect(previewText(action), action.kind).not.toContain('→');
    }
  });

  it('names a builder kind in Waiting and reads it from the URL', () => {
    expect(waitingKindLabel(ACT_SEGMENT_CREATE)).toBe('Ops agent · Build a segment');
    expect(filtersOf(new URLSearchParams('kind=plan.template')).kind).toBe('plan.template');
  });

  it('starts all ten result keys at null', () => {
    expect(ACT_SEGMENT_CREATE.result).toEqual({
      task_id: null,
      note_id: null,
      initiative_id: null,
      draft_id: null,
      plan_id: null,
      segment_id: null,
      rule_id: null,
      campaign_id: null,
      canvas_id: null,
      template_id: null,
    });
  });
});
```

Append to `src/pages/settings/AgentActionsPage.test.tsx`, inside its `describe`:

```tsx
  it("caps the five builder kinds at Ask; only Map a record's people is for every agent (Agents delivery 3)", async () => {
    stubAgents();
    renderPage(<AgentActionsPage />, '/settings/agent-actions');
    const segment = await screen.findByLabelText('Build a segment for the Ops agent');
    expect(within(segment).getAllByRole('option').map((o) => o.textContent)).toEqual(['Ask', 'Never']);
    const map = screen.getByLabelText("Map a record's people for the CS agent");
    expect(within(map).getAllByRole('option').map((o) => o.textContent)).toEqual(['Ask', 'Never']);
    const table = screen.getByRole('table', { name: 'Actions & approvals' });
    for (const label of ['Build a segment', 'Build a scenario', 'Draft a campaign', 'Write a plan template']) {
      expect(within(within(table).getByText(label).closest('tr')!).getAllByText('Not used'), label).toHaveLength(2);
    }
    expect(within(within(table).getByText("Map a record's people").closest('tr')!).queryAllByText('Not used')).toHaveLength(0);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/agents/agentsText.test.ts src/pages/settings/AgentActionsPage.test.tsx --maxWorkers=2`
Expected: FAIL (`ACT_SEGMENT_CREATE` is not exported; no "Build a segment for the Ops agent" select).

- [ ] **Step 3: Add the kinds and shapes to the types**

In `src/features/agents/agentTypes.ts`:
- change the first line to `// Agents, deliveries 1 to 3 (contract revenact-backend`;
- after `import type { PersonRef, TaskPriority } from '../work/workTypes';` add:

```ts
import type { PlanKind } from '../plans/planTypes';
import type { SegmentKind } from '../segments/segmentTypes';
```

- replace `ActionKind` and `ACTION_KINDS` with:

```ts
export type ActionKind =
  | 'record.lifecycle'
  | 'record.owner'
  | 'record.attribute'
  | 'task.create'
  | 'task.reassign'
  | 'task.redate'
  | 'task.complete'
  | 'task.snooze'
  | 'note.create'
  | 'draft.reply'
  | 'plan.start'
  | 'segment.create'
  | 'scenario.create'
  | 'campaign.create'
  | 'canvas.create'
  | 'plan.template'
  | 'initiative.create';
/** The contract's order (deliveries 2 and 3 put their kinds before initiative.create). */
export const ACTION_KINDS: readonly ActionKind[] = [
  'record.lifecycle',
  'record.owner',
  'record.attribute',
  'task.create',
  'task.reassign',
  'task.redate',
  'task.complete',
  'task.snooze',
  'note.create',
  'draft.reply',
  'plan.start',
  'segment.create',
  'scenario.create',
  'campaign.create',
  'canvas.create',
  'plan.template',
  'initiative.create',
];
```

- replace the block from `/** Shaped by the kind (contract "preview")` to the closing `}` of `ActionPreview` with:

```ts
/** Delivery 3 previews (contract "Previews (per reader)"). `members` and
 *  `people` count only what this reader may open; `trigger` and `steps` are
 *  the server's display sentences, shown as they come. */
export interface SegmentPreview {
  kind: SegmentKind;
  name: string;
  conditions: number;
  members: number;
}
export interface ScenarioPreview {
  name: string;
  segment: string;
  trigger: string;
  steps: string[];
}
export interface CampaignPreview {
  name: string;
  segment: string;
  roles: string[];
  subject: string;
  /** The body's first 280 characters. */
  excerpt: string;
}
export interface CanvasPreview {
  name: string;
  people: number;
}
export interface TemplatePreview {
  kind: PlanKind;
  name: string;
  milestones: number;
  tasks: number;
}

/** Shaped by the kind (contract "preview"); `from` and `to` are display strings. */
export interface ActionPreview {
  field?: string;
  from?: string;
  to?: string;
  /** `id` is null for a task the reader can't open or one removed since (delivery 2 follow-up). */
  task?: { id?: number | null; title: string; assignee?: PersonRef | null; due_date?: string; priority?: TaskPriority };
  note?: { title: string };
  initiative?: { metric: string; target: string };
  draft?: DraftPreview;
  plan?: { template: string; milestones: number; tasks: number };
  segment?: SegmentPreview;
  scenario?: ScenarioPreview;
  campaign?: CampaignPreview;
  canvas?: CanvasPreview;
  template?: TemplatePreview;
}
```

- after the `UndoState` interface, add:

```ts
/** What an action made: each key is null unless that kind made it.
 *  `scenario.create` sets `rule_id` and `segment_id`; `campaign.create`
 *  sets `campaign_id` and `segment_id` (contract "New kinds"). */
export interface ActionResult {
  task_id: number | null;
  note_id: number | null;
  initiative_id: number | null;
  draft_id: number | null;
  plan_id: number | null;
  segment_id: number | null;
  rule_id: number | null;
  campaign_id: number | null;
  canvas_id: number | null;
  template_id: number | null;
}

/** `made_by` on a segment, rule, campaign, map or plan template an agent
 *  action made (contract "Made by the agent"). `approved_by` is the
 *  action's decider (contract question 1: typed nullable). */
export interface MadeBy {
  agent: AgentKind;
  approved_by: PersonRef | null;
}
```

- in `AgentAction`, change the `record` comment to `/** Null for workspace-level kinds: initiative.create, and segment.create, scenario.create, campaign.create and plan.template (delivery 3). */`, and replace the two `result` lines with:

```ts
  result: ActionResult;
```

- [ ] **Step 4: Add the words**

In `src/features/agents/agentsText.ts`:
- change the first line to `// Agents' words and rules (deliveries 1 to 3), kept free of React so they are`;
- after `import { formatDate } from '../customers/formatters';` add:

```ts
import { KIND_LABEL as PLAN_KIND_LABEL } from '../plans/planOptions';
import { KIND_NOUN } from '../segments/segmentFields';
```

- add `ScenarioPreview,` to the `import type { ... } from './agentTypes';` list (alphabetical, after `Levels,`);
- in `KIND_LABEL`, after `'plan.start': 'Start a plan',` add:

```ts
  'segment.create': 'Build a segment',
  'scenario.create': 'Build a scenario',
  'campaign.create': 'Draft a campaign',
  'canvas.create': "Map a record's people",
  'plan.template': 'Write a plan template',
```

- in `previewText`, insert before `if (p.task && p.field) return ...`:

```ts
  if (action.kind === 'segment.create' && p.segment) {
    const noun = KIND_NOUN[p.segment.kind];
    return `Build a segment: ${p.segment.name}, ${counted(p.segment.conditions, 'condition')}, ${p.segment.members} ${p.segment.members === 1 ? noun.one : noun.many}`;
  }
  if (action.kind === 'scenario.create' && p.scenario) return `Build a scenario: ${p.scenario.name}, on ${p.scenario.segment}`;
  if (action.kind === 'campaign.create' && p.campaign) {
    const audience = [p.campaign.segment, ...p.campaign.roles].join(', ');
    return `Draft a campaign: ${p.campaign.name} (${audience}): ${p.campaign.subject}`;
  }
  if (action.kind === 'canvas.create' && p.canvas) return `Map a record's people: ${p.canvas.name}, ${p.canvas.people === 1 ? '1 person' : `${p.canvas.people} people`}`;
  if (action.kind === 'plan.template' && p.template) {
    return `Write a plan template: ${p.template.name} (${PLAN_KIND_LABEL[p.template.kind]}), ${counted(p.template.milestones, 'milestone')}, ${counted(p.template.tasks, 'task')}`;
  }
```

- after `export const draftHref = ...`, add:

```ts
/** A scenario's trigger and steps, the server's sentences joined as they come (Decision 1). */
export const scenarioStepsText = (scenario: ScenarioPreview): string => [scenario.trigger, ...scenario.steps].join(' · ');
```

- [ ] **Step 5: Add the fixtures**

In `src/features/agents/testAgentsFixtures.ts`:
- change the first line to `// Test-only: the delivery 1 to 3 contracts' shapes, around the Work fixtures'`;
- change the type import to `import type { ActionKindSpec, AgentAction, AgentCard, AgentKind, AgentSettings, Levels, MadeBy } from './agentTypes';`;
- in `KINDS`, after the `plan.start` entry, add:

```ts
  { kind: 'segment.create', label: 'Build a segment', example: 'Build a segment of organisations renewing in 60 days with poor health', max_level: 'ask', agents: ['ops'] },
  { kind: 'scenario.create', label: 'Build a scenario', example: 'Build a scenario that tasks the owner when health drops below 4', max_level: 'ask', agents: ['ops'] },
  { kind: 'campaign.create', label: 'Draft a campaign', example: 'Draft a check-in campaign to champions of at-risk organisations', max_level: 'ask', agents: ['ops'] },
  { kind: 'canvas.create', label: "Map a record's people", example: 'Map the people at Dough Co', max_level: 'ask', agents: ALL },
  { kind: 'plan.template', label: 'Write a plan template', example: 'Write a save-plan template for at-risk renewals', max_level: 'ask', agents: ['ops'] },
```

- in `base`, replace the `result` line with:

```ts
  result: {
    task_id: null,
    note_id: null,
    initiative_id: null,
    draft_id: null,
    plan_id: null,
    segment_id: null,
    rule_id: null,
    campaign_id: null,
    canvas_id: null,
    template_id: null,
  },
```

- after `ACT_PLAN_START`, before `ACTIONS`, add:

```ts
/** The ids the stub gives what a builder action makes (Agents delivery 3). */
export const BUILT_SEGMENT_ID = 61;
export const BUILT_RULE_ID = 62;
export const BUILT_CAMPAIGN_ID = 63;
export const BUILT_CANVAS_ID = 64;
export const BUILT_TEMPLATE_ID = 65;

/** `made_by` on an object the Ops agent made and Alice approved. */
export const MADE_BY_OPS: MadeBy = { agent: 'ops', approved_by: { id: 1, name: 'Alice' } };

const WORKSPACE_FIGURES = [{ label: 'Workspace figures: 12 organisations renew within 60 days with poor health', link: null }];

/** Waiting for a view-all reader: a private segment for its approver. */
export const ACT_SEGMENT_CREATE: AgentAction = {
  ...base,
  id: 94,
  agent: 'ops',
  kind: 'segment.create',
  title: 'Build a segment of poor health renewals',
  status: 'proposed',
  record: null,
  rationale: 'Twelve organisations renew within 60 days with poor health, and no segment follows them.',
  evidence: WORKSPACE_FIGURES,
  preview: { segment: { kind: 'customer', name: 'Poor health renewals', conditions: 2, members: 12 } },
};

/** Waiting: a rule, switched off, with its own segment. */
export const ACT_SCENARIO_CREATE: AgentAction = {
  ...base,
  id: 95,
  agent: 'ops',
  kind: 'scenario.create',
  title: 'Build a scenario that tasks the owner of a poor health renewal',
  status: 'proposed',
  record: null,
  rationale: 'Poor health renewals get no task until someone notices them.',
  evidence: WORKSPACE_FIGURES,
  preview: { scenario: { name: 'Health watch', segment: 'Poor health renewals', trigger: 'Entered the segment', steps: ['Task the owner', 'Notify me'] } },
};

/** Waiting: a campaign draft, with its own segment. */
export const ACT_CAMPAIGN_CREATE: AgentAction = {
  ...base,
  id: 96,
  agent: 'ops',
  kind: 'campaign.create',
  title: 'Draft a check-in campaign to champions of at-risk organisations',
  status: 'proposed',
  record: null,
  rationale: 'Champions at at-risk organisations have not heard from us in 60 days.',
  evidence: WORKSPACE_FIGURES,
  preview: {
    campaign: {
      name: 'Champion check-in',
      segment: 'At-risk organisations',
      roles: ['Champion'],
      subject: 'Checking in, {first_name}',
      excerpt: 'Hi {first_name},\n\nCould we find 20 minutes next week to talk through the renewal?',
    },
  },
};

/** Waiting on the record's owner: a map of Pizza Hut's people, no links. */
export const ACT_CANVAS_CREATE: AgentAction = {
  ...base,
  id: 97,
  agent: 'cs',
  kind: 'canvas.create',
  title: 'Map the people at Pizza Hut',
  status: 'proposed',
  record: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  rationale: 'Pizza Hut has six people on record and no map.',
  evidence: [{ label: 'people: 6 (decision maker 1, champion 2, other 3)', link: '/organizations/7' }],
  preview: { canvas: { name: 'Pizza Hut people', people: 6 } },
};

/** Waiting: a workspace-shared save-plan template. */
export const ACT_PLAN_TEMPLATE: AgentAction = {
  ...base,
  id: 98,
  agent: 'ops',
  kind: 'plan.template',
  title: 'Write a save-plan template for at-risk renewals',
  status: 'proposed',
  record: null,
  rationale: 'Five save plans this quarter were built by hand with the same steps.',
  evidence: WORKSPACE_FIGURES,
  preview: { template: { kind: 'save', name: 'Save play for at-risk renewals', milestones: 3, tasks: 9 } },
};
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/features/agents src/pages/settings/AgentActionsPage.test.tsx src/pages/work/Activity.test.tsx --maxWorkers=2`
Expected: PASS (Activity's earlier tests still see their rows: the new fixtures are not in `ACTIONS`).

- [ ] **Step 7: Commit**

```bash
git add src/features/agents/agentTypes.ts src/features/agents/agentsText.ts src/features/agents/testAgentsFixtures.ts src/features/agents/agentsText.test.ts src/pages/settings/AgentActionsPage.test.tsx
git commit -m "feat(agents): add the five builder kinds, their labels and previews

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The agents stub makes what each builder kind makes

**Files:**
- Modify: `src/features/agents/testAgents.ts:1-6` (header, import), `:110-112` (apply)
- Test: `src/features/agents/testAgents.test.ts`, `src/components/agents/UndoAction.test.tsx`

**Interfaces:**
- Consumes: Task 1's `BUILT_*` ids and `ACT_*` fixtures.
- Produces: approving a builder action sets its result keys: `segment.create` → `segment_id: BUILT_SEGMENT_ID`; `scenario.create` → `rule_id: BUILT_RULE_ID`, `segment_id: BUILT_SEGMENT_ID`; `campaign.create` → `campaign_id: BUILT_CAMPAIGN_ID`, `segment_id: BUILT_SEGMENT_ID`; `canvas.create` → `canvas_id: BUILT_CANVAS_ID`; `plan.template` → `template_id: BUILT_TEMPLATE_ID`. Builder refusals (`OWNER_LIMIT`, the undo sentences) go through the existing `refuseNextDecision`.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/agents/testAgents.test.ts` (extend the fixtures import with `ACT_CAMPAIGN_CREATE`, `ACT_CANVAS_CREATE`, `ACT_PLAN_TEMPLATE`, `ACT_SCENARIO_CREATE`, `ACT_SEGMENT_CREATE`, `BUILT_CAMPAIGN_ID`, `BUILT_CANVAS_ID`, `BUILT_RULE_ID`, `BUILT_SEGMENT_ID`, `BUILT_TEMPLATE_ID`):

```ts
describe('stubAgents: delivery 3', () => {
  it('applies each builder kind with the result ids the contract names', async () => {
    stubAgents({ actions: [ACT_SEGMENT_CREATE, ACT_SCENARIO_CREATE, ACT_CAMPAIGN_CREATE, ACT_CANVAS_CREATE, ACT_PLAN_TEMPLATE] });
    const result = async (id: number) => (await post(`/agents/actions/${id}/approve/`)).body.action.result;
    expect(await result(ACT_SEGMENT_CREATE.id)).toMatchObject({ segment_id: BUILT_SEGMENT_ID, rule_id: null, campaign_id: null });
    expect(await result(ACT_SCENARIO_CREATE.id)).toMatchObject({ rule_id: BUILT_RULE_ID, segment_id: BUILT_SEGMENT_ID, campaign_id: null });
    expect(await result(ACT_CAMPAIGN_CREATE.id)).toMatchObject({ campaign_id: BUILT_CAMPAIGN_ID, segment_id: BUILT_SEGMENT_ID, rule_id: null });
    expect(await result(ACT_CANVAS_CREATE.id)).toMatchObject({ canvas_id: BUILT_CANVAS_ID, segment_id: null });
    expect(await result(ACT_PLAN_TEMPLATE.id)).toMatchObject({ template_id: BUILT_TEMPLATE_ID, plan_id: null });
  });

  it('leaves an action proposed when an approval is refused past an owner limit', async () => {
    stubAgents({ actions: [ACT_SEGMENT_CREATE], refuseNextDecision: { status: 409, body: { code: 'OWNER_LIMIT', detail: 'You already own 50 segments.' } } });
    const refused = await post(`/agents/actions/${ACT_SEGMENT_CREATE.id}/approve/`);
    expect(refused).toEqual({ status: 409, body: { code: 'OWNER_LIMIT', detail: 'You already own 50 segments.' } });
    const again = await post(`/agents/actions/${ACT_SEGMENT_CREATE.id}/approve/`);
    expect(again.body.action.status).toBe('applied');
  });
});
```

Append to `src/components/agents/UndoAction.test.tsx`, inside its `describe` (add `ACT_SEGMENT_CREATE` and `BUILT_SEGMENT_ID` to the fixtures import):

```tsx
  it('shows a builder undo refusal as the server sentence alone (Agents delivery 3)', async () => {
    const applied = {
      ...ACT_SEGMENT_CREATE,
      status: 'applied' as const,
      decided_by: { id: 1, name: 'Alice' },
      applied_at: '2026-10-08T09:10:00Z',
      undo: { allowed: true, until: '2026-10-15T09:10:00Z', reason: null },
      result: { ...ACT_SEGMENT_CREATE.result, segment_id: BUILT_SEGMENT_ID },
    };
    stubAgents({
      actions: [applied],
      refuseNextDecision: { status: 409, body: { code: 'CHANGED_SINCE', detail: 'A scenario, campaign or survey uses this segment now.' } },
    });
    render(<UndoAction action={applied} onUndone={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/^A scenario, campaign or survey uses this segment now\.$/);
    await waitFor(() => expect(alert).toHaveFocus());
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/agents/testAgents.test.ts src/components/agents/UndoAction.test.tsx --maxWorkers=2`
Expected: FAIL in "applies each builder kind" (every result key stays null). The other two pass already: they pin behaviour the builder kinds rely on.

- [ ] **Step 3: Teach the stub**

In `src/features/agents/testAgents.ts`:
- change the second header line to `// to 3 contracts' shapes and refusal orders. Writes are kept, so a later read` and the first to `// Test-only: one stateful fetch stub for /api/v1/agents/, in the delivery 1`;
- replace the fixtures import with:

```ts
import {
  ACTIONS,
  AGENT_SETTINGS,
  BUILT_CAMPAIGN_ID,
  BUILT_CANVAS_ID,
  BUILT_RULE_ID,
  BUILT_SEGMENT_ID,
  BUILT_TEMPLATE_ID,
  DRAFT_EMAIL_ID,
  DRAFT_TICKET_ID,
  STARTED_PLAN_ID,
} from './testAgentsFixtures';
```

- after `if (a.kind === 'plan.start') a.result = { ...a.result, plan_id: STARTED_PLAN_ID };` add:

```ts
      if (a.kind === 'segment.create') a.result = { ...a.result, segment_id: BUILT_SEGMENT_ID };
      if (a.kind === 'scenario.create') a.result = { ...a.result, rule_id: BUILT_RULE_ID, segment_id: BUILT_SEGMENT_ID };
      if (a.kind === 'campaign.create') a.result = { ...a.result, campaign_id: BUILT_CAMPAIGN_ID, segment_id: BUILT_SEGMENT_ID };
      if (a.kind === 'canvas.create') a.result = { ...a.result, canvas_id: BUILT_CANVAS_ID };
      if (a.kind === 'plan.template') a.result = { ...a.result, template_id: BUILT_TEMPLATE_ID };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/agents/testAgents.test.ts src/components/agents/UndoAction.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/agents/testAgents.ts src/features/agents/testAgents.test.ts src/components/agents/UndoAction.test.tsx
git commit -m "test(agents): stub what each builder kind makes, and its refusals

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Activity opens what was built; the body shows steps and opening lines

**Files:**
- Modify: `src/features/agents/agentsText.ts` (`AGENTS`, `builtLinks`)
- Modify: `src/components/agents/ActivityRow.tsx`
- Modify: `src/components/agents/AgentActionBody.tsx`
- Test: `src/features/agents/agentsText.test.ts`, `src/pages/work/Activity.test.tsx`

**Interfaces:**
- Consumes: Task 1's `ActionResult`, `scenarioStepsText`, fixtures; Task 2's stub.
- Produces:
  - `AGENTS.OPEN_SEGMENT` ("Open segment"), `OPEN_SCENARIO` ("Open scenario"), `OPEN_CAMPAIGN` ("Open campaign"), `OPEN_MAP` ("Open map"), `OPEN_TEMPLATE` ("Open template").
  - `builtLinks(action: AgentAction): { label: string; to: string }[]`: empty unless `status === 'applied'`; otherwise one entry per set key in the order rule, campaign, segment, canvas, template (Decision 2).
  - `AgentActionBody` renders `p[data-part="steps"]` under a scenario preview and `blockquote[data-part="excerpt"]` under a draft or a campaign preview.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/agents/agentsText.test.ts` (add `builtLinks` to the `./agentsText` import, and `BUILT_RULE_ID`, `BUILT_SEGMENT_ID`, `BUILT_TEMPLATE_ID` to the fixtures import):

```ts
describe('builtLinks (delivery 3, Decision 2)', () => {
  const applied = (action: AgentAction, result: Partial<AgentAction['result']>): AgentAction => ({
    ...action,
    status: 'applied',
    result: { ...action.result, ...result },
  });

  it('links nothing until the action is applied, and nothing once it is undone', () => {
    expect(builtLinks(ACT_SEGMENT_CREATE)).toEqual([]);
    expect(builtLinks({ ...applied(ACT_SEGMENT_CREATE, { segment_id: BUILT_SEGMENT_ID }), status: 'undone' })).toEqual([]);
  });

  it('links a scenario before its segment, and a template to its editor', () => {
    expect(builtLinks(applied(ACT_SCENARIO_CREATE, { rule_id: BUILT_RULE_ID, segment_id: BUILT_SEGMENT_ID }))).toEqual([
      { label: 'Open scenario', to: `/scenarios/rules/${BUILT_RULE_ID}` },
      { label: 'Open segment', to: `/segments/${BUILT_SEGMENT_ID}` },
    ]);
    expect(builtLinks(applied(ACT_PLAN_TEMPLATE, { template_id: BUILT_TEMPLATE_ID }))).toEqual([
      { label: 'Open template', to: `/projects/templates/${BUILT_TEMPLATE_ID}/edit` },
    ]);
  });
});
```

(add `import type { AgentAction } from './agentTypes';` to that file's type import if it is not there yet; if `ActionKind` is already imported from it, write `import type { ActionKind, AgentAction } from './agentTypes';`).

Append to `src/pages/work/Activity.test.tsx` (extend the fixtures import with `ACT_CAMPAIGN_CREATE`, `ACT_CANVAS_CREATE`, `ACT_PLAN_TEMPLATE`, `ACT_SCENARIO_CREATE`, `ACT_SEGMENT_CREATE`, `BUILT_CAMPAIGN_ID`, `BUILT_CANVAS_ID`, `BUILT_RULE_ID`, `BUILT_SEGMENT_ID`, `BUILT_TEMPLATE_ID`):

```tsx
describe('Work › Activity: the builder (Agents delivery 3; Decisions 1 and 2)', () => {
  const applied = (action: AgentAction, result: Partial<AgentAction['result']>): AgentAction => ({
    ...action,
    status: 'applied',
    decided_by: { id: 1, name: 'Alice' },
    decided_at: '2026-10-08T09:10:00Z',
    applied_at: '2026-10-08T09:10:00Z',
    undo: { allowed: true, until: '2026-10-15T09:10:00Z', reason: null },
    result: { ...action.result, ...result },
  });
  const opens = (row: HTMLElement) =>
    within(row)
      .queryAllByRole('link')
      .filter((link) => link.textContent?.startsWith('Open '))
      .map((link) => [link.textContent, link.getAttribute('href')]);

  it('links what each applied action made, never an undone one, with 44px targets', async () => {
    const undone: AgentAction = {
      ...applied(ACT_SEGMENT_CREATE, { segment_id: BUILT_SEGMENT_ID }),
      status: 'undone',
      undo: null,
      undone_by: { id: 1, name: 'Alice' },
      undone_at: '2026-10-08T09:30:00Z',
    };
    stubBoth({
      actions: [
        undone,
        applied(ACT_SCENARIO_CREATE, { rule_id: BUILT_RULE_ID, segment_id: BUILT_SEGMENT_ID }),
        applied(ACT_CAMPAIGN_CREATE, { campaign_id: BUILT_CAMPAIGN_ID, segment_id: BUILT_SEGMENT_ID }),
        applied(ACT_CANVAS_CREATE, { canvas_id: BUILT_CANVAS_ID }),
        applied(ACT_PLAN_TEMPLATE, { template_id: BUILT_TEMPLATE_ID }),
      ],
    });
    renderWork('/work/activity');
    const list = await screen.findByRole('list', { name: 'Agent actions' });
    const row = (id: number) => list.querySelector(`[data-action="${id}"]`) as HTMLElement;
    expect(opens(row(ACT_SEGMENT_CREATE.id))).toEqual([]);
    expect(opens(row(ACT_SCENARIO_CREATE.id))).toEqual([
      ['Open scenario', `/scenarios/rules/${BUILT_RULE_ID}`],
      ['Open segment', `/segments/${BUILT_SEGMENT_ID}`],
    ]);
    expect(opens(row(ACT_CAMPAIGN_CREATE.id))).toEqual([
      ['Open campaign', `/campaigns/${BUILT_CAMPAIGN_ID}`],
      ['Open segment', `/segments/${BUILT_SEGMENT_ID}`],
    ]);
    expect(opens(row(ACT_CANVAS_CREATE.id))).toEqual([['Open map', `/canvas/${BUILT_CANVAS_ID}`]]);
    expect(opens(row(ACT_PLAN_TEMPLATE.id))).toEqual([['Open template', `/projects/templates/${BUILT_TEMPLATE_ID}/edit`]]);
    expect(within(row(ACT_CANVAS_CREATE.id)).getByRole('link', { name: 'Open map' }).className).toMatch(/\bmin-h-11\b/);
    // A workspace-level row names no record; the map names its own.
    expect(within(row(ACT_SCENARIO_CREATE.id)).queryByRole('link', { name: 'Pizza Hut' })).toBeNull();
    expect(within(row(ACT_CANVAS_CREATE.id)).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
  });

  it("words each builder kind, with a scenario's steps and a campaign's opening lines", async () => {
    stubBoth({ actions: [ACT_SEGMENT_CREATE, ACT_SCENARIO_CREATE, ACT_CAMPAIGN_CREATE, ACT_CANVAS_CREATE, ACT_PLAN_TEMPLATE] });
    renderWork('/work/activity');
    const list = await screen.findByRole('list', { name: 'Agent actions' });
    const part = (id: number, name: string) => list.querySelector(`[data-action="${id}"] [data-part="${name}"]`);
    expect(part(ACT_SEGMENT_CREATE.id, 'preview')).toHaveTextContent('Build a segment: Poor health renewals, 2 conditions, 12 organisations');
    expect(part(ACT_SCENARIO_CREATE.id, 'preview')).toHaveTextContent('Build a scenario: Health watch, on Poor health renewals');
    expect(part(ACT_SCENARIO_CREATE.id, 'steps')).toHaveTextContent('Entered the segment · Task the owner · Notify me');
    expect(part(ACT_CAMPAIGN_CREATE.id, 'excerpt')).toHaveTextContent(/^Hi \{first_name\}, Could we find 20 minutes next week/);
    expect(part(ACT_CANVAS_CREATE.id, 'preview')).toHaveTextContent("Map a record's people: Pizza Hut people, 6 people");
    expect(part(ACT_PLAN_TEMPLATE.id, 'preview')).toHaveTextContent('Write a plan template: Save play for at-risk renewals (Save), 3 milestones, 9 tasks');
    expect(part(ACT_SEGMENT_CREATE.id, 'steps')).toBeNull();
    expect(part(ACT_SEGMENT_CREATE.id, 'excerpt')).toBeNull();
  });

  it('filters by a builder kind', async () => {
    const { spy } = stubBoth({ actions: [ACT_SEGMENT_CREATE, ACT_PLAN_TEMPLATE, ACT_LIFECYCLE] });
    renderWork('/work/activity');
    await screen.findByRole('list', { name: 'Agent actions' });
    await userEvent.selectOptions(screen.getByLabelText('Action'), 'segment.create');
    await waitFor(() => expect(where()).toBe('/work/activity?kind=segment.create'));
    expect(calls(spy, 'GET', '/agents/actions/')).toContain('/agents/actions/?kind=segment.create');
    await waitFor(() =>
      expect(actionRows(screen.getByRole('list', { name: 'Agent actions' })).map((row) => row.getAttribute('data-action'))).toEqual([String(ACT_SEGMENT_CREATE.id)]),
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/agents/agentsText.test.ts src/pages/work/Activity.test.tsx --maxWorkers=2`
Expected: FAIL (`builtLinks` is not exported; no "Open scenario" link; no `steps` part; no campaign excerpt). "filters by a builder kind" may already pass: it pins Task 1's `ACTION_KINDS`.

- [ ] **Step 3: Add the words and the links**

In `src/features/agents/agentsText.ts`:
- add `ActionResult,` to the `import type { ... } from './agentTypes';` list (after `ActionLevel,`);
- in `AGENTS`, after `OPEN_PLAN: 'Open plan',` add:

```ts
  OPEN_SEGMENT: 'Open segment',
  OPEN_SCENARIO: 'Open scenario',
  OPEN_CAMPAIGN: 'Open campaign',
  OPEN_MAP: 'Open map',
  OPEN_TEMPLATE: 'Open template',
```

- after `scenarioStepsText`, add:

```ts
type BuiltKey = keyof Pick<ActionResult, 'rule_id' | 'campaign_id' | 'segment_id' | 'canvas_id' | 'template_id'>;

/** What a builder action made, in the order a row lists it (Decision 2). */
const BUILT: readonly { key: BuiltKey; label: string; href: (id: number) => string }[] = [
  { key: 'rule_id', label: AGENTS.OPEN_SCENARIO, href: (id) => `/scenarios/rules/${id}` },
  { key: 'campaign_id', label: AGENTS.OPEN_CAMPAIGN, href: (id) => `/campaigns/${id}` },
  { key: 'segment_id', label: AGENTS.OPEN_SEGMENT, href: (id) => `/segments/${id}` },
  { key: 'canvas_id', label: AGENTS.OPEN_MAP, href: (id) => `/canvas/${id}` },
  // Templates have no page of their own: the editor is where one opens.
  { key: 'template_id', label: AGENTS.OPEN_TEMPLATE, href: (id) => `/projects/templates/${id}/edit` },
];

/** Links to what an action built, only while it is applied: undo deletes them. */
export function builtLinks(action: AgentAction): { label: string; to: string }[] {
  if (action.status !== 'applied') return [];
  return BUILT.flatMap(({ key, label, href }) => {
    const id = action.result[key];
    return id === null ? [] : [{ label, to: href(id) }];
  });
}
```

- [ ] **Step 4: Render them**

In `src/components/agents/ActivityRow.tsx`:
- replace line 1 with `import { Fragment, useId } from 'react';`;
- replace line 3 with `import { AGENTS, AGENT_LABEL, builtLinks, draftHref, statusText } from '../../features/agents/agentsText';`;
- replace the comment above `export function ActivityRow` with:

```tsx
/** One agent action in Activity (spec §1.8): the title, a meta line (agent,
 *  record, status, when, and what the action made: Open task, Open draft
 *  while it can still exist, Open plan, and, while a builder action is
 *  applied, Open scenario, campaign, segment, map or template), the body,
 *  and Undo while it may. `focus` marks the row the bell linked to. */
```

- after `const planId = action.result.plan_id;` add `const built = builtLinks(action);`;
- after the `planId !== null ? (...) : null}` block, before `</p>`, add:

```tsx
          {built.map((link) => (
            <Fragment key={link.to}>
              <Dot />
              <Link to={link.to} className={META_LINK}>
                {link.label}
              </Link>
            </Fragment>
          ))}
```

In `src/components/agents/AgentActionBody.tsx`:
- replace line 2 with `import { AGENTS, previewText, scenarioStepsText, taskChangeText } from '../../features/agents/agentsText';`;
- after `const taskId = ...;` add:

```tsx
  // A reply draft or a campaign shows its opening lines; a scenario its
  // trigger and steps (deliveries 2 and 3, Decision 1).
  const excerpt =
    action.kind === 'draft.reply' ? action.preview.draft?.excerpt : action.kind === 'campaign.create' ? action.preview.campaign?.excerpt : undefined;
  const scenario = action.kind === 'scenario.create' ? action.preview.scenario : undefined;
```

- replace the block `{action.kind === 'draft.reply' && action.preview.draft ? ( ... ) : null}` with:

```tsx
      {scenario ? (
        <p data-part="steps" className="text-[13px] text-ink-muted">
          {scenarioStepsText(scenario)}
        </p>
      ) : null}
      {excerpt ? (
        <blockquote data-part="excerpt" className="max-w-[70ch] whitespace-pre-line border-l-2 border-line pl-3 text-[13px] text-ink-muted">
          {excerpt}
        </blockquote>
      ) : null}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/features/agents src/components/agents src/pages/work/Activity.test.tsx --maxWorkers=2`
Expected: PASS (delivery 2's draft excerpt test still finds its blockquote).

- [ ] **Step 6: Commit**

```bash
git add src/features/agents/agentsText.ts src/features/agents/agentsText.test.ts src/components/agents/ActivityRow.tsx src/components/agents/AgentActionBody.tsx src/pages/work/Activity.test.tsx
git commit -m "feat(agents): Activity opens what a builder action made; scenarios and campaigns show their detail

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `MadeByLine`, the shared "Made by the Ops agent" line

**Files:**
- Modify: `src/features/agents/agentsText.ts` (`madeByText`)
- Create: `src/components/agents/MadeByLine.tsx`
- Test: `src/components/agents/MadeByLine.test.tsx`

**Interfaces:**
- Consumes: Task 1's `MadeBy` and `MADE_BY_OPS`; `AGENT_LABEL` (`{cs: 'CS agent', sales: 'Sales agent', ops: 'Ops agent'}`).
- Produces:
  - `madeByText(madeBy: MadeBy): string`: "Made by the Ops agent, approved by Alice", or "Made by the Ops agent" when `approved_by` is null.
  - `MadeByLine({ madeBy, className }: { madeBy: MadeBy | null | undefined; className?: string })`: nothing for `null` or `undefined`, else `<p data-part="made-by">` (11px, `text-ink-muted`, Lucide `Bot`).

- [ ] **Step 1: Write the failing test**

Create `src/components/agents/MadeByLine.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { madeByText } from '../../features/agents/agentsText';
import { MADE_BY_OPS } from '../../features/agents/testAgentsFixtures';
import { MadeByLine } from './MadeByLine';

describe('MadeByLine (Agents delivery 3, Decision 4)', () => {
  it('names the agent and who approved it, with a hidden icon', () => {
    const { container } = render(<MadeByLine madeBy={MADE_BY_OPS} className="px-2" />);
    const line = container.querySelector('[data-part="made-by"]') as HTMLElement;
    expect(line).toHaveTextContent(/^Made by the Ops agent, approved by Alice$/);
    expect(line).toHaveClass('text-[11px]', 'text-ink-muted', 'px-2');
    expect(line.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('names only the agent when the server sends no approver', () => {
    expect(madeByText({ agent: 'cs', approved_by: null })).toBe('Made by the CS agent');
  });

  it('renders nothing for an object a person made', () => {
    expect(render(<MadeByLine madeBy={null} />).container).toBeEmptyDOMElement();
    expect(render(<MadeByLine madeBy={undefined} />).container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/agents/MadeByLine.test.tsx --maxWorkers=2`
Expected: FAIL (`./MadeByLine` cannot be resolved; `madeByText` is not exported).

- [ ] **Step 3: Write the words and the line**

In `src/features/agents/agentsText.ts`, add `MadeBy,` to the `import type { ... } from './agentTypes';` list (after `Levels,`), and after `builtLinks` add:

```ts
/** "Made by the Ops agent, approved by Alice" (contract "Made by the agent"). */
export const madeByText = (madeBy: MadeBy): string =>
  `Made by the ${AGENT_LABEL[madeBy.agent]}${madeBy.approved_by ? `, approved by ${madeBy.approved_by.name}` : ''}`;
```

Create `src/components/agents/MadeByLine.tsx`:

```tsx
import { Bot } from 'lucide-react';
import { madeByText } from '../../features/agents/agentsText';
import type { MadeBy } from '../../features/agents/agentTypes';

/** "Made by the Ops agent, approved by Alice" (Agents delivery 3, Decision
 *  4): under the owner line of a segment, scenario, campaign, map or plan
 *  template an agent action made. Nothing when a person made it; the
 *  server's `made_by` alone decides. */
export function MadeByLine({ madeBy, className = '' }: { madeBy: MadeBy | null | undefined; className?: string }) {
  if (!madeBy) return null;
  return (
    <p data-part="made-by" className={`flex items-center gap-1.5 text-[11px] text-ink-muted ${className}`}>
      <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {madeByText(madeBy)}
    </p>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/agents --maxWorkers=2`
Expected: PASS, the agents house-rules suite included (it globs `./*.tsx`, so it already scans the new file and its test).

- [ ] **Step 5: Commit**

```bash
git add src/features/agents/agentsText.ts src/components/agents/MadeByLine.tsx src/components/agents/MadeByLine.test.tsx
git commit -m "feat(agents): add the shared made-by line

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: A segment says an agent made it

**Files:**
- Modify: `src/features/segments/segmentTypes.ts:67-105` (`SegmentListRow`, `Segment`)
- Modify: `src/features/segments/testSegments.ts` (import; `AGENT_SEGMENT` after `DANA_PRIVATE`)
- Modify: `src/components/segments/SegmentHeader.tsx:1-10` (import), `:115-118` (the line)
- Test: `src/pages/segments/SegmentPage.test.tsx`

**Interfaces:**
- Consumes: Task 1's `MadeBy`, `MADE_BY_OPS`, `BUILT_SEGMENT_ID`; Task 4's `MadeByLine`.
- Produces: `Segment.made_by?: MadeBy | null` and `SegmentListRow.made_by?: MadeBy | null` (Decision 3); `AGENT_SEGMENT: Segment` (id 61, "Poor health renewals", private, Alice's, `made_by: MADE_BY_OPS`), not in `SEGMENTS`.

- [ ] **Step 1: Write the failing test**

In `src/pages/segments/SegmentPage.test.tsx`, change the fixtures import to `import { AGENT_SEGMENT, DANA_PRIVATE, SEGMENTS, requests, stubSegments } from '../../features/segments/testSegments';`, and append inside `describe('/segments/:id (spec §3)', ...)`:

```tsx
  it('says an agent made it, and who approved it (Agents delivery 3)', async () => {
    stubSegments({ segments: [...SEGMENTS, AGENT_SEGMENT] });
    renderSegments(`/segments/${AGENT_SEGMENT.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Poor health renewals' })).toBeInTheDocument();
    expect(document.querySelector('[data-part="made-by"]')).toHaveTextContent('Made by the Ops agent, approved by Alice');
  });

  it('says nothing of an agent on a segment a person made', async () => {
    stubSegments();
    renderSegments('/segments/7');
    await screen.findByRole('heading', { level: 1, name: 'Renewal risk' });
    expect(document.querySelector('[data-part="made-by"]')).toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/pages/segments/SegmentPage.test.tsx --maxWorkers=2`
Expected: FAIL (`AGENT_SEGMENT` is not exported).

- [ ] **Step 3: Type it, fixture it, show it**

In `src/features/segments/segmentTypes.ts`, add at the top, after any existing imports (or as the first line if there are none):

```ts
import type { MadeBy } from '../agents/agentTypes';
```

and add to both `SegmentListRow` (after `updated_at: string;`) and `Segment` (after `updated_at: string;`):

```ts
  /** The agent action that made it (Agents delivery 3); null or absent when a person did. */
  made_by?: MadeBy | null;
```

In `src/features/segments/testSegments.ts`, add `import { BUILT_SEGMENT_ID, MADE_BY_OPS } from '../agents/testAgentsFixtures';` with the other imports, and after the `DANA_PRIVATE` constant add:

```ts
/** Agents delivery 3: the segment the Ops agent built and Alice approved
 *  (private, hers). Not in SEGMENTS, so the list's counts stay. */
export const AGENT_SEGMENT: Segment = {
  ...RENEWAL_RISK,
  id: BUILT_SEGMENT_ID,
  name: 'Poor health renewals',
  description: 'Organisations renewing within 60 days with poor health.',
  sharing: 'private',
  made_by: MADE_BY_OPS,
};
```

In `src/components/segments/SegmentHeader.tsx`, add `import { MadeByLine } from '../agents/MadeByLine';` after the `ConfirmDialog` import, and directly after the closing `</p>` of the owner line (`{segment.is_owner ? 'Yours' : ...}` … `{segment.paused ? ' · Paused' : ''}`) add:

```tsx
      <MadeByLine madeBy={segment.made_by} />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/segments src/components/segments --maxWorkers=2`
Expected: PASS, the segments house-rules suite included.

- [ ] **Step 5: Commit**

```bash
git add src/features/segments/segmentTypes.ts src/features/segments/testSegments.ts src/components/segments/SegmentHeader.tsx src/pages/segments/SegmentPage.test.tsx
git commit -m "feat(segments): say when an agent made a segment

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: A scenario (rule) says an agent made it

**Files:**
- Modify: `src/features/rules/ruleTypes.ts:103-118` (`RuleRow`)
- Modify: `src/components/rules/RuleHeader.tsx:1-11` (import), `:47-50` (the line)
- Test: `src/pages/rules/RulePage.test.tsx`

**Interfaces:**
- Consumes: Task 1's `MadeBy`, `MADE_BY_OPS`, `BUILT_RULE_ID`; Task 4's `MadeByLine`; `StoredRule`, `RULES`, `WELCOME_TASKS` (`src/features/rules/testRules.ts`; the stub's detail spreads the stored rule, so `made_by` comes through).
- Produces: `RuleRow.made_by?: MadeBy | null` (so `Rule` has it too).

- [ ] **Step 1: Write the failing test**

In `src/pages/rules/RulePage.test.tsx`, extend the `testRules` import with `RULES`, `WELCOME_TASKS` and `type StoredRule` (keep what is there), add `import { BUILT_RULE_ID, MADE_BY_OPS } from '../../features/agents/testAgentsFixtures';`, and append inside `describe('a rule (spec §2.3)', ...)`:

```tsx
  it('says an agent made it, and who approved it (Agents delivery 3)', async () => {
    const agentRule: StoredRule = { ...WELCOME_TASKS, id: BUILT_RULE_ID, name: 'Health watch', made_by: MADE_BY_OPS };
    stubRules({ rules: [...RULES, agentRule] });
    renderRules(`/scenarios/rules/${BUILT_RULE_ID}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Health watch' })).toBeInTheDocument();
    expect(document.querySelector('[data-part="made-by"]')).toHaveTextContent('Made by the Ops agent, approved by Alice');
  });

  it('says nothing of an agent on a rule a person made', async () => {
    stubRules();
    renderRules('/scenarios/rules/5');
    await screen.findByRole('heading', { level: 1, name: 'Renewal watch' });
    expect(document.querySelector('[data-part="made-by"]')).toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/pages/rules/RulePage.test.tsx --maxWorkers=2`
Expected: FAIL (no `[data-part="made-by"]` on the agent's rule).

- [ ] **Step 3: Type it and show it**

In `src/features/rules/ruleTypes.ts`, add `import type { MadeBy } from '../agents/agentTypes';` with the other imports, and add to `RuleRow`, as its last field:

```ts
  /** The agent action that made it (Agents delivery 3); null or absent when a person did. */
  made_by?: MadeBy | null;
```

In `src/components/rules/RuleHeader.tsx`, add `import { MadeByLine } from '../agents/MadeByLine';` after the `ConfirmDialog` import, and directly after the closing `</p>` of `data-part="meta"` add:

```tsx
      <MadeByLine madeBy={rule.made_by} />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/rules src/components/rules --maxWorkers=2`
Expected: PASS, the rules house-rules suite included.

- [ ] **Step 5: Commit**

```bash
git add src/features/rules/ruleTypes.ts src/components/rules/RuleHeader.tsx src/pages/rules/RulePage.test.tsx
git commit -m "feat(rules): say when an agent made a scenario

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: A campaign says an agent drafted it

**Files:**
- Modify: `src/features/campaigns/campaignTypes.ts:32-49` (`CampaignRow`)
- Modify: `src/features/campaigns/testCampaigns.ts:96-111` (`row`)
- Modify: `src/components/campaigns/CampaignHeader.tsx:1-14` (import), `:67-73` (the line)
- Test: `src/pages/campaigns/CampaignPage.test.tsx`

**Interfaces:**
- Consumes: Task 1's `MadeBy`, `MADE_BY_OPS`, `BUILT_CAMPAIGN_ID`; Task 4's `MadeByLine`; `CAMPAIGNS`, `CHAMPION_NEWS`, `StoredCampaign` (`src/features/campaigns/testCampaignFixtures.ts`).
- Produces: `CampaignRow.made_by?: MadeBy | null` (so `Campaign` and `StoredCampaign` have it); the stub's `row()` copies it as `made_by: one.made_by ?? null`.

- [ ] **Step 1: Write the failing test**

In `src/pages/campaigns/CampaignPage.test.tsx`, add:

```tsx
import { BUILT_CAMPAIGN_ID, MADE_BY_OPS } from '../../features/agents/testAgentsFixtures';
import { CAMPAIGNS, CHAMPION_NEWS, type StoredCampaign } from '../../features/campaigns/testCampaignFixtures';
```

and append inside `describe('a campaign page (spec §2.3)', ...)`:

```tsx
  it('says an agent drafted it, and who approved it (Agents delivery 3)', async () => {
    const agentCampaign: StoredCampaign = { ...CHAMPION_NEWS, id: BUILT_CAMPAIGN_ID, name: 'Champion check-in', made_by: MADE_BY_OPS };
    stubCampaigns({ campaigns: [...CAMPAIGNS, agentCampaign] });
    renderCampaigns(`/campaigns/${BUILT_CAMPAIGN_ID}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Champion check-in' })).toBeInTheDocument();
    expect(document.querySelector('[data-part="made-by"]')).toHaveTextContent('Made by the Ops agent, approved by Alice');
  });

  it('says nothing of an agent on a campaign a person made', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/11');
    await screen.findByRole('heading', { level: 1, name: 'Win-back' });
    expect(document.querySelector('[data-part="made-by"]')).toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/pages/campaigns/CampaignPage.test.tsx --maxWorkers=2`
Expected: FAIL (the stub's row drops `made_by`, and the header has no line).

- [ ] **Step 3: Type it, copy it, show it**

In `src/features/campaigns/campaignTypes.ts`, add `import type { MadeBy } from '../agents/agentTypes';` with the other imports, and add to `CampaignRow`, as its last field:

```ts
  /** The agent action that made it (Agents delivery 3); null or absent when a person did. */
  made_by?: MadeBy | null;
```

In `src/features/campaigns/testCampaigns.ts`, in `row`, after `updated_at: one.updated_at,` add:

```ts
      made_by: one.made_by ?? null,
```

In `src/components/campaigns/CampaignHeader.tsx`, add `import { MadeByLine } from '../agents/MadeByLine';` after the `ConfirmDialog` import, and directly after the closing `</p>` of `data-part="meta"` add:

```tsx
      <MadeByLine madeBy={campaign.made_by} />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/campaigns src/components/campaigns src/features/campaigns --maxWorkers=2`
Expected: PASS, the campaigns house-rules suite included.

- [ ] **Step 5: Commit**

```bash
git add src/features/campaigns/campaignTypes.ts src/features/campaigns/testCampaigns.ts src/components/campaigns/CampaignHeader.tsx src/pages/campaigns/CampaignPage.test.tsx
git commit -m "feat(campaigns): say when an agent drafted a campaign

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: A map says an agent laid it out

**Files:**
- Modify: `src/features/canvas/canvasTypes.ts:56-64` (`CanvasRow`)
- Modify: `src/features/canvas/testCanvasFixtures.ts:54-64` (`StoredMap`)
- Modify: `src/features/canvas/testCanvases.ts:101` (`row`)
- Modify: `src/components/canvas/MapHeader.tsx:1-8` (import), `:39-45` (the line)
- Test: `src/pages/canvas/MapEditor.test.tsx`

**Interfaces:**
- Consumes: Task 1's `MadeBy`, `MADE_BY_OPS`, `BUILT_CANVAS_ID`; Task 4's `MadeByLine`; `MAPS`, `HUT_MAP` (`testCanvasFixtures.ts`).
- Produces: `CanvasRow.made_by?: MadeBy | null` (so `Canvas` has it); `StoredMap.made_by?: MadeBy | null`; the stub's `row()` copies it.

- [ ] **Step 1: Write the failing test**

In `src/pages/canvas/MapEditor.test.tsx`, change the fixtures import to `import { EMEA_PLAN, HUT_MAP, MAPS } from '../../features/canvas/testCanvasFixtures';`, add `import { BUILT_CANVAS_ID, MADE_BY_OPS } from '../../features/agents/testAgentsFixtures';`, and append inside `describe('MapEditor: load, header, plans, board, save (spec §2.2)', ...)`:

```tsx
  it('says an agent laid the map out, and who approved it (Agents delivery 3)', async () => {
    stubCanvases({ maps: [...MAPS, { ...HUT_MAP, id: BUILT_CANVAS_ID, name: 'Pizza Hut people', made_by: MADE_BY_OPS }] });
    renderCanvas(`/canvas/${BUILT_CANVAS_ID}`);
    expect(await screen.findByRole('textbox', { name: 'Map name' })).toHaveValue('Pizza Hut people');
    expect(document.querySelector('[data-part="made-by"]')).toHaveTextContent('Made by the Ops agent, approved by Alice');
  });

  it('says nothing of an agent on a map a person made', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await screen.findByRole('textbox', { name: 'Map name' });
    expect(document.querySelector('[data-part="made-by"]')).toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/pages/canvas/MapEditor.test.tsx --maxWorkers=2`
Expected: FAIL (the stub's row drops `made_by`, and the header has no line).

- [ ] **Step 3: Type it, copy it, show it**

In `src/features/canvas/canvasTypes.ts`, add `import type { MadeBy } from '../agents/agentTypes';` with the other imports, and add to `CanvasRow`, after `updated_by: PersonRef | null;`:

```ts
  /** The agent action that laid it out (Agents delivery 3); null or absent when a person did. */
  made_by?: MadeBy | null;
```

In `src/features/canvas/testCanvasFixtures.ts`, add `import type { MadeBy } from '../agents/agentTypes';` with the other imports, and add to `StoredMap`, after `updated_at: string;`:

```ts
  made_by?: MadeBy | null;
```

In `src/features/canvas/testCanvases.ts`, replace the `row` line with:

```ts
  const row = (m: StoredMap): CanvasRow => ({ id: m.id, name: m.name, record: m.record, people: m.nodes.length, updated_at: m.updated_at, updated_by: m.updated_by, made_by: m.made_by ?? null });
```

In `src/components/canvas/MapHeader.tsx`, add `import { MadeByLine } from '../agents/MadeByLine';` after the `Menu` import, and directly after the closing `</p>` of the record and "Edited by" line (inside `<div className="min-w-0 flex-1">`) add:

```tsx
        <MadeByLine madeBy={canvas.made_by} className="px-2" />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/canvas src/components/canvas src/features/canvas --maxWorkers=2`
Expected: PASS, the canvas house-rules suite included.

- [ ] **Step 5: Commit**

```bash
git add src/features/canvas/canvasTypes.ts src/features/canvas/testCanvasFixtures.ts src/features/canvas/testCanvases.ts src/components/canvas/MapHeader.tsx src/pages/canvas/MapEditor.test.tsx
git commit -m "feat(canvas): say when an agent laid out a map

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: A plan template says an agent wrote it

**Files:**
- Modify: `src/features/plans/planTypes.ts:38-54` (`PlanTemplate`)
- Modify: `src/pages/plans/TemplatesPage.tsx:1-15` (import), `:31-57` (the row)
- Modify: `src/pages/plans/TemplateEditor.tsx:1-21` (import), `:61-66` (the editor)
- Test: `src/pages/plans/Templates.test.tsx`

**Interfaces:**
- Consumes: Task 1's `MadeBy`, `MADE_BY_OPS`, `BUILT_TEMPLATE_ID`; Task 4's `MadeByLine`; `TEMPLATES`, `MINE_TEMPLATE` (`src/features/plans/testTemplates.ts`; the plans stub keeps templates by spreading, so `made_by` comes through).
- Produces: `PlanTemplate.made_by?: MadeBy | null`.

- [ ] **Step 1: Write the failing test**

In `src/pages/plans/Templates.test.tsx`, change the templates import to `import { BUILTINS, MINE_TEMPLATE, TEMPLATES } from '../../features/plans/testTemplates';`, add `import { BUILT_TEMPLATE_ID, MADE_BY_OPS } from '../../features/agents/testAgentsFixtures';` and `import type { PlanTemplate } from '../../features/plans/planTypes';`, and append inside `describe('templates (spec §2.4)', ...)`:

```tsx
  it('says an agent wrote a template, on its row and in its editor (Agents delivery 3)', async () => {
    const agentTemplate: PlanTemplate = {
      ...MINE_TEMPLATE,
      id: BUILT_TEMPLATE_ID,
      name: 'Save play for at-risk renewals',
      kind: 'save',
      sharing: 'workspace',
      made_by: MADE_BY_OPS,
    };
    stubPlans({ templates: [...TEMPLATES, agentTemplate] });
    renderPlans('/projects/templates');
    await waitFor(() => expect(within(section('Yours')).getAllByRole('listitem')).toHaveLength(2));
    const row = item('Save play for at-risk renewals');
    expect(row.querySelector('[data-part="made-by"]')).toHaveTextContent('Made by the Ops agent, approved by Alice');
    expect(item('Renewal prep').querySelector('[data-part="made-by"]')).toBeNull();
    await userEvent.click(within(row).getByRole('link', { name: 'Edit Save play for at-risk renewals' }));
    const modal = await screen.findByRole('dialog', { name: 'Edit Save play for at-risk renewals' });
    expect(modal.querySelector('[data-part="made-by"]')).toHaveTextContent('Made by the Ops agent, approved by Alice');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/pages/plans/Templates.test.tsx --maxWorkers=2`
Expected: FAIL (no `[data-part="made-by"]` on the row).

- [ ] **Step 3: Type it and show it twice**

In `src/features/plans/planTypes.ts`, add to `PlanTemplate`, after `updated_at: string;`:

```ts
  /** The agent action that wrote it (Agents delivery 3); null or absent when a person did. */
  made_by?: MadeBy | null;
```

and add `MadeBy` to its existing type import from `../agents/agentTypes` (it already imports `AgentKind` from there: make it `import type { AgentKind, MadeBy } from '../agents/agentTypes';`).

In `src/pages/plans/TemplatesPage.tsx`, add `import { MadeByLine } from '../../components/agents/MadeByLine';` before the `ConfirmDialog` import, and directly after the first row's closing `</div>` (the one holding the name button, the chip, the length and the Edit and Delete icons) add:

```tsx
      <MadeByLine madeBy={template.made_by} />
```

In `src/pages/plans/TemplateEditor.tsx`, add `import { MadeByLine } from '../../components/agents/MadeByLine';` before the `FILTER_SELECT` import, and inside the form body, directly after the `{errors.form ? (...) : null}` block, add:

```tsx
          {initial ? <MadeByLine madeBy={initial.made_by} /> : null}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/plans src/components/plans --maxWorkers=2`
Expected: PASS, the plans house-rules suite included.

- [ ] **Step 5: Commit**

```bash
git add src/features/plans/planTypes.ts src/pages/plans/TemplatesPage.tsx src/pages/plans/TemplateEditor.tsx src/pages/plans/Templates.test.tsx
git commit -m "feat(plans): say when an agent wrote a plan template

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Recommended holds an action with no record

**Files:**
- Modify: `src/features/work/workTypes.ts:183-197` (`RecommendationRow`)
- Modify: `src/components/work/RecommendationCard.tsx:46-62`, `:110-148`
- Modify: `src/components/work/AssignForm.tsx:5`, `:24-36`
- Modify: `src/features/work/testWork.ts:407-409` (assign guard)
- Modify: `src/features/work/testWorkFixtures.ts:125-139` (`recRow`), and new rows after `REC_AGENT_DRAFT`
- Test: `src/pages/work/Recommended.test.tsx`

**Interfaces:**
- Consumes: Task 1's `ACT_CANVAS_CREATE`, `ACT_SEGMENT_CREATE`.
- Produces:
  - `RecommendationRow.record: TaskParent | null`; `RecordedRecommendation = RecommendationRow & { record: TaskParent }` (exported from `workTypes.ts`).
  - `AssignForm`'s `rec` is a `RecordedRecommendation`.
  - `recRow` keeps an explicit `record: null`.
  - `REC_AGENT_CANVAS` (id 12, on Pizza Hut, `agent_action: ACT_CANVAS_CREATE`), `REC_AGENT_NO_RECORD` (id 13, `record: null`, `agent_action: ACT_SEGMENT_CREATE`).

- [ ] **Step 1: Write the failing tests**

In `src/pages/work/Recommended.test.tsx`, extend the agents fixtures import with `ACT_CANVAS_CREATE` and `ACT_SEGMENT_CREATE`, extend the work fixtures import with `REC_AGENT_CANVAS` and `REC_AGENT_NO_RECORD`, and append inside `describe('Recommended: agent actions (Agents delivery 1, Decisions 3 and 12)', ...)`:

```tsx
  it('shows a map proposal on its record with Apply and Reject (Agents delivery 3)', async () => {
    const agents = stubAgents({ actions: [ACT_CANVAS_CREATE] });
    const work = stubWork({ recommendations: [REC_AGENT_CANVAS], passThrough: agents.spy });
    agents.onSettle(() => work.recommendations.clear());
    renderWork('/work/recommended');
    const card = await screen.findByRole('article', { name: ACT_CANVAS_CREATE.title });
    expect(card.querySelector('[data-part="preview"]')).toHaveTextContent("Map a record's people: Pizza Hut people, 6 people");
    expect(within(card.querySelector('[data-part="meta"]') as HTMLElement).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(within(card).queryByRole('button', { name: 'Assign' })).toBeNull();
    await userEvent.click(within(card).getByRole('button', { name: 'Apply' }));
    expect(await screen.findByRole('status')).toHaveTextContent(`Applied: ${ACT_CANVAS_CREATE.title}.`);
  });

  it('renders an action with no record without crashing: no record link, no Assign (Decision 5)', async () => {
    const agents = stubAgents({ actions: [ACT_SEGMENT_CREATE] });
    stubWork({ recommendations: [REC_AGENT_NO_RECORD], passThrough: agents.spy });
    renderWork('/work/recommended');
    const card = await screen.findByRole('article', { name: ACT_SEGMENT_CREATE.title });
    const meta = card.querySelector('[data-part="meta"]') as HTMLElement;
    expect(within(meta).queryByRole('link')).toBeNull();
    expect(meta).toHaveTextContent(/^Ops agent/);
    expect(card.querySelector('[data-part="preview"]')).toHaveTextContent('Build a segment: Poor health renewals, 2 conditions, 12 organisations');
    expect(within(card).queryByRole('button', { name: 'Assign' })).toBeNull();
    expect(within(card).getByRole('button', { name: 'Apply' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/pages/work/Recommended.test.tsx --maxWorkers=2`
Expected: FAIL (`REC_AGENT_CANVAS` and `REC_AGENT_NO_RECORD` are not exported).

- [ ] **Step 3: Add the rows**

In `src/features/work/testWorkFixtures.ts`:
- extend its agents fixtures import with `ACT_CANVAS_CREATE` and `ACT_SEGMENT_CREATE`;
- in `recRow`, replace the `const record = over.record ?? PIZZA;` line and the `why` line with:

```ts
  // An explicit `record: null` stays null (an agent action with no record).
  const record = over.record === undefined ? PIZZA : over.record;
```

```ts
    why: { facts: [], evidence: record ? [{ label: record.name, link: record.kind === 'customer' ? `/organizations/${record.id}` : `/accounts/${record.id}` }] : [] },
```

- after `REC_AGENT_DRAFT`, add:

```ts
/** The CS agent's map of Pizza Hut's people, waiting on Ask (Agents delivery 3). */
export const REC_AGENT_CANVAS: RecommendationRow = recRow({
  id: 12,
  kind: 'agent_action',
  title: ACT_CANVAS_CREATE.title,
  why: { facts: [], evidence: [] },
  defaults: null,
  suggested_assignee: null,
  agent_action: ACT_CANVAS_CREATE,
});

/** An agent action with no record. The contract keeps these out of
 *  Recommended; the card must still not crash on one (Decision 5). */
export const REC_AGENT_NO_RECORD: RecommendationRow = recRow({
  id: 13,
  kind: 'agent_action',
  title: ACT_SEGMENT_CREATE.title,
  record: null,
  why: { facts: [], evidence: [] },
  defaults: null,
  suggested_assignee: null,
  agent_action: ACT_SEGMENT_CREATE,
});
```

- [ ] **Step 4: Make the record nullable and stop assuming it**

In `src/features/work/workTypes.ts`, in `RecommendationRow`, replace `record: TaskParent;` with:

```ts
  /** Null only for an agent action with no record (Agents delivery 3): the
   *  contract keeps those out of Recommended, but the card must hold one. */
  record: TaskParent | null;
```

and after the `RecommendationRow` interface add:

```ts
/** A recommendation on a record: what Assign needs to choose people. */
export type RecordedRecommendation = RecommendationRow & { record: TaskParent };
```

In `src/components/work/AssignForm.tsx`:
- line 5 becomes `import type { AssignAnswer, RecordedRecommendation } from '../../features/work/workTypes';`;
- in the props type, replace `rec: RecommendationRow;` with `rec: RecordedRecommendation;`.

In `src/components/work/RecommendationCard.tsx`, replace:

```tsx
  // The record is linked on the meta line; the backend lists it first among
  // the evidence too, so it is not repeated there.
  const recordLink = parentPath(rec.record);
  const evidence = rec.why.evidence.filter((item) => item.link !== recordLink);
```

with:

```tsx
  // The record is linked on the meta line; the backend lists it first among
  // the evidence too, so it is not repeated there. An agent action may have
  // no record (Decision 5): no link then, and nothing to assign.
  const recordLink = rec.record ? parentPath(rec.record) : null;
  const evidence = rec.why.evidence.filter((item) => item.link !== recordLink);
  const assignable = rec.defaults !== null && rec.record !== null;
```

replace the first two children of `<p data-part="meta" ...>` (the record `<Link>` and the `<Dot />` after it) with:

```tsx
          {rec.record && recordLink ? (
            <>
              <Link to={recordLink} className={META_LINK}>
                {rec.record.name}
              </Link>
              <Dot />
            </>
          ) : null}
```

replace `{rec.defaults ? (` that wraps the Assign `<button>` with `{assignable ? (`, and replace the Assign form block

```tsx
        {mode === 'assign' && rec.defaults ? (
          <div id={formId}>
            <AssignForm
              rec={rec}
```

with:

```tsx
        {mode === 'assign' && assignable && rec.record ? (
          <div id={formId}>
            <AssignForm
              rec={{ ...rec, record: rec.record }}
```

In `src/features/work/testWork.ts`, in `decide`, directly before `const person = assignees.find((option) => option.id === asked.assignee_id);` add:

```ts
    // Nothing to assign on a row with no record (Agents delivery 3).
    if (!row.record) return json(404, { detail: 'No such recommendation.' });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/pages/work src/components/work src/features/work --maxWorkers=2`
Expected: PASS, the work house-rules suite included.

- [ ] **Step 6: Commit**

```bash
git add src/features/work/workTypes.ts src/components/work/RecommendationCard.tsx src/components/work/AssignForm.tsx src/features/work/testWork.ts src/features/work/testWorkFixtures.ts src/pages/work/Recommended.test.tsx
git commit -m "fix(work): hold a recommendation with no record; show a map proposal

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Waiting shows a builder action at Company scope

**Files:**
- Modify: `src/features/brain/testWaitingFixtures.ts:21` (import), after `DRAFT_TICKET_ITEM` (new item)
- Test: `src/components/brain/WaitingRow.test.tsx`

**Interfaces:**
- Consumes: Task 1's `ACT_SEGMENT_CREATE`; `WaitingRow` (unchanged: it already renders `item.record` only when set, and the shared `AgentActionDecision`).
- Produces: `SEGMENT_CREATE_ITEM: AgentActionItem` (id 94, `record: null`, `waiting_on: null`, `can_decide: true`, `detail: {...ACT_SEGMENT_CREATE, session: null}`), not in any default desk.

- [ ] **Step 1: Write the failing tests**

In `src/components/brain/WaitingRow.test.tsx`, add `SEGMENT_CREATE_ITEM` to the `testWaitingFixtures` import, and append inside the same top-level `describe` as the delivery 2 test ("renders a plan start and a ticket draft …"):

```tsx
  it('renders a builder action at Company scope with no record, and applies it (Agents delivery 3)', async () => {
    stubAgents({ actions: [SEGMENT_CREATE_ITEM.detail] });
    const { row, meta, onGone } = renderRow(SEGMENT_CREATE_ITEM, 'company');
    expect(meta).toHaveTextContent('Ops agent · Build a segment');
    expect(row.querySelector('[data-part="preview"]')).toHaveTextContent('Build a segment: Poor health renewals, 2 conditions, 12 organisations');
    expect(within(row).queryAllByRole('link')).toHaveLength(0);
    await userEvent.click(within(row).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onGone).toHaveBeenCalledWith(SEGMENT_CREATE_ITEM, `Applied: ${SEGMENT_CREATE_ITEM.title}.`));
  });

  it('keeps a builder action on the row when an owner limit refuses it, in the server words', async () => {
    stubAgents({
      actions: [SEGMENT_CREATE_ITEM.detail],
      refuseNextDecision: { status: 409, body: { code: 'OWNER_LIMIT', detail: 'You already own 50 segments.' } },
    });
    const { row, onGone } = renderRow(SEGMENT_CREATE_ITEM, 'company');
    await userEvent.click(within(row).getByRole('button', { name: 'Apply' }));
    expect(await within(row).findByRole('alert')).toHaveTextContent(/^You already own 50 segments\.$/);
    expect(onGone).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/brain/WaitingRow.test.tsx --maxWorkers=2`
Expected: FAIL (`SEGMENT_CREATE_ITEM` is not exported).

- [ ] **Step 3: Add the item**

In `src/features/brain/testWaitingFixtures.ts`, add `ACT_SEGMENT_CREATE` to the `../agents/testAgentsFixtures` import, and after `DRAFT_TICKET_ITEM` add:

```ts
/** Agents delivery 3: the Ops agent's segment, at Company scope only,
 *  decided by view-all readers; workspace-level, so no record. */
export const SEGMENT_CREATE_ITEM: AgentActionItem = {
  kind: 'agent_action', id: 94, title: 'Build a segment of poor health renewals', since: '2026-10-04T09:00:00Z',
  waiting_on: null, can_decide: true, record: null, detail: { ...ACT_SEGMENT_CREATE, session: null },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/brain --maxWorkers=2`
Expected: PASS, the brain house-rules suite included.

- [ ] **Step 5: Commit**

```bash
git add src/features/brain/testWaitingFixtures.ts src/components/brain/WaitingRow.test.tsx
git commit -m "test(brain): a builder action waits at Company scope and is decided there

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: The Brain graph draws agent actions

**Files:**
- Modify: `src/features/graph/graphTypes.ts`
- Modify: `src/features/graph/filters.ts:9-14` (comment)
- Modify: `src/pages/brain/Graph.tsx:1-19` (imports), `:26-45` (columns, fill, names), `:72-147` (`Detail`), `:316-338` (nodes)
- Modify: `src/features/brain/testCustomersFixtures.ts:121-139` (`CARL_GRAPH`), new `SEGMENT_ACTION_NODE`
- Create: `src/features/graph/filters.test.ts`
- Test: `src/pages/brain/Graph.test.tsx`

**Interfaces:**
- Consumes: `AGENT_LABEL`, `KIND_LABEL` (`features/agents/agentsText.ts`); `ActionKind`, `AgentKind` types.
- Produces:
  - `NodeKind = 'owner' | 'customer' | 'product' | 'initiative' | 'agent_action'`; `AgentActionNode {kind: 'agent_action'; agent: AgentKind; action_kind: ActionKind; action_id: number}`; `ProposalNode` is gone.
  - `CARL_GRAPH`'s node `agent_action:5` (CS, `task.create`, `action_id: 5`, "Save play on Pizza Hut") with an `acts_on` edge to `customer:7`; `SEGMENT_ACTION_NODE` (`agent_action:94`, Ops, `segment.create`, no edge), not in any default graph.
  - In the page: an agent action's accessible name starts "agent action ", its detail shows Agent and Action, and "Open in Activity" links `/work/activity?action=<action_id>`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/graph/filters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SEGMENT_ACTION_NODE, TEAM_GRAPH } from '../brain/testCustomersFixtures';
import { applyFilters } from './filters';
import type { GraphPayload } from './graphTypes';

const GRAPH: GraphPayload = { ...TEAM_GRAPH, nodes: [...TEAM_GRAPH.nodes, SEGMENT_ACTION_NODE] };
const ids = (data: GraphPayload) => data.nodes.map((node) => node.id);

describe('applyFilters: agent actions (Agents delivery 3, Decision 6)', () => {
  it('draws every agent action while nothing filters', () => {
    expect(applyFilters(GRAPH, { onlyDownside: false, owner: null, product: null })).toBe(GRAPH);
  });

  it('keeps an action on a kept customer, and drops one with no record under a filter', () => {
    const kept = ids(applyFilters(GRAPH, { onlyDownside: true, owner: null, product: null }));
    expect(kept).toContain('agent_action:5');
    expect(kept).not.toContain(SEGMENT_ACTION_NODE.id);
  });

  it('drops an action whose customer the filter leaves out', () => {
    expect(ids(applyFilters(GRAPH, { onlyDownside: false, owner: 'owner:1', product: null }))).not.toContain('agent_action:5');
  });
});
```

In `src/pages/brain/Graph.test.tsx`:
- add `SEGMENT_ACTION_NODE` and `TEAM_GRAPH` to the `testCustomersFixtures` import;
- in the first test, replace `/^(owner|customer|product|initiative|proposal) /` with `/^(owner|customer|product|initiative|agent action) /`;
- replace the whole test `it('carries ?scope= from the Detail pane’s Open initiatives and Open Waiting on you links (parked #7)', ...)` with:

```tsx
  it('carries ?scope= from Open initiatives, and opens an agent action in Activity (Agents delivery 3)', async () => {
    stubBrain();
    renderBrain('/brain/graph?scope=team');
    await userEvent.click(await screen.findByRole('button', { name: /initiative Halve/ }));
    const detail = screen.getByRole('complementary', { name: /Details for Halve/ });
    expect(within(detail).getByRole('link', { name: /Open initiatives/ })).toHaveAttribute('href', '/brain/doing?section=initiatives&scope=team');
    await userEvent.click(within(detail).getByRole('button', { name: 'Close details' }));
    await userEvent.click(screen.getByRole('button', { name: 'agent action Save play on Pizza Hut' }));
    const action = screen.getByRole('complementary', { name: 'Details for Save play on Pizza Hut' });
    expect(within(action).getByText('agent action')).toBeInTheDocument();
    expect(within(action).getByText('CS agent')).toBeInTheDocument();
    expect(within(action).getByText('Create a task')).toBeInTheDocument();
    expect(within(action).getByText('Pizza Hut')).toBeInTheDocument();
    expect(within(action).getByRole('link', { name: /Open in Activity/ })).toHaveAttribute('href', '/work/activity?action=5');
  });

  it('sits a builder action in Decisions with no relation, and drops it under a filter (Decision 6)', async () => {
    const user = userEvent.setup();
    stubBrain({ graphs: { team: { ...TEAM_GRAPH, nodes: [...TEAM_GRAPH.nodes, SEGMENT_ACTION_NODE] } } });
    renderBrain('/brain/graph?scope=team');
    const node = await screen.findByRole('button', { name: 'agent action Build a segment of poor health renewals' });
    expect(screen.getByText(/9 nodes, 8 relations/)).toBeInTheDocument();
    await user.click(node);
    const detail = screen.getByRole('complementary', { name: 'Details for Build a segment of poor health renewals' });
    expect(within(detail).getByText('Ops agent')).toBeInTheDocument();
    expect(within(detail).getByText('Build a segment')).toBeInTheDocument();
    expect(within(detail).queryByText('Connected to')).toBeNull();
    await user.click(screen.getByLabelText('Only accounts carrying downside'));
    expect(screen.queryByRole('button', { name: /^agent action Build a segment/ })).toBeNull();
    expect(screen.getByText(/Showing 5 of 9 nodes/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/graph src/pages/brain/Graph.test.tsx --maxWorkers=2`
Expected: FAIL (`SEGMENT_ACTION_NODE` is not exported; no "agent action" node).

- [ ] **Step 3: Replace the node type**

Replace the whole of `src/features/graph/graphTypes.ts` with:

```ts
import type { CurrencyCode } from '../auth/authSlice';
import type { ActionKind, AgentKind } from '../agents/agentTypes';

// Mirrors /api/v1/brain/graph/?scope= (customers spec §3; Agents delivery 3
// contract "Brain graph"): real relations, the dashboards' own figures.

export type NodeKind = 'owner' | 'customer' | 'product' | 'initiative' | 'agent_action';

interface BaseNode {
  id: string;
  kind: NodeKind;
  label: string;
}
export interface CustomerNode extends BaseNode {
  kind: 'customer';
  arr: number;
  downside: number;
  risk: number;
  health_category: 'good' | 'average' | 'poor';
  health_score: number | null;
  days_to_renewal: number | null;
  open_tasks: number;
}
export interface GroupNode extends BaseNode {
  kind: 'product' | 'owner';
  customers: number;
  arr: number;
  downside: number;
}
export interface InitiativeNode extends BaseNode {
  kind: 'initiative';
  status: 'planned' | 'active';
  metric: string;
  metric_label: string;
  /** Minor #1: delivery 3 withholds this cut (`initiative_part`, `label_shown`). */
  member_label: string | null;
  target_value: number | null;
  target_by: string;
  owner: string | null;
}
/** A proposed agent action the reader may read, of any kind and agent (it
 *  replaces the old `proposal` node). `label` is the action's title. */
export interface AgentActionNode extends BaseNode {
  kind: 'agent_action';
  agent: AgentKind;
  action_kind: ActionKind;
  action_id: number;
}
export type GraphNode = CustomerNode | GroupNode | InitiativeNode | AgentActionNode;

export interface GraphEdge {
  from: string;
  to: string;
  kind: 'owns' | 'runs_on' | 'targets' | 'acts_on' | 'serves';
}

export interface GraphPayload {
  as_of: string;
  currency: CurrencyCode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** The scope's customers the reader can't open (Contract note 8). The only
   *  reader of this type is brain/graph/, which always sends it (minor #2). */
  hidden: number;
}
```

In `src/features/graph/filters.ts`, replace the comment above `applyFilters` with:

```ts
/**
 * Which nodes a filter keeps: the customers that match, everything they
 * connect to (their owner, their product, agent actions acting on them),
 * the initiatives targeting those owners or products, and anything serving
 * those initiatives. An agent action with no relation (a builder action)
 * shows only while nothing filters. Edges are drawn only between kept nodes.
 */
```

- [ ] **Step 4: Draw it**

In `src/pages/brain/Graph.tsx`:
- after the `fetchBrainGraph` import add `import { AGENT_LABEL, KIND_LABEL } from '../../features/agents/agentsText';`;
- in `COLUMNS`, replace `{ kind: ['initiative', 'proposal'], title: 'Decisions' },` with `{ kind: ['initiative', 'agent_action'], title: 'Decisions' },`;
- in `FILL`, replace `proposal: 'var(--color-ink-faint)',` with `agent_action: 'var(--color-ink-faint)',`;
- after the `FILL` constant, add:

```tsx
/** A node kind as words: its accessible name, its detail and its neighbours. */
const NODE_LABEL: Record<NodeKind, string> = {
  owner: 'owner',
  customer: 'customer',
  product: 'product',
  initiative: 'initiative',
  agent_action: 'agent action',
};
```

- in `Detail`, replace the line `: node.kind === 'proposal' ? { to: `/brain/waiting?scope=${scope}`, label: 'Open Waiting on you' }` with:

```tsx
    : node.kind === 'agent_action' ? { to: `/work/activity?action=${node.action_id}`, label: 'Open in Activity' }
```

- in `Detail`, replace `<div className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">{node.kind}</div>` with:

```tsx
          <div className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">{NODE_LABEL[node.kind]}</div>
```

- in `Detail`, replace the whole `{node.kind === 'proposal' && ( ... )}` block with:

```tsx
        {node.kind === 'agent_action' && (
          <>
            <dt className="text-ink-faint">Agent</dt><dd className="text-ink">{AGENT_LABEL[node.agent]}</dd>
            <dt className="text-ink-faint">Action</dt><dd className="text-ink">{KIND_LABEL[node.action_kind]}</dd>
          </>
        )}
```

- in `Detail`'s "Connected to" list, replace `<span className="text-ink-faint">{n.kind} · </span>{n.label}` with `<span className="text-ink-faint">{NODE_LABEL[n.kind]} · </span>{n.label}`;
- in the node `<g>`, replace `aria-label={`${node.kind} ${node.label}`}` with `aria-label={`${NODE_LABEL[node.kind]} ${node.label}`}`.

- [ ] **Step 5: Move the fixtures off `proposal`**

In `src/features/brain/testCustomersFixtures.ts`:
- in `CARL_GRAPH.nodes`, replace the `proposal:5` node with:

```ts
    { id: 'agent_action:5', kind: 'agent_action', label: 'Save play on Pizza Hut', agent: 'cs', action_kind: 'task.create', action_id: 5 },
```

- in `CARL_GRAPH.edges`, replace `{ from: 'proposal:5', to: 'customer:7', kind: 'acts_on' },` with `{ from: 'agent_action:5', to: 'customer:7', kind: 'acts_on' },`;
- after `EMPTY_GRAPH`, add:

```ts
/** Agents delivery 3: a builder action, workspace-level, so no relation.
 *  Not in any default graph, so their counts stay. */
export const SEGMENT_ACTION_NODE: GraphNode = {
  id: 'agent_action:94', kind: 'agent_action', label: 'Build a segment of poor health renewals', agent: 'ops', action_kind: 'segment.create', action_id: 94,
};
```

- change its graph type import to `import type { GraphNode, GraphPayload } from '../graph/graphTypes';`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/features/graph src/pages/brain src/features/brain src/e2e/brain.test.tsx --maxWorkers=2`
Expected: PASS (the first graph test still counts 8 nodes and 8 relations; "Showing 5 of 8 nodes" still holds: the CS action acts on a kept customer).

- [ ] **Step 7: Check that no `proposal` node survives**

Run: `grep -rn "'proposal'\|proposal_kind\|ProposalNode" src/features/graph src/pages/brain/Graph.tsx src/features/brain/testCustomersFixtures.ts || true`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/features/graph/graphTypes.ts src/features/graph/filters.ts src/features/graph/filters.test.ts src/pages/brain/Graph.tsx src/pages/brain/Graph.test.tsx src/features/brain/testCustomersFixtures.ts
git commit -m "feat(brain): draw agent actions on the graph in place of proposals

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: House rules cover the made-by line and the pages that use it

**Files:**
- Modify: `src/components/agents/houseRules.test.ts`

**Interfaces:**
- Consumes: Task 4's `MadeByLine.tsx`; Tasks 5 to 9's mounts.
- Produces: the agents suite lists `./MadeByLine.tsx` among the files it must cover, and fails if any of the six made-by surfaces stops using the shared line.

- [ ] **Step 1: Write the failing test**

In `src/components/agents/houseRules.test.ts`:
- in the coverage test's `expect.arrayContaining([...])`, after `'./AgentDraftsList.tsx',` add `'./MadeByLine.tsx',`;
- after the `copy` constant, add:

```ts
// Agents delivery 3: the surfaces that say an agent made an object, each
// through the one shared line so its words and tokens stay in one place.
const madeBySurfaces = raw(
  import.meta.glob(
    [
      '../segments/SegmentHeader.tsx',
      '../rules/RuleHeader.tsx',
      '../campaigns/CampaignHeader.tsx',
      '../canvas/MapHeader.tsx',
      '../../pages/plans/TemplatesPage.tsx',
      '../../pages/plans/TemplateEditor.tsx',
    ],
    { query: '?raw', eager: true, import: 'default' },
  ),
);
```

- inside `describe('agents: coverage, primaries, copy', ...)`, add:

```ts
  it('says "made by" only through the shared line, on every object an agent can make', () => {
    expect(Object.keys(madeBySurfaces)).toHaveLength(6);
    for (const [file, source] of Object.entries(madeBySurfaces)) {
      expect(source, file).toContain('<MadeByLine');
      expect(source, file).not.toMatch(/Made by the/);
    }
  });

  it('keeps the made-by line a plain line: no live region, no primary', () => {
    expect(files['./MadeByLine.tsx']).not.toMatch(/role="status"|\bPRIMARY\b/);
  });
```

- [ ] **Step 2: Run it to verify it passes, then prove it can fail**

Run: `npx vitest run src/components/agents/houseRules.test.ts --maxWorkers=2`
Expected: PASS (Tasks 4 to 9 are in). Then, to see the guard bite, temporarily delete the `<MadeByLine madeBy={rule.made_by} />` line from `src/components/rules/RuleHeader.tsx`, run the same command and expect FAIL naming `../rules/RuleHeader.tsx`; restore the line with `git checkout -- src/components/rules/RuleHeader.tsx` and run again: PASS.

- [ ] **Step 3: Run every touched house-rules suite**

Run: `npx vitest run src/components/agents/houseRules.test.ts src/components/work/houseRules.test.ts src/components/brain/houseRules.test.ts src/components/segments/houseRules.test.ts src/components/rules/houseRules.test.ts src/components/campaigns/houseRules.test.ts src/components/canvas/houseRules.test.ts src/components/plans/houseRules.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/agents/houseRules.test.ts
git commit -m "test(agents): house rules cover the made-by line and its six surfaces

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: The journey: a segment approved in Waiting, opened from Activity, then undone

**Files:**
- Modify: `src/pages/work/testPages.tsx:1-16` (imports), `:62-124` (`renderWork`)
- Modify: `src/e2e/agents.test.tsx`

**Interfaces:**
- Consumes: `SEGMENT_CREATE_ITEM`, `deskOf` (Task 11); `ACT_SEGMENT_CREATE`, `BUILT_SEGMENT_ID` (Task 1); the stub's `segment_id` (Task 2); `builtLinks` in Activity (Task 3); `AGENT_SEGMENT` and the segment's made-by line (Task 5); `stubBrain` (`passThrough`, `waiting`), `stubSegments` (returns its spy), `stubWork` (returns `{ spy }`).
- Produces: `renderWork(url, { brain, segments })`: `brain` adds `/brain/*` (`BrainRoutes`); `segments` adds `/segments/:id` (`SegmentPage`, with the Test back button).

- [ ] **Step 1: Teach `renderWork` the two routes**

In `src/pages/work/testPages.tsx`:
- after the `DraftRoute` import add:

```tsx
import { BrainRoutes } from '../brain/BrainRoutes';
import { SegmentPage } from '../segments/SegmentPage';
```

- replace the comment above `export function renderWork` with:

```tsx
/** The Work routes as App.tsx routes them, with the task panel host; the
 *  real Navbar with `nav`, the sidebar's Work item with `sidebarItem`, its
 *  Brain item (the waiting count's badge) with `brainItem`, Communications'
 *  draft (`DraftRoute`) with `drafts`, the Brain pages with `brain`, and a
 *  segment's page with `segments` (Agents delivery 3's journey). */
```

- in the options, add `brain = false,` and `segments = false,` after `drafts = false,`, and `brain?: boolean;` and `segments?: boolean;` after `drafts?: boolean;` in its type;
- after the `{drafts ? ( ... ) : null}` route block add:

```tsx
            {brain ? (
              <Route
                path="/brain/*"
                element={
                  <>
                    <BrainRoutes />
                    <Where />
                  </>
                }
              />
            ) : null}
            {segments ? (
              <Route
                path="/segments/:id"
                element={
                  <>
                    <TestBack />
                    <SegmentPage />
                    <Where />
                  </>
                }
              />
            ) : null}
```

- [ ] **Step 2: Write the journey**

In `src/e2e/agents.test.tsx`:
- extend the fixtures import with `ACT_SEGMENT_CREATE` and `BUILT_SEGMENT_ID`;
- add these imports after the `stubDrafts` import:

```tsx
import { deskOf, SEGMENT_CREATE_ITEM } from '../features/brain/testWaitingFixtures';
import { stubBrain } from '../features/brain/testBrain';
import { AGENT_SEGMENT, SEGMENTS, stubSegments } from '../features/segments/testSegments';
```

- append:

```tsx
// Agents delivery 3: the Ops agent's segment is approved in Brain › Waiting
// at Company scope, opened from Activity (it says who made it), then undone,
// and Activity stops linking it. Stubs: brain in front of agents in front of
// work in front of segments. The segments stub holds the built segment from
// the start (Decision 7).

describe('Agents: the builder', () => {
  it('approves an Ops segment in Waiting, opens it from Activity, then undoes it', { timeout: 30000 }, async () => {
    const segments = stubSegments({ segments: [...SEGMENTS, AGENT_SEGMENT] });
    const work = stubWork({ passThrough: segments });
    const agents = stubAgents({ actions: [ACT_SEGMENT_CREATE], passThrough: work.spy });
    stubBrain({ waiting: { company: deskOf('company', [SEGMENT_CREATE_ITEM]) }, passThrough: agents.spy });
    renderWork('/brain/waiting?scope=company', { nav: true, sidebarItem: true, brain: true, segments: true });

    // 1. Waiting, Company scope: the proposal in words, with no record.
    const title = await screen.findByRole('heading', { name: ACT_SEGMENT_CREATE.title });
    const waitingRow = title.closest('li') as HTMLElement;
    const item = within(waitingRow);
    // The preview's figures sit in their own DM Mono spans, so read the whole line.
    expect(waitingRow.querySelector('[data-part="preview"]')).toHaveTextContent('Build a segment: Poor health renewals, 2 conditions, 12 organisations');
    expect(item.queryByRole('link')).toBeNull();
    await userEvent.click(item.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText(`Applied: ${ACT_SEGMENT_CREATE.title}.`)).toBeInTheDocument();

    // 2. Activity: applied by me, with Open segment.
    await userEvent.click(screen.getByRole('link', { name: /^Work/ }));
    await waitFor(() => expect(where()).toBe('/work/today'));
    await userEvent.click(screen.getByRole('link', { name: 'Activity' }));
    const list = await screen.findByRole('list', { name: 'Agent actions' });
    const row = within(list.querySelector(`[data-action="${ACT_SEGMENT_CREATE.id}"]`) as HTMLElement);
    expect(row.getByText('Applied by you')).toBeInTheDocument();
    await userEvent.click(row.getByRole('link', { name: 'Open segment' }));
    await waitFor(() => expect(where()).toBe(`/segments/${BUILT_SEGMENT_ID}`));

    // 3. The segment says who made it.
    expect(await screen.findByRole('heading', { level: 1, name: AGENT_SEGMENT.name })).toBeInTheDocument();
    expect(document.querySelector('[data-part="made-by"]')).toHaveTextContent('Made by the Ops agent, approved by Alice');

    // 4. Back in Activity, Undo; the row stops linking the segment.
    await userEvent.click(screen.getByRole('button', { name: 'Test back' }));
    await waitFor(() => expect(where()).toBe('/work/activity'));
    const again = await screen.findByRole('list', { name: 'Agent actions' });
    const undoRow = within(again.querySelector(`[data-action="${ACT_SEGMENT_CREATE.id}"]`) as HTMLElement);
    await userEvent.click(undoRow.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(undoRow.getByText('Undone by you')).toBeInTheDocument());
    expect(undoRow.queryByRole('link', { name: 'Open segment' })).toBeNull();
    expect(screen.getByText(`Undone: ${ACT_SEGMENT_CREATE.title}.`)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it**

Run: `npx vitest run src/e2e/agents.test.tsx --maxWorkers=2`
Expected: PASS, with the earlier journeys in the file still green. Every step it depends on landed in Tasks 1 to 11, so this is a check of the joined-up path, not a red step. If a read that the Brain or Navbar makes outside `/brain/` reaches the end of the chain and breaks the page, answer it in the stub where it falls through (the work stub already answers members and counts); never loosen an assertion. If `screen.getByRole('link', { name: /^Work/ })` finds more than one link, scope it with `within` to the element that holds `WorkNavItem`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/work/testPages.tsx src/e2e/agents.test.tsx
git commit -m "test(agents): journey: a segment approved in Waiting, opened from Activity, then undone

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: The UI/UX reference

**Files:**
- Modify: `docs/03-ui-ux-design.md` (Brain: the frame; Brain: Waiting on you; Work: Recommended; Work: Activity; Settings: Agents, and Actions & approvals)

**Interfaces:**
- Consumes: Decisions 1 to 7.
- Produces: documentation only.

- [ ] **Step 1: Work: Activity**

In `### Work: Activity`:
- in **A row**, replace "Open plan (`/projects/<id>`) whenever a `plan.start` made one)" with "Open plan (`/projects/<id>`) whenever a `plan.start` made one, and, while a builder action is applied, Open scenario, Open campaign, Open segment, Open map and Open template, in that order)";
- after the **Delivery 2 kinds** bullet, add:

```markdown
- **Delivery 3 kinds (the builder).** "Build a segment: Poor health
  renewals, 2 conditions, 12 organisations" (the count is what the reader
  may open); "Build a scenario: Health watch, on Poor health renewals" with
  the server's trigger and steps below it ("Entered the segment · Task the
  owner · Notify me"); "Draft a campaign: Champion check-in (At-risk
  organisations, Champion): Checking in, {first_name}" with its opening
  lines in the same quiet `blockquote` a reply draft uses; "Map a record's
  people: Pizza Hut people, 6 people"; "Write a plan template: Save play
  for at-risk renewals (Save), 3 milestones, 9 tasks". Four are
  workspace-level, so their rows name no record. The links go to
  `/scenarios/rules/<id>`, `/campaigns/<id>`, `/segments/<id>`,
  `/canvas/<id>` and `/projects/templates/<id>/edit`, and leave once the
  action is undone. An undo refusal is the server's sentence ("A scenario,
  campaign or survey uses this segment now.").
- **Made by an agent.** A segment, a scenario (rule), a campaign, a map and
  a plan template an agent action made show "Made by the Ops agent,
  approved by Alice" (11px, `text-ink-muted`, Lucide `Bot`) under their
  owner or record line, from the server's `made_by`; a template shows it on
  its row in Templates and at the top of its editor. One shared component,
  `components/agents/MadeByLine.tsx`; nothing shows when a person made it.
```

- [ ] **Step 2: Recommended, Waiting and the grid**

In `### Work: Recommended, and Settings › Work › Recommendations`, at the end of the **Agent actions in Recommended** bullet (after "The priority in the meta line shows only when `defaults` is not null."), add: "A map proposal (`canvas.create`) reaches the record owner here like any record action. A row with no record (never sent today: workspace-level kinds stay out of Recommended) starts its meta line at the kind and offers no Assign."

In `### Brain: Waiting on you`, at the end of **The list** bullet (after "…the same `AgentActionDecision` as Recommended and Activity)."), add: "Builder actions wait at Company scope for view-all readers, with no record line; an approval past an owner limit stays on the row with the server's sentence (\"You already own 50 segments.\")."

In `### Settings: Agents, and Actions & approvals`, after "Delivery 2 adds Draft a reply (up to Auto) and Start a plan (capped at Ask), for the CS and Sales agents only.", add: "Delivery 3 adds Build a segment, Build a scenario, Draft a campaign and Write a plan template (the Ops agent only) and Map a record's people (every agent), all capped at Ask."

- [ ] **Step 3: The graph**

In `### Brain: the frame`, after the sentence ending "above a 15px semibold title.", add: "The Knowledge graph's Decisions column holds initiatives and every waiting agent action the reader may read (named \"agent action\", an `ink-faint` dot); a builder action has no relation and shows only while no filter is set. Its detail names the agent and the action, and Open in Activity goes to `/work/activity?action=<id>`."

- [ ] **Step 4: Check the copy rule and commit**

Run: `git diff --unified=0 -- docs/03-ui-ux-design.md | grep "^+" | grep "—" || true`
Expected: no output.

```bash
git add docs/03-ui-ux-design.md
git commit -m "docs: Agents delivery 3 in the UI/UX reference (builder kinds, made-by line, graph)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: The app-flow reference

**Files:**
- Modify: `docs/04-app-flow.md` (4.11 Brain's graph paragraph; 4.11c Agents)

**Interfaces:**
- Consumes: the contract and Decisions 1 to 7.
- Produces: documentation only.

- [ ] **Step 1: Agents**

In `### 4.11c Agents (Settings › Agents, Actions & approvals, Work › Activity)`:
- under the delivery 2 contract line, add: "Delivery 3: `revenact-backend docs/superpowers/plans/2026-10-08-agents-builder-api.md`.";
- in step 2, append: " The five builder kinds are capped at Ask: `segment.create`, `scenario.create`, `campaign.create` and `plan.template` for the Ops agent, `canvas.create` for every agent.";
- in step 3, append: " A builder action proposes a whole object: a segment, a scenario (a rule, switched off, with its own segment), a campaign draft (with its own segment), a map of one record's people with no links, or a workspace-shared plan template. The four workspace-level kinds have no record: only view-all readers see them (Activity, and Brain › Waiting at Company scope), decide them and never count them in `hidden`; they never reach Recommended. `canvas.create` behaves like any record action.";
- in step 4, append: " Applying a builder action makes the object owned by the approver; past an owner's limit of 50 the approval answers 409 `OWNER_LIMIT` (\"You already own 50 segments.\"), shown on the row, and the action stays proposed.";
- in step 5, append: " While a builder action is applied its row links what it made: Open scenario (`/scenarios/rules/<id>`), Open campaign (`/campaigns/<id>`), Open segment (`/segments/<id>`), Open map (`/canvas/<id>`) and Open template (`/projects/templates/<id>/edit`). Each made object's page reads its `made_by` and says \"Made by the Ops agent, approved by Alice\".";
- in step 6, append: " Undoing a builder action deletes what it made while it is untouched; otherwise `CHANGED_SINCE` carries the server's sentence (for example \"This scenario has been switched on.\" or \"Plans have been started from this template.\"), shown as it comes.";
- in step 7, append: " The undo notice names a segment, scenario, campaign, map or plan template; an apply tells no one, since the approver owns the result."

- [ ] **Step 2: The graph**

In `### 4.11 Brain`, in the paragraph that starts "A quiet \"Knowledge graph\" link", after "and counts the scope's customers the reader can't open.", add: " Its `agent_action` nodes (which replace the old proposals) are the scope's waiting agent actions the reader may read, of every kind and agent; a record action acts on its organisation, a builder action has no relation, and a node opens `/work/activity?action=<id>`."

- [ ] **Step 3: Check the copy rule and commit**

Run: `git diff --unified=0 -- docs/04-app-flow.md | grep "^+" | grep "—" || true`
Expected: no output.

```bash
git add docs/04-app-flow.md
git commit -m "docs: Agents delivery 3 in the app-flow reference (builder kinds, undo, graph)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: The full check

**Files:**
- None new. Fix in place whatever the checks name.

**Interfaces:**
- Consumes: the whole branch.
- Produces: a green suite, lint and build.

- [ ] **Step 1: The whole suite**

Run: `npx vitest run --maxWorkers=4`
Expected: every file passes. A failure outside the files this plan touched points at a fixture shape (`AgentAction.result` now has ten keys; `RecommendationRow.record` is nullable; a graph node of kind `proposal`): give the literal the missing keys or the new node shape; never loosen a type to make it pass.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `tsc -b` and `vite build` finish with no errors. A `rec.record` "possibly null" error outside the files above means another reader of `RecommendationRow.record`: guard it as `RecommendationCard` does.

- [ ] **Step 4: The copy rule, one last time**

Run: `git diff main --unified=0 -- src | grep "^+" | grep "—" || true`
Expected: no output (no added line carries an em dash).

- [ ] **Step 5: Commit any fixes**

If Steps 1 to 4 needed changes:

```bash
git add <each file you changed, by path>
git commit -m "fix(agents): delivery 3 full-check fixes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec and contract coverage:**
- Five kinds, contract order, labels, Ask cap, agents → Task 1 (the grid test pins Ask for every builder kind and Not used for CS and Sales on the four Ops kinds).
- The five preview shapes and the ten result keys → Task 1; the stub's ids → Task 2; their rendering → Tasks 3, 10 and 11.
- "Open segment / scenario / campaign / map / template" while applied → Task 3 (unit and Activity), Task 14 (journey: the link leaves after Undo).
- `made_by` on segments, rules, campaigns, canvases and templates, one shared component under the agents suite → Tasks 4 to 9, guarded by Task 13.
- Recommended with a record-less action → Task 10; `canvas.create` in Recommended for the record owner → Task 10.
- Workspace kinds in Waiting at Company scope, `OWNER_LIMIT` kept on the row → Task 11.
- Undo refusals shown verbatim → Task 2 (`UndoAction`).
- Brain graph `agent_action` node: types, column, `FILL` token, link, detail, filters; `proposal` branches gone → Task 12 (Step 7 greps for leftovers).
- House rules → Task 13 (plus each object task runs its own folder's suite). E2E → Task 14. Docs → Tasks 15 and 16. Full check → Task 17.
- Live regions: no `role="status"` is added; Task 13 asserts `MadeByLine` holds none.
- Out of scope, as the contract says: Auto for builder kinds, CS or Sales builder kinds, links on agent maps, the server-only Send claim.

**Placeholder scan:** every code step carries its code; the only conditional instructions are the journey's fall-through note (Task 14 Step 3) and the full check's fix guidance, both naming exactly what to change.

**Type consistency:** `ActionResult` (Task 1) is what `builtLinks` reads (Task 3) and what the stub writes (Task 2). `MadeBy` (Task 1) is what `madeByText`, `MadeByLine` (Task 4) and the five object types (Tasks 5 to 9) use. `ScenarioPreview` (Task 1) is `scenarioStepsText`'s parameter (Tasks 1 and 3). `RecordedRecommendation` (Task 10) is `AssignForm`'s `rec`. `AgentActionNode` (Task 12) carries `agent`, `action_kind` and `action_id`, as the contract's node does. `SEGMENT_CREATE_ITEM` (Task 11), `AGENT_SEGMENT` (Task 5) and `BUILT_SEGMENT_ID` (Task 1) are what the journey (Task 14) uses.
