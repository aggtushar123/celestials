# Ask Revenact on the Dashboard, frontend, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the Communications "Ask Revenact" rail, with its history, on the Dashboard, so each question is sent with where the person is (area, view, shared filters, an optional focus) and the answer is grounded by the server in what that screen shows.

**Architecture:** The rail and its history popover move from `src/pages/communications/` to `src/components/copilot/` and take a `RailContext` union: a `label` context (Communications, sent as today's `[About: …]` text prefix) or a `dashboard` context (sent as the structured `context` field). Sending moves into a `useCopilotThread` hook so the dashboard can send from outside the composer ("Why?"). `DashboardFrame` mounts a `FilterNamesProvider` (fed by `DashboardToolbar`, so chips can name filter values), an `AskProvider` (conversation, thread, collapse state, focus, prefilled draft) and an `AskRail` beside the scroll area; the drill panel moves on top of the rail. `useDashboardContext()` reads the route and the shared filters at send time; the client never sends figures.

**Tech Stack:** React 19, TypeScript, react-router 7, Tailwind v4 tokens, lucide-react, Vitest + Testing Library + user-event (jsdom). No new dependency.

**Spec:** `docs/superpowers/specs/2026-09-24-dashboard-ask-revenact-design.md` (binding). Backend half: the plan written alongside this one in `revenact-backend/docs/superpowers/plans/` (`2026-09-24-dashboard-ask-backend.md`); read its Global Constraints before Task 1 and again before Task 5 (see pre-flight P12).

**Branch:** `feat/dashboard-ask` (already checked out; holds the spec commit). The backend PR merges and deploys before this one merges.

## Global Constraints

- `POST /copilot/messages/` body: `{conversation_id?, content, context?}`. `context` is optional; when absent the endpoint behaves exactly as today.
- `context` = `{surface: 'dashboard', area, view, filters: {owner, lifecycle, customer}, focus}`.
  - `surface`: only `"dashboard"`.
  - `area`: `overview | revenue | health | support`.
  - `view`: one of that area's sub-views in `src/pages/dashboard/areas.ts`, or `null` on the Overview.
  - `filters`: only the shared keys `owner`, `lifecycle`, `customer` (`SHARED_KEYS`).
  - `focus`: `null | {kind: 'companies', ids: number[]} | {kind: 'attention', key: string}`, with at most 200 ids.
- The client sends where it is, never figures.
- User messages echo `context`, after the server has intersected the focus.
- Conversations carry `origin`: the first dashboard context without its focus, set once and never overwritten.
- `429` means this month's AI budget is exhausted.
- Communications sends no `context` and keeps its `[About: <label>] ` text prefix.
- `type RailContext = { kind: 'label'; label: string; icon?: ReactNode } | { kind: 'dashboard'; context: DashboardContext; label: string };`
- Chip text follows the pattern `Revenue › Forecast · Owner: Priya`, built from the filter option names.
- Exact copy:
  - `Thinking…`
  - `This month's AI budget is used up.` (no retry)
  - `Retry`
  - `Ask about these`
  - `Why are these in <segment>?`
  - `Why?`
  - `Why is this on my list?`
  - accessible name `Ask why <title> is on my list`
- Collapse:
  - Open by default at `xl` (1280px) and wider, and collapsed to a slim "Ask" tab below `xl`.
  - The choice is remembered in `localStorage`, with every read and write in try/catch and a fallback to the default.
  - Below `sm` (640px), an "Ask" button opens a full-screen sheet with a close button. Focus moves in and returns on close.
- Suggestions: three fixed questions per area in `src/components/copilot/suggestions.ts`, shown when the conversation is empty. They make no model call.
- No streaming and no tool use.
- House rules:
  - Tokens only, no raw hex.
  - Type sizes 11/13/15/22 on new UI.
  - No card-in-card.
  - Every control has hover, focus-visible and disabled states and an accessible name.
  - Focus returns to the input after sending.
  - Motion stays within 120–300ms using existing utilities, respecting reduced motion.
- Tests follow `.claude/skills/testing` (unit, integration, and e2e in `src/e2e/`). Mock only the network (`vi.stubGlobal('fetch', …)`), with responses shaped like the contract.
- Gates: `npm run lint` with 0 errors, `npx tsc -b --noEmit`, `npx vitest run` and `npm run build` all pass.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Pre-flight: where the spec meets the code

| # | Spec says | Code says | Resolution |
|---|---|---|---|
| P1 | `copilotApi` "or wherever it lives" | It lives in `src/pages/copilot/copilotApi.ts` + `types.ts` (no `features/copilot`) | Extend it there (Task 1). |
| P2 | Move `CopilotRail` to `components/copilot/` | The rail contains a Communications-only "Next event" card and uses `rv-card-glass`, which `revenact-design` §4.4 reserves for Communications | Next event becomes `pages/communications/NextEventCard.tsx`, passed through a `top` slot; the rail gets `variant: 'glass' \| 'plain'` (Communications keeps glass, the dashboard uses a plain bordered surface) (Task 2). |
| P3 | Chip labels "from the filter option names" | Option names arrive in each view's own response and only reach `DashboardToolbar`; `DashboardFrame` never sees them | `DashboardToolbar` reports the shared keys' names into a `FilterNamesProvider` mounted by the frame; a value with no known name shows as itself (Task 6). |
| P4 | Below `sm`, "a header 'Ask' button" | The Navbar is a sibling of `<main>` in `DashboardLayout`, outside `DashboardFrame`'s providers | The button is the first row of the frame (only below `sm`), directly under the Navbar; no provider is lifted into the layout (Task 8). |
| P5 | `focus.ids` at most 200 | Drill lists go to 500 (server caps at 500) | "Ask about these" is enabled only when the list is complete and has ≤ 200 rows; otherwise it is disabled with a one-line note (Task 10). |
| P6 | Rail sits beside the scroll area | `routes.test.tsx` asserts exactly one `.overflow-y-auto` in the whole frame; the rail's message list adds a second | The test asserts exactly one scrolling ancestor of the view instead (Task 7). |
| P7 | Drill panel opens over the rail | At `lg` it is a static 360px column that narrows the content | `lg:absolute` over the right 360px of the frame (`relative`); the content no longer narrows; docs updated (Task 7, Task 13). |
| P8 | "Sources render as today" | The rail renders no sources today; the Copilot page renders `MessageSources` | The shared rail renders `MessageSources` under answers, as the Copilot page does (Task 3). |
| P9 | "Communications must stay unchanged" | Skeleton, 429, Retry, sources and 11/13 sizes live in the shared rail | Communications gets these too. What stays unchanged is its send contract (prefix, no `context`), its layout and its hide/History/New chat controls, pinned by a regression test (Task 2). Per-message chips render only where `names` is passed (the dashboard), so a dashboard conversation reopened in Communications is plain text, as the spec says. |
| P10 | Spec silent on Retry's context | — | Retry resends the context captured at first send (the chip on the failed bubble), not the current screen (Task 3). |
| P11 | Spec silent on how long a focus lasts | — | One question: the focus is cleared once that question is sent, by the chip's ×, or when the area or filters change (same lifetime as a drill) (Task 7). |
| P12 | "Conversations carry `origin`" | Both `ConversationSummary` (list) and `Conversation` (detail) need it for the tag and the restore | Plan assumes both serializers include `origin`; confirm in the backend plan before Task 5. Fields are optional, so an older backend shows no tag rather than breaking. |
| P13 | "From Communications or Copilot … with the tag still shown" | The Copilot page lists history in `CopilotSidebar`, not `HistoryPopover` | `CopilotSidebar` prefixes the item's subtext with the origin tag (Task 5). |

---

## File map

| File | Responsibility |
|---|---|
| `src/pages/copilot/types.ts` (modify) | `DashboardArea`, `DashboardFocus`, `DashboardFilters`, `DashboardContext`, `DashboardOrigin`; `CopilotMessage.context?`, `ConversationSummary.origin?` |
| `src/pages/copilot/copilotApi.ts` (modify) | `sendMessage` takes an optional `context` |
| `src/components/copilot/railContext.ts` (new) | `RailContext` union |
| `src/components/copilot/CopilotRail.tsx` (moved) | The shared rail (`CopilotRail`) and `HistoryPopover` |
| `src/components/copilot/useCopilotThread.ts` (new) | Sending, pending, failure (429 vs other), retry |
| `src/components/copilot/dashboardLabels.ts` (new) | `viewLabel`, `focusLabel`, `contextLabel`, `FilterNames` |
| `src/components/copilot/suggestions.ts` (new) | `SUGGESTIONS` per area |
| `src/components/copilot/testCopilot.ts` (new) | `stubCopilot`, `postedBodies` test doubles |
| `src/pages/communications/NextEventCard.tsx` (new) | The Next event card, lifted out of the rail |
| `src/pages/dashboard/ask/filterNames.ts` (new) | `FilterNamesContext`, `useReportFilterNames`, `useFilterNames`, `namesOf` |
| `src/pages/dashboard/ask/FilterNamesProvider.tsx` (new) | Holds the reported names |
| `src/pages/dashboard/ask/useDashboardContext.ts` (new) | `parseDashboardPath`, `useDashboardContext` |
| `src/pages/dashboard/ask/askPreference.ts` (new) | Remembered open/closed choice, try/catch |
| `src/pages/dashboard/ask/context.ts`, `useAsk.ts` (new) | `AskContext`, `AskState`, `useAsk()` |
| `src/pages/dashboard/ask/AskProvider.tsx` (new) | Conversation, thread, open state, focus, draft, history restore |
| `src/pages/dashboard/ask/AskRail.tsx` (new) | Rail header, collapsed tab, phone sheet |
| `src/pages/dashboard/ask/originPath.ts` (new) | Origin → dashboard URL |
| `src/pages/dashboard/ask/testAsk.tsx` (new) | `renderDashboard`, `authStore`, `Where` test harness |
| `src/lib/useMediaQuery.ts`, `src/lib/focusTrap.ts` (new) | Breakpoint hook, Tab trap |
| `src/test/viewport.ts` (new) | `setViewport(width)`, `resetViewport()` for jsdom |
| `src/pages/dashboard/DashboardFrame.tsx`, `drill/DrillPanel.tsx`, `overview/AttentionList.tsx`, `shared/DashboardToolbar.tsx`, `src/components/shared/AskRevenactBox.tsx`, `src/pages/communications/CommunicationsPage.tsx`, `src/pages/copilot/CopilotSidebar.tsx` (modify) | Wiring |

---

### Task 1: Contract types and `sendMessage({context})`

**Files:**
- Modify: `src/pages/copilot/types.ts`
- Modify: `src/pages/copilot/copilotApi.ts:22-29`
- Test: `src/pages/copilot/copilotApi.test.ts` (new)

**Interfaces:**
- Consumes: nothing.
- Produces (every later task uses these exact names):
```ts
export type DashboardArea = 'overview' | 'revenue' | 'health' | 'support';
export type DashboardFocus = { kind: 'companies'; ids: number[] } | { kind: 'attention'; key: string };
export interface DashboardFilters { owner: string; lifecycle: string; customer: string }
export interface DashboardContext { surface: 'dashboard'; area: DashboardArea; view: string | null; filters: DashboardFilters; focus: DashboardFocus | null }
export type DashboardOrigin = Omit<DashboardContext, 'focus'>;
// CopilotMessage gains: context?: DashboardContext | null;
// ConversationSummary gains: origin?: DashboardOrigin | null;
export function sendMessage(params: { conversationId?: number; content: string; context?: DashboardContext }): Promise<Conversation>;
```

- [ ] **Step 1: Write the failing test**

Create `src/pages/copilot/copilotApi.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Unit tier: the wrapper sends the body the contract names, and nothing more.
vi.mock('../../lib/apiClient', () => ({ apiFetch: vi.fn(async () => ({})) }));

import { apiFetch } from '../../lib/apiClient';
import { sendMessage } from './copilotApi';
import type { DashboardContext } from './types';

const mocked = vi.mocked(apiFetch);

const context: DashboardContext = {
  surface: 'dashboard',
  area: 'revenue',
  view: 'forecast',
  filters: { owner: '2', lifecycle: 'customer', customer: '' },
  focus: null,
};

describe('sendMessage', () => {
  beforeEach(() => mocked.mockClear());

  it('sends no context key at all when none is given (Communications, Copilot)', async () => {
    await sendMessage({ conversationId: 7, content: 'Hello' });
    expect(mocked).toHaveBeenLastCalledWith('/copilot/messages/', {
      method: 'POST',
      body: { conversation_id: 7, content: 'Hello' },
    });
  });

  it('sends the dashboard context as its own field', async () => {
    await sendMessage({ content: 'Why is at-risk ARR up?', context });
    expect(mocked).toHaveBeenLastCalledWith('/copilot/messages/', {
      method: 'POST',
      body: { conversation_id: undefined, content: 'Why is at-risk ARR up?', context },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/copilot/copilotApi.test.ts`
Expected: FAIL. `DashboardContext` is not exported (tsc) and the second test's body has no `context`.

- [ ] **Step 3: Write minimal implementation**

In `src/pages/copilot/types.ts`, add after `MessageRole`:
```ts
/** The dashboard areas a question can be asked from. Mirrors the backend's
 *  DASHBOARD_VIEWS keys and src/pages/dashboard/areas.ts plus the Overview. */
export type DashboardArea = 'overview' | 'revenue' | 'health' | 'support';

/** What a dashboard question is narrowed to: the accounts behind a drilled
 *  number, or one item on the viewer's own attention list. */
export type DashboardFocus = { kind: 'companies'; ids: number[] } | { kind: 'attention'; key: string };

/** The three shared book filters; '' means "All". */
export interface DashboardFilters {
  owner: string;
  lifecycle: string;
  customer: string;
}

/** Where a dashboard question was asked. The server recomputes what that
 *  screen shows; the client never sends figures. */
export interface DashboardContext {
  surface: 'dashboard';
  area: DashboardArea;
  /** One of the area's sub-views; null on the Overview. */
  view: string | null;
  filters: DashboardFilters;
  focus: DashboardFocus | null;
}

/** A conversation's first dashboard context without its focus. Set once by
 *  the server, never overwritten. */
export type DashboardOrigin = Omit<DashboardContext, 'focus'>;
```
In `CopilotMessage`, after `author?`:
```ts
  /** User turns asked on the dashboard: the context as the server validated
   *  it (focus ids already intersected with the viewer's book). Null or
   *  absent everywhere else. */
  context?: DashboardContext | null;
```
In `ConversationSummary`, after `updated_at`:
```ts
  /** Where a dashboard conversation started; null for every other one. */
  origin?: DashboardOrigin | null;
```
In `src/pages/copilot/copilotApi.ts`, change the type import to `import type { DraftReply, Conversation, ConversationSummary, DashboardContext } from './types';` and replace `sendMessage`:
```ts
// Omit `conversationId` to start a new Conversation (titled from this
// message) — see SendMessageView's own docstring. `context` is the
// dashboard's structured "where I am"; without it the body is exactly what
// it has always been, so Communications and the Copilot page are unchanged.
export function sendMessage(params: { conversationId?: number; content: string; context?: DashboardContext }): Promise<Conversation> {
  return apiFetch<Conversation>('/copilot/messages/', {
    method: 'POST',
    body: {
      conversation_id: params.conversationId,
      content: params.content,
      ...(params.context ? { context: params.context } : {}),
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/copilot`
Expected: PASS, including the existing Copilot tests.

- [ ] **Step 5: Commit**

```bash
git add src/pages/copilot/types.ts src/pages/copilot/copilotApi.ts src/pages/copilot/copilotApi.test.ts
git commit -m "feat(copilot): dashboard context on sendMessage" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Move the rail to `components/copilot` with the `RailContext` union

**Files:**
- Move: `src/pages/communications/CopilotRail.tsx` → `src/components/copilot/CopilotRail.tsx`
- Create: `src/components/copilot/railContext.ts`, `src/components/copilot/testCopilot.ts`, `src/pages/communications/NextEventCard.tsx`
- Modify: `src/pages/communications/CommunicationsPage.tsx:44,116,280`
- Test: `src/components/copilot/CopilotRail.test.tsx` (new), `src/pages/communications/CommunicationsPage.test.tsx` (add regression)

**Interfaces:**
- Consumes: `sendMessage`, `DashboardContext` (Task 1).
- Produces:
```ts
// railContext.ts
export type RailContext =
  | { kind: 'label'; label: string; icon?: ReactNode }
  | { kind: 'dashboard'; context: DashboardContext; label: string };
// CopilotRail.tsx
export interface CopilotRailProps {
  context: RailContext | null;
  onClearContext: () => void;
  conversation: Conversation | null;
  onConversation: (conversation: Conversation | null) => void;
  label?: string;              // accessible name; default 'Copilot'
  variant?: 'glass' | 'plain'; // default 'glass'
  className?: string;          // width; default 'w-[320px]'
  top?: ReactNode;             // rendered above the conversation
}
export function CopilotRail(props: CopilotRailProps): JSX.Element;
export function HistoryPopover(props: { onClose: () => void; onOpen: (conversation: Conversation) => void }): JSX.Element;
// testCopilot.ts
export function stubCopilot(options?: { statuses?: number[]; hold?: boolean; conversations?: unknown[]; conversationById?: Record<number, unknown> }): { spy: Mock; release: () => void };
export function postedBodies(spy: Mock): Record<string, unknown>[];
```

- [ ] **Step 1: Write the test doubles and failing tests**

Create `src/components/copilot/testCopilot.ts`:
```ts
// Network doubles for the Copilot endpoints, shaped like revenact-backend's
// docs/API_CONTRACTS.md -> copilot: a POST answers with the whole
// conversation, the user turn echoing `context`, and `origin` set once from
// the first dashboard context without its focus.
import { vi } from 'vitest';

export const CITED_SOURCE = {
  type: 'ticket' as const,
  id: 41,
  label: 'SSO login fails',
  date: '2026-09-20',
  company: 'Uber',
  company_type: 'customer' as const,
  company_id: 3,
};

type FetchSpy = ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>>;

export function stubCopilot(
  options: { statuses?: number[]; hold?: boolean; conversations?: unknown[]; conversationById?: Record<number, unknown> } = {},
) {
  const statuses = [...(options.statuses ?? [])];
  const messages: Record<string, unknown>[] = [];
  let origin: Record<string, unknown> | null = null;
  let release = () => {};
  const gate = options.hold ? new Promise<void>((resolve) => { release = resolve; }) : Promise.resolve();

  const spy: FetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
    const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (url.includes('/copilot/messages/') && init?.method === 'POST') {
      await gate;
      const status = statuses.shift() ?? 200;
      if (status >= 400) return reply({ detail: status === 429 ? 'Budget exhausted.' : 'Server error.' }, status);
      const body = JSON.parse(String(init.body)) as { content: string; context?: Record<string, unknown> };
      if (body.context && origin === null) {
        origin = { ...body.context };
        delete origin.focus;
      }
      messages.push({ id: messages.length + 1, role: 'user', content: body.content, context: body.context ?? null, sources: [], questions: [], created_at: '' });
      messages.push({
        id: messages.length + 1,
        role: 'assistant',
        content: `Answer to: ${body.content}`,
        sources: body.content.includes('cite') ? [CITED_SOURCE] : [],
        questions: [],
        created_at: '',
      });
      return reply({ id: 7, title: 'Chat', created_at: '', updated_at: '', origin, messages: [...messages] });
    }
    const one = /\/copilot\/conversations\/(\d+)\/$/.exec(url);
    if (one) {
      const found = options.conversationById?.[Number(one[1])];
      return found ? reply(found) : reply({ detail: 'Not found.' }, 404);
    }
    if (url.includes('/copilot/conversations/')) return reply(options.conversations ?? []);
    throw new Error(`unexpected ${init?.method ?? 'GET'} ${url}`);
  });
  vi.stubGlobal('fetch', spy);
  return { spy, release: () => release() };
}

/** The JSON bodies POSTed to /copilot/messages/, in order. */
export function postedBodies(spy: FetchSpy): Record<string, unknown>[] {
  return spy.mock.calls
    .filter(([url, init]) => String(url).includes('/copilot/messages/') && init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
}
```
Create `src/components/copilot/CopilotRail.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CopilotRail, type CopilotRailProps } from './CopilotRail';
import { postedBodies, stubCopilot } from './testCopilot';
import type { Conversation, DashboardContext } from '../../pages/copilot/types';

const DASH: DashboardContext = {
  surface: 'dashboard',
  area: 'revenue',
  view: 'forecast',
  filters: { owner: '2', lifecycle: '', customer: '' },
  focus: null,
};

type Given = Omit<CopilotRailProps, 'conversation' | 'onConversation' | 'onClearContext'> & { onClearContext?: () => void };

function Harness(props: Given) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  return <CopilotRail onClearContext={() => {}} {...props} conversation={conversation} onConversation={setConversation} />;
}

function renderRail(props: Partial<Given> = {}) {
  const tree = (next: Partial<Given>) => (
    <MemoryRouter>
      <Harness context={null} {...next} />
    </MemoryRouter>
  );
  const view = render(tree(props));
  return { ...view, rerenderRail: (next: Partial<Given>) => view.rerender(tree(next)) };
}

describe('CopilotRail', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('sends a label context as the Communications text prefix and no context field', async () => {
    const { spy } = stubCopilot();
    renderRail({ context: { kind: 'label', label: 'Support desk' } });
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'What is waiting?{enter}');
    expect(await screen.findByText('Answer to: [About: Support desk] What is waiting?')).toBeInTheDocument();
    expect(postedBodies(spy)).toEqual([{ content: '[About: Support desk] What is waiting?' }]);
  });

  it('sends a dashboard context as the structured field, with no text prefix', async () => {
    const { spy } = stubCopilot();
    renderRail({ label: 'Ask Revenact', variant: 'plain', context: { kind: 'dashboard', context: DASH, label: 'Revenue › Forecast · Owner: Priya' } });
    expect(screen.getByRole('complementary', { name: 'Ask Revenact' })).toBeInTheDocument();
    expect(screen.getByText('Revenue › Forecast · Owner: Priya')).toBeInTheDocument();
    // The screen itself cannot be removed from a question, only a focus can.
    expect(screen.queryByRole('button', { name: 'Remove focus' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'Why is at-risk ARR up?{enter}');
    expect(await screen.findByText('Answer to: Why is at-risk ARR up?')).toBeInTheDocument();
    expect(postedBodies(spy)).toEqual([{ content: 'Why is at-risk ARR up?', context: DASH }]);
  });

  it('offers to remove a focus, and only a focus', async () => {
    const onClearContext = vi.fn();
    const focused = { ...DASH, focus: { kind: 'companies' as const, ids: [3, 7] } };
    renderRail({ onClearContext, context: { kind: 'dashboard', context: focused, label: 'Revenue › Forecast · 2 accounts' } });
    await userEvent.click(screen.getByRole('button', { name: 'Remove focus' }));
    expect(onClearContext).toHaveBeenCalledOnce();
  });

  it('renders what it is given above the conversation', () => {
    renderRail({ top: <p>Top slot</p> });
    expect(screen.getByText('Top slot')).toBeInTheDocument();
  });
});
```
In `src/pages/communications/CommunicationsPage.test.tsx`, add inside `describe('CommunicationsPage', …)`:
```tsx
  it('regression: the rail still sends the source as a text prefix and no structured context', async () => {
    const spy = mockApi();
    renderPage('/communications?source=connector%3A5');
    const copilot = await screen.findByRole('complementary', { name: /copilot/i });
    expect(await within(copilot).findByText('Support desk')).toBeInTheDocument();
    expect(within(copilot).getByText('Nothing scheduled')).toBeInTheDocument();
    await userEvent.type(within(copilot).getByPlaceholderText('Ask Revenact'), 'What is waiting?{enter}');
    expect(await within(copilot).findByText('Two tickets and one reply.')).toBeInTheDocument();
    const call = spy.mock.calls.find(([url, init]) => String(url).includes('/copilot/messages/') && init?.method === 'POST');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ content: '[About: Support desk] What is waiting?' });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/copilot src/pages/communications/CommunicationsPage.test.tsx`
Expected: FAIL. `./CopilotRail` is not found under `components/copilot`. The Communications regression test passes already and serves as the baseline.

- [ ] **Step 3: Move and implement**

```bash
mkdir -p src/components/copilot
git mv src/pages/communications/CopilotRail.tsx src/components/copilot/CopilotRail.tsx
```
Create `src/components/copilot/railContext.ts`:
```ts
import type { ReactNode } from 'react';
import type { DashboardContext } from '../../pages/copilot/types';

/** What the rail's questions are about.
 *  - `label`: Communications. Sent as a `[About: <label>] ` text prefix, as always.
 *  - `dashboard`: sent as the structured `context` field with no prefix;
 *    `label` is the chip text, e.g. "Revenue › Forecast · Owner: Priya". */
export type RailContext =
  | { kind: 'label'; label: string; icon?: ReactNode }
  | { kind: 'dashboard'; context: DashboardContext; label: string };
```
Create `src/pages/communications/NextEventCard.tsx` (the card moved verbatim out of the rail):
```tsx
import { Calendar } from 'lucide-react';

/** The Next event card above Communications' Copilot rail. */
export function NextEventCard() {
  return (
    <section className="rv-card-glass p-3" aria-labelledby="next-event-heading">
      <div className="flex items-center justify-between px-1 pb-1.5">
        <span id="next-event-heading" className="text-[12px] font-medium text-ink">Next event</span>
        <Calendar className="w-3.5 h-3.5 text-ink-muted" aria-hidden="true" />
      </div>
      {/* No endpoint serves "my next event" yet; this says so rather than inventing one. */}
      <div className="bg-[var(--rv-event-card-bg)] border border-[var(--rv-event-card-border)] rounded-xl p-3">
        <div className="text-[12px] font-medium text-[var(--rv-event-title)]">Nothing scheduled</div>
        <div className="text-[11px] text-[var(--rv-event-sub)] mt-0.5">Your next meeting will show here.</div>
      </div>
    </section>
  );
}
```
In `src/components/copilot/CopilotRail.tsx`, replace everything above `/** The History popover` with:
```tsx
// The Copilot in a rail: shared by Communications (beside the inbox) and the
// Dashboard (beside the figures).
//
// A conversation is real (`sendMessage` to /copilot/messages/); the rail holds
// one at a time. The context says what a question is about: Communications
// sends its picked source as a text prefix, the Dashboard sends where the
// person is as a structured `context` the server grounds the answer in.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Clock, MessageSquare, Plus, Search, X } from 'lucide-react';
import { AskRevenactBox } from '../shared/AskRevenactBox';
import { fetchConversation, fetchConversations, sendMessage } from '../../pages/copilot/copilotApi';
import type { Conversation, ConversationSummary, CopilotMessage } from '../../pages/copilot/types';
import { ApiError } from '../../lib/apiClient';
import type { RailContext } from './railContext';

export interface CopilotRailProps {
  context: RailContext | null;
  onClearContext: () => void;
  conversation: Conversation | null;
  onConversation: (conversation: Conversation | null) => void;
  /** The rail's accessible name. */
  label?: string;
  /** 'glass' is Communications' translucent card, its documented exception;
   *  'plain' is a bordered surface for everywhere else. */
  variant?: 'glass' | 'plain';
  /** Width classes. */
  className?: string;
  /** Rendered above the conversation (Communications' Next event card, the
   *  Dashboard's rail header). */
  top?: ReactNode;
}

export function CopilotRail({
  context,
  onClearContext,
  conversation,
  onConversation,
  label = 'Copilot',
  variant = 'glass',
  className = 'w-[320px]',
  top,
}: CopilotRailProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const messages: CopilotMessage[] = conversation?.messages ?? [];

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length, pending]);

  async function send(text: string) {
    setError(null);
    setSending(true);
    setPending(text);
    try {
      const next =
        context?.kind === 'dashboard'
          ? await sendMessage({ conversationId: conversation?.id, content: text, context: context.context })
          : await sendMessage({ conversationId: conversation?.id, content: (context ? `[About: ${context.label}] ` : '') + text });
      onConversation(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The Copilot did not answer. Try again.');
    } finally {
      setPending(null);
      setSending(false);
    }
  }

  // A label context can be dropped; on the dashboard only a focus can, never the screen.
  const removable = context !== null && (context.kind === 'label' || context.context.focus !== null);
  const glass = variant === 'glass';

  return (
    <aside aria-label={label} className={`${className} shrink-0 flex flex-col h-full min-h-0 ${glass ? 'gap-3' : 'rounded-xl border border-line bg-surface'}`}>
      {top}
      <section className={`flex-1 min-h-0 flex flex-col overflow-hidden ${glass ? 'rv-card-glass' : ''}`} aria-label={`${label} conversation`}>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-3">
          {messages.length === 0 && !pending ? (
            <p className="m-auto text-[12px] text-ink-faint text-center max-w-[22ch]">
              Ask about what is in front of you. Answers use your accounts, mail and tickets.
            </p>
          ) : null}
          {messages.map((m) => (
            <div key={m.id} className={`max-w-[92%] text-[12.5px] leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'self-end bg-accent text-on-accent rounded-2xl rounded-br-md px-3 py-2' : 'self-start text-ink'}`}>
              {m.content}
            </div>
          ))}
          {pending ? (
            <>
              <div className="self-end max-w-[92%] bg-accent text-on-accent rounded-2xl rounded-br-md px-3 py-2 text-[12.5px] whitespace-pre-wrap">{pending}</div>
              <div className="self-start text-[12px] text-ink-faint" aria-live="polite">Thinking…</div>
            </>
          ) : null}
          {error ? <p role="alert" className="text-[12px] text-danger">{error}</p> : null}
          <div ref={endRef} />
        </div>
        <div className="p-2 pt-0">
          {context ? (
            <div className="px-1 pb-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-subtle border border-line px-2 py-0.5 text-[11px] text-ink">
                {context.kind === 'label' ? context.icon : null}
                {context.label}
                {removable ? (
                  <button
                    type="button"
                    onClick={onClearContext}
                    aria-label={context.kind === 'label' ? 'Remove context' : 'Remove focus'}
                    className="text-ink-faint hover:text-ink rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <X className="w-3 h-3" aria-hidden="true" />
                  </button>
                ) : null}
              </span>
            </div>
          ) : null}
          <AskRevenactBox onSend={(text) => send(text)} disabled={sending} />
        </div>
      </section>
    </aside>
  );
}
```
Keep `HistoryPopover` exactly as it is below that line. Remove `Calendar` from the lucide import because it now lives in `NextEventCard`.

In `src/pages/communications/CommunicationsPage.tsx`:
- Replace line 44 with:
```tsx
import { CopilotRail, HistoryPopover } from '../../components/copilot/CopilotRail';
import type { RailContext } from '../../components/copilot/railContext';
import { NextEventCard } from './NextEventCard';
```
- Replace line 116 with:
```tsx
  const context: RailContext | null =
    activeSource && activeSource.id !== 'all' && !contextCleared
      ? { kind: 'label', label: activeSource.label, icon: <span className="w-3.5 h-3.5 inline-flex items-center justify-center [&>svg]:w-3.5 [&>svg]:h-3.5">{activeSource.icon}</span> }
      : null;
```
- Replace line 280 with:
```tsx
          <CopilotRail top={<NextEventCard />} context={context} onClearContext={() => setContextCleared(true)} conversation={conversation} onConversation={setConversation} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/copilot src/pages/communications src/pages/copilot && npx tsc -b --noEmit`
Expected: PASS. `grep -rn "communications/CopilotRail" src` returns nothing.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/copilot src/pages/communications
git commit -m "refactor(copilot): share the rail from components/copilot with a RailContext union" -m "Communications keeps its text prefix and Next event card; a regression test pins the body it sends." -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Thread states: thinking skeleton, 429, Retry, sources and focus return

**Files:**
- Create: `src/components/copilot/useCopilotThread.ts`
- Modify: `src/components/copilot/CopilotRail.tsx` (the `CopilotRail` function only)
- Modify: `src/components/shared/AskRevenactBox.tsx:16-36,179-190`
- Test: `src/components/copilot/CopilotRail.test.tsx` (add)

**Interfaces:**
- Consumes: `sendMessage` (Task 1), `CopilotRailProps` (Task 2).
- Produces:
```ts
export interface Turn { text: string; content: string; context?: DashboardContext }
export interface FailedTurn extends Turn { budget: boolean; message: string }
export interface CopilotThread { pending: Turn | null; failed: FailedTurn | null; send: (turn: Turn) => Promise<void>; retry: () => void }
export const BUDGET_MESSAGE = "This month's AI budget is used up.";
export function useCopilotThread(conversation: Conversation | null, onConversation: (conversation: Conversation) => void): CopilotThread;
// CopilotRailProps gains: thread?: CopilotThread;
// AskRevenactBox gains: inputRef?: RefObject<HTMLInputElement | null>; its send button's accessible name is "Send".
```

- [ ] **Step 1: Write the failing tests**

Add to `src/components/copilot/CopilotRail.test.tsx`, inside the `describe`:
```tsx
  it('shows a thinking skeleton while the answer is on its way', async () => {
    const { release } = stubCopilot({ hold: true });
    renderRail();
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'What is waiting?{enter}');
    expect(await screen.findByRole('status')).toHaveTextContent('Thinking…');
    release();
    expect(await screen.findByText('Answer to: What is waiting?')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says the budget is used up on a 429, keeps the question, and offers no retry', async () => {
    stubCopilot({ statuses: [429] });
    renderRail();
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'What is waiting?{enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent("This month's AI budget is used up.");
    expect(screen.getByText('What is waiting?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('keeps the question after any other failure and sends the same body again on Retry', async () => {
    const { spy } = stubCopilot({ statuses: [500] });
    renderRail({ context: { kind: 'dashboard', context: DASH, label: 'Revenue › Forecast' } });
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'Why is at-risk ARR up?{enter}');
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Answer to: Why is at-risk ARR up?')).toBeInTheDocument();
    const bodies = postedBodies(spy);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
  });

  it('puts focus back in the input after sending with the Send button', async () => {
    stubCopilot();
    renderRail();
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'What is waiting?');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Answer to: What is waiting?');
    expect(screen.getByPlaceholderText('Ask Revenact')).toHaveFocus();
  });

  it('lists the records an answer cites, as the Copilot page does', async () => {
    stubCopilot();
    renderRail();
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'Please cite it{enter}');
    expect(await screen.findByText('Based on 1 record')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /SSO login fails/ })).toBeInTheDocument();
  });

  it('runs on a thread it is handed, so a caller can send without the composer', async () => {
    stubCopilot();
    function Outside() {
      const [conversation, setConversation] = useState<Conversation | null>(null);
      const thread = useCopilotThread(conversation, setConversation);
      return (
        <>
          <button type="button" onClick={() => void thread.send({ text: 'From outside', content: 'From outside' })}>Send from outside</button>
          <CopilotRail context={null} onClearContext={() => {}} conversation={conversation} onConversation={setConversation} thread={thread} />
        </>
      );
    }
    render(<MemoryRouter><Outside /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Send from outside' }));
    expect(await screen.findByText('Answer to: From outside')).toBeInTheDocument();
  });
```
Add `import { useCopilotThread } from './useCopilotThread';` to the imports.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/copilot/CopilotRail.test.tsx`
Expected: FAIL. `useCopilotThread` does not exist, `Thinking…` is not in a `status` role, and there is no `Retry`, no `Send` accessible name and no sources.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/copilot/useCopilotThread.ts`:
```ts
import { useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import { sendMessage } from '../../pages/copilot/copilotApi';
import type { Conversation, DashboardContext } from '../../pages/copilot/types';

/** One question: what the bubble shows (`text`), what is sent (`content`,
 *  which carries Communications' prefix), and the dashboard context. */
export interface Turn {
  text: string;
  content: string;
  context?: DashboardContext;
}

export interface FailedTurn extends Turn {
  /** A 429: the month's AI budget is spent, so there is nothing to retry. */
  budget: boolean;
  message: string;
}

export interface CopilotThread {
  pending: Turn | null;
  failed: FailedTurn | null;
  send: (turn: Turn) => Promise<void>;
  retry: () => void;
}

export const BUDGET_MESSAGE = "This month's AI budget is used up.";

/** Sending on one conversation, with the states the rail shows: in flight,
 *  budget spent, or failed and retryable with the question kept. */
export function useCopilotThread(
  conversation: Conversation | null,
  onConversation: (conversation: Conversation) => void,
): CopilotThread {
  const [pending, setPending] = useState<Turn | null>(null);
  const [failed, setFailed] = useState<FailedTurn | null>(null);

  // Another conversation (New chat, one reopened from History) starts clean.
  // Adjusted during render, as DrillContext does, so no frame shows the old failure.
  const id = conversation?.id ?? null;
  const [threadId, setThreadId] = useState(id);
  if (threadId !== id) {
    setThreadId(id);
    setFailed(null);
  }

  async function send(turn: Turn) {
    if (pending) return;
    setFailed(null);
    setPending(turn);
    try {
      onConversation(await sendMessage({ conversationId: conversation?.id, content: turn.content, context: turn.context }));
    } catch (err) {
      const budget = err instanceof ApiError && err.status === 429;
      const message = budget ? BUDGET_MESSAGE : err instanceof ApiError ? err.message : 'The Copilot did not answer.';
      setFailed({ ...turn, budget, message });
    } finally {
      setPending(null);
    }
  }

  // Retry resends the question as it was asked, context included (the chip
  // on the failed bubble), not the screen as it is now.
  function retry() {
    if (!failed || failed.budget) return;
    void send({ text: failed.text, content: failed.content, context: failed.context });
  }

  return { pending, failed, send, retry };
}
```
In `src/components/shared/AskRevenactBox.tsx`:
- Change the React import to `import { useState, useRef, type FormEvent, type KeyboardEvent, type RefObject } from 'react';`.
- Add to `AskRevenactBoxProps`:
```ts
  /** The owner's handle on the input, to put focus back after a send it
   *  started elsewhere (a suggestion, Retry). */
  inputRef?: RefObject<HTMLInputElement | null>;
```
- Change the signature to `({ onSend, disabled = false, inputRef: givenRef }) => {` and replace `const inputRef = useRef<HTMLInputElement>(null);` with:
```ts
  const ownRef = useRef<HTMLInputElement>(null);
  const inputRef = givenRef ?? ownRef;
```
- In `handleSubmit`, after `setQuery('');`, add `inputRef.current?.focus();`.
- On the send `<button>`, add `aria-label="Send"`.

In `src/components/copilot/CopilotRail.tsx`, add `thread?: CopilotThread;` to `CopilotRailProps` with the doc comment `/** Drive the rail from outside (the dashboard sends "Why?" without the composer). */`. Replace the `CopilotRail` function and add two helpers above it:
```tsx
import { MessageSources } from '../../pages/copilot/MessageSources';
import { useCopilotThread, type CopilotThread, type Turn } from './useCopilotThread';
// (drop the now-unused `useState`, `sendMessage` and `ApiError` imports if nothing else in the file uses them;
//  HistoryPopover still uses useState, fetchConversation and fetchConversations)

function UserTurn({ text }: { text: string }) {
  return (
    <div className="self-end max-w-[92%] flex flex-col items-end gap-1">
      <div className="bg-accent text-on-accent rounded-2xl rounded-br-md px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap">{text}</div>
    </div>
  );
}

/** Shaped like an answer, not a spinner; the words are for screen readers. */
function Thinking() {
  return (
    <div role="status" className="self-start w-4/5 flex flex-col gap-1.5">
      <span className="sr-only">Thinking…</span>
      <span aria-hidden="true" className="h-3 w-full rounded bg-subtle animate-pulse" />
      <span aria-hidden="true" className="h-3 w-4/5 rounded bg-subtle animate-pulse" />
      <span aria-hidden="true" className="h-3 w-3/5 rounded bg-subtle animate-pulse" />
    </div>
  );
}

export function CopilotRail({
  context,
  onClearContext,
  conversation,
  onConversation,
  label = 'Copilot',
  variant = 'glass',
  className = 'w-[320px]',
  top,
  thread: given,
}: CopilotRailProps) {
  const own = useCopilotThread(conversation, onConversation);
  const thread = given ?? own;
  const { pending, failed } = thread;
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messages: CopilotMessage[] = conversation?.messages ?? [];
  const empty = messages.length === 0 && !pending && !failed;

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length, pending, failed]);

  async function send(text: string) {
    const turn: Turn =
      context?.kind === 'dashboard'
        ? { text, content: text, context: context.context }
        : { text, content: (context ? `[About: ${context.label}] ` : '') + text };
    await thread.send(turn);
    inputRef.current?.focus();
  }

  const removable = context !== null && (context.kind === 'label' || context.context.focus !== null);
  const glass = variant === 'glass';

  return (
    <aside aria-label={label} className={`${className} shrink-0 flex flex-col h-full min-h-0 ${glass ? 'gap-3' : 'rounded-xl border border-line bg-surface'}`}>
      {top}
      <section className={`flex-1 min-h-0 flex flex-col overflow-hidden ${glass ? 'rv-card-glass' : ''}`} aria-label={`${label} conversation`}>
        <div role="log" aria-label={`${label} messages`} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-3">
          {empty ? (
            <p className="m-auto text-[13px] text-ink-faint text-center max-w-[24ch]">
              Ask about what is in front of you. Answers use your accounts, mail and tickets.
            </p>
          ) : null}
          {messages.map((m) =>
            m.role === 'user' ? (
              <UserTurn key={m.id} text={m.content} />
            ) : (
              <div key={m.id} className="self-start max-w-[92%] text-[13px] leading-relaxed text-ink">
                <p className="whitespace-pre-wrap">{m.content}</p>
                <MessageSources sources={m.sources} />
              </div>
            ),
          )}
          {pending ? (
            <>
              <UserTurn text={pending.text} />
              <Thinking />
            </>
          ) : null}
          {failed ? (
            <>
              <UserTurn text={failed.text} />
              <div role="alert" className={`self-start flex flex-wrap items-center gap-2 text-[13px] ${failed.budget ? 'text-ink-muted' : 'text-danger'}`}>
                <span>{failed.message}</span>
                {failed.budget ? null : (
                  <button
                    type="button"
                    onClick={thread.retry}
                    className="min-h-9 px-3 rounded-lg border border-line bg-surface text-[13px] font-semibold text-ink hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    Retry
                  </button>
                )}
              </div>
            </>
          ) : null}
          <div ref={endRef} />
        </div>
        <div className="p-2 pt-0">
          {context ? (
            <div className="px-1 pb-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-subtle border border-line px-2 py-0.5 text-[11px] text-ink">
                {context.kind === 'label' ? context.icon : null}
                {context.label}
                {removable ? (
                  <button
                    type="button"
                    onClick={onClearContext}
                    aria-label={context.kind === 'label' ? 'Remove context' : 'Remove focus'}
                    className="text-ink-faint hover:text-ink rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <X className="w-3 h-3" aria-hidden="true" />
                  </button>
                ) : null}
              </span>
            </div>
          ) : null}
          <AskRevenactBox inputRef={inputRef} onSend={(text) => void send(text)} disabled={Boolean(pending)} />
        </div>
      </section>
    </aside>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components src/pages/communications src/pages/copilot`
Expected: PASS. The Communications tests are unchanged and green.

- [ ] **Step 5: Commit**

```bash
git add src/components/copilot src/components/shared/AskRevenactBox.tsx
git commit -m "feat(copilot): rail states: thinking skeleton, budget 429, retry, sources" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Per-message chips, suggestions and a prefilled draft

**Files:**
- Create: `src/components/copilot/dashboardLabels.ts`, `src/components/copilot/suggestions.ts`
- Modify: `src/components/copilot/CopilotRail.tsx`, `src/components/shared/AskRevenactBox.tsx`
- Test: `src/components/copilot/dashboardLabels.test.ts`, `src/components/copilot/suggestions.test.ts` (new), `CopilotRail.test.tsx` (add)

**Interfaces:**
- Consumes: `DashboardContext`, `DashboardOrigin`, `DashboardFocus`, `DashboardArea` (Task 1); `AREAS` (`src/pages/dashboard/areas.ts`); `CopilotRail`, `useCopilotThread` (Task 3).
- Produces:
```ts
// dashboardLabels.ts
export type SharedFilterKey = 'owner' | 'lifecycle' | 'customer';
export type FilterNames = Partial<Record<SharedFilterKey, Record<string, string>>>;
export function viewLabel(area: DashboardArea, view: string | null): string;      // "Overview" | "Revenue › Forecast"
export function focusLabel(focus: DashboardFocus | null): string;                 // "" | "1 account" | "12 accounts" | "This attention item"
export function contextLabel(context: DashboardOrigin & { focus?: DashboardFocus | null }, names?: FilterNames): string;
// suggestions.ts
export const SUGGESTIONS: Record<DashboardArea, readonly [string, string, string]>;
// CopilotRailProps gains:
//   names?: FilterNames;                                  // per-message chips render only when given
//   suggestions?: readonly string[];
//   draft?: { text: string; nonce: number } | null;      // a new nonce replaces the composer's text
//   onSent?: () => void;                                  // called as a question is sent
// AskRevenactBox gains: initialValue?: string; autoFocus?: boolean;
```

- [ ] **Step 1: Write the failing tests**

Create `src/components/copilot/dashboardLabels.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { contextLabel, focusLabel, viewLabel } from './dashboardLabels';

const base = { surface: 'dashboard' as const, filters: { owner: '', lifecycle: '', customer: '' } };

describe('dashboard labels', () => {
  it('names the view', () => {
    expect(viewLabel('overview', null)).toBe('Overview');
    expect(viewLabel('revenue', 'forecast')).toBe('Revenue › Forecast');
    expect(viewLabel('health', 'renewals')).toBe('Health › Renewals');
    expect(viewLabel('support', 'nope')).toBe('Support');
  });

  it('names the focus', () => {
    expect(focusLabel(null)).toBe('');
    expect(focusLabel({ kind: 'companies', ids: [3] })).toBe('1 account');
    expect(focusLabel({ kind: 'companies', ids: [3, 7] })).toBe('2 accounts');
    expect(focusLabel({ kind: 'attention', key: 'risk:12' })).toBe('This attention item');
  });

  it('builds the chip from the filter option names, falling back to the value', () => {
    const context = { ...base, area: 'revenue' as const, view: 'forecast', filters: { owner: '2', lifecycle: 'customer', customer: '12' } };
    expect(contextLabel(context, { owner: { '2': 'Priya' }, lifecycle: { customer: 'Customer' } })).toBe(
      'Revenue › Forecast · Owner: Priya · Lifecycle: Customer · Account: 12',
    );
    expect(contextLabel({ ...base, area: 'overview', view: null })).toBe('Overview');
    expect(contextLabel({ ...base, area: 'overview', view: null, focus: { kind: 'companies', ids: [1, 2, 3] } })).toBe('Overview · 3 accounts');
  });
});
```
Create `src/components/copilot/suggestions.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { SUGGESTIONS } from './suggestions';

describe('SUGGESTIONS', () => {
  it.each(['overview', 'revenue', 'health', 'support'] as const)('offers three distinct questions on %s', (area) => {
    const list = SUGGESTIONS[area];
    expect(list).toHaveLength(3);
    expect(new Set(list).size).toBe(3);
    for (const q of list) expect(q).toMatch(/\?$/);
  });
});
```
Add to `CopilotRail.test.tsx`:
```tsx
  it('each question shows the screen it was asked on, and a follow-up carries the new screen', async () => {
    const { spy } = stubCopilot();
    const names = { owner: { '2': 'Priya', '5': 'Omar' } };
    const { rerenderRail } = renderRail({ names, context: { kind: 'dashboard', context: DASH, label: 'Revenue › Forecast · Owner: Priya' } });
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'Why is at-risk ARR up?{enter}');
    await screen.findByText('Answer to: Why is at-risk ARR up?');

    const moved = { ...DASH, filters: { ...DASH.filters, owner: '5' } };
    rerenderRail({ names, context: { kind: 'dashboard', context: moved, label: 'Revenue › Forecast · Owner: Omar' } });
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'And now?{enter}');
    await screen.findByText('Answer to: And now?');

    expect((postedBodies(spy)[1].context as typeof DASH).filters.owner).toBe('5');
    const log = screen.getByRole('log', { name: 'Copilot messages' });
    expect(within(log).getByText('Revenue › Forecast · Owner: Priya')).toBeInTheDocument();
    expect(within(log).getByText('Revenue › Forecast · Owner: Omar')).toBeInTheDocument();
  });

  it('shows no per-message chip where no names are given (a dashboard thread reopened elsewhere is plain text)', async () => {
    stubCopilot();
    renderRail({ context: { kind: 'dashboard', context: DASH, label: 'Revenue › Forecast' } });
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'Why?{enter}');
    await screen.findByText('Answer to: Why?');
    expect(within(screen.getByRole('log', { name: 'Copilot messages' })).queryByText('Revenue › Forecast')).not.toBeInTheDocument();
  });

  it('offers the suggestions while the conversation is empty and sends one on click', async () => {
    const { spy } = stubCopilot();
    renderRail({ suggestions: ['What should I act on first?', 'B?', 'C?'], context: { kind: 'dashboard', context: { ...DASH, area: 'overview', view: null }, label: 'Overview' } });
    const list = screen.getByRole('list', { name: 'Suggested questions' });
    await userEvent.click(within(list).getByRole('button', { name: 'What should I act on first?' }));
    expect(await screen.findByText('Answer to: What should I act on first?')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Suggested questions' })).not.toBeInTheDocument();
    expect(postedBodies(spy)[0].content).toBe('What should I act on first?');
    expect(screen.getByPlaceholderText('Ask Revenact')).toHaveFocus();
  });

  it('prefills a draft, focused and editable, and sends nothing until asked', async () => {
    const { spy } = stubCopilot();
    const onSent = vi.fn();
    const { rerenderRail } = renderRail({ onSent });
    rerenderRail({ onSent, draft: { text: 'Why are these in At risk?', nonce: 1 } });
    const input = screen.getByPlaceholderText('Ask Revenact');
    expect(input).toHaveValue('Why are these in At risk?');
    expect(input).toHaveFocus();
    expect(postedBodies(spy)).toHaveLength(0);
    await userEvent.type(input, '{enter}');
    await screen.findByText('Answer to: Why are these in At risk?');
    expect(onSent).toHaveBeenCalledOnce();
  });
```
Add `within` to the `@testing-library/react` import.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/copilot`
Expected: FAIL. The modules are missing and the rail has no `names`, `suggestions`, `draft` or `onSent`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/copilot/dashboardLabels.ts`:
```ts
import { AREAS } from '../../pages/dashboard/areas';
import type { DashboardArea, DashboardFocus, DashboardOrigin } from '../../pages/copilot/types';

export type SharedFilterKey = 'owner' | 'lifecycle' | 'customer';

/** value → display name per shared filter, as the dashboard's own filter
 *  options name them (reported by DashboardToolbar). */
export type FilterNames = Partial<Record<SharedFilterKey, Record<string, string>>>;

const FILTER_LABELS: Record<SharedFilterKey, string> = { owner: 'Owner', lifecycle: 'Lifecycle', customer: 'Account' };
const ORDER: SharedFilterKey[] = ['owner', 'lifecycle', 'customer'];

/** "Overview", or "Revenue › Forecast". */
export function viewLabel(area: DashboardArea, view: string | null): string {
  if (area === 'overview') return 'Overview';
  const found = AREAS.find((a) => a.key === area);
  if (!found) return area;
  const sub = found.views.find((v) => v.path === view);
  return sub ? `${found.label} › ${sub.label}` : found.label;
}

export function focusLabel(focus: DashboardFocus | null): string {
  if (!focus) return '';
  if (focus.kind === 'attention') return 'This attention item';
  return focus.ids.length === 1 ? '1 account' : `${focus.ids.length} accounts`;
}

/** The chip: "Revenue › Forecast · Owner: Priya · 12 accounts". A value
 *  with no known name shows as itself rather than being hidden. */
export function contextLabel(context: DashboardOrigin & { focus?: DashboardFocus | null }, names: FilterNames = {}): string {
  const parts = [viewLabel(context.area, context.view)];
  for (const key of ORDER) {
    const value = context.filters[key];
    if (value) parts.push(`${FILTER_LABELS[key]}: ${names[key]?.[value] ?? value}`);
  }
  const focus = focusLabel(context.focus ?? null);
  if (focus) parts.push(focus);
  return parts.join(' · ');
}
```
Create `src/components/copilot/suggestions.ts`:
```ts
import type { DashboardArea } from '../../pages/copilot/types';

/** Three fixed questions per dashboard area, shown while a conversation is
 *  empty. Fixed text, no model call: each is answerable from that area's
 *  server digest (see the spec's §2 table). */
export const SUGGESTIONS: Record<DashboardArea, readonly [string, string, string]> = {
  overview: ['What should I act on first?', 'How much ARR is at risk right now?', 'Which accounts need action, and why?'],
  revenue: ['What is driving the forecast?', 'Why is at-risk ARR where it is?', 'Which accounts moved the most?'],
  health: ['Which accounts need action, and why?', 'What is behind the accounts trending down?', 'How healthy is this book overall?'],
  support: ['Which accounts have the most urgent open tickets?', 'What is the oldest open ticket about?', 'How are open tickets split by priority?'],
};
```
In `AskRevenactBox.tsx`, add props:
```ts
  /** The text the box opens with (a prefilled question). Remount with a new
   *  `key` to replace it. */
  initialValue?: string;
  /** Focus the input on mount. */
  autoFocus?: boolean;
```
Then change the signature to `({ onSend, disabled = false, inputRef: givenRef, initialValue = '', autoFocus = false }) => {`, change `useState('')` for `query` to `useState(initialValue)`, and add `autoFocus={autoFocus}` to the `<input>`.

In `CopilotRail.tsx`:
- imports: `import type { Conversation, ConversationSummary, CopilotMessage, DashboardContext } from '../../pages/copilot/types';` and `import { contextLabel, type FilterNames } from './dashboardLabels';`.
- `CopilotRailProps` gains:
```ts
  /** Names for filter values. Per-message chips render only when given, so a
   *  dashboard conversation reopened elsewhere reads as plain text. */
  names?: FilterNames;
  /** Shown while the conversation is empty; clicking one sends it. */
  suggestions?: readonly string[];
  /** Prefills the composer; a new nonce replaces what is typed. */
  draft?: { text: string; nonce: number } | null;
  /** Called as a question is sent. */
  onSent?: () => void;
```
- `UserTurn` becomes:
```tsx
function UserTurn({ text, chip }: { text: string; chip?: string }) {
  return (
    <div className="self-end max-w-[92%] flex flex-col items-end gap-1">
      {chip ? <span className="rounded-md bg-subtle border border-line px-2 py-0.5 text-[11px] text-ink-muted">{chip}</span> : null}
      <div className="bg-accent text-on-accent rounded-2xl rounded-br-md px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap">{text}</div>
    </div>
  );
}
```
- Add a constant above `CopilotRail`:
```ts
const SUGGESTION =
  'w-full text-left min-h-9 px-3 py-2 rounded-lg border border-line bg-surface text-[13px] text-ink enabled:hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed';
```
- In `CopilotRail`: destructure `names, suggestions, draft, onSent` from the props, and add after `const empty = …`:
```ts
  const chipOf = (asked: DashboardContext | null | undefined) => (names && asked ? contextLabel(asked, names) : undefined);
```
- In `send`, call `onSent?.();` immediately before `await thread.send(turn);`.
- Replace the `{empty ? (…) : null}` block with:
```tsx
          {empty && suggestions?.length ? (
            <div className="m-auto w-full flex flex-col gap-2">
              <p className="text-[11px] text-ink-muted text-center">Ask about what is on screen.</p>
              <ul aria-label="Suggested questions" className="flex flex-col gap-1.5">
                {suggestions.map((question) => (
                  <li key={question}>
                    <button type="button" onClick={() => void send(question)} disabled={Boolean(pending)} className={SUGGESTION}>
                      {question}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : empty ? (
            <p className="m-auto text-[13px] text-ink-faint text-center max-w-[24ch]">
              Ask about what is in front of you. Answers use your accounts, mail and tickets.
            </p>
          ) : null}
```
- Pass chips to the three `UserTurn`s: `<UserTurn key={m.id} text={m.content} chip={chipOf(m.context)} />`, `<UserTurn text={pending.text} chip={chipOf(pending.context)} />`, `<UserTurn text={failed.text} chip={chipOf(failed.context)} />`.
- Replace the composer line with:
```tsx
          <AskRevenactBox
            key={draft?.nonce ?? 0}
            initialValue={draft?.text}
            autoFocus={Boolean(draft)}
            inputRef={inputRef}
            onSend={(text) => void send(text)}
            disabled={Boolean(pending)}
          />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components src/pages/communications`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/copilot src/components/shared/AskRevenactBox.tsx
git commit -m "feat(copilot): per-question context chips, suggestions and a prefilled draft" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The history origin tag (HistoryPopover and the Copilot sidebar)

Before starting, confirm P12: the backend plan's list serializer (`ConversationListView`) returns `origin`. If it does not, stop and raise it with the backend plan's author. Do not work around it here.

**Files:**
- Modify: `src/components/copilot/CopilotRail.tsx` (`HistoryPopover` list item), `src/pages/copilot/CopilotSidebar.tsx:159`
- Test: `src/components/copilot/HistoryPopover.test.tsx` (new), `src/pages/copilot/CopilotSidebar.origin.test.tsx` (new), `src/pages/communications/CommunicationsPage.test.tsx` (add)

**Interfaces:**
- Consumes: `ConversationSummary.origin` (Task 1), `viewLabel` (Task 4), `stubCopilot` (Task 2).
- Produces: `HistoryPopover`'s items show the origin tag (visible text `viewLabel(origin.area, origin.view)`, sr-only prefix "Started on the dashboard: "). `onOpen` is unchanged: it receives the fetched `Conversation`, including `origin`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/copilot/HistoryPopover.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { HistoryPopover } from './CopilotRail';
import { stubCopilot } from './testCopilot';

const origin = { surface: 'dashboard', area: 'revenue', view: 'forecast', filters: { owner: '2', lifecycle: '', customer: '' } };

describe('HistoryPopover', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('tags each dashboard conversation with where it started, and nothing else', async () => {
    stubCopilot({
      conversations: [
        { id: 1, title: 'Why is at-risk ARR up?', created_at: '', updated_at: '', origin },
        { id: 2, title: 'What is going on with Pizza Hut?', created_at: '', updated_at: '', origin: null },
      ],
    });
    render(<HistoryPopover onClose={() => {}} onOpen={() => {}} />);
    const tagged = await screen.findByRole('button', { name: /Why is at-risk ARR up\?/ });
    expect(within(tagged).getByText('Revenue › Forecast')).toBeInTheDocument();
    expect(tagged).toHaveAccessibleName(/Why is at-risk ARR up\?\s*Started on the dashboard: Revenue › Forecast/);
    expect(screen.getByRole('button', { name: 'What is going on with Pizza Hut?' })).toBeInTheDocument();
  });
});
```
Create `src/pages/copilot/CopilotSidebar.origin.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import knowledgeReducer from '../../features/knowledge/knowledgeSlice';
import { CopilotSidebar } from './CopilotSidebar';

describe('CopilotSidebar chat history', () => {
  it('shows where a dashboard conversation started beside its time', () => {
    const store = configureStore({ reducer: { knowledge: knowledgeReducer } });
    const conversations = [
      { id: 1, title: 'Why is at-risk ARR up?', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), origin: { surface: 'dashboard' as const, area: 'health' as const, view: 'triage', filters: { owner: '', lifecycle: '', customer: '' } } },
    ];
    render(
      <Provider store={store}>
        <CopilotSidebar isExpanded setIsExpanded={() => {}} conversations={conversations} activeConversationId={null} sessions={{}} myInvites={[]} />
      </Provider>,
    );
    expect(screen.getByText(/^Health › Triage · /)).toBeInTheDocument();
  });
});
```
Add to `CommunicationsPage.test.tsx`. Extend `mockApi` to answer `/copilot/conversations/<id>/` before the list line:
```tsx
    if (/\/copilot\/conversations\/\d+\/$/.test(url)) return ok(overrides.conversation ?? { id: 1, title: 'Chat', created_at: '', updated_at: '', messages: [] });
```
Add `conversation?: unknown` to the `overrides` type. Then add:
```tsx
  it('opens a dashboard conversation as plain text, with its tag, without leaving Communications', async () => {
    const origin = { surface: 'dashboard', area: 'revenue', view: 'forecast', filters: { owner: '2', lifecycle: '', customer: '' } };
    mockApi({
      conversations: [{ id: 9, title: 'Why is at-risk ARR up?', created_at: '', updated_at: '', origin }],
      conversation: {
        id: 9, title: 'Why is at-risk ARR up?', created_at: '', updated_at: '', origin,
        messages: [
          { id: 1, role: 'user', content: 'Why is at-risk ARR up?', context: { ...origin, focus: null }, sources: [], questions: [] },
          { id: 2, role: 'assistant', content: 'Two renewals slipped.', sources: [], questions: [] },
        ],
      },
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /^history$/i }));
    const panel = screen.getByRole('dialog', { name: 'History' });
    expect(await within(panel).findByText('Revenue › Forecast')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: /Why is at-risk ARR up\?/ }));
    const copilot = await screen.findByRole('complementary', { name: /copilot/i });
    expect(await within(copilot).findByText('Two renewals slipped.')).toBeInTheDocument();
    expect(within(copilot).queryByText('Revenue › Forecast · Owner: 2')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/copilot/HistoryPopover.test.tsx src/pages/copilot/CopilotSidebar.origin.test.tsx src/pages/communications`
Expected: FAIL, because no tag text is rendered.

- [ ] **Step 3: Write minimal implementation**

In `CopilotRail.tsx`, add `LayoutDashboard` to the lucide import and `viewLabel` to the `./dashboardLabels` import. In `HistoryPopover`'s list button, replace `<span className="truncate">{c.title}</span>` with:
```tsx
                    <span className="truncate">{c.title}</span>
                    {c.origin ? (
                      <span className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-md bg-surface border border-line px-1.5 py-0.5 text-[11px] text-ink-muted">
                        <LayoutDashboard className="w-3 h-3" aria-hidden="true" />
                        <span className="sr-only">Started on the dashboard: </span>
                        {viewLabel(c.origin.area, c.origin.view)}
                      </span>
                    ) : null}
```
In `src/pages/copilot/CopilotSidebar.tsx`, add `import { viewLabel } from '../../components/copilot/dashboardLabels';` and replace line 159 with:
```tsx
                      subtext={
                        conversation.origin
                          ? `${viewLabel(conversation.origin.area, conversation.origin.view)} · ${formatRelativeTime(conversation.updated_at)}`
                          : formatRelativeTime(conversation.updated_at)
                      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/copilot src/pages/copilot src/pages/communications`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/copilot src/pages/copilot src/pages/communications/CommunicationsPage.test.tsx
git commit -m "feat(copilot): history shows where a dashboard conversation started" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `useDashboardContext` and filter names from the toolbar

**Files:**
- Create: `src/pages/dashboard/ask/filterNames.ts`, `src/pages/dashboard/ask/FilterNamesProvider.tsx`, `src/pages/dashboard/ask/useDashboardContext.ts`
- Modify: `src/pages/dashboard/shared/DashboardToolbar.tsx:39-43`
- Test: `src/pages/dashboard/ask/useDashboardContext.test.tsx` (new)

**Interfaces:**
- Consumes: `SHARED_KEYS`, `useDashboardFilters` (`shared/useDashboardFilters.ts`); `AREAS`; `contextLabel`, `FilterNames`, `SharedFilterKey` (Task 4); `DashboardContext`, `DashboardArea` (Task 1); `ToolbarFilter` (`shared/DashboardToolbar.tsx`).
- Produces:
```ts
// filterNames.ts
export interface FilterNamesState { names: FilterNames; report: (key: SharedFilterKey, names: Record<string, string>) => void }
export const FilterNamesContext: React.Context<FilterNamesState | null>;
export function namesOf(filter: ToolbarFilter): Record<string, string>;
export function useReportFilterNames(filters: ToolbarFilter[]): void;   // no-op outside a provider
export function useFilterNames(): FilterNames;                          // {} outside a provider
// FilterNamesProvider.tsx
export function FilterNamesProvider(props: { children: ReactNode }): JSX.Element;
// useDashboardContext.ts
export function parseDashboardPath(pathname: string): { area: DashboardArea; view: string | null } | null;
export function useDashboardContext(): { context: DashboardContext | null; label: string };  // focus is always null here
```

- [ ] **Step 1: Write the failing test**

Create `src/pages/dashboard/ask/useDashboardContext.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardToolbar } from '../shared/DashboardToolbar';
import { bookFilters } from '../shared/bookFilters';
import { FilterNamesProvider } from './FilterNamesProvider';
import { parseDashboardPath, useDashboardContext } from './useDashboardContext';

const options = {
  owners: [{ value: '2', name: 'Priya' }],
  lifecycles: [{ value: 'customer', name: 'Customer' }],
  customers: [{ value: '12', name: 'Uber' }],
};

function wrapperAt(url: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>
      <FilterNamesProvider>
        {/* The toolbar every view renders is what reports the names. */}
        <DashboardToolbar subViews={[]} filters={bookFilters(options)} />
        {children}
      </FilterNamesProvider>
    </MemoryRouter>
  );
}

describe('useDashboardContext', () => {
  it.each([
    ['/dashboard/overview', { area: 'overview', view: null, filters: { owner: '', lifecycle: '', customer: '' } }, 'Overview'],
    ['/dashboard/revenue/forecast?owner=2&lifecycle=customer', { area: 'revenue', view: 'forecast', filters: { owner: '2', lifecycle: 'customer', customer: '' } }, 'Revenue › Forecast · Owner: Priya · Lifecycle: Customer'],
    ['/dashboard/health/triage?customer=12&period=90', { area: 'health', view: 'triage', filters: { owner: '', lifecycle: '', customer: '12' } }, 'Health › Triage · Account: Uber'],
    ['/dashboard/support/topics?owner=9', { area: 'support', view: 'topics', filters: { owner: '9', lifecycle: '', customer: '' } }, 'Support › Topics · Owner: 9'],
  ])('%s', async (url, expected, label) => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper: wrapperAt(url) });
    expect(result.current.context).toEqual({ surface: 'dashboard', focus: null, ...expected });
    await waitFor(() => expect(result.current.label).toBe(label));
  });

  it('has no context off a real view (mid-redirect, unknown view, another page)', () => {
    expect(parseDashboardPath('/dashboard/revenue')).toBeNull();
    expect(parseDashboardPath('/dashboard/revenue/bogus')).toBeNull();
    expect(parseDashboardPath('/organizations')).toBeNull();
    const { result } = renderHook(() => useDashboardContext(), { wrapper: wrapperAt('/dashboard/health') });
    expect(result.current).toEqual({ context: null, label: '' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/dashboard/ask/useDashboardContext.test.tsx`
Expected: FAIL, because the modules do not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/pages/dashboard/ask/filterNames.ts`:
```ts
import { createContext, useContext, useEffect } from 'react';
import type { FilterNames, SharedFilterKey } from '../../../components/copilot/dashboardLabels';
import type { ToolbarFilter } from '../shared/DashboardToolbar';

/** The names each view's filter options give the shared filter values. Only
 *  DashboardToolbar sees a view's options, so it reports them here, and the
 *  Ask rail's chips can say "Owner: Priya" rather than "Owner: 2". */
export interface FilterNamesState {
  names: FilterNames;
  report: (key: SharedFilterKey, names: Record<string, string>) => void;
}

export const FilterNamesContext = createContext<FilterNamesState | null>(null);

const SHARED = new Set<string>(['owner', 'lifecycle', 'customer']);

/** value → the name the chip shows, skipping "All" (''). */
export function namesOf(filter: ToolbarFilter): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of filter.options) {
    const list = 'options' in entry ? entry.options : [entry];
    for (const option of list) if (option.value) out[option.value] = option.display ?? option.label;
  }
  return out;
}

export function useReportFilterNames(filters: ToolbarFilter[]): void {
  const report = useContext(FilterNamesContext)?.report;
  // A string, so the effect runs when the options change rather than on
  // every render's new array.
  const signature = JSON.stringify(filters.filter((f) => SHARED.has(f.key)).map((f) => [f.key, namesOf(f)]));
  useEffect(() => {
    if (!report) return;
    for (const [key, names] of JSON.parse(signature) as [SharedFilterKey, Record<string, string>][]) report(key, names);
  }, [report, signature]);
}

export function useFilterNames(): FilterNames {
  return useContext(FilterNamesContext)?.names ?? {};
}
```
Create `src/pages/dashboard/ask/FilterNamesProvider.tsx`:
```tsx
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { FilterNames, SharedFilterKey } from '../../../components/copilot/dashboardLabels';
import { FilterNamesContext } from './filterNames';

export function FilterNamesProvider({ children }: { children: ReactNode }) {
  const [names, setNames] = useState<FilterNames>({});
  const report = useCallback((key: SharedFilterKey, next: Record<string, string>) => {
    setNames((prev) => {
      // A view still loading reports no options; keep what is known rather
      // than blanking the chip for a moment.
      if (Object.keys(next).length === 0) return prev;
      if (JSON.stringify(prev[key]) === JSON.stringify(next)) return prev;
      return { ...prev, [key]: next };
    });
  }, []);
  const value = useMemo(() => ({ names, report }), [names, report]);
  return <FilterNamesContext.Provider value={value}>{children}</FilterNamesContext.Provider>;
}
```
Create `src/pages/dashboard/ask/useDashboardContext.ts`:
```ts
import { useLocation } from 'react-router-dom';
import { AREAS } from '../areas';
import { SHARED_KEYS, useDashboardFilters } from '../shared/useDashboardFilters';
import { contextLabel } from '../../../components/copilot/dashboardLabels';
import type { DashboardArea, DashboardContext } from '../../copilot/types';
import { useFilterNames } from './filterNames';

/** The area and view a dashboard URL shows, or null when it is not a view
 *  (an index route about to redirect, an unknown view, another page). */
export function parseDashboardPath(pathname: string): { area: DashboardArea; view: string | null } | null {
  const [, root, area, view] = pathname.split('/');
  if (root !== 'dashboard') return null;
  if (area === 'overview') return { area: 'overview', view: null };
  const found = AREAS.find((a) => a.key === area);
  if (!found || !found.views.some((v) => v.path === view)) return null;
  return { area: found.key, view };
}

/** Where the person is on the dashboard, as the server needs it, and the
 *  chip that says so. Read at send time: each question carries the screen
 *  as it is at that moment. Never figures; the server computes those. */
export function useDashboardContext(): { context: DashboardContext | null; label: string } {
  const { pathname } = useLocation();
  const { values } = useDashboardFilters(SHARED_KEYS);
  const names = useFilterNames();
  const where = parseDashboardPath(pathname);
  if (!where) return { context: null, label: '' };
  const context: DashboardContext = {
    surface: 'dashboard',
    ...where,
    filters: { owner: values.owner, lifecycle: values.lifecycle, customer: values.customer },
    focus: null,
  };
  return { context, label: contextLabel(context, names) };
}
```
In `DashboardToolbar.tsx`, add `import { useReportFilterNames } from '../ask/filterNames';` and, after the `useDashboardFilters` line, `useReportFilterNames(filters);`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pages/dashboard`
Expected: PASS. The existing toolbar and view tests are unaffected because the hook is a no-op without a provider.

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard/ask src/pages/dashboard/shared/DashboardToolbar.tsx
git commit -m "feat(dashboard): useDashboardContext, with chip names from the toolbar's filter options" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Mount the rail in DashboardFrame, with the drill over it and collapse

**Files:**
- Create: `src/lib/useMediaQuery.ts`, `src/test/viewport.ts`, `src/pages/dashboard/ask/askPreference.ts`, `src/pages/dashboard/ask/context.ts`, `src/pages/dashboard/ask/useAsk.ts`, `src/pages/dashboard/ask/AskProvider.tsx`, `src/pages/dashboard/ask/AskRail.tsx`, `src/pages/dashboard/ask/testAsk.tsx`
- Modify: `src/pages/dashboard/DashboardFrame.tsx`, `src/pages/dashboard/drill/DrillPanel.tsx:102`, `src/pages/dashboard/routes.test.tsx:57-77`
- Test: `src/pages/dashboard/ask/askPreference.test.ts`, `src/pages/dashboard/ask/AskRail.test.tsx` (new)

**Interfaces:**
- Consumes:
  - `CopilotRail` and its props from Tasks 2–4 (`thread`, `names`, `suggestions`, `draft`, `onSent`), plus `HistoryPopover`.
  - `useCopilotThread` and `CopilotThread` (Task 3).
  - `contextLabel` (Task 4) and `SUGGESTIONS` (Task 4).
  - `useDashboardContext`, `FilterNamesProvider` and `useFilterNames` (Task 6).
  - `stubCopilot` and `postedBodies` (Task 2).
- Produces:
```ts
// src/lib/useMediaQuery.ts
export const SM = '(min-width: 640px)';
export const XL = '(min-width: 1280px)';
export function useMediaQuery(query: string): boolean;
// src/test/viewport.ts
export function setViewport(width: number): void;
export function resetViewport(): void;
// askPreference.ts
export const ASK_PREFERENCE_KEY = 'revenact_dashboard_ask';
export function readAskPreference(): boolean | null;
export function writeAskPreference(open: boolean): void;
// context.ts
export interface AskState {
  open: boolean;                               // rail expanded (sm and up) or sheet open (below sm)
  setOpen: (open: boolean) => void;
  conversation: Conversation | null;
  setConversation: (conversation: Conversation | null) => void;
  thread: CopilotThread;
  focus: DashboardFocus | null;
  clearFocus: () => void;                      // the chip's ×
  markSent: () => void;                        // a question left: drop its focus and draft
  pendingDraft: { text: string; nonce: number } | null;
  draft: (question: string, focus: DashboardFocus) => void;          // prefill, open, never send
  ask: (question: string, focus: DashboardFocus | null) => void;     // open and send now
  openFromHistory: (conversation: Conversation) => void;
}
export const AskContext: React.Context<AskState | null>;
// useAsk.ts
export function useAsk(): AskState | null;    // null outside the dashboard frame
// AskProvider.tsx, AskRail.tsx
export function AskProvider(props: { children: ReactNode }): JSX.Element;
export function AskRail(): JSX.Element | null;
// testAsk.tsx
export function authStore(): Store;
export function Where(): JSX.Element;         // <span data-testid="where">{pathname+search}</span>
export function renderDashboard(url: string, view: () => ReactElement, width?: number): RenderResult;
```

- [ ] **Step 1: Write the helpers and failing tests**

Create `src/test/viewport.ts`:
```ts
/** jsdom has no matchMedia. This answers `(min-width: Npx)` queries as a
 *  window `width` px wide would, so layout-by-breakpoint code can be tested. */
export function setViewport(width: number): void {
  window.matchMedia = ((query: string) => {
    const min = /\(min-width:\s*(\d+)px\)/.exec(query);
    return {
      matches: min ? width >= Number(min[1]) : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  }) as unknown as typeof window.matchMedia;
}

export function resetViewport(): void {
  // @ts-expect-error -- jsdom's own window has no matchMedia; put that back
  delete window.matchMedia;
}
```
Create `src/pages/dashboard/ask/testAsk.tsx`. It copies the `authStore()` body from `src/pages/dashboard/drill/DrillPanel.test.tsx:16-52` verbatim, because `DrillPanel` rows read `useOrgCurrency`:
```tsx
import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, useLocation } from 'react-router-dom';
import authReducer from '../../../features/auth/authSlice';
import { ALL_CAPABILITIES } from '../../../test/capabilities';
import { setViewport } from '../../../test/viewport';
import { dashboardRoutes } from '../routes';

export function authStore() {
  return configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1, email: 'alice@acme.io', name: 'Alice', avatar: '', role: 'admin', role_id: 1, role_name: 'Admin',
          permissions: ALL_CAPABILITIES, function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
          organisation: {
            id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'USD' as const, currency_display: 'US Dollar ($)',
            default_lifecycle_stage: '', ai_agent_enabled: true, ai_agent_tone: 'professional' as const, ai_agent_tone_display: 'Professional',
          },
          is_active: true,
        },
        accessToken: 'token', refreshToken: 'refresh', isAuthenticated: true, isLoading: false, error: null,
      },
    },
  });
}

/** Where the router is, for asserting on navigation. */
export function Where() {
  const location = useLocation();
  return <span data-testid="where">{location.pathname + location.search}</span>;
}

/** The real dashboard route tree (DashboardFrame, providers, rail, drill
 *  panel) with every view replaced by `view`, at a given window width. */
export function renderDashboard(url: string, view: () => ReactElement, width = 1440) {
  setViewport(width);
  return render(
    <Provider store={authStore()}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>{dashboardRoutes(view)}</Routes>
      </MemoryRouter>
    </Provider>,
  );
}
```
Create `src/pages/dashboard/ask/askPreference.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ASK_PREFERENCE_KEY, readAskPreference, writeAskPreference } from './askPreference';

describe('askPreference', () => {
  afterEach(() => vi.restoreAllMocks());

  it('remembers open and closed, and knows nothing before a choice', () => {
    expect(readAskPreference()).toBeNull();
    writeAskPreference(false);
    expect(localStorage.getItem(ASK_PREFERENCE_KEY)).toBe('closed');
    expect(readAskPreference()).toBe(false);
    writeAskPreference(true);
    expect(readAskPreference()).toBe(true);
  });

  it('falls back to no choice when storage throws, and never throws itself', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readAskPreference()).toBeNull();
    expect(() => writeAskPreference(true)).not.toThrow();
  });
});
```
Create `src/pages/dashboard/ask/AskRail.test.tsx`:
```tsx
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link } from 'react-router-dom';
import { useDrill } from '../drill/useDrill';
import { resetViewport } from '../../../test/viewport';
import { postedBodies, stubCopilot } from '../../../components/copilot/testCopilot';
import { renderDashboard, Where } from './testAsk';
import { ASK_PREFERENCE_KEY } from './askPreference';

function Probe() {
  const { open } = useDrill();
  return (
    <div>
      <Link to="/dashboard/revenue/forecast?owner=2">Go to forecast for owner 2</Link>
      <button
        type="button"
        onClick={(event) => open({ title: 'At risk', figure: '$1', source: { kind: 'rows', rows: [{ id: '3', name: 'Uber' }] } }, event.currentTarget)}
      >
        Open drill
      </button>
      <Where />
    </div>
  );
}

const rail = () => screen.queryByRole('complementary', { name: 'Ask Revenact' });

describe('the Ask rail on the dashboard', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => {
    resetViewport();
    vi.restoreAllMocks();
  });

  it('is open by default at xl, beside the scroll area', () => {
    stubCopilot();
    renderDashboard('/dashboard/overview', () => <Probe />, 1440);
    expect(rail()).toBeInTheDocument();
    expect(within(rail()!).getByText('Overview')).toBeInTheDocument();
    expect(within(rail()!).getByRole('list', { name: 'Suggested questions' })).toBeInTheDocument();
  });

  it('is a slim tab below xl, and remembers the choice either way', async () => {
    stubCopilot();
    const first = renderDashboard('/dashboard/overview', () => <Probe />, 1100);
    expect(rail()).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open Ask Revenact' }));
    expect(rail()).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ask Revenact')).toHaveFocus();
    expect(localStorage.getItem(ASK_PREFERENCE_KEY)).toBe('open');
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Ask Revenact' }));
    expect(localStorage.getItem(ASK_PREFERENCE_KEY)).toBe('closed');
    expect(screen.getByRole('button', { name: 'Open Ask Revenact' })).toHaveFocus();
    first.unmount();

    renderDashboard('/dashboard/overview', () => <Probe />, 1440);
    expect(rail()).not.toBeInTheDocument();
  });

  it('falls back to the default when storage fails', async () => {
    stubCopilot();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    renderDashboard('/dashboard/overview', () => <Probe />, 1440);
    expect(rail()).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Ask Revenact' }));
    expect(rail()).not.toBeInTheDocument();
  });

  it('keeps the conversation across areas, and a follow-up carries the new screen', async () => {
    const { spy } = stubCopilot();
    renderDashboard('/dashboard/overview', () => <Probe />, 1440);
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'What needs me?{enter}');
    await screen.findByText('Answer to: What needs me?');
    await userEvent.click(screen.getByRole('link', { name: 'Go to forecast for owner 2' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/revenue/forecast?owner=2');
    expect(screen.getByText('Answer to: What needs me?')).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'And here?{enter}');
    await screen.findByText('Answer to: And here?');
    const [first, second] = postedBodies(spy);
    expect(first.context).toEqual({ surface: 'dashboard', area: 'overview', view: null, filters: { owner: '', lifecycle: '', customer: '' }, focus: null });
    expect(second.context).toEqual({ surface: 'dashboard', area: 'revenue', view: 'forecast', filters: { owner: '2', lifecycle: '', customer: '' }, focus: null });
    const log = screen.getByRole('log', { name: 'Ask Revenact messages' });
    expect(within(log).getByText('Overview')).toBeInTheDocument();
    expect(within(log).getByText('Revenue › Forecast · Owner: 2')).toBeInTheDocument();
  });

  it('opens the drill panel over the rail, not beside it', async () => {
    stubCopilot();
    renderDashboard('/dashboard/overview', () => <Probe />, 1440);
    await userEvent.click(screen.getByRole('button', { name: 'Open drill' }));
    const drill = screen.getByRole('dialog', { name: /At risk/ });
    expect(drill).toHaveClass('lg:absolute');
    expect(drill).not.toHaveClass('lg:static');
    expect(rail()).toBeInTheDocument();
  });
});
```
In `src/pages/dashboard/routes.test.tsx`, replace the body of the `%s renders inside a scroll container that shrinks to fit` test, after the `render(…)`, with:
```tsx
      const view = screen.getByTestId('where');
      const scroller = view.closest('.overflow-y-auto');
      expect(scroller).not.toBeNull();
      expect(scroller).toHaveClass('min-h-0');
      // Exactly one element above the view owns the scroll. The Ask rail's
      // own message list scrolls too, but beside the view, not around it.
      const around: Element[] = [];
      for (let el = view.parentElement; el && el !== container; el = el.parentElement) {
        if (el.classList.contains('overflow-y-auto')) around.push(el);
      }
      expect(around).toHaveLength(1);
```
Update the comment above it to say "the drill panel and the Ask rail sit beside that scroll area".

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pages/dashboard`
Expected: FAIL. The ask modules are missing and no rail is mounted.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/useMediaQuery.ts`:
```ts
import { useEffect, useState } from 'react';

export const SM = '(min-width: 640px)';
export const XL = '(min-width: 1280px)';

/** Whether `query` matches. jsdom has no matchMedia, which reads as false:
 *  the mobile-first default the CSS assumes too. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
```
Create `src/pages/dashboard/ask/askPreference.ts`:
```ts
export const ASK_PREFERENCE_KEY = 'revenact_dashboard_ask';

/** The person's own open/closed choice for the rail, or null before one. A
 *  private window or blocked storage reads as "no choice", so the default
 *  (open from xl) applies. */
export function readAskPreference(): boolean | null {
  try {
    const value = localStorage.getItem(ASK_PREFERENCE_KEY);
    return value === 'open' ? true : value === 'closed' ? false : null;
  } catch {
    return null;
  }
}

export function writeAskPreference(open: boolean): void {
  try {
    localStorage.setItem(ASK_PREFERENCE_KEY, open ? 'open' : 'closed');
  } catch {
    /* forgotten next visit; the default applies */
  }
}
```
Create `src/pages/dashboard/ask/context.ts`:
```ts
import { createContext } from 'react';
import type { CopilotThread } from '../../../components/copilot/useCopilotThread';
import type { Conversation, DashboardFocus } from '../../copilot/types';

export interface AskState {
  /** The rail is expanded (sm and up) or the sheet is open (below sm). */
  open: boolean;
  setOpen: (open: boolean) => void;
  /** The dashboard's one conversation; survives area and filter changes. */
  conversation: Conversation | null;
  setConversation: (conversation: Conversation | null) => void;
  thread: CopilotThread;
  /** What the next question is narrowed to, if anything. */
  focus: DashboardFocus | null;
  /** The chip's ×: drop the focus, keep the screen. */
  clearFocus: () => void;
  /** A question left: its focus and prefilled draft are spent. */
  markSent: () => void;
  pendingDraft: { text: string; nonce: number } | null;
  /** Prefill an editable question about `focus` and open the rail; never sends. */
  draft: (question: string, focus: DashboardFocus) => void;
  /** Open the rail and send `question` now, grounded in the screen as it is. */
  ask: (question: string, focus: DashboardFocus | null) => void;
  /** Show a conversation picked in History. */
  openFromHistory: (conversation: Conversation) => void;
}

export const AskContext = createContext<AskState | null>(null);
```
Create `src/pages/dashboard/ask/useAsk.ts`:
```ts
import { useContext } from 'react';
import { AskContext, type AskState } from './context';

/** The dashboard's Ask rail, or null outside DashboardFrame (a view or list
 *  rendered on its own in a test), where the entry points hide themselves. */
export function useAsk(): AskState | null {
  return useContext(AskContext);
}
```
Create `src/pages/dashboard/ask/AskProvider.tsx`:
```tsx
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useCopilotThread } from '../../../components/copilot/useCopilotThread';
import { SM, XL, useMediaQuery } from '../../../lib/useMediaQuery';
import type { Conversation, DashboardFocus } from '../../copilot/types';
import { readAskPreference, writeAskPreference } from './askPreference';
import { AskContext, type AskState } from './context';
import { useDashboardContext } from './useDashboardContext';

/** Holds the dashboard's one conversation, above the areas, so it survives
 *  tab and filter changes. Also the rail's open state, the focus a drill or
 *  attention row hands it, and the question a drill prefills. */
export function AskProvider({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  const isSm = useMediaQuery(SM);
  const isXl = useMediaQuery(XL);
  const { context } = useDashboardContext();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const thread = useCopilotThread(conversation, setConversation);
  const [choice, setChoice] = useState<boolean | null>(readAskPreference);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [focus, setFocus] = useState<DashboardFocus | null>(null);
  const [pendingDraft, setPendingDraft] = useState<{ text: string; nonce: number } | null>(null);

  // A focus names accounts on the screen it came from, so another area or
  // filter drops it (a drill closes on the same change). Adjusted during
  // render, as DrillContext does. The typed draft stays: it is the person's text.
  const locationKey = pathname + search;
  const [madeAt, setMadeAt] = useState(locationKey);
  if (madeAt !== locationKey) {
    setMadeAt(locationKey);
    setFocus(null);
  }

  // Open by default from xl; the person's own choice wins once made. Below
  // sm the rail is a sheet, which always starts closed.
  const railOpen = choice ?? isXl;
  const open = isSm ? railOpen : sheetOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (isSm) {
        setChoice(next);
        writeAskPreference(next);
      } else {
        setSheetOpen(next);
      }
    },
    [isSm],
  );

  const clearFocus = useCallback(() => setFocus(null), []);
  const markSent = useCallback(() => {
    setFocus(null);
    setPendingDraft(null);
  }, []);

  const value = useMemo<AskState>(
    () => ({
      open,
      setOpen,
      conversation,
      setConversation,
      thread,
      focus,
      clearFocus,
      markSent,
      pendingDraft,
      draft: (question, nextFocus) => {
        setFocus(nextFocus);
        // A new nonce remounts the composer with the new text. After markSent
        // the key is 0, so restarting at 1 still differs from the last key.
        setPendingDraft((prev) => ({ text: question, nonce: (prev?.nonce ?? 0) + 1 }));
        setOpen(true);
      },
      ask: (question, nextFocus) => {
        if (!context) return;
        setOpen(true);
        void thread.send({ text: question, content: question, context: { ...context, focus: nextFocus } });
      },
      openFromHistory: (next) => {
        setConversation(next);
        setOpen(true);
      },
    }),
    [open, setOpen, conversation, thread, focus, clearFocus, markSent, pendingDraft, context],
  );

  return <AskContext.Provider value={value}>{children}</AskContext.Provider>;
}
```
Create `src/pages/dashboard/ask/AskRail.tsx`:
```tsx
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { History, MessageSquarePlus, PanelRightClose, Sparkles } from 'lucide-react';
import { CopilotRail, HistoryPopover } from '../../../components/copilot/CopilotRail';
import { contextLabel } from '../../../components/copilot/dashboardLabels';
import type { RailContext } from '../../../components/copilot/railContext';
import { SUGGESTIONS } from '../../../components/copilot/suggestions';
import { SM, useMediaQuery } from '../../../lib/useMediaQuery';
import type { Conversation } from '../../copilot/types';
import { useFilterNames } from './filterNames';
import { useAsk } from './useAsk';
import { useDashboardContext } from './useDashboardContext';

const ICON_BUTTON =
  'min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

function RailHeader({
  historyOpen,
  onToggleHistory,
  onCloseHistory,
  onNewChat,
  onOpenConversation,
  closeLabel,
  closeIcon,
  onClose,
}: {
  historyOpen: boolean;
  onToggleHistory: () => void;
  onCloseHistory: () => void;
  onNewChat: () => void;
  onOpenConversation: (conversation: Conversation) => void;
  closeLabel: string;
  closeIcon: ReactNode;
  onClose: () => void;
}) {
  return (
    <header className="relative flex items-center gap-1 px-3 py-2 border-b border-line">
      <h2 className="flex-1 text-[15px] font-semibold text-ink">Ask Revenact</h2>
      <button type="button" onClick={onNewChat} aria-label="New chat" title="New chat" className={ICON_BUTTON}>
        <MessageSquarePlus className="w-4 h-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={onToggleHistory} aria-label="History" aria-expanded={historyOpen} title="History" className={ICON_BUTTON}>
        <History className="w-4 h-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={onClose} aria-label={closeLabel} title={closeLabel} className={ICON_BUTTON}>
        {closeIcon}
      </button>
      {historyOpen ? <HistoryPopover onClose={onCloseHistory} onOpen={onOpenConversation} /> : null}
    </header>
  );
}

/** The Ask rail beside the dashboard: a 360px column when open, a slim
 *  "Ask" tab when collapsed. Below sm it is a sheet (Task 8). */
export function AskRail() {
  const ask = useAsk();
  const isSm = useMediaQuery(SM);
  const { context } = useDashboardContext();
  const names = useFilterNames();
  const [historyOpen, setHistoryOpen] = useState(false);
  const closeHistory = useCallback(() => setHistoryOpen(false), []);
  const tabRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const toggled = useRef(false);
  const railOpen = isSm && Boolean(ask?.open);

  // Only the person's own expand/collapse moves focus: collapsing hands it to
  // the tab, expanding to the composer. A viewport change or an entry point
  // opening the rail does not.
  useEffect(() => {
    if (!toggled.current) return;
    toggled.current = false;
    if (railOpen) railRef.current?.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
    else tabRef.current?.focus();
  }, [railOpen]);

  if (!ask || !isSm) return null;

  const toggle = (next: boolean) => {
    toggled.current = true;
    ask.setOpen(next);
  };

  if (!ask.open) {
    return (
      <button
        ref={tabRef}
        type="button"
        onClick={() => toggle(true)}
        aria-label="Open Ask Revenact"
        aria-expanded={false}
        className="shrink-0 w-10 self-stretch flex flex-col items-center gap-2 py-3 rounded-xl border border-line bg-surface text-ink-muted hover:text-ink hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Sparkles className="w-4 h-4" aria-hidden="true" />
        <span className="text-[11px] font-semibold [writing-mode:vertical-rl]">Ask</span>
      </button>
    );
  }

  const asked = context ? { ...context, focus: ask.focus } : null;
  const railContext: RailContext | null = asked ? { kind: 'dashboard', context: asked, label: contextLabel(asked, names) } : null;

  return (
    <div ref={railRef} className="shrink-0 flex min-h-0">
      <CopilotRail
        variant="plain"
        label="Ask Revenact"
        className="w-[360px]"
        top={
          <RailHeader
            historyOpen={historyOpen}
            onToggleHistory={() => setHistoryOpen((o) => !o)}
            onCloseHistory={closeHistory}
            onNewChat={() => ask.setConversation(null)}
            onOpenConversation={ask.openFromHistory}
            closeLabel="Collapse Ask Revenact"
            closeIcon={<PanelRightClose className="w-4 h-4" aria-hidden="true" />}
            onClose={() => toggle(false)}
          />
        }
        context={railContext}
        onClearContext={ask.clearFocus}
        conversation={ask.conversation}
        onConversation={ask.setConversation}
        thread={ask.thread}
        names={names}
        suggestions={context ? SUGGESTIONS[context.area] : undefined}
        draft={ask.pendingDraft}
        onSent={ask.markSent}
      />
    </div>
  );
}
```
Replace `src/pages/dashboard/DashboardFrame.tsx`:
```tsx
import { Outlet } from 'react-router-dom';
import { DrillProvider } from './drill/DrillContext';
import { DrillPanel } from './drill/DrillPanel';
import { FilterNamesProvider } from './ask/FilterNamesProvider';
import { AskProvider } from './ask/AskProvider';
import { AskRail } from './ask/AskRail';

/** The dashboard's own scroll container and page padding, with the Ask
 *  rail beside it.
 *
 *  `DashboardLayout`'s `<main>` is `overflow-hidden`, so every page under it
 *  owns its scroll; one element here does it for Overview and every area.
 *  `min-h-0` lets this flex child shrink so the overflow lands here.
 *
 *  The Ask rail (and its conversation) lives above the areas, so it survives
 *  tab and filter changes. The drill panel opens over the rail from `lg`
 *  (absolute, right edge), so opening a drill never narrows the figures. */
export function DashboardFrame() {
  return (
    <FilterNamesProvider>
      <AskProvider>
        <DrillProvider>
          <div className="relative flex-1 min-h-0 w-full flex flex-col sm:flex-row gap-4 p-4">
            <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">
              <Outlet />
            </div>
            <AskRail />
            <DrillPanel />
          </div>
        </DrillProvider>
      </AskProvider>
    </FilterNamesProvider>
  );
}
```
In `src/pages/dashboard/drill/DrillPanel.tsx` line 102, replace the `className` with:
```tsx
      className="animate-slide-in-right fixed inset-0 z-40 bg-surface lg:absolute lg:inset-auto lg:top-4 lg:bottom-4 lg:right-4 lg:z-30 lg:w-[360px] lg:border lg:border-line lg:rounded-xl lg:shadow-md flex flex-col min-h-0"
```
In the same file, update the doc comments at lines 39-43 and 13-15 so they say "over the Ask rail from `lg`" instead of "beside the scroll area".

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pages/dashboard src/components && npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/useMediaQuery.ts src/test/viewport.ts src/pages/dashboard
git commit -m "feat(dashboard): Ask Revenact rail beside the dashboard, drill panel over it, collapse remembered" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The phone sheet and its focus handling

**Files:**
- Create: `src/lib/focusTrap.ts`
- Modify: `src/pages/dashboard/ask/AskRail.tsx`
- Test: `src/pages/dashboard/ask/AskSheet.test.tsx` (new)

**Interfaces:**
- Consumes: `AskRail` internals and `RailHeader` (Task 7), `renderDashboard` and `setViewport` (Task 7).
- Produces:
  - `export function trapTab(event: KeyboardEvent, root: HTMLElement): void` in `src/lib/focusTrap.ts`.
  - Below `sm`, `AskRail` renders:
    - an "Ask" button (`aria-haspopup="dialog"`, `aria-expanded`), as the first row of the frame;
    - when open, a `role="dialog"` `aria-modal="true"` sheet named "Ask Revenact", with a "Close Ask Revenact" button.

- [ ] **Step 1: Write the failing test**

Create `src/pages/dashboard/ask/AskSheet.test.tsx`:
```tsx
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetViewport } from '../../../test/viewport';
import { stubCopilot } from '../../../components/copilot/testCopilot';
import { renderDashboard, Where } from './testAsk';
import { ASK_PREFERENCE_KEY } from './askPreference';

describe('the Ask sheet on a phone', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => resetViewport());

  it('has no rail, only an Ask button, even when the rail was left open on a desktop', () => {
    stubCopilot();
    localStorage.setItem(ASK_PREFERENCE_KEY, 'open');
    renderDashboard('/dashboard/overview', () => <Where />, 375);
    expect(screen.queryByRole('complementary', { name: 'Ask Revenact' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens full screen with focus inside, and gives focus back on Escape and on close', async () => {
    stubCopilot();
    renderDashboard('/dashboard/overview', () => <Where />, 375);
    const button = screen.getByRole('button', { name: 'Ask' });
    await userEvent.click(button);
    const sheet = screen.getByRole('dialog', { name: 'Ask Revenact' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByPlaceholderText('Ask Revenact')).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Ask Revenact' })).not.toBeInTheDocument();
    expect(button).toHaveFocus();

    await userEvent.click(button);
    await userEvent.click(screen.getByRole('button', { name: 'Close Ask Revenact' }));
    expect(screen.queryByRole('dialog', { name: 'Ask Revenact' })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('keeps Tab inside the sheet', async () => {
    stubCopilot();
    renderDashboard('/dashboard/overview', () => <Where />, 375);
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    screen.getByRole('button', { name: 'New chat' }).focus();
    await userEvent.tab({ shift: true });
    const sheet = screen.getByRole('dialog', { name: 'Ask Revenact' });
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/dashboard/ask/AskSheet.test.tsx`
Expected: FAIL, because nothing renders below `sm`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/focusTrap.ts`:
```ts
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift+Tab inside `root` (a full-screen sheet). */
export function trapTab(event: KeyboardEvent, root: HTMLElement): void {
  const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
```
In `AskRail.tsx`:
- imports: add `X` to lucide and `import { trapTab } from '../../../lib/focusTrap';`.
- After the existing refs, add:
```tsx
  const askButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetOpen = !isSm && Boolean(ask?.open);
  const setOpen = ask?.setOpen;

  const closeSheet = useCallback(() => {
    setOpen?.(false);
    askButtonRef.current?.focus();
  }, [setOpen]);

  // Focus moves into the sheet when it opens: the composer (a prefilled
  // draft's autoFocus lands in the same place).
  useEffect(() => {
    if (sheetOpen) sheetRef.current?.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
  }, [sheetOpen]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (event: KeyboardEvent) => {
      const root = sheetRef.current;
      if (!root) return;
      // History's own Escape closes History first; the sheet stays.
      if (event.key === 'Escape' && !historyOpen) closeSheet();
      if (event.key === 'Tab') trapTab(event, root);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen, historyOpen, closeSheet]);
```
- Change `if (!ask || !isSm) return null;` to `if (!ask) return null;`.
- Move the `asked`/`railContext` computation above the collapsed-tab branch, and extract the rail into a local function used by both layouts:
```tsx
  const renderRail = (className: string, closeLabel: string, closeIcon: ReactNode, onClose: () => void) => (
    <CopilotRail
      variant="plain"
      label="Ask Revenact"
      className={className}
      top={
        <RailHeader
          historyOpen={historyOpen}
          onToggleHistory={() => setHistoryOpen((o) => !o)}
          onCloseHistory={closeHistory}
          onNewChat={() => ask.setConversation(null)}
          onOpenConversation={ask.openFromHistory}
          closeLabel={closeLabel}
          closeIcon={closeIcon}
          onClose={onClose}
        />
      }
      context={railContext}
      onClearContext={ask.clearFocus}
      conversation={ask.conversation}
      onConversation={ask.setConversation}
      thread={ask.thread}
      names={names}
      suggestions={context ? SUGGESTIONS[context.area] : undefined}
      draft={ask.pendingDraft}
      onSent={ask.markSent}
    />
  );

  if (!isSm) {
    return (
      <>
        {/* First row of the frame on a phone, directly under the Navbar. */}
        <div className="order-first flex justify-end">
          <button
            ref={askButtonRef}
            type="button"
            onClick={() => ask.setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={ask.open}
            className="min-h-11 px-4 inline-flex items-center gap-2 rounded-lg border border-line bg-surface text-[13px] font-semibold text-ink hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            Ask
          </button>
        </div>
        {ask.open ? (
          <div ref={sheetRef} role="dialog" aria-modal="true" aria-label="Ask Revenact" className="animate-slide-in-right fixed inset-0 z-40 bg-surface flex flex-col">
            {renderRail('w-full flex-1 !rounded-none !border-0', 'Close Ask Revenact', <X className="w-4 h-4" aria-hidden="true" />, closeSheet)}
          </div>
        ) : null}
      </>
    );
  }
```
- In the `sm`-and-up branch, replace the inline `<CopilotRail … />` with `{renderRail('w-[360px]', 'Collapse Ask Revenact', <PanelRightClose className="w-4 h-4" aria-hidden="true" />, () => toggle(false))}`.
- Update the component doc comment: "Below `sm` it is a full-screen sheet opened from an Ask button; focus moves in, Tab is trapped, and Escape or Close returns focus to the button."

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pages/dashboard`
Expected: PASS, including `routes.test.tsx`. With jsdom's missing matchMedia the layout is the phone one, which adds no scroll container.

- [ ] **Step 5: Commit**

```bash
git add src/lib/focusTrap.ts src/pages/dashboard/ask
git commit -m "feat(dashboard): Ask Revenact as a full-screen sheet on phones" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Reopening a dashboard conversation restores its view

**Files:**
- Create: `src/pages/dashboard/ask/originPath.ts`
- Modify: `src/pages/dashboard/ask/AskProvider.tsx` (`openFromHistory`)
- Test: `src/pages/dashboard/ask/originPath.test.ts`, `src/pages/dashboard/ask/historyRestore.test.tsx` (new)

**Interfaces:**
- Consumes: `DashboardOrigin` (Task 1), `toQuery` (`shared/useDashboardFilters.ts`), `AskProvider` (Task 7), `renderDashboard`, `Where`, `stubCopilot` (Tasks 2, 7).
- Produces: `export function originPath(origin: DashboardOrigin): string`. `openFromHistory` navigates to `originPath(c.origin)` when `c.origin` is set, then shows the thread.

- [ ] **Step 1: Write the failing tests**

Create `src/pages/dashboard/ask/originPath.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { originPath } from './originPath';

const filters = { owner: '', lifecycle: '', customer: '' };

describe('originPath', () => {
  it('goes back to the view with its filters', () => {
    expect(originPath({ surface: 'dashboard', area: 'overview', view: null, filters })).toBe('/dashboard/overview');
    expect(originPath({ surface: 'dashboard', area: 'revenue', view: 'forecast', filters: { ...filters, owner: '2', lifecycle: 'customer' } })).toBe(
      '/dashboard/revenue/forecast?owner=2&lifecycle=customer',
    );
    expect(originPath({ surface: 'dashboard', area: 'health', view: null, filters })).toBe('/dashboard/health');
  });
});
```
Create `src/pages/dashboard/ask/historyRestore.test.tsx`:
```tsx
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetViewport } from '../../../test/viewport';
import { stubCopilot } from '../../../components/copilot/testCopilot';
import { renderDashboard, Where } from './testAsk';

const origin = { surface: 'dashboard', area: 'revenue', view: 'forecast', filters: { owner: '2', lifecycle: '', customer: '' } };

describe('reopening from history on the dashboard', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => resetViewport());

  it('goes to the view and filters the conversation started on, then shows it', async () => {
    stubCopilot({
      conversations: [{ id: 9, title: 'Why is at-risk ARR up?', created_at: '', updated_at: '', origin }],
      conversationById: {
        9: {
          id: 9, title: 'Why is at-risk ARR up?', created_at: '', updated_at: '', origin,
          messages: [
            { id: 1, role: 'user', content: 'Why is at-risk ARR up?', context: { ...origin, focus: null }, sources: [], questions: [], created_at: '' },
            { id: 2, role: 'assistant', content: 'Two renewals slipped.', sources: [], questions: [], created_at: '' },
          ],
        },
      },
    });
    renderDashboard('/dashboard/overview', () => <Where />, 1440);
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    const panel = screen.getByRole('dialog', { name: 'History' });
    await userEvent.click(await within(panel).findByRole('button', { name: /Why is at-risk ARR up\?/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/revenue/forecast?owner=2');
    expect(await screen.findByText('Two renewals slipped.')).toBeInTheDocument();
  });

  it('opens a conversation from elsewhere where you are', async () => {
    stubCopilot({
      conversations: [{ id: 4, title: 'Pizza Hut mail', created_at: '', updated_at: '', origin: null }],
      conversationById: { 4: { id: 4, title: 'Pizza Hut mail', created_at: '', updated_at: '', origin: null, messages: [{ id: 1, role: 'assistant', content: 'They replied.', sources: [], questions: [], created_at: '' }] } },
    });
    renderDashboard('/dashboard/health/triage', () => <Where />, 1440);
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Pizza Hut mail' }));
    expect(await screen.findByText('They replied.')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/health/triage');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pages/dashboard/ask/originPath.test.ts src/pages/dashboard/ask/historyRestore.test.tsx`
Expected: FAIL. `originPath` is missing, and the first test stays on `/dashboard/overview`.

- [ ] **Step 3: Write minimal implementation**

Create `src/pages/dashboard/ask/originPath.ts`:
```ts
import type { DashboardOrigin } from '../../copilot/types';
import { toQuery } from '../shared/useDashboardFilters';

/** The dashboard URL a conversation started on: its area and view, with its
 *  shared filters. A missing view lands on the area, which redirects to its
 *  first view. */
export function originPath(origin: DashboardOrigin): string {
  const path =
    origin.area === 'overview'
      ? '/dashboard/overview'
      : origin.view
        ? `/dashboard/${origin.area}/${origin.view}`
        : `/dashboard/${origin.area}`;
  const query = toQuery({ owner: origin.filters.owner, lifecycle: origin.filters.lifecycle, customer: origin.filters.customer });
  return query ? `${path}?${query}` : path;
}
```
In `AskProvider.tsx`, import `useNavigate` from `react-router-dom` and `originPath` from `./originPath`, add `const navigate = useNavigate();` after `useLocation()`, replace `openFromHistory` with the version below, and add `navigate` to the `useMemo` deps:
```tsx
      openFromHistory: (next) => {
        // A dashboard conversation reopens where it was asked, so its first
        // answer sits beside the figures it was about.
        if (next.origin) navigate(originPath(next.origin));
        setConversation(next);
        setOpen(true);
      },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pages/dashboard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard/ask
git commit -m "feat(dashboard): reopening a dashboard conversation restores its view and filters" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Drill panel "Ask about these"

**Files:**
- Modify: `src/pages/dashboard/drill/DrillPanel.tsx`
- Test: `src/pages/dashboard/ask/drillAsk.test.tsx` (new), `src/pages/dashboard/drill/DrillPanel.test.tsx` (add one)

**Interfaces:**
- Consumes: `useAsk` and `AskState.draft` (Task 7), `useDrill().close` (existing), `renderDashboard` (Task 7).
- Produces:
  - `RowList` gains `onAsk?: (ids: number[]) => void`, and `ServerRows` passes it through.
  - The button is named "Ask about these". It is enabled only when `rows.length === count && count <= 200`; otherwise it is disabled and described by the note "Ask about up to 200 accounts at a time. Narrow the filters to ask."

- [ ] **Step 1: Write the failing tests**

Create `src/pages/dashboard/ask/drillAsk.test.tsx`:
```tsx
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useDrill } from '../drill/useDrill';
import type { DrillRow } from '../drill/types';
import { resetViewport } from '../../../test/viewport';
import { postedBodies, stubCopilot } from '../../../components/copilot/testCopilot';
import { renderDashboard } from './testAsk';

function Opener({ rows }: { rows: DrillRow[] }) {
  const { open } = useDrill();
  return (
    <button type="button" onClick={(event) => open({ title: 'At risk', figure: '$80.1K', source: { kind: 'rows', rows } }, event.currentTarget)}>
      At risk $80.1K
    </button>
  );
}

const two: DrillRow[] = [{ id: '3', name: 'Uber', arr: 42000 }, { id: '7', name: 'Pizza Hut', arr: 38100 }];

describe('"Ask about these" in the drill panel', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => resetViewport());

  it('closes the drill, opens a collapsed rail, and prefills an editable question about those accounts', async () => {
    const { spy } = stubCopilot();
    renderDashboard('/dashboard/revenue/forecast', () => <Opener rows={two} />, 1100);
    await userEvent.click(screen.getByRole('button', { name: 'At risk $80.1K' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ask about these' }));

    expect(screen.queryByRole('dialog', { name: /At risk/ })).not.toBeInTheDocument();
    const input = screen.getByPlaceholderText('Ask Revenact');
    expect(input).toHaveValue('Why are these in At risk?');
    expect(input).toHaveFocus();
    expect(screen.getByText('Revenue › Forecast · 2 accounts')).toBeInTheDocument();
    expect(postedBodies(spy)).toHaveLength(0);

    await userEvent.type(input, ' Short answer.{enter}');
    await screen.findByText('Answer to: Why are these in At risk? Short answer.');
    expect(postedBodies(spy)[0].context).toMatchObject({ area: 'revenue', view: 'forecast', focus: { kind: 'companies', ids: [3, 7] } });

    // The focus was for that one question.
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'And overall?{enter}');
    await screen.findByText('Answer to: And overall?');
    expect(postedBodies(spy)[1].context).toMatchObject({ focus: null });
  });

  it('is off, and says why, for more than 200 accounts', async () => {
    stubCopilot();
    const many = Array.from({ length: 201 }, (_, i) => ({ id: String(i + 1), name: `Co ${i + 1}` }));
    renderDashboard('/dashboard/revenue/forecast', () => <Opener rows={many} />, 1440);
    await userEvent.click(screen.getByRole('button', { name: 'At risk $80.1K' }));
    const button = screen.getByRole('button', { name: 'Ask about these' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Ask about up to 200 accounts at a time. Narrow the filters to ask.');
  });
});
```
Add to `DrillPanel.test.tsx` inside `describe('DrillPanel', …)` (it uses that file's own `renderPanel()` and `Opener`, which render `DrillProvider` without an `AskProvider`):
```tsx
  it('offers no "Ask about these" outside the dashboard frame', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'At risk' }));
    expect(screen.getByRole('dialog', { name: /At risk/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask about these' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pages/dashboard/ask/drillAsk.test.tsx`
Expected: FAIL, because there is no "Ask about these" button.

- [ ] **Step 3: Write minimal implementation**

In `DrillPanel.tsx`:
- imports: `import { Sparkles, X } from 'lucide-react';` and `import { useAsk } from '../ask/useAsk';`.
- constant: `const ASK_LIMIT = 200; // the backend's cap on focus ids`.
- In `DrillPanel`, after `const { current, close } = useDrill();`:
```tsx
  const ask = useAsk();
```
- Just before `if (!current) return null;`, add:
```tsx
  // Hands the accounts behind this number to the Ask rail as a focus, with
  // an editable question. The panel closes because it sits over the rail.
  const onAsk =
    ask && current
      ? (ids: number[]) => {
          close();
          ask.draft(`Why are these in ${current.title}?`, { kind: 'companies', ids });
        }
      : undefined;
```
- Pass it down with `<RowList rows={current.source.rows} onAsk={onAsk} />` and `<ServerRows key={…} {...current.source} onAsk={onAsk} />`.
- `ServerRows` signature becomes `function ServerRows({ path, query, segment, onAsk }: { path: string; query: string; segment: string; onAsk?: (ids: number[]) => void })`, and its final `RowList` becomes `<RowList rows={state.rows} total={state.count} onAsk={onAsk} />`.
- `RowList` becomes `function RowList({ rows, total, onAsk }: { rows: DrillRow[]; total?: number; onAsk?: (ids: number[]) => void })`, with `const noteId = useId();` at its top (before the early return). After `const count = …`, add:
```tsx
  // Only a complete list within the backend's cap: "these" must mean every
  // account behind the number.
  const askable = rows.length === count && count <= ASK_LIMIT;
```
and, as the first child of its returned `<div>`:
```tsx
      {onAsk && (
        <div className="mx-4 mt-3">
          <button
            type="button"
            disabled={!askable}
            aria-describedby={askable ? undefined : noteId}
            onClick={() => onAsk(rows.map((row) => Number(row.id)))}
            className="min-h-9 px-3 inline-flex items-center gap-2 rounded-lg border border-line bg-surface text-[13px] font-semibold text-ink enabled:hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            Ask about these
          </button>
          {!askable && (
            <p id={noteId} className="mt-1 text-[11px] text-ink-muted">
              Ask about up to 200 accounts at a time. Narrow the filters to ask.
            </p>
          )}
        </div>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pages/dashboard`
Expected: PASS, and every view's drill tests still pass because there is no `AskProvider` there.

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard/drill/DrillPanel.tsx src/pages/dashboard/drill/DrillPanel.test.tsx src/pages/dashboard/ask/drillAsk.test.tsx
git commit -m "feat(dashboard): Ask about these accounts from the drill panel" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Attention row "Why?"

**Files:**
- Modify: `src/pages/dashboard/overview/AttentionList.tsx:300-310`
- Test: `src/pages/dashboard/ask/attentionAsk.test.tsx` (new), `src/pages/dashboard/overview/AttentionList.test.tsx` (add one)

**Interfaces:**
- Consumes: `useAsk` and `AskState.ask` (Task 7), `renderDashboard` (Task 7), `AttentionItem` (`features/attention/attentionApi.ts`).
- Produces: each live row gets a quiet "Why?" button after Done. Its accessible name is `Ask why <title> is on my list`, it is disabled when the list is stale, and it sends `Why is this on my list?` with `{kind:'attention', key}` at once.

- [ ] **Step 1: Write the failing tests**

Create `src/pages/dashboard/ask/attentionAsk.test.tsx`:
```tsx
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttentionList } from '../overview/AttentionList';
import type { AttentionItem } from '../../../features/attention/attentionApi';
import { resetViewport } from '../../../test/viewport';
import { postedBodies, stubCopilot } from '../../../components/copilot/testCopilot';
import { renderDashboard } from './testAsk';

const items: AttentionItem[] = [
  { key: 'renewal:12', kind: 'renewal', title: 'Uber', reason: 'renewal 45 days overdue', at_stake: 42_000, urgency: 1, score: 42_000, customer_id: 12, companies: [] },
];

describe('"Why?" on an attention row', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => resetViewport());

  it('opens a collapsed rail and asks at once, about that item', async () => {
    const { spy } = stubCopilot();
    renderDashboard('/dashboard/overview?owner=2', () => <AttentionList items={items} currency="USD" loading={false} error={false} />, 1100);
    expect(screen.queryByRole('complementary', { name: 'Ask Revenact' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ask why Uber is on my list' }));
    expect(screen.getByRole('complementary', { name: 'Ask Revenact' })).toBeInTheDocument();
    expect(await screen.findByText('Answer to: Why is this on my list?')).toBeInTheDocument();
    expect(postedBodies(spy)).toEqual([
      {
        content: 'Why is this on my list?',
        context: { surface: 'dashboard', area: 'overview', view: null, filters: { owner: '2', lifecycle: '', customer: '' }, focus: { kind: 'attention', key: 'renewal:12' } },
      },
    ]);
  });

  it('is off while the list is stale', () => {
    stubCopilot();
    renderDashboard('/dashboard/overview', () => <AttentionList items={items} currency="USD" loading error={false} />, 1440);
    expect(screen.getByRole('button', { name: 'Ask why Uber is on my list' })).toBeDisabled();
  });
});
```
Add to `AttentionList.test.tsx`:
```tsx
  it('offers no "Why?" outside the dashboard frame', () => {
    renderList();
    expect(screen.queryByRole('button', { name: /^Ask why/ })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pages/dashboard/ask/attentionAsk.test.tsx`
Expected: FAIL, because there is no Why? button.

- [ ] **Step 3: Write minimal implementation**

In `AttentionList.tsx`, import `useAsk` from `'../ask/useAsk'`. Add `const ask = useAsk();` after `const { open } = useDrill();`. Then, after the Done `<button>` inside the row's `<span className="flex gap-2">`, add:
```tsx
                    {ask && (
                      <button
                        type="button"
                        aria-label={`Ask why ${item.title} is on my list`}
                        className={QUIET}
                        disabled={stale}
                        onClick={() => ask.ask('Why is this on my list?', { kind: 'attention', key: item.key })}
                      >
                        Why?
                      </button>
                    )}
```
Update the component's doc comment with one line: "Inside the dashboard frame each row also has Why?, which asks the Ask rail about that item at once."

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pages/dashboard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard/overview src/pages/dashboard/ask/attentionAsk.test.tsx
git commit -m "feat(dashboard): Why? on an attention row asks the rail about that item" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: End-to-end flow (jsdom)

**Files:**
- Test: `src/e2e/dashboardAsk.test.tsx` (new)

**Interfaces:**
- Consumes: everything above: `renderDashboard`, `Where`, `stubCopilot`, `postedBodies`, `DashboardToolbar`, `bookFilters`, `AttentionList`, `useDrill`.
- Produces: no production code. This is the spec's five browser-check steps as a jsdom flow.

- [ ] **Step 1: Write the test**

Create `src/e2e/dashboardAsk.test.tsx`:
```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useDrill } from '../pages/dashboard/drill/useDrill';
import { DashboardToolbar } from '../pages/dashboard/shared/DashboardToolbar';
import { bookFilters } from '../pages/dashboard/shared/bookFilters';
import { AttentionList } from '../pages/dashboard/overview/AttentionList';
import { renderDashboard, Where } from '../pages/dashboard/ask/testAsk';
import { postedBodies, stubCopilot } from '../components/copilot/testCopilot';
import { resetViewport } from '../test/viewport';
import type { AttentionItem } from '../features/attention/attentionApi';

// End-to-end tier (jsdom, no browser): the real dashboard frame, providers,
// rail, drill panel and toolbar; one stub view holding a toolbar, an
// attention list and a drillable figure. Only the network is mocked.

const items: AttentionItem[] = [
  { key: 'risk:12', kind: 'risk', title: 'Uber', reason: 'risk 62', at_stake: 42_000, urgency: 1, score: 42_000, customer_id: 12, companies: [] },
];
const origin = { surface: 'dashboard', area: 'revenue', view: 'forecast', filters: { owner: '2', lifecycle: '', customer: '' } };

function Screen() {
  const { open } = useDrill();
  return (
    <div>
      <DashboardToolbar subViews={[]} filters={bookFilters({ owners: [{ value: '2', name: 'Priya' }], lifecycles: [], customers: [] })} />
      <AttentionList items={items} currency="USD" loading={false} error={false} />
      <button
        type="button"
        onClick={(event) => open({ title: 'At risk', figure: '$80.1K', source: { kind: 'rows', rows: [{ id: '3', name: 'Uber' }, { id: '7', name: 'Pizza Hut' }] } }, event.currentTarget)}
      >
        At risk $80.1K
      </button>
      <Where />
    </div>
  );
}

describe('Ask Revenact on the dashboard', () => {
  afterEach(() => {
    resetViewport();
    vi.unstubAllGlobals();
  });

  it('asks, follows the screen, drills, asks why, and restores a conversation from history', { timeout: 30000 }, async () => {
    const { spy } = stubCopilot({
      conversations: [{ id: 9, title: 'Why is at-risk ARR up?', created_at: '', updated_at: '', origin }],
      conversationById: {
        9: { id: 9, title: 'Why is at-risk ARR up?', created_at: '', updated_at: '', origin, messages: [{ id: 1, role: 'assistant', content: 'Two renewals slipped.', sources: [], questions: [], created_at: '' }] },
      },
    });
    renderDashboard('/dashboard/overview', () => <Screen />, 1440);
    const log = () => screen.getByRole('log', { name: 'Ask Revenact messages' });

    // 1. Ask on the Overview, from a suggestion.
    await userEvent.click(screen.getByRole('button', { name: 'What should I act on first?' }));
    await screen.findByText('Answer to: What should I act on first?');
    expect(within(log()).getByText('Overview')).toBeInTheDocument();

    // 2. Change a filter and ask a follow-up: it carries the new filter, by name.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Primary Owner' }), '2');
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'And for Priya?{enter}');
    await screen.findByText('Answer to: And for Priya?');
    expect(within(log()).getByText('Overview · Owner: Priya')).toBeInTheDocument();
    expect(postedBodies(spy)[1].context).toMatchObject({ filters: { owner: '2', lifecycle: '', customer: '' }, focus: null });

    // 3. Open a drill and ask about its accounts.
    await userEvent.click(screen.getByRole('button', { name: 'At risk $80.1K' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ask about these' }));
    expect(screen.getByPlaceholderText('Ask Revenact')).toHaveValue('Why are these in At risk?');
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), '{enter}');
    await screen.findByText('Answer to: Why are these in At risk?');
    expect(postedBodies(spy)[2].context).toMatchObject({ focus: { kind: 'companies', ids: [3, 7] } });

    // 4. Why? on an attention row.
    await userEvent.click(screen.getByRole('button', { name: 'Ask why Uber is on my list' }));
    await screen.findByText('Answer to: Why is this on my list?');
    expect(postedBodies(spy)[3].context).toMatchObject({ focus: { kind: 'attention', key: 'risk:12' } });

    // 5. Reopen a conversation from history: the view it started on comes back.
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    await userEvent.click(await screen.findByRole('button', { name: /Why is at-risk ARR up\?/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/revenue/forecast?owner=2');
    expect(await screen.findByText('Two renewals slipped.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/e2e/dashboardAsk.test.tsx`
Expected: PASS, because it exercises only code from Tasks 1–11. If a step fails, fix the task that owns that behaviour, not the test.

- [ ] **Step 3: Commit**

```bash
git add src/e2e/dashboardAsk.test.tsx
git commit -m "test(dashboard): end-to-end Ask Revenact flow" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Docs: app flow, UI/UX design, repo architecture

**Files:**
- Modify: `docs/04-app-flow.md` (the §2 route-map row for `/communications`, §4.6, §4.7), `docs/03-ui-ux-design.md` (§6 Drill panel, new "Ask rail" subsection, §9 item 2, §10), `.agents/workflows/repo-architecture.md` (§2 Dashboard, §6 Copilot, dependency graph)

**Interfaces:** none (documentation only).

- [ ] **Step 1: `docs/04-app-flow.md`**

1. In §4.7, after the `DashboardFrame` bullet, add:
```markdown
- **Ask Revenact.** `DashboardFrame` mounts `FilterNamesProvider` →
  `AskProvider` → `DrillProvider` around `[scroll area][AskRail]`
  (`src/pages/dashboard/ask/`). The conversation lives in `AskProvider`, above
  the areas, so it survives tab and filter changes.
  - **Sending.** Each question posts to `/copilot/messages/` with
    `context: {surface:'dashboard', area, view, filters:{owner, lifecycle,
    customer}, focus}` and no text prefix. `useDashboardContext()` reads the
    route (`areas.ts`) and `useDashboardFilters(SHARED_KEYS)` at send time, so a
    follow-up after a filter change carries the new filters; the client never
    sends figures, and the server recomputes the screen. Each user message shows
    its own chip from its echoed `context` (e.g. "Revenue › Forecast · Owner:
    Priya"), with names from the view's filter options, which `DashboardToolbar`
    reports into `FilterNamesProvider`.
  - **Layout.** Open by default from `xl` (1280px), a slim "Ask" tab below it;
    the open/closed choice is kept in `localStorage`
    (`revenact_dashboard_ask`, read and written in try/catch). Below `sm` an
    "Ask" button, the frame's first row, opens a full-screen sheet
    (`aria-modal`, Tab trapped, Escape/Close return focus to the button).
  - **Entry points.**
    - Typing.
    - Three suggested questions per area while the conversation is empty
      (`components/copilot/suggestions.ts`, no model call).
    - "Ask about these" in the drill panel: it closes the drill, opens the rail
      and prefills "Why are these in <segment>?" with focus `{kind:'companies',
      ids}`. It is enabled only for a complete list of up to 200 accounts, and
      nothing is sent until the person sends it.
    - "Why?" on an attention row: it sends "Why is this on my list?" at once
      with focus `{kind:'attention', key}`.
    - A focus lasts one question; it is also dropped by the chip's × or by
      another area or filter.
  - **States.**
    - In flight: a "Thinking…" skeleton.
    - A `429`: "This month's AI budget is used up." with no retry.
    - Any other failure keeps the question, with Retry, which resends the same
      body.
    - Sources render under answers as on `/copilot`.
  - **History.** The rail header has New chat, History and Collapse. History is
    shared with Communications and the Copilot page. A conversation whose
    `origin` is set shows a tag (e.g. "Revenue › Forecast"). Reopening one on
    the dashboard navigates to its area, view and filters, then shows the
    thread. From Communications or `/copilot` it opens where you are, as plain
    text, with the tag shown.
```
2. In the §4.7 **Drill-down → Panel** bullet, replace "From `1024px` (`lg`) it is a static 360px panel beside the dashboard's own scroll area" with "From `1024px` (`lg`) it is a 360px panel positioned over the Ask rail (absolute, right edge of the frame), so opening it never narrows the figures".
3. In §4.6, append item 8:
```markdown
8. Conversations started on the dashboard carry an `origin` (area, view,
   filters). The chat history shows it before the time ("Revenue › Forecast ·
   2h ago"); such a conversation opens here as plain text.
```
4. In the §2 route map `/communications` row, change "a Copilot rail (Next event, …)" to "the shared Copilot rail (`components/copilot/CopilotRail`, with Next event above it and the picked source as context; New chat, History and a hide switch live in the top bar)".

- [ ] **Step 2: `docs/03-ui-ux-design.md`**

1. In §6 **Drill panel → Shape**, replace "From `1024px` (`lg`) it is a static 360px panel docked beside the dashboard's own scroll area, `border border-line rounded-xl`" with "From `1024px` (`lg`) it is a 360px panel laid over the Ask rail (`lg:absolute` at the frame's right edge, `border border-line rounded-xl shadow-md`), so the figures never narrow".
2. After the Drill panel subsection, add:
```markdown
### Ask rail

`src/components/copilot/CopilotRail.tsx`, shared by Communications (variant
`glass`, its documented exception) and the Dashboard (variant `plain`: one
`border-line rounded-xl bg-surface` column, no card inside it).

- **Dashboard shape.**
  - `xl` and wider: a 360px column beside the scroll area, open by default.
  - Below `xl`: a 40px "Ask" tab (vertical 11px label), until opened.
  - Below `sm`: a full-screen sheet from an "Ask" button (`min-h-11`).
  - Header: "Ask Revenact" at 15px, with New chat, History and
    Collapse/Close as `min-h-9 min-w-9` icon buttons, each named.
- **Chips.**
  - The composer's chip says what the next question is about ("Revenue ›
    Forecast · Owner: Priya · 2 accounts"). Its × removes only a focus, never
    the screen.
  - Each user question carries its own 11px `bg-subtle` chip above its bubble,
    on the dashboard only.
- **Empty.** Three suggested questions as full-width `border-line` buttons (13px)
  under an 11px "Ask about what is on screen." line.
- **States.**
  - In flight: a three-line `bg-subtle animate-pulse` skeleton shaped like an
    answer (`role="status"`, "Thinking…" for screen readers).
  - Budget spent: an `ink-muted` line, "This month's AI budget is used up.",
    with no action.
  - Other failures: a `text-danger` line with a Retry button; the question
    stays on screen.
  - Focus returns to the input after every send.
- **Entry points.**
  - Drill panel: "Ask about these" (secondary button, Sparkles icon), disabled
    with an 11px note above 200 accounts.
  - Attention row: "Why?", a quiet button after Done, named "Ask why <title>
    is on my list".
- **History.** An 11px origin tag (LayoutDashboard icon + "Revenue › Forecast")
  on dashboard conversations.
```
3. In §9 item 2, replace "Communications' `CopilotRail` history popover" with "the shared `CopilotRail` history popover". Also add the Ask sheet to the sentence about focus traps: "…only the drill panel (in its sheet below `1024px`) and the Ask sheet (below `640px`) trap focus, and only those two return focus to their trigger on close."
4. In §10, append: "The dashboard's Ask rail changes shape at `sm` (sheet below it) and `xl` (open by default from it); the drill panel lies over the rail from `lg`."

- [ ] **Step 3: `.agents/workflows/repo-architecture.md`**

1. After the `#### Drill-down (pages/dashboard/drill/)` block, add:
```markdown
#### Ask Revenact (`pages/dashboard/ask/`, `components/copilot/`)

| File | What it does |
|---|---|
| `components/copilot/CopilotRail.tsx` | The shared rail (`CopilotRail`) and `HistoryPopover`. `context: RailContext` (`railContext.ts`) is `{kind:'label'}` (Communications: `[About: …]` text prefix) or `{kind:'dashboard'}` (structured `context` field). Props for `variant`, `top`, `thread`, `names`, `suggestions`, `draft`, `onSent` |
| `components/copilot/useCopilotThread.ts` | Sending on one conversation: pending, failed (`budget` on 429), `retry` |
| `components/copilot/dashboardLabels.ts`, `suggestions.ts` | Chip text (`viewLabel`, `contextLabel`), three questions per area |
| `ask/useDashboardContext.ts` | Route + `SHARED_KEYS` → `DashboardContext` and its chip, read at send time |
| `ask/filterNames.ts`, `FilterNamesProvider.tsx` | `DashboardToolbar` reports the shared filters' option names for chips |
| `ask/context.ts`, `useAsk.ts`, `AskProvider.tsx` | The dashboard's one conversation and thread, open state (`askPreference.ts`), focus, prefilled draft, history restore (`originPath.ts`); `useAsk()` is null outside the frame, so entry points hide in isolated view tests |
| `ask/AskRail.tsx` | Rail header, collapsed tab, phone sheet |
| `ask/testAsk.tsx`, `components/copilot/testCopilot.ts` | `renderDashboard(url, view, width)`, `stubCopilot`, `postedBodies` |
```
2. In the dependency graph, change the `DashboardFrame →` line to `DashboardFrame → FilterNamesProvider + AskProvider + DrillProvider, then [scroll area → AreaLayout …][AskRail][DrillPanel over the rail]`, and add `│     ├── ask/ — AskProvider/useAsk, AskRail, useDashboardContext, filterNames` under `drill/`.
3. In `### 6. Copilot`, add one line: "`components/copilot/CopilotRail` is the rail version used by Communications and the Dashboard; history items show a dashboard `origin` tag."

- [ ] **Step 4: Check and commit**

Run: `grep -rn "communications/CopilotRail\|static 360px panel beside" docs .agents src`
Expected: no matches.
```bash
git add docs/04-app-flow.md docs/03-ui-ux-design.md .agents/workflows/repo-architecture.md
git commit -m "docs(dashboard): Ask Revenact in app flow, UI/UX and repo architecture" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Full checks and a browser check against the local backend

**Files:** none, unless a check fails. A fix goes back into the task that owns the behaviour and gets its own commit.

- [ ] **Step 1: Static and unit gates**

Run each and read the output:
```bash
npm run lint          # expected: 0 errors (existing warnings allowed, none new in files this plan touched)
npx tsc -b --noEmit   # expected: no output
npx vitest run        # expected: all files pass, including src/e2e/dashboardAsk.test.tsx
npm run build         # expected: vite build completes
```
Then run the house anti-slop check on the files this plan touched:
```bash
git diff main --name-only -- 'src/**/*.tsx' | xargs grep -nE '#[0-9a-fA-F]{3,6}\b|rgb\(|text-(blue|rose|purple|amber|emerald)-' || echo "no raw colours"
```
Expected: `no raw colours`. The existing `AskRevenactBox` palette classes were not touched in their lines; if grep shows them, confirm with `git diff main -- src/components/shared/AskRevenactBox.tsx` that none of those lines are new.

- [ ] **Step 2: Run both apps locally**

- Backend: check out the backend PR's branch in `../revenact-backend`, apply its migration and run it as its own plan's final task describes (API on `http://localhost:8000`).
- Frontend: `npm run dev` in this repo (Vite on `http://localhost:5173`), and sign in as a CSM with a book.

- [ ] **Step 3: Browser check (the spec's five steps, plus the layouts)**

Drive it with `npm run pw` (playwright-cli) or Claude in Chrome. At 1440×900:
1. `/dashboard/overview`: the rail is open with three suggestions. Click one. A "Thinking…" skeleton shows, then an answer that agrees with the attention list and headline cards on screen. The network tab shows `context` with `area:'overview', view:null`.
2. Set Primary Owner, then ask a follow-up. The new question's chip reads "Overview · Owner: <name>", the first question keeps "Overview", and the request's `filters.owner` is set.
3. `/dashboard/revenue/forecast`: open the At risk drill. It lies over the rail and the figures do not narrow. Click "Ask about these". The drill closes and the input holds "Why are these in At risk?" with a "· N accounts" chip. Send it, and the request carries `focus.kind:'companies'`.
4. Back on the Overview, click "Why?" on an attention row. It sends immediately with `focus.kind:'attention'`.
5. Open History. The conversation shows its origin tag. Go to another area, reopen it from History, and the URL returns to the area, view and filters it started on.

Then:
- At 1100 wide, the rail is a slim tab. Open it and reload; it stays open. Collapse it and reload; it stays collapsed.
- At 375 wide, an "Ask" button opens a full-screen sheet with focus in the input. Escape returns focus to the button. There is no horizontal scroll.
- Toggle dark mode, and check that the rail, chips, skeleton and origin tag use tokens in both modes.
- On `/communications`, pick a source and ask. The request body has the `[About: …]` prefix and no `context`. History shows the dashboard conversation with its tag and opens it here as plain text.
- To see the 429 path, exhaust the budget in the backend's Django shell (as its plan's test fixture does). The rail then says "This month's AI budget is used up." with no Retry.

Save screenshots at 1440, 1100 and 375 for the PR description.

- [ ] **Step 4: Record and stop**

Everything passes and the branch is ready for `superpowers:finishing-a-development-branch`. Do not push or open the PR until the backend PR is merged (spec §6).

---

## Spec coverage (self-review)

| Spec item | Task |
|---|---|
| §1 contract: optional `context`, echo, `origin`, 429 | 1, 3, 5 |
| §4 shared rail in `components/copilot`, `RailContext` union, Communications imports from there | 2 |
| Communications unchanged + regression test | 2 (and 5 for history) |
| Mounting `[scrolling content][AskRail]`, persists across areas, drill over rail | 7 |
| `useDashboardContext` from route + `SHARED_KEYS`, chip from option names, read at send time | 6, 7 |
| Each user message shows its own chip | 4, 7 |
| Collapse: xl default, slim tab, localStorage try/catch, phone sheet + focus | 7, 8 |
| History origin tag; restore by navigating; plain text elsewhere | 5, 9 |
| Entry points: drill "Ask about these", attention "Why?", suggestions | 10, 11, 4 |
| States: Thinking skeleton, 429, Retry keeping the question, sources, focus return | 3 |
| House rules (tokens, sizes, no card-in-card, states, names) | 2–11, checked in 14 |
| §5 frontend tests (each bullet) | 4, 5, 6, 7, 8, 9, 10, 11, 12 |
| Browser check (five steps) | 14 |
| Docs: app flow, UI/UX, repo architecture | 13 |
