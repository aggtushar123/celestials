# Agent bundles, delivery 1 ("Bundles and the new Work"): frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Work becomes an inbox: a queue rail (Mine, My team, Rest of company, History, with counts) on the left, a select on phones, kind filters on every queue in the URL, agent proposals as **bundles** that open in a wide side panel where a person edits, unticks and presses **Run N selected**, sees each step's result or error with Retry, or rejects the bundle with a reason; History replaces Activity; the badge, Copilot's Next up, the bell and Settings › Agents follow.

**Architecture:** One route, `/work`, reads `?queue=` (default `mine`), `?kind=` and `?bundle=`; the old `/work/mine`, `/work/team?scope=` and `/work/activity` redirect into it. `WorkInbox` draws the rail from `GET /work/queues/` and one queue body: Mine is today's My work (its feed now carries `bundle` items), My team and Rest of company are today's `TeamQueue` with a kind filter (My team keeps the per-person counts under it), History is a new page over `GET /agents/bundles/history/`. A `BundleSheet` host, mounted once by the inbox, opens `?bundle=<id>` in the organisation page's `Sheet` (extended with a wide size, full screen on phones and heading focus). The panel's edits live in component state until Run (contract D10). Bundle words and pure rules sit in `features/agents/bundleText.ts`, the queue rules in `features/work/queues.ts`, both unit-tested. No Redux.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), react-router 7, Tailwind v4 tokens, Vitest + Testing Library (jsdom) + user-event, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-13-agent-bundles-design.md` (§3, §6, §7.1, §7.2, §8; the D1 row of §11). **API contract (binding, read-only):** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/bundles-be/docs/superpowers/plans/2026-10-13-agent-bundles-d1-api.md` (backend branch `feat/agent-bundles`). Read its "Decisions narrowing the spec" first: D1 to D23 are requirements here, and §3 and §9.2 for the `bundle` id on every action payload and the `irreversible` undo reason. Work in one place's frontend plans (`docs/superpowers/plans/2026-10-12-work-one-place-frontend.md`, `...-d2-frontend.md`) hold the house style this plan extends.

## Global Constraints

- **Worktree and branch.** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/bundles-fe`, branch `feat/agent-bundles` (on main `a5fd4091`). `node_modules` is a symlink: never commit it. Always `git add <explicit paths>` (and `git rm` for deletions), never `git add -A` or `git add .`. Never merge, never open a PR, never touch the servers on ports 8000 or 5173 (the owner uses them; the by-eye run in Task 14 uses 8011 and 5181).
- **Never run prettier. Never use `git stash`** (the stash stack is shared across worktrees).
- **Commands** (foreground): `npx vitest run <path> --maxWorkers=2`, `npx vitest run --maxWorkers=2`, `npx tsc -b`, `npm run lint`, `npm run build`. CI is blocked by GitHub billing: these local checks are the gate.
- **Every commit message is a conventional commit and ends with exactly this line:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Contract shapes are binding.** Test stubs answer exactly the contract's shapes and sentences; refusals are shown verbatim.
- **Tokens only** (`src/test/houseRules.ts` `RAW`): no hex, `rgb()`, named palette colours.
- **Type sizes 11/13/15 only**, through `TYPE.*`, `FIELD_ERROR`, `FORM_ALERT`; no `font-bold`, no `shadow-sm`/`shadow-md`, no `disabled:opacity-*`, no literal `font-mono-brand` in a `.tsx` (figures use `NUM`, the body font's tabular figures). The UI ratchet (`src/test/uiRatchet.test.ts`) must end each task with totals **equal** to `BASELINE`: deleting old-style code lowers totals, so lower the baseline to the new totals in the same commit; new code adds zero offences (never raise a baseline).
- **Kinso look and the UI cleanup rules:** bordered quiet cards (`Card`, `ListCard`); a list is ONE `ListCard` with flat `divide-y` rows, never a card per row, never a card in a card; numbers in the body font with `NUM`; monochrome primary (`PRIMARY`, `bg-accent text-on-accent`), **one primary per surface**: Mine's quick-add **Add**, the panel's **Run N selected**; nothing else is primary. Lucide icons only, each `aria-hidden="true"`; no emoji.
- **44px targets** on phones for every `<button>`, `<Link>`, `<select>`, `<input>`, `<textarea>`: `BUTTON`, `PRIMARY`, `QUIET`, `DANGER`, `ICON_BUTTON`, `INPUT`, `SELECT`, `CHOICE`, `INLINE_TARGET`, or a local `const` built from one.
- **No em dash (`—`) anywhere** in `src/components/work/`, `src/pages/work/`, `src/features/work/`, `src/features/agents/bundle*`, `src/features/agents/testBundle*`; comments and tests included.
- **Copy:** sentence case; the contract's and this plan's sentences word for word; server refusals shown verbatim.
- **States:** every list and the panel have a skeleton (not a spinner), an error with Try again, and an empty state.
- **Motion:** none added.
- **Privacy:** the page shows only what an item or bundle carries; a step's evidence only when the server sent it (view-all); a lost bundle (404) closes the panel and says so, never names it.
- **Testing:** unit + integration + e2e (jsdom, `src/e2e/`), only `fetch` stubbed with contract-shaped stubs and fake data (no real sends, no real accounts). Never mock the store.

## Decisions (frontend, where the spec and the contract leave a choice)

1. **One route with the queue in the URL.** `/work?queue=mine|team|company|history&kind=<chip>&bundle=<id>` (spec §8.1's `?queue=mine&kind=bundle`). No `queue` means Mine. `/work/mine?…` keeps its query into `/work?queue=mine&…`; `/work/team?scope=team|company` becomes `/work?queue=team|company` (no scope: `team`); `/work/activity` becomes History (Decision 13); `/work/today` and `/work/recommended` keep landing on Mine. Cost: low.
2. **The rail.** From `sm`, a 14rem column on the left of the list, a `nav` landmark named "Queues", one link per queue with its count (tabular) and `aria-current="page"` on the open one; History has no count; a queue whose count failed shows no number. Below `sm`, a `Select` labelled "Queue" at the top, each option "Mine (4)". Only the queues `GET /work/queues/` lists are offered; a `?queue=` it does not list falls back to Mine (replace) once the list has loaded. While the list loads, the rail shows Mine and History, never a spinner. Delivery 2's department and Unassigned rows render from the same list with no change here. Cost: low.
3. **Kind filters per queue.** Mine: All · Bundles · Approvals · Tasks · To-dos · Questions · Suggestions. My team and Rest of company: the same without To-dos (the server refuses `todo` there, contract §10.2). Approvals means rule reviews (contract D9); drafts show under All on Mine only. History has its own selects (agent, step kind, status) instead of chips. Changing the queue drops `kind`. Cost: low.
4. **The bundle row.** The bundle's title, its reason (muted), the kinds of its waiting steps joined by " · ", a meta line ("For Carl CSM" outside Mine, the record link, the agent, "3 steps", the day) and one bordered **Review** button that opens the panel (`?bundle=<id>`, pushed so Back closes it). No Run in the row: decisions are made in the panel (contract §4.3 `actions: ["open"]`). Cost: trivial.
5. **The panel is the organisation page's `Sheet`, made wide.** From `sm` a right panel `max-w-2xl` over a scrim (the list stays visible behind it); below `sm` full screen. Focus goes to the panel's heading on open (spec §8.2), Tab stays inside, Escape, Close and the scrim all ask to close. Closing returns focus to the row's Review button, or to the queue's heading when the row has left. Cost: low.
6. **Discarding edits** (contract D10). Closing with a changed field or tick swaps the footer for "Discard your edits?" with **Discard** (danger) and **Keep editing**, focused on Keep editing; no second dialog. Cost: trivial.
7. **Steps.** Each step is one row in one `ListCard`: tick box labelled by the step's kind label (e.g. "Create a task"), the step's title, "Can't be undone" (with a `ShieldAlert` icon) where irreversible, the kind's preview (`AgentActionBody`'s sentence), its editable fields, placeholder chips, and its state line. A step the reader may not run is unticked, its tick box disabled, with `disabled_reason` below. An expired step shows "Expired: <reason>." from `deciding.REASONS`' words (`its date has passed`, …) and no tick box. Cost: low.
8. **Editable fields** (contract D11): `task.create` title, assignee (`AssigneeSelect` over `GET /work/assignees/` for the record), due date, priority; `note.create` title and body; `draft.reply` body; `campaign.create` name, subject, body; `campaign.send` name, subject, body, roles (check boxes of the contact roles), "Save as draft only" (a `Switch`); `survey.send` name, survey type (NPS, CSAT, CES), subject, intro, roles, "Save as draft only". A survey step shows its fixed question as text and its audience as "42 contacts across 3 organisations · at most 500". Other kinds show their preview only. Cost: low.
9. **"Can't be undone" follows the switch.** For a kind with `draft_only` among its fields the mark shows while the switch is off and hides while it is on (contract §3); for every other step it is the server's `irreversible`. Cost: trivial.
10. **Placeholders** (contract D12). A field listed in `placeholders` is shown as text with a chip for each placeholder (the chip's words are the server's `label`, e.g. "Task link from step 1"), then "Filled in from step 1 when it runs."; it has no input. Raw braces are never shown; braces that do not match the grammar are shown as written. After a run the filled value is the stored text. Cost: low.
11. **Run.** The footer's **Run N selected** is the page's one primary, N the ticked runnable steps; with none ticked it is `aria-disabled` and pressing it says "Choose at least one step to run." Sent once (held while running, "Running…"). The answer replaces the bundle in place; the panel stays open on the results with a summary line at the top that takes focus ("Done: all 2 steps ran." / "1 of 2 steps ran. Retry the failed one." / "Nothing ran: every step had expired."); the list reads again (`feedChanged()`), so the row leaves Mine. Cost: low.
12. **Refusals.** A `400 {"steps": [...]}` shows as an alert at the top of the panel; a field error under its field; a `403` (`CANT_RUN`, `CANT_RUN_STEP`, `CANT_REJECT`) shows its `detail` there too; a `409` with a `bundle` replaces the panel's bundle with it and shows the `detail` ("Carl CSM ran this at 10:42.") as the alert; a `404` (on open or after an action) replaces the panel's body with "That bundle isn't there any more, or it's on a record you can't open." (as the task panel does for a lost task) and the list reads again. Cost: trivial.
13. **History.** One row per finished bundle: title, status ("Done", "Partly done", "Rejected", "Expired", "Replaced"), "For Carl CSM", the agent, who ran or rejected it and when. Review opens the same panel, read-only: each step's result with its links (from `outputs`: Open task, Open campaign, Open survey, Open segment, Open scenario, Open map), its error, and Undo for an applied step inside its window (today's `UndoAction`). Selects for agent, step kind and status and the page sit in the URL (`agent`, `step_kind`, `status`, `page`); 50 a page with Previous/Next; `hidden` as Activity said it. `/work/activity?action=<id>` reads that action (`GET /agents/actions/<id>/`, which carries `bundle`) and lands on `/work?queue=history&bundle=<bundle>`; without an id, or when the read fails, on `/work?queue=history`. Cost: low.
14. **Reject.** "Reject bundle" (bordered) opens an inline form in the footer: Why (a select of the four reasons, required, "Choose a reason." when empty), Note (optional, "Up to 255 characters."), **Reject it** (danger) and Cancel; the server's sentence under a field it names. After it lands, the panel shows "Rejected." and the row leaves. Cost: trivial.
15. **Retry.** A failed step shows its `error` (alert text) and **Retry** (bordered). Its editable fields stay editable; Retry sends only that step's changed fields. Busy while it runs ("Retrying…"); the answer replaces the bundle and focus moves to that step's state line. Cost: trivial.
16. **My team and Rest of company.** My team: the queue list ("Waiting on your team"), then "People" (today's per-person rows, `GET /work/team/?scope=team`), contract D23. Rest of company: "Waiting on the rest of the company", with Ask the agent for view-all readers as today. The Brain scope switch leaves Work (the rail is the switch). Cost: low.
17. **Badge.** Unchanged shape (contract §10.4); the sidebar's Work item links `/work`. Cost: none.
18. **Copilot's Next up.** Reads `bundle,rule_review,question,draft,task,todo`; bundles come first, each with a **Review** link to `/work?queue=mine&bundle=<id>` (the panel lives on Work); then the rest as today. "Open Work" links `/work`. Cost: low.
19. **The bell.** The server writes the words ("Bundles are waiting for your decision.", link `/work?queue=mine&kind=bundle`); the type's comment and the bell's test follow. Copilot's "proposals waiting" link (`ChatView`) goes to `/work?queue=mine&kind=bundle`; `/brain/waiting` lands on Mine with no chip (its agent actions are bundles now); `/brain/review` keeps the Approvals chip. Cost: trivial.
20. **Settings › Agents.** An outside kind (`locked: true`) shows "Always asks" in each agent's cell instead of a select, and no PATCH ever names it; an irreversible kind's row label reads "<label> · Can't be undone". No D1 kind is outside: the rule is tested with a fixture kind. Cost: trivial.

## File Structure

**Create**
- `src/features/agents/bundleTypes.ts`: the contract's Bundle, Step, run body, history and queue types.
- `src/features/agents/bundlesApi.ts`, `bundlesApi.test.ts`: the wrappers and the refusal reader.
- `src/features/agents/bundleText.ts`, `bundleText.test.ts`: the panel's words and pure rules (run body, dirty, placeholders, irreversible, summaries, audience, output links).
- `src/features/agents/testBundleFixtures.ts`, `testBundles.ts`, `testBundles.test.ts`: contract-shaped fixtures and the stateful stub.
- `src/features/work/queues.ts`, `queues.test.ts`: queue keys, the URL rules, each queue's chips, the redirects.
- `src/components/work/useQueues.ts`, `useQueues.test.tsx`
- `src/components/work/QueueRail.tsx`, `QueueRail.test.tsx`
- `src/components/work/BundleRow.tsx`, `BundleRow.test.tsx`
- `src/components/work/useBundle.ts`
- `src/components/work/BundleSheet.tsx`, `BundlePanel.tsx`, `BundlePanel.test.tsx`, `BundleStep.tsx`, `BundleStepFields.tsx`, `PlaceholderText.tsx`, `BundleReject.tsx`
- `src/components/work/TeamPeople.tsx` (Team's per-person rows, moved out of `pages/work/Team.tsx`)
- `src/pages/work/WorkInbox.tsx`, `WorkInbox.test.tsx`
- `src/pages/work/History.tsx`, `History.test.tsx`
- `src/pages/work/ActivityRedirect.tsx`
- `src/e2e/bundles.test.tsx`

**Modify**
- `src/features/work/workTypes.ts`, `workApi.ts` (+ test), `feed.ts` (+ test), `teamQueue.ts`, `testFeed.ts` (+ test), `testFeedFixtures.ts`, `workTabs.ts` (only `isWorkPath` stays).
- `src/features/agents/agentTypes.ts`, `agentsText.ts`, `testAgentsFixtures.ts` (settings kinds).
- `src/components/organizations/detail/Sheet.tsx` (+ a new `Sheet.test.tsx` if none).
- `src/components/work/FeedRow.tsx`, `FeedRowParts.tsx`, `FeedDecideRows.tsx` (+ tests), `FeedGroups.tsx`, `useFeedSettle.ts`, `useTeamQueue.ts`, `TeamQueue.tsx`, `NextUpCard.tsx` (+ test), `WorkFrame.tsx`, `houseRules.test.ts`.
- `src/pages/work/WorkRoutes.tsx` (+ test), `MyWork.tsx` (+ test), `testPages.tsx`.
- `src/components/layout/Sidebar.tsx`, `src/components/layout/Navbar.test.tsx`, `src/features/notifications/types.ts`.
- `src/components/agents/ActionsGridForm.tsx` (+ its test), `UndoAction.tsx`.
- `src/pages/copilot/ChatView.tsx`, `src/pages/brain/BrainRoutes.tsx`.
- `src/e2e/work.test.tsx`, `src/e2e/agents.test.tsx`.
- `src/test/uiRatchet.test.ts` (baseline lowered after deletions).
- Docs (Task 14): `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`.

**Delete:** `src/pages/work/Activity.tsx`, `Activity.test.tsx`, `Team.tsx`, `Team.test.tsx`; `src/components/layout/WorkTabs.tsx` (and its test if any); `src/features/work/workTabs.test.ts` cases for the tabs; `ApprovalRow` in `FeedDecideRows.tsx`; `useFeedSettle`'s `applied`; `src/components/agents/ActivityRow.tsx`, `ActivitySkeleton.tsx`, `useActivity.ts` (Task 10, after their paths leave the house-rule test lists).

---

### Task 1: Contract types and API wrappers

**Files:**
- Create: `src/features/agents/bundleTypes.ts`, `src/features/agents/bundlesApi.ts`, `src/features/agents/bundlesApi.test.ts`
- Modify: `src/features/agents/agentTypes.ts`, `src/features/work/workTypes.ts`, `src/features/work/workApi.ts`, `src/features/work/workApi.test.ts`

**Interfaces:**
- Produces (types, `bundleTypes.ts`): `BundleStatus`, `FinishedStatus`, `FINISHED_STATUSES`, `StepStatus`, `RejectReason`, `StepFieldValue`, `StepFields`, `Placeholder`, `BundleStep`, `Bundle`, `BundleAnswer`, `RunStep`, `RunBody`, `HistoryFilters`, `HistoryPayload`, `QueueKey`, `QueueRow`, `QueuesPayload`, `SurveyStepPreview`, `Audience`.
- Produces (types, existing files): `ActionKind` gains `'campaign.send' | 'survey.send'`; `ActionStatus` gains `'failed' | 'skipped'`; `UndoReason` gains `'irreversible'`; `UndoState.until: string | null`; `AgentAction.bundle: number`; `ActionKindSpec` gains `irreversible: boolean; outside: boolean; locked: boolean`; `ActionPreview` gains `survey?: SurveyStepPreview` and `CampaignPreview.audience?: Audience; limit?: number`. `FeedKind` is `'bundle' | 'rule_review' | 'question' | 'draft' | 'task' | 'todo' | 'suggestion'`; `BundleFeedItem` replaces `ApprovalFeedItem`; `TEAM_KINDS`.
- Produces (API): `fetchBundle(id)`, `runBundle(id, body)`, `retryStep(bundleId, stepId, fields?)`, `rejectBundle(id, reason, note)`, `fetchHistory(filters)`, `historyQuery(filters)`; `fetchQueues()`; `fetchTeamQueue(scope, kinds)`, `fetchTeamQueueGroup(scope, group, kinds, cursor?)`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/agents/bundlesApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBundle, fetchHistory, historyQuery, rejectBundle, retryStep, runBundle } from './bundlesApi';

type Seen = { method: string; url: string; body: unknown };

function spyFetch() {
  const seen: Seen[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      seen.push({ method: init?.method ?? 'GET', url: `${url.pathname.replace(/^\/api\/v1/, '')}${url.search}`, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return { ok: true, status: 200, json: async () => ({}) };
    }),
  );
  return seen;
}

describe('bundle routes (agent bundles D1 contract §5, §10.5)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads, runs, retries and rejects a bundle', async () => {
    const seen = spyFetch();
    await fetchBundle(12);
    await runBundle(12, { steps: [{ id: 41, selected: true, fields: { title: 'Call today' } }, { id: 42, selected: false }] });
    await retryStep(12, 41);
    await retryStep(12, 41, { title: 'Call now' });
    await rejectBundle(12, 'not_relevant', '');
    await rejectBundle(12, 'other', 'We called them.');
    expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual([
      'GET /agents/bundles/12/',
      'POST /agents/bundles/12/run/',
      'POST /agents/bundles/12/steps/41/retry/',
      'POST /agents/bundles/12/steps/41/retry/',
      'POST /agents/bundles/12/reject/',
      'POST /agents/bundles/12/reject/',
    ]);
    expect(seen[1].body).toEqual({ steps: [{ id: 41, selected: true, fields: { title: 'Call today' } }, { id: 42, selected: false }] });
    expect(seen[2].body).toEqual({});
    expect(seen[3].body).toEqual({ fields: { title: 'Call now' } });
    expect(seen[4].body).toEqual({ reason: 'not_relevant' });
    expect(seen[5].body).toEqual({ reason: 'other', note: 'We called them.' });
  });

  it('writes History filters into the query, page 1 left out', async () => {
    expect(historyQuery({ agent: null, step_kind: null, status: null, page: 1 })).toBe('');
    expect(historyQuery({ agent: 'cs', step_kind: 'task.create', status: 'partly_done', page: 3 })).toBe('?agent=cs&step_kind=task.create&status=partly_done&page=3');
    const seen = spyFetch();
    await fetchHistory({ agent: 'ops', step_kind: null, status: null, page: 1 });
    expect(seen[0].url).toBe('/agents/bundles/history/?agent=ops');
  });
});
```

In `src/features/work/workApi.test.ts`, inside the existing "feed routes" `describe` (reusing its `seen` spy), replace the Team queue test's first three calls and add the queues read:

```ts
  it('reads the queues, and a Team queue with its kind filter', async () => {
    await fetchQueues();
    await fetchTeamQueue('team', null);
    await fetchTeamQueue('company', ['bundle', 'question']);
    await fetchTeamQueueGroup('company', 'overdue', ['task'], 'abc');
    await fetchTeamQueueGroup('team', 'decide', null);
    expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual([
      'GET /work/queues/',
      'GET /work/feed/team/?scope=team',
      'GET /work/feed/team/?scope=company&kind=bundle%2Cquestion',
      'GET /work/feed/team/?scope=company&group=overdue&cursor=abc&kind=task',
      'GET /work/feed/team/?scope=team&group=decide',
    ]);
  });
```

(add `fetchQueues` to the import; delete the old `fetchTeamQueue('team')` lines in the earlier test, keeping its `answerQuestion` call.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/agents/bundlesApi.test.ts src/features/work/workApi.test.ts --maxWorkers=2`
Expected: FAIL (`./bundlesApi` does not exist; `fetchQueues` is not exported).

- [ ] **Step 3: The types**

Create `src/features/agents/bundleTypes.ts`:

```ts
// Agent bundles, delivery 1 (contract revenact-backend
// docs/superpowers/plans/2026-10-13-agent-bundles-d1-api.md §1, §4, §5, §10). No em dash.
import type { FeedRecord, PersonRef } from '../work/workTypes';
import type { ActionKind, ActionPreview, AgentKind, UndoState } from './agentTypes';

export type BundleStatus = 'waiting' | 'running' | 'done' | 'partly_done' | 'rejected' | 'expired' | 'superseded';
export type FinishedStatus = Exclude<BundleStatus, 'waiting' | 'running'>;
export const FINISHED_STATUSES: readonly FinishedStatus[] = ['done', 'partly_done', 'rejected', 'expired', 'superseded'];
export type StepStatus = 'proposed' | 'applied' | 'failed' | 'skipped' | 'rejected' | 'expired' | 'undone';
export type RejectReason = 'already_handled' | 'not_relevant' | 'wrong_person' | 'other';

export type StepFieldValue = string | number | boolean | string[] | null;
/** A step's editable payload keys (contract §4.2 `fields`). */
export type StepFields = Record<string, StepFieldValue>;

/** One `{{step N.key}}` in a step's text (contract §4.2). */
export interface Placeholder {
  field: string;
  step: number;
  key: string;
  label: string;
}

export interface BundleStep {
  id: number;
  position: number;
  kind: ActionKind;
  label: string;
  status: StepStatus;
  selected: boolean;
  title: string;
  rationale: string;
  fields: StepFields;
  editable: string[];
  placeholders: Placeholder[];
  preview: ActionPreview;
  irreversible: boolean;
  outside: boolean;
  can_run: boolean;
  disabled_reason: string | null;
  /** Ids and app paths a run made (contract §6.2). */
  outputs: Record<string, string | number>;
  error: string;
  expired_reason: string;
  undo: UndoState | null;
  evidence: { label: string; link: string | null }[];
}

export interface Bundle {
  id: number;
  agent: AgentKind;
  agent_label: string;
  title: string;
  reason: string;
  source: { kind: 'nightly' | 'thread'; label: string };
  record: FeedRecord | null;
  routed_to: 'owner' | 'department' | 'admins';
  /** Null: the whole company. */
  for: PersonRef | null;
  status: BundleStatus;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  edited_by: PersonRef | null;
  run_by: PersonRef | null;
  run_started_at: string | null;
  run_finished_at: string | null;
  reject_reason: RejectReason | '';
  reject_note: string;
  /** Always false in delivery 1 (delivery 2's banner). */
  has_newer_message: boolean;
  step_count: number;
  can_run: boolean;
  can_reject: boolean;
  steps: BundleStep[];
}

export interface BundleAnswer {
  bundle: Bundle;
}

export interface RunStep {
  id: number;
  selected: boolean;
  fields?: StepFields;
}

export interface RunBody {
  steps: RunStep[];
}

export interface HistoryFilters {
  agent: AgentKind | null;
  step_kind: ActionKind | null;
  status: FinishedStatus | null;
  page: number;
}

/** GET /agents/bundles/history/. */
export interface HistoryPayload {
  count: number;
  next: string | null;
  previous: string | null;
  results: Bundle[];
  hidden: number;
}

/** Delivery 2 adds `department:<id>` and `unassigned` (contract §10.3). */
export type QueueKey = 'mine' | 'team' | 'company' | 'history' | 'unassigned' | `department:${number}`;

export interface QueueRow {
  key: QueueKey;
  label: string;
  /** Null for History, or when this queue's count failed. */
  count: number | null;
}

/** GET /work/queues/. */
export interface QueuesPayload {
  queues: QueueRow[];
  failed: string[];
}

/** "42 contacts across 3 organisations" (contract §7.1). */
export interface Audience {
  contacts: number;
  records: number;
  record_noun: string;
}

export interface SurveyStepPreview {
  name: string;
  survey_type: 'nps' | 'csat' | 'ces';
  question: string;
  subject: string;
  intro: string;
  segment: string;
  roles: string[];
  audience: Audience;
  limit: number;
}
```

In `src/features/agents/agentTypes.ts`:
- `ActionKind`: add `| 'campaign.send' | 'survey.send'` after `'campaign.create'`; in `ACTION_KINDS` add `'campaign.send'` and `'survey.send'` after `'campaign.create'`.
- `export type ActionStatus = 'proposed' | 'applied' | 'rejected' | 'expired' | 'undone' | 'failed' | 'skipped';` (leave `ACTION_STATUSES` as it is: Activity's filter is gone in Task 10, and nothing else lists them).
- `export type UndoReason = 'expired' | 'cant_decide' | 'changed_since' | 'irreversible';` and in `UndoState`: `until: string | null;` with the comment `/** Null for an irreversible step (contract §3). */`.
- `ActionKindSpec`: add

```ts
  /** Can't be undone once it ran (agent bundles D1 §2). */
  irreversible: boolean;
  /** Acts outside Revenact; always Ask (D21). */
  outside: boolean;
  /** The grid shows Ask, disabled (an outside kind). */
  locked: boolean;
```
- `CampaignPreview`: add `audience?: Audience; limit?: number;` (import `Audience`, `SurveyStepPreview` from `./bundleTypes`); `ActionPreview`: add `survey?: SurveyStepPreview;`.
- `AgentAction`: add `/** The bundle this action is a step of (agent bundles D1, frontend needs). */ bundle: number;`.

Fix the fixtures `tsc` now reports: in `src/features/agents/testAgentsFixtures.ts` give the shared `base` action `bundle: 0` and each named action `bundle: <its id + 1000>` (e.g. `ACT_LIFECYCLE` `bundle: 1081`); give every `kinds` row in `AGENT_SETTINGS` `irreversible: false, outside: false, locked: false`; add rows for the two new kinds after `campaign.create`:

```ts
    { kind: 'campaign.send', label: 'Send a campaign', example: 'Send a check-in campaign to champions of at-risk organisations', max_level: 'ask', agents: ['ops'], irreversible: true, outside: false, locked: false },
    { kind: 'survey.send', label: 'Send a survey', example: 'Send an NPS survey to champions of at-risk organisations', max_level: 'ask', agents: ['ops'], irreversible: true, outside: false, locked: false },
```

and in `AGENT_SETTINGS.levels.ops` add `'campaign.send': 'ask', 'survey.send': 'ask'`. In `src/features/agents/agentsText.ts` `KIND_LABEL` add `'campaign.send': 'Send a campaign'` and `'survey.send': 'Send a survey'`, and wherever `tsc` reports an exhaustive `Record<ActionKind, …>` or `Record<UndoReason, …>` (e.g. `undoReasonText`'s map, the result-link map), add the new keys: `irreversible: "Can't be undone."`; for the two kinds reuse `campaign.create`'s entries for `campaign.send` and `segment.create`'s for `survey.send`'s segment.

In `src/features/work/workTypes.ts`, replace the delivery 1 `FeedKind` lines and the `ApprovalFeedItem` interface:

```ts
export type FeedKind = 'bundle' | 'rule_review' | 'question' | 'draft' | 'task' | 'todo' | 'suggestion';
/** In the contract's order (`failed` lists them in it; agent bundles D1 §10.1). */
export const FEED_KINDS: readonly FeedKind[] = ['bundle', 'rule_review', 'question', 'draft', 'task', 'todo', 'suggestion'];
/** What a Team queue may filter on (agent bundles D1 §10.2): no to-dos, no drafts. */
export const TEAM_KINDS: readonly FeedKind[] = ['bundle', 'rule_review', 'question', 'task', 'suggestion'];
```

```ts
/** A waiting bundle (agent bundles D1 contract §4.3): decided in the panel only. */
export interface BundleFeedItem extends FeedItemBase {
  kind: 'bundle';
  actions: 'open'[];
  detail: { reason: string; step_count: number; source: { kind: 'nightly' | 'thread'; label: string }; kinds: string[]; can_run: boolean };
}
```

and in the `FeedItem` union replace `ApprovalFeedItem` with `BundleFeedItem`. Remove the `AgentAction` import from `workTypes.ts` if nothing else in it uses it.

- [ ] **Step 4: The wrappers**

Create `src/features/agents/bundlesApi.ts`:

```ts
// Thin apiFetch wrappers over /agents/bundles/ (agent bundles D1 contract §5, §10.5). No em dash.
import { apiFetch } from '../../lib/apiClient';
import type { Bundle, BundleAnswer, HistoryFilters, HistoryPayload, RejectReason, RunBody, StepFields } from './bundleTypes';

export const fetchBundle = (id: number) => apiFetch<Bundle>(`/agents/bundles/${id}/`);
export const runBundle = (id: number, body: RunBody) => apiFetch<BundleAnswer>(`/agents/bundles/${id}/run/`, { method: 'POST', body });
export const retryStep = (bundleId: number, stepId: number, fields?: StepFields) =>
  apiFetch<BundleAnswer>(`/agents/bundles/${bundleId}/steps/${stepId}/retry/`, { method: 'POST', body: fields && Object.keys(fields).length > 0 ? { fields } : {} });
export const rejectBundle = (id: number, reason: RejectReason, note: string) =>
  apiFetch<BundleAnswer>(`/agents/bundles/${id}/reject/`, { method: 'POST', body: note.trim() ? { reason, note } : { reason } });

export function historyQuery(filters: HistoryFilters): string {
  const params = new URLSearchParams();
  if (filters.agent) params.set('agent', filters.agent);
  if (filters.step_kind) params.set('step_kind', filters.step_kind);
  if (filters.status) params.set('status', filters.status);
  if (filters.page > 1) params.set('page', String(filters.page));
  const text = params.toString();
  return text ? `?${text}` : '';
}

export const fetchHistory = (filters: HistoryFilters) => apiFetch<HistoryPayload>(`/agents/bundles/history/${historyQuery(filters)}`);
```

In `src/features/work/workApi.ts`, replace the delivery 2 `fetchTeamQueue` and `fetchTeamQueueGroup` and add the queues read:

```ts
// Agent bundles D1 (contract 2026-10-13-agent-bundles-d1-api.md §10.2, §10.3).
export const fetchQueues = () => apiFetch<QueuesPayload>('/work/queues/');
export const fetchTeamQueue = (scope: TeamScope, kinds: readonly FeedKind[] | null) =>
  apiFetch<TeamQueuePayload>(`/work/feed/team/?${query({ scope, ...kindParam(kinds) })}`);
/** One group's next page; without a cursor, its first page (a failed group's Try again). */
export const fetchTeamQueueGroup = (scope: TeamScope, group: FeedGroupKey, kinds: readonly FeedKind[] | null, cursor: string | null = null) =>
  apiFetch<TeamQueuePage>(`/work/feed/team/?${query({ scope, group, ...(cursor ? { cursor } : {}), ...kindParam(kinds) })}`);
```

(import `QueuesPayload` from `'../agents/bundleTypes'`). `useTeamQueue` is updated in Task 5; until then pass `null` there: in `src/components/work/useTeamQueue.ts` change `read`/`readGroup` to `fetchTeamQueue(scope, null)` and `fetchTeamQueueGroup(scope, group, null, cursor)`.

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run src/features/agents/bundlesApi.test.ts src/features/work/workApi.test.ts --maxWorkers=2 && npx tsc -b`
Expected: the two test files PASS. `tsc` still reports every reader of `ApprovalFeedItem`, `'approval'` as a `FeedKind`, and `approvalItem`: those are Tasks 2 to 4. If you commit here, commit with `tsc` errors only in the files Tasks 2 to 4 list (say so in the ledger); do not paper over them.

- [ ] **Step 6: Commit**

```bash
git add src/features/agents/bundleTypes.ts src/features/agents/bundlesApi.ts src/features/agents/bundlesApi.test.ts src/features/agents/agentTypes.ts src/features/agents/agentsText.ts src/features/agents/testAgentsFixtures.ts src/features/work/workTypes.ts src/features/work/workApi.ts src/features/work/workApi.test.ts src/components/work/useTeamQueue.ts
git commit -m "feat(agents): bundle, step, history and queue types and wrappers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The stubs: bundles, queues, the bundle kind and Team kinds

**Files:**
- Create: `src/features/agents/testBundleFixtures.ts`, `src/features/agents/testBundles.ts`, `src/features/agents/testBundles.test.ts`
- Modify: `src/features/work/testFeedFixtures.ts`, `src/features/work/testFeed.ts`, `src/features/work/testFeed.test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces (fixtures): `bundleItem(bundle: Bundle): BundleFeedItem`; `step(over: Partial<BundleStep> & Pick<BundleStep, 'id' | 'position' | 'kind' | 'label' | 'title'>): BundleStep`; `bundle(over: Partial<Bundle> & Pick<Bundle, 'id' | 'title'>): Bundle`; `B_PIZZA` (id 12, CS, Pizza Hut, waiting: step 41 `task.create` editable, step 42 `note.create` editable, step 43 `record.lifecycle` the reader may not run); `B_CAMPAIGN` (id 13, Ops, workspace-level, waiting: step 51 `campaign.send` with audience, step 52 `task.create` whose title holds `{{step 1.campaign_url}}`); `B_SURVEY` (id 14, Ops, waiting: step 61 `survey.send`); `B_DONE` (id 15, done, step 71 applied with `outputs` and an undo window); `B_PARTLY` (id 16, partly done: step 81 applied, step 82 failed with error); `B_REJECTED` (id 17); `BUNDLES`, `WAITING_BUNDLES`; `TEAM_BUNDLE` (id 18, waiting on Carl).
- Produces (stub): `stubBundles(stub?: BundlesStub)` over `stubFeed`, returning `{ spy, feed, bundles }`; Mine lists the reader's (Alice's) waiting bundles, My team Carl's (`TEAM_BUNDLE`), Rest of company the workspace-level ones (`B_CAMPAIGN`, `B_SURVEY`), unless `team` is given; options `bundles?: Bundle[]`, `failSteps?: Record<number, string>` (step id: the error a run gives it), `refuseNextRun?: { status: number; body: unknown }`, `failHistory?: number`, `historyHidden?: number`, `actions?: Record<number, number>` (action id: bundle id for `GET /agents/actions/<id>/`), plus every `FeedStub` option. `stubFeed` gains `queues?: QueueRow[]`, `failQueues?: number`; `GET /work/queues/`; `kind=` on the Team queue (approval read as bundle, todo and draft refused); `kind=approval` on the feed read as bundle.

- [ ] **Step 1: Write the failing stub tests**

Create `src/features/agents/testBundles.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { B_CAMPAIGN, B_DONE, B_PARTLY, B_PIZZA } from './testBundleFixtures';
import { stubBundles } from './testBundles';

const call = async (method: string, path: string, body?: unknown) => {
  const response = (await fetch(`http://localhost/api/v1${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })) as unknown as { status: number; json: () => Promise<unknown> };
  return [response.status, await response.json()] as const;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = async (path: string) => (await call('GET', path))[1] as Record<string, any>;

describe('stubBundles (agent bundles D1 contract §5, §9, §10)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists waiting bundles on Mine and runs one: applied, skipped, and the row leaves', async () => {
    stubBundles();
    const feed = await read('/work/feed/?kind=bundle');
    expect(feed.groups[0].items.map((i: { key: string }) => i.key)).toEqual(['bundle:12']);
    const company = await read('/work/feed/team/?scope=company&kind=bundle');
    expect(company.groups[0].items.map((i: { key: string; for: unknown }) => [i.key, i.for])).toEqual([['bundle:13', null], ['bundle:14', null]]);
    const [status, body] = await call('POST', '/agents/bundles/12/run/', { steps: [{ id: 41, selected: true, fields: { title: 'Call today' } }, { id: 42, selected: false }, { id: 43, selected: false }] });
    expect(status).toBe(200);
    const ran = (body as { bundle: typeof B_PIZZA }).bundle;
    expect(ran.status).toBe('done');
    expect(ran.steps.map((s) => s.status)).toEqual(['applied', 'skipped', 'skipped']);
    expect(ran.steps[0].title).toBe('Call today');
    expect(ran.steps[0].outputs).toEqual({ task_id: 990, task_url: '/work/mine?task=990' });
    expect((await read('/work/feed/?kind=bundle')).groups[0].items).toEqual([]);
  });

  it('refuses a body that does not name every waiting step, nothing selected, or a step it may not run', async () => {
    stubBundles();
    expect(await call('POST', '/agents/bundles/12/run/', { steps: [{ id: 41, selected: true }] })).toEqual([400, { steps: ['List every waiting step once.'] }]);
    expect(await call('POST', '/agents/bundles/12/run/', { steps: [{ id: 41, selected: false }, { id: 42, selected: false }, { id: 43, selected: false }] })).toEqual([400, { steps: ['Choose at least one step to run.'] }]);
    const [status, body] = await call('POST', '/agents/bundles/12/run/', { steps: [{ id: 41, selected: false }, { id: 42, selected: false }, { id: 43, selected: true }] });
    expect([status, body]).toEqual([403, { code: 'CANT_RUN_STEP', detail: "You can't run step 3.", step: 43 }]);
  });

  it('fails a step, fills placeholders, and retries', async () => {
    stubBundles({ failSteps: { 51: 'Nobody to send to.' } });
    const [, body] = await call('POST', '/agents/bundles/13/run/', { steps: [{ id: 51, selected: true }, { id: 52, selected: true }] });
    const ran = (body as { bundle: typeof B_CAMPAIGN }).bundle;
    expect(ran.status).toBe('partly_done');
    expect(ran.steps.map((s) => [s.status, s.error])).toEqual([
      ['failed', 'Nobody to send to.'],
      ['failed', "Needs step 1, which didn't run."],
    ]);
    const [, again] = await call('POST', '/agents/bundles/13/steps/51/retry/', {});
    expect((again as { bundle: typeof B_CAMPAIGN }).bundle.steps[0].status).toBe('applied');
    const [, last] = await call('POST', '/agents/bundles/13/steps/52/retry/', {});
    const done = (last as { bundle: typeof B_CAMPAIGN }).bundle;
    expect(done.status).toBe('done');
    expect(done.steps[1].title).toBe('Follow up on /campaigns/990');
  });

  it('answers 409 for a finished bundle with who ran it, and rejects a waiting one', async () => {
    stubBundles();
    const [status, body] = await call('POST', `/agents/bundles/${B_DONE.id}/run/`, { steps: [] });
    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'BUNDLE_RAN', detail: 'Carl CSM ran this at 10:42.' });
    expect(await call('POST', '/agents/bundles/12/reject/', { reason: 'nope' })).toEqual([400, { reason: ['Choose already handled, not relevant, wrong person or other.'] }]);
    const [ok, rejected] = await call('POST', '/agents/bundles/12/reject/', { reason: 'not_relevant' });
    expect([ok, (rejected as { bundle: typeof B_PIZZA }).bundle.status]).toEqual([200, 'rejected']);
  });

  it('lists History with filters and pages, and finds an action bundle', async () => {
    stubBundles({ actions: { 81: B_PARTLY.id } });
    const all = await read('/agents/bundles/history/');
    expect(all.results.map((b: { id: number }) => b.id)).toEqual([16, 15, 17]);
    expect((await read('/agents/bundles/history/?status=done')).results.map((b: { id: number }) => b.id)).toEqual([15]);
    expect((await call('GET', '/agents/bundles/history/?status=waiting'))[0]).toBe(400);
    expect((await read('/agents/actions/81/')).bundle).toBe(16);
  });

  it('answers the queues and filters a Team queue by kind', async () => {
    stubBundles();
    expect((await read('/work/queues/')).queues.map((q: { key: string }) => q.key)).toEqual(['mine', 'team', 'company', 'history']);
    expect((await call('GET', '/work/feed/team/?scope=team&kind=todo'))).toEqual([400, { kind: ['Choose bundle, rule_review, question, task or suggestion.'] }]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/agents/testBundles.test.ts --maxWorkers=2`
Expected: FAIL (`./testBundleFixtures` does not exist).

- [ ] **Step 3: The fixtures**

Create `src/features/agents/testBundleFixtures.ts`:

```ts
// Test-only: bundles for Alice (id 1) on 7 Oct 2026, in the agent bundles D1
// contract's shapes (§4). Fake people and records only. No em dash.
import type { BundleFeedItem } from '../work/workTypes';
import type { Bundle, BundleStep } from './bundleTypes';

const ALICE = { id: 1, name: 'Alice' };
const CARL = { id: 3, name: 'Carl CSM' };
const PIZZA = { type: 'customer' as const, id: 7, name: 'Pizza Hut' };

export function step(over: Partial<BundleStep> & Pick<BundleStep, 'id' | 'position' | 'kind' | 'label' | 'title'>): BundleStep {
  return {
    status: 'proposed',
    selected: true,
    rationale: '',
    fields: {},
    editable: [],
    placeholders: [],
    preview: {},
    irreversible: false,
    outside: false,
    can_run: true,
    disabled_reason: null,
    outputs: {},
    error: '',
    expired_reason: '',
    undo: null,
    evidence: [],
    ...over,
  };
}

export function bundle(over: Partial<Bundle> & Pick<Bundle, 'id' | 'title'>): Bundle {
  const steps = over.steps ?? [];
  return {
    agent: 'cs',
    agent_label: 'CS agent',
    reason: '',
    source: { kind: 'nightly', label: 'Nightly review' },
    record: PIZZA,
    routed_to: 'owner',
    for: ALICE,
    status: 'waiting',
    created_at: '2026-10-06T12:00:00Z',
    updated_at: '2026-10-06T12:00:00Z',
    edited_at: null,
    edited_by: null,
    run_by: null,
    run_started_at: null,
    run_finished_at: null,
    reject_reason: '',
    reject_note: '',
    has_newer_message: false,
    step_count: steps.length,
    can_run: true,
    can_reject: false,
    ...over,
    steps,
  };
}

export const B_PIZZA: Bundle = bundle({
  id: 12,
  title: 'Call Pizza Hut about the renewal, and 2 more',
  reason: 'Health fell from 72 to 41 in two weeks and the renewal is in 30 days.',
  can_reject: false,
  steps: [
    step({
      id: 41,
      position: 1,
      kind: 'task.create',
      label: 'Create a task',
      title: 'Call Pizza Hut about the renewal',
      rationale: 'Renewal in 30 days.',
      fields: { title: 'Call Pizza Hut about the renewal', assignee_id: 3, due_date: '2026-10-12', priority: 'high' },
      editable: ['title', 'assignee_id', 'due_date', 'priority'],
      preview: { task: { title: 'Call Pizza Hut about the renewal', assignee: CARL, due_date: '2026-10-12', priority: 'high' } },
    }),
    step({
      id: 42,
      position: 2,
      kind: 'note.create',
      label: 'File a note',
      title: 'Note the health drop',
      fields: { title: 'Health drop', body: 'Health fell from 72 to 41.' },
      editable: ['title', 'body'],
      preview: { note: { title: 'Health drop' } },
    }),
    step({
      id: 43,
      position: 3,
      kind: 'record.lifecycle',
      label: 'Change lifecycle stage',
      title: 'Move Pizza Hut to Renewal',
      selected: false,
      can_run: false,
      disabled_reason: "You can't run this step.",
      preview: { field: 'Lifecycle stage', from: 'Live', to: 'Renewal' },
    }),
  ],
});

export const B_CAMPAIGN: Bundle = bundle({
  id: 13,
  agent: 'ops',
  agent_label: 'Ops agent',
  title: 'Send a check-in to at-risk champions, and 1 more',
  reason: 'Three champions went quiet this month.',
  record: null,
  routed_to: 'admins',
  for: null,
  created_at: '2026-10-06T13:00:00Z',
  can_reject: true,
  steps: [
    step({
      id: 51,
      position: 1,
      kind: 'campaign.send',
      label: 'Send a campaign',
      title: 'Check in with at-risk champions',
      irreversible: true,
      fields: { name: 'Champion check-in', subject: 'Quick check-in', body: 'Hi {first_name}, how is it going?', roles: ['champion'], draft_only: false },
      editable: ['name', 'subject', 'body', 'roles', 'draft_only'],
      preview: {
        campaign: { name: 'Champion check-in', segment: 'At-risk champions', roles: ['Champion'], subject: 'Quick check-in', excerpt: 'Hi {first_name}, how is it going?', audience: { contacts: 42, records: 3, record_noun: 'organisations' }, limit: 500 },
      },
    }),
    step({
      id: 52,
      position: 2,
      kind: 'task.create',
      label: 'Create a task',
      title: 'Follow up on {{step 1.campaign_url}}',
      fields: { assignee_id: 1, due_date: '2026-10-14', priority: 'medium' },
      // Workspace-level: no record, so no assignee picker (the task's record comes from the run).
      editable: ['due_date', 'priority'],
      placeholders: [{ field: 'title', step: 1, key: 'campaign_url', label: 'Campaign link from step 1' }],
      preview: { task: { title: 'Follow up on {{step 1.campaign_url}}', assignee: ALICE, due_date: '2026-10-14', priority: 'medium' } },
    }),
  ],
});

export const B_SURVEY: Bundle = bundle({
  id: 14,
  agent: 'ops',
  agent_label: 'Ops agent',
  title: 'Ask at-risk champions for an NPS score',
  record: null,
  routed_to: 'admins',
  for: null,
  created_at: '2026-10-06T14:00:00Z',
  can_reject: true,
  steps: [
    step({
      id: 61,
      position: 1,
      kind: 'survey.send',
      label: 'Send a survey',
      title: 'Q4 NPS for at-risk champions',
      irreversible: true,
      fields: { name: 'Q4 NPS', survey_type: 'nps', subject: 'Two minutes for Pizza Hut?', intro: "We'd love your view.", roles: ['champion'], draft_only: false },
      editable: ['name', 'survey_type', 'subject', 'intro', 'roles', 'draft_only'],
      preview: {
        survey: {
          name: 'Q4 NPS',
          survey_type: 'nps',
          question: 'How likely are you to recommend Acme to a friend or colleague?',
          subject: 'Two minutes for Pizza Hut?',
          intro: "We'd love your view.",
          segment: 'At-risk champions',
          roles: ['Champion'],
          audience: { contacts: 42, records: 3, record_noun: 'organisations' },
          limit: 500,
        },
      },
    }),
  ],
});

const RAN = { run_by: CARL, run_started_at: '2026-10-07T10:42:00Z', run_finished_at: '2026-10-07T10:42:05Z' };

export const B_DONE: Bundle = bundle({
  id: 15,
  title: 'Book the QBR',
  status: 'done',
  for: CARL,
  updated_at: '2026-10-07T10:42:05Z',
  can_run: false,
  ...RAN,
  steps: [
    step({
      id: 71,
      position: 1,
      kind: 'task.create',
      label: 'Create a task',
      title: 'Book the QBR',
      status: 'applied',
      selected: true,
      can_run: false,
      outputs: { task_id: 41, task_url: '/work/mine?task=41' },
      undo: { allowed: true, until: '2026-10-14T10:42:05Z', reason: null },
    }),
  ],
});

export const B_PARTLY: Bundle = bundle({
  id: 16,
  agent: 'ops',
  agent_label: 'Ops agent',
  title: 'Send the renewal survey, and 1 more',
  status: 'partly_done',
  record: null,
  routed_to: 'admins',
  for: null,
  updated_at: '2026-10-07T11:00:00Z',
  can_run: false,
  ...RAN,
  steps: [
    step({ id: 81, position: 1, kind: 'segment.create', label: 'Build a segment', title: 'Renewing in 30 days', status: 'applied', can_run: false, outputs: { segment_id: 5, segment_url: '/segments/5' } }),
    step({ id: 82, position: 2, kind: 'survey.send', label: 'Send a survey', title: 'Renewal survey', status: 'failed', can_run: false, irreversible: true, error: "Email isn't set up for this workspace yet, so surveys can't be sent." }),
  ],
});

export const B_REJECTED: Bundle = bundle({
  id: 17,
  title: 'Move Pizza Hut to Churn',
  status: 'rejected',
  updated_at: '2026-10-05T09:00:00Z',
  can_run: false,
  reject_reason: 'not_relevant',
  run_by: null,
  steps: [step({ id: 91, position: 1, kind: 'record.lifecycle', label: 'Change lifecycle stage', title: 'Move Pizza Hut to Churn', status: 'rejected', can_run: false })],
});

/** Waiting on Carl: Alice sees it on My team. */
export const TEAM_BUNDLE: Bundle = bundle({ ...B_PIZZA, id: 18, for: CARL, title: 'Chase the exec sponsor', steps: [{ ...B_PIZZA.steps[0], id: 101 }] });

export const WAITING_BUNDLES: Bundle[] = [B_PIZZA, B_CAMPAIGN, B_SURVEY];
export const BUNDLES: Bundle[] = [...WAITING_BUNDLES, B_DONE, B_PARTLY, B_REJECTED, TEAM_BUNDLE];

/** A waiting bundle as the feed lists it (contract §4.3). */
export function bundleItem(b: Bundle, withFor = false): BundleFeedItem {
  return {
    key: `bundle:${b.id}`,
    kind: 'bundle',
    id: b.id,
    title: b.title,
    record: b.record,
    from: { type: 'agent', label: b.agent_label },
    at: b.created_at,
    due_date: null,
    priority: null,
    private: false,
    actions: ['open'],
    detail: { reason: b.reason, step_count: b.step_count, source: b.source, kinds: b.steps.filter((s) => s.status === 'proposed').map((s) => s.label), can_run: b.can_run },
    ...(withFor ? { for: b.for } : {}),
  };
}
```

In `src/features/work/testFeedFixtures.ts`: delete `approvalItem` and `APPROVAL` (and the `ACT_LIFECYCLE`/`AgentAction` imports if unused); import `B_PIZZA, bundleItem` from `'../agents/testBundleFixtures'`; `export const BUNDLE_ITEM = bundleItem(B_PIZZA);` and `export const DECIDE_ITEMS: FeedItem[] = [REVIEW, QUESTION, DRAFT, BUNDLE_ITEM];`. Replace `TEAM_APPROVAL` with `export const TEAM_BUNDLE_ITEM = teamItem(bundleItem(TEAM_BUNDLE), refOf(CARL));` (import `TEAM_BUNDLE`) and use it in `TEAM_ITEMS` in its place.

- [ ] **Step 4: The feed stub: the bundle kind, queues and Team kinds**

In `src/features/work/testFeed.ts`:

```ts
const KINDS: readonly FeedKind[] = ['bundle', 'rule_review', 'question', 'draft', 'task', 'todo', 'suggestion'];
const DECIDE: readonly FeedKind[] = ['bundle', 'rule_review', 'question', 'draft'];
/** Contract §10.1: at equal times a rule review comes before a bundle. */
const DECIDE_TIE: readonly FeedKind[] = ['rule_review', 'bundle', 'question', 'draft'];
const TEAM_KINDS: readonly FeedKind[] = ['bundle', 'rule_review', 'question', 'task', 'suggestion'];
/** `approval` is read as `bundle` (contract D9). */
const asKinds = (raw: string) => raw.split(',').map((kind) => (kind === 'approval' ? 'bundle' : kind)) as FeedKind[];
```

In `feed(url)`: `const kinds = asked === null ? KINDS : asKinds(asked);` and the refusal sentence `'Choose bundle, rule_review, question, draft, task, todo or suggestion.'`.

Add to `FeedStub`:

```ts
  /** GET /work/queues/'s rows. Default: Mine (the badge), My team and Rest of company per `offered`, History. */
  queues?: QueueRow[];
  /** How many queue-list reads answer 500 first. */
  failQueues?: number;
```

In `queue(url)`, after the scope checks:

```ts
    const asked = url.searchParams.get('kind');
    const kinds = asked === null ? TEAM_KINDS : asKinds(asked);
    if (kinds.length === 0 || kinds.some((kind) => !TEAM_KINDS.includes(kind))) return json(400, { kind: ['Choose bundle, rule_review, question, task or suggestion.'] });
```

and in `queueItems(scope, kinds)` skip `if (!kinds.includes(item.kind)) continue;` (pass `kinds` from `queue`). Add the queues read:

```ts
  let failQueues = stub.failQueues ?? 0;
  function queues() {
    if (failQueues > 0) {
      failQueues -= 1;
      return json(500, { detail: 'Down.' });
    }
    if (stub.queues) return json(200, { queues: stub.queues, failed: [] });
    const groups = everything(KINDS, []);
    const rows = [{ key: 'mine', label: 'Mine', count: groups.decide.length + groups.overdue.length }];
    const waiting = (scope: TeamScope) => (stub.team?.[scope] ?? []).filter((item) => !queueGone.has(item.key) && item.kind !== 'suggestion').length;
    if (offered.includes('team')) rows.push({ key: 'team', label: 'My team', count: waiting('team') });
    if (offered.includes('company')) rows.push({ key: 'company', label: 'Rest of company', count: waiting('company') });
    return json(200, { queues: [...rows, { key: 'history', label: 'History', count: null }], failed: [] });
  }
```

and in `spy`: `if (method === 'GET' && path === '/work/queues/') return queues();`. Delete `agentDecision`'s approve/reject branches (bundles are run through `stubBundles`); keep its `undo` branch only if a test still reads it (`grep -rn "agent_action:" src --include=*.test.tsx`), else delete the function and its route line. Import `QueueRow` from `'../agents/bundleTypes'`.

- [ ] **Step 5: The bundle stub**

Create `src/features/agents/testBundles.ts`:

```ts
// Test-only: the bundle routes of the agent bundles D1 contract (§5, §9,
// §10.5), in front of stubFeed. Waiting bundles are the feed's `bundle`
// items; a run, a retry or a reject changes the bundle and the feed alike.
// Nothing is sent anywhere. No em dash.
import { vi } from 'vitest';
import { stubFeed, type FeedStub } from '../work/testFeed';
import { DECIDE_ITEMS } from '../work/testFeedFixtures';
import { BUNDLES, bundleItem } from './testBundleFixtures';
import type { FeedItem, TeamScope } from '../work/workTypes';
import type { Bundle, BundleStep, FinishedStatus, StepFields } from './bundleTypes';
import { FINISHED_STATUSES } from './bundleTypes';

export interface BundlesStub extends FeedStub {
  bundles?: Bundle[];
  /** Step id: the error a run or retry gives it (once per run; a retry succeeds). */
  failSteps?: Record<number, string>;
  /** The next run answers this instead, once. */
  refuseNextRun?: { status: number; body: unknown };
  failHistory?: number;
  historyHidden?: number;
  /** Action id: its bundle, for GET /agents/actions/<id>/. */
  actions?: Record<number, number>;
  /** Items per History page. Default 50. */
  historyPageSize?: number;
}

const json = (status: number, body: unknown) => {
  const copy = body === undefined ? null : JSON.parse(JSON.stringify(body));
  return { ok: status >= 200 && status < 300, status, json: async () => copy };
};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const READER = { id: 1, name: 'Alice' };
const NOW = '2026-10-07T10:42:00Z';
const REASONS = ['already_handled', 'not_relevant', 'wrong_person', 'other'];
const PLACEHOLDER = /\{\{\s*step\s+(\d+)\.([a-z_]+)\s*\}\}/g;
const OUTPUTS: Record<string, (id: number) => Record<string, string | number>> = {
  'task.create': (id) => ({ task_id: id, task_url: `/work/mine?task=${id}` }),
  'note.create': (id) => ({ note_id: id }),
  'campaign.send': (id) => ({ campaign_id: id, campaign_url: `/campaigns/${id}` }),
  'campaign.create': (id) => ({ campaign_id: id, campaign_url: `/campaigns/${id}` }),
  'survey.send': (id) => ({ survey_id: id, survey_url: `/surveys/${id}` }),
};

const ran = (b: Bundle) => (b.run_by ? b.run_by.name : 'Revenact');

function refusal409(b: Bundle) {
  const at = b.run_finished_at ?? b.updated_at;
  const time = new Date(at).toISOString().slice(11, 16);
  const detail: Record<string, string> = {
    running: `${ran(b)} is running this.`,
    done: `${ran(b)} ran this at ${time}.`,
    partly_done: `${ran(b)} ran this at ${time}.`,
    rejected: `${ran(b)} rejected this.`,
    expired: 'This bundle expired: it waited 14 days.',
    superseded: 'A newer bundle replaced this one.',
  };
  const code: Record<string, string> = { running: 'BUNDLE_RUNNING', done: 'BUNDLE_RAN', partly_done: 'BUNDLE_RAN', rejected: 'BUNDLE_REJECTED', expired: 'BUNDLE_EXPIRED', superseded: 'BUNDLE_SUPERSEDED' };
  return json(409, { code: code[b.status], detail: detail[b.status], bundle: b });
}

export function stubBundles(stub: BundlesStub = {}) {
  const bundles = new Map<number, Bundle>((stub.bundles ?? BUNDLES).map((b) => [b.id, clone(b)]));
  const waiting = [...bundles.values()].filter((b) => b.status === 'waiting');
  // Mine: the reader's own (contract §10.1). Workspace-level ones wait on Rest
  // of company (D6), Carl's on My team.
  const mine = waiting.filter((b) => b.for?.id === READER.id);
  const team: Partial<Record<TeamScope, FeedItem[]>> = stub.team ?? {
    team: waiting.filter((b) => b.for !== null && b.for.id !== READER.id).map((b) => bundleItem(b, true)),
    company: waiting.filter((b) => b.record === null).map((b) => bundleItem(b, true)),
  };
  const feed = stubFeed({ ...stub, team, decide: [...(stub.decide ?? DECIDE_ITEMS).filter((item) => item.kind !== 'bundle'), ...mine.map((b) => bundleItem(b))] });
  /** A bundle that ran or was rejected leaves every list. */
  const leave = (id: number) => {
    feed.decide.delete(`bundle:${id}`);
    for (const list of Object.values(team)) {
      const at = list?.findIndex((item) => item.key === `bundle:${id}`) ?? -1;
      if (list && at >= 0) list.splice(at, 1);
    }
  };
  const failing = { ...(stub.failSteps ?? {}) };
  let refuseRun = stub.refuseNextRun ?? null;
  let failHistory = stub.failHistory ?? 0;
  let nextOut = 990;

  function runStep(b: Bundle, s: BundleStep) {
    for (const match of s.title.matchAll(PLACEHOLDER)) {
      const producer = b.steps.find((other) => other.position === Number(match[1]));
      if (!producer || producer.status !== 'applied' || producer.outputs[match[2]] === undefined) {
        s.status = 'failed';
        s.error = `Needs step ${match[1]}, which didn't run.`;
        return;
      }
    }
    if (failing[s.id]) {
      s.status = 'failed';
      s.error = failing[s.id];
      delete failing[s.id];
      return;
    }
    s.title = s.title.replace(PLACEHOLDER, (_all, n: string, key: string) => String(b.steps.find((o) => o.position === Number(n))?.outputs[key] ?? ''));
    s.placeholders = [];
    s.status = 'applied';
    s.error = '';
    s.can_run = false;
    s.outputs = (OUTPUTS[s.kind] ?? (() => ({})))(nextOut++);
    s.undo = s.irreversible ? { allowed: false, until: null, reason: 'irreversible' } : { allowed: true, until: '2026-10-14T10:42:00Z', reason: null };
  }

  function settle(b: Bundle) {
    const selected = b.steps.filter((s) => s.selected && s.status !== 'skipped');
    b.status = selected.every((s) => s.status === 'applied') ? 'done' : 'partly_done';
    b.run_finished_at = NOW;
    b.updated_at = NOW;
    b.can_run = false;
    b.can_reject = false;
    leave(b.id);
  }

  function run(b: Bundle, body: Record<string, unknown>) {
    if (refuseRun) {
      const answer = refuseRun;
      refuseRun = null;
      return json(answer.status, answer.body);
    }
    if (b.status !== 'waiting') return refusal409(b);
    const waiting = b.steps.filter((s) => s.status === 'proposed');
    const sent = Array.isArray(body.steps) ? (body.steps as { id: number; selected: boolean; fields?: StepFields }[]) : null;
    const ids = sent?.map((s) => s.id) ?? [];
    if (!sent || ids.length !== waiting.length || new Set(ids).size !== ids.length || waiting.some((s) => !ids.includes(s.id))) return json(400, { steps: ['List every waiting step once.'] });
    if (!sent.some((s) => s.selected)) return json(400, { steps: ['Choose at least one step to run.'] });
    for (const asked of sent) {
      const s = b.steps.find((candidate) => candidate.id === asked.id) as BundleStep;
      if (asked.selected && !s.can_run) return json(403, { code: 'CANT_RUN_STEP', detail: `You can't run step ${s.position}.`, step: s.id });
      for (const key of Object.keys(asked.fields ?? {})) {
        if (!asked.selected || !s.editable.includes(key)) return json(400, { steps: { [s.id]: { [key]: ["This can't be changed here."] } } });
        if (key === 'title' && String(asked.fields?.[key] ?? '').trim() === '') return json(400, { steps: { [s.id]: { title: ['Give the task a title.'] } } });
      }
    }
    b.run_by = READER;
    b.run_started_at = NOW;
    for (const asked of sent) {
      const s = b.steps.find((candidate) => candidate.id === asked.id) as BundleStep;
      s.selected = asked.selected;
      if (!asked.selected) {
        s.status = 'skipped';
        continue;
      }
      if (asked.fields && Object.keys(asked.fields).length > 0) {
        s.fields = { ...s.fields, ...asked.fields };
        if (typeof asked.fields.title === 'string') s.title = asked.fields.title;
        b.edited_at = NOW;
        b.edited_by = READER;
      }
    }
    for (const s of [...b.steps].sort((x, y) => x.position - y.position)) if (s.selected && s.status === 'proposed') runStep(b, s);
    settle(b);
    return json(200, { bundle: b });
  }

  function retry(b: Bundle, stepId: number, body: Record<string, unknown>) {
    const s = b.steps.find((candidate) => candidate.id === stepId);
    if (!s) return json(404, { code: 'NO_SUCH_BUNDLE', detail: 'No such bundle.' });
    if (b.status === 'running') return refusal409(b);
    if (s.status !== 'failed') return json(409, { code: 'NOT_FAILED', detail: 'Only a failed step can be retried.', bundle: b });
    const fields = (body.fields ?? {}) as StepFields;
    s.fields = { ...s.fields, ...fields };
    runStep(b, s);
    settle(b);
    return json(200, { bundle: b });
  }

  function reject(b: Bundle, body: Record<string, unknown>) {
    if (b.status !== 'waiting') return refusal409(b);
    if (!REASONS.includes(String(body.reason))) return json(400, { reason: ['Choose already handled, not relevant, wrong person or other.'] });
    const note = typeof body.note === 'string' ? body.note : '';
    if (note.length > 255) return json(400, { note: ['Keep the note under 255 characters.'] });
    for (const s of b.steps) if (s.status === 'proposed') s.status = 'rejected';
    Object.assign(b, { status: 'rejected', reject_reason: body.reason, reject_note: note, run_by: READER, updated_at: NOW, can_run: false, can_reject: false });
    leave(b.id);
    return json(200, { bundle: b });
  }

  function history(url: URL) {
    if (failHistory > 0) {
      failHistory -= 1;
      return json(500, { detail: 'Down.' });
    }
    const agent = url.searchParams.get('agent');
    const kind = url.searchParams.get('step_kind');
    const status = url.searchParams.get('status');
    if (agent !== null && !['cs', 'sales', 'ops'].includes(agent)) return json(400, { agent: ['Choose cs, sales or ops.'] });
    if (status !== null && !FINISHED_STATUSES.includes(status as FinishedStatus)) return json(400, { status: ['Choose done, partly done, rejected, expired or superseded.'] });
    const rows = [...bundles.values()]
      .filter((b) => FINISHED_STATUSES.includes(b.status as FinishedStatus))
      .filter((b) => (agent ? b.agent === agent : true) && (status ? b.status === status : true) && (kind ? b.steps.some((s) => s.kind === kind) : true))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id);
    const size = stub.historyPageSize ?? 50;
    const page = Number(url.searchParams.get('page') ?? '1');
    const start = (page - 1) * size;
    if (start > 0 && start >= rows.length) return json(404, { detail: 'Invalid page.' });
    const at = (n: number) => `http://localhost/api/v1/agents/bundles/history/?page=${n}`;
    return json(200, { count: rows.length, next: start + size < rows.length ? at(page + 1) : null, previous: page > 1 ? at(page - 1) : null, results: rows.slice(start, start + size), hidden: stub.historyHidden ?? 0 });
  }

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (method === 'GET' && path === '/agents/bundles/history/') return history(url);
    const match = /^\/agents\/bundles\/(\d+)\/(?:(run|reject)\/|steps\/(\d+)\/retry\/)?$/.exec(path);
    if (match) {
      const b = bundles.get(Number(match[1]));
      if (!b) return json(404, { code: 'NO_SUCH_BUNDLE', detail: 'No such bundle.' });
      if (method === 'GET' && !match[2] && !match[3]) return json(200, b);
      if (method === 'POST' && match[2] === 'run') return run(b, body);
      if (method === 'POST' && match[2] === 'reject') return reject(b, body);
      if (method === 'POST' && match[3]) return retry(b, Number(match[3]), body);
    }
    const action = /^\/agents\/actions\/(\d+)\/$/.exec(path);
    if (method === 'GET' && action && stub.actions?.[Number(action[1])] !== undefined) {
      return json(200, { id: Number(action[1]), bundle: stub.actions[Number(action[1])] });
    }
    return feed.spy(input, init);
  });
  vi.stubGlobal('fetch', spy);
  return { spy, feed, bundles };
}
```

- [ ] **Step 6: Run the stub tests, then fix the old stub tests**

Run: `npx vitest run src/features/agents/testBundles.test.ts src/features/work/testFeed.test.ts --maxWorkers=2`
Expected: `testBundles.test.ts` PASS. In `testFeed.test.ts`, every test that decided `APPROVAL`/`TEAM_APPROVAL` through `/agents/actions/<id>/approve/` now decides `REVIEW`/`TEAM_QUESTION` instead (same assertions on the item leaving), and the `kind=` refusal sentence is the new one. Re-run until PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/agents/testBundleFixtures.ts src/features/agents/testBundles.ts src/features/agents/testBundles.test.ts src/features/work/testFeedFixtures.ts src/features/work/testFeed.ts src/features/work/testFeed.test.ts
git commit -m "test(work): stub bundles, the queue list, the bundle kind and Team kind filters

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The bundle's words and pure rules

**Files:**
- Create: `src/features/agents/bundleText.ts`, `src/features/agents/bundleText.test.ts`

**Interfaces:**
- Consumes: Task 1 types; `DISMISS_REASONS` from `src/features/work/recommended.ts`.
- Produces: `BUNDLE` (words); `STATUS_WORD: Record<BundleStatus, string>`; `REJECT_REASONS`; `runLabel(n)`; `Draft = Record<number, { selected: boolean; fields: StepFields }>`; `draftOf(bundle): Draft`; `runnable(step): boolean`; `selectedCount(bundle, draft)`; `changedFields(step, entry): StepFields`; `runBody(bundle, draft): RunBody`; `isDirty(bundle, draft): boolean`; `showsCantUndo(step, fields): boolean`; `PLACEHOLDER_RE`; `textParts(text, placeholders): (string | { chip: string })[]`; `audienceText(audience, limit?)`; `summaryText(bundle)`; `outputLinks(outputs): { label: string; to: string }[]`; `expiredText(reason)`; `stepStateText(step)`; `readRunRefusal(err): RunRefusal`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/agents/bundleText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { B_CAMPAIGN, B_PARTLY, B_PIZZA, B_SURVEY } from './testBundleFixtures';
import {
  audienceText,
  draftOf,
  isDirty,
  outputLinks,
  readRunRefusal,
  runBody,
  runLabel,
  selectedCount,
  showsCantUndo,
  summaryText,
  textParts,
} from './bundleText';

describe('bundleText (agent bundles D1, frontend Decisions 6 to 15)', () => {
  it('starts every runnable step ticked and every other step unticked', () => {
    const draft = draftOf(B_PIZZA);
    expect([draft[41].selected, draft[42].selected, draft[43].selected]).toEqual([true, true, false]);
    expect(selectedCount(B_PIZZA, draft)).toBe(2);
    expect(runLabel(2)).toBe('Run 2 selected');
    expect(runLabel(1)).toBe('Run 1 selected');
  });

  it('names every waiting step once and sends only changed fields on ticked steps', () => {
    const draft = draftOf(B_PIZZA);
    expect(isDirty(B_PIZZA, draft)).toBe(false);
    draft[41].fields = { ...draft[41].fields, title: 'Call today' };
    draft[42].selected = false;
    draft[42].fields = { ...draft[42].fields, body: 'Ignored' };
    expect(isDirty(B_PIZZA, draft)).toBe(true);
    expect(runBody(B_PIZZA, draft)).toEqual({
      steps: [
        { id: 41, selected: true, fields: { title: 'Call today' } },
        { id: 42, selected: false },
        { id: 43, selected: false },
      ],
    });
  });

  it("shows Can't be undone while Save as draft only is off", () => {
    const send = B_CAMPAIGN.steps[0];
    expect(showsCantUndo(send, send.fields)).toBe(true);
    expect(showsCantUndo(send, { ...send.fields, draft_only: true })).toBe(false);
    expect(showsCantUndo(B_PIZZA.steps[0], B_PIZZA.steps[0].fields)).toBe(false);
  });

  it('turns placeholders into chips, never raw braces, and leaves other braces alone', () => {
    const task = B_CAMPAIGN.steps[1];
    expect(textParts(task.title, task.placeholders)).toEqual(['Follow up on ', { chip: 'Campaign link from step 1' }]);
    expect(textParts('Hi {first_name} {{nope}}', [])).toEqual(['Hi {first_name} {{nope}}']);
    expect(textParts('{{ step 2.task_id }}', [])).toEqual([{ chip: 'From step 2' }]);
  });

  it('says the audience, the summary and the links', () => {
    expect(audienceText(B_SURVEY.steps[0].preview.survey!.audience, 500)).toBe('42 contacts across 3 organisations · at most 500');
    expect(audienceText({ contacts: 1, records: 1, record_noun: 'accounts' })).toBe('1 contact across 1 account');
    expect(summaryText(B_PARTLY)).toBe('1 of 2 steps ran. Retry the failed one.');
    expect(summaryText({ ...B_PARTLY, status: 'done', steps: [B_PARTLY.steps[0]] })).toBe('Done: all 1 step ran.');
    expect(outputLinks({ task_id: 9, task_url: '/work/mine?task=9', segment_id: 5, segment_url: '/segments/5', note_id: 3 })).toEqual([
      { label: 'Open task', to: '/work/mine?task=9' },
      { label: 'Open segment', to: '/segments/5' },
    ]);
  });

  it('reads a run refusal: a form line, field errors by step, a 409 bundle', () => {
    expect(readRunRefusal(new ApiError(400, { steps: ['Choose at least one step to run.'] }, 'Bad request'))).toEqual({ form: 'Choose at least one step to run.', fields: {}, bundle: null, lost: false });
    expect(readRunRefusal(new ApiError(400, { steps: { 41: { title: ['Give the task a title.'] } } }, 'Bad request')).fields).toEqual({ 41: { title: 'Give the task a title.' } });
    const conflict = readRunRefusal(new ApiError(409, { code: 'BUNDLE_RAN', detail: 'Carl CSM ran this at 10:42.', bundle: B_PARTLY }, 'Conflict'));
    expect([conflict.form, conflict.bundle?.id]).toEqual(['Carl CSM ran this at 10:42.', 16]);
    expect(readRunRefusal(new ApiError(404, { code: 'NO_SUCH_BUNDLE', detail: 'No such bundle.' }, 'Not found')).lost).toBe(true);
  });
});
```

(`ApiError` is `new ApiError(status, body, message)`.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/agents/bundleText.test.ts --maxWorkers=2`
Expected: FAIL (`./bundleText` does not exist).

- [ ] **Step 3: Write `bundleText.ts`**

```ts
// The bundle panel's words and pure rules (agent bundles D1 contract §3, §4,
// §6, §9; frontend Decisions 6 to 15). Kept free of React. No em dash.
import { ApiError } from '../../lib/apiClient';
import { DISMISS_REASONS } from '../work/recommended';
import type { Audience, Bundle, BundleStatus, BundleStep, Placeholder, RejectReason, RunBody, StepFields } from './bundleTypes';

export const BUNDLE = {
  REVIEW: 'Review',
  LOAD: 'Could not load this bundle.',
  LOADING: 'Loading the bundle',
  LOST: "You can't open that any more.",
  STEPS: 'Steps',
  CANT_UNDO: "Can't be undone",
  RUNNING: 'Running…',
  RUN_FAILED: 'Could not run this bundle. Try again.',
  NONE_SELECTED: 'Choose at least one step to run.',
  RETRY: 'Retry',
  RETRYING: 'Retrying…',
  RETRY_FAILED: 'Could not retry this step. Try again.',
  REJECT: 'Reject bundle',
  REJECT_IT: 'Reject it',
  REJECTING: 'Rejecting…',
  REJECT_FAILED: 'Could not reject this bundle. Try again.',
  WHY: 'Why',
  CHOOSE_REASON: 'Choose a reason.',
  NOTE: 'Note (optional)',
  NOTE_HINT: 'Up to 255 characters.',
  CANCEL: 'Cancel',
  DISCARD_TITLE: 'Discard your edits?',
  DISCARD: 'Discard',
  KEEP: 'Keep editing',
  REJECTED: 'Rejected.',
  DRAFT_ONLY: 'Save as draft only',
  QUESTION: 'Question',
  AUDIENCE: 'Audience',
  ROLES: 'Who at each record',
  SURVEY_TYPE: 'Survey type',
  NAME: 'Name',
  SUBJECT: 'Subject',
  BODY: 'Message',
  INTRO: 'Intro',
  TITLE: 'Title',
  NOTE_TITLE: 'Note title',
  NOTE_BODY: 'Note',
  REPLY: 'Reply',
  ALREADY_RAN: 'Applied',
  SKIPPED: 'Not run',
  REJECTED_STEP: 'Rejected',
  UNDONE: 'Undone',
  FROM: 'From',
  STEP_COUNT_ONE: '1 step',
} as const;

export const STATUS_WORD: Record<BundleStatus, string> = {
  waiting: 'Waiting',
  running: 'Running',
  done: 'Done',
  partly_done: 'Partly done',
  rejected: 'Rejected',
  expired: 'Expired',
  superseded: 'Replaced',
};

export const REJECT_REASONS: { value: RejectReason; label: string }[] = DISMISS_REASONS;

export const runLabel = (n: number): string => `Run ${n} selected`;
export const stepCountText = (n: number): string => (n === 1 ? BUNDLE.STEP_COUNT_ONE : `${n} steps`);
export const filledInText = (n: number): string => `Filled in from step ${n} when it runs.`;

/** The panel's edits, per step id, until Run (contract D10). */
export type Draft = Record<number, { selected: boolean; fields: StepFields }>;

export const runnable = (step: BundleStep): boolean => step.status === 'proposed' && step.can_run;

export function draftOf(bundle: Bundle): Draft {
  return Object.fromEntries(bundle.steps.map((step) => [step.id, { selected: runnable(step) && step.selected, fields: { ...step.fields } }]));
}

export const selectedCount = (bundle: Bundle, draft: Draft): number => bundle.steps.filter((step) => runnable(step) && draft[step.id]?.selected).length;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The editable keys whose value differs from the stored one. */
export function changedFields(step: BundleStep, fields: StepFields): StepFields {
  return Object.fromEntries(Object.entries(fields).filter(([key, value]) => step.editable.includes(key) && !same(value, step.fields[key])));
}

/** Every waiting step once; fields only on ticked steps, only changed ones (contract §5.1). */
export function runBody(bundle: Bundle, draft: Draft): RunBody {
  return {
    steps: bundle.steps
      .filter((step) => step.status === 'proposed')
      .map((step) => {
        const entry = draft[step.id];
        const selected = runnable(step) && Boolean(entry?.selected);
        const fields = selected && entry ? changedFields(step, entry.fields) : {};
        return Object.keys(fields).length > 0 ? { id: step.id, selected, fields } : { id: step.id, selected };
      }),
  };
}

export function isDirty(bundle: Bundle, draft: Draft): boolean {
  const start = draftOf(bundle);
  return bundle.steps.some((step) => {
    const entry = draft[step.id];
    return entry !== undefined && (entry.selected !== start[step.id].selected || Object.keys(changedFields(step, entry.fields)).length > 0);
  });
}

const SENDS = ['campaign.send', 'survey.send'];

/** Contract §3: a kind with "Save as draft only" can't be undone while the switch is off. */
export function showsCantUndo(step: BundleStep, fields: StepFields): boolean {
  if (step.editable.includes('draft_only')) return (SENDS.includes(step.kind) || step.outside) && fields.draft_only !== true;
  return step.irreversible;
}

export const PLACEHOLDER_RE = /\{\{\s*step\s+(\d+)\.([a-z_]+)\s*\}\}/g;

/** Text with each `{{step N.key}}` as a chip (frontend Decision 10). */
export function textParts(text: string, placeholders: Placeholder[]): (string | { chip: string })[] {
  const parts: (string | { chip: string })[] = [];
  let last = 0;
  for (const match of text.matchAll(PLACEHOLDER_RE)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    const named = placeholders.find((p) => p.step === Number(match[1]) && p.key === match[2]);
    parts.push({ chip: named ? named.label : `${BUNDLE.FROM} step ${match[1]}` });
    last = at + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const one = (noun: string) => noun.replace(/s$/, '');

export function audienceText(audience: Audience, limit?: number): string {
  const people = `${audience.contacts} ${audience.contacts === 1 ? 'contact' : 'contacts'}`;
  const records = `${audience.records} ${audience.records === 1 ? one(audience.record_noun) : audience.record_noun}`;
  const text = `${people} across ${records}`;
  return limit ? `${text} · at most ${limit}` : text;
}

/** The line that takes focus after a run (frontend Decision 11). */
export function summaryText(bundle: Bundle): string {
  const ran = bundle.steps.filter((step) => step.selected && step.status !== 'skipped');
  const applied = ran.filter((step) => step.status === 'applied' || step.status === 'undone').length;
  const failed = ran.filter((step) => step.status === 'failed').length;
  if (bundle.status === 'rejected') return BUNDLE.REJECTED;
  if (applied === 0 && failed === 0) return 'Nothing ran: every step had expired.';
  if (bundle.status === 'done') return `Done: all ${applied} ${applied === 1 ? 'step' : 'steps'} ran.`;
  return `${applied} of ${ran.length} steps ran. ${failed === 1 ? 'Retry the failed one.' : 'Retry the failed ones.'}`;
}

const LINK_LABEL: Record<string, string> = {
  task_url: 'Open task',
  campaign_url: 'Open campaign',
  survey_url: 'Open survey',
  segment_url: 'Open segment',
  rule_url: 'Open scenario',
  canvas_url: 'Open map',
};

/** A step's result links (contract §6.2): only `*_url` keys with a page, in the table's order. */
export function outputLinks(outputs: Record<string, string | number>): { label: string; to: string }[] {
  return Object.keys(LINK_LABEL)
    .filter((key) => typeof outputs[key] === 'string' && String(outputs[key]).startsWith('/'))
    .map((key) => ({ label: LINK_LABEL[key], to: String(outputs[key]) }));
}

const EXPIRED: Record<string, string> = {
  changed: 'the record changed since',
  not_reproposed: 'the agent no longer proposes it',
  replaced: 'the agent no longer proposes it',
  never: 'this action is now set to never',
  waited: 'it waited 14 days',
  date_passed: 'its date has passed',
};

export const expiredText = (reason: string): string => `Expired: ${EXPIRED[reason] ?? 'it expired'}.`;

/** A finished step's state line (not a failed one: that is its error). */
export function stepStateText(step: BundleStep): string | null {
  if (step.status === 'applied') return BUNDLE.ALREADY_RAN;
  if (step.status === 'skipped') return BUNDLE.SKIPPED;
  if (step.status === 'rejected') return BUNDLE.REJECTED_STEP;
  if (step.status === 'undone') return BUNDLE.UNDONE;
  if (step.status === 'expired') return expiredText(step.expired_reason);
  return null;
}

export interface RunRefusal {
  form: string | null;
  /** step id: field: its first message. */
  fields: Record<number, Record<string, string>>;
  /** A 409's bundle as it is now. */
  bundle: Bundle | null;
  /** 404: the reader lost the bundle. */
  lost: boolean;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const first = (value: unknown): string | null => (Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null);

/** Contract §9: run, retry and reject refusals, read for the panel. */
export function readRunRefusal(err: unknown, fallback: string = BUNDLE.RUN_FAILED): RunRefusal {
  const out: RunRefusal = { form: null, fields: {}, bundle: null, lost: false };
  if (!(err instanceof ApiError) || !isObject(err.body)) return { ...out, form: fallback };
  const body = err.body;
  if (err.status === 404) return { ...out, lost: true };
  if (isObject(body.bundle)) out.bundle = body.bundle as unknown as Bundle;
  const whole = first(body.steps);
  if (whole) return { ...out, form: whole };
  if (isObject(body.steps)) {
    for (const [id, value] of Object.entries(body.steps)) {
      if (!isObject(value)) continue;
      const fields: Record<string, string> = {};
      for (const [key, messages] of Object.entries(value)) {
        const message = first(messages);
        if (message) fields[key] = message;
      }
      out.fields[Number(id)] = fields;
    }
    if (Object.keys(out.fields).length > 0) return out;
  }
  for (const key of ['reason', 'note']) {
    const message = first(body[key]);
    if (message) return { ...out, fields: { 0: { [key]: message } } };
  }
  if (typeof body.detail === 'string') return { ...out, form: body.detail };
  return { ...out, form: fallback };
}
```

(Reject's field errors come back under step id `0`: `BundleReject` reads `refusal.fields[0]?.reason` and `.note`.)

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/features/agents/bundleText.test.ts --maxWorkers=2`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/agents/bundleText.ts src/features/agents/bundleText.test.ts
git commit -m "feat(agents): the bundle panel's words and rules (run body, placeholders, summaries)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The bundle kind in the feed, and the bundle row

**Files:**
- Create: `src/components/work/BundleRow.tsx`, `src/components/work/BundleRow.test.tsx`
- Modify: `src/features/work/feed.ts` (+ `feed.test.ts`), `src/components/work/FeedRow.tsx`, `FeedRowParts.tsx`, `FeedDecideRows.tsx` (+ test), `FeedGroups.tsx`, `useFeedSettle.ts`, `TeamQueue.tsx`, `NextUpCard.tsx`, `src/pages/work/MyWork.tsx`, `src/components/work/FeedRow.test.tsx`, `FeedGroups.test.tsx`, `FeedSuggestionRow.test.tsx`

**Interfaces:**
- Consumes: `BundleFeedItem` (Task 1), `bundleItem`, `B_PIZZA` (Task 2), `BUNDLE`, `stepCountText` (Task 3).
- Produces: `FeedChip = 'bundle' | 'approval' | 'task' | 'todo' | 'question' | 'suggestion'`; `FEED_CHIPS` in the spec's order; `chipsFor(queue)` lives in Task 5; `bundleHref(pathname: string, params: URLSearchParams, id: number): string`; `BundleRow({ item, group })`; `FeedRowProps` without `onApplied`; `useFeedSettle` without `applied`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/work/BundleRow.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { B_CAMPAIGN, B_PIZZA, bundleItem } from '../../features/agents/testBundleFixtures';
import { BundleRow } from './BundleRow';

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{`${pathname}${search}`}</p>;
}

function renderRow(ui: React.ReactNode, url = '/work?queue=mine') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <ul>{ui}</ul>
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BundleRow (frontend Decision 4)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the title, the reason, the step kinds and the meta line, and Review opens the panel keeping the queue', async () => {
    renderRow(<BundleRow item={bundleItem(B_PIZZA)} group="decide" />, '/work?queue=mine&kind=bundle');
    expect(screen.getByRole('heading', { name: B_PIZZA.title })).toBeInTheDocument();
    expect(screen.getByText(B_PIZZA.reason)).toBeInTheDocument();
    expect(screen.getByText('Create a task · File a note · Change lifecycle stage')).toBeInTheDocument();
    expect(screen.getByText('3 steps')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    await userEvent.click(screen.getByRole('link', { name: `Review ${B_PIZZA.title}` }));
    expect(screen.getByTestId('where')).toHaveTextContent('/work?queue=mine&kind=bundle&bundle=12');
  });

  it('says who it is for on a team queue, and the whole company with no owner', () => {
    renderRow(<BundleRow item={bundleItem(B_CAMPAIGN, true)} group="decide" />, '/work?queue=company');
    expect(screen.getByText('For the whole company')).toBeInTheDocument();
  });
});
```

In `src/features/work/feed.test.ts`, replace the chips test with:

```ts
  it('offers the spec chips in order, Approvals meaning rule reviews, and reads approval as before', () => {
    expect(FEED_CHIPS.map((c) => c.label)).toEqual(['All', 'Bundles', 'Approvals', 'Tasks', 'To-dos', 'Questions', 'Suggestions']);
    expect(kindsOf('bundle')).toEqual(['bundle']);
    expect(kindsOf('approval')).toEqual(['rule_review']);
    expect(chipAllows('approval', 'bundle')).toBe(false);
    expect(emptyTitle('bundle')).toBe('No bundles waiting.');
    expect(failedText(['bundle', 'question'])).toBe("Couldn't load bundles and questions.");
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/work/BundleRow.test.tsx src/features/work/feed.test.ts --maxWorkers=2`
Expected: FAIL (`./BundleRow` missing; chip labels differ).

- [ ] **Step 3: The feed's words**

In `src/features/work/feed.ts`:

```ts
/** A chip's `?kind=` value (agent bundles D1 frontend Decision 3). No value: All. */
export type FeedChip = 'bundle' | 'approval' | 'task' | 'todo' | 'question' | 'suggestion';

export const FEED_CHIPS: readonly { key: FeedChip | null; label: string }[] = [
  { key: null, label: 'All' },
  { key: 'bundle', label: 'Bundles' },
  { key: 'approval', label: 'Approvals' },
  { key: 'task', label: 'Tasks' },
  { key: 'todo', label: 'To-dos' },
  { key: 'question', label: 'Questions' },
  { key: 'suggestion', label: 'Suggestions' },
];

const CHIP_KINDS: Record<FeedChip, readonly FeedKind[]> = {
  bundle: ['bundle'],
  approval: ['rule_review'],
  task: ['task'],
  todo: ['todo'],
  question: ['question'],
  suggestion: ['suggestion'],
};
```

`DECIDE_RANK`: `{ rule_review: 0, bundle: 1, question: 2, draft: 3 }`; the module's `DECIDE_KINDS`: `['bundle', 'rule_review', 'question', 'draft']`; `KIND_NOUN`: replace `approval: 'approvals'` with `bundle: 'bundles'`; `CHIP_NOUN`: add `bundle: 'bundles'` and make `approval: 'approvals'`; `FEED.EMPTY_DETAIL`: `'Add a to-do above. Bundles, approvals, questions and tasks show here when they need you.'`; `NEXT_UP_KINDS`: `['bundle', 'rule_review', 'question', 'draft', 'task', 'todo']`. Delete `approvedText` only if `grep -rn approvedText src` finds no reader after Step 5 (ReviewRow still uses it: keep). Add:

```ts
/** The panel's link: on Work, the page's query kept with `bundle` set; anywhere else (Copilot's Next up), Mine with the panel open (frontend Decisions 4, 18). */
export function bundleHref(pathname: string, params: URLSearchParams, id: number): string {
  if (pathname !== '/work') return `/work?queue=mine&bundle=${id}`;
  const query = new URLSearchParams(params);
  query.set('bundle', String(id));
  return `/work?${query.toString()}`;
}
```

- [ ] **Step 4: The row**

Create `src/components/work/BundleRow.tsx`:

```tsx
import { useId } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { BUNDLE, stepCountText } from '../../features/agents/bundleText';
import { bundleHref } from '../../features/work/feed';
import type { BundleFeedItem, FeedGroupKey } from '../../features/work/workTypes';
import { BUTTON, NUM, TYPE } from '../ui';
import { FeedRowMeta, KIND_ICON, ROW_FOCUS } from './FeedRowParts';
import { OPENED_HERE } from './useTaskLink';

/** A waiting bundle (spec §8.1 list; frontend Decision 4): its title, why,
 *  the kinds of its waiting steps, the meta line and Review, which opens the
 *  panel over the list (`?bundle=`, pushed so Back closes it). */
export function BundleRow({ item, group }: { item: BundleFeedItem; group: FeedGroupKey }) {
  const titleId = useId();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const Icon = KIND_ICON.bundle;
  const d = item.detail;
  return (
    <li data-item={item.key} className={`flex items-start gap-3 px-4 py-3 ${ROW_FOCUS}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <article aria-labelledby={titleId} className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 id={titleId} className={`${TYPE.body} break-words font-semibold`}>
          {item.title}
        </h3>
        {d.reason ? <p className={`max-w-[68ch] ${TYPE.bodyMuted}`}>{d.reason}</p> : null}
        {d.kinds.length > 0 ? <p className={TYPE.body}>{d.kinds.join(' · ')}</p> : null}
        <FeedRowMeta item={item} group={group} extra={<span className={NUM}>{stepCountText(d.step_count)}</span>} />
        <Link to={bundleHref(pathname, params, item.id)} state={OPENED_HERE} aria-label={`${BUNDLE.REVIEW} ${item.title}`} className={`${BUTTON} self-start`}>
          {BUNDLE.REVIEW}
        </Link>
      </article>
    </li>
  );
}
```

In `FeedRowParts.tsx`: `KIND_ICON`'s `approval: Bot` becomes `bundle: Layers` (import `Layers` from lucide-react, drop `Bot` if unused); `FeedRowMeta` takes an optional `extra?: ReactNode` pushed right after the `from` label part (`if (extra) parts.push(<span key="extra">{extra}</span>);`).

In `FeedRow.tsx`: remove `onApplied` from `FeedRowProps` and the destructuring; `case 'bundle': return <BundleRow item={item} group={group} />;` in place of `case 'approval'`. In `FeedDecideRows.tsx`: delete `ApprovalRow` and its imports (`AgentActionBody`, `AgentActionDecision`, `AGENTS`, `AgentAction` where unused). In `useFeedSettle.ts`: delete `applied` and its imports (`undoAction`, `refusalDetail`, `AgentAction`, `ApprovalFeedItem`, `taskChanged`, `sentence` where unused). In `FeedGroups.tsx` drop `'onApplied'` from `Handlers`. In `MyWork.tsx`, `TeamQueue.tsx` and `NextUpCard.tsx` drop `onApplied` from the handlers they pass (and `NextUpCard`'s `ApprovalFeedItem`/`AgentAction` imports). In the tests listed under **Files**, replace `APPROVAL`/`approvalItem(...)` with `BUNDLE_ITEM`/`bundleItem(...)` and delete the tests that applied an approval in a row (that path is the panel's now, Task 7); in `FeedDecideRows.test.tsx` delete the `ApprovalRow` describe.

- [ ] **Step 5: Run the tests, the type check and the lint**

Run: `npx vitest run src/components/work src/features/work src/pages/work/MyWork.test.tsx --maxWorkers=2 && npx tsc -b && npm run lint`
Expected: PASS, no type errors in `src/components/work`, `src/features/work`, `src/pages/work/MyWork.tsx`. (`src/e2e/agents.test.tsx` still imports `approvalItem`: Task 13 rewrites it; until then exclude nothing, but expect that one file's errors only.) Then `npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`: deleting `ApprovalRow` may lower totals; set `BASELINE` to the new totals.

- [ ] **Step 6: Commit**

```bash
git add src/components/work/BundleRow.tsx src/components/work/BundleRow.test.tsx src/features/work/feed.ts src/features/work/feed.test.ts src/components/work/FeedRow.tsx src/components/work/FeedRow.test.tsx src/components/work/FeedRowParts.tsx src/components/work/FeedDecideRows.tsx src/components/work/FeedDecideRows.test.tsx src/components/work/FeedGroups.tsx src/components/work/FeedGroups.test.tsx src/components/work/FeedSuggestionRow.test.tsx src/components/work/useFeedSettle.ts src/components/work/TeamQueue.tsx src/components/work/NextUpCard.tsx src/pages/work/MyWork.tsx src/test/uiRatchet.test.ts
git commit -m "feat(work): bundles in the feed with a Review row; the Approvals chip means rule reviews

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The inbox: queue rules, the rail, one route and the redirects

**Files:**
- Create: `src/features/work/queues.ts`, `src/features/work/queues.test.ts`, `src/components/work/useQueues.ts`, `src/components/work/useQueues.test.tsx`, `src/components/work/QueueRail.tsx`, `src/components/work/QueueRail.test.tsx`, `src/components/work/KindChips.tsx`, `src/pages/work/WorkInbox.tsx`, `src/pages/work/WorkInbox.test.tsx`
- Modify: `src/pages/work/WorkRoutes.tsx`, `src/pages/work/WorkRoutes.test.tsx`, `src/pages/work/MyWork.tsx`, `src/pages/work/MyWork.test.tsx`, `src/components/work/WorkFrame.tsx` (comment only), `src/features/work/workTabs.ts`, `src/features/work/workTabs.test.ts`
- Delete: `src/components/layout/WorkTabs.tsx` (and `WorkTabs.test.tsx` if it exists)

**Interfaces:**
- Consumes: `fetchQueues` (Task 1), the stub's `/work/queues/` (Task 2), `FEED_CHIPS`, `chipOf` (Task 4).
- Produces: `QUEUE` words; `BODY_QUEUES`; `queueOf(params): QueueKey`; `queueHref(key): string`; `chipsFor(queue)`; `optionText(row)`; `FALLBACK_QUEUES`; `isQueueRefusal(err)`; `teamRedirect(search): string`; `useQueues(): { data, error, reload }`; `QueueRail({ rows, current })`; `QueueSelect({ rows, current })` (same file); `KindChips({ queue })`; `WorkInbox()`; `MyWorkPage` renders without its own `WorkFrame`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/work/queues.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { FALLBACK_QUEUES, chipsFor, isQueueRefusal, optionText, queueHref, queueOf, teamRedirect } from './queues';

describe('queues (agent bundles D1 frontend Decisions 1 to 3)', () => {
  it('reads the queue from the URL, Mine by default, delivery 2 keys kept', () => {
    expect(queueOf(new URLSearchParams(''))).toBe('mine');
    expect(queueOf(new URLSearchParams('queue=history'))).toBe('history');
    expect(queueOf(new URLSearchParams('queue=department:4'))).toBe('department:4');
    expect(queueOf(new URLSearchParams('queue=nonsense'))).toBe('mine');
  });

  it('links a queue with nothing else kept, and names a phone option with its count', () => {
    expect(queueHref('team')).toBe('/work?queue=team');
    expect(optionText({ key: 'mine', label: 'Mine', count: 4 })).toBe('Mine (4)');
    expect(optionText({ key: 'history', label: 'History', count: null })).toBe('History');
    expect(FALLBACK_QUEUES.map((q) => q.key)).toEqual(['mine', 'history']);
  });

  it('offers To-dos on Mine only and no chips on History', () => {
    expect(chipsFor('mine').map((c) => c.label)).toEqual(['All', 'Bundles', 'Approvals', 'Tasks', 'To-dos', 'Questions', 'Suggestions']);
    expect(chipsFor('team').map((c) => c.label)).toEqual(['All', 'Bundles', 'Approvals', 'Tasks', 'Questions', 'Suggestions']);
    expect(chipsFor('history')).toEqual([]);
  });

  it('turns an old Team link into its queue, the rest of the query kept', () => {
    expect(teamRedirect('?scope=company&task=4')).toBe('/work?task=4&queue=company');
    expect(teamRedirect('')).toBe('/work?queue=team');
    expect(teamRedirect('?scope=me')).toBe('/work?queue=team');
  });

  it('knows a queue the reader may no longer use', () => {
    expect(isQueueRefusal(new ApiError(403, { code: 'SCOPE_NOT_ALLOWED', detail: "You can't see that view." }, 'Forbidden'))).toBe(true);
    expect(isQueueRefusal(new ApiError(500, {}, 'Down'))).toBe(false);
  });
});
```

Create `src/pages/work/WorkInbox.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubBundles } from '../../features/agents/testBundles';
import { resetViewport } from '../../test/viewport';
import { renderWork, where } from './testPages';

describe('Work inbox (spec §8.1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('shows the queues with counts, Mine open, and moves between queues in the URL', async () => {
    stubBundles();
    renderWork('/work');
    const rail = await screen.findByRole('navigation', { name: 'Queues' });
    const mine = await within(rail).findByRole('link', { name: /^Mine \d+$/ });
    expect(mine).toHaveAttribute('aria-current', 'page');
    expect(within(rail).getByRole('link', { name: 'History' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: /^Needs your decision/ })).toBeInTheDocument();
    await userEvent.click(within(rail).getByRole('link', { name: /^My team/ }));
    await waitFor(() => expect(where()).toBe('/work?queue=team'));
    expect(await screen.findByRole('heading', { name: 'Waiting on your team' })).toBeInTheDocument();
  });

  it('keeps the kind filter in the URL and drops it when the queue changes', async () => {
    stubBundles();
    renderWork('/work?queue=mine');
    await userEvent.click(await screen.findByRole('button', { name: 'Bundles' }));
    await waitFor(() => expect(where()).toBe('/work?queue=mine&kind=bundle'));
    expect(await screen.findByRole('region', { name: 'Needs your decision 1' })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Queues' })).getByRole('link', { name: /^Rest of company/ }));
    await waitFor(() => expect(where()).toBe('/work?queue=company'));
  });

  it('is a select on phones', async () => {
    stubBundles();
    renderWork('/work?queue=mine', { width: 390 });
    const select = await screen.findByLabelText('Queue');
    expect(screen.queryByRole('navigation', { name: 'Queues' })).not.toBeInTheDocument();
    await waitFor(() => expect(within(select).getByRole('option', { name: /^My team \(\d+\)$/ })).toBeInTheDocument());
    await userEvent.selectOptions(select, 'history');
    await waitFor(() => expect(where()).toBe('/work?queue=history'));
  });

  it('falls back to Mine for a queue the reader is not offered', async () => {
    stubBundles({ offered: ['me'] });
    renderWork('/work?queue=company&kind=bundle', { role: 'csm' });
    await waitFor(() => expect(where()).toBe('/work?queue=mine'));
  });
});
```

In `src/pages/work/WorkRoutes.test.tsx` replace the redirect tests:

```tsx
  it.each([
    ['/work/mine?task=41', '/work?task=41&queue=mine'],
    ['/work/today?task=41', '/work?task=41&queue=mine'],
    ['/work/recommended', '/work?kind=suggestion&queue=mine'],
    ['/work/team?scope=company', '/work?queue=company'],
    ['/work/team', '/work?queue=team'],
    ['/work/anything', '/work'],
  ])('sends %s to %s', async (from, to) => {
    stubBundles();
    renderWork(from);
    await waitFor(() => expect(where()).toBe(to));
  });

  it('opens a bell task link on Mine', async () => {
    stubBundles();
    renderWork('/work/mine?task=41');
    expect(await screen.findByRole('dialog', { name: 'Call Pizza Hut' })).toBeInTheDocument();
  });
```

(import `stubBundles` from `'../../features/agents/testBundles'`; delete the old `/work/team` gate test: the inbox's fallback covers it, Step 1's last test.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/work/queues.test.ts src/pages/work/WorkInbox.test.tsx src/pages/work/WorkRoutes.test.tsx --maxWorkers=2`
Expected: FAIL (`./queues` and `./WorkInbox` do not exist).

- [ ] **Step 3: The queue rules**

Create `src/features/work/queues.ts`:

```ts
// The inbox's queues (agent bundles D1 contract §10.3; frontend Decisions 1
// to 3). Kept free of React. No em dash.
import { ApiError } from '../../lib/apiClient';
import type { QueueKey, QueueRow } from '../agents/bundleTypes';
import { FEED_CHIPS, type FeedChip } from './feed';

export const QUEUE = {
  RAIL: 'Queues',
  SELECT: 'Queue',
  LOAD: 'Could not load the queues.',
  TEAM_TITLE: 'Waiting on your team',
  COMPANY_TITLE: 'Waiting on the rest of the company',
  PEOPLE: 'People',
} as const;

const KEY = /^(mine|team|company|history|unassigned|department:\d+)$/;

export function queueOf(params: URLSearchParams): QueueKey {
  const asked = params.get('queue');
  return asked !== null && KEY.test(asked) ? (asked as QueueKey) : 'mine';
}

/** A queue's link: the queue only (its kind filter and an open panel stay behind). */
export const queueHref = (key: QueueKey): string => `/work?queue=${encodeURIComponent(key)}`;

export const optionText = (row: QueueRow): string => (row.count === null ? row.label : `${row.label} (${row.count})`);

/** What the rail shows before GET /work/queues/ answers: never a spinner. */
export const FALLBACK_QUEUES: QueueRow[] = [
  { key: 'mine', label: 'Mine', count: null },
  { key: 'history', label: 'History', count: null },
];

/** Mine: every chip; the team queues: no To-dos (contract §10.2); History: none. */
export function chipsFor(queue: QueueKey): readonly { key: FeedChip | null; label: string }[] {
  if (queue === 'history') return [];
  if (queue === 'mine') return FEED_CHIPS;
  return FEED_CHIPS.filter((chip) => chip.key !== 'todo');
}

export function isQueueRefusal(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403 && typeof err.body === 'object' && err.body !== null && (err.body as { code?: unknown }).code === 'SCOPE_NOT_ALLOWED';
}

/** /work/team?scope=team|company (Work in one place) to its queue, the rest kept. */
export function teamRedirect(search: string): string {
  const query = new URLSearchParams(search);
  const scope = query.get('scope');
  query.delete('scope');
  query.set('queue', scope === 'company' ? 'company' : 'team');
  return `/work?${query.toString()}`;
}
```

- [ ] **Step 4: The hook, the rail, the chips**

Create `src/components/work/useQueues.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import type { QueuesPayload } from '../../features/agents/bundleTypes';
import { fetchQueues } from '../../features/work/workApi';
import { QUEUE } from '../../features/work/queues';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useRefreshTick } from './useRefreshTick';

/** GET /work/queues/ (contract §10.3): read on mount, on every Work change
 *  (the badge's tick) and on `reload`. A failed read keeps the last answer. */
export function useQueues() {
  const tick = useRefreshTick();
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<QueuesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchQueues().then(
      (payload) => {
        if (!alive) return;
        setData(payload);
        setError(null);
      },
      (err: unknown) => alive && setError(errorMessage(err, QUEUE.LOAD)),
    );
    return () => {
      alive = false;
    };
  }, [tick, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { data, error, reload };
}
```

Create `src/components/work/useQueues.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { stubBundles } from '../../features/agents/testBundles';
import { feedChanged } from './taskChanges';
import { useQueues } from './useQueues';

const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

describe('useQueues', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the queues and reads again after a Work change', async () => {
    const { spy } = stubBundles();
    const { result } = renderHook(() => useQueues(), { wrapper });
    await waitFor(() => expect(result.current.data?.queues.map((q) => q.key)).toEqual(['mine', 'team', 'company', 'history']));
    const reads = () => spy.mock.calls.filter(([url]) => String(url).endsWith('/work/queues/')).length;
    const before = reads();
    act(() => feedChanged());
    await waitFor(() => expect(reads()).toBe(before + 1));
  });

  it('keeps the last answer when a read fails', async () => {
    stubBundles({ failQueues: 1 });
    const { result } = renderHook(() => useQueues(), { wrapper });
    await waitFor(() => expect(result.current.error).toBe('Could not load the queues.'));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).not.toBeNull());
  });
});
```

Create `src/components/work/QueueRail.tsx`:

```tsx
import { Link, useNavigate } from 'react-router-dom';
import type { QueueKey, QueueRow } from '../../features/agents/bundleTypes';
import { QUEUE, optionText, queueHref } from '../../features/work/queues';
import { FOCUS, NUM, Select, TYPE } from '../ui';

const RAIL_LINK = `flex min-h-11 sm:min-h-9 items-center justify-between gap-2 rounded-lg px-3 hover:bg-subtle ${FOCUS}`;

/** The queues from sm (frontend Decision 2): a nav of links, the open one
 *  marked, each with its count as a tabular figure. */
export function QueueRail({ rows, current }: { rows: readonly QueueRow[]; current: QueueKey }) {
  return (
    <nav aria-label={QUEUE.RAIL} className="w-56 shrink-0">
      <ul className="flex flex-col gap-1">
        {rows.map((row) => {
          const open = row.key === current;
          return (
            <li key={row.key}>
              <Link to={queueHref(row.key)} aria-current={open ? 'page' : undefined} className={`${RAIL_LINK} ${open ? 'bg-subtle' : ''}`}>
                <span className={open ? `${TYPE.body} font-semibold` : TYPE.bodyMuted}>{row.label}</span>
                {row.count !== null ? <span className={`${TYPE.meta} ${NUM}`}>{row.count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The queues below sm: one select at the top. */
export function QueueSelect({ rows, current }: { rows: readonly QueueRow[]; current: QueueKey }) {
  const navigate = useNavigate();
  return (
    <Select
      label={QUEUE.SELECT}
      labelPosition="above"
      value={current}
      onChange={(key) => navigate(queueHref(key as QueueKey))}
      options={rows.map((row) => ({ value: row.key, label: optionText(row) }))}
    />
  );
}
```

Create `src/components/work/QueueRail.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueueRail } from './QueueRail';

describe('QueueRail', () => {
  it('marks the open queue and shows counts, none for History or a failed count', () => {
    render(
      <MemoryRouter>
        <QueueRail
          current="team"
          rows={[
            { key: 'mine', label: 'Mine', count: 4 },
            { key: 'team', label: 'My team', count: null },
            { key: 'history', label: 'History', count: null },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Mine 4' })).toHaveAttribute('href', '/work?queue=mine');
    expect(screen.getByRole('link', { name: 'My team' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'History' })).not.toHaveAttribute('aria-current');
  });
});
```

Create `src/components/work/KindChips.tsx` (MyWork's chip row, moved and made per queue):

```tsx
import type { RefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { QueueKey } from '../../features/agents/bundleTypes';
import { FEED, chipOf, type FeedChip } from '../../features/work/feed';
import { chipsFor } from '../../features/work/queues';
import { FilterChip, FilterChipRow } from '../ui';

/** The kind filters above a queue (spec §8.1), in the URL as `?kind=`. */
export function KindChips({ queue, rowRef }: { queue: QueueKey; rowRef?: RefObject<HTMLDivElement | null> }) {
  const [params, setParams] = useSearchParams();
  const chip = chipOf(params.get('kind'));
  const chips = chipsFor(queue);
  if (chips.length === 0) return null;
  const choose = (next: FeedChip | null) => {
    const query = new URLSearchParams(params);
    if (next) query.set('kind', next);
    else query.delete('kind');
    setParams(query, { replace: true });
  };
  return (
    <div ref={rowRef}>
      <FilterChipRow label={FEED.FILTER}>
        {chips.map((option) => (
          <FilterChip key={option.label} label={option.label} pressed={chip === option.key} onToggle={() => choose(option.key)} />
        ))}
      </FilterChipRow>
    </div>
  );
}
```

In `src/pages/work/MyWork.tsx`: replace the inline `FilterChipRow` block with `<KindChips queue="mine" rowRef={chipsRef} />` (keep `choose(null)` for the empty state's Show all, now `setParams` with `kind` deleted as before), drop the `WorkFrame` wrapper (return a fragment), and drop the unused imports. In `MyWork.test.tsx` render through `renderWork('/work?queue=mine…')` wherever it rendered `/work/mine…`, and expect URLs `/work?queue=mine&kind=…`.

- [ ] **Step 5: The inbox and the routes**

Create `src/pages/work/WorkInbox.tsx`:

```tsx
import { useEffect, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BundleSheet } from '../../components/work/BundleSheet';
import { QueueRail, QueueSelect } from '../../components/work/QueueRail';
import { TeamPeople } from '../../components/work/TeamPeople';
import { TeamQueue } from '../../components/work/TeamQueue';
import { useQueues } from '../../components/work/useQueues';
import { WorkFrame } from '../../components/work/WorkFrame';
import { FALLBACK_QUEUES, isQueueRefusal, queueOf } from '../../features/work/queues';
import { useCapability } from '../../hooks';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { HistoryPage } from './History';
import { MyWorkPage } from './MyWork';

/** /work (spec §8.1; frontend Decisions 1, 2, 16): the queue rail (a select
 *  on phones), the open queue's list, and the bundle panel over it. A queue
 *  the server does not offer falls back to Mine once the list is known. */
export function WorkInbox() {
  const [params, setParams] = useSearchParams();
  const queues = useQueues();
  const isSm = useMediaQuery(SM);
  const canSeeAll = useCapability('view_all_accounts');
  const listRef = useRef<HTMLDivElement>(null);
  const asked = queueOf(params);
  const rows = queues.data?.queues ?? FALLBACK_QUEUES;
  const offered = !queues.data || rows.some((row) => row.key === asked) || asked === 'mine';
  const queue = offered ? asked : 'mine';

  useEffect(() => {
    if (offered) return;
    setParams(new URLSearchParams({ queue: 'mine' }), { replace: true });
  }, [offered, setParams]);

  const refused = (err: unknown) => {
    if (!isQueueRefusal(err)) return false;
    queues.reload();
    return true;
  };

  let body: ReactNode;
  if (queue === 'history') body = <HistoryPage />;
  else if (queue === 'team')
    body = (
      <>
        <TeamQueue key="team" scope="team" canAsk={false} onRefused={refused} />
        <TeamPeople />
      </>
    );
  else if (queue === 'company') body = <TeamQueue key="company" scope="company" canAsk={canSeeAll} onRefused={refused} />;
  else body = <MyWorkPage />;

  return (
    <WorkFrame>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        {isSm ? <QueueRail rows={rows} current={queue} /> : <QueueSelect rows={rows} current={queue} />}
        <div ref={listRef} data-part="queue" className="flex min-w-0 flex-1 flex-col gap-4">
          {body}
        </div>
      </div>
      <BundleSheet fallbackFocus={() => listRef.current?.querySelector<HTMLElement>('h2')} />
    </WorkFrame>
  );
}
```

`BundleSheet` is built in Task 8 and `HistoryPage` in Task 10 (`TeamPeople` is Step 6 below). So that this task's tests run now, create them as the smallest real components and grow them later: `src/components/work/BundleSheet.tsx` exporting `export function BundleSheet(_props: { fallbackFocus: () => HTMLElement | null | undefined }) { return null; }` with a comment "Task 8 builds the panel"; `src/components/work/TeamPeople.tsx` exporting `TeamPeople` as Step 6 below; `src/pages/work/History.tsx` exporting `export function HistoryPage() { return null; }` with a comment "Task 10 builds History". (Each is replaced wholesale in its task; nothing ships empty, as Tasks 8 and 10 land in the same PR.)

- [ ] **Step 6: Team's people, moved out of the Team page**

Create `src/components/work/TeamPeople.tsx` from `src/pages/work/Team.tsx`'s people list, reading My team without Brain's scope switch:

```tsx
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { fetchTeam } from '../../features/work/workApi';
import { QUEUE } from '../../features/work/queues';
import { WORK, hiddenTeamText } from '../../features/work/workText';
import type { TeamPayload } from '../../features/work/workTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { Card, EmptyState, ErrorState, ListCard, TYPE } from '../ui';
import { useTaskChanges } from './taskChanges';
import { TeamRow } from './TeamRow';
import { TeamSkeleton } from './TeamSkeleton';

/** My team's people under its queue (contract D23): one row per person with
 *  their open, overdue and blocked counts; what the reader can't open is
 *  counted, never named. */
export function TeamPeople() {
  const titleId = useId();
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<TeamPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchTeam('team').then(
      (payload) => {
        if (!alive) return;
        setData(payload);
        setError(null);
      },
      (err: unknown) => alive && setError(errorMessage(err, WORK.LOAD_TEAM)),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  useTaskChanges(reload);

  let body: ReactNode;
  if (!data && error)
    body = (
      <Card pad="none">
        <ErrorState message={error} onRetry={reload} />
      </Card>
    );
  else if (!data) body = <TeamSkeleton />;
  else if (data.people.length === 0)
    body = (
      <Card pad="none">
        <EmptyState title={WORK.NOBODY} detail={WORK.NOBODY_DETAIL} />
      </Card>
    );
  else
    body = (
      <ListCard label={QUEUE.PEOPLE}>
        {data.people.map((row) => (
          <TeamRow key={row.person.id} row={row} today={data.today} />
        ))}
      </ListCard>
    );
  const hidden = data ? hiddenTeamText(data.hidden) : null;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className={TYPE.title}>
        {QUEUE.PEOPLE}
      </h2>
      {body}
      {hidden ? <p className={TYPE.bodyMuted}>{hidden}</p> : null}
    </section>
  );
}
```

Delete `src/pages/work/Team.tsx` and `Team.test.tsx` (`git rm`); move `Team.test.tsx`'s per-person assertions (rows, hidden line, empty state) into `WorkInbox.test.tsx` under `describe('My team people')`, rendering `/work?queue=team`.

Replace `src/pages/work/WorkRoutes.tsx`:

```tsx
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { PageHeader } from '../../components/ui';
import { KeepQueryRedirect } from '../../components/work/KeepQueryRedirect';
import { teamRedirect } from '../../features/work/queues';
import { ActivityRedirect } from './ActivityRedirect';
import { WorkInbox } from './WorkInbox';

/** The Work bar: "Work" alone (the queues are the rail, spec §8.1). */
function WorkLayout() {
  return (
    <>
      <PageHeader title="Work" />
      <Outlet />
    </>
  );
}

function TeamRedirect() {
  const { search, state } = useLocation();
  return <Navigate to={teamRedirect(search)} replace state={state} />;
}

/** /work/* (agent bundles D1 frontend Decision 1): the inbox at /work; the
 *  old pages redirect into it with their query and history state kept, so a
 *  bell's ?task= still opens the panel; anything unknown lands on /work. */
export function WorkRoutes() {
  return (
    <Routes>
      <Route element={<WorkLayout />}>
        <Route index element={<WorkInbox />} />
        <Route path="mine" element={<KeepQueryRedirect to="/work" set={{ queue: 'mine' }} />} />
        <Route path="today" element={<KeepQueryRedirect to="/work" set={{ queue: 'mine' }} />} />
        <Route path="recommended" element={<KeepQueryRedirect to="/work" set={{ kind: 'suggestion', queue: 'mine' }} />} />
        <Route path="team" element={<TeamRedirect />} />
        <Route path="activity" element={<ActivityRedirect />} />
        <Route path="*" element={<Navigate to="/work" replace />} />
      </Route>
    </Routes>
  );
}
```

`ActivityRedirect` is Task 10's; for now create `src/pages/work/ActivityRedirect.tsx` as `export function ActivityRedirect() { return <Navigate to="/work?queue=history" replace />; }` (Task 10 adds the `?action=` read).

In `src/features/work/workTabs.ts` keep only `isWorkPath` (delete `WorkTab`, `WORK_TABS`, `workTabOf`, `workTabsFor`) and trim `workTabs.test.ts` to `isWorkPath`'s cases. `git rm src/components/layout/WorkTabs.tsx` (and its test if present). In `WorkFrame.tsx` update the comment: "the inbox's body: a reading column under the Work bar".

- [ ] **Step 7: Run the tests, the type check, the lint and the ratchet**

Run: `npx vitest run src/features/work src/components/work src/pages/work --maxWorkers=2 && npx tsc -b && npm run lint && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS; set `BASELINE` to the new (lower or equal) totals if the ratchet reports a drop.

- [ ] **Step 8: Commit**

```bash
git add src/features/work/queues.ts src/features/work/queues.test.ts src/components/work/useQueues.ts src/components/work/useQueues.test.tsx src/components/work/QueueRail.tsx src/components/work/QueueRail.test.tsx src/components/work/KindChips.tsx src/components/work/TeamPeople.tsx src/components/work/BundleSheet.tsx src/pages/work/WorkInbox.tsx src/pages/work/WorkInbox.test.tsx src/pages/work/History.tsx src/pages/work/ActivityRedirect.tsx src/pages/work/WorkRoutes.tsx src/pages/work/WorkRoutes.test.tsx src/pages/work/MyWork.tsx src/pages/work/MyWork.test.tsx src/components/work/WorkFrame.tsx src/features/work/workTabs.ts src/features/work/workTabs.test.ts src/test/uiRatchet.test.ts
git rm src/pages/work/Team.tsx src/pages/work/Team.test.tsx src/components/layout/WorkTabs.tsx
git commit -m "feat(work): the inbox: a queue rail (a select on phones), one route, old links redirected

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Kind filters on My team and Rest of company

**Files:**
- Modify: `src/components/work/useTeamQueue.ts`, `src/components/work/useTeamQueue.test.tsx`, `src/components/work/TeamQueue.tsx`, `src/features/work/teamQueue.ts`

**Interfaces:**
- Consumes: `fetchTeamQueue(scope, kinds)`, `fetchTeamQueueGroup(scope, group, kinds, cursor)` (Task 1), `KindChips` (Task 5), `kindsOf`, `chipOf`, `emptyTitle` (Task 4), `QUEUE` (Task 5).
- Produces: `useTeamQueue(scope: TeamScope, chip: FeedChip | null, refused)`; `queueTitle('company')` is "Waiting on the rest of the company"; `queueEmpty('company')` is "Nothing is waiting on the rest of the company."

- [ ] **Step 1: Write the failing test**

Append to `src/components/work/useTeamQueue.test.tsx`:

```tsx
  it('reads one kind when a chip is chosen, and again when it changes', async () => {
    const { spy } = stubFeed({ team: { team: TEAM_ITEMS }, recommendations: [...RECOMMENDATIONS, TEAM_REC] });
    const { result, rerender } = renderHook(({ chip }) => useTeamQueue('team', chip, () => false), { initialProps: { chip: 'bundle' as FeedChip | null } });
    await waitFor(() => expect(result.current.data?.groups[0].items.map((i) => i.kind)).toEqual(['bundle']));
    rerender({ chip: 'question' });
    await waitFor(() => expect(result.current.data?.groups[0].items.map((i) => i.kind)).toEqual(['question']));
    expect(spy.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/work/feed/team/'))).toEqual([
      'http://localhost/api/v1/work/feed/team/?scope=team&kind=bundle',
      'http://localhost/api/v1/work/feed/team/?scope=team&kind=question',
    ]);
  });
```

(import `FeedChip` from `'../../features/work/feed'`; update the file's existing calls to `useTeamQueue('team', null, refused)`. If `apiFetch` builds URLs without `http://localhost/api/v1`, compare `new URL(url).pathname + new URL(url).search` instead.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/work/useTeamQueue.test.tsx --maxWorkers=2`
Expected: FAIL (the hook takes no chip).

- [ ] **Step 3: The hook and the queue**

Replace `src/components/work/useTeamQueue.ts`:

```ts
import { chipOf, kindsOf, type FeedChip } from '../../features/work/feed';
import { fetchTeamQueue, fetchTeamQueueGroup } from '../../features/work/workApi';
import type { FeedGroupKey, TeamScope } from '../../features/work/workTypes';
import { useFeedSource } from './useFeedSource';

/** One string per (scope, chip): useFeedSource keys its reads on it, so an object would read forever. */
type Key = `${TeamScope}:${string}`;
const keyOf = (scope: TeamScope, chip: FeedChip | null): Key => `${scope}:${chip ?? ''}`;
const parts = (key: Key) => {
  const [scope, chip] = key.split(':') as [TeamScope, string];
  return { scope, kinds: kindsOf(chipOf(chip || null)) };
};
const read = (key: Key) => {
  const { scope, kinds } = parts(key);
  return fetchTeamQueue(scope, kinds);
};
const readGroup = (key: Key, group: FeedGroupKey, cursor: string | null) => {
  const { scope, kinds } = parts(key);
  return fetchTeamQueueGroup(scope, group, kinds, cursor);
};

/** GET /work/feed/team/ for one queue and kind filter (agent bundles D1
 *  §10.2). A 403 SCOPE_NOT_ALLOWED goes to `refused` (the inbox reads the
 *  queues again and falls back to Mine) and shows no error of its own. */
export function useTeamQueue(scope: TeamScope, chip: FeedChip | null, refused: (err: unknown) => boolean) {
  return useFeedSource(keyOf(scope, chip), read, readGroup, refused);
}
```

In `src/components/work/TeamQueue.tsx`: read `const [params] = useSearchParams(); const chip = chipOf(params.get('kind'));`; `useTeamQueue(scope, chip, onRefused)`; render `<KindChips queue={scope} />` between the header row and the body; the empty state's title is `chip ? emptyTitle(chip) : queueEmpty(scope)`. In `src/features/work/teamQueue.ts`: `queueTitle` returns `QUEUE.TEAM_TITLE` / `QUEUE.COMPANY_TITLE`; `queueEmpty('company')` returns `'Nothing is waiting on the rest of the company.'`; `EMPTY_DETAIL` becomes `'Bundles, decisions, overdue tasks and suggestions for the people below you show here.'`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/work src/pages/work --maxWorkers=2 && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/work/useTeamQueue.ts src/components/work/useTeamQueue.test.tsx src/components/work/TeamQueue.tsx src/features/work/teamQueue.ts
git commit -m "feat(work): kind filters on My team and Rest of company

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The Sheet, made wide, full screen on phones, heading first

**Files:**
- Modify: `src/components/organizations/detail/Sheet.tsx`
- Create: `src/components/organizations/detail/Sheet.test.tsx` (or append if it exists)

**Interfaces:**
- Produces: `Sheet` gains `size?: 'regular' | 'wide'` (default `regular`: `max-w-lg`; `wide`: `max-w-2xl`), `phone?: 'sheet' | 'full'` (default `sheet`), `focus?: 'field' | 'heading'` (default `field`), `footer?: ReactNode` (pinned under the scroll area), `returnFocus?: () => HTMLElement | null | undefined` (used when the opener is gone), and `headingRef?: Ref<HTMLHeadingElement>`. Existing callers are unchanged.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { Sheet } from './Sheet';

function Harness({ isSm }: { isSm: boolean }) {
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  return (
    <>
      <h2 id="fallback" tabIndex={-1}>
        List
      </h2>
      {gone ? null : (
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
      )}
      {open ? (
        <Sheet title="Bundle" isSm={isSm} size="wide" phone="full" focus="heading" footer={<button type="button">Run 1 selected</button>} returnFocus={() => document.getElementById('fallback')} onClose={() => { setOpen(false); setGone(true); }}>
          <input aria-label="Title" />
        </Sheet>
      ) : null}
    </>
  );
}

describe('Sheet options (agent bundles D1 frontend Decision 5)', () => {
  it('focuses the heading, pins the footer, and returns focus to the fallback when the opener is gone', async () => {
    render(<Harness isSm />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('heading', { name: 'Bundle' })).toHaveFocus();
    expect(screen.getByRole('dialog').className).toContain('max-w-2xl');
    expect(screen.getByRole('button', { name: 'Run 1 selected' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('heading', { name: 'List' })).toHaveFocus();
  });

  it('is full screen below sm', async () => {
    render(<Harness isSm={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog').className).toContain('h-full');
    expect(screen.getByRole('dialog').className).not.toContain('rounded-t-xl');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/organizations/detail/Sheet.test.tsx --maxWorkers=2`
Expected: FAIL (unknown props; focus on the input).

- [ ] **Step 3: The options**

In `Sheet.tsx` add the props with their defaults, then:

```tsx
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnRef = useRef(returnFocus);
  useEffect(() => {
    returnRef.current = returnFocus;
  }, [returnFocus]);
```

In the mount effect replace the first focus line with

```tsx
    if (focus === 'heading') headingRef.current?.focus();
    else (root?.querySelector<HTMLElement>(FIELD) ?? root?.querySelector<HTMLElement>('button'))?.focus();
```

and the cleanup's `opener?.focus();` with

```tsx
      if (opener?.isConnected) opener.focus();
      else returnRef.current?.()?.focus();
```

Give the `h2` `ref={headingRef}` and `tabIndex={-1}` plus `${FOCUS}` (a heading focused by script shows the ring only for keyboard users: `focus-visible`). Pass `headingRef` up with `useImperativeHandle` only if a caller needs it (the bundle panel does: accept `headingRef?: Ref<HTMLHeadingElement>` and merge with a callback ref: `ref={(node) => { headingRef.current = node; if (typeof outer === 'function') outer(node); else if (outer) outer.current = node; }}`). The dialog's class:

```tsx
        className={
          isSm
            ? `relative ml-auto flex h-full w-full ${size === 'wide' ? 'max-w-2xl' : 'max-w-lg'} flex-col bg-surface shadow-lg`
            : phone === 'full'
              ? 'relative flex h-full w-full flex-col bg-surface pb-[env(safe-area-inset-bottom)]'
              : 'relative mt-auto flex max-h-[85dvh] w-full flex-col rounded-t-xl bg-surface pb-[env(safe-area-inset-bottom)]'
        }
```

and after the scroll area: `{footer ? <footer className="border-t border-line-subtle px-4 py-3">{footer}</footer> : null}`. (`shadow-lg` is the overlay's one shadow, already there; it is not a card shadow.)

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/organizations src/components/work --maxWorkers=2 && npx tsc -b`
Expected: PASS (existing Sheet callers unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/Sheet.tsx src/components/organizations/detail/Sheet.test.tsx
git commit -m "feat(ui): Sheet options: wide, full screen on phones, heading focus, footer, return focus

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The bundle panel: read, edit, untick, Run selected, results

**Files:**
- Create: `src/components/work/useBundle.ts`, `src/components/work/BundlePanel.tsx`, `src/components/work/BundleStep.tsx`, `src/components/work/BundleStepFields.tsx`, `src/components/work/PlaceholderText.tsx`, `src/components/work/BundlePanel.test.tsx`
- Modify: `src/components/work/BundleSheet.tsx` (replaces Task 5's empty one), `src/features/agents/bundleText.ts` (+ test), `src/components/agents/UndoAction.tsx`

**Interfaces:**
- Consumes: Tasks 1 to 7: `fetchBundle`, `runBundle`, `Draft`, `draftOf`, `runBody`, `selectedCount`, `runLabel`, `showsCantUndo`, `textParts`, `filledInText`, `audienceText`, `summaryText`, `outputLinks`, `stepStateText`, `readRunRefusal`, `Sheet` options, `OPENED_HERE`/`openedHere`, `feedChanged`, `taskChanged`, `useSubmitOnce`, `AgentActionBody`, `UndoAction`, `useAssignees`, `assigneeOptions`, `AssigneeSelect`, `CONTACT_ROLES`.
- Produces: `stepAsAction(bundle, step): AgentAction` (in `bundleText.ts`); `useBundle(id)` → `{ bundle, error, lost, retry, replace, lose }`; `BundleSheet({ fallbackFocus })`; `BundlePanel({ id, isSm, onClose, fallbackFocus })`; `BundleStep(props)`; `BundleStepFields({ bundle, step, fields, errors, onField })`; `PlaceholderText({ text, placeholders })`. Task 9 adds Retry, Reject and the discard bar to `BundlePanel` and `BundleStep`.

- [ ] **Step 1: Write the failing tests**

Add to `src/features/agents/bundleText.test.ts`:

```ts
  it('reads a step as an action for the shared preview, braces turned into words', () => {
    const action = stepAsAction(B_CAMPAIGN, B_CAMPAIGN.steps[1]);
    expect(action.bundle).toBe(13);
    expect(action.preview.task?.title).toBe('Follow up on Campaign link from step 1');
    expect(JSON.stringify(action)).not.toContain('{{');
  });
```

Create `src/components/work/BundlePanel.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { B_CAMPAIGN, B_PIZZA, B_SURVEY } from '../../features/agents/testBundleFixtures';
import { stubBundles } from '../../features/agents/testBundles';
import { renderWork, where } from '../../pages/work/testPages';
import { resetViewport } from '../../test/viewport';

const sentRuns = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls.filter(([url, init]) => String(url).includes('/run/') && (init as RequestInit | undefined)?.method === 'POST').map(([, init]) => JSON.parse(String((init as RequestInit).body)));

describe('Bundle panel (spec §8.2; frontend Decisions 5 to 11)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    document.body.style.overflow = '';
  });

  it('opens from Review with its heading focused, every step in order, the one it may not run disabled with why', async () => {
    stubBundles();
    renderWork('/work?queue=mine');
    await userEvent.click(await screen.findByRole('link', { name: `Review ${B_PIZZA.title}` }));
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    await waitFor(() => expect(within(panel).getByRole('heading', { name: B_PIZZA.title })).toHaveFocus());
    expect(where()).toBe('/work?queue=mine&bundle=12');
    expect(within(panel).getByText(B_PIZZA.reason)).toBeInTheDocument();
    const ticks = within(panel).getAllByRole('checkbox');
    expect(ticks.map((t) => (t as HTMLInputElement).checked)).toEqual([true, true, false]);
    expect(ticks[2]).toBeDisabled();
    expect(within(panel).getByText("You can't run this step.")).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Run 2 selected' })).toBeInTheDocument();
  });

  it('runs the ticked steps with only the changed fields, says what happened, links the result, and the row leaves', async () => {
    const { spy } = stubBundles();
    renderWork('/work?queue=mine&bundle=12');
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    const title = await within(panel).findByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Call today');
    await userEvent.click(within(panel).getByRole('checkbox', { name: '2. File a note' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 1 selected' }));
    const summary = await within(panel).findByText('Done: all 1 step ran.');
    expect(summary).toHaveFocus();
    expect(sentRuns(spy)).toEqual([{ steps: [{ id: 41, selected: true, fields: { title: 'Call today' } }, { id: 42, selected: false }, { id: 43, selected: false }] }]);
    expect(within(panel).getByRole('link', { name: 'Open task' })).toHaveAttribute('href', '/work/mine?task=990');
    expect(within(panel).getAllByText('Not run')).toHaveLength(2);
    expect(within(panel).queryByRole('button', { name: /^Run / })).not.toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: `Review ${B_PIZZA.title}` })).not.toBeInTheDocument());
  });

  it("marks a send Can't be undone until Save as draft only is on, and shows placeholders as chips, never braces", async () => {
    stubBundles();
    renderWork('/work?queue=company&bundle=13');
    const panel = await screen.findByRole('dialog', { name: B_CAMPAIGN.title });
    const send = await within(panel).findByTestId('step-51');
    expect(within(send).getByText("Can't be undone")).toBeInTheDocument();
    expect(within(send).getByText('42 contacts across 3 organisations · at most 500')).toBeInTheDocument();
    await userEvent.click(within(send).getByRole('switch', { name: 'Save as draft only' }));
    expect(within(send).queryByText("Can't be undone")).not.toBeInTheDocument();
    const follow = within(panel).getByTestId('step-52');
    expect(within(follow).getAllByText('Campaign link from step 1').length).toBeGreaterThan(0);
    expect(within(follow).getByText('Filled in from step 1 when it runs.')).toBeInTheDocument();
    expect(within(follow).queryByLabelText('Title')).not.toBeInTheDocument();
    expect(panel.textContent).not.toContain('{{');
  });

  it("shows a survey's question and audience, and is full screen on a phone", async () => {
    stubBundles();
    renderWork('/work?queue=company&bundle=14', { width: 390 });
    const panel = await screen.findByRole('dialog', { name: B_SURVEY.title });
    expect(panel.className).toContain('h-full');
    expect(within(panel).getByText('How likely are you to recommend Acme to a friend or colleague?')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Survey type')).toHaveValue('nps');
  });

  it("says a bundle it can't read is gone", async () => {
    stubBundles({ bundles: [] });
    renderWork('/work?queue=mine&bundle=99');
    expect(await screen.findByText("That bundle isn't there any more, or it's on a record you can't open.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/work/BundlePanel.test.tsx src/features/agents/bundleText.test.ts --maxWorkers=2`
Expected: FAIL (`stepAsAction` missing; the panel renders nothing).

- [ ] **Step 3: `stepAsAction`, and Undo for a step**

Append to `src/features/agents/bundleText.ts` (import `AgentAction`, `ActionResult` from `./agentTypes`):

```ts
export const BUNDLE_GONE = "That bundle isn't there any more, or it's on a record you can't open.";

const NO_RESULT: ActionResult = {
  task_id: null,
  note_id: null,
  initiative_id: null,
  draft_id: null,
  plan_id: null,
  segment_id: null,
  rule_id: null,
  campaign_id: null,
  canvas_id: null,
  template_id: null,
};

/** A step as the shared action shape, so AgentActionBody and UndoAction show
 *  it as they show any action; every placeholder in its preview becomes its
 *  words (Decision 10: never raw braces). */
export function stepAsAction(bundle: Bundle, step: BundleStep): AgentAction {
  const words = (text: string) => textParts(text, step.placeholders).map((part) => (typeof part === 'string' ? part : part.chip)).join('');
  const preview = JSON.parse(JSON.stringify(step.preview), (_key, value) => (typeof value === 'string' ? words(value) : value));
  return {
    id: step.id,
    agent: bundle.agent,
    kind: step.kind,
    title: words(step.title),
    status: step.status,
    record: bundle.record ? { kind: bundle.record.type, id: bundle.record.id, name: bundle.record.name } : null,
    preview,
    rationale: step.rationale,
    evidence: step.evidence,
    decided_by: null,
    decided_at: null,
    auto: false,
    applied_at: null,
    undo: step.undo,
    undone_by: null,
    undone_at: null,
    result: NO_RESULT,
    created_at: bundle.created_at,
    bundle: bundle.id,
  };
}
```

In `src/components/agents/UndoAction.tsx`, `undoReasonText` now covers `irreversible` (Task 1); no other change.

- [ ] **Step 4: The hook, the host and the placeholder text**

Create `src/components/work/useBundle.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { fetchBundle } from '../../features/agents/bundlesApi';
import { BUNDLE } from '../../features/agents/bundleText';
import type { Bundle } from '../../features/agents/bundleTypes';
import { isMissing } from '../../features/work/workApi';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

/** GET /agents/bundles/<id>/ (contract §5.4): a 404 is `lost` (gone, or on a
 *  record the reader can't open), never an error to retry. */
export function useBundle(id: number) {
  const [attempt, setAttempt] = useState(0);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lost, setLost] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchBundle(id).then(
      (answer) => {
        if (!alive) return;
        setBundle(answer);
        setError(null);
      },
      (err: unknown) => {
        if (!alive) return;
        if (isMissing(err)) setLost(true);
        else setError(errorMessage(err, BUNDLE.LOAD));
      },
    );
    return () => {
      alive = false;
    };
  }, [id, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const lose = useCallback(() => setLost(true), []);
  return { bundle, error, lost, retry, replace: setBundle, lose };
}
```

Replace `src/components/work/BundleSheet.tsx`:

```tsx
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { BundlePanel } from './BundlePanel';
import { openedHere } from './useTaskLink';

/** The one bundle panel on Work (spec §8.2): ?bundle=<id> opens it. Closing
 *  a panel a Review link opened steps back over its entry (Back closes it);
 *  a page loaded with ?bundle= drops only that parameter. Keyed by id. */
export function BundleSheet({ fallbackFocus }: { fallbackFocus: () => HTMLElement | null | undefined }) {
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const isSm = useMediaQuery(SM);
  const id = Number(params.get('bundle')) || null;
  if (id === null) return null;
  const close = () => {
    if (openedHere(state)) navigate(-1);
    else
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('bundle');
          return next;
        },
        { replace: true },
      );
  };
  return <BundlePanel key={id} id={id} isSm={isSm} onClose={close} fallbackFocus={fallbackFocus} />;
}
```

Create `src/components/work/PlaceholderText.tsx`:

```tsx
import { textParts } from '../../features/agents/bundleText';
import type { Placeholder } from '../../features/agents/bundleTypes';
import { TYPE } from '../ui';

/** Text with each `{{step N.key}}` as a chip (frontend Decision 10). */
export function PlaceholderText({ text, placeholders }: { text: string; placeholders: Placeholder[] }) {
  return (
    <>
      {textParts(text, placeholders).map((part, index) =>
        typeof part === 'string' ? (
          <span key={index}>{part}</span>
        ) : (
          <span key={index} data-part="placeholder" className={`mx-0.5 inline-flex items-center rounded-full border border-line bg-subtle px-2 ${TYPE.meta}`}>
            {part.chip}
          </span>
        ),
      )}
    </>
  );
}
```

- [ ] **Step 5: The fields**

Create `src/components/work/BundleStepFields.tsx`:

```tsx
import { useId } from 'react';
import { BUNDLE } from '../../features/agents/bundleText';
import type { Bundle, BundleStep, StepFields, StepFieldValue } from '../../features/agents/bundleTypes';
import { CONTACT_ROLES } from '../../features/contacts/contactsParams';
import { assigneeOptions } from '../../features/work/assignees';
import { PRIORITY_LABEL } from '../../features/work/workText';
import type { TaskPriority } from '../../features/work/workTypes';
import { CHECKBOX, CHOICE, FIELD_ERROR, INPUT, INVALID, Select, Switch, TYPE } from '../ui';
import { AssigneeSelect } from './AssigneeSelect';
import { useAssignees } from './useAssignees';

const AREA = `${INPUT} ${INVALID} min-h-24 py-2`;
const LINE = `${INPUT} ${INVALID}`;
const PRIORITIES: TaskPriority[] = ['high', 'medium', 'low'];
const SURVEY_TYPES = [
  { value: 'nps', label: 'NPS' },
  { value: 'csat', label: 'CSAT' },
  { value: 'ces', label: 'CES' },
];

function labelOf(step: BundleStep, key: string): string {
  if (key === 'title') return step.kind === 'note.create' ? BUNDLE.NOTE_TITLE : BUNDLE.TITLE;
  if (key === 'body') return step.kind === 'draft.reply' ? BUNDLE.REPLY : step.kind === 'note.create' ? BUNDLE.NOTE_BODY : BUNDLE.BODY;
  const labels: Record<string, string> = { name: BUNDLE.NAME, subject: BUNDLE.SUBJECT, intro: BUNDLE.INTRO, due_date: 'Due date', priority: 'Priority', assignee_id: 'Who does it', roles: BUNDLE.ROLES, survey_type: BUNDLE.SURVEY_TYPE };
  return labels[key] ?? key;
}

/** A step's editable fields (frontend Decision 8), in the order the server
 *  lists them; a field holding a placeholder is left out (Decision 10). */
export function BundleStepFields({
  bundle,
  step,
  fields,
  errors,
  onField,
}: {
  bundle: Bundle;
  step: BundleStep;
  fields: StepFields;
  errors: Record<string, string>;
  onField: (key: string, value: StepFieldValue) => void;
}) {
  const base = useId();
  const record = bundle.record;
  const assignees = useAssignees(step.editable.includes('assignee_id') && record ? { kind: record.type, id: record.id } : null);
  const keys = step.editable.filter((key) => !step.placeholders.some((p) => p.field === key));
  return (
    <div className="flex flex-col gap-3">
      {keys.map((key) => {
        const id = `${base}-${key}`;
        const error = errors[key];
        const aria = { 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : undefined };
        const value = fields[key];
        const label = labelOf(step, key);
        let control;
        if (key === 'draft_only') {
          control = (
            <Switch checked={value === true} onChange={(next) => onField(key, next)} label={BUNDLE.DRAFT_ONLY}>
              {BUNDLE.DRAFT_ONLY}
            </Switch>
          );
          return <div key={key}>{control}</div>;
        }
        if (key === 'roles') {
          const roles = Array.isArray(value) ? value : [];
          return (
            <fieldset key={key} className="flex flex-col gap-1">
              <legend className={TYPE.label}>{label}</legend>
              {CONTACT_ROLES.map((role) => (
                <label key={role.value} className={CHOICE}>
                  <input
                    type="checkbox"
                    className={CHECKBOX}
                    checked={roles.includes(role.value)}
                    onChange={(event) => onField(key, event.target.checked ? [...roles, role.value] : roles.filter((r) => r !== role.value))}
                  />
                  {role.label}
                </label>
              ))}
              {error ? <p id={`${id}-error`} role="alert" className={FIELD_ERROR}>{error}</p> : null}
            </fieldset>
          );
        }
        if (key === 'priority') {
          control = <Select id={id} label={label} labelPosition="external" value={String(value ?? 'medium')} onChange={(next) => onField(key, next)} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} invalid={Boolean(error)} describedBy={aria['aria-describedby']} />;
        } else if (key === 'survey_type') {
          control = <Select id={id} label={label} labelPosition="external" value={String(value ?? 'nps')} onChange={(next) => onField(key, next)} options={SURVEY_TYPES} invalid={Boolean(error)} describedBy={aria['aria-describedby']} />;
        } else if (key === 'assignee_id') {
          if (!record) return null;
          control = <AssigneeSelect id={id} value={typeof value === 'number' ? value : null} options={assignees.people ? assigneeOptions(assignees.people, record.type) : []} busy={assignees.people === null} onChange={(next) => onField(key, next)} aria={aria} />;
        } else if (key === 'body' || key === 'intro') {
          control = <textarea id={id} {...aria} className={AREA} value={String(value ?? '')} onChange={(event) => onField(key, event.target.value)} />;
        } else {
          control = <input id={id} {...aria} type={key === 'due_date' ? 'date' : 'text'} className={LINE} value={String(value ?? '')} onChange={(event) => onField(key, event.target.value)} />;
        }
        return (
          <div key={key} className="flex flex-col gap-1">
            <label htmlFor={id} className={TYPE.label}>
              {label}
            </label>
            {control}
            {error ? (
              <p id={`${id}-error`} role="alert" className={FIELD_ERROR}>
                {error}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
```

(`Select` with `labelPosition="external"` renders no label of its own: the `<label htmlFor={id}>` above is its one visible label. `Switch` is a `role="switch"` button named by `label`; its children are the visible words.)

- [ ] **Step 6: One step**

Create `src/components/work/BundleStep.tsx`:

```tsx
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { BUNDLE, audienceText, filledInText, outputLinks, runnable, showsCantUndo, stepAsAction, stepStateText } from '../../features/agents/bundleText';
import type { Bundle, BundleStep as Step, StepFields, StepFieldValue } from '../../features/agents/bundleTypes';
import type { AgentAction } from '../../features/agents/agentTypes';
import { AgentActionBody } from '../agents/AgentActionBody';
import { UndoAction } from '../agents/UndoAction';
import { LINK } from '../brain/styles';
import { CHECKBOX, FOCUS, FORM_ALERT, NUM, TYPE } from '../ui';
import { BundleStepFields } from './BundleStepFields';
import { PlaceholderText } from './PlaceholderText';

export interface BundleStepProps {
  bundle: Bundle;
  step: Step;
  /** The panel's edits for this step. */
  entry: { selected: boolean; fields: StepFields };
  errors: Record<string, string>;
  /** The bundle is waiting: tick boxes and disabled reasons show. */
  ticking: boolean;
  /** Fields are live: a waiting bundle, or a failed step to retry (Task 9). */
  editing: boolean;
  onToggle: (selected: boolean) => void;
  onField: (key: string, value: StepFieldValue) => void;
  onUndone: (action: AgentAction, text: string) => void;
  /** Task 9: Retry for a failed step. */
  retry?: React.ReactNode;
}

/** One step (spec §8.2; frontend Decisions 7 to 10): tick, kind, title,
 *  "Can't be undone", why it is disabled, its preview, its fields while it
 *  is ticked, then after a run its state, its links and its Undo. */
export function BundleStep({ bundle, step, entry, errors, ticking, editing, onToggle, onField, onUndone, retry }: BundleStepProps) {
  const id = useId();
  const live = ticking && step.status === 'proposed';
  const action = stepAsAction(bundle, step);
  const state = stepStateText(step);
  const links = step.status === 'applied' ? outputLinks(step.outputs) : [];
  const survey = step.preview.survey;
  const audience = survey?.audience ?? step.preview.campaign?.audience;
  const limit = survey?.limit ?? step.preview.campaign?.limit;
  const heading = `${step.position}. ${step.label}`;
  return (
    <li data-step={step.id} data-testid={`step-${step.id}`} className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-start gap-3">
        {live ? (
          <input
            id={`${id}-tick`}
            type="checkbox"
            className={`mt-1 ${CHECKBOX}`}
            checked={entry.selected}
            disabled={!step.can_run}
            aria-describedby={step.disabled_reason ? `${id}-why` : undefined}
            onChange={(event) => onToggle(event.target.checked)}
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {live ? (
            <label htmlFor={`${id}-tick`} className={TYPE.label}>
              {heading}
            </label>
          ) : (
            <p className={TYPE.label}>{heading}</p>
          )}
          <p className={`${TYPE.body} break-words`}>
            <PlaceholderText text={step.title} placeholders={step.placeholders} />
          </p>
          {step.placeholders.length > 0 && step.status === 'proposed' ? <p className={TYPE.meta}>{filledInText(step.placeholders[0].step)}</p> : null}
          {showsCantUndo(step, entry.fields) && step.status !== 'applied' ? (
            <p data-part="cant-undo" className={`inline-flex items-center gap-1 ${TYPE.meta}`}>
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              {BUNDLE.CANT_UNDO}
            </p>
          ) : null}
          {live && step.disabled_reason ? (
            <p id={`${id}-why`} className={TYPE.bodyMuted}>
              {step.disabled_reason}
            </p>
          ) : null}
        </div>
      </div>
      <AgentActionBody action={action} />
      {survey ? (
        <p className={TYPE.body}>
          <span className="font-semibold">{BUNDLE.QUESTION}: </span>
          {survey.question}
        </p>
      ) : null}
      {audience ? (
        <p className={TYPE.bodyMuted}>
          <span className="sr-only">{`${BUNDLE.AUDIENCE}: `}</span>
          <span className={NUM}>{audienceText(audience, limit)}</span>
        </p>
      ) : null}
      {(live && entry.selected && step.can_run) || (editing && step.status === 'failed') ? (
        <BundleStepFields bundle={bundle} step={step} fields={entry.fields} errors={errors} onField={onField} />
      ) : null}
      {step.status === 'failed' ? (
        <div className="flex flex-col gap-2">
          <p data-focus="" tabIndex={-1} role="alert" className={`${FORM_ALERT} ${FOCUS}`}>
            {step.error}
          </p>
          {retry}
        </div>
      ) : null}
      {state && step.status !== 'proposed' ? (
        <p data-part="state" data-focus="" tabIndex={-1} className={`${TYPE.meta} ${FOCUS}`}>
          {state}
        </p>
      ) : null}
      {links.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {links.map((link) => (
            <Link key={link.to} to={link.to} className={LINK}>
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
      {step.status === 'applied' && step.undo ? <UndoAction action={action} onUndone={onUndone} /> : null}
    </li>
  );
}
```

(`FORM_ALERT` is the 13px danger line; never append a colour to a `TYPE` string.)

- [ ] **Step 7: The panel**

Create `src/components/work/BundlePanel.tsx`:

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { runBundle } from '../../features/agents/bundlesApi';
import {
  BUNDLE,
  BUNDLE_GONE,
  draftOf,
  readRunRefusal,
  runBody,
  runLabel,
  selectedCount,
  summaryText,
  type Draft,
  type RunRefusal,
} from '../../features/agents/bundleText';
import type { Bundle } from '../../features/agents/bundleTypes';
import { recordPath } from '../../features/brain/deskText';
import { FEED, forText } from '../../features/work/feed';
import { Sheet } from '../organizations/detail/Sheet';
import { ErrorBlock } from '../organizations/portfolio/PortfolioSections';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { FOCUS, FORM_ALERT, ListCard, LoadingState, PRIMARY, TYPE } from '../ui';
import { LINK } from '../brain/styles';
import { BundleStep } from './BundleStep';
import { feedChanged, taskChanged } from './taskChanges';
import { useBundle } from './useBundle';

const NO_REFUSAL: RunRefusal = { form: null, fields: {}, bundle: null, lost: false };

/** One bundle in the wide Sheet (spec §8.2): what it is about, its steps,
 *  and Run N selected, the page's one primary. Edits live here until Run
 *  (contract D10). After a run the panel stays on the results; the summary
 *  line takes focus; the queue and the badge read again. */
export function BundlePanel({ id, isSm, onClose, fallbackFocus }: { id: number; isSm: boolean; onClose: () => void; fallbackFocus: () => HTMLElement | null | undefined }) {
  const load = useBundle(id);
  const bundle = load.bundle;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [refusal, setRefusal] = useState<RunRefusal>(NO_REFUSAL);
  const [said, setSaid] = useState<{ text: string; n: number } | null>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const { busy, run } = useSubmitOnce();
  const current = draft ?? (bundle ? draftOf(bundle) : null);
  const editing = bundle?.status === 'waiting';

  useEffect(() => {
    if (said) summaryRef.current?.focus();
  }, [said]);
  useEffect(() => {
    if (refusal.form) alertRef.current?.focus();
  }, [refusal]);

  const say = (text: string) => setSaid((prev) => ({ text, n: (prev?.n ?? 0) + 1 }));
  const take = (next: Bundle) => {
    load.replace(next);
    setDraft(null);
  };
  const edit = (stepId: number, change: (entry: Draft[number]) => Draft[number]) =>
    setDraft((prev) => {
      const base = prev ?? (bundle ? draftOf(bundle) : {});
      return { ...base, [stepId]: change(base[stepId]) };
    });

  async function runIt() {
    if (!bundle || !current || busy) return;
    if (selectedCount(bundle, current) === 0) {
      setRefusal({ ...NO_REFUSAL, form: BUNDLE.NONE_SELECTED });
      return;
    }
    setRefusal(NO_REFUSAL);
    const outcome = await run(() => runBundle(bundle.id, runBody(bundle, current)));
    if (!outcome) return;
    feedChanged();
    taskChanged();
    if (outcome.ok) {
      take(outcome.value.bundle);
      say(summaryText(outcome.value.bundle));
      return;
    }
    const read = readRunRefusal(outcome.error);
    if (read.lost) {
      load.lose();
      return;
    }
    if (read.bundle) take(read.bundle);
    setRefusal(read);
  }

  let body: ReactNode;
  if (load.lost) body = <p className={TYPE.bodyMuted}>{BUNDLE_GONE}</p>;
  else if (!bundle && load.error) body = <ErrorBlock message={load.error} onRetry={load.retry} />;
  else if (!bundle || !current) body = <LoadingState label={BUNDLE.LOADING} count={3} />;
  else
    body = (
      <div className="flex flex-col gap-4">
        {said ? (
          <p ref={summaryRef} key={said.n} role="status" tabIndex={-1} className={`${TYPE.body} font-semibold ${FOCUS}`}>
            {said.text}
          </p>
        ) : null}
        {refusal.form ? (
          <p ref={alertRef} role="alert" tabIndex={-1} className={`${FORM_ALERT} ${FOCUS}`}>
            {refusal.form}
          </p>
        ) : null}
        {bundle.reason ? <p className={`max-w-[68ch] ${TYPE.bodyMuted}`}>{bundle.reason}</p> : null}
        <p className={`flex flex-wrap items-center gap-x-2 ${TYPE.meta}`}>
          <span>{bundle.source.label}</span>
          <span aria-hidden="true">·</span>
          <span>{bundle.agent_label}</span>
          <span aria-hidden="true">·</span>
          {bundle.record ? (
            <Link to={recordPath(bundle.record)} className={LINK}>
              {bundle.record.name}
            </Link>
          ) : (
            <span>{FEED.FOR_COMPANY}</span>
          )}
          {bundle.for && bundle.record ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{forText(bundle.for)}</span>
            </>
          ) : null}
        </p>
        <ListCard label={BUNDLE.STEPS}>
          {[...bundle.steps]
            .sort((a, b) => a.position - b.position)
            .map((step) => (
              <BundleStep
                key={step.id}
                bundle={bundle}
                step={step}
                entry={current[step.id]}
                errors={refusal.fields[step.id] ?? {}}
                ticking={editing}
                editing={editing}
                onToggle={(selected) => edit(step.id, (entry) => ({ ...entry, selected }))}
                onField={(key, value) => edit(step.id, (entry) => ({ ...entry, fields: { ...entry.fields, [key]: value } }))}
                onUndone={(_action, text) => {
                  say(text);
                  load.retry();
                  feedChanged();
                }}
              />
            ))}
        </ListCard>
      </div>
    );

  const count = bundle && current ? selectedCount(bundle, current) : 0;
  const footer =
    bundle && editing && bundle.can_run ? (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void runIt()} aria-disabled={busy || count === 0 || undefined} className={PRIMARY}>
          {busy ? BUNDLE.RUNNING : runLabel(count)}
        </button>
      </div>
    ) : undefined;

  return (
    <Sheet
      title={bundle ? bundle.title : BUNDLE.LOADING}
      description={bundle ? (bundle.record ? bundle.record.name : FEED.FOR_COMPANY) : undefined}
      isSm={isSm}
      size="wide"
      phone="full"
      focus="heading"
      footer={footer}
      returnFocus={fallbackFocus}
      onClose={onClose}
    >
      {body}
    </Sheet>
  );
}
```

(`Sheet` names the dialog by its title, so "Loading the bundle" names it until the bundle lands; tests wait for the bundle's title.)

- [ ] **Step 8: Run the tests**

Run: `npx vitest run src/components/work/BundlePanel.test.tsx src/features/agents/bundleText.test.ts src/pages/work --maxWorkers=2 && npx tsc -b && npm run lint`
Expected: PASS. Then the house rules: `npx vitest run src/components/work/houseRules.test.ts src/test/uiRatchet.test.ts --maxWorkers=2`: the new files add no offence (no `text-[NNpx]`, no em dash, every control on a 44px class).

- [ ] **Step 9: Commit**

```bash
git add src/components/work/useBundle.ts src/components/work/BundleSheet.tsx src/components/work/BundlePanel.tsx src/components/work/BundleStep.tsx src/components/work/BundleStepFields.tsx src/components/work/PlaceholderText.tsx src/components/work/BundlePanel.test.tsx src/features/agents/bundleText.ts src/features/agents/bundleText.test.ts src/components/agents/UndoAction.tsx
git commit -m "feat(work): the bundle panel: edit, untick, Run selected, results with links

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Retry, Reject bundle, discarding edits, and the refusals

**Files:**
- Create: `src/components/work/BundleReject.tsx`
- Modify: `src/components/work/BundlePanel.tsx`, `src/components/work/BundlePanel.test.tsx`

**Interfaces:**
- Consumes: `retryStep`, `rejectBundle` (Task 1), `REJECT_REASONS`, `changedFields`, `isDirty`, `readRunRefusal` (Task 3), `BundleStep`'s `retry` slot (Task 8), `DANGER`, `QUIET`, `BUTTON`.
- Produces: `BundleReject({ bundle, onDone, onCancel })` where `onDone(next: Bundle | null, line?: string | null)` (null: lost); the panel's discard bar; Retry per failed step.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/work/BundlePanel.test.tsx`:

```tsx
describe('Bundle panel: retry, reject, discard and refusals (frontend Decisions 6, 12, 14, 15)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    document.body.style.overflow = '';
  });

  it('shows a failed step with Retry, a dependent step waiting on it, and retries both', async () => {
    stubBundles({ failSteps: { 51: 'Nobody to send to.' } });
    renderWork('/work?queue=company&bundle=13');
    const panel = await screen.findByRole('dialog', { name: B_CAMPAIGN.title });
    await userEvent.click(await within(panel).findByRole('button', { name: 'Run 2 selected' }));
    expect(await within(panel).findByText('0 of 2 steps ran. Retry the failed ones.')).toHaveFocus();
    const first = within(panel).getByTestId('step-51');
    expect(within(first).getByRole('alert')).toHaveTextContent('Nobody to send to.');
    expect(within(within(panel).getByTestId('step-52')).getByRole('alert')).toHaveTextContent("Needs step 1, which didn't run.");
    await userEvent.click(within(first).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(within(within(panel).getByTestId('step-51')).getByText('Applied')).toBeInTheDocument());
    await userEvent.click(within(within(panel).getByTestId('step-52')).getByRole('button', { name: 'Retry' }));
    expect(await within(panel).findByText('Done: all 2 steps ran.')).toBeInTheDocument();
    expect(within(panel).getByText('Follow up on /campaigns/990')).toBeInTheDocument();
  });

  it('asks before throwing edits away, and closes back to the Review button on Discard', async () => {
    stubBundles();
    renderWork('/work?queue=mine');
    const review = await screen.findByRole('link', { name: `Review ${B_PIZZA.title}` });
    await userEvent.click(review);
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    await userEvent.type(await within(panel).findByLabelText('Title'), ' now');
    await userEvent.keyboard('{Escape}');
    expect(within(panel).getByText('Discard your edits?')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Keep editing' })).toHaveFocus();
    await userEvent.click(within(panel).getByRole('button', { name: 'Keep editing' }));
    expect(within(panel).getByLabelText('Title')).toHaveValue('Call Pizza Hut about the renewal now');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(panel).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: `Review ${B_PIZZA.title}` })).toHaveFocus();
  });

  it('rejects with a reason, refusing none first, and the row leaves', async () => {
    stubBundles();
    renderWork('/work?queue=company&bundle=14');
    const panel = await screen.findByRole('dialog', { name: B_SURVEY.title });
    await userEvent.click(await within(panel).findByRole('button', { name: 'Reject bundle' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Reject it' }));
    expect(within(panel).getByText('Choose a reason.')).toBeInTheDocument();
    await userEvent.selectOptions(within(panel).getByLabelText('Why'), 'not_relevant');
    await userEvent.type(within(panel).getByLabelText('Note (optional)'), 'Surveyed last month.');
    await userEvent.click(within(panel).getByRole('button', { name: 'Reject it' }));
    expect(await within(panel).findByText('Rejected.')).toHaveFocus();
  });

  it('shows a 409 in the server words and the bundle as it is now; a field refusal under its field', async () => {
    stubBundles({ refuseNextRun: { status: 409, body: { code: 'BUNDLE_RAN', detail: 'Carl CSM ran this at 10:42.', bundle: { ...B_PIZZA, status: 'done', can_run: false, steps: B_PIZZA.steps.map((s) => ({ ...s, status: 'applied', can_run: false })) } } } });
    renderWork('/work?queue=mine&bundle=12');
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    await userEvent.click(await within(panel).findByRole('button', { name: 'Run 2 selected' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Carl CSM ran this at 10:42.');
    expect(within(panel).queryByRole('button', { name: /^Run / })).not.toBeInTheDocument();
  });

  it('puts a 400 field error under the field', async () => {
    stubBundles();
    renderWork('/work?queue=mine&bundle=12');
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    await userEvent.clear(await within(panel).findByLabelText('Title'));
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 2 selected' }));
    expect(await within(panel).findByText('Give the task a title.')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
  });
});
```

(The first test's summary: both steps failed on the first run, so `summaryText` says "0 of 2 steps ran. Retry the failed ones."; check that `summaryText` gives exactly that for `applied === 0 && failed > 0`, which it does: the "Nothing ran" line is only for no applied and no failed.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/work/BundlePanel.test.tsx --maxWorkers=2`
Expected: FAIL (no Retry, no Reject, Escape closes at once).

- [ ] **Step 3: Reject**

Create `src/components/work/BundleReject.tsx`:

```tsx
import { useId, useRef, useState, type FormEvent } from 'react';
import { rejectBundle } from '../../features/agents/bundlesApi';
import { AGENTS } from '../../features/agents/agentsText';
import { BUNDLE, REJECT_REASONS, readRunRefusal } from '../../features/agents/bundleText';
import type { Bundle, RejectReason } from '../../features/agents/bundleTypes';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { DANGER, FIELD_ERROR, FORM_ALERT, INPUT, INVALID, QUIET, Select, TYPE } from '../ui';

/** Reject bundle (spec §6.7; frontend Decision 14): a reason (required) and
 *  an optional note, refused here first in the server's own words. */
export function BundleReject({ bundle, onDone, onCancel }: { bundle: Bundle; onDone: (next: Bundle | null, line?: string | null) => void; onCancel: () => void }) {
  const id = useId();
  const [reason, setReason] = useState<RejectReason | ''>('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ reason?: string; note?: string; form?: string }>({});
  const reasonRef = useRef<HTMLDivElement>(null);
  const { busy, run } = useSubmitOnce();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason) {
      setErrors({ reason: BUNDLE.CHOOSE_REASON });
      reasonRef.current?.querySelector('select')?.focus();
      return;
    }
    if (note.length > 255) {
      setErrors({ note: AGENTS.NOTE_TOO_LONG });
      return;
    }
    const outcome = await run(() => rejectBundle(bundle.id, reason, note));
    if (!outcome) return;
    if (outcome.ok) {
      onDone(outcome.value.bundle);
      return;
    }
    const read = readRunRefusal(outcome.error, BUNDLE.REJECT_FAILED);
    if (read.lost) onDone(null);
    else if (read.bundle) onDone(read.bundle, read.form);
    else setErrors({ reason: read.fields[0]?.reason, note: read.fields[0]?.note, form: read.form ?? undefined });
  }

  return (
    <form onSubmit={(event) => void submit(event)} aria-label={BUNDLE.REJECT} className="flex w-full flex-col gap-3">
      <div ref={reasonRef}>
        <Select
          id={`${id}-reason`}
          label={BUNDLE.WHY}
          labelPosition="above"
          value={reason}
          onChange={(value) => setReason(value as RejectReason | '')}
          options={[{ value: '', label: 'Choose a reason' }, ...REJECT_REASONS]}
          invalid={Boolean(errors.reason)}
          describedBy={errors.reason ? `${id}-reason-error` : undefined}
        />
        {errors.reason ? (
          <p id={`${id}-reason-error`} role="alert" className={FIELD_ERROR}>
            {errors.reason}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-note`} className={TYPE.label}>
          {BUNDLE.NOTE}
        </label>
        <textarea
          id={`${id}-note`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          aria-invalid={Boolean(errors.note)}
          aria-describedby={`${id}-note-hint${errors.note ? ` ${id}-note-error` : ''}`}
          className={`${INPUT} ${INVALID} min-h-20 py-2`}
        />
        <p id={`${id}-note-hint`} className={TYPE.meta}>
          {BUNDLE.NOTE_HINT}
        </p>
        {errors.note ? (
          <p id={`${id}-note-error`} role="alert" className={FIELD_ERROR}>
            {errors.note}
          </p>
        ) : null}
      </div>
      {errors.form ? (
        <p role="alert" className={FORM_ALERT}>
          {errors.form}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" aria-disabled={busy || undefined} className={DANGER}>
          {busy ? BUNDLE.REJECTING : BUNDLE.REJECT_IT}
        </button>
        <button type="button" onClick={onCancel} className={QUIET}>
          {BUNDLE.CANCEL}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Retry, the reject form and the discard bar in the panel**

In `src/components/work/BundlePanel.tsx`:

1. State: `const [mode, setMode] = useState<'run' | 'reject' | 'discard'>('run');`, `const [retrying, setRetrying] = useState<number | null>(null);`, `const keepRef = useRef<HTMLButtonElement>(null);` and `useEffect(() => { if (mode === 'discard') keepRef.current?.focus(); }, [mode]);`.
2. Closing asks first:

```tsx
  const requestClose = () => {
    if (bundle && current && bundle.status === 'waiting' && isDirty(bundle, current)) setMode('discard');
    else onClose();
  };
```

and pass `onClose={requestClose}` to `Sheet` (Escape, Close and the scrim all go through it).
3. Retry:

```tsx
  async function retryIt(stepId: number) {
    if (!bundle || !current || retrying !== null) return;
    const step = bundle.steps.find((candidate) => candidate.id === stepId);
    if (!step) return;
    setRetrying(stepId);
    setRefusal(NO_REFUSAL);
    try {
      const answer = await retryStep(bundle.id, stepId, changedFields(step, current[stepId].fields));
      feedChanged();
      taskChanged();
      take(answer.bundle);
      if (answer.bundle.status === 'done') say(summaryText(answer.bundle));
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-step="${stepId}"] [data-focus]`)?.focus());
    } catch (err) {
      const read = readRunRefusal(err, BUNDLE.RETRY_FAILED);
      if (read.lost) load.lose();
      else {
        if (read.bundle) take(read.bundle);
        setRefusal(read);
      }
    } finally {
      setRetrying(null);
    }
  }
```

and give each `BundleStep` `retry={step.status === 'failed' ? <button type="button" onClick={() => void retryIt(step.id)} aria-disabled={retrying === step.id || undefined} className={`${BUTTON} self-start`}>{retrying === step.id ? BUNDLE.RETRYING : BUNDLE.RETRY}</button> : undefined}`. A failed step's fields are editable (`BundleStep`'s `editing && step.status === 'failed'` branch): pass `editing={editing || bundle.status === 'partly_done'}`; `ticking={editing}` stays, so tick boxes show only while the bundle waits.
4. The footer:

```tsx
  let footer: ReactNode | undefined;
  if (bundle && mode === 'discard') {
    footer = (
      <div role="group" aria-label={BUNDLE.DISCARD_TITLE} className="flex flex-wrap items-center gap-2">
        <p className={`${TYPE.body} font-semibold`}>{BUNDLE.DISCARD_TITLE}</p>
        <button type="button" onClick={onClose} className={DANGER}>
          {BUNDLE.DISCARD}
        </button>
        <button ref={keepRef} type="button" onClick={() => setMode('run')} className={QUIET}>
          {BUNDLE.KEEP}
        </button>
      </div>
    );
  } else if (bundle && mode === 'reject') {
    footer = (
      <BundleReject
        bundle={bundle}
        onCancel={() => setMode('run')}
        onDone={(next, line) => {
          feedChanged();
          setMode('run');
          if (next === null) load.lose();
          else {
            take(next);
            if (line) setRefusal({ ...NO_REFUSAL, form: line });
            else say(BUNDLE.REJECTED);
          }
        }}
      />
    );
  } else if (bundle && editing && bundle.can_run) {
    footer = (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void runIt()} aria-disabled={busy || count === 0 || undefined} className={PRIMARY}>
          {busy ? BUNDLE.RUNNING : runLabel(count)}
        </button>
        {bundle.can_reject ? (
          <button type="button" onClick={() => setMode('reject')} className={BUTTON}>
            {BUNDLE.REJECT}
          </button>
        ) : null}
      </div>
    );
  } else if (bundle && editing && bundle.can_reject) {
    footer = (
      <button type="button" onClick={() => setMode('reject')} className={BUTTON}>
        {BUNDLE.REJECT}
      </button>
    );
  }
```

(import `BUTTON`, `DANGER`, `QUIET` from `../ui`; `retryStep` from `bundlesApi`; `changedFields`, `isDirty` from `bundleText`; `BundleReject`.) `summaryText` for a rejected bundle says "Rejected.", which `say(BUNDLE.REJECTED)` matches.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/components/work/BundlePanel.test.tsx src/components/work --maxWorkers=2 && npx tsc -b && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/work/BundleReject.tsx src/components/work/BundlePanel.tsx src/components/work/BundleStep.tsx src/components/work/BundlePanel.test.tsx
git commit -m "feat(work): retry a failed step, reject a bundle, ask before discarding edits

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: History, replacing Activity

**Files:**
- Create: `src/pages/work/History.test.tsx`
- Modify: `src/pages/work/History.tsx` (replaces Task 5's empty one), `src/pages/work/ActivityRedirect.tsx`, `src/features/agents/bundleText.ts` (+ test), `src/features/agents/testBundles.ts`, `src/components/agents/houseRules.test.ts`, `src/components/ops.houseRules.test.ts`, `src/test/inlineTargets.test.ts`, `src/pages/brain/Graph.tsx`
- Delete: `src/pages/work/Activity.tsx`, `src/pages/work/Activity.test.tsx`, `src/components/agents/ActivityRow.tsx`, `src/components/agents/ActivitySkeleton.tsx`, `src/components/agents/useActivity.ts`; `filtersOf`, `filtersParams`, `ActivityFilters`, `ActivityPayload`, `fetchActivity`, `activityQuery` and their tests **only** where `grep -rn` shows no other reader.

**Interfaces:**
- Consumes: `fetchHistory`, `historyQuery` (Task 1), `STATUS_WORD`, `BUNDLE` (Task 3), `bundleHref` (Task 4), `BundleSheet` (Task 8), `fetchAction` (existing, now carrying `bundle`).
- Produces: `HISTORY` words, `historyFiltersOf(params): HistoryFilters`, `historyParams(filters, params): URLSearchParams` (in `bundleText.ts`); `HistoryPage()`; `ActivityRedirect()`; the stub's `POST /agents/actions/<step id>/undo/` for a bundle step and `outputs?: Record<number, Record<string, string | number>>`.

- [ ] **Step 1: Write the failing tests**

Add to `src/features/agents/bundleText.test.ts`:

```ts
  it('reads History filters from the URL and writes them back, page 1 left out', () => {
    expect(historyFiltersOf(new URLSearchParams('queue=history&agent=ops&status=done&step_kind=survey.send&page=2'))).toEqual({ agent: 'ops', step_kind: 'survey.send', status: 'done', page: 2 });
    expect(historyFiltersOf(new URLSearchParams('agent=robot&status=waiting&page=x'))).toEqual({ agent: null, step_kind: null, status: null, page: 1 });
    expect(historyParams({ agent: 'cs', step_kind: null, status: null, page: 1 }, new URLSearchParams('queue=history&bundle=4')).toString()).toBe('queue=history&agent=cs');
  });
```

Create `src/pages/work/History.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { B_DONE, B_PARTLY } from '../../features/agents/testBundleFixtures';
import { stubBundles } from '../../features/agents/testBundles';
import { resetViewport } from '../../test/viewport';
import { renderWork, where } from './testPages';

describe('History (spec §8.1; frontend Decision 13)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    document.body.style.overflow = '';
  });

  it('lists finished bundles newest first with their status, and filters in the URL', async () => {
    stubBundles();
    renderWork('/work?queue=history');
    const list = await screen.findByRole('list', { name: 'Finished bundles' });
    expect(within(list).getAllByRole('heading').map((h) => h.textContent)).toEqual([B_PARTLY.title, B_DONE.title, 'Move Pizza Hut to Churn']);
    expect(within(list).getByText('Partly done')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'done');
    await waitFor(() => expect(where()).toBe('/work?queue=history&status=done'));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Finished bundles' })).getAllByRole('heading').map((h) => h.textContent)).toEqual([B_DONE.title]));
  });

  it('opens a finished bundle read-only with its results, links and Undo', async () => {
    stubBundles();
    renderWork('/work?queue=history');
    await userEvent.click(await screen.findByRole('link', { name: `Review ${B_PARTLY.title}` }));
    const panel = await screen.findByRole('dialog', { name: B_PARTLY.title });
    expect(within(panel).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Open segment' })).toHaveAttribute('href', '/segments/5');
    expect(within(within(panel).getByTestId('step-82')).getByRole('alert')).toHaveTextContent("Email isn't set up for this workspace yet, so surveys can't be sent.");
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await userEvent.click(await screen.findByRole('link', { name: `Review ${B_DONE.title}` }));
    const done = await screen.findByRole('dialog', { name: B_DONE.title });
    await userEvent.click(within(done).getByRole('button', { name: 'Undo' }));
    expect(await within(done).findByText('Undone: Book the QBR')).toBeInTheDocument();
  });

  it('says when nothing has finished, and when nothing matches the filters', async () => {
    stubBundles({ bundles: [] });
    renderWork('/work?queue=history');
    expect(await screen.findByText('Nothing finished yet')).toBeInTheDocument();
  });

  it('sends an old Activity link to its bundle in History', async () => {
    stubBundles({ actions: { 81: B_PARTLY.id } });
    renderWork('/work/activity?action=81');
    await waitFor(() => expect(where()).toBe('/work?queue=history&bundle=16'));
    expect(await screen.findByRole('dialog', { name: B_PARTLY.title })).toBeInTheDocument();
  });

  it('sends an Activity link it cannot resolve to History', async () => {
    stubBundles();
    renderWork('/work/activity?action=999');
    await waitFor(() => expect(where()).toBe('/work?queue=history'));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/work/History.test.tsx src/features/agents/bundleText.test.ts --maxWorkers=2`
Expected: FAIL.

- [ ] **Step 3: The words and the stub's undo**

Append to `src/features/agents/bundleText.ts` (import `ACTION_KINDS`, `AGENT_KINDS`, `type ActionKind`, `type AgentKind` from `./agentTypes`; `FINISHED_STATUSES`, `type FinishedStatus`, `type HistoryFilters` from `./bundleTypes`):

```ts
export const HISTORY = {
  LIST: 'Finished bundles',
  LOAD: 'Could not load History.',
  LOADING: 'Loading History',
  EMPTY_TITLE: 'Nothing finished yet',
  EMPTY_DETAIL: "Bundles show here once they ran, were rejected or expired, with each step's result and Undo for 7 days.",
  STEP_KIND: 'Step kind',
  ALL_STEP_KINDS: 'All step kinds',
  RAN_BY: 'Ran by',
  REJECTED_BY: 'Rejected by',
  ON_ITS_OWN: 'Applied on its own',
} as const;

export function historyFiltersOf(params: URLSearchParams): HistoryFilters {
  const agent = params.get('agent');
  const kind = params.get('step_kind');
  const status = params.get('status');
  const page = Number(params.get('page'));
  return {
    agent: AGENT_KINDS.includes(agent as AgentKind) ? (agent as AgentKind) : null,
    step_kind: ACTION_KINDS.includes(kind as ActionKind) ? (kind as ActionKind) : null,
    status: FINISHED_STATUSES.includes(status as FinishedStatus) ? (status as FinishedStatus) : null,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** `params` with the History filters written in (and an open panel closed). */
export function historyParams(filters: HistoryFilters, params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of ['agent', 'step_kind', 'status', 'page', 'bundle']) next.delete(key);
  if (filters.agent) next.set('agent', filters.agent);
  if (filters.step_kind) next.set('step_kind', filters.step_kind);
  if (filters.status) next.set('status', filters.status);
  if (filters.page > 1) next.set('page', String(filters.page));
  return next;
}

/** Who finished it and when, for a History row. */
export function finishedByText(bundle: Bundle): string {
  if (bundle.status === 'rejected') return bundle.run_by ? `${HISTORY.REJECTED_BY} ${bundle.run_by.name}` : STATUS_WORD.rejected;
  if (bundle.status === 'expired' || bundle.status === 'superseded') return STATUS_WORD[bundle.status];
  return bundle.run_by ? `${HISTORY.RAN_BY} ${bundle.run_by.name}` : HISTORY.ON_ITS_OWN;
}
```

In `src/features/agents/testBundles.ts` add to `BundlesStub` `outputs?: Record<number, Record<string, string | number>>` (step id: the outputs a run gives it, overriding `OUTPUTS`) and use it in `runStep`: `s.outputs = stub.outputs?.[s.id] ?? (OUTPUTS[s.kind] ?? (() => ({})))(nextOut++);`. Add `'segment.create': (id) => ({ segment_id: id, segment_url: `/segments/${id}` })` and `'plan.start': (id) => ({ plan_id: id })` to `OUTPUTS`. Before the action route in `spy`:

```ts
    const undo = /^\/agents\/actions\/(\d+)\/undo\/$/.exec(path);
    if (undo && method === 'POST') {
      for (const b of bundles.values()) {
        const s = b.steps.find((candidate) => candidate.id === Number(undo[1]));
        if (!s) continue;
        if (s.status !== 'applied' || !s.undo?.allowed) return json(409, { code: 'NOT_APPLIED', detail: 'Only an applied action can be undone.' });
        s.status = 'undone';
        s.undo = null;
        return json(200, { action: { id: s.id, title: s.title, status: 'undone', undo: null, bundle: b.id } });
      }
    }
```

- [ ] **Step 4: The page and the redirect**

Replace `src/pages/work/History.tsx`:

```tsx
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { fetchHistory, historyQuery } from '../../features/agents/bundlesApi';
import { BUNDLE, HISTORY, STATUS_WORD, finishedByText, historyFiltersOf, historyParams } from '../../features/agents/bundleText';
import { FINISHED_STATUSES, type HistoryFilters, type HistoryPayload } from '../../features/agents/bundleTypes';
import { AGENTS, AGENT_LABEL, KIND_LABEL, hiddenActivityText } from '../../features/agents/agentsText';
import { ACTION_KINDS, AGENT_KINDS } from '../../features/agents/agentTypes';
import { bundleHref, dayText, forText } from '../../features/work/feed';
import { BUTTON, Card, EmptyState, ErrorState, FOCUS, ListCard, LoadingState, NUM, QUIET, Select, TYPE } from '../../components/ui';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { useFeedChanges } from '../../components/work/taskChanges';
import { OPENED_HERE } from '../../components/work/useTaskLink';
import { ApiError } from '../../lib/apiClient';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';

/** History (spec §8.1; frontend Decision 13): finished bundles the reader
 *  may read, newest change first, 50 a page, filtered in the URL. Review
 *  opens the panel read-only with each step's result, links and Undo. */
export function HistoryPage() {
  const titleId = useId();
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const filters = historyFiltersOf(params);
  const key = historyQuery(filters);
  const filterLabel = useMediaQuery(SM) ? 'inline' : 'above';
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; data: HistoryPayload } | null>(null);
  const [failure, setFailure] = useState<{ key: string; text: string; status: number | null } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const paging = useRef(false);
  useFeedChanges(() => setAttempt((n) => n + 1));

  useEffect(() => {
    let alive = true;
    fetchHistory(historyFiltersOf(new URLSearchParams(key))).then(
      (data) => {
        if (!alive) return;
        setLoaded({ key, data });
        setFailure(null);
      },
      (err: unknown) => alive && setFailure({ key, text: errorMessage(err, HISTORY.LOAD), status: err instanceof ApiError ? err.status : null }),
    );
    return () => {
      alive = false;
    };
  }, [key, attempt]);

  const data = loaded && loaded.key === key ? loaded.data : null;
  const error = !data && failure && failure.key === key ? failure : null;

  // A page past the end (a 404) has a way out: page 1.
  useEffect(() => {
    if (error?.status === 404 && filters.page > 1) setParams(historyParams({ ...filters, page: 1 }, params), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error?.status, key]);
  useEffect(() => {
    if (!paging.current || !data) return;
    paging.current = false;
    headingRef.current?.focus();
  }, [data]);

  const choose = (change: Partial<HistoryFilters>) => setParams(historyParams({ ...filters, ...change, page: change.page ?? 1 }, params), { replace: true });
  const turn = (page: number) => {
    paging.current = true;
    choose({ page });
  };
  const filtered = filters.agent !== null || filters.step_kind !== null || filters.status !== null;

  let body: ReactNode;
  if (error)
    body = (
      <Card pad="none">
        <ErrorState message={error.text} onRetry={() => setAttempt((n) => n + 1)} />
      </Card>
    );
  else if (!data) body = <ListCard label={HISTORY.LOADING} state={<LoadingState label={HISTORY.LOADING} count={4} />} />;
  else if (data.results.length === 0)
    body = (
      <Card pad="none">
        {filtered ? (
          <EmptyState
            title={AGENTS.EMPTY_FILTERED_TITLE}
            action={
              <Link to={`/work?${historyParams({ agent: null, step_kind: null, status: null, page: 1 }, params).toString()}`} replace className={QUIET}>
                {AGENTS.CLEAR_FILTERS}
              </Link>
            }
          />
        ) : (
          <EmptyState title={HISTORY.EMPTY_TITLE} detail={HISTORY.EMPTY_DETAIL} />
        )}
      </Card>
    );
  else
    body = (
      <>
        <ListCard label={HISTORY.LIST}>
          {data.results.map((bundle) => (
            <li key={bundle.id} data-bundle={bundle.id} className="flex flex-col gap-1 px-4 py-3">
              <h3 className={`${TYPE.body} break-words font-semibold`}>{bundle.title}</h3>
              <p className={`flex flex-wrap items-center gap-x-2 ${TYPE.meta}`}>
                <span className="font-semibold">{STATUS_WORD[bundle.status]}</span>
                <span aria-hidden="true">·</span>
                <span>{forText(bundle.for)}</span>
                <span aria-hidden="true">·</span>
                <span>{bundle.agent_label}</span>
                <span aria-hidden="true">·</span>
                <span>{finishedByText(bundle)}</span>
                <span aria-hidden="true">·</span>
                <span className={NUM}>{dayText(bundle.run_finished_at ?? bundle.updated_at)}</span>
              </p>
              <Link to={bundleHref(pathname, params, bundle.id)} state={OPENED_HERE} aria-label={`${BUNDLE.REVIEW} ${bundle.title}`} className={`${BUTTON} self-start`}>
                {BUNDLE.REVIEW}
              </Link>
            </li>
          ))}
        </ListCard>
        {data.previous || data.next ? (
          <div className="flex flex-wrap gap-2">
            {data.previous ? (
              <button type="button" onClick={() => turn(filters.page - 1)} className={BUTTON}>
                {AGENTS.PREVIOUS}
              </button>
            ) : null}
            {data.next ? (
              <button type="button" onClick={() => turn(filters.page + 1)} className={BUTTON}>
                {AGENTS.NEXT}
              </button>
            ) : null}
          </div>
        ) : null}
      </>
    );
  const hidden = data ? hiddenActivityText(data.hidden) : null;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={titleId} ref={headingRef} tabIndex={-1} className={`${TYPE.title} ${FOCUS}`}>
          {HISTORY.LIST} {data ? <span className={`${TYPE.meta} ${NUM}`}>{data.count}</span> : null}
        </h2>
        <div className="grid w-full gap-3 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-2">
          <Select label={AGENTS.AGENT} labelPosition={filterLabel} value={filters.agent ?? ''} onChange={(value) => choose({ agent: (value || null) as HistoryFilters['agent'] })} options={[{ value: '', label: AGENTS.ALL_AGENTS }, ...AGENT_KINDS.map((kind) => ({ value: kind, label: AGENT_LABEL[kind] }))]} />
          <Select label={HISTORY.STEP_KIND} labelPosition={filterLabel} value={filters.step_kind ?? ''} onChange={(value) => choose({ step_kind: (value || null) as HistoryFilters['step_kind'] })} options={[{ value: '', label: HISTORY.ALL_STEP_KINDS }, ...ACTION_KINDS.map((kind) => ({ value: kind, label: KIND_LABEL[kind] }))]} />
          <Select label={AGENTS.STATUS} labelPosition={filterLabel} value={filters.status ?? ''} onChange={(value) => choose({ status: (value || null) as HistoryFilters['status'] })} options={[{ value: '', label: AGENTS.ALL_STATUSES }, ...FINISHED_STATUSES.map((value) => ({ value, label: STATUS_WORD[value] }))]} />
        </div>
      </div>
      {body}
      {hidden ? <p className={TYPE.bodyMuted}>{hidden}</p> : null}
    </section>
  );
}
```

Replace `src/pages/work/ActivityRedirect.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { fetchAction } from '../../features/agents/agentsApi';
import { HISTORY } from '../../features/agents/bundleText';
import { LoadingState } from '../../components/ui';
import { WorkFrame } from '../../components/work/WorkFrame';

const HISTORY_PATH = '/work?queue=history';

/** /work/activity (Activity's old links, frontend Decision 13): with
 *  ?action=<id> the bundle that action is a step of opens in History; a read
 *  that fails, or no id, lands on History. */
export function ActivityRedirect() {
  const [params] = useSearchParams();
  const action = Number(params.get('action')) || null;
  const [to, setTo] = useState<{ action: number; path: string } | null>(null);
  useEffect(() => {
    if (action === null) return;
    let alive = true;
    fetchAction(action).then(
      (found) => alive && setTo({ action, path: typeof found.bundle === 'number' ? `${HISTORY_PATH}&bundle=${found.bundle}` : HISTORY_PATH }),
      () => alive && setTo({ action, path: HISTORY_PATH }),
    );
    return () => {
      alive = false;
    };
  }, [action]);
  if (action === null) return <Navigate to={HISTORY_PATH} replace />;
  if (to && to.action === action) return <Navigate to={to.path} replace />;
  return (
    <WorkFrame>
      <LoadingState label={HISTORY.LOADING} variant="block" count={1} />
    </WorkFrame>
  );
}
```

In `src/pages/brain/Graph.tsx` change the agent action node's label to `'Open in History'` (its link `/work/activity?action=<id>` resolves through this redirect).

- [ ] **Step 5: Delete Activity**

`git rm src/pages/work/Activity.tsx src/pages/work/Activity.test.tsx src/components/agents/ActivityRow.tsx src/components/agents/ActivitySkeleton.tsx src/components/agents/useActivity.ts`. Remove their paths from `src/components/agents/houseRules.test.ts` (the glob of `../../pages/work/Activity.tsx` and the expected-file list), `src/components/ops.houseRules.test.ts` (lines naming them) and `src/test/inlineTargets.test.ts`; add `'../../pages/work/History.tsx'` where `Activity.tsx` was in the agents house rules, and `'../pages/work/History.tsx'` in `ops.houseRules.test.ts`. Then `grep -rn "fetchActivity\|activityQuery\|filtersOf\|filtersParams\|ActivityFilters\|ActivityPayload" src` and delete each one left with no reader (with its test cases).

- [ ] **Step 6: Run the tests, the type check, the lint and the ratchet**

Run: `npx vitest run src/pages/work src/features/agents src/components/agents src/components/ops.houseRules.test.ts src/test --maxWorkers=2 && npx tsc -b && npm run lint`
Expected: PASS; the ratchet drops with Activity's deletion: set `BASELINE` to the new totals.

- [ ] **Step 7: Commit**

```bash
git add src/pages/work/History.tsx src/pages/work/History.test.tsx src/pages/work/ActivityRedirect.tsx src/features/agents/bundleText.ts src/features/agents/bundleText.test.ts src/features/agents/testBundles.ts src/components/agents/houseRules.test.ts src/components/ops.houseRules.test.ts src/test/inlineTargets.test.ts src/pages/brain/Graph.tsx src/test/uiRatchet.test.ts
git rm src/pages/work/Activity.tsx src/pages/work/Activity.test.tsx src/components/agents/ActivityRow.tsx src/components/agents/ActivitySkeleton.tsx src/components/agents/useActivity.ts
git commit -m "feat(work): History replaces Activity; old Activity links open their bundle

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(also `git add` the agents files the grep in Step 5 changed.)

---

### Task 11: Next up, the sidebar, the bell and the links into Work

**Files:**
- Modify: `src/features/work/feed.ts` (+ `feed.test.ts`), `src/components/work/NextUpCard.tsx`, `src/components/work/NextUpCard.test.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/Navbar.test.tsx`, `src/features/notifications/types.ts`, `src/pages/copilot/ChatView.tsx`, `src/pages/brain/BrainRoutes.tsx`

**Interfaces:**
- Consumes: `bundleItem`, `B_PIZZA`, `stubBundles`, `BundleRow` through `FeedRow`, `bundleHref(pathname, …)`.
- Produces: `nextUp(feed)` puts the decide group's bundles first.

- [ ] **Step 1: Write the failing tests**

In `src/features/work/feed.test.ts`:

```ts
  it('puts bundles first in Next up, then the rest of decide, overdue and today', () => {
    const feed = {
      groups: [
        { key: 'decide', count: 2, items: [REVIEW, BUNDLE_ITEM], next: null },
        { key: 'overdue', count: 0, items: [], next: null },
        { key: 'today', count: 0, items: [], next: null },
      ],
      hidden: 0,
      failed: [],
    } as unknown as FeedPayload;
    expect(nextUp(feed).items.map(({ item }) => item.key)).toEqual([BUNDLE_ITEM.key, REVIEW.key]);
  });
```

In `src/components/work/NextUpCard.test.tsx` add:

```tsx
  it('lists a bundle first with Review, which opens it on Work', async () => {
    stubBundles();
    renderPage(<NextUpCard />, '/copilot');
    const review = await screen.findByRole('link', { name: `Review ${B_PIZZA.title}` });
    expect(review).toHaveAttribute('href', '/work?queue=mine&bundle=12');
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('data-item', 'bundle:12');
    expect(screen.getByRole('link', { name: 'Open Work' })).toHaveAttribute('href', '/work');
  });
```

In `src/components/layout/Navbar.test.tsx`: `proposalWaiting` becomes `{ ..., message: 'Bundles are waiting for your decision.', link: '/work?queue=mine&kind=bundle' }`; its test is named `'shows a Bundles waiting notice with its icon and opens the Bundles chip'` and expects the new message and `marker` to have text `/work?queue=mine&kind=bundle`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/work/feed.test.ts src/components/work/NextUpCard.test.tsx src/components/layout/Navbar.test.tsx --maxWorkers=2`
Expected: FAIL (order; Open Work's href; the bell test's words are what the test now says, so it may already pass: that is fine).

- [ ] **Step 3: Next up, the sidebar, the bell's type, the links**

`src/features/work/feed.ts`:

```ts
/** The first five: decide's bundles first (spec §8.3), then the rest of decide, overdue, today; and the three groups' total. */
export function nextUp(feed: FeedPayload): { items: { group: FeedGroupKey; item: FeedItem }[]; total: number } {
  const decide = groupIn(feed, 'decide').items;
  const first = [...decide.filter((item) => item.kind === 'bundle'), ...decide.filter((item) => item.kind !== 'bundle')].map((item) => ({ group: 'decide' as FeedGroupKey, item }));
  const rest = NEXT_UP_GROUPS.filter((key) => key !== 'decide').flatMap((key) => groupIn(feed, key).items.map((item) => ({ group: key, item })));
  const total = NEXT_UP_GROUPS.reduce((sum, key) => sum + groupIn(feed, key).count, 0);
  return { items: [...first, ...rest].slice(0, 5), total };
}
```

`NextUpCard.tsx`: "Open Work" `to="/work"`; `focusCard`'s selector `a[href="/work"]`; update the docblock ("bundles first, each with Review, which opens it on Work"). `Sidebar.tsx` `WorkNavItem`: `to="/work"`. `src/features/notifications/types.ts`: the `agent_proposal_waiting` comment reads `// "Bundles are waiting for your decision." for a person with a bundle waiting on their Mine, at most once a day; links to /work?queue=mine&kind=bundle (agent bundles D1 contract §10.6).` `ChatView.tsx`: the proposals link `to="/work?queue=mine&kind=bundle"`. `BrainRoutes.tsx`: `waiting` → `<KeepQueryRedirect to="/work" set={{ queue: 'mine' }} />`; `review` → `<KeepQueryRedirect to="/work" set={{ queue: 'mine', kind: 'approval' }} />` (and its test's expected URLs).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/features/work src/components/work src/components/layout src/pages/copilot src/pages/brain --maxWorkers=2 && npx tsc -b && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/work/feed.ts src/features/work/feed.test.ts src/components/work/NextUpCard.tsx src/components/work/NextUpCard.test.tsx src/components/layout/Sidebar.tsx src/components/layout/Navbar.test.tsx src/features/notifications/types.ts src/pages/copilot/ChatView.tsx src/pages/brain/BrainRoutes.tsx src/pages/brain/BrainRoutes.test.tsx
git commit -m "feat(work): Next up lists bundles first; the sidebar, the bell and old links point at the inbox

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(`BrainRoutes.test.tsx`: include it only if it exists and changed.)

---

### Task 12: Settings › Agents: outside kinds locked to Ask, irreversible kinds named

**Files:**
- Modify: `src/components/agents/ActionsGridForm.tsx`, `src/features/agents/agentsText.ts`, `src/pages/settings/AgentActionsPage.test.tsx`

**Interfaces:**
- Consumes: `ActionKindSpec.locked`, `.irreversible` (Task 1).
- Produces: `AGENTS.ALWAYS_ASKS = 'Always asks'`, `AGENTS.CANT_UNDO = "Can't be undone"`; `levelsDraftOf` leaves locked kinds at `ask`, `levelsPatchOf` never names a locked kind.

- [ ] **Step 1: Write the failing test**

Append to `src/pages/settings/AgentActionsPage.test.tsx` (it renders the grid through `stubAgents`; follow its existing render helper):

```tsx
  it('shows an outside kind as Always asks with no select, names irreversible kinds, and never sends a locked kind', async () => {
    const outside = { kind: 'mail.send_reply' as ActionKind, label: 'Send an email reply', example: 'Reply to the customer', max_level: 'ask' as const, agents: ['cs' as const], irreversible: true, outside: true, locked: true };
    const settings = { ...AGENT_SETTINGS, kinds: [...AGENT_SETTINGS.kinds, outside], levels: { ...AGENT_SETTINGS.levels, cs: { ...AGENT_SETTINGS.levels.cs, [outside.kind]: 'ask' as const } } };
    const { spy } = stubAgents({ settings });
    renderPage(<AgentActionsPage />, '/settings/agents/actions');
    const row = (await screen.findByRole('rowheader', { name: /Send an email reply/ })).closest('tr') as HTMLElement;
    expect(within(row).getByText('Always asks')).toBeInTheDocument();
    expect(within(row).queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: "Send a campaign · Can't be undone" })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Draft a campaign for the Ops agent'), 'never');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/agents/settings/')).toHaveLength(1));
    expect(JSON.stringify(sent(spy, 'PATCH', '/agents/settings/')[0])).not.toContain('mail.send_reply');
  });
```

(Add `waitFor` to the testing-library import and `import type { ActionKind } from '../../features/agents/agentTypes';`; `AGENT_SETTINGS`, `sent`, `stubAgents` and `renderPage` are already imported. If `sent`'s path argument is matched as a substring, `'/agents/settings/'` is enough.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/pages/settings/AgentActionsPage.test.tsx --maxWorkers=2`
Expected: FAIL (a select is drawn for the outside kind).

- [ ] **Step 3: The grid**

In `agentsText.ts` add `ALWAYS_ASKS: 'Always asks'` and `CANT_UNDO: "Can't be undone"` to `AGENTS`; in `levelsPatchOf` skip `settings.kinds.find((k) => k.kind === kind)?.locked` kinds. In `ActionsGridForm.tsx` the row header reads `{spec.irreversible ? `${spec.label} · ${AGENTS.CANT_UNDO}` : spec.label}`, and inside the agent cell, before the `Select`:

```tsx
                    if (spec.locked) {
                      return (
                        <td key={agent} className={`${CELL} text-ink-muted`}>
                          {AGENTS.ALWAYS_ASKS}
                        </td>
                      );
                    }
```

(after the `usesKind` check, so an agent that does not use it still says "Not used").

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/pages/settings src/components/agents src/features/agents --maxWorkers=2 && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/agents/ActionsGridForm.tsx src/features/agents/agentsText.ts src/pages/settings/AgentActionsPage.test.tsx
git commit -m "feat(agents): outside kinds always ask in the grid; irreversible kinds say so

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: The end-to-end journeys

**Files:**
- Create: `src/e2e/bundles.test.tsx`
- Modify: `src/features/agents/testBundleFixtures.ts` (`bundleOfOne`), `src/e2e/agents.test.tsx`, `src/e2e/work.test.tsx`

**Interfaces:**
- Produces: `bundleOfOne(action: AgentAction): Bundle` (one waiting step whose id is the action's id, the action's preview, record and agent).

- [ ] **Step 1: `bundleOfOne`**

Append to `src/features/agents/testBundleFixtures.ts` (import `AgentAction` and `AGENT_LABEL` from `./agentsText`/`./agentTypes`, `KIND_LABEL` from `./agentsText`):

```ts
/** A migrated action as its bundle of one (contract §1.4), waiting on Alice. */
export function bundleOfOne(action: AgentAction): Bundle {
  return bundle({
    id: action.bundle,
    agent: action.agent,
    agent_label: AGENT_LABEL[action.agent],
    title: action.title,
    reason: action.rationale,
    record: action.record ? { type: action.record.kind, id: action.record.id, name: action.record.name } : null,
    routed_to: action.record ? 'owner' : 'admins',
    for: action.record ? ALICE : null,
    can_reject: true,
    steps: [step({ id: action.id, position: 1, kind: action.kind, label: KIND_LABEL[action.kind], title: action.title, rationale: action.rationale, preview: action.preview, evidence: action.evidence })],
  });
}
```

- [ ] **Step 2: The bundles journey**

Create `src/e2e/bundles.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { B_PIZZA, TEAM_BUNDLE } from '../features/agents/testBundleFixtures';
import { stubBundles } from '../features/agents/testBundles';
import { renderWork, where } from '../pages/work/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, sidebar item,
// WorkRoutes, the task panel host and the router. Only fetch is stubbed,
// in the agent bundles D1 contract's shapes. Nothing is sent anywhere.
// Alice filters Mine to bundles, reviews one, edits it, unticks a step and
// runs it; the badge and the queue follow; she finds it in History and
// undoes its task; on My team she sees Carl's bundle "For Carl CSM".

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
  document.body.style.overflow = '';
});

describe('Agent bundles: decide one in the inbox', () => {
  it('reviews, edits, runs, sees the result, then undoes it from History', { timeout: 30000 }, async () => {
    const { spy } = stubBundles({ recommendations: [] });
    renderWork('/work/mine', { nav: true, sidebarItem: true });
    await waitFor(() => expect(where()).toBe('/work?queue=mine'));
    const rail = await screen.findByRole('navigation', { name: 'Queues' });
    const before = await within(rail).findByRole('link', { name: /^Mine \d+$/ });
    const count = Number(before.textContent?.replace(/\D/g, ''));

    await userEvent.click(screen.getByRole('button', { name: 'Bundles' }));
    await waitFor(() => expect(where()).toBe('/work?queue=mine&kind=bundle'));
    await userEvent.click(await screen.findByRole('link', { name: `Review ${B_PIZZA.title}` }));
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    const title = await within(panel).findByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Call Pizza Hut today');
    await userEvent.click(within(panel).getByRole('checkbox', { name: '2. File a note' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 1 selected' }));
    expect(await within(panel).findByText('Done: all 1 step ran.')).toHaveFocus();
    expect(within(panel).getByRole('link', { name: 'Open task' })).toHaveAttribute('href', '/work/mine?task=990');
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(where()).toBe('/work?queue=mine&kind=bundle'));
    expect(await screen.findByText('No bundles waiting.')).toBeInTheDocument();
    await waitFor(() => expect(within(rail).getByRole('link', { name: `Mine ${count - 1}` })).toBeInTheDocument());

    await userEvent.click(within(rail).getByRole('link', { name: 'History' }));
    await userEvent.click(await screen.findByRole('link', { name: `Review ${B_PIZZA.title}` }));
    const done = await screen.findByRole('dialog', { name: B_PIZZA.title });
    await userEvent.click(within(done).getByRole('button', { name: 'Undo' }));
    expect(await within(done).findByText('Undone: Call Pizza Hut today')).toBeInTheDocument();
    expect(spy.mock.calls.some(([url]) => String(url).includes('/agents/actions/41/undo/'))).toBe(true);
  });

  it('shows what waits on the team, for whom, with the people below', { timeout: 30000 }, async () => {
    stubBundles({ recommendations: [] });
    renderWork('/work?queue=team');
    const queue = await screen.findByRole('region', { name: 'Waiting on your team' });
    expect(within(queue).getByRole('heading', { name: TEAM_BUNDLE.title })).toBeInTheDocument();
    expect(within(queue).getByText('For Carl CSM')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'People' })).toBeInTheDocument();
  });

  it('runs a bundle on a phone in a full-screen panel', { timeout: 30000 }, async () => {
    stubBundles({ recommendations: [] });
    renderWork('/work?queue=mine&bundle=12', { width: 390 });
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    expect(panel.className).toContain('h-full');
    await userEvent.click(await within(panel).findByRole('button', { name: 'Run 2 selected' }));
    expect(await within(panel).findByText('Done: all 2 steps ran.')).toBeInTheDocument();
  });
});
```

(History's Review names the bundle's title, which a run does not change; the edit changed the step's title, which Undo's line names.)

- [ ] **Step 3: The agents and work journeys**

`src/e2e/agents.test.tsx`: replace each `stubFeed({ decide: [approvalItem(ACT_X)], recommendations: [], decisions: 'pass', passThrough: agents.spy })` with `stubBundles({ bundles: [bundleOfOne(ACT_X)], recommendations: [], passThrough: agents.spy, outputs: { [ACT_X.id]: OUT } })`, where `OUT` is, per journey: `ACT_LIFECYCLE`: `{}`; `ACT_PLAN_START`: `{ plan_id: STARTED_PLAN_ID }`; `ACT_SEGMENT_CREATE`: `{ segment_id: BUILT_SEGMENT_ID, segment_url: `/segments/${BUILT_SEGMENT_ID}` }` (the constants come from `testAgentsFixtures`, as the old approve used them). Where a journey clicked Apply on My work, it now clicks `Review <title>` then `Run 1 selected` in the panel and waits for "Done: all 1 step ran."; where it went to Activity (`/work/activity`), it clicks the rail's History and `Review <title>`, and finds the result in the panel: the segment journey's Open segment link (then its page, as before) and Undo; the plan journey's step reads Applied (contract §6.2 gives a plan no link, so its old "open the plan from Activity" step becomes opening it from the organisation page's Plans, or is dropped if that page is not mounted in `renderWork`). Keep every other assertion about the made object as it is. `stubBundles` hands everything it does not know to `passThrough` through `stubFeed`; confirm `FeedStub` forwards `passThrough` to `stubWork` (it does: `stubWork`'s own option), else pass it explicitly.

`src/e2e/work.test.tsx`: every `renderWork('/work/mine…')` becomes `renderWork('/work?queue=mine…')` (or keep `/work/mine` and `await waitFor(() => expect(where()).toBe('/work?queue=mine'))` once); `/work/team` becomes `/work?queue=team`; expected URLs `'/work/mine?task=41'` become `'/work?queue=mine&task=41'` (query order as `KeepQueryRedirect` writes it when entered through `/work/mine`); the step "approves an agent action" becomes "runs a bundle" (Review, Run, "Done: …"); the manager's "approves" on the team queue becomes running `TEAM_BUNDLE` through Review; the company queue's heading is "Waiting on the rest of the company". Use `stubBundles` in place of `stubFeed` in those two tests.

- [ ] **Step 4: Run them**

Run: `npx vitest run src/e2e --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/e2e/bundles.test.tsx src/e2e/agents.test.tsx src/e2e/work.test.tsx src/features/agents/testBundleFixtures.ts
git commit -m "test(e2e): decide a bundle in the inbox, the team queue, a phone run; agents and work journeys on bundles

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Docs, the full check and by eye

**Files:**
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`, `src/test/uiRatchet.test.ts` (if a total moved)

- [ ] **Step 1: The product docs (two in this repo; the backend PR carries the other four)**

- `docs/04-app-flow.md`: replace the `/work`, `/work/*` and `/work/mine` rows with: "`/work` | `WorkRoutes` › `WorkInbox` (`pages/work/`): the queue rail from `GET /work/queues/` (Mine, My team, Rest of company, History; a select below `sm`), `?queue=` (default `mine`), `?kind=` (Bundles, Approvals = rule reviews, Tasks, To-dos (Mine only), Questions, Suggestions), `?bundle=<id>` opens the bundle panel (`BundleSheet`: `GET /agents/bundles/<id>/`, Run `POST …/run/`, Retry `POST …/steps/<id>/retry/`, Reject `POST …/reject/`); Mine is `GET /work/feed/`, My team and Rest of company `GET /work/feed/team/?scope=team|company&kind=`, My team's people `GET /work/team/?scope=team`, History `GET /agents/bundles/history/` | auth" and "`/work/mine`, `/work/today`, `/work/recommended`, `/work/team?scope=`, `/work/activity?action=` | redirect into `/work?queue=…` keeping the query and history state; `/work/activity?action=<id>` reads the action's bundle and opens it in History | auth". Update the sidebar line (Work links `/work`) and every sentence that names My work, Team or Activity as tabs (search the file for "My work", "Work › Team", "Activity").
- `docs/03-ui-ux-design.md`: add a "Work inbox and the bundle panel" subsection under the component inventory: the queue rail (14rem, a nav of links with tabular counts, `aria-current`; a `Select` below `sm`), kind chips per queue, the bundle row (title, reason, step kinds, meta, bordered Review), the panel (the organisation page's `Sheet` with `size="wide"`, `phone="full"`, `focus="heading"`, a pinned footer: Run N selected the one primary, Reject bundle bordered, the discard bar), steps as one `ListCard` (tick, "1. Create a task", the title with placeholder chips, "Can't be undone" with `ShieldAlert`, the disabled reason, the preview, the fields, the state line, result links, Undo), the summary line that takes focus, History rows. Replace the Activity and Team tab descriptions with it.
- `.agents/workflows/repo-architecture.md`: the `features/agents` line gains `bundleTypes.ts`, `bundlesApi.ts`, `bundleText.ts`, `testBundles.ts`, `testBundleFixtures.ts`; the `features/work` line gains `queues.ts`; the `components/work` line: the inbox parts (`useQueues`, `QueueRail`, `KindChips`, `BundleRow`, `BundleSheet`, `BundlePanel`, `BundleStep`, `BundleStepFields`, `PlaceholderText`, `BundleReject`, `useBundle`, `TeamPeople`), Team and Activity parts gone; the `pages/work` line: `WorkRoutes`, `WorkInbox`, `MyWorkPage` (Mine's body), `HistoryPage`, `ActivityRedirect`, `testPages.tsx`; the route tree: `work/* → WorkRoutes (the inbox at /work; mine, today, recommended, team and activity redirect into it)`; `components/agents` loses `ActivityRow`, `ActivitySkeleton`, `useActivity`.

- [ ] **Step 2: The full check**

Run: `npx tsc -b && npm run lint && npm run build && npx vitest run --maxWorkers=2`
Expected: all clean; the full suite PASS. A failure in a test this plan did not touch means a reader of a changed shape was missed: find it with `systematic-debugging`; never loosen the test. The ratchet: totals equal `BASELINE` (lower it in this commit if deletions moved it). `grep -rn "—" src/components/work src/pages/work src/features/work src/features/agents/bundle* src/features/agents/testBundle*` prints nothing.

- [ ] **Step 3: Commit the docs**

```bash
git add docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md src/test/uiRatchet.test.ts
git commit -m "docs: the Work inbox, bundles and History (agent bundles delivery 1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: By eye in Chrome (the delivery's last gate; CI is blocked by billing)**

Never use ports 8000 or 5173. The backend D1 branch must be built and its migrations applied to the database this backend reads (ask the owner before migrating the shared dev database).

1. Backend: `cd /Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/bundles-be && venv/bin/python manage.py runserver 8011` (run in the background; if `venv` is missing use `../work-two-be/venv/bin/python`). If the browser is refused by CORS, start it with `CORS_ALLOWED_ORIGINS=http://localhost:5181` for this run only.
2. Frontend: `cd /Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/bundles-fe && VITE_API_URL=http://localhost:8011 npx vite --port 5181 --strictPort` (background).
3. Data: as an admin, Settings › Agents › Run now for CS and Ops (real, paid model calls: once each), or seed waiting bundles from the backend shell with fake records only. Nothing is sent: keep "Save as draft only" on for any survey or campaign step, or leave email unset (the step then fails with "Email isn't set up…", which is itself one of the checks).
4. At 1440 and 390, light and dark, check and screenshot to `/private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/12149f77-43a2-43eb-9c53-e9c1cb7f8b07/scratchpad/bundles-fe-byeye/`:
   - the rail: counts tabular and aligned, the open queue marked, History without a number; the phone select listing "Mine (n)";
   - the chips on Mine (seven) and on My team (six), `?kind=` in the URL, the empty state per chip;
   - a bundle row: title, reason, step kinds, meta, one bordered Review; no primary on the list;
   - the panel at 1440: wide, the list visible behind the scrim, the heading focused (Tab then Shift+Tab shows the ring), steps in one bordered list with flat rows, the disabled step unticked with its reason, "Can't be undone" toggling with Save as draft only, placeholder chips and no braces anywhere, the audience sentence and the survey question;
   - Run N selected: the only primary; the count follows the ticks; with none ticked it says "Choose at least one step to run.";
   - after a run: the summary line focused, results with links, a failed step's error and Retry, the row gone from Mine, the badge and the rail count down by one;
   - Reject bundle: the inline form, "Choose a reason." first, then "Rejected.";
   - closing with edits: the discard bar, Keep editing focused; Escape, Close and the scrim all ask;
   - at 390: the panel full screen, every control 44px tall, nothing clipped, the footer reachable above the home indicator;
   - History: rows, the three selects, Previous/Next, a finished bundle opened read-only with links and Undo;
   - `/work/mine`, `/work/team?scope=company`, `/work/activity?action=<an id>` from the address bar land where Decision 1 and 13 say;
   - Copilot's Next up: bundles first with Review opening the panel on Work; the bell's "Bundles are waiting for your decision." opening `/work?queue=mine&kind=bundle`;
   - Settings › Agents grid: the two new kinds named "· Can't be undone".
5. Write each finding to `scratchpad/bundles-fe-byeye/findings.md` as blocker / should-fix / cosmetic with its screenshot, fix the blockers in this branch (a test first), and stop both servers.

- [ ] **Step 5: Hand-off**

Report the branch head, the test count, the ratchet totals and the by-eye findings. Do not push, do not open a PR, do not merge: the owner decides (merge order: backend D1 first, then this, back to back).
