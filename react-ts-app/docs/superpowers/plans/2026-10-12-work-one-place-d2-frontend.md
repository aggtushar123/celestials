# Work in one place, delivery 2 ("Team and clean-up"): frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Work › Team gets a My team / Company switch and a "Waiting on your team" queue (with Ask the agent at Company scope for view-all) above today's per-person counts; Copilot's Cockpit gets one "Next up" card in place of My tasks and the sidebar's Questions for you; Brain › Waiting's code is deleted; Settings › Work › Recommendations loses the three retired switches; links and docs follow.

**Architecture:** The queue reuses My work's pieces. `useFeed`'s body becomes `useFeedSource(key, read, readGroup)`, so `useFeed(chip)` and `useTeamQueue(scope)` are two thin callers. `FeedGroups` takes the group order, labels and heading level as props, the rows honour `actions` for Done and Add, and the meta line names who an item is for. My work's toast and row-leaving rules move into one hook (`useFeedSettle`) that Team's queue shares. Next up reads `GET /work/feed/` without suggestions and shows its first five rows with the same row components, a question answered in place. No Redux for any of it.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), react-router 7, Tailwind v4 tokens, Vitest + Testing Library (jsdom) + user-event, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-12-work-one-place-design.md` (§5, §8 item 2, frontend). **API contract (binding, read-only):** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/work-two-be/docs/superpowers/plans/2026-10-12-work-one-place-d2-api.md` (backend branch `feat/work-one-place-d2`), on top of delivery 1's `.../work-one-be/docs/superpowers/plans/2026-10-12-work-one-place-api.md`. Read the D2 contract's "Decisions narrowing the spec" first: D1–D15 are requirements here. Delivery 1's plan (`docs/superpowers/plans/2026-10-12-work-one-place-frontend.md`) holds the house style this plan extends.

## Global Constraints

- **Worktree and branch.** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/work-two-fe`, branch `feat/work-one-place-d2`, stacked on `feat/work-one-place` (PR #138). `node_modules` is a symlink: never commit it. Always `git add <explicit paths>` (and `git rm` for deletions), never `git add -A` or `git add .`. Never merge, never open a PR, never touch the servers on ports 8000, 8001 or 5174 (a by-eye run uses its own ports, Task 12).
- **Never run prettier. Never use `git stash`** (the stash stack is shared across worktrees).
- **Commands** (foreground): `npx vitest run <path> --maxWorkers=2`, `npx vitest run --maxWorkers=2`, `npx tsc -b`, `npm run lint`, `npm run build`.
- **Every commit message is a conventional commit and ends with exactly this line:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Contract shapes are binding.** Test stubs answer exactly the contract's shapes and sentences.
- **Tokens only** (`src/test/houseRules.ts` `RAW`): no hex, `rgb()`, named palette colours.
- **Type sizes 11/13/15 only**, through `TYPE.*`; no `font-bold`, no `shadow-sm`/`shadow-md`, no `disabled:opacity-*`, no literal `font-mono-brand` in a `.tsx` (figures use `NUM`). The UI ratchet (`src/test/uiRatchet.test.ts`) must end each task with totals **equal** to `BASELINE`: deleting old-style code lowers totals, so lower the baseline to the new totals in the same commit; new code adds zero offences (never raise a baseline).
- **Kinso look:** bordered quiet cards (`Card`, `ListCard`), rows flat and `divide-y` inside one `ListCard`, never a card in a card; one primary per surface (My work's quick-add **Add**; Team and the Cockpit's Next up have none: Ask the agent is bordered, frontend Decision 6); Lucide icons only, each `aria-hidden="true"`; no emoji.
- **44px targets** on phones for every `<button>`, `<Link>`, `<select>`, `<input>`, `<textarea>`: use `BUTTON`, `PRIMARY`, `QUIET`, `ICON_BUTTON`, `INPUT`, `FILTER_SELECT`, `LINK`, `INLINE_TARGET` or a local `const` built from one.
- **No em dash (`—`) anywhere** in `src/components/work/`, `src/pages/work/`, `src/features/work/`, comments and tests included.
- **Copy:** sentence case; the contract's and this plan's sentences word for word; server refusals shown verbatim.
- **States:** every list has a skeleton (not a spinner), an error with Try again, and an empty state.
- **Motion:** none added.
- **Privacy:** the page never shows a to-do or a draft in the Team queue (the server never sends one; tests pin that the page adds none); rows show only what the item carries.
- **Testing:** unit + integration + e2e (jsdom, `src/e2e/`), only `fetch` stubbed, contract-shaped. Never mock the store.

## Decisions (frontend, where the spec and the contract leave a choice)

1. **Team's switch is My team · Company** (contract D2). `useBrainScope({ without: 'me' })` drops Me from Team's offer without forgetting a Brain reader's stored Me, and reads an old `?scope=me` link as "no scope" (no lost-access notice). A reader with one scope sees its name as text (`ScopeSwitch` already does this). Cost: low.
2. **The queue sits above the per-person counts**, as one section headed "Waiting on your team" (My team) or "Waiting on the company" (Company), its groups headed "To decide", "Overdue" and "Suggested" at `h3`. Empty: "Nothing is waiting on your team." / "Nothing is waiting on the company." Cost: trivial.
3. **"For" line.** The meta line starts "For Carl CSM", or "For the whole company" when `for` is null (contract D6). Only Team items carry `for`. Cost: trivial.
4. **Rows honour `actions`.** A task row without `done` has no Done circle (its title still opens the panel); a suggestion row without `add` has no "Add to my work". My work is unchanged (its rows always carry them). Cost: low.
5. **Toasts and Undo on Team** are My work's (one `WorkToast`, Undo for an applied agent action within its window), shared through `useFeedSettle`. Cost: low.
6. **Ask the agent** is a bordered button (not primary) in the queue's header, Company scope, `view_all_accounts` only, with the hint "Runs the Ops agent now. Uses AI credits." Its answer goes to a status line; a refusal to an alert. It reads the queue again and fires `feedChanged()` (and `taskChanged()` if anything applied). Held after a success until the queue's next answer lands (Waiting's double-spend guard). Cost: low.
7. **Next up** (Cockpit, in place of My tasks): `GET /work/feed/?kind=approval,rule_review,question,draft,task,todo`, the first five of decide, then overdue, then today; heading "Next up" with the total of those three groups; "Open Work" links `/work/mine`. Buttons act in place with My work's rows; a question is answered inline (the sidebar's old form, now on tokens); no Undo (Undo lives on My work); a status line says what happened. A failure shows the card's own Try again and never blanks the Cockpit. Empty: "Nothing waiting on you." Cost: low.
8. **Questions for you leaves the Copilot sidebar** (spec §5); Communications keeps its own. `knowledgeSlice.fetchMyQuestions` and `mine` lose their only reader and are deleted. Cost: low.
9. **Brain › Waiting's shared helpers move**: `recordPath` and `reviewCountsText` to `features/brain/deskText.ts`; `RuleReviewDetail` stays in `brainTypes`; Ask history keeps naming the old tab (`WAITING_TAB`, `WAITING_LABEL`, `askContext`'s `waiting`), as delivery 1 ruled. Cost: low.
10. **Bell links**: the server now sends `/work/mine?task=<id>`, `/work/mine?kind=suggestion` and `/work/mine?kind=approval` (contract §4); old notifications keep their links and the redirects stay. The bell already stamps `OPENED_HERE` on any `?task=` link; a test pins it for the new path. The My work gear points at `/settings/work` (the Settings PR's home for Work settings). Cost: none.
11. **Retired settings switches**: Settings › Work › Recommendations lists Renewal due, Health drop, Urgent tickets and Anomalies only. Old decided rows may say `dismiss_reason: 'retired'`; the type allows it, nothing shows it. Cost: trivial.

## File Structure

**Create**
- `src/components/work/useFeedSource.ts`: the feed reader behind `useFeed` and `useTeamQueue`.
- `src/components/work/useTeamQueue.ts`, `useTeamQueue.test.tsx`
- `src/components/work/useFeedSettle.ts`: the toast and row-leaving rules shared by My work and Team.
- `src/components/work/TeamQueue.tsx`: Team's "Waiting on your team" section.
- `src/components/work/AskTheAgent.tsx`
- `src/components/work/NextUpCard.tsx`, `NextUpCard.test.tsx`
- `src/components/work/InlineAnswer.tsx`
- `src/features/work/teamQueue.ts`, `teamQueue.test.ts`: the queue's words and pure rules.
- `src/features/brain/deskText.ts`, `deskText.test.ts`

**Modify**
- `src/features/work/workTypes.ts`, `workApi.ts` (+ test), `feed.ts` (generic helpers, new words), `testFeed.ts`, `testFeedFixtures.ts`, `testWork.ts`, `testWorkFixtures.ts`, `workSettings.ts`, `recommended.ts` (comments only).
- `src/components/work/useFeed.ts`, `FeedGroups.tsx`, `FeedRow.tsx`, `FeedRowParts.tsx`, `FeedTaskRow.tsx`, `FeedSuggestionRow.tsx`, `FeedDecideRows.tsx`, `taskChanges.ts`, `houseRules.test.ts`.
- `src/pages/work/MyWork.tsx`, `Team.tsx` (+ tests), `testPages.tsx`.
- `src/components/brain/useBrainScope.ts` (+ test), `src/features/brain/brainScope.ts` (+ test), `brainTypes.ts`, `brainApi.ts`, `testBrain.ts` (+ test), `src/components/brain/houseRules.test.ts`, `DoingPlanRow.tsx`, `ScoresPanel.tsx`, `SentimentPanel.tsx`.
- `src/components/agents/AgentCard.tsx`; `src/pages/settings/AgentsSettingsPage.test.tsx`.
- `src/pages/copilot/CockpitView.tsx` (+ test), `CopilotSidebar.tsx`, `Index.tsx`, `cockpitApi.ts`, `cockpitTypes.ts`; `src/features/knowledge/knowledgeSlice.ts` (+ test if it covers `fetchMyQuestions`).
- `src/pages/brain/BrainRoutes.tsx`, `testPages.tsx`, `ask/brainStarters.test.tsx`; `src/pages/rules/testPages.tsx`; `src/e2e/rules.test.tsx`, `src/e2e/work.test.tsx`.
- `src/components/layout/Navbar.test.tsx`; `src/features/notifications/types.ts` (comments).
- `src/test/uiRatchet.test.ts` (baseline lowered after deletions).
- Docs (Task 12): `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`.

**Delete:** `src/pages/brain/Waiting.tsx`, `Waiting.test.tsx`, `testWaitingRoute.tsx`; `src/components/brain/WaitingDesk.tsx`, `WaitingRow.tsx`, `WaitingRow.test.tsx`, `WaitingSkeleton.tsx`, `useWaiting.ts`, `useWaiting.test.tsx`, `useWaitingCount.ts`, `useWaitingCount.test.tsx`; `src/features/brain/waitingText.ts`, `waitingText.test.ts`, `testWaitingFixtures.ts`; `src/pages/copilot/CopilotSidebar.questions.test.tsx`.

---

### Task 1: Contract types and API wrappers

**Files:**
- Modify: `src/features/work/workTypes.ts`, `src/features/work/workApi.ts`
- Test: `src/features/work/workApi.test.ts`

**Interfaces:**
- Produces (types): `TeamScope = 'team' | 'company'`; `TeamGroupKey = 'decide' | 'overdue' | 'suggested'`; `FeedItemBase.for?: PersonRef | null` (Team queue only); `TeamQueuePayload extends FeedPayload { scope: TeamScope }`; `TeamQueuePage extends FeedPage { scope: TeamScope }`; `DecidedRecommendation.dismiss_reason: DismissReason | 'retired' | ''`. `TodayPayload` (and `TodayGroup` if nothing else uses it) deleted.
- Produces (API): `fetchTeamQueue(scope: TeamScope): Promise<TeamQueuePayload>`, `fetchTeamQueueGroup(scope: TeamScope, group: FeedGroupKey, cursor?: string | null): Promise<TeamQueuePage>`, `answerQuestion(id: number, body: string): Promise<unknown>`. `fetchToday` deleted.

- [ ] **Step 1: Write the failing tests**

In `src/features/work/workApi.test.ts`, remove `fetchToday` from the import and delete its request test; add to the "feed routes" `describe` (reusing its `seen` fetch spy):

```ts
  it('reads the Team queue, one of its groups, and answers a question', async () => {
    await fetchTeamQueue('team');
    await fetchTeamQueueGroup('company', 'overdue', 'abc');
    await fetchTeamQueueGroup('team', 'decide');
    await answerQuestion(12, 'Legal signs off.');
    expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual([
      'GET /work/feed/team/?scope=team',
      'GET /work/feed/team/?scope=company&group=overdue&cursor=abc',
      'GET /work/feed/team/?scope=team&group=decide',
      'POST /questions/12/answer/',
    ]);
    expect(seen[3].body).toEqual({ body: 'Legal signs off.' });
  });
```

(add `answerQuestion, fetchTeamQueue, fetchTeamQueueGroup` to the import).

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/features/work/workApi.test.ts --maxWorkers=2`
Expected: FAIL (`fetchTeamQueue` is not exported).

- [ ] **Step 3: The types**

In `src/features/work/workTypes.ts`, after the delivery 1 feed types:

```ts
// Work in one place, delivery 2 (contract revenact-backend
// docs/superpowers/plans/2026-10-12-work-one-place-d2-api.md).

export type TeamScope = 'team' | 'company';
export type TeamGroupKey = Extract<FeedGroupKey, 'decide' | 'overdue' | 'suggested'>;

/** GET /work/feed/team/: three groups (decide, overdue, suggested), every
 *  item with `for`. */
export interface TeamQueuePayload extends FeedPayload {
  scope: TeamScope;
}

/** GET /work/feed/team/?group=<key>[&cursor=]. */
export interface TeamQueuePage extends FeedPage {
  scope: TeamScope;
}
```

In `FeedItemBase`, add:

```ts
  /** Team queue only (contract D6): who it waits on; null is the whole company. */
  for?: PersonRef | null;
```

In the decided recommendation shape, `dismiss_reason: DismissReason | 'retired' | '';` with the comment `/** 'retired': closed by the delivery 2 migration, never chosen by a person. */`. Delete `TodayPayload`; run `grep -rn "TodayGroup" src` and delete `TodayGroup` too if only `TodayPayload` and test stubs used it (the stub's use goes in Task 2).

- [ ] **Step 4: The wrappers**

In `src/features/work/workApi.ts`: delete `fetchToday` (and `TodayPayload` from the type import); add `TeamQueuePage, TeamQueuePayload, TeamScope` to the type import; at the end of the delivery 1 block:

```ts
// Work in one place, delivery 2 (contract 2026-10-12-work-one-place-d2-api.md).
export const fetchTeamQueue = (scope: TeamScope) => apiFetch<TeamQueuePayload>(`/work/feed/team/?${query({ scope })}`);
/** One group's next page; without a cursor, its first page (a failed group's Try again). */
export const fetchTeamQueueGroup = (scope: TeamScope, group: FeedGroupKey, cursor: string | null = null) =>
  apiFetch<TeamQueuePage>(`/work/feed/team/?${query({ scope, group, ...(cursor ? { cursor } : {}) })}`);
/** A question answered in place (Next up): POST /questions/<id>/answer/. */
export const answerQuestion = (id: number, body: string) => apiFetch<unknown>(`/questions/${id}/answer/`, { method: 'POST', body: { body } });
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run src/features/work/workApi.test.ts --maxWorkers=2 && npx tsc -b`
Expected: PASS. `tsc` may report `fetchToday`/`TodayPayload` uses in `testWork.ts`/`testWork.test.ts`: leave those for Task 2 only if you run Task 2 next in the same session; otherwise delete the stub's `/work/today/` handler, `failToday`, `today()` and its test now (Task 2 Step 3 lists them).

- [ ] **Step 6: Commit**

```bash
git add src/features/work/workTypes.ts src/features/work/workApi.ts src/features/work/workApi.test.ts
git commit -m "feat(work): Team queue and answer types and wrappers; Today's read removed

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The stubs: the Team queue, answers, and Today gone

**Files:**
- Modify: `src/features/work/testFeed.ts`, `src/features/work/testFeedFixtures.ts`, `src/features/work/testWork.ts`, `src/features/work/testWork.test.ts`
- Test: `src/features/work/testFeed.test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces (fixtures): `teamItem<T extends FeedItem>(item: T, person: PersonRef | null, actions?: T['actions']): T`; `TEAM_REC: RecommendationRow` (id 61, `health_drop`, Uber EMEA, recipient Carl, suggested Carl); `TEAM_APPROVAL`, `TEAM_QUESTION`, `TEAM_TASK`, `TEAM_SUGGESTION`, `TEAM_ITEMS: FeedItem[]` (for Carl).
- Produces (stub): `FeedStub.team?: Partial<Record<TeamScope, FeedItem[]>>`, `FeedStub.queueHidden?: number`, `FeedStub.failQueue?: number`; `GET /work/feed/team/` and its pages in the contract's shapes and refusals; approvals and questions in the queue decide through the same handlers as My work's; `POST /questions/<id>/answer/` removes the question from either list (`400 {"detail": "Say something."}` for a blank body). `stubWork` no longer answers `/work/today/` or `/brain/waiting/count/`.

- [ ] **Step 1: Write the failing stub tests**

Append to `src/features/work/testFeed.test.ts` (it already has a `get`/`post` helper over the stub's `spy`; if not, use `await fetch(...)` against `http://localhost/api/v1/...` and `await response.json()` as its other tests do):

```ts
describe('stubFeed: the Team queue (delivery 2 contract §1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('answers the queue in three groups with for, refuses me, and pages', async () => {
    stubFeed({ team: { team: TEAM_ITEMS }, recommendations: [...RECOMMENDATIONS, TEAM_REC], pageSize: 1 });
    const body = await read('/work/feed/team/?scope=team');
    expect(body.scope).toBe('team');
    expect(body.groups.map((g: FeedGroup) => g.key)).toEqual(['decide', 'overdue', 'suggested']);
    const decide = body.groups[0];
    expect(decide.count).toBe(2);
    expect(decide.items[0].for).toEqual({ id: 3, name: 'Carl CSM' });
    const next = await read(`/work/feed/team/?scope=team&group=decide&cursor=${decide.next}`);
    expect(next.group.items).toHaveLength(1);
    expect(await status('/work/feed/team/?scope=me')).toEqual([400, { code: 'SCOPE_UNKNOWN', detail: 'Choose team or company.' }]);
  });

  it('refuses a scope the reader is not offered, and drops what was decided', async () => {
    stubFeed({ offered: ['me', 'team'], team: { team: TEAM_ITEMS }, recommendations: [...RECOMMENDATIONS, TEAM_REC] });
    expect(await status('/work/feed/team/?scope=company')).toEqual([403, { code: 'SCOPE_NOT_ALLOWED', detail: "You can't see that view." }]);
    await send('POST', `/agents/actions/${TEAM_APPROVAL.id}/approve/`, {});
    await send('POST', `/questions/${TEAM_QUESTION.id}/answer/`, { body: 'Yes.' });
    const body = await read('/work/feed/team/?scope=team');
    expect(body.groups[0].items).toEqual([]);
  });

  it('answers a question once, and refuses a blank answer', async () => {
    stubFeed();
    expect(await send('POST', '/questions/1/answer/', { body: '  ' })).toEqual([400, { detail: 'Say something.' }]);
  });

  it('no longer answers /work/today/', async () => {
    stubFeed();
    expect((await status('/work/today/'))[0]).toBe(404);
  });
});
```

with three helpers at the top of the file if missing:

```ts
const call = async (method: string, path: string, body?: unknown) => {
  const response = (await fetch(`http://localhost/api/v1${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })) as unknown as { status: number; json: () => Promise<unknown> };
  return [response.status, await response.json()] as const;
};
const read = async (path: string) => (await call('GET', path))[1] as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const status = (path: string) => call('GET', path);
const send = (method: string, path: string, body: unknown) => call(method, path, body);
```

Use `QUESTION.id` from `testFeedFixtures` for the blank-answer test if `1` is not a question there.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/work/testFeed.test.ts --maxWorkers=2`
Expected: FAIL (no `TEAM_ITEMS` export; the queue route is unanswered).

- [ ] **Step 3: Fixtures, and Today out of `stubWork`**

`src/features/work/testFeedFixtures.ts` (import `CARL`, `CARL_CHASE`, `UBER`, `refOf`, `recRow`, `ACT_*` as needed from the fixtures modules):

```ts
/** A Team queue item (delivery 2 contract §1.4): `for` and, when given, its actions. */
export function teamItem<T extends FeedItem>(item: T, person: PersonRef | null, actions?: T['actions']): T {
  return { ...item, for: person, ...(actions ? { actions } : {}) };
}

/** A suggestion in Carl's queue, which Alice (above him) may decide. */
export const TEAM_REC: RecommendationRow = recRow({
  id: 61,
  kind: 'health_drop',
  title: "Look into Uber EMEA's health",
  record: UBER,
  recipient: refOf(CARL),
  suggested_assignee: { ...refOf(CARL), active: true, can_open: true },
});

export const TEAM_APPROVAL = teamItem(approvalItem(ACT_LIFECYCLE, { id: 71, key: 'agent_action:71' }), refOf(CARL));
export const TEAM_QUESTION = teamItem({ ...QUESTION, id: 72, key: 'question:72' }, refOf(CARL), []);
export const TEAM_TASK = teamItem(taskItem(CARL_CHASE), refOf(CARL), ['open']);
export const TEAM_SUGGESTION = teamItem(suggestionItem(TEAM_REC), refOf(CARL), ['assign', 'dismiss']);
export const TEAM_ITEMS: FeedItem[] = [TEAM_APPROVAL, TEAM_QUESTION, TEAM_TASK, TEAM_SUGGESTION];
```

(If `approvalItem`'s second argument does not override `id`/`key`, spread instead: `{ ...approvalItem(ACT_LIFECYCLE), id: 71, key: 'agent_action:71', detail: { ...approvalItem(ACT_LIFECYCLE).detail, id: 71 } }`. The approval's `detail.id` must equal its `id`: `AgentActionDecision` posts to `detail.id`.)

`src/features/work/testWork.ts`: delete the `/work/today/` handler, `failToday`, `today()` and the stub options documented only for it (`GET /work/today/'s hidden`), and the `/brain/waiting/count/` handler. `src/features/work/testWork.test.ts`: delete the test that reads `/work/today/` and the `TodayPayload` import.

- [ ] **Step 4: The queue in `stubFeed`**

In `src/features/work/testFeed.ts`, extend `FeedStub`:

```ts
  /** The Team queue's items per scope, each with `for` (delivery 2). Default none. */
  team?: Partial<Record<TeamScope, FeedItem[]>>;
  /** The queue's `hidden`. Default 0. */
  queueHidden?: number;
  /** How many queue reads answer 500 first. */
  failQueue?: number;
```

Inside `stubFeed`, after `decided`:

```ts
  /** Queue items decided or answered here: they leave every list. */
  const queueGone = new Set<string>();
  let failQueue = stub.failQueue ?? 0;
  const offered = stub.offered ?? ['me', 'team', 'company'];
  const TEAM_GROUPS: readonly FeedGroupKey[] = ['decide', 'overdue', 'suggested'];

  function queueItems(scope: TeamScope): Record<FeedGroupKey, FeedItem[]> {
    const groups = Object.fromEntries(TEAM_GROUPS.map((key) => [key, [] as FeedItem[]])) as Record<FeedGroupKey, FeedItem[]>;
    for (const item of stub.team?.[scope] ?? []) {
      if (queueGone.has(item.key)) continue;
      if (item.kind === 'suggestion' && work.recommendations.get(item.id)?.decided.status !== 'open') continue;
      if (item.kind === 'task' && work.tasks.get(item.id)?.status === 'completed') continue;
      const key: FeedGroupKey = item.kind === 'suggestion' ? 'suggested' : item.kind === 'task' ? 'overdue' : 'decide';
      groups[key].push(clone(item));
    }
    for (const key of TEAM_GROUPS) groups[key].sort((a, b) => order(key, a, b));
    return groups;
  }

  function queue(url: URL) {
    const asked = url.searchParams.get('scope');
    const fallback = offered.includes('company') ? 'company' : 'team';
    const scope = asked ?? fallback;
    if (scope !== 'team' && scope !== 'company') return json(400, { code: 'SCOPE_UNKNOWN', detail: 'Choose team or company.' });
    if (!offered.includes(scope)) return json(403, { code: 'SCOPE_NOT_ALLOWED', detail: "You can't see that view." });
    const group = url.searchParams.get('group') as FeedGroupKey | null;
    const cursor = url.searchParams.get('cursor');
    if (cursor !== null && group === null) return json(400, { cursor: ['Say which group to page.'] });
    if (group !== null && !TEAM_GROUPS.includes(group)) return json(400, { group: ['Choose decide, overdue or suggested.'] });
    const lists = queueItems(scope);
    if (group === null) {
      if (failQueue > 0) {
        failQueue -= 1;
        return json(500, { detail: 'Down.' });
      }
      return json(200, { scope, groups: TEAM_GROUPS.map((key) => page(key, lists[key], 0)), hidden: stub.queueHidden ?? 0, failed: [] });
    }
    let from = 0;
    if (cursor !== null) {
      const [key, offset] = cursor.split(':');
      if (key !== group || !/^\d+$/.test(offset ?? '')) return json(400, { cursor: ['That list has changed. Reload Work.'] });
      from = Number(offset);
    }
    return json(200, { scope, group: page(group, lists[group], from), failed: [] });
  }

  function answer(id: number, body: Record<string, unknown>) {
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (!text) return json(400, { detail: 'Say something.' });
    const key = `question:${id}`;
    const mine = decide.get(key);
    const theirs = Object.values(stub.team ?? {}).flat().find((item) => item.key === key && !queueGone.has(key));
    if (!mine && !theirs) return json(404, { detail: 'Not found.' });
    decide.delete(key);
    queueGone.add(key);
    return json(200, { id, status: 'answered' });
  }
```

Make `agentDecision` and `reviewDecision` find queue items too: where they read `decide.get(key)`, read `decide.get(key) ?? Object.values(stub.team ?? {}).flat().find((item) => item.key === key && !queueGone.has(key))`, and where they `decide.delete(key)`, also `queueGone.add(key)`. In `spy`, before the PATCH branch:

```ts
    if (method === 'GET' && path === '/work/feed/team/') return queue(url);
    const answered = /^\/questions\/(\d+)\/answer\/$/.exec(path);
    if (answered && method === 'POST') return answer(Number(answered[1]), body);
```

If `stubWork` keeps no `recommendations` map on its return value, read the decided status the way `everything()` already does for suggestions (its `work.recommendations.values()` loop shows the shape). Import `TeamScope` in the type import.

- [ ] **Step 5: Run the stub tests**

Run: `npx vitest run src/features/work/testFeed.test.ts src/features/work/testWork.test.ts --maxWorkers=2 && npx tsc -b`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/work/testFeed.ts src/features/work/testFeed.test.ts src/features/work/testFeedFixtures.ts src/features/work/testWork.ts src/features/work/testWork.test.ts
git commit -m "test(work): stub the Team queue and answers; Today and Waiting's count leave the stub

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: One feed reader for My work and the Team queue

**Files:**
- Create: `src/components/work/useFeedSource.ts`, `src/components/work/useTeamQueue.ts`, `src/components/work/useTeamQueue.test.tsx`
- Modify: `src/components/work/useFeed.ts`, `src/features/work/feed.ts` (generic helpers)

**Interfaces:**
- Consumes: Task 1 wrappers.
- Produces: `useFeedSource<K, P extends FeedPayload>(key: K, read: (key: K) => Promise<P>, readGroup: (key: K, group: FeedGroupKey, cursor: string | null) => Promise<FeedPage>, refused?: (err: unknown) => boolean)` returning `{ data: P | null, error, reload, update, place, showMore, retry, paging }` (exactly `useFeed`'s fields); `useFeed(chip)` unchanged for callers; `useTeamQueue(scope: TeamScope, refused: (err: unknown) => boolean)` returning the same fields with `data: TeamQueuePayload | null`. `feed.ts`'s `withoutItem`, `withItem`, `withPage`, `withGroup`, `withHidden` become generic in `P extends FeedPayload` and return `P`.

- [ ] **Step 1: Write the failing test**

Create `src/components/work/useTeamQueue.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { stubFeed } from '../../features/work/testFeed';
import { TEAM_ITEMS, TEAM_REC } from '../../features/work/testFeedFixtures';
import { RECOMMENDATIONS } from '../../features/work/testWorkFixtures';
import { useTeamQueue } from './useTeamQueue';

describe('useTeamQueue', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the scope, pages a group, and reads again on reload', async () => {
    const { spy } = stubFeed({ team: { team: TEAM_ITEMS }, recommendations: [...RECOMMENDATIONS, TEAM_REC], pageSize: 1 });
    const refused = vi.fn(() => false);
    const { result } = renderHook(() => useTeamQueue('team', refused));
    await waitFor(() => expect(result.current.data?.scope).toBe('team'));
    const decide = result.current.data!.groups[0];
    await act(() => result.current.showMore('decide', decide.next as string));
    expect(result.current.data!.groups[0].items).toHaveLength(2);
    act(() => result.current.reload());
    await waitFor(() => expect(spy.mock.calls.filter(([url]) => String(url).includes('/work/feed/team/?scope=team')).length).toBeGreaterThanOrEqual(2));
    expect(refused).not.toHaveBeenCalled();
  });

  it('hands a 403 to the scope and shows no error of its own', async () => {
    stubFeed({ offered: ['me', 'team'] });
    const refused = vi.fn(() => true);
    const { result } = renderHook(() => useTeamQueue('company', refused));
    await waitFor(() => expect(refused).toHaveBeenCalled());
    expect(result.current.error).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/work/useTeamQueue.test.tsx --maxWorkers=2`
Expected: FAIL (`./useTeamQueue` missing).

- [ ] **Step 3: Generic helpers in `feed.ts`**

Change the five helpers' signatures, bodies unchanged:

```ts
export function withoutItem<P extends FeedPayload>(feed: P, key: string): P
export function withItem<P extends FeedPayload>(feed: P, key: FeedGroupKey, item: FeedItem): P
export function withPage<P extends FeedPayload>(feed: P, page: FeedGroup): P
export function withGroup<P extends FeedPayload>(feed: P, page: FeedGroup, failed: readonly FeedKind[], retried: readonly FeedKind[]): P
export const withHidden = <P extends FeedPayload>(feed: P, by: number): P => ({ ...feed, hidden: feed.hidden + by });
```

- [ ] **Step 4: `useFeedSource`, `useFeed`, `useTeamQueue`**

Create `src/components/work/useFeedSource.ts` by moving `useFeed`'s whole body into it, with these changes only: the hook is `useFeedSource<K, P extends FeedPayload>(key: K, read, readGroup, refused?)`; every `chip` becomes `key`; `fetchFeed(kindsOf(chip))` becomes `read(key)`; `fetchFeedGroup(group, kindsOf(chip), cursor)` becomes `readGroup(key, group, cursor)`; `Loaded`/`Failure` are `{ key: K; payload: P }` / `{ key: K; message: string }`; in the load's error branch, `if (refused?.(err)) return;` comes first (before the `stale` check); the effect's dependency list stays `[key, attempt]` with the comment `// read, readGroup and refused are stable for the page's life (module functions and useBrainScope's callback).` and `// eslint-disable-next-line react-hooks/exhaustive-deps`. Keep every comment of the original that still applies (the Decision 5 generation guard, `place`).

`src/components/work/useFeed.ts` becomes:

```ts
import { kindsOf, type FeedChip } from '../../features/work/feed';
import { fetchFeed, fetchFeedGroup } from '../../features/work/workApi';
import type { FeedGroupKey } from '../../features/work/workTypes';
import { useFeedSource } from './useFeedSource';

const read = (chip: FeedChip | null) => fetchFeed(kindsOf(chip));
const readGroup = (chip: FeedChip | null, group: FeedGroupKey, cursor: string | null) => fetchFeedGroup(group, kindsOf(chip), cursor);

/** GET /work/feed/ for one chip (spec §5): see useFeedSource for the rules. */
export function useFeed(chip: FeedChip | null) {
  return useFeedSource(chip, read, readGroup);
}
```

Create `src/components/work/useTeamQueue.ts`:

```ts
import { fetchTeamQueue, fetchTeamQueueGroup } from '../../features/work/workApi';
import type { FeedGroupKey, TeamScope } from '../../features/work/workTypes';
import { useFeedSource } from './useFeedSource';

const read = (scope: TeamScope) => fetchTeamQueue(scope);
const readGroup = (scope: TeamScope, group: FeedGroupKey, cursor: string | null) => fetchTeamQueueGroup(scope, group, cursor);

/** GET /work/feed/team/ for one scope (delivery 2 contract §1). A 403
 *  SCOPE_NOT_ALLOWED goes to `refused` (Brain's scope moves on) and shows no
 *  error of its own. */
export function useTeamQueue(scope: TeamScope, refused: (err: unknown) => boolean) {
  return useFeedSource(scope, read, readGroup, refused);
}
```

- [ ] **Step 5: Run the hook tests and My work's**

Run: `npx vitest run src/components/work/useTeamQueue.test.tsx src/components/work/useFeed.test.tsx src/pages/work/MyWork.test.tsx src/features/work/feed.test.ts --maxWorkers=2 && npx tsc -b`
Expected: PASS (My work behaves exactly as before).

- [ ] **Step 6: Commit**

```bash
git add src/components/work/useFeedSource.ts src/components/work/useFeed.ts src/components/work/useTeamQueue.ts src/components/work/useTeamQueue.test.tsx src/features/work/feed.ts
git commit -m "refactor(work): one feed reader behind My work and the Team queue

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Rows that honour their actions and say who they are for

**Files:**
- Modify: `src/components/work/FeedTaskRow.tsx`, `FeedSuggestionRow.tsx`, `FeedRowParts.tsx`, `FeedGroups.tsx`, `src/features/work/feed.ts` (words)
- Create: `src/features/work/teamQueue.ts`, `src/features/work/teamQueue.test.ts`
- Test: `src/components/work/FeedTaskRow.test.tsx`, `src/components/work/FeedRow.test.tsx`

**Interfaces:**
- Produces: `FEED.FOR_COMPANY = 'For the whole company'`, `forText(person: PersonRef | null | undefined): string | null`; `teamQueue.ts`: `TEAM_QUEUE` words, `TEAM_GROUP_ORDER: readonly FeedGroupKey[] = ['decide', 'overdue', 'suggested']`, `TEAM_GROUP_LABEL: Record<FeedGroupKey, string>`, `queueTitle(scope)`, `queueEmpty(scope)`; `FeedGroups` props `order?`, `labels?`, `heading?: 'h2' | 'h3'`, `idPrefix?: string` (defaults: `GROUP_ORDER`, `FEED_GROUP_LABEL`, `'h2'`, `'work-feed'`).

- [ ] **Step 1: Write the failing tests**

`src/features/work/teamQueue.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { forText } from './feed';
import { TEAM_GROUP_LABEL, TEAM_GROUP_ORDER, queueEmpty, queueTitle } from './teamQueue';

describe('the Team queue words (delivery 2 frontend Decisions 2, 3)', () => {
  it('titles, empties and labels by scope', () => {
    expect([queueTitle('team'), queueTitle('company')]).toEqual(['Waiting on your team', 'Waiting on the company']);
    expect([queueEmpty('team'), queueEmpty('company')]).toEqual(['Nothing is waiting on your team.', 'Nothing is waiting on the company.']);
    expect(TEAM_GROUP_ORDER.map((key) => TEAM_GROUP_LABEL[key])).toEqual(['To decide', 'Overdue', 'Suggested']);
  });

  it('says who an item is for', () => {
    expect(forText({ id: 3, name: 'Carl CSM' })).toBe('For Carl CSM');
    expect(forText(null)).toBe('For the whole company');
    expect(forText(undefined)).toBeNull();
  });
});
```

In `src/components/work/FeedTaskRow.test.tsx`, add:

```tsx
  it('has no Done without the done action, and names who it is for', () => {
    renderRow(teamItem(taskItem(CARL_CHASE), refOf(CARL), ['open']));
    expect(screen.queryByRole('button', { name: /done/i })).toBeNull();
    expect(screen.getByRole('link', { name: 'Chase the exec sponsor' })).toBeInTheDocument();
    expect(screen.getByText('For Carl CSM')).toBeInTheDocument();
  });
```

(`renderRow` is the file's existing render helper; if it takes props, pass `item` and the default group `'overdue'`.) In `src/components/work/FeedRow.test.tsx` (the suggestion row's tests), add:

```tsx
  it('offers Assign and Dismiss but not Add to my work in the Team queue', () => {
    renderFeedRow(TEAM_SUGGESTION, 'suggested');
    expect(screen.queryByRole('button', { name: 'Add to my work' })).toBeNull();
    expect(screen.getByText('For Carl CSM')).toBeInTheDocument();
  });
```

(using the file's existing helper that renders `FeedRow` inside a list with stubbed handlers; widths as its other tests).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/work/teamQueue.test.ts src/components/work/FeedTaskRow.test.tsx src/components/work/FeedRow.test.tsx --maxWorkers=2`
Expected: FAIL.

- [ ] **Step 3: Words**

In `src/features/work/feed.ts`, add to `FEED`: `FOR_COMPANY: 'For the whole company',`, and:

```ts
/** A Team queue item's "for" (contract D6); null on My work's items, which carry none. */
export function forText(person: PersonRef | null | undefined): string | null {
  if (person === undefined) return null;
  return person === null ? FEED.FOR_COMPANY : `For ${person.name}`;
}
```

(import `PersonRef` from `./workTypes`). Create `src/features/work/teamQueue.ts`:

```ts
// The Team queue's words and rules (work in one place delivery 2 contract
// §1; frontend Decisions 2, 6). Kept free of React. No em dash.
import { FEED_GROUP_LABEL } from './feed';
import type { FeedGroupKey, TeamScope } from './workTypes';

export const TEAM_QUEUE = {
  LOAD: 'Could not load what is waiting on your team.',
  LOADING: 'Loading what is waiting on your team',
  EMPTY_DETAIL: 'Decisions, overdue tasks and suggestions for the people below you show here.',
  ASK: 'Ask the agent',
  ASKING: 'Asking…',
  ASK_HINT: 'Runs the Ops agent now. Uses AI credits.',
  ASK_FAILED: 'Could not run the Ops agent.',
} as const;

export const TEAM_GROUP_ORDER: readonly FeedGroupKey[] = ['decide', 'overdue', 'suggested'];

export const TEAM_GROUP_LABEL: Record<FeedGroupKey, string> = { ...FEED_GROUP_LABEL, decide: 'To decide' };

export const queueTitle = (scope: TeamScope): string => (scope === 'team' ? 'Waiting on your team' : 'Waiting on the company');

export const queueEmpty = (scope: TeamScope): string => (scope === 'team' ? 'Nothing is waiting on your team.' : 'Nothing is waiting on the company.');
```

- [ ] **Step 4: The rows and the groups**

`FeedRowParts.tsx` `FeedRowMeta`: first part, before the record:

```tsx
  const owner = forText(item.for);
  if (owner) parts.push(<span key="for" data-part="for">{owner}</span>);
```

`FeedTaskRow.tsx`: render the Done button only when `item.actions.includes('done')`; when it is absent, render `<span aria-hidden="true" className="h-11 w-11 shrink-0 sm:h-9 sm:w-9" />` in its place so titles stay aligned. Update its docstring: "Done first when the row offers it (the Team queue's rows only open the panel)."

`FeedSuggestionRow.tsx`: `const addable = assignable && item.actions.includes('add');` and render "Add to my work" only when `addable`; `cancel` already falls back to the first button when Add is absent.

`FeedGroups.tsx`: add the four props with their defaults; use `order` instead of `GROUP_ORDER`, `labels[key]` instead of `FEED_GROUP_LABEL[key]`, `` `${idPrefix}-${key}` `` for `headingId`, and render the heading as `const Heading = heading;` then `<Heading id={headingId} className={TYPE.title}>`. Docstring: "My work passes nothing; the Team queue passes its three groups, its labels and `h3` (its section owns the `h2`)."

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/components/work src/features/work src/pages/work --maxWorkers=2 && npx tsc -b && npm run lint`
Expected: PASS, no lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/work/feed.ts src/features/work/teamQueue.ts src/features/work/teamQueue.test.ts src/components/work/FeedRowParts.tsx src/components/work/FeedTaskRow.tsx src/components/work/FeedSuggestionRow.tsx src/components/work/FeedGroups.tsx src/components/work/FeedTaskRow.test.tsx src/components/work/FeedRow.test.tsx
git commit -m "feat(work): rows honour their actions and say who they are for

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Team's switch and the "Waiting on your team" queue

**Files:**
- Modify: `src/features/brain/brainScope.ts` (+ `brainScope.test.ts`), `src/components/brain/useBrainScope.ts` (+ `useBrainScope.test.tsx`)
- Create: `src/components/work/useFeedSettle.ts`, `src/components/work/TeamQueue.tsx`
- Modify: `src/pages/work/MyWork.tsx` (uses `useFeedSettle`), `src/pages/work/Team.tsx`, `src/pages/work/Team.test.tsx`, `src/components/work/houseRules.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 4.
- Produces: `withoutScope(offered: ScopesPayload, key: ScopeKey): ScopesPayload`; `useBrainScope({ without }?: { without?: ScopeKey })`; `useFeedSettle<P extends FeedPayload>(update: (change: (feed: P) => P) => void)` returning `{ toast, close, say, leave, gone, lost, applied }`; `TeamQueue({ scope, canAsk, onRefused })`.

- [ ] **Step 1: Write the failing tests**

`src/features/brain/brainScope.test.ts`, add:

```ts
  it('withoutScope drops one scope and moves the default off it', () => {
    const offered: ScopesPayload = { scopes: [{ key: 'me', label: 'Me' }, { key: 'team', label: 'My team' }], default: 'team' };
    expect(withoutScope(offered, 'me')).toEqual({ scopes: [{ key: 'team', label: 'My team' }], default: 'team' });
    const onlyMe: ScopesPayload = { scopes: [{ key: 'me', label: 'Me' }, { key: 'company', label: 'Company' }], default: 'me' };
    expect(withoutScope(onlyMe, 'me').default).toBe('company');
  });
```

`src/pages/work/Team.test.tsx`: replace the "switches Me · My team · Company" test with the one below, and add the queue tests (import `stubFeed`, `TEAM_ITEMS`, `TEAM_REC`, `RECOMMENDATIONS`, `SCOPE_STORAGE_KEY`):

```tsx
  it('switches My team · Company only, and keeps Brain’s remembered Me', async () => {
    localStorage.setItem(SCOPE_STORAGE_KEY, 'me');
    stubFeed({ teamHidden: { team: 2, company: 0 } });
    renderPage(<TeamPage />, '/work/team');
    await waitFor(() => expect(where()).toBe('/work/team?scope=company'));
    expect(await screen.findByRole('button', { name: 'My team' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Me' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'My team' }));
    await waitFor(() => expect(where()).toBe('/work/team?scope=team'));
    expect(await screen.findByRole('list', { name: "Your team's tasks" })).toBeInTheDocument();
    localStorage.removeItem(SCOPE_STORAGE_KEY);
  });

  it('reads an old ?scope=me link as no scope, without a lost-access notice', async () => {
    stubFeed({ offered: ['me', 'team'] });
    renderPage(<TeamPage />, '/work/team?scope=me', { role: 'csm' });
    await waitFor(() => expect(where()).toBe('/work/team?scope=team'));
    expect(screen.queryByText('You no longer have access to that view.')).toBeNull();
  });

  it('lists what waits on the team above the counts, for whom, with the allowed buttons', async () => {
    stubFeed({ offered: ['me', 'team'], team: { team: TEAM_ITEMS }, recommendations: [...RECOMMENDATIONS, TEAM_REC], queueHidden: 1 });
    renderPage(<TeamPage />, '/work/team?scope=team', { role: 'csm' });
    const queue = await screen.findByRole('region', { name: 'Waiting on your team' });
    expect(within(queue).getByRole('heading', { level: 3, name: /To decide/ })).toBeInTheDocument();
    expect(within(queue).getAllByText('For Carl CSM')).toHaveLength(4);
    expect(within(queue).getByRole('button', { name: 'Apply' })).toBeInTheDocument();
    expect(within(queue).queryByRole('button', { name: /done/i })).toBeNull();
    expect(within(queue).queryByRole('button', { name: 'Add to my work' })).toBeNull();
    expect(within(queue).getByText("1 more on a record you can't open")).toBeInTheDocument();
    const counts = await screen.findByRole('list', { name: "Your team's tasks" });
    expect(queue.compareDocumentPosition(counts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('approves from the queue: the row leaves with a toast', async () => {
    stubFeed({ offered: ['me', 'team'], team: { team: TEAM_ITEMS }, recommendations: [...RECOMMENDATIONS, TEAM_REC] });
    renderPage(<TeamPage />, '/work/team?scope=team', { role: 'csm' });
    const queue = await screen.findByRole('region', { name: 'Waiting on your team' });
    await userEvent.click(within(queue).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(document.querySelector('[data-item="agent_action:71"]')).toBeNull());
    expect(screen.getAllByRole('status').map((s) => s.textContent).join(' ')).toMatch(/Applied|Approved/);
  });

  it('shows an empty queue, and Try again after a failed read', async () => {
    const { spy } = stubFeed({ offered: ['me', 'team'], failQueue: 1 });
    renderPage(<TeamPage />, '/work/team?scope=team', { role: 'csm' });
    const queue = await screen.findByRole('region', { name: 'Waiting on your team' });
    await userEvent.click(await within(queue).findByRole('button', { name: 'Try again' }));
    expect(await within(queue).findByText('Nothing is waiting on your team.')).toBeInTheDocument();
    expect(spy.mock.calls.filter(([url]) => String(url).includes('/work/feed/team/')).length).toBe(2);
  });
```

Update the other Team tests that used `stubWork({...})` to `stubFeed({...})` with the same options (the queue's read must be answered on every Team render). Where a test asserted the `me` scope on Team, delete that assertion.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/brain/brainScope.test.ts src/pages/work/Team.test.tsx --maxWorkers=2`
Expected: FAIL.

- [ ] **Step 3: `withoutScope` and `useBrainScope({ without })`**

In `src/features/brain/brainScope.ts`:

```ts
/** `offered` without `key` (Work › Team offers no Me, delivery 2); the
 *  default moves to the widest scope left when it was `key`. */
export function withoutScope(offered: ScopesPayload, key: ScopeKey): ScopesPayload {
  const scopes = offered.scopes.filter((scope) => scope.key !== key);
  const keeps = scopes.some((scope) => scope.key === offered.default);
  return { scopes, default: keeps ? offered.default : (scopes[scopes.length - 1]?.key ?? offered.default) };
}
```

In `src/components/brain/useBrainScope.ts`, the signature becomes `useBrainScope({ without }: { without?: ScopeKey } = {})`; compute

```ts
  const fetched = current?.offered ?? null;
  const offered = useMemo(() => (fetched && without ? withoutScope(fetched, without) : fetched), [fetched, without]);
  // The left-out scope is neither a refused link nor a stale memory (Work › Team, delivery 2):
  // ?scope=<it> reads as no scope, and a remembered <it> stays remembered for Brain.
  const urlChoice = urlScope === without ? null : urlScope;
  const choice = useMemo(() => {
    if (!offered) return null;
    const stored = readStoredScope();
    return chooseScope(urlChoice, stored === without ? null : stored, offered);
  }, [offered, urlChoice, without]);
```

and replace the old `offered` and `choice` lines. Everything else is unchanged; the return value's `offered` is the narrowed one. Brain's pages call `useBrainScope()` and see no change.

- [ ] **Step 4: `useFeedSettle`, and My work on it**

Create `src/components/work/useFeedSettle.ts`:

```ts
import { useCallback, useRef, useState } from 'react';
import { refusalDetail, undoAction } from '../../features/agents/agentsApi';
import type { AgentAction } from '../../features/agents/agentTypes';
import { FEED, withHidden, withoutItem } from '../../features/work/feed';
import type { ApprovalFeedItem, FeedItem, FeedPayload } from '../../features/work/workTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import type { Settle } from './FeedDecideRows';
import { feedChanged, taskChanged } from './taskChanges';
import type { Toast } from './WorkToast';

/** A feed page's toast and its rows' leaving (spec §5 "After an action";
 *  delivery 1 Decisions 1, 2, 6): a decided row leaves with a toast, with
 *  Undo for an applied agent action while its window is open; a lost one
 *  also adds one to `hidden`. My work and Work › Team share it. */
export function useFeedSettle<P extends FeedPayload>(update: (change: (feed: P) => P) => void) {
  const [toast, setToast] = useState<Toast | null>(null);
  const toastId = useRef(0);
  const say = useCallback((next: Omit<Toast, 'id' | 'focus'>, focus = true) => setToast({ ...next, id: ++toastId.current, focus }), []);

  const leave = (item: FeedItem, settle: Settle, undo?: () => Promise<void>) => {
    update((current) => withoutItem(current, item.key));
    say({ ...settle, undo });
    feedChanged();
  };
  const gone = (item: FeedItem, text: string) => leave(item, { text });
  const lost = (item: FeedItem, text: string) => {
    update((current) => withHidden(withoutItem(current, item.key), 1));
    say({ text });
    feedChanged();
  };
  const applied = (item: ApprovalFeedItem, action: AgentAction, text: string) => {
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
  };
  return { toast, close: () => setToast(null), say, leave, gone, lost, applied };
}
```

In `src/pages/work/MyWork.tsx`, replace the local `toast`/`toastId` state and the `say`, `leave`, `gone`, `lost` and `applied` functions with `const settle = useFeedSettle(feed.update);` and use `settle.say`, `settle.leave`, `settle.gone`, `settle.lost`, `settle.applied`, `settle.toast`, `settle.close` where they were used (the handlers object, `markDone`, `added`, the toast-room `div`, `WorkToast`). Drop imports the move leaves unused (`undoAction`, `refusalDetail`, `AgentAction`, `withHidden`, `withoutItem`, `feedChanged` only if unused). `markDone` and `added` stay in My work. Run `npx vitest run src/pages/work/MyWork.test.tsx --maxWorkers=2` → PASS before going on.

- [ ] **Step 5: `TeamQueue` and the Team page**

Create `src/components/work/TeamQueue.tsx`:

```tsx
import { useId, type ReactNode } from 'react';
import { failedSlots, feedTotal, hiddenFeedText } from '../../features/work/feed';
import { TEAM_GROUP_LABEL, TEAM_GROUP_ORDER, TEAM_QUEUE, queueEmpty, queueTitle } from '../../features/work/teamQueue';
import type { TeamScope } from '../../features/work/workTypes';
import { useAppSelector } from '../../hooks';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { Card, EmptyState, ErrorState, ListCard, LoadingState, TYPE } from '../ui';
import { AskTheAgent } from './AskTheAgent';
import { FeedGroups } from './FeedGroups';
import { useTaskChanges } from './taskChanges';
import { useFeedSettle } from './useFeedSettle';
import { useTeamQueue } from './useTeamQueue';
import { WorkToast } from './WorkToast';

const NOTHING = new Set<string>();
const NO_ERRORS: Record<string, string> = {};

/** Work › Team's "Waiting on your team" (spec §5 Team; delivery 2 contract
 *  §1): what waits on the people in scope, the reader's own left out (on My
 *  work). Rows decide in place with the allowed buttons; a task row only
 *  opens the panel. Ask the agent sits in the header for view-all readers at
 *  Company scope (frontend Decision 6). */
export function TeamQueue({ scope, canAsk, onRefused }: { scope: TeamScope; canAsk: boolean; onRefused: (err: unknown) => boolean }) {
  const titleId = useId();
  const queue = useTeamQueue(scope, onRefused);
  useTaskChanges(queue.reload);
  const settle = useFeedSettle(queue.update);
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const isSm = useMediaQuery(SM);
  const data = queue.data;

  let body: ReactNode;
  if (!data && queue.error)
    body = (
      <Card pad="none">
        <ErrorState message={queue.error} onRetry={queue.reload} />
      </Card>
    );
  else if (!data) body = <ListCard label={TEAM_QUEUE.LOADING} state={<LoadingState label={TEAM_QUEUE.LOADING} count={3} />} />;
  else {
    const slots = failedSlots(data.failed);
    body =
      feedTotal(data) === 0 && slots.length === 0 ? (
        <Card pad="none">
          <EmptyState title={queueEmpty(scope)} detail={TEAM_QUEUE.EMPTY_DETAIL} />
        </Card>
      ) : (
        <FeedGroups
          data={data}
          slots={slots}
          paging={queue.paging}
          isSm={isSm}
          me={me}
          pending={NOTHING}
          errors={NO_ERRORS}
          order={TEAM_GROUP_ORDER}
          labels={TEAM_GROUP_LABEL}
          heading="h3"
          idPrefix="work-team"
          onMore={(group, cursor) => void queue.showMore(group, cursor)}
          onRetry={queue.retry}
          handlers={{ onDone: () => undefined, onSettled: settle.leave, onApplied: settle.applied, onGone: settle.gone, onLost: settle.lost }}
        />
      );
  }
  const hidden = data ? hiddenFeedText(data.hidden) : null;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={titleId} className={TYPE.title}>
          {queueTitle(scope)}
        </h2>
        {canAsk ? <AskTheAgent settledOn={data} onRan={queue.reload} /> : null}
      </div>
      {body}
      {hidden ? <p className={TYPE.bodyMuted}>{hidden}</p> : null}
      {settle.toast ? <div aria-hidden="true" data-part="toast-room" className="h-32 shrink-0 sm:h-20" /> : null}
      <WorkToast toast={settle.toast} onClose={settle.close} />
    </section>
  );
}
```

`AskTheAgent` is Task 6's; in this task create it as a placeholder-free minimal component that renders nothing:

```tsx
/** Ask the agent (Task 6 fills it in). */
export function AskTheAgent(_props: { settledOn: unknown; onRan: () => void }) {
  return null;
}
```

(name the parameter `_props` and check `npm run lint` accepts it; if the lint config flags it, use `export function AskTheAgent(props: ...) { void props; return null; }`). Task 6 replaces the file.

`src/pages/work/Team.tsx`: `const brain = useBrainScope({ without: 'me' });`, `const canSeeAll = useCapability('view_all_accounts');` (import from `../../hooks`), and in the frame, after the notice:

```tsx
      {brain.scope === 'team' || brain.scope === 'company' ? (
        <TeamQueue key={brain.scope} scope={brain.scope} canAsk={brain.scope === 'company' && canSeeAll} onRefused={brain.refused} />
      ) : null}
```

before `{body}`. Update the page docstring: "/work/team (spec §5 Team): My team · Company (Brain's scopes without Me), what waits on the team, then one row per person..." Add `'./TeamQueue.tsx'` and `'./useFeedSettle.ts'`-free coverage: in `houseRules.test.ts` add `'./TeamQueue.tsx'`, `'./AskTheAgent.tsx'` and `'./FeedRow.tsx'` (delivery 1's deferred minor: FeedRow was missing) to the coverage list.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/pages/work src/components/work src/components/brain src/features/brain --maxWorkers=2 && npx tsc -b && npm run lint`
Expected: PASS. If the approve test's status text differs, assert the exact sentence `AgentActionDecision` hands to `onApplied` (My work's tests show it), not a regex.

- [ ] **Step 7: Commit**

```bash
git add src/features/brain/brainScope.ts src/features/brain/brainScope.test.ts src/components/brain/useBrainScope.ts src/components/work/useFeedSettle.ts src/components/work/TeamQueue.tsx src/components/work/AskTheAgent.tsx src/pages/work/MyWork.tsx src/pages/work/Team.tsx src/pages/work/Team.test.tsx src/components/work/houseRules.test.ts
git commit -m "feat(work): Team's My team / Company switch and the Waiting on your team queue

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Add `src/components/brain/useBrainScope.test.tsx` if you added a hook test.)

---

### Task 6: Ask the agent on Team

**Files:**
- Modify: `src/components/work/AskTheAgent.tsx` (replace the stand-in)
- Test: `src/pages/work/Team.test.tsx`

**Interfaces:**
- Consumes: `runAgent('ops')`, `refusalDetail`, `runAnswerText` (`features/agents`), `useSubmitOnce({ holdOnSuccess: true })`, `feedChanged`, `taskChanged`, `TEAM_QUEUE`.
- Produces: `AskTheAgent({ settledOn, onRan })`: `settledOn` is the queue's current payload (its change releases the hold), `onRan()` reads the queue again.

- [ ] **Step 1: Write the failing tests**

In `src/pages/work/Team.test.tsx`:

```tsx
  it('Ask the agent at Company scope, for view-all only: it runs, says so, and reads the queue again', async () => {
    const { spy } = stubFeed({ team: { company: [] } });
    renderPage(<TeamPage />, '/work/team?scope=company');
    const ask = await screen.findByRole('button', { name: 'Ask the agent' });
    expect(screen.getByText('Runs the Ops agent now. Uses AI credits.')).toBeInTheDocument();
    await userEvent.click(ask);
    expect(await screen.findByText(/^The Ops agent ran/)).toBeInTheDocument();
    expect(spy.mock.calls.filter(([url, init]) => String(url).endsWith('/agents/ops/run/') && init?.method === 'POST')).toHaveLength(1);
    await waitFor(() => expect(spy.mock.calls.filter(([url]) => String(url).includes('/work/feed/team/?scope=company')).length).toBe(2));
  });

  it('offers no Ask the agent at My team, or to a reader without view-all', async () => {
    stubFeed({ offered: ['me', 'team'] });
    renderPage(<TeamPage />, '/work/team?scope=team', { role: 'csm' });
    await screen.findByRole('region', { name: 'Waiting on your team' });
    expect(screen.queryByRole('button', { name: 'Ask the agent' })).toBeNull();
  });

  it('shows a refusal from the run as an alert', async () => {
    stubFeed({ team: { company: [] }, runRefusal: { status: 409, body: { code: 'AI_OFF', detail: 'AI is switched off for this workspace.' } } });
    renderPage(<TeamPage />, '/work/team?scope=company');
    await userEvent.click(await screen.findByRole('button', { name: 'Ask the agent' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('AI is switched off for this workspace.');
  });
```

If `stubWork`/`stubFeed` does not yet answer `POST /agents/ops/run/`, add to `stubFeed` (Task 2's file) an option `runRefusal?: { status: number; body: unknown }` and a handler answering `200` with an `AgentCard` for `ops` whose `last_run` is `{ proposed: 1, applied: 0, skipped_reason: null, ... }` (copy the shape from `src/features/agents/testAgentsFixtures.ts` or the AgentsSettingsPage tests' card), or the refusal when set. The "admin" role in `renderPage` has `view_all_accounts`; the "csm" role does not (as Waiting's tests used).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/work/Team.test.tsx --maxWorkers=2`
Expected: FAIL (no button).

- [ ] **Step 3: Write `AskTheAgent`**

```tsx
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { refusalDetail, runAgent } from '../../features/agents/agentsApi';
import { runAnswerText } from '../../features/agents/agentsText';
import { TEAM_QUEUE } from '../../features/work/teamQueue';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { BUTTON, TYPE } from '../ui';
import { feedChanged, taskChanged } from './taskChanges';

/** Ask the agent (spec §5 Team; frontend Decision 6): runs the Ops agent
 *  now, from Team at Company scope, for view-all readers. Held after a
 *  success until the queue's next answer lands (`settledOn` changes), so a
 *  second press cannot spend credits twice; a refusal frees it at once. */
export function AskTheAgent({ settledOn, onRan }: { settledOn: unknown; onRan: () => void }) {
  const { busy, run, release } = useSubmitOnce({ holdOnSuccess: true });
  const [said, setSaid] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (settledOn) release();
  }, [settledOn, release]);

  async function ask() {
    if (busy) return;
    setFailed(null);
    const outcome = await run(() => runAgent('ops'));
    if (!outcome) return;
    if (outcome.ok) {
      setSaid(runAnswerText(outcome.value));
      onRan();
      feedChanged();
      if ((outcome.value.last_run?.applied ?? 0) > 0) taskChanged();
    } else setFailed(refusalDetail(outcome.error) ?? errorMessage(outcome.error, TEAM_QUEUE.ASK_FAILED));
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button type="button" onClick={() => void ask()} aria-disabled={busy || undefined} className={BUTTON}>
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        {busy ? TEAM_QUEUE.ASKING : TEAM_QUEUE.ASK}
      </button>
      <p className={TYPE.meta}>{TEAM_QUEUE.ASK_HINT}</p>
      <p role="status" className={`${TYPE.bodyMuted} empty:sr-only`}>
        {said ?? ''}
      </p>
      {failed ? (
        <p role="alert" className="text-[13px] leading-5 text-danger-ink">
          {failed}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/pages/work/Team.test.tsx src/components/work --maxWorkers=2 && npx tsc -b && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/work/AskTheAgent.tsx src/pages/work/Team.test.tsx src/features/work/testFeed.ts
git commit -m "feat(work): Ask the agent moves to Team at Company scope

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Copilot's Next up card

**Files:**
- Create: `src/components/work/InlineAnswer.tsx`, `src/components/work/NextUpCard.tsx`, `src/components/work/NextUpCard.test.tsx`
- Modify: `src/components/work/FeedDecideRows.tsx` (`QuestionRow`), `src/components/work/FeedRow.tsx` (`onAnswered` passed through), `src/features/work/feed.ts` (words)
- Modify: `src/pages/copilot/CockpitView.tsx` (+ `CockpitView.test.tsx`), `src/pages/copilot/cockpitApi.ts`, `src/pages/copilot/cockpitTypes.ts`, `src/pages/copilot/CopilotSidebar.tsx`, `src/pages/copilot/Index.tsx`, `src/features/knowledge/knowledgeSlice.ts`
- Delete: `src/pages/copilot/CopilotSidebar.questions.test.tsx`

**Interfaces:**
- Consumes: `fetchFeed`, `answerQuestion`, `patchTask`, `isMissing`, `readRefusal`; `FeedRow`.
- Produces: `NEXT_UP` words (in `feed.ts`): `{ TITLE: 'Next up', OPEN_WORK: 'Open Work', LOADING: 'Loading what is next', LOAD: 'Could not load what is next.', ANSWER_FAILED: 'Could not send that answer. Try again.', SEND: 'Send answer', SENDING: 'Sending…', WRITE: 'Write an answer.' }`; `answeredText(title) => 'Answered: <title>.'`; `NEXT_UP_KINDS: readonly FeedKind[]` (every kind but `suggestion`); `nextUp(feed: FeedPayload): { items: { group: FeedGroupKey; item: FeedItem }[]; total: number }` (first five of decide, overdue, today; total of the three counts); `FeedRowProps.onAnswered?: (item: QuestionFeedItem, settle: Settle) => void`; `NextUpCard()`.

- [ ] **Step 1: Write the failing tests**

Add to `src/features/work/feed.test.ts`:

```ts
describe('nextUp (delivery 2 frontend Decision 7)', () => {
  it('takes five from decide, then overdue, then today, and totals the three', () => {
    const feed = feedOf({ decide: [APPROVAL, QUESTION], overdue: [taskItem(CARL_CHASE)], today: [taskItem(QBR_DECK), taskItem(CALL_PIZZA), taskItem(ROADMAP)] });
    const { items, total } = nextUp(feed);
    expect(items.map((entry) => entry.group)).toEqual(['decide', 'decide', 'overdue', 'today', 'today']);
    expect(total).toBe(6);
    expect(NEXT_UP_KINDS).not.toContain('suggestion');
  });
});
```

(`feedOf` builds a `FeedPayload` with all eight groups; add it to the test file if absent: every key from `GROUP_ORDER` with `count = items.length`, `next: null`.)

Create `src/components/work/NextUpCard.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubFeed } from '../../features/work/testFeed';
import { renderPage } from '../../pages/work/testPages';
import { NextUpCard } from './NextUpCard';

describe('Next up (spec §5 Copilot; delivery 2 frontend Decision 7)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the first five of decide, overdue and today, with Open Work', async () => {
    const { spy } = stubFeed();
    renderPage(<NextUpCard />, '/copilot');
    const card = await screen.findByRole('region', { name: /Next up/ });
    const list = within(card).getByRole('list');
    expect(within(list).getAllByRole('listitem').length).toBeLessThanOrEqual(5);
    expect(within(card).getByRole('link', { name: 'Open Work' })).toHaveAttribute('href', '/work/mine');
    expect(spy.mock.calls.some(([url]) => String(url).includes('/work/feed/?kind=approval%2Crule_review%2Cquestion%2Cdraft%2Ctask%2Ctodo'))).toBe(true);
  });

  it('answers a question in place, and the row leaves', async () => {
    stubFeed();
    renderPage(<NextUpCard />, '/copilot');
    const card = await screen.findByRole('region', { name: /Next up/ });
    const row = (await within(card).findAllByRole('listitem')).find((li) => li.getAttribute('data-item')?.startsWith('question:')) as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Answer' }));
    await userEvent.click(within(row).getByRole('button', { name: 'Send answer' }));
    expect(within(row).getByText('Write an answer.')).toBeInTheDocument();
    await userEvent.type(within(row).getByRole('textbox'), 'Legal signs off.');
    await userEvent.click(within(row).getByRole('button', { name: 'Send answer' }));
    await waitFor(() => expect(card.querySelector('[data-item^="question:"]')).toBeNull());
    expect(within(card).getByRole('status')).toHaveTextContent(/^Answered: /);
  });

  it('marks a task done in place', async () => {
    stubFeed();
    renderPage(<NextUpCard />, '/copilot');
    const card = await screen.findByRole('region', { name: /Next up/ });
    const done = (await within(card).findAllByRole('button', { name: /^Mark .* done$/ }))[0];
    await userEvent.click(done);
    await waitFor(() => expect(within(card).getByRole('status')).not.toBeEmptyDOMElement());
  });

  it('keeps its own Try again, and says when nothing waits', async () => {
    stubFeed({ failFeed: 1, decide: [], tasks: [], todos: [] });
    renderPage(<NextUpCard />, '/copilot');
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Nothing waiting on you.')).toBeInTheDocument();
  });
});
```

In `src/pages/copilot/CockpitView.test.tsx`: delete the "buckets real tasks into Overdue/Upcoming" test and the whole "CockpitView tick-off" `describe`; in the remaining tests' fetch stubs, answer any URL containing `/work/feed/` with `{ groups: [], hidden: 0, failed: [] }` (status 200), and add:

```tsx
  it('shows Next up where My tasks was', async () => {
    // (the file's summary stub, plus /work/feed/ answered empty)
    renderCockpit();
    expect(await screen.findByRole('region', { name: /Next up/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'My tasks' })).toBeNull();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/work/feed.test.ts src/components/work/NextUpCard.test.tsx src/pages/copilot/CockpitView.test.tsx --maxWorkers=2`
Expected: FAIL.

- [ ] **Step 3: Words and `nextUp`**

In `src/features/work/feed.ts`:

```ts
export const NEXT_UP = {
  TITLE: 'Next up',
  OPEN_WORK: 'Open Work',
  LOADING: 'Loading what is next',
  LOAD: 'Could not load what is next.',
  ANSWER_FAILED: 'Could not send that answer. Try again.',
  SEND: 'Send answer',
  SENDING: 'Sending…',
  WRITE: 'Write an answer.',
} as const;

/** Next up reads every kind but suggestions (spec §5 Copilot). */
export const NEXT_UP_KINDS: readonly FeedKind[] = ['approval', 'rule_review', 'question', 'draft', 'task', 'todo'];
const NEXT_UP_GROUPS: readonly FeedGroupKey[] = ['decide', 'overdue', 'today'];

/** The first five of decide, then overdue, then today, and the three groups' total. */
export function nextUp(feed: FeedPayload): { items: { group: FeedGroupKey; item: FeedItem }[]; total: number } {
  const items = NEXT_UP_GROUPS.flatMap((key) => groupIn(feed, key).items.map((item) => ({ group: key, item })));
  const total = NEXT_UP_GROUPS.reduce((sum, key) => sum + groupIn(feed, key).count, 0);
  return { items: items.slice(0, 5), total };
}

export const answeredText = (title: string): string => `Answered: ${title}.`;
```

- [ ] **Step 4: The inline answer and the rows**

Create `src/components/work/InlineAnswer.tsx`:

```tsx
import { useId, useRef, useState } from 'react';
import { FEED, NEXT_UP, answeredText } from '../../features/work/feed';
import { answerQuestion, readRefusal } from '../../features/work/workApi';
import type { QuestionFeedItem } from '../../features/work/workTypes';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { BUTTON, INPUT, QUIET, TYPE } from '../ui';
import type { Settle } from './FeedDecideRows';

const ANSWER_BOX = `${INPUT} min-h-20 w-full`;

/** A question answered where it is shown (Next up; the old Copilot
 *  sidebar's form, on tokens): Answer opens a box; Send answer posts it,
 *  and the row leaves. A refusal shows under the box in the server's
 *  words; focus stays on Send answer (aria-disabled while it sends). */
export function InlineAnswer({ item, onAnswered }: { item: QuestionFeedItem; onAnswered: (item: QuestionFeedItem, settle: Settle) => void }) {
  const boxId = useId();
  const errorId = useId();
  const openRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useSubmitOnce();

  async function send() {
    if (busy) return;
    if (!text.trim()) {
      setError(NEXT_UP.WRITE);
      return;
    }
    setError(null);
    const outcome = await run(() => answerQuestion(item.id, text.trim()));
    if (!outcome) return;
    if (outcome.ok) onAnswered(item, { text: answeredText(item.title) });
    else setError(readRefusal(outcome.error, NEXT_UP.ANSWER_FAILED).form ?? NEXT_UP.ANSWER_FAILED);
  }

  if (!open)
    return (
      <button ref={openRef} type="button" onClick={() => setOpen(true)} aria-expanded="false" aria-controls={boxId} className={`${BUTTON} self-start`}>
        {FEED.ANSWER}
      </button>
    );
  return (
    <form
      id={boxId}
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <label className={TYPE.meta} htmlFor={`${boxId}-text`}>
        {`Answer ${item.detail.asked_by.name}`}
      </label>
      <textarea
        id={`${boxId}-text`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={ANSWER_BOX}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-[11px] leading-4 text-danger-ink">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" aria-disabled={busy || undefined} className={BUTTON}>
          {busy ? NEXT_UP.SENDING : NEXT_UP.SEND}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
            requestAnimationFrame(() => openRef.current?.focus());
          }}
          className={QUIET}
        >
          {FEED.CANCEL ?? 'Cancel'}
        </button>
      </div>
    </form>
  );
}
```

Add `CANCEL: 'Cancel',` to `FEED` if absent and drop the `?? 'Cancel'` fallback. `QuestionRow` gains `onAnswered?: (item: QuestionFeedItem, settle: Settle) => void`: when it is given and `item.actions.includes('answer')`, render `<InlineAnswer item={item} onAnswered={onAnswered} />` instead of the `Link`. `FeedRowProps` gains the optional `onAnswered`, and `FeedRow` passes it to `QuestionRow`. My work passes nothing (its Answer stays a link).

- [ ] **Step 5: `NextUpCard`**

```tsx
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FEED, NEXT_UP, NEXT_UP_KINDS, nextUp } from '../../features/work/feed';
import { fetchFeed, isMissing, patchTask } from '../../features/work/workApi';
import { doneStatus } from '../../features/work/workText';
import type { FeedPayload, TaskFeedItem } from '../../features/work/workTypes';
import { useAppSelector } from '../../hooks';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { Card, EmptyState, ErrorState, LINK, ListCard, LoadingState, NUM, TYPE } from '../ui';
import { FeedRow } from './FeedRow';
import { feedChanged, taskChanged, useTaskChanges } from './taskChanges';

/** Copilot's Next up (spec §5 Copilot; frontend Decision 7): the first five
 *  of what waits on the reader (decide, then overdue, then today), acted on
 *  in place with My work's rows; a question answered inline. It reads the
 *  feed again after every action and every task change. Its failure is its
 *  own (Try again), never the Cockpit's. */
export function NextUpCard() {
  const titleId = useId();
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const isSm = useMediaQuery(SM);
  const [attempt, setAttempt] = useState(0);
  const [feed, setFeed] = useState<FeedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const running = useRef(false);

  useEffect(() => {
    let alive = true;
    fetchFeed(NEXT_UP_KINDS).then(
      (payload) => {
        if (!alive) return;
        setFeed(payload);
        setError(null);
      },
      (err: unknown) => alive && setError(errorMessage(err, NEXT_UP.LOAD)),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  useTaskChanges(reload);

  const after = (text: string) => {
    setSaid(text);
    reload();
    feedChanged();
  };

  async function done(item: TaskFeedItem) {
    if (running.current) return;
    running.current = true;
    setBusyKey(item.key);
    try {
      await patchTask(item.id, { status: 'completed' });
      after(doneStatus(item.title));
      taskChanged();
    } catch (err) {
      after(isMissing(err) ? FEED.LOST : errorMessage(err, FEED.UNDO_FAILED));
    } finally {
      running.current = false;
      setBusyKey(null);
    }
  }

  let body: ReactNode;
  if (!feed && error) body = <ErrorState message={error} onRetry={reload} />;
  else if (!feed) body = <LoadingState label={NEXT_UP.LOADING} count={3} />;
  else {
    const { items } = nextUp(feed);
    body =
      items.length === 0 ? (
        <EmptyState size="inline" title={FEED.EMPTY_TITLE} />
      ) : (
        <ListCard label={NEXT_UP.TITLE}>
          {items.map(({ group, item }) => (
            <FeedRow
              key={item.key}
              item={item}
              group={group}
              isSm={isSm}
              me={me}
              busy={busyKey === item.key}
              error={null}
              onDone={(task) => void done(task)}
              onSettled={(_item, settle) => after(settle.text)}
              onApplied={(_item, _action, text) => after(text)}
              onGone={(_item, text) => after(text)}
              onLost={(_item, text) => after(text)}
              onAnswered={(_item, settle) => after(settle.text)}
            />
          ))}
        </ListCard>
      );
  }
  const total = feed ? nextUp(feed).total : null;
  return (
    <section aria-labelledby={titleId}>
      <Card pad="none">
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <h2 id={titleId} className={TYPE.title}>
            {NEXT_UP.TITLE} {total !== null ? <span className={`${TYPE.meta} ${NUM}`}>{total}</span> : null}
          </h2>
          <Link to="/work/mine" className={LINK}>
            {NEXT_UP.OPEN_WORK}
          </Link>
        </div>
        <div className="flex flex-col gap-2 px-4 py-3">
          {body}
          <p role="status" className={`${TYPE.bodyMuted} empty:sr-only`}>
            {said}
          </p>
        </div>
      </Card>
    </section>
  );
}
```

(If a `ListCard` inside `Card` trips the "no card in a card" house rule, drop the outer `Card` and give the `section` the header row plus the `ListCard`, with the empty, error and loading states as the `ListCard`'s `state`, as `FeedSkeleton` does.)

- [ ] **Step 6: Cockpit, sidebar, Index**

- `CockpitView.tsx`: delete the "My tasks" section, the `tasks`, `taskTab`, `completing`, `taskError` state, `completeTask`, `isOverdue`, `PRIORITY_STYLES`, `STATUS_STYLES`, the `fetchMyTasks()` call in the mount effect and the icon imports only they used; render `<NextUpCard />` where the section was. Update the file's top comment ("My tasks" → "Next up reads My work's feed (work in one place delivery 2)").
- `cockpitApi.ts`: delete `fetchMyTasks` and `updateTaskStatus` and their comments; `cockpitTypes.ts`: delete `CockpitTask` if `grep -rn CockpitTask src` shows no other user.
- `CopilotSidebar.tsx`: delete `QuestionsForYou` and its call, and the imports only it used (`answerQuestion`, `MessageCircleQuestion`, `formatRelativeTime`, `useAppDispatch`/`useAppSelector` if unused). `git rm src/pages/copilot/CopilotSidebar.questions.test.tsx`.
- `Index.tsx`: delete the `useEffect` that dispatches `fetchMyQuestions()` and the import.
- `knowledgeSlice.ts`: delete `fetchMyQuestions`, the `mine` state field, its initial value and its two reducer cases (`fetchMyQuestions.fulfilled` and the `mine` filter in `answerQuestion.fulfilled`); delete their tests in `knowledgeSlice.test.ts` if any (`grep -rn "fetchMyQuestions\|\.mine\b" src`).
- Lower `BASELINE` in `src/test/uiRatchet.test.ts` to the new totals the run prints (the deleted Cockpit section and sidebar block held old-style classes).

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/components/work src/pages/copilot src/features/work src/features/knowledge src/test/uiRatchet.test.ts --maxWorkers=2 && npx tsc -b && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/work/InlineAnswer.tsx src/components/work/NextUpCard.tsx src/components/work/NextUpCard.test.tsx src/components/work/FeedDecideRows.tsx src/components/work/FeedRow.tsx src/features/work/feed.ts src/features/work/feed.test.ts src/pages/copilot/CockpitView.tsx src/pages/copilot/CockpitView.test.tsx src/pages/copilot/cockpitApi.ts src/pages/copilot/cockpitTypes.ts src/pages/copilot/CopilotSidebar.tsx src/pages/copilot/Index.tsx src/features/knowledge/knowledgeSlice.ts src/test/uiRatchet.test.ts
git rm src/pages/copilot/CopilotSidebar.questions.test.tsx
git commit -m "feat(copilot): one Next up card from My work's feed replaces My tasks and Questions for you

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Add `src/features/knowledge/knowledgeSlice.test.ts` if you changed it.)

---

### Task 8: Brain › Waiting's code removed

**Files:**
- Create: `src/features/brain/deskText.ts`, `src/features/brain/deskText.test.ts`
- Delete: the Waiting files listed under **Delete** in the File Structure (all but the Copilot sidebar test)
- Modify: `src/features/brain/brainTypes.ts`, `brainApi.ts`, `testBrain.ts`, `testBrain.test.ts`; `src/features/work/workTypes.ts` (`ReviewFeedItem.detail`); `src/components/work/FeedDecideRows.tsx`, `FeedRowParts.tsx`, `taskChanges.ts`; `src/components/brain/DoingPlanRow.tsx`, `ScoresPanel.tsx`, `SentimentPanel.tsx`, `houseRules.test.ts`; `src/components/agents/AgentCard.tsx`; `src/pages/settings/AgentsSettingsPage.test.tsx`; `src/pages/brain/BrainRoutes.tsx`, `testPages.tsx`, `ask/brainStarters.test.tsx`; `src/pages/work/testPages.tsx`; `src/pages/rules/testPages.tsx`; `src/e2e/rules.test.tsx`; `src/features/copilotSessions/sessionText.ts` (comment); `src/components/layout/Sidebar.test.tsx`; `src/test/uiRatchet.test.ts`

**Interfaces:**
- Produces: `deskText.ts`: `recordPath(record: WaitingRecord): string`, `reviewCountsText(detail: RuleReviewDetail): string`; `brainTypes.ts`: `export type RuleReviewDetail = SurveyReviewDetail | CampaignReviewDetail;` (Waiting's item, payload and count types deleted; `WaitingPerson` and `WaitingRecord` stay, other Brain types use them).

- [ ] **Step 1: Write the failing test**

Create `src/features/brain/deskText.test.ts` by moving `recordPath` and `reviewCountsText` cases out of `src/features/brain/waitingText.test.ts` unchanged (imports from `./deskText`). Run: `npx vitest run src/features/brain/deskText.test.ts --maxWorkers=2` → FAIL (no module).

- [ ] **Step 2: `deskText.ts`**

```ts
// Words Brain's pages and My work share about a desk item's record and a
// rule review's counts (moved from Waiting on you's waitingText.ts when that
// page went, work in one place delivery 2).
import { skippedTotal } from '../campaigns/campaignText';
import { recordHref } from '../segments/segmentFields';
import type { RuleReviewDetail, WaitingRecord } from './brainTypes';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "12 people across 3 records" for a survey, "40 to email · 2 skipped" for a campaign. */
export function reviewCountsText(detail: RuleReviewDetail): string {
  if (detail.review_kind === 'survey') {
    const { people, records } = detail.counts;
    return `${people} ${plural(people, 'person', 'people')} across ${records} ${plural(records, 'record', 'records')}`;
  }
  const { reach, skipped } = detail.counts;
  const total = skippedTotal(skipped);
  return total > 0 ? `${reach} to email · ${total} skipped` : `${reach} to email`;
}

export function recordPath(record: WaitingRecord): string {
  return recordHref(record.type, record.id);
}
```

In `brainTypes.ts` add `export type RuleReviewDetail = SurveyReviewDetail | CampaignReviewDetail;`, then delete `WaitingKind`, `WAITING_KINDS`, `WaitingBase`, `RuleReviewItem`, `AgentActionItem`, `QuestionItem`, `OverdueTaskItem`, `WaitingItem`, `WaitingPayload`, `WaitingCount` and the Waiting comment block's references to them (keep the rule review detail interfaces). In `workTypes.ts`, `ReviewFeedItem.detail: RuleReviewDetail` (import it instead of `RuleReviewItem`).

- [ ] **Step 3: Delete Waiting and re-point its importers**

```bash
git rm src/pages/brain/Waiting.tsx src/pages/brain/Waiting.test.tsx src/pages/brain/testWaitingRoute.tsx \
  src/components/brain/WaitingDesk.tsx src/components/brain/WaitingRow.tsx src/components/brain/WaitingRow.test.tsx \
  src/components/brain/WaitingSkeleton.tsx src/components/brain/useWaiting.ts src/components/brain/useWaiting.test.tsx \
  src/components/brain/useWaitingCount.ts src/components/brain/useWaitingCount.test.tsx \
  src/features/brain/waitingText.ts src/features/brain/waitingText.test.ts src/features/brain/testWaitingFixtures.ts
```

Then fix every importer (`grep -rn "waitingText\|useWaitingCount\|useWaiting\b\|WaitingRow\|WaitingDesk\|WaitingSkeleton\|testWaitingRoute\|waitingPage\|testWaitingFixtures\|fetchWaiting\|WaitingItem\|WaitingPayload\|RuleReviewItem" src` must print nothing at the end):
- `DoingPlanRow.tsx`, `ScoresPanel.tsx`, `SentimentPanel.tsx`, `FeedRowParts.tsx`: `recordPath` from `../../features/brain/deskText`.
- `FeedDecideRows.tsx`: `reviewCountsText` from `../../features/brain/deskText`.
- `taskChanges.ts`: delete the `refreshWaitingCount` import and call; `taskChanged`'s docstring loses "and so does Brain's badge".
- `AgentCard.tsx`: delete the `refreshWaitingCount` import, its call and the comment lines about it (delivery 1's deferred minor); the comment reads "Its proposals wait on My work and Team: the Work badge reads again (recommendationsChanged). What it applied may have changed tasks."
- `AgentsSettingsPage.test.tsx`: delete the `vi.mock('../../components/brain/useWaitingCount', ...)` block and any assertion on `refreshWaitingCount`.
- `brainApi.ts`: delete `fetchWaiting`, `fetchWaitingCount` and their type imports. `testBrain.ts`: delete the `waiting` and `generates` options, the desks and the `/brain/waiting/` handlers; `testBrain.test.ts`: delete the waiting assertions (~116).
- `pages/brain/testPages.tsx`, `pages/work/testPages.tsx`, `pages/rules/testPages.tsx`: delete the `waitingPage` option and `waitingTestRoute()`. In `pages/rules/testPages.tsx` add instead a `workPage` option rendering `<Route path="/work/*" element={<WorkRoutes />} />` (import `WorkRoutes` from `../work/WorkRoutes`).
- `src/e2e/rules.test.tsx` steps 7–8: the review now waits on My work. Replace the `stubBrain({...})` and `renderRules('/brain/waiting?scope=me', ...)` with
  `stubFeed({ decide: [{ ...REVIEW, id: 300, key: 'rule_review:300', title: 'Survey from Unhappy renewals', detail: { rule_id: 100, rule_name: 'Unhappy renewals', review_kind: 'survey', counts: { people: 3, records: 2 }, review: <the rules stub's review 300 payload, as MY_RULE_REVIEW carried> } }], decisions: 'pass', passThrough: spy });`
  `renderRules('/work/mine?kind=approval', { nav: true, workPage: true });`
  find the row by `[data-item="rule_review:300"]`, keep the counts assertion, click Approve, and assert the toast's "Open survey" link points at `/surveys/31` and the one `POST /rules/reviews/300/approve/` (delivery 1 Decision 8: a review approved on My work stays there). Comments: "7. My work holds it..." and "8. Approve: the survey is created; the toast opens it."
- `pages/brain/ask/brainStarters.test.tsx`: delete the `/brain/waiting?scope=me` row (the page is gone; `askContext` keeps the label for history, covered by its own unit test).
- `pages/brain/BrainRoutes.tsx`: the doc comment says "/brain/waiting and /brain/review redirect to My work's Approvals (work in one place §5)", wrapped at the file's width (delivery 1's deferred minor).
- `components/brain/houseRules.test.ts`: delete the `WaitingRow`, `WaitingDesk`, `WaitingSkeleton` and `pages/brain/Waiting.tsx` entries and the assertions on them (~53–55, ~93, ~130–139, ~231).
- `components/layout/Sidebar.test.tsx` (~175): the assertion that no `/brain/waiting/count/` request is made stays valid; keep it.
- `features/copilotSessions/sessionText.ts` comment: "(as Brain's desk rows did)" instead of naming `waitingText.ts`.
- Lower `BASELINE` in `src/test/uiRatchet.test.ts` to the totals the run prints.

- [ ] **Step 4: Run everything that moved**

Run: `npx vitest run src/features/brain src/components/brain src/pages/brain src/components/work src/pages/work src/pages/rules src/e2e/rules.test.tsx src/pages/settings src/components/agents src/components/layout src/test --maxWorkers=2 && npx tsc -b && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/brain/deskText.ts src/features/brain/deskText.test.ts src/features/brain/brainTypes.ts src/features/brain/brainApi.ts src/features/brain/testBrain.ts src/features/brain/testBrain.test.ts src/features/work/workTypes.ts src/components/work/FeedDecideRows.tsx src/components/work/FeedRowParts.tsx src/components/work/taskChanges.ts src/components/brain/DoingPlanRow.tsx src/components/brain/ScoresPanel.tsx src/components/brain/SentimentPanel.tsx src/components/brain/houseRules.test.ts src/components/agents/AgentCard.tsx src/pages/settings/AgentsSettingsPage.test.tsx src/pages/brain/BrainRoutes.tsx src/pages/brain/testPages.tsx src/pages/brain/ask/brainStarters.test.tsx src/pages/work/testPages.tsx src/pages/rules/testPages.tsx src/e2e/rules.test.tsx src/features/copilotSessions/sessionText.ts src/test/uiRatchet.test.ts
git commit -m "refactor(brain)!: remove Waiting on you's page, hooks and words; refreshWaitingCount goes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Settings › Work › Recommendations without the retired switches

**Files:**
- Modify: `src/features/work/workTypes.ts` (`RecKind`, `REC_KINDS`, `RecRowKind`), `src/features/work/workSettings.ts` (`SOURCE_SPECS`), `src/features/work/testWork.ts` (`SOURCE_FIELDS`, settings refusal), `src/features/work/testWorkFixtures.ts` (`WORK_SETTINGS.sources`)
- Test: `src/features/work/workSettings.test.ts`, `src/pages/settings/WorkRecommendationsPage.test.tsx`

**Interfaces:**
- Produces: `RecKind = 'renewal_due' | 'health_drop' | 'urgent_tickets' | 'anomaly'`; `REC_KINDS` those four; `RecRowKind = RecKind | 'overdue_tasks' | 'open_questions' | 'agent_action'` (history rows keep typing; `KIND_LABEL` keeps every entry).

- [ ] **Step 1: Write the failing tests**

In `src/pages/settings/WorkRecommendationsPage.test.tsx`, add:

```tsx
  it('lists the four signals Revenact still recommends from', async () => {
    stubWork();
    renderSettings('/settings/work/recommendations');
    const signals = await screen.findByRole('list', { name: 'Signals' });
    expect(within(signals).getAllByRole('switch').map((s) => s.getAttribute('aria-label') ?? s.textContent)).toEqual(
      expect.arrayContaining([expect.stringMatching(/Renewal due/), expect.stringMatching(/Health drop/), expect.stringMatching(/Urgent tickets/), expect.stringMatching(/Anomalies/)]),
    );
    expect(within(signals).getAllByRole('switch')).toHaveLength(4);
    for (const gone of ['Overdue tasks', 'Open questions', 'AI agent']) expect(within(signals).queryByText(gone)).toBeNull();
  });
```

(`renderSettings` is the file's existing render helper; if the list's name differs, use the name its other tests use.) In `workSettings.test.ts`, change any expectation that enumerates the seven sources to the four.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/settings/WorkRecommendationsPage.test.tsx src/features/work/workSettings.test.ts --maxWorkers=2`
Expected: FAIL (seven switches).

- [ ] **Step 3: Narrow the kinds**

`workTypes.ts`:

```ts
export type RecKind = 'renewal_due' | 'health_drop' | 'urgent_tickets' | 'anomaly';
/** In the contract's order, which the settings page follows (delivery 2: the
 *  overdue-tasks, open-questions and AI agent signals were retired). */
export const REC_KINDS: readonly RecKind[] = ['renewal_due', 'health_drop', 'urgent_tickets', 'anomaly'];
/** A row's kind: the live kinds, and the retired ones old rows still carry. */
export type RecRowKind = RecKind | 'overdue_tasks' | 'open_questions' | 'agent_action';
```

`workSettings.ts`: delete the `overdue_tasks`, `open_questions` and `agent` entries of `SOURCE_SPECS`. `testWorkFixtures.ts`: `WORK_SETTINGS.sources` holds the four. `testWork.ts`: `SOURCE_FIELDS` holds the four, and a `PATCH` naming any other source answers `400 { sources: { [kind]: ['Unknown source.'] } }` (contract D10). Fix what `tsc` then reports (fixtures typed `RecKind` that used a retired kind become `RecRowKind`, or move to a live kind).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/features/work src/pages/settings src/components/work --maxWorkers=2 && npx tsc -b && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/work/workTypes.ts src/features/work/workSettings.ts src/features/work/workSettings.test.ts src/features/work/testWork.ts src/features/work/testWorkFixtures.ts src/pages/settings/WorkRecommendationsPage.test.tsx
git commit -m "feat(settings): Work recommendations lists the four live signals

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Bell links and the gear

**Files:**
- Modify: `src/components/layout/Navbar.test.tsx`, `src/features/notifications/types.ts` (comments), `src/pages/work/MyWork.tsx` (gear link), `src/pages/work/MyWork.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/components/layout/Navbar.test.tsx`, next to its `?task=` bell test:

```tsx
  it('opens a task notice on My work with the panel’s history state', async () => {
    // the file's notification stub, with one unread `task_assigned` whose link is '/work/mine?task=46'
    // open the bell, click it, then:
    await waitFor(() => expect(where()).toBe('/work/mine?task=46'));
    expect(lastState()).toEqual({ taskOpenedHere: true });
  });

  it('follows a new-suggestions notice to My work’s Suggested chip', async () => {
    // one `recommendations_waiting` whose link is '/work/mine?kind=suggestion'
    await waitFor(() => expect(where()).toBe('/work/mine?kind=suggestion'));
  });
```

Write both with the same setup and helpers as the existing `?task=` test (copy its body and change the link). In `MyWork.test.tsx`, change the gear test's expected `href` to `/settings/work`.

- [ ] **Step 2: Run them to see the gear test fail**

Run: `npx vitest run src/components/layout/Navbar.test.tsx src/pages/work/MyWork.test.tsx --maxWorkers=2`
Expected: the bell tests PASS already (the bell keys on `?task=`, any path); the gear test FAILS.

- [ ] **Step 3: The gear and the comments**

`MyWork.tsx`: the gear `Link` goes to `/settings/work` (Settings PR #137's Work home, which opens Recommendations). `features/notifications/types.ts`: the comments for `task_assigned`, `task_overdue`, `task_escalated` say they link to `/work/mine?task=<id>`; `recommendations_waiting` to `/work/mine?kind=suggestion`; `rule_review` to `/work/mine?kind=approval` (older notices keep their old links, which redirect).

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/components/layout src/pages/work --maxWorkers=2 && npx tsc -b`
Expected: PASS.

```bash
git add src/components/layout/Navbar.test.tsx src/features/notifications/types.ts src/pages/work/MyWork.tsx src/pages/work/MyWork.test.tsx
git commit -m "feat(work): bell notices open My work; the gear opens Work settings

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: The end-to-end journey

**Files:**
- Modify: `src/e2e/work.test.tsx`

- [ ] **Step 1: Write the journey**

Add to `src/e2e/work.test.tsx` (it already imports `renderWork`, `stubFeed` and the fixtures):

```tsx
  it('a manager clears what waits on the team: approves, assigns a suggestion, opens an overdue task, and Ask the agent runs at Company', { timeout: 30000 }, async () => {
    const { spy } = stubFeed({ team: { team: TEAM_ITEMS, company: TEAM_ITEMS }, recommendations: [...RECOMMENDATIONS, TEAM_REC] });
    renderWork('/work/team?scope=team', { nav: true });

    // 1. The queue sits above the counts, for Carl, with no Done and no Add.
    const queue = await screen.findByRole('region', { name: 'Waiting on your team' });
    expect(within(queue).getAllByText('For Carl CSM').length).toBeGreaterThan(0);
    expect(within(queue).queryByRole('button', { name: 'Add to my work' })).toBeNull();

    // 2. Apply the agent action: the row leaves with a toast.
    await userEvent.click(within(queue).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(document.querySelector('[data-item="agent_action:71"]')).toBeNull());

    // 3. Assign the suggestion to Carl through the form.
    const suggestion = document.querySelector('[data-item="recommendation:61"]') as HTMLElement;
    await userEvent.click(within(suggestion).getByRole('button', { name: 'Assign' }));
    await userEvent.click(within(suggestion).getByRole('button', { name: 'Assign task' }));
    await waitFor(() => expect(document.querySelector('[data-item="recommendation:61"]')).toBeNull());

    // 4. The overdue task opens the panel over Team.
    await userEvent.click(within(queue).getByRole('link', { name: 'Chase the exec sponsor' }));
    await waitFor(() => expect(where()).toBe('/work/team?scope=team&task=46'));

    // 5. Company: Ask the agent runs once.
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Ask the agent' }));
    await waitFor(() => expect(spy.mock.calls.filter(([url, init]) => String(url).endsWith('/agents/ops/run/') && init?.method === 'POST')).toHaveLength(1));
  });
```

(Import `TEAM_ITEMS`, `TEAM_REC` from `testFeedFixtures`, `RECOMMENDATIONS` from `testWorkFixtures`. On a 1440px width `Assign` is an inline button; if the Assign form's submit is named differently, use the name the suggestion-row tests use. If the panel closes the queue's focus target, the step 5 `Company` click comes after closing the panel with its Close button.)

- [ ] **Step 2: Run it**

Run: `npx vitest run src/e2e/work.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/e2e/work.test.tsx
git commit -m "test(e2e): a manager clears the Team queue

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Docs, the full check and by eye

**Files:**
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` (the two frontend product docs and the architecture flow)

- [ ] **Step 1: `docs/03-ui-ux-design.md`**

- Delete the "### Brain: Waiting on you" section (~L1407) and the sentence about Waiting leaving the Brain bar (~L1354) except one line: "Waiting on you was removed in work in one place delivery 2; what waited there is on My work and Work › Team."
- Under Work › Team, add the queue: "**Waiting on your team** (`/work/team`, above the per-person counts): My team · Company (Brain's switch without Me); a section headed "Waiting on your team" / "Waiting on the company" with To decide, Overdue and Suggested at `h3`, My work's rows (approvals Apply/Reject where allowed, rule reviews read-only, questions Answer with `manage_users`, overdue tasks open the panel with no Done, suggestions Assign and Dismiss), each meta line starting "For <name>" or "For the whole company"; My work's toast and Undo; "N more on records you can't open". Empty: "Nothing is waiting on your team." Ask the agent: a bordered button with Lucide `Sparkles` in the section header at Company scope for view-all, its hint "Runs the Ops agent now. Uses AI credits." under it, a status line, a refusal as an alert."
- Copilot Cockpit: replace "My tasks" with "**Next up**: the first five of decide, overdue and today from My work's feed (no suggestions), the three groups' total beside the heading, Open Work to `/work/mine`, My work's rows acting in place, a question answered inline (Answer, a labelled box, Send answer, Cancel), a status line for what happened, its own Try again." Delete the sidebar's Questions for you.
- Settings › Work › Recommendations: the Signals list has four rows (Renewal due, Health drop, Urgent tickets, Anomalies).
- Fix delivery 1's leftover stale mentions (its deferred minor): the reviews that "wait in Waiting on you (`/brain/waiting`)" (~L1167, ~L1306) now wait on My work's Approvals.

- [ ] **Step 2: `docs/04-app-flow.md`**

- `/copilot` row (~L76): "...and Next up (My work's first five, acted on in place)" instead of "My tasks...".
- `/brain/waiting` row (~L108): "redirects to `/work/mine?kind=approval` (query kept); `/brain/review` too. The page was removed in work in one place delivery 2."
- Delete the Waiting on you flow (~L1498–1520) except a pointer to Team.
- Team (~L1662): "Team reads `GET /brain/scopes/` without Me, `GET /work/feed/team/?scope=` (the queue, its pages, its decisions through each item's own route) and `GET /work/team/?scope=` (the counts)."
- Bell (~L699, ~L1677): links are `/work/mine?task=<id>`, `/work/mine?kind=suggestion`, `/work/mine?kind=approval`; old links redirect.
- Questions (~L1303): "They answer from Next up on the Copilot Cockpit, from Communications' Questions for you, or on the organisation's Knowledge tab."
- Agents (~L1738, ~L1757, and delivery 1's deferred "Brain › Waiting at Company scope" in §3 and "on Waiting on you a tile filters" in §4.11): "Ask the agent on Work › Team (Company, view-all)"; proposals wait on My work and the Team queue.
- Recommendations: the three retired kinds are gone; Run now on an agent no longer refreshes recommendations.

- [ ] **Step 3: `.agents/workflows/repo-architecture.md`**

- `features/brain/`: drop "Waiting on you's types, copy (`waitingText.ts`) and API...; testWaitingFixtures.ts"; add "`deskText.ts` (record paths and rule review counts shared with My work)".
- `components/brain/`: drop the Waiting components and hooks from the list.
- `components/work/`: add `useFeedSource`, `useTeamQueue`, `useFeedSettle`, `TeamQueue`, `AskTheAgent`, `NextUpCard`, `InlineAnswer`.
- `pages/work/`: "TeamPage (the queue and the counts)".

- [ ] **Step 4: The full check**

Run: `npx tsc -b && npm run lint && npx vitest run --maxWorkers=2 && npm run build`
Expected: no type errors, no lint errors (warnings as on `main`), every test passes, the build succeeds. A failure in a test this plan did not touch means a shared component changed: find it (`systematic-debugging`), never loosen the test.

- [ ] **Step 5: By eye at 1440px and 390px, light and dark**

Run the D2 backend from `.worktrees/work-two-be` on port **8003** (`venv/bin/python manage.py runserver 8003` with `CORS_ALLOWED_ORIGINS` including `http://localhost:5176`) and this branch's Vite on **5176** (`VITE_API_URL=http://localhost:8003 npx vite --port 5176`). Never use 8000, 8001 or 5174. Sign in as a manager with a report (`mona@acme.io` in the dev data, or make one in Settings › Members) and as an admin with view-all. Check: Team at My team and Company (the queue above the counts, "For" lines, no Done or Add in the queue, Ask the agent at Company only), the Copilot Cockpit's Next up (answer a question inline, tick a task), Settings › Work › Recommendations (four signals), My work's gear, and a bell notice. Stop both servers when done. Note anything off in the commit body; fix what is a defect.

- [ ] **Step 6: Commit**

```bash
git add docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "docs: work in one place delivery 2 (Team queue, Next up, Waiting removed)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Delivery 1 deferred minors

**Picked up here** (they sit in files this delivery changes):
- AgentCard's stale `refreshWaitingCount` comment and call (Task 8).
- `answerHref` duplicating `waitingText.answerPath`, and the campaign-link logic duplicated from `WaitingRow` (gone with Waiting, Task 8).
- `FeedRow.tsx` missing from the house-rules coverage list (Task 5).
- The rule-review rows' "h3 assumes h2 group headings": `FeedGroups` takes the heading level (Task 4); the Team queue uses `h3` groups under its `h2`.
- `BrainRoutes` doc comment wrap (Task 8).
- Stale Waiting mentions in `04-app-flow.md` (agents §3, §4.11) and `03-ui-ux-design.md` (~1167, ~1306) (Task 12).

**Still deferred:** `taskDetail(parent: null)` fixture's `editable` lacks `record`; `testWork`'s dead `groupOf` fallback; `chipOf`'s cast; stub gaps listed in delivery 1's ledger (non-integer ids, error ordering, offset cursors); stale error or list flash on chip return; the Show-more-during-reload race; literal `text-[13px]`/`text-[11px]` in `FeedTaskRow`; bare "Blocked:" with a null reason; untested `CANT_DECIDE` / campaign link / read-only review rows; quick-add's priority refusal shown nowhere and More's stale refusals; the date input's busy look; local `hidden + 1` overwritten by a reload; failed Try again without feedback; the agent Undo toast ignoring `until`; `KeepQueryRedirect` dropping `location.hash`; Sidebar's double blank line and its dropped Work-unlit check; no test pinning the badge re-read on user switch or route change; quick-add's "for <person>" summary when the name is not loaded; an empty `ListCard` above "Showing 0 of N"; More's RecordStep heading duplication and the pressed chip's 1px shift.

## Self-review

- **Spec coverage (§5 and §8 item 2, frontend):** Team queue with My team / Company and the allowed buttons, "for" line, above the counts (Tasks 3–5); Ask the agent on Team, Company, view-all (Task 6); Copilot Next up replacing My Tasks and Questions for you, buttons in place (Task 7); bell links (Task 10, backend sends them); Settings toggles removed (Task 9); Brain Waiting code removed, `refreshWaitingCount` gone (Task 8); docs (Task 12); testing §7 frontend: Team scope switch, Copilot Next up, unit tests per row change, one e2e journey (Tasks 4–7, 11); by eye at 1440 and 390 (Task 12). Communications and Dashboard unchanged (spec).
- **Placeholders:** Task 5's `AskTheAgent` stand-in is replaced in Task 6 (named, with its code there); the Navbar tests reuse the file's own setup by instruction because its stub helper is local to that file.
- **Type consistency:** `TeamScope`, `TeamQueuePayload`, `TeamQueuePage`, `fetchTeamQueue`, `fetchTeamQueueGroup`, `answerQuestion` (Task 1) are used with the same names in Tasks 2, 3, 7; `useFeedSource`'s fields equal `useFeed`'s (Task 3) and `TeamQueue` uses them (Task 5); `TEAM_GROUP_ORDER`, `TEAM_GROUP_LABEL`, `queueTitle`, `queueEmpty`, `forText` (Task 4) match Tasks 5, 12; `useFeedSettle`'s `leave/gone/lost/applied/say/toast/close` (Task 5) match My work and `TeamQueue`; `NEXT_UP`, `NEXT_UP_KINDS`, `nextUp`, `answeredText`, `onAnswered` (Task 7) match `InlineAnswer` and `NextUpCard`; `RuleReviewDetail`, `recordPath`, `reviewCountsText` (Task 8) match their importers; `RecKind`/`RecRowKind` (Task 9) keep history rows typed.
