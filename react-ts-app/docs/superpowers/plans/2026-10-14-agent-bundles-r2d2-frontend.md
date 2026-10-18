# Agent bundles, round 2 delivery 2 ("Act as the person"): frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person links their own Jira account from Settings › Connections ("Your Jira account"), and the bundle panel says who a Jira step acts as ("Created in Jira as you (Carl Lee)" or "Created in Jira as Jira Bot", with "Link your Jira account to act as yourself."); a Slack step's channel is a searchable live list (channels Revenact doesn't sync read "Not synced"); and a step blocked by its tool shows its full text read only, so people can see what would be posted.

**Architecture:** No new route in the app. One new section, `JiraLinkSection`, under `MailboxSection` on `/settings/connections`, backed by three `apiFetch` wrappers in `features/connectors/jiraLink.ts` and local state (one person's link is not shared store data). The panel's Jira "as" lines read the previews' new `as_you` and `link`. The Slack channel field becomes a `PickSearch` over `slack_channels` with `live=1` (when the server lists `channel_choice` as editable; else today's select). `BundleStep` draws a new `BundleStepText` for a tool-blocked step. Words and pure rules stay in `features/agents/bundleText.ts` and a new `features/connectors/jiraLinkText.ts`, unit-tested.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), react-router 7, Redux Toolkit (unchanged slices), Tailwind v4 tokens, Vitest + Testing Library (jsdom) + user-event, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-13-agent-bundles-design.md` §13 (round 2 addendum: §13.3 items B and C as revised on this branch; §13.4; the R2-D2 row of §13.5; owner decisions 9 and 10). **API contract (binding, read-only):** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/r2d2-be/docs/superpowers/plans/2026-10-14-agent-bundles-r2d2-api.md` (backend branch `feat/agent-bundles-r2d2`). Read its "Decisions narrowing the spec" first (R2D2-1 to R2D2-22); §2 (link routes), §3.4 (previews), §3.6 (sentences) and §4 (the Slack list) are the stubs' and types' source of truth. The R2-D1 frontend plan and its merged code (#144) hold the house style this plan extends.

## Global Constraints

- **Worktree and branch.** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/r2d2-fe`, branch `feat/agent-bundles-r2d2` (on main `a19bc43b`: R2-D1 #144 merged; its first commit holds this plan and the spec's §13 revision). Link `node_modules` once: `ln -s ../main-fe/node_modules node_modules` (never commit it). Always `git add <explicit paths>` (and `git rm` for deletions), never `git add -A` or `git add .`. Never merge, never open a PR, never touch the servers on ports 8000 or 5173 (the owner uses them; the by-eye run in Task 8 uses 8015 and 5185).
- **Never run prettier. Never use `git stash`** (the stash stack is shared across worktrees).
- **Commands** (foreground): `npx vitest run <path> --maxWorkers=2`, `npx vitest run --maxWorkers=2`, `npx tsc -b`, `npm run lint`, `npm run build`. CI is blocked by GitHub billing: these local checks are the gate. Every task ends with `npx tsc -b` clean as well as its tests.
- **Every commit message is a conventional commit and ends with exactly this line:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Contract shapes are binding.** Stubs answer exactly the contract's shapes and sentences; refusals and callback details are shown verbatim.
- **Tokens only** (`src/test/houseRules.ts` `RAW`): no hex, `rgb()`, named palette colours.
- **Type sizes 11/13/15 only**, through `TYPE.*`, `FIELD_ERROR`, `FORM_ALERT`; no `font-bold`, no `shadow-sm`/`shadow-md`, no `disabled:opacity-*`. **The UI ratchet** (`src/test/uiRatchet.test.ts`) ends each task with totals **equal** to `BASELINE`: new code adds zero offences (never raise a baseline).
- **Kinso look and the UI cleanup rules:** bordered quiet cards, flat `divide-y` rows, monochrome primary (`PRIMARY`), **one primary per surface** (the panel's **Run N selected** stays its only primary; "Link your Jira account", "Link again" and "Unlink" are bordered, `BUTTON`). Lucide icons only, each `aria-hidden="true"`; no emoji.
- **44px targets** on phones for every `<button>`, `<a>`, `<select>`, `<input>`, `<textarea>`: `BUTTON`, `PRIMARY`, `QUIET`, `INPUT`, `SELECT`, `META_LINK`, or a local `const` built from one.
- **No em dash (`—`) anywhere** in `src/components/work/`, `src/pages/work/`, `src/features/work/`, `src/features/agents/bundle*`, `src/features/agents/testBundle*`, `src/components/integrations/JiraLink*`, `src/features/connectors/jiraLink*`, `src/features/connectors/testJiraLink*`; comments and tests included. No em dash in any new copy anywhere.
- **Copy:** sentence case, plain words; the contract's and this plan's sentences word for word; server sentences shown verbatim.
- **States:** the link section has loading ("Loading your Jira link…"), its read error (`role="alert"`, "Couldn't load your Jira link."), a busy word on its buttons ("Opening Atlassian…", "Unlinking…"), and the callback's outcome line. The Slack search has the D3 list states plus the server's `note`.
- **Motion:** none added.
- **Privacy:** the page shows only what the server sends: the caller's own link (never anyone else's), channel names from the list. No token ever reaches the page.
- **Testing:** unit + integration + e2e (jsdom, `src/e2e/`), only `fetch` stubbed with contract-shaped stubs and fake data. Never mock the store. Nothing real is sent; no test reaches Slack, Jira, Atlassian, Google or Microsoft.

## Decisions (frontend, where the spec and the contract leave a choice)

1. **"Your Jira account"** is a `SettingsSection` right under "Your mailbox" on `/settings/connections`, for every member, shown when `configured` is true and the workspace has a Jira connection, or when the person has a link (so they can always unlink). Not linked: the line "Link it so the Jira steps you run act as you. Until then they act as the Jira connection's account." and **Link your Jira account**. Linked: facts "Linked as" (name, and the email when there is one), "Acts as you in" (the covered connections' names, or "None of this workspace's Jira sites" when `covers` is empty), and **Unlink** (bordered) behind a confirm. Lost: the alert "Your Jira link stopped working. Link it again, or unlink it." with **Link again** and **Unlink**. Cost: low.
2. **Unlink's confirm** says what happens and what Revenact can't do: title "Unlink your Jira account?", message "The Jira steps you run will act as the Jira connection's account. To remove Revenact's access fully, also remove it under Connected apps in your Atlassian account.", confirm "Unlink". Cost: trivial.
3. **The callback's outcome** (`?jira_link=linked|error&detail=`): "Jira account linked." (`role="status"`) or "Could not link Jira: <detail>" (`role="alert"`), above the sections, as the connector outcome lines already are. Cost: trivial.
4. **Who acts, in the panel**: `as_you` true → "Created in Jira as you (Carl Lee)", "Assigned in Jira as you (Carl Lee)", "Comments in Jira as you (Carl Lee)"; else today's lines with the connection's name. Under a bot line: `link: "none"` → "Link your Jira account to act as yourself." with the existing "Open settings" link to `/settings/connections`; `"other_site"` → "Your Jira link doesn't cover acme.atlassian.net." (the preview's `site`); `"off"` or `null` → nothing. A lost link needs nothing new: the server's `disabled_reason` and `disabled_link` already show. Cost: low.
5. **The Slack channel** is a `PickSearch` (type to search, 300 ms pause, as the assignee search) over `slack_channels` with `live=1` when `step.editable` holds `channel_choice`; options read "#support (This thread)", "#escalations (Not synced)", "#leads (Not synced, private)". Choosing sets `channel_choice`. The server's `note` shows under it as a meta line. When `channel_choice` is not editable (an older backend), today's `PickSelect` on `connector_id` stays. Cost: low.
6. **A tool-blocked step's text** (`can_run` false and `disabled_link` set, while the bundle waits) shows read only under its preview: Slack "Message", reply "Reply" (with "To"), Jira "Summary" and "Description", comment "Comment"; placeholders as chips. A rights-blocked step (no `disabled_link`) keeps today's excerpt. Cost: trivial.
7. **No store slice for the link.** `JiraLinkSection` loads it on mount with `fetchJiraLink` and keeps it in component state; the callback's landing reloads it. Cost: none.

## File Structure

**Create**
- `src/features/connectors/jiraLink.ts` (+ `jiraLink.test.ts`): types and `fetchJiraLink`, `startJiraLink`, `unlinkJira`.
- `src/features/connectors/jiraLinkText.ts` (+ `jiraLinkText.test.ts`): the section's words and rules.
- `src/features/connectors/testJiraLink.ts`: `stubJiraLink`, fixtures.
- `src/components/integrations/JiraLinkSection.tsx` (+ `JiraLinkSection.test.tsx`).
- `src/components/work/BundleStepText.tsx` (+ `BundleStepText.test.tsx`).
- `src/e2e/bundleRound2Act.test.tsx`.

**Modify**
- `src/features/agents/agentTypes.ts`, `bundleTypes.ts`, `bundlesApi.ts` (+ test), `bundleText.ts` (+ test), `testBundleFixtures.ts`, `testBundles.ts`.
- `src/components/work/usePickList.ts`, `BundleOutsideFields.tsx` (+ test), `BundleStep.tsx` (+ test).
- `src/pages/integrations/Integrations.tsx`.
- Docs (Task 8): `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`.

---

### Task 1: Contract types, the link's API, the live list's parameter

**Files:**
- Create: `src/features/connectors/jiraLink.ts`, `src/features/connectors/jiraLink.test.ts`
- Modify: `src/features/agents/agentTypes.ts`, `src/features/agents/bundleTypes.ts`, `src/features/agents/bundlesApi.ts`, `src/features/agents/bundlesApi.test.ts`

**Interfaces:**
- Produces (`agentTypes.ts`): `JiraLinkHint = 'none' | 'other_site' | 'off' | null`; `JiraPreview`, `JiraAssignPreview`, `JiraCommentPreview` gain `as_you?: boolean; link?: JiraLinkHint` (optional: an older backend omits them); `SlackPreview.synced?: boolean`.
- Produces (`bundleTypes.ts`): `PickListPayload.note?: string | null`.
- Produces (`bundlesApi.ts`): `fetchStepOptions(bundleId, stepId, list, { project?, query?, live? })` sends `live=1` when `live`.
- Produces (`jiraLink.ts`): `JiraLinkConnector { id: number; name: string; host: string }`, `JiraLink { name: string; email: string; status: 'linked' | 'lost'; sites: { url: string; name: string }[]; covers: number[]; linked_at: string }`, `JiraLinkState { configured: boolean; connectors: JiraLinkConnector[]; link: JiraLink | null }`, `fetchJiraLink(): Promise<JiraLinkState>`, `startJiraLink(): Promise<{ authorize_url: string }>`, `unlinkJira(): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/connectors/jiraLink.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJiraLink, startJiraLink, unlinkJira } from './jiraLink';

afterEach(() => vi.unstubAllGlobals());

const answer = (status: number, body: unknown) => vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));

describe('the Jira link API (round 2 D2 contract §2)', () => {
  it('reads my link', async () => {
    const spy = answer(200, { configured: true, connectors: [], link: null });
    vi.stubGlobal('fetch', spy);
    expect(await fetchJiraLink()).toEqual({ configured: true, connectors: [], link: null });
    expect(new URL(String((spy.mock.calls[0] as unknown[])[0])).pathname).toBe('/api/v1/connectors/jira-link/');
  });

  it('starts linking with a POST and unlinks with a DELETE', async () => {
    const spy = answer(200, { authorize_url: 'https://auth.atlassian.com/authorize?x=1' });
    vi.stubGlobal('fetch', spy);
    expect((await startJiraLink()).authorize_url).toContain('auth.atlassian.com');
    expect(((spy.mock.calls[0] as unknown[])[1] as RequestInit).method).toBe('POST');
    const gone = answer(204, null);
    vi.stubGlobal('fetch', gone);
    await unlinkJira();
    expect(((gone.mock.calls[0] as unknown[])[1] as RequestInit).method).toBe('DELETE');
  });
});
```

Append to `src/features/agents/bundlesApi.test.ts`, inside its `describe`:

```ts
  it('asks for the live Slack list with live=1', async () => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ options: [], more: false, note: null }) }));
    vi.stubGlobal('fetch', spy);
    await fetchStepOptions(12, 41, 'slack_channels', { query: 'esc', live: true });
    const url = new URL(String((spy.mock.calls[0] as unknown[])[0]));
    expect([url.searchParams.get('live'), url.searchParams.get('query')]).toEqual(['1', 'esc']);
  });
```

(How `apiFetch` answers a 204: check `src/lib/apiClient.ts`; if it reads `json()` on 204, make the stub's `json` resolve `null`, as above.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/connectors/jiraLink.test.ts src/features/agents/bundlesApi.test.ts --maxWorkers=2`
Expected: FAIL: `./jiraLink` does not exist; `live` is not sent.

- [ ] **Step 3: The code**

Create `src/features/connectors/jiraLink.ts`:

```ts
// A person's own Jira link (agent bundles round 2 D2 contract §2). The
// caller's link only; tokens never reach the page. No em dash.
import { apiFetch } from '../../lib/apiClient';

export interface JiraLinkConnector {
  id: number;
  name: string;
  host: string;
}

export interface JiraLink {
  name: string;
  email: string;
  status: 'linked' | 'lost';
  sites: { url: string; name: string }[];
  /** Ids of `connectors` this link acts as the person in. */
  covers: number[];
  linked_at: string;
}

export interface JiraLinkState {
  configured: boolean;
  connectors: JiraLinkConnector[];
  link: JiraLink | null;
}

export const fetchJiraLink = () => apiFetch<JiraLinkState>('/connectors/jira-link/');
export const startJiraLink = () => apiFetch<{ authorize_url: string }>('/connectors/jira-link/', { method: 'POST' });
export const unlinkJira = () => apiFetch<void>('/connectors/jira-link/', { method: 'DELETE' });
```

`agentTypes.ts`: add

```ts
/** Round 2 D2 contract §3.4: why a Jira step acts as the connection. */
export type JiraLinkHint = 'none' | 'other_site' | 'off' | null;
```

and `as_you?: boolean;` and `link?: JiraLinkHint;` to `JiraPreview`, `JiraAssignPreview`, `JiraCommentPreview`; `synced?: boolean;` to `SlackPreview`. `bundleTypes.ts` `PickListPayload`: `note?: string | null;`. `bundlesApi.ts` `fetchStepOptions(..., params: { project?: string; query?: string; live?: boolean } = {})` with `if (params.live) query.set('live', '1');`.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/features/connectors src/features/agents --maxWorkers=2 && npx tsc -b`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/connectors/jiraLink.ts src/features/connectors/jiraLink.test.ts src/features/agents/agentTypes.ts src/features/agents/bundleTypes.ts src/features/agents/bundlesApi.ts src/features/agents/bundlesApi.test.ts
git commit -m "feat(agents): round 2 D2 types, the Jira link API and the live list parameter

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The words

**Files:**
- Create: `src/features/connectors/jiraLinkText.ts`, `src/features/connectors/jiraLinkText.test.ts`
- Modify: `src/features/agents/bundleText.ts`, `src/features/agents/bundleText.test.ts`

**Interfaces:**
- Produces (`jiraLinkText.ts`): `JIRA_LINK` (every fixed sentence of Decisions 1 to 3 and the states), `linkedAsText(link) -> string`, `coversText(state) -> string`, `showsSection(state) -> boolean`, `outcomeLine(query: URLSearchParams) -> { text: string; failed: boolean } | null`.
- Produces (`bundleText.ts`): `whoText(name: string, you: boolean) -> string` ("you (Carl Lee)" or "Carl Lee"); `jiraAsText`, `assignedAsText`, `commentsAsText` take `(who: string, you = false)`; `linkHintText(link: JiraLinkHint, site: string) -> string | null`; `OUTSIDE.LINK_JIRA`, `OUTSIDE.SEARCH_CHANNELS`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/connectors/jiraLinkText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { JIRA_LINK, coversText, linkedAsText, outcomeLine, showsSection } from './jiraLinkText';
import type { JiraLinkState } from './jiraLink';

const LINK = { name: 'Carl Lee', email: 'carl@acme.io', status: 'linked' as const, sites: [], covers: [6], linked_at: '2026-10-14T09:00:00Z' };
const STATE: JiraLinkState = { configured: true, connectors: [{ id: 6, name: 'Jira', host: 'acme.atlassian.net' }], link: LINK };

describe('Jira link words (round 2 D2 frontend Decisions 1 to 3)', () => {
  it('says who and where', () => {
    expect(linkedAsText(LINK)).toBe('Carl Lee (carl@acme.io)');
    expect(linkedAsText({ ...LINK, email: '' })).toBe('Carl Lee');
    expect(coversText(STATE)).toBe('Jira');
    expect(coversText({ ...STATE, link: { ...LINK, covers: [] } })).toBe('None of this workspace’s Jira sites');
  });

  it('shows the section only when there is something to do', () => {
    expect(showsSection(STATE)).toBe(true);
    expect(showsSection({ configured: false, connectors: STATE.connectors, link: null })).toBe(false);
    expect(showsSection({ configured: true, connectors: [], link: null })).toBe(false);
    expect(showsSection({ configured: false, connectors: [], link: LINK })).toBe(true);
  });

  it('reads the callback outcome', () => {
    expect(outcomeLine(new URLSearchParams('jira_link=linked'))).toEqual({ text: 'Jira account linked.', failed: false });
    expect(outcomeLine(new URLSearchParams('jira_link=error&detail=Open%20the%20link%20in%20the%20browser%20that%20started%20it.'))).toEqual({ text: 'Could not link Jira: Open the link in the browser that started it.', failed: true });
    expect(outcomeLine(new URLSearchParams(''))).toBeNull();
  });

  it('keeps the fixed sentences', () => {
    expect(JIRA_LINK.LOST).toBe('Your Jira link stopped working. Link it again, or unlink it.');
    expect(JIRA_LINK.UNLINK_MESSAGE).toBe("The Jira steps you run will act as the Jira connection's account. To remove Revenact's access fully, also remove it under Connected apps in your Atlassian account.");
  });
});
```

Append to `src/features/agents/bundleText.test.ts`:

```ts
describe('who a Jira step acts as (round 2 D2 Decision 4)', () => {
  it('names you or the connection', () => {
    expect(jiraAsText('Carl Lee', true)).toBe('Created in Jira as you (Carl Lee)');
    expect(jiraAsText('Jira Bot')).toBe('Created in Jira as Jira Bot');
    expect(assignedAsText('Carl Lee', true)).toBe('Assigned in Jira as you (Carl Lee)');
    expect(commentsAsText('Carl Lee', true)).toBe('Comments in Jira as you (Carl Lee)');
  });

  it('hints how to act as yourself', () => {
    expect(linkHintText('none', 'acme.atlassian.net')).toBe('Link your Jira account to act as yourself.');
    expect(linkHintText('other_site', 'acme.atlassian.net')).toBe("Your Jira link doesn't cover acme.atlassian.net.");
    expect(linkHintText('off', 'acme.atlassian.net')).toBeNull();
    expect(linkHintText(null, 'acme.atlassian.net')).toBeNull();
  });
});
```

(Import `assignedAsText`, `commentsAsText`, `jiraAsText`, `linkHintText` with the file's other imports.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/connectors/jiraLinkText.test.ts src/features/agents/bundleText.test.ts --maxWorkers=2`
Expected: FAIL: the module and `linkHintText` don't exist; `jiraAsText('Carl Lee', true)` reads "as Carl Lee".

- [ ] **Step 3: The words**

Create `src/features/connectors/jiraLinkText.ts`:

```ts
// "Your Jira account" on Settings › Connections (round 2 D2 frontend
// Decisions 1 to 3). Plain words; no em dash.
import type { JiraLink, JiraLinkState } from './jiraLink';

export const JIRA_LINK = {
  TITLE: 'Your Jira account',
  INTRO: "Link it so the Jira steps you run act as you. Until then they act as the Jira connection's account.",
  LINK: 'Link your Jira account',
  LINK_AGAIN: 'Link again',
  OPENING: 'Opening Atlassian…',
  LINKED_AS: 'Linked as',
  ACTS_IN: 'Acts as you in',
  NONE_COVERED: 'None of this workspace’s Jira sites',
  LOST: 'Your Jira link stopped working. Link it again, or unlink it.',
  UNLINK: 'Unlink',
  UNLINKING: 'Unlinking…',
  UNLINK_TITLE: 'Unlink your Jira account?',
  UNLINK_MESSAGE: "The Jira steps you run will act as the Jira connection's account. To remove Revenact's access fully, also remove it under Connected apps in your Atlassian account.",
  LOADING: 'Loading your Jira link…',
  LOAD_FAILED: "Couldn't load your Jira link.",
  START_FAILED: "Couldn't open Atlassian. Try again.",
  LINKED: 'Jira account linked.',
  FAILED: 'Could not link Jira: ',
} as const;

export const linkedAsText = (link: JiraLink): string => (link.email ? `${link.name} (${link.email})` : link.name);

export function coversText(state: JiraLinkState): string {
  const covered = state.connectors.filter((c) => state.link?.covers.includes(c.id)).map((c) => c.name);
  return covered.length > 0 ? covered.join(', ') : JIRA_LINK.NONE_COVERED;
}

export const showsSection = (state: JiraLinkState): boolean => state.link !== null || (state.configured && state.connectors.length > 0);

export function outcomeLine(query: URLSearchParams): { text: string; failed: boolean } | null {
  const outcome = query.get('jira_link');
  if (outcome === 'linked') return { text: JIRA_LINK.LINKED, failed: false };
  if (outcome === 'error') return { text: `${JIRA_LINK.FAILED}${query.get('detail') || 'Atlassian refused.'}`, failed: true };
  return null;
}
```

In `src/features/agents/bundleText.ts`, replace the three "as" helpers:

```ts
export const whoText = (name: string, you = false): string => (you ? `you (${name})` : name);
export const jiraAsText = (who: string, you = false): string => `Created in Jira as ${whoText(who, you)}`;
export const assignedAsText = (who: string, you = false): string => `Assigned in Jira as ${whoText(who, you)}`;
export const commentsAsText = (who: string, you = false): string => `Comments in Jira as ${whoText(who, you)}`;

/** Round 2 D2 Decision 4: how a bot line says you could act as yourself. */
export function linkHintText(link: JiraLinkHint | undefined, site: string): string | null {
  if (link === 'none') return OUTSIDE.LINK_JIRA;
  if (link === 'other_site') return `Your Jira link doesn't cover ${site}.`;
  return null;
}
```

(`import type { JiraLinkHint } from './agentTypes';`) and add to `OUTSIDE`: `LINK_JIRA: 'Link your Jira account to act as yourself.',` and `SEARCH_CHANNELS: 'Search channels',`.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/features --maxWorkers=2 && npx tsc -b`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/connectors/jiraLinkText.ts src/features/connectors/jiraLinkText.test.ts src/features/agents/bundleText.ts src/features/agents/bundleText.test.ts
git commit -m "feat(agents): words for the Jira link and who a Jira step acts as

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Stubs and fixtures: the link route, as-you previews, the live list

**Files:**
- Create: `src/features/connectors/testJiraLink.ts`
- Modify: `src/features/agents/testBundleFixtures.ts`, `src/features/agents/testBundles.ts`

**Interfaces:**
- Produces (`testJiraLink.ts`): `LINKED`, `LOST_LINK`, `JIRA_STATE` (configured, one connector `{id: 6, name: 'Jira', host: 'acme.atlassian.net'}`, linked), `stubJiraLink(initial?: Partial<JiraLinkState>, opts?: { failRead?: boolean })` (answers GET/POST/DELETE `/connectors/jira-link/`; POST returns `{authorize_url: 'https://auth.atlassian.com/authorize?state=s1'}`; DELETE sets `link: null`; returns the `fetch` spy). It composes with other stubs through a `next` fallback: `stubJiraLink(state, { next: otherSpy })` hands any other path to `next`.
- Produces (`testBundleFixtures.ts`): `B_OUTSIDE`'s Jira create step gains `as_you: false, link: 'none'`; `B_AS_YOU` (a waiting bundle, id 406, one `jira.create` step id 461 with `preview.jira.as: 'Carl Lee', as_you: true, link: null`); `B_BLOCKED`'s Slack step keeps `fields.text`; a Slack step with `editable: ['connector_id', 'channel_choice', 'text']` and `fields.channel_choice: '5'` (`B_LIVE`, id 407, step id 471).
- Produces (`testBundles.ts`): `pickList` answers `slack_channels` with `live=1` from `stub.liveChannels ?? LIVE_CHANNELS` (synced first, then "Not synced" rows), filtered by `query`, with `note: stub.channelNote ?? null`; without `live`, today's answer.

- [ ] **Step 1: Write the fixtures and stubs**

Create `src/features/connectors/testJiraLink.ts`:

```ts
// Contract-shaped stubs for the Jira link (round 2 D2 contract §2). Fake data only; no em dash.
import { vi } from 'vitest';
import type { JiraLink, JiraLinkState } from './jiraLink';

export const LINKED: JiraLink = {
  name: 'Carl Lee',
  email: 'carl@acme.io',
  status: 'linked',
  sites: [{ url: 'https://acme.atlassian.net', name: 'acme' }],
  covers: [6],
  linked_at: '2026-10-14T09:00:00Z',
};
export const LOST_LINK: JiraLink = { ...LINKED, status: 'lost' };
export const JIRA_STATE: JiraLinkState = { configured: true, connectors: [{ id: 6, name: 'Jira', host: 'acme.atlassian.net' }], link: LINKED };

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;

export function stubJiraLink(initial: Partial<JiraLinkState> = {}, opts: { failRead?: boolean; next?: Fetch } = {}) {
  const state: JiraLinkState = { ...JIRA_STATE, ...initial };
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname !== '/api/v1/connectors/jira-link/') return opts.next ? opts.next(input, init) : json(404, {});
    const method = init?.method ?? 'GET';
    if (method === 'GET') return opts.failRead ? json(500, {}) : json(200, state);
    if (method === 'POST') return json(200, { authorize_url: 'https://auth.atlassian.com/authorize?state=s1' });
    state.link = null;
    return json(204, null);
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}
```

In `testBundleFixtures.ts`: add `as_you: false, link: 'none'` to the `B_OUTSIDE` create step's `preview.jira`; add `B_AS_YOU` and `B_LIVE` beside `B_COMMENT`, built with the file's own `bundle(...)` and `step(...)` helpers exactly as `B_COMMENT` is (same source shape: `JIRA_SOURCE` for `B_AS_YOU`, `SLACK_SOURCE` for `B_LIVE`), with the ids, fields and previews listed above (`B_LIVE`'s preview: `{ slack: { channel: '#support', in_thread: true, as: 'Revenact', excerpt: 'We are on it.', synced: true } }`).

In `testBundles.ts`: add to `BundlesStub` `liveChannels?: PickOption[]; channelNote?: string | null;`, a constant

```ts
export const LIVE_CHANNELS: PickOption[] = [
  { id: '5', name: '#support', detail: 'This thread' },
  { id: '5:C0ESCALATE', name: '#escalations', detail: 'Not synced' },
  { id: '5:C0RANDOM', name: '#random', detail: 'Not synced' },
];
```

and, in `pickList`, before the generic `rows` line:

```ts
    if (list === 'slack_channels' && url.searchParams.get('live') === '1') {
      const rows = (stub.liveChannels ?? LIVE_CHANNELS).filter((o) => o.name.toLowerCase().includes(query.toLowerCase()));
      return json(200, { options: rows.slice(0, 100), more: rows.length > 100, note: stub.channelNote ?? null });
    }
```

The step `PATCH` and `run` stubs must accept `channel_choice` for `B_LIVE` (they keep any editable field: check `save`/`run` in `testBundles.ts` copy `fields` by `step.editable`), and on a run of `B_LIVE` with `channel_choice: '5:C0ESCALATE'` set `preview.slack` to `{ channel: '#escalations', in_thread: false, synced: false, ... }` so the e2e can read it.

- [ ] **Step 2: Run the suite parts that use the fixtures**

Run: `npx vitest run src/features/agents src/components/work src/e2e --maxWorkers=2 && npx tsc -b`
Expected: PASS (the new fixtures are not used yet; the old ones only gained keys).

- [ ] **Step 3: Commit**

```bash
git add src/features/connectors/testJiraLink.ts src/features/agents/testBundleFixtures.ts src/features/agents/testBundles.ts
git commit -m "test(agents): stubs for the Jira link, as-you previews and the live Slack list

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: "Your Jira account" on Settings › Connections

**Files:**
- Create: `src/components/integrations/JiraLinkSection.tsx`, `src/components/integrations/JiraLinkSection.test.tsx`
- Modify: `src/pages/integrations/Integrations.tsx`

**Interfaces:**
- Consumes: `fetchJiraLink`, `startJiraLink`, `unlinkJira` (Task 1); `JIRA_LINK`, `linkedAsText`, `coversText`, `showsSection`, `outcomeLine` (Task 2); `stubJiraLink`, `LINKED`, `LOST_LINK` (Task 3).
- Produces: `<JiraLinkSection />` (no props), rendered after `<MailboxSection />`; `Integrations` shows `outcomeLine(query)` above the sections.

- [ ] **Step 1: Write the failing tests**

Create `src/components/integrations/JiraLinkSection.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JiraLinkSection } from './JiraLinkSection';
import { LINKED, LOST_LINK, stubJiraLink } from '../../features/connectors/testJiraLink';

afterEach(() => vi.unstubAllGlobals());

describe('JiraLinkSection (round 2 D2 frontend Decisions 1, 2, 7)', () => {
  it('offers the link when there is none', async () => {
    stubJiraLink({ link: null });
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    render(<JiraLinkSection />);
    expect(await screen.findByRole('heading', { name: 'Your Jira account' })).toBeInTheDocument();
    expect(screen.getByText("Link it so the Jira steps you run act as you. Until then they act as the Jira connection's account.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Link your Jira account' }));
    expect(assign).toHaveBeenCalledWith('https://auth.atlassian.com/authorize?state=s1');
  });

  it('shows the link and unlinks behind a confirm', async () => {
    stubJiraLink({ link: LINKED });
    render(<JiraLinkSection />);
    expect(await screen.findByText('Carl Lee (carl@acme.io)')).toBeInTheDocument();
    expect(screen.getByText('Jira')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Unlink' }));
    const dialog = await screen.findByRole('dialog', { name: 'Unlink your Jira account?' });
    expect(within(dialog).getByText(/also remove it under Connected apps/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Unlink' }));
    expect(await screen.findByRole('button', { name: 'Link your Jira account' })).toBeInTheDocument();
  });

  it('says when the link stopped working', async () => {
    stubJiraLink({ link: LOST_LINK });
    render(<JiraLinkSection />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Your Jira link stopped working. Link it again, or unlink it.');
    expect(screen.getByRole('button', { name: 'Link again' })).toBeInTheDocument();
  });

  it('is absent when linking is off and there is no link', async () => {
    const spy = stubJiraLink({ configured: false, link: null });
    const { container } = render(<JiraLinkSection />);
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('says when the link could not be read', async () => {
    stubJiraLink({}, { failRead: true });
    render(<JiraLinkSection />);
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your Jira link.");
  });
});
```

(`ConfirmDialog` lives at `src/components/organizations/ConfirmDialog.tsx`, as `MailboxSection` uses it; check its props with `grep -n "export function ConfirmDialog" -A12`.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/integrations/JiraLinkSection.test.tsx --maxWorkers=2`
Expected: FAIL: module not found.

- [ ] **Step 3: The section**

Create `src/components/integrations/JiraLinkSection.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { fetchJiraLink, startJiraLink, unlinkJira, type JiraLinkState } from '../../features/connectors/jiraLink';
import { JIRA_LINK, coversText, linkedAsText, showsSection } from '../../features/connectors/jiraLinkText';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { BUTTON, FORM_ALERT, LoadingState, SettingsRow, SettingsSection, TYPE } from '../ui';

/** "Your Jira account" (round 2 D2 contract §2; frontend Decisions 1, 2, 7):
 *  the person's own link, so the Jira steps they run act as them. Only the
 *  caller's link is ever shown. */
export function JiraLinkSection() {
  const [state, setState] = useState<JiraLinkState | null>(null);
  const [failed, setFailed] = useState(false);
  const [opening, setOpening] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(() => {
    fetchJiraLink()
      .then((next) => {
        setState(next);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  async function link() {
    if (opening) return;
    setOpening(true);
    setRefused(null);
    try {
      const { authorize_url } = await startJiraLink();
      // Stay busy while the browser leaves, so no second click starts another.
      window.location.assign(authorize_url);
    } catch {
      setOpening(false);
      setRefused(JIRA_LINK.START_FAILED);
    }
  }

  if (failed) {
    return (
      <p role="alert" className={FORM_ALERT}>
        {JIRA_LINK.LOAD_FAILED}
      </p>
    );
  }
  if (state === null) return <LoadingState label={JIRA_LINK.LOADING} />;
  if (!showsSection(state)) return null;
  const current = state.link;
  const linkButton = (label: string) => (
    <button type="button" onClick={link} aria-disabled={opening || undefined} className={BUTTON}>
      {opening ? JIRA_LINK.OPENING : label}
    </button>
  );

  return (
    <SettingsSection title={JIRA_LINK.TITLE}>
      {current === null ? (
        <div className="flex flex-col gap-2 px-4 py-3">
          <p className={TYPE.body}>{JIRA_LINK.INTRO}</p>
          <div>{linkButton(JIRA_LINK.LINK)}</div>
        </div>
      ) : (
        <>
          {current.status === 'lost' ? (
            <div className="flex flex-col gap-2 px-4 py-3">
              <p role="alert" className={FORM_ALERT}>
                {JIRA_LINK.LOST}
              </p>
              <div>{linkButton(JIRA_LINK.LINK_AGAIN)}</div>
            </div>
          ) : null}
          <SettingsRow label={JIRA_LINK.LINKED_AS}>
            <p className={TYPE.body}>{linkedAsText(current)}</p>
          </SettingsRow>
          <SettingsRow label={JIRA_LINK.ACTS_IN}>
            <p className={TYPE.body}>{coversText(state)}</p>
          </SettingsRow>
          <div className="px-4 py-3">
            <button type="button" onClick={() => setConfirming(true)} className={BUTTON}>
              {JIRA_LINK.UNLINK}
            </button>
          </div>
        </>
      )}
      {refused ? (
        <p role="alert" className={`${FORM_ALERT} px-4 pb-3`}>
          {refused}
        </p>
      ) : null}
      {confirming ? (
        <ConfirmDialog
          title={JIRA_LINK.UNLINK_TITLE}
          message={JIRA_LINK.UNLINK_MESSAGE}
          confirmLabel={JIRA_LINK.UNLINK}
          onConfirm={async () => {
            await unlinkJira();
            load();
          }}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </SettingsSection>
  );
}
```

(Match `SettingsSection`, `SettingsRow` and `LoadingState` props to their real signatures: `grep -n "export function SettingsSection\|export function SettingsRow\|export function LoadingState" -A6 src/components/ui/*.tsx`; `MailboxSection.tsx` shows how each is used.)

In `src/pages/integrations/Integrations.tsx`: import `JiraLinkSection` and `outcomeLine`; under the existing outcome lines add

```tsx
      {(() => {
        const linked = outcomeLine(query);
        if (!linked) return null;
        return linked.failed ? (
          <p role="alert" className={FORM_ALERT}>
            {linked.text}
          </p>
        ) : (
          <p role="status" className="text-[13px] leading-5 text-success-ink">
            {linked.text}
          </p>
        );
      })()}
```

and `<JiraLinkSection />` right after `<MailboxSection />`. (Hoist the IIFE into a `const linkOutcome = outcomeLine(query);` above the `return` if lint prefers it.)

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/components/integrations src/pages/integrations --maxWorkers=2 && npx tsc -b && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS; tsc clean; the ratchet equal to `BASELINE`. (Existing `Integrations` tests that stub `fetch` for `/connectors/` now also see a GET to `/connectors/jira-link/`: give their stubs a 404 for unknown paths, which the section shows as its read error only if they assert on alerts; where they do, wrap their stub with `stubJiraLink({ configured: false, link: null }, { next: theirSpy })`.)

- [ ] **Step 5: Commit**

```bash
git add src/components/integrations/JiraLinkSection.tsx src/components/integrations/JiraLinkSection.test.tsx src/pages/integrations/Integrations.tsx
git add $(git diff --name-only -- src/pages/integrations src/components/integrations)
git commit -m "feat(integrations): link your own Jira account on Settings, Connections

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The panel says who a Jira step acts as

**Files:**
- Modify: `src/components/work/BundleOutsideFields.tsx`, `src/components/work/BundleOutsideFields.test.tsx`

**Interfaces:**
- Consumes: `jiraAsText`, `assignedAsText`, `commentsAsText`, `linkHintText` (Task 2); `B_AS_YOU`, `B_OUTSIDE` (Task 3).
- Produces: the "as" line per Decision 4 and the hint with "Open settings".

- [ ] **Step 1: Write the failing tests**

Append to `src/components/work/BundleOutsideFields.test.tsx` (it renders the fields with a helper; find its name with `grep -n "function render" src/components/work/BundleOutsideFields.test.tsx`, written `renderFields` below):

```tsx
describe('who a Jira step acts as (round 2 D2 Decision 4)', () => {
  it('names you when your link covers the site', () => {
    renderFields(B_AS_YOU, B_AS_YOU.steps[0]);
    expect(screen.getByText('Created in Jira as you (Carl Lee)')).toBeInTheDocument();
    expect(screen.queryByText('Link your Jira account to act as yourself.')).toBeNull();
  });

  it('names the connection and points to the link when you have none', () => {
    const create = B_OUTSIDE.steps.find((s) => s.kind === 'jira.create')!;
    renderFields(B_OUTSIDE, create);
    expect(screen.getByText('Created in Jira as Jira Bot')).toBeInTheDocument();
    expect(screen.getByText('Link your Jira account to act as yourself.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open settings' })).toHaveAttribute('href', '/settings/connections');
  });
});
```

(`renderFields` must wrap in a router for the `Link`; if it doesn't, wrap the render in `MemoryRouter` here. The link text constant is `OUTSIDE.OPEN_SETTING`; check its words with `grep -n "OPEN_SETTING" src/features/agents/bundleText.ts` and use them.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/work/BundleOutsideFields.test.tsx --maxWorkers=2`
Expected: FAIL: "Created in Jira as Carl Lee"; no hint.

- [ ] **Step 3: The lines**

In `BundleOutsideFields.tsx`, add a small component:

```tsx
/** Round 2 D2 Decision 4: under a bot line, how to act as yourself. */
function LinkHint({ link, site }: { link: JiraLinkHint | undefined; site: string }) {
  const hint = linkHintText(link, site);
  if (!hint) return null;
  return (
    <p className={TYPE.meta}>
      {hint}
      {link === 'none' ? (
        <>
          {' '}
          <Link to="/settings/connections" className={LINK}>
            {OUTSIDE.OPEN_SETTING}
          </Link>
        </>
      ) : null}
    </p>
  );
}
```

(`import { Link } from 'react-router-dom';`, `import { LINK } from '../brain/styles';` as `BundleStep.tsx` does, `import type { JiraLinkHint } from '../../features/agents/agentTypes';`.)

The comment branch: `{comment ? <p className={TYPE.meta}>{commentsAsText(comment.as, comment.as_you)}</p> : null}` then `{comment ? <LinkHint link={comment.link} site={comment.site} /> : null}`.

The create/assign branch:

```tsx
  const jiraSide = jira ?? assign;
  // ...
      {as ? <p className={TYPE.meta}>{step.kind === 'jira.assign' ? assignedAsText(as, jiraSide?.as_you) : jiraAsText(as, jiraSide?.as_you)}</p> : null}
      {jiraSide ? <LinkHint link={jiraSide.link} site={jiraSide.site} /> : null}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/components/work --maxWorkers=2 && npx tsc -b && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS, tsc clean, ratchet equal.

- [ ] **Step 5: Commit**

```bash
git add src/components/work/BundleOutsideFields.tsx src/components/work/BundleOutsideFields.test.tsx
git commit -m "feat(work): a Jira step says whether it acts as you or the connection

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Search the Slack channels the bot is in

**Files:**
- Modify: `src/components/work/usePickList.ts`, `src/components/work/BundleOutsideFields.tsx`, `src/components/work/BundleOutsideFields.test.tsx`

**Interfaces:**
- Consumes: `fetchStepOptions(..., { live })` (Task 1); `B_LIVE`, `LIVE_CHANNELS`, `stubBundles({ channelNote })` (Task 3); `PickSearch` (existing, controlled).
- Produces: `usePickList({ ..., live?: boolean })`; `PickState`'s ready branch gains `note: string | null`; the Slack channel field per Decision 5.

- [ ] **Step 1: Write the failing tests**

Append to `BundleOutsideFields.test.tsx` (with `stubBundles` for `fetch`, as its D3 Slack tests do):

```tsx
describe('the live Slack list (round 2 D2 Decision 5)', () => {
  it('searches channels the bot is in and picks an unsynced one', async () => {
    stubBundles({ bundles: [B_LIVE] });
    const onField = vi.fn();
    renderFields(B_LIVE, B_LIVE.steps[0], { onField });
    const box = await screen.findByRole('combobox', { name: 'Channel' });
    await userEvent.type(box, 'esc');
    await userEvent.click(await screen.findByRole('option', { name: '#escalations (Not synced)' }));
    expect(onField).toHaveBeenCalledWith('channel_choice', '5:C0ESCALATE');
  });

  it('shows the server note when Slack did not list its channels', async () => {
    stubBundles({ bundles: [B_LIVE], channelNote: "Slack didn't list its other channels. Try again in a minute." });
    renderFields(B_LIVE, B_LIVE.steps[0]);
    expect(await screen.findByText("Slack didn't list its other channels. Try again in a minute.")).toBeInTheDocument();
  });

  it('keeps the old select when channel_choice is not editable', () => {
    renderFields(B_OUTSIDE, B_OUTSIDE.steps.find((s) => s.kind === 'slack.reply')!);
    expect(screen.queryByRole('combobox', { name: 'Channel' })).toBeNull();
  });
});
```

(`PickSearch`'s role and option names: read `src/components/work/PickSearch.tsx` and its test; if it is a listbox of buttons rather than a combobox, query those roles instead. `renderFields`' options argument: add an `onField` override to the helper if it has none.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/work/BundleOutsideFields.test.tsx --maxWorkers=2`
Expected: FAIL: no combobox; the select is today's.

- [ ] **Step 3: The hook and the field**

`usePickList.ts`: add `live = false` to the params, to the effect's dependencies and to `key`; call `fetchStepOptions(bundleId, stepId, list, { project, query, live })`; the ready result becomes `{ status: 'ready', options: answer.options, more: answer.more, note: answer.note ?? null }` and the type `{ status: 'ready'; options: PickOption[]; more: boolean; note: string | null }`. (Update any test constructing a ready `PickState` to add `note: null`: `grep -rn "status: 'ready'" src/components/work`.)

`BundleOutsideFields.tsx`, the Slack branch:

```tsx
  if (step.kind === 'slack.reply') {
    const slack = step.preview.slack;
    const choosing = can('channel_choice');
    const choice = typeof fields.channel_choice === 'string' ? fields.channel_choice : typeof fields.connector_id === 'number' ? String(fields.connector_id) : '';
    const current = typeof fields.connector_id === 'number' ? String(fields.connector_id) : '';
    const named = channels.state.status === 'ready' ? channels.state.options.find((o) => o.id === current) : undefined;
    const note = live.state.status === 'ready' ? live.state.note : null;
    return (
      <div className="flex flex-col gap-3">
        {slack ? <p className={TYPE.meta}>{postsAsText(slack.as)}</p> : null}
        {choosing ? (
          <PickSearch
            id={id('channel_choice')}
            label={OUTSIDE.CHANNEL}
            list="slack_channels"
            state={live.state}
            retry={live.retry}
            onQuery={setChannelQuery}
            value={choice ? { id: choice, name: slack?.channel ?? choice } : null}
            onChange={(v) => v && onField('channel_choice', v.id)}
            error={errors.channel_choice}
            hint={note ?? undefined}
          />
        ) : can('connector_id') ? (
          <PickSelect id={id('connector_id')} label={OUTSIDE.CHANNEL} list="slack_channels" state={channels.state} retry={channels.retry} value={current ? { id: current, name: named?.name ?? slack?.channel ?? current } : null} onChange={(v) => v && onField('connector_id', Number(v.id))} error={errors.connector_id} />
        ) : null}
        {can('text') ? <Text id={id('text')} label={OUTSIDE.MESSAGE} area value={String(fields.text ?? '')} error={errors.text} onChange={(v) => onField('text', v)} /> : null}
      </div>
    );
  }
```

with, near the other hooks at the top (hooks run before any early return):

```tsx
  const [channelQuery, setChannelQuery] = useState('');
  const live = usePickList({ bundleId: bundle.id, stepId: step.id, list: 'slack_channels', query: channelQuery, live: true, enabled: step.kind === 'slack.reply' && can('channel_choice') });
```

and the existing `channels` hook's `enabled` becomes `step.kind === 'slack.reply' && can('connector_id') && !can('channel_choice')`.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/components/work src/e2e --maxWorkers=2 && npx tsc -b && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS (the D3 Slack journeys use `B_OUTSIDE`, whose step has no `channel_choice`), tsc clean, ratchet equal.

- [ ] **Step 5: Commit**

```bash
git add src/components/work/usePickList.ts src/components/work/BundleOutsideFields.tsx src/components/work/BundleOutsideFields.test.tsx
git add $(git diff --name-only -- src/components/work)
git commit -m "feat(work): search the Slack channels the bot is in, synced or not

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: A blocked step shows what it would post

**Files:**
- Create: `src/components/work/BundleStepText.tsx`, `src/components/work/BundleStepText.test.tsx`
- Modify: `src/components/work/BundleStep.tsx`, `src/components/work/BundleStep.test.tsx`

**Interfaces:**
- Consumes: `B_BLOCKED` (step 421: `fields.text 'We are looking into it.'`), `PlaceholderText`, `OUTSIDE` labels.
- Produces: `<BundleStepText step={step} />`: the step's text fields read only (Decision 6); `BundleStep` draws it when `live && !step.can_run && step.disabled_link`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/work/BundleStepText.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BundleStepText } from './BundleStepText';
import { B_BLOCKED, B_COMMENT } from '../../features/agents/testBundleFixtures';

describe('BundleStepText (round 2 D2 Decision 6)', () => {
  it('shows a Slack message read only', () => {
    render(<BundleStepText step={B_BLOCKED.steps[0]} />);
    expect(screen.getByText('Message')).toBeInTheDocument();
    expect(screen.getByText('We are looking into it.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('shows a Jira comment read only', () => {
    render(<BundleStepText step={B_COMMENT.steps[0]} />);
    expect(screen.getByText('Comment')).toBeInTheDocument();
  });
});
```

Append to `BundleStep.test.tsx` (it renders a step in a waiting bundle; follow its helper):

```tsx
  it('shows a tool-blocked step its full text, read only (round 2 D2 Decision 6)', () => {
    renderStep(B_BLOCKED, B_BLOCKED.steps[0]);
    expect(screen.getByText('Ask an admin to allow Revenact to post in Slack.')).toBeInTheDocument();
    expect(screen.getByText('Message')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/work/BundleStepText.test.tsx src/components/work/BundleStep.test.tsx --maxWorkers=2`
Expected: FAIL: module not found; no "Message".

- [ ] **Step 3: The component**

Create `src/components/work/BundleStepText.tsx`:

```tsx
import { BUNDLE, OUTSIDE } from '../../features/agents/bundleText';
import type { BundleStep } from '../../features/agents/bundleTypes';
import { TYPE } from '../ui';
import { PlaceholderText } from './PlaceholderText';

/** The text fields each outside kind would post, in the order they read. */
const SHOWN: Record<string, [string, string][]> = {
  'slack.reply': [['text', OUTSIDE.MESSAGE]],
  'mail.send_reply': [
    ['subject', BUNDLE.SUBJECT],
    ['body', OUTSIDE.REPLY],
  ],
  'jira.create': [
    ['summary', OUTSIDE.SUMMARY],
    ['description', OUTSIDE.DESCRIPTION],
  ],
  'jira.comment': [['body', OUTSIDE.COMMENT]],
};

/** A step its tool blocks shows what it would post, read only (round 2 D2
 *  frontend Decision 6), so the text can be checked while the tool is fixed. */
export function BundleStepText({ step }: { step: BundleStep }) {
  const rows = (SHOWN[step.kind] ?? []).filter(([key]) => typeof step.fields[key] === 'string' && String(step.fields[key]).trim());
  if (rows.length === 0) return null;
  return (
    <dl className="flex flex-col gap-2">
      {rows.map(([key, label]) => (
        <div key={key} className="flex flex-col gap-1">
          <dt className={TYPE.label}>{label}</dt>
          <dd className={`${TYPE.body} whitespace-pre-line break-words`}>
            <PlaceholderText text={String(step.fields[key])} placeholders={step.placeholders} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
```

In `BundleStep.tsx`, right after `<AgentActionBody ... />`:

```tsx
      {live && !step.can_run && step.disabled_link ? <BundleStepText step={step} /> : null}
```

(A `jira.comment` whose body holds a placeholder has `body` out of `fields` (D1 D12): `B_COMMENT`'s test then needs a fixture whose body is a plain string; if `B_COMMENT.steps[0].fields.body` is absent, give the test a copy with `fields: { body: 'Seen on Safari too.' }`.)

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/components/work --maxWorkers=2 && npx tsc -b && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS, tsc clean, ratchet equal.

- [ ] **Step 5: Commit**

```bash
git add src/components/work/BundleStepText.tsx src/components/work/BundleStepText.test.tsx src/components/work/BundleStep.tsx src/components/work/BundleStep.test.tsx
git commit -m "feat(work): a step its tool blocks shows what it would post

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The journeys, the docs, the full check and by eye

**Files:**
- Create: `src/e2e/bundleRound2Act.test.tsx`
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`

- [ ] **Step 1: The journeys**

Create `src/e2e/bundleRound2Act.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { BUNDLES, B_AS_YOU, B_BLOCKED, B_LIVE, OUTSIDE_BUNDLES } from '../features/agents/testBundleFixtures';
import { stubBundles } from '../features/agents/testBundles';
import { renderWork } from '../pages/work/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real panel and router; only fetch
// is stubbed, in the round 2 D2 contract's shapes. Nothing reaches Jira,
// Slack or Atlassian. Carl sees he acts as himself in Jira, moves a Slack
// reply to a channel Revenact doesn't sync, and reads a blocked step's text.

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
  document.body.style.overflow = '';
});

describe('Agent bundles round 2 D2', () => {
  it('names you on a Jira step you will run as yourself', { timeout: 30000 }, async () => {
    stubBundles({ bundles: [...BUNDLES, ...OUTSIDE_BUNDLES, B_AS_YOU] });
    renderWork(`/work?queue=mine&bundle=${B_AS_YOU.id}`);
    const panel = await screen.findByRole('dialog', { name: B_AS_YOU.title });
    expect(within(panel).getByText('Created in Jira as you (Carl Lee)')).toBeInTheDocument();
  });

  it('moves a Slack reply to an unsynced channel and runs it', { timeout: 30000 }, async () => {
    stubBundles({ bundles: [...BUNDLES, B_LIVE] });
    renderWork(`/work?queue=mine&bundle=${B_LIVE.id}`);
    const panel = await screen.findByRole('dialog', { name: B_LIVE.title });
    const step = within(panel).getByTestId('step-471');
    await userEvent.type(within(step).getByRole('combobox', { name: 'Channel' }), 'esc');
    await userEvent.click(await within(step).findByRole('option', { name: '#escalations (Not synced)' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 1 selected' }));
    expect(await within(step).findByText(/#escalations/)).toBeInTheDocument();
  });

  it('shows a blocked Slack step its message', { timeout: 30000 }, async () => {
    stubBundles({ bundles: [...BUNDLES, ...OUTSIDE_BUNDLES] });
    renderWork(`/work?queue=mine&bundle=${B_BLOCKED.id}`);
    const panel = await screen.findByRole('dialog', { name: B_BLOCKED.title });
    expect(within(within(panel).getByTestId('step-421')).getByText('We are looking into it.')).toBeInTheDocument();
  });
});
```

(Use the combobox/option roles Task 6 settled on.) Run: `npx vitest run src/e2e --maxWorkers=2`
Expected: PASS (and every earlier journey).

- [ ] **Step 2: The docs**

- `docs/03-ui-ux-design.md`: Settings › Connections gains "Your Jira account" (Decisions 1 to 3); the bundle panel's Jira "as" lines and link hint (Decision 4); the Slack channel search and its note (Decision 5); a blocked step's read-only text (Decision 6).
- `docs/04-app-flow.md`: linking and unlinking a Jira account (the round trip, the outcome line); running a Jira step as yourself; moving a Slack reply to an unsynced channel.
- `.agents/workflows/repo-architecture.md`: `JiraLinkSection.tsx`, `features/connectors/jiraLink.ts`, `jiraLinkText.ts`, `BundleStepText.tsx`; `usePickList`'s `live`.

- [ ] **Step 3: The full check**

```bash
npx vitest run --maxWorkers=2
npx tsc -b
npm run lint
npm run build
npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2
grep -rn "—" src/components/work src/pages/work src/features/work src/features/agents/bundle* src/features/agents/testBundle* src/components/integrations/JiraLink* src/features/connectors/jiraLink* src/features/connectors/testJiraLink* || echo "no em dash"
```

Expected: every test passes (write the count into the hand-off), `tsc` clean, lint clean, build OK, ratchet totals equal to `BASELINE`, "no em dash".

- [ ] **Step 4: By eye, on a database copy, with fake credentials**

Nothing real is sent, no OAuth round trip is completed and no model is called.

1. Copy the dev database (read only on `revenact`): `createdb -T revenact revenact_r2d2` (stop if `revenact` has open connections; ask the controller to pause the owner's servers rather than force it). Migrate the copy only: `DATABASE_URL=postgres:///revenact_r2d2 venv/bin/python manage.py migrate` from the backend worktree `r2d2-be` at its head.
2. Make it safe in the copy (a `manage.py shell` against `DATABASE_URL=postgres:///revenact_r2d2`): every `MailboxConnection` blanked (`credentials=''`); every `Connector` credential set to fakes (`xoxb-fake`, Jira `api_token: fake`, Jira host `revenact-qa-nonexistent.atlassian.net`); AWS and model keys overridden with fakes in the server's env (no AI call possible). Run the backend with `ATLASSIAN_OAUTH_CLIENT_ID=fake-cid ATLASSIAN_OAUTH_CLIENT_SECRET=fake-secret` so the link button shows; never complete its round trip.
3. Seed, in the copy: a `JiraLink` for the QA user covering `revenact-qa-nonexistent.atlassian.net` with fake tokens expiring in a year (`link.set_credentials({"access_token": "fake", "refresh_token": "fake", "expires_at": <now + 1 year>})`), a second QA user with a `lost` link, a waiting bundle with a `jira.create` and a `slack.reply` step (with `channel_choice` in its payload), and a waiting bundle whose Slack connector has `agents_can_act=False` (a tool-blocked step).
4. Backend on :8015 (`r2d2-be`, `DATABASE_URL` the copy), Vite on :5185 (`VITE_API_URL` pointing at :8015).
5. Check in Chrome (playwright-cli), 1440x900 and 390x844, light and dark: Settings › Connections as the linked QA user ("Your Jira account", Linked as, Acts as you in, Unlink's confirm, but press Cancel), as the lost-link user (the alert, Link again), as a user with no link (the intro and the button; clicking it may open `auth.atlassian.com` with the fake client id, which Atlassian refuses: close that tab); the outcome lines by visiting `/integrations?jira_link=linked` and `/integrations?jira_link=error&detail=Open%20the%20link%20in%20the%20browser%20that%20started%20it.`; the panel's Jira step as the linked user ("Created in Jira as you (…)") and as a user with no link (the bot line, the hint, Open settings); the lost-link user's step (the disabled reason and its link); the Slack channel search (with fake tokens Slack answers `invalid_auth`, so the list shows the synced rows and the note "Slack didn't list its other channels. Try again in a minute."; the unsynced rows are covered by the tests and the owner live check); the tool-blocked step's read-only message. Never press Run on a step whose tool could reach anything real: with the fake host and tokens a Jira Run fails "can't find" and a Slack Run fails "expired", which is fine to see.
6. Write findings to the scratchpad (`r2d2-fe-byeye/findings.md`) with screenshots; fix should-fix items test first; stop the servers; leave `revenact_r2d2` for the owner to drop.

- [ ] **Step 5: Commit and push**

```bash
git add src/e2e/bundleRound2Act.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "test(e2e): round 2 D2 journeys; docs for the Jira link and the live Slack list

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push origin feat/agent-bundles-r2d2
```

Hand-off (to the controller, not a PR): the head, the vitest count, the by-eye findings, and anything the backend's "Changes during the build" changed.

---

## Self-review

1. **Contract coverage.** Link routes (§2) Tasks 1, 3, 4; callback outcomes (§2.3) Tasks 2, 4; previews' `as_you`/`link` (§3.4) Tasks 1, 2, 5; the lost-link gate (§3.2) needs no code (the server's `disabled_reason`/`disabled_link`, D3 house style) and is seen by eye; step errors (§3.6) are shown verbatim (D3); the live list (§4.1: `live=1`, `note`, rows) Tasks 1, 3, 6; `channel_choice` (§4.2) Task 6; the private gate (§4.3) needs no code (a `disabled_reason` without a link); N1 (§5) needs no code; R2D2-20 Task 7.
2. **Placeholders.** Code steps hold their code. Notes that ask the implementer to match an existing helper's real name (`renderFields`, `renderStep`, `SettingsSection`/`SettingsRow`/`LoadingState` props, `ConfirmDialog` props, `PickSearch`'s roles, `OUTSIDE.OPEN_SETTING`'s words) each name the `grep` that finds it.
3. **Type consistency.** `JiraLinkState`/`JiraLink` (Task 1) are what `testJiraLink.ts` (Task 3), `jiraLinkText.ts` (Task 2) and `JiraLinkSection` (Task 4) use. `JiraLinkHint` (Task 1) is what `linkHintText` (Task 2) and `LinkHint` (Task 5) take. `PickState.note` and `usePickList({ live })` (Task 6) are what the Slack field reads; `fetchStepOptions({ live })` (Task 1) is what the hook calls.
