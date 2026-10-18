# Agent bundles, delivery 2 ("Message intake"): frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundles made from messages show where they were routed and what they came from: department and Unassigned queues in the rail, a source line in the panel ("Zendesk ZD-1042 from ann@pizzahut.com · 9:58 AM" with a link to the ticket), edits saved as they are made, the "New message since you edited" banner with **Refresh suggestions**, "Rejected by" in History, and Settings › Agents gaining how often agents read messages, a switch per source and a note when conversations wait for credits.

**Architecture:** No new route. `/work?queue=department:<code>|unassigned` reuses `TeamQueue` (the server answers those scopes in the team shape); the scope type widens to `QueueScope` and `useTeamQueue`'s cache key stops splitting on `:`. The panel keeps its draft state (D1) but saves a step's edits with `PATCH /agents/bundles/<id>/steps/<step>/` when focus leaves that step's fields, when a tick changes, and before it closes; Run still sends what is not yet saved. Refresh is one POST that replaces the bundle in place. Words and pure rules stay in `features/agents/bundleText.ts` and `features/work/queues.ts`, unit-tested. Settings › Agents gains one section component (`MessageSources`) beside `AgentsForm` and `AgentsSummary`. No Redux.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), react-router 7, Tailwind v4 tokens, Vitest + Testing Library (jsdom) + user-event, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-13-agent-bundles-design.md` (§4, §5, §8.1, §8.2, §8.3; the D2 row of §11). **API contract (binding, read-only):** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/bundles2-be/docs/superpowers/plans/2026-10-13-agent-bundles-d2-api.md` (backend branch `feat/agent-bundles-d2`). Read its "Decisions narrowing the spec" first: D2-1 to D2-33 are requirements here; §3 (shapes), §4.1 to §4.8 (routes) are the stubs' and types' source of truth. Delivery 1's frontend plan (`docs/superpowers/plans/2026-10-13-agent-bundles-d1-frontend.md`) and its merged code hold the house style this plan extends.

## Global Constraints

- **Worktree and branch.** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/bundles2-fe`, branch `feat/agent-bundles-d2` (on main `782aaf10`, D1 frontend #141 merged). `node_modules` is a symlink: never commit it. Always `git add <explicit paths>` (and `git rm` for deletions), never `git add -A` or `git add .`. Never merge, never open a PR, never touch the servers on ports 8000 or 5173 (the owner uses them; the by-eye run in Task 12 uses 8012 and 5182).
- **Never run prettier. Never use `git stash`** (the stash stack is shared across worktrees).
- **Commands** (foreground): `npx vitest run <path> --maxWorkers=2`, `npx vitest run --maxWorkers=2`, `npx tsc -b`, `npm run lint`, `npm run build`. CI is blocked by GitHub billing: these local checks are the gate. Every task ends with `npx tsc -b` clean as well as its tests.
- **Every commit message is a conventional commit and ends with exactly this line:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Contract shapes are binding.** Test stubs answer exactly the contract's shapes and sentences; refusals are shown verbatim.
- **Tokens only** (`src/test/houseRules.ts` `RAW`): no hex, `rgb()`, named palette colours.
- **Type sizes 11/13/15 only**, through `TYPE.*`, `FIELD_ERROR`, `FORM_ALERT`; no `font-bold`, no `shadow-sm`/`shadow-md`, no `disabled:opacity-*`, no literal `font-mono-brand` in a `.tsx` (figures use `NUM`). The UI ratchet (`src/test/uiRatchet.test.ts`) ends each task with totals **equal** to `BASELINE`; new code adds zero offences (never raise a baseline).
- **Kinso look and the UI cleanup rules:** bordered quiet cards (`Card`, `ListCard`); a list is ONE `ListCard` with flat `divide-y` rows; monochrome primary (`PRIMARY`), **one primary per surface**: the panel's **Run N selected** stays its only primary; **Refresh suggestions** is bordered (`BUTTON`). Lucide icons only, each `aria-hidden="true"`; no emoji.
- **44px targets** on phones for every `<button>`, `<Link>`, `<a>`, `<select>`, `<input>`, `<textarea>`: `BUTTON`, `PRIMARY`, `QUIET`, `DANGER`, `ICON_BUTTON`, `INPUT`, `SELECT`, `CHOICE`, `INLINE_TARGET`, `META_LINK`, or a local `const` built from one.
- **No em dash (`—`) anywhere** in `src/components/work/`, `src/pages/work/`, `src/features/work/`, `src/features/agents/bundle*`, `src/features/agents/testBundle*`, `src/components/agents/MessageSources*`; comments and tests included.
- **Copy:** sentence case; the contract's and this plan's sentences word for word; server refusals shown verbatim.
- **States:** every list and the panel keep a skeleton (not a spinner), an error with Try again, and an empty state; the new Settings section has an inline error per control.
- **Motion:** none added.
- **Privacy:** the page shows only what a bundle carries; the source line shows `source.from` only as the server sent it (the server shows a bundle only to readers of its source, contract §5.1); a lost bundle (404) closes the panel's body and never names it.
- **Testing:** unit + integration + e2e (jsdom, `src/e2e/`), only `fetch` stubbed with contract-shaped stubs and fake data. Never mock the store. Nothing real is sent.

## Decisions (frontend, where the spec and the contract leave a choice)

1. **Department and Unassigned queues reuse the team queue.** `?queue=department:cs` and `?queue=unassigned` render `TeamQueue` with that scope (the server answers the team shape with only `decide` filled, contract §4.6). Titles: "Waiting in <department label>" and "Waiting for an owner"; empty: "Nothing is waiting in <label>." and "Nothing is waiting for an owner."; empty detail: "Bundles made from customer messages show here when no one owns the record, or its owner can't read the message." The label comes from the queue row. No kind chips (contract D2-7). No Ask the agent. Cost: low.
2. **Queue keys are strings.** `department:<code>` where code is a `UserFunction` (`cs`, `engineering`, `sales`, `analytics`, `leadership`, `other`); D1's `department:${number}` placeholder type is replaced. `queueOf` accepts exactly those codes. Cost: none.
3. **The source line.** Under the panel's reason, before the meta line: an icon by channel (mail `Mail`, slack `Hash`, zendesk/freshdesk/webhook `Ticket`, jira `SquareKanban`; nightly `Moon`), then `<label> <ticket> from <from>` (parts left out when empty), then `· N messages` for mail when more than 1, then `· <time>` of `last_message_at` in the reader's time zone ("9:58 AM" today, "12 Oct 2026, 9:58 AM" another day). A ticket with a `link` adds "Open in <label>" (`META_LINK`, `target="_blank"`, `rel="noopener noreferrer"`, `ExternalLink` icon, its name says it opens a new tab: "Open in Zendesk (opens in a new tab)"). Nightly bundles keep D1's "Nightly review" text in the meta line and get no source line. Cost: trivial.
4. **The row shows the channel.** A message bundle's row in any queue uses the channel icon instead of `Layers`, and its meta line names the source label ("Zendesk") in place of the agent label's position; the agent stays. Cost: trivial.
5. **"For" on a queue bundle** (contract §3.1, §3.3). In the panel a department bundle reads "For Customer Success" (from `bundle.department.label`) and an Unassigned one reads "Unassigned"; both replace `forText(null)`'s "For the whole company", which would be wrong for a record bundle. A queue row reads the feed item's `detail.routed_to` and `detail.department` the same way ("For Customer Success" / "Unassigned"), never inferring from `for: null`. Cost: trivial.
6. **Saved edits (contract D2-18).** A waiting bundle's step saves when focus leaves that step's fields (only the fields that changed since the last answer), at once when its tick changes, and when the panel closes with unsaved fields. Each step shows a quiet status under its fields: "Saving…", then "Saved." for 4 s, or the server's sentence as an error under the field (400) or the form alert (409, 403). Run sends only fields not yet saved; the server already holds the rest. Cost: low.
7. **The discard bar stays only where nothing can be saved:** a failed step's edits (a partly done bundle is not waiting, so PATCH is refused) and the reject form. Closing a waiting bundle with unsaved fields saves them, then closes; if that save fails, the discard bar shows with the error above it. Cost: low.
8. **An edited step says so:** "Edited" in the step's meta line when `step.edited` is true, so a person knows Refresh keeps it. Cost: trivial.
9. **The banner.** When `has_newer_message` and the bundle is waiting: a bordered note at the top of the panel body, `role="status"`, "New message since you edited", with **Refresh suggestions** (bordered) when `can_refresh`. Busy "Refreshing…" (held, `aria-disabled`). The answer replaces the bundle and drops local draft edits (the server kept every saved edit); the summary line "Suggestions refreshed." takes focus. A refusal shows verbatim in the form alert (including `409 NO_READER` "Nobody this bundle is for may read its message any more."); `BUNDLE_CHANGED` and `BUNDLE_REFRESHED` also replace the bundle. Cost: low.
10. **Run against replaced steps** (`409 BUNDLE_REFRESHED`) needs no new code: D1's refusal reader already takes a 409's `bundle` and shows its `detail`; a test pins it. Cost: none.
11. **History "Rejected by".** `finishedByText` reads `rejected_by` for a rejected bundle (falling back to `run_by`); "Rejected by Carl CSM". Retry from History on a partly done bundle is unchanged (contract D2-30). Cost: trivial.
12. **Settings › Agents › Reading messages.** A section after "Workspace AI": "How often" (`Select`, the server's `intervals`), then one row per source with a `Switch` labelled by the source, hint "Not connected" for an unconnected source, then "Last read <time>" or "Not read yet". Each control saves at once with Undo, as the AI switch does (`useInstantSave`). Members see the same values as text. Cost: low.
13. **The credits note** in each agent's card, only when `waiting_threads > 0`: "3 conversations are waiting: this agent's credits are used up until 1 Nov." (`budget`, `resets_on`), "... : the workspace is out of AI credits." (`credits`), "1 conversation is waiting: ..." in the singular. Danger ink, under the budget line. Cost: trivial.
14. **"Save as draft only" arrives on** (contract D2-29): no code; the fixtures follow the server and the panel tests assert "Can't be undone" appears only after the switch is turned off. Cost: none.
15. **The badge** is the server's number (contract D2-9); the frontend reads it as before. A department bundle that runs leaves the badge through `feedChanged()`, as D1's bundles do. Pinned by an e2e journey; no code. Cost: none.

## File Structure

**Create**
- `src/components/work/BundleSource.tsx`: the panel's source line (Decision 3).
- `src/components/work/NewerMessage.tsx`: the banner and Refresh suggestions (Decision 9).
- `src/components/agents/MessageSources.tsx`, `MessageSources.test.tsx`: Settings › Agents › Reading messages (Decision 12).
- `src/e2e/bundleIntake.test.tsx`: the D2 journeys.

**Modify**
- `src/features/agents/bundleTypes.ts`, `bundlesApi.ts` (+ test), `bundleText.ts` (+ test), `agentTypes.ts`, `agentsText.ts` (+ test), `agentsApi.ts`, `testBundleFixtures.ts`, `testBundles.ts` (+ test), `testAgentsFixtures.ts`, `testAgents.ts`.
- `src/features/work/workTypes.ts`, `workApi.ts` (+ test), `queues.ts` (+ test), `teamQueue.ts` (+ test).
- `src/components/work/useTeamQueue.ts` (+ test), `TeamQueue.tsx`, `BundlePanel.tsx` (+ test), `BundleStep.tsx`, `BundleStepFields.tsx`, `BundleRow.tsx` (+ test), `FeedRowParts.tsx`.
- `src/pages/work/WorkInbox.tsx` (+ test), `History.tsx` (+ test).
- `src/components/agents/AgentsForm.tsx`, `AgentsSummary.tsx`, `AgentCard.tsx`; `src/pages/settings/AgentsSettingsPage.test.tsx`.
- Docs (Task 12): `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`.

---

### Task 1: Contract types and API wrappers

**Files:**
- Modify: `src/features/agents/bundleTypes.ts`, `src/features/agents/bundlesApi.ts`, `src/features/agents/bundlesApi.test.ts`, `src/features/agents/agentTypes.ts`, `src/features/work/workTypes.ts`, `src/features/work/workApi.ts`, `src/features/work/workApi.test.ts`, `src/features/agents/testBundleFixtures.ts` (defaults only), `src/features/agents/testAgentsFixtures.ts` (defaults only)

**Interfaces:**
- Produces (`agentTypes.ts`): `SignalSource = 'mail' | 'slack' | 'zendesk' | 'freshdesk' | 'jira' | 'webhook'`; `SignalInterval = '30m' | '1h' | '4h' | '24h'`; `SignalSourceRow { key: SignalSource; label: string; enabled: boolean; connected: boolean }`; `SignalSettings { interval: SignalInterval; intervals: { value: SignalInterval; label: string }[]; sources: SignalSourceRow[]; last_run_at: string | null }`; `AgentSettings.signals: SignalSettings`; `AgentCard.waiting_threads: number`, `AgentCard.waiting_reason: 'budget' | 'credits' | null`; `AgentSettingsPatch.signal_interval?: SignalInterval`, `signal_sources?: Partial<Record<SignalSource, boolean>>`.
- Produces (`bundleTypes.ts`): `Department = UserFunction`; `BundleSource { kind: 'nightly' | 'thread'; label: string; channel: SignalSource | null; from: string; messages: number; last_message_at: string | null; ticket: string | null; link: string | null }`; `Bundle.source: BundleSource`, `Bundle.department: { key: Department; label: string } | null`, `Bundle.refreshed_at: string | null`, `Bundle.rejected_by: PersonRef | null`, `Bundle.can_refresh: boolean`; `BundleStep.edited: boolean`; `QueueKey = 'mine' | 'team' | 'company' | 'history' | 'unassigned' | \`department:${Department}\``; `StepSave { fields?: StepFields; selected?: boolean }`.
- Produces (`workTypes.ts`): `QueueScope = TeamScope | 'unassigned' | \`department:${UserFunction}\``; `TeamQueuePayload.scope` and `TeamQueuePage.scope` are `QueueScope`; `BundleFeedItem.detail.source` gains `channel: SignalSource | null`; `BundleFeedItem.detail` gains `routed_to: 'owner' | 'department' | 'admins'` and `department: { key: UserFunction; label: string } | null` (contract §3.3).
- Produces (API): `saveStep(bundleId: number, stepId: number, body: StepSave): Promise<BundleAnswer>`; `refreshBundle(id: number): Promise<BundleAnswer>`; `fetchTeamQueue(scope: QueueScope, kinds)`, `fetchTeamQueueGroup(scope: QueueScope, group, kinds, cursor?)`.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/agents/bundlesApi.test.ts` inside the existing `describe`:

```ts
  it('saves a step and refreshes a bundle (agent bundles D2 contract §4.1, §4.2)', async () => {
    const seen = spyFetch();
    await saveStep(12, 41, { fields: { title: 'Call today' } });
    await saveStep(12, 42, { selected: false });
    await refreshBundle(12);
    expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual(['PATCH /agents/bundles/12/steps/41/', 'PATCH /agents/bundles/12/steps/42/', 'POST /agents/bundles/12/refresh/']);
    expect(seen.map((r) => r.body)).toEqual([{ fields: { title: 'Call today' } }, { selected: false }, undefined]);
  });
```

and add `refreshBundle, saveStep` to its import from `./bundlesApi`.

Append to `src/features/work/workApi.test.ts` (it already stubs fetch with a recorder; follow the file's own helper, named `spyFetch` or `record` there):

```ts
  it('reads a department or the Unassigned queue as a team scope (agent bundles D2 contract §4.6)', async () => {
    const seen = spyFetch();
    await fetchTeamQueue('department:cs', null);
    await fetchTeamQueue('unassigned', ['bundle']);
    await fetchTeamQueueGroup('department:engineering', 'decide', null, 'decide:50');
    expect(seen).toEqual([
      'GET /work/feed/team/?scope=department%3Acs',
      'GET /work/feed/team/?scope=unassigned&kind=bundle',
      'GET /work/feed/team/?scope=department%3Aengineering&group=decide&cursor=decide%3A50',
    ]);
  });
```

(If the file's recorder returns objects, compare `seen.map((r) => \`${r.method} ${r.url}\`)`; keep the file's style.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/agents/bundlesApi.test.ts src/features/work/workApi.test.ts --maxWorkers=2`
Expected: FAIL: `saveStep is not exported` / a type error surfaced as a failed import.

- [ ] **Step 3: The types**

In `src/features/agents/agentTypes.ts`, after `SkippedReason`:

```ts
/** Where agents read messages from (agent bundles D2 contract §1.1). */
export type SignalSource = 'mail' | 'slack' | 'zendesk' | 'freshdesk' | 'jira' | 'webhook';
export type SignalInterval = '30m' | '1h' | '4h' | '24h';

export interface SignalSourceRow {
  key: SignalSource;
  label: string;
  enabled: boolean;
  /** The workspace has this source connected. */
  connected: boolean;
}

/** GET /agents/settings/ `signals` (contract §4.8). */
export interface SignalSettings {
  interval: SignalInterval;
  intervals: { value: SignalInterval; label: string }[];
  sources: SignalSourceRow[];
  last_run_at: string | null;
}
```

In `AgentCard` add after `last_run`:

```ts
  /** Conversations this agent was chosen for that wait on credits (contract D2-23). */
  waiting_threads: number;
  waiting_reason: 'budget' | 'credits' | null;
```

In `AgentSettings` add `signals: SignalSettings;`. In `AgentSettingsPatch` add:

```ts
  signal_interval?: SignalInterval;
  signal_sources?: Partial<Record<SignalSource, boolean>>;
```

In `src/features/agents/bundleTypes.ts`: import `type { UserFunction } from '../auth/authSlice'` and `type { SignalSource } from './agentTypes'` (extend the existing `./agentTypes` import), then add before `BundleStep`:

```ts
/** A department queue's key part: a `User.Function` code (contract D2-5). */
export type Department = UserFunction;

/** Where a bundle came from (contract §3.1). */
export interface BundleSource {
  kind: 'nightly' | 'thread';
  label: string;
  /** Null for the nightly review. */
  channel: SignalSource | null;
  /** The newest sender's address, or a ticket's requester; '' when unknown. */
  from: string;
  /** Filed emails in the thread; 1 for a ticket; 0 for nightly. */
  messages: number;
  last_message_at: string | null;
  /** A ticket's number, else null. */
  ticket: string | null;
  /** The ticket in its own tool (opens in a new tab), else null. */
  link: string | null;
}

/** PATCH /agents/bundles/<id>/steps/<step id>/ (contract §4.1). */
export interface StepSave {
  fields?: StepFields;
  selected?: boolean;
}
```

In `BundleStep` add after `evidence`: `/** A person saved an edit to it (contract §3.2). */ edited: boolean;`. In `Bundle` replace `source: { kind: 'nightly' | 'thread'; label: string };` with `source: BundleSource;`, replace the `has_newer_message` comment with `/** A newer message arrived after someone edited it (contract D2-17). */`, and add after `steps`:

```ts
  /** routed_to "department": which one (contract §3.1). */
  department: { key: Department; label: string } | null;
  refreshed_at: string | null;
  rejected_by: PersonRef | null;
  /** Waiting, made from a message, and the reader may run a step. */
  can_refresh: boolean;
```

Replace `QueueKey` with:

```ts
/** Contract §4.5: department queues are keyed by department code. */
export type QueueKey = 'mine' | 'team' | 'company' | 'history' | 'unassigned' | `department:${Department}`;
```

In `src/features/work/workTypes.ts`: import `type { UserFunction } from '../auth/authSlice'` and `type { SignalSource } from '../agents/agentTypes'`; after `TeamScope` add:

```ts
/** GET /work/feed/team/?scope=: a team scope, a department queue or Unassigned (agent bundles D2 §4.6). */
export type QueueScope = TeamScope | 'unassigned' | `department:${UserFunction}`;
```

Change `scope: TeamScope;` to `scope: QueueScope;` in `TeamQueuePayload` and `TeamQueuePage`, and `BundleFeedItem.detail.source` to `{ kind: 'nightly' | 'thread'; label: string; channel: SignalSource | null }`, and add to `BundleFeedItem.detail`: `routed_to: 'owner' | 'department' | 'admins'; department: { key: UserFunction; label: string } | null;` (contract §3.3: queue rows read these).

- [ ] **Step 4: The wrappers**

In `src/features/agents/bundlesApi.ts` extend the type import with `StepSave` and add:

```ts
export const saveStep = (bundleId: number, stepId: number, body: StepSave) =>
  apiFetch<BundleAnswer>(`/agents/bundles/${bundleId}/steps/${stepId}/`, { method: 'PATCH', body });
export const refreshBundle = (id: number) => apiFetch<BundleAnswer>(`/agents/bundles/${id}/refresh/`, { method: 'POST' });
```

In `src/features/work/workApi.ts` import `QueueScope` with the other types and change both `fetchTeamQueue` and `fetchTeamQueueGroup`'s `scope: TeamScope` to `scope: QueueScope` (drop `TeamScope` from the import if nothing else there uses it).

- [ ] **Step 5: Keep the fixtures compiling (defaults only)**

`src/features/agents/testBundleFixtures.ts`: in `step()` add `edited: false,` before `...over`; in `bundle()` replace `source: { kind: 'nightly', label: 'Nightly review' },` with:

```ts
    source: NIGHTLY,
```

and add before `...over`: `department: null, refreshed_at: null, rejected_by: null, can_refresh: false,`. Above `step()`:

```ts
export const NIGHTLY: BundleSource = { kind: 'nightly', label: 'Nightly review', channel: null, from: '', messages: 0, last_message_at: null, ticket: null, link: null };
```

(import `BundleSource` with the other types). `bundleItem` keeps `source: b.source`; change it to `source: { kind: b.source.kind, label: b.source.label, channel: b.source.channel }` so the item carries the contract's three keys only, and add `routed_to: b.routed_to, department: b.department` to its `detail` (contract §3.3).

`src/features/agents/testAgentsFixtures.ts`: add `waiting_threads: 0, waiting_reason: null` to each of the three `CARDS`, and to `AGENT_SETTINGS`:

```ts
  signals: SIGNALS,
```

with, above it:

```ts
export const SIGNALS: SignalSettings = {
  interval: '1h',
  intervals: [
    { value: '30m', label: 'Every 30 minutes' },
    { value: '1h', label: 'Every hour' },
    { value: '4h', label: 'Every 4 hours' },
    { value: '24h', label: 'Once a day' },
  ],
  sources: [
    { key: 'mail', label: 'Email filed to a customer', enabled: true, connected: true },
    { key: 'slack', label: 'Slack', enabled: true, connected: false },
    { key: 'zendesk', label: 'Zendesk', enabled: true, connected: true },
    { key: 'freshdesk', label: 'Freshdesk', enabled: true, connected: false },
    { key: 'jira', label: 'Jira', enabled: true, connected: false },
    { key: 'webhook', label: 'Webhooks', enabled: false, connected: false },
  ],
  last_run_at: '2026-10-08T09:00:02Z',
};
```

(import `SignalSettings`).

- [ ] **Step 6: Run the tests and the type check**

Run: `npx vitest run src/features/agents/bundlesApi.test.ts src/features/work/workApi.test.ts --maxWorkers=2 && npx tsc -b`
Expected: PASS, and `tsc` clean. If `tsc` names another file that builds an `AgentCard`, `Bundle` or `AgentSettings` literal (grep `resets_on:`, `has_newer_message:` and `plan_monthly_credits:` under `src/`), give it the same defaults.

- [ ] **Step 7: Commit**

```bash
git add src/features/agents/bundleTypes.ts src/features/agents/bundlesApi.ts src/features/agents/bundlesApi.test.ts src/features/agents/agentTypes.ts src/features/work/workTypes.ts src/features/work/workApi.ts src/features/work/workApi.test.ts src/features/agents/testBundleFixtures.ts src/features/agents/testAgentsFixtures.ts
git commit -m "feat(agents): delivery 2 contract types, saveStep and refreshBundle, queue scopes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The stubs and fixtures: message bundles, saved edits, refresh, queues, signals

**Files:**
- Modify: `src/features/agents/testBundleFixtures.ts`, `src/features/agents/testBundles.ts`, `src/features/agents/testBundles.test.ts`, `src/features/agents/testAgents.ts`, `src/features/agents/testAgents.test.ts`

**Interfaces:**
- Consumes: Task 1's types.
- Produces (fixtures): `B_TICKET` (id 20, Zendesk, owner-routed to Alice, one `draft.reply` step 201 and one `task.create` step 202), `B_MAIL` (id 21, mail thread of 3 messages, edited, `has_newer_message: true`, `can_refresh: true`, steps 211 edited `task.create` and 212 `note.create`), `B_DEPT` (id 22, department `cs` on the ownerless Loose Ltd, `for: null`, step 221 `task.create`), `B_UNASSIGNED` (id 23, `routed_to: 'admins'`, Slack, step 231 `note.create`), `MESSAGE_BUNDLES = [B_TICKET, B_MAIL, B_DEPT, B_UNASSIGNED]`, `REFRESHED_STEPS` (the steps a refresh of `B_MAIL` answers), `CS_QUEUE: QueueRow`, `UNASSIGNED_QUEUE: QueueRow`, `LOOSE = { type: 'customer', id: 11, name: 'Loose Ltd' }`.
- Produces (`stubBundles` options): `departments?: { key: Department; label: string }[]` (default `[]`: the rail lists these department queues), `unassigned?: boolean` (default `false`), `readerDepartment?: Department` (default `'cs'`: the badge counts this queue), `refuseNextSave?: { status: number; body: unknown }`, `refuseNextRefresh?: { status: number; body: unknown }`, `refreshAnswer?: BundleStep[]` (default `REFRESHED_STEPS`). Handles `PATCH /agents/bundles/<id>/steps/<step>/`, `POST /agents/bundles/<id>/refresh/`, `GET /work/feed/team/?scope=department:<code>|unassigned`, augments `GET /work/queues/` and `GET /work/feed/count/`; reject stores `rejected_by`.
- Produces (`stubAgents`): `PATCH /agents/settings/` accepts and refuses `signal_interval` and `signal_sources` with the contract's sentences.

- [ ] **Step 1: Write the failing stub tests**

Append to `src/features/agents/testBundles.test.ts` (its file already has `afterEach(() => vi.unstubAllGlobals())`; add imports `B_DEPT, B_MAIL, B_TICKET, B_UNASSIGNED, BUNDLES, MESSAGE_BUNDLES` from `./testBundleFixtures`):

```ts
describe('stubBundles: delivery 2 (contract §4.1 to §4.7)', () => {
  const call = async (method: string, path: string, body?: unknown) => {
    const answer = await fetch(`http://localhost/api/v1${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: answer.status, body: await answer.json() };
  };

  it('saves a waiting step and marks it edited; refuses a key it may not change', async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES] });
    const saved = await call('PATCH', '/agents/bundles/20/steps/202/', { fields: { title: 'Fix the login loop today' } });
    expect(saved.status).toBe(200);
    const step = saved.body.bundle.steps.find((s: { id: number }) => s.id === 202);
    expect([step.fields.title, step.edited, saved.body.bundle.edited_by]).toEqual(['Fix the login loop today', true, { id: 1, name: 'Alice' }]);
    expect((await call('PATCH', '/agents/bundles/20/steps/202/', { fields: { body: 'x' } })).body).toEqual({ steps: { 202: { body: ["This can't be changed here."] } } });
    expect((await call('PATCH', '/agents/bundles/20/steps/202/', {})).body).toEqual({ steps: ['Send fields or selected.'] });
    expect((await call('PATCH', '/agents/bundles/20/steps/202/', { fields: {} })).body).toEqual({ steps: ['Send fields or selected.'] });
    expect((await call('PATCH', '/agents/bundles/15/steps/71/', { selected: false })).status).toBe(409);
  });

  it('refreshes a message bundle, keeping edited steps, and refuses a nightly one', async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES] });
    const fresh = await call('POST', '/agents/bundles/21/refresh/');
    expect(fresh.status).toBe(200);
    expect(fresh.body.bundle.has_newer_message).toBe(false);
    expect(fresh.body.bundle.steps.map((s: { id: number; position: number }) => [s.id, s.position])).toEqual([
      [211, 1],
      [290, 2],
    ]);
    expect(await call('POST', '/agents/bundles/12/refresh/')).toEqual({ status: 409, body: { code: 'NOT_A_THREAD', detail: 'Only a bundle made from a message can be refreshed.' } });
  });

  it('answers a run that names replaced steps with BUNDLE_REFRESHED', async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES] });
    await call('POST', '/agents/bundles/21/refresh/');
    const run = await call('POST', '/agents/bundles/21/run/', { steps: [{ id: 211, selected: true }, { id: 212, selected: true }] });
    expect([run.status, run.body.code, run.body.detail]).toEqual([409, 'BUNDLE_REFRESHED', 'This bundle was updated with a newer message. Review it again.']);
  });

  it('lists department and Unassigned queues, reads them, and counts the reader department in the badge', async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES], departments: [{ key: 'cs', label: 'Customer Success' }], unassigned: true });
    const rows = (await call('GET', '/work/queues/')).body.queues.map((q: { key: string; count: number | null }) => [q.key, q.count]);
    expect(rows.slice(-3)).toEqual([
      ['department:cs', 1],
      ['unassigned', 1],
      ['history', null],
    ]);
    const dept = (await call('GET', '/work/feed/team/?scope=department%3Acs')).body;
    expect([dept.scope, dept.groups[0].items.map((i: { key: string }) => i.key)]).toEqual(['department:cs', [`bundle:${B_DEPT.id}`]]);
    expect([dept.groups[0].items[0].detail.routed_to, dept.groups[0].items[0].detail.department]).toEqual(['department', { key: 'cs', label: 'Customer Success' }]);
    const unassigned = (await call('GET', '/work/feed/team/?scope=unassigned')).body;
    expect(unassigned.groups[0].items.map((i: { key: string }) => i.key)).toEqual([`bundle:${B_UNASSIGNED.id}`]);
    expect((await call('GET', '/work/feed/team/?scope=department%3Asales')).status).toBe(403);
    const before = (await call('GET', '/work/feed/count/')).body.badge;
    await call('POST', `/agents/bundles/${B_DEPT.id}/run/`, { steps: [{ id: 221, selected: true }] });
    expect((await call('GET', '/work/feed/count/')).body.badge).toBe(before - 1);
  });

  it('keeps department and Unassigned bundles off Mine and My team, and names the rejecter', async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES] });
    const mine = (await call('GET', '/work/feed/?kind=bundle')).body.groups[0].items.map((i: { key: string }) => i.key);
    expect(mine).toContain(`bundle:${B_TICKET.id}`);
    expect(mine).not.toContain(`bundle:${B_DEPT.id}`);
    const rejected = await call('POST', `/agents/bundles/${B_MAIL.id}/reject/`, { reason: 'other' });
    expect(rejected.body.bundle.rejected_by).toEqual({ id: 1, name: 'Alice' });
  });
});
```

Append to `src/features/agents/testAgents.test.ts`:

```ts
describe('stubAgents: signals (agent bundles D2 contract §4.8)', () => {
  it('saves the interval and a source, and refuses bad values with the contract sentences', async () => {
    stubAgents();
    const patch = (body: unknown) => fetch('http://localhost/api/v1/agents/settings/', { method: 'PATCH', body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
    const saved = await patch({ signal_interval: '4h', signal_sources: { slack: false } });
    expect([saved.body.signals.interval, saved.body.signals.sources.find((s: { key: string }) => s.key === 'slack').enabled]).toEqual(['4h', false]);
    expect((await patch({ signal_interval: '2h' })).body).toEqual({ signal_interval: ['Choose every 30 minutes, every hour, every 4 hours or once a day.'] });
    expect((await patch({ signal_sources: { fax: true, slack: 'yes' } })).body).toEqual({ signal_sources: { fax: ['Unknown source.'], slack: ['Choose on or off.'] } });
    expect((await patch({ signal_sources: ['slack'] })).body).toEqual({ signal_sources: ['Send the sources as one object.'] });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/agents/testBundles.test.ts src/features/agents/testAgents.test.ts --maxWorkers=2`
Expected: FAIL (`B_TICKET` is not exported; the PATCH answers the feed stub's 404).

- [ ] **Step 3: The fixtures**

Append to `src/features/agents/testBundleFixtures.ts` (import `QueueRow` with the other bundle types):

```ts
export const LOOSE = { type: 'customer' as const, id: 11, name: 'Loose Ltd' };
const at = '2026-10-07T09:58:12Z';

/** A Zendesk ticket on Pizza Hut, routed to its owner Alice (contract §3.1). */
export const B_TICKET: Bundle = bundle({
  id: 20,
  title: 'Pizza Hut: login loop after a password reset',
  reason: 'Ann cannot log in since the reset and the renewal is close.',
  created_at: at,
  updated_at: at,
  source: { kind: 'thread', label: 'Zendesk', channel: 'zendesk', from: 'ann@pizzahut.com', messages: 1, last_message_at: at, ticket: 'ZD-1042', link: 'https://acme.zendesk.com/agent/tickets/1042' },
  can_reject: true,
  can_refresh: true,
  steps: [
    step({ id: 201, position: 1, kind: 'draft.reply', label: 'Draft a reply', title: 'Reply to Ann about the login loop', fields: { body: 'Hi Ann, we are on it.' }, editable: ['body'], preview: { draft: { channel: 'ticket', ticket: 'ZD-1042', subject: 'Login loop', excerpt: 'Hi Ann, we are on it.' } } }),
    step({ id: 202, position: 2, kind: 'task.create', label: 'Create a task', title: 'Fix the login loop', fields: { title: 'Fix the login loop', assignee_id: 3, due_date: '2026-10-09', priority: 'high' }, editable: ['title', 'assignee_id', 'due_date', 'priority'], preview: { task: { title: 'Fix the login loop', assignee: CARL, due_date: '2026-10-09', priority: 'high' } } }),
  ],
});

/** A mail thread of three messages, edited by Alice, with a newer message since (contract D2-17). */
export const B_MAIL: Bundle = bundle({
  id: 21,
  title: 'Pizza Hut: multi-year renewal terms',
  reason: 'Ann asks for a two-year option before the renewal.',
  created_at: at,
  updated_at: at,
  source: { kind: 'thread', label: 'Email', channel: 'mail', from: 'ann@pizzahut.com', messages: 3, last_message_at: at, ticket: null, link: null },
  edited_at: at,
  edited_by: ALICE,
  has_newer_message: true,
  can_reject: true,
  can_refresh: true,
  steps: [
    step({ id: 211, position: 1, kind: 'task.create', label: 'Create a task', title: 'Price a two-year renewal', edited: true, fields: { title: 'Price a two-year renewal today', assignee_id: 1, due_date: '2026-10-08', priority: 'high' }, editable: ['title', 'assignee_id', 'due_date', 'priority'], preview: { task: { title: 'Price a two-year renewal today', assignee: ALICE, due_date: '2026-10-08', priority: 'high' } } }),
    step({ id: 212, position: 2, kind: 'note.create', label: 'File a note', title: 'Note the ask', fields: { title: 'Two-year ask', body: 'Ann wants two years.' }, editable: ['title', 'body'], preview: { note: { title: 'Two-year ask' } } }),
  ],
});

/** What refreshing B_MAIL answers: the edited step kept, a new one after it (contract D2-19). */
export const REFRESHED_STEPS: BundleStep[] = [
  step({ id: 290, position: 2, kind: 'note.create', label: 'File a note', title: 'Note the new deadline', fields: { title: 'Deadline Friday', body: 'Ann needs it by Friday.' }, editable: ['title', 'body'], preview: { note: { title: 'Deadline Friday' } } }),
];

/** A Customer Success queue bundle on the ownerless Loose Ltd (contract D2-5). */
export const B_DEPT: Bundle = bundle({
  id: 22,
  title: 'Loose Ltd: export fails on large files',
  reason: 'Nobody owns Loose Ltd and the ticket is a week old.',
  record: LOOSE,
  routed_to: 'department',
  department: { key: 'cs', label: 'Customer Success' },
  for: null,
  created_at: at,
  updated_at: at,
  source: { kind: 'thread', label: 'Zendesk', channel: 'zendesk', from: 'ops@loose.io', messages: 1, last_message_at: at, ticket: 'ZD-1077', link: 'https://acme.zendesk.com/agent/tickets/1077' },
  can_reject: true,
  can_refresh: true,
  steps: [step({ id: 221, position: 1, kind: 'task.create', label: 'Create a task', title: 'Look into the export', fields: { title: 'Look into the export', assignee_id: null, due_date: '2026-10-10', priority: 'medium' }, editable: ['title', 'assignee_id', 'due_date', 'priority'], preview: { task: { title: 'Look into the export', assignee: null, due_date: '2026-10-10', priority: 'medium' } } })],
});

/** An Unassigned bundle: a Slack message on Loose Ltd from a connector with no department. */
export const B_UNASSIGNED: Bundle = bundle({
  id: 23,
  title: 'Loose Ltd: asks for a training session',
  record: LOOSE,
  routed_to: 'admins',
  for: null,
  created_at: at,
  updated_at: at,
  source: { kind: 'thread', label: 'Slack', channel: 'slack', from: 'kim@loose.io', messages: 1, last_message_at: at, ticket: 'SL-10421', link: 'https://slack.com/archives/C1/p1' },
  can_reject: true,
  can_refresh: true,
  steps: [step({ id: 231, position: 1, kind: 'note.create', label: 'File a note', title: 'Note the training ask', fields: { title: 'Training ask', body: 'Kim wants a session.' }, editable: ['title', 'body'], preview: { note: { title: 'Training ask' } } })],
});

export const MESSAGE_BUNDLES: Bundle[] = [B_TICKET, B_MAIL, B_DEPT, B_UNASSIGNED];
export const CS_QUEUE: QueueRow = { key: 'department:cs', label: 'Customer Success', count: 1 };
export const UNASSIGNED_QUEUE: QueueRow = { key: 'unassigned', label: 'Unassigned', count: 1 };
```

(`ActionPreview.note` is `{ title }` only, as the merged `note.create` fixtures use it.)

- [ ] **Step 4: The bundle stub**

In `src/features/agents/testBundles.ts`:

1. Extend `BundlesStub`:

```ts
  /** Department queues the rail lists (contract D2-7). Default none. */
  departments?: { key: Department; label: string }[];
  /** The rail lists Unassigned (the reader is an admin). Default false. */
  unassigned?: boolean;
  /** The reader's department, whose queue the badge counts (D2-9). Default 'cs'. */
  readerDepartment?: Department;
  refuseNextSave?: { status: number; body: unknown };
  /** The next refresh answers this instead, once: e.g. `409 NO_READER`, `BUDGET_USED`, `BUNDLE_CHANGED`, 429, 503 (contract §4.2). */
  refuseNextRefresh?: { status: number; body: unknown };
  /** The new steps a refresh adds after the kept ones. Default REFRESHED_STEPS. */
  refreshAnswer?: BundleStep[];
```

2. Mine and the team lists leave out queue bundles: replace `const mine = waiting.filter((b) => b.for?.id === READER.id);` with

```ts
  const routedToPeople = waiting.filter((b) => b.routed_to === 'owner' || b.record === null);
  const mine = routedToPeople.filter((b) => b.for?.id === READER.id);
```

and use `routedToPeople` in the two `team` defaults in place of `waiting`.

3. Add these functions inside `stubBundles` before `spy`:

```ts
  let refuseSave = stub.refuseNextSave ?? null;
  let refuseRefresh = stub.refuseNextRefresh ?? null;
  const replaced = new Set<number>();

  /** Contract §4.1. */
  function save(b: Bundle, stepId: number, body: Record<string, unknown>) {
    if (refuseSave) {
      const answer = refuseSave;
      refuseSave = null;
      return json(answer.status, answer.body);
    }
    const s = b.steps.find((candidate) => candidate.id === stepId);
    if (!s) return json(404, { code: 'NO_SUCH_BUNDLE', detail: 'No such bundle.' });
    if (!s.can_run && s.status === 'proposed') return json(403, { code: 'CANT_RUN_STEP', detail: `You can't run step ${s.position}.`, step: s.id });
    if (b.status !== 'waiting') return refusal409(b, rejectedBy.get(b.id));
    if (s.status !== 'proposed') return json(409, { code: 'STEP_NOT_WAITING', detail: 'Only a waiting step can be changed.', bundle: b });
    // Contract §4.1: neither a `selected` key nor a non-empty `fields` object ({} and {"fields": {}} alike).
    const fields = (isObject(body.fields) ? body.fields : {}) as StepFields;
    if (!('selected' in body) && Object.keys(fields).length === 0) return json(400, { steps: ['Send fields or selected.'] });
    for (const key of Object.keys(fields)) if (!s.editable.includes(key)) return json(400, { steps: { [s.id]: { [key]: ["This can't be changed here."] } } });
    if (typeof fields.title === 'string' && fields.title.trim() === '') return json(400, { steps: { [s.id]: { title: ['Give the task a title.'] } } });
    if ('selected' in body && typeof body.selected !== 'boolean') return json(400, { steps: { [s.id]: { selected: ['Choose on or off.'] } } });
    s.fields = { ...s.fields, ...fields };
    if (typeof fields.title === 'string') s.title = fields.title;
    if (typeof body.selected === 'boolean') s.selected = body.selected;
    s.edited = true;
    b.edited_at = NOW;
    b.edited_by = READER;
    b.updated_at = NOW;
    return json(200, { bundle: b });
  }

  /** Contract §4.2: keep edited steps (renumbered 1..k), append the new ones. */
  function refresh(b: Bundle) {
    if (b.source.kind !== 'thread') return json(409, { code: 'NOT_A_THREAD', detail: 'Only a bundle made from a message can be refreshed.' });
    if (b.status !== 'waiting') return refusal409(b, rejectedBy.get(b.id));
    if (refuseRefresh) {
      const answer = refuseRefresh;
      refuseRefresh = null;
      return json(answer.status, answer.body);
    }
    const kept = b.steps.filter((s) => s.status !== 'proposed' || s.edited).sort((x, y) => x.position - y.position);
    kept.forEach((s, index) => (s.position = index + 1));
    const added = clone(stub.refreshAnswer ?? REFRESHED_STEPS).map((s, index) => ({ ...s, position: kept.length + index + 1 }));
    b.steps = [...kept, ...added];
    b.step_count = b.steps.length;
    b.has_newer_message = false;
    b.refreshed_at = NOW;
    b.updated_at = NOW;
    replaced.add(b.id);
    return json(200, { bundle: b });
  }

  const department = (b: Bundle) => (b.routed_to === 'department' ? b.department?.key : null);
  const inQueue = (scope: string, b: Bundle) =>
    b.status === 'waiting' && (scope === 'unassigned' ? b.routed_to === 'admins' && b.source.kind === 'thread' : `department:${department(b)}` === scope);
  const offeredQueue = (scope: string) => (scope === 'unassigned' ? stub.unassigned === true : (stub.departments ?? []).some((d) => `department:${d.key}` === scope));

  /** Contract §4.6: the queue's waiting bundles in `decide`, nothing else. */
  function queueScope(scope: string) {
    if (!offeredQueue(scope)) return json(403, { code: 'SCOPE_NOT_ALLOWED', detail: "You can't see that view." });
    const items = [...bundles.values()].filter((b) => inQueue(scope, b)).map((b) => bundleItem(b, true));
    const group = (key: string, list: FeedItem[]) => ({ key, count: list.length, items: list, next: null });
    return json(200, { scope, groups: [group('decide', items), group('overdue', []), group('suggested', [])], hidden: 0, failed: [] });
  }

  const waitingIn = (scope: string) => [...bundles.values()].filter((b) => inQueue(scope, b)).length;
```

4. In `run()`, before the `400` checks (after `if (b.status !== 'waiting') ...`):

```ts
    if (b.refreshed_at && replaced.has(b.id) && ids.some((id) => !b.steps.some((s) => s.id === id)))
      return json(409, { code: 'BUNDLE_REFRESHED', detail: 'This bundle was updated with a newer message. Review it again.', bundle: b });
```

(move the `sent`/`ids` lines above it). In `reject()`, add `rejected_by: READER` to the `Object.assign`.

5. In `spy`, before `return feed.spy(input, init);`:

```ts
    const stepPath = /^\/agents\/bundles\/(\d+)\/steps\/(\d+)\/$/.exec(path);
    if (stepPath && method === 'PATCH') {
      const b = bundles.get(Number(stepPath[1]));
      return b ? save(b, Number(stepPath[2]), body) : json(404, { code: 'NO_SUCH_BUNDLE', detail: 'No such bundle.' });
    }
    if (method === 'GET' && path === '/work/feed/team/') {
      const scope = url.searchParams.get('scope') ?? '';
      if (scope === 'unassigned' || scope.startsWith('department:')) return queueScope(scope);
    }
    if (method === 'GET' && path === '/work/queues/') {
      const base = await feed.spy(input, init);
      const answer = (await base.json()) as QueuesPayload;
      const extra: QueueRow[] = [
        ...(stub.departments ?? []).map((d) => ({ key: `department:${d.key}` as const, label: d.label, count: waitingIn(`department:${d.key}`) })),
        ...(stub.unassigned ? [{ key: 'unassigned' as const, label: 'Unassigned', count: waitingIn('unassigned') }] : []),
      ];
      const at = answer.queues.findIndex((q) => q.key === 'history');
      answer.queues.splice(at < 0 ? answer.queues.length : at, 0, ...extra);
      return json(200, answer);
    }
    if (method === 'GET' && path === '/work/feed/count/') {
      const base = (await (await feed.spy(input, init)).json()) as { decide: number; overdue: number; badge: number; failed: string[] };
      const own = waitingIn(`department:${stub.readerDepartment ?? 'cs'}`);
      return json(200, { ...base, decide: base.decide + own, badge: base.badge + own });
    }
```

and in the `match` branch for `/agents/bundles/<id>/…` add `refresh` to the alternation (`(run|reject|refresh)`) and `if (method === 'POST' && match[2] === 'refresh') return refresh(b);`. Add `const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);` near `json` if the file has none. Import `Department`, `QueueRow`, `QueuesPayload` from `./bundleTypes`, `REFRESHED_STEPS` from `./testBundleFixtures`, and keep `FeedItem` from `../work/workTypes`. In `settle()`, keep `leave(b.id)`: a department bundle that ran leaves its queue because `inQueue` reads `status`.

- [ ] **Step 5: The agents stub**

In `src/features/agents/testAgents.ts` `saveSettings`, after the `tone` check:

```ts
    const INTERVALS = ['30m', '1h', '4h', '24h'];
    if ('signal_interval' in body && !INTERVALS.includes(String(body.signal_interval))) errors.signal_interval = ['Choose every 30 minutes, every hour, every 4 hours or once a day.'];
    if ('signal_sources' in body) {
      if (!isObject(body.signal_sources)) errors.signal_sources = ['Send the sources as one object.'];
      else {
        const wrong: Record<string, string[]> = {};
        for (const [key, value] of Object.entries(body.signal_sources)) {
          if (!settings.signals.sources.some((s) => s.key === key)) wrong[key] = ['Unknown source.'];
          else if (typeof value !== 'boolean') wrong[key] = ['Choose on or off.'];
        }
        if (Object.keys(wrong).length > 0) errors.signal_sources = wrong;
      }
    }
```

and after the `tone` apply:

```ts
    if (typeof body.signal_interval === 'string') settings.signals.interval = body.signal_interval as AgentSettings['signals']['interval'];
    if (isObject(body.signal_sources)) {
      for (const [key, value] of Object.entries(body.signal_sources)) {
        const row = settings.signals.sources.find((s) => s.key === key);
        if (row && typeof value === 'boolean') row.enabled = value;
      }
    }
```

- [ ] **Step 6: Run them**

Run: `npx vitest run src/features/agents/testBundles.test.ts src/features/agents/testAgents.test.ts --maxWorkers=2 && npx tsc -b`
Expected: PASS; `tsc` clean.

- [ ] **Step 7: Commit**

```bash
git add src/features/agents/testBundleFixtures.ts src/features/agents/testBundles.ts src/features/agents/testBundles.test.ts src/features/agents/testAgents.ts src/features/agents/testAgents.test.ts
git commit -m "test(agents): message bundle fixtures; stubs for saved edits, refresh, department queues and signals

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Department and Unassigned queues in the rail and the inbox

**Files:**
- Modify: `src/features/work/queues.ts`, `src/features/work/queues.test.ts`, `src/features/work/teamQueue.ts`, `src/features/work/teamQueue.test.ts`, `src/components/work/useTeamQueue.ts`, `src/components/work/useTeamQueue.test.tsx`, `src/components/work/TeamQueue.tsx`, `src/pages/work/WorkInbox.tsx`, `src/pages/work/WorkInbox.test.tsx`

**Interfaces:**
- Consumes: `QueueKey`, `QueueScope`, `stubBundles({ departments, unassigned })`, `CS_QUEUE`, `B_DEPT`, `B_UNASSIGNED`, `MESSAGE_BUNDLES`.
- Produces: `isRoutedQueue(key: QueueKey): key is 'unassigned' | \`department:${Department}\``; `queueTitle(scope: QueueScope, label?: string): string`; `queueEmpty(scope: QueueScope, label?: string): string`; `TEAM_QUEUE.ROUTED_EMPTY_DETAIL`; `TeamQueue` props gain `label?: string`.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/work/queues.test.ts`:

```ts
describe('department and Unassigned queues (agent bundles D2 §4.5; Decisions 1, 2)', () => {
  it('reads department codes and Unassigned from the URL, and nothing else', () => {
    expect(queueOf(new URLSearchParams('queue=department:cs'))).toBe('department:cs');
    expect(queueOf(new URLSearchParams('queue=department:engineering'))).toBe('department:engineering');
    expect(queueOf(new URLSearchParams('queue=unassigned'))).toBe('unassigned');
    expect(queueOf(new URLSearchParams('queue=department:3'))).toBe('mine');
    expect(queueOf(new URLSearchParams('queue=department:finance'))).toBe('mine');
  });

  it('gives them no kind chips and links them by key', () => {
    expect(chipsFor('department:cs')).toEqual([]);
    expect(chipsFor('unassigned')).toEqual([]);
    expect(queueHref('department:cs')).toBe('/work?queue=department%3Acs');
    expect(isRoutedQueue('unassigned')).toBe(true);
    expect(isRoutedQueue('team')).toBe(false);
  });
});
```

(add `isRoutedQueue` to its import). Append to `src/features/work/teamQueue.test.ts`:

```ts
it('names department and Unassigned queues by their label (Decision 1)', () => {
  expect(queueTitle('department:cs', 'Customer Success')).toBe('Waiting in Customer Success');
  expect(queueEmpty('department:cs', 'Customer Success')).toBe('Nothing is waiting in Customer Success.');
  expect(queueTitle('unassigned')).toBe('Waiting for an owner');
  expect(queueEmpty('unassigned')).toBe('Nothing is waiting for an owner.');
  expect(queueTitle('team')).toBe('Waiting on your team');
});
```

Append to `src/components/work/useTeamQueue.test.tsx` (inside its `describe`; it stubs with `stubFeed`; this case uses `stubBundles`):

```ts
  it('reads a department scope whose key holds a colon (agent bundles D2 §4.6)', async () => {
    const { spy } = stubBundles({ bundles: MESSAGE_BUNDLES, departments: [{ key: 'cs', label: 'Customer Success' }] });
    const { result } = renderHook(() => useTeamQueue('department:cs', null, () => false));
    await waitFor(() => expect(result.current.data?.groups[0].items.map((i) => i.key)).toEqual([`bundle:${B_DEPT.id}`]));
    expect(spy.mock.calls.some(([url]) => String(url).includes('scope=department%3Acs'))).toBe(true);
  });
```

Append to `src/pages/work/WorkInbox.test.tsx`:

```ts
describe('department and Unassigned queues (agent bundles D2; Decision 1)', () => {
  it('lists them in the rail with counts and shows their bundles without chips', async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES], departments: [{ key: 'cs', label: 'Customer Success' }], unassigned: true });
    renderWork('/work?queue=department:cs');
    const rail = await screen.findByRole('navigation', { name: 'Queues' });
    expect(await within(rail).findByRole('link', { name: 'Customer Success 1' })).toHaveAttribute('aria-current', 'page');
    expect(within(rail).getByRole('link', { name: 'Unassigned 1' })).toHaveAttribute('href', '/work?queue=unassigned');
    const queue = await screen.findByRole('region', { name: 'Waiting in Customer Success' });
    expect(within(queue).getByRole('heading', { name: B_DEPT.title })).toBeInTheDocument();
    expect(within(queue).queryByRole('group', { name: 'Show' })).not.toBeInTheDocument();
    expect(within(queue).queryByRole('button', { name: 'Ask the agent' })).not.toBeInTheDocument();
  });

  it('says so when nothing waits for an owner', async () => {
    stubBundles({ bundles: BUNDLES, unassigned: true });
    renderWork('/work?queue=unassigned');
    expect(await screen.findByText('Nothing is waiting for an owner.')).toBeInTheDocument();
  });

  it('falls back to Mine when the queue is not offered', async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES] });
    renderWork('/work?queue=department:cs');
    await waitFor(() => expect(where()).toBe('/work?queue=mine'));
  });

  it('offers them in the phone select', async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES], departments: [{ key: 'cs', label: 'Customer Success' }] });
    renderWork('/work?queue=mine', { width: 390 });
    const select = await screen.findByLabelText('Queue');
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Customer Success (1)' })).toBeInTheDocument());
  });
});
```

(imports: `BUNDLES, B_DEPT, MESSAGE_BUNDLES` from `../../features/agents/testBundleFixtures`, `stubBundles`, `where`; reuse the file's existing ones.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/work/queues.test.ts src/features/work/teamQueue.test.ts src/components/work/useTeamQueue.test.tsx src/pages/work/WorkInbox.test.tsx --maxWorkers=2`
Expected: FAIL (`department:cs` falls back to `mine`; `isRoutedQueue` missing; the hook splits the key on the first `:`).

- [ ] **Step 3: The rules**

`src/features/work/queues.ts`: replace `KEY` with

```ts
const DEPARTMENTS = 'cs|engineering|sales|analytics|leadership|other';
const KEY = new RegExp(`^(mine|team|company|history|unassigned|department:(?:${DEPARTMENTS}))$`);
```

and change `chipsFor`'s first line to `if (queue === 'history' || isRoutedQueue(queue)) return [];`, then add:

```ts
/** A queue a bundle was routed to (contract D2-5): bundles only, no chips (D2-7). */
export const isRoutedQueue = (key: QueueKey): key is 'unassigned' | `department:${Department}` => key === 'unassigned' || key.startsWith('department:');
```

(import `Department`). `src/features/work/teamQueue.ts`: import `QueueScope` instead of `TeamScope` and replace the two functions and add one constant:

```ts
export const queueTitle = (scope: QueueScope, label = ''): string => {
  if (scope === 'team') return QUEUE.TEAM_TITLE;
  if (scope === 'company') return QUEUE.COMPANY_TITLE;
  if (scope === 'unassigned') return 'Waiting for an owner';
  return `Waiting in ${label}`;
};

export const queueEmpty = (scope: QueueScope, label = ''): string => {
  if (scope === 'team') return 'Nothing is waiting on your team.';
  if (scope === 'company') return 'Nothing is waiting on the rest of the company.';
  if (scope === 'unassigned') return 'Nothing is waiting for an owner.';
  return `Nothing is waiting in ${label}.`;
};
```

and in `TEAM_QUEUE` add `ROUTED_EMPTY_DETAIL: "Bundles made from customer messages show here when no one owns the record, or its owner can't read the message.",`.

- [ ] **Step 4: The hook's key**

`src/components/work/useTeamQueue.ts`: a department scope holds a `:`, so the cache key joins with `|`:

```ts
type Key = `${QueueScope}|${string}`;
const keyOf = (scope: QueueScope, chip: FeedChip | null): Key => `${scope}|${chip ?? ''}`;
const parts = (key: Key) => {
  const at = key.lastIndexOf('|');
  return { scope: key.slice(0, at) as QueueScope, kinds: kindsOf(chipOf(key.slice(at + 1) || null)) };
};
```

and `useTeamQueue(scope: QueueScope, ...)` (import `QueueScope`).

- [ ] **Step 5: The queue and the inbox**

`src/components/work/TeamQueue.tsx`: props `{ scope: QueueScope; label?: string; canAsk: boolean; onRefused: ... }`; the empty state becomes

```tsx
<EmptyState title={chip ? emptyTitle(chip) : queueEmpty(scope, label)} detail={scope === 'team' || scope === 'company' ? TEAM_QUEUE.EMPTY_DETAIL : TEAM_QUEUE.ROUTED_EMPTY_DETAIL} />
```

and the heading `{queueTitle(scope, label)}`. `KindChips queue={scope}` already returns null for these queues.

`src/pages/work/WorkInbox.tsx`: before `else body = <MyWorkPage />;` add

```tsx
  else if (isRoutedQueue(queue)) {
    const row = rows.find((candidate) => candidate.key === queue);
    body = <TeamQueue key={queue} scope={queue} label={row?.label ?? ''} canAsk={false} onRefused={refused} />;
  }
```

(import `isRoutedQueue`). The fallback to Mine already covers a key the server does not list.

- [ ] **Step 6: Run them**

Run: `npx vitest run src/features/work src/components/work/useTeamQueue.test.tsx src/pages/work/WorkInbox.test.tsx --maxWorkers=2 && npx tsc -b`
Expected: PASS. The phone select shows "Customer Success (1)" through D1's `optionText`, unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/features/work/queues.ts src/features/work/queues.test.ts src/features/work/teamQueue.ts src/features/work/teamQueue.test.ts src/components/work/useTeamQueue.ts src/components/work/useTeamQueue.test.tsx src/components/work/TeamQueue.tsx src/pages/work/WorkInbox.tsx src/pages/work/WorkInbox.test.tsx
git commit -m "feat(work): department and Unassigned queues in the rail and the inbox

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Where a bundle came from: the panel's source line, the row's channel, "For" a department

**Files:**
- Create: `src/components/work/BundleSource.tsx`
- Modify: `src/features/agents/bundleText.ts`, `src/features/agents/bundleText.test.ts`, `src/components/work/BundlePanel.tsx`, `src/components/work/BundlePanel.test.tsx`, `src/components/work/BundleRow.tsx`, `src/components/work/BundleRow.test.tsx`, `src/components/work/FeedRowParts.tsx`

**Interfaces:**
- Consumes: `BundleSource`, `B_TICKET`, `B_MAIL`, `B_DEPT`, `B_UNASSIGNED`, `timeLabel`, `localDay` (`features/organizations/storyDays.ts`), `formatDate`.
- Produces: `sourceParts(source: BundleSource): string[]`; `whenText(iso: string, now?: Date): string`; `bundleForText(bundle: Bundle): string`; `openInText(label: string): string`; `CHANNEL_ICON: Record<SignalSource, LucideIcon>` (in `FeedRowParts.tsx`); `<BundleSource source={...} />`.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/agents/bundleText.test.ts` (import `B_DEPT, B_MAIL, B_TICKET, B_UNASSIGNED, bundleItem` and `sourceParts, whenText, bundleForText, openInText, routedText`; `timeLabel` from `../organizations/storyDays`):

```ts
describe('where a bundle came from (agent bundles D2 §3.1; Decisions 3, 5)', () => {
  it('names the source, the ticket and the sender, and the message count for mail', () => {
    expect(sourceParts(B_TICKET.source)).toEqual(['Zendesk ZD-1042 from ann@pizzahut.com']);
    expect(sourceParts(B_MAIL.source)).toEqual(['Email from ann@pizzahut.com', '3 messages']);
    expect(sourceParts({ ...B_MAIL.source, messages: 1, from: '' })).toEqual(['Email']);
  });

  it('says the time today and the day and time before', () => {
    const iso = '2026-10-07T09:58:12Z';
    const clock = timeLabel({ occurred_at: iso, all_day: false });
    expect(whenText(iso, new Date(iso))).toBe(clock);
    expect(whenText(iso, new Date('2026-10-20T12:00:00Z'))).toBe(`7 Oct 2026, ${clock}`);
  });

  it('says who a routed bundle is for', () => {
    expect(bundleForText(B_DEPT)).toBe('For Customer Success');
    expect(bundleForText(B_UNASSIGNED)).toBe('Unassigned');
    expect(bundleForText(B_TICKET)).toBe('For Alice');
    expect(openInText('Zendesk')).toBe('Open in Zendesk (opens in a new tab)');
    expect(routedText(bundleItem(B_DEPT, true).detail)).toBe('For Customer Success');
    expect(routedText(bundleItem(B_UNASSIGNED, true).detail)).toBe('Unassigned');
    expect(routedText(bundleItem(B_TICKET).detail)).toBeNull();
  });
});
```

Append to `src/components/work/BundlePanel.test.tsx`:

```ts
  it('says where a message bundle came from and links the ticket in a new tab (Decision 3)', async () => {
    stubBundles({ bundles: [...MESSAGE_BUNDLES] });
    renderWork(`/work?queue=mine&bundle=${B_TICKET.id}`);
    const panel = await screen.findByRole('dialog', { name: B_TICKET.title });
    const line = await within(panel).findByTestId('bundle-source');
    expect(line.textContent).toContain('Zendesk ZD-1042 from ann@pizzahut.com');
    const open = within(line).getByRole('link', { name: 'Open in Zendesk (opens in a new tab)' });
    expect(open).toHaveAttribute('href', 'https://acme.zendesk.com/agent/tickets/1042');
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('says a department bundle is for its department, and a nightly one has no source line', async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES], departments: [{ key: 'cs', label: 'Customer Success' }] });
    renderWork(`/work?queue=department:cs&bundle=${B_DEPT.id}`);
    const panel = await screen.findByRole('dialog', { name: B_DEPT.title });
    expect(await within(panel).findByText('For Customer Success')).toBeInTheDocument();
    expect(within(panel).queryByText('For the whole company')).not.toBeInTheDocument();
  });
```

and a nightly check in the existing first test: after the heading assertion add `expect(within(panel).queryByTestId('bundle-source')).not.toBeInTheDocument();`. Imports: `BUNDLES, B_DEPT, B_TICKET, MESSAGE_BUNDLES`.

Append to `src/components/work/BundleRow.test.tsx`:

```ts
it('shows a message bundle with its channel and source (Decision 4)', () => {
  renderRow(bundleItem(B_TICKET));
  const row = screen.getByRole('article', { name: B_TICKET.title });
  expect(row.closest('li')?.querySelector('[data-channel="zendesk"]')).not.toBeNull();
  expect(within(row).getByText('Zendesk')).toBeInTheDocument();
});
```

(use the file's own render helper; if it renders inline, copy its render call with `bundleItem(B_TICKET)`).

```ts
it('says where a queue row waits from its routed_to and department (Decision 5)', () => {
  renderRow(bundleItem(B_DEPT, true));
  const row = screen.getByRole('article', { name: B_DEPT.title });
  expect(within(row).getByText('For Customer Success')).toBeInTheDocument();
  expect(within(row).queryByText('For the whole company')).not.toBeInTheDocument();
});

it('says Unassigned on an Unassigned queue row', () => {
  renderRow(bundleItem(B_UNASSIGNED, true));
  expect(within(screen.getByRole('article', { name: B_UNASSIGNED.title })).getByText('Unassigned')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/agents/bundleText.test.ts src/components/work/BundlePanel.test.tsx src/components/work/BundleRow.test.tsx --maxWorkers=2`
Expected: FAIL (`sourceParts` missing; no `bundle-source`).

- [ ] **Step 3: The words**

Append to `src/features/agents/bundleText.ts` (import `BundleSource` type, `type BundleFeedItem` from `../work/workTypes`, `formatDate` from `../customers/formatters`, `localDay, timeLabel` from `../organizations/storyDays`, `forText` from `../work/feed`):

```ts
/** The source line's words (Decision 3): "Zendesk ZD-1042 from ann@x.com", then "3 messages" for mail. */
export function sourceParts(source: BundleSource): string[] {
  const head = [source.label, source.ticket].filter(Boolean).join(' ');
  const parts = [source.from ? `${head} from ${source.from}` : head];
  if (source.channel === 'mail' && source.messages > 1) parts.push(`${source.messages} messages`);
  return parts;
}

/** "9:58 AM" today, "7 Oct 2026, 9:58 AM" another day, in the reader's time zone. */
export function whenText(iso: string, now: Date = new Date()): string {
  const clock = timeLabel({ occurred_at: iso, all_day: false });
  const day = localDay(new Date(iso));
  return day === localDay(now) ? clock : `${formatDate(day)}, ${clock}`;
}

/** Who a bundle is for (Decision 5): a department bundle its department, an Unassigned one "Unassigned". */
export function bundleForText(bundle: Bundle): string {
  if (bundle.routed_to === 'department' && bundle.department) return `For ${bundle.department.label}`;
  if (bundle.routed_to === 'admins' && bundle.source.kind === 'thread') return 'Unassigned';
  return forText(bundle.for) ?? '';
}

export const openInText = (label: string): string => `Open in ${label} (opens in a new tab)`;

/** A queue row's routed words (contract §3.3; Decision 5), or null for an owner-routed or nightly row. */
export function routedText(detail: BundleFeedItem['detail']): string | null {
  if (detail.routed_to === 'department' && detail.department) return `For ${detail.department.label}`;
  if (detail.routed_to === 'admins' && detail.source.kind === 'thread') return 'Unassigned';
  return null;
}
```

(`feed.ts` does not import `bundleText.ts`, so there is no cycle; if lint reports one, move `bundleForText` into `features/work/feed.ts` and import it from there.)

- [ ] **Step 4: The icons and the line**

In `src/components/work/FeedRowParts.tsx` add `Hash, Moon, SquareKanban, Ticket` to the lucide import and:

```ts
/** A message bundle's icon by channel (Decision 4); the nightly review keeps the bundle icon. */
export const CHANNEL_ICON: Record<SignalSource, LucideIcon> = {
  mail: Mail,
  slack: Hash,
  zendesk: Ticket,
  freshdesk: Ticket,
  jira: SquareKanban,
  webhook: Ticket,
};
export const NIGHTLY_ICON = Moon;
```

(import `type SignalSource` from `../../features/agents/agentTypes`). Create `src/components/work/BundleSource.tsx`:

```tsx
import { ExternalLink } from 'lucide-react';
import { openInText, sourceParts, whenText } from '../../features/agents/bundleText';
import type { BundleSource as Source } from '../../features/agents/bundleTypes';
import { NUM, TYPE } from '../ui';
import { CHANNEL_ICON, META_LINK } from './FeedRowParts';

/** Where a message bundle came from (spec §8.2; Decision 3): channel, ticket,
 *  sender, message count, when, and the ticket in its own tool. Nothing for
 *  the nightly review, which the meta line already names. */
export function BundleSource({ source }: { source: Source }) {
  if (source.kind !== 'thread' || source.channel === null) return null;
  const Icon = CHANNEL_ICON[source.channel];
  const parts = sourceParts(source);
  return (
    <p data-testid="bundle-source" className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${TYPE.meta}`}>
      <Icon className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      {parts.map((part, index) => (
        <span key={part} className={index > 0 ? NUM : undefined}>
          {index > 0 ? <span aria-hidden="true">· </span> : null}
          {part}
        </span>
      ))}
      {source.last_message_at ? (
        <span className={NUM}>
          <span aria-hidden="true">· </span>
          {whenText(source.last_message_at)}
        </span>
      ) : null}
      {source.link ? (
        <a href={source.link} target="_blank" rel="noopener noreferrer" aria-label={openInText(source.label)} className={`${META_LINK} gap-1`}>
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          {`Open in ${source.label}`}
        </a>
      ) : null}
    </p>
  );
}
```

- [ ] **Step 5: The panel and the row**

`src/components/work/BundlePanel.tsx`: under `{bundle.reason ? … : null}` add `<BundleSource source={bundle.source} />`; in the meta line, replace `<span>{forText(bundle.for)}</span>` with `<span>{bundleForText(bundle)}</span>` and, in the no-record branch, keep `FEED.FOR_COMPANY`. Import `BundleSource` and `bundleForText`; drop `forText` from the import if unused.

`src/components/work/BundleRow.tsx`: replace `const Icon = KIND_ICON.bundle;` with

```tsx
  const channel = item.detail.source.channel;
  const Icon = channel ? CHANNEL_ICON[channel] : KIND_ICON.bundle;
```

give the icon `data-channel={channel ?? undefined}`, and pass `extra={<><span>{channel ? item.detail.source.label : null}</span>{channel ? <span aria-hidden="true"> · </span> : null}<span className={NUM}>{stepCountText(d.step_count)}</span></>}` to `FeedRowMeta` (the source label sits before the step count). Import `CHANNEL_ICON`. A routed row says where it waits from `detail.routed_to` and `detail.department` (Decision 5), in place of `forText`'s part:

```tsx
  const routed = routedText(item.detail);
  const shown = routed ? { ...item, for: undefined } : item;
```

render `<FeedRowMeta item={shown} … />` (`forText(undefined)` returns null) and put `{routed ? <span data-part="for">{routed}</span> : null}` first inside `extra`, with its own ` · ` separator. Import `routedText`.

- [ ] **Step 6: Run them**

Run: `npx vitest run src/features/agents src/components/work --maxWorkers=2 && npx tsc -b`
Expected: PASS. The work house rules pass (the new link uses `META_LINK`, which includes `INLINE_TARGET`).

- [ ] **Step 7: Commit**

```bash
git add src/components/work/BundleSource.tsx src/features/agents/bundleText.ts src/features/agents/bundleText.test.ts src/components/work/BundlePanel.tsx src/components/work/BundlePanel.test.tsx src/components/work/BundleRow.tsx src/components/work/BundleRow.test.tsx src/components/work/FeedRowParts.tsx
git commit -m "feat(work): a message bundle's source line, channel icons and who a routed bundle is for

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Edits saved as they are made

**Files:**
- Modify: `src/features/agents/bundleText.ts`, `src/features/agents/bundleText.test.ts`, `src/components/work/BundlePanel.tsx`, `src/components/work/BundlePanel.test.tsx`, `src/components/work/BundleStep.tsx`

**Interfaces:**
- Consumes: `saveStep`, `StepSave`, `readRunRefusal`, `stubBundles({ refuseNextSave })`.
- Produces: `stepSave(step: BundleStep, entry: Draft[number] | undefined, { tick }: { tick: boolean }): StepSave | null`; `BUNDLE.SAVING`, `BUNDLE.SAVED`, `BUNDLE.EDITED`, `BUNDLE.SAVE_FAILED`; `BundleStep` props gain `onLeave?: () => void`, `saving?: 'saving' | 'saved' | null`.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/agents/bundleText.test.ts`:

```ts
describe('saving a step (agent bundles D2 §4.1; Decision 6)', () => {
  const s = B_TICKET.steps[1];
  it('sends only changed fields, or the tick when it changed', () => {
    expect(stepSave(s, { selected: true, fields: { ...s.fields } }, { tick: false })).toBeNull();
    expect(stepSave(s, { selected: true, fields: { ...s.fields, title: 'Fix it today' } }, { tick: false })).toEqual({ fields: { title: 'Fix it today' } });
    expect(stepSave(s, { selected: false, fields: { ...s.fields } }, { tick: true })).toEqual({ selected: false });
    expect(stepSave({ ...s, status: 'failed' }, { selected: true, fields: { title: 'x' } }, { tick: false })).toBeNull();
  });
});
```

Change the existing run test in `src/components/work/BundlePanel.test.tsx` ("runs the ticked steps with only the changed fields…"): the title edit is saved when the tick is clicked, so the run body carries no fields. Replace its `sentRuns` assertion with:

```ts
    expect(sentSaves(spy)).toEqual([
      { step: 41, body: { fields: { title: 'Call today' } } },
      { step: 42, body: { selected: false } },
    ]);
    expect(sentRuns(spy)).toEqual([{ steps: [{ id: 41, selected: true }, { id: 42, selected: false }, { id: 43, selected: false }] }]);
```

with, beside `sentRuns`:

```ts
const sentSaves = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')
    .map(([url, init]) => ({ step: Number(/steps\/(\d+)\//.exec(String(url))?.[1]), body: JSON.parse(String((init as RequestInit).body)) }));
```

Replace the test "asks before throwing edits away, and closes back to the Review button on Discard" with:

```ts
  it('saves unsaved edits when it closes, then closes back to the Review button (Decision 7)', async () => {
    const { spy } = stubBundles();
    renderWork('/work?queue=mine');
    await userEvent.click(await screen.findByRole('link', { name: `Review ${B_PIZZA.title}` }));
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    await userEvent.type(await within(panel).findByLabelText('Title'), ' now');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sentSaves(spy)).toEqual([{ step: 41, body: { fields: { title: 'Call Pizza Hut about the renewal now' } } }]);
    expect(screen.getByRole('link', { name: `Review ${B_PIZZA.title}` })).toHaveFocus();
  });

  it('asks before closing when the save on close fails, showing why', async () => {
    stubBundles({ refuseNextSave: { status: 400, body: { steps: { 41: { title: ['Give the task a title.'] } } } } });
    renderWork('/work?queue=mine&bundle=12');
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    await userEvent.clear(await within(panel).findByLabelText('Title'));
    await userEvent.keyboard('{Escape}');
    expect(await within(panel).findByText('Give the task a title.')).toBeInTheDocument();
    expect(within(panel).getByText('Discard your edits?')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Keep editing' })).toHaveFocus();
  });

  it('saves a field when focus leaves its step, says Saved, and marks the step edited', async () => {
    const { spy } = stubBundles();
    renderWork('/work?queue=mine&bundle=12');
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    const title = await within(panel).findByLabelText('Title');
    await userEvent.type(title, ' soon');
    await userEvent.click(within(panel).getByRole('heading', { name: B_PIZZA.title }));
    const step = within(panel).getByTestId('step-41');
    expect(await within(step).findByText('Saved.')).toBeInTheDocument();
    expect(within(step).getByText('Edited')).toBeInTheDocument();
    expect(sentSaves(spy)).toEqual([{ step: 41, body: { fields: { title: 'Call Pizza Hut about the renewal soon' } } }]);
  });
```

Delete the test "returns focus to Run, not the page, when Keep editing goes back to the steps" (its path no longer exists for a waiting bundle: closing saves). Keep "asks before throwing away edits to a failed step of a partly done bundle" unchanged (Decision 7).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/agents/bundleText.test.ts src/components/work/BundlePanel.test.tsx --maxWorkers=2`
Expected: FAIL (`stepSave` missing; no PATCH sent; the discard bar shows on Escape).

- [ ] **Step 3: The rule and the words**

In `src/features/agents/bundleText.ts` add to `BUNDLE`: `SAVING: 'Saving…', SAVED: 'Saved.', EDITED: 'Edited', SAVE_FAILED: 'Could not save this step. Try again.',` and:

```ts
/** What PATCH /agents/bundles/<id>/steps/<step>/ sends for one step (contract §4.1; Decision 6):
 *  its changed fields, or its tick when `tick`; null when there is nothing to save. */
export function stepSave(step: BundleStep, entry: Draft[number] | undefined, { tick }: { tick: boolean }): StepSave | null {
  if (!entry || !runnable(step)) return null;
  if (tick) return entry.selected === step.selected ? null : { selected: entry.selected };
  const fields = changedFields(step, entry.fields);
  return Object.keys(fields).length > 0 ? { fields } : null;
}
```

(import `StepSave`).

- [ ] **Step 4: The panel saves**

In `src/components/work/BundlePanel.tsx`:

1. State and the save function, after `const [retrying, …]`:

```tsx
  const [saving, setSaving] = useState<Record<number, 'saving' | 'saved' | null>>({});
  const savedTimer = useRef<number | null>(null);

  /** Save one step (Decision 6). Returns false when the server refused it. */
  async function saveIt(stepId: number, tick: boolean, entry?: Draft[number]): Promise<boolean> {
    if (!bundle || bundle.status !== 'waiting') return true;
    const step = bundle.steps.find((candidate) => candidate.id === stepId);
    const body = step ? stepSave(step, entry ?? current?.[stepId], { tick }) : null;
    if (!step || !body) return true;
    setSaving((prev) => ({ ...prev, [stepId]: 'saving' }));
    try {
      const answer = await saveStep(bundle.id, stepId, body);
      load.replace(answer.bundle);
      // The saved step now matches the server; other steps keep their unsaved edits.
      setDraft((prev) => (prev ? { ...prev, [stepId]: draftOf(answer.bundle)[stepId] } : null));
      setRefusal((prev) => (prev.fields[stepId] ? { ...prev, fields: { ...prev.fields, [stepId]: {} } } : prev));
      setSaving((prev) => ({ ...prev, [stepId]: 'saved' }));
      if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setSaving((prev) => ({ ...prev, [stepId]: null })), 4000);
      return true;
    } catch (err) {
      setSaving((prev) => ({ ...prev, [stepId]: null }));
      const read = readRunRefusal(err, BUNDLE.SAVE_FAILED);
      if (read.lost) load.lose();
      else {
        if (read.bundle) take(read.bundle);
        setRefusal(read);
      }
      return false;
    }
  }
  useEffect(() => () => {
    if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
  }, []);
```

(import `saveStep` and `stepSave`).

2. `requestClose` saves first while the bundle waits:

```tsx
  const requestClose = async () => {
    if (mode === 'discard') return;
    if (mode === 'reject' && rejectDirty) {
      setBackTo('reject');
      setMode('discard');
      return;
    }
    if (bundle && current && isDirty(bundle, current)) {
      if (bundle.status === 'waiting') {
        const results = await Promise.all(bundle.steps.map((s) => saveIt(s.id, false)));
        const ticks = await Promise.all(bundle.steps.map((s) => saveIt(s.id, true)));
        if ([...results, ...ticks].every(Boolean)) return onClose();
      }
      setBackTo('run');
      setMode('discard');
      return;
    }
    onClose();
  };
```

and pass `onClose={() => void requestClose()}` to `Sheet`.

3. In the steps map, give `BundleStep` the new props:

```tsx
                saving={saving[step.id] ?? null}
                onLeave={() => void saveIt(step.id, false)}
                onToggle={(selected) => {
                  const entry = { ...current[step.id], selected };
                  edit(step.id, () => entry);
                  void saveIt(step.id, true, entry);
                }}
```

(replacing the old `onToggle`).

4. `runBody` already sends only fields that differ from the bundle as last answered, which after a save are none.

- [ ] **Step 5: The step**

In `src/components/work/BundleStep.tsx`: props gain `saving?: 'saving' | 'saved' | null; onLeave?: () => void;`. Wrap the fields:

```tsx
      {(live && entry.selected && step.can_run) || (editing && step.status === 'failed') ? (
        <div
          onBlur={(event) => {
            // Saved when focus leaves this step's fields, not between them.
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onLeave?.();
          }}
        >
          <BundleStepFields bundle={bundle} step={step} fields={entry.fields} errors={errors} onField={onField} />
        </div>
      ) : null}
      {live ? (
        <p role="status" className={`${TYPE.meta} empty:sr-only`}>
          {saving === 'saving' ? BUNDLE.SAVING : saving === 'saved' ? BUNDLE.SAVED : null}
        </p>
      ) : null}
```

and after the heading (inside the title column), when `step.edited && step.status === 'proposed'`: `<p className={TYPE.meta}>{BUNDLE.EDITED}</p>`.

- [ ] **Step 6: Run them**

Run: `npx vitest run src/features/agents/bundleText.test.ts src/components/work/BundlePanel.test.tsx src/e2e/bundles.test.tsx --maxWorkers=2 && npx tsc -b`
Expected: PASS. If `src/e2e/bundles.test.tsx` asserted the run body's fields, update it as Step 1 did (the save carries them).

- [ ] **Step 7: Commit**

```bash
git add src/features/agents/bundleText.ts src/features/agents/bundleText.test.ts src/components/work/BundlePanel.tsx src/components/work/BundlePanel.test.tsx src/components/work/BundleStep.tsx src/e2e/bundles.test.tsx
git commit -m "feat(work): the bundle panel saves edits as they are made

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: "New message since you edited" and Refresh suggestions

**Files:**
- Create: `src/components/work/NewerMessage.tsx`
- Modify: `src/features/agents/bundleText.ts`, `src/components/work/BundlePanel.tsx`, `src/components/work/BundlePanel.test.tsx`

**Interfaces:**
- Consumes: `refreshBundle`, `B_MAIL`, `stubBundles({ refuseNextRefresh })`, `readRunRefusal`, `useSubmitOnce`.
- Produces: `BUNDLE.NEWER`, `BUNDLE.REFRESH`, `BUNDLE.REFRESHING`, `BUNDLE.REFRESHED`, `BUNDLE.REFRESH_FAILED`; `<NewerMessage canRefresh busy onRefresh />`.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/work/BundlePanel.test.tsx` (import `B_MAIL`):

```ts
  it('shows the newer-message banner and refreshes, keeping the edited step (Decision 9)', async () => {
    const { spy } = stubBundles({ bundles: [...MESSAGE_BUNDLES] });
    renderWork(`/work?queue=mine&bundle=${B_MAIL.id}`);
    const panel = await screen.findByRole('dialog', { name: B_MAIL.title });
    const banner = await within(panel).findByTestId('newer-message');
    expect(banner).toHaveTextContent('New message since you edited');
    const refresh = within(banner).getByRole('button', { name: 'Refresh suggestions' });
    expect(refresh.className).not.toContain('bg-accent');
    await userEvent.click(refresh);
    expect(await within(panel).findByText('Suggestions refreshed.')).toHaveFocus();
    expect(within(panel).queryByTestId('newer-message')).not.toBeInTheDocument();
    expect(within(panel).getByTestId('step-211')).toBeInTheDocument();
    expect(within(panel).queryByTestId('step-212')).not.toBeInTheDocument();
    expect(within(panel).getByTestId('step-290')).toBeInTheDocument();
    expect(spy.mock.calls.filter(([url]) => String(url).endsWith('/agents/bundles/21/refresh/'))).toHaveLength(1);
  });

  it('shows a refresh refusal verbatim and keeps the banner', async () => {
    stubBundles({ bundles: [...MESSAGE_BUNDLES], refuseNextRefresh: { status: 409, body: { code: 'BUDGET_USED', detail: "This agent's budget is used up: it resumes on 1 Nov.", resets_on: '2026-11-01' } } });
    renderWork(`/work?queue=mine&bundle=${B_MAIL.id}`);
    const panel = await screen.findByRole('dialog', { name: B_MAIL.title });
    await userEvent.click(await within(panel).findByRole('button', { name: 'Refresh suggestions' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent("This agent's budget is used up: it resumes on 1 Nov.");
    expect(within(panel).getByTestId('newer-message')).toBeInTheDocument();
  });

  it('shows NO_READER verbatim (contract §4.2)', async () => {
    stubBundles({ bundles: [...MESSAGE_BUNDLES], refuseNextRefresh: { status: 409, body: { code: 'NO_READER', detail: 'Nobody this bundle is for may read its message any more.' } } });
    renderWork(`/work?queue=mine&bundle=${B_MAIL.id}`);
    const panel = await screen.findByRole('dialog', { name: B_MAIL.title });
    await userEvent.click(await within(panel).findByRole('button', { name: 'Refresh suggestions' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Nobody this bundle is for may read its message any more.');
  });

  it('takes the fresh bundle when it changed while refreshing', async () => {
    const changed = { ...B_MAIL, has_newer_message: false, steps: [B_MAIL.steps[0]] };
    stubBundles({ bundles: [...MESSAGE_BUNDLES], refuseNextRefresh: { status: 409, body: { code: 'BUNDLE_CHANGED', detail: 'This bundle changed while it refreshed. Review it again.', bundle: changed } } });
    renderWork(`/work?queue=mine&bundle=${B_MAIL.id}`);
    const panel = await screen.findByRole('dialog', { name: B_MAIL.title });
    await userEvent.click(await within(panel).findByRole('button', { name: 'Refresh suggestions' }));
    expect(await within(panel).findByText('This bundle changed while it refreshed. Review it again.')).toBeInTheDocument();
    expect(within(panel).queryByTestId('step-212')).not.toBeInTheDocument();
  });

  it('shows a run against replaced steps as the server says, with the fresh bundle (Decision 10)', async () => {
    const fresh = { ...B_MAIL, has_newer_message: false, refreshed_at: '2026-10-07T10:00:00Z' };
    stubBundles({ bundles: [...MESSAGE_BUNDLES], refuseNextRun: { status: 409, body: { code: 'BUNDLE_REFRESHED', detail: 'This bundle was updated with a newer message. Review it again.', bundle: fresh } } });
    renderWork(`/work?queue=mine&bundle=${B_MAIL.id}`);
    const panel = await screen.findByRole('dialog', { name: B_MAIL.title });
    await userEvent.click(await within(panel).findByRole('button', { name: /^Run \d selected$/ }));
    expect(await within(panel).findByText('This bundle was updated with a newer message. Review it again.')).toBeInTheDocument();
    expect(within(panel).queryByTestId('newer-message')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/work/BundlePanel.test.tsx --maxWorkers=2`
Expected: FAIL (no `newer-message`).

- [ ] **Step 3: The words and the banner**

In `BUNDLE` (`bundleText.ts`) add: `NEWER: 'New message since you edited', REFRESH: 'Refresh suggestions', REFRESHING: 'Refreshing…', REFRESHED: 'Suggestions refreshed.', REFRESH_FAILED: "Couldn't refresh the suggestions. Try again.",`.

Create `src/components/work/NewerMessage.tsx`:

```tsx
import { MailWarning } from 'lucide-react';
import { BUNDLE } from '../../features/agents/bundleText';
import { BUTTON, TYPE } from '../ui';

/** Spec §4.3, §8.2 (Decision 9): a newer message arrived after someone
 *  edited this bundle. Refresh suggestions asks the agent again; edited
 *  steps stay. Bordered, never the primary: Run stays the one primary. */
export function NewerMessage({ canRefresh, busy, onRefresh }: { canRefresh: boolean; busy: boolean; onRefresh: () => void }) {
  return (
    <div data-testid="newer-message" role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-4 py-3">
      <MailWarning className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <p className={`${TYPE.body} min-w-0 flex-1`}>{BUNDLE.NEWER}</p>
      {canRefresh ? (
        <button type="button" onClick={onRefresh} aria-disabled={busy || undefined} className={BUTTON}>
          {busy ? BUNDLE.REFRESHING : BUNDLE.REFRESH}
        </button>
      ) : null}
    </div>
  );
}
```

(If `border-line` is not the house border token, use the token `Card` uses: grep `border-` in `src/components/ui/Card.tsx`.)

- [ ] **Step 4: The panel refreshes**

In `src/components/work/BundlePanel.tsx` add a second `useSubmitOnce` and the handler (import `refreshBundle`, `NewerMessage`):

```tsx
  const refreshing = useSubmitOnce();

  async function refreshIt() {
    if (!bundle || refreshing.busy) return;
    setRefusal(NO_REFUSAL);
    const outcome = await refreshing.run(() => refreshBundle(bundle.id));
    if (!outcome) return;
    feedChanged();
    if (outcome.ok) {
      take(outcome.value.bundle);
      say(BUNDLE.REFRESHED);
      return;
    }
    const read = readRunRefusal(outcome.error, BUNDLE.REFRESH_FAILED);
    if (read.lost) load.lose();
    else {
      if (read.bundle) take(read.bundle);
      setRefusal(read);
    }
  }
```

and in the body, right after the refusal alert:

```tsx
        {bundle.status === 'waiting' && bundle.has_newer_message ? <NewerMessage canRefresh={bundle.can_refresh} busy={refreshing.busy} onRefresh={() => void refreshIt()} /> : null}
```

`readRunRefusal` already turns a 429 `{detail}` and a 503 `{code, detail}` into the form alert.

- [ ] **Step 5: Run them**

Run: `npx vitest run src/components/work --maxWorkers=2 && npx tsc -b`
Expected: PASS; the work house rules keep `BundlePanel.tsx` as the only primary owner.

- [ ] **Step 6: Commit**

```bash
git add src/components/work/NewerMessage.tsx src/features/agents/bundleText.ts src/components/work/BundlePanel.tsx src/components/work/BundlePanel.test.tsx
git commit -m "feat(work): the newer-message banner and Refresh suggestions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: History says who rejected a bundle

**Files:**
- Modify: `src/features/agents/bundleText.ts`, `src/features/agents/bundleText.test.ts`, `src/features/agents/testBundleFixtures.ts`, `src/pages/work/History.test.tsx`

**Interfaces:**
- Consumes: `Bundle.rejected_by`.
- Produces: `finishedByText` reads `rejected_by` first for a rejected bundle.

- [ ] **Step 1: Write the failing tests**

In `src/features/agents/bundleText.test.ts`, replace the two rejected lines in the `finishedByText` test with:

```ts
    expect(finishedByText({ ...B_REJECTED, rejected_by: null })).toBeNull();
    expect(finishedByText(B_REJECTED)).toBe('Rejected by Carl CSM');
    expect(finishedByText({ ...B_REJECTED, rejected_by: null, run_by: { id: 1, name: 'Alice' } })).toBe('Rejected by Alice');
```

In `src/features/agents/testBundleFixtures.ts`, give `B_REJECTED` `rejected_by: CARL`. Append to `src/pages/work/History.test.tsx`:

```ts
  it('says who rejected a bundle (agent bundles D2-28)', async () => {
    stubBundles();
    renderWork('/work?queue=history&status=rejected');
    const row = await screen.findByRole('heading', { name: B_REJECTED.title });
    expect(row.closest('li')?.textContent).toContain('Rejected by Carl CSM');
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/agents/bundleText.test.ts src/pages/work/History.test.tsx --maxWorkers=2`
Expected: FAIL (`finishedByText(B_REJECTED)` is null).

- [ ] **Step 3: The rule**

In `finishedByText` replace the rejected line with:

```ts
  if (bundle.status === 'rejected') {
    const who = bundle.rejected_by ?? bundle.run_by;
    return who ? `${HISTORY.REJECTED_BY} ${who.name}` : null;
  }
```

and update its comment: "rejected: `rejected_by` (contract D2-28), else `run_by`".

- [ ] **Step 4: Run them**

Run: `npx vitest run src/features/agents src/pages/work/History.test.tsx --maxWorkers=2 && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/agents/bundleText.ts src/features/agents/bundleText.test.ts src/features/agents/testBundleFixtures.ts src/pages/work/History.test.tsx
git commit -m "feat(work): History names who rejected a bundle

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Settings › Agents › Reading messages

**Files:**
- Create: `src/components/agents/MessageSources.tsx`, `src/components/agents/MessageSources.test.tsx`
- Modify: `src/features/agents/agentsText.ts`, `src/features/agents/agentsText.test.ts`, `src/features/agents/agentsApi.ts`, `src/components/agents/AgentsForm.tsx`, `src/components/agents/AgentsSummary.tsx`, `src/pages/settings/AgentsSettingsPage.test.tsx`

**Interfaces:**
- Consumes: `SignalSettings`, `patchAgentSettings`, `useInstantSave`, `SettingsSection`, `SettingsRow`, `Switch`, `Select`, `SettingsUpdate`.
- Produces: `SIGNALS_TEXT` (words), `lastReadText(at: string | null): string`; `readSignalRefusal(err: unknown): { interval: string | null; sources: Partial<Record<SignalSource, string>>; form: string | null }`; `<MessageSources settings onSaved />` (editable) and `<MessageSourcesSummary settings />`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/agents/MessageSources.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AGENT_SETTINGS } from '../../features/agents/testAgentsFixtures';
import { calls, stubAgents } from '../../features/agents/testAgents';
import { renderPage } from '../../pages/work/testPages';
import { AgentsSettingsPage } from '../../pages/settings/AgentsSettingsPage';
import { resetViewport } from '../../test/viewport';

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
});

describe('Settings › Agents › Reading messages (agent bundles D2 §4.8; Decision 12)', () => {
  it('shows how often and each source, marking the unconnected ones', async () => {
    stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const section = await screen.findByRole('region', { name: 'Reading messages' });
    expect(within(section).getByLabelText('How often')).toHaveValue('1h');
    expect(within(section).getByRole('switch', { name: 'Email filed to a customer' })).toBeChecked();
    expect(within(section).getByRole('switch', { name: 'Webhooks' })).not.toBeChecked();
    expect(within(section).getAllByText('Not connected')).toHaveLength(4);
    expect(within(section).getByText(/^Last read/)).toBeInTheDocument();
  });

  it('saves the interval and a source at once, with Undo', async () => {
    const { spy } = stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const section = await screen.findByRole('region', { name: 'Reading messages' });
    await userEvent.selectOptions(within(section).getByLabelText('How often'), '4h');
    await waitFor(() => expect(within(section).getByLabelText('How often')).toHaveValue('4h'));
    await userEvent.click(within(section).getByRole('switch', { name: 'Slack' }));
    await waitFor(() => expect(within(section).getByRole('switch', { name: 'Slack' })).not.toBeChecked());
    const patches = calls(spy, 'PATCH', '/agents/settings/').map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(patches).toEqual([{ signal_interval: '4h' }, { signal_sources: { slack: false } }]);
  });

  it('shows the values as text to a member', async () => {
    stubAgents({ settings: { ...AGENT_SETTINGS, can_edit: false } });
    renderPage(<AgentsSettingsPage />, '/settings/agents', { role: 'csm' });
    const section = await screen.findByRole('region', { name: 'Reading messages' });
    expect(within(section).getByText('Every hour')).toBeInTheDocument();
    expect(within(section).queryByRole('switch')).not.toBeInTheDocument();
    expect(within(section).getByText('Slack: on · Not connected')).toBeInTheDocument();
  });
});
```

(Use `calls` as `AgentsSettingsPage.test.tsx` imports it; if its signature is `calls(spy, method, path)` returning call tuples, the map above holds; otherwise follow that file's `sent(...)` helper. If `renderPage`'s role option has no `'csm'`, use the value `AgentsSettingsPage.test.tsx` uses for a member.)

Append to `src/features/agents/agentsText.test.ts`:

```ts
it('says when agents last read messages (Decision 12)', () => {
  expect(lastReadText(null)).toBe('Not read yet.');
  expect(lastReadText('2026-10-08T09:00:02Z')).toMatch(/^Last read /);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/agents/MessageSources.test.tsx src/features/agents/agentsText.test.ts --maxWorkers=2`
Expected: FAIL (no region "Reading messages").

- [ ] **Step 3: Words and the refusal reader**

In `src/features/agents/agentsText.ts` (import `whenText` from `./bundleText`):

```ts
export const SIGNALS_TEXT = {
  TITLE: 'Reading messages',
  HINT: 'Agents read new customer messages on this schedule, after a conversation has been quiet for 15 minutes. Each conversation read uses AI credits.',
  INTERVAL: 'How often',
  NOT_CONNECTED: 'Not connected',
  ON: 'on',
  OFF: 'off',
  SAVE_FAILED: 'Could not save that. Try again.',
} as const;

export const lastReadText = (at: string | null): string => (at ? `Last read ${whenText(at)}` : 'Not read yet.');
```

In `src/features/agents/agentsApi.ts`:

```ts
/** A signals refusal (contract §4.8), read for the Reading messages section. */
export function readSignalRefusal(err: unknown, fallback: string): { interval: string | null; sources: Partial<Record<SignalSource, string>>; form: string | null } {
  const out = { interval: null as string | null, sources: {} as Partial<Record<SignalSource, string>>, form: null as string | null };
  if (!(err instanceof ApiError) || !isObject(err.body)) return { ...out, form: fallback };
  out.interval = first(err.body.signal_interval);
  const whole = first(err.body.signal_sources);
  if (whole) return { ...out, form: whole };
  if (isObject(err.body.signal_sources)) {
    for (const [key, value] of Object.entries(err.body.signal_sources)) {
      const message = first(value);
      if (message) out.sources[key as SignalSource] = message;
    }
  }
  if (out.interval || Object.keys(out.sources).length > 0) return out;
  return { ...out, form: typeof err.body.detail === 'string' ? err.body.detail : fallback };
}
```

(import `SignalSource`).

- [ ] **Step 4: The section**

Create `src/components/agents/MessageSources.tsx`:

```tsx
import { useId, useState } from 'react';
import { patchAgentSettings, readSignalRefusal } from '../../features/agents/agentsApi';
import { SIGNALS_TEXT, lastReadText } from '../../features/agents/agentsText';
import type { AgentSettings, AgentSettingsPatch, SignalSource } from '../../features/agents/agentTypes';
import type { SettingsUpdate } from '../../pages/settings/AgentSettingsFrame';
import { FORM_ALERT, Select, SettingsRow, SettingsSection, Switch, TYPE, useInstantSave } from '../ui';

type Refusal = ReturnType<typeof readSignalRefusal>;
const NONE: Refusal = { interval: null, sources: {}, form: null };

/** Settings › Agents › Reading messages for an admin (spec §4.3, §4.4;
 *  Decision 12): how often agents read messages and which sources they
 *  read, each saved at once with Undo. */
export function MessageSources({ settings, onSaved }: { settings: AgentSettings; onSaved: (next: SettingsUpdate) => void }) {
  const ids = useId();
  const instant = useInstantSave();
  const [refusal, setRefusal] = useState<Refusal>(NONE);
  const signals = settings.signals;
  const save = (key: string, patch: AgentSettingsPatch, back: AgentSettingsPatch) => {
    setRefusal(NONE);
    void instant.run({
      key,
      request: () => patchAgentSettings(patch),
      onSaved: (next: AgentSettings) => onSaved(next),
      undo: () => patchAgentSettings(back),
      onUndone: (next: AgentSettings) => onSaved(next),
      onError: (error) => setRefusal(readSignalRefusal(error, SIGNALS_TEXT.SAVE_FAILED)),
    });
  };
  const intervalId = `${ids}-interval`;
  return (
    <SettingsSection title={SIGNALS_TEXT.TITLE}>
      <SettingsRow label={SIGNALS_TEXT.INTERVAL} htmlFor={intervalId} hint={SIGNALS_TEXT.HINT} hintId={`${intervalId}-hint`} error={refusal.interval || undefined} errorId={`${intervalId}-error`}>
        <Select
          id={intervalId}
          label={SIGNALS_TEXT.INTERVAL}
          labelPosition="external"
          value={signals.interval}
          invalid={Boolean(refusal.interval)}
          describedBy={refusal.interval ? `${intervalId}-hint ${intervalId}-error` : `${intervalId}-hint`}
          onChange={(value) => save('signal_interval', { signal_interval: value as AgentSettings['signals']['interval'] }, { signal_interval: signals.interval })}
          options={signals.intervals}
          className="sm:w-56"
        />
      </SettingsRow>
      {signals.sources.map((source) => {
        const error = refusal.sources[source.key as SignalSource];
        const hintId = `${ids}-${source.key}-hint`;
        return (
          <SettingsRow key={source.key} label={source.label} hint={source.connected ? undefined : SIGNALS_TEXT.NOT_CONNECTED} hintId={hintId} error={error || undefined} errorId={`${hintId}-error`}>
            <Switch
              checked={source.enabled}
              busy={instant.busyKey === source.key}
              label={source.label}
              describedBy={[source.connected ? null : hintId, error ? `${hintId}-error` : null].filter(Boolean).join(' ') || undefined}
              onChange={(next) => save(source.key, { signal_sources: { [source.key]: next } }, { signal_sources: { [source.key]: source.enabled } })}
            />
          </SettingsRow>
        );
      })}
      <p className={`px-4 py-3 ${TYPE.meta}`}>{lastReadText(signals.last_run_at)}</p>
      {refusal.form ? (
        <p role="alert" className={`px-4 pb-3 ${FORM_ALERT}`}>
          {refusal.form}
        </p>
      ) : null}
    </SettingsSection>
  );
}

/** The same values as text, for a member (Decision 12). */
export function MessageSourcesSummary({ settings }: { settings: AgentSettings }) {
  const signals = settings.signals;
  const interval = signals.intervals.find((option) => option.value === signals.interval)?.label ?? signals.interval;
  return (
    <SettingsSection title={SIGNALS_TEXT.TITLE}>
      <SettingsRow label={SIGNALS_TEXT.INTERVAL}>
        <p className={TYPE.body}>{interval}</p>
      </SettingsRow>
      {signals.sources.map((source) => (
        <SettingsRow key={source.key} label={source.label}>
          <p className={TYPE.body}>{`${source.label}: ${source.enabled ? SIGNALS_TEXT.ON : SIGNALS_TEXT.OFF}${source.connected ? '' : ` · ${SIGNALS_TEXT.NOT_CONNECTED}`}`}</p>
        </SettingsRow>
      ))}
      <p className={`px-4 py-3 ${TYPE.meta}`}>{lastReadText(signals.last_run_at)}</p>
    </SettingsSection>
  );
}
```

(Check `SettingsSection`'s padding convention in `AgentsForm`: rows carry their own padding; the meta paragraph's `px-4 py-3` matches `AgentCard`'s inner block.)

- [ ] **Step 5: Mount it**

`AgentsForm.tsx`: after `{settings.ai_enabled ? null : <AiOffNotice />}` insert `<MessageSources settings={settings} onSaved={onSaved} />`. `AgentsSummary.tsx`: at the same place `<MessageSourcesSummary settings={settings} />`. In `AgentsSettingsPage.test.tsx`, any assertion on the count or order of `region`s gains the new section after "Workspace AI".

- [ ] **Step 6: Run them**

Run: `npx vitest run src/components/agents src/features/agents src/pages/settings/AgentsSettingsPage.test.tsx --maxWorkers=2 && npx tsc -b`
Expected: PASS; the agents house rules pass (tokens, sizes, targets).

- [ ] **Step 7: Commit**

```bash
git add src/components/agents/MessageSources.tsx src/components/agents/MessageSources.test.tsx src/features/agents/agentsText.ts src/features/agents/agentsText.test.ts src/features/agents/agentsApi.ts src/components/agents/AgentsForm.tsx src/components/agents/AgentsSummary.tsx src/pages/settings/AgentsSettingsPage.test.tsx
git commit -m "feat(agents): Settings › Agents reads messages on a schedule, with a switch per source

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The credits note on an agent's card

**Files:**
- Modify: `src/features/agents/agentsText.ts`, `src/features/agents/agentsText.test.ts`, `src/components/agents/AgentCard.tsx`, `src/pages/settings/AgentsSettingsPage.test.tsx`

**Interfaces:**
- Consumes: `AgentCard.waiting_threads`, `waiting_reason`, `resets_on`.
- Produces: `waitingText(card: AgentCard): string | null`.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/agents/agentsText.test.ts` (import `CARDS`, `waitingText`):

```ts
it('says how many conversations wait on credits (agent bundles D2-23; Decision 13)', () => {
  expect(waitingText(CARDS[0])).toBeNull();
  expect(waitingText({ ...CARDS[0], waiting_threads: 3, waiting_reason: 'budget' })).toBe("3 conversations are waiting: this agent's credits are used up until 1 Nov 2026.");
  expect(waitingText({ ...CARDS[0], waiting_threads: 1, waiting_reason: 'credits' })).toBe('1 conversation is waiting: the workspace is out of AI credits.');
});
```

Append to `src/pages/settings/AgentsSettingsPage.test.tsx`:

```ts
  it('says on the card when conversations wait on credits', async () => {
    stubAgents({ settings: { ...AGENT_SETTINGS, agents: AGENT_SETTINGS.agents.map((card) => (card.kind === 'cs' ? { ...card, waiting_threads: 3, waiting_reason: 'budget' as const } : card)) } });
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const cs = await screen.findByRole('region', { name: 'CS agent' });
    expect(within(cs).getByText(sentence("3 conversations are waiting: this agent's credits are used up until 1 Nov 2026."))).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Sales agent' })).queryByText(/conversations? (are|is) waiting/)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/agents/agentsText.test.ts src/pages/settings/AgentsSettingsPage.test.tsx --maxWorkers=2`
Expected: FAIL (`waitingText` missing).

- [ ] **Step 3: The words and the card**

In `agentsText.ts`:

```ts
/** Contract D2-23: conversations the agent would read, waiting on credits. */
export function waitingText(card: AgentCard): string | null {
  const n = card.waiting_threads;
  if (!n || !card.waiting_reason) return null;
  const head = n === 1 ? '1 conversation is waiting' : `${n} conversations are waiting`;
  const why = card.waiting_reason === 'budget' ? `this agent's credits are used up until ${formatDate(card.resets_on)}` : 'the workspace is out of AI credits';
  return `${head}: ${why}.`;
}
```

In `AgentCard.tsx`, after the budget paragraph:

```tsx
        {waitingText(card) ? (
          <p className={`${TYPE.meta} text-danger-ink`}>
            <Figured text={waitingText(card) as string} />
          </p>
        ) : null}
```

(import `waitingText`).

- [ ] **Step 4: Run them**

Run: `npx vitest run src/features/agents src/components/agents src/pages/settings/AgentsSettingsPage.test.tsx --maxWorkers=2 && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/agents/agentsText.ts src/features/agents/agentsText.test.ts src/components/agents/AgentCard.tsx src/pages/settings/AgentsSettingsPage.test.tsx
git commit -m "feat(agents): an agent's card says when conversations wait on credits

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: "Save as draft only" arrives on

**Files:**
- Modify: `src/features/agents/testBundleFixtures.ts`, `src/components/work/BundlePanel.test.tsx`

**Interfaces:**
- Consumes: contract D2-29 (no code change: `showsCantUndo` already follows the field).

- [ ] **Step 1: The fixtures follow the server**

In `testBundleFixtures.ts`, `B_CAMPAIGN` step 51 and `B_SURVEY` step 61: `draft_only: true` in `fields`.

- [ ] **Step 2: The panel tests follow**

In `BundlePanel.test.tsx`:
- "marks a send Can't be undone until Save as draft only is on…" becomes "marks a send Can't be undone only once Save as draft only is turned off…": first `expect(within(send).queryByText("Can't be undone")).not.toBeInTheDocument();`, then click the switch, then `expect(within(send).getByText("Can't be undone")).toBeInTheDocument();`. Its title changes to say so; the placeholder assertions are unchanged.
- "says a send saved only as a draft was saved as a draft": remove the switch click (it is on already).
- "drops the audience sentence from a send step once it has run": unchanged (a draft-only run still leaves `proposed`).

- [ ] **Step 3: Run them**

Run: `npx vitest run src/components/work/BundlePanel.test.tsx src/features/agents src/e2e --maxWorkers=2`
Expected: PASS. If an e2e journey ran a send step expecting it to send, it now saves a draft: update its expectation to "Saved as a draft.".

- [ ] **Step 4: Commit**

```bash
git add src/features/agents/testBundleFixtures.ts src/components/work/BundlePanel.test.tsx
git commit -m "test(work): send steps arrive with Save as draft only on

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Add any e2e file Step 3 changed.)

---

### Task 11: The end-to-end journeys

**Files:**
- Create: `src/e2e/bundleIntake.test.tsx`

- [ ] **Step 1: Write the journeys**

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { BUNDLES, B_DEPT, B_MAIL, B_TICKET, MESSAGE_BUNDLES } from '../features/agents/testBundleFixtures';
import { stubBundles } from '../features/agents/testBundles';
import { renderWork, where } from '../pages/work/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, sidebar item,
// WorkRoutes and router. Only fetch is stubbed, in the agent bundles D2
// contract's shapes. Nothing is sent anywhere. A Zendesk ticket's bundle
// waits in Customer Success; Alice runs it and the badge and the queue
// count go down. A mail bundle she edited shows the newer-message banner;
// she refreshes it. Her saved edit survives closing and reopening.

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
  document.body.style.overflow = '';
});

describe('Agent bundles D2: message intake', () => {
  it('runs a department bundle from its queue; the badge and the count follow', { timeout: 30000 }, async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES], departments: [{ key: 'cs', label: 'Customer Success' }] });
    renderWork('/work?queue=mine', { nav: true, sidebarItem: true });
    const rail = await screen.findByRole('navigation', { name: 'Queues' });
    await userEvent.click(await within(rail).findByRole('link', { name: 'Customer Success 1' }));
    await waitFor(() => expect(where()).toBe('/work?queue=department%3Acs'));
    const badge = await screen.findByRole('link', { name: /^Work, \d+ to decide/ });
    const before = Number(/(\d+) to decide/.exec(badge.getAttribute('aria-label') ?? badge.textContent ?? '')?.[1]);
    await userEvent.click(await screen.findByRole('link', { name: `Review ${B_DEPT.title}` }));
    const panel = await screen.findByRole('dialog', { name: B_DEPT.title });
    expect(within(panel).getByText('For Customer Success')).toBeInTheDocument();
    expect(within(panel).getByTestId('bundle-source').textContent).toContain('Zendesk ZD-1077 from ops@loose.io');
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 1 selected' }));
    expect(await within(panel).findByText('Done: all 1 step ran.')).toHaveFocus();
    await waitFor(() => expect(within(rail).getByRole('link', { name: 'Customer Success 0' })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('link', { name: new RegExp(`^Work, ${before - 1} to decide|^Work$`) })).toBeInTheDocument());
  });

  it('refreshes an edited mail bundle after a newer message', { timeout: 30000 }, async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES] });
    renderWork(`/work?queue=mine&bundle=${B_MAIL.id}`);
    const panel = await screen.findByRole('dialog', { name: B_MAIL.title });
    expect(within(panel).getByTestId('bundle-source').textContent).toContain('Email from ann@pizzahut.com');
    expect(within(panel).getByTestId('bundle-source').textContent).toContain('3 messages');
    await userEvent.click(within(panel).getByRole('button', { name: 'Refresh suggestions' }));
    expect(await within(panel).findByText('Suggestions refreshed.')).toHaveFocus();
    expect(within(within(panel).getByTestId('step-211')).getByText('Edited')).toBeInTheDocument();
  });

  it('keeps a saved edit across closing and reopening', { timeout: 30000 }, async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES] });
    renderWork('/work?queue=mine');
    await userEvent.click(await screen.findByRole('link', { name: `Review ${B_TICKET.title}` }));
    let panel = await screen.findByRole('dialog', { name: B_TICKET.title });
    const title = within(within(panel).getByTestId('step-202')).getByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Fix the login loop today');
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('link', { name: `Review ${B_TICKET.title}` }));
    panel = await screen.findByRole('dialog', { name: B_TICKET.title });
    expect(within(within(panel).getByTestId('step-202')).getByLabelText('Title')).toHaveValue('Fix the login loop today');
  });

  it('shows the banner and the source line on a phone', { timeout: 30000 }, async () => {
    stubBundles({ bundles: [...MESSAGE_BUNDLES] });
    renderWork(`/work?queue=mine&bundle=${B_MAIL.id}`, { width: 390 });
    const panel = await screen.findByRole('dialog', { name: B_MAIL.title });
    expect(panel.className).toContain('h-full');
    expect(within(panel).getByTestId('newer-message')).toBeInTheDocument();
    expect(within(panel).getByTestId('bundle-source')).toBeInTheDocument();
  });
});
```

(The sidebar item's name is "Work, N to decide, M overdue" per `feedBadgeName`; read the existing `src/e2e/work.test.tsx` lines ~73-94 and match its way of reading the number. A refreshed queue count arrives through the rail's tick on `feedChanged()`. The stub keeps `B_TICKET`'s saved title because `stubBundles` keeps state across reads.)

- [ ] **Step 2: Run them**

Run: `npx vitest run src/e2e --maxWorkers=2`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/e2e/bundleIntake.test.tsx
git commit -m "test(e2e): a department bundle, the newer-message refresh, saved edits and the phone panel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Docs, the full check and by eye

**Files:**
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`, `src/test/uiRatchet.test.ts` (only if a total moved down)

- [ ] **Step 1: The product docs (two in this repo; the backend PR carries the other four)**

- `docs/04-app-flow.md`: the `/work` row gains "`?queue=department:<code>` (a department's queue: Customer Success, Engineering, …) and `?queue=unassigned` (admins), both `GET /work/feed/team/?scope=…`, bundles only, no chips; the panel saves edits with `PATCH /agents/bundles/<id>/steps/<step>/` and refreshes with `POST /agents/bundles/<id>/refresh/`". Settings › Agents' row gains "Reading messages (how often, a switch per source; `PATCH /agents/settings/` `signal_interval`, `signal_sources`) and a credits note per agent".
- `docs/03-ui-ux-design.md`, under "Work inbox and the bundle panel": department and Unassigned queues (titles, empty states, no chips); the source line (channel icon, words, time, "Open in Zendesk" opening a new tab); "For Customer Success" and "Unassigned"; saved edits (Saving…/Saved., "Edited", the discard bar only for failed steps and the reject form); the newer-message banner (bordered note, Refresh suggestions bordered, "Suggestions refreshed." taking focus); History's "Rejected by". Settings › Agents: the Reading messages section and the credits note.
- `.agents/workflows/repo-architecture.md`: `components/work` gains `BundleSource`, `NewerMessage`; `components/agents` gains `MessageSources`; `features/work` notes `QueueScope`; `src/e2e` gains `bundleIntake.test.tsx`.

- [ ] **Step 2: The full check**

Run: `npx tsc -b && npm run lint && npm run build && npx vitest run --maxWorkers=2`
Expected: all clean; the full suite PASS. A failure in a test this plan did not touch means a reader of a changed shape was missed: find it with `systematic-debugging`; never loosen the test. The ratchet: totals equal `BASELINE` (lower it in this commit if a total went down). `grep -rn "—" src/components/work src/pages/work src/features/work src/features/agents/bundle* src/features/agents/testBundle* src/components/agents/MessageSources*` prints nothing.

- [ ] **Step 3: Commit the docs**

```bash
git add docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "docs: department queues, the source line, saved edits and Refresh suggestions (agent bundles delivery 2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Add `src/test/uiRatchet.test.ts` if the baseline moved.)

- [ ] **Step 4: By eye in Chrome (the delivery's last gate; CI is blocked by billing)**

Never use ports 8000 or 5173. The backend D2 branch must be built and its migrations applied to the database it reads (ask the owner before migrating the shared dev database; prefer a copy).

1. Backend: `cd /Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/bundles2-be && venv/bin/python manage.py runserver 8012` (background); add `CORS_ALLOWED_ORIGINS=http://localhost:5182` for this run if the browser is refused.
2. Frontend: `cd /Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/bundles2-fe && VITE_API_URL=http://localhost:8012 npx vite --port 5182 --strictPort` (background).
3. Data, nothing real sent: post a fake ticket to a webhook connector's inbound URL (a test connector with department `cs`, requester on a fake ownerless customer) and another on an owned customer; run `venv/bin/python manage.py run_agent_signals` once (one paid model call per thread: keep it to two or three), or seed message bundles from the backend shell with fake records. Edit one, then post a newer update to its ticket and run the command again so `has_newer_message` is set.
4. At 1440 and 390, light and dark, check and screenshot to `/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/12149f77-43a2-43eb-9c53-e9c1cb7f8b07/scratchpad/bundles2-fe-byeye/`:
   - the rail: the department queue under Rest of company with its tabular count, Unassigned for an admin, History last; the phone select listing both;
   - a department queue: its title, no chips, the bundle row with the channel icon and "Zendesk", the empty state when nothing waits;
   - the panel: the source line (icon, ticket, sender, time in your zone), "Open in Zendesk" opening a new tab, "For Customer Success";
   - saved edits: type in a field, Tab out, "Saving…" then "Saved.", the step says "Edited"; close and reopen: the edit is there; Escape with an unsaved field closes after saving; a bad value (empty title) shows the error and the discard bar;
   - the banner: bordered, not primary; Refresh suggestions busy then "Suggestions refreshed." focused; the edited step kept, the others replaced; Run is still the only primary;
   - History: a rejected bundle "Rejected by <name>";
   - Settings › Agents: Reading messages (How often, a switch per source, "Not connected" hints, Last read), each change saved with Undo; a member sees text; a card's credits note when an agent's budget is set to 0 and a thread waits;
   - send steps arrive with Save as draft only on and no "Can't be undone" until it is turned off;
   - at 390: every control 44px tall, the banner's button wraps under its text, nothing clipped.
5. Write each finding to `scratchpad/bundles2-fe-byeye/findings.md` as blocker / should-fix / cosmetic with its screenshot, fix the blockers in this branch (a test first), and stop both servers.

- [ ] **Step 5: Hand-off**

Report the branch head, the test count, the ratchet totals and the by-eye findings. Do not open a PR or merge: the owner decides (merge order: backend D2 first, then this).

---

## Self-review

**Spec coverage** (spec §11 D2 row and the brief):
- Department and Unassigned queues in the rail: Task 3 (rail, inbox, phone select, fallback), Task 2 (stub), contract §4.5/§4.6, D2-7.
- The panel's source block (thread, channel or ticket, last message time): Task 4 (spec §8.2 "Email from jane@acme.com · 3 messages · 10:42", linking the thread: D2-33 links tickets only).
- The newer-message banner and Refresh suggestions: Task 6 (spec §4.3, §8.2); saved edits that make "since you edited" real: Task 5 (D2-18).
- Settings › Agents interval select, per-source switches and the credits-waiting note: Tasks 8 and 9 (spec §4.3, §4.4).
- The Work badge counting your department queues: server-side (D2-9); pinned in Task 2's stub test and Task 11's first journey (Decision 15).
- D1 follow-ups: "Rejected by" (Task 7, D2-28); Save as draft only on by default (Task 10, D2-29); Retry from History kept (Decision 11, D2-30, no change); the campaign 5,000 limit and the schema crash are backend only (D2-31, D2-32); the panel shows the server's sentence for a long body, so no frontend limit changes (`BundleStepFields` has no `maxLength`).
- Tests (unit, integration, e2e), the by-eye checklist and docs: every task, Tasks 11 and 12.

**Placeholder scan:** every code step carries its code; the two "follow the file's own helper" notes name the file and what to copy (the recorder in `workApi.test.ts`, `calls`/role names in `AgentsSettingsPage.test.tsx`) because those helpers' exact signatures differ by file and must not be guessed.

**Type consistency:** `QueueScope` (Task 1) is what `fetchTeamQueue`, `useTeamQueue`, `TeamQueue`, `queueTitle` and `queueEmpty` take (Task 3); `Department` = `UserFunction` everywhere; `StepSave` is the PATCH body in `saveStep` (Task 1), `stepSave` (Task 5) and the stub (Task 2); `BundleSource` fields match contract §3.1 and are what `sourceParts` reads (Task 4); `SignalSettings`/`waiting_threads`/`waiting_reason` match contract §4.8 and Tasks 8 and 9.
