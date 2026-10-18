# Work in one place, delivery 1 ("My work"): frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Work becomes the one place for everything a person must do: `/work/mine` (My work) lists approvals, rule reviews, questions, drafts, tasks, private to-dos and suggestions in one grouped feed with a quick-add box, kind chips in the URL, inline actions with toasts and Undo, and one sidebar badge; `/work/today`, `/work/recommended` and `/brain/waiting` redirect into it.

**Architecture:** `features/work` gains the feed's types and API wrappers (in the existing `workTypes.ts` and `workApi.ts`) and one pure module, `feed.ts` (groups, chips, ordering, insert/remove, failure slots, every new sentence). `components/work` gains two hooks (`useFeed`, `useFeedCount`), the row components (task and to-do, the four decide kinds, suggestion), the quick-add form, the toast, the groups and skeleton, the panel's record editor and a query-keeping redirect; the existing `AgentActionDecision`, `ReviewDecision`, `AssignForm`, `DismissForm` and task panel are reused, not copied. `pages/work/MyWork.tsx` composes them. Today and Recommended (pages and their only-used parts) are deleted; Brain's Waiting code stays (delivery 2 deletes it), unreachable except through an opt-in test route. No Redux: every read is a hook over `apiFetch`, as the rest of Work.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), react-router 7, Tailwind v4 tokens, Vitest + Testing Library (jsdom) + user-event, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-12-work-one-place-design.md` (owner-approved; delivery 1 = §8 item 1, frontend). **API contract (binding, read-only):** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/work-one-be/docs/superpowers/plans/2026-10-12-work-one-place-api.md` at backend commit `40749ea`; read its §3 Decisions before starting. House style and the code this plan extends: `docs/superpowers/plans/2026-10-07-work-tasks-frontend.md`, `2026-10-07-work-recommended-frontend.md`, `2026-10-08-work-tracking-frontend.md`.

## Global Constraints

- **Worktree and branch.** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/work-one-fe`, branch `feat/work-one-place`, from `origin/main` `64901344` (spec commit `4e6da973`). `node_modules` is a symlink: never commit it. Always `git add <explicit paths>` (and `git rm` for deletions), never `git add -A` or `git add .`.
- **Not on this branch:** the Settings redesign PR #137 (`feat/settings-production`). Do not import anything it adds; use `SettingsFrame`/`WorkSettingsFrame` as they are on `main`.
- **Never run prettier. Never use `git stash`** (the stash stack is shared across worktrees; use a WIP commit if you must set work aside).
- **Commands** (foreground): `npx vitest run <path> --maxWorkers=2`, `npx vitest run --maxWorkers=2`, `npx tsc -b`, `npm run lint`, `npm run build`.
- **Every commit message is a conventional commit and ends with exactly this line:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Contract shapes are binding.** Test stubs answer exactly the contract's shapes and sentences (`src/features/work/testFeed.ts`). Never change the contract; gaps are listed under "Contract questions" at the end.
- **Out of scope (delivery 2 or later):** the Team queue and `GET /work/feed/team/`, Copilot "Next up", bell link changes (notification links stay `/work/today?task=<id>` and `/work/recommended` and rely on the redirects, contract Decision 17), removing Settings › Work recommendation toggles, deleting Brain Waiting code, snooze/recurring/sub-tasks, any backend change.
- **Tokens only** (`src/test/houseRules.ts` `RAW`): no hex, `rgb()`, named palette colours.
- **Type sizes 11/13/15 only**, through `TYPE.*` (`components/ui/type.ts`); no named sizes; at most four per surface. No `font-bold`, no `shadow-sm`/`shadow-md`, no `disabled:opacity-*`, no literal `font-mono-brand` in a `.tsx` (figures use `NUM`, `tabular-nums`). The UI ratchet (`src/test/uiRatchet.test.ts`) must end each task with totals **equal** to `BASELINE`: deleting files lowers totals, so lower the baseline to the new totals in the same commit; new code must add zero offences (never raise a baseline).
- **Kinso look:** bordered quiet cards (`Card`, `ListCard`), rows flat and `divide-y` inside one `ListCard`, never a card in a card; one primary per surface (My work's quick-add **Add**); no glass; Lucide icons only, each `aria-hidden="true"`; no emoji.
- **44px targets** on phones for every `<button>`, `<Link>`, `<select>`, `<input>`, `<textarea>`: use a known-compliant constant (`BUTTON`, `PRIMARY`, `QUIET`, `ICON_BUTTON`, `INPUT`, `FILTER_SELECT`, `LINK`, `INLINE_TARGET`) or a local `const` built from one; `className={SELECT}` from `ui` is **not** recognised by the checker, so selects use `const CHOICE_SELECT = \`${FILTER_SELECT} w-full\``.
- **No em dash (`—`) anywhere** in `src/components/work/`, `src/pages/work/`, `src/features/work/`, comments and tests included (`components/work/houseRules.test.ts` enforces it).
- **Copy:** sentence case; the spec's and the contract's sentences word for word ("Nothing waiting on you.", "Only you", "Couldn't load approvals.", "Already decided."); server refusals shown verbatim.
- **States:** every list has a skeleton (not a spinner), an error with Try again, and an empty state.
- **Motion:** none added (the toast appears without animation: it follows keyboard actions too).
- **Testing:** unit + integration + e2e (jsdom, `src/e2e/`), only `fetch` stubbed, contract-shaped. Never mock the store.

## Decisions (where the spec or the contract leaves a choice)

1. **Toast.** One page-level toast (`WorkToast`): a `role="status"` live region, fixed to the bottom on every width, with the sentence, an optional link (Open task, Open survey), an optional **Undo**, and **Close**. It never auto-hides (no timing trap); the next toast replaces it. After a row action it takes focus (the row is gone); after quick-add it does not (focus stays in the box). Cost if wrong: low (restyle one component).
2. **Undo** exists for: task/to-do Done (`PATCH {status: <previous>}` plus `blocked_reason` when it was Blocked; the row comes back in its group) and an applied agent action while `undo.allowed` (`POST /agents/actions/<id>/undo/`; the row does not come back, it is no longer proposed). Nothing else offers Undo. Cost: low.
3. **Chips in the URL:** `?kind=task|todo|approval|question|suggestion`; no `kind` is All. Approvals sends `kind=approval,rule_review`; drafts show only under All (the spec lists no Drafts chip); an unknown `kind` reads as All. Cost: low.
4. **Failed sources** show one notice per place: decide kinds at the decide group's place (Try again = `?group=decide`), tasks and to-dos at Overdue's place (they span six groups and fail together, so Try again reloads the whole feed), suggestions at Suggested's place (`?group=suggested`). Text: "Couldn't load approvals and questions." Cost: low.
5. **Reloads.** My work reloads on every `taskChanged()` (the task panel's saves, `AgentActionDecision`), as Today did. Groups grown by Show more fall back to their first page after any change. Cost: low-medium (a reader deep in a long group loses their place after an edit).
6. **Lost access.** A 404/403 from a row's action removes the row and adds one to `hidden`: task Done (`isMissing`), suggestion Add/Assign/Dismiss (`REC.GONE` or `CANT_DECIDE`), approvals (`AGENTS.GONE` or `CANT_DECIDE`). `ReviewDecision` reports 404 and 409 alike, so a rule review never bumps `hidden`. Cost: low (an off-by-one in a muted count).
7. **Rows reuse the existing deciders unchanged.** Approvals use `AgentActionDecision` (Apply / Reject with note), rule reviews `ReviewDecision` (Approve / Skip). On a phone their two buttons wrap rather than folding into a menu; only suggestion rows fold (Add to my work stays, Assign and Dismiss move into ⋯). Cost: low.
8. **A rule review approved on My work stays on My work:** the row leaves and the toast links "Open survey" / "Open campaign" (Waiting navigated away at once). Cost: low.
9. **Done control** stays the circle icon button named "Mark “<title>” done" (Today's and Team's control), not a checkbox. Cost: trivial.
10. **The task panel learns to-dos** (contract §1.2, §1.3): the facts say "Only you"; Assignee reads "You" (a to-do can only be yours); Due may be cleared; "Attach to a record" (one-way; a dateless to-do must get a date in the same save). Cost: medium (more UI in delivery 1, but without it the spec's "row opens the existing task panel" would crash on `parent: null`).
11. **Record pages keep their own TaskForm.** The spec's "NewTaskSheet replaced by this form, opened from record pages with the record prefilled": NewTaskSheet only ever lived on Today, so it is deleted with Today; record pages are unchanged. Cost: low-medium (a later round may move record pages onto `POST /work/todos/`).
12. **Badge:** `GET /work/feed/count/` `badge`, named "Work, 3 to decide, 1 overdue". Read on mount, for another user, and on every `taskChanged()`, `recommendationsChanged()`, `feedChanged()` (new) and route change. A failed read keeps the last value. Brain's badge (sidebar item and tab) is removed. Cost: trivial.
13. **Gear:** an icon link "Work settings" to `/settings/recommendations` (the first Settings › Work page) in the page header's actions, for `manage_org_settings` only. Cost: low (PR #137 may move settings paths; update the link then).
14. **Deleted in this delivery:** `pages/work/Today.tsx`, `Recommended.tsx` and the parts only they used (`TodayGroups`, `TodaySkeleton`, `useToday`, `NewTaskSheet`, `RecommendationCard`, `RecommendedSkeleton`, `useRecommended`; `useWorkCount`, `useRecommendedCount` in Task 12), with their tests. **Kept** (spec: delivery 2 deletes it): every Brain Waiting file; its page tests keep running through an opt-in test route (`waitingPage: true`). Cost: low.
15. **Redirects keep the query and the history state:** `/work/today?task=41` lands on `/work/mine?task=41` with the bell's `OPENED_HERE` state, so the task panel opens and Close steps back. `/brain/review` goes straight to `/work/mine?kind=approval`. Cost: none if right; links land on My work regardless.
16. **"Ask the agent"** (Brain Waiting, Company, view-all) is unreachable between this delivery and delivery 2 (spec moves it to Team). Ship both deliveries together, or accept the gap. Cost: low.

## File Structure

**Create**
- `src/features/work/feed.ts`: the feed's words and pure rules (groups, labels, chips and kinds, ordering, insert/remove/page/retry merges, failure slots, toast sentences, badge name, quick-add body).
- `src/features/work/feed.test.ts`
- `src/features/work/testFeedFixtures.ts`: decide items, a to-do, `approvalItem()`.
- `src/features/work/testFeed.ts`: `stubFeed()`, a stateful contract stub in front of `stubWork()`.
- `src/features/work/testFeed.test.ts`
- `src/components/work/useFeed.ts`, `useFeed.test.tsx`: `GET /work/feed/` per chip, Show more, per-group retry.
- `src/components/work/useFeedCount.ts`, `useFeedCount.test.tsx`: the badge's read.
- `src/components/work/FeedRowParts.tsx`: kind icons, title and meta styles, the meta line.
- `src/components/work/FeedTaskRow.tsx`, `FeedTaskRow.test.tsx`
- `src/components/work/FeedDecideRows.tsx`, `FeedDecideRows.test.tsx`: approval, rule review, question, draft.
- `src/components/work/FeedSuggestionRow.tsx`
- `src/components/work/FeedRow.tsx`, `FeedRow.test.tsx`: the dispatcher (and the suggestion row's tests).
- `src/components/work/QuickAdd.tsx`, `QuickAdd.test.tsx`
- `src/components/work/RecordEditor.tsx`: the panel's "Attach to a record".
- `src/components/work/WorkToast.tsx`
- `src/components/work/FeedGroups.tsx`, `FeedSkeleton.tsx`
- `src/components/work/KeepQueryRedirect.tsx`
- `src/pages/work/MyWork.tsx`, `MyWork.test.tsx`
- `src/pages/brain/testWaitingRoute.tsx`: the opt-in route that keeps Waiting's page tests alive until delivery 2.

**Modify**
- `src/features/work/workTypes.ts` (feed types; `TaskRow.parent`/`due_date` nullable, `private`; `TaskDetail` parent fields nullable; `EditableField` + `record`; `TaskPatch` + `due_date: null`, `customer_id`, `account_id`), `workApi.ts` (+ tests), `rows.ts`, `workText.ts`, `recommended.ts`, `testWorkFixtures.ts`, `testWork.ts`, `workTabs.ts`.
- `src/components/work/TaskRowItem.tsx`, `TaskFacts.tsx`, `TaskSheet.tsx`, `TaskFields.tsx`, `taskChanges.ts`, `useRefreshTick.ts`, `houseRules.test.ts`.
- `src/components/layout/WorkTabs.tsx`, `Sidebar.tsx`, `BrainTabs.tsx` (+ tests).
- `src/pages/work/WorkRoutes.tsx`, `testPages.tsx`; `src/pages/brain/BrainRoutes.tsx`, `testPages.tsx`; `src/pages/rules/testPages.tsx`.
- `src/features/brain/brainTabs.ts`; `src/components/rules/NightsSection.tsx`; `src/pages/copilot/ChatView.tsx`.
- Tests: `src/e2e/work.test.tsx`, `agents.test.tsx`, `brain.test.tsx`, `rules.test.tsx`; `src/pages/brain/Waiting.test.tsx`, `BrainRoutes.test.tsx`; `src/layouts/DashboardLayout.test.tsx`; `src/pages/copilot/ChatView.decisions.test.tsx`; `src/pages/rules/RulePage.test.tsx`; `src/test/uiRatchet.test.ts`.
- Docs (Task 13): `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`.

**Delete:** `src/pages/work/Today.tsx`, `Today.test.tsx`, `Recommended.tsx`, `Recommended.test.tsx`; `src/components/work/TodayGroups.tsx`, `TodaySkeleton.tsx`, `useToday.ts`, `NewTaskSheet.tsx`, `RecommendationCard.tsx`, `RecommendedSkeleton.tsx`, `useRecommended.ts` (Task 11); `useWorkCount.ts`, `useWorkCount.test.tsx`, `useRecommendedCount.ts` (Task 12).

---

### Task 1: Contract types, API wrappers, nullable task shapes

**Files:**
- Modify: `src/features/work/workTypes.ts`, `src/features/work/workApi.ts`, `src/features/work/rows.ts`, `src/features/work/testWorkFixtures.ts`, `src/features/work/testWork.ts`, `src/components/work/TaskRowItem.tsx`, `src/components/work/TaskFacts.tsx`, `src/components/work/TaskSheet.tsx`, `src/components/work/TaskFields.tsx`
- Test: `src/features/work/workApi.test.ts`, `src/features/work/rows.test.ts`

**Interfaces:**
- Produces (types, `features/work/workTypes.ts`): `FeedKind`, `FEED_KINDS`, `FeedGroupKey`, `TaskGroupKey`, `FeedRecord`, `FeedFrom`, `ApprovalFeedItem`, `ReviewFeedItem`, `QuestionFeedItem`, `DraftFeedItem`, `TaskFeedItem`, `SuggestionFeedItem`, `FeedItem`, `FeedGroup`, `FeedPayload`, `FeedPage`, `FeedCount`, `TodoBody`, `TodoAnswer`; `TaskRow.parent: TaskParent | null`, `TaskRow.due_date: string | null`, `TaskRow.private: boolean`; `TaskDetail.parent_name: string | null`, `parent_type: ParentKind | null`; `EditableField` gains `'record'`; `TaskPatch.due_date?: string | null`, `customer_id?: number`, `account_id?: number`.
- Produces (API, `features/work/workApi.ts`): `fetchFeed(kinds: readonly FeedKind[] | null): Promise<FeedPayload>`, `fetchFeedGroup(group: FeedGroupKey, kinds: readonly FeedKind[] | null, cursor?: string | null): Promise<FeedPage>`, `fetchFeedCount(): Promise<FeedCount>`, `createTodo(body: TodoBody): Promise<TodoAnswer>`; `RefusalField` gains `'record' | 'assignee' | 'customer_id' | 'account_id'`.
- Produces (fixtures): `taskDetail()` keeps an explicit `parent: null` (a to-do), sets `parent_name`/`parent_type` from it and `private: parent === null`.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/work/workApi.test.ts` (inside its top-level `describe`, next to the other request-shape tests; reuse its existing fetch spy helpers if present, otherwise this self-contained block):

```ts
import { createTodo, fetchFeed, fetchFeedCount, fetchFeedGroup, readRefusal } from './workApi';
import { ApiError } from '../../lib/apiClient';

describe('the feed routes (work in one place, contract §2)', () => {
  const seen: { url: string; method: string; body: unknown }[] = [];
  beforeEach(() => {
    seen.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        seen.push({ url: `${url.pathname.replace(/^\/api\/v1/, '')}${url.search}`, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
        return { ok: true, status: 200, json: async () => ({}) };
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads the whole feed, with or without kinds', async () => {
    await fetchFeed(null);
    await fetchFeed(['approval', 'rule_review']);
    expect(seen.map((call) => call.url)).toEqual(['/work/feed/', '/work/feed/?kind=approval%2Crule_review']);
  });

  it('pages one group with its cursor, and retries one group without one', async () => {
    await fetchFeedGroup('week', null, 'week:50');
    await fetchFeedGroup('decide', ['approval', 'rule_review']);
    expect(seen.map((call) => call.url)).toEqual(['/work/feed/?group=week&cursor=week%3A50', '/work/feed/?group=decide&kind=approval%2Crule_review']);
  });

  it('reads the count and posts a to-do', async () => {
    await fetchFeedCount();
    await createTodo({ title: 'Book the QBR room', priority: 'medium', due_date: null });
    expect(seen).toEqual([
      { url: '/work/feed/count/', method: 'GET', body: undefined },
      { url: '/work/todos/', method: 'POST', body: { title: 'Book the QBR room', priority: 'medium', due_date: null } },
    ]);
  });

  it('reads the to-do refusals under their fields', () => {
    expect(readRefusal(new ApiError(400, { record: ['Choose an organisation or account you can open.'] }, ''), 'x').field.record).toBe('Choose an organisation or account you can open.');
    expect(readRefusal(new ApiError(400, { assignee: ['A to-do without a record can only be yours.'] }, ''), 'x').field.assignee).toBe('A to-do without a record can only be yours.');
    expect(readRefusal(new ApiError(400, { customer_id: ['Choose an organisation or account you can open.'] }, ''), 'x').field.customer_id).toBe('Choose an organisation or account you can open.');
  });
});
```

(Merge these imports into the file's existing ones rather than adding second import lines from the same module; add `beforeEach`, `afterEach`, `vi` to its `vitest` import if missing.)

Append to `src/features/work/rows.test.ts`:

```ts
it('never calls a dateless to-do overdue', () => {
  expect(isOverdue({ status: 'pending', due_date: null }, '2026-10-07')).toBe(false);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/work/workApi.test.ts src/features/work/rows.test.ts --maxWorkers=2`
Expected: FAIL (`fetchFeed` is not exported; `isOverdue` rejects `null` at type level and compares `null < '2026-10-07'`).

- [ ] **Step 3: Add the types**

In `src/features/work/workTypes.ts`:

1. Add `import type { RuleReviewItem } from '../brain/brainTypes';` next to the existing `ScopeKey` import (`import type { RuleReviewItem, ScopeKey } from '../brain/brainTypes';`).
2. Change `TaskRow`:

```ts
/** One row of every Work list. `blocked_reason` is non-empty exactly when Blocked.
 *  A to-do (work in one place) has no record and may have no date. */
export interface TaskRow {
  id: number;
  title: string;
  /** Null only for a to-do with no date. */
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  blocked_reason: string;
  source: TaskSource;
  /** Null for a to-do. */
  parent: TaskParent | null;
  /** Null only for an old seeded task. */
  assignee: TaskPerson | null;
  plan: { id: number; name: string } | null;
  /** True for a to-do: only its creator sees it. */
  private: boolean;
}
```

3. `export type EditableField = 'title' | 'description' | 'status' | 'due_date' | 'priority' | 'assignee' | 'record';`
4. In `TaskDetail`: `parent_name: string | null;` and `parent_type: ParentKind | null;`.
5. `TaskPatch` gains:

```ts
  /** Null clears a to-do's date (refused on a task with a record). */
  due_date?: string | null;
  /** Attach a record to a to-do (one-way; never on a task that has one). */
  customer_id?: number;
  account_id?: number;
```

(replace the existing `due_date?: string;` line).
6. Append at the end of the file:

```ts
// Work in one place, delivery 1 (contract revenact-backend
// docs/superpowers/plans/2026-10-12-work-one-place-api.md).

export type FeedKind = 'approval' | 'rule_review' | 'question' | 'draft' | 'task' | 'todo' | 'suggestion';
/** In the contract's order (`failed` lists them in it). */
export const FEED_KINDS: readonly FeedKind[] = ['approval', 'rule_review', 'question', 'draft', 'task', 'todo', 'suggestion'];
export type FeedGroupKey = 'decide' | 'overdue' | 'today' | 'week' | 'later' | 'no_date' | 'blocked' | 'suggested';
export type TaskGroupKey = Exclude<FeedGroupKey, 'decide' | 'suggested'>;

/** `customer` links /organizations/<id>, `account` /accounts/<id>. */
export interface FeedRecord {
  type: 'customer' | 'account';
  id: number;
  name: string;
}

export interface FeedFrom {
  type: 'agent' | 'rule' | 'person' | 'revenact';
  label: string;
}

interface FeedItemBase {
  /** `<source>:<id>`, stable and unique across the feed. */
  key: string;
  /** The source row's id: what its action endpoint takes. */
  id: number;
  title: string;
  record: FeedRecord | null;
  from: FeedFrom;
  at: string;
  due_date: string | null;
  priority: TaskPriority | null;
  private: boolean;
}

export interface ApprovalFeedItem extends FeedItemBase {
  kind: 'approval';
  actions: ('approve' | 'reject')[];
  detail: AgentAction & { session: { id: number; title: string } | null };
}

export interface ReviewFeedItem extends FeedItemBase {
  kind: 'rule_review';
  actions: ('approve' | 'skip')[];
  /** Brain Waiting's rule-review detail (contract §2.2). */
  detail: RuleReviewItem['detail'];
}

export interface QuestionFeedItem extends FeedItemBase {
  kind: 'question';
  actions: 'answer'[];
  detail: { text: string; asked_by: PersonRef };
}

export interface DraftFeedItem extends FeedItemBase {
  kind: 'draft';
  actions: 'open'[];
  detail: { channel: 'email' | 'ticket' };
}

export interface TaskFeedItem extends FeedItemBase {
  kind: 'task' | 'todo';
  actions: ('done' | 'open')[];
  detail: TaskRow;
}

export interface SuggestionFeedItem extends FeedItemBase {
  kind: 'suggestion';
  actions: ('add' | 'assign' | 'dismiss')[];
  detail: RecommendationRow;
}

export type FeedItem = ApprovalFeedItem | ReviewFeedItem | QuestionFeedItem | DraftFeedItem | TaskFeedItem | SuggestionFeedItem;

/** At most 50 `items`; `count` is the group's full total; `next` an opaque cursor. */
export interface FeedGroup {
  key: FeedGroupKey;
  count: number;
  items: FeedItem[];
  next: string | null;
}

/** GET /work/feed/: always all eight groups, in order. */
export interface FeedPayload {
  groups: FeedGroup[];
  hidden: number;
  failed: FeedKind[];
}

/** GET /work/feed/?group=<key>[&cursor=]. */
export interface FeedPage {
  group: FeedGroup;
  failed: FeedKind[];
}

/** GET /work/feed/count/. */
export interface FeedCount {
  decide: number;
  overdue: number;
  badge: number;
  failed: FeedKind[];
}

/** POST /work/todos/. No record: a to-do (the caller's own). */
export interface TodoBody {
  title: string;
  due_date?: string | null;
  priority?: TaskPriority;
  customer_id?: number | null;
  account_id?: number | null;
  assignee_id?: number | null;
}

/** `item`/`group` are null when the task went to someone else. */
export interface TodoAnswer {
  task: TaskDetail;
  item: TaskFeedItem | null;
  group: TaskGroupKey | null;
}
```

- [ ] **Step 4: Add the API wrappers and refusal fields**

In `src/features/work/workApi.ts`, extend the type import with `FeedCount, FeedGroupKey, FeedKind, FeedPage, FeedPayload, TodoAnswer, TodoBody`, and add after `patchWorkSettings`:

```ts
// Work in one place, delivery 1 (contract 2026-10-12-work-one-place-api.md).
const kindParam = (kinds: readonly FeedKind[] | null): Record<string, string> => (kinds ? { kind: kinds.join(',') } : {});

export function fetchFeed(kinds: readonly FeedKind[] | null) {
  const text = query(kindParam(kinds));
  return apiFetch<FeedPayload>(`/work/feed/${text ? `?${text}` : ''}`);
}
/** One group's next page; without a cursor, its first page (a failed group's Try again). */
export const fetchFeedGroup = (group: FeedGroupKey, kinds: readonly FeedKind[] | null, cursor: string | null = null) =>
  apiFetch<FeedPage>(`/work/feed/?${query({ group, ...(cursor ? { cursor } : {}), ...kindParam(kinds) })}`);
export const fetchFeedCount = () => apiFetch<FeedCount>('/work/feed/count/');
export const createTodo = (body: TodoBody) => apiFetch<TodoAnswer>('/work/todos/', { method: 'POST', body });
```

Add `'record' | 'assignee' | 'customer_id' | 'account_id'` to the `RefusalField` union and the same four strings to the end of `FIELDS`.

- [ ] **Step 5: Make the readers null-safe**

`src/features/work/rows.ts`:

```ts
/** Past due and not Blocked, as everywhere in Work (backend Decision 8). A dateless to-do is never overdue. */
export function isOverdue(row: Pick<TaskRow, 'status' | 'due_date'>, today: string): boolean {
  return row.status !== 'blocked' && row.due_date !== null && row.due_date < today;
}
```

`src/components/work/TaskRowItem.tsx`: wrap the record link and its following dot so a row without a parent shows neither:

```tsx
          {row.parent ? (
            <>
              <Link to={parentPath(row.parent)} className={META_LINK}>
                {row.parent.name}
              </Link>
              <Dot />
            </>
          ) : null}
          <span>
            Due <span className={NUM}>{formatDate(row.due_date)}</span>
          </span>
```

(remove the old unconditional `<Link …>{row.parent.name}</Link>` and the `<Dot />` after it).

`src/components/work/TaskSheet.tsx`: `description={task ? (task.parent ? task.parent.name : WORK.ONLY_YOU) : undefined}`.

`src/components/work/TaskFacts.tsx`: replace the `On` pair with:

```tsx
      <dt className={TERM}>On</dt>
      <dd className="min-w-0">
        {task.parent ? (
          <Link to={parentPath(task.parent)} className={LINK}>
            {task.parent.name}
          </Link>
        ) : (
          <span data-part="private" className="inline-flex items-center gap-1">
            <Lock className="h-4 w-4 text-ink-muted" aria-hidden="true" />
            {WORK.ONLY_YOU}
          </span>
        )}
      </dd>
```

with `import { Lock } from 'lucide-react';` and `WORK` added to the `workText` import.

`src/components/work/TaskFields.tsx` (compile only in this task; Task 9 builds the to-do editors): give `AssigneeEditor` a `parent` prop and render it only on a task with a record:

```tsx
        {can('assignee') && task.parent ? (
          <AssigneeEditor {...props} parent={task.parent} />
        ) : (
          <TaskValue label="Assignee" value={task.parent ? personName(task.assignee) : WORK.YOU} />
        )}
```

```tsx
function AssigneeEditor({ task, busy, refusal, save, parent }: EditorProps & { parent: TaskParent }) {
  const id = useId();
  const { people, error } = useAssignees(parent);
  const options = assigneeOptions(people ?? [], parent.kind, task.assignee);
```

(add `type TaskParent` to the `workTypes` import). In `DueEditor` change both `useState(task.due_date)` to `useState(task.due_date ?? '')`, `if (seen !== task.due_date)` stays, `setDraft(task.due_date ?? '')`, and in `commit` compare `if (draft === (task.due_date ?? ''))`. The read-only due value becomes `<TaskValue label="Due" value={task.due_date ? formatDate(task.due_date) : WORK.NO_DATE} mono />`.

Add to `WORK` in `src/features/work/workText.ts`:

```ts
  ONLY_YOU: 'Only you',
  YOU: 'You',
  NO_DATE: 'No date',
```

- [ ] **Step 6: Make the fixtures and the Work stub null-safe**

`src/features/work/testWorkFixtures.ts`, in `taskDetail`:

```ts
  // An explicit `parent: null` stays null (a to-do).
  const parent = over.parent === undefined ? PIZZA : over.parent;
```

and in the returned object `parent_name: parent ? parent.name : null,`, `parent_type: parent ? parent.kind : null,`, `private: parent === null,` (before `...over`).

`src/features/work/testWork.ts`:

```ts
function groupOf(task: TaskDetail): TodayGroup {
  const due = task.due_date ?? '9999-12-31';
  if (task.status === 'blocked') return 'blocked';
  if (due < TODAY) return 'overdue';
  if (due === TODAY) return 'today';
  return due <= addDays(TODAY, 7) ? 'week' : 'later';
}

const byDue = (a: TaskDetail, b: TaskDetail) => (a.due_date ?? '').localeCompare(b.due_date ?? '') || a.id - b.id;
const isOpen = (task: TaskDetail) => task.status !== 'completed';
const lateOf = (task: TaskDetail) => task.status !== 'blocked' && task.due_date !== null && task.due_date < TODAY;
/** To-dos never reach /work/today/, /work/team/ or /work/tasks/ (contract §1). */
const onRecord = (task: TaskDetail) => task.parent !== null;

function rowOf(task: TaskDetail): TaskRow {
  const { id, title, due_date, priority, status, blocked_reason, source, parent, assignee, plan } = task;
  return { id, title, due_date, priority, status, blocked_reason, source, parent, assignee, plan, private: parent === null };
}
```

Add `.filter(onRecord)` right after `[...tasks.values()]` in `today()`, in `team()`'s `open` and in the `/work/tasks/` drill. In `patch`, change the ASSIGNEE_CANNOT_OPEN sentence to `` `That person can't open this ${task.parent?.kind === 'account' ? 'account' : 'organisation'}.` ``.

- [ ] **Step 7: Run the checks**

Run: `npx tsc -b && npx vitest run src/features/work src/components/work src/pages/work --maxWorkers=2`
Expected: tsc clean; PASS (the existing Work suites are unchanged in behaviour).

- [ ] **Step 8: Commit**

```bash
git add src/features/work/workTypes.ts src/features/work/workApi.ts src/features/work/workApi.test.ts src/features/work/rows.ts src/features/work/rows.test.ts src/features/work/workText.ts src/features/work/testWorkFixtures.ts src/features/work/testWork.ts src/components/work/TaskRowItem.tsx src/components/work/TaskFacts.tsx src/components/work/TaskSheet.tsx src/components/work/TaskFields.tsx
git commit -m "feat(work): feed and to-do types, API wrappers, null-safe task shapes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The feed's rules and words (`feed.ts`)

**Files:**
- Create: `src/features/work/feed.ts`
- Test: `src/features/work/feed.test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces:
  - `FEED` (the copy object below), `GROUP_ORDER: readonly FeedGroupKey[]`, `FEED_GROUP_LABEL: Record<FeedGroupKey, string>`.
  - `type FeedChip = 'task' | 'todo' | 'approval' | 'question' | 'suggestion'`, `FEED_CHIPS: readonly { key: FeedChip | null; label: string }[]`, `chipOf(value: string | null): FeedChip | null`, `kindsOf(chip: FeedChip | null): readonly FeedKind[] | null`, `chipAllows(chip: FeedChip | null, kind: FeedKind): boolean`.
  - `compareIn(group: FeedGroupKey, a: FeedItem, b: FeedItem): number`.
  - `groupIn(feed: FeedPayload, key: FeedGroupKey): FeedGroup`, `locateItem(feed, key: string): { group: FeedGroupKey; item: FeedItem } | null`, `withoutItem(feed, key: string): FeedPayload`, `withItem(feed, group: FeedGroupKey, item: FeedItem): FeedPayload`, `withPage(feed, page: FeedGroup): FeedPayload`, `withGroup(feed, group: FeedGroup, failed: readonly FeedKind[], retried: readonly FeedKind[]): FeedPayload`, `withHidden(feed, by: number): FeedPayload`, `feedTotal(feed): number`.
  - `interface FailedSlot { at: FeedGroupKey; kinds: FeedKind[]; retry: 'decide' | 'suggested' | 'all' }`, `failedSlots(failed: readonly FeedKind[]): FailedSlot[]`, `failedText(kinds: readonly FeedKind[]): string`.
  - `hiddenFeedText(n: number): string | null`, `feedBadgeName(decide: number, overdue: number): string`, `dayText(at: string): string`, `answerHref(item: QuestionFeedItem): string`, `draftHref(item: DraftFeedItem): string`, `undoPatch(row: TaskRow): TaskPatch`, `reopenedText(title)`, `addedText(answer: TodoAnswer)`, `addedToMineText(title)`, `approvedText(title)`.
  - `interface TodoForm { title: string; record: RecordRef | null; due: string; priority: TaskPriority; assignee: number | null }`, `todoBody(form: TodoForm): TodoBody`, `todoErrors(form: TodoForm): Partial<Record<'title' | 'due_date', string>>`.

- [ ] **Step 1: Write the failing test**

`src/features/work/feed.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  FEED_GROUP_LABEL,
  GROUP_ORDER,
  addedText,
  answerHref,
  chipAllows,
  chipOf,
  compareIn,
  failedSlots,
  failedText,
  feedBadgeName,
  feedTotal,
  hiddenFeedText,
  kindsOf,
  locateItem,
  todoBody,
  todoErrors,
  undoPatch,
  withGroup,
  withItem,
  withPage,
  withoutItem,
} from './feed';
import { APPROVAL, DRAFT, QUESTION, REVIEW, taskItem } from './testFeedFixtures';
import { CALL_PIZZA, RENEWAL_PRICING, SECURITY, taskDetail } from './testWorkFixtures';
import type { FeedGroup, FeedPayload, TaskDetail } from './workTypes';

const group = (key: FeedGroup['key'], items: FeedGroup['items'], count = items.length, next: string | null = null): FeedGroup => ({ key, count, items, next });
const feedOf = (...groups: FeedGroup[]): FeedPayload => ({
  groups: GROUP_ORDER.map((key) => groups.find((g) => g.key === key) ?? group(key, [])),
  hidden: 0,
  failed: [],
});
const todo = (over: Partial<TaskDetail> & Pick<TaskDetail, 'id' | 'title'>) => taskItem(taskDetail({ due_date: null, parent: null, ...over }));

describe('feed groups and chips', () => {
  it('names the eight groups in the contract order', () => {
    expect(GROUP_ORDER.map((key) => FEED_GROUP_LABEL[key])).toEqual(['Needs your decision', 'Overdue', 'Today', 'This week', 'Later', 'No date', 'Blocked', 'Suggested']);
  });

  it('reads a chip from the URL, unknown as All, and asks the kinds it stands for', () => {
    expect(chipOf('approval')).toBe('approval');
    expect(chipOf('draft')).toBeNull();
    expect(chipOf(null)).toBeNull();
    expect(kindsOf('approval')).toEqual(['approval', 'rule_review']);
    expect(kindsOf(null)).toBeNull();
    expect(chipAllows('approval', 'rule_review')).toBe(true);
    expect(chipAllows('todo', 'task')).toBe(false);
    expect(chipAllows(null, 'draft')).toBe(true);
  });
});

describe('feed ordering (contract §2.1)', () => {
  it('orders decide oldest first, a tie by review, approval, question, draft', () => {
    const at = '2026-10-05T12:00:00Z';
    const items = [{ ...DRAFT, at }, { ...APPROVAL, at }, { ...QUESTION, at }, { ...REVIEW, at }];
    expect(items.sort((a, b) => compareIn('decide', a, b)).map((i) => i.kind)).toEqual(['rule_review', 'approval', 'question', 'draft']);
  });

  it('orders task groups by date, then priority, and no-date by priority then age', () => {
    const late = taskItem(taskDetail({ id: 1, title: 'a', due_date: '2026-10-09', priority: 'low' }));
    const soonLow = taskItem(taskDetail({ id: 2, title: 'b', due_date: '2026-10-08', priority: 'low' }));
    const soonHigh = taskItem(taskDetail({ id: 3, title: 'c', due_date: '2026-10-08', priority: 'high' }));
    expect([late, soonLow, soonHigh].sort((a, b) => compareIn('week', a, b)).map((i) => i.id)).toEqual([3, 2, 1]);
    const old = todo({ id: 4, title: 'd', priority: 'medium', created_at: '2026-10-01T12:00:00Z' });
    const young = todo({ id: 5, title: 'e', priority: 'medium', created_at: '2026-10-06T12:00:00Z' });
    const urgent = todo({ id: 6, title: 'f', priority: 'high', created_at: '2026-10-07T12:00:00Z' });
    expect([young, old, urgent].sort((a, b) => compareIn('no_date', a, b)).map((i) => i.id)).toEqual([6, 4, 5]);
  });
});

describe('feed changes', () => {
  const pizza = taskItem(CALL_PIZZA);
  const pricing = taskItem(RENEWAL_PRICING);

  it('removes an item from its group, its count one lower, and finds where it was', () => {
    const feed = feedOf(group('overdue', [pizza], 3));
    expect(locateItem(feed, pizza.key)).toEqual({ group: 'overdue', item: pizza });
    const after = withoutItem(feed, pizza.key);
    expect(after.groups[1]).toEqual(group('overdue', [], 2));
    expect(withoutItem(after, pizza.key)).toBe(after);
  });

  it('puts an item back in order, once, its count one higher', () => {
    const feed = feedOf(group('week', [pricing]));
    const early = taskItem(taskDetail({ id: 70, title: 'Early', due_date: '2026-10-08' }));
    const placed = withItem(feed, 'week', early);
    expect(placed.groups[3].items.map((i) => i.id)).toEqual([70, pricing.id]);
    expect(placed.groups[3].count).toBe(2);
    expect(withItem(placed, 'week', early)).toBe(placed);
  });

  it('only counts an item that sorts past a cut group, so Show more never repeats it', () => {
    const feed = feedOf(group('week', [pricing], 5, 'week:1'));
    const late = taskItem(taskDetail({ id: 71, title: 'Late', due_date: '2026-10-14' }));
    const placed = withItem(feed, 'week', late);
    expect(placed.groups[3].items).toEqual([pricing]);
    expect(placed.groups[3].count).toBe(6);
  });

  it('appends a page without repeats and takes its cursor and count', () => {
    const feed = feedOf(group('week', [pricing], 2, 'week:1'));
    const next = taskItem(taskDetail({ id: 72, title: 'Next', due_date: '2026-10-12' }));
    const after = withPage(feed, group('week', [pricing, next], 2, null));
    expect(after.groups[3]).toEqual(group('week', [pricing, next], 2, null));
  });

  it('replaces a retried group and keeps only what still fails', () => {
    const feed = { ...feedOf(), failed: ['approval', 'question', 'task'] } as FeedPayload;
    const after = withGroup(feed, group('decide', [APPROVAL]), ['question'], ['approval', 'question']);
    expect(after.groups[0].items).toEqual([APPROVAL]);
    expect(after.failed).toEqual(['question', 'task']);
  });

  it('adds every group up', () => {
    expect(feedTotal(feedOf(group('decide', [], 2), group('suggested', [], 3)))).toBe(5);
  });
});

describe('feed words', () => {
  it('places each failed source once, where it would show', () => {
    expect(failedSlots(['approval', 'question', 'task', 'todo', 'suggestion'])).toEqual([
      { at: 'decide', kinds: ['approval', 'question'], retry: 'decide' },
      { at: 'overdue', kinds: ['task', 'todo'], retry: 'all' },
      { at: 'suggested', kinds: ['suggestion'], retry: 'suggested' },
    ]);
    expect(failedSlots([])).toEqual([]);
  });

  it('says what failed in a list', () => {
    expect(failedText(['approval'])).toBe("Couldn't load approvals.");
    expect(failedText(['approval', 'rule_review', 'question'])).toBe("Couldn't load approvals, rule reviews and questions.");
    expect(failedText(['task', 'todo'])).toBe("Couldn't load tasks and to-dos.");
  });

  it('counts what it cannot name', () => {
    expect(hiddenFeedText(0)).toBeNull();
    expect(hiddenFeedText(1)).toBe("1 more on a record you can't open");
    expect(hiddenFeedText(3)).toBe("3 more on records you can't open");
  });

  it('names the badge', () => {
    expect(feedBadgeName(3, 1)).toBe('3 to decide, 1 overdue');
    expect(feedBadgeName(0, 2)).toBe('2 overdue');
    expect(feedBadgeName(0, 0)).toBe('');
  });

  it('answers a question on its organisation, else in Copilot', () => {
    expect(answerHref(QUESTION)).toBe('/organizations/3?tab=knowledge');
    expect(answerHref({ ...QUESTION, record: null })).toBe('/copilot');
  });

  it('undoes Done back to the status it had, Blocked with its reason', () => {
    expect(undoPatch(taskItem(CALL_PIZZA).detail)).toEqual({ status: 'pending' });
    expect(undoPatch(taskItem(SECURITY).detail)).toEqual({ status: 'blocked', blocked_reason: 'Waiting on legal' });
  });

  it('says who a new task went to', () => {
    const mine = taskItem(taskDetail({ id: 80, title: 'Book the room', due_date: null, parent: null }));
    expect(addedText({ task: { ...taskDetail({ id: 80, title: 'Book the room', due_date: null }) }, item: mine, group: 'no_date' })).toBe('Added: Book the room.');
    expect(addedText({ task: taskDetail({ id: 81, title: 'Call Ann', due_date: '2026-10-09', assignee: { id: 3, name: 'Carl CSM', active: true } }), item: null, group: null })).toBe('Added for Carl CSM: Call Ann.');
  });
});

describe('quick-add body', () => {
  const base = { title: '  Book the QBR room ', record: null, due: '', priority: 'medium' as const, assignee: null };

  it('sends a plain to-do with no date and no record', () => {
    expect(todoBody(base)).toEqual({ title: 'Book the QBR room', priority: 'medium', due_date: null });
  });

  it('sends the record as customer_id or account_id, with the assignee only then', () => {
    expect(todoBody({ ...base, record: { kind: 'organization', id: 7, name: 'Pizza Hut' }, due: '2026-10-09', assignee: 3 })).toEqual({
      title: 'Book the QBR room', priority: 'medium', due_date: '2026-10-09', customer_id: 7, assignee_id: 3,
    });
    expect(todoBody({ ...base, record: { kind: 'account', id: 9, name: 'Uber EMEA' }, due: '2026-10-09' })).toEqual({
      title: 'Book the QBR room', priority: 'medium', due_date: '2026-10-09', account_id: 9,
    });
    expect(todoBody({ ...base, assignee: 3 })).toEqual({ title: 'Book the QBR room', priority: 'medium', due_date: null });
  });

  it('refuses a blank title, and a record without a date, in the contract words', () => {
    expect(todoErrors({ ...base, title: '  ' })).toEqual({ title: 'Give the task a title.' });
    expect(todoErrors({ ...base, record: { kind: 'organization', id: 7, name: 'Pizza Hut' } })).toEqual({ due_date: 'Choose a date.' });
    expect(todoErrors({ ...base, due: '0002-10-09' })).toEqual({ due_date: 'Choose a date.' });
    expect(todoErrors(base)).toEqual({});
  });
});
```

(`taskItem` and the decide fixtures come from Task 3's `testFeedFixtures.ts`; write Task 3 Step 3's fixtures file **first** in this step if executing out of order. In order, create the fixtures file now with exactly the content of Task 3 Step 3: it has no dependency beyond Task 1.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/work/feed.test.ts --maxWorkers=2`
Expected: FAIL with "Failed to resolve import './feed'".

- [ ] **Step 3: Write `feed.ts`**

```ts
// My work's words and rules (work in one place spec §5; contract
// 2026-10-12-work-one-place-api.md), kept free of React so they are
// unit-tested on their own. Sentence case, no em dash.
import { formatDate } from '../customers/formatters';
import { localDay } from '../organizations/storyDays';
import type { RecordRef } from '../plans/planTypes';
import { WORK, isDueDate } from './workText';
import type {
  DraftFeedItem,
  FeedGroup,
  FeedGroupKey,
  FeedItem,
  FeedKind,
  FeedPayload,
  QuestionFeedItem,
  TaskPatch,
  TaskPriority,
  TaskRow,
  TodoAnswer,
  TodoBody,
} from './workTypes';

export const FEED = {
  LOAD: 'Could not load your work.',
  LOADING: 'Loading your work',
  EMPTY_TITLE: 'Nothing waiting on you.',
  EMPTY_DETAIL: 'Add a to-do above. Approvals, questions and tasks show here when they need you.',
  QUICK_ADD: 'Add a to-do',
  /** The form's own name: not the box's label, so the box is the only "Add a to-do". */
  QUICK_ADD_FORM: 'Quick add',
  ADD: 'Add',
  ADDING: 'Adding…',
  MORE: 'More',
  RECORD: 'Organisation or account (optional)',
  DUE: 'Due date',
  PRIORITY: 'Priority',
  ASSIGNEE: 'Who does it',
  ADD_FAILED: 'Could not add that. Try again.',
  FILTER: 'Show',
  SHOW_MORE: 'Show more',
  LOADING_MORE: 'Loading…',
  MORE_FAILED: 'Could not load more. Try again.',
  TRY_AGAIN: 'Try again',
  ONLY_YOU: 'Only you',
  NO_DATE: 'No date',
  OVERDUE: 'Overdue',
  ANSWER: 'Answer',
  OPEN_DRAFT: 'Open draft',
  ADD_TO_MINE: 'Add to my work',
  ASSIGN: 'Assign',
  DISMISS: 'Dismiss',
  ROW_ACTIONS: 'More actions',
  READ_ONLY: "You can't decide this one.",
  UNDO: 'Undo',
  UNDOING: 'Undoing…',
  UNDO_FAILED: 'Could not undo that. Try again.',
  CLOSE: 'Close',
  OPEN_TASK: 'Open task',
  OPEN_SURVEY: 'Open survey',
  OPEN_CAMPAIGN: 'Open campaign',
  SETTINGS: 'Work settings',
  LOST: "You can't open that any more.",
  CANT_DECIDE: "You can't decide this any more.",
  ALREADY: 'Already decided.',
  EMAIL_REPLY: 'Email reply',
  TICKET_REPLY: 'Ticket reply',
} as const;

export const GROUP_ORDER: readonly FeedGroupKey[] = ['decide', 'overdue', 'today', 'week', 'later', 'no_date', 'blocked', 'suggested'];

export const FEED_GROUP_LABEL: Record<FeedGroupKey, string> = {
  decide: 'Needs your decision',
  overdue: 'Overdue',
  today: 'Today',
  week: 'This week',
  later: 'Later',
  no_date: 'No date',
  blocked: 'Blocked',
  suggested: 'Suggested',
};

/** A chip's `?kind=` value (Decision 3). No value: All. */
export type FeedChip = 'task' | 'todo' | 'approval' | 'question' | 'suggestion';

export const FEED_CHIPS: readonly { key: FeedChip | null; label: string }[] = [
  { key: null, label: 'All' },
  { key: 'task', label: 'Tasks' },
  { key: 'todo', label: 'To-dos' },
  { key: 'approval', label: 'Approvals' },
  { key: 'question', label: 'Questions' },
  { key: 'suggestion', label: 'Suggested' },
];

const CHIP_KINDS: Record<FeedChip, readonly FeedKind[]> = {
  task: ['task'],
  todo: ['todo'],
  approval: ['approval', 'rule_review'],
  question: ['question'],
  suggestion: ['suggestion'],
};

export function chipOf(value: string | null): FeedChip | null {
  return value !== null && value in CHIP_KINDS ? (value as FeedChip) : null;
}

export const kindsOf = (chip: FeedChip | null): readonly FeedKind[] | null => (chip ? CHIP_KINDS[chip] : null);

export const chipAllows = (chip: FeedChip | null, kind: FeedKind): boolean => chip === null || CHIP_KINDS[chip].includes(kind);

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
const DECIDE_RANK: Partial<Record<FeedKind, number>> = { rule_review: 0, approval: 1, question: 2, draft: 3 };
const rankOf = (item: FeedItem) => PRIORITY_RANK[item.priority ?? 'medium'];
const dueOf = (item: FeedItem) => item.due_date ?? '9999-12-31';

/** The contract's order inside one group (§2.1). */
export function compareIn(group: FeedGroupKey, a: FeedItem, b: FeedItem): number {
  if (group === 'decide') return a.at.localeCompare(b.at) || (DECIDE_RANK[a.kind] ?? 9) - (DECIDE_RANK[b.kind] ?? 9) || a.id - b.id;
  if (group === 'suggested') return b.at.localeCompare(a.at) || b.id - a.id;
  if (group === 'no_date') return rankOf(a) - rankOf(b) || a.at.localeCompare(b.at) || a.id - b.id;
  return dueOf(a).localeCompare(dueOf(b)) || rankOf(a) - rankOf(b) || a.at.localeCompare(b.at) || a.id - b.id;
}

export function groupIn(feed: FeedPayload, key: FeedGroupKey): FeedGroup {
  return feed.groups.find((group) => group.key === key) ?? { key, count: 0, items: [], next: null };
}

export function locateItem(feed: FeedPayload, key: string): { group: FeedGroupKey; item: FeedItem } | null {
  for (const group of feed.groups) {
    const item = group.items.find((candidate) => candidate.key === key);
    if (item) return { group: group.key, item };
  }
  return null;
}

/** The feed without one item (it was acted on), its group's count one lower. */
export function withoutItem(feed: FeedPayload, key: string): FeedPayload {
  const found = locateItem(feed, key);
  if (!found) return feed;
  return {
    ...feed,
    groups: feed.groups.map((group) =>
      group.key === found.group ? { ...group, items: group.items.filter((item) => item.key !== key), count: Math.max(0, group.count - 1) } : group,
    ),
  };
}

/** The feed with one item placed in order (quick-add, Undo). Never twice. In
 *  a group cut by `next`, an item sorting past the last loaded one is only
 *  counted: Show more will bring it, and it must not come twice. */
export function withItem(feed: FeedPayload, key: FeedGroupKey, item: FeedItem): FeedPayload {
  if (locateItem(feed, item.key)) return feed;
  return {
    ...feed,
    groups: feed.groups.map((group) => {
      if (group.key !== key) return group;
      const last = group.items[group.items.length - 1];
      if (group.next !== null && last && compareIn(key, item, last) > 0) return { ...group, count: group.count + 1 };
      const items = [...group.items, item].sort((a, b) => compareIn(key, a, b));
      return { ...group, items, count: group.count + 1 };
    }),
  };
}

/** One group's next page, appended (Show more). */
export function withPage(feed: FeedPayload, page: FeedGroup): FeedPayload {
  return {
    ...feed,
    groups: feed.groups.map((group) => {
      if (group.key !== page.key) return group;
      const known = new Set(group.items.map((item) => item.key));
      return { ...group, items: [...group.items, ...page.items.filter((item) => !known.has(item.key))], count: page.count, next: page.next };
    }),
  };
}

/** A failed group read again (Try again): its first page replaces it; of the
 *  kinds retried, only those still failing stay in `failed`. */
export function withGroup(feed: FeedPayload, page: FeedGroup, failed: readonly FeedKind[], retried: readonly FeedKind[]): FeedPayload {
  const kept = feed.failed.filter((kind) => !retried.includes(kind) || failed.includes(kind));
  return { ...feed, groups: feed.groups.map((group) => (group.key === page.key ? page : group)), failed: kept };
}

export const withHidden = (feed: FeedPayload, by: number): FeedPayload => ({ ...feed, hidden: feed.hidden + by });

export const feedTotal = (feed: FeedPayload): number => feed.groups.reduce((sum, group) => sum + group.count, 0);

const DECIDE_KINDS: readonly FeedKind[] = ['approval', 'rule_review', 'question', 'draft'];
const TASK_KINDS: readonly FeedKind[] = ['task', 'todo'];

/** Where a failed source shows, and how its Try again reads (Decision 4). */
export interface FailedSlot {
  at: FeedGroupKey;
  kinds: FeedKind[];
  retry: 'decide' | 'suggested' | 'all';
}

export function failedSlots(failed: readonly FeedKind[]): FailedSlot[] {
  const slots: FailedSlot[] = [];
  const decide = failed.filter((kind) => DECIDE_KINDS.includes(kind));
  if (decide.length > 0) slots.push({ at: 'decide', kinds: decide, retry: 'decide' });
  const tasks = failed.filter((kind) => TASK_KINDS.includes(kind));
  if (tasks.length > 0) slots.push({ at: 'overdue', kinds: tasks, retry: 'all' });
  if (failed.includes('suggestion')) slots.push({ at: 'suggested', kinds: ['suggestion'], retry: 'suggested' });
  return slots;
}

const KIND_NOUN: Record<FeedKind, string> = {
  approval: 'approvals',
  rule_review: 'rule reviews',
  question: 'questions',
  draft: 'drafts',
  task: 'tasks',
  todo: 'to-dos',
  suggestion: 'suggestions',
};

export function failedText(kinds: readonly FeedKind[]): string {
  const nouns = kinds.map((kind) => KIND_NOUN[kind]);
  const list = nouns.length <= 1 ? nouns.join('') : `${nouns.slice(0, -1).join(', ')} and ${nouns[nouns.length - 1]}`;
  return `Couldn't load ${list}.`;
}

export function hiddenFeedText(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 more on a record you can't open" : `${n} more on records you can't open`;
}

/** The words after "Work, " in the sidebar item's name (Decision 12). */
export function feedBadgeName(decide: number, overdue: number): string {
  const parts: string[] = [];
  if (decide > 0) parts.push(`${decide} to decide`);
  if (overdue > 0) parts.push(`${overdue} overdue`);
  return parts.join(', ');
}

/** The day an item arrived, in the reader's time zone. */
export const dayText = (at: string): string => formatDate(localDay(new Date(at)));

/** Where a question is answered today (Brain Waiting's rule, contract §2.3). */
export function answerHref(item: QuestionFeedItem): string {
  return item.record?.type === 'customer' ? `/organizations/${item.record.id}?tab=knowledge` : '/copilot';
}

export const draftHref = (item: DraftFeedItem): string => `/communications?draft=${item.id}`;

/** Undo for Done: the status it had, with its reason when Blocked (contract §1.2). */
export function undoPatch(row: TaskRow): TaskPatch {
  return row.status === 'blocked' ? { status: 'blocked', blocked_reason: row.blocked_reason } : { status: row.status };
}

export const reopenedText = (title: string): string => `Reopened: ${title}.`;
export const addedToMineText = (title: string): string => `Added to your work: ${title}.`;
export const approvedText = (title: string): string => `Approved: ${title}.`;

export function addedText(answer: TodoAnswer): string {
  if (answer.item) return `Added: ${answer.task.title}.`;
  return `Added for ${answer.task.assignee?.name ?? 'someone else'}: ${answer.task.title}.`;
}

/** Quick-add's fields (spec §5: title; More gives record, date, priority, assignee). */
export interface TodoForm {
  title: string;
  record: RecordRef | null;
  due: string;
  priority: TaskPriority;
  /** Only sent with a record; null is the caller. */
  assignee: number | null;
}

export function todoBody(form: TodoForm): TodoBody {
  const body: TodoBody = { title: form.title.trim(), priority: form.priority, due_date: form.due || null };
  if (form.record) {
    if (form.record.kind === 'organization') body.customer_id = form.record.id;
    else body.account_id = form.record.id;
    if (form.assignee !== null) body.assignee_id = form.assignee;
  }
  return body;
}

/** Refused here first, in the contract's words: a title, and a date with a record. */
export function todoErrors(form: TodoForm): Partial<Record<'title' | 'due_date', string>> {
  if (!form.title.trim()) return { title: WORK.TITLE_REQUIRED };
  if ((form.record && !form.due) || (form.due && !isDueDate(form.due))) return { due_date: WORK.DATE_REQUIRED };
  return {};
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/features/work/feed.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/work/feed.ts src/features/work/feed.test.ts src/features/work/testFeedFixtures.ts
git commit -m "feat(work): the feed's rules and words

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The feed stub (`stubFeed`)

**Files:**
- Create: `src/features/work/testFeedFixtures.ts` (if not already created in Task 2), `src/features/work/testFeed.ts`
- Test: `src/features/work/testFeed.test.ts`

**Interfaces:**
- Consumes: `stubWork`, `WorkStub`, `calls`, `sent` (`testWork.ts`); fixtures from `testWorkFixtures.ts`, `ACT_LIFECYCLE` (`../agents/testAgentsFixtures`), `MY_RULE_REVIEW` (`../brain/testWaitingFixtures`).
- Produces:
  - fixtures: `APPROVAL`, `REVIEW`, `QUESTION`, `DRAFT`, `DECIDE_ITEMS`, `TODO_ROOM` (TaskDetail id 60), `TODOS`, `taskItem(task: TaskDetail): TaskFeedItem`, `suggestionItem(row: RecommendationRow): SuggestionFeedItem`, `approvalItem(action: AgentAction, over?: Partial<ApprovalFeedItem>): ApprovalFeedItem`.
  - `interface FeedStub extends WorkStub { decide?: FeedItem[]; todos?: TaskDetail[]; feedHidden?: number; failKinds?: Partial<Record<FeedKind, number>>; failFeed?: number; pageSize?: number; decisions?: 'stub' | 'pass'; refuseNextAction?: { status: number; body: unknown }; refuseNextTodo?: { status: number; body: unknown } }`
  - `stubFeed(stub?: FeedStub): { spy; work: ReturnType<typeof stubWork>; decide: Map<string, FeedItem> }`.
  - Default reader Alice's feed on 2026-10-07: decide 4 (review 14, question 31, draft 7, approval 81), overdue 1 (Call Pizza Hut 41), today 1 (42), week 2 (Kick-off call 47, Prep renewal pricing 43), later 1 (44), no_date 1 (to-do 60 "Book the QBR room"), blocked 1 (45), suggested 2 (recommendations 5 and 6); count `{decide: 4, overdue: 1, badge: 5}`.

- [ ] **Step 1: Write the failing test**

`src/features/work/testFeed.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubFeed } from './testFeed';
import type { FeedCount, FeedPage, FeedPayload, TodoAnswer } from './workTypes';

const call = async (path: string, init?: RequestInit) => {
  const response = (await fetch(`http://localhost/api/v1${path}`, init)) as unknown as { status: number; json: () => Promise<unknown> };
  return { status: response.status, body: await response.json() };
};
const post = (path: string, body: unknown) => call(path, { method: 'POST', body: JSON.stringify(body) });

describe('stubFeed (contract §2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("answers Alice's desk in eight groups, in order, with full counts", async () => {
    stubFeed();
    const { body } = (await call('/work/feed/')) as { body: FeedPayload };
    expect(body.groups.map((g) => [g.key, g.count])).toEqual([
      ['decide', 4], ['overdue', 1], ['today', 1], ['week', 2], ['later', 1], ['no_date', 1], ['blocked', 1], ['suggested', 2],
    ]);
    expect(body.groups[0].items.map((i) => i.key)).toEqual(['rule_review:14', 'question:31', 'draft:7', 'agent_action:81']);
    expect(body.groups[3].items.map((i) => i.id)).toEqual([47, 43]);
    expect(body.groups[5].items[0]).toMatchObject({ key: 'task:60', kind: 'todo', private: true, record: null, due_date: null });
    expect(body.groups[7].items.map((i) => i.key)).toEqual(['recommendation:5', 'recommendation:6']);
    expect(body).toMatchObject({ hidden: 0, failed: [] });
  });

  it('filters by kind and refuses an unknown one', async () => {
    stubFeed();
    const { body } = (await call('/work/feed/?kind=approval,rule_review')) as { body: FeedPayload };
    expect(body.groups.map((g) => g.count)).toEqual([2, 0, 0, 0, 0, 0, 0, 0]);
    expect((await call('/work/feed/?kind=nope')).status).toBe(400);
  });

  it('pages a group by its cursor', async () => {
    stubFeed({ pageSize: 1 });
    const first = (await call('/work/feed/')) as { body: FeedPayload };
    const week = first.body.groups[3];
    expect([week.items.length, week.next]).toEqual([1, 'week:1']);
    const page = (await call(`/work/feed/?group=week&cursor=${week.next}`)) as { body: FeedPage };
    expect(page.body.group).toMatchObject({ key: 'week', count: 2, next: null });
    expect(page.body.group.items.map((i) => i.id)).toEqual([43]);
    expect((await call('/work/feed/?group=today&cursor=week:1')).body).toEqual({ cursor: ['That list has changed. Reload Work.'] });
  });

  it('fails a source on its own, then recovers on the group read', async () => {
    stubFeed({ failKinds: { approval: 1 } });
    const { body } = (await call('/work/feed/')) as { body: FeedPayload };
    expect(body.failed).toEqual(['approval']);
    expect(body.groups[0].count).toBe(3);
    const retry = (await call('/work/feed/?group=decide')) as { body: FeedPage };
    expect(retry.body).toMatchObject({ failed: [], group: { count: 4 } });
  });

  it('counts the badge, and drops a decided approval from it', async () => {
    stubFeed();
    expect((await call('/work/feed/count/')).body as FeedCount).toEqual({ decide: 4, overdue: 1, badge: 5, failed: [] });
    expect((await post('/agents/actions/81/approve/', {})).body).toMatchObject({ action: { id: 81, status: 'applied', undo: { allowed: true } } });
    expect(((await call('/work/feed/count/')).body as FeedCount).decide).toBe(3);
  });

  it('makes a to-do, and refuses in the contract order', async () => {
    stubFeed();
    const made = (await post('/work/todos/', { title: 'Call the florist', priority: 'medium', due_date: null })) as { status: number; body: TodoAnswer };
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ group: 'no_date', item: { kind: 'todo', title: 'Call the florist', private: true }, task: { parent: null, private: true } });
    expect((await post('/work/todos/', { title: ' ' })).body).toEqual({ title: ['Give the task a title.'] });
    expect((await post('/work/todos/', { title: 'x', assignee_id: 3 })).body).toEqual({ assignee: ['A to-do without a record can only be yours.'] });
    expect((await post('/work/todos/', { title: 'x', customer_id: 7 })).body).toEqual({ due_date: ['Choose a date.'] });
    expect((await post('/work/todos/', { title: 'x', customer_id: 99, due_date: '2026-10-09' })).body).toEqual({ record: ['Choose an organisation or account you can open.'] });
    const theirs = (await post('/work/todos/', { title: 'Call Ann', customer_id: 7, due_date: '2026-10-09', assignee_id: 3 })) as { body: TodoAnswer };
    expect(theirs.body).toMatchObject({ item: null, group: null, task: { assignee: { id: 3 } } });
  });

  it('clears a to-do date and attaches a record (contract §1.2)', async () => {
    stubFeed();
    expect((await call('/tasks/60/', { method: 'PATCH', body: JSON.stringify({ customer_id: 7 }) })).body).toEqual({ due_date: ['Choose a date.'] });
    const attached = await call('/tasks/60/', { method: 'PATCH', body: JSON.stringify({ customer_id: 7, due_date: '2026-10-09' }) });
    expect(attached.body).toMatchObject({ parent: { kind: 'customer', id: 7 }, private: false, due_date: '2026-10-09' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/work/testFeed.test.ts --maxWorkers=2`
Expected: FAIL with "Failed to resolve import './testFeed'".

- [ ] **Step 3: Write the fixtures**

`src/features/work/testFeedFixtures.ts`:

```ts
// Test-only: the feed's items for Alice (id 1) on 7 Oct 2026, in the
// contract's shapes (2026-10-12-work-one-place-api.md §2.2). Times sit at
// noon UTC so the day reads the same in any test time zone.
import { ACT_LIFECYCLE } from '../agents/testAgentsFixtures';
import type { AgentAction } from '../agents/agentTypes';
import { MY_RULE_REVIEW } from '../brain/testWaitingFixtures';
import { ALICE, refOf, taskDetail } from './testWorkFixtures';
import type {
  ApprovalFeedItem,
  DraftFeedItem,
  FeedFrom,
  FeedItem,
  QuestionFeedItem,
  RecommendationRow,
  ReviewFeedItem,
  SuggestionFeedItem,
  TaskDetail,
  TaskFeedItem,
  TaskRow,
} from './workTypes';

const NONE = { due_date: null, priority: null, private: false } as const;
const AGENT_LABEL = { cs: 'CS agent', sales: 'Sales agent', ops: 'Ops agent' } as const;

/** An agent action waiting on Alice, as the feed lists it. */
export function approvalItem(action: AgentAction, over: Partial<ApprovalFeedItem> = {}): ApprovalFeedItem {
  return {
    ...NONE,
    key: `agent_action:${action.id}`,
    kind: 'approval',
    id: action.id,
    title: action.title,
    record: action.record ? { type: action.record.kind === 'customer' ? 'customer' : 'account', id: action.record.id, name: action.record.name } : null,
    from: { type: 'agent', label: AGENT_LABEL[action.agent] },
    at: '2026-10-06T12:00:00Z',
    actions: ['approve', 'reject'],
    detail: { ...action, session: null },
    ...over,
  };
}

export const APPROVAL: ApprovalFeedItem = approvalItem(ACT_LIFECYCLE);

export const REVIEW: ReviewFeedItem = {
  ...NONE,
  key: 'rule_review:14',
  kind: 'rule_review',
  id: 14,
  title: 'Survey from Detractor follow-up',
  record: null,
  from: { type: 'rule', label: 'Detractor follow-up' },
  at: '2026-10-03T12:00:00Z',
  actions: ['approve', 'skip'],
  detail: MY_RULE_REVIEW.detail,
};

export const QUESTION: QuestionFeedItem = {
  ...NONE,
  key: 'question:31',
  kind: 'question',
  id: 31,
  title: 'Who signs off renewals at Uber?',
  record: { type: 'customer', id: 3, name: 'Uber' },
  from: { type: 'person', label: 'Bob Sales' },
  at: '2026-10-04T12:00:00Z',
  actions: ['answer'],
  detail: { text: 'Who signs off renewals at Uber? Legal asked twice.', asked_by: { id: 9, name: 'Bob Sales' } },
};

export const DRAFT: DraftFeedItem = {
  ...NONE,
  key: 'draft:7',
  kind: 'draft',
  id: 7,
  title: 'Re: renewal terms',
  record: { type: 'customer', id: 7, name: 'Pizza Hut' },
  from: { type: 'agent', label: 'CS agent' },
  at: '2026-10-05T12:00:00Z',
  actions: ['open'],
  detail: { channel: 'email' },
};

/** Oldest first, as the decide group orders them. */
export const DECIDE_ITEMS: FeedItem[] = [REVIEW, QUESTION, DRAFT, APPROVAL];

/** Alice's one to-do: no record, no date. */
export const TODO_ROOM: TaskDetail = taskDetail({
  id: 60,
  title: 'Book the QBR room',
  due_date: null,
  parent: null,
  created_by: refOf(ALICE),
  created_at: '2026-10-06T12:00:00.000000Z',
  editable: ['title', 'description', 'status', 'due_date', 'priority', 'assignee', 'record'],
});
export const TODOS: TaskDetail[] = [TODO_ROOM];

export function taskRow(task: TaskDetail): TaskRow {
  const { id, title, due_date, priority, status, blocked_reason, source, parent, assignee, plan } = task;
  return { id, title, due_date, priority, status, blocked_reason, source, parent, assignee, plan, private: parent === null };
}

function fromOf(task: TaskDetail): FeedFrom {
  if (task.source === 'agent') return { type: 'agent', label: 'AI agent' };
  if (task.source === 'rule') return { type: 'rule', label: 'A rule' };
  if (task.source === 'recommendation') return { type: 'revenact', label: 'Revenact' };
  return task.created_by ? { type: 'person', label: task.created_by.name } : { type: 'revenact', label: 'Revenact' };
}

/** A task or to-do as the feed lists it (contract §2.2). */
export function taskItem(task: TaskDetail): TaskFeedItem {
  return {
    key: `task:${task.id}`,
    kind: task.parent ? 'task' : 'todo',
    id: task.id,
    title: task.title,
    record: task.parent ? { type: task.parent.kind, id: task.parent.id, name: task.parent.name } : null,
    from: fromOf(task),
    at: task.created_at,
    due_date: task.due_date,
    priority: task.priority,
    private: task.parent === null,
    actions: ['done', 'open'],
    detail: taskRow(task),
  };
}

export function suggestionItem(row: RecommendationRow): SuggestionFeedItem {
  return {
    ...NONE,
    key: `recommendation:${row.id}`,
    kind: 'suggestion',
    id: row.id,
    title: row.title,
    record: row.record ? { type: row.record.kind, id: row.record.id, name: row.record.name } : null,
    from: { type: 'revenact', label: 'Revenact' },
    at: row.created_at,
    actions: ['add', 'assign', 'dismiss'],
    detail: row,
  };
}
```

- [ ] **Step 4: Write the stub**

`src/features/work/testFeed.ts`:

```ts
// Test-only: the feed routes of the work-in-one-place contract
// (2026-10-12-work-one-place-api.md), in front of stubWork. Tasks, to-dos
// and recommendations live in stubWork's own maps, so a Done, an assign or
// a dismiss made through stubWork shows in the very next feed read; the
// decide items live here. Agent-action and rule-review decisions are
// answered here unless `decisions: 'pass'` hands them on (to stubAgents).
import { vi } from 'vitest';
import { ALICE, NOW, RECORDS, TODAY, ASSIGNEES, WORK_TASKS, refOf, taskDetail, taskEvent } from './testWorkFixtures';
import { DECIDE_ITEMS, TODOS, suggestionItem, taskItem } from './testFeedFixtures';
import { stubWork, type WorkStub } from './testWork';
import type { ApprovalFeedItem, FeedGroup, FeedGroupKey, FeedItem, FeedKind, TaskDetail, TaskGroupKey, TaskPerson } from './workTypes';

export interface FeedStub extends WorkStub {
  /** Approvals, reviews, questions and drafts. Default DECIDE_ITEMS. */
  decide?: FeedItem[];
  /** To-dos (tasks with no record), added to `tasks`. Default TODOS. */
  todos?: TaskDetail[];
  /** The feed's `hidden`. Default 0. */
  feedHidden?: number;
  /** How many reads fail each source first (task and todo fail together). */
  failKinds?: Partial<Record<FeedKind, number>>;
  /** How many whole-feed reads answer 500 first. */
  failFeed?: number;
  /** Items per group page. Default 50. */
  pageSize?: number;
  /** 'pass' hands agent-action and review decisions to `passThrough`. */
  decisions?: 'stub' | 'pass';
  /** The next agent-action or review decision answers this instead (a 409 also takes the item off the desk). */
  refuseNextAction?: { status: number; body: unknown };
  /** The next POST /work/todos/ answers this instead. */
  refuseNextTodo?: { status: number; body: unknown };
}

const KINDS: readonly FeedKind[] = ['approval', 'rule_review', 'question', 'draft', 'task', 'todo', 'suggestion'];
const GROUPS: readonly FeedGroupKey[] = ['decide', 'overdue', 'today', 'week', 'later', 'no_date', 'blocked', 'suggested'];
const DECIDE: readonly FeedKind[] = ['approval', 'rule_review', 'question', 'draft'];
const SUGGESTED = ['renewal_due', 'health_drop', 'urgent_tickets', 'anomaly'];
const PRIORITY = { high: 0, medium: 1, low: 2 } as const;
const json = (status: number, body: unknown) => {
  const copy = body === undefined ? null : JSON.parse(JSON.stringify(body));
  return { ok: status >= 200 && status < 300, status, json: async () => copy };
};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const RECORD = { record: ['Choose an organisation or account you can open.'] };

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function taskGroup(task: TaskDetail): TaskGroupKey {
  if (task.status === 'blocked') return 'blocked';
  if (task.due_date === null) return 'no_date';
  if (task.due_date < TODAY) return 'overdue';
  if (task.due_date === TODAY) return 'today';
  return task.due_date <= addDays(TODAY, 7) ? 'week' : 'later';
}

function order(group: FeedGroupKey, a: FeedItem, b: FeedItem): number {
  const rank = (item: FeedItem) => PRIORITY[item.priority ?? 'medium'];
  if (group === 'decide') return a.at.localeCompare(b.at) || DECIDE.indexOf(a.kind) - DECIDE.indexOf(b.kind) || a.id - b.id;
  if (group === 'suggested') return b.at.localeCompare(a.at) || b.id - a.id;
  if (group === 'no_date') return rank(a) - rank(b) || a.at.localeCompare(b.at) || a.id - b.id;
  return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || rank(a) - rank(b) || a.at.localeCompare(b.at) || a.id - b.id;
}

const kindGroups = (kind: FeedKind): readonly FeedGroupKey[] =>
  DECIDE.includes(kind) ? ['decide'] : kind === 'suggestion' ? ['suggested'] : ['overdue', 'today', 'week', 'later', 'no_date', 'blocked'];

function recordOf(body: Record<string, unknown>) {
  if (typeof body.customer_id === 'number') {
    const found = RECORDS.customers.find((r) => r.id === body.customer_id);
    return found ? { kind: 'customer' as const, id: found.id, name: found.name } : null;
  }
  const found = RECORDS.accounts.find((r) => r.id === body.account_id);
  return found ? { kind: 'account' as const, id: found.id, name: found.name } : null;
}

export function stubFeed(stub: FeedStub = {}) {
  const reader: TaskPerson = stub.reader ?? ALICE;
  const work = stubWork({ ...stub, tasks: [...(stub.tasks ?? WORK_TASKS), ...(stub.todos ?? TODOS)] });
  const decide = new Map<string, FeedItem>((stub.decide ?? DECIDE_ITEMS).map((item) => [item.key, clone(item)]));
  const decided = new Map<string, FeedItem>();
  const fail: Partial<Record<FeedKind, number>> = { ...(stub.failKinds ?? {}) };
  if (fail.task || fail.todo) fail.task = fail.todo = Math.max(fail.task ?? 0, fail.todo ?? 0);
  let failFeed = stub.failFeed ?? 0;
  let refuseAction = stub.refuseNextAction ?? null;
  let refuseTodo = stub.refuseNextTodo ?? null;
  const size = stub.pageSize ?? 50;
  let nextId = 950;
  let nextEvent = 9500;

  const mine = (task: TaskDetail) => task.status !== 'completed' && (task.parent ? task.assignee?.id === reader.id : task.created_by?.id === reader.id);

  function everything(kinds: readonly FeedKind[], failed: readonly FeedKind[]): Record<FeedGroupKey, FeedItem[]> {
    const groups = Object.fromEntries(GROUPS.map((key) => [key, [] as FeedItem[]])) as Record<FeedGroupKey, FeedItem[]>;
    const ok = (kind: FeedKind) => kinds.includes(kind) && !failed.includes(kind);
    for (const item of decide.values()) if (ok(item.kind)) groups.decide.push(item);
    for (const task of work.tasks.values()) {
      if (!mine(task)) continue;
      const item = taskItem(task);
      if (ok(item.kind)) groups[taskGroup(task)].push(item);
    }
    for (const state of work.recommendations.values()) {
      const { row, decided: outcome } = state;
      if (outcome.status === 'open' && row.recipient.id === reader.id && SUGGESTED.includes(row.kind) && ok('suggestion')) groups.suggested.push(suggestionItem(row));
    }
    for (const key of GROUPS) groups[key].sort((a, b) => order(key, a, b));
    return groups;
  }

  const page = (key: FeedGroupKey, list: FeedItem[], from: number): FeedGroup => ({
    key,
    count: list.length,
    items: list.slice(from, from + size),
    next: from + size < list.length ? `${key}:${from + size}` : null,
  });

  /** The asked kinds failing this read; each read uses one failure up. */
  function failing(kinds: readonly FeedKind[], group: FeedGroupKey | null): FeedKind[] {
    const failed = kinds.filter((kind) => (fail[kind] ?? 0) > 0 && (group === null || kindGroups(kind).includes(group)));
    for (const kind of failed) fail[kind] = (fail[kind] ?? 1) - 1;
    return failed;
  }

  function feed(url: URL) {
    const asked = url.searchParams.get('kind');
    const kinds = asked === null ? KINDS : (asked.split(',') as FeedKind[]);
    if (kinds.length === 0 || kinds.some((kind) => !KINDS.includes(kind))) {
      return json(400, { kind: ['Choose approval, rule_review, question, draft, task, todo or suggestion.'] });
    }
    const group = url.searchParams.get('group') as FeedGroupKey | null;
    const cursor = url.searchParams.get('cursor');
    if (cursor !== null && group === null) return json(400, { cursor: ['Say which group to page.'] });
    if (group !== null && !GROUPS.includes(group)) {
      return json(400, { group: ['Choose decide, overdue, today, week, later, no_date, blocked or suggested.'] });
    }
    if (group === null) {
      if (failFeed > 0) {
        failFeed -= 1;
        return json(500, { detail: 'Down.' });
      }
      const failed = failing(kinds, null);
      const groups = everything(kinds, failed);
      return json(200, { groups: GROUPS.map((key) => page(key, groups[key], 0)), hidden: stub.feedHidden ?? 0, failed: KINDS.filter((k) => failed.includes(k)) });
    }
    let from = 0;
    if (cursor !== null) {
      const [key, offset] = cursor.split(':');
      if (key !== group || !/^\d+$/.test(offset ?? '')) return json(400, { cursor: ['That list has changed. Reload Work.'] });
      from = Number(offset);
    }
    const failed = failing(kinds, group);
    return json(200, { group: page(group, everything(kinds, failed)[group], from), failed: KINDS.filter((k) => failed.includes(k)) });
  }

  function count() {
    const groups = everything(KINDS, []);
    return json(200, { decide: groups.decide.length, overdue: groups.overdue.length, badge: groups.decide.length + groups.overdue.length, failed: [] });
  }

  function todo(body: Record<string, unknown>) {
    if (refuseTodo) {
      const answer = refuseTodo;
      refuseTodo = null;
      return json(answer.status, answer.body);
    }
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return json(400, { title: ['Give the task a title.'] });
    if (title.length > 255) return json(400, { title: ['Keep the title under 255 characters.'] });
    if (body.due_date != null && !isDate(body.due_date)) return json(400, { due_date: ['Choose a date.'] });
    if (body.priority !== undefined && !['high', 'medium', 'low'].includes(String(body.priority))) return json(400, { priority: ['Choose high, medium or low.'] });
    const wantsRecord = body.customer_id != null || body.account_id != null;
    if (body.customer_id != null && body.account_id != null) return json(400, { record: ['Choose an organisation or an account, not both.'] });
    const record = wantsRecord ? recordOf(body) : null;
    if (wantsRecord && !record) return json(400, RECORD);
    if (!record && body.assignee_id != null && body.assignee_id !== reader.id) return json(400, { assignee: ['A to-do without a record can only be yours.'] });
    if (record && !isDate(body.due_date)) return json(400, { due_date: ['Choose a date.'] });
    let assignee: TaskPerson = reader;
    if (record && body.assignee_id != null && body.assignee_id !== reader.id) {
      const person = ASSIGNEES.find((p) => p.id === body.assignee_id);
      if (!person || !person.can_open) {
        return json(400, { code: 'ASSIGNEE_CANNOT_OPEN', detail: `That person can't open this ${record.kind === 'customer' ? 'organisation' : 'account'}.` });
      }
      assignee = { id: person.id, name: person.name, active: true };
    }
    const task = taskDetail({
      id: nextId++,
      title,
      due_date: (body.due_date as string | null | undefined) ?? null,
      priority: (body.priority as TaskDetail['priority'] | undefined) ?? 'medium',
      parent: record,
      assignee,
      created_by: refOf(reader),
      created_at: NOW,
      editable: record ? ['title', 'description', 'status', 'due_date', 'priority', 'assignee'] : ['title', 'description', 'status', 'due_date', 'priority', 'assignee', 'record'],
      events: [taskEvent(nextEvent++, 'created', refOf(reader), { source: 'manual', assignee: refOf(assignee) })],
    });
    work.tasks.set(task.id, task);
    const ours = assignee.id === reader.id;
    return json(201, { task, item: ours ? taskItem(task) : null, group: ours ? taskGroup(task) : null });
  }

  /** PATCH on a to-do: the to-do rules (contract §1.2); anything else passes to stubWork. */
  function patchTodo(task: TaskDetail, body: Record<string, unknown>) {
    if (body.assignee_id != null && body.assignee_id !== reader.id) return json(400, { assignee: ['A to-do without a record can only be yours.'] });
    if (body.customer_id != null && body.account_id != null) return json(400, { record: ['Choose an organisation or an account, not both.'] });
    if (body.customer_id != null || body.account_id != null) {
      const record = recordOf(body);
      if (!record) return json(400, RECORD);
      const due = 'due_date' in body ? body.due_date : task.due_date;
      if (!isDate(due)) return json(400, { due_date: ['Choose a date.'] });
      task.due_date = due as string;
      task.parent = record;
      task.parent_name = record.name;
      task.parent_type = record.kind;
      task.private = false;
      task.editable = task.editable.filter((field) => field !== 'record');
      task.events.push(taskEvent(nextEvent++, 'edited', refOf(reader), { field: 'record', from: null, to: { kind: record.kind, id: record.id, name: record.name } }));
      return json(200, task);
    }
    if ('due_date' in body && body.due_date === null) {
      task.events.push(taskEvent(nextEvent++, 'due_changed', refOf(reader), { from: task.due_date, to: null }));
      task.due_date = null;
      return json(200, task);
    }
    return null;
  }

  function agentDecision(id: number, verb: string) {
    const key = `agent_action:${id}`;
    if (refuseAction) {
      const answer = refuseAction;
      refuseAction = null;
      // A 409 means someone else decided it: it leaves the desk for good.
      if (answer.status === 409) decide.delete(key);
      return json(answer.status, answer.body);
    }
    if (verb === 'undo') {
      const done = decided.get(key) as ApprovalFeedItem | undefined;
      if (!done) return json(409, { code: 'NOT_APPLIED', detail: 'This action was not applied.' });
      return json(200, { action: { ...done.detail, status: 'undone', undo: null, undone_by: refOf(reader), undone_at: NOW } });
    }
    const item = decide.get(key) as ApprovalFeedItem | undefined;
    if (!item) return json(404, { code: 'NO_SUCH_ACTION', detail: 'No such action.' });
    decide.delete(key);
    decided.set(key, item);
    const applied = verb === 'approve';
    return json(200, {
      action: {
        ...item.detail,
        status: applied ? 'applied' : 'rejected',
        decided_by: refOf(reader),
        decided_at: NOW,
        applied_at: applied ? NOW : null,
        undo: applied ? { allowed: true, until: '2026-10-14T12:00:00Z', reason: null } : null,
      },
    });
  }

  function reviewDecision(id: number, verb: string) {
    const key = `rule_review:${id}`;
    if (refuseAction) {
      const answer = refuseAction;
      refuseAction = null;
      if (answer.status === 409) decide.delete(key);
      return json(answer.status, answer.body);
    }
    if (!decide.has(key)) return json(409, { detail: 'This review has already been decided.' });
    decide.delete(key);
    return json(200, verb === 'approve' ? { survey_send_id: 31 } : { id, status: 'skipped' });
  }

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (method === 'GET' && path === '/work/feed/') return feed(url);
    if (method === 'GET' && path === '/work/feed/count/') return count();
    if (method === 'POST' && path === '/work/todos/') return todo(body);
    const detail = /^\/tasks\/(\d+)\/$/.exec(path);
    if (detail && method === 'PATCH') {
      const task = work.tasks.get(Number(detail[1]));
      if (task && task.parent === null && task.created_by?.id === reader.id) {
        const answer = patchTodo(task, body);
        if (answer) return answer;
      }
    }
    const agent = /^\/agents\/actions\/(\d+)\/(approve|reject|undo)\/$/.exec(path);
    if (agent && method === 'POST' && stub.decisions !== 'pass') return agentDecision(Number(agent[1]), agent[2]);
    const review = /^\/rules\/reviews\/(\d+)\/(approve|skip)\/$/.exec(path);
    if (review && method === 'POST' && stub.decisions !== 'pass') return reviewDecision(Number(review[1]), review[2]);
    return work.spy(input, init);
  });
  vi.stubGlobal('fetch', spy);
  return { spy, work, decide };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/features/work/testFeed.test.ts src/features/work/feed.test.ts --maxWorkers=2`
Expected: PASS. (If the default week order is not `[47, 43]`, re-read Kick-off call's due date in `testWorkFixtures.ts`: 2026-10-08 before Prep renewal pricing's 2026-10-10.)

- [ ] **Step 6: Commit**

```bash
git add src/features/work/testFeedFixtures.ts src/features/work/testFeed.ts src/features/work/testFeed.test.ts
git commit -m "test(work): stateful feed stub in the work-in-one-place contract shapes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `useFeed`, `useFeedCount` and the feed-changed signal

**Files:**
- Create: `src/components/work/useFeed.ts`, `src/components/work/useFeedCount.ts`
- Modify: `src/components/work/taskChanges.ts`, `src/components/work/useRefreshTick.ts`
- Test: `src/components/work/useFeed.test.tsx`, `src/components/work/useFeedCount.test.tsx`

**Interfaces:**
- Consumes: `fetchFeed`, `fetchFeedGroup`, `fetchFeedCount` (Task 1); `kindsOf`, `withPage`, `withGroup`, `FEED`, `FeedChip`, `FailedSlot` (Task 2); `errorMessage` (`../organizations/portfolio/usePagedRead`).
- Produces:
  - `feedChanged(): void` and `useFeedChanges(onChange: () => void): void` in `taskChanges.ts` (only the badge listens; My work does not reload on it).
  - `useFeed(chip: FeedChip | null): { data: FeedPayload | null; error: string | null; reload(): void; update(change: (feed: FeedPayload) => FeedPayload): void; showMore(group: FeedGroupKey, cursor: string): Promise<void>; retry(slot: FailedSlot): void; paging: Partial<Record<FeedGroupKey, 'busy' | string>> }` (`paging[group]` is `'busy'` while a group page reads, or its error sentence).
  - `useFeedCount(userId: number | null): FeedCount | null`.

- [ ] **Step 1: Write the failing tests**

`src/components/work/useFeed.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { calls } from '../../features/work/testWork';
import { stubFeed } from '../../features/work/testFeed';
import { useFeed } from './useFeed';

describe('useFeed', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the feed for the chip, and again for another chip', async () => {
    const { spy } = stubFeed();
    const { result, rerender } = renderHook(({ chip }) => useFeed(chip), { initialProps: { chip: null as 'approval' | null } });
    await waitFor(() => expect(result.current.data?.groups[0].count).toBe(4));
    rerender({ chip: 'approval' });
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data?.groups[0].count).toBe(2));
    expect(calls(spy, 'GET', '/work/feed/')).toEqual(['/work/feed/', '/work/feed/?kind=approval%2Crule_review']);
  });

  it('keeps the list on screen during a reload, and shows an error only without one', async () => {
    stubFeed({ failFeed: 1 });
    const { result } = renderHook(() => useFeed(null));
    await waitFor(() => expect(result.current.error).toBe('Down.'));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.error).toBeNull();
  });

  it('pages a group with Show more', async () => {
    const { spy } = stubFeed({ pageSize: 1 });
    const { result } = renderHook(() => useFeed(null));
    await waitFor(() => expect(result.current.data?.groups[3].next).toBe('week:1'));
    await act(() => result.current.showMore('week', 'week:1'));
    expect(result.current.data?.groups[3].items.map((i) => i.id)).toEqual([47, 43]);
    expect(result.current.paging.week).toBeUndefined();
    expect(calls(spy, 'GET', '/work/feed/')).toContain('/work/feed/?group=week&cursor=week%3A1');
  });

  it('retries a failed decide source on its own group, and a failed task source with a reload', async () => {
    const { spy } = stubFeed({ failKinds: { question: 1, task: 1 } });
    const { result } = renderHook(() => useFeed(null));
    await waitFor(() => expect(result.current.data?.failed).toEqual(['question', 'task', 'todo']));
    act(() => result.current.retry({ at: 'decide', kinds: ['question'], retry: 'decide' }));
    await waitFor(() => expect(result.current.data?.failed).toEqual(['task', 'todo']));
    expect(result.current.data?.groups[0].count).toBe(4);
    act(() => result.current.retry({ at: 'overdue', kinds: ['task', 'todo'], retry: 'all' }));
    await waitFor(() => expect(result.current.data?.failed).toEqual([]));
    expect(calls(spy, 'GET', '/work/feed/')).toEqual(['/work/feed/', '/work/feed/?group=decide', '/work/feed/']);
  });
});
```

`src/components/work/useFeedCount.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { calls } from '../../features/work/testWork';
import { stubFeed } from '../../features/work/testFeed';
import { feedChanged, taskChanged } from './taskChanges';
import { useFeedCount } from './useFeedCount';

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

describe('useFeedCount (Decision 12)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the badge on mount, after a task change and after a feed change', async () => {
    const { spy } = stubFeed();
    const { result } = renderHook(() => useFeedCount(1), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ decide: 4, overdue: 1, badge: 5, failed: [] }));
    act(() => taskChanged());
    act(() => feedChanged());
    await waitFor(() => expect(calls(spy, 'GET', '/work/feed/count/')).toHaveLength(3));
  });

  it('reads nothing without a user', () => {
    const { spy } = stubFeed();
    const { result } = renderHook(() => useFeedCount(null), { wrapper });
    expect(result.current).toBeNull();
    expect(calls(spy, 'GET', '/work/feed/count/')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/work/useFeed.test.tsx src/components/work/useFeedCount.test.tsx --maxWorkers=2`
Expected: FAIL (modules missing).

- [ ] **Step 3: Add the signal**

In `src/components/work/taskChanges.ts` add after `recommendationsChanged`:

```ts
const feed = new EventTarget();

/** Something on the desk was decided that is neither a task nor a
 *  recommendation (a rule review, a question): only the Work badge reads again. */
export function feedChanged(): void {
  feed.dispatchEvent(new Event('change'));
}
```

and at the end:

```ts
/** Runs the latest `onChange` after every `feedChanged()` while mounted. */
export function useFeedChanges(onChange: () => void): void {
  useEvent(feed, onChange);
}
```

In `src/components/work/useRefreshTick.ts`: import `useFeedChanges` and add `useFeedChanges(bump);` under `useRecommendationChanges(bump);`; update the doc comment to "every taskChanged(), recommendationsChanged() and feedChanged()".

- [ ] **Step 4: Write the hooks**

`src/components/work/useFeed.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { FEED, kindsOf, withGroup, withPage, type FailedSlot, type FeedChip } from '../../features/work/feed';
import { fetchFeed, fetchFeedGroup } from '../../features/work/workApi';
import type { FeedGroupKey, FeedPayload } from '../../features/work/workTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

type Loaded = { chip: FeedChip | null; payload: FeedPayload };
type Failure = { chip: FeedChip | null; message: string };

/** GET /work/feed/ for one chip (spec §5). A reload keeps the list on screen
 *  until the answer lands; another chip starts empty (its skeleton); an error
 *  shows only while there is no list. Show more appends a group's next page;
 *  Try again reads a failed group's first page, or the whole feed for the
 *  task source (Decision 4). */
export function useFeed(chip: FeedChip | null) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [paging, setPaging] = useState<Partial<Record<FeedGroupKey, 'busy' | string>>>({});

  useEffect(() => {
    let alive = true;
    fetchFeed(kindsOf(chip)).then(
      (payload) => {
        if (!alive) return;
        setLoaded({ chip, payload });
        setFailure(null);
        setPaging({});
      },
      (err: unknown) => {
        if (alive) setFailure({ chip, message: errorMessage(err, FEED.LOAD) });
      },
    );
    return () => {
      alive = false;
    };
  }, [chip, attempt]);

  const data = loaded && loaded.chip === chip ? loaded.payload : null;
  const error = !data && failure && failure.chip === chip ? failure.message : null;
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const update = useCallback((change: (feed: FeedPayload) => FeedPayload) => {
    setLoaded((current) => (current ? { ...current, payload: change(current.payload) } : current));
  }, []);

  const readGroup = useCallback(
    async (group: FeedGroupKey, cursor: string | null, retried: readonly FeedPayload['failed'][number][]) => {
      setPaging((current) => ({ ...current, [group]: 'busy' }));
      try {
        const answer = await fetchFeedGroup(group, kindsOf(chip), cursor);
        setLoaded((current) => {
          if (!current || current.chip !== chip) return current;
          const payload = cursor ? withPage(current.payload, answer.group) : withGroup(current.payload, answer.group, answer.failed, retried);
          return { ...current, payload };
        });
        setPaging((current) => {
          const next = { ...current };
          delete next[group];
          return next;
        });
      } catch (err) {
        setPaging((current) => ({ ...current, [group]: errorMessage(err, FEED.MORE_FAILED) }));
      }
    },
    [chip],
  );

  const showMore = useCallback((group: FeedGroupKey, cursor: string) => readGroup(group, cursor, []), [readGroup]);
  const retry = useCallback(
    (slot: FailedSlot) => {
      if (slot.retry === 'all') reload();
      else void readGroup(slot.retry, null, slot.kinds);
    },
    [readGroup, reload],
  );

  return { data, error, reload, update, showMore, retry, paging };
}
```

`src/components/work/useFeedCount.ts`:

```ts
import { useEffect, useState } from 'react';
import { fetchFeedCount } from '../../features/work/workApi';
import type { FeedCount } from '../../features/work/workTypes';
import { useRefreshTick } from './useRefreshTick';

type Answer = { userId: number; count: FeedCount };

/** The one Work badge (spec §5; Decision 12): GET /work/feed/count/, read on
 *  mount, for another user and on every refresh tick. A failed read keeps
 *  the last answer; null until the first. */
export function useFeedCount(userId: number | null): FeedCount | null {
  const tick = useRefreshTick();
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    if (userId === null) return;
    let alive = true;
    fetchFeedCount().then(
      (count) => {
        if (alive && typeof count?.badge === 'number') setAnswer({ userId, count });
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [userId, tick]);
  return answer !== null && answer.userId === userId ? answer.count : null;
}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `npx vitest run src/components/work/useFeed.test.tsx src/components/work/useFeedCount.test.tsx src/components/work/taskChanges.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/work/useFeed.ts src/components/work/useFeed.test.tsx src/components/work/useFeedCount.ts src/components/work/useFeedCount.test.tsx src/components/work/taskChanges.ts src/components/work/useRefreshTick.ts
git commit -m "feat(work): useFeed and useFeedCount over the feed routes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Row parts and the task/to-do row

**Files:**
- Create: `src/components/work/FeedRowParts.tsx`, `src/components/work/FeedTaskRow.tsx`
- Test: `src/components/work/FeedTaskRow.test.tsx`

**Interfaces:**
- Consumes: `FEED`, `dayText` (Task 2); `recordPath` (`../../features/brain/waitingText`); `PRIORITY_LABEL`, `doneLabel`, `sourceText` (`workText`); `useTaskLink`.
- Produces:
  - `FeedRowParts.tsx`: `KIND_ICON: Record<FeedKind, LucideIcon>`, `META_LINK` (class string), `FeedRowMeta({ item, group }: { item: FeedItem; group: FeedGroupKey })` (`<p data-part="meta">`).
  - `FeedTaskRow({ item, group, busy, error, onDone }: { item: TaskFeedItem; group: FeedGroupKey; busy: boolean; error: string | null; onDone: () => void })`: `<li data-item={item.key}>`; the circle button "Mark “<title>” done"; the title a link opening the task panel; "Only you" with a lock on a to-do.

- [ ] **Step 1: Write the failing test**

`src/components/work/FeedTaskRow.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { taskItem, TODO_ROOM } from '../../features/work/testFeedFixtures';
import { CALL_PIZZA, KICKOFF, SECURITY } from '../../features/work/testWorkFixtures';
import { stubFeed } from '../../features/work/testFeed';
import { renderPage, where } from '../../pages/work/testPages';
import { FeedTaskRow } from './FeedTaskRow';

describe('FeedTaskRow (spec §5 rows)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the record, the due date, Overdue, the priority, and opens the panel', async () => {
    stubFeed();
    const onDone = vi.fn();
    renderPage(<ul><FeedTaskRow item={taskItem(CALL_PIZZA)} group="overdue" busy={false} error={null} onDone={onDone} /></ul>, '/work/mine?kind=task');
    const row = screen.getByRole('listitem');
    expect(row.querySelector('[data-part="meta"]')).toHaveTextContent('Pizza Hut · Due 5 Oct 2026 · Overdue · High priority');
    expect(within(row).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    await userEvent.click(within(row).getByRole('button', { name: 'Mark “Call Pizza Hut” done' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    await userEvent.click(within(row).getByRole('link', { name: 'Call Pizza Hut' }));
    expect(where()).toBe('/work/mine?kind=task&task=41');
  });

  it('marks a to-do Only you, with no record and No date', () => {
    stubFeed();
    renderPage(<ul><FeedTaskRow item={taskItem(TODO_ROOM)} group="no_date" busy={false} error={null} onDone={() => undefined} /></ul>, '/work/mine');
    const meta = screen.getByRole('listitem').querySelector('[data-part="meta"]');
    expect(meta).toHaveTextContent('No date · Medium priority · Only you');
    expect(within(screen.getByRole('listitem')).queryByRole('link', { name: 'Pizza Hut' })).toBeNull();
  });

  it('says what a Blocked task waits on, names its plan, and shows a refusal', () => {
    stubFeed();
    renderPage(
      <ul>
        <FeedTaskRow item={taskItem(SECURITY)} group="blocked" busy error="Could not mark that done. Try again." onDone={() => undefined} />
        <FeedTaskRow item={taskItem(KICKOFF)} group="week" busy={false} error={null} onDone={() => undefined} />
      </ul>,
      '/work/mine',
    );
    const [blocked, plan] = screen.getAllByRole('listitem');
    expect(blocked).toHaveTextContent('Blocked: Waiting on legal');
    expect(within(blocked).getByRole('button', { name: /done$/ })).toBeDisabled();
    expect(within(blocked).getByRole('alert')).toHaveTextContent('Could not mark that done. Try again.');
    expect(plan.querySelector('[data-part="meta"]')).toHaveTextContent('From Onboarding · Pizza Hut');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/work/FeedTaskRow.test.tsx --maxWorkers=2`
Expected: FAIL (module missing).

- [ ] **Step 3: Write the parts and the row**

`src/components/work/FeedRowParts.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bot, CircleCheck, Lightbulb, ListChecks, Lock, Mail, MessageCircleQuestion, type LucideIcon } from 'lucide-react';
import { recordPath } from '../../features/brain/waitingText';
import { formatDate } from '../../features/customers/formatters';
import { FEED, dayText } from '../../features/work/feed';
import { PRIORITY_LABEL, sourceText } from '../../features/work/workText';
import type { FeedGroupKey, FeedItem, FeedKind } from '../../features/work/workTypes';
import { FOCUS, INLINE_TARGET, NUM, TYPE } from '../ui';

/** One icon per kind (spec §5: "an icon by kind"). */
export const KIND_ICON: Record<FeedKind, LucideIcon> = {
  approval: Bot,
  rule_review: ListChecks,
  question: MessageCircleQuestion,
  draft: Mail,
  task: CircleCheck,
  todo: CircleCheck,
  suggestion: Lightbulb,
};

export const META_LINK = `inline-flex items-center font-semibold text-ink-muted hover:text-ink hover:underline ${INLINE_TARGET} ${FOCUS}`;

/** The row's one meta line: the record, then the due line for a task (Due,
 *  Overdue, priority, in progress, where it came from) or who and when for
 *  everything else, then "Only you" on a to-do. */
export function FeedRowMeta({ item, group }: { item: FeedItem; group: FeedGroupKey }) {
  const parts: ReactNode[] = [];
  if (item.record) {
    parts.push(
      <Link key="record" to={recordPath(item.record)} className={META_LINK}>
        {item.record.name}
      </Link>,
    );
  }
  if (item.kind === 'task' || item.kind === 'todo') {
    parts.push(
      item.due_date ? (
        <span key="due">
          Due <span className={NUM}>{formatDate(item.due_date)}</span>
        </span>
      ) : (
        <span key="due">{FEED.NO_DATE}</span>
      ),
    );
    if (group === 'overdue') parts.push(<span key="late" className="font-semibold text-danger-ink">{FEED.OVERDUE}</span>);
    parts.push(<span key="priority">{PRIORITY_LABEL[item.detail.priority]} priority</span>);
    if (item.detail.status === 'in-progress') parts.push(<span key="progress">In progress</span>);
    const source = sourceText(item.detail);
    if (source) parts.push(<span key="source">{source}</span>);
  } else {
    parts.push(<span key="from">{item.from.label}</span>);
    parts.push(
      <span key="at" className={NUM}>
        {dayText(item.at)}
      </span>,
    );
  }
  if (item.private) {
    parts.push(
      <span key="private" data-part="private" className="inline-flex items-center gap-1">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        {FEED.ONLY_YOU}
      </span>,
    );
  }
  return (
    <p data-part="meta" className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${TYPE.meta}`}>
      {parts.flatMap((part, index) => (index === 0 ? [part] : [<span key={`dot-${index}`} aria-hidden="true"> · </span>, part]))}
    </p>
  );
}
```

(`META_LINK` is exported for the decide rows' reuse only through `FeedRowMeta`; the touch-target checker recognises a class constant only when it is defined in the same file, so each row file defines its own title constant.)

`src/components/work/FeedTaskRow.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { Circle } from 'lucide-react';
import { doneLabel } from '../../features/work/workText';
import type { FeedGroupKey, TaskFeedItem } from '../../features/work/workTypes';
import { FOCUS, ICON_BUTTON, TYPE } from '../ui';
import { FeedRowMeta } from './FeedRowParts';
import { useTaskLink } from './useTaskLink';

// As TaskRowItem's; defined here so the house rules' 44px check sees it.
const ROW_TITLE = `inline-flex min-h-11 max-w-full items-center self-start break-words text-left text-[13px] font-semibold text-ink hover:underline active:opacity-70 sm:min-h-0 ${FOCUS}`;

/** A task or a to-do on My work (spec §5): Done first, the title opens the
 *  task panel over this page, then the meta line, what a Blocked task waits
 *  on, and a Done refusal. Flat inside its group's list. */
export function FeedTaskRow({ item, group, busy, error, onDone }: { item: TaskFeedItem; group: FeedGroupKey; busy: boolean; error: string | null; onDone: () => void }) {
  const taskLink = useTaskLink();
  const row = item.detail;
  return (
    <li data-item={item.key} className="flex items-start gap-2 px-4 py-2">
      <button type="button" onClick={onDone} disabled={busy} aria-label={doneLabel(item.title)} className={ICON_BUTTON}>
        <Circle className="h-5 w-5" aria-hidden="true" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
        <Link {...taskLink(item.id)} className={ROW_TITLE}>
          {item.title}
        </Link>
        <FeedRowMeta item={item} group={group} />
        {row.status === 'blocked' ? (
          <p data-part="blocked" className={`max-w-[68ch] break-words ${TYPE.body}`}>
            <span className="font-semibold text-warning-ink">Blocked:</span> {row.blocked_reason}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-[11px] leading-4 text-danger-ink">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/work/FeedTaskRow.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/work/FeedRowParts.tsx src/components/work/FeedTaskRow.tsx src/components/work/FeedTaskRow.test.tsx
git commit -m "feat(work): feed row parts and the task and to-do row

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The decide rows (approval, rule review, question, draft)

**Files:**
- Create: `src/components/work/FeedDecideRows.tsx`
- Test: `src/components/work/FeedDecideRows.test.tsx`

**Interfaces:**
- Consumes: `AgentActionDecision`, `AgentActionBody` (`../agents/`), `ReviewDecision`, `REVIEW_DECIDED` (`../rules/ReviewDecision`), `reviewCountsText` (`waitingText`), `campaignPath` (`../../features/campaigns/campaignText`), `AGENTS` (`agentsText`), `FeedRowMeta`, `KIND_ICON` (Task 5), `FEED`, `answerHref`, `draftHref`, `approvedText` (Task 2), `feedChanged` (Task 4).
- Produces (each renders `<li data-item={key}>` holding an `<article>` named by its title):
  - `interface Settle { text: string; link?: { label: string; to: To; state?: unknown } }`
  - `ApprovalRow({ item, group, onApplied, onGone, onLost })`: `onApplied(item: ApprovalFeedItem, action: AgentAction, text: string)`, `onGone(item, text)`, `onLost(item, text)`.
  - `ReviewRow({ item, group, onSettled, onGone })`: `onSettled(item, settle: Settle)`.
  - `QuestionRow({ item, group })`, `DraftRow({ item, group })`.

- [ ] **Step 1: Write the failing test**

`src/components/work/FeedDecideRows.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { APPROVAL, DRAFT, QUESTION, REVIEW } from '../../features/work/testFeedFixtures';
import { sent } from '../../features/work/testWork';
import { stubFeed } from '../../features/work/testFeed';
import { renderPage } from '../../pages/work/testPages';
import { ApprovalRow, DraftRow, QuestionRow, ReviewRow } from './FeedDecideRows';

describe('decide rows (spec §5 rows)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('applies an agent action once and hands up the applied action', async () => {
    const { spy } = stubFeed();
    const onApplied = vi.fn();
    renderPage(<ul><ApprovalRow item={APPROVAL} group="decide" onApplied={onApplied} onGone={vi.fn()} onLost={vi.fn()} /></ul>, '/work/mine');
    const article = screen.getByRole('article', { name: 'Move Pizza Hut to Renewal' });
    expect(article.querySelector('[data-part="meta"]')).toHaveTextContent('Pizza Hut · CS agent · 6 Oct 2026');
    expect(article.querySelector('[data-part="preview"]')).toHaveTextContent('Lifecycle stage');
    await userEvent.dblClick(within(article).getByRole('button', { name: 'Apply' }));
    await vi.waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(onApplied.mock.calls[0][1]).toMatchObject({ id: 81, status: 'applied', undo: { allowed: true } });
    expect(onApplied.mock.calls[0][2]).toBe('Applied: Move Pizza Hut to Renewal.');
    expect(sent(spy, 'POST', '/agents/actions/81/approve/')).toEqual([{}]);
  });

  it('gives an approval up in the server words on 409, and as lost on 404', async () => {
    stubFeed({ refuseNextAction: { status: 409, body: { code: 'ALREADY_DECIDED', detail: 'Mona Manager already applied this.' } } });
    const onGone = vi.fn();
    const onLost = vi.fn();
    renderPage(<ul><ApprovalRow item={APPROVAL} group="decide" onApplied={vi.fn()} onGone={onGone} onLost={onLost} /></ul>, '/work/mine');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await vi.waitFor(() => expect(onGone).toHaveBeenCalledWith(APPROVAL, 'Mona Manager already applied this.'));
    vi.unstubAllGlobals();
    stubFeed({ decide: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await vi.waitFor(() => expect(onLost).toHaveBeenCalledWith(APPROVAL, "That action isn't there any more."));
  });

  it('shows a read-only approval without buttons', () => {
    stubFeed();
    renderPage(<ul><ApprovalRow item={{ ...APPROVAL, actions: [] }} group="decide" onApplied={vi.fn()} onGone={vi.fn()} onLost={vi.fn()} /></ul>, '/work/mine');
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
    expect(screen.getByText("You can't decide this one.")).toBeInTheDocument();
  });

  it('approves a rule review and links its survey, or skips it', async () => {
    stubFeed();
    const onSettled = vi.fn();
    const onGone = vi.fn();
    renderPage(<ul><ReviewRow item={REVIEW} group="decide" onSettled={onSettled} onGone={onGone} /></ul>, '/work/mine');
    const article = screen.getByRole('article', { name: 'Survey from Detractor follow-up' });
    expect(article.querySelector('[data-part="counts"]')).toHaveTextContent('12 people across 3 records');
    await userEvent.click(within(article).getByRole('button', { name: 'Approve' }));
    await vi.waitFor(() =>
      expect(onSettled).toHaveBeenCalledWith(REVIEW, { text: 'Approved: Survey from Detractor follow-up.', link: { label: 'Open survey', to: '/surveys/31' } }),
    );
  });

  it('answers a question on its organisation and opens a draft in Communications', () => {
    stubFeed();
    renderPage(<ul><QuestionRow item={QUESTION} group="decide" /><DraftRow item={DRAFT} group="decide" /></ul>, '/work/mine');
    const question = screen.getByRole('article', { name: 'Who signs off renewals at Uber?' });
    expect(question).toHaveTextContent('Legal asked twice.');
    expect(within(question).getByRole('link', { name: 'Answer' })).toHaveAttribute('href', '/organizations/3?tab=knowledge');
    const draft = screen.getByRole('article', { name: 'Re: renewal terms' });
    expect(draft).toHaveTextContent('Email reply');
    expect(within(draft).getByRole('link', { name: 'Open draft' })).toHaveAttribute('href', '/communications?draft=7');
  });
});
```

(The review counts sentence comes from `reviewCountsText`; if its words differ from "12 people across 3 records", copy the sentence `reviewCountsText(MY_RULE_REVIEW.detail)` returns into the assertion.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/work/FeedDecideRows.test.tsx --maxWorkers=2`
Expected: FAIL (module missing).

- [ ] **Step 3: Write the rows**

`src/components/work/FeedDecideRows.tsx`:

```tsx
import { useId, type ReactNode } from 'react';
import { Link, type To } from 'react-router-dom';
import { AGENTS } from '../../features/agents/agentsText';
import type { AgentAction } from '../../features/agents/agentTypes';
import { reviewCountsText } from '../../features/brain/waitingText';
import { campaignPath } from '../../features/campaigns/campaignText';
import { FEED, answerHref, approvedText, draftHref } from '../../features/work/feed';
import type { ApprovalFeedItem, DraftFeedItem, FeedGroupKey, FeedItem, QuestionFeedItem, ReviewFeedItem } from '../../features/work/workTypes';
import type { ApproveAnswer } from '../../features/rules/ruleTypes';
import { AgentActionBody } from '../agents/AgentActionBody';
import { AgentActionDecision } from '../agents/AgentActionDecision';
import { ReviewDecision } from '../rules/ReviewDecision';
import { BUTTON, NUM, TYPE } from '../ui';
import { FeedRowMeta, KIND_ICON } from './FeedRowParts';
import { feedChanged } from './taskChanges';

/** What a decided row hands up for the toast. */
export interface Settle {
  text: string;
  link?: { label: string; to: To; state?: unknown };
}

/** Every decide row's frame: the kind's icon, then an article named by its
 *  title, the meta line and the row's own body. Flat inside the list. */
function DecideShell({ item, group, children }: { item: FeedItem; group: FeedGroupKey; children: ReactNode }) {
  const titleId = useId();
  const Icon = KIND_ICON[item.kind];
  return (
    <li data-item={item.key} className="flex items-start gap-3 px-4 py-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <article aria-labelledby={titleId} className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 id={titleId} className={`${TYPE.body} break-words font-semibold`}>
          {item.title}
        </h3>
        <FeedRowMeta item={item} group={group} />
        {children}
      </article>
    </li>
  );
}

/** An agent action (spec §5): the proposal in words, then Apply or Reject
 *  (AgentActionDecision, unchanged). A 404 or a CANT_DECIDE means the
 *  reader lost it (Decision 6); a 409 or an expiry, someone decided first. */
export function ApprovalRow({
  item,
  group,
  onApplied,
  onGone,
  onLost,
}: {
  item: ApprovalFeedItem;
  group: FeedGroupKey;
  onApplied: (item: ApprovalFeedItem, action: AgentAction, text: string) => void;
  onGone: (item: FeedItem, text: string) => void;
  onLost: (item: FeedItem, text: string) => void;
}) {
  const detail = item.detail;
  return (
    <DecideShell item={item} group={group}>
      <AgentActionBody action={detail} />
      {detail.session ? <p className={TYPE.meta}>From {detail.session.title}</p> : null}
      {item.actions.length > 0 ? (
        <AgentActionDecision
          action={detail}
          onSettled={(answer, text) => onApplied(item, answer, text)}
          onGone={(text) => (text === AGENTS.GONE ? onLost(item, text) : onGone(item, text))}
          onRefused={() => onLost(item, FEED.CANT_DECIDE)}
        />
      ) : (
        <p className={TYPE.bodyMuted}>{FEED.READ_ONLY}</p>
      )}
    </DecideShell>
  );
}

/** `reviewCountsText` with each figure in its own tabular span. */
function Counts({ detail }: { detail: ReviewFeedItem['detail'] }) {
  return (
    <>
      {reviewCountsText(detail)
        .split(/(\d+)/)
        .map((part, index) => (/^\d+$/.test(part) ? <span key={index} className={NUM}>{part}</span> : part))}
    </>
  );
}

/** A rule's review (spec §5): its counts, then Approve or Skip
 *  (ReviewDecision, unchanged). Approving stays here and links the send
 *  (Decision 8). */
export function ReviewRow({
  item,
  group,
  onSettled,
  onGone,
}: {
  item: ReviewFeedItem;
  group: FeedGroupKey;
  onSettled: (item: FeedItem, settle: Settle) => void;
  onGone: (item: FeedItem, text: string) => void;
}) {
  const d = item.detail;
  const approved = (answer: ApproveAnswer) => {
    feedChanged();
    if ('campaign_send_id' in answer) {
      const campaign = d.review && 'campaign' in d.review ? d.review.campaign : null;
      onSettled(item, { text: approvedText(item.title), link: { label: FEED.OPEN_CAMPAIGN, to: campaign ? campaignPath(campaign.id, answer.campaign_send_id) : '/campaigns' } });
    } else {
      onSettled(item, { text: approvedText(item.title), link: { label: FEED.OPEN_SURVEY, to: `/surveys/${answer.survey_send_id}` } });
    }
  };
  return (
    <DecideShell item={item} group={group}>
      <p data-part="counts" className={TYPE.body}>
        <Counts detail={d} />
      </p>
      {item.actions.length > 0 ? (
        <ReviewDecision
          reviewId={item.id}
          kind={d.review_kind}
          ruleName={d.rule_name}
          runOn={d.review?.run_on}
          storedRefusal={d.review?.result?.error}
          onApproved={approved}
          onGone={(message) => {
            feedChanged();
            onGone(item, message);
          }}
        />
      ) : (
        <p className={TYPE.bodyMuted}>{FEED.READ_ONLY}</p>
      )}
    </DecideShell>
  );
}

/** A question for the reader: its full text when the title cut it, and Answer where it is answered today. */
export function QuestionRow({ item, group }: { item: QuestionFeedItem; group: FeedGroupKey }) {
  return (
    <DecideShell item={item} group={group}>
      {item.detail.text !== item.title ? <p className={`max-w-[68ch] break-words ${TYPE.bodyMuted}`}>{item.detail.text}</p> : null}
      {item.actions.includes('answer') ? (
        <Link to={answerHref(item)} className={`${BUTTON} self-start`}>
          {FEED.ANSWER}
        </Link>
      ) : null}
    </DecideShell>
  );
}

/** A reply the agent drafted for the reader: Open draft in Communications. */
export function DraftRow({ item, group }: { item: DraftFeedItem; group: FeedGroupKey }) {
  return (
    <DecideShell item={item} group={group}>
      <p className={TYPE.bodyMuted}>{item.detail.channel === 'email' ? FEED.EMAIL_REPLY : FEED.TICKET_REPLY}</p>
      <Link to={draftHref(item)} className={`${BUTTON} self-start`}>
        {FEED.OPEN_DRAFT}
      </Link>
    </DecideShell>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/work/FeedDecideRows.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/work/FeedDecideRows.tsx src/components/work/FeedDecideRows.test.tsx
git commit -m "feat(work): approval, rule review, question and draft rows on the feed

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The suggestion row and the row dispatcher

**Files:**
- Create: `src/components/work/FeedSuggestionRow.tsx`, `src/components/work/FeedRow.tsx`
- Test: `src/components/work/FeedRow.test.tsx`

**Interfaces:**
- Consumes: `AssignForm`, `DismissForm` (unchanged), `assignRecommendation` (`workApi`), `REC`, `cantDecide`, `decidedElsewhere`, `recKindText`, `suggestedText`, `assignedStatus`, `dismissedStatus` (`recommended.ts`), `Figured` (`../brain/Figured`), `OverflowMenu`, `useSubmitOnce`, `useTaskLink`, `addedToMineText`, `FEED` (Task 2), Tasks 5 and 6.
- Produces:
  - `FeedSuggestionRow({ item, group, isSm, me, onSettled, onGone, onLost })` with `onSettled(item, settle: Settle)`.
  - `interface FeedRowProps { item: FeedItem; group: FeedGroupKey; isSm: boolean; me: number | null; busy: boolean; error: string | null; onDone(item: TaskFeedItem): void; onSettled(item: FeedItem, settle: Settle): void; onApplied(item: ApprovalFeedItem, action: AgentAction, text: string): void; onGone(item: FeedItem, text: string): void; onLost(item: FeedItem, text: string): void }` and `FeedRow(props: FeedRowProps)`.

- [ ] **Step 1: Write the failing test**

`src/components/work/FeedRow.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { suggestionItem, taskItem } from '../../features/work/testFeedFixtures';
import { CALL_PIZZA, REC_RENEWAL, REC_TICKETS } from '../../features/work/testWorkFixtures';
import { sent } from '../../features/work/testWork';
import { stubFeed } from '../../features/work/testFeed';
import { renderPage } from '../../pages/work/testPages';
import { FeedRow, type FeedRowProps } from './FeedRow';

const handlers = () => ({ onDone: vi.fn(), onSettled: vi.fn(), onApplied: vi.fn(), onGone: vi.fn(), onLost: vi.fn() });
const props = (over: Partial<FeedRowProps>): FeedRowProps => ({
  item: suggestionItem(REC_RENEWAL), group: 'suggested', isSm: true, me: 1, busy: false, error: null, ...handlers(), ...over,
});

describe('FeedRow and the suggestion row (spec §5 rows)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('routes a task to the task row', () => {
    stubFeed();
    renderPage(<ul><FeedRow {...props({ item: taskItem(CALL_PIZZA), group: 'overdue' })} /></ul>, '/work/mine');
    expect(screen.getByRole('button', { name: 'Mark “Call Pizza Hut” done' })).toBeInTheDocument();
  });

  it('adds a suggestion to my work in one click, as a task for me', async () => {
    const { spy } = stubFeed();
    const p = props({});
    renderPage(<ul><FeedRow {...p} /></ul>, '/work/mine');
    const article = screen.getByRole('article', { name: "Prepare Pizza Hut's renewal" });
    expect(article.querySelector('[data-part="meta"]')).toHaveTextContent('Pizza Hut · Revenact');
    expect(within(article).getByText('Renews in 9 days')).toBeInTheDocument();
    await userEvent.dblClick(within(article).getByRole('button', { name: 'Add to my work' }));
    await vi.waitFor(() => expect(p.onSettled).toHaveBeenCalledTimes(1));
    expect(p.onSettled.mock.calls[0][1].text).toBe("Added to your work: Prepare Pizza Hut's renewal.");
    expect(p.onSettled.mock.calls[0][1].link.label).toBe('Open task');
    expect(sent(spy, 'POST', '/work/recommendations/5/assign/')).toEqual([{ assignee_id: 1 }]);
  });

  it('assigns or dismisses with the existing forms, all three buttons from sm', async () => {
    const { spy } = stubFeed();
    const p = props({ item: suggestionItem(REC_TICKETS) });
    renderPage(<ul><FeedRow {...p} /></ul>, '/work/mine');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await userEvent.selectOptions(screen.getByLabelText('Reason'), 'not_relevant');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss it' }));
    await vi.waitFor(() => expect(p.onSettled).toHaveBeenCalledWith(p.item, { text: "Dismissed: Get Uber EMEA's urgent tickets moving." }));
    expect(sent(spy, 'POST', '/dismiss/')).toEqual([{ reason: 'not_relevant' }]);
  });

  it('on a phone keeps Add to my work and folds Assign and Dismiss into the row menu', async () => {
    stubFeed();
    renderPage(<ul><FeedRow {...props({ isSm: false })} /></ul>, '/work/mine', { width: 375 });
    expect(screen.getByRole('button', { name: 'Add to my work' })).toHaveClass('min-h-11');
    expect(screen.queryByRole('button', { name: 'Assign' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Assign' }));
    expect(await screen.findByLabelText('Who does it')).toBeInTheDocument();
  });

  it('a suggestion decided elsewhere leaves in the server words; one gone is lost', async () => {
    stubFeed({ refuseNextDecision: { status: 409, body: { code: 'ALREADY_DECIDED', detail: 'Mona Manager already assigned this.' } } });
    const p = props({});
    renderPage(<ul><FeedRow {...p} /></ul>, '/work/mine');
    await userEvent.click(screen.getByRole('button', { name: 'Add to my work' }));
    await vi.waitFor(() => expect(p.onGone).toHaveBeenCalledWith(p.item, 'Mona Manager already assigned this.'));
    vi.unstubAllGlobals();
    stubFeed({ recommendations: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Add to my work' }));
    await vi.waitFor(() => expect(p.onLost).toHaveBeenCalledWith(p.item, "This recommendation isn't there any more."));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/work/FeedRow.test.tsx --maxWorkers=2`
Expected: FAIL (module missing).

- [ ] **Step 3: Write the suggestion row**

`src/components/work/FeedSuggestionRow.tsx`:

```tsx
import { useId, useRef, useState } from 'react';
import { FEED, addedToMineText } from '../../features/work/feed';
import { REC, assignedStatus, cantDecide, decidedElsewhere, dismissedStatus } from '../../features/work/recommended';
import { assignRecommendation } from '../../features/work/workApi';
import type { FeedGroupKey, FeedItem, SuggestionFeedItem } from '../../features/work/workTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { Figured } from '../brain/Figured';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { BUTTON, OverflowMenu, QUIET, TYPE } from '../ui';
import { AssignForm } from './AssignForm';
import { DismissForm } from './DismissForm';
import type { Settle } from './FeedDecideRows';
import { FeedRowMeta, KIND_ICON } from './FeedRowParts';
import { useTaskLink } from './useTaskLink';

type Mode = 'idle' | 'assign' | 'dismiss';

/** A suggestion (spec §5): its facts, then Add to my work (a task for the
 *  reader, contract: assign to self), Assign and Dismiss (the existing
 *  forms). On a phone Assign and Dismiss move into the row menu. A 404 or
 *  CANT_DECIDE is lost access (Decision 6); a 409 says who decided. */
export function FeedSuggestionRow({
  item,
  group,
  isSm,
  me,
  onSettled,
  onGone,
  onLost,
}: {
  item: SuggestionFeedItem;
  group: FeedGroupKey;
  isSm: boolean;
  me: number | null;
  onSettled: (item: FeedItem, settle: Settle) => void;
  onGone: (item: FeedItem, text: string) => void;
  onLost: (item: FeedItem, text: string) => void;
}) {
  const titleId = useId();
  const formId = useId();
  const addRef = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useSubmitOnce({ holdOnSuccess: true });
  const taskLink = useTaskLink();
  const rec = item.detail;
  const record = rec.record;
  const assignable = record !== null && rec.defaults !== null;
  const gone = (text: string) => (text === REC.GONE ? onLost(item, text) : onGone(item, text));
  const Icon = KIND_ICON.suggestion;

  async function add() {
    if (me === null) return;
    setError(null);
    const outcome = await run(() => assignRecommendation(rec.id, { assignee_id: me }));
    if (!outcome) return;
    if (outcome.ok) {
      const task = outcome.value.task;
      onSettled(item, { text: addedToMineText(task.title), link: { label: FEED.OPEN_TASK, ...taskLink(task.id) } });
      return;
    }
    const elsewhere = decidedElsewhere(outcome.error);
    if (elsewhere) gone(elsewhere);
    else if (cantDecide(outcome.error)) onLost(item, FEED.CANT_DECIDE);
    else setError(errorMessage(outcome.error, REC.ASSIGN_FAILED));
  }

  const toggle = (next: Mode) => setMode((current) => (current === next ? 'idle' : next));
  return (
    <li data-item={item.key} className="flex items-start gap-3 px-4 py-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <article aria-labelledby={titleId} className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 id={titleId} className={`${TYPE.body} break-words font-semibold`}>
          {item.title}
        </h3>
        <FeedRowMeta item={item} group={group} />
        {rec.why.facts.length > 0 ? (
          <ul aria-label={REC.WHY} className={`flex max-w-[68ch] list-disc flex-col gap-0.5 pl-5 ${TYPE.body}`}>
            {rec.why.facts.map((fact, index) => (
              <li key={index}>
                <Figured text={fact} />
              </li>
            ))}
          </ul>
        ) : null}
        {error ? (
          <p role="alert" className="text-[13px] leading-5 text-danger-ink">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {assignable ? (
            <button ref={addRef} type="button" disabled={busy} onClick={() => void add()} aria-describedby={titleId} className={BUTTON}>
              {FEED.ADD_TO_MINE}
            </button>
          ) : null}
          {isSm ? (
            <>
              {assignable ? (
                <button type="button" aria-expanded={mode === 'assign'} aria-controls={mode === 'assign' ? formId : undefined} onClick={() => toggle('assign')} className={QUIET}>
                  {FEED.ASSIGN}
                </button>
              ) : null}
              <button type="button" aria-expanded={mode === 'dismiss'} aria-controls={mode === 'dismiss' ? formId : undefined} onClick={() => toggle('dismiss')} className={QUIET}>
                {FEED.DISMISS}
              </button>
            </>
          ) : (
            <OverflowMenu
              label={FEED.ROW_ACTIONS}
              items={[
                ...(assignable ? [{ key: 'assign', label: FEED.ASSIGN, onSelect: () => setMode('assign') }] : []),
                { key: 'dismiss', label: FEED.DISMISS, onSelect: () => setMode('dismiss') },
              ]}
            />
          )}
        </div>
        {mode === 'assign' && assignable && record ? (
          <div id={formId}>
            <AssignForm
              rec={{ ...rec, record }}
              onAssigned={(answer) => onSettled(item, { text: assignedStatus(answer.task.title, answer.task.assignee, me), link: { label: FEED.OPEN_TASK, ...taskLink(answer.task.id) } })}
              onGone={gone}
              onRefused={() => onLost(item, FEED.CANT_DECIDE)}
              onCancel={() => {
                setMode('idle');
                addRef.current?.focus();
              }}
            />
          </div>
        ) : null}
        {mode === 'dismiss' ? (
          <div id={formId}>
            <DismissForm
              rec={rec}
              onDismissed={() => onSettled(item, { text: dismissedStatus(rec.title) })}
              onGone={gone}
              onRefused={() => onLost(item, FEED.CANT_DECIDE)}
              onCancel={() => {
                setMode('idle');
                addRef.current?.focus();
              }}
            />
          </div>
        ) : null}
      </article>
    </li>
  );
}
```

(`taskLink(id)` returns `{ to, state }`; spreading it into `link` gives `{ label, to, state }`. The row's meta shows "Revenact" from `from.label`; the recommendation's kind is in its title already.)

- [ ] **Step 4: Write the dispatcher**

`src/components/work/FeedRow.tsx`:

```tsx
import type { AgentAction } from '../../features/agents/agentTypes';
import type { ApprovalFeedItem, FeedGroupKey, FeedItem, TaskFeedItem } from '../../features/work/workTypes';
import { ApprovalRow, DraftRow, QuestionRow, ReviewRow, type Settle } from './FeedDecideRows';
import { FeedSuggestionRow } from './FeedSuggestionRow';
import { FeedTaskRow } from './FeedTaskRow';

export interface FeedRowProps {
  item: FeedItem;
  group: FeedGroupKey;
  isSm: boolean;
  me: number | null;
  /** A task's Done is being sent. */
  busy: boolean;
  /** A task's Done refusal. */
  error: string | null;
  onDone: (item: TaskFeedItem) => void;
  /** Decided here: the row leaves with this toast. */
  onSettled: (item: FeedItem, settle: Settle) => void;
  onApplied: (item: ApprovalFeedItem, action: AgentAction, text: string) => void;
  /** Decided elsewhere or expired: the row leaves saying so. */
  onGone: (item: FeedItem, text: string) => void;
  /** 404 or 403: the row leaves and `hidden` grows (Decision 6). */
  onLost: (item: FeedItem, text: string) => void;
}

/** One feed item, by kind (spec §5 rows). */
export function FeedRow({ item, group, isSm, me, busy, error, onDone, onSettled, onApplied, onGone, onLost }: FeedRowProps) {
  switch (item.kind) {
    case 'task':
    case 'todo':
      return <FeedTaskRow item={item} group={group} busy={busy} error={error} onDone={() => onDone(item)} />;
    case 'approval':
      return <ApprovalRow item={item} group={group} onApplied={onApplied} onGone={onGone} onLost={onLost} />;
    case 'rule_review':
      return <ReviewRow item={item} group={group} onSettled={onSettled} onGone={onGone} />;
    case 'question':
      return <QuestionRow item={item} group={group} />;
    case 'draft':
      return <DraftRow item={item} group={group} />;
    case 'suggestion':
      return <FeedSuggestionRow item={item} group={group} isSm={isSm} me={me} onSettled={onSettled} onGone={onGone} onLost={onLost} />;
  }
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/components/work/FeedRow.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/work/FeedSuggestionRow.tsx src/components/work/FeedRow.tsx src/components/work/FeedRow.test.tsx
git commit -m "feat(work): suggestion row with Add to my work, and the feed row dispatcher

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Quick-add

**Files:**
- Create: `src/components/work/QuickAdd.tsx`
- Test: `src/components/work/QuickAdd.test.tsx`

**Interfaces:**
- Consumes: `createTodo`, `readRefusal`, `NO_REFUSAL` (Task 1); `FEED`, `todoBody`, `todoErrors`, `TodoForm` (Task 2); `RecordStep` (`../plans/RecordStep`), `AssigneeSelect`, `useAssignees`, `assigneeOptions`, `useSubmitOnce`; `Card`, `PRIMARY`, `QUIET`, `INPUT`, `TYPE` (`../ui`), `FILTER_SELECT` (`../organizations/portfolio/filterParts`).
- Produces: `QuickAdd({ onAdded }: { onAdded: (answer: TodoAnswer) => void })`. A `<form aria-label="Quick add">` with the labelled input "Add a to-do", Add (the page's one `PRIMARY`), More (`aria-expanded`) opening record, due date, priority, and "Who does it" (only once a record is picked).

- [ ] **Step 1: Write the failing test**

`src/components/work/QuickAdd.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { calls, sent } from '../../features/work/testWork';
import { stubFeed } from '../../features/work/testFeed';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { renderPage } from '../../pages/work/testPages';
import { QuickAdd } from './QuickAdd';

describe('QuickAdd (spec §5, §6)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetMembersCache();
  });

  it('adds a plain to-do on Enter, clears the box and keeps focus there', async () => {
    const { spy } = stubFeed();
    const onAdded = vi.fn();
    renderPage(<QuickAdd onAdded={onAdded} />, '/work/mine');
    const box = screen.getByLabelText('Add a to-do');
    await userEvent.type(box, 'Call the florist{Enter}');
    await vi.waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(onAdded.mock.calls[0][0]).toMatchObject({ group: 'no_date', item: { kind: 'todo', title: 'Call the florist' } });
    expect(sent(spy, 'POST', '/work/todos/')).toEqual([{ title: 'Call the florist', priority: 'medium', due_date: null }]);
    expect(box).toHaveValue('');
    expect(box).toHaveFocus();
  });

  it('offers who does it only once a record is picked, and sends the record task', async () => {
    const { spy } = stubFeed();
    const onAdded = vi.fn();
    renderPage(<QuickAdd onAdded={onAdded} />, '/work/mine');
    await userEvent.type(screen.getByLabelText('Add a to-do'), 'Call Ann');
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByLabelText('Who does it')).toBeNull();
    await userEvent.type(screen.getByLabelText('Organisation or account'), 'Pizza');
    await userEvent.click(await screen.findByRole('button', { name: 'Pizza Hut' }));
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-09' } });
    await screen.findByRole('option', { name: 'Carl CSM' });
    await userEvent.selectOptions(screen.getByLabelText('Who does it'), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await vi.waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(sent(spy, 'POST', '/work/todos/')).toEqual([{ title: 'Call Ann', priority: 'medium', due_date: '2026-10-09', customer_id: 7, assignee_id: 3 }]);
    expect(onAdded.mock.calls[0][0]).toMatchObject({ item: null, group: null });
  });

  it('refuses a record without a date here, and a blank title, before sending', async () => {
    const { spy } = stubFeed();
    renderPage(<QuickAdd onAdded={vi.fn()} />, '/work/mine');
    await userEvent.type(screen.getByLabelText('Add a to-do'), '   {Enter}');
    expect(await screen.findByText('Give the task a title.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Add a to-do'), 'Call Ann');
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.type(screen.getByLabelText('Organisation or account'), 'Pizza');
    await userEvent.click(await screen.findByRole('button', { name: 'Pizza Hut' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Choose a date.')).toBeInTheDocument();
    expect(calls(spy, 'POST', '/work/todos/')).toEqual([]);
  });

  it('keeps the text and shows the server refusal under its field, focus kept', async () => {
    stubFeed({ refuseNextTodo: { status: 400, body: { title: ['Keep the title under 255 characters.'] } } });
    renderPage(<QuickAdd onAdded={vi.fn()} />, '/work/mine');
    const box = screen.getByLabelText('Add a to-do');
    await userEvent.type(box, 'Too long{Enter}');
    expect(await screen.findByText('Keep the title under 255 characters.')).toBeInTheDocument();
    expect(box).toHaveValue('Too long');
    expect(box).toHaveFocus();
    expect(box).toHaveAttribute('aria-invalid', 'true');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/work/QuickAdd.test.tsx --maxWorkers=2`
Expected: FAIL (module missing).

- [ ] **Step 3: Write the form**

`src/components/work/QuickAdd.tsx`:

```tsx
import { useId, useRef, useState, type FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { assigneeOptions } from '../../features/work/assignees';
import { FEED, todoBody, todoErrors, type TodoForm } from '../../features/work/feed';
import type { RecordRef } from '../../features/plans/planTypes';
import { NO_REFUSAL, createTodo, readRefusal, type Refusal } from '../../features/work/workApi';
import { PRIORITY_LABEL } from '../../features/work/workText';
import { PRIORITIES, type TaskPriority, type TodoAnswer } from '../../features/work/workTypes';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';
import { RecordStep } from '../plans/RecordStep';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { Field } from '../rules/Field';
import { Card, INPUT, PRIMARY, QUIET, TYPE } from '../ui';
import { AssigneeSelect } from './AssigneeSelect';
import { useAssignees } from './useAssignees';

const CHOICE_SELECT = `${FILTER_SELECT} w-full`;
const BLANK: TodoForm = { title: '', record: null, due: '', priority: 'medium', assignee: null };
const parentOf = (record: RecordRef) => ({ kind: record.kind === 'organization' ? ('customer' as const) : ('account' as const), id: record.id });

/** Quick-add (spec §5, §6): type a title, Enter adds a private to-do with no
 *  date. More gives a record, a due date, a priority and, once a record is
 *  picked, who does it. Sent once. A refusal keeps the text, shows under its
 *  field and leaves focus where it was; a success clears the form and focus
 *  stays in the box. */
export function QuickAdd({ onAdded }: { onAdded: (answer: TodoAnswer) => void }) {
  const ids = useId();
  const boxRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<TodoForm>(BLANK);
  const [more, setMore] = useState(false);
  const [local, setLocal] = useState<Partial<Record<'title' | 'due_date', string>>>({});
  const [refusal, setRefusal] = useState<Refusal>(NO_REFUSAL);
  const { busy, run } = useSubmitOnce();
  const assignees = useAssignees(form.record ? parentOf(form.record) : null);
  const set = <K extends keyof TodoForm>(key: K, value: TodoForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const errors = todoErrors(form);
    setLocal(errors);
    setRefusal(NO_REFUSAL);
    if (Object.keys(errors).length > 0) {
      if (errors.due_date) setMore(true);
      return;
    }
    const outcome = await run(() => createTodo(todoBody(form)));
    if (!outcome) return;
    if (outcome.ok) {
      setForm(BLANK);
      boxRef.current?.focus();
      onAdded(outcome.value);
      return;
    }
    const read = readRefusal(outcome.error, FEED.ADD_FAILED);
    setRefusal(read);
    if (read.field.due_date || read.field.record || read.field.customer_id || read.field.account_id || read.field.assignee || read.field.assignee_id) setMore(true);
  }

  const titleError = local.title ?? refusal.field.title ?? refusal.form ?? undefined;
  const dueError = local.due_date ?? refusal.field.due_date;
  const recordError = refusal.field.record ?? refusal.field.customer_id ?? refusal.field.account_id;
  const assigneeError = refusal.field.assignee ?? refusal.field.assignee_id;
  return (
    <Card>
      <form noValidate aria-label={FEED.QUICK_ADD_FORM} onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <Field id={`${ids}-title`} label={FEED.QUICK_ADD} error={titleError}>
          {(aria) => (
            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <input
                ref={boxRef}
                id={`${ids}-title`}
                {...aria}
                value={form.title}
                maxLength={255}
                autoComplete="off"
                onChange={(event) => set('title', event.target.value)}
                className={`${INPUT} min-w-0 flex-1 ${titleError ? 'border-danger' : ''}`}
              />
              <button type="submit" disabled={busy} className={PRIMARY}>
                {busy ? FEED.ADDING : FEED.ADD}
              </button>
              <button type="button" aria-expanded={more} aria-controls={`${ids}-more`} onClick={() => setMore((open) => !open)} className={QUIET}>
                {FEED.MORE}
                <ChevronDown className={`h-4 w-4 ${more ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
            </div>
          )}
        </Field>
        {more ? (
          <div id={`${ids}-more`} className="flex flex-col gap-3 border-t border-line-subtle pt-3">
            <RecordStep
              heading={FEED.RECORD}
              record={form.record}
              locked={false}
              loading={false}
              error={recordError}
              onPick={(record) => setForm((current) => ({ ...current, record, assignee: null }))}
              onClear={() => setForm((current) => ({ ...current, record: null, assignee: null }))}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field id={`${ids}-due`} label={FEED.DUE} error={dueError}>
                {(aria) => (
                  <input id={`${ids}-due`} {...aria} type="date" value={form.due} onChange={(event) => set('due', event.target.value)} className={`${INPUT} tabular-nums ${dueError ? 'border-danger' : ''}`} />
                )}
              </Field>
              <Field id={`${ids}-priority`} label={FEED.PRIORITY}>
                {(aria) => (
                  <select id={`${ids}-priority`} {...aria} value={form.priority} onChange={(event) => set('priority', event.target.value as TaskPriority)} className={CHOICE_SELECT}>
                    {PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {PRIORITY_LABEL[priority]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              {form.record ? (
                <Field id={`${ids}-who`} label={FEED.ASSIGNEE} error={assigneeError}>
                  {(aria) => (
                    <AssigneeSelect
                      id={`${ids}-who`}
                      aria={aria}
                      value={form.assignee}
                      options={assigneeOptions(assignees.people ?? [], parentOf(form.record as RecordRef).kind)}
                      onChange={(next) => set('assignee', next)}
                      meOption
                      size="form"
                    />
                  )}
                </Field>
              ) : null}
            </div>
            <p className={TYPE.meta}>Without a record, only you see it. With one, it is a normal task on that record.</p>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
```

(`AssigneeSelect`'s `meOption` answers `null` for "Assign to me", which `todoBody` leaves out; the people list keeps the reader too, which is harmless: choosing yourself by name sends your own id.)

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/work/QuickAdd.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/work/QuickAdd.tsx src/components/work/QuickAdd.test.tsx
git commit -m "feat(work): quick-add box for to-dos and record tasks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The task panel for to-dos

**Files:**
- Create: `src/components/work/RecordEditor.tsx`
- Modify: `src/components/work/TaskFields.tsx`, `src/features/work/workText.ts`
- Test: `src/components/work/TaskFields.test.tsx` (append), `src/features/work/workText.test.ts` (append)

**Interfaces:**
- Consumes: Task 1 types and `WORK` words; `RecordStep`; `isDueDate`; `Field`; `TaskPatch`.
- Produces: `RecordEditor({ task, busy, refusal, save }: { task: TaskDetail; busy: boolean; refusal: Refusal; save: (patch: TaskPatch) => Promise<boolean> })`; `eventSentence` reads `{field: 'record', to: {name}}` as "You attached it to Pizza Hut."; `WORK.ATTACH_RECORD`, `WORK.ATTACH`, `WORK.ATTACH_HINT`.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/work/workText.test.ts`:

```ts
it('says a record was attached to a to-do', () => {
  expect(eventSentence(taskEvent(1, 'edited', { id: 1, name: 'Alice' }, { field: 'record', from: null, to: { kind: 'customer', id: 7, name: 'Pizza Hut' } }), 1)).toBe('You attached it to Pizza Hut.');
});
```

(import `taskEvent` from `./testWorkFixtures` if the file does not already).

Append to `src/components/work/TaskFields.test.tsx` a new `describe` (the file already renders the panel through `renderPage(..., '/work/today?task=<id>')`; use `stubFeed` so to-do 60 exists):

```tsx
import { stubFeed } from '../../features/work/testFeed';
import { TaskPanelHost } from './TaskPanelHost';

describe('the panel on a to-do (contract §1.2, Decision 10)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('says Only you, shows the assignee as You, and clears the date', async () => {
    const { spy } = stubFeed({ todos: [{ ...TODO_ROOM, due_date: '2026-10-09' }] });
    renderPage(<p>My work</p>, '/work/mine?task=60');
    const panel = await screen.findByRole('dialog', { name: 'Book the QBR room' });
    expect(panel.querySelector('[data-part="private"]')).toHaveTextContent('Only you');
    expect(within(panel).queryByLabelText('Assignee')).toBeNull();
    expect(within(panel).getByText('You')).toBeInTheDocument();
    const due = within(panel).getByLabelText('Due');
    await userEvent.clear(due);
    fireEvent.blur(due);
    await vi.waitFor(() => expect(sent(spy, 'PATCH', '/tasks/60/')).toEqual([{ due_date: null }]));
  });

  it('attaches a record, asking for a date when the to-do has none', async () => {
    const { spy } = stubFeed();
    renderPage(<p>My work</p>, '/work/mine?task=60');
    const panel = await screen.findByRole('dialog', { name: 'Book the QBR room' });
    await userEvent.type(within(panel).getByLabelText('Organisation or account'), 'Pizza');
    await userEvent.click(await within(panel).findByRole('button', { name: 'Pizza Hut' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Attach' }));
    expect(await within(panel).findByText('Choose a date.')).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText('Due date for the record task'), { target: { value: '2026-10-09' } });
    await userEvent.click(within(panel).getByRole('button', { name: 'Attach' }));
    expect(await within(panel).findByText('You attached it to Pizza Hut.')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/tasks/60/')).toEqual([{ customer_id: 7, due_date: '2026-10-09' }]);
    expect(within(panel).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
  });
});
```

(Add `TODO_ROOM` from `../../features/work/testFeedFixtures`, `sent` from `testWork`, and `fireEvent`, `within`, `screen` to the imports as needed; `TaskPanelHost` is already mounted by `renderPage`, so drop that import if unused.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/work/TaskFields.test.tsx src/features/work/workText.test.ts --maxWorkers=2`
Expected: FAIL ("Only you" is shown by Task 1's facts, but clearing the date is refused locally as "Choose a date.", no Attach control exists, and the trail sentence is "You edited the description.").

- [ ] **Step 3: Teach the trail and the words**

In `src/features/work/workText.ts` add to `WORK`:

```ts
  ATTACH_RECORD: 'Attach to a record',
  ATTACH: 'Attach',
  ATTACH_HINT: "It becomes a normal task on that record: people who can see the record can see it. This can't be undone.",
  ATTACH_DUE: 'Due date for the record task',
```

and in `eventSentence`'s `edited` case, before the description line:

```ts
      if (field === 'record') {
        const to = data.to && typeof data.to === 'object' ? text((data.to as { name?: unknown }).name) : '';
        return to ? `${who} attached it to ${to}.` : `${who} attached it to a record.`;
      }
```

- [ ] **Step 4: Let the date clear and add the record editor**

In `src/components/work/TaskFields.tsx`, `DueEditor.commit`:

```ts
  async function commit() {
    if (draft === (task.due_date ?? '')) {
      setLocal(null);
      return;
    }
    // A to-do may lose its date (contract §1.2); a task with a record may not.
    if (draft === '' && task.parent === null) {
      setLocal(null);
      await save({ due_date: null });
      return;
    }
    if (!isDueDate(draft)) {
      setLocal(WORK.DATE_REQUIRED);
      return;
    }
    setLocal(null);
    await save({ due_date: draft });
  }
```

After the description editor line in `TaskFields`'s return, add:

```tsx
      {can('record') && task.parent === null ? <RecordEditor task={task} busy={busy} refusal={refusal} save={save} /> : null}
```

with `import { RecordEditor } from './RecordEditor';`.

`src/components/work/RecordEditor.tsx`:

```tsx
import { useId, useState } from 'react';
import type { RecordRef } from '../../features/plans/planTypes';
import type { Refusal } from '../../features/work/workApi';
import { WORK, isDueDate } from '../../features/work/workText';
import type { TaskDetail, TaskPatch } from '../../features/work/workTypes';
import { BUTTON, MONO } from '../organizations/portfolio/styles';
import { INPUT } from '../plans/styles';
import { RecordStep } from '../plans/RecordStep';
import { Field } from '../rules/Field';
import { TYPE } from '../ui';

/** Attach a record to a to-do (contract §1.2; Decision 10): pick an
 *  organisation or account, give a date if the to-do has none, Attach. One
 *  way: from then on it is a normal task. The server's refusals sit under
 *  the record and the date. */
export function RecordEditor({ task, busy, refusal, save }: { task: TaskDetail; busy: boolean; refusal: Refusal; save: (patch: TaskPatch) => Promise<boolean> }) {
  const dueId = useId();
  const [record, setRecord] = useState<RecordRef | null>(null);
  const [due, setDue] = useState('');
  const [local, setLocal] = useState<string | null>(null);
  const needsDate = task.due_date === null;

  async function attach() {
    if (!record) return;
    if (needsDate && !isDueDate(due)) {
      setLocal(WORK.DATE_REQUIRED);
      return;
    }
    setLocal(null);
    const patch: TaskPatch = record.kind === 'organization' ? { customer_id: record.id } : { account_id: record.id };
    if (needsDate) patch.due_date = due;
    await save(patch);
  }

  const dueError = local ?? refusal.field.due_date;
  return (
    <section className="flex flex-col gap-2 border-t border-line-subtle pt-4">
      <RecordStep
        heading={WORK.ATTACH_RECORD}
        record={record}
        locked={false}
        loading={false}
        error={refusal.field.record ?? refusal.field.customer_id ?? refusal.field.account_id}
        onPick={setRecord}
        onClear={() => setRecord(null)}
      />
      <p className={`max-w-[68ch] ${TYPE.meta}`}>{WORK.ATTACH_HINT}</p>
      {record && needsDate ? (
        <Field id={dueId} label={WORK.ATTACH_DUE} error={dueError}>
          {(aria) => <input id={dueId} {...aria} type="date" value={due} onChange={(event) => setDue(event.target.value)} className={`${INPUT} ${MONO} ${dueError ? 'border-danger' : 'border-line'}`} />}
        </Field>
      ) : null}
      {record ? (
        <button type="button" onClick={() => void attach()} aria-disabled={busy} className={`${BUTTON} self-start`}>
          {WORK.ATTACH}
        </button>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `npx vitest run src/components/work src/features/work --maxWorkers=2`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/work/RecordEditor.tsx src/components/work/TaskFields.tsx src/components/work/TaskFields.test.tsx src/features/work/workText.ts src/features/work/workText.test.ts
git commit -m "feat(work): task panel for to-dos: Only you, clear the date, attach a record

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The My work page

**Files:**
- Create: `src/components/work/WorkToast.tsx`, `src/components/work/FeedGroups.tsx`, `src/components/work/FeedSkeleton.tsx`, `src/pages/work/MyWork.tsx`
- Test: `src/pages/work/MyWork.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1 to 9; `undoAction`, `refusalDetail` (`agentsApi`); `patchTask`, `isMissing`; `taskChanged`, `useTaskChanges`, `feedChanged`; `useCapability`, `useAppSelector`; `PageHeaderActions`, `FilterChip`, `FilterChipRow`, `ListCard`, `Card`, `ErrorState`, `EmptyState`, `LoadingState`, `OVERLAY`, `ICON_BUTTON`, `BUTTON`, `QUIET`.
- Produces:
  - `interface Toast { id: number; text: string; link?: { label: string; to: To; state?: unknown }; undo?: () => Promise<void>; focus: boolean }`, `WorkToast({ toast, onClose })` (`data-part="work-toast"`, `role="status"`).
  - `FeedGroups({ data, slots, paging, isSm, me, pending, errors, onMore, onRetry, handlers })`.
  - `FeedSkeleton()`.
  - `MyWorkPage()` (route `/work/mine`, wired in Task 11).

- [ ] **Step 1: Write the failing test**

`src/pages/work/MyWork.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { calls, sent } from '../../features/work/testWork';
import { stubFeed } from '../../features/work/testFeed';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { resetViewport } from '../../test/viewport';
import { renderPage, where } from './testPages';
import { MyWorkPage } from './MyWork';

const headings = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

describe('My work (spec §5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    resetMembersCache();
  });

  it('shows the groups in order with their counts, decisions first, empty ones hidden', async () => {
    stubFeed({ recommendations: [] });
    renderPage(<MyWorkPage />, '/work/mine');
    expect(screen.getByText('Loading your work')).toBeInTheDocument();
    await screen.findByRole('region', { name: 'Needs your decision 4' });
    expect(headings()).toEqual(['Needs your decision 4', 'Overdue 1', 'Today 1', 'This week 2', 'Later 1', 'No date 1', 'Blocked 1']);
    expect(screen.getByLabelText('Add a to-do')).toBeInTheDocument();
  });

  it('filters by chip through the URL', async () => {
    const { spy } = stubFeed();
    renderPage(<MyWorkPage />, '/work/mine');
    await screen.findByRole('region', { name: 'Needs your decision 4' });
    await userEvent.click(screen.getByRole('button', { name: 'Approvals' }));
    await waitFor(() => expect(where()).toBe('/work/mine?kind=approval'));
    expect(await screen.findByRole('region', { name: 'Needs your decision 2' })).toBeInTheDocument();
    expect(headings()).toEqual(['Needs your decision 2']);
    expect(screen.getByRole('button', { name: 'Approvals' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(where()).toBe('/work/mine'));
    expect(calls(spy, 'GET', '/work/feed/')).toEqual(['/work/feed/', '/work/feed/?kind=approval%2Crule_review', '/work/feed/']);
  });

  it('shows more of a long group', async () => {
    stubFeed({ pageSize: 1 });
    renderPage(<MyWorkPage />, '/work/mine');
    const week = await screen.findByRole('region', { name: 'This week 2' });
    expect(within(week).getAllByRole('listitem')).toHaveLength(1);
    expect(week).toHaveTextContent('Showing 1 of 2');
    await userEvent.click(within(week).getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(within(week).getAllByRole('listitem')).toHaveLength(2));
    expect(within(week).queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('marks a task done, and Undo brings it back', async () => {
    const { spy } = stubFeed();
    renderPage(<MyWorkPage />, '/work/mine');
    const overdue = await screen.findByRole('region', { name: 'Overdue 1' });
    await userEvent.click(within(overdue).getByRole('button', { name: 'Mark “Call Pizza Hut” done' }));
    const toast = document.querySelector('[data-part="work-toast"]') as HTMLElement;
    await waitFor(() => expect(toast).toHaveTextContent('Done: Call Pizza Hut.'));
    expect(screen.queryByRole('region', { name: /^Overdue/ })).toBeNull();
    await userEvent.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(toast).toHaveTextContent('Reopened: Call Pizza Hut.'));
    expect(await screen.findByRole('region', { name: 'Overdue 1' })).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/tasks/41/')).toEqual([{ status: 'completed' }, { status: 'pending' }]);
  });

  it('removes a row someone else decided, in their words', async () => {
    stubFeed({ refuseNextAction: { status: 409, body: { code: 'ALREADY_DECIDED', detail: 'Mona Manager already applied this.' } } });
    renderPage(<MyWorkPage />, '/work/mine');
    const action = await screen.findByRole('article', { name: 'Move Pizza Hut to Renewal' });
    await userEvent.click(within(action).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(document.querySelector('[data-part="work-toast"]')).toHaveTextContent('Mona Manager already applied this.'));
    expect(screen.queryByRole('article', { name: 'Move Pizza Hut to Renewal' })).toBeNull();
  });

  it('removes a task the reader lost, and counts it as hidden', async () => {
    stubFeed({ refuseNextPatch: { status: 404, body: { detail: 'No such task.' } } });
    renderPage(<MyWorkPage />, '/work/mine');
    await userEvent.click(await screen.findByRole('button', { name: 'Mark “Call Pizza Hut” done' }));
    expect(await screen.findByText("1 more on a record you can't open")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark “Call Pizza Hut” done' })).toBeNull();
  });

  it('shows a failed source in its group place, and the rest of the page', async () => {
    const { spy } = stubFeed({ failKinds: { approval: 1 } });
    renderPage(<MyWorkPage />, '/work/mine');
    const notice = await screen.findByText("Couldn't load approvals.");
    expect(await screen.findByRole('region', { name: 'Needs your decision 3' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Overdue 1' })).toBeInTheDocument();
    await userEvent.click(within(notice.closest('[data-failed]') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Needs your decision 4' })).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load approvals.")).toBeNull();
    expect(calls(spy, 'GET', '/work/feed/')).toContain('/work/feed/?group=decide');
  });

  it('shows Try again when the feed cannot load at all', async () => {
    stubFeed({ failFeed: 1 });
    renderPage(<MyWorkPage />, '/work/mine');
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Overdue 1' })).toBeInTheDocument();
  });

  it('says nothing waits, with the quick-add still there', async () => {
    stubFeed({ tasks: [], todos: [], decide: [], recommendations: [] });
    renderPage(<MyWorkPage />, '/work/mine');
    expect(await screen.findByText('Nothing waiting on you.')).toBeInTheDocument();
    expect(screen.getByLabelText('Add a to-do')).toBeInTheDocument();
  });

  it('places a quick-added to-do without a reload of its own', async () => {
    stubFeed({ recommendations: [] });
    renderPage(<MyWorkPage />, '/work/mine');
    await screen.findByRole('region', { name: 'No date 1' });
    await userEvent.type(screen.getByLabelText('Add a to-do'), 'Call the florist{Enter}');
    const noDate = await screen.findByRole('region', { name: 'No date 2' });
    expect(within(noDate).getByRole('link', { name: 'Call the florist' })).toBeInTheDocument();
    expect(document.querySelector('[data-part="work-toast"]')).toHaveTextContent('Added: Call the florist.');
    expect(screen.getByLabelText('Add a to-do')).toHaveFocus();
  });

  it('offers the Work settings gear only to those who manage workspace settings', async () => {
    stubFeed();
    renderPage(<MyWorkPage />, '/work/mine');
    expect(await screen.findByRole('link', { name: 'Work settings' })).toHaveAttribute('href', '/settings/recommendations');
  });

  it('hides the gear from a member', async () => {
    stubFeed();
    renderPage(<MyWorkPage />, '/work/mine', { role: 'csm' });
    await screen.findByRole('region', { name: 'Overdue 1' });
    expect(screen.queryByRole('link', { name: 'Work settings' })).toBeNull();
  });

  it('on a phone is one column with 44px controls, the chips scrolling sideways', async () => {
    stubFeed();
    renderPage(<MyWorkPage />, '/work/mine', { width: 375 });
    await screen.findByRole('region', { name: 'Suggested 2' });
    expect(screen.getByRole('group', { name: 'Show' })).toHaveClass('overflow-x-auto');
    expect(screen.getByRole('button', { name: 'Add' })).toHaveClass('min-h-11');
    expect(screen.getAllByRole('button', { name: 'Add to my work' })[0]).toHaveClass('min-h-11');
    expect(screen.queryByRole('button', { name: 'Assign' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/pages/work/MyWork.test.tsx --maxWorkers=2`
Expected: FAIL (module missing).

- [ ] **Step 3: Write the toast, the skeleton and the groups**

`src/components/work/WorkToast.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { Link, type To } from 'react-router-dom';
import { X } from 'lucide-react';
import { FEED } from '../../features/work/feed';
import { BUTTON, FOCUS, ICON_BUTTON, OVERLAY, QUIET, TYPE } from '../ui';

export interface Toast {
  /** A new id is a new toast (focus moves again). */
  id: number;
  text: string;
  link?: { label: string; to: To; state?: unknown };
  undo?: () => Promise<void>;
  /** Take focus: true after a row left (Decision 1), false after quick-add. */
  focus: boolean;
}

/** My work's one toast (Decision 1): the live region stays mounted (sr-only
 *  while empty); the next toast replaces it; Close empties it. No timer. */
export function WorkToast({ toast, onClose }: { toast: Toast | null; onClose: () => void }) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [undoing, setUndoing] = useState(false);
  useEffect(() => {
    if (toast?.focus) textRef.current?.focus();
  }, [toast]);

  async function undo() {
    if (!toast?.undo || undoing) return;
    setUndoing(true);
    try {
      await toast.undo();
    } finally {
      setUndoing(false);
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-part="work-toast"
      className={toast ? `fixed inset-x-4 bottom-4 z-40 flex flex-wrap items-center gap-2 px-4 py-2 sm:left-auto sm:right-6 sm:max-w-md ${OVERLAY}` : 'sr-only'}
    >
      {toast ? (
        <>
          <p ref={textRef} tabIndex={-1} className={`min-w-0 flex-1 break-words ${TYPE.body} ${FOCUS}`}>
            {toast.text}
          </p>
          {toast.link ? (
            <Link to={toast.link.to} state={toast.link.state} className={QUIET}>
              {toast.link.label}
            </Link>
          ) : null}
          {toast.undo ? (
            <button type="button" disabled={undoing} onClick={() => void undo()} className={BUTTON}>
              {undoing ? FEED.UNDOING : FEED.UNDO}
            </button>
          ) : null}
          <button type="button" aria-label={FEED.CLOSE} onClick={onClose} className={ICON_BUTTON}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </>
      ) : null}
    </div>
  );
}
```

`src/components/work/FeedSkeleton.tsx`:

```tsx
import { FEED } from '../../features/work/feed';
import { ListCard, LoadingState } from '../ui';

/** My work while it loads: one list's rows, the shape of the first group. */
export function FeedSkeleton() {
  return <ListCard label={FEED.LOADING} state={<LoadingState label={FEED.LOADING} count={4} />} />;
}
```

`src/components/work/FeedGroups.tsx`:

```tsx
import { FEED, FEED_GROUP_LABEL, GROUP_ORDER, failedText, groupIn, type FailedSlot } from '../../features/work/feed';
import { moreRowsText } from '../../features/work/workText';
import type { FeedGroupKey, FeedPayload } from '../../features/work/workTypes';
import { BUTTON, Card, ListCard, NUM, QUIET, TYPE } from '../ui';
import { FeedRow, type FeedRowProps } from './FeedRow';

type Handlers = Pick<FeedRowProps, 'onDone' | 'onSettled' | 'onApplied' | 'onGone' | 'onLost'>;

/** The feed's groups in the contract's order (spec §5): a failed source's
 *  notice in its place (Decision 4), then each group that has items, its
 *  count in the heading, Show more while the server has more. */
export function FeedGroups({
  data,
  slots,
  paging,
  isSm,
  me,
  pending,
  errors,
  onMore,
  onRetry,
  handlers,
}: {
  data: FeedPayload;
  slots: FailedSlot[];
  paging: Partial<Record<FeedGroupKey, 'busy' | string>>;
  isSm: boolean;
  me: number | null;
  pending: ReadonlySet<string>;
  errors: Record<string, string>;
  onMore: (group: FeedGroupKey, cursor: string) => void;
  onRetry: (slot: FailedSlot) => void;
  handlers: Handlers;
}) {
  return (
    <>
      {GROUP_ORDER.map((key) => {
        const group = groupIn(data, key);
        const slot = slots.find((candidate) => candidate.at === key);
        const state = paging[key];
        const headingId = `work-feed-${key}`;
        const more = moreRowsText(group.items.length, group.count);
        return (
          <div key={key} className="flex flex-col gap-2">
            {slot ? (
              <Card pad="none">
                <div data-failed={slot.at} role="alert" className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <p className={`${TYPE.body} text-danger-ink`}>{failedText(slot.kinds)}</p>
                  <button type="button" onClick={() => onRetry(slot)} disabled={state === 'busy'} className={BUTTON}>
                    {FEED.TRY_AGAIN}
                  </button>
                </div>
              </Card>
            ) : null}
            {group.count > 0 && group.items.length > 0 ? (
              <section data-group={key} aria-labelledby={headingId} className="flex flex-col gap-2">
                <h2 id={headingId} className={TYPE.title}>
                  {FEED_GROUP_LABEL[key]} <span className={`${TYPE.meta} ${NUM}`}>{group.count}</span>
                </h2>
                <ListCard
                  label={FEED_GROUP_LABEL[key]}
                  busy={state === 'busy'}
                  footer={
                    group.next || (state && state !== 'busy') ? (
                      <>
                        {more ? <p className={`${TYPE.meta} ${NUM}`}>{more}</p> : null}
                        {state && state !== 'busy' ? (
                          <p role="alert" className="text-[11px] leading-4 text-danger-ink">
                            {state}
                          </p>
                        ) : null}
                        {group.next ? (
                          <button type="button" disabled={state === 'busy'} onClick={() => onMore(key, group.next as string)} className={QUIET}>
                            {state === 'busy' ? FEED.LOADING_MORE : FEED.SHOW_MORE}
                          </button>
                        ) : null}
                      </>
                    ) : undefined
                  }
                >
                  {group.items.map((item) => (
                    <FeedRow
                      key={item.key}
                      item={item}
                      group={key}
                      isSm={isSm}
                      me={me}
                      busy={pending.has(item.key)}
                      error={errors[item.key] ?? null}
                      {...handlers}
                    />
                  ))}
                </ListCard>
              </section>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
```

- [ ] **Step 4: Write the page**

`src/pages/work/MyWork.tsx`:

```tsx
import { useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Settings as Gear } from 'lucide-react';
import { FeedGroups } from '../../components/work/FeedGroups';
import { FeedSkeleton } from '../../components/work/FeedSkeleton';
import { QuickAdd } from '../../components/work/QuickAdd';
import { feedChanged, taskChanged, useTaskChanges } from '../../components/work/taskChanges';
import { useFeed } from '../../components/work/useFeed';
import { WorkFrame } from '../../components/work/WorkFrame';
import { WorkToast, type Toast } from '../../components/work/WorkToast';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { Card, EmptyState, ErrorState, FilterChip, FilterChipRow, ICON_BUTTON, PageHeaderActions, TYPE } from '../../components/ui';
import { refusalDetail, undoAction } from '../../features/agents/agentsApi';
import type { AgentAction } from '../../features/agents/agentTypes';
import {
  FEED,
  FEED_CHIPS,
  addedText,
  chipAllows,
  chipOf,
  failedSlots,
  feedTotal,
  hiddenFeedText,
  locateItem,
  reopenedText,
  undoPatch,
  withHidden,
  withItem,
  withoutItem,
  type FeedChip,
} from '../../features/work/feed';
import { isMissing, patchTask } from '../../features/work/workApi';
import { WORK, doneStatus } from '../../features/work/workText';
import type { ApprovalFeedItem, FeedItem, TaskFeedItem, TodoAnswer } from '../../features/work/workTypes';
import { useAppSelector, useCapability } from '../../hooks';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import type { Settle } from '../../components/work/FeedDecideRows';

/** /work/mine (spec §5): everything waiting on the reader, one feed in eight
 *  groups, decisions first. Quick-add on top, kind chips in the URL, inline
 *  actions; a row that leaves says so in the toast, with Undo where one
 *  exists. A failed source shows in its place; the rest still renders. */
export function MyWorkPage() {
  const [params, setParams] = useSearchParams();
  const chip = chipOf(params.get('kind'));
  const feed = useFeed(chip);
  useTaskChanges(feed.reload);
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const canManage = useCapability('manage_org_settings');
  const isSm = useMediaQuery(SM);
  const running = useRef(new Set<string>());
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<Toast | null>(null);
  const toastId = useRef(0);
  const data = feed.data;

  const say = (next: Omit<Toast, 'id' | 'focus'>, focus = true) => setToast({ ...next, id: ++toastId.current, focus });

  function choose(next: FeedChip | null) {
    const query = new URLSearchParams(params);
    if (next) query.set('kind', next);
    else query.delete('kind');
    setParams(query, { replace: true });
  }

  const track = (key: string, on: boolean) => {
    if (on) running.current.add(key);
    else running.current.delete(key);
    setPending(new Set(running.current));
  };

  function leave(item: FeedItem, settle: Settle, undo?: () => Promise<void>) {
    feed.update((current) => withoutItem(current, item.key));
    say({ ...settle, undo });
    feedChanged();
  }

  function gone(item: FeedItem, text: string) {
    leave(item, { text });
  }

  function lost(item: FeedItem, text: string) {
    feed.update((current) => withHidden(withoutItem(current, item.key), 1));
    say({ text });
    feedChanged();
  }

  async function markDone(item: TaskFeedItem) {
    if (running.current.has(item.key)) return;
    const where = data ? locateItem(data, item.key) : null;
    track(item.key, true);
    setErrors((current) => {
      const next = { ...current };
      delete next[item.key];
      return next;
    });
    try {
      await patchTask(item.id, { status: 'completed' });
      leave(item, { text: doneStatus(item.title) }, async () => {
        try {
          await patchTask(item.id, undoPatch(item.detail));
          if (where) feed.update((current) => withItem(current, where.group, item));
          say({ text: reopenedText(item.title) });
          taskChanged();
        } catch (err) {
          say({ text: errorMessage(err, FEED.UNDO_FAILED) });
        }
      });
      taskChanged();
    } catch (err) {
      if (isMissing(err)) lost(item, FEED.LOST);
      else setErrors((current) => ({ ...current, [item.key]: errorMessage(err, WORK.DONE_FAILED) }));
    } finally {
      track(item.key, false);
    }
  }

  function applied(item: ApprovalFeedItem, action: AgentAction, text: string) {
    const undo =
      action.status === 'applied' && action.undo?.allowed
        ? async () => {
            try {
              const answer = await undoAction(action.id);
              say({ text: `Undone: ${answer.action.title}.` });
              taskChanged();
            } catch (err) {
              say({ text: refusalDetail(err) ?? errorMessage(err, FEED.UNDO_FAILED) });
            }
          }
        : undefined;
    leave(item, { text }, undo);
  }

  function added(answer: TodoAnswer) {
    if (answer.item && answer.group && chipAllows(chip, answer.item.kind)) {
      const { item, group } = answer;
      feed.update((current) => withItem(current, group, item));
    }
    say({ text: addedText(answer) }, false);
    taskChanged();
  }

  let body: ReactNode;
  if (!data && feed.error) {
    body = (
      <Card pad="none">
        <ErrorState message={feed.error} onRetry={feed.reload} />
      </Card>
    );
  } else if (!data) {
    body = <FeedSkeleton />;
  } else {
    const slots = failedSlots(data.failed);
    body =
      feedTotal(data) === 0 && slots.length === 0 ? (
        <Card pad="none">
          <EmptyState title={FEED.EMPTY_TITLE} detail={FEED.EMPTY_DETAIL} />
        </Card>
      ) : (
        <FeedGroups
          data={data}
          slots={slots}
          paging={feed.paging}
          isSm={isSm}
          me={me}
          pending={pending}
          errors={errors}
          onMore={(group, cursor) => void feed.showMore(group, cursor)}
          onRetry={feed.retry}
          handlers={{ onDone: (item) => void markDone(item), onSettled: (item, settle) => leave(item, settle), onApplied: applied, onGone: gone, onLost: lost }}
        />
      );
  }
  const hidden = data ? hiddenFeedText(data.hidden) : null;

  return (
    <WorkFrame>
      {canManage ? (
        <PageHeaderActions>
          <Link to="/settings/recommendations" aria-label={FEED.SETTINGS} className={ICON_BUTTON}>
            <Gear className="h-5 w-5" aria-hidden="true" />
          </Link>
        </PageHeaderActions>
      ) : null}
      <QuickAdd onAdded={added} />
      <FilterChipRow label={FEED.FILTER}>
        {FEED_CHIPS.map((option) => (
          <FilterChip key={option.label} label={option.label} pressed={chip === option.key} onToggle={() => choose(option.key)} />
        ))}
      </FilterChipRow>
      {body}
      {hidden ? <p className={TYPE.bodyMuted}>{hidden}</p> : null}
      <WorkToast toast={toast} onClose={() => setToast(null)} />
    </WorkFrame>
  );
}
```

(`undoAction` answers `{ action }`; the toast reads the action's own title.)

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/pages/work/MyWork.test.tsx --maxWorkers=2`
Expected: PASS. If the phone test's chip row assertion fails, check `FilterChipRow` renders `role="group"` with `aria-label` (it does: the label is "Show").

- [ ] **Step 6: Commit**

```bash
git add src/components/work/WorkToast.tsx src/components/work/FeedGroups.tsx src/components/work/FeedSkeleton.tsx src/pages/work/MyWork.tsx src/pages/work/MyWork.test.tsx
git commit -m "feat(work): My work page with groups, chips, toasts and Undo

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Routes, tabs and redirects; Today and Recommended retired

**Files:**
- Create: `src/components/work/KeepQueryRedirect.tsx`
- Modify: `src/pages/work/WorkRoutes.tsx`, `src/features/work/workTabs.ts`, `src/components/layout/WorkTabs.tsx`, `src/features/work/rows.ts`, `src/features/work/workText.ts`, `src/features/work/recommended.ts`, `src/components/work/houseRules.test.ts`, `src/test/uiRatchet.test.ts`
- Delete: `src/pages/work/Today.tsx`, `Today.test.tsx`, `Recommended.tsx`, `Recommended.test.tsx`; `src/components/work/TodayGroups.tsx`, `TodaySkeleton.tsx`, `useToday.ts`, `NewTaskSheet.tsx`, `RecommendationCard.tsx`, `RecommendedSkeleton.tsx`, `useRecommended.ts`
- Test: `src/pages/work/WorkRoutes.test.tsx`, `src/features/work/workTabs.test.ts`, `src/components/layout/WorkTabs.test.tsx`, `src/features/work/rows.test.ts`, `src/features/work/workText.test.ts`, `src/features/work/recommended.test.ts`, `src/e2e/work.test.tsx`, `src/e2e/agents.test.tsx`

**Interfaces:**
- Consumes: `MyWorkPage` (Task 10), `stubFeed`, `approvalItem`, `APPROVAL` (Task 3).
- Produces: `KeepQueryRedirect({ to, set }: { to: string; set?: Record<string, string> })` (keeps the query and the history state, adds `set`); routes `/work` and unknown → `/work/mine`; `/work/today` → `/work/mine` (query kept); `/work/recommended` → `/work/mine?kind=suggestion` (query kept); Team gate fallback `/work/mine`. `WORK_TABS` = My work (`/work/mine`), Team (`/work/team`, team only), Activity (`/work/activity`); `workTabsFor({ team }: { team: boolean })`.

- [ ] **Step 1: Write the failing tests**

Replace `src/pages/work/WorkRoutes.test.tsx` with:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { calls } from '../../features/work/testWork';
import { stubFeed } from '../../features/work/testFeed';
import { CARL } from '../../features/work/testWorkFixtures';
import { resetViewport } from '../../test/viewport';
import { renderWork, where } from './testPages';

describe('WorkRoutes (work in one place §5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it.each(['/work', '/work/', '/work/anything'])('sends %s to My work', async (url) => {
    stubFeed();
    renderWork(url);
    await waitFor(() => expect(where()).toBe('/work/mine'));
    expect(await screen.findByRole('region', { name: 'Overdue 1' })).toBeInTheDocument();
  });

  it('sends Today to My work, keeping the query, so a bell link opens the task panel', async () => {
    stubFeed();
    renderWork('/work/today?task=41');
    await waitFor(() => expect(where()).toBe('/work/mine?task=41'));
    expect(await screen.findByRole('dialog', { name: 'Call Pizza Hut' })).toBeInTheDocument();
  });

  it('sends Recommended to the Suggested chip, keeping the query', async () => {
    stubFeed();
    renderWork('/work/recommended?scope=team');
    await waitFor(() => expect(where()).toBe('/work/mine?scope=team&kind=suggestion'));
    expect(await screen.findByRole('region', { name: 'Suggested 2' })).toBeInTheDocument();
  });

  it('sends a reader who may not see Team from /work/team to My work', async () => {
    stubFeed({ reader: CARL });
    renderWork('/work/team', { role: 'csm', user: { id: 3, name: 'Carl CSM' } });
    await waitFor(() => expect(where()).toBe('/work/mine'));
  });

  it('waits for the members on a cold load, so a manager stays on Team', async () => {
    const { spy } = stubFeed();
    renderWork('/work/team?scope=team', { role: 'csm' });
    expect(screen.getByText('Loading the team')).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: "Your team's tasks" })).toBeInTheDocument();
    expect(where()).toBe('/work/team?scope=team');
    expect(calls(spy, 'GET', '/work/feed/')).toEqual([]);
  });
});
```

Replace `src/features/work/workTabs.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { isWorkPath, workTabOf, workTabsFor } from './workTabs';

describe('workTabs (work in one place §2.3)', () => {
  it('knows a Work route, and nothing that only starts with the same letters', () => {
    expect(isWorkPath('/work')).toBe(true);
    expect(isWorkPath('/work/mine')).toBe(true);
    expect(isWorkPath('/workspace')).toBe(false);
    expect(isWorkPath('/settings/work')).toBe(false);
  });

  it('lights the tab of the page, a trailing slash included', () => {
    expect(workTabOf('/work/mine')).toBe('/work/mine');
    expect(workTabOf('/work/team/')).toBe('/work/team');
    expect(workTabOf('/work')).toBeNull();
  });

  it('lists My work, Team (for Team readers) and Activity', () => {
    expect(workTabsFor({ team: false }).map((tab) => tab.label)).toEqual(['My work', 'Activity']);
    expect(workTabsFor({ team: true }).map((tab) => tab.label)).toEqual(['My work', 'Team', 'Activity']);
  });
});
```

In `src/components/layout/WorkTabs.test.tsx`, replace the `it.each` and the last two `it`s with:

```tsx
  it.each([
    ['/work/mine', 'My work'],
    ['/work/team', 'Team'],
    ['/work/activity', 'Activity'],
  ])('on %s: My work, Team and Activity, "%s" current', (url, current) => {
    stubWork();
    renderTabs(url);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(tabs().getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['My work', '/work/mine'],
      ['Team', '/work/team'],
      ['Activity', '/work/activity'],
    ]);
    expect(tabs().getByRole('link', { name: current })).toHaveAttribute('aria-current', 'page');
  });

  it('hides Team from a member with no reports, no view-all and another function', async () => {
    const { spy } = stubWork({ members: [] });
    renderTabs('/work/mine', { ...mockUser, permissions: [] });
    await waitFor(() => expect(calls(spy, 'GET', '/auth/members/')).toHaveLength(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(tabs().getAllByRole('link').map((link) => link.textContent)).toEqual(['My work', 'Activity']);
    expect(calls(spy, 'GET', '/work/recommendations/')).toEqual([]);
  });
```

and change the two remaining `renderTabs('/work/today', …)` calls to `renderTabs('/work/mine', …)`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/pages/work/WorkRoutes.test.tsx src/features/work/workTabs.test.ts src/components/layout/WorkTabs.test.tsx --maxWorkers=2`
Expected: FAIL (no `/work/mine` route; tabs still Today, Recommended).

- [ ] **Step 3: Write the redirect and the routes**

`src/components/work/KeepQueryRedirect.tsx`:

```tsx
import { Navigate, useLocation } from 'react-router-dom';

/** A redirect that keeps the query and the history state (Decision 15), and
 *  sets `set` on top: /work/today?task=41 opens the task panel on My work,
 *  and the bell's "opened here" state still lets Close step back. */
export function KeepQueryRedirect({ to, set = {} }: { to: string; set?: Record<string, string> }) {
  const { search, state } = useLocation();
  const query = new URLSearchParams(search);
  for (const [key, value] of Object.entries(set)) query.set(key, value);
  const text = query.toString();
  return <Navigate to={`${to}${text ? `?${text}` : ''}`} replace state={state} />;
}
```

`src/pages/work/WorkRoutes.tsx`: drop the `RecommendedPage` and `TodayPage` imports, import `MyWorkPage` from `./MyWork` and `KeepQueryRedirect` from `../../components/work/KeepQueryRedirect`; TeamGate's fallback becomes `<Navigate to="/work/mine" replace />`; the routes become:

```tsx
/** /work/* (work in one place spec §5): My work, Team and Activity. Today
 *  and Recommended became My work and its Suggested chip; their old links
 *  redirect with the query kept. /work, and anything unknown under it,
 *  lands on My work. */
export function WorkRoutes() {
  return (
    <Routes>
      <Route element={<WorkLayout />}>
        <Route index element={<Navigate to="/work/mine" replace />} />
        <Route path="mine" element={<MyWorkPage />} />
        <Route path="today" element={<KeepQueryRedirect to="/work/mine" />} />
        <Route path="recommended" element={<KeepQueryRedirect to="/work/mine" set={{ kind: 'suggestion' }} />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="team" element={<TeamGate />} />
        <Route path="*" element={<Navigate to="/work/mine" replace />} />
      </Route>
    </Routes>
  );
}
```

`src/features/work/workTabs.ts`:

```ts
// The Work bar's tabs (work in one place spec §2.3, §5), kept free of React
// so the rules are unit-tested on their own.

export interface WorkTab {
  path: string;
  label: string;
  /** Shown only to readers who may use Team (delivery 1 Decision 7). */
  team?: boolean;
}

export const WORK_TABS: readonly WorkTab[] = [
  { path: '/work/mine', label: 'My work' },
  { path: '/work/team', label: 'Team', team: true },
  { path: '/work/activity', label: 'Activity' },
];

/** Every Work route wears the Work bar; `/workspace` would not. */
export function isWorkPath(pathname: string): boolean {
  return /^\/work(\/|$)/.test(pathname);
}

export function workTabOf(pathname: string): string | null {
  return WORK_TABS.find((tab) => pathname === tab.path || pathname === `${tab.path}/`)?.path ?? null;
}

export function workTabsFor(access: { team: boolean }): WorkTab[] {
  return WORK_TABS.filter((tab) => !tab.team || access.team);
}
```

`src/components/layout/WorkTabs.tsx`:

```tsx
import { useLocation } from 'react-router-dom';
import { workTabOf, workTabsFor } from '../../features/work/workTabs';
import { useTeamAccess } from '../work/useTeamAccess';
import { Tabs } from '../ui';

/** The Work tabs (work in one place spec §5), drawn by WorkLayout's
 *  PageHeader into the bar: My work, Team for readers who may use it, and
 *  Activity. */
export function WorkTabs() {
  const location = useLocation();
  const canSeeTeam = useTeamAccess();
  const current = workTabOf(location.pathname);
  const tabs = workTabsFor({ team: canSeeTeam });
  return <Tabs label="Work" value={current ?? ''} items={tabs.map((tab) => ({ key: tab.path, label: tab.label, to: tab.path }))} />;
}
```

- [ ] **Step 4: Delete Today, Recommended and what only they used**

```bash
git rm src/pages/work/Today.tsx src/pages/work/Today.test.tsx src/pages/work/Recommended.tsx src/pages/work/Recommended.test.tsx \
  src/components/work/TodayGroups.tsx src/components/work/TodaySkeleton.tsx src/components/work/useToday.ts \
  src/components/work/NewTaskSheet.tsx src/components/work/RecommendationCard.tsx src/components/work/RecommendedSkeleton.tsx \
  src/components/work/useRecommended.ts
```

Then remove the helpers only those files used, with their tests:
- `src/features/work/rows.ts`: delete `withoutRow` and `todayTotal` (and the now-unused `TodayGroup`, `TodayPayload` type imports); in `rows.test.ts` delete the `it` blocks that call them and drop them from the import.
- `src/features/work/workText.ts`: delete `GROUP_KEYS`, `GROUP_LABEL` and `hiddenTodayText` (and `TodayGroup` from its type import); in `workText.test.ts` delete their `it` blocks and imports. Keep `doneStatus` (My work uses it).
- `src/features/work/recommended.ts`: delete `REC_SCOPES`, `isRecScope`, `recTitle`, `hiddenRecText`, `withoutRec` (and imports they alone used: `ScopeOption`, `RecScope`, `RecommendationsPayload`); in `recommended.test.ts` delete their `it` blocks and imports. Keep `workBadgeName` until Task 12.

Run `npx tsc -b`: it must report nothing. If it names an import left unused by the deletions, remove that import.

- [ ] **Step 5: Move the Work house rules onto My work**

In `src/components/work/houseRules.test.ts`:
- The pages glob becomes `['../../pages/work/MyWork.tsx', '../../pages/work/Team.tsx', '../../pages/work/Activity.tsx', '../../pages/work/WorkRoutes.tsx']`, and `PAGES = ['../../pages/work/MyWork.tsx', '../../pages/work/Team.tsx', '../../pages/work/Activity.tsx']`.
- `PRIMARY_OWNERS = ['./QuickAdd.tsx']`; its comment: "One primary per surface: My work's quick-add Add, and each settings form's Save changes."; rename the test to "keeps one primary per surface: My work’s Add and each settings form’s Save changes".
- In the coverage list remove `'./TodayGroups.tsx'`, `'./TodaySkeleton.tsx'`, `'./NewTaskSheet.tsx'`, `'./RecommendationCard.tsx'`, `'./RecommendedSkeleton.tsx'` and add `'./FeedRowParts.tsx'`, `'./FeedTaskRow.tsx'`, `'./FeedDecideRows.tsx'`, `'./FeedSuggestionRow.tsx'`, `'./FeedRow.tsx'`, `'./FeedGroups.tsx'`, `'./FeedSkeleton.tsx'`, `'./WorkToast.tsx'`, `'./QuickAdd.tsx'`, `'./RecordEditor.tsx'`, `'./KeepQueryRedirect.tsx'`.
- Tabular figures: in the first list replace `'./TodayGroups.tsx'` with `'./FeedGroups.tsx'` and `'../../pages/work/Recommended.tsx'` with `'./FeedRowParts.tsx'`; in the `<Figured />` list replace `'./RecommendationCard.tsx'` with `'./FeedSuggestionRow.tsx'`.
- States: replace the six Today/Recommended expectations with

```ts
    expect(files['../../pages/work/MyWork.tsx']).toMatch(/<FeedSkeleton \/>/);
    expect(files['../../pages/work/MyWork.tsx']).toMatch(/<ErrorState /);
    expect(files['../../pages/work/MyWork.tsx']).toMatch(/<EmptyState /);
    expect(files['./FeedGroups.tsx']).toMatch(/failedText/);
```

and in the `LoadingState` loop replace `'./TodaySkeleton.tsx'` and `'./RecommendedSkeleton.tsx'` with `'./FeedSkeleton.tsx'`.
- Cards: the rows list becomes `['./TaskRowItem.tsx', './TeamRow.tsx', './FeedTaskRow.tsx', './FeedDecideRows.tsx', './FeedSuggestionRow.tsx']`; replace the `TodayGroups` and `Recommended` `<ListCard ` expectations with `expect(files['./FeedGroups.tsx']).toMatch(/<ListCard /);`.

- [ ] **Step 6: Move the Work journeys onto My work**

In `src/e2e/work.test.tsx` (imports: add `stubFeed` from `../features/work/testFeed`; keep `stubWork` for the settings journey):

1. Replace the `describe('Work: a member works their day', …)` block with:

```tsx
describe('Work: a member works their day on My work', () => {
  it('opens a task from My work, blocks it with a reason, comments, reads the activity', { timeout: 30000 }, async () => {
    const { spy } = stubFeed({ recommendations: [] });
    renderWork('/work/mine', { nav: true, role: 'csm' });

    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Work']);
    const overdue = await screen.findByRole('region', { name: 'Overdue 1' });
    await userEvent.click(within(overdue).getByRole('link', { name: 'Call Pizza Hut' }));
    await waitFor(() => expect(where()).toBe('/work/mine?task=41'));
    const panel = await screen.findByRole('dialog', { name: 'Call Pizza Hut' });

    await userEvent.selectOptions(await within(panel).findByLabelText('Status'), 'blocked');
    await userEvent.type(within(panel).getByLabelText('Blocked on'), 'Waiting on the contract');
    await userEvent.click(within(panel).getByRole('button', { name: 'Mark blocked' }));
    await within(panel).findByText('You marked it blocked: Waiting on the contract');
    await userEvent.type(within(panel).getByLabelText('Add a comment'), 'Legal promised Friday.');
    await userEvent.click(within(panel).getByRole('button', { name: 'Comment' }));
    const trail = within(panel).getByRole('list', { name: 'Activity' });
    await waitFor(() =>
      expect(within(trail).getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent)).toEqual([
        'Mona Manager created this task for you.',
        'You marked it blocked: Waiting on the contract',
        'You commented',
      ]),
    );

    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(where()).toBe('/work/mine'));
    expect(await screen.findByRole('region', { name: 'Blocked 2' })).toHaveTextContent('Blocked: Waiting on the contract');
    expect(screen.queryByRole('region', { name: /^Overdue/ })).toBeNull();
    expect(sent(spy, 'PATCH', '/tasks/41/')).toEqual([{ status: 'blocked', blocked_reason: 'Waiting on the contract' }]);
  });

  it('adds a to-do, approves an agent action and finishes a task', { timeout: 30000 }, async () => {
    const { spy } = stubFeed();
    renderWork('/work/mine', { nav: true, role: 'csm' });

    // 1. A to-do from the quick-add box lands in No date, only for me.
    await screen.findByRole('region', { name: 'No date 1' });
    await userEvent.type(screen.getByLabelText('Add a to-do'), 'Call the florist{Enter}');
    const noDate = await screen.findByRole('region', { name: 'No date 2' });
    expect(within(noDate).getByRole('link', { name: 'Call the florist' })).toBeInTheDocument();
    expect(within(noDate).getAllByText('Only you')).toHaveLength(2);

    // 2. An agent action approved in place leaves with a toast offering Undo.
    const action = within(screen.getByRole('region', { name: 'Needs your decision 4' })).getByRole('article', { name: 'Move Pizza Hut to Renewal' });
    await userEvent.click(within(action).getByRole('button', { name: 'Apply' }));
    const toast = document.querySelector('[data-part="work-toast"]') as HTMLElement;
    await waitFor(() => expect(toast).toHaveTextContent('Applied: Move Pizza Hut to Renewal.'));
    expect(within(toast).getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Needs your decision 3' })).toBeInTheDocument();

    // 3. The overdue task, done.
    await userEvent.click(screen.getByRole('button', { name: 'Mark “Call Pizza Hut” done' }));
    await waitFor(() => expect(toast).toHaveTextContent('Done: Call Pizza Hut.'));
    expect(screen.queryByRole('region', { name: /^Overdue/ })).toBeNull();
    expect(sent(spy, 'POST', '/work/todos/')).toEqual([{ title: 'Call the florist', priority: 'medium', due_date: null }]);
    expect(sent(spy, 'PATCH', '/tasks/41/')).toEqual([{ status: 'completed' }]);
  });
});
```

2. In "a manager reads the team": `stubWork(...)` becomes `stubFeed(...)` with the same options and `renderWork('/work/today', …)` becomes `renderWork('/work/mine', …)`.
3. In "Work at phone width": `stubWork()` becomes `stubFeed()`, the URL `/work/mine?task=41`, and the last line asserts the quick-add instead: `expect(screen.getByRole('button', { name: 'Add', hidden: true })).toHaveClass('min-h-11');`.
4. Replace `describe('Work: a manager decides what Revenact recommends', …)` with:

```tsx
describe('Work: a member decides what Revenact suggests', () => {
  it('adds one to their work, finds it in This week, and dismisses another for a reason of its own', { timeout: 30000 }, async () => {
    const { spy } = stubFeed();
    renderWork('/work/recommended', { nav: true });
    await waitFor(() => expect(where()).toBe('/work/mine?kind=suggestion'));
    const renewal = await screen.findByRole('article', { name: "Prepare Pizza Hut's renewal" });
    await userEvent.click(within(renewal).getByRole('button', { name: 'Add to my work' }));
    const toast = document.querySelector('[data-part="work-toast"]') as HTMLElement;
    await waitFor(() => expect(toast).toHaveTextContent("Added to your work: Prepare Pizza Hut's renewal."));
    expect(sent(spy, 'POST', '/work/recommendations/5/assign/')).toEqual([{ assignee_id: 1 }]);

    const tickets = screen.getByRole('article', { name: "Get Uber EMEA's urgent tickets moving" });
    await userEvent.click(within(tickets).getByRole('button', { name: 'Dismiss' }));
    await userEvent.selectOptions(within(tickets).getByLabelText('Reason'), 'other');
    await userEvent.type(within(tickets).getByLabelText('Say why'), 'Handled on the QBR call');
    await userEvent.click(within(tickets).getByRole('button', { name: 'Dismiss it' }));
    await waitFor(() => expect(toast).toHaveTextContent("Dismissed: Get Uber EMEA's urgent tickets moving."));
    expect(sent(spy, 'POST', '/dismiss/')).toEqual([{ reason: 'other', note: 'Handled on the QBR call' }]);

    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    const week = await screen.findByRole('region', { name: 'This week 3' });
    expect(within(week).getByRole('link', { name: "Prepare Pizza Hut's renewal" })).toBeInTheDocument();
    expect(week).toHaveTextContent('Recommended by Revenact');
    expect(screen.queryByRole('region', { name: /^Suggested/ })).toBeNull();
  });
});
```

5. Delete `describe('Recommended at phone width', …)` (My work's phone test covers suggestion rows). Keep "an admin tunes the recommender" unchanged. Update the file's header comment to describe My work.

In `src/e2e/agents.test.tsx` (imports: add `stubFeed` from `../features/work/testFeed` and `approvalItem` from `../features/work/testFeedFixtures`; drop `stubBrain`, `deskOf`, `SEGMENT_CREATE_ITEM`, `REC_AGENT_LIFECYCLE`, `REC_AGENT_PLAN` and `stubWork` if they end unused):

1. "applies the CS agent lifecycle change…": the first four lines become

```tsx
    const agents = stubAgents({ actions: [ACT_LIFECYCLE] });
    const feed = stubFeed({ decide: [approvalItem(ACT_LIFECYCLE)], recommendations: [], decisions: 'pass', passThrough: agents.spy });
    agents.onSettle(() => feed.decide.clear());
    const { store } = renderWork('/work/mine?kind=approval', { nav: true });
```

and `await userEvent.click(screen.getByRole('link', { name: 'Recommended' }));` becomes `await userEvent.click(screen.getByRole('link', { name: 'My work' }));`. The `findByText('Applied: Move Pizza Hut to Renewal.')` line stays (the toast says it).
2. "applies a plan start in Recommended…": rename to "applies a plan start on My work, then opens the plan from Activity" and its first four lines become

```tsx
    const agents = stubAgents({ actions: [ACT_PLAN_START] });
    const feed = stubFeed({ decide: [approvalItem(ACT_PLAN_START)], recommendations: [], decisions: 'pass', passThrough: agents.spy });
    agents.onSettle(() => feed.decide.clear());
    renderWork('/work/mine?kind=approval', { nav: true });
```

3. "approves an Ops segment in Waiting…": rename to "approves an Ops segment on My work, opens it from Activity, then undoes it"; its stub lines become

```tsx
    const segments = stubSegments({ segments: [...SEGMENTS, AGENT_SEGMENT] });
    const agents = stubAgents({ actions: [ACT_SEGMENT_CREATE], passThrough: segments });
    const feed = stubFeed({ decide: [approvalItem(ACT_SEGMENT_CREATE)], recommendations: [], decisions: 'pass', passThrough: agents.spy });
    agents.onSettle(() => feed.decide.clear());
    renderWork('/work/mine?kind=approval', { nav: true, segments: true });
```

step 1's waiting-status assertion becomes `await waitFor(() => expect(document.querySelector('[data-part="work-toast"]')).toHaveTextContent(\`Applied: ${ACT_SEGMENT_CREATE.title}.\`));`, and step 2's two lines that clicked the Work link and waited for `/work/today` are deleted (step 2 clicks Activity in the Work bar directly). Update the comments ("in Brain › Waiting" → "on My work").

- [ ] **Step 7: Run the Work suites and the ratchet**

Run: `npx tsc -b && npx vitest run src/pages/work src/components/work src/components/layout/WorkTabs.test.tsx src/features/work src/e2e/work.test.tsx src/e2e/agents.test.tsx src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS except possibly "keeps every baseline tight" in `uiRatchet.test.ts`, whose failure shows the received totals: copy every received number into `BASELINE` (they may only be lower). If any received total is **higher** than its baseline, a new file added an offence: find it with the test's "worst files" message and fix the code; never raise a baseline. Re-run until PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/work/KeepQueryRedirect.tsx src/pages/work/WorkRoutes.tsx src/pages/work/WorkRoutes.test.tsx src/features/work/workTabs.ts src/features/work/workTabs.test.ts src/components/layout/WorkTabs.tsx src/components/layout/WorkTabs.test.tsx src/features/work/rows.ts src/features/work/rows.test.ts src/features/work/workText.ts src/features/work/workText.test.ts src/features/work/recommended.ts src/features/work/recommended.test.ts src/components/work/houseRules.test.ts src/test/uiRatchet.test.ts src/e2e/work.test.tsx src/e2e/agents.test.tsx
git commit -m "feat(work): My work at /work/mine; Today and Recommended redirect into it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(The `git rm` in Step 4 already staged the deletions.)

---

### Task 12: One badge; Brain's Waiting tab hidden and redirected

**Files:**
- Create: `src/pages/brain/testWaitingRoute.tsx`
- Modify: `src/components/layout/Sidebar.tsx`, `src/components/layout/BrainTabs.tsx`, `src/features/brain/brainTabs.ts`, `src/pages/brain/BrainRoutes.tsx`, `src/pages/brain/testPages.tsx`, `src/pages/work/testPages.tsx`, `src/pages/rules/testPages.tsx`, `src/components/rules/NightsSection.tsx`, `src/pages/copilot/ChatView.tsx`, `src/features/work/recommended.ts`, `src/test/uiRatchet.test.ts`
- Delete: `src/components/work/useWorkCount.ts`, `src/components/work/useWorkCount.test.tsx`, `src/components/work/useRecommendedCount.ts`
- Test: `src/components/layout/Sidebar.test.tsx`, `src/components/layout/BrainTabs.test.tsx`, `src/features/brain/brainTabs.test.ts`, `src/pages/brain/BrainRoutes.test.tsx`, `src/pages/brain/Waiting.test.tsx`, `src/layouts/DashboardLayout.test.tsx`, `src/pages/copilot/ChatView.decisions.test.tsx`, `src/pages/rules/RulePage.test.tsx`, `src/e2e/brain.test.tsx`, `src/e2e/rules.test.tsx`, `src/e2e/work.test.tsx`, `src/features/work/recommended.test.ts`

**Interfaces:**
- Consumes: `useFeedCount`, `feedBadgeName`, `KeepQueryRedirect`.
- Produces: `WorkNavItem` to `/work/mine` with the feed badge; `BrainNavItem` with no badge; `BRAIN_TABS` without Waiting (`WAITING_TAB` stays exported for `askContext`); `/brain/waiting` and `/brain/review` → `/work/mine?kind=approval` (query kept); `waitingTestRoute()` and the `waitingPage?: boolean` option on `renderBrain`, `renderWork`, `renderRules`.

- [ ] **Step 1: Write the failing tests**

`src/components/layout/Sidebar.test.tsx`:
- Replace `describe('Sidebar Work item (Work spec §1.5)', …)` with:

```tsx
describe('Sidebar Work item (work in one place §5: one badge)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('goes to My work, is lit on every Work route, and names what waits', async () => {
    stubFeed();
    renderSidebar('csm', '/work/team');
    const link = await screen.findByRole('link', { name: 'Work, 4 to decide, 1 overdue' });
    expect(link).toHaveAttribute('href', '/work/mine');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(within(link).getByText('5')).toHaveClass('font-mono-brand');
  });

  it('shows no badge and no count at 0, and reads neither old count', async () => {
    const { spy } = stubFeed({ tasks: [], todos: [], decide: [], recommendations: [] });
    renderSidebar('csm', '/dashboard');
    await waitFor(() => expect(calls(spy, 'GET', '/work/feed/count/')).toHaveLength(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(screen.getByRole('link', { name: 'Work' }).querySelector('.bg-warning')).toBeNull();
    expect(calls(spy, 'GET', '/work/today/')).toEqual([]);
    expect(calls(spy, 'GET', '/work/recommendations/')).toEqual([]);
  });
});
```

- In `describe('Sidebar Brain item …')`: the first test becomes "gives every member one Brain item to /brain, with no badge, and none of the four questions": `renderSidebar('csm')`, `const brain = await screen.findByRole('link', { name: 'Brain' });`, keep the href and the loop, replace the count assertions with `expect(spy.mock.calls.some(([url]) => url.includes('/brain/waiting/count/'))).toBe(false);`. Delete the tests "reads the count again when a decision asks it to", "refreshes the badge on a route change…" and "shows no badge at 0…". In the `it.each` lit list, drop `'/brain/waiting'`. Drop the now-unused `countSpy`, `refreshWaitingCount` import and `renderSidebarWithRoutes` if nothing else uses it. Add `import { stubFeed } from '../../features/work/testFeed';`.

`src/features/brain/brainTabs.test.ts`: the list becomes `[['What changed', '/brain'], ["What's being done", '/brain/doing'], ['Customers', '/brain/customers']]` and the test is renamed "lists the questions, Customers last (Waiting moved to Work)"; in the `it.each` change `['/brain/waiting', '/brain/waiting']` to `['/brain/waiting', null]`; delete the `tabName` test and its import.

`src/components/layout/BrainTabs.test.tsx`: the `it.each` drops the `/brain/waiting` row and its body asserts the three tabs `['What changed', "What's being done", 'Customers']` (remove the `await tabs().findByRole('link', { name: 'Waiting on you, 3 waiting' })` line); delete the tests "shows the reader’s Me count…", "shows no badge and no count in the name at 0" and "refreshes its own badge on a route change…"; add

```tsx
  it('reads no Waiting count any more', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderTabs('/brain');
    expect(fetchMock).not.toHaveBeenCalled();
  });
```

(remove helpers such as `countOf` the deletions leave unused).

`src/pages/brain/BrainRoutes.test.tsx`: replace the two Waiting tests with

```tsx
  it.each(['/brain/waiting?scope=team', '/brain/review'])('sends %s to My work, Approvals, keeping the query', (url) => {
    renderAt(url, 'csm');
    expect(where()).toBe(url === '/brain/review' ? '/work/mine?kind=approval' : '/work/mine?scope=team&kind=approval');
  });
```

and delete the `vi.mock('./Waiting', …)` line.

`src/layouts/DashboardLayout.test.tsx`: drop `'/brain/waiting'` from the "adds no padding around the Brain" list.

`src/pages/copilot/ChatView.decisions.test.tsx` line 65: `expect(screen.getByRole('link', { name: 'Open in Work' })).toHaveAttribute('href', '/work/mine?kind=approval');`.

`src/pages/rules/RulePage.test.tsx` line 48: `.toEqual(['/work/mine?kind=approval', '/work/mine?kind=approval'])`.

`src/features/work/recommended.test.ts`: delete the `workBadgeName` test and import.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/layout src/features/brain/brainTabs.test.ts src/pages/brain/BrainRoutes.test.tsx src/layouts/DashboardLayout.test.tsx src/pages/copilot/ChatView.decisions.test.tsx src/pages/rules/RulePage.test.tsx --maxWorkers=2`
Expected: FAIL (old badges, tab and routes).

- [ ] **Step 3: One badge**

In `src/components/layout/Sidebar.tsx`: remove the `useWaitingCount`, `useWorkCount` and `workBadgeName` imports; add `import { useFeedCount } from '../work/useFeedCount';` and `import { feedBadgeName } from '../../features/work/feed';`.

```tsx
/** The Brain (brain UI spec 2026-10-06 §1.3): one item for every member, to
 *  /brain, lit on every Brain route. No badge: what waits on the reader
 *  lives in Work (work in one place §5). Exported for the Brain's journeys. */
export function BrainNavItem({ expanded = false }: { expanded?: boolean }) {
  const location = useLocation();
  return <NavItem to="/brain" icon={<Brain className="w-5 h-5" aria-hidden="true" />} label="Brain" forceActive={isBrainPath(location.pathname)} expanded={expanded} />;
}

/** Work (work in one place §5): one item to My work, lit on every Work
 *  route, with the one badge (decisions waiting plus overdue tasks) named
 *  "Work, 3 to decide, 1 overdue" (Decision 12). Exported for the journeys. */
export function WorkNavItem({ expanded = false }: { expanded?: boolean }) {
  const userId = useAppSelector((state) => state.auth.user?.id ?? null);
  const count = useFeedCount(userId);
  const location = useLocation();
  return (
    <NavItem
      to="/work/mine"
      icon={<ListTodo className="w-5 h-5" aria-hidden="true" />}
      label="Work"
      badge={count?.badge}
      badgeName={count ? feedBadgeName(count.decide, count.overdue) : undefined}
      forceActive={isWorkPath(location.pathname)}
      expanded={expanded}
    />
  );
}
```

Delete `workBadgeName` from `src/features/work/recommended.ts`. Delete the badge hooks:

```bash
git rm src/components/work/useWorkCount.ts src/components/work/useWorkCount.test.tsx src/components/work/useRecommendedCount.ts
```

- [ ] **Step 4: Hide Brain's Waiting tab and redirect it**

`src/features/brain/brainTabs.ts`: remove the Waiting entry from `BRAIN_TABS` (keep `export const WAITING_TAB = '/brain/waiting';` with the comment "Waiting on you moved to Work (work in one place §5); kept for Ask history, which may name it."), delete the `waiting` line in `brainTabOf`, delete `tabName`.

`src/components/layout/BrainTabs.tsx`:

```tsx
import { useLocation } from 'react-router-dom';
import { BRAIN_TABS, brainTabOf, tabSearch } from '../../features/brain/brainTabs';
import { Tabs } from '../ui';

/** The Brain's tabs (brain UI spec 2026-10-06 §1.1), drawn by BrainAskLayout's
 *  PageHeader into the bar: What changed, What's being done and Customers,
 *  as links carrying `?scope=`. Waiting on you moved to Work (work in one
 *  place §5). The Knowledge graph lights none. */
export function BrainTabs() {
  const location = useLocation();
  const search = tabSearch(location.search);
  return <Tabs label="Brain" value={brainTabOf(location.pathname) ?? ''} items={BRAIN_TABS.map((tab) => ({ key: tab.path, label: tab.label, to: `${tab.path}${search}` }))} />;
}
```

`src/pages/brain/BrainRoutes.tsx`: remove the `WaitingPage` import and its `<Route path="waiting" …>` inside the layout; import `KeepQueryRedirect` from `../../components/work/KeepQueryRedirect`; replace the `review` redirect and add the `waiting` one next to it:

```tsx
      <Route path="waiting" element={<KeepQueryRedirect to="/work/mine" set={{ kind: 'approval' }} />} />
      <Route path="review" element={<KeepQueryRedirect to="/work/mine" set={{ kind: 'approval' }} />} />
```

Update its doc comment: "/brain/waiting and /brain/review redirect to My work's Approvals (work in one place §5)."

`src/components/rules/NightsSection.tsx` line 106: `<Link to="/work/mine?kind=approval" className={QUIET}>`.

`src/pages/copilot/ChatView.tsx` line 282: `<Link to="/work/mine?kind=approval" …>Open in Work</Link>` (the link text changes from "Waiting on you").

- [ ] **Step 5: Keep Waiting's own page tests alive until delivery 2**

`src/pages/brain/testWaitingRoute.tsx`:

```tsx
// Test-only: /brain/waiting redirects to Work since work in one place
// delivery 1, but WaitingPage stays until delivery 2 deletes it. This route
// mounts it where it used to be, so its own tests still run. Opt in with
// `waitingPage: true` on renderBrain, renderWork or renderRules.
/* eslint-disable react-refresh/only-export-components */
import { Route } from 'react-router-dom';
import { Where } from '../organizations/testList';
import { BrainAskLayout } from './ask/BrainAskLayout';
import { WaitingPage } from './Waiting';

export function waitingTestRoute() {
  return (
    <Route path="/brain/waiting" element={<BrainAskLayout />}>
      <Route
        index
        element={
          <>
            <WaitingPage />
            <Where />
          </>
        }
      />
    </Route>
  );
}
```

In `src/pages/brain/testPages.tsx`, `src/pages/work/testPages.tsx` (`renderWork`) and `src/pages/rules/testPages.tsx` (`renderRules`): add `waitingPage = false` to the options (typed `waitingPage?: boolean`) and, as the first child of `<Routes>`, `{waitingPage ? waitingTestRoute() : null}` (import `waitingTestRoute` from the brain folder's `testWaitingRoute`; the path is `./testWaitingRoute` from `pages/brain`, `../brain/testWaitingRoute` from `pages/work` and `pages/rules`).

`src/pages/brain/Waiting.test.tsx`: change the import to `import { renderBrain as renderBrainBase } from './testPages';` and add under the imports:

```tsx
/** WaitingPage, mounted where it lived (work in one place D1 redirects the route). */
const renderBrain = (url: string, options: Parameters<typeof renderBrainBase>[1] = {}) => renderBrainBase(url, { ...options, waitingPage: true });
```

Any Waiting test that asserts the Brain tab's "Waiting on you, n waiting" name or the sidebar's "Brain, n waiting" badge: delete that assertion (the badges are gone); its other steps stay.

`src/e2e/rules.test.tsx` step 7: `renderRules('/brain/review', { nav: true });` becomes `renderRules('/brain/waiting?scope=me', { nav: true, waitingPage: true });` and the following `await waitFor(() => expect(where()).toBe('/brain/waiting?scope=me'));` is deleted.

`src/e2e/brain.test.tsx`: replace `describe('Brain: Waiting on you', …)` with

```tsx
describe('Brain: Waiting on you moved to Work (work in one place §5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it.each(['/brain/waiting?scope=me', '/brain/review'])('%s lands on My work, Approvals', async (url) => {
    stubFeed();
    renderWork(url, { brain: true, nav: true });
    await waitFor(() => expect(where()).toMatch(/^\/work\/mine\?/));
    expect(new URLSearchParams(where()?.split('?')[1]).get('kind')).toBe('approval');
    expect(await screen.findByRole('button', { name: 'Approvals' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('article', { name: 'Move Pizza Hut to Renewal' })).toBeInTheDocument();
  });
});
```

(imports: `stubFeed` from `../features/work/testFeed`; `renderWork`, `where` from `../pages/work/testPages` (if `where` is already imported from the brain helpers, import the work one as the single `where`: both read the same `Where` test id); drop imports the deleted block leaves unused, as `npx tsc -b` reports.)

`src/e2e/work.test.tsx`: in the "adds a to-do, approves an agent action and finishes a task" journey, render with `{ nav: true, sidebarItem: true, role: 'csm' }` and add the badge steps: after `await screen.findByRole('region', { name: 'No date 1' });` add `expect(await screen.findByRole('link', { name: 'Work, 4 to decide, 1 overdue' })).toHaveAttribute('href', '/work/mine');`; after the decide group reads 3 add `expect(await screen.findByRole('link', { name: 'Work, 3 to decide, 1 overdue' })).toBeInTheDocument();`; after Done add `expect(await screen.findByRole('link', { name: 'Work, 3 to decide' })).toBeInTheDocument();`. Rename the test "adds a to-do, approves an agent action, finishes a task, and the badge drops".

- [ ] **Step 6: Run the touched suites and the ratchet**

First run `npx tsc -b` and remove every import it reports unused in the files this task touched (for example `stubWork` in `Sidebar.test.tsx`, `CS_LIFECYCLE_ITEM`, `MY_QUESTION`, `WAITING_NOW` in `e2e/brain.test.tsx`, `useWaitingCount` anywhere outside Brain's own Waiting files). Then:

Run: `npx tsc -b && npx vitest run src/components/layout src/features/brain src/pages/brain src/layouts src/pages/copilot src/pages/rules src/components/rules src/e2e src/features/work src/components/work src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS, after lowering `BASELINE` in `uiRatchet.test.ts` to the received totals if "keeps every baseline tight" fails with lower numbers (never raise one).

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.tsx src/components/layout/BrainTabs.tsx src/components/layout/BrainTabs.test.tsx src/features/brain/brainTabs.ts src/features/brain/brainTabs.test.ts src/pages/brain/BrainRoutes.tsx src/pages/brain/BrainRoutes.test.tsx src/pages/brain/testWaitingRoute.tsx src/pages/brain/testPages.tsx src/pages/brain/Waiting.test.tsx src/pages/work/testPages.tsx src/pages/rules/testPages.tsx src/pages/rules/RulePage.test.tsx src/components/rules/NightsSection.tsx src/pages/copilot/ChatView.tsx src/pages/copilot/ChatView.decisions.test.tsx src/layouts/DashboardLayout.test.tsx src/features/work/recommended.ts src/features/work/recommended.test.ts src/e2e/brain.test.tsx src/e2e/rules.test.tsx src/e2e/work.test.tsx src/test/uiRatchet.test.ts
git commit -m "feat(work): one Work badge from the feed count; Brain Waiting moves to My work

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Docs and the full check

**Files:**
- Modify: `docs/04-app-flow.md`, `docs/03-ui-ux-design.md`, `.agents/workflows/repo-architecture.md`

- [ ] **Step 1: App flow (`docs/04-app-flow.md`)**

- Route table: replace the `/work, /work/*` row with "`WorkRoutes` (`pages/work/`): My work (`/work/mine`), Team and Activity; `/work` and anything unknown under it redirect to `/work/mine`; `/work/today` redirects to `/work/mine` and `/work/recommended` to `/work/mine?kind=suggestion`, both keeping the query and history state (so `?task=<id>` from the bell still opens the panel)". Replace the `/work/today` row with a `/work/mine` row: "`MyWorkPage`: `GET /work/feed/` (`?kind=` from the chip), eight groups, quick-add `POST /work/todos/`, inline actions on each item's existing route". Replace the `/brain/waiting` row with "redirects to `/work/mine?kind=approval` (query kept); `/brain/review` too".
- Sidebar paragraph: Work goes to `/work/mine`; its badge is `GET /work/feed/count/` `badge` ("Work, 3 to decide, 1 overdue"); Brain has no badge.
- Rename §4.11b to "Work (My work, Team, Activity and the task panel)" and replace its Today and Recommended bullets with a **My work** bullet covering: the feed's groups and order, chips and their kinds, Show more (`?group=&cursor=`), per-source failures and Try again (Decision 4), `hidden`, quick-add and its refusals, every row kind and the route each action calls (contract §2.3), the toast and Undo (Decisions 1, 2), 409 and lost access (Decision 6), the gear, and the to-do panel (Decision 10). Keep the Team and panel bullets; in the panel bullet add to-dos. In the "taskChanged()" paragraph replace "Today" with "My work" and the badge's two reads with `GET /work/feed/count/`, and add `feedChanged()` (rule reviews, decided suggestions: badge only).
- In the Brain section (around "Waiting on you (`/brain/waiting`…") add one sentence at its start: "Since work in one place delivery 1 this route redirects to My work's Approvals; the page below is kept until delivery 2 removes it." In §"Decide" of the agents flow, "Apply or Reject in Recommended or Waiting" becomes "Apply or Reject on My work".
- Slices/hooks list: replace `useToday`, `useWorkCount`, `useRecommended`, `useRecommendedCount` with `useFeed`, `useFeedCount`.

- [ ] **Step 2: UI/UX (`docs/03-ui-ux-design.md`)**

Replace "### Work: Today, Team and the task panel" and "### Work: Recommended, and Settings › Work › Recommendations" (keep the settings paragraphs under a "### Settings › Work › Recommendations" heading) with "### Work: My work, Team and the task panel" describing: quick-add card on top (labelled box, Add as the one primary, More disclosure: record search, due date, priority, Who does it after a record); the chip row (All · Tasks · To-dos · Approvals · Questions · Suggested, `aria-pressed`, sideways-scrolling on phones); groups as bordered `ListCard`s titled with their count; rows flat and divided, an icon by kind, the title, one meta line (record · due or from · date · Only you with a lock); task rows lead with the circle Done; approval and review rows reuse `AgentActionDecision` / `ReviewDecision`; suggestion rows Add to my work, Assign, Dismiss (Assign and Dismiss in ⋯ below sm); the failure notice card in a group's place; the empty state "Nothing waiting on you."; the toast (bottom, overlay surface, text, link, Undo, Close; no timer; focus rules); the gear for `manage_org_settings`; the task panel on a to-do. In "### Brain: Waiting on you" add a first line: "Moved to Work › My work (Approvals) in work in one place delivery 1; the tab and badge are gone, the route redirects."

- [ ] **Step 3: Architecture (`.agents/workflows/repo-architecture.md`)**

In the `src/` tree add, after the `brain/` components line:

```
│   │   ├── work/               ← Work: My work (useFeed, useFeedCount, FeedGroups, FeedRow and its kinds, QuickAdd, WorkToast, FeedSkeleton, KeepQueryRedirect), Team and Activity parts, the task panel (TaskPanelHost, TaskSheet, TaskFields, RecordEditor, TaskFacts); own house-rules suite
```

and after the `brain/` pages line:

```
│       ├── work/               ← WorkRoutes; MyWorkPage (/work/mine), TeamPage, ActivityPage; /work/today and /work/recommended redirect; testPages.tsx (renderWork, renderPage)
```

In the route tree add `├── work/*                     → WorkRoutes (mine, team, activity; today and recommended redirect to mine)` and change the `brain/*` line's parenthesis to "(every page open to all; `/brain/waiting` and `/brain/review` redirect to `/work/mine?kind=approval`, `/brain/initiatives` to Doing)". In the `pages/brain/` line remove "WaitingPage, " and add "WaitingPage (unrouted until delivery 2; tested through testWaitingRoute)".

- [ ] **Step 4: The full check**

Run, in order, each to a clean finish:

```bash
npx tsc -b
npm run lint
npx vitest run --maxWorkers=2
npm run build
```

Expected: tsc and lint report nothing; every test file passes (including `src/test/uiRatchet.test.ts` with `BASELINE` equal to the totals, and `src/components/work/houseRules.test.ts`); the build writes `dist/`. Fix anything that fails in the task's own files, then re-run the whole list.

- [ ] **Step 5: By eye (spec §7)**

Start the backend worktree `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/work-one-be` on its branch and this app (`npm run dev`), sign in, and look at `/work/mine` at 1440px and 390px wide in both themes: quick-add plain and with a record, every chip, Show more on a long group, Done and Undo, an approval, a review, a suggestion's Add, the gear, `/work/today?task=<id>` and `/brain/waiting`. Note anything off in the PR description; fix what is in scope.

- [ ] **Step 6: Commit**

```bash
git add docs/04-app-flow.md docs/03-ui-ux-design.md .agents/workflows/repo-architecture.md
git commit -m "docs(work): My work, one badge and the Brain Waiting move

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Contract questions (not changed here; raise with the backend)

1. **Campaign review counts.** Contract §2.2 gives a rule review's `detail.counts` as `{"people", "records"}`, but Brain Waiting's campaign reviews carry `{reach, skipped}` (a tally). This plan types `detail` as Waiting's own union (`RuleReviewItem['detail']`) and renders it with `reviewCountsText`. Confirm the feed sends Waiting's exact detail for campaign reviews. **Resolved** by backend contract commit 7805f33: a rule review's counts are per kind, survey `{people, records}` and campaign `{reach, skipped}`.
2. **A manager's team suggestions.** `suggestion` items are `rec_access.decidable(reader, "me")` only, and `/work/recommended` now redirects to My work. A manager or view-all reader who decided recommendations in a report's queue (Recommended's "My team" scope) has nowhere to do so in delivery 1, and spec §4.3's Team queue (delivery 2) lists only decide kinds and overdue tasks. Is losing team-scope suggestions intended, or should the Team queue (or the feed) carry them? **Resolved** by spec 8b750a42: the Team queue in delivery 2 includes suggestions.
3. **"Ask the agent"** (Brain Waiting, Company, view-all) disappears with the Waiting redirect in delivery 1 and returns on Team in delivery 2. Confirm both deliveries ship together, or say if a stopgap is wanted. **Resolved** by spec 8b750a42: delivery 1 and delivery 2 merge back to back; the gap is accepted.
4. **`hidden` after a group retry.** `GET /work/feed/?group=` answers no `hidden`, so a retried source's unreadable items are not reflected until the next full read. Acceptable, or should the page answer carry `hidden` for its kinds? **Accepted** as this plan's decision (Decision 6).
5. **404 versus 409 on rule reviews.** `POST /rules/reviews/<id>/approve|skip/` answers 404 `{"detail": "Not found."}` and 409 with the same treatment in `ReviewDecision`; the feed cannot tell lost access from decided-elsewhere for reviews, so they never add to `hidden` (Decision 6). A `code` on those bodies would let it. **Accepted** as this plan's decision (Decision 6).

## Self-review

- **Spec coverage (§5 and §8 item 1 frontend):** routes and redirects with the query kept (Task 11, Decision 15); quick-add plain and with record/date/priority/assignee (Task 8); chips in the URL (Tasks 2, 10); groups in order, empty hidden, counts, Show more (Tasks 2, 4, 10); rows per kind with icon, title, record link, from/at or due line, inline actions (Tasks 5 to 7), reusing `AgentActionDecision`, `ReviewDecision`, the task panel and the recommendation forms; Only you with a lock (Task 5); toast and Undo (Task 10, Decisions 1, 2); 409 and lost access (Tasks 6, 7, 10); per-source partial failure (Tasks 2, 4, 10); empty state with quick-add (Task 10); phone layout (Tasks 7, 10); gear (Task 10); one badge (Tasks 4, 12); Brain tab hidden, badge removed, its route redirected, its links moved (Task 12); errors §6 (quick-add failure keeps text and focus, non-self assignee sentence under Who does it, lost access); testing §7 frontend (unit per row kind, integration for quick-add, chips, Show more, 409, partial failure, redirects, one badge; one e2e journey matching the backend's; by eye). Not in delivery 1 by the brief: Team queue, Copilot Next up, bell links, Settings toggles, deleting Waiting code.
- **Placeholder scan:** every code step carries its code; the test-maintenance steps name each file, test and replacement.
- **Type consistency:** `FeedItem`/`TaskFeedItem`/`ApprovalFeedItem`, `FeedGroupKey`, `FeedChip`, `FailedSlot`, `Settle`, `Toast`, `FeedRowProps`, `TodoForm`, `TodoAnswer` are defined once (Tasks 1, 2, 6, 7, 10) and used with the same names and fields after.
