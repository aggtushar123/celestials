# Ask Revenact on Pipelines (frontend, delivery 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the ✦ Ask rail and pill on `/pipelines/list` and `/pipelines/board`, with one conversation across both views and both kinds. A question carries the page's kind, view and URL filters. "Ask about this" on a List item or a Board card narrows one question to that item. The rail is a sheet on phones, and History reopens a Pipelines conversation on its view, with its kind and filters.

**Architecture:** Pipelines becomes the fifth Ask surface, after the Dashboard, Organizations, Contacts and Accounts. It reuses the shared pieces with no change to how they behave:
- `AskProvider` holds the conversation, the open state, the focus and the prefilled draft.
- `AskRail` draws the rail and the phone sheet, `AskControls` draws the pill, and `CopilotRail` draws History.
- A pure module, `src/features/pipelines/askContext.ts`, builds the context, the live chip and the restore path. It writes and reads filters through the page's own `pipelineUrlSearch` / `parsePipelineParams` and names them with the page's own `pipelineChips`.
- `PipelinesAskLayout` is a layout route above the two Pipelines routes, as `AccountsAskLayout` is for Accounts. It draws `OrganizationsFrame` once, with `AskRail` in its `rail` slot. The List's and the Board's own `OrganizationsFrame` inside it passes straight through.
- "Ask about this" becomes one shared button, `AskAboutButton`, taken out of `StoryItemRow` (not copied). The story item, the Pipelines item and the Pipelines card all render it, and it shows only under an Ask provider.
- The Board narrows its columns beside the open rail through the shared `useBoardRail`, as the Accounts Board does.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 tokens, Redux Toolkit, react-router 7, lucide-react, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-30-pipelines-redesign-design.md`:
- §3 is the authority for this delivery (Ask Revenact on Pipelines).
- §1 "Frame" and "Board" set the rail's place and the Board's behaviour beside it.

The backend contract is `revenact-backend` branch `feat/pipelines-ask` (PR #79):
- `docs/API_CONTRACTS.md`: "Asked from Pipelines", and the `GET /copilot/conversations/` example with `id: 16`
- `services/copilot/pipelines_context.py`

Read a file with `git -C ../revenact-backend show feat/pipelines-ask:<path>` if that checkout has moved. Do not edit the backend.

## Global Constraints

- **Backend contract** (`feat/pipelines-ask`, PR #79). `POST /api/v1/copilot/messages/` takes this `context`:
  - `{"surface": "pipelines", "kind": "opportunities" | "risks", "view": "list" | "board", "filters": {...}, "focus"?: {"kind": "opportunity" | "risk", "id": <int>} | null}`.
  - `kind` is optional on the server (opportunities by default) and always stored. The client always sends it.
  - `filters` holds the Pipelines book's own URL keys: `search`, `organisation`, `account`, `owner`, `stage`, `priority`, `department`, `date`, `changed`, `ids`, `sort`, `group`.
    - Send only the set keys, in the page's URL spelling. The default sort (`-mrr`) and the default group (`stage`) are left out.
    - "Not grouped" is `group: "none"`, the URL's own spelling (the server also accepts `""`). The Board never sends it: it reads "none" as stage.
    - With no `stage` filter, the List lists the open stages and the Board every stage. The server drops a `stage` equal to the view's default.
  - `focus` must match `kind` (`opportunity` with opportunities, `risk` with risks) and be an item the asker may read. It need not match the filters.
  - **Labels:** the server ignores a client `label`. It builds its own and stores it on the context and the origin: "Pipelines · Opportunities · Owner: Carl CSM · Priority: High". The focus is never part of it.
  - **Origin:** the stored context without `focus`: `{surface, kind, view, filters, label}`. History's tag is `label` itself.
  - **Refusals** read the same whether the record exists or not:
    - `400 {"context": {"filters": {"organisation": ["Not an organisation you can open."]}}}`
    - `400 {"context": {"filters": {"account": ["Not an account you can open."]}}}`
    - `400 {"context": {"focus": ["Not an opportunity or risk you can open."]}}`
  - Metered as purpose `pipelines` ("Ask Revenact on Pipelines"). A `429` reads the existing budget message.
- **Coming backend fix** (built separately, now). For a mentioned reader whose reply is withheld, a user turn comes back with its Ask `context` stripped (`null`), and the conversation's `origin` is `null`. Such a turn shows no chip, and such a conversation has no History tag and no reopen. Task 8 confirms that the shared rail already handles this, and pins it with tests.
- **Spec §3, frontend:**
  - The ✦ rail sits on the List and the Board.
  - There is one conversation across both kinds and both views.
  - "Ask about this" on an item focuses the question on it.
- **Spec §1, Board:** when the rail is open below xl, the card opens as a sheet and the columns narrow, as on the Accounts Board (`useBoardRail`). See Decision 6 for how this maps onto Pipelines, where a card opens its form.
- **Privacy:**
  - The client never names anything from data the viewer cannot see.
  - A live chip, before the server has labelled it, uses only the filter options the viewer's own page read returned, and only for that read's own kind. Anything else reads as the toolbar's placeholder ("User 2", "Organization 7"), never a guessed name.
  - A sent question shows the server's `label` once it comes back.
- **House rules** (`.claude/skills/revenact-design/SKILL.md` §1 and §4):
  - Tokens only, no raw colours.
  - Type at 11, 13, 15 or 22px only. Numbers in DM Mono (`font-mono-brand tabular-nums`).
  - Lucide icons only, `aria-hidden` when they sit beside text.
  - Glass on the Ask rail only. Items, cards, tiles and forms stay solid.
  - 44px targets below `sm`.
  - Sentence-case copy, both themes, no new motion.
- **Reuse, never copy:** the shared Ask parts (`AskProvider`, `AskRail`, `AskControls`, `CopilotRail`, `useBoardRail`, `same`) and the Pipelines parts (`parsePipelineParams`, `pipelineUrlSearch`, `boardPipelineParams`, `pipelineChips`).
- **Tests** follow the `testing` skill:
  - Unit tests for the pure module, each shared branch and the shared button.
  - Integration tests through the real store, router, layout, rail and pages, with `fetch` stubbed in the backend's #79 shapes.
  - A jsdom journey test.
  - The house-rules suite, extended to the new files.
  - Every test must be able to fail, and a test's title claims only what it asserts.
- Run Vitest as `npx vitest run --maxWorkers=2 <paths>`, one process at a time. Add no new dependencies.
- **Branch:** `feat/pipelines-ask` in `react-ts-app`, cut from `main`. Stay on it.
  - **Merge order:** backend #79 merges and deploys first, then this PR (base `main`).
  - Commits are conventional (`feat(pipelines): …`, `test(pipelines): …`, `docs(pipelines): …`, `refactor(copilot): …`) and end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Update the product documents in the same PR: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md` and `.agents/workflows/repo-architecture.md`.

## Decisions this plan makes where the spec is silent (the owner may overrule any)

1. **Where the ✦ and the rail sit.** The pill (New chat, History, ✦ Show/Hide Copilot) portals into the Navbar's existing actions slot, right of the title, the List | Board tabs and the Opportunities | Risks switch, and left of the bell. The Navbar already frames `/pipelines/*` with that slot.
   - The rail is the shared 320px glass column in `OrganizationsFrame`'s `rail` slot, right of the content column.
   - It is open by default from `xl`, a rail beside the page from `sm`, and a full-screen sheet below `sm`.
   - The person's own choice is kept under its own key, `revenact_pipelines_ask`, as Accounts and Contacts each keep theirs.
2. **One conversation survives every switch.** `PipelinesAskLayout` sits above both routes, and the List and the Board stay keyed by kind beneath it. So List ↔ Board and Opportunities ↔ Risks keep the same conversation, and the next question carries the new kind and view.
   - A switch is a URL change, so `AskProvider`'s shared rule drops a pending focus and an untouched prefilled question. An "Ask about this" on an opportunity never travels to the risks.
   - The shared scroll column returns to the top when the view or the kind changes (`scrollKey` is `"<view>:<kind>"`), as each kind's page did on its own before. A filter change keeps the place.
3. **The context the client sends.**
   - `kind` is always sent.
   - `filters` is the page's own URL query (`pipelineUrlSearch`) without `kind`, after `boardPipelineParams` on the Board. So it is the set keys only, without the default sort or group, with "none" for the List's ungrouped, and never "none" from the Board.
   - `focus` is present only when there is one. A question without a focus has no `focus` key, as on the Accounts List.
4. **The chip before the server's label returns.** It reads "Pipelines · <Opportunities|Risks>", then the page's own filter chips (`pipelineChips`), named from the filter options the current page read reported, and only when that read is of the same kind. For example: "Pipelines · Opportunities · Owner: Carl CSM · Organization: Pizza Hut".
   - Until that read lands, or if it was of the other kind, the toolbar's placeholders show ("Owner: User 2", "Organization: Organization 7").
   - The spelling is the toolbar's, which can differ slightly from the server's: "Organization:" not "Organisation:", one chip per stage, "Search: x", "Chosen items (N)", "No date". The server's `label` replaces it on the sent question. Organizations and Accounts made the same choice.
   - A focus adds " · This opportunity" or " · This risk", named from `focus`, never from a title. This holds on a live chip and on a stored one, since the focus is never in `label`.
5. **Where "Ask about this" goes.**
   - **List item:** the last thing on the item's line, after the signal: a quiet "✦ Ask about this", in `text-ink-muted`, pushed right (`ml-auto`). In a narrow column (phones, or beside the rail) it ends the wrapped facts line. It is hidden while selecting, when a tap selects.
   - **Board card:** the last thing on the card's facts row, pushed right.
   - It never opens the item's form (the click stops there), and it is not draggable.
   - It is 44px tall below `sm` and 36px from `sm`, like the story item's.
   - It types "What should I know about this opportunity?" (or "…this risk?") into the composer, focused on that item, and opens the rail. It does not send. On a phone it opens the full-screen sheet with the question and the chip. The focus is spent by the send, removed by the chip's ×, or dropped by a view, kind or filter change.
   - It is the story item's own button, taken out of `StoryItemRow` into `components/copilot/AskAboutButton.tsx` and shared by all three. It renders only under an Ask provider, so the Deals & risks tabs and isolated tests are unchanged.
6. **The Board beside the rail.** The Pipelines Board has no side panel: a card opens its Opportunity or Risk form, a modal (`z-[200]`) above the rail at every width. That modal is the Pipelines "sheet".
   - The Board calls `useBoardRail` for `railOpen`. Its columns narrow from `w-72` to `w-64` whenever the rail is open from `sm`, as on the Accounts Board. Collapsed Closed Lost stays `w-44`.
   - `useBoardRail`'s `closeCard` is a no-op here. The form can hold unsaved edits, and the rail can only open while the form is closed (the modal covers the pill and the cards), so nothing needs closing. Closing it on a viewport change would lose those edits.
7. **History.**
   - The tag is the server's `label`, with the sidebar's Pipelines icon (`Target`) and "Started on " for screen readers.
   - A pick reopens `/pipelines/<view>` with the page's own query, written by `pipelineUrlSearch`: `kind=risks` first for risks, then the filters in the page's fixed order, with `group=none` for an ungrouped List. It never goes through `/pipelines`, whose redirect drops the query.
   - A conversation that started elsewhere goes to its own page, as everywhere.
8. **Opening an item or card narrows nothing.** Unlike the Organizations List, opening a form adds no focus. The form covers the rail, and the explicit "Ask about this" is the one way to focus.
9. **Refusal copy.** All three are refusals, so there is no Retry:
   - `focus` → "You can no longer ask about this opportunity." (or "…this risk.")
   - `filters` (organisation or account) → the existing "You can't ask about this list. Clear the filters and ask again."
10. **Withheld turns need no code change.** `CopilotRail` draws a turn's chip only when its `context` is set, and History draws a tag and reopens a page only when `origin` is set. Task 8 pins both with tests across the surfaces.

## File structure

| File | Responsibility |
|---|---|
| `src/pages/copilot/types.ts` | `PipelinesFilters`, `PipelineFocus`, `PipelinesContext`, `PipelinesOrigin` (Task 1); joined to `AskFocus`, `SurfaceContext` and `SurfaceOrigin` in Task 2 |
| `src/features/pipelines/askContext.ts` (new) | `pipelinesViewOf`, `toPipelinesFilters`, `fromPipelinesFilters`, `pipelinesContextOf`, `PipelinesNames`, `pipelinesLabel`, `pipelinesPath`, `isPipelineFocus`, `pipelineFocusFor`, `pipelineFocusOf`, `pipelineFocusLabel`, `pipelineAskQuestion` |
| `src/components/copilot/surfaceLabels.ts`, `src/pages/dashboard/ask/originPath.ts`, `src/pages/dashboard/ask/context.ts` (`withFocus`), `src/pages/dashboard/ask/askPreference.ts`, `src/components/copilot/useCopilotThread.ts` (`refusalMessage`), `src/components/copilot/CopilotRail.tsx` (History icon) | The pipelines branch in each function keyed by surface, plus `PIPELINES_ASK_KEY` |
| `src/components/copilot/AskAboutButton.tsx` (new) | "Ask about this", taken out of `StoryItemRow` and shared |
| `src/components/organizations/detail/StoryItemRow.tsx` | Uses `AskAboutButton` instead of its private `AskAbout` |
| `src/pages/pipelines/ask/PipelinesAskLayout.tsx`, `pipelinesNames.ts` (new) | The layout route, and the options the pages report |
| `src/App.tsx` | The layout route around `pipelines/list` and `pipelines/board` |
| `src/pages/pipelines/List.tsx`, `Board.tsx` | Report the filter options. The Board narrows its columns beside the rail. |
| `src/components/pipelines/portfolio/PipelineBoard.tsx`, `PipelineColumn.tsx` | A `narrow` prop (`w-64`) |
| `src/components/pipelines/portfolio/PipelineItem.tsx`, `PipelineCard.tsx` | "Ask about this" |
| `src/components/layout/Navbar.tsx` | A comment only: the pill has landed |
| `src/pages/pipelines/testPages.tsx` | `renderPipelines(url, {ask})`, and `url` may carry navigation state |
| `src/pages/pipelines/ask/testPipelinesAsk.ts` (new, test only) | `stubPipelinesAsk`: the Pipelines book and the Copilot behind one `fetch` |
| `src/components/pipelines/portfolio/houseRules.test.ts` | Adds the layout and the shared button |
| `src/e2e/pipelinesAsk.test.tsx` (new) | The end-to-end journey |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` | The product documents |

---

### Task 1: The contract types and the pure Pipelines Ask module

**Files:**
- Modify: `src/pages/copilot/types.ts`. Add the four types after `AccountDetailOrigin`. Do not touch the unions yet.
- Create: `src/features/pipelines/askContext.ts`
- Test: `src/features/pipelines/askContext.test.ts`

**Interfaces:**
- Consumes (existing):
  - `parsePipelineParams(search)`, `pipelineUrlSearch(p)`, `boardPipelineParams(p)`, `PipelineParams`, `PipelineView` from `features/pipelines/pipelineParams`
  - `pipelineChips(p, options, kind)` from `features/pipelines/pipelineChips`
  - `PIPELINE_KINDS` from `features/pipelines/pipelineKinds`
  - `PipelineKindKey`, `PipelineFilterOptions`, `PipelineRow` from `features/pipelines/pipelineTypes`
  - test fixtures: `pipelineFilterOptions`, `OPPORTUNITY_ROWS` from `features/pipelines/testPipelines`, and `OPPORTUNITIES_KIND`
- Produces:
  - `pipelinesViewOf(pathname: string): PipelineView | null`
  - `toPipelinesFilters(p: PipelineParams, view: PipelineView): PipelinesFilters`
  - `fromPipelinesFilters(kind: PipelineKindKey, filters: PipelinesFilters): PipelineParams`
  - `pipelinesContextOf(pathname: string, search: string): PipelinesContext | null`
  - `interface PipelinesNames { kind: PipelineKindKey; options: PipelineFilterOptions }`
  - `pipelinesLabel(context: PipelinesContext, names?: PipelinesNames | null): string`
  - `pipelinesPath(origin: PipelinesOrigin): string`
  - `isPipelineFocus(focus: AskFocus | null | undefined): focus is PipelineFocus`
  - `pipelineFocusFor(focus: AskFocus | null, kind: PipelineKindKey): PipelineFocus | null`
  - `pipelineFocusOf(row: Pick<PipelineRow, 'kind' | 'id'>): PipelineFocus`
  - `pipelineFocusLabel(focus: PipelineFocus): string`
  - `pipelineAskQuestion(focus: PipelineFocus): string`

- [ ] **Step 1: Add the types** to `src/pages/copilot/types.ts`. Add `import type { PipelineKindKey } from '../../features/pipelines/pipelineTypes';` beside the `StoryKind` import, then put this directly after `AccountDetailOrigin`:

```ts
/** The Pipelines book's URL filters as a question carries them (backend
 *  `pipelines_context.FILTER_KEYS`): only the set keys, in the page's own
 *  URL spelling. `sort` only when it is not `-mrr`; `group` only when it is
 *  not `stage`, `none` for the List's "None". */
export interface PipelinesFilters {
  search?: string;
  organisation?: string;
  account?: string;
  owner?: string;
  stage?: string;
  priority?: string;
  department?: string;
  date?: string;
  changed?: string;
  ids?: string;
  sort?: string;
  group?: string;
}

/** "Ask about this" on one Pipelines item (spec 2026-09-30 §3): its kind
 *  matches the page's (`opportunity` on opportunities, `risk` on risks); the
 *  server refuses (400) an item the asker may not read. */
export interface PipelineFocus {
  kind: 'opportunity' | 'risk';
  id: number;
}

/** A question asked on the Pipelines List or Board. The server builds
 *  `label` ("Pipelines · Opportunities · Owner: Carl CSM") and echoes it on
 *  a stored context, with the validated `focus`. */
export interface PipelinesContext {
  surface: 'pipelines';
  kind: PipelineKindKey;
  view: OrganizationsView;
  filters: PipelinesFilters;
  focus?: PipelineFocus | null;
  label?: string;
}

export interface PipelinesOrigin {
  surface: 'pipelines';
  kind: PipelineKindKey;
  view: OrganizationsView;
  filters: PipelinesFilters;
  label: string;
}
```

- [ ] **Step 2: Write the failing test** `src/features/pipelines/askContext.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  fromPipelinesFilters,
  isPipelineFocus,
  pipelineAskQuestion,
  pipelineFocusFor,
  pipelineFocusOf,
  pipelinesContextOf,
  pipelinesLabel,
  pipelinesPath,
  pipelinesViewOf,
} from './askContext';
import { OPPORTUNITIES_KIND } from './pipelineKinds';
import { OPPORTUNITY_ROWS, adminLeft, emeaSeats, pipelineFilterOptions } from './testPipelines';

const names = { kind: 'opportunities', options: pipelineFilterOptions(OPPORTUNITY_ROWS, OPPORTUNITIES_KIND) } as const;
const list = (search: string) => pipelinesContextOf('/pipelines/list', search);
const board = (search: string) => pipelinesContextOf('/pipelines/board', search);

describe('pipelinesViewOf', () => {
  it('reads the List and the Board from the path, and nothing else', () => {
    expect(pipelinesViewOf('/pipelines/list')).toBe('list');
    expect(pipelinesViewOf('/pipelines/board/')).toBe('board');
    expect(pipelinesViewOf('/pipelines')).toBeNull();
    expect(pipelinesViewOf('/pipelines/list/41')).toBeNull();
    expect(pipelinesViewOf('/accounts/list')).toBeNull();
  });
});

describe('pipelinesContextOf', () => {
  it('always sends the kind, and only the set filters in the URL spelling', () => {
    expect(list('')).toEqual({ surface: 'pipelines', kind: 'opportunities', view: 'list', filters: {} });
    expect(list('?kind=risks&owner=2&priority=high')).toEqual({
      surface: 'pipelines',
      kind: 'risks',
      view: 'list',
      filters: { owner: '2', priority: 'high' },
    });
    expect(board('?organisation=7,9&account=12&date=30&sort=date')).toEqual({
      surface: 'pipelines',
      kind: 'opportunities',
      view: 'board',
      filters: { organisation: '7,9', account: '12', date: '30', sort: 'date' },
    });
    expect(list('?stage=closed_won,closed_lost&changed=quarter')).toMatchObject({ filters: { stage: 'closed_won,closed_lost', changed: 'quarter' } });
  });

  it("drops what the page doesn't read, the default sort and group, and a stage of the other kind", () => {
    expect(list('?kind=bogus&sort=-mrr&group=stage&cursor=abc&owner=bob&stage=open')).toEqual({
      surface: 'pipelines',
      kind: 'opportunities',
      view: 'list',
      filters: {},
    });
  });

  it("sends the List's None as group=none, never from the Board", () => {
    expect(list('?group=none')).toMatchObject({ filters: { group: 'none' } });
    expect(board('?group=none')).toMatchObject({ filters: {} });
    expect(board('?group=owner&owner=2')).toMatchObject({ filters: { group: 'owner', owner: '2' } });
  });

  it('is null off the two views', () => {
    expect(pipelinesContextOf('/pipelines', '')).toBeNull();
    expect(pipelinesContextOf('/accounts/list', '?owner=2')).toBeNull();
  });

  it('reads filters back through the page parser, for the kind given', () => {
    expect(fromPipelinesFilters('risks', { owner: '2', group: 'none' })).toMatchObject({ kind: 'risks', owner: '2', group: '' });
    expect(fromPipelinesFilters('opportunities', { stage: 'open' }).stage).toEqual([]);
  });
});

describe('pipelinesLabel', () => {
  const context = { surface: 'pipelines', kind: 'opportunities', view: 'list', filters: { owner: '2', organisation: '7', priority: 'high', date: '30' } } as const;

  it("names a live question from the page's own filter options", () => {
    expect(pipelinesLabel(context, names)).toBe(
      'Pipelines · Opportunities · Owner: Carl CSM · Organization: Pizza Hut · Priority: High · Closes within 30 days',
    );
    expect(pipelinesLabel({ ...context, filters: { account: '12' } }, names)).toBe('Pipelines · Opportunities · Account: Pizza Hut EMEA');
    expect(pipelinesLabel({ ...context, view: 'board', filters: {} }, names)).toBe('Pipelines · Opportunities');
  });

  it("guesses no name before the page's read lands, or from the other kind's read", () => {
    expect(pipelinesLabel(context)).toBe(
      'Pipelines · Opportunities · Owner: User 2 · Organization: Organization 7 · Priority: High · Closes within 30 days',
    );
    expect(pipelinesLabel({ surface: 'pipelines', kind: 'risks', view: 'list', filters: { owner: '2', date: '30' } }, names)).toBe(
      'Pipelines · Risks · Owner: User 2 · Due within 30 days',
    );
  });

  it("shows the server's label once stored, and names the focus from the focus alone", () => {
    expect(pipelinesLabel({ ...context, label: 'Pipelines · Opportunities · Owner: Carl CSM' }, null)).toBe(
      'Pipelines · Opportunities · Owner: Carl CSM',
    );
    expect(pipelinesLabel({ ...context, filters: {}, focus: { kind: 'opportunity', id: 41 } }, names)).toBe(
      'Pipelines · Opportunities · This opportunity',
    );
    expect(
      pipelinesLabel({ surface: 'pipelines', kind: 'risks', view: 'board', filters: {}, focus: { kind: 'risk', id: 71 }, label: 'Pipelines · Risks' }),
    ).toBe('Pipelines · Risks · This risk');
  });
});

describe('pipelinesPath', () => {
  it('reopens the view with the kind first and the filters in the page order', () => {
    expect(pipelinesPath({ surface: 'pipelines', kind: 'risks', view: 'board', filters: { priority: 'high' }, label: 'x' })).toBe(
      '/pipelines/board?kind=risks&priority=high',
    );
    expect(pipelinesPath({ surface: 'pipelines', kind: 'opportunities', view: 'list', filters: { group: 'none', owner: '2' }, label: 'x' })).toBe(
      '/pipelines/list?owner=2&group=none',
    );
    expect(pipelinesPath({ surface: 'pipelines', kind: 'opportunities', view: 'list', filters: {}, label: 'Pipelines · Opportunities' })).toBe(
      '/pipelines/list',
    );
  });

  it('restores exactly the page a context was built from', () => {
    for (const [view, search] of [
      ['list', '?kind=risks&owner=unassigned&group=none'],
      ['board', '?organisation=7&stage=negotiation&sort=title'],
      ['list', ''],
    ] as const) {
      const context = pipelinesContextOf(`/pipelines/${view}`, search)!;
      const path = pipelinesPath({ ...context, label: 'x' });
      expect(pipelinesContextOf(path.split('?')[0], path.split('?')[1] ?? '')).toEqual(context);
    }
  });
});

describe('the Pipelines focus', () => {
  it('is an opportunity or a risk, of the page kind only', () => {
    expect(pipelineFocusOf(emeaSeats)).toEqual({ kind: 'opportunity', id: 41 });
    expect(pipelineFocusOf(adminLeft)).toEqual({ kind: 'risk', id: 71 });
    expect(isPipelineFocus({ kind: 'risk', id: 71 })).toBe(true);
    expect(isPipelineFocus({ kind: 'email', id: 141 })).toBe(false);
    expect(isPipelineFocus({ kind: 'companies', ids: [7] })).toBe(false);
    expect(isPipelineFocus(null)).toBe(false);
    expect(pipelineFocusFor({ kind: 'risk', id: 71 }, 'risks')).toEqual({ kind: 'risk', id: 71 });
    expect(pipelineFocusFor({ kind: 'opportunity', id: 41 }, 'risks')).toBeNull();
    expect(pipelineFocusFor({ kind: 'call', id: 112 }, 'opportunities')).toBeNull();
  });

  it("prefills a question in the item's own word", () => {
    expect(pipelineAskQuestion({ kind: 'opportunity', id: 41 })).toBe('What should I know about this opportunity?');
    expect(pipelineAskQuestion({ kind: 'risk', id: 71 })).toBe('What should I know about this risk?');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/features/pipelines/askContext.test.ts`
Expected: FAIL, "Failed to resolve import './askContext'".

- [ ] **Step 4: Write the module** `src/features/pipelines/askContext.ts`:

```ts
import type { AskFocus, PipelineFocus, PipelinesContext, PipelinesFilters, PipelinesOrigin } from '../../pages/copilot/types';
import { pipelineChips } from './pipelineChips';
import { PIPELINE_KINDS } from './pipelineKinds';
import { boardPipelineParams, parsePipelineParams, pipelineUrlSearch, type PipelineParams, type PipelineView } from './pipelineParams';
import type { PipelineFilterOptions, PipelineKindKey, PipelineRow } from './pipelineTypes';

// Ask Revenact on Pipelines (spec 2026-09-30 §3): the context a question
// carries, its live chip, the page a History pick reopens, and the item
// "Ask about this" focuses on. Filters go through the page's own URL writer
// and parser, so the question, the chip and the restore read them as the
// page does.

const SEPARATOR = ' · ';
const TITLE = 'Pipelines';
const VIEW = /^\/pipelines\/(list|board)\/?$/;

/** Which Pipelines view a path shows; null anywhere else. */
export function pipelinesViewOf(pathname: string): PipelineView | null {
  const match = VIEW.exec(pathname);
  return match ? (match[1] as PipelineView) : null;
}

/** The params as a question carries them: the page's own URL query without
 *  the kind (sent on its own). The Board reads the List's None as stage, its
 *  default, so it never sends `group: 'none'`. */
export function toPipelinesFilters(p: PipelineParams, view: PipelineView): PipelinesFilters {
  const query = pipelineUrlSearch(view === 'board' ? boardPipelineParams(p) : p);
  query.delete('kind');
  return Object.fromEntries(query);
}

/** Filters (with their kind) back to params, through the page's own parser,
 *  so a value the page would not read is dropped the same way. */
export function fromPipelinesFilters(kind: PipelineKindKey, filters: PipelinesFilters): PipelineParams {
  const search = new URLSearchParams();
  if (kind !== 'opportunities') search.set('kind', kind);
  for (const [key, value] of Object.entries(filters)) if (typeof value === 'string' && value) search.set(key, value);
  return parsePipelineParams(search);
}

/** Where the person is on Pipelines, as the server needs it: the kind, the
 *  view and the filters. Never a name or a figure: the server recomputes
 *  the book. No focus: "Ask about this" adds one (`withFocus`). */
export function pipelinesContextOf(pathname: string, search: string): PipelinesContext | null {
  const view = pipelinesViewOf(pathname);
  if (view === null) return null;
  const params = parsePipelineParams(new URLSearchParams(search));
  return { surface: 'pipelines', kind: params.kind, view, filters: toPipelinesFilters(params, view) };
}

/** What a page reports so a live chip can name its filters: its own read's
 *  filter options, and the kind that read was of (the options differ by
 *  kind, and a switch lands before the new kind's read). */
export interface PipelinesNames {
  kind: PipelineKindKey;
  options: PipelineFilterOptions;
}

export function isPipelineFocus(focus: AskFocus | PipelineFocus | null | undefined): focus is PipelineFocus {
  return focus != null && (focus.kind === 'opportunity' || focus.kind === 'risk');
}

/** `focus` when it is an item of `kind`'s own sort, else null. */
export function pipelineFocusFor(focus: AskFocus | PipelineFocus | null, kind: PipelineKindKey): PipelineFocus | null {
  return isPipelineFocus(focus) && focus.kind === PIPELINE_KINDS[kind].item ? focus : null;
}

export function pipelineFocusOf(row: Pick<PipelineRow, 'kind' | 'id'>): PipelineFocus {
  return { kind: row.kind, id: row.id };
}

/** The focus part of the chip: "This opportunity", "This risk". */
export function pipelineFocusLabel(focus: PipelineFocus): string {
  return `This ${focus.kind}`;
}

/** The question "Ask about this" prefills. The person can edit it. */
export function pipelineAskQuestion(focus: PipelineFocus): string {
  return `What should I know about this ${focus.kind}?`;
}

/** The chip. A stored context's `label` is the server's and wins. A live one
 *  is "Pipelines", the kind, and the toolbar's own filter chips, named from
 *  the reported options only when they are of this kind. The focus is never
 *  in `label`, so it is always named from `focus`. */
export function pipelinesLabel(context: PipelinesContext, names: PipelinesNames | null = null): string {
  const kind = PIPELINE_KINDS[context.kind];
  const options = names?.kind === context.kind ? names.options : null;
  const base =
    context.label ??
    [TITLE, kind.title, ...pipelineChips(fromPipelinesFilters(context.kind, context.filters), options, kind).map((chip) => chip.label)].join(
      SEPARATOR,
    );
  return context.focus ? `${base}${SEPARATOR}${pipelineFocusLabel(context.focus)}` : base;
}

/** Where a conversation started on Pipelines reopens: its view, with the
 *  page's own query (`kind=risks` first for risks, then the filters in the
 *  page's order, `group=none` for an ungrouped List). Never `/pipelines`,
 *  whose redirect drops the query. */
export function pipelinesPath(origin: PipelinesOrigin): string {
  const query = pipelineUrlSearch(fromPipelinesFilters(origin.kind, origin.filters)).toString();
  return query ? `/pipelines/${origin.view}?${query}` : `/pipelines/${origin.view}`;
}
```

`AskFocus` does not include `PipelineFocus` until Task 2, so `isPipelineFocus` and `pipelineFocusFor` take `AskFocus | PipelineFocus` for now. Task 2 narrows them to `AskFocus` once the union includes `PipelineFocus`.

- [ ] **Step 5: Run the test and the type-check**

Run: `npx vitest run --maxWorkers=2 src/features/pipelines/askContext.test.ts`. Expected: PASS.

Run: `npx tsc -b`. Expected: exit 0.

If the round-trip case fails, the restore and the context disagree on a key. That is a bug in `toPipelinesFilters` or `fromPipelinesFilters`: fix it there, not in the test.

- [ ] **Step 6: Commit**

```bash
git add src/pages/copilot/types.ts src/features/pipelines/askContext.ts src/features/pipelines/askContext.test.ts
git commit -m "feat(pipelines): the Pipelines Ask context, live chip, focus and restore path

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The Pipelines branch in every function keyed by surface

**Files:**
- Modify: `src/pages/copilot/types.ts`. Add `PipelineFocus` to `AskFocus` and the Pipelines types to `SurfaceContext` and `SurfaceOrigin`, and update the doc comments that list the surfaces.
- Modify: `src/features/pipelines/askContext.ts`. Narrow the two focus helpers' parameters back to `AskFocus`.
- Modify: `src/components/copilot/surfaceLabels.ts`, `src/pages/dashboard/ask/originPath.ts`, `src/pages/dashboard/ask/context.ts`, `src/pages/dashboard/ask/askPreference.ts`, `src/components/copilot/useCopilotThread.ts`, `src/components/copilot/CopilotRail.tsx`
- Test: `src/components/copilot/surfaceLabels.test.ts`, `src/pages/dashboard/ask/originPath.test.ts`, `src/pages/dashboard/ask/context.test.ts`, `src/components/copilot/useCopilotThread.test.tsx`, `src/components/copilot/HistoryPopover.test.tsx`

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces:
  - `SurfaceNames.pipelines?: PipelinesNames | null`
  - `surfaceLabel(context, { pipelines })`
  - `originTag` and `originPath` for Pipelines origins
  - `withFocus` for Pipelines contexts
  - `PIPELINES_ASK_KEY = 'revenact_pipelines_ask'`
  - `refusalMessage(err, context)` with the pipelines branch

- [ ] **Step 1: Write the failing tests.** Append each block to the `describe` it names.

`src/components/copilot/surfaceLabels.test.ts`: add these imports at the top:

```ts
import { OPPORTUNITIES_KIND } from '../../features/pipelines/pipelineKinds';
import { OPPORTUNITY_ROWS, pipelineFilterOptions } from '../../features/pipelines/testPipelines';
```

Then add this case:

```ts
  it('labels a Pipelines question from the page, and tags a Pipelines conversation with the server label', () => {
    const pipelines = { kind: 'opportunities', options: pipelineFilterOptions(OPPORTUNITY_ROWS, OPPORTUNITIES_KIND) } as const;
    expect(surfaceLabel({ surface: 'pipelines', kind: 'opportunities', view: 'board', filters: { owner: '2' } }, { pipelines })).toBe(
      'Pipelines · Opportunities · Owner: Carl CSM',
    );
    expect(
      surfaceLabel({ surface: 'pipelines', kind: 'risks', view: 'list', filters: {}, focus: { kind: 'risk', id: 71 }, label: 'Pipelines · Risks' }),
    ).toBe('Pipelines · Risks · This risk');
    expect(
      originTag({ origin: { surface: 'pipelines', kind: 'risks', view: 'board', filters: { priority: 'high' }, label: 'Pipelines · Risks · Priority: High' } }),
    ).toBe('Pipelines · Risks · Priority: High');
  });
```

`src/pages/dashboard/ask/originPath.test.ts`:

```ts
  it('reopens a Pipelines conversation on its view, with its kind and filters', () => {
    expect(originPath({ surface: 'pipelines', kind: 'risks', view: 'board', filters: { priority: 'high' }, label: 'x' })).toBe(
      '/pipelines/board?kind=risks&priority=high',
    );
    expect(originPath({ surface: 'pipelines', kind: 'opportunities', view: 'list', filters: {}, label: 'Pipelines · Opportunities' })).toBe(
      '/pipelines/list',
    );
  });
```

`src/pages/dashboard/ask/context.test.ts`:

```ts
  it('gives a Pipelines question only an item of its own kind as a focus, and no focus key without one', () => {
    const risks = { surface: 'pipelines', kind: 'risks', view: 'list', filters: { owner: '2' } } as const;
    expect(withFocus(risks, { kind: 'risk', id: 71 })).toEqual({ ...risks, focus: { kind: 'risk', id: 71 } });
    expect(withFocus(risks, { kind: 'opportunity', id: 41 })).toEqual(risks);
    expect(withFocus(risks, { kind: 'companies', ids: [7] })).toEqual(risks);
    expect(withFocus(risks, { kind: 'email', id: 141 })).toEqual(risks);
    expect(withFocus(risks, null)).not.toHaveProperty('focus');
  });
```

`src/components/copilot/useCopilotThread.test.tsx`, inside `describe('refusalMessage')`:

```ts
  it('reads a Pipelines refusal by the item or the list it was asked about', () => {
    const onRisk = { surface: 'pipelines', kind: 'risks', view: 'board', filters: {}, focus: { kind: 'risk', id: 71 } } as const;
    const onDeal = { surface: 'pipelines', kind: 'opportunities', view: 'list', filters: {}, focus: { kind: 'opportunity', id: 41 } } as const;
    const filtered = { surface: 'pipelines', kind: 'opportunities', view: 'list', filters: { account: '12' } } as const;
    const bad = (context: unknown) => new ApiError(400, { context }, 'Bad');
    const item = ['Not an opportunity or risk you can open.'];
    expect(refusalMessage(bad({ focus: item }), onRisk)).toBe('You can no longer ask about this risk.');
    expect(refusalMessage(bad({ focus: item }), onDeal)).toBe('You can no longer ask about this opportunity.');
    expect(refusalMessage(bad({ filters: { account: ['Not an account you can open.'] } }), filtered)).toBe(
      "You can't ask about this list. Clear the filters and ask again.",
    );
    expect(refusalMessage(bad({ filters: { organisation: ['Not an organisation you can open.'] } }), filtered)).toBe(
      "You can't ask about this list. Clear the filters and ask again.",
    );
    expect(refusalMessage(new ApiError(500, {}, 'Oops'), onRisk)).toBeNull();
  });
```

`src/components/copilot/HistoryPopover.test.tsx`:

```ts
  it("tags a conversation started on Pipelines with the server's label and the Pipelines icon", async () => {
    stubCopilot({
      conversations: [
        {
          id: 16,
          title: 'What should I chase?',
          created_at: '',
          updated_at: '',
          origin: { surface: 'pipelines', kind: 'opportunities', view: 'list', filters: {}, label: 'Pipelines · Opportunities' },
        },
      ],
    });
    render(<HistoryPopover onClose={() => {}} onOpen={() => {}} />);
    const tagged = await screen.findByRole('button', { name: /What should I chase\?/ });
    expect(within(tagged).getByText('Pipelines · Opportunities')).toBeInTheDocument();
    expect(tagged).toHaveAccessibleName(/What should I chase\?\s*Started on Pipelines · Opportunities/);
    expect(tagged.querySelector('svg.lucide-target')).not.toBeNull();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/copilot/surfaceLabels.test.ts src/pages/dashboard/ask/originPath.test.ts src/pages/dashboard/ask/context.test.ts src/components/copilot/useCopilotThread.test.tsx src/components/copilot/HistoryPopover.test.tsx`

Expected: the new cases FAIL. For example, `surfaceLabel` falls through to `organizationsLabel`, `originPath` returns an `/organizations/...` path, and the History tag has no `lucide-target` icon.

- [ ] **Step 3: Join the unions** in `src/pages/copilot/types.ts`:

```ts
/** Whatever the shared Ask slot narrows the next question to: a dashboard
 *  drill or attention item, an Organizations row, a story item, a Contacts
 *  person's sentiment, or a Pipelines item. The kinds never overlap, so
 *  `kind` tells them apart. */
export type AskFocus = DashboardFocus | StoryFocus | SentimentFocus | PipelineFocus;
```

```ts
/** Every structured context a question can carry, told apart by `surface`
 *  (and, on Organizations, Contacts and Accounts, by `view`). */
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

`AskFocus` is declared above `PipelineFocus` in the file. A type alias may reference an interface declared later, so leave both where they are.

In `src/features/pipelines/askContext.ts`, change the parameter types back to `focus: AskFocus | null | undefined` (in `isPipelineFocus`) and `focus: AskFocus | null` (in `pipelineFocusFor`).

- [ ] **Step 4: Add the branches**

`src/components/copilot/surfaceLabels.ts`:

```ts
import { pipelinesLabel, type PipelinesNames } from '../../features/pipelines/askContext';
// …
export interface SurfaceNames {
  dashboard?: FilterNames;
  organizations?: PortfolioResponse['filters'] | null;
  detail?: DetailNames | null;
  contacts?: ContactsNames | null;
  accounts?: AccountsNames | null;
  /** What the Pipelines List or Board reports: its read's filter options and their kind. */
  pipelines?: PipelinesNames | null;
}

export function surfaceLabel(context: SurfaceContext, names: SurfaceNames = {}): string {
  if (context.surface === 'pipelines') return pipelinesLabel(context, names.pipelines ?? null);
  if (context.surface === 'accounts') return accountsLabel(context, names.accounts ?? null);
  // …unchanged
}
```

In `originTag`, replace the Contacts and Accounts line with:

```ts
  // Contacts, Accounts and Pipelines store one server-built label: the tag is that label.
  if (origin.surface === 'contacts' || origin.surface === 'accounts' || origin.surface === 'pipelines') return origin.label;
```

In the same doc comment, add "a Pipelines one's is the server's `label` ("Pipelines · Risks · Priority: High")".

`src/pages/dashboard/ask/originPath.ts`:

```ts
import { pipelinesPath } from '../../../features/pipelines/askContext';
// …
export function originPath(origin: SurfaceOrigin): string {
  if (origin.surface === 'pipelines') return pipelinesPath(origin);
  if (origin.surface === 'accounts') return accountsPath(origin);
  // …unchanged
}
```

Update its doc comment to end "…an Accounts List, Board or account, or a Pipelines view with its kind."

`src/pages/dashboard/ask/context.ts` (`withFocus`). Import `pipelineFocusFor` from `'../../../features/pipelines/askContext'`. This branch goes first in the function, before the Contacts branch:

```ts
  if (context.surface === 'pipelines') {
    // Only "Ask about this" on an item of the page's own kind; no focus key
    // is sent without one.
    const item = pipelineFocusFor(focus, context.kind);
    return item ? { ...context, focus: item } : context;
  }
```

Extend the function's doc comment with "A Pipelines question takes only an item of its own kind."

`src/pages/dashboard/ask/askPreference.ts`:

```ts
/** Pipelines' rail keeps its own choice too. */
export const PIPELINES_ASK_KEY = 'revenact_pipelines_ask';
```

`src/components/copilot/useCopilotThread.ts`. In `refusalMessage`, directly after the `if (!body || typeof body !== 'object') return null;` line:

```ts
  if (context?.surface === 'pipelines') {
    // The item "Ask about this" was pressed on, or a filter the asker can't open.
    if ('focus' in body) return `You can no longer ask about this ${context.focus?.kind ?? 'item'}.`;
    if ('filters' in body) return "You can't ask about this list. Clear the filters and ask again.";
    return null;
  }
```

Add "Pipelines' `focus` names the item's kind" to its doc comment.

`src/components/copilot/CopilotRail.tsx` (History tag). Add `Target` to the `lucide-react` import, then:

```tsx
                        ) : c.origin.surface === 'accounts' ? (
                          <Layers className="w-3 h-3 shrink-0" aria-hidden="true" />
                        ) : c.origin.surface === 'pipelines' ? (
                          <Target className="w-3 h-3 shrink-0" aria-hidden="true" />
                        ) : (
```

In the file's head comment, add Accounts and Pipelines to the surfaces that send a structured `context`.

- [ ] **Step 5: Run the tests and the type-check**

Run the Step 2 command. Expected: PASS, with the old cases unchanged.

Run: `npx tsc -b`. Expected: exit 0. If `tsc` flags another switch on `SurfaceContext`, `SurfaceOrigin` or `AskFocus`, add the Pipelines branch there, with a test. The known ones are the six files above.

- [ ] **Step 6: Commit**

```bash
git add src/pages/copilot/types.ts src/features/pipelines/askContext.ts src/components/copilot src/pages/dashboard/ask
git commit -m "feat(pipelines): the pipelines branch in the shared Ask functions

Chip, History tag and icon, restore path, focus of the page's own kind,
refusal copy, and the rail's own preference key.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: One shared "Ask about this" button

**Files:**
- Create: `src/components/copilot/AskAboutButton.tsx`
- Modify: `src/components/organizations/detail/StoryItemRow.tsx`. Remove the private `AskAbout`, the `Sparkles` and `AskDraftContext` imports it alone used, and render the shared button.
- Test: `src/components/copilot/AskAboutButton.test.tsx`. The existing `src/components/organizations/detail/StoryItemRow.test.tsx` must still pass unchanged.

**Interfaces:**
- Consumes: `AskDraftContext` from `pages/dashboard/ask/context`, `AskFocus`, and `FOCUS` from `components/organizations/portfolio/styles`.
- Produces: `AskAboutButton({ name, question, focus, className? }: { name: string; question: string; focus: AskFocus; className?: string })`. It renders null outside an Ask provider.

- [ ] **Step 1: Write the failing test** `src/components/copilot/AskAboutButton.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AskDraftContext } from '../../pages/dashboard/ask/context';
import { AskAboutButton } from './AskAboutButton';

function renderButton(draft: ReturnType<typeof vi.fn> | null, onParent = vi.fn()) {
  render(
    <AskDraftContext.Provider value={draft}>
      <div onClick={onParent}>
        <AskAboutButton name="EMEA seats" question="What should I know about this opportunity?" focus={{ kind: 'opportunity', id: 41 }} className="ml-auto" />
      </div>
    </AskDraftContext.Provider>,
  );
  return onParent;
}

describe('AskAboutButton', () => {
  it('prefills the question, focused on the item, without the click reaching what it sits in', async () => {
    const draft = vi.fn();
    const onParent = renderButton(draft);
    await userEvent.click(screen.getByRole('button', { name: 'Ask about this: EMEA seats' }));
    expect(draft).toHaveBeenCalledWith('What should I know about this opportunity?', { kind: 'opportunity', id: 41 });
    expect(onParent).not.toHaveBeenCalled();
  });

  it('is a quiet 11px, 44px target on phones and 36px from sm, with a hidden icon', () => {
    renderButton(vi.fn());
    const button = screen.getByRole('button', { name: 'Ask about this: EMEA seats' });
    expect(button).toHaveClass('min-h-11', 'sm:min-h-9', 'text-[11px]', 'text-ink-muted', 'ml-auto');
    expect(button).toHaveAttribute('draggable', 'false');
    expect(button).toHaveTextContent('Ask about this');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('is not offered outside an Ask provider', () => {
    renderButton(null);
    expect(screen.queryByRole('button', { name: /^Ask about this/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/components/copilot/AskAboutButton.test.tsx`
Expected: FAIL, "Failed to resolve import './AskAboutButton'".

- [ ] **Step 3: Write the button** `src/components/copilot/AskAboutButton.tsx`:

```tsx
import { useContext } from 'react';
import { Sparkles } from 'lucide-react';
import type { AskFocus } from '../../pages/copilot/types';
import { AskDraftContext } from '../../pages/dashboard/ask/context';
import { FOCUS } from '../organizations/portfolio/styles';

/** "Ask about this" (organisation page spec 2026-09-26 §3, Pipelines spec
 *  2026-09-30 §3): types `question` into the Ask rail, focused on `focus`
 *  for that one question, and opens the rail (the sheet on phones). It never
 *  sends. Only inside an Ask provider. The click stops here, so a Pipelines
 *  item or card around it does not open its form. */
export function AskAboutButton({ name, question, focus, className = '' }: { name: string; question: string; focus: AskFocus; className?: string }) {
  const draft = useContext(AskDraftContext);
  if (!draft) return null;
  return (
    <button
      type="button"
      draggable={false}
      onClick={(event) => {
        event.stopPropagation();
        draft(question, focus);
      }}
      aria-label={`Ask about this: ${name}`}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-sm text-[11px] font-semibold text-ink-muted hover:text-ink active:opacity-70 sm:min-h-9 ${FOCUS} ${className}`}
    >
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      Ask about this
    </button>
  );
}
```

- [ ] **Step 4: Use it in `StoryItemRow`.** Delete the `AskAbout` function and its doc comment. Remove `Sparkles` from the `lucide-react` import and the `AskDraftContext` import. Keep `useContext`, which `ShowAccountTags` still uses. Add `import { AskAboutButton } from '../../copilot/AskAboutButton';` and replace `<AskAbout item={item} />` with:

```tsx
          <AskAboutButton
            name={item.title}
            question={askAboutQuestion({ kind: item.kind, id: item.id })}
            focus={{ kind: item.kind, id: item.id }}
            className="ml-auto"
          />
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/components/copilot/AskAboutButton.test.tsx src/components/organizations/detail src/pages/accounts/ask/detailAsk.test.tsx src/pages/organizations/ask`
Expected: PASS. The story item's own "Ask about this" tests and the account and organisation page journeys are unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/components/copilot/AskAboutButton.tsx src/components/copilot/AskAboutButton.test.tsx src/components/organizations/detail/StoryItemRow.tsx
git commit -m "refactor(copilot): one shared Ask about this button, taken out of the story item

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The layout route, the names the pages report, and the harness

**Files:**
- Create: `src/pages/pipelines/ask/pipelinesNames.ts`, `src/pages/pipelines/ask/PipelinesAskLayout.tsx`
- Create (test only): `src/pages/pipelines/ask/testPipelinesAsk.ts`
- Modify: `src/App.tsx` (the `pipelines` routes), `src/pages/pipelines/testPages.tsx` (the `ask` option, a `url` entry), `src/components/pipelines/portfolio/houseRules.test.ts`
- Test: `src/pages/pipelines/ask/PipelinesAskLayout.test.tsx`

**Interfaces:**
- Consumes:
  - `pipelinesContextOf`, `PipelinesNames` (Task 1)
  - `surfaceLabel(…, { pipelines })` and `PIPELINES_ASK_KEY` (Task 2)
  - `AskProvider`, `AskRail`, `AskSurface`, `OrganizationsFrame({rail, scrollKey})`, `same` (existing)
  - `stubCopilot`, `stubPipelines`, `PipelinesStub` (existing)
- Produces:
  - `PipelinesAskLayout()`
  - `PipelinesNamesContext`
  - `useReportPipelineOptions(kind: PipelineKindKey, options: PipelineFilterOptions | null): void`
  - `renderPipelines(url: string | { pathname: string; search?: string; state?: unknown }, { width, nav, strict, ask })`
  - `stubPipelinesAsk({ copilot?, pipelines? }): { copilot, pipelines, release }`. `pipelines` is `stubPipelines`' own spy, so `pipelineQueries` reads it.

- [ ] **Step 1: Write the failing test** `src/pages/pipelines/ask/PipelinesAskLayout.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { OPPORTUNITIES_KIND } from '../../../features/pipelines/pipelineKinds';
import { OPPORTUNITY_ROWS, pipelineFilterOptions } from '../../../features/pipelines/testPipelines';
import { useAsk } from '../../dashboard/ask/useAsk';
import { PipelinesAskLayout } from './PipelinesAskLayout';
import { useReportPipelineOptions } from './pipelinesNames';

const OPTIONS = pipelineFilterOptions(OPPORTUNITY_ROWS, OPPORTUNITIES_KIND);

/** Stands in for a Pipelines view: it reports the opportunities read's
 *  options whatever the URL's kind, so a mismatch shows. */
function Page({ name }: { name: string }) {
  const ask = useAsk()!;
  useReportPipelineOptions('opportunities', OPTIONS);
  const { context, chipLabel } = ask.surface;
  return (
    <div>
      <p data-testid="page">{name}</p>
      <p data-testid="surface">{ask.surface.name}</p>
      <p data-testid="context">{JSON.stringify(context)}</p>
      <p data-testid="chip">{context ? chipLabel(context) : 'none'}</p>
      <p data-testid="conversation">{ask.conversation?.title ?? 'none'}</p>
      <button type="button" onClick={() => ask.setConversation({ id: 3, title: 'Kept', created_at: '', updated_at: '', messages: [] })}>
        Start
      </button>
      <Link to="/pipelines/board?owner=2">Board</Link>
      <Link to="/pipelines/board?owner=2&kind=risks">Risks</Link>
    </div>
  );
}

function renderLayout(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/pipelines" element={<PipelinesAskLayout />}>
          <Route path="list" element={<Page name="List" />} />
          <Route path="board" element={<Page name="Board" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const context = () => JSON.parse(screen.getByTestId('context').textContent!);

describe('PipelinesAskLayout', () => {
  it('asks from the pipelines surface, naming filters from the options a page reports', async () => {
    renderLayout('/pipelines/list?owner=2');
    expect(screen.getByTestId('surface')).toHaveTextContent('pipelines');
    expect(context()).toEqual({ surface: 'pipelines', kind: 'opportunities', view: 'list', filters: { owner: '2' } });
    await waitFor(() => expect(screen.getByTestId('chip')).toHaveTextContent('Pipelines · Opportunities · Owner: Carl CSM'));
  });

  it("names nothing from a read of the other kind", async () => {
    renderLayout('/pipelines/list?kind=risks&owner=2');
    // The page reported opportunities' options: on risks they name nothing.
    await waitFor(() => expect(screen.getByTestId('chip')).toHaveTextContent('Pipelines · Risks · Owner: User 2'));
  });

  it('keeps one conversation across the List, the Board and both kinds', async () => {
    renderLayout('/pipelines/list');
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    await userEvent.click(screen.getByRole('link', { name: 'Board' }));
    expect(screen.getByTestId('page')).toHaveTextContent('Board');
    expect(context()).toEqual({ surface: 'pipelines', kind: 'opportunities', view: 'board', filters: { owner: '2' } });
    expect(screen.getByTestId('conversation')).toHaveTextContent('Kept');
    await userEvent.click(screen.getByRole('link', { name: 'Risks' }));
    expect(context()).toEqual({ surface: 'pipelines', kind: 'risks', view: 'board', filters: { owner: '2' } });
    expect(screen.getByTestId('conversation')).toHaveTextContent('Kept');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/pipelines/ask/PipelinesAskLayout.test.tsx`
Expected: FAIL, "Failed to resolve import './PipelinesAskLayout'".

- [ ] **Step 3: Write the names module** `src/pages/pipelines/ask/pipelinesNames.ts`:

```ts
import { createContext, useContext, useEffect } from 'react';
import type { PipelinesNames } from '../../../features/pipelines/askContext';
import type { PipelineFilterOptions, PipelineKindKey } from '../../../features/pipelines/pipelineTypes';

/** Only the page knows what its read returned: the List and the Board
 *  report their book's filter options, with the kind they were read for, so
 *  a live question's chip can name owners, organisations and accounts before
 *  the server has. Null outside PipelinesAskLayout. */
export const PipelinesNamesContext = createContext<((names: PipelinesNames) => void) | null>(null);

/** `options` is null until the page's read lands: nothing is reported until then. */
export function useReportPipelineOptions(kind: PipelineKindKey, options: PipelineFilterOptions | null): void {
  const report = useContext(PipelinesNamesContext);
  useEffect(() => {
    if (report && options) report({ kind, options });
  }, [report, kind, options]);
}
```

- [ ] **Step 4: Write the layout** `src/pages/pipelines/ask/PipelinesAskLayout.tsx`:

```tsx
import { useCallback, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { surfaceLabel } from '../../../components/copilot/surfaceLabels';
import { pipelinesContextOf, type PipelinesNames } from '../../../features/pipelines/askContext';
import { same } from '../../../lib/same';
import { PIPELINES_ASK_KEY } from '../../dashboard/ask/askPreference';
import { AskProvider } from '../../dashboard/ask/AskProvider';
import { AskRail } from '../../dashboard/ask/AskRail';
import type { AskSurface } from '../../dashboard/ask/context';
import { OrganizationsFrame } from '../../organizations/OrganizationsFrame';
import { PipelinesNamesContext } from './pipelinesNames';

/** The Pipelines routes' Ask (spec 2026-09-30 §3): one conversation above
 *  the List and the Board, for both kinds, so it lasts through every view,
 *  kind and filter change. The frame and its rail (with the pill) sit here,
 *  beside the Outlet, so a route or kind change never remounts the rail;
 *  each page's own OrganizationsFrame inside passes its content straight
 *  through. */
export function PipelinesAskLayout() {
  const { pathname, search } = useLocation();
  const context = useMemo(() => pipelinesContextOf(pathname, search), [pathname, search]);
  const [names, setNames] = useState<PipelinesNames | null>(null);
  // A report that changes nothing keeps the same object, so the chip's
  // callback, and AskProvider's value, don't churn.
  const report = useCallback((next: PipelinesNames) => setNames((prev) => same<PipelinesNames | null>(prev, next)), []);
  const chipLabel = useCallback(
    (asked: Parameters<AskSurface['chipLabel']>[0]) => surfaceLabel(asked, { pipelines: names }),
    [names],
  );
  const surface: AskSurface = useMemo(() => ({ name: 'pipelines', context, chipLabel }), [context, chipLabel]);
  // Another view or kind starts at the top of the shared scroll column, as
  // each page did on its own; a filter change keeps the place.
  const scrollKey = context ? `${context.view}:${context.kind}` : null;
  return (
    <PipelinesNamesContext.Provider value={report}>
      <AskProvider surface={surface} preferenceKey={PIPELINES_ASK_KEY}>
        <OrganizationsFrame rail={<AskRail />} scrollKey={scrollKey}>
          <Outlet />
        </OrganizationsFrame>
      </AskProvider>
    </PipelinesNamesContext.Provider>
  );
}
```

- [ ] **Step 5: Route it** in `src/App.tsx`. Add `import { PipelinesAskLayout } from './pages/pipelines/ask/PipelinesAskLayout';` beside the Pipelines imports, and change the `pipelines` block to:

```tsx
          <Route path="pipelines">
            <Route index element={<Navigate to="list" replace />} />
            {/* One Ask conversation above both views and both kinds
                (pipelines spec 2026-09-30 §3). */}
            <Route element={<PipelinesAskLayout />}>
              <Route path="list" element={<PipelinesList />} />
              <Route path="board" element={<PipelinesBoard />} />
            </Route>
          </Route>
```

- [ ] **Step 6: The harness.**

`src/pages/pipelines/ask/testPipelinesAsk.ts`:

```ts
import { vi } from 'vitest';
import { stubCopilot } from '../../../components/copilot/testCopilot';
import { stubPipelines, type PipelinesStub } from '../../../features/pipelines/testPipelines';

/** Test-only. The Pipelines book (stubPipelines) and the Copilot
 *  (stubCopilot) behind one fetch, so the page and its rail both answer.
 *  `copilot` is the spy postedBodies reads; `pipelines` is stubPipelines'
 *  own spy (pipelineQueries, recordWrites). */
export function stubPipelinesAsk(options: { copilot?: Parameters<typeof stubCopilot>[0]; pipelines?: PipelinesStub } = {}) {
  const copilot = stubCopilot(options.copilot);
  const pipelines = stubPipelines(options.pipelines);
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).includes('/copilot/') ? copilot.spy(String(input), init) : pipelines(input, init),
  );
  vi.stubGlobal('fetch', spy);
  return { copilot: copilot.spy, pipelines, release: copilot.release };
}
```

`src/pages/pipelines/testPages.tsx`. Import `PipelinesAskLayout` from `"./ask/PipelinesAskLayout"`. Replace the doc comments above `renderPipelines` and the function with:

```tsx
/** The Pipelines views on the real store and router. `nav` adds the real
 *  Navbar (List | Board and the kind switch). `strict` renders under
 *  StrictMode, as main.tsx does: mount effects run twice. `ask` puts both
 *  routes under PipelinesAskLayout, as App.tsx does. `url` may carry
 *  navigation state (a History handover). */
export function renderPipelines(
  url: string | { pathname: string; search?: string; state?: unknown },
  {
    width = 1440,
    nav = false,
    strict = false,
    ask = false,
  }: { width?: number; nav?: boolean; strict?: boolean; ask?: boolean } = {},
) {
  setViewport(width);
  const store = makeStore();
  const wrap = (tree: ReactNode) =>
    strict ? <StrictMode>{tree}</StrictMode> : tree;
  const pages = [
    <Route
      key="list"
      path="/pipelines/list"
      element={
        <>
          <List />
          <Where />
        </>
      }
    />,
    <Route
      key="board"
      path="/pipelines/board"
      element={
        <>
          <Board />
          <Where />
        </>
      }
    />,
  ];
  render(
    wrap(
      <Provider store={store}>
        <MemoryRouter initialEntries={[url]}>
          <SlotHost bare={!nav}>
            {nav ? <Navbar /> : null}
            <Routes>
              {ask ? <Route element={<PipelinesAskLayout />}>{pages}</Route> : pages}
              <Route
                path="/organizations/:id"
                element={
                  <>
                    <p>Organization page</p>
                    <Where />
                  </>
                }
              />
              <Route
                path="/accounts/:id"
                element={
                  <>
                    <p>Account page</p>
                    <Where />
                  </>
                }
              />
            </Routes>
          </SlotHost>
        </MemoryRouter>
      </Provider>,
    ),
  );
  return { store };
}
```

- [ ] **Step 7: Put the new files under the house rules.** In `src/components/pipelines/portfolio/houseRules.test.ts`, change the second glob to:

```ts
  ...(import.meta.glob(
    ['../../../pages/pipelines/List.tsx', '../../../pages/pipelines/Board.tsx', '../../../pages/pipelines/ask/PipelinesAskLayout.tsx', '../../copilot/AskAboutButton.tsx'],
    { query: '?raw', eager: true, import: 'default' },
  ) as Record<string, string>),
```

Change its comment to "The Pipelines portfolio (spec 2026-09-30 §1 and §3): its components, its two pages, their Ask layout and the shared Ask about this button."

- [ ] **Step 8: Run the tests and the type-check**

Run: `npx vitest run --maxWorkers=2 src/pages/pipelines src/components/pipelines/portfolio/houseRules.test.ts`
Expected: PASS. The existing `List.test.tsx`, `Board.test.tsx` and `src/e2e/pipelines.test.tsx` render without `ask` and are unchanged.

Run: `npx tsc -b`. Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/pages/pipelines src/App.tsx src/components/pipelines/portfolio/houseRules.test.ts
git commit -m "feat(pipelines): one Ask conversation above the List and the Board, for both kinds

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The rail beside the List and the Board

**Files:**
- Modify: `src/pages/pipelines/List.tsx`, `src/pages/pipelines/Board.tsx`, `src/components/pipelines/portfolio/PipelineBoard.tsx`, `src/components/pipelines/portfolio/PipelineColumn.tsx`, `src/components/layout/Navbar.tsx` (comment only)
- Test: `src/pages/pipelines/ask/pipelinesAsk.test.tsx`

**Interfaces:**
- Consumes: `useReportPipelineOptions` and `PipelinesAskLayout` (Task 4), `PIPELINES_ASK_KEY` (Task 2), `renderPipelines` and `stubPipelinesAsk` (Task 4), `useBoardRail(closeCard)` (existing), `postedBodies` (existing).
- Produces:
  - `PipelineBoardProps.narrow?: boolean`
  - `PipelineColumnProps.narrow?: boolean`

- [ ] **Step 1: Write the failing test** `src/pages/pipelines/ask/pipelinesAsk.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { resetViewport } from '../../../test/viewport';
import { PIPELINES_ASK_KEY } from '../../dashboard/ask/askPreference';
import { renderPipelines } from '../testPages';
import { stubPipelinesAsk } from './testPipelinesAsk';

// Integration tier: the real Pipelines List and Board under
// PipelinesAskLayout, the real rail and pill, store and router; fetch
// answers the book and the Copilot in the backend's shapes
// (feat/pipelines-ask, #79). `filters` carry only the set keys; the kind is
// always sent; a focus only from "Ask about this".
const rail = () => screen.queryByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');
const log = () => screen.getByRole('log', { name: 'Ask Revenact messages' });
const views = () => screen.getByRole('navigation', { name: 'Pipelines views' });
const kinds = () => screen.getByRole('navigation', { name: 'Opportunities or risks' });
const pill = () => within(screen.getByTestId('nav-actions'));
const column = (key: string) => document.querySelector(`[data-column="${key}"]`) as HTMLElement;
async function findColumn(key: string): Promise<HTMLElement> {
  await waitFor(() => expect(column(key)).not.toBeNull());
  return column(key);
}

describe('Ask Revenact on the Pipelines List and Board', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('puts the pill in the top bar and the glass rail beside the list, open from xl', async () => {
    stubPipelinesAsk();
    renderPipelines('/pipelines/list', { ask: true });
    await screen.findByRole('button', { name: 'EMEA seats' });
    expect(rail()).toHaveClass('w-[320px]');
    expect(within(rail()!).getByRole('region', { name: 'Ask Revenact conversation' })).toHaveClass('rv-card-glass');
    expect(pill().getByRole('button', { name: 'New chat' })).toBeInTheDocument();
    expect(pill().getByRole('button', { name: 'History' })).toBeInTheDocument();
    expect(pill().getByRole('button', { name: 'Hide Copilot' })).toHaveAttribute('aria-pressed', 'true');
    // Glass is the rail's alone: items stay solid.
    expect(document.querySelector('[data-item-id="41"]')).toHaveClass('bg-surface');
    expect(document.querySelectorAll('.rv-card-glass')).toHaveLength(1);
  });

  it("asks with the kind and the list's filters, names them in the chip, and keeps the server's label", async () => {
    const { copilot } = stubPipelinesAsk({ copilot: { label: () => 'Pipelines · Opportunities · Owner: Carl CSM · Organisation: Pizza Hut' } });
    renderPipelines('/pipelines/list?owner=2&organisation=7', { ask: true });
    await screen.findByRole('button', { name: 'EMEA seats' });
    expect(await within(rail()!).findByText('Pipelines · Opportunities · Owner: Carl CSM · Organization: Pizza Hut')).toBeInTheDocument();
    await userEvent.type(composer(), 'What should I chase?{enter}');
    await screen.findByText('Answer to: What should I chase?');
    expect(postedBodies(copilot)[0]).toEqual({
      content: 'What should I chase?',
      context: { surface: 'pipelines', kind: 'opportunities', view: 'list', filters: { owner: '2', organisation: '7' } },
    });
    // The asked question shows the server's words, not the client's.
    expect(within(log()).getByText('Pipelines · Opportunities · Owner: Carl CSM · Organisation: Pizza Hut')).toBeInTheDocument();
  });

  it('moves the chip with the filters', async () => {
    stubPipelinesAsk();
    renderPipelines('/pipelines/list?owner=2&organisation=7', { ask: true });
    await within(rail()!).findByText('Pipelines · Opportunities · Owner: Carl CSM · Organization: Pizza Hut');
    await userEvent.click(screen.getByRole('button', { name: 'Remove Owner: Carl CSM' }));
    expect(await within(rail()!).findByText('Pipelines · Opportunities · Organization: Pizza Hut')).toBeInTheDocument();
  });

  it('keeps the conversation from the Board to the List and into the risks, each question with its own view and kind', async () => {
    const { copilot } = stubPipelinesAsk();
    renderPipelines('/pipelines/board?owner=2', { ask: true, nav: true });
    await within(await findColumn('negotiation')).findByRole('button', { name: 'EMEA seats' });
    await userEvent.type(composer(), 'What closes soon?{enter}');
    await screen.findByText('Answer to: What closes soon?');
    // stage is the Board's own default group, and no stage means every stage: neither is sent.
    expect(postedBodies(copilot)[0].context).toEqual({ surface: 'pipelines', kind: 'opportunities', view: 'board', filters: { owner: '2' } });

    await userEvent.click(within(views()).getByRole('link', { name: 'List' }));
    await screen.findByRole('button', { name: 'EMEA seats' });
    await userEvent.click(within(kinds()).getByRole('link', { name: 'Risks' }));
    await screen.findByRole('button', { name: 'Admin left' });
    expect(screen.getByText('Answer to: What closes soon?')).toBeInTheDocument();
    expect(await within(rail()!).findByText('Pipelines · Risks · Owner: Carl CSM')).toBeInTheDocument();
    await userEvent.type(composer(), 'And the risks?{enter}');
    await screen.findByText('Answer to: And the risks?');
    expect(postedBodies(copilot)[1].context).toEqual({ surface: 'pipelines', kind: 'risks', view: 'list', filters: { owner: '2' } });
  });

  it("narrows the board's columns while the rail is open", async () => {
    stubPipelinesAsk();
    renderPipelines('/pipelines/board', { ask: true });
    await within(await findColumn('negotiation')).findByRole('button', { name: 'EMEA seats' });
    expect(column('negotiation')).toHaveClass('w-64');
    expect(column('closed_lost')).toHaveClass('w-44');
    await userEvent.click(pill().getByRole('button', { name: 'Hide Copilot' }));
    await waitFor(() => expect(column('negotiation')).toHaveClass('w-72'));
  });

  it('below xl the rail narrows the columns, and a card still opens its form over the rail', async () => {
    stubPipelinesAsk();
    renderPipelines('/pipelines/board', { ask: true, width: 1100 });
    await within(await findColumn('negotiation')).findByRole('button', { name: 'EMEA seats' });
    // The rail is closed below xl by default.
    expect(rail()).not.toBeInTheDocument();
    expect(column('negotiation')).toHaveClass('w-72');
    await userEvent.click(pill().getByRole('button', { name: 'Show Copilot' }));
    expect(await screen.findByRole('complementary', { name: 'Ask Revenact' })).toBeInTheDocument();
    expect(column('negotiation')).toHaveClass('w-64');
    await userEvent.click(within(column('negotiation')).getByRole('button', { name: 'EMEA seats' }));
    expect(await screen.findByRole('heading', { name: 'Edit EMEA seats' })).toBeInTheDocument();
    expect(rail()).toBeInTheDocument();
  });

  it('refuses an organisation or account filter the asker cannot open, with no Retry', async () => {
    const { copilot } = stubPipelinesAsk({ copilot: { refuse: { filters: { account: ['Not an account you can open.'] } } } });
    renderPipelines('/pipelines/list?account=12', { ask: true });
    await screen.findByRole('button', { name: 'EMEA seats' });
    await userEvent.type(composer(), 'What is at risk?{enter}');
    expect(await within(rail()!).findByRole('alert')).toHaveTextContent("You can't ask about this list. Clear the filters and ask again.");
    expect(within(rail()!).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(postedBodies(copilot)).toHaveLength(1);
  });

  it('is a full-screen sheet from the switch on a phone, never a rail', async () => {
    stubPipelinesAsk();
    renderPipelines('/pipelines/list', { ask: true, width: 375 });
    await screen.findByRole('button', { name: 'EMEA seats' });
    expect(rail()).not.toBeInTheDocument();
    await userEvent.click(pill().getByRole('button', { name: 'Show Copilot' }));
    expect(await screen.findByRole('dialog', { name: 'Ask Revenact' })).toHaveAttribute('aria-modal', 'true');
    // The sheet is a visit, not a saved choice.
    expect(localStorage.getItem(PIPELINES_ASK_KEY)).toBeNull();
  });

  it("keeps Pipelines' own open/closed choice", async () => {
    stubPipelinesAsk();
    renderPipelines('/pipelines/list', { ask: true });
    await screen.findByRole('button', { name: 'EMEA seats' });
    await userEvent.click(pill().getByRole('button', { name: 'Hide Copilot' }));
    expect(localStorage.getItem(PIPELINES_ASK_KEY)).toBe('closed');
    expect(localStorage.getItem('revenact_accounts_ask')).toBeNull();
  });

  it('mounts nothing outside the Ask layout', async () => {
    stubPipelinesAsk();
    renderPipelines('/pipelines/list');
    await screen.findByRole('button', { name: 'EMEA seats' });
    expect(rail()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copilot$/ })).not.toBeInTheDocument();
  });
});
```

The fourth case uses `nav: true`, where the Navbar draws the slot rather than the bare `nav-actions` stand-in. That case only types in the composer, so it never needs `pill()`. The item and card selectors (`data-item-id`, `data-column`) and the names "EMEA seats", "Admin left" and "Edit EMEA seats" come from `PipelineItem`, `StageColumn`, `testPipelines.ts` and `OpportunityFormModal`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/pipelines/ask/pipelinesAsk.test.tsx`

Expected:
- The chip cases FAIL, reading "Owner: User 2 · Organization: Organization 7", because the pages don't report their options yet.
- The two board cases FAIL on `w-64`.
- The rail, refusal, sheet and preference cases already pass through Tasks 2 and 4.

- [ ] **Step 3: Report the options, and narrow the Board.**

`src/pages/pipelines/List.tsx`: import `useReportPipelineOptions` from `./ask/pipelinesNames`. Directly after `const options = book.data?.filters ?? null;` add:

```ts
  // Ask Revenact (spec §3): the chip names owners, organisations and
  // accounts from this read's options. Opening an item narrows nothing
  // (plan Decision 8).
  useReportPipelineOptions(kind.key, options);
```

Change the `@container` comment to "Containers: the tiles and items follow this column, which the Ask rail narrows, not the window."

`src/pages/pipelines/Board.tsx`:
- Import `useReportPipelineOptions` from `./ask/pipelinesNames` and `useBoardRail` from `../organizations/ask/useBoardRail`.
- Above `export function Board()`, add:

```ts
/** A card opens its form, a modal over the rail at every width, so the rail
 *  never has an open card to close (plan Decision 6): closing the form on a
 *  viewport change would lose its unsaved edits. */
const KEEP_FORM = () => {};
```

- After `const forms = usePipelineForms();`, add:

```ts
  // The Ask rail (spec §1 "Board", §3) narrows the columns while it is open,
  // as on the Accounts Board (useBoardRail).
  const { railOpen } = useBoardRail(KEEP_FORM);
```

- After `const options = book.data?.filters ?? null;`, add `useReportPipelineOptions(kind.key, options);` with the same comment as the List, reading "…on the Board. Opening a card narrows nothing (plan Decision 8)."
- Pass `narrow={railOpen}` to `<PipelineBoard … />`.

`src/components/pipelines/portfolio/PipelineBoard.tsx`:
- Add to `PipelineBoardProps`:

```ts
  /** The Ask rail is open beside the board (from `sm`): columns are w-64
   *  rather than w-72, so more of them fit beside it. */
  narrow?: boolean;
```

- Destructure `narrow = false`.
- Change `<BoardSkeleton isSm={isSm} narrow={false} />` to `<BoardSkeleton isSm={isSm} narrow={narrow} />`.
- Pass `narrow={narrow}` to `<PipelineColumn … />`.

`src/components/pipelines/portfolio/PipelineColumn.tsx`:
- Add to `PipelineColumnProps`:

```ts
  /** Beside the open Ask rail: w-64 rather than w-72 (from sm). */
  narrow?: boolean;
```

- Destructure `narrow = false`.
- Change the `width` prop to `width={collapsed ? 'w-44' : narrow ? 'w-64' : 'w-72'}`.

`src/components/layout/Navbar.tsx`: in the `isPipelinesView` comment, replace "the actions slot (empty until delivery 2's Ask)" with "the actions slot (where `PipelinesAskLayout`'s rail portals the Ask pill)".

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/pages/pipelines src/components/pipelines src/components/layout/Navbar.test.tsx src/e2e/pipelines.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/pipelines src/components/pipelines/portfolio src/components/layout/Navbar.tsx
git commit -m "feat(pipelines): Ask Revenact beside the Pipelines List and Board

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: "Ask about this" on a List item and a Board card

**Files:**
- Modify: `src/components/pipelines/portfolio/PipelineItem.tsx`, `src/components/pipelines/portfolio/PipelineCard.tsx`
- Test: `src/components/pipelines/portfolio/PipelineItem.test.tsx` (append), `src/components/pipelines/portfolio/PipelineCard.test.tsx` (new), `src/pages/pipelines/ask/askAbout.test.tsx` (new)

**Interfaces:**
- Consumes: `AskAboutButton` (Task 3), `pipelineFocusOf` and `pipelineAskQuestion` (Task 1), `renderPipelines` and `stubPipelinesAsk` (Task 4).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing unit tests.**

Append to `src/components/pipelines/portfolio/PipelineItem.test.tsx`. Add `import { AskDraftContext } from '../../../pages/dashboard/ask/context';` at the top.

```tsx
describe('PipelineItem: Ask about this (spec §3)', () => {
  function renderAsking(row: PipelineRow, selecting = false) {
    const draft = vi.fn();
    const onOpen = vi.fn();
    render(
      <MemoryRouter>
        <AskDraftContext.Provider value={draft}>
          <ul>
            <PipelineItem
              row={row}
              kind={row.kind === 'risk' ? RISKS_KIND : OPPORTUNITIES_KIND}
              currency="USD"
              selecting={selecting}
              selected={false}
              onToggleSelect={vi.fn()}
              onOpen={onOpen}
            />
          </ul>
        </AskDraftContext.Provider>
      </MemoryRouter>,
    );
    return { draft, onOpen };
  }

  it('prefills a question about this item, focused on it, without opening its form', async () => {
    const { draft, onOpen } = renderAsking(adminLeft);
    await userEvent.click(screen.getByRole('button', { name: 'Ask about this: Admin left' }));
    expect(draft).toHaveBeenCalledWith('What should I know about this risk?', { kind: 'risk', id: 71 });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('ends the item line, pushed right', () => {
    renderAsking(emeaSeats);
    const item = document.querySelector('[data-item-id="41"] [data-part="item"]') as HTMLElement;
    const button = within(item).getByRole('button', { name: 'Ask about this: EMEA seats' });
    expect(item.lastElementChild).toBe(button);
    expect(button).toHaveClass('ml-auto');
  });

  it('is hidden while selecting, when a tap selects', () => {
    renderAsking(emeaSeats, true);
    expect(screen.queryByRole('button', { name: /^Ask about this/ })).not.toBeInTheDocument();
  });
});
```

Create `src/components/pipelines/portfolio/PipelineCard.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OPPORTUNITIES_KIND } from '../../../features/pipelines/pipelineKinds';
import { globexUplift } from '../../../features/pipelines/testPipelines';
import { AskDraftContext } from '../../../pages/dashboard/ask/context';
import { PipelineCard } from './PipelineCard';

function renderCard(draft: ReturnType<typeof vi.fn> | null) {
  const onOpen = vi.fn();
  render(
    <MemoryRouter>
      <AskDraftContext.Provider value={draft}>
        <ul>
          <PipelineCard
            row={globexUplift}
            kind={OPPORTUNITIES_KIND}
            currency="USD"
            isSm
            canMove
            moveDisabled={false}
            onOpen={onOpen}
            onMove={vi.fn()}
            onDragStart={vi.fn()}
            onDragEnd={vi.fn()}
          />
        </ul>
      </AskDraftContext.Provider>
    </MemoryRouter>,
  );
  return { onOpen };
}

describe('PipelineCard: Ask about this (spec §3)', () => {
  it('prefills a question about this card, focused on it, without opening its form', async () => {
    const draft = vi.fn();
    const { onOpen } = renderCard(draft);
    const button = screen.getByRole('button', { name: 'Ask about this: Globex uplift' });
    expect(button).toHaveAttribute('draggable', 'false');
    await userEvent.click(button);
    expect(draft).toHaveBeenCalledWith('What should I know about this opportunity?', { kind: 'opportunity', id: 43 });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('ends the facts row, pushed right', () => {
    renderCard(vi.fn());
    const button = screen.getByRole('button', { name: 'Ask about this: Globex uplift' });
    expect(button.parentElement!.lastElementChild).toBe(button);
    expect(button).toHaveClass('ml-auto');
  });

  it('is not offered outside an Ask provider', () => {
    renderCard(null);
    expect(screen.queryByRole('button', { name: /^Ask about this/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Write the failing integration test** `src/pages/pipelines/ask/askAbout.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { resetViewport } from '../../../test/viewport';
import { renderPipelines } from '../testPages';
import { stubPipelinesAsk } from './testPipelinesAsk';

// Integration tier: "Ask about this" on the real List and Board under
// PipelinesAskLayout, the real rail and sheet, store and router; fetch
// answers the book and the Copilot (feat/pipelines-ask, #79).
const rail = () => screen.getByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact') as HTMLInputElement;
const kinds = () => screen.getByRole('navigation', { name: 'Opportunities or risks' });
const LIST = { surface: 'pipelines', kind: 'opportunities', view: 'list', filters: {} };

describe('Ask about this on Pipelines', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('types a question about a List item, focused on it for one question, and opens no form', async () => {
    const { copilot } = stubPipelinesAsk();
    renderPipelines('/pipelines/list', { ask: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: EMEA seats' }));
    expect(await within(rail()).findByText('Pipelines · Opportunities · This opportunity')).toBeInTheDocument();
    expect(composer()).toHaveValue('What should I know about this opportunity?');
    expect(within(rail()).getByRole('button', { name: 'Remove focus' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit EMEA seats' })).not.toBeInTheDocument();
    expect(postedBodies(copilot)).toHaveLength(0);

    await userEvent.type(composer(), '{enter}');
    await screen.findByText('Answer to: What should I know about this opportunity?');
    expect(postedBodies(copilot)[0].context).toEqual({ ...LIST, focus: { kind: 'opportunity', id: 41 } });
    // Spent by the send: the chip is the list again, and so is the next question.
    expect(within(rail()).getByText('Pipelines · Opportunities')).toBeInTheDocument();
    await userEvent.type(composer(), 'And the rest?{enter}');
    await screen.findByText('Answer to: And the rest?');
    expect(postedBodies(copilot)[1].context).toEqual(LIST);
  });

  it('opens the rail below xl with the question about a Board card', async () => {
    const { copilot } = stubPipelinesAsk();
    renderPipelines('/pipelines/board?kind=risks', { ask: true, width: 1100 });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: Admin left' }));
    expect(await within(rail()).findByText('Pipelines · Risks · This risk')).toBeInTheDocument();
    expect(composer()).toHaveValue('What should I know about this risk?');
    await userEvent.type(composer(), '{enter}');
    await screen.findByText('Answer to: What should I know about this risk?');
    expect(postedBodies(copilot)[0].context).toEqual({ surface: 'pipelines', kind: 'risks', view: 'board', filters: {}, focus: { kind: 'risk', id: 71 } });
  });

  it('opens the sheet with the question on a phone', async () => {
    stubPipelinesAsk();
    renderPipelines('/pipelines/list', { ask: true, width: 375 });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: Globex uplift' }));
    const sheet = await screen.findByRole('dialog', { name: 'Ask Revenact' });
    expect(within(sheet).getByText('Pipelines · Opportunities · This opportunity')).toBeInTheDocument();
    expect(within(sheet).getByPlaceholderText('Ask Revenact')).toHaveValue('What should I know about this opportunity?');
  });

  it('drops an unsent focus and its untouched question when the kind changes', async () => {
    stubPipelinesAsk();
    renderPipelines('/pipelines/list', { ask: true, nav: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: EMEA seats' }));
    await within(rail()).findByText('Pipelines · Opportunities · This opportunity');
    await userEvent.click(within(kinds()).getByRole('link', { name: 'Risks' }));
    expect(await within(rail()).findByText('Pipelines · Risks')).toBeInTheDocument();
    expect(composer()).toHaveValue('');
  });

  it('refuses an item the asker can no longer read, and the next question is about the list', async () => {
    const { copilot } = stubPipelinesAsk({ copilot: { refuse: { focus: ['Not an opportunity or risk you can open.'] } } });
    renderPipelines('/pipelines/list', { ask: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: EMEA seats' }));
    await userEvent.type(composer(), '{enter}');
    expect(await within(rail()).findByRole('alert')).toHaveTextContent('You can no longer ask about this opportunity.');
    expect(within(rail()).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    await waitFor(() => expect(within(rail()).getByText('Pipelines · Opportunities')).toBeInTheDocument());
    expect(postedBodies(copilot)).toHaveLength(1);
  });

  it('is not offered outside the Ask layout', async () => {
    stubPipelinesAsk();
    renderPipelines('/pipelines/list');
    await screen.findByRole('button', { name: 'EMEA seats' });
    expect(screen.queryByRole('button', { name: /^Ask about this/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/pipelines/portfolio/PipelineItem.test.tsx src/components/pipelines/portfolio/PipelineCard.test.tsx src/pages/pipelines/ask/askAbout.test.tsx`
Expected: every new case FAILS, except the two "not offered" cases. The button is not rendered yet.

- [ ] **Step 4: Add the button.**

`src/components/pipelines/portfolio/PipelineItem.tsx`:
- Add these imports:

```ts
import { pipelineAskQuestion, pipelineFocusOf } from '../../../features/pipelines/askContext';
import { AskAboutButton } from '../../copilot/AskAboutButton';
```

- After `const activate = …`, add `const focus = pipelineFocusOf(row);`.
- After the signal `<span className="flex min-w-0 @min-[60rem]:w-28 @min-[60rem]:justify-end">…</span>`, as the last child of `data-part="item"`, add:

```tsx
        {/* Ask about this (spec §3), shown under an Ask provider only;
            while selecting a tap selects, so it steps aside. */}
        {selecting ? null : (
          <AskAboutButton name={row.title} question={pipelineAskQuestion(focus)} focus={focus} className="ml-auto" />
        )}
```

- In the component's doc comment, add: "Under Ask Revenact its line ends with "Ask about this", which narrows one question to the item."

`src/components/pipelines/portfolio/PipelineCard.tsx`:
- Add the same two imports.
- After `const targets = …`, add `const focus = pipelineFocusOf(row);`.
- As the last child of the facts row (`<div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">`), after `<PipelineSignal … />`, add:

```tsx
        <AskAboutButton name={row.title} question={pipelineAskQuestion(focus)} focus={focus} className="ml-auto" />
```

- In its doc comment, add: "Under Ask Revenact the facts row ends with "Ask about this"."

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/components/pipelines src/pages/pipelines src/e2e/pipelines.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/pipelines/portfolio src/pages/pipelines/ask/askAbout.test.tsx
git commit -m "feat(pipelines): Ask about this on a List item and a Board card

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: History reopens a Pipelines conversation on its view, kind and filters

**Files:**
- Test: `src/pages/pipelines/ask/historyRestore.test.tsx`

**Interfaces:**
- Consumes:
  - `pipelinesPath` and `originPath` (Tasks 1 and 2)
  - `renderPipelines(url | entry, { ask })` and `stubPipelinesAsk` (Task 4)
  - `AskHandover` (`{askConversationId?, askConversation?}`) from `AskProvider`
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the test** `src/pages/pipelines/ask/historyRestore.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetViewport } from '../../../test/viewport';
import { renderPipelines } from '../testPages';
import { stubPipelinesAsk } from './testPipelinesAsk';

const log = () => screen.getByRole('log', { name: 'Ask Revenact messages' });
const where = () => screen.getByTestId('where');
const history = () => within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'History' });

const conversation = (id: number, title: string, origin: Record<string, unknown>) => ({
  id,
  title,
  created_at: '',
  updated_at: '',
  origin,
  messages: [
    { id: 1, role: 'user', content: title, context: { ...origin, focus: null }, sources: [], questions: [], created_at: '' },
    { id: 2, role: 'assistant', content: `Answer: ${title}`, sources: [], questions: [], created_at: '' },
  ],
});

const ON_RISKS_BOARD = conversation(16, 'Which risks are urgent?', {
  surface: 'pipelines',
  kind: 'risks',
  view: 'board',
  filters: { priority: 'high' },
  label: 'Pipelines · Risks · Priority: High',
});
const UNGROUPED = conversation(18, 'What is unassigned?', {
  surface: 'pipelines',
  kind: 'opportunities',
  view: 'list',
  filters: { owner: '2', group: 'none' },
  label: 'Pipelines · Opportunities · Owner: Carl CSM',
});
const ON_EMEA = conversation(15, 'What does this mean for EMEA?', { surface: 'accounts', view: 'detail', account: 12, label: 'EMEA' });

describe('History on Pipelines', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("tags a risks conversation with the server's label and reopens it on the risks Board with its filters", async () => {
    stubPipelinesAsk({ copilot: { conversations: [ON_RISKS_BOARD], conversationById: { 16: ON_RISKS_BOARD } } });
    renderPipelines('/pipelines/list', { ask: true });
    await screen.findByRole('button', { name: 'EMEA seats' });
    await userEvent.click(history());
    const item = await screen.findByRole('button', { name: /Which risks are urgent\?/ });
    expect(within(item).getByText('Pipelines · Risks · Priority: High')).toBeInTheDocument();
    await userEvent.click(item);
    await waitFor(() => expect(where()).toHaveTextContent('/pipelines/board?kind=risks&priority=high'));
    expect(await within(log()).findByText('Answer: Which risks are urgent?')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Admin left' })).toBeInTheDocument();
  });

  it('reopens an ungrouped List as group=none', async () => {
    stubPipelinesAsk({ copilot: { conversations: [UNGROUPED], conversationById: { 18: UNGROUPED } } });
    renderPipelines('/pipelines/board', { ask: true });
    await userEvent.click(history());
    await userEvent.click(await screen.findByRole('button', { name: /What is unassigned\?/ }));
    await waitFor(() => expect(where()).toHaveTextContent('/pipelines/list?owner=2&group=none'));
  });

  it("sends another surface's conversation to its own page", async () => {
    stubPipelinesAsk({ copilot: { conversations: [ON_EMEA], conversationById: { 15: ON_EMEA } } });
    renderPipelines('/pipelines/list', { ask: true });
    await screen.findByRole('button', { name: 'EMEA seats' });
    await userEvent.click(history());
    await userEvent.click(await screen.findByRole('button', { name: /What does this mean for EMEA\?/ }));
    await waitFor(() => expect(where()).toHaveTextContent('/accounts/12'));
  });

  it("opens a conversation handed over from another surface's History in the rail, even below xl", async () => {
    stubPipelinesAsk();
    renderPipelines(
      { pathname: '/pipelines/board', search: '?kind=risks&priority=high', state: { askConversationId: 16, askConversation: ON_RISKS_BOARD } },
      { ask: true, width: 1100 },
    );
    expect(await within(log()).findByText('Answer: Which risks are urgent?')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run --maxWorkers=2 src/pages/pipelines/ask/historyRestore.test.tsx`

Expected: PASS. The logic landed in Tasks 1–5, and these tests pin it end to end through the real History popover. Check that a test can fail by temporarily changing `pipelinesPath` to drop the kind. The first case must then fail on the path. Restore it afterwards.

If a case fails, debug it with superpowers:systematic-debugging. Fix the code, not the expectation, unless the expectation contradicts the contract. The likely causes:
- The query order, which follows `pipelineUrlSearch`'s fixed order: `kind`, `search`, `organisation`, `account`, `owner`, `stage`, `priority`, `department`, `date`, `changed`, `ids`, `sort`, `group`.
- The History item's accessible name. Copy it from `src/pages/accounts/ask/historyRestore.test.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/pipelines/ask/historyRestore.test.tsx
git commit -m "test(pipelines): History reopens a Pipelines conversation on its view, kind and filters

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Withheld turns: no chip, no tag, no reopen, on every surface

This task handles the separate backend fix being built now (Global Constraints). The audit found nothing to change:
- `CopilotRail`'s `chipOf` returns `undefined` for a `null` or absent `context`, so `UserTurn` draws no chip. This is the one rail every surface uses.
- `HistoryPopover` draws a tag only when `c.origin` is set, and so does `CopilotSidebar` (`originTag` returns null).
- `AskProvider.openFromHistory` navigates only when `origin` is set. A `null` origin opens the conversation where the person is.

No test pins the user turn with a stripped `context` today. The tests below pin it, and they must fail if a chip or a reopen were ever drawn from a missing context or origin.

**Files:**
- Test: `src/components/copilot/CopilotRail.test.tsx` (append), `src/pages/copilot/CopilotSidebar.origin.test.tsx` (append), `src/pages/pipelines/ask/historyRestore.test.tsx` (append)

**Interfaces:**
- Consumes: `CopilotRail`, `surfaceLabel`, `CopilotSidebar`, `renderPipelines`, `stubPipelinesAsk`.
- Produces: nothing.

- [ ] **Step 1: Write the tests.**

`src/components/copilot/CopilotRail.test.tsx`, inside `describe('CopilotRail')`:

```tsx
  it("draws no chip on a turn whose context the server withheld, whichever surface the others came from", () => {
    const seen: SurfaceContext[] = [
      DASH,
      { surface: 'accounts', view: 'list', filters: {}, label: 'Accounts' },
      { surface: 'pipelines', kind: 'risks', view: 'board', filters: {}, label: 'Pipelines · Risks' },
    ];
    const conversation: Conversation = {
      id: 9,
      title: 'Shared',
      created_at: '',
      updated_at: '',
      origin: null,
      visibility: 'partial',
      messages: [
        ...seen.map((context, i) => ({ id: i + 1, role: 'user' as const, content: `Seen ${i}`, context, sources: [], questions: [], created_at: '' })),
        { id: 10, role: 'user', content: 'Withheld (null)', context: null, sources: [], questions: [], created_at: '' },
        { id: 11, role: 'user', content: 'Withheld (absent)', sources: [], questions: [], created_at: '' },
      ],
    };
    render(
      <MemoryRouter>
        <CopilotRail context={null} onClearContext={() => {}} conversation={conversation} onConversation={() => {}} chipLabel={(c) => surfaceLabel(c)} />
      </MemoryRouter>,
    );
    const log = screen.getByRole('log', { name: 'Copilot messages' });
    // A turn is its text, with the chip above it when there is one.
    const turn = (text: string) => within(log).getByText(text).parentElement!;
    for (const text of ['Seen 0', 'Seen 1', 'Seen 2']) expect(turn(text).children).toHaveLength(2);
    expect(within(log).getByText('Pipelines · Risks')).toBeInTheDocument();
    expect(turn('Withheld (null)').children).toHaveLength(1);
    expect(turn('Withheld (absent)').children).toHaveLength(1);
  });
```

`src/pages/copilot/CopilotSidebar.origin.test.tsx`, inside its `describe`:

```tsx
  it("tags a Pipelines conversation with the server's label, and a withheld one (no origin) with its time alone", () => {
    const store = configureStore({ reducer: { knowledge: knowledgeReducer } });
    const now = new Date().toISOString();
    const conversations = [
      {
        id: 16,
        title: 'What should I chase?',
        created_at: now,
        updated_at: now,
        origin: { surface: 'pipelines' as const, kind: 'opportunities' as const, view: 'list' as const, filters: {}, label: 'Pipelines · Opportunities' },
      },
      { id: 17, title: 'Withheld', created_at: now, updated_at: now, origin: null },
    ];
    render(
      <Provider store={store}>
        <CopilotSidebar isExpanded setIsExpanded={() => {}} conversations={conversations} activeConversationId={null} sessions={{}} myInvites={[]} />
      </Provider>,
    );
    expect(screen.getByText(/^Pipelines · Opportunities · \d+ seconds? ago$/)).toBeInTheDocument();
    expect(screen.getByText(/^\d+ seconds? ago$/)).toBeInTheDocument();
  });
```

`src/pages/pipelines/ask/historyRestore.test.tsx`. Add these constants beside the others:

```tsx
// A mentioned reader's view of a shared conversation whose reply is
// withheld (backend fix, 2026-10-01): the user turn comes back with its Ask
// context stripped, and the conversation has no origin.
const WITHHELD_SUMMARY = { id: 17, title: 'Withheld question', created_at: '', updated_at: '', origin: null };
const WITHHELD = {
  ...WITHHELD_SUMMARY,
  visibility: 'partial',
  messages: [{ id: 1, role: 'user', content: 'Withheld question', context: null, sources: [], questions: [], created_at: '' }],
};
```

Then add this case inside `describe('History on Pipelines')`:

```tsx
  it('lists a withheld conversation with no tag, and opens it here, its question with no chip', async () => {
    stubPipelinesAsk({ copilot: { conversations: [WITHHELD_SUMMARY], conversationById: { 17: WITHHELD } } });
    renderPipelines('/pipelines/list?owner=2', { ask: true });
    await screen.findByRole('button', { name: 'EMEA seats' });
    await userEvent.click(history());
    const item = await screen.findByRole('button', { name: /Withheld question/ });
    expect(item).toHaveAccessibleName('Withheld question');
    await userEvent.click(item);
    const question = await within(log()).findByText('Withheld question');
    expect(question.parentElement!.children).toHaveLength(1);
    expect(where()).toHaveTextContent('/pipelines/list?owner=2');
  });
```

- [ ] **Step 2: Run them**

Run: `npx vitest run --maxWorkers=2 src/components/copilot/CopilotRail.test.tsx src/pages/copilot/CopilotSidebar.origin.test.tsx src/pages/pipelines/ask/historyRestore.test.tsx`

Expected: PASS, since the audit above found the behaviour already in place.

Then check that the tests can fail:
- Temporarily change `chipOf` in `CopilotRail.tsx` to `chipLabel ? chipLabel((asked ?? {}) as SurfaceContext) : undefined`. The two withheld assertions must fail.
- Temporarily change `if (origin) navigate(originPath(origin));` in `AskProvider.tsx` to `navigate('/pipelines/board');`. The restore case must fail.

Restore both changes and re-run to PASS.

If a case fails on the real code, the rail or History does not handle a withheld turn. Add the guard where the failure points (`chipOf`, the History tag or `openFromHistory`), keep the test, and name the fix in the commit.

- [ ] **Step 3: Commit**

```bash
git add src/components/copilot/CopilotRail.test.tsx src/pages/copilot/CopilotSidebar.origin.test.tsx src/pages/pipelines/ask/historyRestore.test.tsx
git commit -m "test(copilot): a withheld turn shows no chip, no History tag and no reopen, on every surface

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: End to end in jsdom, and the product documents

**Files:**
- Create: `src/e2e/pipelinesAsk.test.tsx`
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`

- [ ] **Step 1: Write the journey** `src/e2e/pipelinesAsk.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../components/copilot/testCopilot';
import { stubPipelinesAsk } from '../pages/pipelines/ask/testPipelinesAsk';
import { renderPipelines } from '../pages/pipelines/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Pipelines List and Board
// under PipelinesAskLayout, with the real Navbar, rail and pill, store and
// router. Only fetch is stubbed: the Pipelines book and the Copilot's
// (stubPipelinesAsk), in the backend's shapes (feat/pipelines-ask, #79).
const rail = () => screen.getByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');
const where = () => screen.getByTestId('where').textContent;
const views = () => screen.getByRole('navigation', { name: 'Pipelines views' });
const kinds = () => screen.getByRole('navigation', { name: 'Opportunities or risks' });

// The conversation as History lists it after the journey below: its origin
// is the first Ask context (the List's) without its focus, labelled by the server.
const ASKED = {
  id: 16,
  title: 'What should I chase?',
  created_at: '',
  updated_at: '',
  origin: { surface: 'pipelines', kind: 'opportunities', view: 'list', filters: { owner: '2' }, label: 'Pipelines · Opportunities · Owner: Carl CSM' },
};

describe('Ask Revenact on Pipelines, end to end (spec 2026-09-30 §3)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('asks on the List, the Board and the risks in one conversation, asks about a risk, and finds it in History', { timeout: 30000 }, async () => {
    const { copilot } = stubPipelinesAsk({ copilot: { conversations: [ASKED] } });
    renderPipelines('/pipelines/list?owner=2', { width: 1440, nav: true, ask: true });
    await screen.findByRole('button', { name: 'EMEA seats' });

    // 1. The List: the chip names Carl; the question carries the kind and the filter.
    expect(await within(rail()).findByText('Pipelines · Opportunities · Owner: Carl CSM')).toBeInTheDocument();
    await userEvent.type(composer(), 'What should I chase?{Enter}');
    await screen.findByText('Answer to: What should I chase?');
    expect(postedBodies(copilot)[0].context).toEqual({ surface: 'pipelines', kind: 'opportunities', view: 'list', filters: { owner: '2' } });

    // 2. The Board, carrying the query: the same conversation, the Board's view.
    await userEvent.click(within(views()).getByRole('link', { name: 'Board' }));
    expect(where()).toBe('/pipelines/board?owner=2');
    await userEvent.type(composer(), 'What closes this month?{Enter}');
    await screen.findByText('Answer to: What closes this month?');
    expect(screen.getByText('Answer to: What should I chase?')).toBeInTheDocument();
    expect(postedBodies(copilot)[1].context).toEqual({ surface: 'pipelines', kind: 'opportunities', view: 'board', filters: { owner: '2' } });

    // 3. Risks, keeping the owner: the chip follows the kind; the conversation stays.
    await userEvent.click(within(kinds()).getByRole('link', { name: 'Risks' }));
    expect(where()).toBe('/pipelines/board?owner=2&kind=risks');
    expect(await within(rail()).findByText('Pipelines · Risks · Owner: Carl CSM')).toBeInTheDocument();
    expect(screen.getByText('Answer to: What closes this month?')).toBeInTheDocument();

    // 4. "Ask about this" on a risk card: typed in, not sent, no form; sending names it.
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: Admin left' }));
    expect(await within(rail()).findByText('Pipelines · Risks · Owner: Carl CSM · This risk')).toBeInTheDocument();
    expect(composer()).toHaveValue('What should I know about this risk?');
    expect(screen.queryByRole('heading', { name: 'Edit Admin left' })).not.toBeInTheDocument();
    expect(postedBodies(copilot)).toHaveLength(2);
    await userEvent.type(composer(), '{Enter}');
    await screen.findByText('Answer to: What should I know about this risk?');
    expect(postedBodies(copilot)[2].context).toEqual({
      surface: 'pipelines',
      kind: 'risks',
      view: 'board',
      filters: { owner: '2' },
      focus: { kind: 'risk', id: 71 },
    });

    // 5. History lists it, tagged with the server's label and the Pipelines icon.
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    const item = await screen.findByRole('button', { name: /What should I chase\?/ });
    expect(item).toHaveAccessibleName(/What should I chase\?\s*Started on Pipelines · Opportunities · Owner: Carl CSM/);
    expect(item.querySelector('svg.lucide-target')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run --maxWorkers=2 src/e2e/pipelinesAsk.test.tsx`. Expected: PASS.

- [ ] **Step 3: Update the product documents.**
  - **`docs/03-ui-ux-design.md`:**
    - "Portfolio rows and board (Pipelines)", the top-bar bullet: replace "The actions slot waits for Ask (delivery 2); there is no rail yet." with:
      - The Ask pill sits in the actions slot.
      - `PipelinesAskLayout` draws the frame and the glass rail once, above both views and both kinds. The rail is open by default from `xl`, remembers its own choice (`revenact_pipelines_ask`) and is a sheet below `sm`.
    - The item bullet: add that under Ask each item's line ends with the quiet "✦ Ask about this", hidden while selecting. It types "What should I know about this opportunity?" (or "…risk?") with the chip "… · This opportunity" and does not send.
    - The Board bullet: add that the card's facts row ends with the same button. The columns narrow to `w-64` while the rail is open. A card still opens its form, a modal over the rail.
    - "Ask rail":
      - Add Pipelines (list and board) to the surfaces.
      - Add a short **Pipelines shape** paragraph: the live chip wording ("Pipelines · Opportunities · Owner: …"; placeholders until the page's read of that kind lands), the server's label on a sent question, the two refusal copies, and the History tag with the `Target` icon.
      - Note that the glass exception covers the Pipelines rail, as it does the Accounts rail.
      - Add one line: a turn the server withheld (no `context`) shows no chip, and a conversation with no `origin` has no tag and opens where the person is.
  - **`docs/04-app-flow.md`:**
    - The route table row for `/pipelines/{list,board}`: add that `PipelinesAskLayout` wraps both in one `AskProvider` (surface `pipelines`, key `revenact_pipelines_ask`). It is one conversation across both views and both kinds.
      - A question posts `context: {surface:'pipelines', kind, view, filters}`: the set URL keys only, `group:'none'` for the List's None, no `focus` key unless one is set.
      - "Ask about this" adds `focus: {kind:'opportunity'|'risk', id}` for one question.
      - The pages report their read's filter options with its kind (`useReportPipelineOptions`).
      - The refusals: `context.focus` → "You can no longer ask about this opportunity." (or "…risk."); `context.filters` → the list copy.
      - History reopens `/pipelines/<view>?<kind=risks&…filters>`, never `/pipelines`.
    - "4.5 Pipelines": replace "Ask on Pipelines is delivery 2." with a step 5 summarising the above in one paragraph. Include that a view or kind switch keeps the conversation and drops an unsent focus.
  - **`.agents/workflows/repo-architecture.md`:**
    - Add `pages/pipelines/ask/` to the "Ask Revenact" heading and a table row: `PipelinesAskLayout` (the layout route above `pipelines/list` and `pipelines/board`: one `AskProvider` with the `pipelines` surface and `revenact_pipelines_ask`, `OrganizationsFrame`'s `rail` slot holding `AskRail`, `scrollKey` per view and kind), `pipelinesNames.ts` (`PipelinesNamesContext`/`useReportPipelineOptions`) and `testPipelinesAsk` (`stubPipelinesAsk`).
    - Add a row for `features/pipelines/askContext.ts`: context, chip, restore and the focus helpers, all through `pipelineUrlSearch`/`parsePipelineParams`/`pipelineChips`.
    - Add a row for `components/copilot/AskAboutButton.tsx`: the shared "Ask about this", used by `StoryItemRow`, `PipelineItem` and `PipelineCard`.
    - In the `AskProvider` row, add "Pipelines' via `PipelinesAskLayout`". In the `useCopilotThread` row, add the Pipelines `focus` copy. In the `surfaceLabels` row, add the Pipelines tag.
    - In the route tree under `pipelines/`, note the layout route.
    - In the `features/pipelines/*` row, add `askContext`. In the `components/pipelines/portfolio` part, note `PipelineBoard`'s and `PipelineColumn`'s `narrow`.

- [ ] **Step 4: Commit**

```bash
git add src/e2e/pipelinesAsk.test.tsx docs .agents
git commit -m "test(pipelines): the Ask on Pipelines journey end to end; docs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Final verification

**Files:** none change unless a check fails.

- [ ] **Step 1:** Run `npx vitest run --maxWorkers=2`. Expected: every file passes, including the Dashboard, Organizations, Contacts and Accounts Ask suites, unchanged.
- [ ] **Step 2:** Run `npx tsc -b`. Expected: exit 0.
- [ ] **Step 3:** Run `npm run lint`. Expected: 0 errors, and no new warnings in the files `git diff --name-only main` lists.
- [ ] **Step 4:** Run `npm run build`. Expected: it completes. The existing chunk-size warning is not new.
- [ ] **Step 5:** If anything fails, fix it with superpowers:systematic-debugging, commit it as `fix(pipelines): <what>`, and repeat Steps 1–4. Use superpowers:verification-before-completion before claiming green.

---

### Task 11: Browser check at 1440px (light and dark) and 375px, then finishing

The controller runs this task, not a subagent.

**Before starting:**
- Run the backend `revenact-backend` on branch `feat/pipelines-ask` (#79), or on `main` once #79 has merged: `docker compose up -d` for Postgres and Redis, then `python manage.py migrate && python manage.py runserver 8000`.
- Run `npm run dev` in `react-ts-app`.
- Use the claude-in-chrome tools. Where the window cannot be resized, load the app in a same-origin iframe of the target width, as the earlier deliveries' checks did.

- [ ] **1440px, light:**
  - `/pipelines/list?owner=<me>`: the pill (New chat, History, ✦) sits in the top bar after Opportunities | Risks, and the glass rail is open beside the list. Items, tiles and the selection bar stay solid. The items reflow in the narrower column, with no sideways scroll.
  - Ask a question. The chip first reads the page's words, then the server's label on the sent bubble.
  - "Ask about this" on an item: the question is typed in and not sent, the form does not open, and the chip ends "· This opportunity". Send it. The answer is about that item.
  - Switch to the Board. The conversation stays, and the columns are `w-64`. A card's "Ask about this" works the same way. A card's title still opens its form, over the rail.
  - Switch to Risks. The chip reads "Pipelines · Risks · …", and the conversation stays.
  - History tags each conversation (with the `Target` icon for Pipelines) and reopens it on its view and kind.
- [ ] **1440px, dark:** repeat the List and the Board visually. The rail's glass, the chip, "Ask about this" and the History tags read in both themes, and no raw colours appear.
- [ ] **1100px:** the rail is closed by default. Opening it narrows the Board's columns, and a card still opens its form.
- [ ] **375px:**
  - The pill's ✦ opens the full-screen sheet. Close and Escape return focus to the switch.
  - "Ask about this" on a List item, and on a Board panel's card, opens the sheet with the question.
  - Each "Ask about this" is a 44px target. Nothing scrolls sideways.
- [ ] **From the Dashboard:** in History, pick a Pipelines conversation. It lands on `/pipelines/…` with the conversation in the rail.
- [ ] **Withheld turn (if the backend fix has landed):** as a mentioned-only reader of a shared session whose reply is withheld, the question shows with no chip, and the History entry has no tag and opens where you are.
- [ ] **Record:** fix anything off on this branch, with a test, before the PR, or list it as a follow-up in the PR.
- [ ] **Finish:** use superpowers:finishing-a-development-branch.
  - Push `feat/pipelines-ask`.
  - Open the PR against `main`.
  - In the PR body:
    - State the merge order: backend #79 merges and deploys first, then this PR.
    - Include the screenshots (1440 light and dark, 375) and the decisions above.
    - Note that Task 8 needs no code change and only pins the withheld-turn behaviour.
  - End the PR body with "🤖 Generated with [Claude Code](https://claude.com/claude-code)".

---

## Self-review

**Spec coverage (§3, and §1's frame and Board):**
- The ✦ rail on the List and the Board → Task 4 (layout and route) and Task 5 (both pages inside it, pill, rail and sheet).
- One conversation across both kinds and views → Task 4 (unit), Task 5 (Board → List → Risks), Task 9 (List → Board → Risks).
- The context `{surface, kind, view, filters}` → Task 1 (module) and Task 5 (posted bodies).
- "Ask about this" focuses the question → Task 1 (focus helpers), Task 2 (`withFocus`), Task 3 (the shared button), Task 6 (item, card, sheet, refusal).
- Server-built labels, and nothing named from hidden data → Task 1 (the stored label wins, and options are used only for their own kind), Task 4 (the kind-mismatch case) and Task 5 (the server's label on the sent turn).
- The 400s → Task 2 (copy), Task 5 (filters) and Task 6 (focus).
- History reopens with the kind and filters → Tasks 1, 2 and 7.
- The Board beside the rail below xl (`useBoardRail`) → Task 5. See Decision 6.
- The withheld-turn backend fix → Task 8.
- Tests:
  - unit: Tasks 1, 2, 3 and 6
  - integration: Tasks 4–8
  - jsdom journey: Task 9
  - house rules: Task 4
- Docs → Task 9. Verification → Task 10. Browser check, merge order and finishing → Task 11.

**Placeholder scan:** every code step shows its code. Each doc step names its section and what to write there. Tasks 7 and 8 name what to break to show a test can fail, and how to restore it.

**Type consistency:**
- `PipelinesContext` / `PipelinesOrigin` (`kind`, `view`, `filters`, `focus?`, `label`) and `PipelineFocus` (`'opportunity' | 'risk'`, `id`) are the same in Tasks 1, 2, 6, 7 and 9, and match the backend's `PipelinesContextSerializer`.
- `PipelinesNames` (`{kind, options}`) is the same in Tasks 1, 2 and 4.
- `useReportPipelineOptions(kind, options)` is the same in Tasks 4 and 5.
- `PIPELINES_ASK_KEY` is `'revenact_pipelines_ask'` in Tasks 2 and 5.
- `AskAboutButton({name, question, focus, className})` is the same in Tasks 3 and 6.
- `stubPipelinesAsk` returns `{copilot, pipelines, release}` in Tasks 4–9.
- `renderPipelines(url | entry, {width, nav, strict, ask})` is the same in Tasks 4–9.
- `narrow` is on both `PipelineBoardProps` and `PipelineColumnProps` in Task 5.
