# Ask Revenact on the Brain (frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the same Ask rail that Organizations, Accounts and Pipelines have beside the four Brain tabs. Each question carries `{surface:'brain', scope, tab}`, and an empty thread offers three fixed starter questions.

**Architecture:** A new `BrainAskLayout` wraps the Brain routes once in `BrainRoutes`, as a layout route with an `<Outlet />`. It draws `BrainFrame` with `<AskRail />` in its `rail` slot. Each page's own `BrainFrame` inside it passes its children straight through (the `OrganizationsFrame` rule), so a tab or scope change never remounts the rail. The tab comes from the route. The scope is reported up by the four tab pages through a small context (`useReportBrainScope`), keyed by pathname, so a report from the page being left never grounds the next one. `AskSurface` gains two optional fields, `unavailable` and `starters`. `AskRail` passes them to `CopilotRail`, which renders them only when given, so every other surface is unchanged. The pure rules live in `src/features/brain/askContext.ts`: the tab of a path, the context, the chip, the History path, the copy and the starters.

**Tech Stack:** React 19, TypeScript, react-router 7, Tailwind v4 tokens, Vitest + Testing Library (jsdom), lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-06-brain-ask-design.md`, §0, §2 and §3 (frontend). Read it together with this plan.

## Global Constraints

- **Backend contract** (built in parallel). A send posts `context: {surface:'brain', scope:'me'|'team'|'company', tab:'changed'|'waiting'|'doing'|'customers'}`, with no focus key. The send view wraps a refused scope as `400 {"context": {"scope": ["You can't ask about that view."]}}` (it wraps every serializer error under `context`; see revenact-backend `services/copilot/views.py`, `SendMessageView`). The stored origin is the context without its focus, so it is `{surface:'brain', scope, tab}`.
- **Other Ask surfaces unchanged.** The Dashboard, Organizations, Contacts, Accounts, Pipelines and Communications must render and send exactly as before. `unavailable` and `starters` are optional and render nothing when absent. A new `surface === 'brain'` branch never changes another surface's result.
- **Tokens only**: no hex, `rgb()`, or named Tailwind palette colours (`src/test/houseRules.ts` `RAW`).
- **Type sizes 11/13/15/22 only** (`text-[11px]`, `text-[13px]`, `text-[15px]`, `text-[22px]`). No named sizes (`text-sm`, …). Every new rail text is `text-[13px]`.
- **44px targets**: every new `<button>` reaches `min-h-11` (the starter buttons included).
- **Copy**: sentence case, and no em dash (`—`) in any copy or comment in a new or edited Brain file. The starter text is exactly the spec's §2.3 text, character for character (straight apostrophes, a `?` at the end).
- Lucide icons only, each with `aria-hidden="true"`. No emoji.
- **Never run prettier. Never use `git stash`.** The stash stack is shared across worktrees, so use a WIP commit if you must set work aside.
- Run Vitest with **`--maxWorkers=2`**, e.g. `npx vitest run <path> --maxWorkers=2`.
- Typecheck with `npx tsc -b` and lint the touched files with `npx eslint <files>` before each commit. `noUnusedLocals` is on, so when an edit stops using an import, delete the import in the same step.
- Commit messages are conventional (`feat(brain): …`, `test(brain): …`, `docs(brain): …`) and end with exactly this trailer line:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- Branch: `feat/brain-ask` in `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/brain-ask`, stacked on `feat/brain-ui`.

## File map

| File | Role |
| --- | --- |
| `src/pages/copilot/types.ts` (modify) | `BrainAskTab`, `BrainAskContext`, `BrainAskOrigin` in the unions |
| `src/features/brain/askContext.ts` (create) | Pure rules: tab of a path, context, chip, History path, copy, starters |
| `src/pages/dashboard/ask/context.ts` (modify) | `withFocus` passes a Brain context through; `AskSurface.unavailable`, `AskSurface.starters` |
| `src/components/copilot/surfaceLabels.ts` (modify) | The chip and the History tag for a Brain context or origin |
| `src/pages/dashboard/ask/originPath.ts` (modify) | The page a Brain conversation reopens |
| `src/pages/dashboard/ask/askPreference.ts` (modify) | `BRAIN_ASK_KEY` |
| `src/components/copilot/CopilotRail.tsx` (modify) | The `unavailable` and `starters` props; the Brain icon in History |
| `src/components/copilot/useCopilotThread.ts` (modify) | The Brain scope refusal copy |
| `src/pages/dashboard/ask/AskRail.tsx` (modify) | Passes `unavailable` and `starters` through |
| `src/components/brain/BrainFrame.tsx` (modify) | Pass-through inside a frame, `scrollKey`, the rail's gutter |
| `src/components/brain/BrainControls.tsx` (modify) | The scope switch sits before the Ask pill in the slot |
| `src/pages/brain/ask/brainScopeReport.ts` (create) | The scope-report context and `useReportBrainScope` |
| `src/pages/brain/ask/BrainAskLayout.tsx` (create) | The provider, the frame and the rail, once above the Brain routes |
| `src/pages/brain/ask/testBrainAsk.ts` (create) | Test-only: the Brain and Copilot fetch stubs behind one fetch |
| `src/pages/brain/BrainRoutes.tsx` (modify) | Wraps the seven pages in `BrainAskLayout` |
| `src/pages/brain/{WhatChanged,Waiting,Doing,Customers}.tsx` (modify) | Each reports its settled scope |
| `src/components/brain/houseRules.test.ts` (modify) | Covers the new Brain Ask files and copy |
| `src/e2e/brainAsk.test.tsx` (create) | End to end: ask on What changed in My team |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md` (modify) | The Brain shape of the Ask rail, and the flow |

---

### Task 1: The Brain context in the shared Ask types and helpers

**Files:**
- Modify: `src/pages/copilot/types.ts` (imports at line 4-5; unions at lines 281-301)
- Create: `src/features/brain/askContext.ts`
- Create: `src/features/brain/askContext.test.ts`
- Modify: `src/pages/dashboard/ask/context.ts:61-81` (`withFocus`)
- Modify: `src/pages/dashboard/ask/context.test.ts`
- Modify: `src/components/copilot/surfaceLabels.ts:27-52`
- Modify: `src/components/copilot/surfaceLabels.test.ts`
- Modify: `src/pages/dashboard/ask/originPath.ts:22-32`
- Modify: `src/pages/dashboard/ask/originPath.test.ts`
- Modify: `src/components/copilot/CopilotRail.tsx:13` (lucide import) and `:319-329` (History icon)
- Modify: `src/components/copilot/HistoryPopover.test.tsx`

**Interfaces:**
- Consumes: `ScopeKey` from `src/features/brain/brainTypes.ts`; `BRAIN_TABS`, `WAITING_TAB` from `src/features/brain/brainTabs.ts`.
- Produces:
  - `export type BrainAskTab = 'changed' | 'waiting' | 'doing' | 'customers'` (in `types.ts`);
  - `export interface BrainAskContext { surface: 'brain'; scope: ScopeKey; tab: BrainAskTab }`;
  - `export type BrainAskOrigin = BrainAskContext`;
  - `SurfaceContext` and `SurfaceOrigin` both include these, so `SurfaceName` now includes `'brain'`.
  - From `features/brain/askContext.ts`:
    - `BRAIN_ASK_PATHS: Record<BrainAskTab, string>`
    - `BRAIN_SCOPE_LABELS: Record<ScopeKey, string>`
    - `brainAskTabOf(pathname: string): BrainAskTab | null`
    - `brainAskContext(tab: BrainAskTab, scope: ScopeKey): BrainAskContext`
    - `brainLabel(context: BrainAskContext | BrainAskOrigin): string`
    - `brainPath(origin: BrainAskOrigin): string`
  - `withFocus` returns a Brain context unchanged (the same object).
  - `surfaceLabel` and `originTag` return `brainLabel(...)` for a Brain context or origin.
  - `originPath` returns `brainPath(...)`.

- [ ] **Step 1: Write the failing unit tests for the pure rules**

Create `src/features/brain/askContext.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BRAIN_ASK_PATHS, brainAskContext, brainAskTabOf, brainLabel, brainPath } from './askContext';

describe('Ask on the Brain: the rules (brain ask spec §2.1, §2.2)', () => {
  it('reads the question from the four tab paths only', () => {
    expect(brainAskTabOf('/brain')).toBe('changed');
    expect(brainAskTabOf('/brain/')).toBe('changed');
    expect(brainAskTabOf('/brain/waiting')).toBe('waiting');
    expect(brainAskTabOf('/brain/doing')).toBe('doing');
    expect(brainAskTabOf('/brain/customers')).toBe('customers');
    // Feature Requests, Anomalies and the Graph have no Ask context (spec §2.2, §4).
    expect(brainAskTabOf('/brain/requests')).toBeNull();
    expect(brainAskTabOf('/brain/anomalies')).toBeNull();
    expect(brainAskTabOf('/brain/graph')).toBeNull();
    expect(brainAskTabOf('/brainstorm')).toBeNull();
  });

  it('builds the context the server reads: surface, scope and tab, and no focus', () => {
    expect(brainAskContext('waiting', 'team')).toEqual({ surface: 'brain', scope: 'team', tab: 'waiting' });
  });

  it('chips a question with the tab title and the scope label', () => {
    expect(brainLabel({ surface: 'brain', scope: 'company', tab: 'changed' })).toBe('Brain · What changed · Company');
    expect(brainLabel({ surface: 'brain', scope: 'team', tab: 'waiting' })).toBe('Brain · Waiting on you · My team');
    expect(brainLabel({ surface: 'brain', scope: 'me', tab: 'doing' })).toBe("Brain · What's being done · Me");
    expect(brainLabel({ surface: 'brain', scope: 'me', tab: 'customers' })).toBe('Brain · Customers · Me');
  });

  it('reopens a conversation on its tab, with its scope', () => {
    expect(brainPath({ surface: 'brain', scope: 'team', tab: 'changed' })).toBe('/brain?scope=team');
    expect(brainPath({ surface: 'brain', scope: 'company', tab: 'customers' })).toBe('/brain/customers?scope=company');
    expect(BRAIN_ASK_PATHS).toEqual({ changed: '/brain', waiting: '/brain/waiting', doing: '/brain/doing', customers: '/brain/customers' });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/features/brain/askContext.test.ts --maxWorkers=2`
Expected: FAIL with `Failed to resolve import "./askContext"`.

- [ ] **Step 3: Add the types**

In `src/pages/copilot/types.ts`, add this import below the two existing `import type` lines (lines 4-5):

```ts
import type { ScopeKey } from '../../features/brain/brainTypes';
```

Insert this block immediately above the line `/** Every structured context a question can carry, told apart by \`surface\``:

```ts
/** The four Brain questions a question can be asked on (brain ask spec
 *  2026-10-06 §2.1). Feature Requests, Anomalies and the Graph have none. */
export type BrainAskTab = 'changed' | 'waiting' | 'doing' | 'customers';

/** A question asked on a Brain tab: the scope the page settled on and the
 *  tab. No focus in this delivery, and never a figure or a name: the server
 *  rebuilds the tab's payload for the asker. */
export interface BrainAskContext {
  surface: 'brain';
  scope: ScopeKey;
  tab: BrainAskTab;
}

/** A conversation's first Brain context. It has no focus to drop, so it is
 *  the context itself. */
export type BrainAskOrigin = BrainAskContext;

```

Replace the two unions:

```ts
export type SurfaceContext =
  | DashboardContext
  | OrganizationsContext
  | OrganizationDetailContext
  | ContactsListContext
  | ContactsPersonContext
  | AccountsListContext
  | AccountDetailContext
  | PipelinesContext;
export type SurfaceOrigin =
  | DashboardOrigin
  | OrganizationsOrigin
  | OrganizationDetailOrigin
  | ContactsListOrigin
  | ContactsPersonOrigin
  | AccountsListOrigin
  | AccountDetailOrigin
  | PipelinesOrigin;
```

with:

```ts
export type SurfaceContext =
  | DashboardContext
  | OrganizationsContext
  | OrganizationDetailContext
  | ContactsListContext
  | ContactsPersonContext
  | AccountsListContext
  | AccountDetailContext
  | PipelinesContext
  | BrainAskContext;
export type SurfaceOrigin =
  | DashboardOrigin
  | OrganizationsOrigin
  | OrganizationDetailOrigin
  | ContactsListOrigin
  | ContactsPersonOrigin
  | AccountsListOrigin
  | AccountDetailOrigin
  | PipelinesOrigin
  | BrainAskOrigin;
```

- [ ] **Step 4: Create the pure rules**

Create `src/features/brain/askContext.ts`:

```ts
// Ask Revenact on the Brain (brain ask spec 2026-10-06 §2): which of the four
// questions a path shows, the context a question carries, its chip, and the
// page a History pick reopens. Kept free of React so the rules are
// unit-tested on their own.
import type { BrainAskContext, BrainAskOrigin, BrainAskTab } from '../../pages/copilot/types';
import { BRAIN_TABS, WAITING_TAB } from './brainTabs';
import type { ScopeKey } from './brainTypes';

const SEPARATOR = ' · ';

/** Each question's tab, as the Brain bar links it. */
export const BRAIN_ASK_PATHS: Record<BrainAskTab, string> = {
  changed: '/brain',
  waiting: WAITING_TAB,
  doing: '/brain/doing',
  customers: '/brain/customers',
};

/** The scope names the server's scopes/ read gives (brain.scope), so a stored
 *  turn's chip reads the same as the switch without a read of its own. */
export const BRAIN_SCOPE_LABELS: Record<ScopeKey, string> = { me: 'Me', team: 'My team', company: 'Company' };

const TAB_PATHS: readonly [BrainAskTab, RegExp][] = [
  ['changed', /^\/brain\/?$/],
  ['waiting', /^\/brain\/waiting\/?$/],
  ['doing', /^\/brain\/doing\/?$/],
  ['customers', /^\/brain\/customers\/?$/],
];

/** The question a Brain path shows; null on Feature Requests, Anomalies, the
 *  Graph and anywhere else (brainTabOf lights Customers on two of those, but
 *  they have no Ask context in this delivery). */
export function brainAskTabOf(pathname: string): BrainAskTab | null {
  return TAB_PATHS.find(([, path]) => path.test(pathname))?.[0] ?? null;
}

/** Where the person is on the Brain, as the server needs it. */
export function brainAskContext(tab: BrainAskTab, scope: ScopeKey): BrainAskContext {
  return { surface: 'brain', scope, tab };
}

/** "Brain · What changed · Company": the tab title, then the scope label. */
export function brainLabel(context: BrainAskContext | BrainAskOrigin): string {
  const title = BRAIN_TABS.find((tab) => tab.path === BRAIN_ASK_PATHS[context.tab])?.label;
  return ['Brain', title, BRAIN_SCOPE_LABELS[context.scope]].filter(Boolean).join(SEPARATOR);
}

/** The tab a Brain conversation started on, with its scope. */
export function brainPath(origin: BrainAskOrigin): string {
  return `${BRAIN_ASK_PATHS[origin.tab]}?${new URLSearchParams({ scope: origin.scope }).toString()}`;
}
```

- [ ] **Step 5: Run the pure-rule tests**

Run: `npx vitest run src/features/brain/askContext.test.ts --maxWorkers=2`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the failing tests for the shared helpers**

Append to the `describe('withFocus', …)` block in `src/pages/dashboard/ask/context.test.ts` (inside the block, after its last `it`):

```ts
  it('passes a Brain context through unchanged: there is no focus on the Brain yet', () => {
    const brain = { surface: 'brain', scope: 'team', tab: 'changed' } as const;
    expect(withFocus(brain, { kind: 'companies', ids: [7] })).toBe(brain);
    expect(withFocus(brain, null)).toBe(brain);
  });
```

Append to the `describe('surface labels', …)` block in `src/components/copilot/surfaceLabels.test.ts`:

```ts
  it('names a Brain question, and tags a Brain conversation, with the tab and the scope', () => {
    const brain = { surface: 'brain', scope: 'company', tab: 'changed' } as const;
    expect(surfaceLabel(brain)).toBe('Brain · What changed · Company');
    expect(originTag({ origin: { surface: 'brain', scope: 'team', tab: 'doing' } })).toBe("Brain · What's being done · My team");
  });
```

Append to the `describe('originPath', …)` block in `src/pages/dashboard/ask/originPath.test.ts`:

```ts
  it('reopens a Brain conversation on its tab, with its scope', () => {
    expect(originPath({ surface: 'brain', scope: 'team', tab: 'changed' })).toBe('/brain?scope=team');
    expect(originPath({ surface: 'brain', scope: 'me', tab: 'waiting' })).toBe('/brain/waiting?scope=me');
  });
```

Append to the `describe('HistoryPopover', …)` block in `src/components/copilot/HistoryPopover.test.tsx`:

```ts
  it('tags a conversation started on the Brain with its tab and scope, and the Brain icon', async () => {
    stubCopilot({
      conversations: [
        { id: 21, title: 'Why did these numbers move?', created_at: '', updated_at: '', origin: { surface: 'brain', scope: 'team', tab: 'changed' } },
      ],
    });
    render(<HistoryPopover onClose={() => {}} onOpen={() => {}} />);
    const tagged = await screen.findByRole('button', { name: /Why did these numbers move\?/ });
    expect(within(tagged).getByText('Brain · What changed · My team')).toBeInTheDocument();
    expect(tagged).toHaveAccessibleName(/Why did these numbers move\?\s*Started on Brain · What changed · My team/);
    expect(tagged.querySelector('svg.lucide-brain')).not.toBeNull();
  });
```

- [ ] **Step 7: Run them to make sure they fail**

Run: `npx vitest run src/pages/dashboard/ask/context.test.ts src/components/copilot/surfaceLabels.test.ts src/pages/dashboard/ask/originPath.test.ts src/components/copilot/HistoryPopover.test.tsx --maxWorkers=2`
Expected: FAIL. `withFocus` returns `{…, focus: null}` (a new object), `surfaceLabel` and `originTag` return Organizations wording, `originPath` returns an Organizations path, and the History item has no `svg.lucide-brain`.

- [ ] **Step 8: Teach the helpers the Brain**

In `src/pages/dashboard/ask/context.ts`, make the first statement of `withFocus` (before `if (context.surface === 'pipelines') {`):

```ts
  // The Brain takes no focus in this delivery (brain ask spec §1.1, §4).
  if (context.surface === 'brain') return context;
```

and add this sentence at the end of the doc comment above `withFocus`, just before its closing `*/`: ` A Brain question takes none.`

In `src/components/copilot/surfaceLabels.ts`, add the import:

```ts
import { brainLabel } from '../../features/brain/askContext';
```

Make the first statement of `surfaceLabel`:

```ts
  if (context.surface === 'brain') return brainLabel(context);
```

and the first statement of `originTag` after `if (!origin) return null;`:

```ts
  // A Brain origin carries no server label: the tab and scope name it.
  if (origin.surface === 'brain') return brainLabel(origin);
```

In `src/pages/dashboard/ask/originPath.ts`, add the import:

```ts
import { brainPath } from '../../../features/brain/askContext';
```

and make the first statement of `originPath`:

```ts
  if (origin.surface === 'brain') return brainPath(origin);
```

In `src/components/copilot/CopilotRail.tsx`, change line 13 to:

```ts
import { Brain, ChevronDown, Clock, Layers, LayoutDashboard, MessageSquare, Network, Plus, Search, Target, Users, X } from 'lucide-react';
```

and replace:

```tsx
                        ) : c.origin.surface === 'pipelines' ? (
                          <Target className="w-3 h-3 shrink-0" aria-hidden="true" />
                        ) : (
```

with:

```tsx
                        ) : c.origin.surface === 'pipelines' ? (
                          <Target className="w-3 h-3 shrink-0" aria-hidden="true" />
                        ) : c.origin.surface === 'brain' ? (
                          <Brain className="w-3 h-3 shrink-0" aria-hidden="true" />
                        ) : (
```

- [ ] **Step 9: Run the tests, the typecheck and the lint**

Run: `npx vitest run src/features/brain/askContext.test.ts src/pages/dashboard/ask src/components/copilot --maxWorkers=2`
Expected: PASS. Every existing test in those folders still passes, which is the "other Ask surfaces unchanged" check.

Run: `npx tsc -b && npx eslint src/pages/copilot/types.ts src/features/brain/askContext.ts src/features/brain/askContext.test.ts src/pages/dashboard/ask/context.ts src/components/copilot/surfaceLabels.ts src/pages/dashboard/ask/originPath.ts src/components/copilot/CopilotRail.tsx`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/pages/copilot/types.ts src/features/brain/askContext.ts src/features/brain/askContext.test.ts src/pages/dashboard/ask/context.ts src/pages/dashboard/ask/context.test.ts src/components/copilot/surfaceLabels.ts src/components/copilot/surfaceLabels.test.ts src/pages/dashboard/ask/originPath.ts src/pages/dashboard/ask/originPath.test.ts src/components/copilot/CopilotRail.tsx src/components/copilot/HistoryPopover.test.tsx
git commit -m "$(cat <<'EOF'
feat(brain): the Brain Ask context in the shared Ask types and helpers

BrainAskContext {surface:'brain', scope, tab} and its origin join the
unions; withFocus passes it through, the chip and History tag read
"Brain · What changed · Company", and History reopens the tab with its
scope, tagged with the Brain icon.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: BrainAskLayout above the Brain routes, fed by the pages' scope

**Files:**
- Create: `src/pages/brain/ask/brainScopeReport.ts`
- Create: `src/pages/brain/ask/BrainAskLayout.tsx`
- Create: `src/pages/brain/ask/testBrainAsk.ts`
- Create: `src/pages/brain/ask/BrainAskLayout.test.tsx`
- Modify: `src/pages/brain/BrainRoutes.tsx`
- Modify: `src/pages/brain/WhatChanged.tsx:26-27`, `Waiting.tsx:25-26`, `Doing.tsx:49-50`, `Customers.tsx:47-48`
- Modify: `src/components/brain/BrainFrame.tsx`, `src/components/brain/BrainFrame.test.tsx`
- Modify: `src/components/brain/BrainControls.tsx:20`, `src/components/brain/BrainControls.test.tsx`
- Modify: `src/pages/dashboard/ask/askPreference.ts`
- Modify: `src/pages/dashboard/ask/context.ts` (`AskSurface`)
- Modify: `src/pages/dashboard/ask/AskRail.tsx:82-93` (`railProps`)
- Modify: `src/components/copilot/CopilotRail.tsx` (`unavailable` prop), `src/components/copilot/CopilotRail.test.tsx`
- Modify: `src/features/brain/askContext.ts` (append `ASK_AFTER_SCOPE`)
- Modify: `src/pages/brain/Graph.test.tsx` (two `complementary` queries)

**Interfaces:**
- Consumes: `brainAskContext`, `brainAskTabOf` and `BRAIN_ASK_PATHS` from Task 1; `surfaceLabel` (which now chips Brain contexts); `AskProvider`, `AskRail`, `same`.
- Produces:
  - `BrainScopeReport { path: string; scope: ScopeKey | null }`
  - `BrainScopeReportContext: Context<((report: BrainScopeReport) => void) | null>`
  - `useReportBrainScope(scope: ScopeKey | null): void`
  - `BrainAskLayout(): JSX.Element`
  - `BRAIN_ASK_KEY = 'revenact_brain_ask'`
  - `ASK_AFTER_SCOPE = 'Ask opens once this view loads.'`
  - `AskSurface.unavailable?: string | null`
  - `CopilotRailProps.unavailable?: string | null`
  - `BrainFrame({ rail?, scrollKey?, children })`
  - Test-only: `stubBrainAsk({ brain?, copilot? }): { brain, copilot, release }`, where `copilot` is the Copilot stub's spy, for `postedBodies(copilot)`.

- [ ] **Step 1: Write the failing CopilotRail test for `unavailable`**

Append inside `describe('CopilotRail', …)` in `src/components/copilot/CopilotRail.test.tsx`:

```ts
  it('says why nothing can be asked yet, and sends nothing', async () => {
    const { spy } = stubCopilot();
    renderRail({ context: null, unavailable: 'Ask opens once this view loads.' });
    expect(screen.getByText('Ask opens once this view loads.')).toHaveClass('text-[13px]', 'text-ink-muted');
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'Hello?{enter}');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(postedBodies(spy)).toEqual([]);
  });

  it('shows no such line when every question can be asked', () => {
    renderRail({ context: { kind: 'surface', context: DASH, label: 'Revenue › Forecast' } });
    expect(screen.queryByText('Ask opens once this view loads.')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/components/copilot/CopilotRail.test.tsx --maxWorkers=2`
Expected: FAIL. The line is not rendered, and the Enter posts `{content: 'Hello?'}`.

- [ ] **Step 3: Add `unavailable` to CopilotRail, AskSurface and AskRail**

In `src/components/copilot/CopilotRail.tsx`, add to `CopilotRailProps` after `onDraftEdited?: () => void;`:

```ts
  /** Why nothing can be asked here now (the Brain, before its scope
   *  settles or off its four tabs). Said above the composer, which then
   *  sends nothing. Absent on every other surface. */
  unavailable?: string | null;
```

Add `unavailable = null,` to the destructured props, after `onDraftEdited,`.

Make the first statement of `async function send(text: string) {`:

```ts
    if (unavailable) return;
```

Insert immediately above `<AskRevenactBox`:

```tsx
          {unavailable ? <p className="px-1 pb-1.5 text-[13px] text-ink-muted">{unavailable}</p> : null}
```

and change the composer's `disabled={Boolean(pending)}` to:

```tsx
            disabled={Boolean(pending) || Boolean(unavailable)}
```

In `src/pages/dashboard/ask/context.ts`, add to `AskSurface` after `chipLabel`:

```ts
  /** Why nothing can be asked on this page now, said in the composer (the
   *  Brain: a scope still settling, or a page off its four tabs). Absent or
   *  null: asking works as usual. */
  unavailable?: string | null;
```

In `src/pages/dashboard/ask/AskRail.tsx`, add to `railProps` after `onDraftEdited: ask.markDraftEdited,`:

```ts
    unavailable: ask.surface.unavailable ?? null,
```

- [ ] **Step 4: Run the CopilotRail and Ask tests**

Run: `npx vitest run src/components/copilot src/pages/dashboard/ask --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Write the failing BrainFrame and BrainControls tests**

Append inside `describe('BrainFrame (brain UI spec §1.4)', …)` in `src/components/brain/BrainFrame.test.tsx`:

```ts
  it("passes a page's own frame straight through inside the layout's, so the column and the rail are drawn once", () => {
    render(
      <BrainFrame rail={<aside aria-label="Ask">rail</aside>}>
        <BrainFrame>
          <p>Body</p>
        </BrainFrame>
      </BrainFrame>,
    );
    expect(document.querySelectorAll('[data-brain-frame]')).toHaveLength(1);
    expect(screen.getByText('Body').parentElement).toHaveClass('@container');
  });

  it('starts another page at the top of the shared column, and keeps the place within one', () => {
    const { rerender } = render(
      <BrainFrame scrollKey="/brain">
        <p>Body</p>
      </BrainFrame>,
    );
    const column = document.querySelector('[data-brain-frame]') as HTMLElement;
    column.scrollTop = 600;
    rerender(
      <BrainFrame scrollKey="/brain">
        <p>Body again</p>
      </BrainFrame>,
    );
    expect(column.scrollTop).toBe(600);
    rerender(
      <BrainFrame scrollKey="/brain/waiting">
        <p>Body</p>
      </BrainFrame>,
    );
    expect(column.scrollTop).toBe(0);
  });

  it('keeps the 16px gutter right of and below the rail from sm, and never on the phone sheet', () => {
    render(
      <BrainFrame rail={<aside aria-label="Ask">rail</aside>}>
        <p>Body</p>
      </BrainFrame>,
    );
    const frame = (document.querySelector('[data-brain-frame]') as HTMLElement).parentElement as HTMLElement;
    expect(frame).toHaveClass('sm:[&>:not([data-brain-frame])]:mr-4', 'sm:[&>:not([data-brain-frame])]:mb-4');
    expect(frame.className).not.toMatch(/(^|\s)\[&>/);
  });
```

Append inside `describe('BrainControls (brain UI spec §1.2)', …)` in `src/components/brain/BrainControls.test.tsx`:

```ts
  it('sits before the Ask pill in the slot, whichever mounted first (brain ask spec §2.2)', () => {
    setViewport(1440);
    render(
      <SlotHost bare>
        <BrainControls brain={brain()} />
      </SlotHost>,
    );
    expect(document.querySelector('[data-brain-controls="bar"]')).toHaveClass('order-first', 'mr-3');
  });
```

- [ ] **Step 6: Run them to make sure they fail**

Run: `npx vitest run src/components/brain/BrainFrame.test.tsx src/components/brain/BrainControls.test.tsx --maxWorkers=2`
Expected: FAIL. Two `[data-brain-frame]` are drawn, the scroll stays at 600, the gutter classes are missing, and `order-first` is missing.

- [ ] **Step 7: Make BrainFrame a pass-through inside a frame, and order the slot**

Replace the whole of `src/components/brain/BrainFrame.tsx` with:

```tsx
import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';

/** Set inside the frame BrainAskLayout draws, so a page's own BrainFrame
 *  inside it renders just its content rather than a second frame (the
 *  OrganizationsFrame rule). */
const InFrame = createContext(false);

/** From sm the rail, the frame's only child besides the column, keeps the
 *  16px gutter on its right and below, as OrganizationsFrame's px-4 pb-4
 *  gives it. Below sm the rail is a fixed full-screen sheet, which a margin
 *  would shrink, so none applies there. */
const RAIL_GUTTER = 'sm:[&>:not([data-brain-frame])]:mr-4 sm:[&>:not([data-brain-frame])]:mb-4';

/** Every Brain route's body (brain UI spec 2026-10-06 §1.4): one full-width
 *  column under the transparent Brain bar that owns its scroll, a 16px
 *  gutter, no centred column and no max width, as OrganizationsFrame lays
 *  out the Organizations list. BrainAskLayout draws it once above every
 *  Brain route, with Ask Revenact in `rail` beside the column and outside
 *  its scroll (brain ask spec §2.2), so a tab change never remounts the
 *  rail. A page's own frame inside passes its content through; on its own
 *  (a page rendered alone) it draws the frame without a rail. `scrollKey`
 *  is the page in the shared column: when it changes the column starts at
 *  the top, and a scope or section change within one page keeps its place. */
export function BrainFrame({ rail = null, scrollKey = null, children }: { rail?: ReactNode; scrollKey?: string | null; children: ReactNode }) {
  const inFrame = useContext(InFrame);
  const column = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (column.current) column.current.scrollTop = 0;
  }, [scrollKey]);
  if (inFrame) return <>{children}</>;
  return (
    <InFrame.Provider value={true}>
      <div className={`relative flex min-h-0 w-full flex-1 gap-3 ${RAIL_GUTTER}`}>
        <div ref={column} data-brain-frame="" className="h-full min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="@container flex flex-col gap-4 px-4 pb-6">{children}</div>
        </div>
        {rail}
      </div>
    </InFrame.Provider>
  );
}
```

In `src/components/brain/BrainControls.tsx`, change line 20 from:

```tsx
      <div data-brain-controls="bar" className="flex items-center gap-3">
```

to:

```tsx
      <div data-brain-controls="bar" className="order-first mr-3 flex items-center gap-3">
```

and add this sentence to the end of its doc comment, before `*/`: ` In the bar it sits first, left of the Ask pill: the slot is a flex row, and the pill may portal in before the scope settles.`

- [ ] **Step 8: Run the frame and controls tests**

Run: `npx vitest run src/components/brain/BrainFrame.test.tsx src/components/brain/BrainControls.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 9: Write the test-only stub and the failing layout tests**

Create `src/pages/brain/ask/testBrainAsk.ts`:

```ts
// Test-only: the Brain's stub and the Copilot's behind one fetch, so a Brain
// page and its Ask rail run on the real store and router with only fetch
// stubbed. /copilot/ goes to the Copilot's (testCopilot, in the backend's
// shapes), everything else to the Brain's (testBrain).
import { vi } from 'vitest';
import { stubCopilot } from '../../../components/copilot/testCopilot';
import { stubBrain, type BrainStub } from '../../../features/brain/testBrain';

export function stubBrainAsk({ brain = {}, copilot = {} }: { brain?: BrainStub; copilot?: Parameters<typeof stubCopilot>[0] } = {}) {
  const asked = stubCopilot(copilot);
  const read = stubBrain(brain);
  const spy = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    String(input).includes('/copilot/') ? asked.spy(String(input), init) : read.spy(input, init),
  );
  vi.stubGlobal('fetch', spy);
  return { brain: read, copilot: asked.spy, release: asked.release };
}
```

Create `src/pages/brain/ask/BrainAskLayout.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { ASK_AFTER_SCOPE } from '../../../features/brain/askContext';
import { SAY } from '../../../features/brain/brainText';
import { resetViewport } from '../../../test/viewport';
import { renderBrain } from '../testPages';
import { stubBrainAsk } from './testBrainAsk';

// Integration tier: the real Brain pages under BrainAskLayout, the real
// store and router; only fetch is stubbed (stubBrainAsk).
const rail = () => screen.getByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');
const where = () => screen.getByTestId('where').textContent;
const asked = (spy: Parameters<typeof postedBodies>[0]) => postedBodies(spy).map((body) => [body.content, body.context]);
const settled = () => waitFor(() => expect(within(rail()).queryByText(ASK_AFTER_SCOPE)).toBeNull());

describe('BrainAskLayout (brain ask spec §2.2)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('asks from the tab in the route and the scope the page settled on', async () => {
    const { copilot } = stubBrainAsk();
    renderBrain('/brain?scope=team');
    await screen.findByText('Since 30 Sep month-end');
    await settled();
    await userEvent.type(composer(), 'Why?{Enter}');
    expect(await screen.findByText('Answer to: Why?')).toBeInTheDocument();
    expect(asked(copilot)).toEqual([['Why?', { surface: 'brain', scope: 'team', tab: 'changed' }]]);
  });

  it('follows a tab change and a scope change in one rail and one conversation, never remounted', { timeout: 30000 }, async () => {
    const { copilot } = stubBrainAsk();
    renderBrain('/brain?scope=team', { nav: true });
    await screen.findByText('Since 30 Sep month-end');
    await settled();
    await userEvent.type(composer(), 'Why?{Enter}');
    await screen.findByText('Answer to: Why?');
    const before = rail();

    await userEvent.click(within(screen.getByRole('navigation', { name: 'Brain' })).getByRole('link', { name: /^Waiting on you/ }));
    await waitFor(() => expect(where()).toBe('/brain/waiting?scope=team'));
    await settled();
    await userEvent.type(composer(), 'What first?{Enter}');
    await screen.findByText('Answer to: What first?');

    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    await waitFor(() => expect(where()).toBe('/brain/waiting?scope=company'));
    await settled();
    await userEvent.type(composer(), 'And the company?{Enter}');
    await screen.findByText('Answer to: And the company?');

    expect(rail()).toBe(before);
    expect(screen.getByText('Answer to: Why?')).toBeInTheDocument();
    expect(asked(copilot)).toEqual([
      ['Why?', { surface: 'brain', scope: 'team', tab: 'changed' }],
      ['What first?', { surface: 'brain', scope: 'team', tab: 'waiting' }],
      ['And the company?', { surface: 'brain', scope: 'company', tab: 'waiting' }],
    ]);
  });

  it('sends nothing before the scope settles, and the composer says so', async () => {
    const { copilot } = stubBrainAsk({ brain: { failScopes: 1 } });
    renderBrain('/brain');
    expect(await screen.findByText(SAY.LOAD_SCOPES)).toBeInTheDocument();
    expect(within(rail()).getByText(ASK_AFTER_SCOPE)).toBeInTheDocument();
    await userEvent.type(composer(), 'Why?{Enter}');
    expect(postedBodies(copilot)).toEqual([]);
  });

  it('draws one frame, with the rail beside its column', async () => {
    stubBrainAsk();
    renderBrain('/brain?scope=team');
    await screen.findByText('Since 30 Sep month-end');
    expect(document.querySelectorAll('[data-brain-frame]')).toHaveLength(1);
    expect(document.querySelector('[data-brain-frame]')!.nextElementSibling).toContainElement(rail());
  });
});
```

- [ ] **Step 10: Run them to make sure they fail**

Run: `npx vitest run src/pages/brain/ask/BrainAskLayout.test.tsx --maxWorkers=2`
Expected: FAIL. `ASK_AFTER_SCOPE` is not exported, and once it is, there is no `complementary` named "Ask Revenact".

- [ ] **Step 11: Add the copy, the preference key, the report context and the layout**

Append to `src/features/brain/askContext.ts`:

```ts

/** The composer, while the page's scope is still settling (spec §2.2). */
export const ASK_AFTER_SCOPE = 'Ask opens once this view loads.';
```

Append to `src/pages/dashboard/ask/askPreference.ts`, after `PIPELINES_ASK_KEY`:

```ts
/** The Brain's rail keeps its own choice too. */
export const BRAIN_ASK_KEY = 'revenact_brain_ask';
```

Create `src/pages/brain/ask/brainScopeReport.ts`:

```ts
import { createContext, useContext, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { ScopeKey } from '../../../features/brain/brainTypes';

/** A Brain page's settled scope, with the path it settled on: BrainAskLayout
 *  uses it only while that path is the one on screen, so a report from the
 *  page being left never grounds a question on the next. */
export interface BrainScopeReport {
  path: string;
  scope: ScopeKey | null;
}

/** Each of the four Brain tabs reports its scope here (brain ask spec §2.2),
 *  as Organizations' pages report their filter options. Null outside
 *  BrainAskLayout. */
export const BrainScopeReportContext = createContext<((report: BrainScopeReport) => void) | null>(null);

/** Report `scope` (null until it settles) for the path on screen. */
export function useReportBrainScope(scope: ScopeKey | null): void {
  const report = useContext(BrainScopeReportContext);
  const { pathname } = useLocation();
  useEffect(() => {
    if (report) report({ path: pathname, scope });
  }, [report, pathname, scope]);
}
```

Create `src/pages/brain/ask/BrainAskLayout.tsx`:

```tsx
import { useCallback, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BrainFrame } from '../../../components/brain/BrainFrame';
import { surfaceLabel } from '../../../components/copilot/surfaceLabels';
import { ASK_AFTER_SCOPE, brainAskContext, brainAskTabOf } from '../../../features/brain/askContext';
import { same } from '../../../lib/same';
import type { SurfaceContext } from '../../copilot/types';
import { BRAIN_ASK_KEY } from '../../dashboard/ask/askPreference';
import { AskProvider } from '../../dashboard/ask/AskProvider';
import { AskRail } from '../../dashboard/ask/AskRail';
import type { AskSurface } from '../../dashboard/ask/context';
import { BrainScopeReportContext, type BrainScopeReport } from './brainScopeReport';

/** A Brain question's chip names only the tab and the scope, so it needs no
 *  names reported from a page; one function, so AskProvider's value doesn't churn. */
const chipLabel = (asked: SurfaceContext) => surfaceLabel(asked);

/** The Brain routes' Ask (brain ask spec §2.2): one conversation above every
 *  Brain page, through every tab and scope change. The frame and its rail
 *  (with the pill) sit here, beside the Outlet, so the rail is never
 *  remounted; each page's own BrainFrame inside passes its content straight
 *  through. The tab comes from the route and the scope from the page, once
 *  it settles; until then the context is null and the rail sends nothing. */
export function BrainAskLayout() {
  const { pathname } = useLocation();
  const [reported, setReported] = useState<BrainScopeReport | null>(null);
  const report = useCallback((next: BrainScopeReport) => setReported((prev) => same<BrainScopeReport | null>(prev, next)), []);
  const tab = brainAskTabOf(pathname);
  const scope = reported !== null && reported.path === pathname ? reported.scope : null;
  const context = useMemo(() => (tab !== null && scope !== null ? brainAskContext(tab, scope) : null), [tab, scope]);
  const surface: AskSurface = useMemo(
    () => ({ name: 'brain', context, chipLabel, unavailable: context === null ? ASK_AFTER_SCOPE : null }),
    [context],
  );
  return (
    <BrainScopeReportContext.Provider value={report}>
      <AskProvider surface={surface} preferenceKey={BRAIN_ASK_KEY}>
        <BrainFrame rail={<AskRail />} scrollKey={pathname}>
          <Outlet />
        </BrainFrame>
      </AskProvider>
    </BrainScopeReportContext.Provider>
  );
}
```

- [ ] **Step 12: Wrap the Brain routes, and report the scope from the four tabs**

Replace the body of `BrainRoutes` in `src/pages/brain/BrainRoutes.tsx` and add the import `import { BrainAskLayout } from './ask/BrainAskLayout';`:

```tsx
export function BrainRoutes() {
  return (
    <Routes>
      <Route element={<BrainAskLayout />}>
        <Route index element={<WhatChangedPage />} />
        <Route path="waiting" element={<WaitingPage />} />
        <Route path="doing" element={<DoingPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="graph" element={<GraphPage />} />
        <Route path="requests" element={<FeatureRequestsPage />} />
        <Route path="anomalies" element={<AnomaliesPage />} />
      </Route>
      <Route path="review" element={<Navigate to="/brain/waiting" replace />} />
      <Route path="initiatives" element={<Navigate to="/brain/doing?section=initiatives" replace />} />
      <Route path="dashboard" element={<Navigate to="/brain" replace />} />
      <Route path="agents" element={<Navigate to="/settings/ai-usage" replace />} />
      <Route path="skills" element={<Navigate to="/settings/ai-skills" replace />} />
      <Route path="feedback" element={<Navigate to="/settings/ai-feedback" replace />} />
      <Route path="*" element={<Navigate to="/brain" replace />} />
    </Routes>
  );
}
```

Add one sentence to its doc comment before `*/`: ` Every page sits under BrainAskLayout (brain ask spec §2.2): one Ask rail and one conversation across all of them; the redirects sit outside it.`

In each of `src/pages/brain/WhatChanged.tsx`, `Waiting.tsx`, `Doing.tsx` and `Customers.tsx`, add the import:

```ts
import { useReportBrainScope } from './ask/brainScopeReport';
```

and add this line directly below `const brain = useBrainScope();`:

```ts
  useReportBrainScope(brain.scope);
```

Feature Requests, Anomalies and the Graph do not report (spec §2.2: no Ask context there).

- [ ] **Step 13: Narrow the Graph test's two bare `complementary` queries**

The rail is a `complementary` region too. In `src/pages/brain/Graph.test.tsx`, replace both occurrences (lines 35 and 116, identical text) of:

```ts
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
```

with:

```ts
    expect(screen.queryByRole('complementary', { name: /^Details for/ })).not.toBeInTheDocument();
```

- [ ] **Step 14: Run the layout tests and the whole Brain suite**

Run: `npx vitest run src/pages/brain/ask/BrainAskLayout.test.tsx --maxWorkers=2`
Expected: PASS (4 tests).

Run: `npx vitest run src/pages/brain src/components/brain src/features/brain src/e2e/brain.test.tsx src/e2e/rules.test.tsx src/components/layout src/layouts --maxWorkers=2`
Expected: PASS. If a page test now fails only because the rail's own controls or region match a query (a bare role query with no name), narrow that query by name as in Step 13, and change nothing else.

Run: `npx tsc -b && npx eslint src/pages/brain src/components/brain src/components/copilot/CopilotRail.tsx src/pages/dashboard/ask src/features/brain/askContext.ts`
Expected: no errors.

- [ ] **Step 15: Commit**

```bash
git add src/pages/brain src/components/brain/BrainFrame.tsx src/components/brain/BrainFrame.test.tsx src/components/brain/BrainControls.tsx src/components/brain/BrainControls.test.tsx src/pages/dashboard/ask/askPreference.ts src/pages/dashboard/ask/context.ts src/pages/dashboard/ask/AskRail.tsx src/components/copilot/CopilotRail.tsx src/components/copilot/CopilotRail.test.tsx src/features/brain/askContext.ts
git commit -m "$(cat <<'EOF'
feat(brain): Ask Revenact beside the Brain, grounded in tab and scope

BrainAskLayout wraps every Brain page once: one AskProvider
(revenact_brain_ask), BrainFrame with AskRail in its rail, the page's
own frame passed through. The four tabs report their settled scope; until
it settles the context is null and the composer says so and sends nothing.
The scope switch sits left of the Ask pill in the bar.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The chip in the rail, the "ask from a tab" state, the refusal and the phone sheet

**Files:**
- Modify: `src/features/brain/askContext.ts` (append `ASK_FROM_A_TAB`, `VIEW_CHANGED`)
- Modify: `src/pages/brain/ask/BrainAskLayout.tsx` (the `surface` memo)
- Modify: `src/components/copilot/useCopilotThread.ts:38-58` (`refusalMessage`)
- Modify: `src/components/copilot/useCopilotThread.test.tsx`
- Create: `src/pages/brain/ask/brainAskStates.test.tsx`

**Interfaces:**
- Consumes: `BrainAskLayout`, `stubBrainAsk`, `ASK_AFTER_SCOPE` (Task 2); `brainLabel` through `surfaceLabel` (Task 1).
- Produces:
  - `ASK_FROM_A_TAB = 'Ask from one of the four Brain tabs.'`
  - `VIEW_CHANGED = 'That view changed; ask again.'`
  - `refusalMessage(err, context)` returns `VIEW_CHANGED` for a Brain context's `400 {"context": {"scope": [...]}}`, and null for any other Brain 400.

- [ ] **Step 1: Write the failing refusal unit test**

Append inside `describe('refusalMessage', …)` in `src/components/copilot/useCopilotThread.test.tsx`:

```ts
  it('reads a Brain scope refusal as the view having changed, and nothing else on the Brain as a refusal', () => {
    const brain = { surface: 'brain', scope: 'company', tab: 'changed' } as const;
    const bad = (context: unknown) => new ApiError(400, { context }, 'Bad');
    expect(refusalMessage(bad({ scope: ["You can't ask about that view."] }), brain)).toBe('That view changed; ask again.');
    expect(refusalMessage(bad({ tab: ['"nowhere" is not a valid choice.'] }), brain)).toBeNull();
    expect(refusalMessage(new ApiError(503, {}, 'Ask is not set up.'), brain)).toBeNull();
  });
```

- [ ] **Step 2: Write the failing integration tests**

Create `src/pages/brain/ask/brainAskStates.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { ASK_AFTER_SCOPE, ASK_FROM_A_TAB, VIEW_CHANGED } from '../../../features/brain/askContext';
import { resetViewport } from '../../../test/viewport';
import { renderBrain } from '../testPages';
import { stubBrainAsk } from './testBrainAsk';

// Integration tier: the rail's chip and states on the real Brain pages
// (brain ask spec §2.2, §2.4, §3). Only fetch is stubbed.
const rail = () => screen.getByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');
const where = () => screen.getByTestId('where').textContent;

describe('Ask on the Brain: the chip and the states', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('chips the next question with the tab title and the scope, following both', async () => {
    stubBrainAsk();
    renderBrain('/brain?scope=company', { nav: true });
    expect(await within(rail()).findByText('Brain · What changed · Company')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Me' }));
    await waitFor(() => expect(where()).toBe('/brain?scope=me'));
    expect(await within(rail()).findByText('Brain · What changed · Me')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Brain' })).getByRole('link', { name: "What's being done" }));
    expect(await within(rail()).findByText("Brain · What's being done · Me")).toBeInTheDocument();
    // The screen itself is never removable from a question.
    expect(within(rail()).queryByRole('button', { name: 'Remove focus' })).toBeNull();
  });

  it.each(['/brain/requests?scope=team', '/brain/anomalies?scope=team', '/brain/graph?scope=team'])(
    'keeps the rail on %s but asks nothing there: "ask from a tab"',
    async (url) => {
      const { copilot } = stubBrainAsk();
      renderBrain(url);
      await screen.findByRole('group', { name: 'View' });
      expect(within(rail()).getByText(ASK_FROM_A_TAB)).toBeInTheDocument();
      expect(within(rail()).queryByText(ASK_AFTER_SCOPE)).toBeNull();
      await userEvent.type(composer(), 'Why?{Enter}');
      expect(postedBodies(copilot)).toEqual([]);
    },
  );

  it('says the view changed on a scope refusal, keeps the question, and offers no retry', async () => {
    stubBrainAsk({ copilot: { refuse: { scope: ["You can't ask about that view."] } } });
    renderBrain('/brain?scope=team');
    await within(rail()).findByText('Brain · What changed · My team');
    await userEvent.type(composer(), 'Why?{Enter}');
    expect(await within(rail()).findByText(VIEW_CHANGED)).toBeInTheDocument();
    expect(within(rail()).getByText('Why?')).toBeInTheDocument();
    expect(within(rail()).queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('is a full-screen sheet at 375px, opened from the bar', async () => {
    stubBrainAsk();
    renderBrain('/brain?scope=team', { width: 375 });
    await screen.findByText('Since 30 Sep month-end');
    expect(screen.queryByRole('complementary', { name: 'Ask Revenact' })).toBeNull();
    await userEvent.click(within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'Show Copilot' }));
    const sheet = screen.getByRole('dialog', { name: 'Ask Revenact' });
    expect(sheet).toHaveClass('fixed', 'inset-0');
    expect(within(sheet).getByText('Brain · What changed · My team')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run them to make sure they fail**

Run: `npx vitest run src/components/copilot/useCopilotThread.test.tsx src/pages/brain/ask/brainAskStates.test.tsx --maxWorkers=2`
Expected: FAIL. `ASK_FROM_A_TAB` and `VIEW_CHANGED` are not exported. Once they are, a sub-page shows `ASK_AFTER_SCOPE` and the refusal shows the generic error with Retry.

- [ ] **Step 4: Add the copy, the sub-page state and the refusal**

Append to `src/features/brain/askContext.ts`:

```ts

/** The composer on Feature Requests, Anomalies and the Graph, which have no
 *  Ask context in this delivery (spec §2.2). */
export const ASK_FROM_A_TAB = 'Ask from one of the four Brain tabs.';

/** A 400 refusing the scope a question was asked in (spec §2.4): the
 *  reader's views changed after the page settled. */
export const VIEW_CHANGED = 'That view changed; ask again.';
```

In `src/pages/brain/ask/BrainAskLayout.tsx`, change the import from `askContext` to:

```ts
import { ASK_AFTER_SCOPE, ASK_FROM_A_TAB, brainAskContext, brainAskTabOf } from '../../../features/brain/askContext';
```

and replace the `surface` memo with:

```tsx
  // Off the four tabs nothing can be asked at all; on one, nothing until the
  // page's scope settles.
  const unavailable = tab === null ? ASK_FROM_A_TAB : context === null ? ASK_AFTER_SCOPE : null;
  const surface: AskSurface = useMemo(() => ({ name: 'brain', context, chipLabel, unavailable }), [context, unavailable]);
```

In `src/components/copilot/useCopilotThread.ts`, add the import:

```ts
import { VIEW_CHANGED } from '../../features/brain/askContext';
```

and insert as the first branch after `if (!body || typeof body !== 'object') return null;`:

```ts
  if (context?.surface === 'brain') {
    // The scope the page asked in is no longer the asker's; asking again
    // asks the view the page has moved to.
    return 'scope' in body ? VIEW_CHANGED : null;
  }
```

Also add ` A Brain one's \`scope\` is the view the page asked in.` to the end of the doc comment's sentence that starts "`context` is the question's own".

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/components/copilot/useCopilotThread.test.tsx src/pages/brain/ask --maxWorkers=2`
Expected: PASS.

Run: `npx vitest run src/components/copilot src/pages/dashboard/ask src/pages/brain --maxWorkers=2 && npx tsc -b && npx eslint src/pages/brain/ask src/features/brain/askContext.ts src/components/copilot/useCopilotThread.ts`
Expected: PASS, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/brain/askContext.ts src/pages/brain/ask/BrainAskLayout.tsx src/pages/brain/ask/brainAskStates.test.tsx src/components/copilot/useCopilotThread.ts src/components/copilot/useCopilotThread.test.tsx
git commit -m "$(cat <<'EOF'
feat(brain): Ask chip, sub-page state and scope refusal on the Brain

The chip reads "Brain · What changed · Company" and follows tab and
scope. Feature Requests, Anomalies and the Graph keep the rail but say
"Ask from one of the four Brain tabs." and send nothing. A scope refusal
reads "That view changed; ask again." with no Retry. Below sm the rail
is the sheet.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Starter questions, shared in CopilotRail behind a `starters` prop

**Files:**
- Modify: `src/components/copilot/CopilotRail.tsx` (header comment lines 1-10, props, the composer area)
- Modify: `src/components/copilot/CopilotRail.test.tsx`
- Modify: `src/pages/dashboard/ask/context.ts` (`AskSurface.starters`)
- Modify: `src/pages/dashboard/ask/AskRail.tsx` (`railProps`)
- Modify: `src/features/brain/askContext.ts` (append `BRAIN_STARTERS`)
- Modify: `src/features/brain/askContext.test.ts`
- Modify: `src/pages/brain/ask/BrainAskLayout.tsx` (the `surface` memo)
- Create: `src/pages/brain/ask/brainStarters.test.tsx`

**Interfaces:**
- Consumes: `CopilotRail`'s `send(text)` (which builds the turn from the rail's surface context) and `unavailable` (Task 2); `BrainAskLayout`'s `context` and `unavailable` (Tasks 2-3).
- Produces:
  - `CopilotRailProps.starters?: readonly string[]`
  - `AskSurface.starters?: readonly string[]`
  - `BRAIN_STARTERS: Record<BrainAskTab, readonly string[]>`
  - In the DOM, the starters render as a `<ul aria-label="Suggested questions">` of 44px `<button>`s.

- [ ] **Step 1: Write the failing CopilotRail tests**

Append inside `describe('CopilotRail', …)` in `src/components/copilot/CopilotRail.test.tsx`:

```ts
  it('offers the starters it is given on an empty thread, 44px each, sends the one pressed, then hides them', async () => {
    const { spy } = stubCopilot();
    renderRail({ starters: ['First?', 'Second?'], context: { kind: 'surface', context: DASH, label: 'Revenue › Forecast' } });
    const list = screen.getByRole('list', { name: 'Suggested questions' });
    const buttons = within(list).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['First?', 'Second?']);
    for (const button of buttons) expect(button).toHaveClass('min-h-11', 'text-[13px]');
    await userEvent.click(buttons[1]);
    expect(await screen.findByText('Answer to: Second?')).toBeInTheDocument();
    expect(postedBodies(spy)).toEqual([{ content: 'Second?', context: DASH }]);
    expect(screen.queryByRole('list', { name: 'Suggested questions' })).not.toBeInTheDocument();
  });

  it('offers no starters without a surface context, or while nothing can be asked', () => {
    const { rerenderRail } = renderRail({ starters: ['First?'], context: null });
    expect(screen.queryByRole('list', { name: 'Suggested questions' })).not.toBeInTheDocument();
    rerenderRail({ starters: ['First?'], context: { kind: 'label', label: 'Support desk' } });
    expect(screen.queryByRole('list', { name: 'Suggested questions' })).not.toBeInTheDocument();
    rerenderRail({ starters: ['First?'], context: { kind: 'surface', context: DASH, label: 'x' }, unavailable: 'Wait.' });
    expect(screen.queryByRole('list', { name: 'Suggested questions' })).not.toBeInTheDocument();
  });
```

Append inside the `describe` in `src/features/brain/askContext.test.ts` (add `BRAIN_STARTERS` to its import):

```ts
  it('has three fixed starters per tab, the spec’s text verbatim (§2.3)', () => {
    expect(BRAIN_STARTERS).toEqual({
      changed: ['Why did these numbers move?', 'Where is the ARR at risk concentrated?', 'What should I watch next?'],
      waiting: ['What should I decide first?', 'What has been waiting longest, and why?', 'Which of these can I clear today?'],
      doing: ['Which initiatives are off track?', 'Are the plans moving health and ARR?', 'What are the rules doing for this book?'],
      customers: ['What are customers asking for most?', 'Who turned negative, and what do they have in common?', 'What do the latest comments say?'],
    });
  });
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/components/copilot/CopilotRail.test.tsx src/features/brain/askContext.test.ts --maxWorkers=2`
Expected: FAIL. There is no "Suggested questions" list, and `BRAIN_STARTERS` is undefined.

- [ ] **Step 3: Add the `starters` prop to CopilotRail, AskSurface and AskRail**

In `src/components/copilot/CopilotRail.tsx`, add to `CopilotRailProps` after `unavailable?: string | null;`:

```ts
  /** Fixed questions offered as buttons above the composer while the
   *  conversation is empty and the rail has a surface to ask about; pressing
   *  one sends it as the question. Only the Brain passes them (brain ask
   *  spec §2.3); without them the rail is as it was. */
  starters?: readonly string[];
```

Add `starters,` to the destructured props after `unavailable = null,`. Add this line below `const chipOf = …`:

```ts
  const offered = empty && !unavailable && context?.kind === 'surface' ? (starters ?? []) : [];
```

Insert immediately above the `{unavailable ? <p …` line added in Task 2:

```tsx
          {offered.length ? (
            <ul aria-label="Suggested questions" className="flex flex-col gap-1.5 px-1 pb-2">
              {offered.map((question) => (
                <li key={question}>
                  <button
                    type="button"
                    onClick={() => void send(question)}
                    className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2 text-left text-[13px] text-ink hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {question}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
```

Replace the file's header comment (lines 1-10) with:

```ts
// The Copilot in a rail: shared by Communications (beside the inbox), the
// Dashboard (beside the figures), Organizations, Accounts and Pipelines
// (each beside its list and board), Contacts (beside the list and the
// profile) and the Brain (beside its four tabs).
//
// A conversation is real (`sendMessage` to /copilot/messages/); the rail holds
// one at a time. The context says what a question is about: Communications
// sends its picked source as a text prefix; the Dashboard, Organizations,
// Accounts, Contacts, Pipelines and the Brain send where the person is as a
// structured `context` the server grounds the answer in.
```

In `src/pages/dashboard/ask/context.ts`, add to `AskSurface` after `unavailable?: string | null;`:

```ts
  /** Fixed questions the rail offers while the conversation is empty (the
   *  Brain's three per tab). Absent everywhere else. */
  starters?: readonly string[];
```

In `src/pages/dashboard/ask/AskRail.tsx`, add to `railProps` after `unavailable: …,`:

```ts
    starters: ask.surface.starters,
```

- [ ] **Step 4: Add the Brain starters and pass them from the layout**

Append to `src/features/brain/askContext.ts`:

```ts

/** Three fixed questions per tab (spec §2.3, owner decision 1): no model
 *  call, shown only while the conversation is empty. */
export const BRAIN_STARTERS: Record<BrainAskTab, readonly string[]> = {
  changed: ['Why did these numbers move?', 'Where is the ARR at risk concentrated?', 'What should I watch next?'],
  waiting: ['What should I decide first?', 'What has been waiting longest, and why?', 'Which of these can I clear today?'],
  doing: ['Which initiatives are off track?', 'Are the plans moving health and ARR?', 'What are the rules doing for this book?'],
  customers: ['What are customers asking for most?', 'Who turned negative, and what do they have in common?', 'What do the latest comments say?'],
};
```

In `src/pages/brain/ask/BrainAskLayout.tsx`, add `BRAIN_STARTERS` to the `askContext` import, and replace the `surface` memo line with:

```tsx
  const surface: AskSurface = useMemo(
    () => ({ name: 'brain', context, chipLabel, unavailable, starters: context ? BRAIN_STARTERS[context.tab] : undefined }),
    [context, unavailable],
  );
```

- [ ] **Step 5: Run the unit tests**

Run: `npx vitest run src/components/copilot src/features/brain/askContext.test.ts src/pages/dashboard/ask --maxWorkers=2`
Expected: PASS. AskRail.test's existing "no suggestions" check on the Dashboard still passes, because the Dashboard passes no starters.

- [ ] **Step 6: Write the failing integration test**

Create `src/pages/brain/ask/brainStarters.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { SAY } from '../../../features/brain/brainText';
import { resetViewport } from '../../../test/viewport';
import { renderBrain } from '../testPages';
import { stubBrainAsk } from './testBrainAsk';

// Integration tier: the starters on the real Brain pages (brain ask spec §2.3).
const rail = () => screen.getByRole('complementary', { name: 'Ask Revenact' });
const starters = () => within(rail()).queryByRole('list', { name: 'Suggested questions' });
const texts = (list: HTMLElement) => within(list).getAllByRole('button').map((button) => button.textContent);

describe('Ask on the Brain: the starters', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("offers What changed's three on an empty thread, sends the one pressed, and offers them again on New chat", async () => {
    const { copilot } = stubBrainAsk();
    renderBrain('/brain?scope=team');
    const list = await within(rail()).findByRole('list', { name: 'Suggested questions' });
    expect(texts(list)).toEqual(['Why did these numbers move?', 'Where is the ARR at risk concentrated?', 'What should I watch next?']);
    await userEvent.click(within(list).getByRole('button', { name: 'Where is the ARR at risk concentrated?' }));
    expect(await screen.findByText('Answer to: Where is the ARR at risk concentrated?')).toBeInTheDocument();
    expect(postedBodies(copilot).map((body) => [body.content, body.context])).toEqual([
      ['Where is the ARR at risk concentrated?', { surface: 'brain', scope: 'team', tab: 'changed' }],
    ]);
    expect(starters()).toBeNull();
    await userEvent.click(within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'New chat' }));
    expect(starters()).not.toBeNull();
  });

  it.each([
    ['/brain/waiting?scope=me', ['What should I decide first?', 'What has been waiting longest, and why?', 'Which of these can I clear today?']],
    ['/brain/doing?scope=me', ['Which initiatives are off track?', 'Are the plans moving health and ARR?', 'What are the rules doing for this book?']],
    ['/brain/customers?scope=me', ['What are customers asking for most?', 'Who turned negative, and what do they have in common?', 'What do the latest comments say?']],
  ])('offers %s its own three', async (url, expected) => {
    stubBrainAsk();
    renderBrain(url);
    expect(texts(await within(rail()).findByRole('list', { name: 'Suggested questions' }))).toEqual(expected);
  });

  it('offers none before the scope settles, and none off the four tabs', async () => {
    stubBrainAsk({ brain: { failScopes: 1 } });
    const { unmount } = renderBrain('/brain');
    await screen.findByText(SAY.LOAD_SCOPES);
    expect(starters()).toBeNull();
    unmount();
    vi.unstubAllGlobals();
    stubBrainAsk();
    renderBrain('/brain/requests?scope=team');
    await screen.findByRole('group', { name: 'View' });
    expect(starters()).toBeNull();
  });
});
```

- [ ] **Step 7: Run it**

Run: `npx vitest run src/pages/brain/ask/brainStarters.test.tsx --maxWorkers=2`
Expected: PASS (5 tests). Steps 3-4 already wired the starters, so this test confirms the integration. If it fails, fix the layout wiring, not the test.

- [ ] **Step 8: Run the Ask and Brain suites, the typecheck and the lint**

Run: `npx vitest run src/components/copilot src/pages/dashboard/ask src/pages/organizations/ask src/pages/pipelines/ask src/pages/brain src/components/brain src/features/brain --maxWorkers=2`
Expected: PASS.

Run: `npx tsc -b && npx eslint src/components/copilot/CopilotRail.tsx src/pages/dashboard/ask src/features/brain/askContext.ts src/pages/brain/ask`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/copilot/CopilotRail.tsx src/components/copilot/CopilotRail.test.tsx src/pages/dashboard/ask/context.ts src/pages/dashboard/ask/AskRail.tsx src/features/brain/askContext.ts src/features/brain/askContext.test.ts src/pages/brain/ask/BrainAskLayout.tsx src/pages/brain/ask/brainStarters.test.tsx
git commit -m "$(cat <<'EOF'
feat(brain): three starter questions per Brain tab

CopilotRail takes an optional starters prop: 44px buttons above the
composer while the thread is empty and the rail has a surface to ask
about; pressing one sends it. Only the Brain passes them, with the
spec's fixed text per tab; every other surface is unchanged.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: House rules, the end-to-end test and the docs

**Files:**
- Modify: `src/components/brain/houseRules.test.ts`
- Create: `src/e2e/brainAsk.test.tsx`
- Modify: `docs/03-ui-ux-design.md` (Ask rail intro at lines 307-309; a new "Brain shape" bullet before `- **Chips.**`; "Brain: the frame" at line 1261)
- Modify: `docs/04-app-flow.md` (a paragraph before `### 4.12 Builders`, line 1305)

**Interfaces:**
- Consumes: everything above. `BRAIN_STARTERS`, `ASK_AFTER_SCOPE`, `ASK_FROM_A_TAB` and `VIEW_CHANGED` from `features/brain/askContext.ts`; `stubBrainAsk`, `renderBrain`, `postedBodies`.
- Produces: no runtime code.

- [ ] **Step 1: Bring the new Brain Ask files under the Brain house rules**

In `src/components/brain/houseRules.test.ts`, add two entries to the `all` object, after the `Anomalies.tsx` entry:

```ts
  ...raw(import.meta.glob('../../pages/brain/ask/*.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../features/brain/askContext.ts', { query: '?raw', eager: true, import: 'default' })),
```

Add to the `expect.arrayContaining([...])` list in `it('covers the page and every new component', …)`, after `'./CustomerTiles.tsx',`:

```ts
        '../../pages/brain/ask/BrainAskLayout.tsx',
        '../../features/brain/askContext.ts',
```

Add this import at the top:

```ts
import { ASK_AFTER_SCOPE, ASK_FROM_A_TAB, BRAIN_STARTERS, VIEW_CHANGED } from '../../features/brain/askContext';
```

Append at the end of the file:

```ts
describe('brain: Ask Revenact copy (brain ask spec §2)', () => {
  const copy = [...Object.values(BRAIN_STARTERS).flat(), ASK_AFTER_SCOPE, ASK_FROM_A_TAB, VIEW_CHANGED];

  it('has three starters on each of the four tabs', () => {
    expect(Object.keys(BRAIN_STARTERS)).toEqual(['changed', 'waiting', 'doing', 'customers']);
    for (const questions of Object.values(BRAIN_STARTERS)) expect(questions).toHaveLength(3);
  });

  it('writes its copy in sentence case, with no em dash', () => {
    for (const line of copy) {
      expect(line[0]).toBe(line[0].toUpperCase());
      // Sentence case: no capital after the first word except the house acronyms and the proper noun.
      expect(line.slice(1).match(/\b[A-Z][a-z]+/g) ?? []).toEqual(line === ASK_FROM_A_TAB ? ['Brain'] : []);
      expect(line).not.toContain('—');
    }
  });

  it('ends every starter as a question', () => {
    for (const question of Object.values(BRAIN_STARTERS).flat()) expect(question.endsWith('?')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the house rules**

Run: `npx vitest run src/components/brain/houseRules.test.ts --maxWorkers=2`
Expected: PASS. The rules are written to hold for code Tasks 1-4 already shipped. If one fails, fix the offending source file, never the rule. The likely cases are an em dash in a comment or a missing `min-h-11`.

- [ ] **Step 3: Write the end-to-end test**

Create `src/e2e/brainAsk.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../components/copilot/testCopilot';
import { stubBrainAsk } from '../pages/brain/ask/testBrainAsk';
import { renderBrain } from '../pages/brain/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, BrainRoutes under
// BrainAskLayout, the rail and its pill, the store and the router. Only fetch
// is stubbed (stubBrainAsk), in the backend's shapes (brain ask spec §1.1:
// context {surface:'brain', scope, tab}; the origin is that context).
const rail = () => screen.getByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');
const where = () => screen.getByTestId('where').textContent;
const MY_TEAM_CHANGED = { surface: 'brain', scope: 'team', tab: 'changed' };

// The conversation as History lists it after the journey below.
const ASKED = { id: 21, title: 'Why did these numbers move?', created_at: '', updated_at: '', origin: MY_TEAM_CHANGED };

describe('Ask Revenact on the Brain, end to end (brain ask spec §2, §3)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('a manager switches to My team, asks on What changed from a starter, follows up, and finds it in History', { timeout: 30000 }, async () => {
    const { copilot } = stubBrainAsk({ copilot: { conversations: [ASKED] } });
    renderBrain('/brain?scope=company', { nav: true });
    expect(await screen.findByText('Since 30 Sep month-end')).toBeInTheDocument();

    // 1. The bar: the scope switch first, then the Ask pill.
    const slot = document.querySelector('[data-nav-actions-slot]') as HTMLElement;
    expect(within(slot).getByRole('group', { name: 'View' }).closest('[data-brain-controls="bar"]')).toHaveClass('order-first');
    expect(within(slot).getByRole('button', { name: 'Hide Copilot' })).toBeInTheDocument();

    // 2. My team: the chip follows the scope.
    await userEvent.click(within(slot).getByRole('button', { name: 'My team' }));
    await waitFor(() => expect(where()).toBe('/brain?scope=team'));
    expect(await within(rail()).findByText('Brain · What changed · My team')).toBeInTheDocument();

    // 3. A starter: sent as the question, grounded in What changed and My team.
    const starters = within(rail()).getByRole('list', { name: 'Suggested questions' });
    await userEvent.click(within(starters).getByRole('button', { name: 'Why did these numbers move?' }));
    expect(await screen.findByText('Answer to: Why did these numbers move?')).toBeInTheDocument();
    expect(within(rail()).queryByRole('list', { name: 'Suggested questions' })).toBeNull();

    // 4. A typed follow-up in the same conversation and view.
    await userEvent.type(composer(), 'Which customers drove it?{Enter}');
    expect(await screen.findByText('Answer to: Which customers drove it?')).toBeInTheDocument();
    expect(postedBodies(copilot).map((body) => [body.content, body.context])).toEqual([
      ['Why did these numbers move?', MY_TEAM_CHANGED],
      ['Which customers drove it?', MY_TEAM_CHANGED],
    ]);

    // 5. History lists it, tagged with the tab and scope and the Brain icon.
    await userEvent.click(within(slot).getByRole('button', { name: 'History' }));
    const item = await screen.findByRole('button', { name: /Why did these numbers move\?\s*Started on/ });
    expect(item).toHaveAccessibleName(/Why did these numbers move\?\s*Started on Brain · What changed · My team/);
    expect(item.querySelector('svg.lucide-brain')).not.toBeNull();
  });
});
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/e2e/brainAsk.test.tsx --maxWorkers=2`
Expected: PASS. Tasks 1-4 built the behaviour, and this test drives the whole flow.

- [ ] **Step 5: Update the UI/UX doc**

In `docs/03-ui-ux-design.md`, under `### Ask rail`, change:

```
Dashboard, Organizations (list, board and an organization's page), Contacts,
Accounts (list, board and an account's page) and Pipelines (list and board),
```

to:

```
Dashboard, Organizations (list, board and an organization's page), Contacts,
Accounts (list, board and an account's page), Pipelines (list and board) and
the Brain (its four tabs, Feature Requests, Anomalies and the Graph),
```

Insert this bullet immediately above the line `- **Chips.**`:

```markdown
- **Brain shape** (spec `docs/superpowers/specs/2026-10-06-brain-ask-design.md`
  §2). The same pill and the same glass rail, wired once by `BrainAskLayout`
  above every Brain route (its own preference key `revenact_brain_ask`):
  `BrainFrame` draws the rail beside its column, outside its scroll, with
  the 16px gutter to its right and below from `sm`, and each page's own
  `BrainFrame` passes its content through, so one conversation lasts
  through every tab and scope change and the rail is never remounted. In
  the bar the scope switch sits first, then the pill. Open by default from
  `xl`, a sheet below `sm`. The chip reads "Brain · What changed · Company"
  (the tab's title, then the scope's label) and is never removable. Until
  the page's scope settles the composer says "Ask opens once this view
  loads." and sends nothing; on Feature Requests, Anomalies and the Graph
  it says "Ask from one of the four Brain tabs." and sends nothing. While
  the conversation is empty on a tab, three fixed starter questions sit
  above the composer as 44px, 13px, left-aligned `bg-surface` buttons in
  a list named "Suggested questions"; pressing one sends it. No other
  surface shows starters. A refused scope reads "That view changed; ask
  again." with no Retry. History tags a Brain conversation with the Lucide
  `Brain` icon and "Brain · <tab> · <scope>", and reopens that tab with
  `?scope=`.
```

In the `### Brain: the frame` paragraph, change:

```
column, with a `rail` slot kept for Ask Revenact. No Brain page draws a DM
```

to:

```
column, with Ask Revenact's rail beside it (Ask rail, Brain shape). No Brain page draws a DM
```

- [ ] **Step 6: Update the app-flow doc**

In `docs/04-app-flow.md`, insert this paragraph, followed by one blank line, immediately above the line `### 4.12 Builders`:

```markdown
Ask Revenact on the Brain (spec `docs/superpowers/specs/2026-10-06-brain-ask-design.md`
§2). `BrainAskLayout` wraps every Brain page in `BrainRoutes` (the
redirects sit outside it) with one `AskProvider` (surface `brain`,
preference key `revenact_brain_ask`), so the conversation survives every
tab and scope change. A question posts `context: {surface:'brain', scope,
tab}`: `tab` comes from the route (`changed` at `/brain`, `waiting`, `doing`,
`customers`), and `scope` from the page once its scope settles. Each of the
four tabs reports it (`useReportBrainScope`), keyed by its path. There is no
`focus`. Until the scope settles the context is null and nothing is sent.
Feature Requests, Anomalies and the Graph keep the rail but send nothing.
While the conversation is empty, the tab's three fixed starters are offered,
and pressing one sends it. A `400` under `context.scope` reads "That view
changed; ask again." with no Retry. A `429` reads as the month's budget
spent, and a `503` shows the server's message. The stored origin is the
context itself. History tags it "Brain · <tab> · <scope>" and reopens
`<tab path>?scope=<scope>`. A Brain answer is readable by its asker and by a
reader who sees everything; anyone else shown the conversation sees the
question with the answer withheld (spec decision 2, enforced by the server).
```

- [ ] **Step 7: Run the full suite, the typecheck and the lint**

Run: `npx vitest run --maxWorkers=2`
Expected: PASS, with every suite green.

Run: `npx tsc -b && npx eslint .`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/brain/houseRules.test.ts src/e2e/brainAsk.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md
git commit -m "$(cat <<'EOF'
test(brain): house rules and e2e for Ask on the Brain; docs

The Brain house rules cover BrainAskLayout and the Ask copy (starters
verbatim, sentence case, no em dash). The e2e asks on What changed in My
team from a starter and a follow-up and finds it in History. UI/UX and
app-flow docs describe the Brain shape of the rail.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review

**1. Spec coverage**

| Spec item | Task |
| --- | --- |
| §0: `BrainFrame`'s reserved `rail`, `BrainControls` in the same slot | 2 (rail filled; `order-first` keeps the switch left of the pill) |
| §2.1: `BrainAskContext`, `BrainAskOrigin` in the unions; `withFocus` passes it through | 1 |
| §2.2 Placement: `BrainAskLayout` wraps the routes once in `BrainRoutes` | 2 |
| §2.2 Provider: `surface {name:'brain', context, chipLabel}`, `preferenceKey: BRAIN_ASK_KEY` | 2 |
| §2.2 Scope reporting: null until settled, no send while null, the composer says so | 2 |
| §2.2 Sub-pages: the rail stays and says "Ask from one of the four Brain tabs" | 3 |
| §2.2 Rail: `BrainFrame`'s `rail` gets `<AskRail />`; AskControls right of the scope switch | 2 (layout; `order-first`), 5 (e2e checks the bar) |
| §2.2 Chip: "Brain · What changed · Company" | 1 (rule), 3 (in the rail, following tab and scope) |
| §2.3 Starters: 3 per tab, verbatim, empty thread only, send on press, shared `starters` prop, others unchanged, 44px, sentence case | 4 (the house rules check the copy in 5) |
| §2.4 States: scope refusal "That view changed; ask again"; 429 budget; 503 not set up | 3 (refusal). 429 and 503 already map through `useCopilotThread` (`BUDGET_MESSAGE`; the server's message), unchanged |
| §3 Frontend tests: the rail opens from the bar, the chip | 3 (the sheet opens from the bar; the chip), 2 (open at xl) |
| §3: the context follows tab and scope without remounting | 2 |
| §3: nothing sends before the scope settles | 2 |
| §3: starters only when empty, send on press | 4 |
| §3: sub-pages show "ask from a tab" | 3 |
| §3: at 375px the rail is a sheet | 3 |
| §3: house rules pass; e2e asks on What changed in My team | 5 |
| Docs: 03-ui-ux-design, 04-app-flow | 5 |
| §1 backend; §4 out of scope (focus, other surfaces' starters, Ask on sub-pages) | Not built, by design. Task 1 sends no focus, Task 4 adds no starters elsewhere, and Task 3 sends nothing from the sub-pages |

There are no gaps.

**2. Placeholder scan.** No TBD, TODO or "similar to Task N". Every code step shows its code, and every test step shows its test. Step 14 of Task 2 tells the engineer to narrow a bare role query if another page test collides with the rail. That is a bounded instruction with the exact pattern shown in Step 13, which already fixes the two known collisions.

**3. Type consistency.** These names match across the tasks:
- `BrainAskTab`, `BrainAskContext`, `BrainAskOrigin` (Task 1), used in 2-4.
- `brainAskTabOf`, `brainAskContext`, `brainLabel`, `brainPath`, `BRAIN_ASK_PATHS`, `BRAIN_SCOPE_LABELS` (Task 1).
- `ASK_AFTER_SCOPE` (Task 2); `ASK_FROM_A_TAB` and `VIEW_CHANGED` (Task 3); `BRAIN_STARTERS` (Task 4). All are imported in Task 5.
- `BrainScopeReport`, `BrainScopeReportContext`, `useReportBrainScope` (Task 2).
- `stubBrainAsk` returns `{ brain, copilot, release }`. `copilot` is the spy that `postedBodies` takes (Tasks 2-5).
- `AskSurface.unavailable` (Task 2) and `AskSurface.starters` (Task 4) are passed by `AskRail` as `CopilotRailProps.unavailable` and `.starters`.
- `BrainFrame({ rail, scrollKey, children })` (Task 2).

**Ambiguities resolved**

- **Names.** The spec's `BrainTab` would collide with the existing `BrainTab {path, label}` interface in `features/brain/brainTabs.ts`, so the union is `BrainAskTab`. The spec's `BrainScopeKey` is the existing `ScopeKey` from `brainTypes.ts`, used directly.
- **Where the 400 lands.** The backend's `{"scope": [...]}` arrives wrapped as `{"context": {"scope": [...]}}`, as the send view wraps every context error. "The existing refusal handling covers it" still needs a Brain branch in `refusalMessage` (Task 3), because the existing branches key on `filters`, `account` and similar.
- **Copy the spec doesn't fix.** The composer's line while the scope settles is "Ask opens once this view loads." The spec only says "the composer says so". The two spec lines get a closing period, to match the other rail messages: "Ask from one of the four Brain tabs." and "That view changed; ask again.".
- **The chip's scope label** comes from a static `BRAIN_SCOPE_LABELS` (Me, My team, Company, the server's labels). A stored turn's chip then needs no reported names, and the History tag is built client-side, because a Brain origin carries no server `label`.
- **Not remounting.** Every Brain page draws its own `BrainFrame`, so "wraps the routes once" adopts the `OrganizationsFrame` pass-through rule, plus a `scrollKey` so a tab change still starts at the top. The rail's 16px gutter is applied from `sm` only, so the phone sheet stays full-screen.
- **The bar order.** "AskControls … to its right" is not guaranteed by portal mount order, because the scope switch portals in after its scope settles. `BrainControls` gets `order-first mr-3` in the flex slot.
- **The chip lands in Task 1.** The chip's pure function is in Task 1, not Task 3, because adding `'brain'` to `SurfaceContext` makes `surfaceLabel`, `originTag` and `originPath` fail to typecheck without it. Task 3 tests the chip in the rail.
- **The `unavailable` plumbing lands in Task 2.** It comes before the sub-page copy (Task 3), so no commit lets the Brain rail send a context-less question.
