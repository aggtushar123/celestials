# Agents, delivery 1 ("the action layer"): frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People see, decide, audit and undo what Revenact's three function agents (CS, Sales, Ops) do. This covers:
- agent actions in Work › Recommended and Brain › Waiting on you, with Apply and Reject;
- a new Work › Activity tab with 7-day Undo;
- Settings › Agents: the AI switch and tone moved there, plus per-agent cards with a budget, last run and Run now;
- Settings › Actions & approvals: an Auto, Ask or Never grid;
- the bell's `agent_action_undone`.

**Architecture:**
- **`features/agents`** gains:
  - the delivery 1 contract's types and API (`agentTypes.ts`, `agentsApi.ts`);
  - one pure module, `agentsText.ts`, holding the words, previews, statuses, undo reasons, the settings drafts and their checks, and the Activity filters;
  - a stateful fetch stub with fixtures (`testAgents.ts`, `testAgentsFixtures.ts`).
- **`components/agents`** gains:
  - `AgentActionBody`: the preview, rationale and evidence, shared by Recommended, Waiting and Activity;
  - `AgentActionDecision`: Apply and Reject, sent once, with every refusal shown;
  - `UndoAction`;
  - the Activity row;
  - the two settings forms and their summaries.
- **Work:** `RecommendationCard` branches on `agent_action` items whose kind is not `task.create`. A new `pages/work/Activity.tsx` adds the Activity tab.
- **Brain:** Waiting swaps its `proposal` kind for `agent_action`, and Ask the agent posts to `/agents/ops/run/`.
- **Settings:** a new Agents group holds two pages on a shared `AgentSettingsFrame`. `/settings/ai-agent` redirects to `/settings/agents`, and `AIAgentPage` is deleted.
- No Redux slice: every read goes through a hook or a page's own effect, as Work does.

**Tech Stack:**
- React 19, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`);
- react-router 7 and Tailwind v4 tokens;
- Vitest and Testing Library (jsdom);
- lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-08-agents-round-design.md` §1.8, plus §1.3 to §1.7 for behaviour and §4 to §6 as they apply to delivery 1.

**API contract (binding):** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/agents-be/docs/superpowers/plans/2026-10-08-agents-actions-api.md`. It wins on shapes, messages and codes.

**House style and the code this plan extends:**
- `docs/superpowers/plans/2026-10-08-work-tracking-frontend.md` (Work delivery 3);
- `docs/superpowers/plans/2026-10-07-work-recommended-frontend.md` (Work delivery 2).

Read the spec section, the contract and this plan before starting.

## Global Constraints

- **Worktree and branch.**
  - Work in `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/agents-fe`, branch `feat/agents-actions`, based on `main` at `86d38fe`. The spec commit is `850f2e9`.
  - `node_modules` is a symlink: never commit it.
  - Always `git add <explicit paths>`, never `git add -A` or `git add .`.
- **Never run prettier. Never use `git stash`.** The stash stack is shared across worktrees; use a WIP commit if you must set work aside.
- **Commands:** `npx vitest run <path> --maxWorkers=2`, `npx vitest run --maxWorkers=2`, `npm run lint`, `npm run build`. Run them in the foreground.
- **Every commit message** is a conventional commit and ends with exactly this line: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Tokens only** (`src/test/houseRules.ts` `RAW`): no hex, no `rgb()`, and no named Tailwind palette colours in any `.tsx`.
- **Type sizes:** only 11, 13 and 15 on every Work, Agents and Brain component (`text-[11px]`, `text-[13px]`, `text-[15px]`), with at most four sizes per surface and no named sizes.
  - The settings pages keep the settings frame's own `text-[20px] font-bold` h1, which is why the h1 lives in `pages/settings/AgentSettingsFrame.tsx` and never in `components/agents`.
  - Brain's Waiting row keeps its existing `text-[15px]` title.
- **Figures in DM Mono:** every count, credit figure and date a row or card shows uses `MONO` (`font-mono-brand tabular-nums`). A server sentence with figures in it goes through `Figured` (`src/components/brain/Figured.tsx`).
- **44px targets:** every `<button>`, `<Link>`, `<select>`, `<input>` and `<textarea>` reaches `min-h-11` on phones.
  - This can come directly, or through a compliant constant: `BUTTON`, `PRIMARY`, `QUIET`, `INPUT`, `FILTER_SELECT`, `LINK`, or a local `const` holding `min-h-11` or one of those.
  - `className={CONTROL}` alone does not count to the checker. This plan uses `const INPUT = \`${CONTROL} sm:w-28\`` and `const SELECT = \`min-h-11 ${CONTROL}\``.
  - A checkbox's target is its wrapping label (`CHOICE`, `min-h-11`).
- **Icons:** Lucide only, each with `aria-hidden="true"`. No emoji.
- **No em dash (`—`)** anywhere in a file under these paths, comments and tests included:
  - `src/components/work/`, `src/pages/work/` and `src/features/work/`;
  - `src/components/agents/` and `src/features/agents/` (only the new files: `agentTypes.ts`, `agentsApi.ts`, `agentsText.ts`, `testAgents.ts`, `testAgentsFixtures.ts` and their tests; the existing `agentAccessApi.ts` and `agentsSlice.ts` are left alone);
  - `src/pages/settings/Agent*.tsx`.
- **Surfaces:**
  - No glass, and no card inside a card.
  - **One primary per settings page** (Save changes).
  - Today's New task stays the only `PRIMARY` in the Work section; Apply, Reject and Undo are `BUTTON` and `QUIET`.
  - Brain's Ask the agent keeps its `PRIMARY`.
- **Every page and list has loading (a skeleton, not a spinner), empty and error (Try again) states.**
- **The UI never guesses rights:**
  - `can_edit` decides whether the settings pages show a form or text, and `can_run` (from `GET /agents/settings/`) decides Run now;
  - `can_decide` (Waiting) or the item being in Recommended decides who sees Apply;
  - `undo.allowed` and `undo.reason` decide Undo;
- **Privacy:** anything the reader cannot open is counted, never named (`hidden`). Evidence shows only when the server sends it.
- **Copy:**
  - Sentence case.
  - The server's refusals are shown verbatim.
  - The contract's sentences are used word for word where it gives them.
  - Warning sentences are `text-ink` with a Lucide `TriangleAlert` in `text-warning` (amber text fails contrast; Work delivery 3's fix).
- **Out of scope:**
  - delivery 2 kinds (drafts, `plan.start`) and delivery 3 builder kinds;
  - Brain's graph `proposal` nodes and Settings › AI usage;
  - `features/proposals/proposalsSlice` types (still read by the graph);
  - the backend.

## Decisions (where the spec or the contract leaves a choice)

1. **The Activity tab** sits in the Work bar after Recommended and before Team: Today, Recommended, Activity, Team.
   - It is shown to every member, because the route is open to all and lists only what the reader may open.
   - `/work/activity` is a new route in `WorkRoutes`.
2. **The Activity filters** are three selects in the toolbar, `FILTER_SELECT`, each with an "All …" first option:
   - Agent: All agents, CS agent, Sales agent, Ops agent;
   - Action: All actions, then the round-1 kinds' labels in the contract's order;
   - Status: All statuses, Waiting for a decision, Applied, Rejected, Expired, Undone.

   Each choice writes `?agent=`, `?kind=`, `?status=` (with `replace`) and drops `page` and `action`. Pagination is Previous and Next (`BUTTON`), shown only when the answer has `previous` or `next`, and it writes `?page=`.

   A `?action=<id>` link (the bell's) fetches that one action with `GET /agents/actions/<id>/`, whatever page it is on. It shows at the top, in its own section "Linked action", and takes focus; the same action is left out of the list below. On a 404 the page status line says "That action isn't there any more, or it's on a record you can't open." and the list shows as usual.
3. **Recommended keeps the server's order** (newest first) for mixed kinds. An `agent_action` item whose action is `task.create` keeps Assign and Dismiss with today's forms. Any other kind shows the agent action's body, then Apply and Reject.
4. **Empty states:**
   - Activity: "No agent actions yet", detail "What the CS, Sales and Ops agents propose or apply shows here, with Undo for 7 days."
   - Activity with any filter set: "Nothing matches these filters", with a "Clear filters" link to `/work/activity`.
5. **Task kinds in Activity link their task.** For `task.*` kinds, the task title in the preview is a link (`useTaskLink`) to `?task=<id>`, which opens the existing task panel over Activity. It uses `preview.task.id`, or `result.task_id` for `task.create`. No new panel.
6. **Actions & approvals is a real `<table>`** with kinds as rows and agents as columns, inside an `overflow-x-auto` wrapper.
   - Below `sm` the table scrolls sideways, and its first column (the kind label) is `sticky left-0 bg-surface`.
   - Each select is labelled "<kind label> for <agent label>" (`aria-label`).
   - A cell the agent cannot use shows "Not used" (`text-ink-muted`, not a control).
   - A member sees the same table with the level words in place of selects.
7. **Settings › Agents has one form** (one Save changes): the AI switch, the tone, and each agent's switch and monthly credits.
   - Run now is a `BUTTON` on each agent card, outside the form, and sends at once.
   - After a save that changes `ai_enabled` or `tone`, the page dispatches `fetchMe()` so `user.organisation` (read by Copilot) catches up.
   - Members get the cards as text, plus "Only admins can change these.", and Run now when `can_run` is true.
8. **The spend bar** is a `div` track (`bg-subtle`) with a fill (`bg-accent`, or `bg-danger` at or above budget).
   - The track has `role="progressbar"`, `aria-valuemin=0`, `aria-valuemax={monthly_credits}`, `aria-valuenow={min(spent, monthly_credits)}` and `aria-label="<agent label> credits this month"`.
   - The words beside it read "12 of 133 credits this month · resets on 1 Nov 2026".
9. **Waiting's chip** for `agent_action` reads "Agent actions". Its kind label reads "<agent label> · <kind label>", for example "CS agent · Change lifecycle stage".
   - Every `agent_action` item in Waiting is decided with Apply or Reject (no overrides), whatever its kind. This is the same as today's proposals, which Waiting approved as written.
   - `detail.session` keeps today's "Decided in session" line.
10. **Ask the agent** (Brain › Waiting, Company scope, view-all) posts `/agents/ops/run/`.
    - On success it re-reads the desk and shows "The Ops agent ran: 3 proposed, 1 applied." in the status line.
    - A 409 shows the server's `detail` in the alert.
    - Its hint becomes "Runs the Ops agent now. Uses AI credits."
11. **Undo** is a `QUIET` button on an Activity row, shown when `undo` is not null.
    - When `undo.allowed` is false, the reason sentence shows instead.
    - Success replaces the row with the answer's action and says "Undone: <title>." in the page status, which takes focus.
    - A `409 ALREADY_DECIDED` (someone else undid it first) also carries the action: the row is replaced with it and the page status shows the server's detail ("Mona Manager already undid this.").
    - A refusal stays on the row, in the server's words. `CHANGED_SINCE` adds "Now: <current> · Agent set: <applied>" with both values in DM Mono.
    - Undo calls `taskChanged()` so Today, Team and the badges catch up.
12. **The Recommended kind label** for `agent_action` is the agent's label ("CS agent").
    - The meta line's priority shows only when `defaults` is not null.
    - The "Suggested for …" part shows only for `task.create`.
13. **`RecKind` splits in two:**
    - `RecRowKind` is the row's kind, with `agent` renamed `agent_action`.
    - `RecKind` stays the settings sources' keys (`sources.agent` is unchanged, see contract gap 3).
14. **The bell's `agent_action_undone`** gets Lucide `Undo2`. Its link `/work/activity?action=<id>` is a normal route link: no task panel, and no special history state.

**Contract resolutions (2026-10-08, coordinator):**
- Waiting's `counts` key `proposal` is now `agent_action`.
- `agent_action` rows in Recommended have an empty `why`; the card renders the action's own `rationale` and `evidence`.
- The Work settings `sources.agent` key is unchanged (Decision 13).
- `preview.initiative` is `{metric, target}`, both display strings.
- `GET /agents/actions/<id>/` exists; Activity's `?action=<id>` uses it (Decision 2).
- `GET /agents/settings/` carries `can_run`; Run now reads it, never client capabilities.
- Undo's `409 ALREADY_DECIDED` carries `action` (Decision 11).
- The PATCH refusal shapes are spelled out; `readAgentRefusal` already reads both.
- Waiting's `record: {type, id, name}` and AgentAction's `record: {kind, id, name}` stay different.
- Brain graph `proposal` nodes are out of scope.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/features/agents/agentTypes.ts` | create | The contract's shapes |
| `src/features/agents/agentsApi.ts` | create | `apiFetch` wrappers and `readAgentRefusal` |
| `src/features/agents/agentsText.ts` | create | Words, previews, statuses, undo reasons, drafts, checks, filters |
| `src/features/agents/testAgentsFixtures.ts` | create | Settings, cards and actions in the contract's shapes |
| `src/features/agents/testAgents.ts` | create | A stateful fetch stub for `/agents/*` with `passThrough` |
| `src/features/work/workTypes.ts` | modify | `RecRowKind`; `RecommendationRow.agent_action`; nullable `defaults` |
| `src/features/work/recommended.ts` | modify | `KIND_LABEL` by `RecRowKind`; `agent_action` labels |
| `src/features/work/testWorkFixtures.ts` | modify | `REC_AGENT` becomes an `agent_action` row; a lifecycle one is added |
| `src/features/work/workTabs.ts` | modify | The Activity tab |
| `src/features/brain/brainTypes.ts` | modify | `AgentActionItem` replaces `ProposalItem`; `WaitingKind` |
| `src/features/brain/waitingText.ts` | modify | Chip, kind label, and Ask words |
| `src/features/brain/brainApi.ts` | modify | Drops `decideProposal` and `askAgent` |
| `src/features/brain/testWaitingFixtures.ts`, `testBrain.ts` | modify | `agent_action` items; the run route |
| `src/features/notifications/types.ts` | modify | `agent_action_undone` |
| `src/components/agents/AgentActionBody.tsx` | create | Preview, rationale, evidence, task link |
| `src/components/agents/AgentActionDecision.tsx` | create | Apply and Reject |
| `src/components/agents/UndoAction.tsx` | create | Undo and its refusals |
| `src/components/agents/ActivityRow.tsx` | create | One Activity row |
| `src/components/agents/ActivitySkeleton.tsx` | create | Activity loading |
| `src/components/agents/AgentsForm.tsx`, `AgentsSummary.tsx`, `AgentCard.tsx` | create | Settings › Agents |
| `src/components/agents/ActionsGridForm.tsx`, `ActionsGridSummary.tsx` | create | Actions & approvals |
| `src/components/agents/houseRules.test.ts` | create | House rules over the above and the Agent settings pages |
| `src/components/work/RecommendationCard.tsx` | modify | The `agent_action` branch |
| `src/components/brain/WaitingRow.tsx` | modify | The `agent_action` body |
| `src/components/brain/ProposalDecision.tsx` | delete | Replaced by `AgentActionDecision` |
| `src/components/layout/NotificationKindIcon.tsx` | modify | `Undo2` |
| `src/pages/work/Activity.tsx` | create | `/work/activity` |
| `src/pages/work/WorkRoutes.tsx` | modify | The Activity route |
| `src/pages/brain/Waiting.tsx` | modify | Ask the agent runs Ops |
| `src/pages/settings/AgentSettingsFrame.tsx` | create | h1, intro, `GET /agents/settings/`, skeleton, error |
| `src/pages/settings/AgentsSettingsPage.tsx`, `AgentActionsPage.tsx` | create | The two pages |
| `src/pages/settings/AIAgentPage.tsx`, `AIAgentPage.test.tsx` | delete | Moved into Settings › Agents |
| `src/pages/settings/workspaceSettingsNav.ts`, `routes.tsx` | modify | The Agents group and the redirect |
| `src/e2e/agents.test.tsx` | create | The journey |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md` | modify | Delivery 1 described |

Tests sit beside their files.

---

### Task 1: The agents data layer, the stub and fixtures

**Files:**
- Create: `src/features/agents/agentTypes.ts`
- Create: `src/features/agents/agentsApi.ts`
- Create: `src/features/agents/testAgentsFixtures.ts`
- Create: `src/features/agents/testAgents.ts`
- Test: `src/features/agents/agentsApi.test.ts`
- Test: `src/features/agents/testAgents.test.ts`

**Interfaces:**
- **Consumes:**
  - `apiFetch` and `ApiError` (`src/lib/apiClient`);
  - `AgentTone` (`src/features/auth/authSlice`);
  - `PersonRef` and `TaskPriority` (`src/features/work/workTypes`).
- **Produces:**
  - the types `AgentKind`, `AGENT_KINDS`, `ActionKind`, `ACTION_KINDS`, `ActionLevel`, `ActionStatus`, `ACTION_STATUSES`, `SkippedReason`, `LastRun`, `AgentCard`, `ActionKindSpec`, `Levels`, `AgentSettings`, `AgentSettingsPatch`, `ActionRecord`, `ActionPreview`, `UndoState`, `AgentAction`, `ActivityPayload`, `ActivityFilters` and `ApproveBody`;
  - the API calls `fetchAgentSettings()`, `patchAgentSettings(patch)`, `runAgent(kind)`, `fetchActivity(filters)`, `fetchAction(id)`, `approveAction(id, body?)`, `rejectAction(id, note)` and `undoAction(id)`;
  - `readAgentRefusal(err, fallback): AgentRefusal` and `refusalCode(err): string | null`;
  - from the fixtures: `AGENT_SETTINGS`, `CARDS`, `KINDS`, `ALL_ASK`, `ACT_LIFECYCLE`, `ACT_TASK_CREATE`, `ACT_APPLIED_AUTO`, `ACT_UNDONE`, `ACT_INITIATIVE` and `ACTIONS`;
  - from the stub: `stubAgents(stub)` → `{ spy, actions, settings, onSettle }`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/agents/agentsApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { approveAction, fetchAction, fetchActivity, fetchAgentSettings, patchAgentSettings, readAgentRefusal, refusalCode, rejectAction, runAgent, undoAction } from './agentsApi';
import { calls, sent, stubAgents } from './testAgents';

afterEach(() => vi.unstubAllGlobals());

describe('agentsApi: the routes the contract names', () => {
  it('reads and patches the settings, runs an agent, lists Activity and decides', async () => {
    const { spy } = stubAgents();
    await fetchAgentSettings();
    await patchAgentSettings({ levels: { cs: { 'record.lifecycle': 'auto' } } });
    await runAgent('cs');
    await fetchActivity({ agent: 'cs', kind: null, status: 'applied', page: 2 });
    await fetchAction(81);
    await approveAction(81);
    await rejectAction(82, 'Not now');
    await undoAction(83);
    expect(calls(spy, 'GET', '/agents/')).toEqual(['/agents/settings/', '/agents/actions/?agent=cs&status=applied&page=2', '/agents/actions/81/']);
    expect(calls(spy, 'POST', '/agents/')).toEqual(['/agents/cs/run/', '/agents/actions/81/approve/', '/agents/actions/82/reject/', '/agents/actions/83/undo/']);
    expect(sent(spy, 'POST', '/reject/')).toEqual([{ note: 'Not now' }]);
    expect(sent(spy, 'POST', '/approve/')).toEqual([{}]);
  });
});

describe('readAgentRefusal', () => {
  it('places nested settings errors under their agent and kind', () => {
    const err = new ApiError(400, 'Bad', {
      ai_enabled: ['Choose on or off.'],
      agents: { cs: { monthly_credits: ['Choose a whole number from 0 to 2000.'] } },
      levels: { cs: { 'record.owner': ["This action can't be set to auto."] } },
    });
    expect(readAgentRefusal(err, 'Could not save these settings.')).toEqual({
      top: { ai_enabled: 'Choose on or off.' },
      agents: { cs: { monthly_credits: 'Choose a whole number from 0 to 2000.' } },
      levels: { cs: { 'record.owner': "This action can't be set to auto." } },
      form: null,
    });
  });

  it('puts a detail or an unknown failure on the form', () => {
    expect(readAgentRefusal(new ApiError(403, 'No', { detail: 'You do not have permission.' }), 'Fallback.').form).toBe('You do not have permission.');
    expect(readAgentRefusal(new Error('offline'), 'Fallback.').form).toBe('Fallback.');
  });

  it('reads a refusal code', () => {
    expect(refusalCode(new ApiError(409, 'x', { code: 'BUDGET_USED', detail: 'd' }))).toBe('BUDGET_USED');
    expect(refusalCode(new Error('x'))).toBeNull();
  });
});
```

Create `src/features/agents/testAgents.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACT_APPLIED_AUTO, ACT_LIFECYCLE, AGENT_SETTINGS } from './testAgentsFixtures';
import { stubAgents } from './testAgents';

afterEach(() => vi.unstubAllGlobals());

const post = (path: string, body: unknown = {}) =>
  fetch(`http://localhost/api/v1${path}`, { method: 'POST', body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const patch = (body: unknown) =>
  fetch('http://localhost/api/v1/agents/settings/', { method: 'PATCH', body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));

describe('stubAgents: the contract in miniature', () => {
  it('applies a proposed action once; a second decision is 409 ALREADY_DECIDED', async () => {
    stubAgents();
    const first = await post(`/agents/actions/${ACT_LIFECYCLE.id}/approve/`);
    expect(first.status).toBe(200);
    expect(first.body.action.status).toBe('applied');
    const again = await post(`/agents/actions/${ACT_LIFECYCLE.id}/reject/`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_DECIDED');
  });

  it('refuses a level above max_level, a budget over the plan and an unknown agent, all at once', async () => {
    stubAgents();
    const answer = await patch({ agents: { cs: { monthly_credits: 99999 }, bot: { enabled: true } }, levels: { cs: { 'record.owner': 'auto' } } });
    expect(answer.status).toBe(400);
    expect(answer.body).toEqual({
      agents: { cs: { monthly_credits: [`Choose a whole number from 0 to ${AGENT_SETTINGS.plan_monthly_credits}.`] }, bot: ['Unknown agent.'] },
      levels: { cs: { 'record.owner': ["This action can't be set to auto."] } },
    });
  });

  it('undoes an applied action, and refuses CHANGED_SINCE when told to', async () => {
    const { actions } = stubAgents({ changedSince: [ACT_APPLIED_AUTO.id] });
    const refused = await post(`/agents/actions/${ACT_APPLIED_AUTO.id}/undo/`);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: 'CHANGED_SINCE', current: 'Churn', applied: 'Renewal' });
    actions.get(ACT_APPLIED_AUTO.id)!.changed = false;
    const undone = await post(`/agents/actions/${ACT_APPLIED_AUTO.id}/undo/`);
    expect(undone.body.action.status).toBe('undone');
  });

  it('runs an agent, or refuses BUDGET_USED for a spent one', async () => {
    stubAgents({ spent: { sales: 200 } });
    expect((await post('/agents/cs/run/')).status).toBe(200);
    const refused = await post('/agents/sales/run/');
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('BUDGET_USED');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/agents --maxWorkers=2`
Expected: FAIL, because `./agentsApi`, `./testAgents` and `./testAgentsFixtures` cannot be resolved.

- [ ] **Step 3: The types**

Create `src/features/agents/agentTypes.ts`:

```ts
// Agents, delivery 1 (contract revenact-backend
// docs/superpowers/plans/2026-10-08-agents-actions-api.md). No em dash.
import type { AgentTone } from '../auth/authSlice';
import type { PersonRef, TaskPriority } from '../work/workTypes';

export type AgentKind = 'cs' | 'sales' | 'ops';
export const AGENT_KINDS: readonly AgentKind[] = ['cs', 'sales', 'ops'];

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
  | 'initiative.create';
/** The contract's order. */
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
  'initiative.create',
];

export type ActionLevel = 'auto' | 'ask' | 'never';
export type ActionStatus = 'proposed' | 'applied' | 'rejected' | 'expired' | 'undone';
export const ACTION_STATUSES: readonly ActionStatus[] = ['proposed', 'applied', 'rejected', 'expired', 'undone'];
export type SkippedReason = 'ai_off' | 'disabled' | 'no_actions' | 'budget' | 'credits' | 'failed';

export interface LastRun {
  at: string;
  proposed: number;
  applied: number;
  dropped: number;
  skipped_reason: SkippedReason | null;
}

export interface AgentCard {
  kind: AgentKind;
  label: string;
  enabled: boolean;
  monthly_credits: number;
  spent_this_month: number;
  /** YYYY-MM-DD, the first of next month in the workspace timezone. */
  resets_on: string;
  last_run: LastRun | null;
}

export interface ActionKindSpec {
  kind: ActionKind;
  label: string;
  example: string;
  max_level: ActionLevel;
  agents: AgentKind[];
}

/** Every agent, and every kind that agent can use. */
export type Levels = Record<AgentKind, Partial<Record<ActionKind, ActionLevel>>>;

/** GET /agents/settings/. */
export interface AgentSettings {
  ai_enabled: boolean;
  tone: AgentTone;
  agents: AgentCard[];
  kinds: ActionKindSpec[];
  levels: Levels;
  plan_monthly_credits: number;
  can_edit: boolean;
  /** manage_org_settings or view_all_accounts: the Run now rule. */
  can_run: boolean;
}

/** PATCH /agents/settings/: any subset. */
export interface AgentSettingsPatch {
  ai_enabled?: boolean;
  tone?: AgentTone;
  agents?: Partial<Record<AgentKind, { enabled?: boolean; monthly_credits?: number }>>;
  levels?: Partial<Record<AgentKind, Partial<Record<ActionKind, ActionLevel>>>>;
}

export interface ActionRecord {
  kind: 'customer' | 'account';
  id: number;
  name: string;
}

/** Shaped by the kind (contract "preview"); `from` and `to` are display strings. */
export interface ActionPreview {
  field?: string;
  from?: string;
  to?: string;
  task?: { id?: number; title: string; assignee?: PersonRef | null; due_date?: string; priority?: TaskPriority };
  note?: { title: string };
  initiative?: { metric: string; target: string };
}

export type UndoReason = 'expired' | 'cant_decide' | 'changed_since';

export interface UndoState {
  allowed: boolean;
  until: string;
  reason: UndoReason | null;
}

export interface AgentAction {
  id: number;
  agent: AgentKind;
  kind: ActionKind;
  title: string;
  status: ActionStatus;
  /** Null for workspace-level kinds (`initiative.create`). */
  record: ActionRecord | null;
  preview: ActionPreview;
  rationale: string;
  /** Empty unless the reader holds view_all_accounts. */
  evidence: { label: string; link: string }[];
  decided_by: PersonRef | null;
  decided_at: string | null;
  /** Applied with no person (Auto). */
  auto: boolean;
  applied_at: string | null;
  /** Null unless `status` is `applied`. */
  undo: UndoState | null;
  undone_by: PersonRef | null;
  undone_at: string | null;
  result: { task_id: number | null; note_id: number | null; initiative_id: number | null };
  created_at: string;
}

/** GET /agents/actions/. */
export interface ActivityPayload {
  count: number;
  next: string | null;
  previous: string | null;
  results: AgentAction[];
  /** Matching actions on records the reader cannot open. */
  hidden: number;
}

/** The filters Activity sends; null leaves one out. */
export interface ActivityFilters {
  agent: AgentKind | null;
  kind: ActionKind | null;
  status: ActionStatus | null;
  page: number;
}

/** POST approve/: overrides for `task.create` only. */
export interface ApproveBody {
  assignee_id?: number;
  title?: string;
  due_date?: string;
  priority?: TaskPriority;
}
```

- [ ] **Step 4: The API**

Create `src/features/agents/agentsApi.ts`:

```ts
// Thin apiFetch wrappers over /api/v1/agents/ (delivery 1 contract). No em dash.
import { ApiError, apiFetch } from '../../lib/apiClient';
import type { ActionKind, ActivityFilters, ActivityPayload, AgentAction, AgentCard, AgentKind, AgentSettings, AgentSettingsPatch, ApproveBody } from './agentTypes';

export const fetchAgentSettings = () => apiFetch<AgentSettings>('/agents/settings/');
export const patchAgentSettings = (patch: AgentSettingsPatch) => apiFetch<AgentSettings>('/agents/settings/', { method: 'PATCH', body: patch });
/** A real, paid model call: only ever from a click. */
export const runAgent = (kind: AgentKind) => apiFetch<AgentCard>(`/agents/${kind}/run/`, { method: 'POST' });

export function activityQuery(filters: ActivityFilters): string {
  const params = new URLSearchParams();
  if (filters.agent) params.set('agent', filters.agent);
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.status) params.set('status', filters.status);
  if (filters.page > 1) params.set('page', String(filters.page));
  const text = params.toString();
  return text ? `?${text}` : '';
}

export const fetchActivity = (filters: ActivityFilters) => apiFetch<ActivityPayload>(`/agents/actions/${activityQuery(filters)}`);
/** One action, for the bell's `?action=<id>` link; 404 when gone or on a record the reader can't open. */
export const fetchAction = (id: number) => apiFetch<AgentAction>(`/agents/actions/${id}/`);
export const approveAction = (id: number, body: ApproveBody = {}) =>
  apiFetch<{ action: AgentAction }>(`/agents/actions/${id}/approve/`, { method: 'POST', body });
export const rejectAction = (id: number, note: string) => apiFetch<{ action: AgentAction }>(`/agents/actions/${id}/reject/`, { method: 'POST', body: { note } });
export const undoAction = (id: number) => apiFetch<{ action: AgentAction }>(`/agents/actions/${id}/undo/`, { method: 'POST' });

/** A settings refusal read for the form: top-level fields, each agent's
 *  fields, each agent's levels, or a line for the form. */
export interface AgentRefusal {
  top: Partial<Record<'ai_enabled' | 'tone', string>>;
  agents: Partial<Record<string, Partial<Record<'enabled' | 'monthly_credits', string>> | string>>;
  levels: Partial<Record<string, Partial<Record<ActionKind, string>>>>;
  form: string | null;
}

export const NO_AGENT_REFUSAL: AgentRefusal = { top: {}, agents: {}, levels: {}, form: null };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const first = (value: unknown): string | null => (Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null);

export function readAgentRefusal(err: unknown, fallback: string): AgentRefusal {
  if (!(err instanceof ApiError) || !isObject(err.body)) return { ...NO_AGENT_REFUSAL, form: fallback };
  const body = err.body;
  const out: AgentRefusal = { top: {}, agents: {}, levels: {}, form: null };
  for (const key of ['ai_enabled', 'tone'] as const) {
    const message = first(body[key]);
    if (message) out.top[key] = message;
  }
  if (isObject(body.agents)) {
    for (const [agent, value] of Object.entries(body.agents)) {
      const whole = first(value);
      if (whole) {
        out.agents[agent] = whole;
        continue;
      }
      if (!isObject(value)) continue;
      const fields: Partial<Record<'enabled' | 'monthly_credits', string>> = {};
      for (const field of ['enabled', 'monthly_credits'] as const) {
        const message = first(value[field]);
        if (message) fields[field] = message;
      }
      out.agents[agent] = fields;
    }
  }
  if (isObject(body.levels)) {
    for (const [agent, value] of Object.entries(body.levels)) {
      if (!isObject(value)) continue;
      const cells: Partial<Record<ActionKind, string>> = {};
      for (const [kind, messages] of Object.entries(value)) {
        const message = first(messages);
        if (message) cells[kind as ActionKind] = message;
      }
      out.levels[agent] = cells;
    }
  }
  const named = Object.keys(out.top).length + Object.keys(out.agents).length + Object.keys(out.levels).length;
  if (named > 0) return out;
  const general = first(body.non_field_errors);
  if (general) return { ...out, form: general };
  if (typeof body.detail === 'string') return { ...out, form: body.detail };
  return { ...out, form: fallback };
}

/** The `code` of a refusal (BUDGET_USED, CHANGED_SINCE, ...), or null. */
export function refusalCode(err: unknown): string | null {
  if (!(err instanceof ApiError) || !isObject(err.body)) return null;
  return typeof err.body.code === 'string' ? err.body.code : null;
}

/** The server's own sentence, or null. */
export function refusalDetail(err: unknown): string | null {
  if (!(err instanceof ApiError) || !isObject(err.body)) return null;
  return typeof err.body.detail === 'string' && err.body.detail ? err.body.detail : null;
}

/** A refusal's whole body when it is an object (CHANGED_SINCE's `current`, `applied`). */
export function refusalBody(err: unknown): Record<string, unknown> | null {
  return err instanceof ApiError && isObject(err.body) ? err.body : null;
}
```

- [ ] **Step 5: The fixtures**

Create `src/features/agents/testAgentsFixtures.ts`:

```ts
// Test-only: the delivery 1 contract's shapes, around the Work fixtures'
// people (Alice 1 admin, Mona 2, Carl 3, Dana 4) and records (Pizza Hut 7,
// Uber EMEA 9). No em dash.
import type { ActionKindSpec, AgentAction, AgentCard, AgentKind, AgentSettings, Levels } from './agentTypes';

export const NOW = '2026-10-08T09:00:00.000000Z';

export const CARDS: AgentCard[] = [
  { kind: 'cs', label: 'CS agent', enabled: true, monthly_credits: 133, spent_this_month: 12, resets_on: '2026-11-01', last_run: { at: '2026-10-08T00:40:00Z', proposed: 4, applied: 1, dropped: 0, skipped_reason: null } },
  { kind: 'sales', label: 'Sales agent', enabled: true, monthly_credits: 133, spent_this_month: 0, resets_on: '2026-11-01', last_run: null },
  { kind: 'ops', label: 'Ops agent', enabled: false, monthly_credits: 134, spent_this_month: 0, resets_on: '2026-11-01', last_run: { at: '2026-10-08T00:41:00Z', proposed: 0, applied: 0, dropped: 0, skipped_reason: 'disabled' } },
];

const ALL: AgentKind[] = ['cs', 'sales', 'ops'];
const RECORDS: AgentKind[] = ['cs', 'sales'];
export const KINDS: ActionKindSpec[] = [
  { kind: 'record.lifecycle', label: 'Change lifecycle stage', example: 'Move Dough Co from Live to Renewal', max_level: 'auto', agents: RECORDS },
  { kind: 'record.owner', label: 'Change owner', example: 'Give Uber EMEA to Dana CSM', max_level: 'ask', agents: RECORDS },
  { kind: 'record.attribute', label: 'Set an AI attribute', example: 'Set Renewal likelihood to Low on Pizza Hut', max_level: 'auto', agents: RECORDS },
  { kind: 'task.create', label: 'Create a task', example: 'Call Pizza Hut about the renewal', max_level: 'auto', agents: ALL },
  { kind: 'task.reassign', label: 'Reassign a task', example: 'Give the QBR deck to Carl CSM', max_level: 'auto', agents: ALL },
  { kind: 'task.redate', label: "Change a task's due date", example: 'Move the QBR deck to 20 Oct', max_level: 'auto', agents: ALL },
  { kind: 'task.complete', label: 'Mark a task done', example: 'Close Send the contract: it was signed', max_level: 'ask', agents: ALL },
  { kind: 'task.snooze', label: 'Snooze a task', example: 'Snooze the roadmap review to 1 Nov', max_level: 'auto', agents: ALL },
  { kind: 'note.create', label: 'File a note', example: 'Note what the last call settled', max_level: 'auto', agents: ALL },
  { kind: 'initiative.create', label: 'Start an initiative', example: 'Cut Analytics Suite risk to 10% by December', max_level: 'ask', agents: ['ops'] },
];

/** Every agent, every kind it uses, on Ask (the contract's fresh workspace). */
export const ALL_ASK: Levels = {
  cs: Object.fromEntries(KINDS.filter((k) => k.agents.includes('cs')).map((k) => [k.kind, 'ask'])),
  sales: Object.fromEntries(KINDS.filter((k) => k.agents.includes('sales')).map((k) => [k.kind, 'ask'])),
  ops: Object.fromEntries(KINDS.filter((k) => k.agents.includes('ops')).map((k) => [k.kind, 'ask'])),
};

export const AGENT_SETTINGS: AgentSettings = {
  ai_enabled: true,
  tone: 'professional',
  agents: CARDS,
  kinds: KINDS,
  levels: ALL_ASK,
  plan_monthly_credits: 2000,
  can_edit: true,
  can_run: true,
};

const base = {
  rationale: 'Renewal is in 21 days and the renewal task is open.',
  evidence: [{ label: 'Renews 29 Oct', link: '/organizations/7' }],
  decided_by: null,
  decided_at: null,
  auto: false,
  applied_at: null,
  undo: null,
  undone_by: null,
  undone_at: null,
  result: { task_id: null, note_id: null, initiative_id: null },
  created_at: '2026-10-08T00:40:00Z',
};

export const ACT_LIFECYCLE: AgentAction = {
  ...base,
  id: 81,
  agent: 'cs',
  kind: 'record.lifecycle',
  title: 'Move Pizza Hut to Renewal',
  status: 'proposed',
  record: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  preview: { field: 'Lifecycle stage', from: 'Live', to: 'Renewal' },
};

export const ACT_TASK_CREATE: AgentAction = {
  ...base,
  id: 82,
  agent: 'cs',
  kind: 'task.create',
  title: 'Call Pizza Hut about the renewal',
  status: 'proposed',
  record: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  preview: { task: { title: 'Call Pizza Hut about the renewal', assignee: { id: 3, name: 'Carl CSM' }, due_date: '2026-10-12', priority: 'high' } },
};

export const ACT_APPLIED_AUTO: AgentAction = {
  ...base,
  id: 83,
  agent: 'sales',
  kind: 'record.lifecycle',
  title: 'Move Uber EMEA to Renewal',
  status: 'applied',
  record: { kind: 'account', id: 9, name: 'Uber EMEA' },
  preview: { field: 'Lifecycle stage', from: 'Live', to: 'Renewal' },
  auto: true,
  applied_at: '2026-10-08T00:42:00Z',
  undo: { allowed: true, until: '2026-10-15T00:42:00Z', reason: null },
};

export const ACT_UNDONE: AgentAction = {
  ...base,
  id: 84,
  agent: 'cs',
  kind: 'task.redate',
  title: 'Move the QBR deck to 20 Oct',
  status: 'undone',
  record: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  preview: { task: { id: 42, title: 'Send the QBR deck' }, field: 'Due date', from: '2026-10-07', to: '2026-10-20' },
  decided_by: { id: 2, name: 'Mona Manager' },
  decided_at: '2026-10-07T09:00:00Z',
  applied_at: '2026-10-07T09:00:00Z',
  undone_by: { id: 1, name: 'Alice' },
  undone_at: '2026-10-07T10:00:00Z',
};

export const ACT_INITIATIVE: AgentAction = {
  ...base,
  id: 85,
  agent: 'ops',
  kind: 'initiative.create',
  title: 'Cut Analytics Suite risk',
  status: 'proposed',
  record: null,
  preview: { initiative: { metric: 'At-risk ARR, Analytics Suite', target: '10% by 31 Dec 2026' } },
};

/** Newest first, as the list answers. */
export const ACTIONS: AgentAction[] = [ACT_INITIATIVE, ACT_UNDONE, ACT_APPLIED_AUTO, ACT_TASK_CREATE, ACT_LIFECYCLE];
```

- [ ] **Step 6: The stub**

Create `src/features/agents/testAgents.ts`:

```ts
// Test-only: one stateful fetch stub for /api/v1/agents/, in the delivery 1
// contract's shapes and refusal orders. Writes are kept, so a later read
// returns them; every answer is a copy. Anything it does not know goes to
// `passThrough` (so stubWork or stubBrain can sit behind it). No em dash.
import { vi } from 'vitest';
import { ACTIONS, AGENT_SETTINGS } from './testAgentsFixtures';
import type { ActionKind, ActionLevel, AgentAction, AgentKind, AgentSettings } from './agentTypes';

export interface AgentsStub {
  settings?: AgentSettings;
  actions?: AgentAction[];
  /** Whether the reader may decide and undo every action. Default true. */
  mayDecide?: boolean;
  /** Ids whose undo answers CHANGED_SINCE. */
  changedSince?: number[];
  /** spent_this_month per agent, overriding the cards. */
  spent?: Partial<Record<AgentKind, number>>;
  /** Activity's `hidden`. Default 0. */
  hidden?: number;
  /** How many reads of each fail (500) first. */
  failSettings?: number;
  failActivity?: number;
  /** The next decision (approve, reject or undo) answers this instead, once. */
  refuseNextDecision?: { status: number; body: unknown };
  /** The next run answers this instead, once. */
  refuseNextRun?: { status: number; body: unknown };
  passThrough?: (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;
}

export interface ActionState {
  action: AgentAction;
  /** Undo answers CHANGED_SINCE while true. */
  changed: boolean;
}

const json = (status: number, body: unknown) => {
  const copy = body === undefined ? null : JSON.parse(JSON.stringify(body));
  return { ok: status >= 200 && status < 300, status, json: async () => copy };
};
const DOWN = { detail: 'Down.' };
const READER = { id: 1, name: 'Alice' };
const LEVELS: readonly ActionLevel[] = ['auto', 'ask', 'never'];
const RANK: Record<ActionLevel, number> = { never: 0, ask: 1, auto: 2 };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function stubAgents(stub: AgentsStub = {}) {
  const settings: AgentSettings = JSON.parse(JSON.stringify(stub.settings ?? AGENT_SETTINGS));
  for (const card of settings.agents) {
    const spent = stub.spent?.[card.kind];
    if (spent !== undefined) card.spent_this_month = spent;
  }
  const changed = new Set(stub.changedSince ?? []);
  const actions = new Map<number, ActionState>(
    (stub.actions ?? ACTIONS).map((a) => [a.id, { action: JSON.parse(JSON.stringify(a)) as AgentAction, changed: changed.has(a.id) }]),
  );
  const mayDecide = stub.mayDecide ?? true;
  let failSettings = stub.failSettings ?? 0;
  let failActivity = stub.failActivity ?? 0;
  let refuseDecision = stub.refuseNextDecision ?? null;
  let refuseRun = stub.refuseNextRun ?? null;
  const settle: ((id: number) => void)[] = [];

  function decidedText(a: AgentAction): string {
    if (a.status === 'undone') return `${a.undone_by?.name ?? 'Someone'} already undid this.`;
    const who = a.decided_by?.name ?? 'Someone';
    return a.status === 'rejected' ? `${who} already rejected this.` : `${who} already applied this.`;
  }

  function decide(id: number, verb: 'approve' | 'reject' | 'undo') {
    const state = actions.get(id);
    if (!state) return json(404, { code: 'NO_SUCH_ACTION', detail: "That action isn't there any more." });
    if (!mayDecide) return json(403, { code: 'CANT_DECIDE', detail: "You can't decide this action." });
    if (refuseDecision) {
      const answer = refuseDecision;
      refuseDecision = null;
      return json(answer.status, answer.body);
    }
    const a = state.action;
    if (verb === 'undo') {
      if (a.status === 'undone') return json(409, { code: 'ALREADY_DECIDED', detail: decidedText(a), action: a });
      if (a.status !== 'applied') return json(409, { code: 'NOT_APPLIED', detail: 'Only an applied action can be undone.' });
      if (a.undo && a.undo.reason === 'expired') return json(410, { code: 'UNDO_EXPIRED', detail: 'Undo is available for 7 days after an action applies.' });
      if (state.changed) {
        return json(409, { code: 'CHANGED_SINCE', detail: `${a.preview.field ?? 'It'} has changed since: it is now Churn.`, current: 'Churn', applied: a.preview.to ?? '' });
      }
      a.status = 'undone';
      a.undone_by = READER;
      a.undone_at = '2026-10-08T09:30:00Z';
      a.undo = null;
      return json(200, { action: a });
    }
    if (a.status === 'expired') return json(409, { code: 'EXPIRED', detail: 'This action has expired: the record changed since.', action: a });
    if (a.status !== 'proposed') return json(409, { code: 'ALREADY_DECIDED', detail: decidedText(a), action: a });
    a.decided_by = READER;
    a.decided_at = '2026-10-08T09:10:00Z';
    if (verb === 'reject') {
      a.status = 'rejected';
    } else {
      a.status = 'applied';
      a.applied_at = '2026-10-08T09:10:00Z';
      a.undo = { allowed: true, until: '2026-10-15T09:10:00Z', reason: null };
      if (a.kind === 'task.create') a.result = { ...a.result, task_id: 90 };
    }
    settle.forEach((fn) => fn(id));
    return json(200, { action: a });
  }

  function saveSettings(body: unknown) {
    if (!settings.can_edit) return json(403, { detail: 'You do not have permission to perform this action.' });
    if (!isObject(body)) return json(400, { non_field_errors: ['Send the fields as one object.'] });
    const errors: Record<string, unknown> = {};
    if ('ai_enabled' in body && typeof body.ai_enabled !== 'boolean') errors.ai_enabled = ['Choose on or off.'];
    if ('tone' in body && !['professional', 'friendly', 'concise'].includes(String(body.tone))) errors.tone = ['Choose professional, friendly or concise.'];
    const agentErrors: Record<string, unknown> = {};
    if (isObject(body.agents)) {
      for (const [kind, fields] of Object.entries(body.agents)) {
        if (!settings.agents.some((card) => card.kind === kind)) {
          agentErrors[kind] = ['Unknown agent.'];
          continue;
        }
        if (!isObject(fields)) continue;
        const wrong: Record<string, string[]> = {};
        if ('enabled' in fields && typeof fields.enabled !== 'boolean') wrong.enabled = ['Choose on or off.'];
        if ('monthly_credits' in fields) {
          const value = fields.monthly_credits;
          if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > settings.plan_monthly_credits) {
            wrong.monthly_credits = [`Choose a whole number from 0 to ${settings.plan_monthly_credits}.`];
          }
        }
        if (Object.keys(wrong).length > 0) agentErrors[kind] = wrong;
      }
    }
    if (Object.keys(agentErrors).length > 0) errors.agents = agentErrors;
    const levelErrors: Record<string, Record<string, string[]>> = {};
    if (isObject(body.levels)) {
      for (const [agent, cells] of Object.entries(body.levels)) {
        if (!isObject(cells)) continue;
        for (const [kind, level] of Object.entries(cells)) {
          const spec = settings.kinds.find((k) => k.kind === kind);
          let message: string | null = null;
          if (!spec || !spec.agents.includes(agent as AgentKind)) message = "That agent doesn't use this action.";
          else if (!LEVELS.includes(level as ActionLevel)) message = 'Choose auto, ask or never.';
          else if (RANK[level as ActionLevel] > RANK[spec.max_level]) message = "This action can't be set to auto.";
          if (message) (levelErrors[agent] ??= {})[kind] = [message];
        }
      }
    }
    if (Object.keys(levelErrors).length > 0) errors.levels = levelErrors;
    if (Object.keys(errors).length > 0) return json(400, errors);
    if (typeof body.ai_enabled === 'boolean') settings.ai_enabled = body.ai_enabled;
    if (typeof body.tone === 'string') settings.tone = body.tone as AgentSettings['tone'];
    if (isObject(body.agents)) {
      for (const [kind, fields] of Object.entries(body.agents)) {
        const card = settings.agents.find((c) => c.kind === kind);
        if (!card || !isObject(fields)) continue;
        if (typeof fields.enabled === 'boolean') card.enabled = fields.enabled;
        if (typeof fields.monthly_credits === 'number') card.monthly_credits = fields.monthly_credits;
      }
    }
    if (isObject(body.levels)) {
      for (const [agent, cells] of Object.entries(body.levels)) {
        if (!isObject(cells)) continue;
        for (const [kind, level] of Object.entries(cells)) settings.levels[agent as AgentKind][kind as ActionKind] = level as ActionLevel;
      }
    }
    return json(200, settings);
  }

  function run(kind: string) {
    const card = settings.agents.find((c) => c.kind === kind);
    if (!card) return json(404, { detail: 'Not found.' });
    if (refuseRun) {
      const answer = refuseRun;
      refuseRun = null;
      return json(answer.status, answer.body);
    }
    if (!settings.ai_enabled) return json(409, { code: 'AI_OFF', detail: 'AI is switched off for this workspace.' });
    if (!card.enabled) return json(409, { code: 'AGENT_OFF', detail: 'This agent is switched off.' });
    if (card.spent_this_month >= card.monthly_credits) {
      return json(409, { code: 'BUDGET_USED', detail: "This agent's budget is used up: it resumes on 1 Nov.", resets_on: card.resets_on });
    }
    card.spent_this_month += 1;
    card.last_run = { at: '2026-10-08T09:20:00Z', proposed: 3, applied: 1, dropped: 0, skipped_reason: null };
    return json(200, card);
  }

  function activity(url: URL) {
    if (failActivity > 0) {
      failActivity -= 1;
      return json(500, DOWN);
    }
    const agent = url.searchParams.get('agent');
    const kind = url.searchParams.get('kind');
    const status = url.searchParams.get('status');
    const page = Number(url.searchParams.get('page') ?? '1');
    if (agent && !['cs', 'sales', 'ops'].includes(agent)) return json(400, { agent: ['Choose cs, sales or ops.'] });
    const rows = [...actions.values()]
      .map((s) => s.action)
      .filter((a) => (!agent || a.agent === agent) && (!kind || a.kind === kind) && (!status || a.status === status))
      .sort((x, y) => y.id - x.id);
    const size = 50;
    const results = rows.slice((page - 1) * size, page * size);
    const query = (n: number) => {
      const next = new URLSearchParams(url.searchParams);
      next.set('page', String(n));
      return `http://localhost/api/v1/agents/actions/?${next.toString()}`;
    };
    return json(200, {
      count: rows.length,
      next: page * size < rows.length ? query(page + 1) : null,
      previous: page > 1 ? query(page - 1) : null,
      results,
      hidden: stub.hidden ?? 0,
    });
  }

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (path === '/agents/settings/' && method === 'GET') {
      if (failSettings > 0) {
        failSettings -= 1;
        return json(500, DOWN);
      }
      return json(200, settings);
    }
    if (path === '/agents/settings/' && method === 'PATCH') return saveSettings(body);
    if (path === '/agents/actions/' && method === 'GET') return activity(url);
    const one = /^\/agents\/actions\/(\d+)\/$/.exec(path);
    if (one && method === 'GET') {
      const state = actions.get(Number(one[1]));
      return state ? json(200, state.action) : json(404, { code: 'NO_SUCH_ACTION', detail: "That action isn't there any more." });
    }
    const verb = /^\/agents\/actions\/(\d+)\/(approve|reject|undo)\/$/.exec(path);
    if (verb && method === 'POST') return decide(Number(verb[1]), verb[2] as 'approve' | 'reject' | 'undo');
    const running = /^\/agents\/([a-z]+)\/run\/$/.exec(path);
    if (running && method === 'POST') return run(running[1]);
    if (stub.passThrough) return stub.passThrough(input, init);
    return json(404, { detail: 'Not found.' });
  });
  vi.stubGlobal('fetch', spy);
  /** Called with an action's id when it is applied or rejected (a Work stub can drop its recommendation). */
  const onSettle = (fn: (id: number) => void) => {
    settle.push(fn);
  };
  return { spy, actions, settings, onSettle };
}

/** Every `method` request whose path contains `part`, as `/path?query` without /api/v1. */
export function calls(spy: ReturnType<typeof vi.fn>, method: string, part: string): string[] {
  return spy.mock.calls
    .map(([input, init]) => ({ url: new URL(String(input)), method: (init as RequestInit | undefined)?.method ?? 'GET' }))
    .filter((call) => call.method === method && call.url.pathname.includes(part))
    .map((call) => `${call.url.pathname.replace(/^\/api\/v1/, '')}${call.url.search}`);
}

/** The JSON bodies of every `method` request whose path contains `part`; `{}` for a POST with no body. */
export function sent(spy: ReturnType<typeof vi.fn>, method: string, part: string): unknown[] {
  return spy.mock.calls
    .filter(([input, init]) => ((init as RequestInit | undefined)?.method ?? 'GET') === method && new URL(String(input)).pathname.includes(part))
    .map(([, init]) => {
      const raw = (init as RequestInit).body;
      return raw ? JSON.parse(String(raw)) : {};
    });
}
```

Note: `approveAction(81)` sends `body: {}`, so `sent` returns `[{}]` as the test expects. `undoAction` sends no body.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/features/agents --maxWorkers=2`
Expected: PASS (7 tests).

- [ ] **Step 8: Lint, build, commit**

Run `npm run lint` and `npm run build`. Expect 0 errors from both.

```bash
git add src/features/agents/agentTypes.ts src/features/agents/agentsApi.ts src/features/agents/agentsApi.test.ts src/features/agents/testAgentsFixtures.ts src/features/agents/testAgents.ts src/features/agents/testAgents.test.ts
git commit -m "feat(agents): the delivery 1 data layer, a stateful stub and fixtures

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The agents' words and rules (`agentsText.ts`)

**Files:**
- Create: `src/features/agents/agentsText.ts`
- Test: `src/features/agents/agentsText.test.ts`

**Interfaces:**
- **Consumes:** Task 1's types; `formatDate` (`src/features/customers/formatters`).
- **Produces:**
  - Labels and copy: `AGENTS` (copy), `AGENT_LABEL`, `LEVEL_LABEL`, `STATUS_LABEL`.
  - Levels: `levelsUpTo(max)`.
  - Action text: `previewText(action)`, `statusText(action, me)`, `undoReasonText(reason)`, `changedSinceText(current, applied)`.
  - Agent card text: `skippedText(reason, resetsOn)`, `lastRunText(card)`, `budgetText(card)`, `runAnswerText(card)`.
  - Activity text: `hiddenActivityText(n)`.
  - Settings forms: `AgentsDraft`, `agentsDraftOf(settings)`, `validateAgents(draft, plan)`, `agentsPatchOf(settings, draft)`, `levelsDraftOf(settings)`, `levelsPatchOf(settings, draft)`.
  - Activity filters: `filtersOf(params)`, `filtersParams(filters, params)`.
  - Waiting: `waitingKindLabel(action)`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/agents/agentsText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  AGENTS,
  agentsDraftOf,
  agentsPatchOf,
  budgetText,
  changedSinceText,
  filtersOf,
  filtersParams,
  hiddenActivityText,
  lastRunText,
  levelsDraftOf,
  levelsPatchOf,
  levelsUpTo,
  previewText,
  runAnswerText,
  skippedText,
  statusText,
  undoReasonText,
  validateAgents,
  waitingKindLabel,
} from './agentsText';
import { ACT_APPLIED_AUTO, ACT_INITIATIVE, ACT_LIFECYCLE, ACT_TASK_CREATE, ACT_UNDONE, AGENT_SETTINGS, CARDS } from './testAgentsFixtures';

describe('previews (contract "preview")', () => {
  it('words each kind', () => {
    expect(previewText(ACT_LIFECYCLE)).toBe('Lifecycle stage: Live → Renewal');
    expect(previewText(ACT_TASK_CREATE)).toBe('Create a task: Call Pizza Hut about the renewal, for Carl CSM, due 12 Oct 2026, high priority');
    expect(previewText(ACT_UNDONE)).toBe('Send the QBR deck: Due date 7 Oct 2026 → 20 Oct 2026');
    expect(previewText(ACT_INITIATIVE)).toBe('Start an initiative: At-risk ARR, Analytics Suite, target 10% by 31 Dec 2026');
    expect(previewText({ ...ACT_LIFECYCLE, kind: 'note.create', preview: { note: { title: 'What the call settled' } } })).toBe('File a note: What the call settled');
  });
});

describe('statuses and undo', () => {
  it('says who decided, or Auto', () => {
    expect(statusText(ACT_LIFECYCLE, 1)).toBe('Waiting for a decision');
    expect(statusText(ACT_APPLIED_AUTO, 1)).toBe('Applied automatically');
    expect(statusText(ACT_UNDONE, 1)).toBe('Undone by you');
    expect(statusText({ ...ACT_LIFECYCLE, status: 'rejected', decided_by: { id: 2, name: 'Mona Manager' } }, 1)).toBe('Rejected by Mona Manager');
    expect(statusText({ ...ACT_LIFECYCLE, status: 'expired' }, 1)).toBe('Expired');
  });

  it('words each undo reason and CHANGED_SINCE', () => {
    expect(undoReasonText('expired')).toBe('Undo was available for 7 days.');
    expect(undoReasonText('cant_decide')).toBe('Only someone who could approve this can undo it.');
    expect(undoReasonText('changed_since')).toBe('This has changed since it applied.');
    expect(changedSinceText('Churn', 'Renewal')).toBe('Now: Churn · Agent set: Renewal');
  });
});

describe('agent cards', () => {
  it('words the last run, a skip, the budget and a run', () => {
    expect(lastRunText(CARDS[0])).toBe('Last run 8 Oct 2026: 4 proposed, 1 applied');
    expect(lastRunText(CARDS[1])).toBe('Has not run yet.');
    expect(lastRunText(CARDS[2])).toBe('Switched off.');
    expect(skippedText('budget', '2026-11-01')).toBe('Budget used up: resumes on 1 Nov 2026.');
    expect(skippedText('ai_off', '2026-11-01')).toBe('AI is switched off for this workspace.');
    expect(budgetText(CARDS[0])).toBe('12 of 133 credits this month · resets on 1 Nov 2026');
    expect(runAnswerText(CARDS[0])).toBe('The CS agent ran: 4 proposed, 1 applied.');
  });
});

describe('levels and the grid (Decision 6)', () => {
  it('offers only what max_level allows', () => {
    expect(levelsUpTo('auto')).toEqual(['auto', 'ask', 'never']);
    expect(levelsUpTo('ask')).toEqual(['ask', 'never']);
    expect(levelsUpTo('never')).toEqual(['never']);
  });

  it('patches only the cells that changed', () => {
    const draft = levelsDraftOf(AGENT_SETTINGS);
    expect(levelsPatchOf(AGENT_SETTINGS, draft)).toEqual({});
    draft.cs['record.lifecycle'] = 'auto';
    draft.ops['initiative.create'] = 'never';
    expect(levelsPatchOf(AGENT_SETTINGS, draft)).toEqual({ levels: { cs: { 'record.lifecycle': 'auto' }, ops: { 'initiative.create': 'never' } } });
  });
});

describe('the agents form (Decision 7)', () => {
  it('checks budgets in the contract words and patches only changes', () => {
    const draft = agentsDraftOf(AGENT_SETTINGS);
    expect(agentsPatchOf(AGENT_SETTINGS, draft)).toEqual({});
    draft.cs.budget = '2001';
    draft.sales.budget = '1.5';
    expect(validateAgents(draft, 2000)).toEqual({
      cs: 'Choose a whole number from 0 to 2000.',
      sales: 'Choose a whole number from 0 to 2000.',
    });
    const fixed = { ...agentsDraftOf(AGENT_SETTINGS), ai_enabled: false };
    fixed.cs = { enabled: false, budget: '200' };
    expect(validateAgents(fixed, 2000)).toEqual({});
    expect(agentsPatchOf(AGENT_SETTINGS, fixed)).toEqual({ ai_enabled: false, agents: { cs: { enabled: false, monthly_credits: 200 } } });
  });
});

describe('Activity filters and the hidden line', () => {
  it('reads and writes the URL, dropping the page on a change', () => {
    const params = new URLSearchParams('agent=cs&status=applied&page=3&action=81');
    expect(filtersOf(params)).toEqual({ agent: 'cs', kind: null, status: 'applied', page: 3 });
    expect(filtersOf(new URLSearchParams('agent=bot&page=x'))).toEqual({ agent: null, kind: null, status: null, page: 1 });
    expect(filtersParams({ agent: 'cs', kind: 'task.create', status: null, page: 1 }, params).toString()).toBe('agent=cs&kind=task.create');
    expect(hiddenActivityText(0)).toBeNull();
    expect(hiddenActivityText(1)).toBe("1 more about a record you can't open");
    expect(hiddenActivityText(3)).toBe("3 more about records you can't open");
  });

  it('labels a Waiting item by agent and kind', () => {
    expect(waitingKindLabel(ACT_LIFECYCLE)).toBe('CS agent · Change lifecycle stage');
    expect(AGENTS.EMPTY_TITLE).toBe('No agent actions yet');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/agents/agentsText.test.ts --maxWorkers=2`
Expected: FAIL, because `./agentsText` cannot be resolved.

- [ ] **Step 3: Implement**

Create `src/features/agents/agentsText.ts`:

```ts
// Agents' words and rules (delivery 1), kept free of React so they are
// unit-tested on their own. Sentence case, no em dash.
import { formatDate } from '../customers/formatters';
import { ACTION_KINDS, ACTION_STATUSES, AGENT_KINDS } from './agentTypes';
import type {
  ActionKind,
  ActionLevel,
  ActionStatus,
  ActivityFilters,
  AgentAction,
  AgentCard,
  AgentKind,
  AgentSettings,
  AgentSettingsPatch,
  Levels,
  SkippedReason,
  UndoReason,
} from './agentTypes';

export const AGENTS = {
  SETTINGS_TITLE: 'Agents',
  SETTINGS_INTRO: 'Three agents read the workspace each night and propose or apply actions, within the budget and the rules you set here.',
  ACTIONS_TITLE: 'Actions & approvals',
  ACTIONS_INTRO: 'What each agent may do on its own (Auto), only with a person (Ask), or never.',
  LOAD: 'Could not load the agent settings.',
  LOADING: 'Loading the agent settings',
  READ_ONLY: 'Only admins can change these.',
  AI_SWITCH: 'AI for this workspace',
  AI_DETAIL: 'Off stops every agent, Copilot and the other AI features.',
  TONE: 'Tone',
  ON: 'On',
  OFF: 'Off',
  BUDGET: 'Monthly credits',
  SAVE_FAILED: 'Could not save these settings.',
  RUN: 'Run now',
  RUNNING: 'Running…',
  RUN_FAILED: 'Could not run this agent.',
  NOT_USED: 'Not used',
  ACTION: 'Action',
  WHAT_EACH_DOES: 'What each action does',
  ACTIVITY_LOAD: 'Could not load agent activity.',
  ACTIVITY_LOADING: 'Loading agent activity',
  ACTIVITY_LIST: 'Agent actions',
  EMPTY_TITLE: 'No agent actions yet',
  EMPTY_DETAIL: 'What the CS, Sales and Ops agents propose or apply shows here, with Undo for 7 days.',
  EMPTY_FILTERED_TITLE: 'Nothing matches these filters',
  CLEAR_FILTERS: 'Clear filters',
  ALL_AGENTS: 'All agents',
  ALL_ACTIONS: 'All actions',
  ALL_STATUSES: 'All statuses',
  AGENT: 'Agent',
  STATUS: 'Status',
  PREVIOUS: 'Previous',
  NEXT: 'Next',
  APPLY: 'Apply',
  REJECT: 'Reject',
  REJECT_IT: 'Reject it',
  CANCEL: 'Cancel',
  WHY_NOT: 'Why not? (optional)',
  WORKING: 'Working…',
  UNDO: 'Undo',
  UNDOING: 'Undoing…',
  WHY: 'Why',
  EVIDENCE: 'Evidence',
  DECIDE_FAILED: 'Could not record that decision. Try again.',
  UNDO_FAILED: 'Could not undo that. Try again.',
  GONE: "That action isn't there any more.",
  NOTE_TOO_LONG: 'Keep the note under 255 characters.',
} as const;

export const AGENT_LABEL: Record<AgentKind, string> = { cs: 'CS agent', sales: 'Sales agent', ops: 'Ops agent' };
export const LEVEL_LABEL: Record<ActionLevel, string> = { auto: 'Auto', ask: 'Ask', never: 'Never' };
export const STATUS_LABEL: Record<ActionStatus, string> = {
  proposed: 'Waiting for a decision',
  applied: 'Applied',
  rejected: 'Rejected',
  expired: 'Expired',
  undone: 'Undone',
};
/** The contract's labels, for the filters before settings are read. */
export const KIND_LABEL: Record<ActionKind, string> = {
  'record.lifecycle': 'Change lifecycle stage',
  'record.owner': 'Change owner',
  'record.attribute': 'Set an AI attribute',
  'task.create': 'Create a task',
  'task.reassign': 'Reassign a task',
  'task.redate': "Change a task's due date",
  'task.complete': 'Mark a task done',
  'task.snooze': 'Snooze a task',
  'note.create': 'File a note',
  'initiative.create': 'Start an initiative',
};

const RANKED: readonly ActionLevel[] = ['auto', 'ask', 'never'];

/** The levels a cell may offer: never above the kind's `max_level`. */
export function levelsUpTo(max: ActionLevel): ActionLevel[] {
  return RANKED.slice(RANKED.indexOf(max));
}

const isDate = (value: string | undefined): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const shown = (value: string | undefined) => (isDate(value) ? formatDate(value) : (value ?? ''));

/** One line for what the action does or did. */
export function previewText(action: AgentAction): string {
  const p = action.preview;
  if (action.kind === 'task.create' && p.task) {
    const who = p.task.assignee ? p.task.assignee.name : 'nobody';
    const due = p.task.due_date ? formatDate(p.task.due_date) : '';
    return `Create a task: ${p.task.title}, for ${who}, due ${due}, ${p.task.priority ?? 'medium'} priority`;
  }
  if (action.kind === 'note.create' && p.note) return `File a note: ${p.note.title}`;
  if (action.kind === 'initiative.create' && p.initiative) return `Start an initiative: ${p.initiative.metric}, target ${p.initiative.target}`;
  if (p.task && p.field) return `${p.task.title}: ${p.field} ${shown(p.from)} → ${shown(p.to)}`;
  return `${p.field ?? KIND_LABEL[action.kind]}: ${shown(p.from)} → ${shown(p.to)}`;
}

const nameFor = (person: { id: number; name: string } | null, me: number | null) => (!person ? 'someone' : person.id === me ? 'you' : person.name);

export function statusText(action: AgentAction, me: number | null): string {
  if (action.status === 'proposed') return STATUS_LABEL.proposed;
  if (action.status === 'expired') return STATUS_LABEL.expired;
  if (action.status === 'undone') return `Undone by ${nameFor(action.undone_by, me)}`;
  if (action.status === 'rejected') return `Rejected by ${nameFor(action.decided_by, me)}`;
  return action.auto ? 'Applied automatically' : `Applied by ${nameFor(action.decided_by, me)}`;
}

export function undoReasonText(reason: UndoReason): string {
  if (reason === 'expired') return 'Undo was available for 7 days.';
  if (reason === 'cant_decide') return 'Only someone who could approve this can undo it.';
  return 'This has changed since it applied.';
}

export const changedSinceText = (current: string, applied: string): string => `Now: ${current} · Agent set: ${applied}`;

export function skippedText(reason: SkippedReason, resetsOn: string): string {
  if (reason === 'ai_off') return 'AI is switched off for this workspace.';
  if (reason === 'disabled') return 'Switched off.';
  if (reason === 'no_actions') return 'Every action is set to never.';
  if (reason === 'budget') return `Budget used up: resumes on ${formatDate(resetsOn)}.`;
  if (reason === 'credits') return 'Workspace credits are used up.';
  return 'The last run failed. Try Run now.';
}

export function lastRunText(card: AgentCard): string {
  const run = card.last_run;
  if (!run) return 'Has not run yet.';
  if (run.skipped_reason) return skippedText(run.skipped_reason, card.resets_on);
  return `Last run ${formatDate(run.at.slice(0, 10))}: ${run.proposed} proposed, ${run.applied} applied`;
}

export const budgetText = (card: AgentCard): string =>
  `${card.spent_this_month} of ${card.monthly_credits} credits this month · resets on ${formatDate(card.resets_on)}`;

export function runAnswerText(card: AgentCard): string {
  const run = card.last_run;
  const name = `The ${AGENT_LABEL[card.kind].replace(' agent', '')} agent`;
  if (!run) return `${name} ran.`;
  if (run.skipped_reason) return `${name} did not run: ${skippedText(run.skipped_reason, card.resets_on)}`;
  return `${name} ran: ${run.proposed} proposed, ${run.applied} applied.`;
}

export function hiddenActivityText(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 more about a record you can't open" : `${n} more about records you can't open`;
}

export const waitingKindLabel = (action: AgentAction): string => `${AGENT_LABEL[action.agent]} · ${KIND_LABEL[action.kind]}`;

// The Settings › Agents form (Decision 7).

export interface AgentsDraft {
  ai_enabled: boolean;
  tone: AgentSettings['tone'];
  cs: { enabled: boolean; budget: string };
  sales: { enabled: boolean; budget: string };
  ops: { enabled: boolean; budget: string };
}

export function agentsDraftOf(settings: AgentSettings): AgentsDraft {
  const of = (kind: AgentKind) => {
    const card = settings.agents.find((c) => c.kind === kind);
    return { enabled: card?.enabled ?? false, budget: String(card?.monthly_credits ?? 0) };
  };
  return { ai_enabled: settings.ai_enabled, tone: settings.tone, cs: of('cs'), sales: of('sales'), ops: of('ops') };
}

const wholeIn = (text: string, max: number): number | null => {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value <= max ? value : null;
};

/** The browser's own checks, in the contract's words: agent to message. */
export function validateAgents(draft: AgentsDraft, plan: number): Partial<Record<AgentKind, string>> {
  const errors: Partial<Record<AgentKind, string>> = {};
  for (const kind of AGENT_KINDS) {
    if (wholeIn(draft[kind].budget, plan) === null) errors[kind] = `Choose a whole number from 0 to ${plan}.`;
  }
  return errors;
}

/** Only what changed (call after validateAgents passed). */
export function agentsPatchOf(settings: AgentSettings, draft: AgentsDraft): AgentSettingsPatch {
  const patch: AgentSettingsPatch = {};
  if (draft.ai_enabled !== settings.ai_enabled) patch.ai_enabled = draft.ai_enabled;
  if (draft.tone !== settings.tone) patch.tone = draft.tone;
  for (const kind of AGENT_KINDS) {
    const card = settings.agents.find((c) => c.kind === kind);
    if (!card) continue;
    const change: { enabled?: boolean; monthly_credits?: number } = {};
    if (draft[kind].enabled !== card.enabled) change.enabled = draft[kind].enabled;
    const budget = wholeIn(draft[kind].budget, Number.MAX_SAFE_INTEGER);
    if (budget !== null && budget !== card.monthly_credits) change.monthly_credits = budget;
    if (Object.keys(change).length > 0) patch.agents = { ...patch.agents, [kind]: change };
  }
  return patch;
}

// Actions & approvals (Decision 6).

export function levelsDraftOf(settings: AgentSettings): Levels {
  return JSON.parse(JSON.stringify(settings.levels)) as Levels;
}

export function levelsPatchOf(settings: AgentSettings, draft: Levels): AgentSettingsPatch {
  const levels: NonNullable<AgentSettingsPatch['levels']> = {};
  for (const agent of AGENT_KINDS) {
    for (const kind of ACTION_KINDS) {
      const next = draft[agent][kind];
      if (next !== undefined && next !== settings.levels[agent][kind]) levels[agent] = { ...levels[agent], [kind]: next };
    }
  }
  return Object.keys(levels).length > 0 ? { levels } : {};
}

// Activity's filters in the URL (Decision 2).

const isAgent = (value: string | null): value is AgentKind => value !== null && (AGENT_KINDS as readonly string[]).includes(value);
const isKind = (value: string | null): value is ActionKind => value !== null && (ACTION_KINDS as readonly string[]).includes(value);
const isStatus = (value: string | null): value is ActionStatus => value !== null && (ACTION_STATUSES as readonly string[]).includes(value);

export function filtersOf(params: URLSearchParams): ActivityFilters {
  const page = Number(params.get('page'));
  return {
    agent: isAgent(params.get('agent')) ? (params.get('agent') as AgentKind) : null,
    kind: isKind(params.get('kind')) ? (params.get('kind') as ActionKind) : null,
    status: isStatus(params.get('status')) ? (params.get('status') as ActionStatus) : null,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** `params` with the filters written in and `action` (the bell's) dropped. */
export function filtersParams(filters: ActivityFilters, params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of ['agent', 'kind', 'status', 'page', 'action']) next.delete(key);
  if (filters.agent) next.set('agent', filters.agent);
  if (filters.kind) next.set('kind', filters.kind);
  if (filters.status) next.set('status', filters.status);
  if (filters.page > 1) next.set('page', String(filters.page));
  return next;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/features/agents --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/agents/agentsText.ts src/features/agents/agentsText.test.ts
git commit -m "feat(agents): previews, statuses, undo reasons, drafts and filters

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The shared action body, Apply and Reject, and Undo

**Files:**
- Create: `src/components/agents/AgentActionBody.tsx`
- Create: `src/components/agents/AgentActionDecision.tsx`
- Create: `src/components/agents/UndoAction.tsx`
- Test: `src/components/agents/AgentActionDecision.test.tsx`
- Test: `src/components/agents/UndoAction.test.tsx`

**Interfaces:**
- **Consumes:**
  - Task 1: `approveAction`, `rejectAction`, `undoAction`, `refusalCode`, `refusalDetail`, `refusalBody`;
  - Task 2: `AGENTS`, `previewText`, `undoReasonText`, `changedSinceText`;
  - `useSubmitOnce`, `useTaskLink`, `taskChanged`, `recommendationsChanged`;
  - the styles `BUTTON`, `QUIET`, `FOCUS` and `MONO`; `Figured`.
- **Produces:**
  - `AgentActionBody({ action })`: the preview line (a task link for `task.*`, Decision 5), the rationale (`aria-label="Why"`) and the evidence links (`aria-label="Evidence"`, only when sent).
  - `AgentActionDecision({ action, onSettled, onGone, onRefused? })`:
    - `onSettled(answer: AgentAction, text: string)` on 200, with the text "Applied: <title>." or "Rejected: <title>.";
    - `onGone(text: string)` on 404, `409 ALREADY_DECIDED` or `409 EXPIRED`, with the server's detail, or "That action isn't there any more." for a 404;
    - `onRefused()` on `403 CANT_DECIDE`, after the sentence shows;
    - it calls `recommendationsChanged()` and `taskChanged()` after any settle or gone.
  - `UndoAction({ action, onUndone })`:
    - `onUndone(answer: AgentAction, text: string)` on 200 with "Undone: <title>.", and on `409 ALREADY_DECIDED` with the action it carries and the server's detail;
    - every refusal stays on the row in the server's words;
    - `CHANGED_SINCE` adds `changedSinceText` with both values in `MONO`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/agents/AgentActionDecision.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ACT_LIFECYCLE, ACT_TASK_CREATE } from '../../features/agents/testAgentsFixtures';
import { sent, stubAgents } from '../../features/agents/testAgents';
import { AgentActionBody } from './AgentActionBody';
import { AgentActionDecision } from './AgentActionDecision';

afterEach(() => vi.unstubAllGlobals());

const mount = (props: Partial<Parameters<typeof AgentActionDecision>[0]> = {}) => {
  const onSettled = vi.fn();
  const onGone = vi.fn();
  const onRefused = vi.fn();
  render(
    <MemoryRouter>
      <AgentActionBody action={ACT_LIFECYCLE} />
      <AgentActionDecision action={ACT_LIFECYCLE} onSettled={onSettled} onGone={onGone} onRefused={onRefused} {...props} />
    </MemoryRouter>,
  );
  return { onSettled, onGone, onRefused };
};

describe('AgentActionBody', () => {
  it('shows the preview, the why and the evidence; a task kind links its task', () => {
    mount();
    expect(screen.getByText('Lifecycle stage: Live → Renewal')).toBeInTheDocument();
    expect(screen.getByLabelText('Why')).toHaveTextContent('Renewal is in 21 days and the renewal task is open.');
    expect(screen.getByRole('link', { name: 'Renews 29 Oct' })).toHaveAttribute('href', '/organizations/7');
  });

  it('leaves out the evidence the server did not send', () => {
    render(
      <MemoryRouter>
        <AgentActionBody action={{ ...ACT_TASK_CREATE, evidence: [] }} />
      </MemoryRouter>,
    );
    expect(screen.queryByLabelText('Evidence')).toBeNull();
  });
});

describe('AgentActionDecision', () => {
  it('applies once and hands up the answer', async () => {
    const { spy } = stubAgents();
    const { onSettled } = mount();
    await userEvent.dblClick(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    expect(onSettled.mock.calls[0][1]).toBe('Applied: Move Pizza Hut to Renewal.');
    expect(sent(spy, 'POST', '/approve/')).toHaveLength(1);
  });

  it('rejects with an optional note, refusing one over 255 characters in the browser', async () => {
    const { spy } = stubAgents();
    const { onSettled } = mount();
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    const note = screen.getByLabelText('Why not? (optional)');
    await userEvent.click(note);
    await userEvent.paste('x'.repeat(256));
    await userEvent.click(screen.getByRole('button', { name: 'Reject it' }));
    expect(await screen.findByText('Keep the note under 255 characters.')).toBeInTheDocument();
    expect(note).toHaveAttribute('aria-invalid', 'true');
    await userEvent.clear(note);
    await userEvent.type(note, 'Not yet');
    await userEvent.click(screen.getByRole('button', { name: 'Reject it' }));
    await waitFor(() => expect(onSettled).toHaveBeenCalled());
    expect(sent(spy, 'POST', '/reject/')).toEqual([{ note: 'Not yet' }]);
  });

  it('leaves on 409 with the server detail, and stays on a 403 CANT_DECIDE', async () => {
    stubAgents({ refuseNextDecision: { status: 409, body: { code: 'ALREADY_DECIDED', detail: 'Mona Manager already applied this.' } } });
    const first = mount();
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(first.onGone).toHaveBeenCalledWith('Mona Manager already applied this.'));
  });

  it('shows a 403 at the buttons and asks the page to re-read', async () => {
    stubAgents({ mayDecide: false });
    const { onRefused, onGone } = mount();
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("You can't decide this action.");
    expect(onRefused).toHaveBeenCalled();
    expect(onGone).not.toHaveBeenCalled();
  });
});
```

Create `src/components/agents/UndoAction.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ACT_APPLIED_AUTO } from '../../features/agents/testAgentsFixtures';
import { stubAgents } from '../../features/agents/testAgents';
import { UndoAction } from './UndoAction';

afterEach(() => vi.unstubAllGlobals());

describe('UndoAction (Decision 11)', () => {
  it('undoes and hands up the answer', async () => {
    stubAgents();
    const onUndone = vi.fn();
    render(<UndoAction action={ACT_APPLIED_AUTO} onUndone={onUndone} />);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(onUndone).toHaveBeenCalled());
    expect(onUndone.mock.calls[0][0].status).toBe('undone');
    expect(onUndone.mock.calls[0][1]).toBe(`Undone: ${ACT_APPLIED_AUTO.title}.`);
  });

  it('catches up when someone else undid it first (409 ALREADY_DECIDED with the action)', async () => {
    const undone = { ...ACT_APPLIED_AUTO, status: 'undone' as const, undo: null, undone_by: { id: 2, name: 'Mona Manager' } };
    stubAgents({ refuseNextDecision: { status: 409, body: { code: 'ALREADY_DECIDED', detail: 'Mona Manager already undid this.', action: undone } } });
    const onUndone = vi.fn();
    render(<UndoAction action={ACT_APPLIED_AUTO} onUndone={onUndone} />);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(onUndone).toHaveBeenCalledWith(undone, 'Mona Manager already undid this.'));
  });

  it('shows CHANGED_SINCE in the server words with both values in DM Mono', async () => {
    stubAgents({ changedSince: [ACT_APPLIED_AUTO.id] });
    render(<UndoAction action={ACT_APPLIED_AUTO} onUndone={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Lifecycle stage has changed since: it is now Churn.');
    expect(alert).toHaveTextContent('Now: Churn · Agent set: Renewal');
    expect(alert.querySelectorAll('.font-mono-brand')).toHaveLength(2);
  });

  it('shows the reason instead of the button when Undo is not allowed', () => {
    render(<UndoAction action={{ ...ACT_APPLIED_AUTO, undo: { allowed: false, until: '2026-10-15T00:42:00Z', reason: 'expired' } }} onUndone={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.getByText('Undo was available for 7 days.')).toBeInTheDocument();
  });

  it('shows nothing for an action that is not applied', () => {
    const { container } = render(<UndoAction action={{ ...ACT_APPLIED_AUTO, status: 'rejected', undo: null }} onUndone={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/agents --maxWorkers=2`
Expected: FAIL, because the modules cannot be resolved.

- [ ] **Step 3: Implement the body**

Create `src/components/agents/AgentActionBody.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { AGENTS, previewText } from '../../features/agents/agentsText';
import type { AgentAction } from '../../features/agents/agentTypes';
import { Figured } from '../brain/Figured';
import { FOCUS } from '../organizations/portfolio/styles';
import { useTaskLink } from '../work/useTaskLink';

const EVIDENCE_LINK = `inline-flex min-h-11 items-center text-[13px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`;
const TASK_LINK = `inline-flex min-h-11 items-center font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`;

/** What an agent action does and why (spec §1.8; Decision 5): the preview
 *  (a task kind links its task, opening the panel over this page), the
 *  rationale, and the evidence when the server sent it. */
export function AgentActionBody({ action }: { action: AgentAction }) {
  const taskLink = useTaskLink();
  // task.create previews stay plain (their sentence does not start with the
  // title); Activity links the made task from its meta line instead.
  const taskId = action.kind === 'task.create' ? null : (action.preview.task?.id ?? null);
  return (
    <div className="flex flex-col gap-1">
      <p data-part="preview" className="text-[13px] text-ink">
        {taskId !== null && action.preview.task ? (
          <>
            <Link {...taskLink(taskId)} className={TASK_LINK}>
              {action.preview.task.title}
            </Link>
            {': '}
            <Figured text={previewText(action).slice(action.preview.task.title.length + 2)} />
          </>
        ) : (
          <Figured text={previewText(action)} />
        )}
      </p>
      {action.rationale ? (
        <p aria-label={AGENTS.WHY} className="max-w-[70ch] text-[13px] text-ink-muted">
          {action.rationale}
        </p>
      ) : null}
      {action.evidence.length > 0 ? (
        <ul aria-label={AGENTS.EVIDENCE} className="flex flex-wrap items-center gap-x-3">
          {action.evidence.map((item) => (
            <li key={`${item.link}:${item.label}`}>
              <Link to={item.link} className={EVIDENCE_LINK}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

`previewText` for every task kind except `task.create` starts with "<task title>: ", so the slice after the title is exact. `task.create` stays plain text, and Activity links the task it made from its meta line (Task 6).

- [ ] **Step 4: Implement the decision**

Create `src/components/agents/AgentActionDecision.tsx`:

```tsx
import { useEffect, useId, useRef, useState } from 'react';
import { approveAction, refusalCode, refusalDetail, rejectAction } from '../../features/agents/agentsApi';
import { AGENTS } from '../../features/agents/agentsText';
import type { AgentAction } from '../../features/agents/agentTypes';
import { ApiError } from '../../lib/apiClient';
import { BUTTON, FOCUS, QUIET } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { recommendationsChanged, taskChanged } from '../work/taskChanges';

const INPUT = `min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink sm:min-h-9 ${FOCUS}`;
const LONGEST = 255;

/** Apply, or Reject with an optional note, one agent action, sent once
 *  (contract approve/reject). 404, 409 ALREADY_DECIDED and 409 EXPIRED
 *  mean it was decided elsewhere or lapsed: it leaves, in the server's
 *  words. A 403 CANT_DECIDE stays at the buttons and the page re-reads. */
export function AgentActionDecision({
  action,
  onSettled,
  onGone,
  onRefused,
}: {
  action: AgentAction;
  onSettled: (answer: AgentAction, text: string) => void;
  onGone: (text: string) => void;
  onRefused?: () => void;
}) {
  const noteId = useId();
  const errorId = useId();
  const noteErrorId = useId();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const rejectRef = useRef<HTMLButtonElement>(null);
  const cancelled = useRef(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [pending, setPending] = useState<'apply' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const { busy, run } = useSubmitOnce({ holdOnSuccess: true });
  useEffect(() => {
    if (tick > 0) errorRef.current?.focus();
  }, [tick]);
  useEffect(() => {
    if (!rejecting && cancelled.current) {
      cancelled.current = false;
      rejectRef.current?.focus();
    }
  }, [rejecting]);

  async function decide(verb: 'apply' | 'reject') {
    if (verb === 'reject' && note.trim().length > LONGEST) {
      setNoteError(AGENTS.NOTE_TOO_LONG);
      return;
    }
    const outcome = await run(() => {
      setPending(verb);
      setError(null);
      return verb === 'apply' ? approveAction(action.id) : rejectAction(action.id, note.trim());
    });
    if (!outcome) return;
    if (outcome.ok) {
      recommendationsChanged();
      taskChanged();
      onSettled(outcome.value.action, `${verb === 'apply' ? 'Applied' : 'Rejected'}: ${action.title}.`);
      return;
    }
    setPending(null);
    const err = outcome.error;
    const code = refusalCode(err);
    if (err instanceof ApiError && err.status === 404) {
      recommendationsChanged();
      onGone(AGENTS.GONE);
    } else if (err instanceof ApiError && err.status === 409 && (code === 'ALREADY_DECIDED' || code === 'EXPIRED')) {
      recommendationsChanged();
      onGone(refusalDetail(err) ?? AGENTS.GONE);
    } else {
      setError(refusalDetail(err) ?? errorMessage(err, AGENTS.DECIDE_FAILED));
      setTick((n) => n + 1);
      if (code === 'CANT_DECIDE') onRefused?.();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p ref={errorRef} id={errorId} role="alert" tabIndex={-1} className={`text-[13px] text-danger ${FOCUS}`}>
          {error}
        </p>
      ) : null}
      {rejecting ? (
        <form
          noValidate
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void decide('reject');
          }}
        >
          <label htmlFor={noteId} className="text-[11px] font-semibold text-ink-muted">
            {AGENTS.WHY_NOT}
          </label>
          <input
            id={noteId}
            value={note}
            aria-invalid={Boolean(noteError)}
            aria-describedby={noteError ? noteErrorId : undefined}
            onChange={(event) => {
              setNote(event.target.value);
              setNoteError(null);
            }}
            className={INPUT}
            autoFocus
          />
          {noteError ? (
            <p id={noteErrorId} role="alert" className="text-[11px] text-danger">
              {noteError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} aria-describedby={error ? errorId : undefined} className={BUTTON}>
              {pending === 'reject' ? AGENTS.WORKING : AGENTS.REJECT_IT}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                cancelled.current = true;
                setRejecting(false);
              }}
              className={QUIET}
            >
              {AGENTS.CANCEL}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void decide('apply')} aria-describedby={error ? errorId : undefined} className={BUTTON}>
            {pending === 'apply' ? AGENTS.WORKING : AGENTS.APPLY}
          </button>
          <button ref={rejectRef} type="button" disabled={busy} onClick={() => setRejecting(true)} className={QUIET}>
            {AGENTS.REJECT}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Implement Undo**

Create `src/components/agents/UndoAction.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { refusalBody, refusalCode, refusalDetail, undoAction } from '../../features/agents/agentsApi';
import { AGENTS, undoReasonText } from '../../features/agents/agentsText';
import type { AgentAction } from '../../features/agents/agentTypes';
import { FOCUS, MONO, QUIET } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { taskChanged } from '../work/taskChanges';

interface Refused {
  text: string;
  current: string | null;
  applied: string | null;
}

/** Undo for 7 days (spec §1.5; Decision 11): shown while `undo` is set; the
 *  reason instead of the button when it is not allowed; every refusal stays
 *  here in the server's words, CHANGED_SINCE with both values. */
export function UndoAction({ action, onUndone }: { action: AgentAction; onUndone: (answer: AgentAction, text: string) => void }) {
  const [refused, setRefused] = useState<Refused | null>(null);
  const [tick, setTick] = useState(0);
  const alertRef = useRef<HTMLDivElement>(null);
  const { busy, run } = useSubmitOnce({ holdOnSuccess: true });
  useEffect(() => {
    if (tick > 0) alertRef.current?.focus();
  }, [tick]);
  if (!action.undo) return null;
  if (!action.undo.allowed) {
    return <p className="text-[11px] text-ink-muted">{action.undo.reason ? undoReasonText(action.undo.reason) : null}</p>;
  }

  async function undo() {
    setRefused(null);
    const outcome = await run(() => undoAction(action.id));
    if (!outcome) return;
    if (outcome.ok) {
      taskChanged();
      onUndone(outcome.value.action, `Undone: ${outcome.value.action.title}.`);
      return;
    }
    const err = outcome.error;
    const body = refusalBody(err);
    // Someone else undid it first: the row catches up, in the server's words.
    if (refusalCode(err) === 'ALREADY_DECIDED' && body && typeof body.action === 'object' && body.action !== null) {
      onUndone(body.action as AgentAction, refusalDetail(err) ?? AGENTS.UNDO_FAILED);
      return;
    }
    const changed = refusalCode(err) === 'CHANGED_SINCE' && body;
    setRefused({
      text: refusalDetail(err) ?? errorMessage(err, AGENTS.UNDO_FAILED),
      current: changed && typeof body.current === 'string' ? body.current : null,
      applied: changed && typeof body.applied === 'string' ? body.applied : null,
    });
    setTick((n) => n + 1);
  }

  return (
    <div className="flex flex-col gap-1">
      <button type="button" disabled={busy} onClick={() => void undo()} className={`${QUIET} self-start`}>
        {busy ? AGENTS.UNDOING : AGENTS.UNDO}
      </button>
      {refused ? (
        <div ref={alertRef} role="alert" tabIndex={-1} className={`flex flex-col gap-0.5 text-[13px] text-danger ${FOCUS}`}>
          <p>{refused.text}</p>
          {refused.current !== null && refused.applied !== null ? (
            <p className="text-[11px] text-ink-muted">
              Now: <span className={MONO}>{refused.current}</span> · Agent set: <span className={MONO}>{refused.applied}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

`changedSinceText` (Task 2) is the plain-text form of the same line, for any reader that needs it as a string. The component builds it as JSX so each value sits in its own `MONO` span.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/components/agents --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/agents/AgentActionBody.tsx src/components/agents/AgentActionDecision.tsx src/components/agents/UndoAction.tsx src/components/agents/AgentActionDecision.test.tsx src/components/agents/UndoAction.test.tsx
git commit -m "feat(agents): the action body, Apply and Reject, and Undo

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Work › Recommended renders agent actions

**Files:**
- Modify: `src/features/work/workTypes.ts`
  - Near line 149 (`RecKind` and `REC_KINDS`): add `RecRowKind`.
  - In the `RecommendationRow` interface (near line 176): `kind`, `defaults` and `agent_action`.
- Modify: `src/features/work/recommended.ts`: `KIND_LABEL` and the `RecKind` import.
- Modify: `src/features/work/testWorkFixtures.ts`: `REC_AGENT`, a new `REC_AGENT_LIFECYCLE`, and `RECOMMENDATIONS`.
- Modify: `src/components/work/RecommendationCard.tsx`
- Test: `src/pages/work/Recommended.test.tsx` (add cases); `src/features/work/recommended.test.ts` (KIND_LABEL)

**Interfaces:**
- **Consumes:**
  - Task 1: `AgentAction`, plus `ACT_LIFECYCLE` and `ACT_TASK_CREATE`;
  - Task 3: `AgentActionBody` and `AgentActionDecision`.
- **Produces:**
  - the type `RecRowKind`;
  - `RecommendationRow.agent_action: AgentAction | null`;
  - `RecommendationRow.defaults: RecDefaults | null`.

- [ ] **Step 1: Write the failing tests**

Add to `src/pages/work/Recommended.test.tsx`, in a new `describe`. Keep the file's existing imports, and add `stubAgents` from `'../../features/agents/testAgents'` and `REC_AGENT_LIFECYCLE` from `'../../features/work/testWorkFixtures'`:

```tsx
describe('Recommended: agent actions (Agents delivery 1, Decisions 3 and 12)', () => {
  it('shows a lifecycle change with Apply and Reject; Apply settles it and the row leaves', async () => {
    const agents = stubAgents();
    const work = stubWork({ recommendations: [REC_AGENT_LIFECYCLE], passThrough: agents.spy });
    agents.onSettle(() => work.recommendations.clear());
    renderWork('/work/recommended');
    const card = await screen.findByRole('article', { name: 'Move Pizza Hut to Renewal' });
    expect(within(card).getByText('CS agent')).toBeInTheDocument();
    expect(within(card).queryByText(/priority/)).toBeNull();
    expect(within(card).getByText('Lifecycle stage: Live → Renewal')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Assign' })).toBeNull();
    await userEvent.click(within(card).getByRole('button', { name: 'Apply' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Applied: Move Pizza Hut to Renewal.');
    expect(screen.queryByRole('article', { name: 'Move Pizza Hut to Renewal' })).toBeNull();
  });

  it('keeps Assign and Dismiss for an agent task (task.create)', async () => {
    stubWork();
    renderWork('/work/recommended');
    const card = await screen.findByRole('article', { name: 'Call Pizza Hut about the renewal' });
    expect(within(card).getByRole('button', { name: 'Assign' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    expect(within(card).getByText('CS agent')).toBeInTheDocument();
  });
});
```

In `src/features/work/recommended.test.ts`, change any `KIND_LABEL.agent` expectation to `KIND_LABEL.agent_action`, with the value `'AI agent'`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/work/Recommended.test.tsx src/features/work/recommended.test.ts --maxWorkers=2`
Expected: FAIL, because `REC_AGENT_LIFECYCLE` is not exported and the card has no Apply button.

- [ ] **Step 3: The types**

In `src/features/work/workTypes.ts`, after the `REC_KINDS` line, add:

```ts
/** A row's kind: the settings sources' kinds with the AI agent's renamed
 *  `agent_action` (Agents delivery 1 contract; `sources.agent` is unchanged). */
export type RecRowKind = Exclude<RecKind, 'agent'> | 'agent_action';
```

Add `import type { AgentAction } from '../agents/agentTypes';` at the top. In `RecommendationRow`, replace:

```ts
  kind: RecKind;
```

with `kind: RecRowKind;`. Replace:

```ts
  defaults: RecDefaults;
  /** The AI agent's proposal id for `kind: 'agent'`. */
  proposal: number | null;
```

with:

```ts
  /** Null for an agent action that is not `task.create` (nothing to prefill). */
  defaults: RecDefaults | null;
  /** The agent action, written for the reader, for `kind: 'agent_action'`. */
  agent_action: AgentAction | null;
```

- [ ] **Step 4: The labels and the fixtures**

In `src/features/work/recommended.ts`:
- Import `RecRowKind` in place of `RecKind`.
- Make `KIND_LABEL: Record<RecRowKind, string>`, with `agent_action: 'AI agent'` in place of `agent: 'AI agent'`.
- Add, after `KIND_LABEL`:

```ts
/** The meta line's kind: the agent's name for an agent action (Decision 12). */
export function recKindText(rec: RecommendationRow): string {
  return rec.kind === 'agent_action' && rec.agent_action ? AGENT_LABEL[rec.agent_action.agent] : KIND_LABEL[rec.kind];
}
```

Then add `import { AGENT_LABEL } from '../agents/agentsText';` and the `RecommendationRow` import.

In `src/features/work/testWorkFixtures.ts`, replace the `REC_AGENT` row's `kind: 'agent'` and `proposal: 22` with:

```ts
  kind: 'agent_action',
  title: 'Call Pizza Hut about the renewal',
  why: { facts: [], evidence: [] },
  agent_action: { ...ACT_TASK_CREATE, id: 22 },
```

- In `recRow`'s default (near line 133), replace `proposal: null,` with `agent_action: null,`.
- Add `import { ACT_LIFECYCLE, ACT_TASK_CREATE } from '../agents/testAgentsFixtures';`.
- After `REC_AGENT`, add:

```ts
/** The CS agent's lifecycle change on Pizza Hut, in Alice's queue: Apply or Reject (no defaults). */
export const REC_AGENT_LIFECYCLE: RecommendationRow = recRow({
  id: 6,
  kind: 'agent_action',
  title: 'Move Pizza Hut to Renewal',
  why: { facts: [], evidence: [] },
  defaults: null,
  suggested_assignee: null,
  agent_action: ACT_LIFECYCLE,
});
```

`recRow` already takes overrides. If its parameter type is not `Partial<RecommendationRow>`, widen it to that.

Keep `RECOMMENDATIONS = [REC_RENEWAL, REC_TICKETS, REC_AGENT]`. Grep for `proposal:` and `'agent'` in `src/features/work/*.test.ts*` and `src/pages/work/*.test.tsx`, and update each to `agent_action` the same way.

- [ ] **Step 5: The card**

In `src/components/work/RecommendationCard.tsx`:
- Import `AgentActionBody` and `AgentActionDecision` from `'../agents/...'`, and `recKindText` from `recommended`.
- Above the `return`, compute:

```tsx
  const agentAction = rec.kind === 'agent_action' ? rec.agent_action : null;
  const decidesDirectly = agentAction !== null && agentAction.kind !== 'task.create';
```

In the meta line:
- Replace `<span>{KIND_LABEL[rec.kind]}</span>` with `<span>{recKindText(rec)}</span>`.
- Wrap the priority and suggested parts so they render only when there are defaults:

```tsx
          {rec.defaults ? (
            <>
              <Dot />
              <span>{PRIORITY_LABEL[rec.defaults.priority]} priority</span>
              <Dot />
              <span>{suggestedText(rec, me)}</span>
            </>
          ) : null}
```

After the meta line:
- When `agentAction` is set, render `<AgentActionBody action={agentAction} />` in place of the facts list and the evidence list (the contract sends `why` empty for these rows; the action carries its own rationale and evidence). Keep both lists for every other kind.
- Replace the Assign/Dismiss block with:

```tsx
        {decidesDirectly && agentAction ? (
          <AgentActionDecision
            action={agentAction}
            onSettled={(_answer, text) => onSettled(rec, text, null)}
            onGone={(text) => onSettled(rec, text, null)}
            onRefused={onRefused}
          />
        ) : (
          <div className="flex flex-wrap gap-2">{/* the existing Assign and Dismiss buttons, unchanged */}</div>
        )}
```

Here "the existing Assign and Dismiss buttons" means move the two `<button>` elements as they are today into that `div`. Keep the `mode` forms below unchanged.

Remove the now-unused `KIND_LABEL` import if lint flags it. `AssignForm` reads `rec.defaults`: give it `rec.defaults!`, since Assign only shows when `decidesDirectly` is false, and a `task.create` row always has defaults (contract).

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/pages/work src/features/work src/components/work --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Lint, build, commit**

```bash
git add src/features/work/workTypes.ts src/features/work/recommended.ts src/features/work/recommended.test.ts src/features/work/testWorkFixtures.ts src/components/work/RecommendationCard.tsx src/pages/work/Recommended.test.tsx
git commit -m "feat(work): Recommended decides agent actions with Apply and Reject

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Also add any other test file you touched in Step 4.

---

### Task 5: Brain › Waiting renders agent actions; Ask the agent runs Ops

**Files:**
- Modify: `src/features/brain/brainTypes.ts` (lines 134–135 and 190–213)
- Modify: `src/features/brain/waitingText.ts`
- Modify: `src/features/brain/brainApi.ts` (remove `decideProposal` and `askAgent`)
- Modify: `src/features/brain/testWaitingFixtures.ts`, `src/features/brain/testBrain.ts`
- Modify: `src/components/brain/WaitingRow.tsx`
- Delete: `src/components/brain/ProposalDecision.tsx`
- Modify: `src/pages/brain/Waiting.tsx`
- Test: `src/components/brain/WaitingRow.test.tsx`, `src/features/brain/waitingText.test.ts`, `src/pages/brain/Waiting.test.tsx` (wherever Ask the agent is tested: `grep -rln "Ask the agent" src`)

**Interfaces:**
- **Consumes:**
  - Task 1: `runAgent`, `refusalDetail` and `AgentAction`;
  - Task 2: `waitingKindLabel` and `runAnswerText`;
  - Task 3: `AgentActionBody` and `AgentActionDecision`.
- **Produces:**
  - `WaitingKind` with `agent_action` in place of `proposal`;
  - `AgentActionItem`, whose `detail` is `AgentAction & { session: { id: number; title: string } | null }`.

- [ ] **Step 1: Write the failing tests**

In `src/components/brain/WaitingRow.test.tsx`:
- Replace every use of the proposal fixtures with `CS_LIFECYCLE_ITEM` (defined in Step 3).
- Replace the approve/reject tests with:

```tsx
  it('shows an agent action with Apply and Reject when the reader may decide it', async () => {
    const onGone = vi.fn();
    stubAgents();
    renderRow(CS_LIFECYCLE_ITEM, { onGone });
    expect(screen.getByText('CS agent · Change lifecycle stage')).toBeInTheDocument();
    expect(screen.getByText('Lifecycle stage: Live → Renewal')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onGone).toHaveBeenCalledWith(CS_LIFECYCLE_ITEM, 'Applied: Move Pizza Hut to Renewal.'));
  });

  it('says who decides when the reader may not', () => {
    renderRow({ ...CS_LIFECYCLE_ITEM, can_decide: false });
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
    expect(screen.getByText('Waiting on Carl CSM to decide')).toBeInTheDocument();
  });
```

Use the file's existing render helper (`renderRow`, or whatever the file calls it), and add the import `stubAgents` from `'../../features/agents/testAgents'`.

In `src/features/brain/waitingText.test.ts`:
- Replace the `TASK_PROPOSAL` fixture and its `kindLabel` and `proposalActionText` cases with one case: `kindLabel(CS_LIFECYCLE_ITEM)` is `'CS agent · Change lifecycle stage'`.
- Replace the `KIND_CHIPS` expectation's `{ key: 'proposal', label: 'Proposals' }` with `{ key: 'agent_action', label: 'Agent actions' }`.

In the Waiting page test that covers Ask the agent:
- Make the stub answer `POST /agents/ops/run/`, either through `testBrain.ts` (Step 3) or `stubAgents({ passThrough })` in front of `stubBrain`.
- Assert:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Ask the agent' }));
    expect(await screen.findByText('The Ops agent ran: 3 proposed, 1 applied.')).toBeInTheDocument();
```

Add a refusal case: the stub's next run answers `409 { code: 'AI_OFF', detail: 'AI is switched off for this workspace.' }`, and the alert reads that sentence.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/brain src/features/brain src/pages/brain --maxWorkers=2`
Expected: FAIL.

- [ ] **Step 3: Types, words, API and fixtures**

In `src/features/brain/brainTypes.ts`, replace the two `WaitingKind` lines with:

```ts
export type WaitingKind = 'rule_review' | 'agent_action' | 'question' | 'overdue_task';
export const WAITING_KINDS: readonly WaitingKind[] = ['rule_review', 'agent_action', 'question', 'overdue_task'];
```

Replace the `ProposalItem` interface with:

```ts
/** An agent action waiting on a decision (Agents delivery 1 contract):
 *  `detail` is the AgentAction written for the reader, plus the closed
 *  Copilot session it came from, if any. */
export interface AgentActionItem extends WaitingBase {
  kind: 'agent_action';
  record: WaitingRecord | null;
  detail: AgentAction & { session: { id: number; title: string } | null };
}
```

- Change the union to `RuleReviewItem | AgentActionItem | QuestionItem | OverdueTaskItem`.
- Add `import type { AgentAction } from '../agents/agentTypes';`.
- Drop the `TaskAction` and `InitiativeAction` import if nothing else in the file uses it (check with grep).

In `src/features/brain/waitingText.ts`:
- Replace `{ key: 'proposal', label: 'Proposals' }` with `{ key: 'agent_action', label: 'Agent actions' }`.
- Replace the proposal line in `kindLabel` with `if (item.kind === 'agent_action') return waitingKindLabel(item.detail);` and import `waitingKindLabel` from `'../agents/agentsText'`.
- Delete `proposalActionText`, along with its `TaskAction`, `InitiativeAction` and `ProposalItem` imports.
- Change `ASK_HINT` to `'Runs the Ops agent now. Uses AI credits.'` and `ASK_FAILED` to `'Could not run the Ops agent.'`.

In `src/features/brain/brainApi.ts`:
- Delete `decideProposal` and `askAgent`, and the `Proposal` import.
- Grep for both names. Only `ProposalDecision.tsx` and `Waiting.tsx` use them, and those are replaced in this task.

In `src/features/brain/testWaitingFixtures.ts`:
- Replace `CARL_TASK_PROPOSAL`, `SESSION_PROPOSAL`, `INITIATIVE_PROPOSAL`, `GENERATED_PROPOSAL` and `SESSION_PROPOSAL_WITH_EVIDENCE` with `agent_action` items built from the agents fixtures:

```ts
import { ACT_INITIATIVE, ACT_LIFECYCLE, ACT_TASK_CREATE } from '../agents/testAgentsFixtures';

export const CS_LIFECYCLE_ITEM: AgentActionItem = {
  kind: 'agent_action', id: 81, title: 'Move Pizza Hut to Renewal', since: '2026-10-01T09:00:00Z',
  waiting_on: { id: 3, name: 'Carl CSM' }, can_decide: true, record: { type: 'customer', id: 7, name: 'Pizza Hut' },
  detail: { ...ACT_LIFECYCLE, session: null },
};
export const SESSION_TASK_ITEM: AgentActionItem = {
  kind: 'agent_action', id: 23, title: 'Book the Uber exec sponsor call', since: '2026-10-02T10:00:00Z',
  waiting_on: { id: 2, name: 'Mona Manager' }, can_decide: true, record: { type: 'account', id: 9, name: 'Uber EMEA' },
  detail: { ...ACT_TASK_CREATE, id: 23, title: 'Book the Uber exec sponsor call', agent: 'ops', session: { id: 4, title: 'Why this account is at risk?' } },
};
export const OPS_INITIATIVE_ITEM: AgentActionItem = {
  kind: 'agent_action', id: 85, title: 'Cut Analytics Suite risk', since: '2026-09-30T18:00:00Z',
  waiting_on: null, can_decide: true, record: null, detail: { ...ACT_INITIATIVE, session: null },
};
```

Every test that imported an old proposal fixture switches to the nearest of these three. Keep the old fixtures' `since` and `waiting_on` where a test relies on its order or person. Every `counts` object (fixtures, `testBrain.ts`, and `WaitingDesk`'s chip counts, which index `counts[chip.key]`) changes its `proposal` key to `agent_action`; `Record<WaitingKind, number>` makes the compiler find each one.

In `src/features/brain/testBrain.ts`:
- Replace the `/metrics/proposals/<id>/<decision>/` handler with the `/agents/actions/<id>/(approve|reject)/` route, using the same 404, 403 and 409 behaviour. A 409 detail reads `'Mona Manager already applied this.'`.
- Replace `/metrics/proposals/generate/` with `POST /agents/ops/run/`. It answers `CARDS[2]` with `enabled: true` and `last_run` set to `{ at: '2026-10-08T09:20:00Z', proposed: 3, applied: 1, dropped: 0, skipped_reason: null }`, or the stub option `refuseNextRun`.
- Rename `decide`'s `'proposal'` kind to `'agent_action'`.

- [ ] **Step 4: The row and the page**

In `src/components/brain/WaitingRow.tsx`:
- Replace `ProposalItem` with `AgentActionItem` in the imports.
- Replace `{item.kind === 'proposal' ? <ProposalBody .../> : null}` with `{item.kind === 'agent_action' ? <AgentActionItemBody item={item} onGone={onGone} /> : null}`.
- Replace `ProposalBody` with:

```tsx
function AgentActionItemBody({ item, onGone }: { item: AgentActionItem; onGone: Gone }) {
  const d = item.detail;
  return (
    <>
      <AgentActionBody action={d} />
      {d.session ? (
        <p className="text-[11px] text-ink-muted">
          {WAIT.FROM_SESSION}{' '}
          <Link to="/copilot" className={LINK}>
            {d.session.title}
          </Link>
        </p>
      ) : null}
      {item.can_decide ? (
        <AgentActionDecision action={d} onSettled={(_answer, text) => onGone(item, text)} onGone={(text) => onGone(item, text)} />
      ) : (
        <p className={NOTE}>{notYoursText(item)}</p>
      )}
    </>
  );
}
```

- Remove `proposalActionText` from the `waitingText` imports.
- Delete `src/components/brain/ProposalDecision.tsx`.

In `src/pages/brain/Waiting.tsx`:
- Import `runAgent` and `refusalDetail` from `'../../features/agents/agentsApi'` and `runAnswerText` from `'../../features/agents/agentsText'`. Remove `askAgent`.
- Replace `askTheAgent` with:

```tsx
  async function askTheAgent() {
    setAskError(null);
    const outcome = await runAsk(() => runAgent('ops'));
    if (!outcome) return;
    if (outcome.ok) {
      if (scope) setStatus({ scope, text: runAnswerText(outcome.value) });
      waiting.retry();
      refreshWaitingCount();
    } else setAskError(refusalDetail(outcome.error) ?? errorMessage(outcome.error, WAIT.ASK_FAILED));
  }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/components/brain src/features/brain src/pages/brain src/e2e/brain.test.tsx --maxWorkers=2`
Expected: PASS. If `src/e2e/brain.test.tsx` names proposals, update it to the `agent_action` fixtures and the new words.

- [ ] **Step 6: Lint, build, commit**

```bash
git add src/features/brain/brainTypes.ts src/features/brain/waitingText.ts src/features/brain/waitingText.test.ts src/features/brain/brainApi.ts src/features/brain/testWaitingFixtures.ts src/features/brain/testBrain.ts src/components/brain/WaitingRow.tsx src/components/brain/WaitingRow.test.tsx src/pages/brain/Waiting.tsx
git rm src/components/brain/ProposalDecision.tsx
git commit -m "feat(brain): Waiting decides agent actions; Ask the agent runs the Ops agent

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Also add the page test file and `src/e2e/brain.test.tsx` if you touched them.

---

### Task 6: Work › Activity

**Files:**
- Modify: `src/features/work/workTabs.ts` (`WORK_TABS`), `src/features/work/workTabs.test.ts`
- Modify: `src/pages/work/WorkRoutes.tsx`
- Create: `src/components/agents/ActivityRow.tsx` (its `onUndone` is `(answer, text)`, passed straight to `UndoAction`)
- Create: `src/components/agents/ActivitySkeleton.tsx`
- Create: `src/pages/work/Activity.tsx`
- Test: `src/pages/work/Activity.test.tsx`

**Interfaces:**
- **Consumes:**
  - Task 1: `fetchActivity`, `fetchAction` and `ActivityPayload`;
  - Task 2: `AGENTS`, `AGENT_LABEL`, `KIND_LABEL`, `STATUS_LABEL`, `statusText`, `filtersOf`, `filtersParams` and `hiddenActivityText`;
  - Task 3: `AgentActionBody` and `UndoAction`;
  - `WorkFrame`, `EmptyState`, `ErrorBlock`, `LIST`, `SECTION_TITLE`, `LINK`, `FILTER_SELECT` (`components/organizations/portfolio/styles`), `BUTTON`, `MONO` and `FOCUS`;
  - `useTaskLink` and `useTaskChanges`.
- **Produces:**
  - `ActivityPage()` at `/work/activity`;
  - the tab `{ path: '/work/activity', label: 'Activity' }`.

- [ ] **Step 1: Write the failing tests**

In `src/features/work/workTabs.test.ts`, add:

```ts
  it('puts Activity after Recommended for everyone (Agents Decision 1)', () => {
    expect(workTabsFor({ team: false, recommended: false }).map((t) => t.label)).toEqual(['Today', 'Activity']);
    expect(workTabsFor({ team: true, recommended: true }).map((t) => t.label)).toEqual(['Today', 'Recommended', 'Activity', 'Team']);
  });
```

Create `src/pages/work/Activity.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ACT_APPLIED_AUTO } from '../../features/agents/testAgentsFixtures';
import { calls, stubAgents } from '../../features/agents/testAgents';
import { stubWork } from '../../features/work/testWork';
import { resetViewport } from '../../test/viewport';
import { renderWork, where } from './testPages';

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
});

const stubBoth = (options: Parameters<typeof stubAgents>[0] = {}) => {
  const agents = stubAgents(options);
  stubWork({ passThrough: agents.spy });
  return agents;
};

describe('Work › Activity (spec §1.8; Decisions 1, 2, 4, 5, 11)', () => {
  it('lists every agent action newest first with status, agent and preview', async () => {
    stubBoth();
    renderWork('/work/activity');
    const list = await screen.findByRole('list', { name: 'Agent actions' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(within(rows[2]).getByText('Applied automatically')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Sales agent')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Undone by you')).toBeInTheDocument();
  });

  it('filters by agent and status through the URL', async () => {
    const { spy } = stubBoth();
    renderWork('/work/activity');
    await screen.findByRole('list', { name: 'Agent actions' });
    await userEvent.selectOptions(screen.getByLabelText('Agent'), 'cs');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'proposed');
    await waitFor(() => expect(where()).toBe('/work/activity?agent=cs&status=proposed'));
    expect(calls(spy, 'GET', '/agents/actions/')).toContain('/agents/actions/?agent=cs&status=proposed');
    expect(within(await screen.findByRole('list', { name: 'Agent actions' })).getAllByRole('listitem')).toHaveLength(2);
  });

  it('undoes an applied action and says so in the status line', async () => {
    stubBoth();
    renderWork('/work/activity');
    const row = (await screen.findAllByRole('listitem')).find((li) => li.textContent?.includes(ACT_APPLIED_AUTO.title))!;
    await userEvent.click(within(row).getByRole('button', { name: 'Undo' }));
    const status = await screen.findByRole('status', { name: '' });
    expect(status).toHaveTextContent(`Undone: ${ACT_APPLIED_AUTO.title}.`);
    expect(await within(row).findByText('Undone by you')).toBeInTheDocument();
  });

  it('fetches the bell-linked action and shows it first, focused, whatever page it is on (Decision 2)', async () => {
    const { spy } = stubBoth();
    renderWork(`/work/activity?action=${ACT_APPLIED_AUTO.id}`);
    const linked = await screen.findByRole('region', { name: 'Linked action' });
    expect(within(linked).getByRole('article', { name: ACT_APPLIED_AUTO.title })).toBeInTheDocument();
    expect(calls(spy, 'GET', `/agents/actions/${ACT_APPLIED_AUTO.id}/`)).toHaveLength(1);
    await waitFor(() => expect(document.activeElement).toBe(linked.querySelector('[data-action]')));
    const list = await screen.findByRole('list', { name: 'Agent actions' });
    expect(within(list).queryByRole('article', { name: ACT_APPLIED_AUTO.title })).toBeNull();
  });

  it('says so when the linked action is gone or on a record the reader cannot open', async () => {
    stubBoth();
    renderWork('/work/activity?action=999');
    expect(await screen.findByText("That action isn't there any more, or it's on a record you can't open.")).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Agent actions' })).toBeInTheDocument();
  });

  it('opens the task panel from a task kind (Decision 5)', async () => {
    stubBoth();
    renderWork('/work/activity');
    await userEvent.click(await screen.findByRole('link', { name: 'Send the QBR deck' }));
    await waitFor(() => expect(where()).toBe('/work/activity?task=42'));
  });

  it('counts what the reader cannot open, and shows the empty and filtered-empty states', async () => {
    stubBoth({ hidden: 2, actions: [] });
    renderWork('/work/activity');
    expect(await screen.findByText('No agent actions yet')).toBeInTheDocument();
    expect(screen.getByText("2 more about records you can't open")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('shows the filtered empty state with Clear filters', async () => {
    stubBoth();
    renderWork('/work/activity?agent=ops&status=undone');
    expect(await screen.findByText('Nothing matches these filters')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute('href', '/work/activity');
  });

  it('shows a skeleton, then Try again after a failed read', async () => {
    stubBoth({ failActivity: 1 });
    renderWork('/work/activity');
    expect(screen.getByRole('status', { name: 'Loading agent activity' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Agent actions' })).toBeInTheDocument();
  });

  it('keeps every target at 44px on a phone', async () => {
    stubBoth();
    renderWork('/work/activity', { width: 390 });
    await screen.findByRole('list', { name: 'Agent actions' });
    for (const control of [...screen.getAllByRole('combobox'), ...screen.getAllByRole('button', { name: 'Undo' })]) {
      expect(control.className).toMatch(/min-h-11|FILTER|h-11/);
    }
  });
});
```

The phone-width assertion matches the class names, because `FILTER_SELECT` and `QUIET` both include `min-h-11`. If the house constants differ, assert on `min-h-11` directly.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/work/Activity.test.tsx src/features/work/workTabs.test.ts --maxWorkers=2`
Expected: FAIL.

- [ ] **Step 3: The tab and the route**

In `src/features/work/workTabs.ts`, make `WORK_TABS`:

```ts
export const WORK_TABS: readonly WorkTab[] = [
  { path: '/work/today', label: 'Today' },
  { path: '/work/recommended', label: 'Recommended', recommended: true },
  { path: '/work/activity', label: 'Activity' },
  { path: '/work/team', label: 'Team', team: true },
];
```

In `src/pages/work/WorkRoutes.tsx`, add `import { ActivityPage } from './Activity';` and, after the recommended route, `<Route path="activity" element={<ActivityPage />} />`. Update its doc comment to "Today, Recommended, Activity and Team".

- [ ] **Step 4: The row and the skeleton**

Create `src/components/agents/ActivitySkeleton.tsx`:

```tsx
import { AGENTS } from '../../features/agents/agentsText';

/** Activity loading (Decision 4): three row shapes, one status. */
export function ActivitySkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label={AGENTS.ACTIVITY_LOADING} className="flex flex-col gap-2">
      <span className="sr-only">Loading…</span>
      {[0, 1, 2].map((n) => (
        <div key={n} className="h-20 animate-pulse rounded-xl bg-subtle" />
      ))}
    </div>
  );
}
```

Create `src/components/agents/ActivityRow.tsx`:

```tsx
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { AGENT_LABEL, statusText } from '../../features/agents/agentsText';
import type { AgentAction } from '../../features/agents/agentTypes';
import { recordHref } from '../../features/segments/segmentFields';
import { formatDate } from '../../features/customers/formatters';
import { FOCUS, MONO } from '../organizations/portfolio/styles';
import { useTaskLink } from '../work/useTaskLink';
import { AgentActionBody } from './AgentActionBody';
import { UndoAction } from './UndoAction';

const META_LINK = `inline-flex min-h-11 items-center font-semibold text-ink-muted hover:text-ink hover:underline sm:min-h-0 ${FOCUS}`;

function Dot() {
  return <span aria-hidden="true"> · </span>;
}

/** One agent action in Activity (spec §1.8): the title, a meta line (agent,
 *  record, status, when), the body, and Undo while it may. `focus` marks
 *  the row the bell linked to (Decision 2). */
export function ActivityRow({
  action,
  me,
  focus,
  onUndone,
}: {
  action: AgentAction;
  me: number | null;
  focus: boolean;
  onUndone: (answer: AgentAction, text: string) => void;
}) {
  const titleId = useId();
  const taskLink = useTaskLink();
  const when = (action.undone_at ?? action.applied_at ?? action.decided_at ?? action.created_at).slice(0, 10);
  const createdTask = action.kind === 'task.create' ? action.result.task_id : null;
  return (
    <li data-action={action.id} tabIndex={focus ? -1 : undefined} className={`px-4 py-3 ${FOCUS}`}>
      <article aria-labelledby={titleId} className="flex flex-col gap-2">
        <h3 id={titleId} className="text-[13px] font-semibold text-ink">
          {action.title}
        </h3>
        <p data-part="meta" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-muted">
          <span>{AGENT_LABEL[action.agent]}</span>
          {action.record ? (
            <>
              <Dot />
              <Link to={recordHref(action.record.kind, action.record.id)} className={META_LINK}>
                {action.record.name}
              </Link>
            </>
          ) : null}
          <Dot />
          <span>{statusText(action, me)}</span>
          <Dot />
          <span className={MONO}>{formatDate(when)}</span>
          {createdTask !== null ? (
            <>
              <Dot />
              <Link {...taskLink(createdTask)} className={META_LINK}>
                Open task
              </Link>
            </>
          ) : null}
        </p>
        <AgentActionBody action={action} />
        <UndoAction action={action} onUndone={onUndone} />
      </article>
    </li>
  );
}
```

`recordHref(type, id)` already exists in `src/features/segments/segmentFields.ts` and is used by Waiting. It takes `'customer' | 'account'`.

- [ ] **Step 5: The page**

Create `src/pages/work/Activity.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ActivityRow } from '../../components/agents/ActivityRow';
import { ActivitySkeleton } from '../../components/agents/ActivitySkeleton';
import { LINK, LIST, SECTION_TITLE } from '../../components/brain/styles';
import { EmptyState, ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { BUTTON, FILTER_SELECT, FOCUS, MONO } from '../../components/organizations/portfolio/styles';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { useTaskChanges } from '../../components/work/taskChanges';
import { WorkFrame } from '../../components/work/WorkFrame';
import { fetchAction, fetchActivity } from '../../features/agents/agentsApi';
import { AGENTS, AGENT_LABEL, KIND_LABEL, STATUS_LABEL, filtersOf, filtersParams, hiddenActivityText } from '../../features/agents/agentsText';
import { ACTION_KINDS, ACTION_STATUSES, AGENT_KINDS, type ActivityFilters, type ActivityPayload, type AgentAction } from '../../features/agents/agentTypes';
import { useAppSelector } from '../../hooks';

const TITLE_ID = 'work-activity-title';
const LINKED_ID = 'work-activity-linked';
const LINK_GONE = "That action isn't there any more, or it's on a record you can't open.";

/** /work/activity (spec §1.8; Decisions 1, 2, 4, 11): every agent action
 *  the reader may open, newest first, filtered in the URL, 50 a page, with
 *  Undo for 7 days. What they cannot open is counted, never named. */
export function ActivityPage() {
  const [params, setParams] = useSearchParams();
  const filters = filtersOf(params);
  const key = filtersParams(filters, new URLSearchParams()).toString();
  const focusId = Number(params.get('action')) || null;
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<{ key: string; data: ActivityPayload } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [status, setStatus] = useState('');
  const statusRef = useRef<HTMLParagraphElement>(null);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  useTaskChanges(reload);

  useEffect(() => {
    let alive = true;
    fetchActivity(filtersOf(new URLSearchParams(key))).then(
      (data) => {
        if (!alive) return;
        setAnswer({ key, data });
        setFailure(null);
      },
      (err: unknown) => {
        if (alive) setFailure({ key, message: errorMessage(err, AGENTS.ACTIVITY_LOAD) });
      },
    );
    return () => {
      alive = false;
    };
  }, [key, attempt]);

  const data = answer && answer.key === key ? answer.data : null;
  const error = failure && failure.key === key ? failure.message : null;

  // The bell's link (Decision 2): that one action, whatever page it is on.
  const [linked, setLinked] = useState<AgentAction | null>(null);
  useEffect(() => {
    setLinked(null);
    if (focusId === null) return;
    let alive = true;
    fetchAction(focusId).then(
      (action) => {
        if (alive) setLinked(action);
      },
      () => {
        if (alive) setStatus(LINK_GONE);
      },
    );
    return () => {
      alive = false;
    };
  }, [focusId]);
  useEffect(() => {
    if (linked) document.querySelector<HTMLElement>(`[data-linked] [data-action="${linked.id}"]`)?.focus();
  }, [linked]);

  function choose(change: Partial<ActivityFilters>) {
    setParams(filtersParams({ ...filters, ...change, page: change.page ?? 1 }, params), { replace: true });
  }

  function undone(next: AgentAction, text: string) {
    setAnswer((current) =>
      current ? { ...current, data: { ...current.data, results: current.data.results.map((a) => (a.id === next.id ? next : a)) } } : current,
    );
    setLinked((current) => (current && current.id === next.id ? next : current));
    setStatus(text);
    statusRef.current?.focus();
  }

  const filtered = filters.agent !== null || filters.kind !== null || filters.status !== null;
  let body: ReactNode;
  if (!data && error) body = <ErrorBlock message={error} onRetry={() => { setFailure(null); reload(); }} />;
  else if (!data) body = <ActivitySkeleton />;
  else if (data.results.length === 0)
    body = filtered ? (
      <EmptyState
        title={AGENTS.EMPTY_FILTERED_TITLE}
        detail=""
        action={
          <Link to="/work/activity" className={LINK}>
            {AGENTS.CLEAR_FILTERS}
          </Link>
        }
      />
    ) : (
      <EmptyState title={AGENTS.EMPTY_TITLE} detail={AGENTS.EMPTY_DETAIL} action={null} />
    );
  else
    body = (
      <section aria-labelledby={TITLE_ID} className="flex flex-col gap-2">
        <h2 id={TITLE_ID} className={SECTION_TITLE}>
          {AGENTS.ACTIVITY_LIST} <span className={MONO}>{data.count}</span>
        </h2>
        <ul aria-label={AGENTS.ACTIVITY_LIST} className={LIST}>
          {data.results
            .filter((action) => action.id !== linked?.id)
            .map((action) => (
              <ActivityRow key={action.id} action={action} me={me} focus={false} onUndone={undone} />
            ))}
        </ul>
        {data.previous || data.next ? (
          <div className="flex flex-wrap gap-2">
            {data.previous ? (
              <button type="button" onClick={() => choose({ page: filters.page - 1 })} className={BUTTON}>
                {AGENTS.PREVIOUS}
              </button>
            ) : null}
            {data.next ? (
              <button type="button" onClick={() => choose({ page: filters.page + 1 })} className={BUTTON}>
                {AGENTS.NEXT}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  const hidden = data ? hiddenActivityText(data.hidden) : null;

  return (
    <WorkFrame>
      <div data-part="toolbar" className="flex min-h-11 flex-wrap items-end justify-between gap-3">
        <p ref={statusRef} tabIndex={-1} role="status" aria-label="" className={`text-[13px] text-ink-muted ${FOCUS}`}>
          {status}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink-muted">
            {AGENTS.AGENT}
            <select value={filters.agent ?? ''} onChange={(e) => choose({ agent: (e.target.value || null) as ActivityFilters['agent'] })} className={FILTER_SELECT}>
              <option value="">{AGENTS.ALL_AGENTS}</option>
              {AGENT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {AGENT_LABEL[kind]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink-muted">
            {AGENTS.ACTION}
            <select value={filters.kind ?? ''} onChange={(e) => choose({ kind: (e.target.value || null) as ActivityFilters['kind'] })} className={FILTER_SELECT}>
              <option value="">{AGENTS.ALL_ACTIONS}</option>
              {ACTION_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABEL[kind]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink-muted">
            {AGENTS.STATUS}
            <select value={filters.status ?? ''} onChange={(e) => choose({ status: (e.target.value || null) as ActivityFilters['status'] })} className={FILTER_SELECT}>
              <option value="">{AGENTS.ALL_STATUSES}</option>
              {ACTION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {linked ? (
        <section data-linked="" aria-labelledby={LINKED_ID} className="flex flex-col gap-2">
          <h2 id={LINKED_ID} className={SECTION_TITLE}>
            Linked action
          </h2>
          <ul className={LIST}>
            <ActivityRow action={linked} me={me} focus onUndone={undone} />
          </ul>
        </section>
      ) : null}
      {body}
      {hidden ? <p className="text-[13px] text-ink-muted">{hidden}</p> : null}
    </WorkFrame>
  );
}
```

Notes:
- The status paragraph carries `aria-label=""` so the test's `findByRole('status', { name: '' })` picks it and not the skeleton.
- `EmptyState`'s `detail` prop is a string. Check its props in `PortfolioSections.tsx` and pass `undefined` if it is optional.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/pages/work src/features/work src/components/agents --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Lint, build, commit**

```bash
git add src/features/work/workTabs.ts src/features/work/workTabs.test.ts src/pages/work/WorkRoutes.tsx src/pages/work/Activity.tsx src/pages/work/Activity.test.tsx src/components/agents/ActivityRow.tsx src/components/agents/ActivitySkeleton.tsx
git commit -m "feat(work): Activity lists every agent action, with filters and Undo

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Settings › Agents

**Files:**
- Create: `src/pages/settings/AgentSettingsFrame.tsx`
- Create: `src/components/agents/AgentCard.tsx`
- Create: `src/components/agents/AgentsForm.tsx`
- Create: `src/components/agents/AgentsSummary.tsx`
- Create: `src/pages/settings/AgentsSettingsPage.tsx`
- Test: `src/pages/settings/AgentsSettingsPage.test.tsx`

**Interfaces:**
- **Consumes:**
  - Task 1: `fetchAgentSettings`, `patchAgentSettings`, `runAgent`, `readAgentRefusal`, `NO_AGENT_REFUSAL`, `refusalDetail` and `AgentSettings`;
  - Task 2: `AGENTS`, `agentsDraftOf`, `validateAgents`, `agentsPatchOf`, `budgetText`, `lastRunText` and `runAnswerText`;
  - `fetchMe` (authSlice) and `useAppDispatch`;
  - `CONTROL` and `FORM_ERROR`; `PRIMARY`, `BUTTON`, `FOCUS` and `MONO`; `useSubmitOnce`.
- **Produces:**
  - `AgentSettingsFrame({ title, intro, children })`, whose `children` is `(settings: AgentSettings, onSaved: (next: AgentSettings) => void) => ReactNode`;
  - `AgentCard({ card, canRun, onRan })`;
  - `AgentsForm({ settings, onSaved })`;
  - `AgentsSummary({ settings })`;
  - `AgentsSettingsPage()`.

- [ ] **Step 1: Write the failing tests**

Create `src/pages/settings/AgentsSettingsPage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AGENT_SETTINGS } from '../../features/agents/testAgentsFixtures';
import { sent, stubAgents } from '../../features/agents/testAgents';
import { renderPage } from '../work/testPages';
import { resetViewport } from '../../test/viewport';
import { AgentsSettingsPage } from './AgentsSettingsPage';

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
});

describe('Settings › Agents (spec §1.8; Decisions 7, 8)', () => {
  it('shows a card per agent with its budget bar, last run and Run now', async () => {
    stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const cs = await screen.findByRole('region', { name: 'CS agent' });
    expect(within(cs).getByText('12 of 133 credits this month · resets on 1 Nov 2026')).toBeInTheDocument();
    expect(within(cs).getByRole('progressbar', { name: 'CS agent credits this month' })).toHaveAttribute('aria-valuenow', '12');
    expect(within(cs).getByText('Last run 8 Oct 2026: 4 proposed, 1 applied')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Ops agent' })).getByText('Switched off.')).toBeInTheDocument();
  });

  it('saves only what changed, with every refusal in place', async () => {
    const { spy } = stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const credits = await screen.findByLabelText('Monthly credits for the CS agent');
    await userEvent.clear(credits);
    await userEvent.type(credits, '2001');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Choose a whole number from 0 to 2000.')).toBeInTheDocument();
    expect(credits).toHaveAttribute('aria-invalid', 'true');
    expect(credits).toHaveAccessibleDescription(/Choose a whole number from 0 to 2000\./);
    expect(sent(spy, 'PATCH', '/agents/settings/')).toEqual([]);
    await userEvent.clear(credits);
    await userEvent.type(credits, '200');
    await userEvent.click(screen.getByRole('switch', { name: 'Sales agent' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/agents/settings/')).toEqual([{ agents: { cs: { monthly_credits: 200 }, sales: { enabled: false } } }]);
    await userEvent.type(credits, '1');
    expect(screen.queryByText('Saved.')).toBeNull();
  });

  it('runs an agent now, and shows a refusal in the server words', async () => {
    stubAgents({ refuseNextRun: { status: 409, body: { code: 'BUDGET_USED', detail: "This agent's budget is used up: it resumes on 1 Nov." } } });
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const cs = await screen.findByRole('region', { name: 'CS agent' });
    await userEvent.click(within(cs).getByRole('button', { name: 'Run now' }));
    expect(await within(cs).findByRole('alert')).toHaveTextContent("This agent's budget is used up: it resumes on 1 Nov.");
    await userEvent.click(within(cs).getByRole('button', { name: 'Run now' }));
    expect(await within(cs).findByText('The CS agent ran: 3 proposed, 1 applied.')).toBeInTheDocument();
  });

  it('gives a member the values as text, without Run now when can_run is false', async () => {
    stubAgents({ settings: { ...AGENT_SETTINGS, can_edit: false, can_run: false } });
    renderPage(<AgentsSettingsPage />, '/settings/agents', { role: 'csm' });
    expect(await screen.findByText('Only admins can change these.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run now' })).toBeNull();
    expect(screen.getByText('Professional')).toBeInTheDocument();
  });

  it('shows the skeleton again on Try again', async () => {
    stubAgents({ failSettings: 2 });
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const retry = await screen.findByRole('button', { name: 'Try again' });
    fireEvent.click(retry);
    expect(screen.getByRole('status', { name: 'Loading the agent settings' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'CS agent' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/settings/AgentsSettingsPage.test.tsx --maxWorkers=2`
Expected: FAIL.

- [ ] **Step 3: The frame**

Create `src/pages/settings/AgentSettingsFrame.tsx`:

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import { ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { fetchAgentSettings } from '../../features/agents/agentsApi';
import { AGENTS } from '../../features/agents/agentsText';
import type { AgentSettings } from '../../features/agents/agentTypes';

/** A Settings › Agents page: the settings frame's 20px h1 and its intro,
 *  GET /agents/settings/ with a skeleton (also on Try again) and an error,
 *  then the page's own body, which may replace the settings after a save. */
export function AgentSettingsFrame({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: (settings: AgentSettings, onSaved: (next: AgentSettings) => void) => ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchAgentSettings().then(
      (data) => {
        if (!alive) return;
        setSettings(data);
        setError(null);
      },
      (err: unknown) => {
        if (alive) setError(errorMessage(err, AGENTS.LOAD));
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = () => {
    setError(null);
    setAttempt((n) => n + 1);
  };

  let body: ReactNode;
  if (!settings && error) body = <ErrorBlock message={error} onRetry={retry} />;
  else if (!settings)
    body = (
      <div role="status" aria-busy="true" aria-label={AGENTS.LOADING} className="flex flex-col gap-3">
        <span className="sr-only">Loading…</span>
        {[0, 1, 2].map((n) => (
          <div key={n} className="h-24 animate-pulse rounded-xl bg-subtle" />
        ))}
      </div>
    );
  else body = children(settings, setSettings);

  return (
    <div className="flex h-full w-full max-w-3xl flex-col gap-6 overflow-y-auto p-6">
      <div>
        <h1 className="text-[20px] font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-0.5 text-[13px] font-medium text-ink-faint">{intro}</p>
      </div>
      {body}
    </div>
  );
}
```

- [ ] **Step 4: The card**

Create `src/components/agents/AgentCard.tsx`:

```tsx
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { refusalDetail, runAgent } from '../../features/agents/agentsApi';
import { AGENTS, budgetText, lastRunText, runAnswerText } from '../../features/agents/agentsText';
import type { AgentCard as Card } from '../../features/agents/agentTypes';
import { BUTTON, FOCUS } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { Figured } from '../brain/Figured';

/** One agent (spec §1.8; Decision 8): its name, the spend bar, its last run,
 *  Run now for those the contract lets run it, and `children` (the form's
 *  own switch and budget for an admin, the values as text otherwise). */
export function AgentCard({ card, canRun, onRan, children }: { card: Card; canRun: boolean; onRan: (next: Card) => void; children?: ReactNode }) {
  const titleId = useId();
  const [said, setSaid] = useState<{ text: string; failed: boolean } | null>(null);
  const [tick, setTick] = useState(0);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const { busy, run } = useSubmitOnce();
  useEffect(() => {
    if (tick > 0) alertRef.current?.focus();
  }, [tick]);
  const over = card.spent_this_month >= card.monthly_credits;
  const width = card.monthly_credits > 0 ? Math.min(100, Math.round((card.spent_this_month / card.monthly_credits) * 100)) : 100;

  async function runNow() {
    setSaid(null);
    const outcome = await run(() => runAgent(card.kind));
    if (!outcome) return;
    if (outcome.ok) {
      onRan(outcome.value);
      setSaid({ text: runAnswerText(outcome.value), failed: false });
    } else {
      setSaid({ text: refusalDetail(outcome.error) ?? errorMessage(outcome.error, AGENTS.RUN_FAILED), failed: true });
      setTick((n) => n + 1);
    }
  }

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3 rounded-xl border border-line-subtle bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="text-[15px] font-semibold text-ink">
          {card.label}
        </h2>
        {canRun ? (
          <button type="button" disabled={busy} onClick={() => void runNow()} className={BUTTON}>
            {busy ? AGENTS.RUNNING : AGENTS.RUN}
          </button>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <div
          role="progressbar"
          aria-label={`${card.label} credits this month`}
          aria-valuemin={0}
          aria-valuemax={card.monthly_credits}
          aria-valuenow={Math.min(card.spent_this_month, card.monthly_credits)}
          className="h-2 w-full overflow-hidden rounded-full bg-subtle"
        >
          <div className={`h-full ${over ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${width}%` }} />
        </div>
        <p className="text-[11px] text-ink-muted">
          <Figured text={budgetText(card)} />
        </p>
        <p className="text-[11px] text-ink-muted">
          <Figured text={lastRunText(card)} />
        </p>
      </div>
      {children}
      {said ? (
        <p ref={said.failed ? alertRef : undefined} tabIndex={said.failed ? -1 : undefined} role={said.failed ? 'alert' : 'status'} className={`text-[13px] ${said.failed ? 'text-danger' : 'text-ink-muted'} ${FOCUS}`}>
          {said.text}
        </p>
      ) : null}
    </section>
  );
}
```

`style={{ width }}` is the one inline style. It is a measured width, not a colour, and the house rules' `RAW` check covers colours only. If `houseRuleSuite` refuses inline styles, use `w-[N%]` through a lookup of tenths (`w-[0%]` to `w-[100%]`, in 10% steps) and round `width` to 10.

- [ ] **Step 5: The form and the summary**

Create `src/components/agents/AgentsForm.tsx`:

```tsx
import { useId, useState, type FormEvent } from 'react';
import { fetchMe } from '../../features/auth/authSlice';
import type { AgentTone } from '../../features/auth/authSlice';
import { NO_AGENT_REFUSAL, patchAgentSettings, readAgentRefusal, type AgentRefusal } from '../../features/agents/agentsApi';
import { AGENTS, agentsDraftOf, agentsPatchOf, validateAgents, type AgentsDraft } from '../../features/agents/agentsText';
import { AGENT_KINDS, type AgentCard as Card, type AgentKind, type AgentSettings } from '../../features/agents/agentTypes';
import { useAppDispatch } from '../../hooks';
import { CONTROL, FORM_ERROR } from '../organizations/activity/formStyles';
import { FOCUS, PRIMARY } from '../organizations/portfolio/styles';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { AgentCard } from './AgentCard';

const INPUT = `${CONTROL} sm:w-28`;
const SELECT = `min-h-11 ${CONTROL} sm:w-56`;
const CHOICE = 'flex min-h-11 items-center gap-2 text-[13px] font-semibold text-ink sm:min-h-9';
const BOX = `h-4 w-4 shrink-0 accent-accent ${FOCUS}`;
const LABEL = 'text-[11px] font-semibold text-ink-muted';
const NOTE = 'text-[11px] text-ink-muted';
const ERROR = 'text-[11px] text-danger';
const TONES: { value: AgentTone; label: string }[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'concise', label: 'Concise' },
];

/** Settings › Agents for an admin (Decision 7): one form, one Save, for the
 *  AI switch, the tone, and each agent's switch and monthly credits; each
 *  card's Run now sends at once. */
export function AgentsForm({ settings, onSaved }: { settings: AgentSettings; onSaved: (next: AgentSettings) => void }) {
  const ids = useId();
  const dispatch = useAppDispatch();
  const canRun = settings.can_run;
  const [draft, setDraft] = useState<AgentsDraft>(() => agentsDraftOf(settings));
  const [refusal, setRefusal] = useState<AgentRefusal>(NO_AGENT_REFUSAL);
  const [local, setLocal] = useState<Partial<Record<AgentKind, string>>>({});
  const [status, setStatus] = useState('');
  const saving = useSubmitOnce();
  const dirty = Object.keys(agentsPatchOf(settings, draft)).length > 0 || JSON.stringify(draft) !== JSON.stringify(agentsDraftOf(settings));

  const edit = (change: (current: AgentsDraft) => AgentsDraft, agent?: AgentKind) => {
    setStatus('');
    if (agent) setLocal((current) => ({ ...current, [agent]: undefined }));
    setRefusal(NO_AGENT_REFUSAL);
    setDraft(change);
  };

  const budgetError = (kind: AgentKind): string | null => {
    const server = refusal.agents[kind];
    if (typeof server === 'string') return server;
    return local[kind] ?? server?.monthly_credits ?? null;
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    setStatus('');
    const errors = validateAgents(draft, settings.plan_monthly_credits);
    if (Object.keys(errors).length > 0) {
      setLocal(errors);
      return;
    }
    setLocal({});
    setRefusal(NO_AGENT_REFUSAL);
    const patch = agentsPatchOf(settings, draft);
    const outcome = await saving.run(() => patchAgentSettings(patch));
    if (!outcome) return;
    if (outcome.ok) {
      setDraft(agentsDraftOf(outcome.value));
      onSaved(outcome.value);
      setStatus('Saved.');
      if ('ai_enabled' in patch || 'tone' in patch) void dispatch(fetchMe());
    } else setRefusal(readAgentRefusal(outcome.error, AGENTS.SAVE_FAILED));
  }

  const ran = (next: Card) => onSaved({ ...settings, agents: settings.agents.map((c) => (c.kind === next.kind ? next : c)) });
  const toneId = `${ids}-tone`;
  return (
    <form onSubmit={(event) => void save(event)} noValidate aria-label={AGENTS.SETTINGS_TITLE} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <label className={CHOICE}>
          <input
            type="checkbox"
            role="switch"
            checked={draft.ai_enabled}
            aria-describedby={`${ids}-ai-detail`}
            onChange={(event) => edit((current) => ({ ...current, ai_enabled: event.target.checked }))}
            className={BOX}
          />
          {AGENTS.AI_SWITCH}
        </label>
        <p id={`${ids}-ai-detail`} className={NOTE}>
          {AGENTS.AI_DETAIL}
        </p>
        {refusal.top.ai_enabled ? <p role="alert" className={ERROR}>{refusal.top.ai_enabled}</p> : null}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={toneId} className={LABEL}>
          {AGENTS.TONE}
        </label>
        <select id={toneId} value={draft.tone} onChange={(event) => edit((current) => ({ ...current, tone: event.target.value as AgentTone }))} className={SELECT}>
          {TONES.map((tone) => (
            <option key={tone.value} value={tone.value}>
              {tone.label}
            </option>
          ))}
        </select>
        {refusal.top.tone ? <p role="alert" className={ERROR}>{refusal.top.tone}</p> : null}
      </div>
      {AGENT_KINDS.map((kind) => {
        const card = settings.agents.find((c) => c.kind === kind);
        if (!card) return null;
        const budgetId = `${ids}-${kind}-budget`;
        const message = budgetError(kind);
        return (
          <AgentCard key={kind} card={card} canRun={canRun} onRan={ran}>
            <div className="flex flex-wrap items-end gap-4">
              <label className={CHOICE}>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={card.label}
                  checked={draft[kind].enabled}
                  onChange={(event) => edit((current) => ({ ...current, [kind]: { ...current[kind], enabled: event.target.checked } }), kind)}
                  className={BOX}
                />
                {draft[kind].enabled ? AGENTS.ON : AGENTS.OFF}
              </label>
              <div className="flex flex-col gap-1">
                <label htmlFor={budgetId} className={LABEL}>
                  {AGENTS.BUDGET}
                </label>
                <input
                  id={budgetId}
                  inputMode="numeric"
                  aria-label={`Monthly credits for the ${card.label}`}
                  value={draft[kind].budget}
                  aria-invalid={Boolean(message)}
                  aria-describedby={message ? `${budgetId}-error` : undefined}
                  onChange={(event) => edit((current) => ({ ...current, [kind]: { ...current[kind], budget: event.target.value } }), kind)}
                  className={INPUT}
                />
                {message ? (
                  <p id={`${budgetId}-error`} role="alert" className={ERROR}>
                    {message}
                  </p>
                ) : null}
              </div>
            </div>
          </AgentCard>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" aria-disabled={!dirty || saving.busy || undefined} className={PRIMARY}>
          {saving.busy ? 'Saving…' : 'Save changes'}
        </button>
        <p role="status" className="text-[13px] text-ink-muted">
          {status}
        </p>
      </div>
      {refusal.form ? (
        <p role="alert" className={FORM_ERROR}>
          {refusal.form}
        </p>
      ) : null}
    </form>
  );
}
```

`dirty` compares drafts as well as the patch, so a budget typed as an invalid value still enables Save and reaches the browser's own check. Run now reads `settings.can_run` (contract), never the client's own capabilities.

Create `src/components/agents/AgentsSummary.tsx`:

```tsx
import { AGENTS } from '../../features/agents/agentsText';
import type { AgentSettings } from '../../features/agents/agentTypes';
import { MONO } from '../organizations/portfolio/styles';
import { AgentCard } from './AgentCard';

const TONE: Record<AgentSettings['tone'], string> = { professional: 'Professional', friendly: 'Friendly', concise: 'Concise' };

/** Settings › Agents for a member (Decision 7): the values as text, with
 *  Run now when the server says `can_run`. */
export function AgentsSummary({ settings, onSaved }: { settings: AgentSettings; onSaved: (next: AgentSettings) => void }) {
  const canRun = settings.can_run;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-ink-muted">{AGENTS.READ_ONLY}</p>
      <dl className="flex flex-col gap-1 text-[13px] text-ink">
        <div className="flex gap-2">
          <dt className="text-ink-muted">{AGENTS.AI_SWITCH}:</dt>
          <dd>{settings.ai_enabled ? AGENTS.ON : AGENTS.OFF}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-ink-muted">{AGENTS.TONE}:</dt>
          <dd>{TONE[settings.tone]}</dd>
        </div>
      </dl>
      {settings.agents.map((card) => (
        <AgentCard key={card.kind} card={card} canRun={canRun} onRan={(next) => onSaved({ ...settings, agents: settings.agents.map((c) => (c.kind === next.kind ? next : c)) })}>
          <p className="text-[13px] text-ink">
            {card.enabled ? AGENTS.ON : AGENTS.OFF} · <span className={MONO}>{card.monthly_credits}</span> credits a month
          </p>
        </AgentCard>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: The page**

Create `src/pages/settings/AgentsSettingsPage.tsx`:

```tsx
import { AgentsForm } from '../../components/agents/AgentsForm';
import { AgentsSummary } from '../../components/agents/AgentsSummary';
import { AGENTS } from '../../features/agents/agentsText';
import { AgentSettingsFrame } from './AgentSettingsFrame';

/** Settings › Agents (spec §1.8; Decision 7): the form for whoever holds
 *  manage_org_settings (`can_edit`), the values as text for everyone else. */
export function AgentsSettingsPage() {
  return (
    <AgentSettingsFrame title={AGENTS.SETTINGS_TITLE} intro={AGENTS.SETTINGS_INTRO}>
      {(settings, onSaved) => (settings.can_edit ? <AgentsForm settings={settings} onSaved={onSaved} /> : <AgentsSummary settings={settings} onSaved={onSaved} />)}
    </AgentSettingsFrame>
  );
}
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/pages/settings/AgentsSettingsPage.test.tsx --maxWorkers=2`
Expected: PASS.

The test stubs only `/agents/*`. `fetchMe()` goes to `/auth/me/`, which `stubAgents` answers 404, and it does so only when the AI switch or tone changes. The save test changes neither. If a later test does, pass `passThrough` answering `/auth/me/` with the store's user.

- [ ] **Step 8: Commit**

```bash
git add src/pages/settings/AgentSettingsFrame.tsx src/pages/settings/AgentsSettingsPage.tsx src/pages/settings/AgentsSettingsPage.test.tsx src/components/agents/AgentCard.tsx src/components/agents/AgentsForm.tsx src/components/agents/AgentsSummary.tsx
git commit -m "feat(settings): Settings › Agents, with budgets, last runs and Run now

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Settings › Actions & approvals

**Files:**
- Create: `src/components/agents/ActionsGridForm.tsx`
- Create: `src/components/agents/ActionsGridSummary.tsx`
- Create: `src/pages/settings/AgentActionsPage.tsx`
- Test: `src/pages/settings/AgentActionsPage.test.tsx`

**Interfaces:**
- **Consumes:**
  - Task 7: `AgentSettingsFrame`;
  - Task 1: `patchAgentSettings`, `readAgentRefusal` and `NO_AGENT_REFUSAL`;
  - Task 2: `AGENTS`, `AGENT_LABEL`, `LEVEL_LABEL`, `levelsUpTo`, `levelsDraftOf` and `levelsPatchOf`.
- **Produces:** `ActionsGridForm({ settings, onSaved })`, `ActionsGridSummary({ settings })` and `AgentActionsPage()`.

- [ ] **Step 1: Write the failing tests**

Create `src/pages/settings/AgentActionsPage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AGENT_SETTINGS } from '../../features/agents/testAgentsFixtures';
import { sent, stubAgents } from '../../features/agents/testAgents';
import { renderPage } from '../work/testPages';
import { resetViewport } from '../../test/viewport';
import { AgentActionsPage } from './AgentActionsPage';

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
});

describe('Settings › Actions & approvals (spec §1.6, §1.8; Decision 6)', () => {
  it('lays out kinds by agents, all Ask, with Not used where an agent does not use a kind', async () => {
    stubAgents();
    renderPage(<AgentActionsPage />, '/settings/agent-actions');
    const table = await screen.findByRole('table', { name: 'Actions & approvals' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Action', 'CS agent', 'Sales agent', 'Ops agent']);
    expect(screen.getByLabelText('Change lifecycle stage for the CS agent')).toHaveValue('ask');
    const initiative = within(table).getByRole('row', { name: /Start an initiative/ });
    expect(within(initiative).getAllByText('Not used')).toHaveLength(2);
  });

  it('caps a cell at its max_level', async () => {
    stubAgents();
    renderPage(<AgentActionsPage />, '/settings/agent-actions');
    const owner = await screen.findByLabelText('Change owner for the CS agent');
    expect(within(owner).getAllByRole('option').map((o) => o.textContent)).toEqual(['Ask', 'Never']);
  });

  it('saves only the changed cells and shows a refusal under its cell', async () => {
    const { spy } = stubAgents();
    renderPage(<AgentActionsPage />, '/settings/agent-actions');
    await userEvent.selectOptions(await screen.findByLabelText('Change lifecycle stage for the CS agent'), 'auto');
    await userEvent.selectOptions(screen.getByLabelText('Start an initiative for the Ops agent'), 'never');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/agents/settings/')).toEqual([{ levels: { cs: { 'record.lifecycle': 'auto' }, ops: { 'initiative.create': 'never' } } }]);
  });

  it('gives a member the levels as words', async () => {
    stubAgents({ settings: { ...AGENT_SETTINGS, can_edit: false } });
    renderPage(<AgentActionsPage />, '/settings/agent-actions', { role: 'csm' });
    expect(await screen.findByText('Only admins can change these.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getAllByText('Ask').length).toBeGreaterThan(0);
  });

  it('lists what each action does', async () => {
    stubAgents();
    renderPage(<AgentActionsPage />, '/settings/agent-actions');
    const list = await screen.findByRole('list', { name: 'What each action does' });
    expect(within(list).getByText('Move Dough Co from Live to Renewal')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/settings/AgentActionsPage.test.tsx --maxWorkers=2`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/components/agents/ActionsGridForm.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { NO_AGENT_REFUSAL, patchAgentSettings, readAgentRefusal, type AgentRefusal } from '../../features/agents/agentsApi';
import { AGENTS, AGENT_LABEL, LEVEL_LABEL, levelsDraftOf, levelsPatchOf, levelsUpTo } from '../../features/agents/agentsText';
import { AGENT_KINDS, type ActionLevel, type AgentSettings, type Levels } from '../../features/agents/agentTypes';
import { CONTROL, FORM_ERROR } from '../organizations/activity/formStyles';
import { PRIMARY } from '../organizations/portfolio/styles';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { ActionsExplained } from './ActionsGridSummary';

const SELECT = `min-h-11 ${CONTROL} w-28`;
const CELL = 'px-3 py-2 text-left align-top';
const HEAD = 'px-3 py-2 text-left text-[11px] font-semibold text-ink-muted';

/** Actions & approvals for an admin (Decision 6): kinds down, agents across,
 *  each cell Auto, Ask or Never up to the kind's max_level, one Save. */
export function ActionsGridForm({ settings, onSaved }: { settings: AgentSettings; onSaved: (next: AgentSettings) => void }) {
  const [draft, setDraft] = useState<Levels>(() => levelsDraftOf(settings));
  const [refusal, setRefusal] = useState<AgentRefusal>(NO_AGENT_REFUSAL);
  const [status, setStatus] = useState('');
  const saving = useSubmitOnce();
  const dirty = Object.keys(levelsPatchOf(settings, draft)).length > 0;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    setStatus('');
    setRefusal(NO_AGENT_REFUSAL);
    const outcome = await saving.run(() => patchAgentSettings(levelsPatchOf(settings, draft)));
    if (!outcome) return;
    if (outcome.ok) {
      setDraft(levelsDraftOf(outcome.value));
      onSaved(outcome.value);
      setStatus('Saved.');
    } else setRefusal(readAgentRefusal(outcome.error, AGENTS.SAVE_FAILED));
  }

  return (
    <form onSubmit={(event) => void save(event)} noValidate aria-label={AGENTS.ACTIONS_TITLE} className="flex flex-col gap-6">
      <div className="overflow-x-auto rounded-xl border border-line-subtle bg-surface">
        <table aria-label={AGENTS.ACTIONS_TITLE} className="w-full text-[13px] text-ink">
          <thead>
            <tr>
              <th scope="col" className={`${HEAD} sticky left-0 bg-surface`}>
                {AGENTS.ACTION}
              </th>
              {AGENT_KINDS.map((agent) => (
                <th key={agent} scope="col" className={HEAD}>
                  {AGENT_LABEL[agent]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {settings.kinds.map((spec) => (
              <tr key={spec.kind} className="border-t border-line-subtle">
                <th scope="row" className={`${CELL} sticky left-0 bg-surface font-semibold`}>
                  {spec.label}
                </th>
                {AGENT_KINDS.map((agent) => {
                  if (!spec.agents.includes(agent)) {
                    return (
                      <td key={agent} className={`${CELL} text-ink-muted`}>
                        {AGENTS.NOT_USED}
                      </td>
                    );
                  }
                  const message = refusal.levels[agent]?.[spec.kind];
                  const id = `level-${agent}-${spec.kind}`;
                  return (
                    <td key={agent} className={CELL}>
                      <select
                        aria-label={`${spec.label} for the ${AGENT_LABEL[agent]}`}
                        value={draft[agent][spec.kind] ?? 'ask'}
                        aria-invalid={Boolean(message)}
                        aria-describedby={message ? `${id}-error` : undefined}
                        onChange={(event) => {
                          setStatus('');
                          const level = event.target.value as ActionLevel;
                          setDraft((current) => ({ ...current, [agent]: { ...current[agent], [spec.kind]: level } }));
                        }}
                        className={SELECT}
                      >
                        {levelsUpTo(spec.max_level).map((level) => (
                          <option key={level} value={level}>
                            {LEVEL_LABEL[level]}
                          </option>
                        ))}
                      </select>
                      {message ? (
                        <p id={`${id}-error`} role="alert" className="mt-1 text-[11px] text-danger">
                          {message}
                        </p>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" aria-disabled={!dirty || saving.busy || undefined} className={PRIMARY}>
          {saving.busy ? 'Saving…' : 'Save changes'}
        </button>
        <p role="status" className="text-[13px] text-ink-muted">
          {status}
        </p>
      </div>
      {refusal.form ? (
        <p role="alert" className={FORM_ERROR}>
          {refusal.form}
        </p>
      ) : null}
      <ActionsExplained settings={settings} />
    </form>
  );
}
```

Create `src/components/agents/ActionsGridSummary.tsx`:

```tsx
import { AGENTS, AGENT_LABEL, LEVEL_LABEL } from '../../features/agents/agentsText';
import { AGENT_KINDS, type AgentSettings } from '../../features/agents/agentTypes';

const CELL = 'px-3 py-2 text-left align-top';
const HEAD = 'px-3 py-2 text-left text-[11px] font-semibold text-ink-muted';

/** "What each action does": each kind's label and example. */
export function ActionsExplained({ settings }: { settings: AgentSettings }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[13px] font-semibold text-ink">{AGENTS.WHAT_EACH_DOES}</h2>
      <ul aria-label={AGENTS.WHAT_EACH_DOES} className="flex flex-col gap-1">
        {settings.kinds.map((spec) => (
          <li key={spec.kind} className="text-[13px] text-ink">
            <span className="font-semibold">{spec.label}</span>
            <span className="text-ink-muted">: </span>
            <span className="text-ink-muted">{spec.example}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Actions & approvals for a member (Decision 6): the same table, in words. */
export function ActionsGridSummary({ settings }: { settings: AgentSettings }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[13px] text-ink-muted">{AGENTS.READ_ONLY}</p>
      <div className="overflow-x-auto rounded-xl border border-line-subtle bg-surface">
        <table aria-label={AGENTS.ACTIONS_TITLE} className="w-full text-[13px] text-ink">
          <thead>
            <tr>
              <th scope="col" className={`${HEAD} sticky left-0 bg-surface`}>
                {AGENTS.ACTION}
              </th>
              {AGENT_KINDS.map((agent) => (
                <th key={agent} scope="col" className={HEAD}>
                  {AGENT_LABEL[agent]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {settings.kinds.map((spec) => (
              <tr key={spec.kind} className="border-t border-line-subtle">
                <th scope="row" className={`${CELL} sticky left-0 bg-surface font-semibold`}>
                  {spec.label}
                </th>
                {AGENT_KINDS.map((agent) => {
                  const level = settings.levels[agent][spec.kind];
                  return (
                    <td key={agent} className={`${CELL} ${level ? '' : 'text-ink-muted'}`}>
                      {level ? LEVEL_LABEL[level] : AGENTS.NOT_USED}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ActionsExplained settings={settings} />
    </div>
  );
}
```

Create `src/pages/settings/AgentActionsPage.tsx`:

```tsx
import { ActionsGridForm } from '../../components/agents/ActionsGridForm';
import { ActionsGridSummary } from '../../components/agents/ActionsGridSummary';
import { AGENTS } from '../../features/agents/agentsText';
import { AgentSettingsFrame } from './AgentSettingsFrame';

/** Settings › Actions & approvals (spec §1.6, §1.8; Decision 6). */
export function AgentActionsPage() {
  return (
    <AgentSettingsFrame title={AGENTS.ACTIONS_TITLE} intro={AGENTS.ACTIONS_INTRO}>
      {(settings, onSaved) => (settings.can_edit ? <ActionsGridForm settings={settings} onSaved={onSaved} /> : <ActionsGridSummary settings={settings} />)}
    </AgentSettingsFrame>
  );
}
```

`ActionsExplained` is exported from `ActionsGridSummary.tsx` so both views share it.

Each row is named by its `th` (`scope="row"`), so the test's `getByRole('row', { name: /Start an initiative/ })` resolves. If jsdom does not compute row names, use `within(table).getByText('Start an initiative').closest('tr')!` instead.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/pages/settings/AgentActionsPage.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/agents/ActionsGridForm.tsx src/components/agents/ActionsGridSummary.tsx src/pages/settings/AgentActionsPage.tsx src/pages/settings/AgentActionsPage.test.tsx
git commit -m "feat(settings): Actions & approvals, Auto, Ask or Never per agent and action

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The Agents nav group, the routes, the redirect, and the bell

**Files:**
- Modify: `src/pages/settings/workspaceSettingsNav.ts` (imports, the AI group, a new Agents group after Work, the doc comment)
- Modify: `src/pages/settings/routes.tsx`
- Delete: `src/pages/settings/AIAgentPage.tsx`, `src/pages/settings/AIAgentPage.test.tsx`
- Modify: `src/pages/settings/workspaceSettingsNav.test.ts`, `src/layouts/WorkspaceSettingsLayout.test.tsx` (the nav rows)
- Modify: `src/features/notifications/types.ts`, `src/components/layout/NotificationKindIcon.tsx`
- Test: `src/components/layout/NotificationKindIcon.test.tsx`, `src/pages/settings/routes.test.tsx` (the redirect)

**Interfaces:**
- **Consumes:** `AgentsSettingsPage` (Task 7) and `AgentActionsPage` (Task 8).
- **Produces:** the Agents group `[Agents /settings/agents (Bot), Actions & approvals /settings/agent-actions (ShieldCheck)]`, placed after Work; AI without "AI agent"; and `/settings/ai-agent` redirecting to `/settings/agents`.

- [ ] **Step 1: Write the failing tests**

In `src/pages/settings/workspaceSettingsNav.test.ts`:
- Change the AI row to `['AI', ['AI attributes /settings/ai-attributes', 'AI skills /settings/ai-skills', 'AI usage /settings/ai-usage', 'AI feedback /settings/ai-feedback']]`.
- Insert after the Work row `['Agents', ['Agents /settings/agents', 'Actions & approvals /settings/agent-actions']]`.
- Update the header comment to cite the Agents spec §1.8.

In `src/layouts/WorkspaceSettingsLayout.test.tsx`:
- Update `ALL_ITEMS` and the per-group link lists the same way.
- Change the group count from five to six.

In `src/pages/settings/routes.test.tsx`, add:

```tsx
  it('sends the old AI agent address to Settings › Agents', async () => {
    renderSettings('/settings/ai-agent');
    await waitFor(() => expect(where()).toBe('/settings/agents'));
  });
```

Use the file's own render helper and `where`, as its other redirect tests do.

In `src/components/layout/NotificationKindIcon.test.tsx`, add `agent_action_undone` to the kinds with an icon:

```tsx
  it('draws Undo2 for agent_action_undone', () => {
    render(<NotificationKindIcon kind="agent_action_undone" />);
    expect(document.querySelector('[data-kind-icon="agent_action_undone"]')).toHaveAttribute('aria-hidden', 'true');
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/settings src/layouts src/components/layout --maxWorkers=2`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/pages/settings/workspaceSettingsNav.ts`:
- Import `ShieldCheck` from lucide-react (`Bot` is already imported).
- Remove `{ label: 'AI agent', path: '/settings/ai-agent', icon: Bot }` from the AI group.
- Insert after the Work group:

```ts
  {
    label: 'Agents',
    items: [
      { label: 'Agents', path: '/settings/agents', icon: Bot },
      { label: 'Actions & approvals', path: '/settings/agent-actions', icon: ShieldCheck },
    ],
  },
```

- Update the doc comment: "Agents spec 2026-10-08 §1.8 adds Agents after Work; the AI agent page moved into it."

In `src/pages/settings/routes.tsx`:
- Remove the `AIAgentPage` import.
- Add the imports `AgentsSettingsPage` and `AgentActionsPage`.
- Replace the `ai-agent` route with these, in the order shown:

```tsx
        {/* Agents (Agents spec §1.8): every member opens them; can_edit decides the form. */}
        <Route path="agents" element={el(<AgentsSettingsPage />)} />
        <Route path="agent-actions" element={el(<AgentActionsPage />)} />
```

- Among the redirects at the end of the settings children, add: `<Route path="ai-agent" element={<Navigate to="/settings/agents" replace />} />`.

Delete `src/pages/settings/AIAgentPage.tsx` and `src/pages/settings/AIAgentPage.test.tsx`. Then run `grep -rn "AIAgentPage\|ai-agent" src` and update any test that still names them. The Navbar's own account settings do not link to it.

In `src/features/notifications/types.ts`, add to `NotificationKind`, after `'task_escalated'`:

```ts
  // An agent action someone undid, for whoever approved it (or the record
  // owner, for an Auto one), linking to /work/activity?action=<id>
  // (Agents delivery 1 contract).
  | 'agent_action_undone'
```

In `src/components/layout/NotificationKindIcon.tsx`:
- Import `Undo2`.
- Add `agent_action_undone: Undo2` to `ICONS`.
- Extend the doc comment with "Agents delivery 1".

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/pages/settings src/layouts src/components/layout --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/settings/workspaceSettingsNav.ts src/pages/settings/workspaceSettingsNav.test.ts src/pages/settings/routes.tsx src/pages/settings/routes.test.tsx src/layouts/WorkspaceSettingsLayout.test.tsx src/features/notifications/types.ts src/components/layout/NotificationKindIcon.tsx src/components/layout/NotificationKindIcon.test.tsx
git rm src/pages/settings/AIAgentPage.tsx src/pages/settings/AIAgentPage.test.tsx
git commit -m "feat(settings): the Agents group; AI agent moves into it; the bell's agent_action_undone

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The journey, house rules, docs, and the full check

**Files:**
- Create: `src/e2e/agents.test.tsx`
- Create: `src/components/agents/houseRules.test.ts`
- Modify: `src/components/work/houseRules.test.ts` (add `../../pages/work/Activity.tsx` to `files` and `PAGES`)
- Modify: `src/components/brain/houseRules.test.ts`, if it lists `ProposalDecision.tsx` (remove it)
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`

**Interfaces:**
- **Consumes:** everything above.
- **Produces:** no new product code.

- [ ] **Step 1: The journey**

Create `src/e2e/agents.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ACT_LIFECYCLE } from '../features/agents/testAgentsFixtures';
import { stubAgents } from '../features/agents/testAgents';
import { REC_AGENT_LIFECYCLE } from '../features/work/testWorkFixtures';
import { stubWork } from '../features/work/testWork';
import { renderWork } from '../pages/work/testPages';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom): the real Navbar, WorkRoutes and the router; only
// fetch is stubbed (stubAgents in front of stubWork). Agents spec §6: an
// agent proposes a lifecycle change, the owner applies it in Recommended,
// it shows in Activity, and it is undone.

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
});

describe('Agents: propose, apply, see, undo', () => {
  it('applies the CS agent lifecycle change, finds it in Activity and undoes it', { timeout: 30000 }, async () => {
    const agents = stubAgents({ actions: [ACT_LIFECYCLE] });
    const work = stubWork({ recommendations: [REC_AGENT_LIFECYCLE], passThrough: agents.spy });
    agents.onSettle(() => work.recommendations.clear());
    renderWork('/work/recommended', { nav: true });

    const card = await screen.findByRole('article', { name: 'Move Pizza Hut to Renewal' });
    await userEvent.click(within(card).getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('Applied: Move Pizza Hut to Renewal.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Activity' }));
    const list = await screen.findByRole('list', { name: 'Agent actions' });
    const row = within(list).getByRole('listitem');
    expect(within(row).getByText('Applied by you')).toBeInTheDocument();

    await userEvent.click(within(row).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(within(row).getByText('Undone by you')).toBeInTheDocument());
    expect(screen.getByText('Undone: Move Pizza Hut to Renewal.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: The house rules**

Create `src/components/agents/houseRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { houseRuleSuite, rowsIconsTargetsSuite } from '../../test/houseRules';

// The house rules (revenact-design §4) over every Agents component and the
// Activity page; and, for tokens, targets and copy only (they keep the
// settings frame's own 20px h1), the Agent settings pages and their frame.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const files = {
  ...raw(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/work/Activity.tsx', { query: '?raw', eager: true, import: 'default' })),
};
const settingsPages = raw(
  import.meta.glob(['../../pages/settings/AgentsSettingsPage.tsx', '../../pages/settings/AgentActionsPage.tsx', '../../pages/settings/AgentSettingsFrame.tsx'], {
    query: '?raw',
    eager: true,
    import: 'default',
  }),
);
const copy = {
  ...files,
  ...settingsPages,
  ...raw(
    import.meta.glob(
      ['./*.ts', '../../features/agents/agentTypes.ts', '../../features/agents/agentsApi.ts', '../../features/agents/agentsText.ts', '../../features/agents/testAgents*.ts', '../../features/agents/agents*.test.ts'],
      { query: '?raw', eager: true, import: 'default' },
    ),
  ),
};
// One primary per surface: each settings form's Save changes.
const PRIMARY_OWNERS = ['./AgentsForm.tsx', './ActionsGridForm.tsx'];

houseRuleSuite('agents house rules', files);
rowsIconsTargetsSuite('agents rows, icons and targets', files);
rowsIconsTargetsSuite('agent settings pages: rows, icons and targets', settingsPages);

describe('agents: coverage, primaries, copy', () => {
  it('covers every component, the Activity page and the settings pages', () => {
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        '../../pages/work/Activity.tsx',
        './AgentActionBody.tsx',
        './AgentActionDecision.tsx',
        './UndoAction.tsx',
        './ActivityRow.tsx',
        './ActivitySkeleton.tsx',
        './AgentCard.tsx',
        './AgentsForm.tsx',
        './AgentsSummary.tsx',
        './ActionsGridForm.tsx',
        './ActionsGridSummary.tsx',
      ]),
    );
    expect(Object.keys(settingsPages)).toHaveLength(3);
  });

  it('keeps one primary per settings form and none elsewhere', () => {
    for (const [file, source] of Object.entries(files)) {
      if (file.includes('.test.')) continue;
      if (PRIMARY_OWNERS.includes(file)) expect(source, file).toContain('className={PRIMARY}');
      else expect(source, file).not.toMatch(/\bPRIMARY\b/);
    }
  });

  it('writes no em dash in any Agents file, tests included', () => {
    for (const [file, source] of Object.entries(copy)) expect(source, file).not.toContain('\u2014');
  });

  it('gives every list a skeleton and an error state', () => {
    expect(files['../../pages/work/Activity.tsx']).toContain('<ActivitySkeleton');
    expect(files['../../pages/work/Activity.tsx']).toContain('<ErrorBlock');
    expect(settingsPages['../../pages/settings/AgentSettingsFrame.tsx']).toContain('animate-pulse');
    expect(settingsPages['../../pages/settings/AgentSettingsFrame.tsx']).toContain('<ErrorBlock');
  });
});
```

In `src/components/work/houseRules.test.ts`:
- Add `'../../pages/work/Activity.tsx'` to the `files` glob list and to `PAGES`.
- Include `./Activity.tsx` in the "covers" list if that test enumerates pages.

If `src/components/brain/houseRules.test.ts` names `./ProposalDecision.tsx` in a coverage list, remove it.

- [ ] **Step 3: The docs**

In `docs/03-ui-ux-design.md`:
- Add a "Settings › Agents" and "Actions & approvals" subsection under the Settings section, after Settings › Work. Describe:
  - the cards (budget bar, last run, Run now);
  - the single form;
  - the grid with its caps and "Not used";
  - the read-only member view.
- Add "Work › Activity" under Work: the filters, Undo, `CHANGED_SINCE`, and the hidden line.
- In Recommended, add that agent actions show Apply and Reject, except agent tasks, which keep Assign.
- In Waiting, add the chip "Agent actions".
- In the bell's kinds, add `agent_action_undone` (`Undo2`).

In `docs/04-app-flow.md`:
- Add the routes `/work/activity`, `/settings/agents` and `/settings/agent-actions`, and the redirect `/settings/ai-agent → /settings/agents`.
- Add a short flow: an agent proposes, the owner applies in Recommended or Waiting, it shows in Activity, and Undo works for 7 days.
- Update the settings nav list.

Keep both docs free of em dashes in the new text.

- [ ] **Step 4: The full check**

Run:
```bash
npx vitest run --maxWorkers=2
npm run lint
npm run build
```
Expected: every test passes, lint has 0 errors, and the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/e2e/agents.test.tsx src/components/agents/houseRules.test.ts src/components/work/houseRules.test.ts docs/03-ui-ux-design.md docs/04-app-flow.md
git commit -m "test(agents): the journey and house rules; docs for Agents delivery 1

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Add `src/components/brain/houseRules.test.ts` if you changed it.

---

## Self-review

**Spec coverage (§1.8):**
- Settings › Agents: Task 7, with the move and redirect in Task 9.
- Actions & approvals: Task 8.
- Work › Activity: Task 6.
- Recommended: Task 4.
- Waiting and Ask the agent: Task 5.
- The bell: Task 9.

**Behaviour:**
- §1.4 deciding and its errors: Task 3.
- §1.5 undo and its refusals: Task 3, with its UI in Task 6.
- §1.7 budgets, as display and skip reasons: Tasks 2 and 7.

**§4 to §6:**
- Privacy (hidden counts, evidence only when sent): Tasks 3 and 6.
- Edge cases (expired, already decided, CANT_DECIDE, BUDGET_USED): Tasks 3 and 7.
- Testing (pages, the e2e journey, house rules, phone width): Tasks 4 to 10.

**Names:**
- Each name is defined in the task shown and used where shown:
  - `stubAgents` returns `{ spy, actions, settings, onSettle }` (Task 1), used in Tasks 4, 6 and 10.
  - `AgentActionDecision` takes `onSettled(answer, text)` (Task 3), used in Tasks 4 and 5.
  - `AgentSettingsFrame` takes a `children(settings, onSaved)` render-prop (Task 7), reused in Task 8.
  - `RecRowKind` (Task 4).
  - `AgentActionItem` (Task 5).
- `agentsApi.sent` and `calls` live in `testAgents.ts`. Work's helpers of the same names stay in `testWork.ts`, and each test imports them from the stub it uses.

**Known soft spots, resolved inline:**
- In `AgentActionBody`, `task.create` previews stay plain text. The resolution is written into Task 3 Step 3.
- In Activity, the status `aria-label=""` keeps it apart from the skeleton's status.
- `AgentCard` sets its width with an inline style, with a fallback through a class lookup.
