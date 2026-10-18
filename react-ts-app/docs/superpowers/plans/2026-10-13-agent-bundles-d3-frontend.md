# Agent bundles, delivery 3 ("Outside actions"): frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bundle's outside steps can be reviewed, edited and run from the panel: an email reply (to, cc, subject, body, "From" the reader's own mailbox), a Slack reply (the channel from the server's list, the message), a Jira issue (project, issue type, priority and assignee picked from Jira's own lists, loaded live, with loading and error states; summary and description), a Jira assignment; a step whose tool can't act shows why with a link to Settings › Connections; every outside step says "Can't be undone" before Run; result links (Jira, Slack, the sent email) show in the panel and in History; Settings › Connections shows each tool as Read only or Can act with "Allow agents to act"; a failed step's notice shows in the bell.

**Architecture:** No new route. The panel's `BundleStepFields` hands the four outside kinds to a new `BundleOutsideFields`, which draws each kind's fields from `step.editable` and reads Jira's lists through one hook, `usePickList` (`GET /agents/bundles/<id>/steps/<step>/options/<list>/`), drawn by `PickSelect` and `PickSearch`. Result links come from the server (`step.links`, contract D3-16) and are drawn by one `StepLinks` component in the panel and History. Settings › Connections' `ConnectorRow` gains `AgentAccess`, which posts `/connectors/<id>/agents/` and follows a Slack consent's `authorize_url`. Words and pure rules stay in `features/agents/bundleText.ts`, `agentsText.ts` and `features/connectors/agentAccess.ts`, unit-tested. No Redux beyond the connectors slice's one new thunk.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), react-router 7, Redux Toolkit (connectors only), Tailwind v4 tokens, Vitest + Testing Library (jsdom) + user-event, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-13-agent-bundles-design.md` (§6.6 to §6.9, §7.3, §7.4, §8.2, §8.3, §9; the D3 row of §11). **API contract (binding, read-only):** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/bundles3-be/docs/superpowers/plans/2026-10-13-agent-bundles-d3-api.md` (backend branch `feat/agent-bundles-d3`). Read its "Decisions narrowing the spec" first: D3-1 to D3-28 are requirements here; §2 (the kinds), §4 (shapes), §5 (routes) and §6 (sentences) are the stubs' and types' source of truth. The D1 and D2 frontend plans and their merged code hold the house style this plan extends.

## Global Constraints

- **Worktree and branch.** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/bundles3-fe`, branch `feat/agent-bundles-d3` (on main `07a8f33c`: D1 #141 and D2 #142 merged). `node_modules` is a symlink: never commit it. Always `git add <explicit paths>` (and `git rm` for deletions), never `git add -A` or `git add .`. Never merge, never open a PR, never touch the servers on ports 8000 or 5173 (the owner uses them; the by-eye run in Task 11 uses 8013 and 5183).
- **Never run prettier. Never use `git stash`** (the stash stack is shared across worktrees).
- **Commands** (foreground): `npx vitest run <path> --maxWorkers=2`, `npx vitest run --maxWorkers=2`, `npx tsc -b`, `npm run lint`, `npm run build`. CI is blocked by GitHub billing: these local checks are the gate. Every task ends with `npx tsc -b` clean as well as its tests.
- **Every commit message is a conventional commit and ends with exactly this line:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Contract shapes are binding.** Test stubs answer exactly the contract's shapes and sentences; refusals are shown verbatim.
- **Tokens only** (`src/test/houseRules.ts` `RAW`): no hex, `rgb()`, named palette colours.
- **Type sizes 11/13/15 only**, through `TYPE.*`, `FIELD_ERROR`, `FORM_ALERT`; no `font-bold`, no `shadow-sm`/`shadow-md`, no `disabled:opacity-*`, no literal `font-mono-brand` in a `.tsx` (figures use `NUM`). The UI ratchet (`src/test/uiRatchet.test.ts`) ends each task with totals **equal** to `BASELINE`; new code adds zero offences (never raise a baseline).
- **Kinso look and the UI cleanup rules:** bordered quiet cards; flat `divide-y` rows; monochrome primary (`PRIMARY`), **one primary per surface**: the panel's **Run N selected** stays its only primary; "Allow agents to act" and "Make read only" are bordered (`BUTTON`); "Try again" in a list's error is bordered. Lucide icons only, each `aria-hidden="true"`; no emoji.
- **44px targets** on phones for every `<button>`, `<Link>`, `<a>`, `<select>`, `<input>`, `<textarea>`: `BUTTON`, `PRIMARY`, `QUIET`, `INPUT`, `SELECT`, `CHOICE`, `INLINE_TARGET`, `META_LINK`, or a local `const` built from one.
- **No em dash (`—`) anywhere** in `src/components/work/`, `src/pages/work/`, `src/features/work/`, `src/features/agents/bundle*`, `src/features/agents/testBundle*`, `src/components/integrations/AgentAccess*`, `src/features/connectors/agentAccess*`; comments and tests included.
- **Copy:** sentence case; the contract's and this plan's sentences word for word; server refusals and step errors shown verbatim.
- **States:** every pick list has a loading line (not a spinner), an error with **Try again**, and an empty line; the Settings switch shows its own busy word and an inline error.
- **External links** (`step.links` with `external: true`): `<a href target="_blank" rel="noopener noreferrer">`, an `ExternalLink` icon, and "(opens in a new tab)" for screen readers. Only `https://` URLs are ever drawn as external; anything else is dropped (defence in depth on top of the server's own allow-list).
- **Motion:** none added.
- **Privacy:** the page shows only what a bundle carries. "From" is the server's `preview.mail.from` (the reader's own mailbox); a sent email's link is drawn only when the server sends it (its runner only, D3-16).
- **Testing:** unit + integration + e2e (jsdom, `src/e2e/`), only `fetch` stubbed with contract-shaped stubs and fake data. Never mock the store. Nothing real is sent; no test reaches Slack, Jira, Google or Microsoft.

## Decisions (frontend, where the spec and the contract leave a choice)

1. **One editor per outside kind,** in `BundleOutsideFields`, drawn only for the keys in `step.editable` (a placeholder field is never editable, D1 D12), with the D2 save-on-blur and the D1 draft. Labels: Reply "To", "Cc", "Subject", "Reply"; Slack "Channel", "Message"; Jira "Project", "Issue type", "Summary", "Description", "Priority", "Assignee". Cost: low.
2. **Addresses are typed as one line,** comma or semicolon separated ("Separate addresses with commas."), sent as a list; the server's sentence shows under the field on refusal. Cost: trivial.
3. **Pick lists load when the step's fields first show** (the step is ticked and runnable, or failed and being retried), never before. Projects and priorities load once; issue types load for the chosen project and again when it changes; assignees load on a search of 1 to 100 characters after 300 ms, and once with an empty search. Loading: "Loading Jira projects…" (the list's noun); error: the server's `detail` when it sent one ("Couldn't reach Jira. Try again.", "Reconnect Jira to do this."), else "Couldn't load Jira projects."; with **Try again** (bordered). An empty answer: "Nothing to choose from." (assignees: "Nobody matches."). The stored value shows as the selected option before the list arrives, so nothing jumps. Cost: low.
4. **Jira's defaults are named, not hidden:** Priority has "Jira's default" (null); a create's Assignee has "Unassigned" (null); when the server's preview says `matched_later`, the Assignee line reads "Erin Eng (matched in Jira by email when it runs)" until a person picks someone. Changing Project clears the Issue type's id (the server's rule) and reloads the list. Cost: trivial.
5. **The Slack channel is a select of the server's `slack_channels`,** each "#support (This thread)" / "#escalations (A new message)"; choosing one saves `connector_id` (a number). Cost: trivial.
6. **Who it goes as is said once, above the fields:** "From carl@acme.io" (and "Goes in the same email thread." when `preview.mail.threaded`), "Posts as revenact", "Created in Jira as Jira Bot". When `preview.mail.from` is null the disabled reason already says why. Cost: trivial.
7. **A blocked step** keeps D1's look (unticked, disabled, the reason under the title) and adds **Open Connections** (`META_LINK`, a router link to `step.disabled_link`). Cost: trivial.
8. **"Can't be undone"** needs no new rule: `showsCantUndo` already returns `step.irreversible` for a kind without `draft_only`, and the server marks every outside step irreversible; a test pins all four. Cost: none.
9. **Result links are the server's `links`,** in the panel under an applied step and in a History row (outside steps' external links only, so a row is not a wall of app links). `outputLinks` stays for the stub only. Cost: low.
10. **Settings › Connections, per connector row** (tools with `agents.kinds`): "Agents: Read only" or "Agents: Can act · Allowed by Alice Admin"; for people with `manage_integrations`, **Allow agents to act** or **Make read only** (bordered). A consent answer (`authorize_url`) sends the browser to Slack; a refusal (`SLACK_SCOPE_MISSING`, `JIRA_CANT_ACT`, `RECONNECT`, `TOOL_UNREACHABLE`, `NOT_CONNECTED`) shows verbatim under the row (`role="alert"`). Hints by `needs`: "Slack will ask you to let Revenact post." (consent), "Needs a Slack bot token that can post (chat:write)." (token), "Revenact checks this Jira account can create and assign issues." (permission). A tool with no kinds (Zendesk, Freshdesk, webhook) reads "Agents: Read only" with "Agents can't act in Zendesk yet." and no button. The page's outcome line for `?connector=agents_on`: "Agents can now act through this connection." A connector without an `agents` block (an older backend) shows nothing new. Cost: low.
11. **Connector OAuth starts send credentials** (`credentials: 'include'`) so the browser keeps the server's binding cookie (contract D3-22). Cost: none.
12. **The bell** gives `agent_step_failed` the `OctagonAlert` icon; its message and link are the server's (`/work?queue=history&bundle=<id>` opens the bundle in History). Cost: trivial.
13. **Run stays enabled for a waiting outside step without a Jira project?** No: the Jira create editor's Project shows "Choose a project." as a field hint while empty, and Run still sends; the server fails the step with "Choose a Jira project, then Retry." (one rule, the server's). Cost: low.

## File Structure

**Create**
- `src/components/work/BundleOutsideFields.tsx` (+ `BundleOutsideFields.test.tsx`): the four kinds' editors (Decisions 1 to 6).
- `src/components/work/usePickList.ts` (+ `usePickList.test.tsx`): one live list (Decision 3).
- `src/components/work/PickSelect.tsx`, `src/components/work/PickSearch.tsx`: a list as a select, and a searched list (Decision 3, 4).
- `src/components/work/StepLinks.tsx`: result links (Decision 9).
- `src/features/connectors/agentAccess.ts` (+ `agentAccess.test.ts`): the Settings words and rules (Decision 10).
- `src/components/integrations/AgentAccess.tsx` (+ `AgentAccess.test.tsx`): the row's Read only / Can act (Decision 10).
- `src/e2e/bundleOutside.test.tsx`: the D3 journeys.

**Modify**
- `src/features/agents/agentTypes.ts`, `bundleTypes.ts`, `bundlesApi.ts` (+ test), `bundleText.ts` (+ test), `agentsText.ts` (+ test), `testBundleFixtures.ts`, `testBundles.ts` (+ test).
- `src/features/connectors/connectorsSlice.ts`; `src/features/notifications/types.ts`.
- `src/components/work/BundleStep.tsx`, `BundleStepFields.tsx`, `BundlePanel.test.tsx`; `src/pages/work/History.tsx` (+ test).
- `src/pages/integrations/Integrations.tsx` (+ test); `src/components/layout/NotificationKindIcon.tsx` (+ test).
- Docs (Task 11): `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`.

---

### Task 1: Contract types and API wrappers

**Files:**
- Modify: `src/features/agents/agentTypes.ts`, `src/features/agents/agentsText.ts` (`KIND_LABEL` only), `src/features/agents/bundleTypes.ts`, `src/features/agents/bundlesApi.ts`, `src/features/agents/bundlesApi.test.ts`, `src/features/agents/testBundleFixtures.ts` (`step()` defaults only), `src/features/connectors/connectorsSlice.ts`, `src/features/notifications/types.ts`

**Interfaces:**
- Produces (`agentTypes.ts`): `ActionKind` gains `'mail.send_reply' | 'slack.reply' | 'jira.create' | 'jira.assign'`, inserted in `ACTION_KINDS` after `'survey.send'`; `MailPreview { from: string | null; to: string[]; cc: string[]; subject: string; excerpt: string; threaded: boolean }`; `SlackPreview { channel: string; in_thread: boolean; as: string; excerpt: string }`; `JiraAssignee { name: string; matched_later: boolean }`; `JiraPreview { site: string; project: string; issue_type: string; summary: string; excerpt: string; priority: string | null; assignee: JiraAssignee | null; as: string }`; `JiraAssignPreview { site: string; issue: string; assignee: JiraAssignee | null; as: string }`; `ActionPreview` gains `mail?`, `slack?`, `jira?`, `jira_assign?`; `OUTSIDE_KINDS: readonly ActionKind[]`.
- Produces (`bundleTypes.ts`): `PickValue { id: string; name: string }`; `StepFieldValue` gains `PickValue`; `StepLink { label: string; url: string; external: boolean }`; `BundleStep.disabled_link: string | null`, `BundleStep.links: StepLink[]`; `PickListName = 'jira_projects' | 'jira_issue_types' | 'jira_priorities' | 'jira_assignees' | 'slack_channels'`; `PickOption { id: string; name: string; detail: string }`; `PickListPayload { options: PickOption[]; more: boolean }`.
- Produces (API): `fetchStepOptions(bundleId: number, stepId: number, list: PickListName, params?: { project?: string; query?: string }): Promise<PickListPayload>`.
- Produces (`connectorsSlice.ts`): `ConnectorAgents { kinds: string[]; can_act: boolean; needs: 'consent' | 'token' | 'permission' | null; allowed_by: { id: number; name: string } | null; allowed_at: string | null }`; `Connector.agents?: ConnectorAgents` (absent from an older backend); thunk `setConnectorAgents({ id, canAct }) -> { connector: Connector } | { authorize_url: string }` (`rejectValue`: the server's sentence); `startConnectorOAuth` sends `credentials: 'include'`.
- Produces (`notifications/types.ts`): `NotificationKind` gains `'agent_step_failed'`.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/agents/bundlesApi.test.ts`, inside its `describe` (the file's `spyFetch()` records `{ method, url, body }`):

```ts
  it('reads a step pick list (agent bundles D3 contract §5.2)', async () => {
    const seen = spyFetch();
    await fetchStepOptions(12, 41, 'jira_projects');
    await fetchStepOptions(12, 41, 'jira_issue_types', { project: 'SUP' });
    await fetchStepOptions(12, 42, 'jira_assignees', { project: 'SUP', query: 'pri ya' });
    expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual([
      'GET /agents/bundles/12/steps/41/options/jira_projects/',
      'GET /agents/bundles/12/steps/41/options/jira_issue_types/?project=SUP',
      'GET /agents/bundles/12/steps/42/options/jira_assignees/?project=SUP&query=pri+ya',
    ]);
  });
```

and add `fetchStepOptions` to its import. Create `src/features/connectors/connectorsSlice.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import reducer, { setConnectorAgents, startConnectorOAuth } from './connectorsSlice';

// Agent bundles D3 contract §5.3, D3-22. Only fetch is stubbed.
afterEach(() => vi.unstubAllGlobals());

function answer(status: number, body: unknown) {
  const spy = vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('connectors slice: agents', () => {
  const store = () => configureStore({ reducer: { connectors: reducer } });

  it('posts the switch with credentials and keeps the answered connector', async () => {
    const spy = answer(200, { id: 5, name: 'Slack', agents: { kinds: ['slack.reply'], can_act: true, needs: null, allowed_by: { id: 1, name: 'Alice' }, allowed_at: '2026-10-13T10:00:00Z' } });
    const s = store();
    const result = await s.dispatch(setConnectorAgents({ id: 5, canAct: true }));
    expect(setConnectorAgents.fulfilled.match(result)).toBe(true);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/connectors\/5\/agents\/$/);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(String(init.body))).toEqual({ can_act: true });
    expect(s.getState().connectors.items[0].agents?.can_act).toBe(true);
  });

  it('hands back a consent link without touching the store', async () => {
    answer(200, { authorize_url: 'https://slack.com/oauth/v2/authorize?x=1' });
    const s = store();
    const result = await s.dispatch(setConnectorAgents({ id: 5, canAct: true }));
    expect(result.payload).toEqual({ authorize_url: 'https://slack.com/oauth/v2/authorize?x=1' });
    expect(s.getState().connectors.items).toEqual([]);
  });

  it('rejects with the server sentence', async () => {
    answer(409, { code: 'JIRA_CANT_ACT', detail: "This Jira account can't create and assign issues in SUP. Give it those permissions in Jira, then try again." });
    const result = await store().dispatch(setConnectorAgents({ id: 6, canAct: true }));
    expect(result.payload).toBe("This Jira account can't create and assign issues in SUP. Give it those permissions in Jira, then try again.");
  });

  it('starts a connector sign-in with credentials', async () => {
    const spy = answer(200, { authorize_url: 'https://slack.com/oauth/v2/authorize' });
    await store().dispatch(startConnectorOAuth({ id: 5, form: { channel: 'C0SUPPORT' } }));
    expect((spy.mock.calls[0] as unknown as [string, RequestInit])[1].credentials).toBe('include');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/agents/bundlesApi.test.ts src/features/connectors/connectorsSlice.test.ts --maxWorkers=2`
Expected: FAIL: `fetchStepOptions is not exported`; `setConnectorAgents is not exported`.

- [ ] **Step 3: The types**

In `src/features/agents/agentTypes.ts`, extend `ActionKind` with `| 'mail.send_reply' | 'slack.reply' | 'jira.create' | 'jira.assign'`, insert the four into `ACTION_KINDS` after `'survey.send'`, and add:

```ts
/** Agent bundles D3: the kinds that act outside Revenact (contract §2). */
export const OUTSIDE_KINDS: readonly ActionKind[] = ['mail.send_reply', 'slack.reply', 'jira.create', 'jira.assign'];

/** contract §2.1: `from` is the reader's own mailbox while waiting, the sender once sent. */
export interface MailPreview {
  from: string | null;
  to: string[];
  cc: string[];
  subject: string;
  excerpt: string;
  threaded: boolean;
}

/** contract §2.2. */
export interface SlackPreview {
  channel: string;
  in_thread: boolean;
  as: string;
  excerpt: string;
}

/** contract §2.3: `matched_later`, the model's member, matched by email when it runs. */
export interface JiraAssignee {
  name: string;
  matched_later: boolean;
}

export interface JiraPreview {
  site: string;
  project: string;
  issue_type: string;
  summary: string;
  excerpt: string;
  priority: string | null;
  assignee: JiraAssignee | null;
  as: string;
}

/** contract §2.4. */
export interface JiraAssignPreview {
  site: string;
  issue: string;
  assignee: JiraAssignee | null;
  as: string;
}
```

and add to `ActionPreview`:

```ts
  mail?: MailPreview;
  slack?: SlackPreview;
  jira?: JiraPreview;
  jira_assign?: JiraAssignPreview;
```

In `src/features/agents/agentsText.ts`, `KIND_LABEL` gains (the server's labels, contract §1.2):

```ts
  'mail.send_reply': 'Send an email reply',
  'slack.reply': 'Reply in Slack',
  'jira.create': 'Create a Jira issue',
  'jira.assign': 'Assign a Jira issue',
```

In `src/features/agents/bundleTypes.ts`:

```ts
/** A value picked from a tool's list (contract §2.3). */
export interface PickValue {
  id: string;
  name: string;
}

export type StepFieldValue = string | number | boolean | string[] | PickValue | null;

/** A step's result link (contract §4.1, D3-16): an app path, or the tool's own https page. */
export interface StepLink {
  label: string;
  url: string;
  external: boolean;
}

export type PickListName = 'jira_projects' | 'jira_issue_types' | 'jira_priorities' | 'jira_assignees' | 'slack_channels';

export interface PickOption {
  id: string;
  name: string;
  detail: string;
}

/** GET /agents/bundles/<id>/steps/<step>/options/<list>/ (contract §5.2). */
export interface PickListPayload {
  options: PickOption[];
  more: boolean;
}
```

(replace the old `StepFieldValue` line) and add to `BundleStep`, after `disabled_reason`:

```ts
  /** Where the blocked tool is set up (contract §4.1): "/settings/connections", else null. */
  disabled_link: string | null;
  /** The server's result links for this reader (contract §4.1). */
  links: StepLink[];
```

In `testBundleFixtures.ts`, `step()`'s defaults gain `disabled_link: null,` and `links: [],`.

- [ ] **Step 4: The wrappers**

In `src/features/agents/bundlesApi.ts`:

```ts
export function fetchStepOptions(bundleId: number, stepId: number, list: PickListName, params: { project?: string; query?: string } = {}) {
  const query = new URLSearchParams();
  if (params.project) query.set('project', params.project);
  if (params.query) query.set('query', params.query);
  const text = query.toString();
  return apiFetch<PickListPayload>(`/agents/bundles/${bundleId}/steps/${stepId}/options/${list}/${text ? `?${text}` : ''}`);
}
```

(import `PickListName`, `PickListPayload`).

In `src/features/connectors/connectorsSlice.ts`, add the type and `agents?: ConnectorAgents;` to `Connector` (after `setup`):

```ts
/** What agents may do through this connector (agent bundles D3 contract §4.3). */
export interface ConnectorAgents {
  kinds: string[];
  can_act: boolean;
  needs: 'consent' | 'token' | 'permission' | null;
  allowed_by: { id: number; name: string } | null;
  allowed_at: string | null;
}
```

the thunk:

```ts
/** POST /connectors/<id>/agents/ (contract §5.3): the connector, or Slack's consent link. */
export const setConnectorAgents = createAsyncThunk<
  { connector: Connector } | { authorize_url: string },
  { id: number; canAct: boolean },
  { rejectValue: string }
>('connectors/agents', async ({ id, canAct }, { rejectWithValue }) => {
  try {
    const answer = await apiFetch<Connector | { authorize_url: string }>(`/connectors/${id}/agents/`, {
      method: 'POST',
      body: { can_act: canAct },
      // The consent's binding cookie must come back with the browser (contract D3-22).
      credentials: 'include',
    });
    return 'authorize_url' in answer ? { authorize_url: answer.authorize_url } : { connector: answer };
  } catch (err) {
    return rejectWithValue(message(err, 'Could not change what agents may do.'));
  }
});
```

`startConnectorOAuth`'s `apiFetch` call gains `credentials: 'include',`. In `extraReducers`, before `.addCase(disconnectConnector.fulfilled, ...)`:

```ts
      .addCase(setConnectorAgents.fulfilled, (state, action) => {
        if ('connector' in action.payload) replace(state, action.payload.connector);
      })
```

In `src/features/notifications/types.ts`, add to `NotificationKind`:

```ts
  // "Step 2 failed in “Pizza Hut: login loop”: Jira says the project SUP needs a component."
  // (or "2 steps failed in …") for the person who ran it, linking to
  // /work?queue=history&bundle=<id> (agent bundles D3 contract §7).
  | 'agent_step_failed'
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run src/features/agents/bundlesApi.test.ts src/features/connectors/connectorsSlice.test.ts --maxWorkers=2 && npx tsc -b`
Expected: PASS and clean. (`tsc` finds every exhaustive `Record<ActionKind, …>`; `KIND_LABEL` is the only one.)

- [ ] **Step 6: Commit**

```bash
git add src/features/agents/agentTypes.ts src/features/agents/agentsText.ts src/features/agents/bundleTypes.ts src/features/agents/bundlesApi.ts src/features/agents/bundlesApi.test.ts src/features/agents/testBundleFixtures.ts src/features/connectors/connectorsSlice.ts src/features/connectors/connectorsSlice.test.ts src/features/notifications/types.ts
git commit -m "feat(agents): outside step types, pick-list and connector agents wrappers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The stubs and fixtures: outside bundles, pick lists, links

**Files:**
- Modify: `src/features/agents/testBundleFixtures.ts`, `src/features/agents/testBundles.ts`, `src/features/agents/testBundles.test.ts`

**Interfaces:**
- Consumes: Task 1's types.
- Produces (fixtures): `B_OUTSIDE` (waiting, id 401, a Slack thread on Pizza Hut: step 411 `mail.send_reply`, 412 `slack.reply`, 413 `jira.create`, 414 `jira.assign` naming `{{step 3.ticket_key}}`); `B_BLOCKED` (waiting, id 402: step 421 `slack.reply` blocked "Ask an admin to allow Revenact to post in Slack." with `disabled_link: '/settings/connections'`); `B_OUTSIDE_DONE` (done, id 403: applied `jira.create` 431 and `slack.reply` 432 with `links`); `OUTSIDE_BUNDLES`; `PICK_LISTS` (the fake lists by name).
- Produces (stub): `BundlesStub.options?: Partial<Record<PickListName, PickOption[]>>`, `BundlesStub.failOptions?: Partial<Record<PickListName, { status: number; body: unknown }>>` (each answered once), `BundlesStub.failOutside?: Record<number, string>` (step id: the error a run gives it, once); the options route `GET /agents/bundles/<id>/steps/<step>/options/<list>/` answering contract §5.2 (400 for a list the kind has no, `{"project": ["Choose a project first."]}` for issue types without one); a run fills an applied outside step's `outputs` and `links` the way the server does (`jira.*` "Open SUP-501 in Jira", `slack.reply` "Open the Slack message"), and D1 kinds' links from their outputs (`outputLinks`).

- [ ] **Step 1: Write the failing tests**

Append to `src/features/agents/testBundles.test.ts`:

```ts
describe('agent bundles D3 stub', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('answers a step pick list, and its refusals', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES, failOptions: { jira_priorities: { status: 502, body: { code: 'TOOL_UNREACHABLE', detail: "Couldn't reach Jira. Try again." } } } });
    const get = (path: string) => fetch(`http://localhost/api/v1${path}`).then(async (r) => ({ status: r.status, body: await r.json() }));
    expect((await get('/agents/bundles/401/steps/413/options/jira_projects/')).body.options.map((o: { id: string }) => o.id)).toEqual(['SUP', 'ENG']);
    expect((await get('/agents/bundles/401/steps/413/options/jira_issue_types/')).body).toEqual({ project: ['Choose a project first.'] });
    expect((await get('/agents/bundles/401/steps/413/options/jira_issue_types/?project=ENG')).body.options.map((o: { name: string }) => o.name)).toEqual(['Bug']);
    expect((await get('/agents/bundles/401/steps/413/options/slack_channels/')).body).toEqual({ list: ['This step has no such list.'] });
    expect(await get('/agents/bundles/401/steps/413/options/jira_priorities/')).toEqual({ status: 502, body: { code: 'TOOL_UNREACHABLE', detail: "Couldn't reach Jira. Try again." } });
    expect((await get('/agents/bundles/401/steps/413/options/jira_priorities/')).status).toBe(200);
    expect((await get('/agents/bundles/401/steps/414/options/jira_assignees/?query=eri')).body.options.map((o: { name: string }) => o.name)).toEqual(['Erin Eng']);
  });

  it('a run gives outside steps their outputs and links, and fails one on request', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES, failOutside: { 412: 'Slack refused the post: the app isn\'t in #support.' } });
    const body = { steps: B_OUTSIDE.steps.map((s) => ({ id: s.id, selected: true })) };
    const answer = await fetch('http://localhost/api/v1/agents/bundles/401/run/', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
    const [mail, slack, create, assign] = answer.bundle.steps;
    expect(mail.status).toBe('applied');
    expect(slack).toMatchObject({ status: 'failed', error: "Slack refused the post: the app isn't in #support." });
    expect(create.outputs).toEqual({ ticket_key: 'SUP-501', ticket_url: 'https://acme.atlassian.net/browse/SUP-501' });
    expect(create.links).toEqual([{ label: 'Open SUP-501 in Jira', url: 'https://acme.atlassian.net/browse/SUP-501', external: true }]);
    expect(assign.outputs).toEqual({ ticket_key: 'SUP-501', ticket_url: 'https://acme.atlassian.net/browse/SUP-501' });
  });
});
```

(add `OUTSIDE_BUNDLES, B_OUTSIDE` to the imports from `./testBundleFixtures`, and `afterEach` to the vitest import if the file lacks it).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/agents/testBundles.test.ts --maxWorkers=2`
Expected: FAIL: `OUTSIDE_BUNDLES` is not exported.

- [ ] **Step 3: The fixtures**

Append to `src/features/agents/testBundleFixtures.ts`:

```ts
/** Agent bundles D3: a Slack thread on Pizza Hut (contract §2). */
const SLACK_SOURCE: BundleSource = { kind: 'thread', label: 'Slack', channel: 'slack', from: 'ann@pizzahut.com', messages: 1, last_message_at: '2026-10-07T09:58:00Z', ticket: 'SL-40001', link: 'https://slack.com/archives/C0SUPPORT/p1760339999000100' };

export const B_OUTSIDE: Bundle = bundle({
  id: 401,
  title: 'Pizza Hut: login loop after password reset',
  reason: 'Ann is locked out since the reset.',
  source: SLACK_SOURCE,
  can_reject: true,
  steps: [
    step({
      id: 411,
      position: 1,
      kind: 'mail.send_reply',
      label: 'Send an email reply',
      title: 'Answer Ann',
      outside: true,
      irreversible: true,
      fields: { to: ['ann@pizzahut.com'], cc: [], subject: 'Re: Login loop', body: "We're on it: the fix ships Friday." },
      editable: ['to', 'cc', 'subject', 'body'],
      preview: { mail: { from: 'alice@acme.io', to: ['ann@pizzahut.com'], cc: [], subject: 'Re: Login loop', excerpt: "We're on it: the fix ships Friday.", threaded: true } },
    }),
    step({
      id: 412,
      position: 2,
      kind: 'slack.reply',
      label: 'Reply in Slack',
      title: "Tell Ann we're on it",
      outside: true,
      irreversible: true,
      fields: { connector_id: 5, text: 'Thanks Ann, we are on it.' },
      editable: ['connector_id', 'text'],
      preview: { slack: { channel: '#support', in_thread: true, as: 'revenact', excerpt: 'Thanks Ann, we are on it.' } },
    }),
    step({
      id: 413,
      position: 3,
      kind: 'jira.create',
      label: 'Create a Jira issue',
      title: 'Log the login loop',
      outside: true,
      irreversible: true,
      fields: { project: 'SUP', issue_type: { id: '', name: 'Task' }, summary: 'Login loop after password reset', description: 'Nobody can log in.', priority: { id: '', name: 'High' }, assignee: null },
      editable: ['project', 'issue_type', 'summary', 'description', 'priority', 'assignee'],
      preview: { jira: { site: 'acme.atlassian.net', project: 'SUP', issue_type: 'Task', summary: 'Login loop after password reset', excerpt: 'Nobody can log in.', priority: 'High', assignee: { name: 'Erin Eng', matched_later: true }, as: 'Jira Bot' } },
    }),
    step({
      id: 414,
      position: 4,
      kind: 'jira.assign',
      label: 'Assign a Jira issue',
      title: 'Give it to Erin',
      outside: true,
      irreversible: true,
      fields: { assignee: null },
      editable: ['assignee'],
      placeholders: [{ field: 'issue', step: 3, key: 'ticket_key', label: 'Jira ticket from step 3' }],
      preview: { jira_assign: { site: 'acme.atlassian.net', issue: '{{step 3.ticket_key}}', assignee: { name: 'Erin Eng', matched_later: true }, as: 'Jira Bot' } },
    }),
  ],
});

export const B_BLOCKED: Bundle = bundle({
  id: 402,
  title: 'Pizza Hut: export fails on large files',
  source: SLACK_SOURCE,
  can_run: false,
  can_reject: true,
  steps: [
    step({
      id: 421,
      position: 1,
      kind: 'slack.reply',
      label: 'Reply in Slack',
      title: 'Tell Ann we are looking',
      outside: true,
      irreversible: true,
      can_run: false,
      selected: false,
      disabled_reason: 'Ask an admin to allow Revenact to post in Slack.',
      disabled_link: '/settings/connections',
      fields: { connector_id: 5, text: 'We are looking into it.' },
      editable: ['connector_id', 'text'],
      preview: { slack: { channel: '#support', in_thread: true, as: 'revenact', excerpt: 'We are looking into it.' } },
    }),
  ],
});

export const B_OUTSIDE_DONE: Bundle = bundle({
  id: 403,
  title: 'Pizza Hut: billing question answered',
  source: SLACK_SOURCE,
  status: 'done',
  can_run: false,
  run_by: ALICE,
  run_started_at: '2026-10-07T10:40:00Z',
  run_finished_at: '2026-10-07T10:42:00Z',
  updated_at: '2026-10-07T10:42:00Z',
  steps: [
    step({ id: 431, position: 1, kind: 'jira.create', label: 'Create a Jira issue', title: 'Log the billing bug', status: 'applied', outside: true, irreversible: true, can_run: false, outputs: { ticket_key: 'SUP-77', ticket_url: 'https://acme.atlassian.net/browse/SUP-77' }, links: [{ label: 'Open SUP-77 in Jira', url: 'https://acme.atlassian.net/browse/SUP-77', external: true }], undo: { allowed: false, until: null, reason: 'irreversible' } }),
    step({ id: 432, position: 2, kind: 'slack.reply', label: 'Reply in Slack', title: 'Tell Ann', status: 'applied', outside: true, irreversible: true, can_run: false, outputs: { slack_ts: '1760340001.000100', slack_url: 'https://slack.com/archives/C0SUPPORT/p1760340001000100' }, links: [{ label: 'Open the Slack message', url: 'https://slack.com/archives/C0SUPPORT/p1760340001000100', external: true }], undo: { allowed: false, until: null, reason: 'irreversible' } }),
  ],
});

export const OUTSIDE_BUNDLES: Bundle[] = [B_OUTSIDE, B_BLOCKED, B_OUTSIDE_DONE];

/** The fake lists the options route answers (contract §5.2). */
export const PICK_LISTS = {
  jira_projects: [{ id: 'SUP', name: 'Support', detail: 'SUP' }, { id: 'ENG', name: 'Engineering', detail: 'ENG' }],
  jira_issue_types: { SUP: [{ id: '10001', name: 'Task', detail: '' }, { id: '10002', name: 'Bug', detail: '' }], ENG: [{ id: '10002', name: 'Bug', detail: '' }] } as Record<string, { id: string; name: string; detail: string }[]>,
  jira_priorities: [{ id: '2', name: 'High', detail: '' }, { id: '3', name: 'Medium', detail: '' }, { id: '4', name: 'Low', detail: '' }],
  jira_assignees: [{ id: 'acc-priya', name: 'Priya Shah', detail: 'priya@acme.io' }, { id: 'acc-erin', name: 'Erin Eng', detail: 'erin@acme.io' }],
  slack_channels: [{ id: '5', name: '#support', detail: 'This thread' }, { id: '6', name: '#escalations', detail: 'A new message' }],
};
```

- [ ] **Step 4: The stub**

In `src/features/agents/testBundles.ts`: import `OUTSIDE_BUNDLES`-free things only (the fixtures are passed in by tests), `PICK_LISTS` from `./testBundleFixtures`, `outputLinks` from `./bundleText`, and `PickListName`, `PickOption`, `StepLink` from `./bundleTypes`. Extend `BundlesStub`:

```ts
  /** Pick lists by name, overriding PICK_LISTS (contract §5.2). */
  options?: Partial<Record<PickListName, PickOption[]>>;
  /** The next read of a list answers this instead, once. */
  failOptions?: Partial<Record<PickListName, { status: number; body: unknown }>>;
  /** Step id: the error a run gives an outside step, once (a retry succeeds). */
  failOutside?: Record<number, string>;
```

Add to `OUTPUTS`:

```ts
  'jira.create': () => ({ ticket_key: 'SUP-501', ticket_url: 'https://acme.atlassian.net/browse/SUP-501' }),
  'slack.reply': () => ({ slack_ts: '1760340001.000100', slack_url: 'https://slack.com/archives/C0SUPPORT/p1760340001000100' }),
```

and, next to `OUTPUTS`, the server's link rule (contract §4.1):

```ts
/** A step's links as the server writes them (contract §4.1, D3-16). */
function linksFor(s: BundleStep): StepLink[] {
  const app = outputLinks(s.outputs).map((l) => ({ label: l.label, url: l.to, external: false }));
  const out: StepLink[] = [...app];
  if (typeof s.outputs.ticket_url === 'string') out.push({ label: `Open ${String(s.outputs.ticket_key)} in Jira`, url: s.outputs.ticket_url, external: true });
  if (typeof s.outputs.slack_url === 'string') out.push({ label: 'Open the Slack message', url: s.outputs.slack_url, external: true });
  return out;
}
```

Beside `const failing = ...`, declare `const outsideFailing = { ...(stub.failOutside ?? {}) };`, and in `runStep`, right after the `if (failing[s.id]) {...}` block, add the outside failure:

```ts
    if (outsideFailing[s.id]) {
      leaveProposed(s);
      s.status = 'failed';
      s.error = outsideFailing[s.id];
      delete outsideFailing[s.id];
      return;
    }
```

For `jira.assign`, fill its issue the same way the preview's placeholders are filled (the existing `fill(b, value)` over `s.preview` already turns `{{step 3.ticket_key}}` into `SUP-501`). At the end of `runStep`, after `s.outputs = ...`:

```ts
    if (s.kind === 'jira.assign') s.outputs = { ticket_key: String(s.preview.jira_assign?.issue ?? ''), ticket_url: `https://acme.atlassian.net/browse/${String(s.preview.jira_assign?.issue ?? '')}` };
    s.links = linksFor(s);
```

Add the options route to the `spy`, before `const undo = ...`:

```ts
    const optionsPath = /^\/agents\/bundles\/(\d+)\/steps\/(\d+)\/options\/([a-z_]+)\/$/.exec(path);
    if (optionsPath && method === 'GET') {
      const b = bundles.get(Number(optionsPath[1]));
      const s = b?.steps.find((candidate) => candidate.id === Number(optionsPath[2]));
      if (!b || !s) return json(404, { code: 'NO_SUCH_BUNDLE', detail: 'No such bundle.' });
      return pickList(s, optionsPath[3] as PickListName, url);
    }
```

and the function (inside `stubBundles`):

```ts
  const KIND_LISTS: Record<string, PickListName[]> = {
    'jira.create': ['jira_projects', 'jira_issue_types', 'jira_priorities', 'jira_assignees'],
    'jira.assign': ['jira_assignees'],
    'slack.reply': ['slack_channels'],
  };
  const failList = { ...(stub.failOptions ?? {}) };

  /** Contract §5.2. */
  function pickList(s: BundleStep, list: PickListName, url: URL) {
    if (!(KIND_LISTS[s.kind] ?? []).includes(list)) return json(400, { list: ['This step has no such list.'] });
    const query = url.searchParams.get('query') ?? '';
    if (query.length > 100) return json(400, { query: ['Keep the search under 100 characters.'] });
    const failed = failList[list];
    if (failed) {
      delete failList[list];
      return json(failed.status, failed.body);
    }
    if (list === 'jira_issue_types') {
      const project = url.searchParams.get('project') ?? '';
      if (!project) return json(400, { project: ['Choose a project first.'] });
      return json(200, { options: stub.options?.jira_issue_types ?? PICK_LISTS.jira_issue_types[project] ?? [], more: false });
    }
    const rows = (stub.options?.[list] ?? (PICK_LISTS[list] as PickOption[])).filter((o) => o.name.toLowerCase().includes(query.toLowerCase()));
    return json(200, { options: rows, more: false });
  }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/features/agents/testBundles.test.ts --maxWorkers=2 && npx tsc -b`
Expected: PASS and clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/agents/testBundleFixtures.ts src/features/agents/testBundles.ts src/features/agents/testBundles.test.ts
git commit -m "test(agents): outside bundles, pick lists and result links in the stub

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The words: kind previews, outside field labels, list nouns, addresses

**Files:**
- Modify: `src/features/agents/agentsText.ts` (+ `agentsText.test.ts`), `src/features/agents/bundleText.ts` (+ `bundleText.test.ts`)

**Interfaces:**
- Produces (`agentsText.ts`): `previewText` handles the four kinds.
- Produces (`bundleText.ts`): `OUTSIDE` (the words below); `listNoun(list: PickListName): string`; `listLoading(list)`, `listFailed(list)`; `parseAddresses(text: string): string[]`; `addressesText(list: StepFieldValue): string`; `fromText(preview: MailPreview): string | null`; `isExternal(link: StepLink): boolean`; `historyLinks(bundle: Bundle): StepLink[]`.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/agents/agentsText.test.ts`:

```ts
describe('outside previews (agent bundles D3 contract §2)', () => {
  const base = { id: 1, agent: 'cs' as const, title: 't', status: 'proposed' as const, record: null, rationale: '', evidence: [], decided_by: null, decided_at: null, auto: false, applied_at: null, undo: null, undone_by: null, undone_at: null, result: {} as never, created_at: '', bundle: 1 };

  it('says what each outside step will do', () => {
    expect(previewText({ ...base, kind: 'mail.send_reply', preview: { mail: { from: 'alice@acme.io', to: ['ann@pizzahut.com'], cc: [], subject: 'Re: Login loop', excerpt: '', threaded: true } } })).toBe('Send a reply to ann@pizzahut.com: Re: Login loop');
    expect(previewText({ ...base, kind: 'slack.reply', preview: { slack: { channel: '#support', in_thread: true, as: 'revenact', excerpt: '' } } })).toBe('Reply in Slack in #support, in the thread');
    expect(previewText({ ...base, kind: 'slack.reply', preview: { slack: { channel: '#escalations', in_thread: false, as: 'revenact', excerpt: '' } } })).toBe('Post in Slack in #escalations');
    expect(previewText({ ...base, kind: 'jira.create', preview: { jira: { site: 'acme.atlassian.net', project: 'SUP', issue_type: 'Bug', summary: 'Login loop', excerpt: '', priority: null, assignee: null, as: 'Jira Bot' } } })).toBe('Create a Jira Bug in SUP: Login loop');
    expect(previewText({ ...base, kind: 'jira.create', preview: { jira: { site: '', project: '', issue_type: 'Task', summary: 'Login loop', excerpt: '', priority: null, assignee: null, as: '' } } })).toBe('Create a Jira Task: Login loop');
    expect(previewText({ ...base, kind: 'jira.assign', preview: { jira_assign: { site: '', issue: 'SUP-12', assignee: { name: 'Erin Eng', matched_later: false }, as: '' } } })).toBe('Assign SUP-12 in Jira to Erin Eng');
  });
});
```

Append to `src/features/agents/bundleText.test.ts`:

```ts
describe('outside words (agent bundles D3)', () => {
  it('reads addresses typed as one line', () => {
    expect(parseAddresses(' ann@pizzahut.com, ops@pizzahut.com;  sam@x.com ,,')).toEqual(['ann@pizzahut.com', 'ops@pizzahut.com', 'sam@x.com']);
    expect(addressesText(['a@x.com', 'b@x.com'])).toBe('a@x.com, b@x.com');
    expect(addressesText(null)).toBe('');
  });

  it('names each list', () => {
    expect(listLoading('jira_projects')).toBe('Loading Jira projects…');
    expect(listFailed('jira_assignees')).toBe("Couldn't load people in Jira.");
    expect(listNoun('slack_channels')).toBe('Slack channels');
  });

  it('says who a reply goes from', () => {
    expect(fromText({ from: 'alice@acme.io', to: [], cc: [], subject: '', excerpt: '', threaded: true })).toBe('From alice@acme.io');
    expect(fromText({ from: null, to: [], cc: [], subject: '', excerpt: '', threaded: false })).toBeNull();
  });

  it('draws only https links as external, and History shows outside ones', () => {
    expect(isExternal({ label: 'x', url: 'https://acme.atlassian.net/browse/SUP-1', external: true })).toBe(true);
    expect(isExternal({ label: 'x', url: 'javascript:alert(1)', external: true })).toBe(false);
    expect(historyLinks(B_OUTSIDE_DONE).map((l) => l.label)).toEqual(['Open SUP-77 in Jira', 'Open the Slack message']);
  });
});
```

(add the new names to the imports; `B_OUTSIDE_DONE` from `./testBundleFixtures`).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/agents/agentsText.test.ts src/features/agents/bundleText.test.ts --maxWorkers=2`
Expected: FAIL: the new names are not exported; `previewText` falls through to the generic line.

- [ ] **Step 3: The previews**

In `src/features/agents/agentsText.ts`, `previewText`, before `if (p.task && p.field)`:

```ts
  if (action.kind === 'mail.send_reply' && p.mail) return `Send a reply to ${p.mail.to.join(', ')}: ${p.mail.subject}`;
  if (action.kind === 'slack.reply' && p.slack) return p.slack.in_thread ? `Reply in Slack in ${p.slack.channel}, in the thread` : `Post in Slack in ${p.slack.channel}`;
  if (action.kind === 'jira.create' && p.jira) return `Create a Jira ${p.jira.issue_type}${p.jira.project ? ` in ${p.jira.project}` : ''}: ${p.jira.summary}`;
  if (action.kind === 'jira.assign' && p.jira_assign) return `Assign ${p.jira_assign.issue} in Jira${p.jira_assign.assignee ? ` to ${p.jira_assign.assignee.name}` : ''}`;
```

- [ ] **Step 4: The words**

In `src/features/agents/bundleText.ts` (import `MailPreview` from `./agentTypes`, `PickListName`, `StepFieldValue`, `StepLink` from `./bundleTypes`):

```ts
/** Agent bundles D3: the outside steps' words (frontend Decisions 1 to 7). */
export const OUTSIDE = {
  TO: 'To',
  CC: 'Cc',
  ADDRESSES_HINT: 'Separate addresses with commas.',
  REPLY: 'Reply',
  CHANNEL: 'Channel',
  MESSAGE: 'Message',
  PROJECT: 'Project',
  CHOOSE_PROJECT: 'Choose a project.',
  ISSUE_TYPE: 'Issue type',
  SUMMARY: 'Summary',
  DESCRIPTION: 'Description',
  PRIORITY: 'Priority',
  ASSIGNEE: 'Assignee',
  JIRA_DEFAULT: "Jira's default",
  UNASSIGNED: 'Unassigned',
  SEARCH_PEOPLE: 'Search people in Jira',
  NOBODY: 'Nobody matches.',
  NOTHING: 'Nothing to choose from.',
  TRY_AGAIN: 'Try again',
  THREADED: 'Goes in the same email thread.',
  OPEN_SETTING: 'Open Connections',
  OPENS_NEW_TAB: '(opens in a new tab)',
} as const;

export const postsAsText = (who: string): string => `Posts as ${who}`;
export const jiraAsText = (who: string): string => `Created in Jira as ${who}`;
export const matchedLaterText = (name: string): string => `${name} (matched in Jira by email when it runs)`;

const LIST_NOUN: Record<PickListName, string> = {
  jira_projects: 'Jira projects',
  jira_issue_types: 'issue types',
  jira_priorities: 'priorities',
  jira_assignees: 'people in Jira',
  slack_channels: 'Slack channels',
};
export const listNoun = (list: PickListName): string => LIST_NOUN[list];
export const listLoading = (list: PickListName): string => `Loading ${LIST_NOUN[list]}…`;
export const listFailed = (list: PickListName): string => `Couldn't load ${LIST_NOUN[list]}.`;

/** One typed line of addresses as a list (Decision 2). */
export function parseAddresses(text: string): string[] {
  return text.split(/[,;]/).map((part) => part.trim()).filter(Boolean);
}

export function addressesText(value: StepFieldValue): string {
  return Array.isArray(value) ? value.join(', ') : '';
}

export function fromText(preview: MailPreview): string | null {
  return preview.from ? `From ${preview.from}` : null;
}

/** Only https URLs are ever drawn as external links (Global Constraints). */
export function isExternal(link: StepLink): boolean {
  return link.external && link.url.startsWith('https://');
}

/** A History row's links: its applied outside steps' external links (Decision 9). */
export function historyLinks(bundle: Bundle): StepLink[] {
  return bundle.steps.filter((s) => s.outside && s.status === 'applied').flatMap((s) => (s.links ?? []).filter(isExternal));
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/features/agents/agentsText.test.ts src/features/agents/bundleText.test.ts --maxWorkers=2 && npx tsc -b`
Expected: PASS and clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/agents/agentsText.ts src/features/agents/agentsText.test.ts src/features/agents/bundleText.ts src/features/agents/bundleText.test.ts
git commit -m "feat(agents): words for outside steps, their lists and their links

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: One live pick list: `usePickList`, `PickSelect`, `PickSearch`

**Files:**
- Create: `src/components/work/usePickList.ts`, `src/components/work/usePickList.test.tsx`, `src/components/work/PickSelect.tsx`, `src/components/work/PickSearch.tsx`

**Interfaces:**
- Consumes: Task 1's `fetchStepOptions`; Task 3's `listLoading`, `listFailed`, `OUTSIDE`.
- Produces: `PickState = { status: 'loading' } | { status: 'ready'; options: PickOption[]; more: boolean } | { status: 'failed'; message: string } | { status: 'idle' }`; `usePickList({ bundleId, stepId, list, project?, query?, enabled }): { state: PickState; retry: () => void }` (a newer request wins: an older answer arriving late is dropped); `PickSelect({ id, label, list, state, retry, value: PickValue | null, onChange: (value: PickValue | null) => void, none?: string, error?: string, hint?: string })`; `PickSearch({ id, label, bundleId, stepId, list, project?, value, onChange, none?, error?, hint?, enabled })` (its own search box, 300 ms debounce, 100 characters at most).

- [ ] **Step 1: Write the failing tests**

Create `src/components/work/usePickList.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OUTSIDE_BUNDLES } from '../../features/agents/testBundleFixtures';
import { stubBundles } from '../../features/agents/testBundles';
import { PickSelect } from './PickSelect';
import { PickSearch } from './PickSearch';
import { usePickList } from './usePickList';
import type { PickValue } from '../../features/agents/bundleTypes';

// Agent bundles D3 contract §5.2; frontend Decision 3. Only fetch is stubbed.
afterEach(() => vi.unstubAllGlobals());

function Projects({ onChange = () => {} }: { onChange?: (v: PickValue | null) => void }) {
  const { state, retry } = usePickList({ bundleId: 401, stepId: 413, list: 'jira_projects', enabled: true });
  return <PickSelect id="p" label="Project" list="jira_projects" state={state} retry={retry} value={{ id: 'SUP', name: 'SUP' }} onChange={onChange} />;
}

describe('usePickList and PickSelect', () => {
  it('shows the stored value, loads, then lists', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    render(<Projects />);
    expect(screen.getByText('Loading Jira projects…')).toBeInTheDocument();
    const select = await screen.findByRole('combobox', { name: 'Project' });
    await waitFor(() => expect(screen.queryByText('Loading Jira projects…')).toBeNull());
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(['Support (SUP)', 'Engineering (ENG)']);
    expect((select as HTMLSelectElement).value).toBe('SUP');
  });

  it("shows the server's sentence and tries again", async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES, failOptions: { jira_projects: { status: 502, body: { code: 'TOOL_UNREACHABLE', detail: "Couldn't reach Jira. Try again." } } } });
    render(<Projects />);
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach Jira. Try again.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('combobox', { name: 'Project' })).toBeInTheDocument();
  });

  it('falls back to its own sentence without a detail', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES, failOptions: { jira_projects: { status: 500, body: {} } } });
    render(<Projects />);
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load Jira projects.");
  });

  it('searches people after a pause, and offers Unassigned', async () => {
    const { spy } = stubBundles({ bundles: OUTSIDE_BUNDLES });
    const picked: (PickValue | null)[] = [];
    render(<PickSearch id="a" label="Assignee" bundleId={401} stepId={413} list="jira_assignees" project="SUP" value={null} onChange={(v) => picked.push(v)} none="Unassigned" enabled />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search people in Jira' }), 'pri');
    const select = await screen.findByRole('combobox', { name: 'Assignee' });
    await waitFor(() => expect(Array.from((select as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(['Unassigned', 'Priya Shah (priya@acme.io)']));
    await userEvent.selectOptions(select, 'acc-priya');
    expect(picked.at(-1)).toEqual({ id: 'acc-priya', name: 'Priya Shah' });
    const asked = spy.mock.calls.map(([input]) => String(input)).filter((u) => u.includes('jira_assignees'));
    expect(asked.at(-1)).toContain('query=pri');
    expect(asked.some((u) => u.includes('query=p&') || u.endsWith('query=p'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/work/usePickList.test.tsx --maxWorkers=2`
Expected: FAIL: the modules don't exist.

- [ ] **Step 3: The hook**

Create `src/components/work/usePickList.ts`:

```ts
// One live pick list (agent bundles D3 contract §5.2; frontend Decision 3). A
// newer request wins: an older answer arriving late is dropped. No em dash.
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchStepOptions } from '../../features/agents/bundlesApi';
import { listFailed } from '../../features/agents/bundleText';
import type { PickListName, PickOption } from '../../features/agents/bundleTypes';
import { ApiError } from '../../lib/apiClient';

export type PickState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; options: PickOption[]; more: boolean }
  | { status: 'failed'; message: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The server's own sentence when it sent one (a 409's or 502's `detail`, a 400's first message). */
function failure(err: unknown, list: PickListName): string {
  if (err instanceof ApiError && isObject(err.body)) {
    if (typeof err.body.detail === 'string') return err.body.detail;
    for (const value of Object.values(err.body)) if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  }
  return listFailed(list);
}

export function usePickList({ bundleId, stepId, list, project = '', query = '', enabled }: { bundleId: number; stepId: number; list: PickListName; project?: string; query?: string; enabled: boolean }) {
  const [state, setState] = useState<PickState>({ status: enabled ? 'loading' : 'idle' });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);
  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle' });
      return;
    }
    const mine = ++latest.current;
    setState({ status: 'loading' });
    fetchStepOptions(bundleId, stepId, list, { project, query })
      .then((answer) => {
        if (mine === latest.current) setState({ status: 'ready', options: answer.options, more: answer.more });
      })
      .catch((err: unknown) => {
        if (mine === latest.current) setState({ status: 'failed', message: failure(err, list) });
      });
  }, [bundleId, stepId, list, project, query, enabled, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
```

- [ ] **Step 4: The two controls**

Create `src/components/work/PickSelect.tsx`:

```tsx
import { listLoading, OUTSIDE } from '../../features/agents/bundleText';
import type { PickListName, PickOption, PickValue } from '../../features/agents/bundleTypes';
import { BUTTON, FIELD_ERROR, FORM_ALERT, Select, TYPE } from '../ui';
import type { PickState } from './usePickList';

const NONE = '__none__';

const optionText = (o: PickOption) => (o.detail && o.detail !== o.name ? `${o.name} (${o.detail})` : o.name);

/** A tool's list as a select (frontend Decision 3): the stored value shows
 *  before the list arrives; loading, error with Try again, and empty states. */
export function PickSelect({ id, label, list, state, retry, value, onChange, none, error, hint, emptyText = OUTSIDE.NOTHING }: { id: string; label: string; list: PickListName; state: PickState; retry: () => void; value: PickValue | null; onChange: (value: PickValue | null) => void; none?: string; error?: string; hint?: string; emptyText?: string }) {
  const options = state.status === 'ready' ? state.options : [];
  const known = value && value.id && !options.some((o) => o.id === value.id) ? [{ id: value.id, name: value.name, detail: '' }] : [];
  const rows = [...known, ...options];
  const choices = [...(none !== undefined ? [{ value: NONE, label: none }] : []), ...rows.map((o) => ({ value: o.id, label: optionText(o) }))];
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1">
      {choices.length > 0 ? (
        <Select
          id={id}
          label={label}
          value={value?.id || (none !== undefined ? NONE : rows[0]?.id ?? '')}
          onChange={(next) => {
            if (next === NONE) return onChange(null);
            const row = rows.find((o) => o.id === next);
            onChange(row ? { id: row.id, name: row.name } : null);
          }}
          options={choices}
          invalid={Boolean(error)}
          describedBy={describedBy}
        />
      ) : (
        <p className={TYPE.label}>{label}</p>
      )}
      {state.status === 'loading' ? <p className={TYPE.meta}>{listLoading(list)}</p> : null}
      {state.status === 'ready' && state.options.length === 0 ? <p className={TYPE.meta}>{emptyText}</p> : null}
      {state.status === 'failed' ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className={FORM_ALERT}>
            {state.message}
          </p>
          <button type="button" onClick={retry} className={BUTTON}>
            {OUTSIDE.TRY_AGAIN}
          </button>
        </div>
      ) : null}
      {hint && !error ? (
        <p id={`${id}-hint`} className={TYPE.meta}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className={FIELD_ERROR}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

(The `Select`'s option label for Jira projects shows `Support (SUP)`: `detail` holds the key.)

Create `src/components/work/PickSearch.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { OUTSIDE } from '../../features/agents/bundleText';
import type { PickListName, PickValue } from '../../features/agents/bundleTypes';
import { INPUT } from '../ui';
import { PickSelect } from './PickSelect';
import { usePickList } from './usePickList';

const PAUSE_MS = 300;
const MOST = 100;

/** People in Jira, searched (frontend Decision 3): a search box, then the list as a select. */
export function PickSearch({ id, label, bundleId, stepId, list, project = '', value, onChange, none, error, hint, enabled }: { id: string; label: string; bundleId: number; stepId: number; list: PickListName; project?: string; value: PickValue | null; onChange: (value: PickValue | null) => void; none?: string; error?: string; hint?: string; enabled: boolean }) {
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(typed.trim()), PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [typed]);
  const { state, retry } = usePickList({ bundleId, stepId, list, project, query, enabled });
  return (
    <div className="flex flex-col gap-1">
      <input
        type="search"
        aria-label={OUTSIDE.SEARCH_PEOPLE}
        placeholder={OUTSIDE.SEARCH_PEOPLE}
        maxLength={MOST}
        className={INPUT}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
      />
      <PickSelect id={id} label={label} list={list} state={state} retry={retry} value={value} onChange={onChange} none={none} error={error} hint={hint} emptyText={OUTSIDE.NOBODY} />
    </div>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/components/work/usePickList.test.tsx --maxWorkers=2 && npx tsc -b`
Expected: PASS and clean. (The test's `userEvent.type` types three letters faster than 300 ms, so only `query=pri` is ever asked.)

- [ ] **Step 6: Commit**

```bash
git add src/components/work/usePickList.ts src/components/work/usePickList.test.tsx src/components/work/PickSelect.tsx src/components/work/PickSearch.tsx
git commit -m "feat(work): live pick lists with loading, error and Try again

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The four outside editors

**Files:**
- Create: `src/components/work/BundleOutsideFields.tsx`, `src/components/work/BundleOutsideFields.test.tsx`
- Modify: `src/components/work/BundleStepFields.tsx` (hands outside kinds over)

**Interfaces:**
- Consumes: Task 4's controls; Task 3's words; Task 1's types.
- Produces: `BundleOutsideFields({ bundle, step, fields, errors, onField })` (the same props as `BundleStepFields`).

- [ ] **Step 1: Write the failing tests**

Create `src/components/work/BundleOutsideFields.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { B_OUTSIDE, OUTSIDE_BUNDLES } from '../../features/agents/testBundleFixtures';
import { stubBundles } from '../../features/agents/testBundles';
import type { StepFields, StepFieldValue } from '../../features/agents/bundleTypes';
import { BundleOutsideFields } from './BundleOutsideFields';

// Agent bundles D3 contract §2; frontend Decisions 1 to 6. Only fetch is stubbed.
afterEach(() => vi.unstubAllGlobals());

function renderStep(index: number, overrides: StepFields = {}) {
  const step = B_OUTSIDE.steps[index];
  const changes: [string, StepFieldValue][] = [];
  render(<BundleOutsideFields bundle={B_OUTSIDE} step={step} fields={{ ...step.fields, ...overrides }} errors={{}} onField={(key, value) => changes.push([key, value])} />);
  return changes;
}

describe('BundleOutsideFields', () => {
  it('a reply: who it goes from, then to, cc, subject and body', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    const changes = renderStep(0);
    expect(screen.getByText('From alice@acme.io')).toBeInTheDocument();
    expect(screen.getByText('Goes in the same email thread.')).toBeInTheDocument();
    const to = screen.getByRole('textbox', { name: 'To' });
    expect(to).toHaveValue('ann@pizzahut.com');
    await userEvent.type(to, ', ops@pizzahut.com');
    expect(changes.at(-1)).toEqual(['to', ['ann@pizzahut.com', 'ops@pizzahut.com']]);
    expect(screen.getByRole('textbox', { name: 'Subject' })).toHaveValue('Re: Login loop');
    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue("We're on it: the fix ships Friday.");
  });

  it('a Slack reply: the channel from the server, and the message', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    const changes = renderStep(1);
    expect(screen.getByText('Posts as revenact')).toBeInTheDocument();
    const channel = await screen.findByRole('combobox', { name: 'Channel' });
    await waitFor(() => expect(Array.from((channel as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(['#support (This thread)', '#escalations (A new message)']));
    await userEvent.selectOptions(channel, '6');
    expect(changes.at(-1)).toEqual(['connector_id', 6]);
  });

  it('a Jira issue: project, type for that project, priority with Jira default, assignee matched later', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    const changes = renderStep(2);
    expect(screen.getByText('Created in Jira as Jira Bot')).toBeInTheDocument();
    const project = await screen.findByRole('combobox', { name: 'Project' });
    await userEvent.selectOptions(project, 'ENG');
    expect(changes.at(-1)).toEqual(['project', 'ENG']);
    const type = await screen.findByRole('combobox', { name: 'Issue type' });
    await waitFor(() => expect(Array.from((type as HTMLSelectElement).options).map((o) => o.textContent)).toContain('Bug'));
    const priority = await screen.findByRole('combobox', { name: 'Priority' });
    await waitFor(() => expect((priority as HTMLSelectElement).options[0].textContent).toBe("Jira's default"));
    await userEvent.selectOptions(priority, '__none__');
    expect(changes.at(-1)).toEqual(['priority', null]);
    expect(screen.getByText('Erin Eng (matched in Jira by email when it runs)')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Summary' })).toHaveValue('Login loop after password reset');
  });

  it('a Jira project left empty says so', () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    renderStep(2, { project: '' });
    expect(screen.getByText('Choose a project.')).toBeInTheDocument();
  });

  it('a Jira assignment: only the assignee, searched', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    const changes = renderStep(3);
    expect(screen.queryByRole('combobox', { name: 'Project' })).toBeNull();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search people in Jira' }), 'eri');
    const who = await screen.findByRole('combobox', { name: 'Assignee' });
    await waitFor(() => expect(within(who).getAllByRole('option').map((o) => o.textContent)).toContain('Erin Eng (erin@acme.io)'));
    await userEvent.selectOptions(who, 'acc-erin');
    expect(changes.at(-1)).toEqual(['assignee', { id: 'acc-erin', name: 'Erin Eng' }]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/work/BundleOutsideFields.test.tsx --maxWorkers=2`
Expected: FAIL: the module doesn't exist.

- [ ] **Step 3: The editors**

Create `src/components/work/BundleOutsideFields.tsx`:

```tsx
import { useId } from 'react';
import { OUTSIDE, addressesText, fromText, jiraAsText, matchedLaterText, parseAddresses, postsAsText } from '../../features/agents/bundleText';
import type { Bundle, BundleStep, PickValue, StepFields, StepFieldValue } from '../../features/agents/bundleTypes';
import { FIELD_ERROR, INPUT, INVALID, TYPE } from '../ui';
import { PickSearch } from './PickSearch';
import { PickSelect } from './PickSelect';
import { usePickList } from './usePickList';

const AREA = `${INPUT} ${INVALID} min-h-24 py-2`;
const LINE = `${INPUT} ${INVALID}`;

const pick = (value: StepFieldValue): PickValue | null => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);

function Text({ id, label, value, error, area, hint, onChange }: { id: string; label: string; value: string; error?: string; area?: boolean; hint?: string; onChange: (value: string) => void }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const props = { id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy, value, onChange: (event: { target: { value: string } }) => onChange(event.target.value) };
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={TYPE.label}>
        {label}
      </label>
      {area ? <textarea {...props} className={AREA} /> : <input type="text" {...props} className={LINE} />}
      {hint && !error ? (
        <p id={`${id}-hint`} className={TYPE.meta}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className={FIELD_ERROR}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The four outside kinds' fields (contract §2; frontend Decisions 1 to 6),
 *  only the keys the server lists as editable. */
export function BundleOutsideFields({ bundle, step, fields, errors, onField }: { bundle: Bundle; step: BundleStep; fields: StepFields; errors: Record<string, string>; onField: (key: string, value: StepFieldValue) => void }) {
  const base = useId();
  const can = (key: string) => step.editable.includes(key);
  const id = (key: string) => `${base}-${key}`;
  const project = typeof fields.project === 'string' ? fields.project : '';
  const isCreate = step.kind === 'jira.create';
  const projects = usePickList({ bundleId: bundle.id, stepId: step.id, list: 'jira_projects', enabled: isCreate && can('project') });
  const types = usePickList({ bundleId: bundle.id, stepId: step.id, list: 'jira_issue_types', project, enabled: isCreate && can('issue_type') && Boolean(project) });
  const priorities = usePickList({ bundleId: bundle.id, stepId: step.id, list: 'jira_priorities', enabled: isCreate && can('priority') });
  const channels = usePickList({ bundleId: bundle.id, stepId: step.id, list: 'slack_channels', enabled: step.kind === 'slack.reply' && can('connector_id') });

  if (step.kind === 'mail.send_reply') {
    const mail = step.preview.mail;
    const from = mail ? fromText(mail) : null;
    return (
      <div className="flex flex-col gap-3">
        {from ? <p className={TYPE.meta}>{from}</p> : null}
        {mail?.threaded ? <p className={TYPE.meta}>{OUTSIDE.THREADED}</p> : null}
        {can('to') ? <Text id={id('to')} label={OUTSIDE.TO} value={addressesText(fields.to)} error={errors.to} hint={OUTSIDE.ADDRESSES_HINT} onChange={(v) => onField('to', parseAddresses(v))} /> : null}
        {can('cc') ? <Text id={id('cc')} label={OUTSIDE.CC} value={addressesText(fields.cc)} error={errors.cc} onChange={(v) => onField('cc', parseAddresses(v))} /> : null}
        {can('subject') ? <Text id={id('subject')} label="Subject" value={String(fields.subject ?? '')} error={errors.subject} onChange={(v) => onField('subject', v)} /> : null}
        {can('body') ? <Text id={id('body')} label={OUTSIDE.REPLY} area value={String(fields.body ?? '')} error={errors.body} onChange={(v) => onField('body', v)} /> : null}
      </div>
    );
  }

  if (step.kind === 'slack.reply') {
    const slack = step.preview.slack;
    const current = typeof fields.connector_id === 'number' ? String(fields.connector_id) : '';
    const named = channels.state.status === 'ready' ? channels.state.options.find((o) => o.id === current) : undefined;
    return (
      <div className="flex flex-col gap-3">
        {slack ? <p className={TYPE.meta}>{postsAsText(slack.as)}</p> : null}
        {can('connector_id') ? (
          <PickSelect id={id('connector_id')} label={OUTSIDE.CHANNEL} list="slack_channels" state={channels.state} retry={channels.retry} value={current ? { id: current, name: named?.name ?? slack?.channel ?? current } : null} onChange={(v) => v && onField('connector_id', Number(v.id))} error={errors.connector_id} />
        ) : null}
        {can('text') ? <Text id={id('text')} label={OUTSIDE.MESSAGE} area value={String(fields.text ?? '')} error={errors.text} onChange={(v) => onField('text', v)} /> : null}
      </div>
    );
  }

  const jira = step.preview.jira;
  const assign = step.preview.jira_assign;
  const as = jira?.as ?? assign?.as;
  const later = (jira?.assignee ?? assign?.assignee)?.matched_later ? (jira?.assignee ?? assign?.assignee) : null;
  const assignee = pick(fields.assignee ?? null);
  return (
    <div className="flex flex-col gap-3">
      {as ? <p className={TYPE.meta}>{jiraAsText(as)}</p> : null}
      {can('project') ? (
        <PickSelect id={id('project')} label={OUTSIDE.PROJECT} list="jira_projects" state={projects.state} retry={projects.retry} value={project ? { id: project, name: project } : null} onChange={(v) => v && onField('project', v.id)} error={errors.project} hint={project ? undefined : OUTSIDE.CHOOSE_PROJECT} />
      ) : null}
      {can('issue_type') && project ? (
        <PickSelect id={id('issue_type')} label={OUTSIDE.ISSUE_TYPE} list="jira_issue_types" state={types.state} retry={types.retry} value={pick(fields.issue_type ?? null)} onChange={(v) => v && onField('issue_type', v)} error={errors.issue_type} />
      ) : null}
      {can('summary') ? <Text id={id('summary')} label={OUTSIDE.SUMMARY} value={String(fields.summary ?? '')} error={errors.summary} onChange={(v) => onField('summary', v)} /> : null}
      {can('description') ? <Text id={id('description')} label={OUTSIDE.DESCRIPTION} area value={String(fields.description ?? '')} error={errors.description} onChange={(v) => onField('description', v)} /> : null}
      {can('priority') ? (
        <PickSelect id={id('priority')} label={OUTSIDE.PRIORITY} list="jira_priorities" state={priorities.state} retry={priorities.retry} value={pick(fields.priority ?? null)} onChange={(v) => onField('priority', v)} none={OUTSIDE.JIRA_DEFAULT} error={errors.priority} />
      ) : null}
      {can('assignee') ? (
        <PickSearch
          id={id('assignee')}
          label={OUTSIDE.ASSIGNEE}
          bundleId={bundle.id}
          stepId={step.id}
          list="jira_assignees"
          project={isCreate ? project : ''}
          value={assignee}
          onChange={(v) => (isCreate ? onField('assignee', v) : v && onField('assignee', v))}
          none={isCreate ? OUTSIDE.UNASSIGNED : undefined}
          error={errors.assignee}
          hint={!assignee && later ? matchedLaterText(later.name) : undefined}
          enabled
        />
      ) : null}
    </div>
  );
}
```

In `src/components/work/BundleStepFields.tsx`, hand the outside kinds over without breaking the rules of hooks (the current body calls `useId` and `useAssignees`, so an early return can't come first): rename the existing exported function to `function InsideFields({ bundle, step, fields, errors, onField }: Props)` (same body), declare `type Props = { bundle: Bundle; step: BundleStep; fields: StepFields; errors: Record<string, string>; onField: (key: string, value: StepFieldValue) => void }`, import `OUTSIDE_KINDS` from `../../features/agents/agentTypes` and `BundleOutsideFields` from `./BundleOutsideFields`, and add:

```tsx
/** A step's editable fields (frontend Decision 8); the outside kinds have their own (D3 Decision 1). */
export function BundleStepFields(props: Props) {
  return OUTSIDE_KINDS.includes(props.step.kind) ? <BundleOutsideFields {...props} /> : <InsideFields {...props} />;
}
```

- [ ] **Step 4: Run the tests and the panel's own**

Run: `npx vitest run src/components/work/BundleOutsideFields.test.tsx src/components/work/BundlePanel.test.tsx --maxWorkers=2 && npx tsc -b`
Expected: PASS and clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/work/BundleOutsideFields.tsx src/components/work/BundleOutsideFields.test.tsx src/components/work/BundleStepFields.tsx
git commit -m "feat(work): editors for email replies, Slack replies and Jira steps

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Blocked steps link to the setting; result links; "Can't be undone" pinned

**Files:**
- Create: `src/components/work/StepLinks.tsx`
- Modify: `src/components/work/BundleStep.tsx`, `src/components/work/BundlePanel.test.tsx`

**Interfaces:**
- Consumes: Task 1's `disabled_link`, `links`; Task 3's `OUTSIDE`, `isExternal`.
- Produces: `StepLinks({ links })`: app links as router `Link`s, external ones as new-tab anchors.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/work/BundlePanel.test.tsx` (it opens a panel by rendering `/work?queue=mine&bundle=<id>` with `renderWork`, as its own tests do):

```tsx
async function openPanel(b: Bundle) {
  renderWork(`/work?queue=mine&bundle=${b.id}`);
  return screen.findByRole('dialog', { name: b.title });
}

describe('outside steps (agent bundles D3)', () => {
  it('a blocked step says why and links to Connections, and Reject stays', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    const panel = await openPanel(B_BLOCKED);
    const step = within(panel).getByTestId('step-421');
    expect(within(step).getByRole('checkbox')).toBeDisabled();
    expect(within(step).getByText('Ask an admin to allow Revenact to post in Slack.')).toBeInTheDocument();
    expect(within(step).getByRole('link', { name: 'Open Connections' })).toHaveAttribute('href', '/settings/connections');
    expect(within(panel).getByRole('button', { name: 'Reject bundle' })).toBeEnabled();
  });

  it("every outside step says it can't be undone before Run", async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    const panel = await openPanel(B_OUTSIDE);
    for (const id of [411, 412, 413, 414]) expect(within(within(panel).getByTestId(`step-${id}`)).getByText("Can't be undone")).toBeInTheDocument();
  });

  it('a run shows the result links, opening outside tools in a new tab', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    const panel = await openPanel(B_OUTSIDE);
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 4 selected' }));
    const jira = await within(within(panel).getByTestId('step-413')).findByRole('link', { name: 'Open SUP-501 in Jira (opens in a new tab)' });
    expect(jira).toHaveAttribute('href', 'https://acme.atlassian.net/browse/SUP-501');
    expect(jira).toHaveAttribute('target', '_blank');
    expect(jira).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(within(panel).getByTestId('step-412')).getByRole('link', { name: 'Open the Slack message (opens in a new tab)' })).toBeInTheDocument();
  });

  it("a failed outside step shows Slack's sentence and Retry", async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES, failOutside: { 412: "Slack refused the post: the app isn't in #support." } });
    const panel = await openPanel(B_OUTSIDE);
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 4 selected' }));
    const step = within(panel).getByTestId('step-412');
    expect(await within(step).findByRole('alert')).toHaveTextContent("Slack refused the post: the app isn't in #support.");
    await userEvent.click(within(step).getByRole('button', { name: 'Retry' }));
    expect(await within(step).findByRole('link', { name: 'Open the Slack message (opens in a new tab)' })).toBeInTheDocument();
  });
});
```

(import `OUTSIDE_BUNDLES`, `B_OUTSIDE`, `B_BLOCKED` from the fixtures and `type Bundle` from `../../features/agents/bundleTypes`).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/work/BundlePanel.test.tsx --maxWorkers=2`
Expected: FAIL: no "Open Connections" link; no result links.

- [ ] **Step 3: The links and the blocked line**

Create `src/components/work/StepLinks.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { OUTSIDE, isExternal } from '../../features/agents/bundleText';
import type { StepLink } from '../../features/agents/bundleTypes';
import { LINK } from '../brain/styles';

/** A step's result links (contract §4.1, D3-16; frontend Decision 9): app
 *  paths in the app, the tool's own https pages in a new tab. */
export function StepLinks({ links }: { links: StepLink[] }) {
  const shown = links.filter((l) => (l.external ? isExternal(l) : l.url.startsWith('/')));
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {shown.map((l) =>
        l.external ? (
          <a key={l.url + l.label} href={l.url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 ${LINK}`}>
            {l.label}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only"> {OUTSIDE.OPENS_NEW_TAB}</span>
          </a>
        ) : (
          <Link key={l.url + l.label} to={l.url} className={LINK}>
            {l.label}
          </Link>
        ),
      )}
    </div>
  );
}
```

In `src/components/work/BundleStep.tsx`: drop `outputLinks` from the `bundleText` import and the `const links = ...` line; import `StepLinks` and `META_LINK` (`from './FeedRowParts'`) and `OUTSIDE` (from `bundleText`). Replace the disabled reason paragraph with:

```tsx
          {live && step.disabled_reason ? (
            <p id={`${id}-why`} className={TYPE.bodyMuted}>
              {step.disabled_reason}
              {step.disabled_link ? (
                <>
                  {' '}
                  <Link to={step.disabled_link} className={META_LINK}>
                    {OUTSIDE.OPEN_SETTING}
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
```

and replace the `{links.length > 0 ? (...) : null}` block with:

```tsx
      {step.status === 'applied' ? <StepLinks links={step.links ?? []} /> : null}
```

- [ ] **Step 4: Run the tests and the work components'**

Run: `npx vitest run src/components/work --maxWorkers=2 && npx tsc -b`
Expected: PASS and clean. (D1 tests that looked for "Open task" still find it: the stub now writes `links` from D1 outputs.)

- [ ] **Step 5: Commit**

```bash
git add src/components/work/StepLinks.tsx src/components/work/BundleStep.tsx src/components/work/BundlePanel.test.tsx
git commit -m "feat(work): blocked outside steps link to Connections; server result links

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: History rows show outside result links

**Files:**
- Modify: `src/pages/work/History.tsx`, `src/pages/work/History.test.tsx`

**Interfaces:**
- Consumes: Task 3's `historyLinks`; Task 6's `StepLinks`.

- [ ] **Step 1: Write the failing test**

Append to `src/pages/work/History.test.tsx` (it renders History with `renderWork('/work?queue=history')`, as its own tests do):

```tsx
  it("shows a finished bundle's outside result links (agent bundles D3 Decision 9)", async () => {
    stubBundles({ bundles: [...BUNDLES, B_OUTSIDE_DONE] });
    renderWork('/work?queue=history');
    const row = (await screen.findByText(B_OUTSIDE_DONE.title)).closest('li') as HTMLElement;
    const jira = within(row).getByRole('link', { name: 'Open SUP-77 in Jira (opens in a new tab)' });
    expect(jira).toHaveAttribute('target', '_blank');
    expect(within(row).getByRole('link', { name: 'Open the Slack message (opens in a new tab)' })).toBeInTheDocument();
    const plain = (await screen.findByText(B_DONE.title)).closest('li') as HTMLElement;
    expect(within(plain).queryByRole('link', { name: /opens in a new tab/ })).toBeNull();
  });
```

(add `B_OUTSIDE_DONE` and `BUNDLES` to its fixtures import.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/pages/work/History.test.tsx --maxWorkers=2`
Expected: FAIL: no such link.

- [ ] **Step 3: The row**

In `src/pages/work/History.tsx`, import `historyLinks` from `bundleText` and `StepLinks` from `../../components/work/StepLinks`; inside the row, after the meta `<p>` and before the Review link:

```tsx
                  <StepLinks links={historyLinks(bundle)} />
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/pages/work/History.test.tsx --maxWorkers=2 && npx tsc -b`
Expected: PASS and clean.

- [ ] **Step 5: Commit**

```bash
git add src/pages/work/History.tsx src/pages/work/History.test.tsx
git commit -m "feat(work): History shows outside result links

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Settings › Connections: Read only or Can act

**Files:**
- Create: `src/features/connectors/agentAccess.ts`, `src/features/connectors/agentAccess.test.ts`, `src/components/integrations/AgentAccess.tsx`, `src/components/integrations/AgentAccess.test.tsx`
- Modify: `src/pages/integrations/Integrations.tsx` (the row and the outcome line), `src/pages/integrations/Integrations.test.tsx`

**Interfaces:**
- Consumes: Task 1's `ConnectorAgents`, `setConnectorAgents`.
- Produces (`agentAccess.ts`): `AGENT_ACCESS` (words), `accessLine(connector: Connector): string | null`, `accessHint(connector: Connector): string | null`, `noKindsText(connector: Connector): string`; `AgentAccess({ connector, canManage })`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/connectors/agentAccess.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Connector } from './connectorsSlice';
import { accessHint, accessLine } from './agentAccess';

// Agent bundles D3 contract §4.3; frontend Decision 10.
const base = { id: 5, provider: 'slack', provider_display: 'Slack', name: 'Support Slack' } as Connector;
const agents = (over: Partial<NonNullable<Connector['agents']>>) => ({ ...base, agents: { kinds: ['slack.reply'], can_act: false, needs: 'token' as const, allowed_by: null, allowed_at: null, ...over } });

describe('agent access words', () => {
  it('says read only or can act, and who allowed it', () => {
    expect(accessLine(agents({}))).toBe('Agents: Read only');
    expect(accessLine(agents({ can_act: true, needs: null, allowed_by: { id: 1, name: 'Alice Admin' } }))).toBe('Agents: Can act · Allowed by Alice Admin');
    expect(accessLine({ ...base, provider: 'zendesk', provider_display: 'Zendesk', agents: { kinds: [], can_act: false, needs: null, allowed_by: null, allowed_at: null } })).toBe('Agents: Read only');
    expect(accessLine(base)).toBeNull();
  });

  it('hints at what Allow agents to act will do', () => {
    expect(accessHint(agents({ needs: 'consent' }))).toBe('Slack will ask you to let Revenact post.');
    expect(accessHint(agents({ needs: 'token' }))).toBe('Needs a Slack bot token that can post (chat:write).');
    expect(accessHint({ ...agents({}), provider: 'jira', agents: { kinds: ['jira.create', 'jira.assign'], can_act: false, needs: 'permission', allowed_by: null, allowed_at: null } })).toBe('Revenact checks this Jira account can create and assign issues.');
    expect(accessHint({ ...base, provider: 'zendesk', provider_display: 'Zendesk', agents: { kinds: [], can_act: false, needs: null, allowed_by: null, allowed_at: null } })).toBe("Agents can't act in Zendesk yet.");
  });
});
```

Create `src/components/integrations/AgentAccess.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import connectorsReducer, { type Connector } from '../../features/connectors/connectorsSlice';
import { AgentAccess } from './AgentAccess';

// Agent bundles D3 contract §5.3; frontend Decision 10. Only fetch is stubbed.
afterEach(() => vi.unstubAllGlobals());

const jira = { id: 6, provider: 'jira', provider_display: 'Jira Software', name: 'Jira', agents: { kinds: ['jira.create', 'jira.assign'], can_act: false, needs: 'permission', allowed_by: null, allowed_at: null } } as Connector;
const slack = { id: 5, provider: 'slack', provider_display: 'Slack', name: 'Support Slack', agents: { kinds: ['slack.reply'], can_act: false, needs: 'consent', allowed_by: null, allowed_at: null } } as Connector;

function answer(status: number, body: unknown) {
  const spy = vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

function show(connector: Connector, canManage = true) {
  const store = configureStore({ reducer: { connectors: connectorsReducer }, preloadedState: { connectors: { items: [connector], isLoading: false, error: null, saving: false, saveError: null } } });
  render(
    <Provider store={store}>
      <AgentAccess connector={store.getState().connectors.items[0]} canManage={canManage} />
    </Provider>,
  );
  return store;
}

describe('AgentAccess', () => {
  it('allows Jira to act', async () => {
    answer(200, { ...jira, agents: { ...jira.agents, can_act: true, needs: null, allowed_by: { id: 1, name: 'Alice' }, allowed_at: '2026-10-13T10:00:00Z' } });
    const store = show(jira);
    await userEvent.click(screen.getByRole('button', { name: 'Allow agents to act' }));
    expect(await screen.findByRole('button', { name: 'Make read only' })).toBeInTheDocument();
    expect(store.getState().connectors.items[0].agents?.can_act).toBe(true);
  });

  it("shows Jira's refusal verbatim", async () => {
    answer(409, { code: 'JIRA_CANT_ACT', detail: "This Jira account can't create and assign issues in SUP. Give it those permissions in Jira, then try again." });
    show(jira);
    await userEvent.click(screen.getByRole('button', { name: 'Allow agents to act' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("This Jira account can't create and assign issues in SUP.");
  });

  it("sends the browser to Slack's consent", async () => {
    answer(200, { authorize_url: 'https://slack.com/oauth/v2/authorize?state=s' });
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    show(slack);
    await userEvent.click(screen.getByRole('button', { name: 'Allow agents to act' }));
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('https://slack.com/oauth/v2/authorize?state=s'));
  });

  it('a member reads the state, with no button', () => {
    show(jira, false);
    expect(screen.getByText('Agents: Read only')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
```

Append to `src/pages/integrations/Integrations.test.tsx` a check of the row and the outcome line (its `mockApi` answers `GET /connectors/` with `items`):

```tsx
  it('shows what agents may do through a connection (agent bundles D3)', async () => {
    const slack = { ...zendesk, id: 5, provider: 'slack' as const, provider_display: 'Slack', name: 'Support Slack', setup: slackSetup, agents: { kinds: ['slack.reply'], can_act: true, needs: null, allowed_by: { id: 1, name: 'Alice' }, allowed_at: '2026-10-13T10:00:00Z' } };
    mockApi({ items: [zendesk, slack] });
    renderPage();
    expect(await within(card('Slack')).findByText('Agents: Can act · Allowed by Alice')).toBeInTheDocument();
    expect(within(card('Slack')).getByRole('button', { name: 'Make read only' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/connectors/agentAccess.test.ts src/components/integrations/AgentAccess.test.tsx src/pages/integrations/Integrations.test.tsx --maxWorkers=2`
Expected: FAIL: the modules don't exist; the row has no agents line.

- [ ] **Step 3: The words**

Create `src/features/connectors/agentAccess.ts`:

```ts
// Settings › Connections: what agents may do through a connection (agent
// bundles D3 contract §4.3; frontend Decision 10). No em dash.
import type { Connector } from './connectorsSlice';

export const AGENT_ACCESS = {
  ALLOW: 'Allow agents to act',
  ALLOWING: 'Allowing…',
  READ_ONLY: 'Make read only',
  SAVING: 'Saving…',
  DONE: 'Agents can now act through this connection.',
  FAILED: 'Could not change what agents may do.',
} as const;

const toolName = (c: Connector) => c.provider_display.replace(' Software', '');

export function accessLine(c: Connector): string | null {
  if (!c.agents) return null;
  if (!c.agents.can_act) return 'Agents: Read only';
  return c.agents.allowed_by ? `Agents: Can act · Allowed by ${c.agents.allowed_by.name}` : 'Agents: Can act';
}

export function accessHint(c: Connector): string | null {
  if (!c.agents) return null;
  if (c.agents.kinds.length === 0) return `Agents can't act in ${toolName(c)} yet.`;
  if (c.agents.needs === 'consent') return 'Slack will ask you to let Revenact post.';
  if (c.agents.needs === 'token') return 'Needs a Slack bot token that can post (chat:write).';
  if (c.agents.needs === 'permission') return 'Revenact checks this Jira account can create and assign issues.';
  return null;
}
```

- [ ] **Step 4: The control and the row**

Create `src/components/integrations/AgentAccess.tsx`:

```tsx
import { useState } from 'react';
import { useAppDispatch } from '../../hooks';
import { setConnectorAgents, type Connector } from '../../features/connectors/connectorsSlice';
import { AGENT_ACCESS, accessHint, accessLine } from '../../features/connectors/agentAccess';
import { BUTTON, FORM_ALERT, TYPE } from '../ui';

/** A connection's Read only / Can act (contract §5.3; frontend Decision 10). */
export function AgentAccess({ connector, canManage }: { connector: Connector; canManage: boolean }) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const line = accessLine(connector);
  if (!line || !connector.agents) return null;
  const hint = accessHint(connector);
  const canAct = connector.agents.can_act;
  const switchable = canManage && connector.agents.kinds.length > 0;

  async function change() {
    if (busy) return;
    setBusy(true);
    setRefused(null);
    const result = await dispatch(setConnectorAgents({ id: connector.id, canAct: !canAct }));
    setBusy(false);
    if (setConnectorAgents.rejected.match(result)) return setRefused(result.payload ?? AGENT_ACCESS.FAILED);
    if ('authorize_url' in result.payload) window.location.assign(result.payload.authorize_url);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className={TYPE.meta}>{line}</p>
        {switchable ? (
          <button type="button" onClick={change} aria-disabled={busy || undefined} className={BUTTON}>
            {busy ? (canAct ? AGENT_ACCESS.SAVING : AGENT_ACCESS.ALLOWING) : canAct ? AGENT_ACCESS.READ_ONLY : AGENT_ACCESS.ALLOW}
          </button>
        ) : null}
      </div>
      {hint && !canAct ? <p className={TYPE.meta}>{hint}</p> : null}
      {refused ? (
        <p role="alert" className={FORM_ALERT}>
          {refused}
        </p>
      ) : null}
    </div>
  );
}
```

In `src/pages/integrations/Integrations.tsx`: import `AgentAccess` and `AGENT_ACCESS`; in `ConnectorRow`, under the status line paragraph:

```tsx
          <AgentAccess connector={connector} canManage={canManage} />
```

and in `Integrations`, after the `outcome === 'connected'` line:

```tsx
      {outcome === 'agents_on' ? <p className="text-[13px] leading-5 text-success-ink">{AGENT_ACCESS.DONE}</p> : null}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/features/connectors src/components/integrations src/pages/integrations --maxWorkers=2 && npx tsc -b`
Expected: PASS and clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/connectors/agentAccess.ts src/features/connectors/agentAccess.test.ts src/components/integrations/AgentAccess.tsx src/components/integrations/AgentAccess.test.tsx src/pages/integrations/Integrations.tsx src/pages/integrations/Integrations.test.tsx
git commit -m "feat(integrations): each connection is Read only or Can act for agents

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The bell: a failed step

**Files:**
- Modify: `src/components/layout/NotificationKindIcon.tsx`, `src/components/layout/NotificationKindIcon.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/components/layout/NotificationKindIcon.test.tsx`:

```tsx
  it('draws OctagonAlert for agent_step_failed (agent bundles D3 Decision 12)', () => {
    const { container } = render(<NotificationKindIcon kind="agent_step_failed" />);
    expect(container.querySelector('[data-kind-icon="agent_step_failed"]')).toHaveAttribute('aria-hidden', 'true');
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/layout/NotificationKindIcon.test.tsx --maxWorkers=2`
Expected: FAIL: no icon.

- [ ] **Step 3: The icon**

In `src/components/layout/NotificationKindIcon.tsx`, import `OctagonAlert` and add `agent_step_failed: OctagonAlert,` to `ICONS`.

- [ ] **Step 4: Run it**

Run: `npx vitest run src/components/layout --maxWorkers=2 && npx tsc -b`
Expected: PASS and clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/NotificationKindIcon.tsx src/components/layout/NotificationKindIcon.test.tsx
git commit -m "feat(layout): the bell marks a failed agent step

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The end-to-end journeys

**Files:**
- Create: `src/e2e/bundleOutside.test.tsx`

- [ ] **Step 1: Write the journeys**

Create `src/e2e/bundleOutside.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { BUNDLES, B_BLOCKED, B_OUTSIDE, B_OUTSIDE_DONE, OUTSIDE_BUNDLES } from '../features/agents/testBundleFixtures';
import { stubBundles } from '../features/agents/testBundles';
import { renderWork, where } from '../pages/work/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real panel, router and History.
// Only fetch is stubbed, in the agent bundles D3 contract's shapes. Nothing is
// sent to Slack, Jira or a mailbox. Alice edits an outside bundle's Jira step
// from Jira's live lists and runs it; a Slack post fails and her Retry
// succeeds; History shows the links; a blocked step sends her to Connections.

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
  document.body.style.overflow = '';
});

describe('Agent bundles D3: outside actions', () => {
  it('edits a Jira step from live lists, runs, retries a failed Slack post, and History links out', { timeout: 30000 }, async () => {
    stubBundles({ bundles: [...BUNDLES, ...OUTSIDE_BUNDLES], failOutside: { 412: "Slack refused the post: the app isn't in #support." } });
    renderWork(`/work?queue=mine&bundle=${B_OUTSIDE.id}`);
    const panel = await screen.findByRole('dialog', { name: B_OUTSIDE.title });
    const create = within(panel).getByTestId('step-413');
    expect(within(create).getByText("Can't be undone")).toBeInTheDocument();
    await userEvent.selectOptions(await within(create).findByRole('combobox', { name: 'Project' }), 'ENG');
    const type = await within(create).findByRole('combobox', { name: 'Issue type' });
    await waitFor(() => expect(within(type).getAllByRole('option').map((o) => o.textContent)).toEqual(['Bug']));
    const assign = within(panel).getByTestId('step-414');
    expect(within(assign).getByText('Jira ticket from step 3')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 4 selected' }));
    const slack = within(panel).getByTestId('step-412');
    expect(await within(slack).findByRole('alert')).toHaveTextContent("Slack refused the post: the app isn't in #support.");
    expect(within(create).getByRole('link', { name: 'Open SUP-501 in Jira (opens in a new tab)' })).toHaveAttribute('target', '_blank');
    await userEvent.click(within(slack).getByRole('button', { name: 'Retry' }));
    expect(await within(slack).findByRole('link', { name: 'Open the Slack message (opens in a new tab)' })).toBeInTheDocument();
  });

  it('History shows a finished bundle with its outside links', { timeout: 30000 }, async () => {
    stubBundles({ bundles: [...BUNDLES, ...OUTSIDE_BUNDLES] });
    renderWork('/work?queue=history');
    const row = (await screen.findByText(B_OUTSIDE_DONE.title)).closest('li') as HTMLElement;
    expect(within(row).getByRole('link', { name: 'Open SUP-77 in Jira (opens in a new tab)' })).toHaveAttribute('href', 'https://acme.atlassian.net/browse/SUP-77');
  });

  it('a blocked step sends its reader to Connections', { timeout: 30000 }, async () => {
    stubBundles({ bundles: [...BUNDLES, ...OUTSIDE_BUNDLES] });
    renderWork(`/work?queue=mine&bundle=${B_BLOCKED.id}`);
    const panel = await screen.findByRole('dialog', { name: B_BLOCKED.title });
    await userEvent.click(within(panel).getByRole('link', { name: 'Open Connections' }));
    await waitFor(() => expect(where()).toBe('/settings/connections'));
  });
});
```

(If `renderWork`'s router has no `/settings/connections` route, `where()` still reports the path: the journey checks the link's target, not the page.)

- [ ] **Step 2: Run them**

Run: `npx vitest run src/e2e/bundleOutside.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/e2e/bundleOutside.test.tsx
git commit -m "test(e2e): outside steps edited from live lists, run, retried and linked

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Docs, the full check and by eye

**Files:**
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`, `src/test/uiRatchet.test.ts` (only if a total moved down)

- [ ] **Step 1: The product docs (two in this repo; the backend PR carries the other four)**

- `docs/04-app-flow.md`: the `/work` row gains "outside steps (email reply, Slack reply, Jira create and assign) edit in the panel; Jira's lists load live from `GET /agents/bundles/<id>/steps/<step>/options/<list>/`; a blocked step links to `/settings/connections`; result links open the tool in a new tab (panel and History)". The `/settings/connections` row gains "each tool connection shows Agents: Read only / Can act with **Allow agents to act** / **Make read only** (`POST /connectors/<id>/agents/`); a Slack consent returns to `/integrations?connector=agents_on`". The bell row gains `agent_step_failed`.
- `docs/03-ui-ux-design.md`, under "Work inbox and the bundle panel": the four editors (labels, "From …", "Goes in the same email thread.", "Posts as …", "Created in Jira as …", "Jira's default", "Unassigned", "matched in Jira by email when it runs"), the pick lists' loading, error with Try again and empty lines, the blocked line with **Open Connections**, "Can't be undone" on every outside step, result links with the new-tab icon and words; under Settings › Connections: the agents line, the bordered switch, the hints and the refusal line; the outcome line.
- `.agents/workflows/repo-architecture.md`: `components/work` gains `BundleOutsideFields`, `PickSelect`, `PickSearch`, `usePickList`, `StepLinks`; `components/integrations` gains `AgentAccess`; `features/connectors` gains `agentAccess.ts`; `src/e2e` gains `bundleOutside.test.tsx`.

- [ ] **Step 2: The full check**

Run: `npx tsc -b && npm run lint && npm run build && npx vitest run --maxWorkers=2`
Expected: all clean; the full suite PASS. A failure in a test this plan did not touch means a reader of a changed shape was missed (`StepFieldValue` widened, `BundleStep.links`, `ActionKind`): find it with `systematic-debugging`; never loosen the test. The ratchet: totals equal `BASELINE` (lower it in this commit if a total went down). `grep -rn "—" src/components/work src/pages/work src/features/work src/features/agents/bundle* src/features/agents/testBundle* src/components/integrations/AgentAccess* src/features/connectors/agentAccess*` prints nothing.

- [ ] **Step 3: Commit the docs**

```bash
git add docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "docs: outside steps, live Jira lists and tool permissions (agent bundles delivery 3)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Add `src/test/uiRatchet.test.ts` if the baseline moved.)

- [ ] **Step 4: By eye in Chrome (the delivery's last gate; CI is blocked by billing)**

Never use ports 8000 or 5173. The backend D3 branch must be built and its migrations applied to the database it reads. **Use a copy, never the shared dev database:** ask the owner before making it (`createdb -T revenact revenact_bundles3`), and drop it when the owner is done.

**Make the copy unable to reach anything real, before the backend starts** (from `bundles3-be`, `DATABASE_URL` pointed at the copy, in `venv/bin/python manage.py shell`):

```python
from services.mail.models import MailboxConnection
from services.connectors.models import Connector

# No mailbox in the copy can send: a reply step must never reach a real Gmail or Outlook.
MailboxConnection.objects.update(status="disconnected", credentials="", paused_reason="token_revoked")
# Every Jira points at a site that doesn't exist; every Slack gets a fake token and stays read only.
for c in Connector.objects.filter(provider="jira"):
    c.set_credentials({"email": "qa@acme.invalid", "api_token": "fake"})
    c.config = {**(c.config or {}), "host": "revenact-qa-nonexistent.atlassian.net", "project": "SUP", "account_name": "QA Jira"}
    c.save()
for c in Connector.objects.filter(provider="slack"):
    c.set_credentials({"bot_token": "xoxb-fake"})
    c.agents_can_act = False
    c.save()
```

1. Backend: `cd /Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/bundles3-be && DATABASE_URL=<the copy> venv/bin/python manage.py migrate && DATABASE_URL=<the copy> venv/bin/python manage.py runserver 8013` (background); add `CORS_ALLOWED_ORIGINS=http://localhost:5183` for this run if the browser is refused.
2. Frontend: `cd /Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/bundles3-fe && VITE_API_URL=http://localhost:8013 npx vite --port 5183 --strictPort` (background).
3. Seed outside bundles from the backend shell with fake records, each state once: a waiting bundle with all four kinds on a Slack thread; the same with the Jira connector switched to Can act in the copy (`agents_can_act=True`, `granted_scopes=["CREATE_ISSUES","ASSIGN_ISSUES"]`); a done bundle whose steps hold `outputs` with a Jira and a Slack URL; a partly done bundle with a failed step's error; one `agent_step_failed` notification for the reader. Never press Run on a Slack or mail step in the copy; Run on a Jira step is safe (the site doesn't exist: it fails "Couldn't reach Jira. Retry it." and the bell gets a notice).
4. At 1440 and 390, light and dark, check and screenshot to `/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/12149f77-43a2-43eb-9c53-e9c1cb7f8b07/scratchpad/bundles3-fe-byeye/`:
   - each editor: labels, "From …" (shows when the reader's mailbox can send; in the copy every mailbox is disconnected, so the reply step shows "Connect your mailbox to send this." and its link), "Posts as …", "Created in Jira as QA Jira", the address line hint, Jira's default and Unassigned options;
   - the pick lists: "Loading Jira projects…" then the error "Couldn't reach Jira. Try again." with Try again (bordered), focus order, the stored value visible while loading;
   - blocked steps: unticked, the reason, **Open Connections** going to Settings › Connections;
   - "Can't be undone" on all four outside steps before Run, and Run is still the only primary;
   - a Jira Run: the step's error sentence, Retry, the bell's new notice with its icon, the notice opening the bundle in History;
   - result links in the panel and in History: the new-tab icon, the screen-reader words, opening a new tab;
   - Settings › Connections: "Agents: Read only" with the hint, **Allow agents to act** on Jira answering "Couldn't reach Jira. Try again." (the site doesn't exist), on Slack answering the token or unreachable sentence (Slack is not called with a real token: the copy holds `xoxb-fake`; if you prefer no call at all, check this control only in the jsdom tests), Zendesk showing "Agents can't act in Zendesk yet." and no button, a member seeing no button;
   - at 390: every control 44px tall, the editors' selects full width, nothing clipped.
5. **What by eye can't check without real accounts** (record it in the findings, unchecked): a reply actually sent and threaded, its signature; a Slack post appearing in the thread and its metadata being found on Retry; a Jira issue really created with its label, required-field refusals from a real project, the live lists' success state against real Jira data (jsdom covers their shapes); Slack's consent screen and its return; Gmail and Graph keeping the `X-Revenact-Step` header. With a sandbox Slack workspace and a sandbox Jira site the owner provides, each of these becomes a by-eye check: point a connector at the sandbox in the copy and run one bundle.
6. Write each finding to `scratchpad/bundles3-fe-byeye/findings.md` as blocker / should-fix / cosmetic with its screenshot, fix the blockers in this branch (a test first), and stop both servers.

- [ ] **Step 5: Hand-off**

Report the branch head, the test count, the ratchet totals and the by-eye findings, with the list of checks that need real or sandbox accounts. Do not open a PR or merge: the owner decides (merge order: backend D3 first, then this).

---

## Self-review

**Spec coverage** (spec §11 D3 row and the brief):
- Step editors for the four kinds, Jira pick lists live with loading and error: Tasks 4 and 5 (Decisions 1 to 6, 13), contract §2, §5.2.
- Disabled steps with reason and link: Task 6 (Decision 7), contract §5.1, D3-10.
- "Can't be undone": Task 6's test over all four (Decision 8), spec §6.6.
- Result links in History and the panel: Tasks 6 and 7 (Decision 9), D3-16.
- Settings › Integrations (Connections) Read only / Can act with "Allow agents to act" starting consent: Task 8 (Decision 10), contract §4.3, §5.3; OAuth starts send credentials (Decision 11, D3-22): Task 1.
- Failed-step notifications in the bell: Tasks 1 (type) and 9 (icon), contract §7.
- Tests: unit (words, hook, slice), integration (editors, panel, History, Settings), e2e (Task 10). By-eye checklist with what can't be checked without real Slack or Jira: Task 11 step 4.
- Docs: Task 11 step 1.

**Placeholder scan:** every code step carries its code; the tests use the helpers those files already have (`spyFetch` in `bundlesApi.test.ts`, `renderWork` in the panel and History tests), named as they are.

**Type consistency:** `PickValue`, `PickOption`, `PickListName`, `PickListPayload`, `StepLink` (Task 1) are what `usePickList`, `PickSelect`, `PickSearch` (Task 4), `BundleOutsideFields` (Task 5), `StepLinks` (Task 6) and the stub (Task 2) use; `ConnectorAgents` and `setConnectorAgents` (Task 1) are what `agentAccess.ts` and `AgentAccess` (Task 8) read; the fixtures' step ids (411 to 414, 421, 431, 432) are the ones the tests in Tasks 2, 5, 6, 7 and 10 name.
