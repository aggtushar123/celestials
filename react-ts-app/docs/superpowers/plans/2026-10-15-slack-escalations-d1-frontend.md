# Slack escalations, delivery 1 (frontend): Slack as a conversation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On an organisation's (and an account's) Story, a Slack thread shows under Conversations as "Slack thread · Faiz Jamal · via Slack" with its channel and reply count, and opens to the whole thread. "Needs a customer" shows the customers a Slack message mentions as chips that pick the record, and never offers to add a colleague as a contact. A Slack connection in Settings › Connections can be set to one customer ("Choose its customer"), and says which way it files messages.

**Architecture:** No new route in the app. `features/organizations/slackApi.ts` (the thread's type, one `apiFetch` wrapper, the "Filed under" sentence) and `components/organizations/detail/SlackThread.tsx` (a `Sheet` modelled on `EmailThread`), opened from `StoryItemRow` through `StoryTab` as the email thread is. The story's kind tables gain `slack`. `MatchDialog` gains a "Mentioned" row of `FilterChip`s that set the `RecordStep` choice; `unmatched.ts` reads the answer's `record`. `Integrations.tsx` gains `ChannelCustomerForm` (a `RecordStep` plus "Any customer the message names") behind a "Choose its customer" menu item on Slack connections, saving through `updateConnector` with `customer_ids` / `account_ids`.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), react-router 7, Redux Toolkit (`connectorsSlice` only), Tailwind v4 tokens, Vitest + Testing Library (jsdom) + user-event, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-15-slack-escalations-design.md` §3 (D1), §8 (D1 rows), §10 (the D1 row), §11 (LC-D1a to LC-D1c) and §15 (revisions), on this branch. **API contract (binding, read-only):** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/slackd1-be/docs/superpowers/plans/2026-10-15-slack-escalations-d1-api.md` (backend branch `feat/slack-escalations-d1`). Read its "Decisions narrowing the spec" first (SE1-1 to SE1-21); §3 (the story item), §4 (one thread), §5 (connect), §6 (Needs a customer) are the stubs' and types' source of truth. The R2-D3 frontend plan and its merged code (#147) hold the house style this plan extends.

## Global Constraints

- **Worktree and branch.** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/slackd1-fe`, branch `feat/slack-escalations-d1` (cut from `docs/slack-escalations-spec`, itself on main `6b28a86b`: R2-D3 #147 merged; its commits hold the spec, its §15 revision and this plan). Link `node_modules` once: `ln -s ../main-fe/node_modules node_modules` (never commit it). Always `git add <explicit paths>` (and `git rm` for deletions), never `git add -A` or `git add .`. Never merge, never open a PR, never touch the servers on ports 8000 or 5173 (the owner uses them; the by-eye run in Task 5 uses 8017 and 5187).
- **Never run prettier. Never use `git stash`** (the stash stack is shared across worktrees).
- **Commands** (foreground): `npx vitest run <path> --maxWorkers=2`, `npx vitest run --maxWorkers=2`, `npx tsc -b`, `npm run lint`, `npm run build`. CI is blocked by GitHub billing: these local checks are the gate. Every task ends with `npx tsc -b` clean as well as its tests.
- **Every commit message is a conventional commit and ends with exactly this line:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Contract shapes are binding.** Stubs answer exactly the contract's shapes and sentences; refusals are shown verbatim.
- **Tokens only** (`src/test/houseRules.ts` `RAW`): no hex, `rgb()`, named palette colours.
- **Type sizes 11/13/15 only**, through `TYPE.*`, `FIELD_ERROR`, `FORM_ALERT`; no `font-bold`, no `shadow-sm`/`shadow-md`, no `disabled:opacity-*`. **The UI ratchet** (`src/test/uiRatchet.test.ts`) ends each task with totals **equal** to `BASELINE`: new code adds zero offences (never raise a baseline).
- **Kinso look and the UI cleanup rules:** bordered quiet cards, flat `divide-y` rows, monochrome primary (`PRIMARY`), **one primary per surface**: the thread sheet has none (its "Open in Slack" is a `META_LINK`-style link); the match dialog keeps **Match** as its one primary (the Mentioned chips are `FilterChip`s); the channel customer form's **Save** is its one primary. Lucide icons only, each `aria-hidden="true"`; no emoji.
- **44px targets** on phones for every `<button>`, `<a>`, `<select>`, `<input>`: `BUTTON`, `PRIMARY`, `QUIET`, `INPUT`, `SELECT`, `META_LINK`, `FilterChip`, or a local `const` built from one.
- **No em dash (`—`) anywhere** in the files this plan creates or changes (comments and tests included), and in no new copy.
- **Copy:** sentence case, plain words; the contract's and this plan's sentences word for word; server sentences shown verbatim.
- **States:** the thread sheet has loading (`role="status"`, "Opening the Slack thread"), its read error (`role="alert"`, the server's sentence or "Could not open this Slack thread." with "Try again"), and gone ("This Slack thread is no longer available to you." on a 404). The channel customer form shows "Saving…" while it saves and the refusal under the field.
- **Motion:** none added.
- **Privacy:** the page shows only what the server sends: a Slack thread's text only from `GET /slack-conversations/<id>/` (which applies the record and department rules), "Mentioned" only the records the server names (SE1-12). No email of a colleague is shown anywhere new.
- **Testing:** unit + integration + e2e (jsdom, `src/e2e/`), only `fetch` stubbed with contract-shaped stubs and fake data. Never mock the store. Nothing real is sent.

## Decisions (frontend, where the spec and the contract leave a choice)

1. **The story row.** Kind `slack`: icon `MessagesSquare`, meta "Slack thread · Faiz Jamal · via Slack", title the top message's first line, summary "#all-alfiee · 2 replies" (the server's). The title is a button (`aria-haspopup="dialog"`) that opens the thread, exactly as an email with a thread. The Sources picker lists it as "Slack" under Conversations. Cost: trivial.
2. **The thread sheet** (`SlackThread`): title the thread's title, description "#all-alfiee · 3 messages"; one `<ol>` of messages oldest first, each the poster's name (`text-[13px] font-semibold`), the time (`text-[11px] text-ink-muted`, `NUM`), the text (`whitespace-pre-line break-words text-[13px]`); the bot's own messages carry a `Badge` "App"; then the "Filed under" line (`TYPE.meta`): "Filed under Globex (QA) because the message names it." / "…because the channel is set to it." / "Matched to Globex (QA) by hand." / nothing for `earlier`; then "Open in Slack" (external, `rel="noopener noreferrer"`, `ExternalLink` icon) when `url` is http(s). Cost: low.
3. **Mentioned chips** in "Match to a customer": when `item.mentioned` is not empty, a row "Mentioned" (`TYPE.meta` label) of `FilterChip`s, one per record, above the search; pressing one picks it (the `RecordStep` shows it chosen, `aria-pressed` on that chip); clearing the record unpresses it. A customer maps to `RecordRef` kind `organization`, an account to `account`. Cost: low.
4. **Contacts.** The dialog already hides the contact box when `can_add_contact` is false, which the server sends for every Slack row; nothing else changes. The toast reads `answer.record.name` ("Matched to Globex (QA). An agent reads it at the next run.") for both Slack and Jira. Cost: trivial.
5. **Choose its customer.** A Slack connection's menu (admins) gains "Choose its customer" (before "Change who sees it"). It opens `ChannelCustomerForm` in the row, like `DepartmentForm`: two radio options, "Any customer the message names" and "Always this customer:", the second enabling a `RecordStep` (heading "Customer or account"); **Save** (`PRIMARY`, "Saving…") sends `customer_ids: []` and `account_ids: []` for the first, or the one id for the second; Cancel (`QUIET`). A refusal shows under the form (`FIELD_ERROR`, `role="alert"`). Cost: low.
6. **How a Slack connection files messages**, in its meta line instead of "Reads …": "Files messages under Globex (QA)" when exactly one customer or account is set, "Files each message under the customer it names" when none (any other scope keeps today's "Reads …" words). Cost: trivial.
7. **Connect refusal.** "Invite the bot to #support first, then connect." comes back as the connect form's error, already shown verbatim by `ConnectSourceForm`; only a test is added. Cost: none.
8. **The mock** `components/organizations/activity/SlackTab.tsx` stays (spec §3.7 and §15.11: the legacy `shared/ActivityFeed.tsx` still references it; removing that feed is outside D1). Cost: none.

## File Structure

**Create**
- `src/features/organizations/slackApi.ts` (+ `slackApi.test.ts`): `SlackMessage`, `SlackConversationDetail`, `fetchSlackConversation(id)`, `filedText(detail)`, `SLACK` words.
- `src/features/organizations/testSlack.ts`: fixtures `SLACK_THREAD`, `SLACK_ITEM` and `stubSlackConversation(stub)`.
- `src/components/organizations/detail/SlackThread.tsx` (+ `.test.tsx`).
- `src/pages/integrations/ChannelCustomerForm.tsx` (+ `.test.tsx`).
- `src/e2e/slackConversations.test.tsx`.

**Modify**
- `src/features/organizations/storyTypes.ts` (`StoryKind` gains `'slack'`; `StoryItem.replies?: number`), `src/features/organizations/storyKinds.ts` (`STORY_KINDS`, `KIND_NAME`), `src/features/organizations/testStory.ts` (`by_kind` gains `slack: 0` wherever a full record is built).
- `src/components/organizations/detail/StoryItemRow.tsx` (icon; a `slack` item opens the thread), `StoryStream.tsx` and `StoryTab.tsx` (`onOpenSlack`, the sheet).
- `src/features/work/unmatched.ts` (`UnmatchedItem.mentioned`, `MatchAnswer`), `src/features/work/testUnmatched.ts` (Slack fixture and answers), `src/components/work/MatchDialog.tsx`, `src/components/work/NeedsCustomer.tsx` (toast).
- `src/features/connectors/connectorsSlice.ts` (`updateConnector` body gains `customer_ids?`, `account_ids?`), `src/pages/integrations/Integrations.tsx` (menu item, form, meta line).
- Docs (Task 5): `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`.

---

### Task 1: Types and the API

**Files:**
- Create: `src/features/organizations/slackApi.ts`, `src/features/organizations/slackApi.test.ts`, `src/features/organizations/testSlack.ts`
- Modify: `src/features/organizations/storyTypes.ts`, `src/features/organizations/storyKinds.ts`, `src/features/organizations/testStory.ts`, `src/features/work/unmatched.ts`, `src/features/work/testUnmatched.ts`

**Interfaces:**
- Produces (`storyTypes.ts`): `StoryKind` gains `'slack'`; `StoryItem.replies?: number` (a Slack item's replies).
- Produces (`storyKinds.ts`): `STORY_KINDS` gains `{ kind: 'slack', label: 'Slack', group: 'conversations' }` after `email`; `KIND_NAME.slack = 'Slack thread'`.
- Produces (`slackApi.ts`): `SlackMessage { ts: string; name: string; at: string; text: string; bot: boolean }`, `SlackConversationDetail { id: number; record: { type: 'customer' | 'account'; id: number; name: string }; channel: string; url: string; title: string; started_by: { id: number | null; name: string }; matched_by: 'channel' | 'name' | 'person' | 'earlier'; messages: SlackMessage[] }`, `fetchSlackConversation(id: number): Promise<SlackConversationDetail>`, `filedText(detail): string`, `SLACK` (words).
- Produces (`unmatched.ts`): `UnmatchedItem.mentioned: MentionedRecord[]` with `MentionedRecord { type: 'customer' | 'account'; id: number; name: string }`; `MatchAnswer { record: { type: 'customer' | 'account'; id: number; name: string }; ticket: { id: number; number: string; record: MatchAnswer['record'] } | null; conversation: { id: number } | null; contact_added: boolean }`.
- Produces (`testSlack.ts`): `SLACK_THREAD: SlackConversationDetail`, `SLACK_ITEM: StoryItem`, `stubSlackConversation({ detail?, status?, body? })`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/organizations/slackApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSlackConversation, filedText } from './slackApi';
import { SLACK_THREAD } from './testSlack';
import { KIND_GROUP, KIND_NAME, isStoryKind } from './storyKinds';

afterEach(() => vi.unstubAllGlobals());

describe('a Slack thread (Slack escalations D1 contract §4)', () => {
  it('reads one thread by id', async () => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => SLACK_THREAD }));
    vi.stubGlobal('fetch', spy);
    expect(await fetchSlackConversation(41)).toEqual(SLACK_THREAD);
    expect(new URL(String((spy.mock.calls[0] as unknown[])[0])).pathname).toBe('/api/v1/slack-conversations/41/');
  });

  it('says why it is filed where it is', () => {
    expect(filedText(SLACK_THREAD)).toBe('Filed under Globex (QA) because the message names it.');
    expect(filedText({ ...SLACK_THREAD, matched_by: 'channel' })).toBe('Filed under Globex (QA) because the channel is set to it.');
    expect(filedText({ ...SLACK_THREAD, matched_by: 'person' })).toBe('Matched to Globex (QA) by hand.');
    expect(filedText({ ...SLACK_THREAD, matched_by: 'earlier' })).toBe('');
  });

  it('is a story kind under Conversations', () => {
    expect(isStoryKind('slack')).toBe(true);
    expect(KIND_GROUP.slack).toBe('conversations');
    expect(KIND_NAME.slack).toBe('Slack thread');
  });
});
```

Add to `src/features/work/unmatched.test.ts`:

```ts
  it('reads the matched record from the answer for Slack and Jira alike', () => {
    expect(matchedText({ type: 'customer', id: 29, name: 'Globex (QA)' }.name)).toBe('Matched to Globex (QA). An agent reads it at the next run.');
  });
```

(`matchedText` keeps its `(name: string)` signature; this test pins the sentence while the caller changes in Task 3.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/organizations/slackApi.test.ts --maxWorkers=2`
Expected: FAIL: cannot resolve `./slackApi`.

- [ ] **Step 3: Types, words and fixtures**

`storyTypes.ts`: add `| 'slack'` to `StoryKind` (keep it sorted), and to `StoryItem`:

```ts
  /** A Slack thread's replies (kind `slack`); absent for anything else. */
  replies?: number;
```

`storyKinds.ts`: `{ kind: 'slack', label: 'Slack', group: 'conversations' },` after the `email` row; `slack: 'Slack thread',` in `KIND_NAME`; the comment above `STORY_KINDS` drops "Slack," from the kinds with no real data.

Create `src/features/organizations/slackApi.ts`:

```ts
// One Slack thread (Slack escalations D1 contract §4): read under the story's
// two rules (the record, then its department). Kept free of React. No em dash.
import { apiFetch } from '../../lib/apiClient';

export interface SlackMessage {
  ts: string;
  name: string;
  /** ISO 8601 UTC. */
  at: string;
  text: string;
  /** The app's own message (an agent's reply). */
  bot: boolean;
}

export interface SlackConversationDetail {
  id: number;
  record: { type: 'customer' | 'account'; id: number; name: string };
  /** "#all-alfiee", or '' when the channel has no name. */
  channel: string;
  url: string;
  title: string;
  started_by: { id: number | null; name: string };
  matched_by: 'channel' | 'name' | 'person' | 'earlier';
  messages: SlackMessage[];
}

export const fetchSlackConversation = (id: number) => apiFetch<SlackConversationDetail>(`/slack-conversations/${id}/`);

export const SLACK = {
  OPENING: 'Opening the Slack thread',
  LOAD: 'Could not open this Slack thread.',
  GONE: 'This Slack thread is no longer available to you.',
  RETRY: 'Try again',
  OPEN: 'Open in Slack',
  APP: 'App',
} as const;

/** Why the thread sits on its record (contract §4); '' for one filed before conversations. */
export function filedText(detail: SlackConversationDetail): string {
  const name = detail.record.name;
  if (detail.matched_by === 'channel') return `Filed under ${name} because the channel is set to it.`;
  if (detail.matched_by === 'name') return `Filed under ${name} because the message names it.`;
  if (detail.matched_by === 'person') return `Matched to ${name} by hand.`;
  return '';
}

/** "#all-alfiee · 3 messages". */
export function threadDescription(detail: SlackConversationDetail): string {
  const n = detail.messages.length;
  return [detail.channel, `${n} ${n === 1 ? 'message' : 'messages'}`].filter(Boolean).join(' · ');
}
```

Create `src/features/organizations/testSlack.ts`:

```ts
// Test-only: a Slack thread in the contract's shapes (Slack escalations D1 §3,
// §4) and a stub for GET /api/v1/slack-conversations/<id>/ that passes every
// other request on. Fake people and channels. No em dash.
import { vi } from 'vitest';
import type { SlackConversationDetail } from './slackApi';
import type { StoryItem } from './storyTypes';

export const SLACK_THREAD: SlackConversationDetail = {
  id: 41,
  record: { type: 'customer', id: 29, name: 'Globex (QA)' },
  channel: '#all-alfiee',
  url: 'https://slack.com/archives/C0CA7PPRP7A/p1792041415357099',
  title: 'Hi team, our CSV exports have been failing since this morning, urgent.',
  started_by: { id: null, name: 'Mohd faiz' },
  matched_by: 'name',
  messages: [
    { ts: '1792041415.357099', name: 'Mohd faiz', at: '2026-10-15T05:16:55Z', text: 'Hi team, our CSV exports have been failing since this morning, urgent. Can someone look?', bot: false },
    { ts: '1792041450.000100', name: 'Jesh', at: '2026-10-15T05:17:30Z', text: 'Looking now.', bot: false },
    { ts: '1792041500.000100', name: 'alfiee', at: '2026-10-15T05:18:20Z', text: 'Logged as KAN-2.', bot: true },
  ],
};

export const SLACK_ITEM: StoryItem = {
  id: 41,
  kind: 'slack',
  source: 'slack',
  occurred_at: '2026-10-15T05:18:20Z',
  all_day: false,
  account: null,
  title: SLACK_THREAD.title,
  summary: '#all-alfiee · 2 replies',
  actor: { id: null, name: 'Mohd faiz' },
  link: { thread_id: null, url: SLACK_THREAD.url },
  replies: 2,
};

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

export function stubSlackConversation(stub: { detail?: SlackConversationDetail; status?: number; body?: unknown; failFirst?: number } = {}) {
  const next = globalThis.fetch as unknown as Fetch;
  let failures = stub.failFirst ?? 0;
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname.replace(/^\/api\/v1/, '');
    if (/^\/slack-conversations\/\d+\/$/.test(path)) {
      if (failures > 0) {
        failures -= 1;
        return json(500, { detail: 'Down.' });
      }
      if (stub.status) return json(stub.status, stub.body ?? { detail: 'Not found.' });
      return json(200, stub.detail ?? SLACK_THREAD);
    }
    return next(input, init);
  });
  vi.stubGlobal('fetch', spy);
  return { spy };
}
```

`unmatched.ts`: add the types of **Interfaces** (`MentionedRecord`, `UnmatchedItem.mentioned`, the new `MatchAnswer`).

`testUnmatched.ts`: `ITEM_JIRA.mentioned = []`; `ITEM_SLACK` becomes the contract's Slack row: `number: '#support'`, `can_add_contact: false`, `priority: 'medium'`, `mentioned: [{ type: 'customer', id: 29, name: 'Globex (QA)' }, { type: 'customer', id: 30, name: 'Initech (QA)' }]`; the match stub answers contract §6: for a Slack row `{ record, ticket: null, conversation: { id: 900 + id }, contact_added: false }`, for a Jira row `{ record, ticket: { id: 800 + id, number: row.number, record }, conversation: null, contact_added }`, and a Slack row with `add_contact: true` answers `400 { add_contact: ['A Slack message is from a colleague. Match it without adding a contact.'] }`.

`testStory.ts`: wherever a `Record<StoryKind, number>` is built (`by_kind`), add `slack: 0` (let `npx tsc -b` find each).

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/features/organizations src/features/work --maxWorkers=2 && npx tsc -b`
Expected: PASS; `tsc` will flag every exhaustive `Record<StoryKind, …>` (for example `StoryItemRow`'s `ICON`): add `slack: MessagesSquare` there now (import from `lucide-react`), nothing else.

- [ ] **Step 5: Commit**

```bash
git add src/features/organizations/storyTypes.ts src/features/organizations/storyKinds.ts src/features/organizations/slackApi.ts src/features/organizations/slackApi.test.ts src/features/organizations/testSlack.ts src/features/organizations/testStory.ts src/features/work/unmatched.ts src/features/work/unmatched.test.ts src/features/work/testUnmatched.ts src/components/organizations/detail/StoryItemRow.tsx
git commit -m "feat(organizations): Slack threads as a story kind; the thread and match answer types

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Opening a Slack thread from the story

**Files:**
- Create: `src/components/organizations/detail/SlackThread.tsx`, `src/components/organizations/detail/SlackThread.test.tsx`
- Modify: `src/components/organizations/detail/StoryItemRow.tsx` (+ test), `StoryStream.tsx`, `StoryTab.tsx` (+ test)

**Interfaces:**
- Consumes: `fetchSlackConversation`, `filedText`, `threadDescription`, `SLACK` (Task 1).
- Produces: `SlackThread({ id, title, isSm, onClose })`; `StoryItemRow`'s and `StoryStream`'s prop `onOpenSlack: (item: StoryItem) => void`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/organizations/detail/SlackThread.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SlackThread } from './SlackThread';
import { SLACK_THREAD, stubSlackConversation } from '../../../features/organizations/testSlack';

afterEach(() => vi.unstubAllGlobals());

function open() {
  const onClose = vi.fn();
  render(<SlackThread id={41} title={SLACK_THREAD.title} isSm={false} onClose={onClose} />);
  return { onClose };
}

describe('SlackThread (Slack escalations D1 Decision 2)', () => {
  it('shows every message oldest first, the app marked, and why it is filed here', async () => {
    stubSlackConversation();
    open();
    const list = await screen.findByRole('list');
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((r) => within(r).getByText(/Mohd faiz|Jesh|alfiee/).textContent)).toEqual(['Mohd faiz', 'Jesh', 'alfiee']);
    expect(within(rows[2]).getByText('App')).toBeInTheDocument();
    expect(screen.getByText('#all-alfiee · 3 messages')).toBeInTheDocument();
    expect(screen.getByText('Filed under Globex (QA) because the message names it.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open in Slack/ })).toHaveAttribute('href', SLACK_THREAD.url);
  });

  it('says so when the thread is gone for this reader', async () => {
    stubSlackConversation({ status: 404 });
    open();
    expect(await screen.findByText('This Slack thread is no longer available to you.')).toBeInTheDocument();
  });

  it('offers Try again after a failed read', async () => {
    stubSlackConversation({ failFirst: 1 });
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Down.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Looking now.')).toBeInTheDocument();
  });
});
```

Add to `StoryItemRow.test.tsx` (render it as that file does):

```tsx
  it('opens a Slack thread from its title', async () => {
    const onOpenSlack = vi.fn();
    renderRow({ item: SLACK_ITEM, onOpenSlack });
    expect(screen.getByText('Slack thread · Mohd faiz · via Slack')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: SLACK_ITEM.title }));
    expect(onOpenSlack).toHaveBeenCalledWith(SLACK_ITEM);
  });
```

(Read the file's render helper first: `sed -n 1,40p src/components/organizations/detail/StoryItemRow.test.tsx`; pass `onOpenSlack` the way it passes `onOpenEmail`.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/organizations/detail/SlackThread.test.tsx src/components/organizations/detail/StoryItemRow.test.tsx --maxWorkers=2`
Expected: FAIL: cannot resolve `./SlackThread`.

- [ ] **Step 3: The sheet and the wiring**

Create `src/components/organizations/detail/SlackThread.tsx`, on `EmailThread.tsx`'s pattern (same `Load` state keyed by attempt, same loading and error blocks, same `Sheet`):

```tsx
import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { ApiError } from '../../../lib/apiClient';
import { fetchSlackConversation, filedText, SLACK, threadDescription, type SlackConversationDetail } from '../../../features/organizations/slackApi';
import { errorMessage } from '../portfolio/usePortfolio';
import { Badge, NUM, QUIET, TYPE } from '../../ui';
import { Sheet } from './Sheet';

type Load = { key: string; detail: SlackConversationDetail } | { key: string; gone: true } | { key: string; error: string };

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

const OPEN_LINK = 'mt-1 inline-flex min-h-11 items-center gap-1 rounded-sm text-[13px] font-semibold text-ink underline sm:min-h-9';

/** One Slack thread (Slack escalations D1 Decision 2): every message oldest
 *  first, the app's own marked, why it is filed here, and Open in Slack. */
export function SlackThread({ id, title, isSm, onClose }: { id: number; title: string; isSm: boolean; onClose: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const key = `${id}#${attempt}`;
  const [load, setLoad] = useState<Load | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSlackConversation(id).then(
      (detail) => {
        if (!cancelled) setLoad({ key, detail });
      },
      (err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setLoad({ key, gone: true });
        else setLoad({ key, error: errorMessage(err, SLACK.LOAD) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, key]);

  const current = load && load.key === key ? load : null;
  const detail = current && 'detail' in current ? current.detail : null;
  const filed = detail ? filedText(detail) : '';

  return (
    <Sheet title={detail?.title ?? title} description={detail ? threadDescription(detail) : undefined} isSm={isSm} onClose={onClose}>
      {!current ? (
        <div role="status" aria-label={SLACK.OPENING} className="flex flex-col gap-2 py-3">
          <span aria-hidden="true" className="block h-3 w-32 animate-pulse rounded bg-subtle" />
          <span aria-hidden="true" className="block h-3 w-full animate-pulse rounded bg-subtle" />
        </div>
      ) : 'error' in current ? (
        <div role="alert" className="flex flex-col items-start gap-2 py-3">
          <p className="text-[13px] text-danger">{current.error}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${QUIET} border border-line`}>
            {SLACK.RETRY}
          </button>
        </div>
      ) : 'gone' in current ? (
        <p className="py-3 text-[13px] text-ink-muted">{SLACK.GONE}</p>
      ) : detail ? (
        <>
          <ol className="flex flex-col divide-y divide-line-subtle">
            {detail.messages.map((m) => (
              <li key={m.ts} className="py-3">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                  <span>{m.name || 'Someone'}</span>
                  {m.bot ? <Badge>{SLACK.APP}</Badge> : null}
                </p>
                <p className="text-[11px] text-ink-muted">
                  <time dateTime={m.at} className={NUM}>
                    {when(m.at)}
                  </time>
                </p>
                <p className="mt-2 whitespace-pre-line break-words text-[13px] text-ink">{m.text}</p>
              </li>
            ))}
          </ol>
          {filed ? <p className={`mt-2 ${TYPE.meta}`}>{filed}</p> : null}
          {/^https?:\/\//i.test(detail.url) ? (
            <a href={detail.url} target="_blank" rel="noopener noreferrer" className={OPEN_LINK}>
              {SLACK.OPEN}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}
```

(Check `OPEN_LINK` against the ratchet and the focus ring: reuse `StoryItemRow`'s `LINK` constant by exporting it from `StoryItemRow.tsx` if the ratchet flags a new raw class string.)

`StoryItemRow.tsx`: the props become `{ item, onOpenEmail, onOpenSlack }` (`onOpenSlack: (item: StoryItem) => void`); `const threaded = (item.kind === 'email' && Boolean(item.link.thread_id)) || item.kind === 'slack';` and the title button calls `item.kind === 'slack' ? onOpenSlack(item) : onOpenEmail(item)`.

`StoryStream.tsx`: thread `onOpenSlack` through `Day` and `StoryStream` exactly as `onOpenEmail`.

`StoryTab.tsx`: `const [slack, setSlack] = useState<StoryItem | null>(null);`, closed with the others when the tab is hidden; `onOpenSlack={setSlack}` on `StoryStream`; and

```tsx
      {active && slack ? <SlackThread id={slack.id} title={slack.title} isSm={isSm} onClose={() => setSlack(null)} /> : null}
```

Add to `StoryTab.test.tsx` one case: a story with `SLACK_ITEM` (stub with `stubSlackConversation` composed over the story stub), clicking its title opens the sheet with "Looking now.", Escape closes it.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/components/organizations --maxWorkers=2 && npx tsc -b && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS; ratchet equal to `BASELINE`.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/SlackThread.tsx src/components/organizations/detail/SlackThread.test.tsx src/components/organizations/detail/StoryItemRow.tsx src/components/organizations/detail/StoryItemRow.test.tsx src/components/organizations/detail/StoryStream.tsx src/components/organizations/detail/StoryTab.tsx src/components/organizations/detail/StoryTab.test.tsx
git commit -m "feat(organizations): open a Slack thread from the story

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Mentioned customers in "Match to a customer"

**Files:**
- Modify: `src/components/work/MatchDialog.tsx` (+ test), `src/components/work/NeedsCustomer.tsx` (+ test)

**Interfaces:**
- Consumes: `UnmatchedItem.mentioned`, `MatchAnswer.record` (Task 1).

- [ ] **Step 1: Write the failing tests**

Add to `src/components/work/MatchDialog.test.tsx` (render as that file does):

```tsx
  it('offers the customers a Slack message mentions, and picking one chooses it', async () => {
    stubUnmatched({ items: [ITEM_SLACK] });
    const onMatched = vi.fn();
    renderDialog({ item: ITEM_SLACK, onMatched });
    const globex = screen.getByRole('button', { name: 'Globex (QA)' });
    expect(globex).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(globex);
    expect(globex).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(); // no contact box for Slack
    await userEvent.click(screen.getByRole('button', { name: 'Match' }));
    expect(onMatched).toHaveBeenCalledWith(expect.objectContaining({ record: { type: 'customer', id: 29, name: 'Globex (QA)' }, ticket: null }));
  });

  it('has no Mentioned row when nothing is mentioned', () => {
    renderDialog({ item: ITEM_JIRA });
    expect(screen.queryByText('Mentioned')).not.toBeInTheDocument();
  });
```

Add to `NeedsCustomer.test.tsx`: matching the Slack row through the dialog shows the toast "Matched to Globex (QA). An agent reads it at the next run." and the row leaves the list.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/work/MatchDialog.test.tsx src/components/work/NeedsCustomer.test.tsx --maxWorkers=2`
Expected: FAIL: no button named "Globex (QA)"; the toast reads `answer.ticket.record`.

- [ ] **Step 3: The chips and the toast**

In `MatchDialog.tsx`, above `<RecordStep …>`:

```tsx
        {item.mentioned.length ? (
          <div className="flex flex-col gap-1.5">
            <p id={mentionedId} className={TYPE.meta}>
              {UNMATCHED.MENTIONED}
            </p>
            <div role="group" aria-labelledby={mentionedId} className="flex flex-wrap gap-2">
              {item.mentioned.map((m) => {
                const kind = m.type === 'customer' ? 'organization' : 'account';
                const pressed = record?.kind === kind && record.id === m.id;
                return (
                  <FilterChip
                    key={`${m.type}:${m.id}`}
                    label={m.name}
                    pressed={pressed}
                    onToggle={() => {
                      setRecord(pressed ? null : { kind, id: m.id, name: m.name });
                      setRecordError(undefined);
                    }}
                  />
                );
              })}
            </div>
          </div>
        ) : null}
```

with `const mentionedId = useId();`, `FilterChip` imported from `../ui`, and `MENTIONED: 'Mentioned'` added to `UNMATCHED` in `unmatched.ts`. The dialog's doc comment gains "A Slack message's mentioned customers are chips that pick the record (Slack escalations D1 Decision 3)."

In `NeedsCustomer.tsx`: `onToast(matchedText(answer.record.name));`.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/components/work src/features/work --maxWorkers=2 && npx tsc -b && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS; ratchet equal to `BASELINE`.

- [ ] **Step 5: Commit**

```bash
git add src/components/work/MatchDialog.tsx src/components/work/MatchDialog.test.tsx src/components/work/NeedsCustomer.tsx src/components/work/NeedsCustomer.test.tsx src/features/work/unmatched.ts
git commit -m "feat(work): pick a mentioned customer when matching a Slack message

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Choose a Slack connection's customer

**Files:**
- Create: `src/pages/integrations/ChannelCustomerForm.tsx`, `src/pages/integrations/ChannelCustomerForm.test.tsx`
- Modify: `src/features/connectors/connectorsSlice.ts` (`updateConnector`'s argument type), `src/pages/integrations/Integrations.tsx` (menu item, the form, `scopeLabel`), `src/pages/integrations/Integrations.test.tsx`

**Interfaces:**
- Consumes: `updateConnector`, `RecordStep`, `RecordRef`.
- Produces: `ChannelCustomerForm({ connector, onDone })`; `updateConnector` accepts `{ id; is_enabled?; department?; customer_ids?: number[]; account_ids?: number[] }`; `slackScopeLabel(connector): string | null`.

- [ ] **Step 1: Write the failing tests**

Create `src/pages/integrations/ChannelCustomerForm.test.tsx` (store and stubs as `Integrations.test.tsx` builds them: copy its `slack` connector fixture shape, `provider: 'slack'`, `setup: slackSetup`, `has_credentials: true`):

```tsx
describe('ChannelCustomerForm (Slack escalations D1 Decision 5)', () => {
  it('sets the connection to one customer', async () => {
    const { spy } = stubConnectorsPatch(); // answers PATCH /connectors/7/ with the body applied
    const onDone = vi.fn();
    renderForm({ connector: slackConnector, onDone });
    await userEvent.click(screen.getByRole('radio', { name: 'Always this customer:' }));
    await pickRecord('Globex (QA)'); // through RecordStep's search, stubbed as Work's New task tests do
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(bodyOf(spy)).toEqual({ customer_ids: [29], account_ids: [] });
    expect(onDone).toHaveBeenCalled();
  });

  it('goes back to finding the customer by name', async () => {
    const { spy } = stubConnectorsPatch();
    renderForm({ connector: { ...slackConnector, customers: [{ id: 29, name: 'Globex (QA)' }], is_organisation_wide: false } });
    expect(screen.getByRole('radio', { name: 'Always this customer:' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Any customer the message names' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(bodyOf(spy)).toEqual({ customer_ids: [], account_ids: [] });
  });

  it('asks for a customer before saving "always"', async () => {
    renderForm({ connector: slackConnector });
    await userEvent.click(screen.getByRole('radio', { name: 'Always this customer:' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a customer or account first.');
  });

  it('shows a refusal under the form', async () => {
    stubConnectorsPatch({ status: 400, body: { customer_ids: ['Every linked organization must be in your own organisation.'] } });
    renderForm({ connector: slackConnector });
    await userEvent.click(screen.getByRole('radio', { name: 'Always this customer:' }));
    await pickRecord('Globex (QA)');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Every linked organization must be in your own organisation.');
  });
});
```

(`stubConnectorsPatch`, `renderForm`, `pickRecord` and `bodyOf` are local helpers of this test file: write them on the pattern of the `DepartmentForm` tests in `Integrations.test.tsx` and of `src/components/plans/RecordStep.test.tsx`'s search stub; find them with `grep -n "Change who sees it" -A30 src/pages/integrations/Integrations.test.tsx | head -60` and `grep -rn "searchPlanRecords\|/plans/records" src/components/plans/*.test.tsx | head -3`.)

Add to `Integrations.test.tsx`:
- a Slack connection with no customers shows "Files each message under the customer it names"; with `customers: [{ id: 29, name: 'Globex (QA)' }]` shows "Files messages under Globex (QA)";
- its menu (admin) holds "Choose its customer"; a Zendesk connection's does not;
- connecting a Slack connection whose stub answers `400 { detail: 'Invite the bot to #support first, then connect.' }` shows that sentence under the connect form.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/integrations --maxWorkers=2`
Expected: FAIL: cannot resolve `./ChannelCustomerForm`; the meta line still reads "Reads all organizations".

- [ ] **Step 3: The form, the menu item and the words**

`connectorsSlice.ts`: `updateConnector`'s argument type gains `customer_ids?: number[]; account_ids?: number[]` (the body is spread unchanged).

Create `src/pages/integrations/ChannelCustomerForm.tsx`:

```tsx
import { useEffect, useId, useState, type FormEvent } from 'react';
import type { Connector } from '../../features/connectors/connectorsSlice';
import { updateConnector } from '../../features/connectors/connectorsSlice';
import type { RecordRef } from '../../features/plans/planTypes';
import { useAppDispatch } from '../../app/hooks';
import { RecordStep } from '../../components/plans/RecordStep';
import { FIELD_ERROR, PRIMARY, QUIET, TYPE } from '../../components/ui';

const ANY = 'Any customer the message names';
const ONE = 'Always this customer:';
const PICK = 'Choose a customer or account first.';

function current(connector: Connector): RecordRef | null {
  if (connector.customers.length === 1 && connector.accounts.length === 0) return { kind: 'organization', ...connector.customers[0] };
  if (connector.accounts.length === 1 && connector.customers.length === 0) return { kind: 'account', ...connector.accounts[0] };
  return null;
}

/** "Choose its customer" (Slack escalations D1 Decision 5): a Slack
 *  connection files every message under one record, or finds the customer
 *  each message names. Saves the connection's scope (`customer_ids`,
 *  `account_ids`), which the server already takes. */
export function ChannelCustomerForm({ connector, onDone }: { connector: Connector; onDone: () => void }) {
  const dispatch = useAppDispatch();
  const start = current(connector);
  const [mode, setMode] = useState<'any' | 'one'>(start ? 'one' : 'any');
  const [record, setRecord] = useState<RecordRef | null>(start);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const name = useId();
  const anyId = `${name}-any`;

  useEffect(() => {
    document.getElementById(anyId)?.focus();
  }, [anyId]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (mode === 'one' && !record) return setRefused(PICK);
    setBusy(true);
    setRefused(null);
    const scope =
      mode === 'any' || !record
        ? { customer_ids: [], account_ids: [] }
        : record.kind === 'organization'
          ? { customer_ids: [record.id], account_ids: [] }
          : { customer_ids: [], account_ids: [record.id] };
    const result = await dispatch(updateConnector({ id: connector.id, ...scope }));
    setBusy(false);
    if (updateConnector.fulfilled.match(result)) onDone();
    else setRefused(result.payload ?? 'Could not change its customer.');
  }

  return (
    <form onSubmit={save} aria-label={`Choose the customer of ${connector.name}`} className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className={`${TYPE.body} font-semibold`}>Which customer its messages go under</legend>
        <label className={`flex min-h-11 items-center gap-2 sm:min-h-9 ${TYPE.body}`}>
          <input id={anyId} type="radio" name={name} checked={mode === 'any'} onChange={() => setMode('any')} />
          {ANY}
        </label>
        <label className={`flex min-h-11 items-center gap-2 sm:min-h-9 ${TYPE.body}`}>
          <input type="radio" name={name} checked={mode === 'one'} onChange={() => setMode('one')} />
          {ONE}
        </label>
      </fieldset>
      {mode === 'one' ? (
        <RecordStep heading="Customer or account" record={record} locked={false} loading={false} onPick={(next) => { setRecord(next); setRefused(null); }} onClear={() => setRecord(null)} />
      ) : null}
      {refused ? (
        <p role="alert" className={FIELD_ERROR}>
          {refused}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onDone} className={QUIET}>
          Cancel
        </button>
        <button type="submit" aria-disabled={busy || undefined} className={PRIMARY}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
```

(Check the hooks import path: `grep -rn "useAppDispatch" src/pages/integrations/Integrations.tsx | head -2`. The radios get the same `FOCUS` ring as the page's other inputs if the ratchet asks: `import { FOCUS } from '../../components/ui'`.)

`Integrations.tsx`:

1. Words:

```ts
/** How a Slack connection files messages (Slack escalations D1 Decision 6). */
export function slackScopeLabel(c: Connector): string | null {
  if (c.provider !== 'slack') return null;
  if (c.is_organisation_wide) return 'Files each message under the customer it names';
  const one = c.customers.length + c.accounts.length === 1 ? (c.customers[0] ?? c.accounts[0]) : null;
  return one ? `Files messages under ${one.name}` : null;
}
```

and in `ConnectorRow`'s meta parts, `slackScopeLabel(connector) ?? scopeLabel(connector)`.

2. `ConnectorRow` gains `const [choosingCustomer, setChoosingCustomer] = useState(false);`, counts it in `formShowing`, returns focus to the menu after it closes as "Change who sees it" does (`whoClosed`), and the menu gains, before the department item:

```ts
        ...(connector.provider === 'slack' && isSource && !choosingCustomer
          ? [
              {
                key: 'customer',
                label: 'Choose its customer',
                onSelect: () => {
                  onToggle(false);
                  setChangingWho(false);
                  setChoosingCustomer(true);
                },
              },
            ]
          : []),
```

rendering, beside `DepartmentForm`:

```tsx
      {canManage && choosingCustomer && !open ? (
        <ChannelCustomerForm
          connector={connector}
          onDone={() => {
            whoClosed.current = true;
            setChoosingCustomer(false);
          }}
        />
      ) : null}
```

(Opening "Change who sees it" sets `setChoosingCustomer(false)` too, so one form shows at a time.)

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/pages/integrations src/features/connectors --maxWorkers=2 && npx tsc -b && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS; ratchet equal to `BASELINE`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/integrations/ChannelCustomerForm.tsx src/pages/integrations/ChannelCustomerForm.test.tsx src/pages/integrations/Integrations.tsx src/pages/integrations/Integrations.test.tsx src/features/connectors/connectorsSlice.ts
git commit -m "feat(integrations): choose a Slack connection's customer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Journeys, docs, the full check and by eye

**Files:**
- Create: `src/e2e/slackConversations.test.tsx`
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`

- [ ] **Step 1: The journeys**

Create `src/e2e/slackConversations.test.tsx` on the pattern of `src/e2e/organizationDetail.test.tsx` and `src/e2e/round2Intake.test.tsx` (read their setup first). With `stubOrganizationPage`, `stubSlackConversation` and `stubUnmatched` composed:

1. On Globex (QA)'s page, Conversations lists the Slack item ("Slack thread · Mohd faiz · via Slack", "#all-alfiee · 2 replies"); Tickets does not; opening it shows the three messages, "App" on alfiee's, "Filed under Globex (QA) because the message names it.", and "Open in Slack"; Escape closes it and focus returns to the title.
2. In Work's Unassigned queue (as an admin), the Slack row shows "#support" in its meta, no contact box in its dialog, "Mentioned" with Globex (QA) and Initech (QA); picking Globex (QA) and Match shows "Matched to Globex (QA). An agent reads it at the next run.".
3. In Settings › Connections, the Slack connection reads "Files each message under the customer it names"; "Choose its customer" › "Always this customer:" › Globex (QA) › Save; the row then reads "Files messages under Globex (QA)".

Run: `npx vitest run src/e2e/slackConversations.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 2: The docs**

- `docs/03-ui-ux-design.md`: the Slack story row and thread sheet (Decisions 1, 2), Mentioned chips (Decision 3), "Choose its customer" and the Slack meta line (Decisions 5, 6).
- `docs/04-app-flow.md`: a colleague's Slack message becomes a conversation on the customer it names (or the channel's), waits in Needs a customer when unclear, and is matched from there; setting a channel to one customer.
- `.agents/workflows/repo-architecture.md`: `features/organizations/slackApi.ts`, `testSlack.ts`, `SlackThread.tsx`, `pages/integrations/ChannelCustomerForm.tsx`.

- [ ] **Step 3: The full check**

```bash
npx vitest run --maxWorkers=2
npx tsc -b
npm run lint
npm run build
npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2
grep -rn "—" src/features/organizations/slackApi.ts src/features/organizations/testSlack.ts src/components/organizations/detail/SlackThread.tsx src/pages/integrations/ChannelCustomerForm.tsx src/e2e/slackConversations.test.tsx || echo "no em dash"
```

Expected: every test passes (write the count into the hand-off), `tsc` clean, lint clean, build OK, ratchet totals equal to `BASELINE`, "no em dash".

- [ ] **Step 4: By eye, on a database copy, in the Alfee workspace, with fake credentials**

Nothing real is sent, nothing is synced from a real Slack or Jira, and no model is called.

1. **Copy the dev database** (read only on `revenact`): `createdb -T revenact revenact_slackd1` (stop if `revenact` has open connections; ask the controller to pause the owner's servers rather than force it). Migrate the copy only, from the backend worktree `slackd1-be` at its head: `DATABASE_URL=postgres:///revenact_slackd1 venv/bin/python manage.py migrate` (this runs the Slack-ticket migration on the copy: ticket 738 becomes a conversation, which is LC-D1a's by-eye half).
2. **Make it safe**, in a `manage.py shell` against `DATABASE_URL=postgres:///revenact_slackd1`: every `MailboxConnection` blanked (`credentials=''`); every `Connector` credential set to fakes (Slack `{"bot_token": "xoxb-fake"}`; Jira `api_token: fake`, host `revenact-qa-nonexistent.atlassian.net`); every `JiraLink` deleted; the AI provider and AWS keys overridden with fakes in the server's env (`COPILOT_LLM_PROVIDER` pointed at nothing usable), and `HTTPS_PROXY=http://127.0.0.1:9` (a dead proxy) so no outside call can leave. Do **not** run `sync_tickets` or `run_agent_signals` against the copy.
3. **Seed, in the Alfee workspace** of the copy (organisation of `tushar@alfee.io`; Faiz `faiz@alfee.io` and Jesh `jesh@alfee.io` are CSMs reporting to Tushar): set a QA password on the three users in the copy only (`user.set_password(...)`); on Slack connection 7 create, with `SlackConversation.objects.create(...)`, a conversation on Globex (QA) with 3 messages (one `bot: true`, one 1,500 characters long), one on Initech (QA) filed `matched_by="channel"`, and one on Globex filed by hand; create 2 waiting Slack `UnmatchedItem`s (one with `candidates` naming Globex (QA) and Initech (QA), one with none) and keep R2-D3's Jira ones if the copy has them.
4. **Servers:** backend on :8017 (`slackd1-be`, `DATABASE_URL` the copy, the env of step 2), Vite on :5187 (`VITE_API_URL=http://localhost:8017`).
5. **Check in Chrome** (playwright-cli), 1440x900 and 390x844, light and dark:
   - as **Tushar** (admin): Globex (QA) › Story › Conversations: the migrated SL-15357099 thread and the seeded ones; Tickets has no Slack item; open each: messages, "App", the long text wraps, the "Filed under" line for each `matched_by` (none for the migrated one), "Open in Slack" (do not follow it); the Sources picker lists Slack; search finds a thread by channel name;
   - Work › Unassigned: the two Slack rows ("#all-alfiee" in the meta), "Mentioned" chips on one, none on the other, no contact box; match one with a chip (this writes only to the copy), the other through search;
   - Settings › Connections: the Slack row's "Files each message under the customer it names"; "Choose its customer" to Globex (QA) and back; "Change who sees it" and "Choose its customer" never open together; focus returns to the menu;
   - as **Faiz**: the same Globex threads (department empty means everyone), no "Choose its customer" (not an admin).
6. Write findings to the scratchpad (`slackd1-fe-byeye/findings.md`) with screenshots; fix should-fix items test first; stop the servers; leave `revenact_slackd1` for the owner to drop.

- [ ] **Step 5: Commit and push**

```bash
git add src/e2e/slackConversations.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "test(e2e): Slack conversation journeys; docs for Slack threads, mentioned customers and a channel's customer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push origin feat/slack-escalations-d1
```

Hand-off (to the controller, not a PR): the head, the vitest count, the by-eye findings, and anything the backend's "Changes during the build" changed.

---

## Self-review

1. **Contract coverage.** §3 the story item (kind, summary, replies, actor, search): Tasks 1, 2; §4 one thread (shape, 404): Tasks 1, 2; §5 connect's refusal: Task 4 (test only, Decision 7); §6 Needs a customer (`mentioned`, `can_add_contact: false`, the match answer with `record` / `conversation`, the Slack contact refusal): Tasks 1, 3; §8 privacy by showing only what the server sends; §12 the owner's set-up ("Choose its customer"): Task 4.
2. **Placeholders.** Code steps hold their code where the shape is new (`slackApi.ts`, `testSlack.ts`, `SlackThread.tsx`, `ChannelCustomerForm.tsx`, the chips, the menu item, the tests). Steps that extend an existing test file name the file and the `grep` that shows its helpers; the journeys say exactly what each asserts.
3. **Type consistency.** `SlackConversationDetail` (Task 1) is what `SlackThread` (Task 2) reads; `StoryKind 'slack'` and `StoryItem.replies` (Task 1) are what `StoryItemRow` (Task 2) and `testSlack.ts` use; `MentionedRecord` and `MatchAnswer.record` (Task 1) are what `MatchDialog` and `NeedsCustomer` (Task 3) read; `updateConnector`'s `customer_ids` / `account_ids` (Task 4) are what `ChannelCustomerForm` sends.
