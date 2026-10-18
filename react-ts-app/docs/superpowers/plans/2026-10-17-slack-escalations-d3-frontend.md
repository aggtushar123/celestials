# Slack escalations, delivery 3 (frontend): every public channel syncs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Settings › Connections, the workspace's Slack connection says how many public channels it syncs ("syncs 12 of 14 public channels") and offers **Choose channels**: whether Slack's events arrive ("Events: receiving. The last one arrived 5 minutes ago." or "Events: not set up. ..."), then every public channel, each with a Sync switch (on by default, off for Slack Connect), its state (joined, joins on the next sync, Slack wouldn't let it join, someone removed Revenact, shared with another company) and **its customer** (the one each message names, or always one organisation or account). When Slack hasn't granted `channels:join` yet, the panel says so and offers to approve the app again.

**Architecture:** One pure module `features/connectors/slackChannels.ts` (types, the two API calls, words, the row's meta line, the refusal reader) and one component `components/integrations/SlackChannelsPanel.tsx` (load, filter, switch, customer). D1's `ChannelCustomerForm` is generalised to choose the record of anything (a channel now) and reused per row. `WorkspaceToolRow` swaps "Choose its customer" for "Choose channels" and reads the connection's new `slack_channels` counts. No slice: the panel owns its list (as D2's `useMembers` pages do).

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), Redux Toolkit (the existing connectors slice only), Tailwind v4 tokens, Vitest + Testing Library (jsdom) + user-event, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-15-slack-escalations-design.md` **§16.1** and **§16.4** (the Events API revision, 2026-10-17), §10 (D3 row), §11 (LC-D3a to d), on this branch. **API contract (binding, read-only):** `/Users/tusharaggarwal/Desktop/Projects/Revenact/revenact-backend-slackd3/docs/superpowers/plans/2026-10-17-slack-escalations-d3-api.md` (backend branch `feat/slack-escalations-d3`). Read its decisions SC3-1 to SC3-31 first (the backend now files messages from Slack's Events API and polls only as a slow catch-up; SC3-30 is the events line this plan shows); §2 (shapes) and §3 (the two routes and every refusal) are the stubs' and types' source of truth. Its "Changes during the build" binds too: read it again before Task 5.

This plan replaces the D3 frontend plans written earlier on 2026-10-17 (the escalation bundle, then the polling version). The only screen changes from the polling version: the events line (Decision 7), `events_at` in the types and stubs, the "removed" meta, and the by-eye check posting signed fake events. Nothing here depends on D4 (`feat/slack-escalations-d4`, worktree `react-ts-app-slackd4`, being built now; it touches the Work panel, not Settings). **The build starts from current `origin/main`** (`git fetch origin && git rebase origin/main` before Task 1); if D4's frontend merged before this PR, rebase onto it again before the PR (no shared files expected; resolve any conflict keeping both).

## What exists

| Piece | State | Here |
|---|---|---|
| Settings › Connections › Workspace › Slack row (`components/integrations/WorkspaceToolRow.tsx`): Connect, Sync now, the menu (Reconnect, Choose its customer, Change who sees it, Disable, Disconnect), the state line (`stateOf`, `slackScope`) | exists | the menu's "Choose its customer" becomes "Choose channels"; the state line reads `slack_channels` (Task 4) |
| "Choose its customer" (`pages/integrations/ChannelCustomerForm.tsx`, D1): any customer the message names, or always one record (`RecordStep` search) | exists | generalised to choose any one thing's record (Task 2), used per channel (Task 3) |
| The connect form (`ConnectSourceForm.tsx`) draws the server's `setup.fields` | exists | unchanged: without a `channel` field it asks for the token alone (SC3-13) |
| `Switch`, `SearchInput`, `LoadingState`, `EmptyState`, `ErrorState`, `QUIET`, `FIELD_ERROR`, `TYPE` (`components/ui`) | exist | the panel's parts |

## Global Constraints

- **Worktree and branch.** `/Users/tusharaggarwal/Desktop/Projects/Revenact/react-ts-app-slackd3`, branch `feat/slack-escalations-d3` (from main `f44f679f`; its commits hold the spec revision and this plan). Link `node_modules` once: `ln -s ../react-ts-app-main/node_modules node_modules` (never commit it). Always `git add <explicit paths>`. Never merge, never open a PR, never touch `react-ts-app/` or `react-ts-app-main/`, never touch the servers on ports 8000 or 5173 (the by-eye run in Task 5 uses 8019 and 5189).
- **D4 is being built now** (`feat/slack-escalations-d4`: the Work panel). Never touch `react-ts-app-slackd4/` or `revenact-backend-slackd4/`. The two touch different files; whichever merges second rebases.
- **Never run prettier. Never use `git stash`.**
- **Commands** (foreground): `npx vitest run <path> --maxWorkers=2`, `npx vitest run --maxWorkers=2`, `npx tsc -b`, `npm run lint`, `npm run build`. CI is blocked by GitHub billing: these local checks are the gate. Every task ends with `npx tsc -b` clean as well as its tests.
- **Every commit message is a conventional commit and ends with exactly this line:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Contract shapes are binding.** Stubs answer exactly the contract's shapes and sentences; server refusals are shown verbatim. The connector's `slack_channels` is optional in the type: an older backend leaves the row as today (D1's state line).
- **Load `revenact-design` first**: Kinso look, tokens only, monochrome primary, four type sizes through `TYPE.*`, `FIELD_ERROR`, `FORM_ALERT`; weights 400 and 600 only. **The UI ratchet** (`src/test/uiRatchet.test.ts`) ends each task with totals **equal** to `BASELINE`: new code adds zero offences; if a task removes offences, lower the baseline to match (the ratchet's own "keeps every baseline tight" test asks for that).
- **Kinso look and the UI cleanup rules:** the panel is a bordered quiet list inside the row (`divide-y`), never a card in a card; ` · ` between meta items; one primary per surface (the panel's only primary is the open customer form's Save; the switches and the other buttons are quiet). Lucide icons only, `aria-hidden="true"`.
- **44px targets** on phones: `Switch` (`min-h-11`), `QUIET`, `SearchInput`, the row's Customer button.
- **No em dash (`—`)** in any file this plan creates or changes, nor in new copy. **Copy:** sentence case, plain words, word for word as this plan gives it; the product's name in copy is unchanged ("Revenact", spec decision 8).
- **States:** loading ("Loading channels…" through `LoadingState`), error (`ErrorState` "Couldn't load the channels." with Retry), empty ("No public channels yet" with "They appear after the next sync."), a row saving (`Switch busy`), a row refused (`FIELD_ERROR` under that row, `role="alert"`), a change done (a `role="status"` line: "Now syncing #random." / "Stopped syncing #random." / "#globex-escalations now files under Globex (QA)." / "#globex-escalations now files under the customer each message names.").
- **Motion:** none added.
- **Privacy:** the list shows channel names and counts only; no message text.
- **Testing:** unit + integration + e2e (jsdom, `src/e2e/`), only `fetch` stubbed with contract-shaped stubs and fake data. Never mock the store. Nothing real is sent.

## Decisions (frontend)

1. **Where it lives.** The Slack row's menu item "Choose channels" (shown when the connection has credentials) opens the panel inside the row, where "Choose its customer" opened before; "Choose its customer" goes (a connection's own scope is no longer what files messages, SC3-8). Cost: trivial.
2. **The panel.** A summary line ("Syncs 12 of 14 public channels. New ones are added on their own."), the join note when `can_join` is false ("Slack hasn't let Revenact join channels yet. Approve the app again so it can; until then it reads only the channels it is already in." with a `QUIET` "Approve again" that opens the row's Reconnect form), a "Find a channel" search when there are more than 8 channels, then one row per channel, by name. Cost: low.
3. **A row.** `#name` (semibold), a meta line (`channelMeta`): the state ("Shared with another company", "Joins on the next sync", "Revenact isn't in it", "Slack wouldn't let Revenact join it", "Not synced"), "12 conversations", and the customer ("Files under Globex (QA)" or "Files under the customer each message names"); on the right a `Switch` named "Sync #name" and a `QUIET` "Customer" (named "Choose the customer of #name") that opens `ChannelCustomerForm` under the row. A switch press saves at once (`busy` while it saves, the answer replaces the row). Cost: low.
4. **Slack Connect.** A shared channel shows "Shared with another company" and starts off; turning it on needs no extra confirmation (the server keeps the Jira link out of it, decision 11), but its meta line adds "Replies there never carry Jira links." Cost: trivial.
5. **The state line.** With `slack_channels`: "syncs 12 of 14 public channels" replaces D1's "files each message under the customer it names" / "files messages under X"; without it (an older backend), D1's words. Cost: trivial.
6. **No slice.** The panel fetches its list when it opens and keeps it in component state; the row's counts refresh through the existing `fetchConnectors` after a change (so the state line follows). Cost: trivial.
7. **Events line** (contract SC3-30). Under the summary, one `TYPE.meta` line from the list's `events_at`: "Events: receiving. The last one arrived 5 minutes ago." (date-fns `formatDistanceStrict`), or, when null, "Events: not set up. Revenact checks one channel at each sync until they are." No colour, no badge: the admin reads the time. The panel only, not the row's state line (it would crowd it). Cost: trivial; if the owner wants a warning when events stop, that is a later change.
8. **"Removed"** (contract SC3-3). A channel whose `join_error` is `"removed"` reads "Someone removed Revenact from it" (not "Slack wouldn't let Revenact join it"). Cost: trivial.

## File Structure

**Create**
- `src/features/connectors/slackChannels.ts` (+ `slackChannels.test.ts`): `SlackChannelRow`, `SlackChannelList`, `ChannelChange`, `fetchSlackChannels`, `updateSlackChannel`, `CHANNELS` words, `channelMeta`, `scopeText`, `readChannelRefusal`.
- `src/features/connectors/testSlackChannels.ts`: `CHANNEL_ROWS`, `stubSlackChannels`.
- `src/components/integrations/SlackChannelsPanel.tsx` (+ `.test.tsx`).
- `src/e2e/slackChannels.test.tsx`.

**Modify**
- `src/features/connectors/connectorsSlice.ts` (`Connector.slack_channels?`).
- `src/pages/integrations/ChannelCustomerForm.tsx` (+ its test): props `{ subject, current, onSave, onDone }`.
- `src/components/integrations/WorkspaceToolRow.tsx` (menu, panel, state line).
- `src/e2e/slackConversations.test.tsx` (its "sets a Slack connection to one customer" case moves to the new e2e).
- Docs (Task 5): `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`.

---

### Task 1: Types, the API, words and the stub

**Files:**
- Create: `src/features/connectors/slackChannels.ts`, `src/features/connectors/slackChannels.test.ts`, `src/features/connectors/testSlackChannels.ts`
- Modify: `src/features/connectors/connectorsSlice.ts`

**Interfaces:**
- Produces (types): `SlackChannelRow { id: string; name: string; included: boolean; member: boolean; shared: boolean; private: boolean; record: { type: 'customer' | 'account'; id: number; name: string } | null; conversations: number; join_error: string; read_at: string | null; chosen_by: { id: number; name: string } | null }`; `SlackChannelList { channels: SlackChannelRow[]; can_join: boolean; synced: number; total: number; events_at: string | null }`; `ChannelChange = { included?: boolean; record?: { type: 'customer' | 'account'; id: number } | null }`; `Connector.slack_channels?: { synced: number; total: number; can_join: boolean; events_at?: string | null } | null`.
- Produces (API): `fetchSlackChannels(connectorId): Promise<SlackChannelList>`; `updateSlackChannel(connectorId, channelId, change): Promise<SlackChannelRow>`.
- Produces (words): `CHANNELS`, `channelMeta(row, canJoin): string[]`, `scopeText(connector): string | null`, `readChannelRefusal(err): string`, `eventsLine(at: string | null, now?: Date): string`.
- Produces (stub): `CHANNEL_ROWS` (all-alfiee, random, globex-escalations, globex-shared), `EVENTS_AT = '2026-10-17T09:25:00Z'`, `stubSlackChannels({ rows?, canJoin?, eventsAt?, refuse? }) -> { spy, patches }`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/connectors/slackChannels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import type { Connector } from './connectorsSlice';
import { CHANNELS, channelMeta, eventsLine, readChannelRefusal, scopeText } from './slackChannels';
import { CHANNEL_ROWS } from './testSlackChannels';

const [ALL, RANDOM, ESCALATIONS, SHARED] = CHANNEL_ROWS;

describe('channelMeta (frontend Decisions 3 and 4)', () => {
  it('a synced channel the bot is in: its conversations and its customer', () => {
    expect(channelMeta({ ...ALL, record: { type: 'customer', id: 29, name: 'Globex (QA)' } }, true)).toEqual(['12 conversations', 'Files under Globex (QA)']);
    expect(channelMeta(RANDOM, true)).toEqual(['No conversations yet', 'Files under the customer each message names']);
  });
  it('a channel the bot is not in yet', () => {
    expect(channelMeta(ESCALATIONS, true)[0]).toBe('Joins on the next sync');
    expect(channelMeta(ESCALATIONS, false)[0]).toBe("Revenact isn't in it");
    expect(channelMeta({ ...ESCALATIONS, join_error: 'method_not_supported_for_channel_type' }, true)[0]).toBe("Slack wouldn't let Revenact join it");
    expect(channelMeta({ ...ESCALATIONS, join_error: 'removed' }, true)[0]).toBe('Someone removed Revenact from it');
  });
  it('a Slack Connect channel, off and on', () => {
    expect(channelMeta(SHARED, true).slice(0, 2)).toEqual(['Shared with another company', 'Not synced']);
    expect(channelMeta({ ...SHARED, included: true, member: true }, true)).toContain('Replies there never carry Jira links');
  });
  it('one conversation reads in the singular', () => {
    expect(channelMeta({ ...ALL, conversations: 1 }, true)[0]).toBe('1 conversation');
  });
});

describe('scopeText (Decision 5)', () => {
  it('reads the counts, or nothing from an older backend', () => {
    expect(scopeText({ provider: 'slack', slack_channels: { synced: 12, total: 14, can_join: true } } as Connector)).toBe('syncs 12 of 14 public channels');
    expect(scopeText({ provider: 'slack', slack_channels: { synced: 1, total: 1, can_join: false, events_at: null } } as Connector)).toBe('syncs 1 of 1 public channel');
    expect(scopeText({ provider: 'slack' } as Connector)).toBeNull();
    expect(scopeText({ provider: 'jira', slack_channels: null } as Connector)).toBeNull();
  });
});

describe('eventsLine (Decision 7, contract SC3-30)', () => {
  it('says when the last event arrived, or that events are not set up', () => {
    expect(eventsLine('2026-10-17T09:25:00Z', new Date('2026-10-17T09:30:00Z'))).toBe('Events: receiving. The last one arrived 5 minutes ago.');
    expect(eventsLine('2026-10-17T09:29:59Z', new Date('2026-10-17T09:30:00Z'))).toBe('Events: receiving. The last one arrived 1 second ago.');
    expect(eventsLine(null)).toBe(CHANNELS.EVENTS_OFF);
    expect(CHANNELS.EVENTS_OFF).toBe('Events: not set up. Revenact checks one channel at each sync until they are.');
  });
});

describe('readChannelRefusal (contract §3.2)', () => {
  it('reads a field, the detail, or says it failed', () => {
    expect(readChannelRefusal(new ApiError(400, { record: ["Globex (QA) isn't covered by this Slack connection."] }, 'x'))).toBe("Globex (QA) isn't covered by this Slack connection.");
    expect(readChannelRefusal(new ApiError(400, { included: ['Choose on or off.'] }, 'x'))).toBe('Choose on or off.');
    expect(readChannelRefusal(new ApiError(404, { code: 'NO_SUCH_CHANNEL', detail: 'No such channel.' }, 'x'))).toBe('No such channel.');
    expect(readChannelRefusal(new Error('down'))).toBe(CHANNELS.SAVE_FAILED);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/connectors/slackChannels.test.ts --maxWorkers=2`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

In `src/features/connectors/connectorsSlice.ts` `Connector`, after `agents?`:

```ts
  /** Slack escalations D3 contract §2.1: a Slack connection's channels and Slack's last event; null for another tool, absent from an older backend. */
  slack_channels?: { synced: number; total: number; can_join: boolean; events_at?: string | null } | null;
```

Create `src/features/connectors/slackChannels.ts`:

```ts
// Slack escalations D3 (contract §2, §3, SC3-3 to SC3-15, SC3-30; frontend
// Decisions 2 to 5, 7, 8): a Slack connection's channels, their words and
// the two calls. Kept free of React. No em dash.
import { formatDistanceStrict } from 'date-fns';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { Connector } from './connectorsSlice';

export interface SlackChannelRow {
  id: string;
  /** Without "#". */
  name: string;
  included: boolean;
  /** The Revenact bot is in it. */
  member: boolean;
  /** Slack Connect: people outside the company are in it. */
  shared: boolean;
  private: boolean;
  /** Null: each message files under the customer it names. */
  record: { type: 'customer' | 'account'; id: number; name: string } | null;
  conversations: number;
  /** Slack's code when it refused to let the bot join, 'removed' when someone took the bot out; '' when none. */
  join_error: string;
  read_at: string | null;
  chosen_by: { id: number; name: string } | null;
}

export interface SlackChannelList {
  channels: SlackChannelRow[];
  can_join: boolean;
  synced: number;
  total: number;
  /** When Slack's last event arrived (contract SC3-30); null: events are not set up. */
  events_at: string | null;
}

export interface ChannelChange {
  included?: boolean;
  record?: { type: 'customer' | 'account'; id: number } | null;
}

export const fetchSlackChannels = (connectorId: number) => apiFetch<SlackChannelList>(`/connectors/${connectorId}/slack-channels/`);

export const updateSlackChannel = (connectorId: number, channelId: string, change: ChannelChange) =>
  apiFetch<SlackChannelRow>(`/connectors/${connectorId}/slack-channels/${encodeURIComponent(channelId)}/`, { method: 'PATCH', body: change });

export const CHANNELS = {
  MENU: 'Choose channels',
  HEADING: 'Channels',
  LOADING: 'Loading channels…',
  LOAD_FAILED: "Couldn't load the channels.",
  EMPTY: 'No public channels yet',
  EMPTY_DETAIL: 'They appear after the next sync.',
  FIND: 'Find a channel',
  FIND_PLACEHOLDER: 'Find a channel',
  NONE_FOUND: 'No channel has that name.',
  CANT_JOIN: "Slack hasn't let Revenact join channels yet. Approve the app again so it can; until then it reads only the channels it is already in.",
  APPROVE: 'Approve again',
  CUSTOMER: 'Customer',
  SAVE_FAILED: "Couldn't change the channel. Try again.",
  EVENTS_OFF: 'Events: not set up. Revenact checks one channel at each sync until they are.',
  summary: (synced: number, total: number) => `Syncs ${synced} of ${total} public ${total === 1 ? 'channel' : 'channels'}. New ones are added on their own.`,
  syncLabel: (name: string) => `Sync #${name}`,
  customerLabel: (name: string) => `Choose the customer of #${name}`,
  nowSyncing: (name: string) => `Now syncing #${name}.`,
  stopped: (name: string) => `Stopped syncing #${name}.`,
  filesUnder: (name: string, record: string) => `#${name} now files under ${record}.`,
  filesByName: (name: string) => `#${name} now files under the customer each message names.`,
} as const;

/** The row's meta line (Decisions 3 and 4), its parts in order. */
export function channelMeta(row: SlackChannelRow, canJoin: boolean): string[] {
  const parts: string[] = [];
  if (row.shared) parts.push('Shared with another company');
  if (!row.included) parts.push('Not synced');
  else if (!row.member) parts.push(row.join_error === 'removed' ? 'Someone removed Revenact from it' : row.join_error ? "Slack wouldn't let Revenact join it" : canJoin ? 'Joins on the next sync' : "Revenact isn't in it");
  if (row.included && row.shared) parts.push('Replies there never carry Jira links');
  parts.push(row.conversations === 0 ? 'No conversations yet' : `${row.conversations} ${row.conversations === 1 ? 'conversation' : 'conversations'}`);
  parts.push(row.record ? `Files under ${row.record.name}` : 'Files under the customer each message names');
  return parts;
}

/** Decision 7: whether Slack's events arrive, and when the last one did. */
export function eventsLine(at: string | null, now: Date = new Date()): string {
  if (!at) return CHANNELS.EVENTS_OFF;
  return `Events: receiving. The last one arrived ${formatDistanceStrict(new Date(at), now)} ago.`;
}

/** The Slack row's state part (Decision 5); null keeps D1's words. */
export function scopeText(connector: Connector): string | null {
  const counts = connector.slack_channels;
  if (connector.provider !== 'slack' || !counts) return null;
  return `syncs ${counts.synced} of ${counts.total} public ${counts.total === 1 ? 'channel' : 'channels'}`;
}

const firstOf = (value: unknown): string | null => (Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null);

/** Contract §3.2's refusals, as one sentence for the row. */
export function readChannelRefusal(err: unknown): string {
  if (!(err instanceof ApiError) || typeof err.body !== 'object' || err.body === null) return CHANNELS.SAVE_FAILED;
  const body = err.body as Record<string, unknown>;
  return firstOf(body.record) ?? firstOf(body.included) ?? (typeof body.detail === 'string' ? body.detail : CHANNELS.SAVE_FAILED);
}
```

(Check `apiFetch`'s option name for a JSON body: the other PATCH calls in `features/connectors` show it; `bundlesApi.ts` passes `{ method: 'PATCH', body }`.)

Create `src/features/connectors/testSlackChannels.ts`:

```ts
import { vi } from 'vitest';
import type { SlackChannelList, SlackChannelRow } from './slackChannels';

// Fake channels in the Slack escalations D3 contract's shapes (§2.2, §3).
// Nothing is sent to Slack. No em dash.

const row = (fields: Partial<SlackChannelRow> & Pick<SlackChannelRow, 'id' | 'name'>): SlackChannelRow => ({
  included: true,
  member: true,
  shared: false,
  private: false,
  record: null,
  conversations: 0,
  join_error: '',
  read_at: '2026-10-17T09:30:00Z',
  chosen_by: null,
  ...fields,
});

export const EVENTS_AT = '2026-10-17T09:25:00Z';

export const CHANNEL_ROWS: SlackChannelRow[] = [
  row({ id: 'C0CA7PPRP7A', name: 'all-alfiee', conversations: 12 }),
  row({ id: 'C0RANDOM', name: 'random' }),
  row({ id: 'C0GLOBEX', name: 'globex-escalations', member: false, read_at: null }),
  row({ id: 'C0SHARED', name: 'globex-shared', shared: true, included: false, member: false, read_at: null }),
];

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const refusal = (status: number, body: unknown) => ({ ok: false, status, json: async () => body });

/** GET and PATCH /connectors/<id>/slack-channels/... with `rows`; anything
 *  else goes to `fallback` (the page's other calls). `refuse`: the next
 *  PATCH answers it. */
export function stubSlackChannels({
  rows = CHANNEL_ROWS,
  canJoin = true,
  eventsAt = EVENTS_AT,
  refuse,
  fallback = () => ok([]),
}: {
  rows?: SlackChannelRow[];
  canJoin?: boolean;
  eventsAt?: string | null;
  refuse?: { status: number; body: unknown };
  fallback?: (url: URL, init?: RequestInit) => unknown;
} = {}) {
  let current = rows.map((r) => ({ ...r }));
  let refusing = refuse;
  const patches: { channel: string; body: Record<string, unknown> }[] = [];
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const one = /\/connectors\/\d+\/slack-channels\/([^/]+)\/$/.exec(url.pathname);
    if (one && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      patches.push({ channel: decodeURIComponent(one[1]), body });
      if (refusing) {
        const r = refusing;
        refusing = undefined;
        return refusal(r.status, r.body);
      }
      const found = current.find((c) => c.id === decodeURIComponent(one[1]));
      if (!found) return refusal(404, { code: 'NO_SUCH_CHANNEL', detail: 'No such channel.' });
      const next: SlackChannelRow = { ...found, join_error: '', chosen_by: { id: 1, name: 'Tushar Aggarwal' } };
      if (typeof body.included === 'boolean') next.included = body.included;
      if ('record' in body) {
        const record = body.record as { type: 'customer' | 'account'; id: number } | null;
        next.record = record ? { ...record, name: record.id === 29 ? 'Globex (QA)' : `Record ${record.id}` } : null;
      }
      current = current.map((c) => (c.id === next.id ? next : c));
      return ok(next);
    }
    if (/\/connectors\/\d+\/slack-channels\/$/.test(url.pathname)) {
      const list: SlackChannelList = { channels: current, can_join: canJoin, synced: current.filter((c) => c.included).length, total: current.length, events_at: eventsAt };
      return ok(list);
    }
    return fallback(url, init);
  });
  vi.stubGlobal('fetch', spy);
  return { spy, patches };
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run src/features/connectors --maxWorkers=2 && npx tsc -b`
Expected: PASS, `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/connectors/connectorsSlice.ts src/features/connectors/slackChannels.ts src/features/connectors/slackChannels.test.ts src/features/connectors/testSlackChannels.ts
git commit -m "feat(connectors): slack channel types, calls, words and a contract-shaped stub

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: "Its customer" for anything, a channel first

**Files:**
- Modify: `src/pages/integrations/ChannelCustomerForm.tsx`, `src/pages/integrations/ChannelCustomerForm.test.tsx`

**Interfaces:**
- Produces: `ChannelCustomerForm({ subject, current, onSave, onDone }: { subject: string; current: RecordRef | null; onSave: (record: RecordRef | null) => Promise<string | null>; onDone: () => void })`. `onSave` answers a refusal sentence, or null when saved.
- Consumes: `RecordStep`, `RecordRef` (unchanged).

- [ ] **Step 1: Rewrite the tests for the new props**

Replace the body of `src/pages/integrations/ChannelCustomerForm.test.tsx` (its D1 cases keep their meaning, now through `onSave`):

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { ChannelCustomerForm } from './ChannelCustomerForm';

function stubSearch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => (String(url).includes('/customers/') ? { results: [{ id: 29, name: 'Globex (QA)' }] } : { results: [] }) })));
}

function renderForm(props: Partial<Parameters<typeof ChannelCustomerForm>[0]> = {}) {
  const onSave = props.onSave ?? vi.fn(async () => null);
  const onDone = props.onDone ?? vi.fn();
  const store = configureStore({ reducer: { auth: authReducer } });
  render(
    <Provider store={store}>
      <ChannelCustomerForm subject="#globex-escalations" current={props.current ?? null} onSave={onSave} onDone={onDone} />
    </Provider>,
  );
  return { onSave, onDone };
}

describe('ChannelCustomerForm (Slack escalations D1 Decision 5, D3 per channel)', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('sets one customer', async () => {
    stubSearch();
    const user = userEvent.setup();
    const { onSave, onDone } = renderForm();
    expect(screen.getByRole('form', { name: 'Choose the customer of #globex-escalations' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Any customer the message names' })).toHaveFocus();
    await user.click(screen.getByRole('radio', { name: 'Always this customer:' }));
    await user.type(screen.getByLabelText('Organisation or account'), 'Glo');
    await user.click(await screen.findByRole('button', { name: 'Globex (QA)' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ kind: 'organization', id: 29, name: 'Globex (QA)' });
    expect(onDone).toHaveBeenCalled();
  });

  it('goes back to any customer the message names', async () => {
    const user = userEvent.setup();
    const { onSave } = renderForm({ current: { kind: 'organization', id: 29, name: 'Globex (QA)' } });
    expect(screen.getByRole('radio', { name: 'Always this customer:' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Any customer the message names' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('asks for a record before saving one, and shows a refusal', async () => {
    stubSearch();
    const user = userEvent.setup();
    const onSave = vi.fn(async () => "Globex (QA) isn't covered by this Slack connection.");
    const { onDone } = renderForm({ onSave });
    await user.click(screen.getByRole('radio', { name: 'Always this customer:' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a customer or account first.');
    await user.type(screen.getByLabelText('Organisation or account'), 'Glo');
    await user.click(await screen.findByRole('button', { name: 'Globex (QA)' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Globex (QA) isn't covered by this Slack connection.");
    expect(onDone).not.toHaveBeenCalled();
  });
});
```

(If `RecordStep`'s search reads another URL, keep `stubSearch` answering it as the D1 test did; the store only needs what `RecordStep` reads.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/pages/integrations/ChannelCustomerForm.test.tsx --maxWorkers=2`
Expected: FAIL (the form still takes `connector`).

- [ ] **Step 3: Implement**

Replace `src/pages/integrations/ChannelCustomerForm.tsx`'s component (the constants and `RADIO` / `OPTION` stay):

```tsx
import { useEffect, useId, useState, type FormEvent } from 'react';
import type { RecordRef } from '../../features/plans/planTypes';
import { RecordStep } from '../../components/plans/RecordStep';
import { FIELD_ERROR, FOCUS, PRIMARY, QUIET, TYPE } from '../../components/ui';

const ANY = 'Any customer the message names';
const ONE = 'Always this customer:';
const PICK = 'Choose a customer or account first.';
const RADIO = `size-4 accent-accent ${FOCUS}`;
const OPTION = `flex min-h-11 items-center gap-2 sm:min-h-9 ${TYPE.body}`;

/** "Its customer" (Slack escalations D1 Decision 5; D3 per channel): its
 *  messages go under the customer each one names, or always under one
 *  record. `onSave` answers a refusal sentence, or null once saved. */
export function ChannelCustomerForm({
  subject,
  current,
  onSave,
  onDone,
}: {
  subject: string;
  current: RecordRef | null;
  onSave: (record: RecordRef | null) => Promise<string | null>;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<'any' | 'one'>(current ? 'one' : 'any');
  const [record, setRecord] = useState<RecordRef | null>(current);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const name = useId();
  const anyId = `${name}-any`;
  const oneId = `${name}-one`;

  useEffect(() => {
    document.getElementById(mode === 'one' ? oneId : anyId)?.focus();
    // Only on open: the checked option at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (mode === 'one' && !record) return setRefused(PICK);
    setBusy(true);
    setRefused(null);
    const answer = await onSave(mode === 'any' ? null : record);
    setBusy(false);
    if (answer) setRefused(answer);
    else onDone();
  }

  return (
    <form onSubmit={save} aria-label={`Choose the customer of ${subject}`} className="flex flex-col gap-3">
      <fieldset className="flex flex-col">
        <legend className={`${TYPE.body} font-semibold`}>Which customer its messages go under</legend>
        <label className={OPTION}>
          <input id={anyId} type="radio" name={name} checked={mode === 'any'} onChange={() => setMode('any')} className={RADIO} />
          {ANY}
        </label>
        <label className={OPTION}>
          <input id={oneId} type="radio" name={name} checked={mode === 'one'} onChange={() => setMode('one')} className={RADIO} />
          {ONE}
        </label>
      </fieldset>
      {mode === 'one' ? (
        <RecordStep
          heading="Customer or account"
          record={record}
          locked={false}
          loading={false}
          onPick={(next) => {
            setRecord(next);
            setRefused(null);
          }}
          onClear={() => setRecord(null)}
        />
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

(The JSX is today's. The D1 "many records" case (`mode` null, "Choose one option first.") goes: a channel holds at most one record. The `useAppDispatch`, `updateConnector` and `Connector` imports go; the caller saves.)

- [ ] **Step 4: Run the tests, the type check and the ratchet**

Run: `npx vitest run src/pages/integrations --maxWorkers=2 && npx tsc -b && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: the form's tests PASS. `tsc` fails in `WorkspaceToolRow.tsx` (it still passes `connector`): that call is replaced in Task 4, so for this commit change it to the new props with the D1 save, to keep `main`-like behaviour until then:

```tsx
        {connector && panel === 'customer' ? (
          <ChannelCustomerForm
            subject={connector.name}
            current={currentRecord(connector)}
            onSave={async (record) => {
              const scope = !record ? { customer_ids: [], account_ids: [] } : record.kind === 'organization' ? { customer_ids: [record.id], account_ids: [] } : { customer_ids: [], account_ids: [record.id] };
              const result = await dispatch(updateConnector({ id: connector.id, ...scope }));
              return updateConnector.fulfilled.match(result) ? null : (result.payload ?? 'Could not change its customer.');
            }}
            onDone={close}
          />
        ) : null}
```

with `currentRecord` (today's `current` from `ChannelCustomerForm.tsx`, moved into `WorkspaceToolRow.tsx`). Then `tsc` is clean; ratchet at `BASELINE`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/integrations/ChannelCustomerForm.tsx src/pages/integrations/ChannelCustomerForm.test.tsx src/components/integrations/WorkspaceToolRow.tsx
git commit -m "refactor(integrations): the its-customer form chooses a record for any one thing

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The channels panel

**Files:**
- Create: `src/components/integrations/SlackChannelsPanel.tsx`, `src/components/integrations/SlackChannelsPanel.test.tsx`

**Interfaces:**
- Produces: `SlackChannelsPanel({ connectorId, onReconnect, onChanged }: { connectorId: number; onReconnect: () => void; onChanged: () => void })`.
- Consumes: Task 1 (`fetchSlackChannels`, `updateSlackChannel`, `CHANNELS`, `channelMeta`, `eventsLine`, `readChannelRefusal`, `stubSlackChannels`, `CHANNEL_ROWS`); Task 2 (`ChannelCustomerForm`); `Switch`, `SearchInput`, `LoadingState`, `EmptyState`, `ErrorState`, `QUIET`, `FIELD_ERROR`, `TYPE` (`components/ui`).

- [ ] **Step 1: Write the failing tests**

Create `src/components/integrations/SlackChannelsPanel.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { CHANNEL_ROWS, stubSlackChannels } from '../../features/connectors/testSlackChannels';
import { SlackChannelsPanel } from './SlackChannelsPanel';

afterEach(() => vi.unstubAllGlobals());

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

function renderPanel(props: Partial<Parameters<typeof SlackChannelsPanel>[0]> = {}) {
  const onReconnect = props.onReconnect ?? vi.fn();
  const onChanged = props.onChanged ?? vi.fn();
  const store = configureStore({ reducer: { auth: authReducer } });
  render(
    <Provider store={store}>
      <SlackChannelsPanel connectorId={7} onReconnect={onReconnect} onChanged={onChanged} />
    </Provider>,
  );
  return { onReconnect, onChanged };
}

const rowOf = (name: string) => screen.getByText(`#${name}`).closest('li') as HTMLElement;

describe('SlackChannelsPanel (frontend Decisions 2 to 4)', () => {
  it('lists every channel with its state, its count and its customer', async () => {
    stubSlackChannels();
    renderPanel();
    expect(await screen.findByText('Syncs 3 of 4 public channels. New ones are added on their own.')).toBeInTheDocument();
    expect(within(rowOf('all-alfiee')).getByText(/12 conversations/)).toBeInTheDocument();
    expect(within(rowOf('globex-escalations')).getByText(/Joins on the next sync/)).toBeInTheDocument();
    expect(within(rowOf('globex-shared')).getByText(/Shared with another company/)).toBeInTheDocument();
    expect(within(rowOf('globex-shared')).getByRole('switch', { name: 'Sync #globex-shared' })).toHaveAttribute('aria-checked', 'false');
    expect(within(rowOf('random')).getByRole('switch', { name: 'Sync #random' })).toHaveAttribute('aria-checked', 'true');
  });

  it('says whether Slack events arrive (Decision 7)', async () => {
    stubSlackChannels();
    renderPanel();
    expect(await screen.findByText(/^Events: receiving\. The last one arrived .+ ago\.$/)).toBeInTheDocument();
  });

  it('says when events are not set up', async () => {
    stubSlackChannels({ eventsAt: null });
    renderPanel();
    expect(await screen.findByText('Events: not set up. Revenact checks one channel at each sync until they are.')).toBeInTheDocument();
  });

  it('stops syncing a channel and says so', async () => {
    const { patches } = stubSlackChannels();
    const { onChanged } = renderPanel();
    await userEvent.click(within(await screen.findByText('#random').then((el) => el.closest('li') as HTMLElement)).getByRole('switch', { name: 'Sync #random' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Stopped syncing #random.');
    expect(within(rowOf('random')).getByRole('switch', { name: 'Sync #random' })).toHaveAttribute('aria-checked', 'false');
    expect(patches).toEqual([{ channel: 'C0RANDOM', body: { included: false } }]);
    expect(onChanged).toHaveBeenCalled();
  });

  it('sets a channel to a customer', async () => {
    const { patches } = stubSlackChannels({
      fallback: (url) => ok(url.pathname.includes('/customers/') ? { results: [{ id: 29, name: 'Globex (QA)' }] } : { results: [] }),
    });
    renderPanel();
    await screen.findByText('#globex-escalations');
    await userEvent.click(within(rowOf('globex-escalations')).getByRole('button', { name: 'Choose the customer of #globex-escalations' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Always this customer:' }));
    await userEvent.type(screen.getByLabelText('Organisation or account'), 'Glo');
    await userEvent.click(await screen.findByRole('button', { name: 'Globex (QA)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('status')).toHaveTextContent('#globex-escalations now files under Globex (QA).');
    expect(within(rowOf('globex-escalations')).getByText(/Files under Globex \(QA\)/)).toBeInTheDocument();
    expect(patches).toEqual([{ channel: 'C0GLOBEX', body: { record: { type: 'customer', id: 29 } } }]);
  });

  it('shows a refusal under its row', async () => {
    stubSlackChannels({ refuse: { status: 400, body: { included: ['Choose on or off.'] } } });
    renderPanel();
    await screen.findByText('#random');
    await userEvent.click(within(rowOf('random')).getByRole('switch', { name: 'Sync #random' }));
    expect(await within(rowOf('random')).findByRole('alert')).toHaveTextContent('Choose on or off.');
    expect(within(rowOf('random')).getByRole('switch', { name: 'Sync #random' })).toHaveAttribute('aria-checked', 'true');
  });

  it('says when it cannot join yet, and offers to approve the app again', async () => {
    stubSlackChannels({ canJoin: false });
    const { onReconnect } = renderPanel();
    expect(await screen.findByText(/Slack hasn't let Revenact join channels yet/)).toBeInTheDocument();
    expect(within(rowOf('globex-escalations')).getByText(/Revenact isn't in it/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve again' }));
    expect(onReconnect).toHaveBeenCalled();
  });

  it('finds a channel by name when there are many', async () => {
    const many = Array.from({ length: 10 }, (_, n) => ({ ...CHANNEL_ROWS[1], id: `C0N${n}`, name: `team-${n}` }));
    stubSlackChannels({ rows: [...CHANNEL_ROWS, ...many] });
    renderPanel();
    const find = await screen.findByRole('searchbox', { name: 'Find a channel' });
    await userEvent.type(find, 'globex');
    expect(screen.getAllByRole('switch').map((s) => s.getAttribute('aria-label'))).toEqual(['Sync #globex-escalations', 'Sync #globex-shared']);
    await userEvent.clear(find);
    await userEvent.type(find, 'nothing-like-it');
    expect(screen.getByText('No channel has that name.')).toBeInTheDocument();
  });

  it('loading, empty and a failed load', async () => {
    stubSlackChannels({ rows: [] });
    renderPanel();
    expect(screen.getByText('Loading channels…')).toBeInTheDocument();
    expect(await screen.findByText('No public channels yet')).toBeInTheDocument();
  });

  it('a failed load offers Retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => ({ detail: 'down' }) })));
    renderPanel();
    expect(await screen.findByText("Couldn't load the channels.")).toBeInTheDocument();
    stubSlackChannels();
    await userEvent.click(screen.getByRole('button', { name: /Retry|Try again/ }));
    expect(await screen.findByText('#all-alfiee')).toBeInTheDocument();
  });
});
```

(Read `ErrorState`'s retry button name and match it; `LoadingState` renders its `label`.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/integrations/SlackChannelsPanel.test.tsx --maxWorkers=2`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/components/integrations/SlackChannelsPanel.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { CHANNELS, channelMeta, eventsLine, fetchSlackChannels, readChannelRefusal, updateSlackChannel, type ChannelChange, type SlackChannelList, type SlackChannelRow } from '../../features/connectors/slackChannels';
import type { RecordRef } from '../../features/plans/planTypes';
import { ChannelCustomerForm } from '../../pages/integrations/ChannelCustomerForm';
import { EmptyState, ErrorState, FIELD_ERROR, LoadingState, QUIET, SearchInput, Switch, TYPE } from '../ui';

const MANY = 8;

const refOf = (row: SlackChannelRow): RecordRef | null =>
  row.record ? { kind: row.record.type === 'customer' ? 'organization' : 'account', id: row.record.id, name: row.record.name } : null;

/** A Slack connection's channels (Slack escalations D3 frontend Decisions 2
 *  to 4): every public channel, Sync on or off, and each one's customer.
 *  The list is the panel's own; `onChanged` lets the row refresh its counts. */
export function SlackChannelsPanel({ connectorId, onReconnect, onChanged }: { connectorId: number; onReconnect: () => void; onChanged: () => void }) {
  const [list, setList] = useState<SlackChannelList | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [refusals, setRefusals] = useState<Record<string, string>>({});
  const [said, setSaid] = useState<string | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    setList(null);
    fetchSlackChannels(connectorId)
      .then(setList)
      .catch(() => setFailed(true));
  }, [connectorId]);
  useEffect(load, [load]);

  async function change(row: SlackChannelRow, body: ChannelChange, words: string): Promise<string | null> {
    setBusy(row.id);
    setRefusals((r) => ({ ...r, [row.id]: '' }));
    try {
      const next = await updateSlackChannel(connectorId, row.id, body);
      setList((l) => (l ? { ...l, channels: l.channels.map((c) => (c.id === next.id ? next : c)), synced: l.channels.filter((c) => (c.id === next.id ? next.included : c.included)).length } : l));
      setSaid(words);
      onChanged();
      return null;
    } catch (err) {
      const sentence = readChannelRefusal(err);
      setRefusals((r) => ({ ...r, [row.id]: sentence }));
      return sentence;
    } finally {
      setBusy(null);
    }
  }

  if (failed) return <ErrorState message={CHANNELS.LOAD_FAILED} onRetry={load} />;
  if (!list) return <LoadingState label={CHANNELS.LOADING} variant="rows" count={3} />;
  if (list.channels.length === 0) return <EmptyState title={CHANNELS.EMPTY} detail={CHANNELS.EMPTY_DETAIL} size="section" />;

  const needle = query.trim().toLowerCase();
  const shown = needle ? list.channels.filter((c) => c.name.toLowerCase().includes(needle)) : list.channels;
  return (
    <section aria-label={CHANNELS.HEADING} className="flex flex-col gap-3">
      <p className={TYPE.body}>{CHANNELS.summary(list.synced, list.total)}</p>
      <p className={TYPE.meta}>{eventsLine(list.events_at)}</p>
      {!list.can_join ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className={`${TYPE.meta} max-w-[68ch]`}>{CHANNELS.CANT_JOIN}</p>
          <button type="button" onClick={onReconnect} className={QUIET}>
            {CHANNELS.APPROVE}
          </button>
        </div>
      ) : null}
      {said ? (
        <p role="status" className={TYPE.meta}>
          {said}
        </p>
      ) : null}
      {list.channels.length > MANY ? <SearchInput label={CHANNELS.FIND} placeholder={CHANNELS.FIND_PLACEHOLDER} value={query} onChange={setQuery} width="full" /> : null}
      {shown.length === 0 ? (
        <p className={TYPE.bodyMuted}>{CHANNELS.NONE_FOUND}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {shown.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className={`${TYPE.body} font-semibold`}>#{row.name}</span>
                  <span className={TYPE.meta}>{channelMeta(row, list.can_join).join(' · ')}</span>
                </div>
                <Switch
                  checked={row.included}
                  label={CHANNELS.syncLabel(row.name)}
                  busy={busy === row.id}
                  onChange={(next) => void change(row, { included: next }, next ? CHANNELS.nowSyncing(row.name) : CHANNELS.stopped(row.name))}
                />
                <button type="button" aria-label={CHANNELS.customerLabel(row.name)} aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? null : row.id)} className={QUIET}>
                  {CHANNELS.CUSTOMER}
                </button>
              </div>
              {refusals[row.id] ? (
                <p role="alert" className={FIELD_ERROR}>
                  {refusals[row.id]}
                </p>
              ) : null}
              {open === row.id ? (
                <ChannelCustomerForm
                  subject={`#${row.name}`}
                  current={refOf(row)}
                  onSave={(record) =>
                    change(
                      row,
                      { record: record ? { type: record.kind === 'organization' ? 'customer' : 'account', id: record.id } : null },
                      record ? CHANNELS.filesUnder(row.name, record.name) : CHANNELS.filesByName(row.name),
                    )
                  }
                  onDone={() => setOpen(null)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

(A form's refusal shows inside the form (its own `role="alert"`); a switch's under the row. If the ratchet counts the bordered list as a card, use the repo's quiet list class from the UI cleanup (`ListCard` or the `divide-y` list `WorkspaceToolRow`'s siblings use) instead: the look is "bordered quiet list", not a new card.)

- [ ] **Step 4: Run the tests, the type check and the ratchet**

Run: `npx vitest run src/components/integrations --maxWorkers=2 && npx tsc -b && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS; ratchet at `BASELINE`.

- [ ] **Step 5: Commit**

```bash
git add src/components/integrations/SlackChannelsPanel.tsx src/components/integrations/SlackChannelsPanel.test.tsx
git commit -m "feat(integrations): the slack channels panel: sync on or off and each channel's customer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The Slack row offers Choose channels and says how many it syncs

**Files:**
- Modify: `src/components/integrations/WorkspaceToolRow.tsx`, `src/e2e/slackConversations.test.tsx` (its Settings case), `src/pages/integrations/Integrations.test.tsx` (if it asserts the D1 menu item)
- Create: `src/components/integrations/WorkspaceToolRow.test.tsx` (or add to it, if it exists)

**Interfaces:**
- Consumes: `SlackChannelsPanel` (Task 3), `scopeText`, `CHANNELS` (Task 1), `fetchConnectors` (the slice).

- [ ] **Step 1: Write the failing tests**

Create `src/components/integrations/WorkspaceToolRow.test.tsx` (if a test file exists, add this `describe`):

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import connectorsReducer, { type Connector } from '../../features/connectors/connectorsSlice';
import { WORKSPACE_TOOLS } from '../../features/connectors/connectionsText';
import { stubSlackChannels } from '../../features/connectors/testSlackChannels';
import { WorkspaceToolRow } from './WorkspaceToolRow';

afterEach(() => vi.unstubAllGlobals());

const SLACK = {
  id: 7, provider: 'slack', provider_display: 'Slack', name: 'Slack', is_enabled: true,
  department: '', department_display: '', customers: [], accounts: [], is_organisation_wide: true,
  ticket_count: 12, conversation_count: 12, call_count: 0, last_record_at: null, created_at: '2026-10-01T00:00:00Z',
  has_credentials: true, config: {}, status: 'connected', error: '', last_synced_at: '2026-10-17T09:30:00Z', last_sync_note: '',
  setup: { key: 'slack', label: 'Slack', uses_oauth: true, help: '', fields: [{ name: 'bot_token', label: 'Bot token', secret: true, placeholder: 'xoxb-…', required: false }] },
  slack_channels: { synced: 3, total: 4, can_join: true, events_at: '2026-10-17T09:25:00Z' },
} as unknown as Connector;

function renderRow(connector: Connector) {
  const store = configureStore({ reducer: { auth: authReducer, connectors: connectorsReducer } });
  const tool = WORKSPACE_TOOLS.find((t) => t.id === 'slack')!;
  render(
    <Provider store={store}>
      <ul>
        <WorkspaceToolRow tool={tool} connectors={[connector]} onDisconnect={vi.fn()} onDisable={vi.fn()} />
      </ul>
    </Provider>,
  );
}

describe('The Slack row (frontend Decisions 1 and 5)', () => {
  it('says how many channels it syncs and opens Choose channels', async () => {
    stubSlackChannels();
    renderRow(SLACK);
    expect(screen.getByText(/syncs 3 of 4 public channels/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'More for Slack (workspace)' }));
    expect(screen.queryByRole('menuitem', { name: 'Choose its customer' })).toBeNull();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Choose channels' }));
    expect(await screen.findByText('#all-alfiee')).toBeInTheDocument();
  });

  it('an older backend keeps the D1 words', () => {
    renderRow({ ...SLACK, slack_channels: undefined } as Connector);
    expect(screen.getByText(/files each message under the customer it names/)).toBeInTheDocument();
  });

  it('Approve again opens the reconnect form', async () => {
    stubSlackChannels({ canJoin: false });
    renderRow({ ...SLACK, slack_channels: { synced: 2, total: 4, can_join: false, events_at: null } } as Connector);
    await userEvent.click(screen.getByRole('button', { name: 'More for Slack (workspace)' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Choose channels' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Approve again' }));
    expect(within(screen.getByRole('group', { name: /Slack|Workspace/ }).closest('li') as HTMLElement).getByRole('button', { name: /Sign in with Slack/ })).toBeInTheDocument();
  });
});
```

(`WORKSPACE_TOOLS` and the menu's accessible name are `connectionsText.ts`'s and `ConnectionRow`'s; match them if they differ.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/integrations/WorkspaceToolRow.test.tsx --maxWorkers=2`
Expected: FAIL (the D1 menu item; no counts).

- [ ] **Step 3: Implement**

In `src/components/integrations/WorkspaceToolRow.tsx`:

- `slackScope(c)` reads the counts first: `const counts = scopeText(c); if (counts) return counts;` before its D1 lines.
- `type Panel = null | 'connect' | 'channels' | 'department';` (`'customer'` goes).
- The menu's Slack item: `...(tool.id === 'slack' && connector.has_credentials ? [{ key: 'channels', label: CHANNELS.MENU, onSelect: () => setPanel('channels') }] : []),`.
- The body: the `panel === 'customer'` line (and Task 2's `currentRecord` helper and the `ChannelCustomerForm` import) go, and:

```tsx
        {connector && panel === 'channels' ? (
          <SlackChannelsPanel connectorId={connector.id} onReconnect={() => setPanel('connect')} onChanged={() => void dispatch(fetchConnectors())} />
        ) : null}
```

(imports: `SlackChannelsPanel`, `CHANNELS`, `scopeText`, `fetchConnectors`.)

In `src/e2e/slackConversations.test.tsx`, delete the case "sets a Slack connection to one customer in Settings" (Task 5's journey replaces it). In `src/pages/integrations/Integrations.test.tsx`, a case that opens "Choose its customer" opens "Choose channels" instead or is deleted with a pointer to `WorkspaceToolRow.test.tsx`.

- [ ] **Step 4: Run the tests, the type check and the ratchet**

Run: `npx vitest run src/components/integrations src/pages/integrations src/e2e/slackConversations.test.tsx --maxWorkers=2 && npx tsc -b && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS; ratchet at `BASELINE` (if a count dropped with the removed code, lower that baseline to match, as the ratchet asks).

- [ ] **Step 5: Commit**

```bash
git add src/components/integrations/WorkspaceToolRow.tsx src/components/integrations/WorkspaceToolRow.test.tsx src/e2e/slackConversations.test.tsx src/pages/integrations/Integrations.test.tsx src/test/uiRatchet.test.ts
git commit -m "feat(integrations): the slack row says how many channels it syncs and offers choose channels

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Leave out of the `git add` any file Step 4 did not change.)

---

### Task 5: The journey, docs, the full check, by eye, and the owner's live checks

**Files:**
- Create: `src/e2e/slackChannels.test.tsx`
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`

- [ ] **Step 1: The journey**

Create `src/e2e/slackChannels.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '../features/auth/authSlice';
import connectorsReducer from '../features/connectors/connectorsSlice';
import mailReducer from '../features/mail/mailSlice';
import { stubSlackChannels } from '../features/connectors/testSlackChannels';
import { Integrations } from '../pages/integrations/Integrations';
import { capabilitiesForRole } from '../test/capabilities';

// End-to-end tier (jsdom): the real page and store; only fetch is stubbed,
// in the Slack escalations D3 contract's shapes. Fake channels; nothing is
// sent to Slack. No em dash.

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

afterEach(() => vi.unstubAllGlobals());

const SLACK = {
  id: 7, provider: 'slack', provider_display: 'Slack', name: 'Slack', is_enabled: true,
  customers: [], accounts: [], is_organisation_wide: true, ticket_count: 12, conversation_count: 12, call_count: 0,
  last_record_at: null, created_at: '2026-08-01T00:00:00Z', department: '', department_display: '', has_credentials: true,
  config: {}, status: 'connected', error: '', last_synced_at: '2026-10-17T09:30:00Z', last_sync_note: '',
  setup: { key: 'slack', label: 'Slack', uses_oauth: true, help: '', fields: [{ name: 'bot_token', label: 'Bot token', secret: true, placeholder: 'xoxb-…', required: false }] },
  slack_channels: { synced: 3, total: 4, can_join: true, events_at: '2026-10-17T09:25:00Z' },
};

describe('Slack escalations D3, end to end', () => {
  it('an admin sees events arrive, excludes #random and sets #globex-escalations to Globex (QA) (LC-D3a, LC-D3b, LC-D3d)', { timeout: 60000 }, async () => {
    let synced = 3;
    const { patches } = stubSlackChannels({
      fallback: (url) => {
        if (url.pathname.includes('/connectors/jira-link/')) return ok({ configured: false, connectors: [], link: null });
        if (url.pathname.endsWith('/customers/') && url.searchParams.has('search')) return ok({ results: [{ id: 29, name: 'Globex (QA)' }] });
        if (url.pathname.endsWith('/accounts/') && url.searchParams.has('search')) return ok({ results: [] });
        if (url.pathname.endsWith('/connectors/')) return ok([{ ...SLACK, slack_channels: { synced, total: 4, can_join: true, events_at: '2026-10-17T09:25:00Z' } }]);
        return ok({ results: [] });
      },
    });
    const store = configureStore({
      reducer: { auth: authReducer, connectors: connectorsReducer, mail: mailReducer },
      preloadedState: {
        auth: {
          user: {
            id: 1, email: 'tushar@alfee.io', name: 'Tushar Aggarwal', avatar: '', role: 'admin' as const, role_id: 1,
            role_name: 'Admin', permissions: capabilitiesForRole('admin'), function: 'leadership' as const, function_display: 'Leadership', reports_to: null,
            organisation: { id: 4, name: 'Alfiee', slug: 'alfiee', currency: 'USD' as const, currency_display: 'US Dollar ($)', default_lifecycle_stage: '', ai_agent_enabled: true, ai_agent_tone: 'professional' as const, ai_agent_tone_display: 'Professional' },
            is_active: true,
          },
          accessToken: 'token', refreshToken: 'refresh', isAuthenticated: true, isLoading: false, error: null,
        },
      },
    });
    render(
      <Provider store={store}>
        <MemoryRouter>
          <Integrations />
        </MemoryRouter>
      </Provider>,
    );
    const slackCard = await screen.findByRole('list', { name: 'Slack' });
    const card = within(slackCard).getByRole('group', { name: 'Workspace' }).closest('li') as HTMLElement;
    expect(await within(card).findByText(/syncs 3 of 4 public channels/)).toBeInTheDocument();

    await userEvent.click(within(card).getByRole('button', { name: 'More for Slack (workspace)' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Choose channels' }));
    expect(await within(card).findByText(/^Events: receiving\./)).toBeInTheDocument();
    const random = (await within(card).findByText('#random')).closest('li') as HTMLElement;
    synced = 2;
    await userEvent.click(within(random).getByRole('switch', { name: 'Sync #random' }));
    expect(await within(card).findByText('Stopped syncing #random.')).toBeInTheDocument();
    expect(await within(card).findByText(/syncs 2 of 4 public channels/)).toBeInTheDocument();

    const globex = within(card).getByText('#globex-escalations').closest('li') as HTMLElement;
    await userEvent.click(within(globex).getByRole('button', { name: 'Choose the customer of #globex-escalations' }));
    await userEvent.click(within(globex).getByRole('radio', { name: 'Always this customer:' }));
    await userEvent.type(within(globex).getByRole('searchbox', { name: 'Organisation or account' }), 'glo');
    await userEvent.click(await within(globex).findByRole('button', { name: /^Globex \(QA\)$/ }));
    await userEvent.click(within(globex).getByRole('button', { name: 'Save' }));
    expect(await within(card).findByText('#globex-escalations now files under Globex (QA).')).toBeInTheDocument();
    expect(patches).toEqual([
      { channel: 'C0RANDOM', body: { included: false } },
      { channel: 'C0GLOBEX', body: { record: { type: 'customer', id: 29 } } },
    ]);
  });
});
```

(The preloaded user mirrors `slackConversations.test.tsx`'s; copy any field `tsc` asks for from there.)

Run: `npx vitest run src/e2e/slackChannels.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 2: The docs**

- `docs/03-ui-ux-design.md`: Settings › Connections › Slack: the state line with its channel counts; Choose channels (the summary, the events line, the join note with Approve again, the search over 8 channels, a row's meta parts including "Someone removed Revenact from it", the Sync switch, the Customer form under a row, the status line, the states).
- `docs/04-app-flow.md`: an admin connects Slack once; Slack pushes each message as it is posted (Events API) and Revenact files it at once, with a slow catch-up when events are missing; every public channel syncs; new ones are joined when Slack announces them, after the app is approved with `channels:join`; excluding a channel; setting a channel's customer; Slack Connect channels start off; the owner's one-time Slack app set-up (Event Subscriptions, Request URL, `message.channels` and `channel_created`, `channels:join`, reinstall).
- `.agents/workflows/repo-architecture.md`: `features/connectors/slackChannels.ts`, `components/integrations/SlackChannelsPanel.tsx`; `ChannelCustomerForm` now takes any subject.

- [ ] **Step 3: The full check**

```bash
npx vitest run --maxWorkers=2
npx tsc -b
npm run lint
npm run build
npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2
grep -rn "—" src/features/connectors/slackChannels.ts src/features/connectors/testSlackChannels.ts src/components/integrations/SlackChannelsPanel.tsx src/pages/integrations/ChannelCustomerForm.tsx src/e2e/slackChannels.test.tsx || echo "no em dash"
```

Expected: every test passes (write the count into the hand-off), `tsc` clean, lint clean, build OK, ratchet totals equal to `BASELINE`, "no em dash".

- [ ] **Step 4: By eye, on a database copy, in the Alfiee workspace, with signed fake events**

Nothing real is sent. Slack can't reach this Mac, so the check posts Slack-shaped events, signed with a secret made for this run, straight to the local backend.

1. **Copy the dev database, read only:** `createdb revenact_slackd3 && pg_dump --no-owner revenact | psql -q revenact_slackd3` (`pg_dump` only reads `revenact`; if `revenact_slackd3` exists from an earlier run, `dropdb revenact_slackd3` first). Migrate the copy only, from `revenact-backend-slackd3` at its head (backend D3 built): `DATABASE_URL=postgres:///revenact_slackd3 venv/bin/python manage.py migrate`. Check: connection 7 has one `SlackChannel` (`C0CA7PPRP7A`, `all-alfiee`, included, member, `read_at` set).
2. **Make it safe**, in a `manage.py shell` against the copy: blank every `MailboxConnection` credential, replace every `Connector` credential with a fake one, delete every `JiraLink` and `SlackLink`; run the backend with `HTTPS_PROXY=http://127.0.0.1:9` (every Slack lookup fails at once, so posters' names come out blank: expected here). Never run `sync_tickets` against the copy.
3. **Seed in the copy:** a QA password on `tushar@alfee.io` (copy only); on connection 7 add `SlackChannel` rows `C0RANDOM` "random" (member), `C0GLOBEX` "globex-escalations" (not a member), `C0SHARED` "globex-shared" (`external_shared`, excluded), `C0GONE` "old-team" (`join_error` `removed`), and twelve `team-n` rows (to see the search); leave `channels:join` out of connection 7's `granted_scopes` for the first look, then add it.
4. **Servers:** make a secret for this run, `python3 -c "import secrets; print(secrets.token_hex(16))" > <scratchpad>/slackd3-fe-byeye/secret`; backend on :8019 (`revenact-backend-slackd3`, `DATABASE_URL` the copy, `HTTPS_PROXY` as above, `SLACK_SIGNING_SECRET="$(cat <scratchpad>/slackd3-fe-byeye/secret)"`), Vite on :5189 (`VITE_API_URL=http://localhost:8019`).
5. **Before any event:** Choose channels says "Events: not set up. Revenact checks one channel at each sync until they are."
6. **Post signed events** with this script, saved as `<scratchpad>/slackd3-fe-byeye/push.py` and run as `python3 -I push.py <secret file> <team id> <kind>` (the team id is connection 7's `config["team_id"]`, read in the shell; `kind` is `url`, `top`, `random` or `created`):

```python
import hashlib
import hmac
import json
import sys
import time
import urllib.request

secret = open(sys.argv[1]).read().strip()
team, kind = sys.argv[2], sys.argv[3]
now = f"{time.time():.6f}"
events = {
    "url": {"type": "url_verification", "challenge": "byeye-challenge"},
    "top": {
        "type": "message",
        "channel": "C0CA7PPRP7A",
        "channel_type": "channel",
        "user": "U0BYEYE",
        "text": "Globex (QA) exports fail since this morning (by-eye test)",
        "ts": now,
    },
    "random": {
        "type": "message",
        "channel": "C0RANDOM",
        "channel_type": "channel",
        "user": "U0BYEYE",
        "text": "Globex (QA) lunch (by-eye test)",
        "ts": now,
    },
    "created": {"type": "channel_created", "channel": {"id": "C0BYEYE", "name": "byeye-new"}},
}
event = events[kind]
body = event if kind == "url" else {
    "type": "event_callback",
    "team_id": team,
    "api_app_id": "A0BYEYE",
    "event_id": f"Ev{int(time.time())}",
    "event_time": int(time.time()),
    "event": event,
}
raw = json.dumps(body).encode()
stamp = str(int(time.time()))
digest = hmac.new(secret.encode(), f"v0:{stamp}:".encode() + raw, hashlib.sha256).hexdigest()
request = urllib.request.Request(
    "http://localhost:8019/api/v1/connectors/slack/events/",
    data=raw,
    method="POST",
    headers={
        "Content-Type": "application/json",
        "X-Slack-Request-Timestamp": stamp,
        "X-Slack-Signature": "v0=" + digest,
    },
)
with urllib.request.urlopen(request, timeout=10) as answer:
    print(answer.status, answer.read()[:200])
```

   `url` prints `200 b'{"challenge": "byeye-challenge"}'`. `top` prints `200 b''` and, after a refresh, Globex (QA) › Conversations shows the by-eye message and Choose channels says "Events: receiving. The last one arrived ... ago.". With `#random` switched off, `random` stores nothing (no new conversation anywhere). `created` adds `#byeye-new` to the list. With one character of the secret file changed, any kind answers 401.
7. **Check in Chrome** (playwright-cli), 1440x900 and 390x844, light and dark, as Tushar: Settings › Connections › Slack reads "syncs N of M public channels"; Choose channels shows the summary, the events line, the join note with Approve again (before the scope) and none after, the search, every row's meta line ("Joins on the next sync" / "Revenact isn't in it", "Someone removed Revenact from it", "Shared with another company · Not synced"), the switches (44px tall on a phone), Customer opens the form under its row and saves, the status line, a refusal under a row (PATCH a channel to a customer the connection doesn't cover: scope connection 7 to Initech in the shell first); no horizontal scroll at 390px; the connect form asks for the token alone.
8. Write findings to `<scratchpad>/slackd3-fe-byeye/findings.md` with screenshots; fix should-fix items test first; stop the servers; leave `revenact_slackd3` for the owner to drop.

- [ ] **Step 5: Commit and push**

```bash
git add src/e2e/slackChannels.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "test(e2e): choosing slack channels in settings; docs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push origin feat/slack-escalations-d3
```

Hand-off (to the controller, not a PR): the head, the vitest count, the by-eye findings, and anything the backend's "Changes during the build" changed.

- [ ] **Step 6: The owner's set-up and live checks (after both PRs merge and deploy; the owner runs them)**

Slack must reach the Request URL over the internet, so the live check runs on the deployed backend on Cloud Run, not on this Mac. (A tunnel to a local server would work, but a Slack app has one Request URL, so it would take events away from the deployment while it is set.) Set-up, once, at api.slack.com/apps › the Alfiee app:

1. **Event Subscriptions** › Enable Events: on. **Request URL**: `https://revenact-web-605430842839.asia-south1.run.app/api/v1/connectors/slack/events/`. Slack shows "Verified" at once (the deployment's `SLACK_SIGNING_SECRET` must be this app's Signing Secret, Basic Information › App Credentials; it is Secret Manager's `slack-signing-secret`).
2. **Subscribe to bot events:** `message.channels` and `channel_created`. Save Changes.
3. **OAuth & Permissions** › Bot Token Scopes: add `channels:join`.
4. **Reinstall to workspace** (Slack asks after a scope change); then in Revenact, Settings › Connections › Slack › Reconnect › Sign in with Slack (or paste the new bot token).

- **LC-D3a** Right after the deploy (before the set-up): the Slack connection still reads `#all-alfiee`, slowly (the catch-up); Choose channels lists every public channel, the others with "Revenact isn't in it" and the join note; "Events: not set up."
- **LC-D3b** After the set-up: post "Globex's invoices look off" in `#all-alfiee`; within seconds (refresh) it is under Globex (QA) › Conversations; Choose channels says "Events: receiving."
- **LC-D3c** Create `#alfiee-escalations` in Slack: it shows as joined within seconds with no invite; a message there naming Globex is filed under Globex (QA).
- **LC-D3d** Turn `#random` off: a new message there is not filed. Set `#alfiee-escalations` to Globex (QA): "Can someone look at this?" there is filed under Globex.

---

## Self-review

1. **Contract coverage.** §2.1 `slack_channels` with `events_at` (Tasks 1, 4); §2.2 the row (Task 1 types, Task 3 display); §3.1 the list with `can_join`, `synced`, `total`, `events_at` (Tasks 1, 3); SC3-30 the events line (Tasks 1, 3, 5); SC3-3 "removed" (Task 1); §3.3 the Events endpoint has no screen: the by-eye script (Task 5 Step 4) and the owner's set-up (Step 6) exercise it; §3.2 the PATCH and every refusal shown verbatim under its row or in its form (Tasks 1 to 3); SC3-4 / SC3-12 defaults and Slack Connect words (Tasks 1, 3); SC3-13 the token-only connect form (no change: `setup.fields`); SC3-14 the join note and Approve again (Tasks 3, 4); SC3-8 "Choose its customer" replaced by the per-channel customer (Tasks 2 to 4). Spec §16.1 items 1 to 5 and 8 are on screen; items 6, 7 and 9 are the server's (no screen). §11 LC-D3a to d: Task 5 Step 6.
2. **Placeholders.** Each code step holds its code; the one `...` (Task 2 Step 3) is today's JSX kept unchanged, said so. Notes name an exact alternative only where the codebase may name a helper differently.
3. **Type consistency.** `SlackChannelRow`, `SlackChannelList`, `ChannelChange` (Task 1) are what `SlackChannelsPanel` (Task 3) renders and sends and `stubSlackChannels` answers; `ChannelCustomerForm`'s `onSave(record) -> Promise<string | null>` (Task 2) is what Task 3's `change` returns; `scopeText` (Task 1) is what `slackScope` reads (Task 4); `CHANNEL_ROWS`' ids (`C0CA7PPRP7A`, `C0RANDOM`, `C0GLOBEX`, `C0SHARED`) are the same in every test.
