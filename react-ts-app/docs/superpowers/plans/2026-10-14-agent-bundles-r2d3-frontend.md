# Agent bundles, round 2 delivery 3 ("Wider intake"): frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A department queue (and Unassigned) shows the Slack and Jira messages that matched no customer under "Needs a customer", with their count on the rail; its people match one to a customer or account (optionally adding the sender as a contact) or dismiss it. Settings › Agents gains a "Fast lane" section where admins switch the rules-only fast lane on, choose its rules and lower its caps, and everyone sees today's use. If the backend built F1, a Jira step in a service project can carry a request type.

**Architecture:** No new route in the app. `features/work/unmatched.ts` (types, three `apiFetch` wrappers, words and pure rules) and `components/work/NeedsCustomer.tsx` (the list, its rows, the dismiss confirm) with `components/work/MatchDialog.tsx` (built on `BuilderDialog` and the existing `RecordStep` search). `TeamQueue` draws `NeedsCustomer` above its groups for routed queues. The rail adds `needs_customer` to each count. `components/agents/FastLane.tsx` (form for admins, summary for members) sits under `MessageSources` in `AgentsForm` / `AgentsSummary`, saving through `patchAgentSettings` with `useInstantSave`. F1 adds a request type `PickSearch` in `BundleOutsideFields`.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), react-router 7, Redux Toolkit (unchanged slices), Tailwind v4 tokens, Vitest + Testing Library (jsdom) + user-event, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-13-agent-bundles-design.md` §13 (items D and E as revised on this branch; §13.4; the R2-D3 row of §13.5; owner decisions 11 and 12; §13.10). **API contract (binding, read-only):** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/r2d3-be/docs/superpowers/plans/2026-10-14-agent-bundles-r2d3-api.md` (backend branch `feat/agent-bundles-r2d3`). Read its "Decisions narrowing the spec" first (R2D3-1 to R2D3-24); §3 (the list, match, dismiss), §4 (the rail), §5 (the fast lane) and §6 (F1) are the stubs' and types' source of truth. The R2-D2 frontend plan and its merged code (#145, #146) hold the house style this plan extends.

## Global Constraints

- **Worktree and branch.** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/r2d3-fe`, branch `feat/agent-bundles-r2d3` (on main `40acba73`: R2-D2 #145 and its fixes #146 merged; its first commit holds this plan and the spec's §13 revision). Link `node_modules` once: `ln -s ../main-fe/node_modules node_modules` (never commit it). Always `git add <explicit paths>` (and `git rm` for deletions), never `git add -A` or `git add .`. Never merge, never open a PR, never touch the servers on ports 8000 or 5173 (the owner uses them; the by-eye run in Task 9 uses 8016 and 5186).
- **Never run prettier. Never use `git stash`** (the stash stack is shared across worktrees).
- **Commands** (foreground): `npx vitest run <path> --maxWorkers=2`, `npx vitest run --maxWorkers=2`, `npx tsc -b`, `npm run lint`, `npm run build`. CI is blocked by GitHub billing: these local checks are the gate. Every task ends with `npx tsc -b` clean as well as its tests.
- **Every commit message is a conventional commit and ends with exactly this line:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Contract shapes are binding.** Stubs answer exactly the contract's shapes and sentences; refusals are shown verbatim.
- **Tokens only** (`src/test/houseRules.ts` `RAW`): no hex, `rgb()`, named palette colours.
- **Type sizes 11/13/15 only**, through `TYPE.*`, `FIELD_ERROR`, `FORM_ALERT`; no `font-bold`, no `shadow-sm`/`shadow-md`, no `disabled:opacity-*`. **The UI ratchet** (`src/test/uiRatchet.test.ts`) ends each task with totals **equal** to `BASELINE`: new code adds zero offences (never raise a baseline).
- **Kinso look and the UI cleanup rules:** bordered quiet cards, flat `divide-y` rows, monochrome primary (`PRIMARY`), **one primary per surface**: a queue has none (its rows' "Match to a customer" is bordered `BUTTON`, "Dismiss" is `QUIET`); the match dialog's **Match** is its one primary; Settings › Agents keeps its existing controls (switches save at once, no primary added). Lucide icons only, each `aria-hidden="true"`; no emoji.
- **44px targets** on phones for every `<button>`, `<a>`, `<select>`, `<input>`, `<textarea>`: `BUTTON`, `PRIMARY`, `QUIET`, `INPUT`, `SELECT`, `META_LINK`, or a local `const` built from one.
- **No em dash (`—`) anywhere** in `src/components/work/`, `src/pages/work/`, `src/features/work/`, `src/features/agents/bundle*`, `src/features/agents/testBundle*`, `src/components/agents/FastLane*`, `src/features/agents/fastLane*`; comments and tests included. No em dash in any new copy anywhere.
- **Copy:** sentence case, plain words; the contract's and this plan's sentences word for word; server sentences shown verbatim.
- **States:** the list has loading ("Loading messages that need a customer"), its read error (`role="alert"`, "Could not load the messages that need a customer." with Retry), empty (the section is not drawn), and a busy word on its buttons ("Matching…", "Dismissing…"). The fast lane section has the instant-save states of `MessageSources` (busy switch, Undo toast, refusal under the field).
- **Motion:** none added.
- **Privacy:** the page shows only what the server sends. The list exists only in queues the server lists for the reader; a 403 `SCOPE_NOT_ALLOWED` reloads the rail as today (`isQueueRefusal`). The sender's email is shown only inside the queue.
- **Testing:** unit + integration + e2e (jsdom, `src/e2e/`), only `fetch` stubbed with contract-shaped stubs and fake data. Never mock the store. Nothing real is sent; no test reaches Slack, Jira, Google, Microsoft or a model.

## Decisions (frontend, where the spec and the contract leave a choice)

1. **Where the list sits.** In a department or Unassigned queue, a `ListCard` titled "Needs a customer" with its count (`h3`, as the queue's groups) above "To decide". Not drawn when the queue has none. The queue's empty state shows only when both the bundles and the list are empty. Cost: low.
2. **A row** (flat `divide-y`): the title (`TYPE.body`, `font-semibold`), a meta line "Jira SUP · SUP-31 · from Ann Lee (ann@newco.io) · 9:12 AM" (connector name, number, sender, `whenText(last_seen_at)`: a clock time today, "7 Oct 2026, 9:12 AM" another day), the text clamped to 3 lines with "Show all" / "Show less" (`QUIET`) when it is longer than 280 characters, a meta line "Deleted on 13 Nov if no one matches it.", and the actions: **Match to a customer** (`BUTTON`), **Dismiss** (`QUIET`), and "Open in Jira" / "Open in Slack" (`META_LINK`, external, `rel="noreferrer"`) when `url` is set. A `critical` priority shows the existing priority chip used on ticket rows (find it: `grep -rn "critical" src/components/organizations/activity | head`), else nothing. Cost: low.
3. **Matching** opens "Match to a customer" (a `BuilderDialog`): `RecordStep` with the heading "Customer or account" (the same search Work's New task uses), and, when `can_add_contact`, a checkbox "Also add ann@newco.io as a contact of the record, so their next messages match by themselves." (unchecked by default). **Match** is the primary ("Matching…" while busy). Field refusals (`record`, `add_contact`) sit under their field; `NOT_COVERED` and `GONE` show as the dialog's alert (`FORM_ALERT`, `role="alert"`), and `GONE` also removes the row behind the dialog. Success closes the dialog, removes the row, decrements the count and shows the queue's toast "Matched to Pizza Hut. An agent reads it at the next run." (`WorkToast`, as the queue's other outcomes). Cost: low.
4. **Dismissing** asks first (`ConfirmDialog`): title "Dismiss this message?", message "It leaves this list and its text is deleted now. Revenact won't list it again.", confirm "Dismiss". Success removes the row and shows "Dismissed." in the toast. Cost: trivial.
5. **The rail** shows `count + needs_customer` for a routed queue when both are numbers (`count` alone when `needs_customer` is null); the phone select's option text likewise. Cost: trivial.
6. **"Show more"** pages the list 25 at a time with the server's cursor, as the feed groups do; a 400 `cursor` refusal reloads the list from the top. Cost: trivial.
7. **The fast lane in Settings › Agents** is a `SettingsSection` "Fast lane" under "Reading messages":
   - row "Fast lane": a `Switch`, hint "Urgent conversations are read after 2 quiet minutes instead of on the schedule above. Rules decide what is urgent, never AI. Each conversation read uses AI credits.";
   - when on: "Jira's top priority" (switch, hint "Highest, Blocker or Critical"), "Slack channels" (one checkbox per `slack_choices` row; hint "Every message in these channels is urgent."; when there are none, "No Slack connection yet."), "Words" and "Senders" (a tag list: an input and **Add** (`BUTTON`), each tag a chip with a remove button "Remove outage"; hints "Up to 20 words or phrases. Whole words, any case." and "Up to 50 email addresses or @domains."), "Customers in poor health" (switch, hint "Health score below 4."), "Limits" (two selects "Per hour" 0 to 10 and "Per day" 0 to 50);
   - a meta line "Used in the last hour: 1 of 10. In the last 24 hours: 3 of 50.";
   - every change saves at once with Undo (`useInstantSave`, as `MessageSources`); a refusal shows under its row.
   - Members see `FastLaneSummary`: "Fast lane: On" / "Off", and when on the rules as text and the same use line. Cost: low.
8. **F1** (only if the backend's "Changes during the build" says F1 was built): under "Issue type", a `PickSearch` "Request type" over `jira_request_types` (with the step's project), shown when `step.editable` holds `request_type`; "None" clears it; the list's `note` shows under it as a meta line; hint "Service projects only: sets the request type so it shows in the customer portal and in request-type queues." The preview line adds "Request type: Report a bug" when set. Cost: low.

## File Structure

**Create**
- `src/features/work/unmatched.ts` (+ `unmatched.test.ts`): types, `fetchUnmatched`, `matchUnmatched`, `dismissUnmatched`, words (`UNMATCHED`), `metaLine`, `deletesText`, `railCount`.
- `src/features/work/testUnmatched.ts` (+ `testUnmatched.test.ts`): `stubUnmatched`, fixtures `ITEMS_CS`, `ITEM_JIRA`, `ITEM_SLACK`.
- `src/components/work/NeedsCustomer.tsx` (+ `.test.tsx`), `src/components/work/MatchDialog.tsx` (+ `.test.tsx`).
- `src/features/agents/fastLaneText.ts` (+ `.test.ts`): words and rules for the section.
- `src/components/agents/FastLane.tsx` (+ `.test.tsx`).
- `src/e2e/round2Intake.test.tsx`.

**Modify**
- `src/features/agents/bundleTypes.ts` (`QueueRow.needs_customer`), `src/features/agents/agentTypes.ts` (`FastLaneSettings`, `AgentSettingsPatch.fast_lane`), `src/features/agents/testAgents.ts` (+ fixtures), `src/features/agents/testBundles.ts` (rail rows), `src/features/work/queues.ts` (`optionText`).
- `src/components/work/QueueRail.tsx`, `src/components/work/TeamQueue.tsx`, `src/components/agents/AgentsForm.tsx`, `src/components/agents/AgentsSummary.tsx`.
- F1 only: `src/features/agents/bundleTypes.ts` (`PickListName`), `agentTypes.ts` (`JiraPreview.request_type`), `bundleText.ts`, `src/components/work/BundleOutsideFields.tsx` (+ test), `testBundleFixtures.ts`.
- Docs (Task 9): `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`.

---

### Task 1: Types and the API

**Files:**
- Create: `src/features/work/unmatched.ts`, `src/features/work/unmatched.test.ts`
- Modify: `src/features/agents/bundleTypes.ts`, `src/features/agents/agentTypes.ts`

**Interfaces:**
- Produces (`bundleTypes.ts`): `QueueRow.needs_customer?: number | null` (optional: an older backend omits it).
- Produces (`agentTypes.ts`): `FastLaneRules { jira_priority: boolean; slack_connectors: number[]; senders: string[]; words: string[]; poor_health: boolean }`, `FastLaneSettings { on: boolean; rules: FastLaneRules; per_hour: number; per_day: number; used_hour: number; used_day: number; limits: { per_hour: number; per_day: number; senders: number; words: number }; slack_choices: { id: number; name: string }[] }`; `SignalSettings.fast_lane?: FastLaneSettings`; `AgentSettingsPatch.fast_lane?: { on?: boolean; rules?: Partial<FastLaneRules>; per_hour?: number; per_day?: number }`.
- Produces (`unmatched.ts`): `UnmatchedItem { id: number; source: 'slack' | 'jira'; connector: { id: number; name: string }; number: string; title: string; text: string; from: { name: string; email: string }; url: string; priority: string; opened_on: string; last_seen_at: string; deletes_on: string; can_add_contact: boolean }`, `UnmatchedPage { queue: string; count: number; items: UnmatchedItem[]; next: string | null }`, `MatchAnswer { ticket: { id: number; number: string; record: { type: 'customer' | 'account'; id: number; name: string } }; contact_added: boolean }`, `fetchUnmatched(queue, cursor?)`, `matchUnmatched(id, body)`, `dismissUnmatched(id)`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/work/unmatched.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dismissUnmatched, fetchUnmatched, matchUnmatched } from './unmatched';

afterEach(() => vi.unstubAllGlobals());

function spy(body: unknown, status = 200) {
  const fetchSpy = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

const urlOf = (s: ReturnType<typeof spy>, n = 0) => String((s.mock.calls[n] as unknown[])[0]);
const initOf = (s: ReturnType<typeof spy>, n = 0) => (s.mock.calls[n] as unknown[])[1] as RequestInit;

describe('unmatched api (round 2 D3 contract §3)', () => {
  it('reads a queue, and its next page by cursor', async () => {
    const s = spy({ queue: 'department:cs', count: 0, items: [], next: null });
    await fetchUnmatched('department:cs');
    await fetchUnmatched('department:cs', 'abc=');
    expect(urlOf(s)).toContain('/work/unmatched/?queue=department%3Acs');
    expect(urlOf(s, 1)).toContain('cursor=abc%3D');
  });

  it('matches with one record and the contact choice', async () => {
    const s = spy({ ticket: { id: 1, number: 'SUP-31', record: { type: 'customer', id: 4, name: 'Newco' } }, contact_added: true });
    await matchUnmatched(41, { customer_id: 4, add_contact: true });
    expect(urlOf(s)).toContain('/work/unmatched/41/match/');
    expect(initOf(s).method).toBe('POST');
    expect(JSON.parse(String(initOf(s).body))).toEqual({ customer_id: 4, add_contact: true });
  });

  it('dismisses', async () => {
    const s = spy({ dismissed: true });
    await dismissUnmatched(41);
    expect(urlOf(s)).toContain('/work/unmatched/41/dismiss/');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/work/unmatched.test.ts --maxWorkers=2`
Expected: FAIL: module not found.

- [ ] **Step 3: The module's API half**

Create `src/features/work/unmatched.ts`:

```ts
// The "Needs a customer" list (agent bundles round 2 D3 contract §3, §4;
// frontend Decisions 1 to 6). Kept free of React. No em dash.
import { apiFetch } from '../../lib/apiClient';

export interface UnmatchedItem {
  id: number;
  source: 'slack' | 'jira';
  connector: { id: number; name: string };
  number: string;
  title: string;
  text: string;
  from: { name: string; email: string };
  url: string;
  priority: string;
  opened_on: string;
  last_seen_at: string;
  deletes_on: string;
  can_add_contact: boolean;
}

export interface UnmatchedPage {
  queue: string;
  count: number;
  items: UnmatchedItem[];
  next: string | null;
}

export interface MatchBody {
  customer_id?: number;
  account_id?: number;
  add_contact?: boolean;
}

export interface MatchAnswer {
  ticket: { id: number; number: string; record: { type: 'customer' | 'account'; id: number; name: string } };
  contact_added: boolean;
}

export function fetchUnmatched(queue: string, cursor?: string | null) {
  const query = new URLSearchParams({ queue });
  if (cursor) query.set('cursor', cursor);
  return apiFetch<UnmatchedPage>(`/work/unmatched/?${query.toString()}`);
}

export const matchUnmatched = (id: number, body: MatchBody) => apiFetch<MatchAnswer>(`/work/unmatched/${id}/match/`, { method: 'POST', body });

export const dismissUnmatched = (id: number) => apiFetch<{ dismissed: true }>(`/work/unmatched/${id}/dismiss/`, { method: 'POST', body: {} });
```

(Check `apiFetch`'s body option: `grep -n "export async function apiFetch" -A 20 src/lib/apiClient.ts`; the other wrappers pass a plain object.)

- [ ] **Step 4: The types**

`bundleTypes.ts` `QueueRow`:

```ts
  /** Round 2 D3 (contract §4): messages needing a customer in a routed
   *  queue; null elsewhere or when it could not be counted; absent from an
   *  older backend. */
  needs_customer?: number | null;
```

`agentTypes.ts`: the fast lane types above, `SignalSettings.fast_lane?: FastLaneSettings`, `AgentSettingsPatch.fast_lane?`.

- [ ] **Step 5: Run them to see them pass**

Run: `npx vitest run src/features/work --maxWorkers=2 && npx tsc -b`
Expected: PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/work/unmatched.ts src/features/work/unmatched.test.ts src/features/agents/bundleTypes.ts src/features/agents/agentTypes.ts
git commit -m "feat(work): types and calls for messages that need a customer and the fast lane

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The words

**Files:**
- Modify: `src/features/work/unmatched.ts`, `src/features/work/unmatched.test.ts`, `src/features/work/queues.ts` (+ its test)
- Create: `src/features/agents/fastLaneText.ts`, `src/features/agents/fastLaneText.test.ts`

**Interfaces:**
- Produces (`unmatched.ts`): `UNMATCHED` (every fixed sentence of Decisions 1 to 6), `metaLine(item, now?)`, `deletesText(isoDate)`, `addContactText(email)`, `matchedText(name)`, `openText(source)`, `isLong(text)` (over 280 characters).
- Produces (`queues.ts`): `railCount(row): number | null`; `optionText` uses it.
- Produces (`fastLaneText.ts`): `FAST_LANE` (every fixed sentence of Decision 7), `usedLine(lane)`, `rulesSummary(lane)`.

- [ ] **Step 1: Write the failing tests**

Append to `unmatched.test.ts`:

```ts
import { UNMATCHED, addContactText, deletesText, isLong, matchedText, metaLine, openText } from './unmatched';
import { ITEM_JIRA, ITEM_SLACK } from './testUnmatched';

describe('unmatched words (frontend Decisions 1 to 4)', () => {
  it('says where it came from and who sent it', () => {
    const now = new Date('2026-10-14T11:12:00Z');
    expect(metaLine(ITEM_JIRA, now)).toBe(`Jira SUP · SUP-31 · from Ann Lee (ann@newco.io) · ${whenText(ITEM_JIRA.last_seen_at, now)}`);
    expect(metaLine({ ...ITEM_SLACK, from: { name: '', email: '' } }, new Date('2026-10-14T11:12:00Z'))).toMatch(/^Slack #support · SL-\d+ · from someone · /);
  });

  it('dates, offers and outcomes', () => {
    expect(deletesText('2026-11-13')).toBe('Deleted on 13 Nov if no one matches it.');
    expect(addContactText('ann@newco.io')).toBe('Also add ann@newco.io as a contact of the record, so their next messages match by themselves.');
    expect(matchedText('Pizza Hut')).toBe('Matched to Pizza Hut. An agent reads it at the next run.');
    expect(openText('jira')).toBe('Open in Jira');
    expect(isLong('x'.repeat(281))).toBe(true);
    expect(UNMATCHED.TITLE).toBe('Needs a customer');
  });
});
```

(Import `whenText` from `../agents/whenText` in the test: it writes a clock time for today and a date and time otherwise, in the reader's time zone, so the expectation is built with it rather than hard-coded.)

`fastLaneText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FAST_LANE, rulesSummary, usedLine } from './fastLaneText';
import { FAST_LANE_ON } from './testAgentsFixtures';

describe('fast lane words (frontend Decision 7)', () => {
  it('says what was used against the caps', () => {
    expect(usedLine(FAST_LANE_ON)).toBe('Used in the last hour: 1 of 10. In the last 24 hours: 3 of 50.');
  });

  it('summarises the rules for a member', () => {
    expect(rulesSummary(FAST_LANE_ON)).toBe("Jira's top priority; Slack #support; words: outage, data loss; senders: @bigco.com");
    expect(FAST_LANE.TITLE).toBe('Fast lane');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/work/unmatched.test.ts src/features/agents/fastLaneText.test.ts --maxWorkers=2`
Expected: FAIL: missing exports and fixtures (the fixtures come in Task 3: write Task 3's fixture files first if the order blocks you, then return).

- [ ] **Step 3: The words**

In `unmatched.ts`:

```ts
import { whenText } from '../agents/whenText';

export const UNMATCHED = {
  TITLE: 'Needs a customer',
  LOADING: 'Loading messages that need a customer',
  LOAD: 'Could not load the messages that need a customer.',
  MATCH: 'Match to a customer',
  MATCHING: 'Matching…',
  MATCH_TITLE: 'Match to a customer',
  MATCH_CONFIRM: 'Match',
  RECORD: 'Customer or account',
  DISMISS: 'Dismiss',
  DISMISSING: 'Dismissing…',
  DISMISS_TITLE: 'Dismiss this message?',
  DISMISS_MESSAGE: "It leaves this list and its text is deleted now. Revenact won't list it again.",
  DISMISSED: 'Dismissed.',
  SHOW_ALL: 'Show all',
  SHOW_LESS: 'Show less',
  MORE: 'Show more',
  SOMEONE: 'someone',
  PICK_RECORD: 'Choose a customer or account first.',
} as const;

const LONG = 280;
export const isLong = (text: string) => text.length > LONG;

export function metaLine(item: UnmatchedItem, now: Date = new Date()): string {
  const who = item.from.name && item.from.email ? `${item.from.name} (${item.from.email})` : item.from.name || item.from.email || UNMATCHED.SOMEONE;
  return [item.connector.name, item.number, `from ${who}`, whenText(item.last_seen_at, now)].join(' · ');
}

export function deletesText(isoDate: string): string {
  const day = new Date(`${isoDate}T00:00:00`);
  return `Deleted on ${day.getDate()} ${day.toLocaleString('en-GB', { month: 'short' })} if no one matches it.`;
}

export const addContactText = (email: string) => `Also add ${email} as a contact of the record, so their next messages match by themselves.`;
export const matchedText = (name: string) => `Matched to ${name}. An agent reads it at the next run.`;
export const openText = (source: UnmatchedItem['source']) => (source === 'jira' ? 'Open in Jira' : 'Open in Slack');
```


`queues.ts`:

```ts
/** Round 2 D3 (Decision 5): a routed queue counts its bundles and its messages that need a customer. */
export const railCount = (row: QueueRow): number | null => (row.count === null ? null : row.count + (row.needs_customer ?? 0));

export const optionText = (row: QueueRow): string => {
  const count = railCount(row);
  return count === null ? row.label : `${row.label} (${count})`;
};
```

`fastLaneText.ts`: `FAST_LANE` holds every Decision 7 sentence (`TITLE`, `SWITCH: 'Fast lane'`, `HINT`, `JIRA`, `JIRA_HINT`, `SLACK`, `SLACK_HINT`, `NO_SLACK: 'No Slack connection yet.'`, `WORDS`, `WORDS_HINT`, `SENDERS`, `SENDERS_HINT`, `ADD: 'Add'`, `REMOVE: (t: string) => \`Remove ${t}\``, `HEALTH: 'Customers in poor health'`, `HEALTH_HINT: 'Health score below 4.'`, `LIMITS: 'Limits'`, `PER_HOUR: 'Per hour'`, `PER_DAY: 'Per day'`, `ON`, `OFF`), `usedLine(lane)` and `rulesSummary(lane)` (`"; "` between the active rules, the Slack names from `slack_choices`, "No rules yet." when none).

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/features/work src/features/agents --maxWorkers=2 && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/work/unmatched.ts src/features/work/unmatched.test.ts src/features/work/queues.ts src/features/work/queues.test.ts src/features/agents/fastLaneText.ts src/features/agents/fastLaneText.test.ts
git commit -m "feat(work): the words for messages that need a customer and the fast lane

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Stubs and fixtures

**Files:**
- Create: `src/features/work/testUnmatched.ts`, `src/features/work/testUnmatched.test.ts`
- Modify: `src/features/agents/testBundles.ts` (rail rows), `src/features/agents/testAgents.ts`, `src/features/agents/testAgentsFixtures.ts`

**Interfaces:**
- Produces: fixtures `ITEM_JIRA` (id 41, Jira SUP, SUP-31, Ann Lee, `can_add_contact: true`, `last_seen_at: '2026-10-14T09:12:00Z'`, `deletes_on: '2026-11-13'`), `ITEM_SLACK` (id 42, Slack #support, no `url`), `ITEMS_CS` (30 rows for paging); `stubUnmatched({ items?, refuseNextMatch?, refuseNextDismiss?, failList?, forbidden? })`: answers `GET /work/unmatched/` (25 a page, cursor `p2`), `POST …/match/` (removes the row, answers a `MatchAnswer` naming the picked record; refusals once) and `…/dismiss/`; returns `{ spy }`. `stubBundles`' rail rows gain `needs_customer` from `stub.needsCustomer?: Partial<Record<QueueKey, number>>` (default `null` for every row). Agents fixtures: `FAST_LANE_OFF`, `FAST_LANE_ON` (`on`, Jira rule, Slack 6 "Slack #support", words `outage`, `data loss`, senders `@bigco.com`, used 1 and 3); `stubAgents` answers `fast_lane` PATCHes exactly as contract §5.2 (merge; the per-hour over per-day refusal; any word under 2 characters refused with "Use 2 to 40 characters for each word.").

- [ ] **Step 1: Write the failing test** (`testUnmatched.test.ts`): the stub pages 30 rows as 25 + 5; a match removes the row and answers the record's name; `refuseNextMatch: { status: 409, body: { code: 'GONE', detail: 'Someone else dealt with this message. Reload the list.' } }` answers once.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/features/work/testUnmatched.test.ts --maxWorkers=2`
Expected: FAIL: module not found.

- [ ] **Step 3: Write the stub and fixtures** as listed (compose with the existing stubs the way `testJiraLink.ts` composes with `stubBundles`: the unmatched stub wraps the current global `fetch`, answers its own paths and passes every other request on: read `src/features/connectors/testJiraLink.ts` for the pattern).

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/features --maxWorkers=2 && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/work/testUnmatched.ts src/features/work/testUnmatched.test.ts src/features/agents/testBundles.ts src/features/agents/testAgents.ts src/features/agents/testAgentsFixtures.ts
git commit -m "test(work): stubs for messages that need a customer and the fast lane

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: "Needs a customer" in a routed queue

**Files:**
- Create: `src/components/work/NeedsCustomer.tsx`, `src/components/work/NeedsCustomer.test.tsx`
- Modify: `src/components/work/TeamQueue.tsx` (+ its test)

**Interfaces:**
- Consumes: `fetchUnmatched`, `dismissUnmatched`, `UNMATCHED`, `metaLine`, `deletesText`, `isLong`, `openText` (Tasks 1, 2).
- Produces: `NeedsCustomer({ queue, onCount, onToast, onRefused })` (`onCount(n)` lets the queue decide its empty state; `onToast(text)` uses the queue's `WorkToast`); `TeamQueue` draws it for a routed scope.

- [ ] **Step 1: Write the failing tests**

`NeedsCustomer.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { NeedsCustomer } from './NeedsCustomer';
import { ITEMS_CS, ITEM_JIRA } from '../../features/work/testUnmatched';
import { stubUnmatched } from '../../features/work/testUnmatched';

afterEach(() => vi.unstubAllGlobals());

function renderList(props: Partial<Parameters<typeof NeedsCustomer>[0]> = {}) {
  const onToast = vi.fn();
  const onCount = vi.fn();
  render(
    <MemoryRouter>
      <NeedsCustomer queue="department:cs" onCount={onCount} onToast={onToast} onRefused={() => false} {...props} />
    </MemoryRouter>,
  );
  return { onToast, onCount };
}

describe('NeedsCustomer (round 2 D3 frontend Decisions 1, 2, 4, 6)', () => {
  it('lists the messages with who sent them and when they go', async () => {
    stubUnmatched({ items: [ITEM_JIRA] });
    renderList();
    const list = await screen.findByRole('region', { name: /Needs a customer/ });
    expect(within(list).getByText('Export fails for the whole team')).toBeInTheDocument();
    expect(within(list).getByText(/from Ann Lee \(ann@newco\.io\)/)).toBeInTheDocument();
    expect(within(list).getByText('Deleted on 13 Nov if no one matches it.')).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Open in Jira' })).toHaveAttribute('href', ITEM_JIRA.url);
  });

  it('draws nothing when the queue has none', async () => {
    stubUnmatched({ items: [] });
    const { onCount } = renderList();
    await vi.waitFor(() => expect(onCount).toHaveBeenCalledWith(0));
    expect(screen.queryByRole('region', { name: /Needs a customer/ })).toBeNull();
  });

  it('pages 25 at a time', async () => {
    stubUnmatched({ items: ITEMS_CS });
    renderList();
    await screen.findByRole('region', { name: /Needs a customer \(30\)/ });
    expect(screen.getAllByRole('button', { name: 'Match to a customer' })).toHaveLength(25);
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(await screen.findAllByRole('button', { name: 'Match to a customer' })).toHaveLength(30);
  });

  it('dismisses after asking', async () => {
    stubUnmatched({ items: [ITEM_JIRA] });
    const { onToast } = renderList();
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    const dialog = screen.getByRole('dialog', { name: 'Dismiss this message?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Dismiss' }));
    await vi.waitFor(() => expect(onToast).toHaveBeenCalledWith('Dismissed.'));
    expect(screen.queryByText('Export fails for the whole team')).toBeNull();
  });

  it('says when the list could not load, with Retry', async () => {
    stubUnmatched({ items: [ITEM_JIRA], failList: 1 });
    renderList();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the messages that need a customer.');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Export fails for the whole team')).toBeInTheDocument();
  });

  it('shows the long text on request', async () => {
    stubUnmatched({ items: [{ ...ITEM_JIRA, text: 'word '.repeat(80) }] });
    renderList();
    await userEvent.click(await screen.findByRole('button', { name: 'Show all' }));
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument();
  });
});
```

`TeamQueue.test.tsx`: a routed queue with no bundles and one item shows the list and **not** the empty state; with neither, the empty state as today.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/work/NeedsCustomer.test.tsx src/components/work/TeamQueue.test.tsx --maxWorkers=2`
Expected: FAIL: module not found.

- [ ] **Step 3: The component**

`NeedsCustomer.tsx` (outline; follow `FeedGroups`' list markup and `ListCard` / `ErrorState` from `../ui`):

```tsx
/** "Needs a customer" (round 2 D3 frontend Decisions 1, 2, 4, 6): a routed
 *  queue's Slack and Jira messages that matched no customer, newest first,
 *  25 a page. Match opens MatchDialog; Dismiss asks first. Drawn only when
 *  there is at least one. */
export function NeedsCustomer({ queue, onCount, onToast, onRefused }: {
  queue: QueueKey;
  onCount: (count: number) => void;
  onToast: (text: string) => void;
  onRefused: (err: unknown) => boolean;
}) {
  // state: { items, count, next } | null, error, loadingMore, matching: UnmatchedItem | null, dismissing: UnmatchedItem | null, busyId
  // load(cursor?) -> fetchUnmatched(queue, cursor); a 403 goes to onRefused (the rail reloads);
  //   a 400 with a `cursor` key reloads from the top (Decision 6)
  // remove(id) -> drop the row, count - 1, onCount(count - 1)
  // render: nothing while count === 0; a <section aria-labelledby> with an h3 "Needs a customer (n)",
  //   a bordered card with <ul className="divide-y ..."> rows, "Show more" (QUIET) when next
}
```

Each row: title, meta line, the clamped text (`line-clamp-3` unless expanded), `deletesText`, actions (`BUTTON` "Match to a customer", `QUIET` "Dismiss", `META_LINK` "Open in …" with `target="_blank" rel="noreferrer"`). Dismiss: `ConfirmDialog` (from `../organizations/ConfirmDialog`; check its props), on confirm `dismissUnmatched(id)`; `GONE` (409) removes the row and toasts its `detail`; other errors toast `readRefusal(err, 'Could not dismiss that. Try again.').form` (check `readRefusal` in `workApi.ts`).

In `TeamQueue.tsx`, for `routed`: keep `const [needs, setNeeds] = useState<number | null>(null)`; render `<NeedsCustomer queue={scope} onCount={setNeeds} onToast={settle.toast-setter} onRefused={onRefused} />` between `<KindChips />` and `body`; the empty state shows only when `feedTotal(data) === 0 && (needs ?? 0) === 0`. (Find how the queue raises its toast: `grep -n "toast" src/components/work/useFeedSettle.ts`; if it has no plain "show this text" setter, keep a local `WorkToast` state in `NeedsCustomer` instead and render its own `WorkToast`.)

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/components/work --maxWorkers=2 && npx tsc -b && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS, tsc clean, ratchet equal.

- [ ] **Step 5: Commit**

```bash
git add src/components/work/NeedsCustomer.tsx src/components/work/NeedsCustomer.test.tsx src/components/work/TeamQueue.tsx src/components/work/TeamQueue.test.tsx
git commit -m "feat(work): a department queue lists the messages that need a customer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Match to a customer

**Files:**
- Create: `src/components/work/MatchDialog.tsx`, `src/components/work/MatchDialog.test.tsx`
- Modify: `src/components/work/NeedsCustomer.tsx` (+ test)

**Interfaces:**
- Consumes: `matchUnmatched`, `RecordStep` (`src/components/plans/RecordStep.tsx`), `BuilderDialog` (`src/components/segments/BuilderDialog.tsx`), `addContactText`, `matchedText`.
- Produces: `MatchDialog({ item, onMatched, onGone, onClose })`.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('MatchDialog (round 2 D3 frontend Decision 3)', () => {
  it('matches to the picked record and adds the contact when asked', async () => {
    const s = stubUnmatched({ items: [ITEM_JIRA] });
    stubRecordSearch([{ kind: 'organization', id: 4, name: 'Pizza Hut' }]); // the RecordStep search's stub: see QuickAdd.test.tsx
    const onMatched = vi.fn();
    renderDialog({ item: ITEM_JIRA, onMatched });
    await userEvent.type(screen.getByRole('searchbox', { name: /Customer or account/ }), 'piz');
    await userEvent.click(await screen.findByRole('button', { name: /Pizza Hut/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Also add ann@newco\.io/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Match' }));
    await vi.waitFor(() => expect(onMatched).toHaveBeenCalledWith(expect.objectContaining({ contact_added: true })));
    expect(sentBody(s.spy, '/match/')).toEqual({ customer_id: 4, add_contact: true });
  });

  it('asks for a record before matching', async () => {
    renderDialog({ item: ITEM_JIRA });
    await userEvent.click(screen.getByRole('button', { name: 'Match' }));
    expect(screen.getByText('Choose a customer or account first.')).toBeInTheDocument();
  });

  it('offers no contact when there is no email or it is known', () => {
    renderDialog({ item: { ...ITEM_JIRA, can_add_contact: false } });
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('shows a connection that does not cover the record', async () => {
    stubUnmatched({ items: [ITEM_JIRA], refuseNextMatch: { status: 409, body: { code: 'NOT_COVERED', detail: "Jira SUP doesn't cover Pizza Hut. Choose another, or change the connection in Settings." } } });
    // pick Pizza Hut and Match as above
    expect(await screen.findByRole('alert')).toHaveTextContent("Jira SUP doesn't cover Pizza Hut.");
  });

  it('a message dealt with meanwhile leaves the list', async () => {
    // refuseNextMatch GONE -> onGone(item.id) called and the alert shows the detail
  });
});
```

(Write the two outlined cases in full with the same steps as the first. Find how `QuickAdd.test.tsx` stubs the record search (`searchPlanRecords` reads `/customers/?search=` and `/accounts/?search=`, check `searchRecords` in `planApi.ts`) and reuse it.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/work/MatchDialog.test.tsx --maxWorkers=2`
Expected: FAIL: module not found.

- [ ] **Step 3: The dialog**

`MatchDialog.tsx`: a `BuilderDialog` titled "Match to a customer"; `RecordStep` with `heading={UNMATCHED.RECORD}`, `record`, `onPick`, `onClear`, `error={fieldError('record')}`; the checkbox (a native `<input type="checkbox">` in a `<label>` with `min-h-11` on phones) when `item.can_add_contact`; the alert line; **Match** (`PRIMARY`, `aria-disabled` while busy with "Matching…", as `RecordEditor`). Submit: no record → the local "Choose a customer or account first." under the record; else `matchUnmatched(item.id, { customer_id | account_id, add_contact })` (`record.kind === 'organization'` → `customer_id`). Answers: 200 → `onMatched(answer)`; 400 → field errors; 409 `NOT_COVERED` → alert; 409 `GONE` → alert and `onGone(item.id)`; others → `readRefusal`'s form sentence.

In `NeedsCustomer`, "Match to a customer" opens the dialog; `onMatched` removes the row, closes the dialog and toasts `matchedText(answer.ticket.record.name)`.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/components/work --maxWorkers=2 && npx tsc -b && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS, tsc clean, ratchet equal.

- [ ] **Step 5: Commit**

```bash
git add src/components/work/MatchDialog.tsx src/components/work/MatchDialog.test.tsx src/components/work/NeedsCustomer.tsx src/components/work/NeedsCustomer.test.tsx
git commit -m "feat(work): match a message to a customer, optionally adding the sender as a contact

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The rail counts them

**Files:**
- Modify: `src/components/work/QueueRail.tsx` (+ `QueueRail.test.tsx`)

**Interfaces:**
- Consumes: `railCount`, `optionText` (Task 2).

- [ ] **Step 1: Write the failing test**

```tsx
it('counts what needs a customer in a routed queue (round 2 D3 Decision 5)', () => {
  const rows: QueueRow[] = [
    { key: 'mine', label: 'Mine', count: 4, needs_customer: null },
    { key: 'department:cs', label: 'Customer Success', count: 2, needs_customer: 3 },
    { key: 'history', label: 'History', count: null, needs_customer: null },
  ];
  renderRail(rows, 'mine');
  expect(screen.getByRole('link', { name: /Customer Success/ })).toHaveTextContent('5');
});
```

(and the phone select's option "Customer Success (5)").

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/work/QueueRail.test.tsx --maxWorkers=2`
Expected: FAIL: shows 2.

- [ ] **Step 3: The count**

`QueueRail`: `const count = railCount(row);` and render `count` where `row.count` was. `QueueSelect` already goes through `optionText`.

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/components/work src/pages/work --maxWorkers=2 && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/work/QueueRail.tsx src/components/work/QueueRail.test.tsx
git commit -m "feat(work): the queue rail counts messages that need a customer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The fast lane in Settings › Agents

**Files:**
- Create: `src/components/agents/FastLane.tsx`, `src/components/agents/FastLane.test.tsx`
- Modify: `src/components/agents/AgentsForm.tsx`, `src/components/agents/AgentsSummary.tsx` (+ the page's test `src/pages/settings/AgentsSettingsPage.test.tsx`)

**Interfaces:**
- Consumes: `patchAgentSettings`, `useInstantSave`, `FAST_LANE`, `usedLine`, `rulesSummary` (Task 2), `FastLaneSettings` (Task 1).
- Produces: `FastLane({ settings, onSaved })` (admins), `FastLaneSummary({ settings })` (members); both render nothing when `settings.signals.fast_lane` is absent (an older backend).

- [ ] **Step 1: Write the failing tests**

```tsx
describe('FastLane (round 2 D3 frontend Decision 7)', () => {
  it('is off by default and shows its rules once switched on', async () => {
    const s = stubAgents({ fastLane: FAST_LANE_OFF });
    renderForm();
    const section = await screen.findByRole('region', { name: 'Fast lane' });
    expect(within(section).queryByRole('switch', { name: "Jira's top priority" })).toBeNull();
    await userEvent.click(within(section).getByRole('switch', { name: 'Fast lane' }));
    expect(sentBody(s.spy, '/agents/settings/')).toEqual({ fast_lane: { on: true } });
    expect(await within(section).findByRole('switch', { name: "Jira's top priority" })).toBeChecked();
  });

  it('adds and removes words, and shows a refusal under them', async () => {
    const s = stubAgents({ fastLane: FAST_LANE_ON });
    renderForm();
    const words = await screen.findByRole('group', { name: 'Words' });
    await userEvent.type(within(words).getByRole('textbox', { name: 'Words' }), 'x');
    await userEvent.click(within(words).getByRole('button', { name: 'Add' }));
    expect(await within(words).findByText('Use 2 to 40 characters for each word.')).toBeInTheDocument();
    await userEvent.click(within(words).getByRole('button', { name: 'Remove outage' }));
    expect(lastBody(s.spy, '/agents/settings/')).toEqual({ fast_lane: { rules: { words: ['data loss'] } } });
  });

  it('chooses Slack channels and lowers the caps', async () => {
    // tick "Slack #support" off -> { fast_lane: { rules: { slack_connectors: [] } } }
    // Per hour 5 -> { fast_lane: { per_hour: 5 } }; per hour over per day shows the server's sentence
  });

  it('says what was used', async () => {
    stubAgents({ fastLane: FAST_LANE_ON });
    renderForm();
    expect(await screen.findByText('Used in the last hour: 1 of 10. In the last 24 hours: 3 of 50.')).toBeInTheDocument();
  });

  it('a member reads a summary', async () => {
    stubAgents({ fastLane: FAST_LANE_ON, canEdit: false });
    renderPage();
    expect(await screen.findByText("Jira's top priority; Slack #support; words: outage, data loss; senders: @bigco.com")).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Fast lane' })).toBeNull();
  });
});
```

(Write the outlined case in full. Match `renderForm` / `renderPage` / `sentBody` to `MessageSources.test.tsx` and `AgentsSettingsPage.test.tsx`; the senders list repeats the words case once with `@bigco` refused by the stub with "Use an email address or @domain for each sender.")

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/agents/FastLane.test.tsx --maxWorkers=2`
Expected: FAIL: module not found.

- [ ] **Step 3: The section**

`FastLane.tsx`, shaped like `MessageSources` (same `useInstantSave` `save(key, patch, back)` helper and refusal state):

- `SettingsSection title={FAST_LANE.TITLE}` (the section's heading names the region);
- the "Fast lane" `SettingsRow` + `Switch` (patch `{ fast_lane: { on } }`, back the old value);
- when `lane.on`: the rows of Decision 7. The tag lists are one small local component `TagList({ label, hint, values, max, onSave })` (a `role="group"` labelled by its row, an `INPUT` with `aria-label={label}`, **Add** (`BUTTON`) and Enter add a trimmed value (no client validation beyond empty; the server's sentence is shown), chips with a remove button `aria-label={FAST_LANE.REMOVE(value)}` (`QUIET`, 44px on phones), a meta "n of max");
- Slack: one checkbox per `slack_choices` row (patch the whole `slack_connectors` list); none → the `NO_SLACK` line;
- Limits: two `Select`s with options 0 to `limits.per_hour` and 0 to `limits.per_day`;
- the use line (`TYPE.meta`).

Refusals: `readSignalRefusal` reads the page's 400 by key today; add `readFastLaneRefusal(err)` in `agentsApi.ts` (with a test) that returns `{ on, words, senders, slack_connectors, jira_priority, poor_health, per_hour, per_day, form }` from `body.fast_lane` (nested under `rules` for the rule keys).

`AgentsForm`: `<FastLane settings={settings} onSaved={onSaved} />` right after `<MessageSources … />`. `AgentsSummary`: `<FastLaneSummary settings={settings} />` after `MessageSourcesSummary`.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/components/agents src/pages/settings src/features/agents --maxWorkers=2 && npx tsc -b && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS, tsc clean, ratchet equal.

- [ ] **Step 5: Commit**

```bash
git add src/components/agents/FastLane.tsx src/components/agents/FastLane.test.tsx src/components/agents/AgentsForm.tsx src/components/agents/AgentsSummary.tsx src/features/agents/agentsApi.ts src/features/agents/agentsApi.test.ts src/pages/settings/AgentsSettingsPage.test.tsx
git commit -m "feat(agents): set the fast lane's rules and limits in Settings, see what it used

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: F1, the request type on a Jira step (only if the backend built F1)

**Gate:** read the backend contract's "Changes during the build". If it says "F1 not built: documented", skip this task (record it in the hand-off). Otherwise build it as below.

**Files:**
- Modify: `src/features/agents/bundleTypes.ts` (`PickListName` gains `'jira_request_types'`), `src/features/agents/agentTypes.ts` (`JiraPreview.request_type?: string | null`), `src/features/agents/bundleText.ts` (+ test), `src/features/agents/testBundleFixtures.ts`, `src/features/agents/testBundles.ts`, `src/components/work/BundleOutsideFields.tsx` (+ test)

**Interfaces:**
- Produces: `OUTSIDE.REQUEST_TYPE: 'Request type'`, `OUTSIDE.REQUEST_TYPE_HINT`, `requestTypeLine(name)` ("Request type: Report a bug"); a `B_JSM` fixture (a `jira.create` step with `request_type` editable, project `SUP`).

- [ ] **Step 1: Write the failing tests** (`BundleOutsideFields.test.tsx`): with `B_JSM`, a "Request type" search lists "Report a bug (Bug)" from `options.jira_request_types` and choosing it sends `{ request_type: { id: '12', name: 'Report a bug' } }` on Run; with project `ENG` the list shows the note "ENG isn't a Jira Service Management project."; a step whose `editable` lacks `request_type` shows no field; changing the project clears it.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/work/BundleOutsideFields.test.tsx --maxWorkers=2`
Expected: FAIL.

- [ ] **Step 3: The field** (Decision 8): a `PickSearch` under "Issue type" over `usePickList({ list: 'jira_request_types', project, enabled: can('request_type') && Boolean(project) })`, "None" clears (`onField('request_type', null)`), the note under it; the project's `onChange` also sets `request_type` to `null`; the preview's Jira line adds `requestTypeLine` when set.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/components/work src/features/agents --maxWorkers=2 && npx tsc -b && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/agents/bundleTypes.ts src/features/agents/agentTypes.ts src/features/agents/bundleText.ts src/features/agents/bundleText.test.ts src/features/agents/testBundleFixtures.ts src/features/agents/testBundles.ts src/components/work/BundleOutsideFields.tsx src/components/work/BundleOutsideFields.test.tsx
git commit -m "feat(work): choose a service project's request type on a Jira step

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The journeys, the docs, the full check and by eye

**Files:**
- Create: `src/e2e/round2Intake.test.tsx`
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`

- [ ] **Step 1: The journeys**

`src/e2e/round2Intake.test.tsx` (jsdom, the real router and pages, only `fetch` stubbed in the contract's shapes; build on `renderWork` from `src/pages/work/testPages.tsx` and `stubBundles({ departments: [{ key: 'cs', label: 'Customer Success' }], needsCustomer: { 'department:cs': 2 } })` composed with `stubUnmatched`):

1. **Carl matches a stranger's message.** `/work?queue=department:cs`: the rail reads "Customer Success" with 2; "Needs a customer (2)" lists Ann's Jira message; Match to a customer → search "piz" → Pizza Hut → tick the contact → Match; the toast "Matched to Pizza Hut. An agent reads it at the next run."; the list reads "(1)".
2. **He dismisses the other** after the confirm; the section disappears and the queue shows its empty state.
3. **Alice switches the fast lane on** at `/settings/agents` (find the route with `grep -rn "AgentsSettingsPage" src/App.tsx src/routes* 2>/dev/null`), adds the word "outage", and sees the use line; a member sees the summary.

Run: `npx vitest run src/e2e --maxWorkers=2`
Expected: PASS (and every earlier journey).

- [ ] **Step 2: The docs**

- `docs/03-ui-ux-design.md`: "Needs a customer" in a routed queue (Decisions 1, 2, 6), the match dialog (Decision 3), dismiss (Decision 4), the rail count (Decision 5), Settings › Agents › Fast lane (Decision 7), the request type field (Decision 8, or "not built").
- `docs/04-app-flow.md`: matching a message to a customer and what happens next (ticket, contact, the next run); dismissing; switching the fast lane on.
- `.agents/workflows/repo-architecture.md`: `features/work/unmatched.ts`, `testUnmatched.ts`, `NeedsCustomer.tsx`, `MatchDialog.tsx`, `features/agents/fastLaneText.ts`, `FastLane.tsx`.

- [ ] **Step 3: The full check**

```bash
npx vitest run --maxWorkers=2
npx tsc -b
npm run lint
npm run build
npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2
grep -rn "—" src/components/work src/pages/work src/features/work src/features/agents/bundle* src/features/agents/testBundle* src/components/agents/FastLane* src/features/agents/fastLane* || echo "no em dash"
```

Expected: every test passes (write the count into the hand-off), `tsc` clean, lint clean, build OK, ratchet totals equal to `BASELINE`, "no em dash".

- [ ] **Step 4: By eye, on a database copy, in the Alfee workspace, with fake credentials**

Nothing real is sent, nothing is synced from a real Slack or Jira, and no model is called.

1. **Copy the dev database** (read only on `revenact`): `createdb -T revenact revenact_r2d3` (stop if `revenact` has open connections; ask the controller to pause the owner's servers rather than force it). Migrate the copy only, from the backend worktree `r2d3-be` at its head: `DATABASE_URL=postgres:///revenact_r2d3 venv/bin/python manage.py migrate`.
2. **Make it safe**, in a `manage.py shell` against `DATABASE_URL=postgres:///revenact_r2d3`: every `MailboxConnection` blanked (`credentials=''`); every `Connector` credential set to fakes (`xoxb-fake`; Jira `api_token: fake`, host `revenact-qa-nonexistent.atlassian.net`); every `JiraLink` deleted; the AI provider and AWS keys overridden with fakes in the server's env (`COPILOT_LLM_PROVIDER` pointed at nothing usable), so no model call is possible. Do **not** run `sync_tickets` or `run_agent_signals` against the copy.
3. **Seed, in the Alfee workspace** of the copy (the organisation of `tushar@alfee.io`; Faiz `faiz@alfee.io` and Jesh `jesh@alfee.io` are CSMs reporting to Tushar): set a QA password on the three users in the copy only (`user.set_password(...)`); make sure a Jira connector on department `cs` and a Slack connector with no department exist (create them with fake credentials if the copy has none: names "Jira SUP" and "Slack #support"); create, with `UnmatchedItem.objects.create(...)`, 3 waiting items on the Jira connector (one `critical`, one with a 1,500-character excerpt, one with no email), 27 more for paging, 1 on the Slack connector (it shows in Unassigned for Tushar), and 1 dismissed; set `ai_fast_lane` on the Alfee organisation to `FAST_LANE_ON`'s values with the Slack connector's id; add two `ModelCall` rows with `purpose="agent_cs", scope_key="fast_lane", outcome="ok"` so the use line reads "1 of 10" / "2 of 50".
4. **Servers:** backend on :8016 (`r2d3-be`, `DATABASE_URL` the copy), Vite on :5186 (`VITE_API_URL` pointing at :8016).
5. **Check in Chrome** (playwright-cli), 1440x900 and 390x844, light and dark:
   - as **Faiz** (CS): the rail's "Customer Success" count includes the items; "Needs a customer (30)" with rows, meta lines, the long text's Show all, "Deleted on …", "Open in Jira" (do not follow it: the host is fake), Show more to 30; **Match to a customer** on one row to an Alfee customer Faiz owns, with and without the contact box (this writes only to the copy; it makes a Ticket and a thread there, and no run happens because nothing runs the intake on the copy); a row matched to a record Faiz can't open is not offered (the search lists only his); **Dismiss** with its confirm;
   - as **Jesh**: the same list (same department); a refusal by matching the row Faiz just matched in another tab (the GONE alert);
   - as **Tushar** (admin): Unassigned shows the Slack item; Settings › Agents › Fast lane: switch, the rules, add and remove a word and a sender (try "x" and "@bigco" to see the server's sentences), the Slack checkbox, the limits, the use line; Undo on a change;
   - as Faiz on Settings › Agents: the fast lane summary only;
   - F1 if built: a waiting Jira bundle in the copy (seed one as the R2-D2 by-eye pass did) shows "Request type"; with the fake host its list fails "Couldn't reach Jira. Try again." (the rows themselves are covered by tests and the owner's live check).
6. Write findings to the scratchpad (`r2d3-fe-byeye/findings.md`) with screenshots; fix should-fix items test first; stop the servers; leave `revenact_r2d3` for the owner to drop.

- [ ] **Step 5: Commit and push**

```bash
git add src/e2e/round2Intake.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "test(e2e): round 2 D3 journeys; docs for messages that need a customer and the fast lane

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push origin feat/agent-bundles-r2d3
```

Hand-off (to the controller, not a PR): the head, the vitest count, whether F1 was built, the by-eye findings, and anything the backend's "Changes during the build" changed.

---

## Self-review

1. **Contract coverage.** The list (§3.1: shape, paging, refusals) Tasks 1, 3, 4; match (§3.2: body, answer, every refusal) Tasks 1, 3, 5; dismiss (§3.3) Tasks 1, 3, 4; the rail (§4) Tasks 1, 2, 6; the fast lane (§5.1 payload, §5.2 PATCH and sentences) Tasks 1 to 3, 7; F1 (§6) Task 8, gated; the audit (§7) and the purge need no UI beyond "Deleted on …" (Task 2); privacy (§8) by showing only the server's rows, and the 403 path through `onRefused` (Task 4).
2. **Placeholders.** Code steps hold their code where the shape is new (`unmatched.ts`, the tests); component steps give the structure and name the existing component each mirrors (`MessageSources`, `FeedGroups`, `RecordEditor`, `QuickAdd.test.tsx`, `testJiraLink.ts`) with the `grep` that finds it. The outlined test cases say exactly what each asserts.
3. **Type consistency.** `UnmatchedItem` / `UnmatchedPage` / `MatchAnswer` (Task 1) are what `testUnmatched.ts` (Task 3), `NeedsCustomer` (Task 4) and `MatchDialog` (Task 5) use; `QueueRow.needs_customer` (Task 1) is what `railCount` (Task 2) and the rail (Task 6) read; `FastLaneSettings` (Task 1) is what `fastLaneText.ts` (Task 2), the stub (Task 3) and `FastLane` (Task 7) take.
