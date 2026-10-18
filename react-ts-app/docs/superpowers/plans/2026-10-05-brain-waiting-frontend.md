# Brain, delivery 2: Waiting on you (frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Review Queue with **Waiting on you** at `/brain/waiting`, open to every member and scoped **Me · My team · Company** through delivery 1's scope switch: one list, oldest first, of rule reviews, proposals, questions and overdue tasks, each naming who it waits on, with Approve / Skip / Reject (each sent once), Answer and Open task; a sidebar badge for every member from `waiting/count/`; `/brain/review` redirects here; the Questions waiting panel leaves What changed.

**Architecture:**
- **`src/features/brain/` (pure, unit-tested):** §3's types join `brainTypes.ts`; what the page says goes in a new `waitingText.ts`; `brainApi.ts` gains `fetchWaiting`, `fetchWaitingCount`, `decideProposal`, `askAgent`; the stateful contract stub `stubBrain` (`testBrain.ts`) learns `waiting/`, `waiting/count/`, the rule review and proposal decisions and Ask the agent, from new fixtures in `testWaitingFixtures.ts`. No Redux, as delivery 1.
- **`src/components/rules/ReviewDecision.tsx` (new, shared):** Approve / Skip for one rule review, extracted from `RuleReviews.tsx` (refusals at the button, 409/404/RULE_CHANGED, the skip sentence) and now sent once through `useSubmitOnce`. `RuleReviews` uses it until Task 7 removes the old page; Waiting on you uses it from Task 4.
- **`src/components/brain/` (new files):** `useWaitingCount` (the badge's count, read again on `refreshWaitingCount()`), `ProposalDecision`, `WaitingRow` (the four kinds), `useWaiting`, `WaitingDesk` (filter chips, the list, hidden and capped lines, empty), `WaitingSkeleton`, `LostAccessNotice` (moved out of `WhatChanged.tsx`).
- **`src/pages/brain/`:** `Waiting.tsx` (new), `BrainRoutes.tsx` (`waiting`; `review` redirects), `WhatChanged.tsx` (imports the notice, drops Questions waiting), `testPages.tsx` (a `waitingLink` option), `Review.tsx` deleted.
- **Elsewhere (modify):** `Sidebar.tsx` (`WaitingNavItem`, Review Queue and `fetchProposals` gone), `Navbar.tsx` (no `h1` on `/brain/waiting`), the four in-app links to `/brain/review`, `proposalsSlice.ts` (types only), `store.ts`, `pages/rules/testPages.tsx`, `e2e/rules.test.tsx`, `features/rules/ruleText.ts` (`campaignReviewParts` goes with its last user).

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 tokens, react-router 7, lucide-react, Vitest + Testing Library (jsdom). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-05-brain-waiting-design.md`. This plan covers §0 (what exists), Decisions, §2 (frontend) and §3 (the API contract, binding; field names used exactly). §1 is the backend, read for behaviour the stub must mirror (who is on each desk §1.1, who may decide §1.2, the 403 sentence, 409 when decided).

**The API contract** is spec §3. The backend is built in parallel in `revenact-backend` against the same section, so every test here runs against `stubBrain`, never a live server. The stub answers in §3's shapes and checks in the backend's order: **400 `SCOPE_UNKNOWN` before 403 `SCOPE_NOT_ALLOWED`**. Where §3 is silent or does not fit the real frontend, the assumption is under **Contract notes**. No §3 shape is changed.

**Builds on delivery 1, already on this branch:** `features/brain/*` (`brainTypes`, `brainScope`, `brainText`, `brainApi` with `isScopeRefusal`, `testBrainFixtures`, `testBrain` `stubBrain`/`requests`), `components/brain/` (`ScopeSwitch`, `useBrainScope` with the 403 fallback, `useKept`, `styles`), `pages/brain/WhatChanged.tsx` (with `LostAccessNotice`), `BrainRoutes.tsx`, `Sidebar.tsx`, `components/brain/houseRules.test.ts`, `e2e/brain.test.tsx`. Reuse them: the Waiting page uses the same `useBrainScope` and `ScopeSwitch`.

**Branch:** `feat/brain-waiting` in `react-ts-app`, already checked out (the spec is its only commit over delivery 1). Stay on it. Never push. Do not touch `revenact-backend`.

## Contract notes (assumptions to reconcile with the backend plan)

1. **`?scope=` is always sent on `waiting/`**; the page never reads before the scope settles. `waiting/count/` takes no scope (it is always Me). The stub treats a missing scope like an unknown one (400 `SCOPE_UNKNOWN`).
2. **`detail.session` is `null`** on a proposal no session produced; §3 shows only the object.
3. **`record.type` is `"customer"` or `"account"`.** A customer links to `/organizations/<id>`, an account to `/accounts/<id>` (`recordHref`, `features/segments/segmentFields.ts`).
4. **`counts` leave out hidden items and are not capped.** When their sum is larger than `items.length` (the 200 cap), the list says "Showing the oldest 200 of 214."
5. **Where Answer and Open task go.** A question about a customer is answered on that organization's Knowledge tab (`/organizations/<id>?tab=knowledge`, `QuestionsPanel`); one with no record (or an account record) in the Copilot's "Questions for you" (`/copilot`). An overdue task opens its record's story filtered to tasks (`<record path>?group=tasks&source=task`). There is no task page of its own.
6. **A rule review item names no campaign and carries no stored refusal.** Approving a campaign review therefore opens `/campaigns` (not the campaign's send); a refusal shows only once an Approve on this page is refused. Approve, Skip and their answers are unchanged (`{survey_send_id}` | `{campaign_send_id}`; 400 refusal; 400 `RULE_CHANGED`; 409/404 decided).
7. **Proposal decisions** are `POST /metrics/proposals/<id>/approve|reject/` with `{"note": "…"}` (empty on approve), answering `{proposal}`. A 403 is `{"detail": "You can't decide this proposal."}` (spec §1.2), shown at the buttons through `ApiError.message`; the row stays. 409 or 404 means decided elsewhere; the row leaves.
8. **`since` is a timestamp or a date** (an overdue task's due date). "How long" counts whole UTC calendar days: the same day reads "today".
9. **`waiting_on: null`** reads "the company": "Waiting on the company", "Waiting on the company to decide".
10. **`can_decide: false` on a question or task** (someone else's, in My team or Company) shows "Waiting on Carl CSM to answer" / "… to do it" and no Answer / Open task.
11. **The badge shows `waiting/count/`'s `count` as given**, read on mount, again for another signed-in user, and again after every decision and Ask the agent.
12. **Ask the agent** is `POST /metrics/proposals/generate/` (unchanged, still `view_all_accounts` per §1.2); the page re-reads `waiting/` after it. It shows in Company for `view_all_accounts` readers only.

## Global Constraints

Quoted text is verbatim from the caller's brief, the spec §2, or `.claude/skills/revenact-design/SKILL.md` §1 and §4.

- **Tokens only, no raw colours.** "Zero raw hex, rgb, or named colours in `src/**/*.tsx`; tokens only." Use `bg-surface`, `bg-subtle`, `text-ink`, `text-ink-muted`, `border-line`, `border-accent`, `bg-accent`, `text-on-accent`, and `text-danger` for errors only ("Semantic colours carry meaning only (status, trend, severity), never decoration").
- **DM Mono tabular-nums for figures.** Every count, "how long" and due date uses `MONO` (`font-mono-brand tabular-nums`, from `components/organizations/portfolio/styles.ts`).
- **≤4 type sizes per surface.** Only `text-[11px]`, `text-[13px]`, `text-[15px]`, `text-[22px]`.
- **No card in a card.** "Group with `border-line`, `divide-y`, or whitespace." The list is one bordered surface (`divide-y`); each row is flat inside it, never a bordered or rounded box.
- **No glass on these pages.** No `rv-card-glass`, `rv-glass-inner` or `backdrop-blur`.
- **44px touch targets or `min-h-9` dense desktop controls.** Every button, link, chip, select and input gets `min-h-11 sm:min-h-9`, directly or through `BUTTON`, `PRIMARY`, `QUIET`, or a style constant in the same file.
- **Empty / loading (skeleton) / error states.** "Every list/table/chart has designed empty, loading (skeleton matching layout, not spinner), and error states."
- **375 / 768 / 1024 / 1440 with no horizontal scroll.** The header stacks below `sm`; the switch is a select below `sm`; the chips wrap (`flex-wrap`); "`min-h-[100dvh]` never `h-screen`."
- **localStorage** stays in `features/brain/brainScope.ts` only, every read and write inside `try { … } catch { … }`; nothing new here touches storage.
- **Lucide only**, 16px inline, every icon `aria-hidden="true"`; no emoji. The sidebar item is `Inbox`.
- **No colour-only meaning.** A refusal or failure is a sentence, never only red.
- **Copy.** Sentence case; no em dashes in UI copy; the spec's sentences exactly: "Waiting on you", "All", "Rule reviews", "Proposals", "Questions", "Overdue tasks", "Waiting on Dana CSM", "3 days", "Approve", "Skip", "Reject", "Decided in session", "Waiting on Dana CSM to decide", "Answer", "Open task", "N more items about records you can't open", "Ask the agent", "Nothing is waiting on you.", "Nothing is waiting on your team.", "Nothing is waiting.", "You no longer have access to that view."
- **Every decision is sent once.** Approve, Skip, Reject and Ask the agent go through `useSubmitOnce` (`components/plans/useSubmitOnce.ts`); tests double-click and count one request.
- **Commands.** `npx vitest run`, `npm run lint` and `npm run build` pass. Never run prettier. Type-check with `npx tsc -b --noEmit`; run focused tests with `npx vitest run --maxWorkers=2 <paths>`, one process at a time; `npm run lint` must end with **15 problems (0 errors, 15 warnings)** (the baseline).
- **Commits** are conventional (`feat(brain): …`, `refactor(rules): …`, `refactor(brain): …`, `test(e2e): …`) and every commit message ends with a blank line and exactly:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  Never push.
- **Tests** follow the `testing` skill: unit tests per module; component tests with `fetch` stubbed by `stubBrain`; page tests on the real router (`renderBrain`); jsdom journeys in `src/e2e/brain.test.tsx`; the Brain house-rules suite reusing `houseRuleSuite` and `rowsIconsTargetsSuite`. Every test must be able to fail, and its title claims only what it asserts.
- **Product documents** change in the same branch and describe only what ships: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` (Task 8).

## Decisions made while planning (the owner may overrule any)

1. **No Redux for the desk or the badge.** The page reads through `useWaiting`; the badge through `useWaitingCount`, which any decision nudges with `refreshWaitingCount()` (a module-level `EventTarget`). Nothing is kept in a shared store, so nothing can leak from one signed-in user to the next; `proposalsSlice` keeps only its types and leaves the store (its `loggedOut` reset goes with its state).
2. **A rule review row is compact, as the spec says:** its title, the rule (a link to `/scenarios/rules/<rule_id>`), "12 to send · 2 skipped", and the shared `ReviewDecision`. The old Review Queue's trigger sentence, survey preview and campaign body leave with it; the rule's own page still shows the rule. `RuleReviews.tsx` and its page tests are deleted (Task 7); the decision cases are re-homed in `ReviewDecision.test.tsx` (Task 3), the night-campaign case in `campaignApi.test.ts`.
3. **Approving a rule review still opens the new send**, as today; the row is gone when the reader comes back. Every other decision leaves the row in place and says so in one status line ("Approved: Review Pizza Hut renewal pricing.", "Skipped the survey from Detractor follow-up.").
4. **Approve is the bordered `BUTTON` on every row**, rule reviews included (`ReviewDecision` moves from `PRIMARY`); Skip, Reject and Cancel are `QUIET`. The page's one `PRIMARY` is Ask the agent.
5. **The kind chips are local state**, back to All on a scope switch; not in the URL (`useBrainScope` owns the query). All five always show with their count; a kind with none listed reads "Nothing of this kind is waiting."
6. **Items show in the server's order** (oldest first); the client never re-sorts.
7. **Decided proposals are not listed.** The old page's "Decided" history goes; Waiting on you lists only what waits.
8. **Errors read "Try again"** through the house `ErrorBlock`, as delivery 1 (the spec says "Retry").
9. **The Navbar shows "Brain" as a paragraph on `/brain/waiting`** too, so "Waiting on you" is the page's only `h1`.
10. **In-app links move to `/brain/waiting`:** the rule page's "Review it", the Copilot's "Review queue" (now "Waiting on you"), the graph's proposal node ("Open Waiting on you"), Initiatives' empty line. Server notifications keep `/brain/review` and ride the redirect.
11. **Knowledge by function stays on What changed** (Company, `view_all_accounts`) until delivery 3 moves it; only Questions waiting is deleted.
12. **The badge shows for every member** when the count is above 0, labelled "N waiting"; a failed read keeps the last count.
13. **Hidden copy:** "1 more item about a record you can't open", "2 more items about records you can't open".
14. **"Decided in session …"** links the session's title to `/copilot`, as today.
15. **"How long"** reads "today", "1 day", "N days", in DM Mono, in a meta line: kind · how long · who ("Task proposal · 4 days · Waiting on Carl CSM"). Me leaves out "who" (it is the reader).
16. **Reject asks "Why not? (optional)"** inline, label above the input, as today.

## File Structure

| File | Responsibility |
|---|---|
| `src/features/brain/brainTypes.ts` (modify) | §3's types: `WaitingKind`, `WAITING_KINDS`, the four item types, `WaitingPayload`, `WaitingCount` |
| `src/features/brain/waitingText.ts` (+test) (new) | `WAIT` sentences, chips, kind labels, how long, who, the proposal's action, paths, hidden/capped/empty lines |
| `src/features/brain/brainApi.ts` (modify) | `fetchWaiting`, `fetchWaitingCount`, `decideProposal`, `askAgent` |
| `src/features/brain/testWaitingFixtures.ts` (new, test-only) | §3-shaped desks for Me, My team, Company; `deskOf` |
| `src/features/brain/testBrain.ts` (+test) (modify) | `stubBrain` answers `waiting/`, `waiting/count/`, decisions, Ask the agent; `passThrough` |
| `src/components/rules/ReviewDecision.tsx` (+test) (new) | Approve / Skip for one rule review, sent once, shared |
| `src/components/rules/RuleReviews.tsx` (modify, then delete in Task 7) | Uses `ReviewDecision` until the old page goes |
| `src/components/brain/useWaitingCount.ts` (+test) (new) | The badge's count; `refreshWaitingCount()` |
| `src/components/brain/ProposalDecision.tsx` (new) | Approve / Reject (with note) for one proposal, sent once |
| `src/components/brain/WaitingRow.tsx` (+test) (new) | One item of any kind |
| `src/components/brain/useWaiting.ts`, `WaitingDesk.tsx`, `WaitingSkeleton.tsx`, `LostAccessNotice.tsx` (new) | The desk read, the list with chips, its skeleton, the moved notice |
| `src/pages/brain/Waiting.tsx` (+test) (new) | The page |
| `src/pages/brain/BrainRoutes.tsx` (+test), `WhatChanged.tsx` (+test), `testPages.tsx` (modify) | Routes and redirect; the notice import and Questions waiting gone; `waitingLink` |
| `src/components/layout/Sidebar.tsx` (+test), `Navbar.tsx` (+test) (modify) | Waiting on you with its badge; the `/brain/waiting` title |
| `src/components/rules/NightsSection.tsx`, `src/pages/copilot/ChatView.tsx`, `src/pages/brain/Graph.tsx`, `src/pages/brain/Initiatives.tsx` (+ `RulePage.test.tsx`, `ChatView.decisions.test.tsx`) (modify) | Links to `/brain/waiting` |
| `src/pages/brain/Review.tsx` (+test), `src/components/rules/RuleReviews.test.tsx`, `src/components/brain/QuestionsWaitingPanel.tsx` (+test), `src/features/proposals/proposalsSlice.test.ts` (delete) | The old Review Queue and panel |
| `src/features/proposals/proposalsSlice.ts`, `src/store.ts`, `src/pages/rules/testPages.tsx`, `src/e2e/rules.test.tsx`, `src/features/rules/ruleText.ts`, `src/features/campaigns/campaignApi.test.ts`, `src/components/rules/houseRules.test.ts` (modify) | Types only; out of the store; the rules harness and journey through the new page |
| `src/components/brain/houseRules.test.ts`, `src/e2e/brain.test.tsx` (modify) | House rules and the journeys |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` (modify) | Product documents |

---

### Task 1: The contract types and what Waiting on you says

Spec §3 (types), §2.1 (kind labels, "3 days", "Waiting on Dana CSM", the proposal's action in words, Answer, Open task, hidden, empty lines); Contract notes 2–5, 8–10; Decisions 13, 15.

**Files:**
- Modify: `src/features/brain/brainTypes.ts` (append)
- Create: `src/features/brain/waitingText.ts`
- Test: `src/features/brain/waitingText.test.ts`

**Interfaces:**
- Consumes: `TaskAction`, `InitiativeAction` (types, `features/proposals/proposalsSlice`); `formatDate` (`features/customers/formatters`); `recordHref` (`features/segments/segmentFields`); `ScopeKey` (`brainTypes`).
- Produces:
  - `brainTypes.ts`: `WaitingKind`, `WAITING_KINDS`, `WaitingPerson`, `WaitingRecord`, `RuleReviewItem`, `ProposalItem`, `QuestionItem`, `OverdueTaskItem`, `WaitingItem`, `WaitingPayload`, `WaitingCount`.
  - `waitingText.ts`: `WAIT`, `KindChip`, `KIND_CHIPS`, `kindLabel(item)`, `waitedText(since, now)`, `waitingOnText(person, scope)`, `notYoursText(item)`, `proposalActionText(detail)`, `recordPath(record)`, `answerPath(item)`, `taskPath(record)`, `hiddenItemsText(n)`, `waitingEmpty(scope)`, `totalOf(counts)`, `cappedText(counts, shown)`.

- [ ] **Step 1: Write the failing test**

Create `src/features/brain/waitingText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { OverdueTaskItem, ProposalItem, QuestionItem, RuleReviewItem } from './brainTypes';
import {
  answerPath,
  cappedText,
  hiddenItemsText,
  KIND_CHIPS,
  kindLabel,
  notYoursText,
  proposalActionText,
  recordPath,
  taskPath,
  totalOf,
  WAIT,
  waitedText,
  waitingEmpty,
  waitingOnText,
} from './waitingText';

const NOW = new Date('2026-10-05T12:00:00Z');
const DANA = { id: 7, name: 'Dana CSM' };
const base = { since: '2026-10-03T02:10:00Z', waiting_on: DANA, can_decide: false };
const REVIEW: RuleReviewItem = {
  ...base, kind: 'rule_review', id: 14, title: 'NPS survey for 12 detractors', record: null,
  detail: { rule_id: 3, rule_name: 'Detractor follow-up', review_kind: 'survey', counts: { send: 12, skip: 2 } },
};
const TASK_PROPOSAL: ProposalItem = {
  ...base, kind: 'proposal', id: 22, title: 'Review Pizza Hut renewal pricing', record: { type: 'customer', id: 6, name: 'Pizza Hut' },
  detail: {
    proposal_kind: 'task',
    action: { customer_id: 6, customer_name: 'Pizza Hut', title: 'Review renewal pricing', assignee_name: 'Carl CSM', due_date: '2026-10-09', priority: 'high' },
    evidence: [], session: null,
  },
};
const INITIATIVE: ProposalItem = {
  ...TASK_PROPOSAL, id: 24, waiting_on: null, record: null,
  detail: {
    proposal_kind: 'initiative',
    action: { metric: 'arr_at_risk', metric_label: 'ARR at risk', dimension: 'product', member: '4', member_label: 'Analytics Suite', target_value: 60000, target_by: '2026-12-31' },
    evidence: [], session: null,
  },
};
const QUESTION: QuestionItem = { ...base, kind: 'question', id: 31, title: 'Who signs off renewals at Uber?', record: { type: 'customer', id: 3, name: 'Uber' }, detail: { asked_by: 'Bob Sales' } };
const TASK: OverdueTaskItem = {
  ...base, kind: 'overdue_task', id: 51, title: 'Call the exec sponsor', since: '2026-10-02',
  record: { type: 'account', id: 9, name: 'Uber EMEA' }, detail: { due_date: '2026-10-02', priority: 'high' },
};

describe('what Waiting on you says (spec §2.1)', () => {
  it('names each kind, and offers the five chips in the spec order', () => {
    expect([REVIEW, TASK_PROPOSAL, INITIATIVE, QUESTION, TASK].map(kindLabel)).toEqual([
      'Rule review', 'Task proposal', 'Initiative proposal', 'Question', 'Overdue task',
    ]);
    expect(KIND_CHIPS.map((chip) => chip.label)).toEqual(['All', 'Rule reviews', 'Proposals', 'Questions', 'Overdue tasks']);
  });

  it('counts how long in whole UTC days, never below today (Contract note 8)', () => {
    expect(waitedText('2026-10-05T01:00:00Z', NOW)).toBe('today');
    expect(waitedText('2026-10-04', NOW)).toBe('1 day');
    expect(waitedText(REVIEW.since, NOW)).toBe('2 days');
    expect(waitedText('2026-10-06', NOW)).toBe('today');
  });

  it('names who it waits on outside Me, and the company when nobody (Contract note 9)', () => {
    expect(waitingOnText(DANA, 'me')).toBeNull();
    expect(waitingOnText(DANA, 'team')).toBe('Waiting on Dana CSM');
    expect(waitingOnText(null, 'company')).toBe('Waiting on the company');
  });

  it('says who will act when the reader may not (Contract note 10)', () => {
    expect(notYoursText(REVIEW)).toBe('Waiting on Dana CSM to decide');
    expect(notYoursText(INITIATIVE)).toBe('Waiting on the company to decide');
    expect(notYoursText(QUESTION)).toBe('Waiting on Dana CSM to answer');
    expect(notYoursText(TASK)).toBe('Waiting on Dana CSM to do it');
  });

  it('puts a proposal’s action in words', () => {
    expect(proposalActionText(TASK_PROPOSAL.detail)).toBe(
      'Approving creates a task: Review renewal pricing on Pizza Hut, for Carl CSM, due 9 Oct 2026, high priority.',
    );
    expect(proposalActionText(INITIATIVE.detail)).toBe('Approving opens an initiative: ARR at risk · Analytics Suite to 60000 by 31 Dec 2026.');
    const whole = { ...INITIATIVE.detail, action: { ...(INITIATIVE.detail.action as object), member_label: '' } } as ProposalItem['detail'];
    expect(proposalActionText(whole)).toBe('Approving opens an initiative: ARR at risk · whole organisation to 60000 by 31 Dec 2026.');
  });

  it('links records, answers and tasks where they live today (Contract notes 3, 5)', () => {
    expect(recordPath({ type: 'customer', id: 6, name: 'Pizza Hut' })).toBe('/organizations/6');
    expect(recordPath(TASK.record)).toBe('/accounts/9');
    expect(answerPath(QUESTION)).toBe('/organizations/3?tab=knowledge');
    expect(answerPath({ ...QUESTION, record: null })).toBe('/copilot');
    expect(answerPath({ ...QUESTION, record: { type: 'account', id: 9, name: 'Uber EMEA' } })).toBe('/copilot');
    expect(taskPath(TASK.record)).toBe('/accounts/9?group=tasks&source=task');
  });

  it('counts hidden items, empties by scope, and the 200 cap (Contract note 4, Decision 13)', () => {
    expect(hiddenItemsText(0)).toBeNull();
    expect(hiddenItemsText(1)).toBe("1 more item about a record you can't open");
    expect(hiddenItemsText(3)).toBe("3 more items about records you can't open");
    expect(['me', 'team', 'company'].map((scope) => waitingEmpty(scope as 'me'))).toEqual([
      'Nothing is waiting on you.', 'Nothing is waiting on your team.', 'Nothing is waiting.',
    ]);
    const counts = { rule_review: 150, proposal: 64, question: 0, overdue_task: 0 };
    expect(totalOf(counts)).toBe(214);
    expect(cappedText(counts, 200)).toBe('Showing the oldest 200 of 214.');
    expect(cappedText({ rule_review: 1, proposal: 1, question: 1, overdue_task: 1 }, 4)).toBeNull();
    expect(WAIT.TITLE).toBe('Waiting on you');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/features/brain/waitingText.test.ts`
Expected: FAIL with "Failed to resolve import "./waitingText"".

- [ ] **Step 3: Add the types**

Append to `src/features/brain/brainTypes.ts` (and add the import at the top, after the existing two):

```ts
import type { InitiativeAction, TaskAction } from '../proposals/proposalsSlice';
```

```ts
// Waiting on you (spec 2026-10-05-brain-waiting-design §3). Contract notes 2
// and 3 make `session` nullable and name the two record types.

export type WaitingKind = 'rule_review' | 'proposal' | 'question' | 'overdue_task';
export const WAITING_KINDS: readonly WaitingKind[] = ['rule_review', 'proposal', 'question', 'overdue_task'];

export interface WaitingPerson {
  id: number;
  name: string;
}

export interface WaitingRecord {
  type: 'customer' | 'account';
  id: number;
  name: string;
}

interface WaitingBase {
  id: number;
  title: string;
  /** When it started waiting: a timestamp, or an overdue task's due date. */
  since: string;
  /** Null: it waits on Company readers. */
  waiting_on: WaitingPerson | null;
  /** May decide (reviews, proposals), answer (questions) or open (tasks). */
  can_decide: boolean;
}

export interface RuleReviewItem extends WaitingBase {
  kind: 'rule_review';
  /** A review covers many records. */
  record: null;
  detail: {
    rule_id: number;
    rule_name: string;
    review_kind: 'survey' | 'campaign';
    counts: { send: number; skip: number };
  };
}

export interface ProposalItem extends WaitingBase {
  kind: 'proposal';
  record: WaitingRecord | null;
  detail: {
    proposal_kind: 'task' | 'initiative';
    action: TaskAction | InitiativeAction;
    evidence: string[];
    session: { id: number; title: string } | null;
  };
}

export interface QuestionItem extends WaitingBase {
  kind: 'question';
  record: WaitingRecord | null;
  detail: { asked_by: string };
}

export interface OverdueTaskItem extends WaitingBase {
  kind: 'overdue_task';
  record: WaitingRecord;
  detail: { due_date: string; priority: 'high' | 'medium' | 'low' };
}

export type WaitingItem = RuleReviewItem | ProposalItem | QuestionItem | OverdueTaskItem;

/** GET waiting/?scope= */
export interface WaitingPayload {
  scope: ScopeKey;
  /** Full totals per kind of what the reader can open (Contract note 4). */
  counts: Record<WaitingKind, number>;
  /** Items about records the reader can't open: counted, never named. */
  hidden: number;
  /** Oldest first, at most 200. */
  items: WaitingItem[];
}

/** GET waiting/count/: the Me scope's total. */
export interface WaitingCount {
  count: number;
}
```

- [ ] **Step 4: Write the text module**

Create `src/features/brain/waitingText.ts`:

```ts
// What Waiting on you says (spec 2026-10-05-brain-waiting-design §2.1), in
// one place so the tests and the page share it.
import { formatDate } from '../customers/formatters';
import type { InitiativeAction, TaskAction } from '../proposals/proposalsSlice';
import { recordHref } from '../segments/segmentFields';
import {
  WAITING_KINDS,
  type ProposalItem,
  type QuestionItem,
  type ScopeKey,
  type WaitingItem,
  type WaitingKind,
  type WaitingPerson,
  type WaitingRecord,
} from './brainTypes';

export const WAIT = {
  TITLE: 'Waiting on you',
  LIST: 'Waiting items',
  SHOW: 'Show',
  LOAD: 'Could not load what is waiting.',
  LOADING: 'Loading what is waiting',
  EMPTY_DETAIL: 'Decisions, questions and overdue tasks show here while they wait on someone.',
  NONE_OF_KIND: 'Nothing of this kind is waiting.',
  COMPANY: 'the company',
  APPROVE: 'Approve',
  REJECT: 'Reject',
  CANCEL: 'Cancel',
  WHY_NOT: 'Why not? (optional)',
  WORKING: 'Working…',
  ANSWER: 'Answer',
  OPEN_TASK: 'Open task',
  FROM_SESSION: 'Decided in session',
  EVIDENCE: 'Evidence',
  ALREADY_DECIDED: 'That proposal was already decided.',
  DECIDE_FAILED: 'Could not record that decision. Try again.',
  ASK: 'Ask the agent',
  ASKING: 'Asking…',
  ASK_HINT: 'Uses AI credits.',
  ASK_FAILED: 'Could not ask the agent for proposals.',
} as const;

export type KindChip = { key: WaitingKind | 'all'; label: string };

export const KIND_CHIPS: readonly KindChip[] = [
  { key: 'all', label: 'All' },
  { key: 'rule_review', label: 'Rule reviews' },
  { key: 'proposal', label: 'Proposals' },
  { key: 'question', label: 'Questions' },
  { key: 'overdue_task', label: 'Overdue tasks' },
];

export function kindLabel(item: WaitingItem): string {
  if (item.kind === 'rule_review') return 'Rule review';
  if (item.kind === 'proposal') return item.detail.proposal_kind === 'task' ? 'Task proposal' : 'Initiative proposal';
  return item.kind === 'question' ? 'Question' : 'Overdue task';
}

const DAY = 86_400_000;

/** "today", "1 day", "3 days": whole UTC calendar days (Contract note 8). */
export function waitedText(since: string, now: Date): string {
  const days = Math.max(0, Math.floor(now.getTime() / DAY) - Math.floor(Date.parse(since) / DAY));
  return days === 0 ? 'today' : `${days} ${days === 1 ? 'day' : 'days'}`;
}

const nameOf = (person: WaitingPerson | null) => (person ? person.name : WAIT.COMPANY);

/** "Waiting on Dana CSM"; null in Me, where it waits on the reader. */
export function waitingOnText(person: WaitingPerson | null, scope: ScopeKey): string | null {
  return scope === 'me' ? null : `Waiting on ${nameOf(person)}`;
}

/** When the reader may not act on it: who will (Contract note 10). */
export function notYoursText(item: WaitingItem): string {
  const verb = item.kind === 'question' ? 'answer' : item.kind === 'overdue_task' ? 'do it' : 'decide';
  return `Waiting on ${nameOf(item.waiting_on)} to ${verb}`;
}

export function proposalActionText(detail: ProposalItem['detail']): string {
  if (detail.proposal_kind === 'task') {
    const a = detail.action as TaskAction;
    return `Approving creates a task: ${a.title} on ${a.customer_name}, for ${a.assignee_name}, due ${formatDate(a.due_date)}, ${a.priority} priority.`;
  }
  const a = detail.action as InitiativeAction;
  return `Approving opens an initiative: ${a.metric_label} · ${a.member_label || 'whole organisation'} to ${a.target_value} by ${formatDate(a.target_by)}.`;
}

export function recordPath(record: WaitingRecord): string {
  return recordHref(record.type, record.id);
}

/** Where a question is answered today (Contract note 5). */
export function answerPath(item: QuestionItem): string {
  return item.record?.type === 'customer' ? `${recordPath(item.record)}?tab=knowledge` : '/copilot';
}

/** The record's story, filtered to its tasks (Contract note 5). */
export function taskPath(record: WaitingRecord): string {
  return `${recordPath(record)}?group=tasks&source=task`;
}

export function hiddenItemsText(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 more item about a record you can't open" : `${n} more items about records you can't open`;
}

export function waitingEmpty(scope: ScopeKey): string {
  if (scope === 'me') return 'Nothing is waiting on you.';
  return scope === 'team' ? 'Nothing is waiting on your team.' : 'Nothing is waiting.';
}

export function totalOf(counts: Record<WaitingKind, number>): number {
  return WAITING_KINDS.reduce((sum, kind) => sum + counts[kind], 0);
}

/** The 200 cap (Contract note 4). */
export function cappedText(counts: Record<WaitingKind, number>, shown: number): string | null {
  const total = totalOf(counts);
  return total > shown ? `Showing the oldest ${shown} of ${total}.` : null;
}
```

- [ ] **Step 5: Run the test and the type-check**

Run: `npx vitest run --maxWorkers=2 src/features/brain/waitingText.test.ts && npx tsc -b --noEmit`
Expected: PASS (7 tests); tsc prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/features/brain/brainTypes.ts src/features/brain/waitingText.ts src/features/brain/waitingText.test.ts
git commit -m "$(cat <<'EOF'
feat(brain): Waiting on you contract types and copy

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The API and the stateful contract stub

Spec §3 (both endpoints; 400 before 403), §1.1 (who is on each desk), §1.2 (who may decide; the 403 sentence; 409); Contract notes 1, 6, 7, 11, 12.

**Files:**
- Modify: `src/features/brain/brainApi.ts`, `src/features/brain/testBrain.ts`
- Create: `src/features/brain/testWaitingFixtures.ts`
- Test: `src/features/brain/testBrain.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: Task 1's types; `Proposal` (type, `features/proposals/proposalsSlice`); `approveReview`, `skipReview` (`features/rules/ruleApi`).
- Produces:
  - `brainApi.ts`: `fetchWaiting(scope): Promise<WaitingPayload>`, `fetchWaitingCount(): Promise<WaitingCount>`, `decideProposal(id, decision: 'approve' | 'reject', note?): Promise<{ proposal: Proposal }>`, `askAgent(): Promise<{ proposals: Proposal[] }>`.
  - `testWaitingFixtures.ts`: `ALICE`, `CARL`, `DANA`, `MY_RULE_REVIEW` (14), `DANA_RULE_REVIEW` (15), `CARL_TASK_PROPOSAL` (22), `SESSION_PROPOSAL` (23), `INITIATIVE_PROPOSAL` (24), `GENERATED_PROPOSAL` (25), `MY_QUESTION` (31), `CARL_QUESTION` (32), `MY_OVERDUE` (50), `CARL_OVERDUE` (51), `deskOf(scope, items, hidden?)`, `ME_WAITING`, `TEAM_WAITING`, `COMPANY_WAITING`, `WAITING_NOW`.
  - `testBrain.ts` `BrainStub` gains `waiting`, `failWaiting`, `refuseNextDecision: { status: number; body: unknown }`, `generates: WaitingItem`, `passThrough`. Decisions honour the existing `holdWrites`.

- [ ] **Step 1: Write the failing test**

In `src/features/brain/testBrain.test.ts`, extend the imports:

```ts
import { approveReview, skipReview } from '../rules/ruleApi';
import { askAgent, decideProposal, fetchBrief, fetchChanged, fetchExplanation, fetchScopes, fetchWaiting, fetchWaitingCount, isScopeRefusal, writeBrief, writeExplanation } from './brainApi';
import { DANA_RULE_REVIEW, deskOf, GENERATED_PROPOSAL, TEAM_WAITING } from './testWaitingFixtures';
```

and append:

```ts
describe('Waiting on you on the contract stub (Waiting spec §3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads each desk and the Me count', async () => {
    const { spy } = stubBrain();
    expect(await fetchWaiting('team')).toEqual(TEAM_WAITING);
    expect(await fetchWaitingCount()).toEqual({ count: 4 });
    expect(requests(spy, 'GET', '/brain/waiting/')).toEqual(['/brain/waiting/?scope=team', '/brain/waiting/count/']);
  });

  it('answers an unknown scope 400 before a refused one 403', async () => {
    const { revoke } = stubBrain();
    revoke('company');
    expect((await refusal(fetchWaiting('everything' as never)))?.status).toBe(400);
    expect(isScopeRefusal(await refusal(fetchWaiting('company')))).toBe(true);
  });

  it('takes a decided item off every desk and the count, and answers a second decision 409', async () => {
    const { spy } = stubBrain();
    expect(await decideProposal(22, 'reject', 'Pricing is settled')).toEqual({ proposal: { id: 22, status: 'rejected' } });
    expect(await approveReview(14)).toEqual({ survey_send_id: 31 });
    const team = await fetchWaiting('team');
    expect(team.items.some((item) => item.kind === 'proposal' && item.id === 22)).toBe(false);
    expect(team.counts).toEqual({ rule_review: 0, proposal: 0, question: 2, overdue_task: 2 });
    expect(await fetchWaitingCount()).toEqual({ count: 3 });
    expect((await refusal(approveReview(14)))?.status).toBe(409);
    const call = spy.mock.calls.find(([input]) => String(input).includes('/proposals/22/reject/'));
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({ note: 'Pricing is settled' });
  });

  it("refuses a proposal the reader can't decide, in the server's words (§1.2)", async () => {
    stubBrain({ offered: ['me', 'team'] });
    const refused = await refusal(decideProposal(23, 'approve'));
    expect([refused?.status, refused?.message]).toEqual([403, "You can't decide this proposal."]);
  });

  it('answers a campaign review with its send, and skips a survey review', async () => {
    stubBrain({ waiting: { me: deskOf('me', [{ ...DANA_RULE_REVIEW, can_decide: true }]) } });
    expect(await approveReview(15)).toEqual({ campaign_send_id: 500 });
    stubBrain();
    expect(await skipReview(14)).toEqual({ id: 14, status: 'skipped' });
  });

  it('adds what the agent proposes to the Company desk', async () => {
    const { spy } = stubBrain({ generates: GENERATED_PROPOSAL });
    expect(await askAgent()).toEqual({ proposals: [] });
    const company = await fetchWaiting('company');
    expect(company.items[company.items.length - 1]).toEqual(GENERATED_PROPOSAL);
    expect(company.counts.proposal).toBe(4);
    expect(requests(spy, 'POST', '/metrics/')).toEqual(['/metrics/proposals/generate/']);
  });

  it('passes every request outside /brain/ to passThrough, untouched', async () => {
    const other = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ survey_send_id: 77 }) }));
    stubBrain({ passThrough: other });
    expect(await approveReview(14)).toEqual({ survey_send_id: 77 });
    expect(other).toHaveBeenCalledTimes(1);
    expect(await fetchWaitingCount()).toEqual({ count: 4 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/features/brain/testBrain.test.ts`
Expected: FAIL with "Failed to resolve import "./testWaitingFixtures"".

- [ ] **Step 3: Add the API**

In `src/features/brain/brainApi.ts`, add `WaitingCount` and `WaitingPayload` to the `./brainTypes` type import, add `import type { Proposal } from '../proposals/proposalsSlice';`, and append after `writeExplanation`:

```ts
export const fetchWaiting = (scope: ScopeKey) => apiFetch<WaitingPayload>(scoped('waiting/', scope));
/** The Me scope's total, for the sidebar badge (Contract note 11). */
export const fetchWaitingCount = () => apiFetch<WaitingCount>(`${BASE}waiting/count/`);
/** Waiting spec §1.2: 403 when the reader may not decide it, 409 when decided (Contract note 7). */
export const decideProposal = (id: number, decision: 'approve' | 'reject', note = '') =>
  apiFetch<{ proposal: Proposal }>(`/metrics/proposals/${id}/${decision}/`, { method: 'POST', body: { note } });
/** Ask the agent: a real, paid model call, only ever from a click (Contract note 12). */
export const askAgent = () => apiFetch<{ proposals: Proposal[] }>('/metrics/proposals/generate/', { method: 'POST' });
```

- [ ] **Step 4: Add the fixtures**

Create `src/features/brain/testWaitingFixtures.ts`:

```ts
// Test-only: §3-shaped desks on 5 Oct 2026 for Alice (id 1), a manager with
// one report, Carl. Dana is outside her team. Me and My team read as Alice
// without view_all_accounts (she may decide Carl's proposal through the
// chain, not Dana's); Company reads as an admin.
import type {
  OverdueTaskItem,
  ProposalItem,
  QuestionItem,
  RuleReviewItem,
  ScopeKey,
  WaitingItem,
  WaitingKind,
  WaitingPayload,
} from './brainTypes';

export const WAITING_NOW = new Date('2026-10-05T12:00:00Z');
export const ALICE = { id: 1, name: 'Alice Admin' };
export const CARL = { id: 5, name: 'Carl CSM' };
export const DANA = { id: 7, name: 'Dana CSM' };

export const MY_RULE_REVIEW: RuleReviewItem = {
  kind: 'rule_review', id: 14, title: 'NPS survey for 12 detractors', since: '2026-10-03T02:10:00Z',
  waiting_on: ALICE, record: null, can_decide: true,
  detail: { rule_id: 3, rule_name: 'Detractor follow-up', review_kind: 'survey', counts: { send: 12, skip: 2 } },
};

export const DANA_RULE_REVIEW: RuleReviewItem = {
  kind: 'rule_review', id: 15, title: 'Win-back email for 4 accounts', since: '2026-10-04T02:10:00Z',
  waiting_on: DANA, record: null, can_decide: false,
  detail: { rule_id: 8, rule_name: 'Win-back watch', review_kind: 'campaign', counts: { send: 4, skip: 0 } },
};

export const CARL_TASK_PROPOSAL: ProposalItem = {
  kind: 'proposal', id: 22, title: 'Review Pizza Hut renewal pricing', since: '2026-10-01T09:00:00Z',
  waiting_on: CARL, record: { type: 'customer', id: 6, name: 'Pizza Hut' }, can_decide: true,
  detail: {
    proposal_kind: 'task',
    action: { customer_id: 6, customer_name: 'Pizza Hut', title: 'Review renewal pricing', assignee_name: 'Carl CSM', due_date: '2026-10-09', priority: 'high' },
    evidence: ['ARR at risk 40,000 to 90,000', 'Renewal on 30 Nov'],
    session: null,
  },
};

/** From a session Alice joined, about Dana's customer: hers to see, not to decide. */
export const SESSION_PROPOSAL: ProposalItem = {
  kind: 'proposal', id: 23, title: 'Book the Uber exec sponsor call', since: '2026-10-02T10:00:00Z',
  waiting_on: DANA, record: { type: 'customer', id: 3, name: 'Uber' }, can_decide: false,
  detail: {
    proposal_kind: 'task',
    action: { customer_id: 3, customer_name: 'Uber', title: 'Book the exec sponsor call', assignee_name: 'Dana CSM', due_date: '2026-10-12', priority: 'medium' },
    evidence: ['Sponsor left in September'],
    session: { id: 4, title: 'Renewal huddle' },
  },
};

export const INITIATIVE_PROPOSAL: ProposalItem = {
  kind: 'proposal', id: 24, title: 'Cut Analytics Suite risk', since: '2026-09-30T18:00:00Z',
  waiting_on: null, record: null, can_decide: true,
  detail: {
    proposal_kind: 'initiative',
    action: { metric: 'arr_at_risk', metric_label: 'ARR at risk', dimension: 'product', member: '4', member_label: 'Analytics Suite', target_value: 60000, target_by: '2026-12-31' },
    evidence: ['ARR at risk 64,090 to 114,540'],
    session: null,
  },
};

/** What Ask the agent adds in tests (stubBrain `generates`). */
export const GENERATED_PROPOSAL: ProposalItem = { ...INITIATIVE_PROPOSAL, id: 25, title: 'Lift Enterprise expansion', since: '2026-10-05T12:00:00Z' };

export const MY_QUESTION: QuestionItem = {
  kind: 'question', id: 31, title: 'Who signs off renewals at Uber?', since: '2026-09-29T11:00:00Z',
  waiting_on: ALICE, record: { type: 'customer', id: 3, name: 'Uber' }, can_decide: true, detail: { asked_by: 'Bob Sales' },
};

export const CARL_QUESTION: QuestionItem = {
  kind: 'question', id: 32, title: 'Which template do we use for QBRs?', since: '2026-10-04T08:00:00Z',
  waiting_on: CARL, record: null, can_decide: false, detail: { asked_by: 'Alice Admin' },
};

export const MY_OVERDUE: OverdueTaskItem = {
  kind: 'overdue_task', id: 50, title: 'Send the QBR deck', since: '2026-10-04',
  waiting_on: ALICE, record: { type: 'customer', id: 6, name: 'Pizza Hut' }, can_decide: true,
  detail: { due_date: '2026-10-04', priority: 'medium' },
};

export const CARL_OVERDUE: OverdueTaskItem = {
  kind: 'overdue_task', id: 51, title: 'Call the exec sponsor', since: '2026-10-02',
  waiting_on: CARL, record: { type: 'account', id: 9, name: 'Uber EMEA' }, can_decide: true,
  detail: { due_date: '2026-10-02', priority: 'high' },
};

/** A desk as the server sends it: counted per kind, oldest first. */
export function deskOf(scope: ScopeKey, items: WaitingItem[], hidden = 0): WaitingPayload {
  const counts: Record<WaitingKind, number> = { rule_review: 0, proposal: 0, question: 0, overdue_task: 0 };
  for (const item of items) counts[item.kind] += 1;
  return { scope, counts, hidden, items: [...items].sort((a, b) => Date.parse(a.since) - Date.parse(b.since)) };
}

export const ME_WAITING = deskOf('me', [MY_RULE_REVIEW, SESSION_PROPOSAL, MY_QUESTION, MY_OVERDUE]);
export const TEAM_WAITING = deskOf('team', [MY_RULE_REVIEW, MY_QUESTION, MY_OVERDUE, CARL_TASK_PROPOSAL, CARL_QUESTION, CARL_OVERDUE], 1);
export const COMPANY_WAITING = deskOf(
  'company',
  [...TEAM_WAITING.items, DANA_RULE_REVIEW, { ...SESSION_PROPOSAL, can_decide: true }, INITIATIVE_PROPOSAL],
  2,
);
```

- [ ] **Step 5: Teach the stub the desk and the decisions**

In `src/features/brain/testBrain.ts`:

1. Extend the header comment's first sentence to: `// Test-only: one stateful fetch stub for /api/v1/brain/ (spec §4, and Waiting spec §3), with the decisions Waiting on you sends.`
2. Change the type import to `import { SCOPE_KEYS, type ChangedPayload, type RuleReviewItem, type ScopeBrief, type ScopeExplanation, type ScopeKey, type WaitingItem, type WaitingPayload } from './brainTypes';` and add `import { COMPANY_WAITING, ME_WAITING, TEAM_WAITING } from './testWaitingFixtures';`.
3. Add to `BrainStub`:

```ts
  /** The desks by scope (Waiting §3). Default: ME_WAITING, TEAM_WAITING, COMPANY_WAITING. */
  waiting?: Partial<Record<ScopeKey, WaitingPayload>>;
  /** How many waiting/ reads fail (500) first. */
  failWaiting?: number;
  /** The next rule review or proposal decision answers this instead, once. */
  refuseNextDecision?: { status: number; body: unknown };
  /** Ask the agent adds this to the Company desk. */
  generates?: WaitingItem;
  /** Every request outside /brain/ goes here instead (e.g. stubRules' spy). */
  passThrough?: (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;
```

4. In `stubBrain`, after `const gate = …`, add:

```ts
  const desks: Record<ScopeKey, WaitingPayload> = { me: ME_WAITING, team: TEAM_WAITING, company: COMPANY_WAITING, ...stub.waiting };
  const decided = new Set<string>();
  let failWaiting = stub.failWaiting ?? 0;
  let decisionRefusal = stub.refuseNextDecision ?? null;
  const itemKey = (kind: string, id: number) => `${kind}:${id}`;

  /** A desk without what was decided, its counts lowered to match. */
  function desk(scope: ScopeKey): WaitingPayload {
    const all = desks[scope];
    const counts = { ...all.counts };
    for (const item of all.items) {
      if (decided.has(itemKey(item.kind, item.id))) counts[item.kind] = Math.max(0, counts[item.kind] - 1);
    }
    return { ...all, counts, items: all.items.filter((item) => !decided.has(itemKey(item.kind, item.id))) };
  }

  const found = (kind: string, id: number) =>
    SCOPE_KEYS.flatMap((key) => desks[key].items.filter((item) => item.kind === kind && item.id === id).map((item) => ({ key, item })));

  /** §1.2: 404 unknown, 409 decided, 403 when no offered desk lets the reader decide it. */
  async function decide(kind: 'rule_review' | 'proposal', id: number, answer: unknown) {
    await gate;
    const where = found(kind, id);
    if (where.length === 0) return json(404, { detail: 'Not found.' });
    if (decided.has(itemKey(kind, id))) return json(409, { detail: 'This has already been decided.' });
    if (!where.some(({ key, item }) => offered.has(key) && item.can_decide)) {
      return json(403, { detail: kind === 'proposal' ? "You can't decide this proposal." : 'Only the rule owner can decide this review.' });
    }
    if (decisionRefusal) {
      const refused = decisionRefusal;
      decisionRefusal = null;
      return json(refused.status, refused.body);
    }
    decided.add(itemKey(kind, id));
    return json(200, answer);
  }
```

5. In the `spy` body, replace the first two lines after `const method = …` (the `/questions/` and `/knowledge/activity/` answers) with:

```ts
    const full = url.pathname.replace(/^\/api\/v1/, '');
    if (stub.passThrough && !full.startsWith('/brain/')) return stub.passThrough(input, init);
    if (url.pathname.endsWith('/questions/')) return json(200, []);
    if (url.pathname.endsWith('/knowledge/activity/')) return json(200, { days: 30, since: ACTIVITY_SINCE, functions: [] });

    const review = /^\/rules\/reviews\/(\d+)\/(approve|skip)\/$/.exec(full);
    if (review && method === 'POST') {
      const id = Number(review[1]);
      const item = found('rule_review', id)[0]?.item as RuleReviewItem | undefined;
      const answer = review[2] === 'skip' ? { id, status: 'skipped' } : item?.detail.review_kind === 'campaign' ? { campaign_send_id: 500 } : { survey_send_id: 31 };
      return decide('rule_review', id, answer);
    }
    const proposal = /^\/metrics\/proposals\/(\d+)\/(approve|reject)\/$/.exec(full);
    if (proposal && method === 'POST') {
      const id = Number(proposal[1]);
      return decide('proposal', id, { proposal: { id, status: proposal[2] === 'approve' ? 'approved' : 'rejected' } });
    }
    if (full === '/metrics/proposals/generate/' && method === 'POST') {
      await gate;
      const added = stub.generates;
      if (added) {
        const company = desks.company;
        desks.company = { ...company, items: [...company.items, added], counts: { ...company.counts, [added.kind]: company.counts[added.kind] + 1 } };
      }
      return json(200, { proposals: [] });
    }
```

6. Before `const route = …`, add the count, and widen the route to `waiting`:

```ts
    if (path === '/waiting/count/' && method === 'GET') {
      const me = desk('me');
      return json(200, { count: Object.values(me.counts).reduce((sum, n) => sum + n, 0) });
    }
```

```ts
    const route = /^\/(changed|brief|waiting|explanations\/([^/]+))\/$/.exec(path);
```

7. After the `changed` branch, add:

```ts
    if (route[1] === 'waiting' && method === 'GET') {
      if (failWaiting > 0) { failWaiting -= 1; return json(500, { detail: 'Try later.' }); }
      return json(200, desk(scope));
    }
```

- [ ] **Step 6: Run the stub's tests, the type-check and the brain folder**

Run: `npx vitest run --maxWorkers=2 src/features/brain && npx tsc -b --noEmit`
Expected: PASS (the old stub tests unchanged, 7 new); tsc prints nothing.

- [ ] **Step 7: Commit**

```bash
git add src/features/brain/brainApi.ts src/features/brain/testBrain.ts src/features/brain/testBrain.test.ts src/features/brain/testWaitingFixtures.ts
git commit -m "$(cat <<'EOF'
feat(brain): Waiting on you API and contract stub

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The shared rule review decision

Spec §2.1 ("using the existing RuleReviews logic (shared component, not a copy). Refusals show at the button."), §2.1 "Each decision sends once"; Contract note 6; Decision 4.

**Files:**
- Create: `src/components/rules/ReviewDecision.tsx`
- Modify: `src/components/rules/RuleReviews.tsx` (`ReviewItem` uses it)
- Test: `src/components/rules/ReviewDecision.test.tsx`; `src/components/rules/RuleReviews.test.tsx` must stay green unchanged

**Interfaces:**
- Consumes: `approveReview`, `skipReview` (`features/rules/ruleApi`); `isRuleChanged`, `refusalText`, `RULE_CHANGED` (`features/rules/ruleText`); `ApproveAnswer` (`features/rules/ruleTypes`); `dayText` (`features/segments/ruleSentence`); `useSubmitOnce` (`components/plans/useSubmitOnce`); `BUTTON`, `FOCUS`, `QUIET` (`components/organizations/portfolio/styles`); `errorMessage` (`components/organizations/portfolio/usePagedRead`).
- Produces: `REVIEW_DECIDED` (`'That review was already decided.'`), `ReviewDecisionProps`, `ReviewDecision(props)` rendering the refusal (`data-part="refusal"`, focused when it arrives), any other error (`role="alert"`), then Approve and Skip.

- [ ] **Step 1: Write the failing test**

Create `src/components/rules/ReviewDecision.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RULE_CHANGED } from '../../features/rules/ruleText';
import { REVIEW_DECIDED, ReviewDecision, type ReviewDecisionProps } from './ReviewDecision';

type Answer = { status: number; body: unknown };
const respond = ({ status, body }: Answer) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** Answers in order; the last one repeats. */
function stubAnswers(...answers: Answer[]) {
  const spy = vi.fn(async () => respond(answers.length > 1 ? (answers.shift() as Answer) : answers[0]));
  vi.stubGlobal('fetch', spy);
  return spy;
}
const posts = (spy: ReturnType<typeof stubAnswers>) =>
  spy.mock.calls.map((call) => new URL(String((call as unknown[])[0])).pathname.replace(/^\/api\/v1/, ''));

function renderDecision(props: Partial<ReviewDecisionProps> = {}) {
  const handlers = { onApproved: vi.fn(), onGone: vi.fn(), onRefused: vi.fn() };
  render(<ReviewDecision reviewId={2} kind="survey" ruleName="Renewal watch" runOn="2026-10-04" {...handlers} {...props} />);
  return handlers;
}

describe('ReviewDecision (shared by Waiting on you; Waiting spec §2.1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('approves once on a double click and hands back the new send', async () => {
    const spy = stubAnswers({ status: 200, body: { survey_send_id: 31 } });
    const { onApproved } = renderDecision();
    await userEvent.dblClick(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onApproved).toHaveBeenCalledWith({ survey_send_id: 31 }));
    expect(onApproved).toHaveBeenCalledTimes(1);
    expect(posts(spy)).toEqual(['/rules/reviews/2/approve/']);
  });

  it('shows a refusal at Approve, moves focus to it, and lets Approve try again', async () => {
    const spy = stubAnswers({ status: 400, body: { detail: "Email isn't set up yet." } }, { status: 200, body: { survey_send_id: 31 } });
    const { onApproved, onRefused } = renderDecision();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const refusal = await screen.findByText("Surveys refused it: Email isn't set up yet. Fix it, then approve again, or skip it.");
    await waitFor(() => expect(document.activeElement).toBe(refusal));
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveAccessibleDescription(/Surveys refused it/);
    expect(onRefused).toHaveBeenCalledWith({ detail: "Email isn't set up yet." });
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onApproved).toHaveBeenCalledTimes(1));
    expect(posts(spy)).toHaveLength(2);
  });

  it('shows a refusal the server stored before any click', () => {
    stubAnswers({ status: 200, body: {} });
    renderDecision({ kind: 'campaign', storedRefusal: { detail: 'No sender address.' } });
    expect(screen.getByText('Campaigns refused it: No sender address. Fix it, then approve again, or skip it.')).toBeInTheDocument();
  });

  it.each([
    [409, { detail: 'This review has already been decided.' }, REVIEW_DECIDED],
    [404, { detail: 'Not found.' }, REVIEW_DECIDED],
    [400, { detail: RULE_CHANGED }, RULE_CHANGED],
  ])('gives the review up on a %i, saying why', async (status, body, message) => {
    stubAnswers({ status, body });
    const { onGone, onRefused } = renderDecision();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onGone).toHaveBeenCalledWith(message));
    expect(onRefused).not.toHaveBeenCalled();
  });

  it('skips once, naming the rule and its night', async () => {
    const spy = stubAnswers({ status: 200, body: { id: 2, status: 'skipped' } });
    const { onGone } = renderDecision();
    await userEvent.dblClick(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(onGone).toHaveBeenCalledWith('Skipped the survey from Renewal watch for 4 Oct 2026.'));
    expect(posts(spy)).toEqual(['/rules/reviews/2/skip/']);
  });

  it('skips a campaign with no night named', async () => {
    stubAnswers({ status: 200, body: {} });
    const { onGone } = renderDecision({ kind: 'campaign', ruleName: 'Win-back watch', runOn: undefined });
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(onGone).toHaveBeenCalledWith('Skipped the campaign from Win-back watch.'));
  });

  it('shows any other failure and keeps both buttons', async () => {
    stubAnswers({ status: 500, body: { detail: 'Surveys are down.' } });
    renderDecision();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Surveys are down.');
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/components/rules/ReviewDecision.test.tsx`
Expected: FAIL with "Failed to resolve import "./ReviewDecision"".

- [ ] **Step 3: Write the shared component**

Create `src/components/rules/ReviewDecision.tsx`:

```tsx
import { useEffect, useId, useRef, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import { approveReview, skipReview } from '../../features/rules/ruleApi';
import { isRuleChanged, refusalText, RULE_CHANGED } from '../../features/rules/ruleText';
import type { ApproveAnswer } from '../../features/rules/ruleTypes';
import { dayText } from '../../features/segments/ruleSentence';
import { BUTTON, FOCUS, QUIET } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSubmitOnce } from '../plans/useSubmitOnce';

export const REVIEW_DECIDED = 'That review was already decided.';

export interface ReviewDecisionProps {
  reviewId: number;
  kind: 'survey' | 'campaign';
  ruleName: string;
  /** The night it came from, when the caller has it: named in the skip sentence. */
  runOn?: string;
  /** A refusal the server stored on the review, when the caller has it. */
  storedRefusal?: Record<string, unknown>;
  /** Approved: the send it created. The caller opens it. */
  onApproved: (answer: ApproveAnswer) => void;
  /** The review left the queue (skipped, decided elsewhere, or expired); `message` says which. */
  onGone: (message: string) => void;
  /** Surveys or Campaigns refused it; the server now stores this on the review. */
  onRefused?: (error: Record<string, unknown>) => void;
}

/** Approve or Skip one rule review (rules spec §2.4; Waiting spec §2.1), each
 *  sent once. A refusal shows at Approve and takes focus; a 409, a 404 or the
 *  backend's RULE_CHANGED gives the review up, saying why. */
export function ReviewDecision({ reviewId, kind, ruleName, runOn, storedRefusal, onApproved, onGone, onRefused }: ReviewDecisionProps) {
  const refusalId = useId();
  const refusalRef = useRef<HTMLParagraphElement>(null);
  const [refusedTick, setRefusedTick] = useState(0);
  const [latest, setLatest] = useState<Record<string, unknown> | null>(null);
  const [pending, setPending] = useState<'approve' | 'skip' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useSubmitOnce({ holdOnSuccess: true });
  useEffect(() => {
    if (refusedTick > 0) refusalRef.current?.focus();
  }, [refusedTick]);

  const refusal = refusalText(latest ?? storedRefusal);
  const noun = kind === 'campaign' ? 'campaign' : 'survey';
  const decidedElsewhere = (err: unknown) => err instanceof ApiError && (err.status === 409 || err.status === 404);

  async function approve() {
    const outcome = await run(() => {
      setPending('approve');
      setError(null);
      return approveReview(reviewId);
    });
    if (!outcome) return;
    if (outcome.ok) {
      onApproved(outcome.value);
      return;
    }
    const err = outcome.error;
    setPending(null);
    if (decidedElsewhere(err)) onGone(REVIEW_DECIDED);
    else if (err instanceof ApiError && err.status === 400 && isRuleChanged(err.body)) onGone(RULE_CHANGED);
    else if (err instanceof ApiError && err.status === 400 && err.body !== null && typeof err.body === 'object') {
      const body = err.body as Record<string, unknown>;
      setLatest(body);
      setRefusedTick((n) => n + 1);
      onRefused?.(body);
    } else setError(errorMessage(err, 'Could not approve it. Try again.'));
  }

  async function skip() {
    const outcome = await run(() => {
      setPending('skip');
      setError(null);
      return skipReview(reviewId);
    });
    if (!outcome) return;
    if (outcome.ok) {
      onGone(`Skipped the ${noun} from ${ruleName}${runOn ? ` for ${dayText(runOn)}` : ''}.`);
      return;
    }
    setPending(null);
    if (decidedElsewhere(outcome.error)) onGone(REVIEW_DECIDED);
    else setError(errorMessage(outcome.error, 'Could not skip it. Try again.'));
  }

  return (
    <div className="flex flex-col gap-2">
      {refusal ? (
        <p ref={refusalRef} id={refusalId} data-part="refusal" data-error role="alert" tabIndex={-1} className={`text-[13px] text-danger ${FOCUS}`}>
          {kind === 'campaign' ? 'Campaigns' : 'Surveys'} refused it: {refusal} Fix it, then approve again, or skip it.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void approve()} disabled={busy} aria-describedby={refusal ? refusalId : undefined} className={BUTTON}>
          {pending === 'approve' ? 'Sending…' : 'Approve'}
        </button>
        <button type="button" onClick={() => void skip()} disabled={busy} className={QUIET}>
          {pending === 'skip' ? 'Skipping…' : 'Skip'}
        </button>
      </div>
    </div>
  );
}
```

Note the 500 test: a refusal `<p>` is absent, so `findByRole('alert')` finds the one error line.

- [ ] **Step 4: Use it in RuleReviews**

In `src/components/rules/RuleReviews.tsx`:
- The React import becomes `import { useEffect, useId, useState } from 'react';` (`RuleReviews` still uses all three; `useRef` goes).
- Delete the imports of `ApiError`, `approveReview`, `skipReview`, `isRuleChanged`, `refusalText`, `RULE_CHANGED`, `PRIMARY` and `QUIET`. Keep `fetchReviews`, `errorMessage`, `dayText`, `FOCUS`, `MONO`, `campaignReviewParts`, `triggerParts` and the rest: the list and the item body still use them. `npx tsc -b --noEmit` and `npm run lint` in Steps 5–6 flag anything left unused.
- Delete `const DECIDED = …`.
- Add `import { ReviewDecision } from './ReviewDecision';`.
- Replace the whole `ReviewItem` function with:

```tsx
/** One night's survey or campaign from one of my rules (spec §2.4; campaigns
 *  spec §2.5): the rule and its trigger, what it would do, then the shared
 *  ReviewDecision (Waiting spec §2.1). */
function ReviewItem({ review, onDecided, onRefused }: {
  review: RuleReview;
  onDecided: (id: number, message: string) => void;
  onRefused: (review: RuleReview) => void;
}) {
  const navigate = useNavigate();
  return (
    <li data-review={review.id} data-kind={review.kind ?? 'survey'} className="flex flex-col gap-3 rounded-xl bg-surface p-3">
      <div className="flex flex-col gap-0.5">
        <Link to={`/scenarios/rules/${review.rule.id}`} className={`inline-flex min-h-11 items-center self-start text-[15px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`}>
          {review.rule.name}
        </Link>
        <RuleSentence parts={triggerParts(review.rule, review.rule.segment)} />
        {review.kind === 'campaign' ? null : <SurveyReach review={review} />}
        <p className="text-[11px] text-ink-muted">
          From the night of {dayText(review.run_on)} · waits until {dayLabel(review.expires_at)}
        </p>
      </div>
      {review.kind === 'campaign' ? (
        <CampaignBody review={review} />
      ) : (
        <SurveyPreview type={review.action.survey_type} subject={review.action.subject} intro={review.action.intro} workspace={review.organisation_name} />
      )}
      <ReviewDecision
        reviewId={review.id}
        kind={review.kind === 'campaign' ? 'campaign' : 'survey'}
        ruleName={review.rule.name}
        runOn={review.run_on}
        storedRefusal={review.result.error}
        onApproved={(answer) => {
          if ('campaign_send_id' in answer) {
            const campaign = (review as CampaignReview).campaign;
            navigate(campaign ? campaignPath(campaign.id, answer.campaign_send_id) : '/campaigns');
          } else navigate(`/surveys/${answer.survey_send_id}`);
        }}
        onGone={(message) => onDecided(review.id, message)}
        onRefused={(error) => onRefused({ ...review, result: { error } })}
      />
    </li>
  );
}
```

(`dayText` stays imported: the night line uses it.)

- [ ] **Step 5: Run both suites, the rules house rules and the type-check**

Run: `npx vitest run --maxWorkers=2 src/components/rules/ReviewDecision.test.tsx src/components/rules/RuleReviews.test.tsx src/components/rules/houseRules.test.ts && npx tsc -b --noEmit`
Expected: PASS (8 new; every RuleReviews test unchanged and green); tsc prints nothing.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: `15 problems (0 errors, 15 warnings)`.

- [ ] **Step 7: Commit**

```bash
git add src/components/rules/ReviewDecision.tsx src/components/rules/ReviewDecision.test.tsx src/components/rules/RuleReviews.tsx
git commit -m "$(cat <<'EOF'
refactor(rules): share the rule review decision and send it once

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: One waiting item: the row, the proposal decision and the badge's count

Spec §2.1 (each row; Approve / Reject when `can_decide`, else "Waiting on Dana CSM to decide"; Answer; Open task; decide once and leave), Decision 3 of the spec (session proposals); Contract notes 5–11; Decisions 1, 3, 4, 14–16.

**Files:**
- Create: `src/components/brain/useWaitingCount.ts`, `src/components/brain/ProposalDecision.tsx`, `src/components/brain/WaitingRow.tsx`
- Test: `src/components/brain/useWaitingCount.test.tsx`, `src/components/brain/WaitingRow.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`WAIT`, `kindLabel`, `waitedText`, `waitingOnText`, `notYoursText`, `proposalActionText`, `recordPath`, `answerPath`, `taskPath`); Task 2 (`decideProposal`, `fetchWaitingCount`, `stubBrain`, `requests`, fixtures); Task 3 (`ReviewDecision`); `formatDate`; `BUTTON`, `QUIET`, `FOCUS`, `MONO`; `useSubmitOnce`; `errorMessage`; `Where` (`pages/organizations/testList`).
- Produces:
  - `useWaitingCount.ts`: `refreshWaitingCount(): void`, `useWaitingCount(userId: number | null): number | null`.
  - `ProposalDecision.tsx`: `ProposalDecision({ proposalId, title, onGone: (message: string) => void })`.
  - `WaitingRow.tsx`: `WaitingRowProps { item: WaitingItem; scope: ScopeKey; now: Date; onGone: (item: WaitingItem, message: string) => void }`, `WaitingRow(props)` rendering `<li data-item="<kind>-<id>">` with a `data-part="meta"` line.

- [ ] **Step 1: Write the failing tests**

Create `src/components/brain/useWaitingCount.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { refreshWaitingCount, useWaitingCount } from './useWaitingCount';

const respond = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('useWaitingCount (spec Decision 5, Contract note 11)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the Me count, again on refreshWaitingCount(), and keeps the last count when a read fails', async () => {
    const answers = [respond(200, { count: 4 }), respond(200, { count: 3 }), respond(500, { detail: 'Down.' })];
    const spy = vi.fn(async () => answers.shift() ?? respond(500, {}));
    vi.stubGlobal('fetch', spy);
    const { result } = renderHook(() => useWaitingCount(1));
    await waitFor(() => expect(result.current).toBe(4));
    expect(new URL(String((spy.mock.calls[0] as unknown[])[0])).pathname).toBe('/api/v1/brain/waiting/count/');
    act(() => refreshWaitingCount());
    await waitFor(() => expect(result.current).toBe(3));
    act(() => refreshWaitingCount());
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(3));
    expect(result.current).toBe(3);
  });

  it('reads nothing signed out, and never shows one user’s count to the next', async () => {
    const answers = [respond(200, { count: 4 }), respond(200, { count: 7 })];
    const spy = vi.fn(async () => answers.shift() ?? respond(500, {}));
    vi.stubGlobal('fetch', spy);
    const { result, rerender } = renderHook(({ id }: { id: number | null }) => useWaitingCount(id), { initialProps: { id: null } });
    expect(result.current).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    rerender({ id: 1 });
    await waitFor(() => expect(result.current).toBe(4));
    rerender({ id: 2 });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(7));
  });
});
```

Create `src/components/brain/WaitingRow.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ScopeKey, WaitingItem } from '../../features/brain/brainTypes';
import { requests, stubBrain } from '../../features/brain/testBrain';
import {
  CARL_OVERDUE,
  CARL_QUESTION,
  CARL_TASK_PROPOSAL,
  DANA_RULE_REVIEW,
  MY_QUESTION,
  MY_RULE_REVIEW,
  SESSION_PROPOSAL,
  WAITING_NOW,
} from '../../features/brain/testWaitingFixtures';
import { Where } from '../../pages/organizations/testList';
import { WaitingRow } from './WaitingRow';

const where = () => screen.getByTestId('where').textContent;

function renderRow(item: WaitingItem, scope: ScopeKey = 'team') {
  const onGone = vi.fn();
  render(
    <MemoryRouter initialEntries={['/brain/waiting']}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <ul>
                <WaitingRow item={item} scope={scope} now={WAITING_NOW} onGone={onGone} />
              </ul>
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  const row = document.querySelector(`[data-item="${item.kind}-${item.id}"]`) as HTMLElement;
  return { onGone, row, meta: row.querySelector('[data-part="meta"]') as HTMLElement };
}

describe('WaitingRow (spec §2.1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a task proposal: kind, how long, who, the record, the action, the evidence, Approve and Reject', () => {
    stubBrain();
    const { row, meta } = renderRow(CARL_TASK_PROPOSAL);
    expect(meta).toHaveTextContent('Task proposal · 4 days · Waiting on Carl CSM');
    expect(meta.querySelector('.font-mono-brand')).toHaveTextContent('4 days');
    expect(within(row).getByRole('heading', { level: 2, name: 'Review Pizza Hut renewal pricing' })).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/6');
    expect(row).toHaveTextContent('Approving creates a task: Review renewal pricing on Pizza Hut, for Carl CSM, due 9 Oct 2026, high priority.');
    expect(within(within(row).getByRole('list', { name: 'Evidence' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'ARR at risk 40,000 to 90,000',
      'Renewal on 30 Nov',
    ]);
    expect(within(row).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('a session proposal I may not decide: where it came from, who will decide, no buttons, no "who" in Me', () => {
    stubBrain();
    const { row, meta } = renderRow(SESSION_PROPOSAL, 'me');
    expect(meta).toHaveTextContent('Task proposal · 3 days');
    expect(meta).not.toHaveTextContent('Waiting on');
    expect(row).toHaveTextContent('Decided in session Renewal huddle');
    expect(within(row).getByRole('link', { name: 'Renewal huddle' })).toHaveAttribute('href', '/copilot');
    expect(row).toHaveTextContent('Waiting on Dana CSM to decide');
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('approves once on a double click and leaves, saying what it did', async () => {
    const { spy } = stubBrain();
    const { row, onGone } = renderRow(CARL_TASK_PROPOSAL);
    await userEvent.dblClick(within(row).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onGone).toHaveBeenCalledWith(CARL_TASK_PROPOSAL, 'Approved: Review Pizza Hut renewal pricing.'));
    expect(onGone).toHaveBeenCalledTimes(1);
    expect(requests(spy, 'POST', '/metrics/proposals/')).toEqual(['/metrics/proposals/22/approve/']);
  });

  it('rejects with an optional note, asked for above its input', async () => {
    const { spy } = stubBrain();
    const { row, onGone } = renderRow(CARL_TASK_PROPOSAL);
    await userEvent.click(within(row).getByRole('button', { name: 'Reject' }));
    await userEvent.type(within(row).getByRole('textbox', { name: 'Why not? (optional)' }), 'Pricing is settled');
    await userEvent.click(within(row).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(onGone).toHaveBeenCalledWith(CARL_TASK_PROPOSAL, 'Rejected: Review Pizza Hut renewal pricing.'));
    const call = spy.mock.calls.find(([input]) => String(input).includes('/proposals/22/reject/'));
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({ note: 'Pricing is settled' });
  });

  it("shows the server's 403 at the buttons, focused, and stays (Contract note 7)", async () => {
    stubBrain({ refuseNextDecision: { status: 403, body: { detail: "You can't decide this proposal." } } });
    const { row, onGone } = renderRow(CARL_TASK_PROPOSAL);
    await userEvent.click(within(row).getByRole('button', { name: 'Approve' }));
    const alert = await within(row).findByRole('alert');
    expect(alert).toHaveTextContent("You can't decide this proposal.");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(within(row).getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(onGone).not.toHaveBeenCalled();
  });

  it('leaves when it was decided elsewhere (409)', async () => {
    stubBrain({ refuseNextDecision: { status: 409, body: { detail: 'This has already been decided.' } } });
    const { row, onGone } = renderRow(CARL_TASK_PROPOSAL);
    await userEvent.click(within(row).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onGone).toHaveBeenCalledWith(CARL_TASK_PROPOSAL, 'That proposal was already decided.'));
  });

  it('a rule review: the rule, its counts in DM Mono, the shared Approve; approving opens the new survey', async () => {
    stubBrain();
    const { row, meta } = renderRow(MY_RULE_REVIEW, 'me');
    expect(meta).toHaveTextContent('Rule review · 2 days');
    expect(within(row).getByRole('link', { name: 'Detractor follow-up' })).toHaveAttribute('href', '/scenarios/rules/3');
    const counts = row.querySelector('[data-part="counts"]') as HTMLElement;
    expect(counts).toHaveTextContent('12 to send · 2 skipped');
    expect([...counts.querySelectorAll('.font-mono-brand')].map((node) => node.textContent)).toEqual(['12', '2']);
    await userEvent.click(within(row).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(where()).toBe('/surveys/31'));
  });

  it('skipping a rule review hands its sentence up', async () => {
    stubBrain();
    const { row, onGone } = renderRow(MY_RULE_REVIEW, 'me');
    await userEvent.click(within(row).getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(onGone).toHaveBeenCalledWith(MY_RULE_REVIEW, 'Skipped the survey from Detractor follow-up.'));
  });

  it("someone else's rule review says who decides, with no buttons", () => {
    stubBrain();
    const { row, meta } = renderRow(DANA_RULE_REVIEW, 'company');
    expect(meta).toHaveTextContent('Rule review · 1 day · Waiting on Dana CSM');
    expect(row).toHaveTextContent('Waiting on Dana CSM to decide');
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('a question: who asked, and Answer where it is answered today; not mine, who will answer', () => {
    stubBrain();
    const mine = renderRow(MY_QUESTION, 'me');
    expect(mine.row).toHaveTextContent('Asked by Bob Sales');
    expect(within(mine.row).getByRole('link', { name: 'Answer' })).toHaveAttribute('href', '/organizations/3?tab=knowledge');
    const carls = renderRow(CARL_QUESTION, 'team');
    expect(carls.row).toHaveTextContent('Waiting on Carl CSM to answer');
    expect(within(carls.row).queryByRole('link', { name: 'Answer' })).toBeNull();
  });

  it('an overdue task: its record, due date and priority, and Open task on its story', () => {
    stubBrain();
    const { row, meta } = renderRow(CARL_OVERDUE);
    expect(meta).toHaveTextContent('Overdue task · 3 days · Waiting on Carl CSM');
    expect(within(row).getByRole('link', { name: 'Uber EMEA' })).toHaveAttribute('href', '/accounts/9');
    expect(row).toHaveTextContent('Due 2 Oct 2026 · high priority');
    expect(within(row).getByRole('link', { name: 'Open task' })).toHaveAttribute('href', '/accounts/9?group=tasks&source=task');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/brain/useWaitingCount.test.tsx src/components/brain/WaitingRow.test.tsx`
Expected: FAIL with "Failed to resolve import "./useWaitingCount"" and "./WaitingRow".

- [ ] **Step 3: Write the count hook**

Create `src/components/brain/useWaitingCount.ts`:

```ts
import { useEffect, useState } from 'react';
import { fetchWaitingCount } from '../../features/brain/brainApi';

const changes = new EventTarget();

/** Ask every mounted badge to read the count again: after a decision, or Ask the agent. */
export function refreshWaitingCount(): void {
  changes.dispatchEvent(new Event('refresh'));
}

type Answer = { userId: number; count: number };

/** The sidebar badge (spec Decision 5; plan Decision 1): the reader's Me
 *  total from GET waiting/count/, read on mount, again for another user, and
 *  again on every refreshWaitingCount(). A failed read keeps the last count;
 *  nothing is kept anywhere a later user could see it. */
export function useWaitingCount(userId: number | null): number | null {
  const [tick, setTick] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    const again = () => setTick((n) => n + 1);
    changes.addEventListener('refresh', again);
    return () => changes.removeEventListener('refresh', again);
  }, []);
  useEffect(() => {
    if (userId === null) return;
    let alive = true;
    fetchWaitingCount().then(
      (data) => {
        if (alive && typeof data?.count === 'number') setAnswer({ userId, count: data.count });
      },
      () => undefined, // A failed read keeps the last count.
    );
    return () => {
      alive = false;
    };
  }, [userId, tick]);
  return answer !== null && answer.userId === userId ? answer.count : null;
}
```

- [ ] **Step 4: Write the proposal decision**

Create `src/components/brain/ProposalDecision.tsx`:

```tsx
import { useEffect, useId, useRef, useState } from 'react';
import { decideProposal } from '../../features/brain/brainApi';
import { WAIT } from '../../features/brain/waitingText';
import { ApiError } from '../../lib/apiClient';
import { BUTTON, FOCUS, QUIET } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSubmitOnce } from '../plans/useSubmitOnce';

const INPUT = `min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink sm:min-h-9 ${FOCUS}`;

/** Approve, or Reject with an optional note, one proposal (Waiting spec
 *  §2.1), sent once. A 403 shows the server's reason at the buttons and the
 *  row stays; a 409 or 404 means it was decided elsewhere, and it leaves. */
export function ProposalDecision({ proposalId, title, onGone }: { proposalId: number; title: string; onGone: (message: string) => void }) {
  const noteId = useId();
  const errorId = useId();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorTick, setErrorTick] = useState(0);
  const { busy, run } = useSubmitOnce({ holdOnSuccess: true });
  useEffect(() => {
    if (errorTick > 0) errorRef.current?.focus();
  }, [errorTick]);

  async function decide(decision: 'approve' | 'reject') {
    const outcome = await run(() => {
      setPending(decision);
      setError(null);
      return decideProposal(proposalId, decision, decision === 'reject' ? note.trim() : '');
    });
    if (!outcome) return;
    if (outcome.ok) {
      onGone(`${decision === 'approve' ? 'Approved' : 'Rejected'}: ${title}.`);
      return;
    }
    setPending(null);
    const err = outcome.error;
    if (err instanceof ApiError && (err.status === 409 || err.status === 404)) onGone(WAIT.ALREADY_DECIDED);
    else {
      setError(errorMessage(err, WAIT.DECIDE_FAILED));
      setErrorTick((n) => n + 1);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p ref={errorRef} id={errorId} role="alert" tabIndex={-1} className={`text-[13px] text-danger ${FOCUS}`}>
          {error}
        </p>
      ) : null}
      {rejecting ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void decide('reject');
          }}
        >
          <label htmlFor={noteId} className="text-[11px] font-semibold text-ink-muted">
            {WAIT.WHY_NOT}
          </label>
          <input id={noteId} value={note} onChange={(event) => setNote(event.target.value)} className={INPUT} autoFocus />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} aria-describedby={error ? errorId : undefined} className={BUTTON}>
              {pending === 'reject' ? WAIT.WORKING : WAIT.REJECT}
            </button>
            <button type="button" disabled={busy} onClick={() => setRejecting(false)} className={QUIET}>
              {WAIT.CANCEL}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void decide('approve')} aria-describedby={error ? errorId : undefined} className={BUTTON}>
            {pending === 'approve' ? WAIT.WORKING : WAIT.APPROVE}
          </button>
          <button type="button" disabled={busy} onClick={() => setRejecting(true)} className={QUIET}>
            {WAIT.REJECT}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write the row**

Create `src/components/brain/WaitingRow.tsx`:

```tsx
import { Link, useNavigate } from 'react-router-dom';
import type { OverdueTaskItem, ProposalItem, QuestionItem, RuleReviewItem, ScopeKey, WaitingItem } from '../../features/brain/brainTypes';
import {
  answerPath,
  kindLabel,
  notYoursText,
  proposalActionText,
  recordPath,
  taskPath,
  WAIT,
  waitedText,
  waitingOnText,
} from '../../features/brain/waitingText';
import { formatDate } from '../../features/customers/formatters';
import type { ApproveAnswer } from '../../features/rules/ruleTypes';
import { BUTTON, FOCUS, MONO } from '../organizations/portfolio/styles';
import { ReviewDecision } from '../rules/ReviewDecision';
import { ProposalDecision } from './ProposalDecision';
import { refreshWaitingCount } from './useWaitingCount';

const LINK = `inline-flex min-h-11 items-center text-[13px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`;
const NOTE = 'text-[13px] text-ink-muted';

type Gone = (item: WaitingItem, message: string) => void;

export interface WaitingRowProps {
  item: WaitingItem;
  scope: ScopeKey;
  now: Date;
  /** The item left the desk; `message` says why. */
  onGone: Gone;
}

/** One item waiting on someone (spec §2.1): a flat row inside the list,
 *  never a card of its own. */
export function WaitingRow({ item, scope, now, onGone }: WaitingRowProps) {
  const who = waitingOnText(item.waiting_on, scope);
  return (
    <li data-item={`${item.kind}-${item.id}`} className="flex flex-col gap-2 px-4 py-3">
      <p data-part="meta" className="text-[11px] text-ink-muted">
        <span className="font-semibold">{kindLabel(item)}</span> · <span className={MONO}>{waitedText(item.since, now)}</span>
        {who ? ` · ${who}` : ''}
      </p>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[15px] font-semibold text-ink">{item.title}</h2>
        {item.record ? (
          <Link to={recordPath(item.record)} className={`${LINK} self-start`}>
            {item.record.name}
          </Link>
        ) : null}
      </div>
      {item.kind === 'rule_review' ? <RuleReviewBody item={item} onGone={onGone} /> : null}
      {item.kind === 'proposal' ? <ProposalBody item={item} onGone={onGone} /> : null}
      {item.kind === 'question' ? <QuestionBody item={item} /> : null}
      {item.kind === 'overdue_task' ? <TaskBody item={item} /> : null}
    </li>
  );
}

function RuleReviewBody({ item, onGone }: { item: RuleReviewItem; onGone: Gone }) {
  const navigate = useNavigate();
  const d = item.detail;
  const approved = (answer: ApproveAnswer) => {
    refreshWaitingCount();
    // Contract note 6: the item names no campaign, so a campaign send opens the list.
    navigate('survey_send_id' in answer ? `/surveys/${answer.survey_send_id}` : '/campaigns');
  };
  return (
    <>
      <p data-part="counts" className="text-[13px] text-ink">
        From{' '}
        <Link to={`/scenarios/rules/${d.rule_id}`} className={LINK}>
          {d.rule_name}
        </Link>
        : <span className={MONO}>{d.counts.send}</span> to send · <span className={MONO}>{d.counts.skip}</span> skipped
      </p>
      {item.can_decide ? (
        <ReviewDecision reviewId={item.id} kind={d.review_kind} ruleName={d.rule_name} onApproved={approved} onGone={(message) => onGone(item, message)} />
      ) : (
        <p className={NOTE}>{notYoursText(item)}</p>
      )}
    </>
  );
}

function ProposalBody({ item, onGone }: { item: ProposalItem; onGone: Gone }) {
  const d = item.detail;
  return (
    <>
      <p className={NOTE}>{proposalActionText(d)}</p>
      {d.evidence.length > 0 ? (
        <ul aria-label={WAIT.EVIDENCE} className="flex flex-col gap-0.5">
          {d.evidence.map((line) => (
            <li key={line} className={`text-[11px] text-ink-muted ${MONO}`}>
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      {d.session ? (
        <p className="text-[11px] text-ink-muted">
          {WAIT.FROM_SESSION}{' '}
          <Link to="/copilot" className={LINK}>
            {d.session.title}
          </Link>
        </p>
      ) : null}
      {item.can_decide ? (
        <ProposalDecision proposalId={item.id} title={item.title} onGone={(message) => onGone(item, message)} />
      ) : (
        <p className={NOTE}>{notYoursText(item)}</p>
      )}
    </>
  );
}

function QuestionBody({ item }: { item: QuestionItem }) {
  return (
    <>
      <p className={NOTE}>Asked by {item.detail.asked_by}</p>
      {item.can_decide ? (
        <Link to={answerPath(item)} className={`${BUTTON} self-start`}>
          {WAIT.ANSWER}
        </Link>
      ) : (
        <p className={NOTE}>{notYoursText(item)}</p>
      )}
    </>
  );
}

function TaskBody({ item }: { item: OverdueTaskItem }) {
  return (
    <>
      <p className={NOTE}>
        Due <span className={MONO}>{formatDate(item.detail.due_date)}</span> · {item.detail.priority} priority
      </p>
      {item.can_decide ? (
        <Link to={taskPath(item.record)} className={`${BUTTON} self-start`}>
          {WAIT.OPEN_TASK}
        </Link>
      ) : (
        <p className={NOTE}>{notYoursText(item)}</p>
      )}
    </>
  );
}
```

- [ ] **Step 6: Run the tests and the type-check**

Run: `npx vitest run --maxWorkers=2 src/components/brain/useWaitingCount.test.tsx src/components/brain/WaitingRow.test.tsx src/components/brain/houseRules.test.ts && npx tsc -b --noEmit`
Expected: PASS (2 + 11 tests; the existing Brain house rules also pass over the three new files); tsc prints nothing.

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: `15 problems (0 errors, 15 warnings)`.

- [ ] **Step 8: Commit**

```bash
git add src/components/brain/useWaitingCount.ts src/components/brain/useWaitingCount.test.tsx src/components/brain/ProposalDecision.tsx src/components/brain/WaitingRow.tsx src/components/brain/WaitingRow.test.tsx
git commit -m "$(cat <<'EOF'
feat(brain): one waiting item of each kind, decided once

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The Waiting on you page at `/brain/waiting`

Spec §2.1 (header, chips, one list, hidden, Ask the agent in Company, empty by scope, skeleton, error, 375px), spec Decisions 1, 4; Contract notes 1, 4, 12; Decisions 3, 5, 6, 8.

**Files:**
- Create: `src/components/brain/useWaiting.ts`, `src/components/brain/WaitingDesk.tsx`, `src/components/brain/WaitingSkeleton.tsx`, `src/components/brain/LostAccessNotice.tsx`, `src/pages/brain/Waiting.tsx`
- Modify: `src/pages/brain/WhatChanged.tsx` (import the notice), `src/pages/brain/BrainRoutes.tsx` (the `waiting` route)
- Test: `src/pages/brain/Waiting.test.tsx`

**Interfaces:**
- Consumes: Tasks 1, 2, 4; `useBrainScope`, `ScopeSwitch` (delivery 1); `EmptyState`, `ErrorBlock` (`components/organizations/portfolio/PortfolioSections`); `PRIMARY`, `FOCUS`, `MONO`; `useSubmitOnce`; `errorMessage`; `useCapability` (`hooks`); `renderBrain` (`pages/brain/testPages`).
- Produces:
  - `useWaiting(scope: ScopeKey | null, onRefused: (err: unknown) => boolean): { data: WaitingPayload | null; error: string | null; retry: () => void; drop: (item: WaitingItem) => void }`.
  - `WaitingDesk({ data, scope, now, onGone })`, `WaitingSkeleton()`, `LostAccessNotice({ message })`.
  - `WaitingPage()`, routed at `/brain/waiting`.

- [ ] **Step 1: Write the failing test**

Create `src/pages/brain/Waiting.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../../features/brain/brainText';
import { requests, stubBrain } from '../../features/brain/testBrain';
import { deskOf, GENERATED_PROPOSAL, ME_WAITING, WAITING_NOW } from '../../features/brain/testWaitingFixtures';
import { WAIT } from '../../features/brain/waitingText';
import { resetViewport } from '../../test/viewport';
import { renderBrain } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const list = () => screen.findByRole('list', { name: WAIT.LIST });
const row = (key: string) => document.querySelector(`[data-item="${key}"]`) as HTMLElement | null;
const order = () => [...document.querySelectorAll('[data-item]')].map((node) => node.getAttribute('data-item'));

describe('Waiting on you (spec §2.1)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(WAITING_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('Me: the one h1, my desk oldest first, and no "who" on my own items', async () => {
    stubBrain({ offered: ['me', 'team'] });
    renderBrain('/brain/waiting?scope=me', { role: 'csm' });
    await list();
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([WAIT.TITLE]);
    expect(order()).toEqual(['question-31', 'proposal-23', 'rule_review-14', 'overdue_task-50']);
    expect(row('question-31')?.querySelector('[data-part="meta"]')).toHaveTextContent('Question · 6 days');
    expect(row('proposal-23')).toHaveTextContent('Waiting on Dana CSM to decide');
  });

  it('My team: who each item waits on, what I may act on, and the hidden count', async () => {
    stubBrain({ offered: ['me', 'team'] });
    renderBrain('/brain/waiting?scope=team', { role: 'csm' });
    await list();
    expect(order()).toEqual(['question-31', 'proposal-22', 'overdue_task-51', 'rule_review-14', 'overdue_task-50', 'question-32']);
    expect(row('proposal-22')?.querySelector('[data-part="meta"]')).toHaveTextContent('Task proposal · 4 days · Waiting on Carl CSM');
    expect(within(row('proposal-22') as HTMLElement).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(row('question-32')).toHaveTextContent('Waiting on Carl CSM to answer');
    expect(screen.getByText("1 more item about a record you can't open")).toBeInTheDocument();
  });

  it('filters by kind with the full counts, and back to All on a scope switch', async () => {
    stubBrain({ offered: ['me', 'team'] });
    renderBrain('/brain/waiting?scope=team', { role: 'csm' });
    await list();
    const chips = within(screen.getByRole('group', { name: WAIT.SHOW })).getAllByRole('button');
    expect(chips.map((chip) => chip.textContent)).toEqual(['All 6', 'Rule reviews 1', 'Proposals 1', 'Questions 2', 'Overdue tasks 2']);
    expect(screen.getByRole('button', { name: 'All 6' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Questions 2' }));
    expect(order()).toEqual(['question-31', 'question-32']);
    await userEvent.click(screen.getByRole('button', { name: 'Me' }));
    await waitFor(() => expect(where()).toBe('/brain/waiting?scope=me'));
    await list();
    expect(screen.getByRole('button', { name: 'All 4' })).toHaveAttribute('aria-pressed', 'true');
    expect(order()).toHaveLength(4);
  });

  it('a kind with nothing listed says so', async () => {
    stubBrain({ offered: ['me'], waiting: { me: deskOf('me', ME_WAITING.items.filter((item) => item.kind !== 'question')) } });
    renderBrain('/brain/waiting?scope=me', { role: 'csm' });
    await list();
    await userEvent.click(screen.getByRole('button', { name: 'Questions 0' }));
    expect(screen.getByText(WAIT.NONE_OF_KIND)).toBeInTheDocument();
  });

  it('a decision is sent once, the row leaves, the counts drop and the status says so', async () => {
    const { spy } = stubBrain({ offered: ['me', 'team'] });
    renderBrain('/brain/waiting?scope=team', { role: 'csm' });
    await list();
    await userEvent.dblClick(within(row('proposal-22') as HTMLElement).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(row('proposal-22')).toBeNull());
    expect(document.querySelector('[data-part="waiting-status"]')).toHaveTextContent('Approved: Review Pizza Hut renewal pricing.');
    expect(screen.getByRole('button', { name: 'Proposals 0' })).toBeInTheDocument();
    expect(requests(spy, 'POST', '/metrics/proposals/')).toEqual(['/metrics/proposals/22/approve/']);
  });

  it('empty desks read by scope, still counting what is hidden', async () => {
    stubBrain({ waiting: { me: deskOf('me', []), team: deskOf('team', [], 2), company: deskOf('company', []) } });
    renderBrain('/brain/waiting?scope=me');
    expect(await screen.findByText('Nothing is waiting on you.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'My team' }));
    expect(await screen.findByText('Nothing is waiting on your team.')).toBeInTheDocument();
    expect(screen.getByText("2 more items about records you can't open")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    expect(await screen.findByText('Nothing is waiting.')).toBeInTheDocument();
  });

  it('shows the skeleton, then the error with Try again', async () => {
    const { spy } = stubBrain({ failWaiting: 1 });
    renderBrain('/brain/waiting?scope=me');
    expect(screen.getByRole('status', { name: WAIT.LOADING })).toBeInTheDocument();
    expect(await screen.findByText(WAIT.LOAD)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await list();
    expect(requests(spy, 'GET', '/brain/waiting/')).toEqual(['/brain/waiting/?scope=me', '/brain/waiting/?scope=me']);
  });

  it('Ask the agent: Company and view_all_accounts only, sent once, and the desk is read again', async () => {
    const { spy } = stubBrain({ generates: GENERATED_PROPOSAL });
    renderBrain('/brain/waiting?scope=team');
    await list();
    expect(screen.queryByRole('button', { name: WAIT.ASK })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    await list();
    expect(screen.getByText(WAIT.ASK_HINT)).toBeInTheDocument();
    await userEvent.dblClick(screen.getByRole('button', { name: WAIT.ASK }));
    await waitFor(() => expect(row('proposal-25')).not.toBeNull());
    expect(requests(spy, 'POST', '/metrics/')).toEqual(['/metrics/proposals/generate/']);
  });

  it('offers no Ask the agent to a Company reader without view_all_accounts', async () => {
    stubBrain();
    renderBrain('/brain/waiting?scope=company', { role: 'csm' });
    await list();
    expect(screen.queryByRole('button', { name: WAIT.ASK })).toBeNull();
  });

  it('a 403 SCOPE_NOT_ALLOWED drops back to the default, with the notice', async () => {
    const { revoke } = stubBrain({ offered: ['me', 'team'] });
    renderBrain('/brain/waiting?scope=me', { role: 'csm' });
    await list();
    revoke('team');
    await userEvent.click(screen.getByRole('button', { name: 'My team' }));
    expect(await screen.findByText(SAY.LOST_ACCESS)).toBeInTheDocument();
    await waitFor(() => expect(where()).toBe('/brain/waiting?scope=me'));
  });

  it('at 375px the switch is a select and the chips wrap', async () => {
    stubBrain();
    renderBrain('/brain/waiting?scope=team', { width: 375 });
    await list();
    expect(screen.getByRole('combobox', { name: 'View' })).toHaveDisplayValue('My team');
    expect(screen.getByRole('group', { name: WAIT.SHOW })).toHaveClass('flex-wrap');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/brain/Waiting.test.tsx`
Expected: FAIL (every test): `/brain/waiting` falls to `*` and redirects to `/brain`, so "Waiting items" never appears.

- [ ] **Step 3: Move the notice out of What changed**

Create `src/components/brain/LostAccessNotice.tsx` with the function moved verbatim from `src/pages/brain/WhatChanged.tsx` (exported):

```tsx
import { useEffect, useRef } from 'react';

/** The lost-access notice (delivery 1, M3): focus moves here on mount, since
 *  the control that was clicked unmounts along with the old scope. */
export function LostAccessNotice({ message }: { message: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <p ref={ref} tabIndex={-1} role="status" className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none">
      {message}
    </p>
  );
}
```

In `src/pages/brain/WhatChanged.tsx`: delete the local `LostAccessNotice`, change the React import to `import type { ReactNode } from 'react';`, and add `import { LostAccessNotice } from '../../components/brain/LostAccessNotice';`.

- [ ] **Step 4: Write the desk read, the skeleton and the list**

Create `src/components/brain/useWaiting.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { fetchWaiting } from '../../features/brain/brainApi';
import type { ScopeKey, WaitingItem, WaitingPayload } from '../../features/brain/brainTypes';
import { WAIT } from '../../features/brain/waitingText';

type Answer = { key: string; data: WaitingPayload | null; error: string | null };

/** GET waiting/?scope= for the settled scope, read again on Try again; a
 *  slower answer for another scope is dropped. A 403 SCOPE_NOT_ALLOWED goes
 *  to `onRefused` and shows no error of its own. `drop` takes a decided item
 *  off the desk and its kind's count. */
export function useWaiting(scope: ScopeKey | null, onRefused: (err: unknown) => boolean) {
  const [attempt, setAttempt] = useState(0);
  const key = scope ? `${scope}#${attempt}` : null;
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    if (!scope || !key) return;
    let alive = true;
    fetchWaiting(scope).then(
      (data) => alive && setAnswer({ key, data, error: null }),
      (err: unknown) => {
        if (alive && !onRefused(err)) setAnswer({ key, data: null, error: WAIT.LOAD });
      },
    );
    return () => {
      alive = false;
    };
    // `key` carries the scope and the attempt; `onRefused` is the page's stable callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const drop = useCallback(
    (item: WaitingItem) =>
      setAnswer((last) => {
        if (!last?.data) return last;
        const d = last.data;
        return {
          ...last,
          data: {
            ...d,
            items: d.items.filter((one) => one.kind !== item.kind || one.id !== item.id),
            counts: { ...d.counts, [item.kind]: Math.max(0, d.counts[item.kind] - 1) },
          },
        };
      }),
    [],
  );
  const current = key && answer?.key === key ? answer : null;
  return { data: current?.data ?? null, error: current?.error ?? null, retry: () => setAttempt((n) => n + 1), drop };
}
```

Create `src/components/brain/WaitingSkeleton.tsx`:

```tsx
import { WAIT } from '../../features/brain/waitingText';

const BAR = 'block animate-pulse rounded bg-subtle';

/** The desk's shape while it loads: five chips and four rows. */
export function WaitingSkeleton() {
  return (
    <div role="status" aria-label={WAIT.LOADING} className="flex flex-col gap-3">
      <div aria-hidden="true" className="flex flex-wrap gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="block h-9 w-24 animate-pulse rounded-full bg-subtle" />
        ))}
      </div>
      <ul aria-hidden="true" className="divide-y divide-line rounded-xl border border-line bg-surface">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex flex-col gap-2 px-4 py-3">
            <span className={`${BAR} h-3 w-40`} />
            <span className={`${BAR} h-4 w-2/3`} />
            <span className={`${BAR} h-9 w-28`} />
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Create `src/components/brain/WaitingDesk.tsx`:

```tsx
import { useState } from 'react';
import type { ScopeKey, WaitingItem, WaitingKind, WaitingPayload } from '../../features/brain/brainTypes';
import { cappedText, hiddenItemsText, KIND_CHIPS, totalOf, WAIT, waitingEmpty } from '../../features/brain/waitingText';
import { EmptyState } from '../organizations/portfolio/PortfolioSections';
import { FOCUS, MONO } from '../organizations/portfolio/styles';
import { WaitingRow } from './WaitingRow';

const CHIP = `inline-flex min-h-11 sm:min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold active:bg-line-subtle ${FOCUS}`;

/** The desk (spec §2.1): the kind chips with the full counts, one list in
 *  the server's order, the 200 cap and the hidden count. The chips are this
 *  component's state, so a scope switch (a new key) starts at All. */
export function WaitingDesk({ data, scope, now, onGone }: {
  data: WaitingPayload;
  scope: ScopeKey;
  now: Date;
  onGone: (item: WaitingItem, message: string) => void;
}) {
  const [kind, setKind] = useState<WaitingKind | 'all'>('all');
  const total = totalOf(data.counts);
  const hidden = hiddenItemsText(data.hidden);
  const hiddenLine = hidden ? (
    <p data-part="hidden" className="text-[13px] text-ink-muted">
      {hidden}
    </p>
  ) : null;

  if (total === 0 && data.items.length === 0) {
    return (
      <>
        <EmptyState title={waitingEmpty(scope)} detail={WAIT.EMPTY_DETAIL} action={null} />
        {hiddenLine}
      </>
    );
  }

  const items = kind === 'all' ? data.items : data.items.filter((item) => item.kind === kind);
  const capped = kind === 'all' ? cappedText(data.counts, data.items.length) : null;
  return (
    <section className="flex flex-col gap-3">
      <div role="group" aria-label={WAIT.SHOW} className="flex flex-wrap gap-2">
        {KIND_CHIPS.map((chip) => {
          const on = chip.key === kind;
          return (
            <button
              key={chip.key}
              type="button"
              aria-pressed={on}
              onClick={() => setKind(chip.key)}
              className={`${CHIP} ${on ? 'border-accent bg-subtle text-ink' : 'border-line bg-surface text-ink-muted hover:bg-subtle hover:text-ink'}`}
            >
              {chip.label} <span className={MONO}>{chip.key === 'all' ? total : data.counts[chip.key]}</span>
            </button>
          );
        })}
      </div>
      {items.length === 0 ? (
        <p data-part="none" className="rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-ink-muted">
          {WAIT.NONE_OF_KIND}
        </p>
      ) : (
        <ul aria-label={WAIT.LIST} className="divide-y divide-line rounded-xl border border-line bg-surface">
          {items.map((item) => (
            <WaitingRow key={`${item.kind}-${item.id}`} item={item} scope={scope} now={now} onGone={onGone} />
          ))}
        </ul>
      )}
      {capped ? <p className="text-[11px] text-ink-muted">{capped}</p> : null}
      {hiddenLine}
    </section>
  );
}
```

A chip's accessible name is its label and count ("Proposals 1"), which the tests use.

- [ ] **Step 5: Write the page and route it**

Create `src/pages/brain/Waiting.tsx`:

```tsx
import { useState, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { LostAccessNotice } from '../../components/brain/LostAccessNotice';
import { ScopeSwitch } from '../../components/brain/ScopeSwitch';
import { useBrainScope } from '../../components/brain/useBrainScope';
import { useWaiting } from '../../components/brain/useWaiting';
import { refreshWaitingCount } from '../../components/brain/useWaitingCount';
import { WaitingDesk } from '../../components/brain/WaitingDesk';
import { WaitingSkeleton } from '../../components/brain/WaitingSkeleton';
import { ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { PRIMARY } from '../../components/organizations/portfolio/styles';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { useSubmitOnce } from '../../components/plans/useSubmitOnce';
import { askAgent } from '../../features/brain/brainApi';
import type { ScopeKey, WaitingItem } from '../../features/brain/brainTypes';
import { WAIT } from '../../features/brain/waitingText';
import { useCapability } from '../../hooks';

/** /brain/waiting: Waiting on you (spec 2026-10-05-brain-waiting-design
 *  §2.1), for every member, scoped Me · My team · Company: what waits for a
 *  decision or an answer, and on whom. */
export function WaitingPage() {
  const brain = useBrainScope();
  const scope = brain.scope;
  const waiting = useWaiting(scope, brain.refused);
  const data = waiting.data;
  const canSeeAll = useCapability('view_all_accounts');
  const [status, setStatus] = useState<{ scope: ScopeKey; text: string } | null>(null);
  const ask = useSubmitOnce();
  const [askError, setAskError] = useState<string | null>(null);
  const canAsk = scope === 'company' && canSeeAll;

  function gone(item: WaitingItem, text: string) {
    waiting.drop(item);
    if (scope) setStatus({ scope, text });
    refreshWaitingCount();
  }

  async function askTheAgent() {
    setAskError(null);
    const outcome = await ask.run(askAgent);
    if (!outcome) return;
    if (outcome.ok) {
      waiting.retry();
      refreshWaitingCount();
    } else setAskError(errorMessage(outcome.error, WAIT.ASK_FAILED));
  }

  let body: ReactNode;
  if (brain.error) body = <ErrorBlock message={brain.error} onRetry={brain.retry} />;
  else if (waiting.error) body = <ErrorBlock message={waiting.error} onRetry={waiting.retry} />;
  else if (!scope || !data) body = <WaitingSkeleton />;
  else body = <WaitingDesk key={scope} data={data} scope={scope} now={new Date()} onGone={gone} />;

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-2 py-4 sm:px-4 lg:py-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="font-display text-[22px] text-ink">{WAIT.TITLE}</h1>
          <div className="flex flex-wrap items-center gap-3">
            {canAsk ? (
              <div className="flex flex-col items-start gap-1 sm:items-end">
                <button type="button" onClick={() => void askTheAgent()} disabled={ask.busy} className={PRIMARY}>
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  {ask.busy ? WAIT.ASKING : WAIT.ASK}
                </button>
                <p className="text-[11px] text-ink-muted">{WAIT.ASK_HINT}</p>
              </div>
            ) : null}
            {brain.offered && scope ? <ScopeSwitch scopes={brain.offered.scopes} value={scope} onChange={brain.choose} /> : null}
          </div>
        </header>
        {askError ? (
          <p role="alert" className="text-[13px] text-danger">
            {askError}
          </p>
        ) : null}
        {brain.notice ? <LostAccessNotice message={brain.notice} /> : null}
        <p role="status" data-part="waiting-status" className="text-[13px] text-ink-muted empty:hidden">
          {status && status.scope === scope ? status.text : ''}
        </p>
        {body}
      </div>
    </div>
  );
}
```

In `src/pages/brain/BrainRoutes.tsx`, add `import { WaitingPage } from './Waiting';` and, after the index route, `<Route path="waiting" element={<WaitingPage />} />`; extend the doc comment's first sentence to name Waiting on you as open to every member (spec 2026-10-05 Waiting §2.2).

- [ ] **Step 6: Run the page's tests, What changed's, the house rules and the type-check**

Run: `npx vitest run --maxWorkers=2 src/pages/brain/Waiting.test.tsx src/pages/brain/WhatChanged.test.tsx src/pages/brain/BrainRoutes.test.tsx src/components/brain/houseRules.test.ts && npx tsc -b --noEmit`
Expected: PASS (11 new; What changed and the routes unchanged); tsc prints nothing.

If "Ask the agent" in the Company test resolves before the re-read so that `proposal-25` never shows, check that `waiting.retry()` runs after `askAgent()` resolves (it does in the code above) and that the stub's `generates` path matches `/metrics/proposals/generate/`.

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: `15 problems (0 errors, 15 warnings)`.

- [ ] **Step 8: Commit**

```bash
git add src/components/brain/useWaiting.ts src/components/brain/WaitingDesk.tsx src/components/brain/WaitingSkeleton.tsx src/components/brain/LostAccessNotice.tsx src/pages/brain/Waiting.tsx src/pages/brain/Waiting.test.tsx src/pages/brain/WhatChanged.tsx src/pages/brain/BrainRoutes.tsx
git commit -m "$(cat <<'EOF'
feat(brain): Waiting on you page, scoped Me, My team and Company

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The sidebar badge, the redirect, the title and the links

Spec §2.2 (Waiting on you after What changed, icon `Inbox`, a badge from `waiting/count/` for every member; Review Queue leaves; the `view_all_accounts`-only `fetchProposals()` goes; `/brain/review` redirects), spec Decisions 5, 6; Decisions 9, 10, 12.

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`, `src/components/layout/Sidebar.test.tsx`, `src/pages/brain/BrainRoutes.tsx`, `src/pages/brain/BrainRoutes.test.tsx`, `src/components/layout/Navbar.tsx`, `src/components/layout/Navbar.test.tsx`, `src/components/rules/NightsSection.tsx`, `src/pages/rules/RulePage.test.tsx`, `src/pages/copilot/ChatView.tsx`, `src/pages/copilot/ChatView.decisions.test.tsx`, `src/pages/brain/Graph.tsx`, `src/pages/brain/Initiatives.tsx`

**Interfaces:**
- Consumes: `useWaitingCount`, `refreshWaitingCount` (Task 4); `WaitingPage` (Task 5).
- Produces: `WaitingNavItem()` exported from `Sidebar.tsx` (used by `renderBrain` in Task 8).

- [ ] **Step 1: Write the failing tests**

In `src/components/layout/Sidebar.test.tsx`, add `act`, `within` to the Testing Library import and `import { refreshWaitingCount } from '../brain/useWaitingCount';`, then replace the three tests of `describe('Sidebar Brain group (spec 2026-10-05 §2.1)'` with:

```tsx
  const countSpy = (...counts: number[]) =>
    vi.fn<(url: string) => Promise<unknown>>((url) =>
      Promise.resolve(url.includes('/brain/waiting/count/') ? jsonResponse(200, { count: counts.length > 1 ? counts.shift() : counts[0] }) : jsonResponse(200, [])),
    );

  it('shows every member What changed, then Waiting on you with their count, and never reads the proposals', async () => {
    const spy = countSpy(3);
    vi.stubGlobal('fetch', spy);
    renderSidebar('csm');
    expect(await screen.findByRole('link', { name: 'What changed' })).toHaveAttribute('href', '/brain');
    const waiting = screen.getByRole('link', { name: 'Waiting on you' });
    expect(waiting).toHaveAttribute('href', '/brain/waiting');
    expect(await within(waiting).findByText('3')).toBeInTheDocument();
    for (const name of ['Review Queue', 'Initiatives', 'Feature Requests', 'Anomalies', 'Knowledge Graph', 'Users']) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
    expect(spy.mock.calls.some(([url]) => url.includes('/metrics/proposals/'))).toBe(false);
  });

  it('reads the count again when a decision asks it to', async () => {
    vi.stubGlobal('fetch', countSpy(3, 2));
    renderSidebar('csm');
    const waiting = await screen.findByRole('link', { name: 'Waiting on you' });
    expect(await within(waiting).findByText('3')).toBeInTheDocument();
    act(() => refreshWaitingCount());
    expect(await within(waiting).findByText('2')).toBeInTheDocument();
  });

  it('shows no badge at 0', async () => {
    vi.stubGlobal('fetch', countSpy(0));
    renderSidebar('csm');
    const waiting = await screen.findByRole('link', { name: 'Waiting on you' });
    await waitFor(() => expect(waiting.querySelector('[aria-label$="waiting"]')).toBeNull());
  });

  it('adds Initiatives, Feature Requests and Anomalies for view_all_accounts, after Waiting on you', async () => {
    renderSidebar('admin');
    await screen.findByRole('link', { name: 'What changed' });
    const brain = ['What changed', 'Waiting on you', 'Initiatives', 'Feature Requests', 'Anomalies'].map((name) => screen.getByRole('link', { name }));
    for (let i = 1; i < brain.length; i++) {
      expect(brain[i - 1].compareDocumentPosition(brain[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    for (const name of ['Review Queue', 'Knowledge Graph', 'Brain Overview', 'Feedback Log', 'Agents', 'Skills']) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: /Users/ })).toBeInTheDocument();
  });

  it('lights Waiting on you on /brain/waiting, and What changed only on /brain', async () => {
    renderSidebar('csm', '/brain/waiting');
    expect(await screen.findByRole('link', { name: 'What changed' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Waiting on you' })).toHaveAttribute('aria-current', 'page');
  });
```

(`counts.shift()` in a test helper is fine; the last count repeats.)

In `src/pages/brain/BrainRoutes.test.tsx`: replace `vi.mock('./Review', …)` with `vi.mock('./Waiting', () => ({ WaitingPage: () => <h1>Waiting on you</h1> }));`; replace the test `'opens the Review Queue to someone without view_all_accounts'` with:

```tsx
  it('opens Waiting on you to someone without view_all_accounts', () => {
    renderAt('/brain/waiting', 'csm');
    expect(screen.getByRole('heading', { name: 'Waiting on you' })).toBeInTheDocument();
    expect(where()).toBe('/brain/waiting');
  });

  it('sends the old Review Queue to Waiting on you, for everyone (spec Decision 6)', () => {
    renderAt('/brain/review', 'csm');
    expect(where()).toBe('/brain/waiting');
    expect(screen.getByRole('heading', { name: 'Waiting on you' })).toBeInTheDocument();
  });
```

and delete the `['/brain/review', 'Review queue', '/brain/review'],` row of the last `it.each`.

In `src/components/layout/Navbar.test.tsx`, after the test `'titles /brain without a heading…'`, add:

```tsx
  it('titles /brain/waiting without a heading, so "Waiting on you" is the only h1 (plan Decision 9)', () => {
    renderNavbar('/brain/waiting');
    expect(screen.getByText('Brain')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });
```

In `src/pages/rules/RulePage.test.tsx` line 42, expect `['/brain/waiting', '/brain/waiting']`. In `src/pages/copilot/ChatView.decisions.test.tsx` line 65, expect `screen.getByRole('link', { name: 'Waiting on you' })` with `href` `/brain/waiting`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/layout/Sidebar.test.tsx src/pages/brain/BrainRoutes.test.tsx src/components/layout/Navbar.test.tsx src/pages/rules/RulePage.test.tsx src/pages/copilot/ChatView.decisions.test.tsx`
Expected: FAIL: no "Waiting on you" link, `/brain/review` still routes to the old page, an `h1` on `/brain/waiting`, the old link targets.

- [ ] **Step 3: The sidebar**

In `src/components/layout/Sidebar.tsx`:
- In the lucide import, replace `CheckSquare` with `Inbox`.
- Delete `import { fetchProposals } from '../../features/proposals/proposalsSlice';`, the `pendingProposals` selector, the comment above `const dispatch`, and the `useEffect` that dispatches `fetchProposals()` (keep `const dispatch = useAppDispatch();`, which sign-out uses, and `const canSeeAll = useCapability('view_all_accounts');`, which the Brain group uses).
- Add `import { useWaitingCount } from '../brain/useWaitingCount';`.
- Replace the Brain group's comment and items with:

```tsx
        {/* KNOWLEDGE BRAIN (spec 2026-10-05 §2.1; Waiting spec §2.2): What
            changed and Waiting on you (with the reader's Me count) for every
            member; Initiatives, Feature Requests and Anomalies keep their
            view_all_accounts gate until deliveries 3–4. The Knowledge Graph
            has a quiet link in What changed's header; Agents, Skills and
            Feedback Log live in Settings > AI. */}
        <div className="h-px bg-line my-2 w-8" role="separator"></div>
        <NavItem to="/brain" end icon={<Brain className="w-5 h-5" />} label="What changed" />
        <WaitingNavItem />
        {canSeeAll ? (
          <>
            <NavItem to="/brain/initiatives" icon={<Flag className="w-5 h-5" />} label="Initiatives" />
            <NavItem to="/brain/requests" icon={<Lightbulb className="w-5 h-5" />} label="Feature Requests" />
            <NavItem to="/brain/anomalies" icon={<Radar className="w-5 h-5" />} label="Anomalies" />
          </>
        ) : null}
```

- After the `Sidebar` function, add:

```tsx
/** Waiting on you with the reader's Me count (Waiting spec Decision 5), for
 *  every member. Exported for the Brain's jsdom journeys. */
export function WaitingNavItem() {
  const userId = useAppSelector((state) => state.auth.user?.id ?? null);
  const count = useWaitingCount(userId);
  return <NavItem to="/brain/waiting" icon={<Inbox className="w-5 h-5" />} label="Waiting on you" badge={count ?? undefined} />;
}
```

- In `NavItem`, change the badge's `aria-label={`${badge} pending`}` to `aria-label={`${badge} waiting`}`.

- [ ] **Step 4: The redirect, the title and the links**

- `src/pages/brain/BrainRoutes.tsx`: delete `import { ReviewQueuePage } from './Review';` and replace `<Route path="review" element={<ReviewQueuePage />} />` with `<Route path="review" element={<Navigate to="/brain/waiting" replace />} />`; the doc comment drops "and the Review Queue" and says `/brain/review` now redirects (Waiting spec Decision 6).
- `src/components/layout/Navbar.tsx`: replace the two lines

```tsx
  // /brain's page draws its own h1, "What changed" (Decision 12).
  const isBrainHome = /^\/brain\/?$/.test(location.pathname);
```

with

```tsx
  // /brain and /brain/waiting draw their own h1 (delivery 1 Decision 12;
  // Waiting plan Decision 9).
  const isBrainHome = /^\/brain(\/waiting)?\/?$/.test(location.pathname);
```

- `src/components/rules/NightsSection.tsx`: `to="/brain/review"` → `to="/brain/waiting"`.
- `src/pages/copilot/ChatView.tsx`: the link becomes `<Link to="/brain/waiting" …>Waiting on you</Link>`.
- `src/pages/brain/Graph.tsx`: `{ to: '/brain/review', label: 'Open the review queue' }` → `{ to: '/brain/waiting', label: 'Open Waiting on you' }`.
- `src/pages/brain/Initiatives.tsx`: `<Link to="/brain/review" …>review queue</Link>` → `<Link to="/brain/waiting" className="text-accent hover:underline">Waiting on you</Link>`.

Then confirm nothing in `src` links to the old path except the redirect, the notification comment and test harnesses:

Run: `grep -rn "brain/review" src | grep -v "\.test\." | grep -v testPages`
Expected: only `src/pages/brain/BrainRoutes.tsx` (the route), `src/features/notifications/types.ts` (a comment) and `src/App.tsx` (a comment); fix any other hit the same way.

- [ ] **Step 5: Run the tests and the type-check**

Run: `npx vitest run --maxWorkers=2 src/components/layout src/pages/brain src/pages/rules/RulePage.test.tsx src/pages/copilot/ChatView.decisions.test.tsx src/components/rules && npx tsc -b --noEmit`
Expected: PASS; tsc prints nothing. (`RuleReviews.test.tsx` still renders `/brain/review` through `pages/rules/testPages.tsx`'s own route to `ReviewQueuePage`, which Task 7 removes.)

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: `15 problems (0 errors, 15 warnings)`.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.tsx src/pages/brain/BrainRoutes.tsx src/pages/brain/BrainRoutes.test.tsx src/components/layout/Navbar.tsx src/components/layout/Navbar.test.tsx src/components/rules/NightsSection.tsx src/pages/rules/RulePage.test.tsx src/pages/copilot/ChatView.tsx src/pages/copilot/ChatView.decisions.test.tsx src/pages/brain/Graph.tsx src/pages/brain/Initiatives.tsx
git commit -m "$(cat <<'EOF'
feat(brain): Waiting on you in the sidebar for everyone; Review Queue redirects

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Remove the old Review Queue and the Questions waiting panel

Spec §2.2 (Review Queue leaves; What changed drops `QuestionsWaitingPanel`), spec Decision 7; Decisions 1, 2, 7, 11.

**Files:**
- Delete: `src/pages/brain/Review.tsx`, `src/pages/brain/Review.test.tsx`, `src/components/rules/RuleReviews.tsx`, `src/components/rules/RuleReviews.test.tsx`, `src/components/brain/QuestionsWaitingPanel.tsx`, `src/components/brain/QuestionsWaitingPanel.test.tsx`, `src/features/proposals/proposalsSlice.test.ts`
- Modify: `src/features/proposals/proposalsSlice.ts`, `src/store.ts`, `src/pages/rules/testPages.tsx`, `src/e2e/rules.test.tsx`, `src/features/rules/ruleText.ts`, `src/features/campaigns/campaignApi.test.ts`, `src/components/rules/houseRules.test.ts`, `src/pages/brain/WhatChanged.tsx`, `src/pages/brain/WhatChanged.test.tsx`, `src/components/brain/houseRules.test.ts`

**Interfaces:**
- Consumes: `stubBrain` with `passThrough`, `deskOf`, `MY_RULE_REVIEW` (Task 2); `BrainRoutes` (Tasks 5–6).
- Produces: `proposalsSlice.ts` exports only the types `ProposalKind`, `ProposalStatus`, `TaskAction`, `InitiativeAction`, `Proposal`; the store has no `proposals` key.

- [ ] **Step 1: Move the one test that is not about the page**

In `src/features/campaigns/campaignApi.test.ts`, add the imports `import { fetchReviews } from '../rules/ruleApi';` and `import { RULES, WIN_BACK_ACTION, WIN_BACK_RULE } from '../rules/testRules';` and append:

```ts
describe("a rule's night campaign (campaigns spec §2.5, moved from the old Review Queue's tests)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it('makes a review that waits, or sends at once without review', async () => {
    const waiting = stubCampaigns({ rules: { rules: [...RULES, WIN_BACK_RULE] } });
    waiting.runNight(11);
    const reviews = await fetchReviews('waiting');
    expect(reviews.find((review) => review.kind === 'campaign')).toMatchObject({ kind: 'campaign', rule: { id: 11 }, counts: { reach: 2 } });
    vi.unstubAllGlobals();
    const direct = stubCampaigns({ rules: { rules: [...RULES, { ...WIN_BACK_RULE, actions: [{ ...WIN_BACK_ACTION, without_review: true }] }] } });
    direct.runNight(11);
    const page = await fetchSends(11, null);
    expect(page.results[0]).toMatchObject({ kind: 'rule', rule: { id: 11, name: 'Win-back watch' }, sent_by: null });
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/features/campaigns/campaignApi.test.ts`
Expected: PASS (the new test included).

- [ ] **Step 2: Point the rules harness and journey at the new page**

In `src/pages/rules/testPages.tsx`: delete the `proposalsReducer` and `ReviewQueuePage` imports and the `proposals: proposalsReducer,` reducer key; add `import { BrainRoutes } from '../brain/BrainRoutes';`; replace the `/brain/review` route with

```tsx
            <Route
              path="/brain/*"
              element={
                <>
                  <BrainRoutes />
                  <Where />
                </>
              }
            />
```

and in the store's doc comment write "the Brain" for "the Review Queue".

In `src/e2e/rules.test.tsx`: add the imports `import { stubBrain } from '../features/brain/testBrain';` and `import { deskOf, MY_RULE_REVIEW } from '../features/brain/testWaitingFixtures';`; in the header comment write "Waiting on you" for "the Review Queue"; replace steps 7 and 8 with:

```tsx
    // 7. Waiting on you holds it, with the server's counts. stubBrain answers
    //    the desk; the review's own calls pass through to the rules stub.
    stubBrain({
      offered: ['me'],
      waiting: {
        me: deskOf('me', [
          { ...MY_RULE_REVIEW, id: 300, title: 'Survey for 2 organisations', detail: { rule_id: 100, rule_name: 'Unhappy renewals', review_kind: 'survey', counts: { send: 3, skip: 0 } } },
        ]),
      },
      passThrough: spy,
    });
    renderRules('/brain/review', { nav: true });
    await waitFor(() => expect(where()).toBe('/brain/waiting?scope=me'));
    const review = await waitFor(() => {
      const found = document.querySelector('[data-item="rule_review-300"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(within(review).getByRole('link', { name: 'Unhappy renewals' })).toHaveAttribute('href', '/scenarios/rules/100');
    expect(review.querySelector('[data-part="counts"]')).toHaveTextContent('3 to send · 0 skipped');

    // 8. Approve: the survey is created and its page opens.
    await userEvent.click(within(review).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(where()).toBe('/surveys/31'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Unhappy renewals · 5 Oct 2026' })).toBeInTheDocument();
    expect(requestsOf(spy, 'POST', /^\/rules\/reviews\/300\/approve\/$/)).toHaveLength(1);
```

- [ ] **Step 3: Delete the old page, list and panel**

```bash
git rm src/pages/brain/Review.tsx src/pages/brain/Review.test.tsx src/components/rules/RuleReviews.tsx src/components/rules/RuleReviews.test.tsx src/components/brain/QuestionsWaitingPanel.tsx src/components/brain/QuestionsWaitingPanel.test.tsx src/features/proposals/proposalsSlice.test.ts
```

- `src/features/rules/ruleText.ts`: run `grep -rn "campaignReviewParts" src`; when only its definition is left, delete the function (and its doc comment). Leave every other export.
- `src/components/rules/houseRules.test.ts`: in the coverage test write `'./ReviewDecision.tsx'` for `'./RuleReviews.tsx'` and title it `'covers the new pages and the shared review decision'`.
- `src/pages/brain/WhatChanged.tsx`: delete the `QuestionsWaitingPanel` import and its element, leaving `<KnowledgeByFunctionPanel />` alone inside the Company knowledge section (Decision 11).
- `src/pages/brain/WhatChanged.test.tsx`: in `'month-end: …'` delete the `Questions waiting` assertion and keep the `Knowledge by function` one.
- `src/components/brain/houseRules.test.ts`: `const UNCHANGED = ['./KnowledgeByFunctionPanel.tsx'];` and its comment says Knowledge by function rides along until delivery 3.

- [ ] **Step 4: The proposals slice keeps only its types**

Replace `src/features/proposals/proposalsSlice.ts` with its header comment and its five type declarations only:

```ts
// Mirrors revenact-backend's proposal payloads exactly; see
// docs/API_CONTRACTS.md -> metrics -> proposals. Types only since Waiting on
// you (spec 2026-10-05-brain-waiting-design): the desk is read through
// features/brain, and no store state is kept for proposals.

export type ProposalKind = 'task' | 'initiative';
export type ProposalStatus = 'proposed' | 'approved' | 'rejected';
```

followed by the unchanged `TaskAction`, `InitiativeAction` and `Proposal` interfaces (copy them as they are, comments included). In `src/store.ts` delete `import proposalsReducer from './features/proposals/proposalsSlice';` and `proposals: proposalsReducer,`.

Run: `grep -rn "proposalsReducer\|fetchProposals\|generateProposals\|state.proposals\|s.proposals" src`
Expected: no output.

- [ ] **Step 5: The full suite, the type-check, lint and build**

Run: `npx tsc -b --noEmit && npx vitest run && npm run lint && npm run build`
Expected: tsc silent; every test passes; lint `15 problems (0 errors, 15 warnings)`; the build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "$(cat <<'EOF'
refactor(brain): remove the old Review Queue and Questions waiting

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

(`git add -A src` stages the deletions from Step 3 together with the edits; check `git status` first that nothing outside this task is staged.)

---

### Task 8: House rules, the journeys, the documents and the full run

Spec §2.3 (house rules; a contract stub; the e2e: "a manager sees a report's task proposal in My team and approves it"; the badge for a member without `view_all_accounts`; the redirect); Global Constraints.

**Files:**
- Modify: `src/components/brain/houseRules.test.ts`, `src/pages/brain/testPages.tsx`, `src/e2e/brain.test.tsx`, `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`

**Interfaces:**
- Consumes: everything above; `WaitingNavItem` (Task 6).
- Produces: `renderBrain(url, { width, role, nav, waitingLink })`.

- [ ] **Step 1: Extend the house rules**

In `src/components/brain/houseRules.test.ts`:
- Update the header comment: "The house rules over What changed and Waiting on you (both specs §2): every Brain component and both pages. Knowledge by function rides along unchanged until delivery 3."
- Add `...raw(import.meta.glob('../../pages/brain/Waiting.tsx', { query: '?raw', eager: true, import: 'default' })),` to `all`, and below it:

```ts
const shared = raw(import.meta.glob('../rules/ReviewDecision.tsx', { query: '?raw', eager: true, import: 'default' }));
```

- Add to the coverage list: `'../../pages/brain/Waiting.tsx'`, `'./WaitingRow.tsx'`, `'./WaitingDesk.tsx'`, `'./WaitingSkeleton.tsx'`, `'./ProposalDecision.tsx'`, `'./LostAccessNotice.tsx'`.
- Extend `'sets every figure in DM Mono with tabular-nums'` with `'./WaitingRow.tsx'` and `'./WaitingDesk.tsx'`.
- Append inside the `describe`:

```ts
  it('designs Waiting on you’s loading, empty and error states', () => {
    expect(files['../../pages/brain/Waiting.tsx']).toMatch(/<WaitingSkeleton \/>/);
    expect(files['../../pages/brain/Waiting.tsx']).toMatch(/<ErrorBlock /);
    expect(files['./WaitingDesk.tsx']).toMatch(/<EmptyState /);
    expect(files['./WaitingDesk.tsx']).toMatch(/NONE_OF_KIND/);
    expect(files['./WaitingSkeleton.tsx']).toMatch(/animate-pulse/);
  });

  it('nests no card in a card: a waiting row is flat inside the one bordered list', () => {
    expect(files['./WaitingRow.tsx']).not.toMatch(/rounded-(lg|xl)|border border-line/);
    expect(files['./WaitingDesk.tsx']).toMatch(/divide-y divide-line rounded-xl border border-line/);
  });

  it('sends every decision once', () => {
    for (const source of [files['./ProposalDecision.tsx'], files['../../pages/brain/Waiting.tsx'], shared['../rules/ReviewDecision.tsx']]) {
      expect(source).toMatch(/useSubmitOnce\(/);
    }
  });
```

Run: `npx vitest run --maxWorkers=2 src/components/brain/houseRules.test.ts`
Expected: PASS. If the four-sizes test fails, a new file used a size other than 11/13/15/22; fix the file, not the test.

- [ ] **Step 2: Let the journeys mount the badge**

In `src/pages/brain/testPages.tsx`, add `import { WaitingNavItem } from '../../components/layout/Sidebar';`, add `waitingLink = false` to the options (type `waitingLink?: boolean`), and render `{waitingLink ? <WaitingNavItem /> : null}` right after the Navbar line.

- [ ] **Step 3: Write the journeys**

In `src/e2e/brain.test.tsx`, add the imports:

```tsx
import { CARL_TASK_PROPOSAL, MY_QUESTION, WAITING_NOW } from '../features/brain/testWaitingFixtures';
import { WAIT } from '../features/brain/waitingText';
```

update the header comment to name both specs, and append:

```tsx
describe('Brain: Waiting on you', () => {
  const findRow = (key: string) =>
    waitFor(() => {
      const found = document.querySelector(`[data-item="${key}"]`);
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(WAITING_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('a manager sees a report’s task proposal in My team and approves it once', { timeout: 30000 }, async () => {
    const { spy } = stubBrain({ offered: ['me', 'team'] });
    renderBrain('/brain/waiting?scope=me', { nav: true, role: 'csm', waitingLink: true });

    // 1. Me: my own desk, with the badge's count; Carl's proposal is not mine.
    const link = await screen.findByRole('link', { name: 'Waiting on you' });
    expect(await within(link).findByText('4')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: MY_QUESTION.title })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: CARL_TASK_PROPOSAL.title })).toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([WAIT.TITLE]);

    // 2. My team: Carl's proposal, waiting on him, and mine to decide through the chain.
    await userEvent.click(screen.getByRole('button', { name: 'My team' }));
    await waitFor(() => expect(where()).toBe('/brain/waiting?scope=team'));
    const proposal = await findRow('proposal-22');
    expect(proposal.querySelector('[data-part="meta"]')).toHaveTextContent('Task proposal · 4 days · Waiting on Carl CSM');
    expect(proposal).toHaveTextContent('Approving creates a task: Review renewal pricing on Pizza Hut, for Carl CSM, due 9 Oct 2026, high priority.');

    // 3. Approve, double-clicked: one request; the row leaves; the status says so.
    await userEvent.dblClick(within(proposal).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(document.querySelector('[data-item="proposal-22"]')).toBeNull());
    expect(screen.getByText('Approved: Review Pizza Hut renewal pricing.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Proposals 0' })).toBeInTheDocument();
    expect(requests(spy, 'POST', '/metrics/proposals/')).toEqual(['/metrics/proposals/22/approve/']);

    // 4. The badge read again: Carl's proposal was never on my own desk.
    await waitFor(() => expect(requests(spy, 'GET', '/brain/waiting/count/')).toHaveLength(2));
    expect(within(link).getByText('4')).toBeInTheDocument();
  });

  it('a member without view_all_accounts lands from the old link, skips a review, and the badge drops', { timeout: 30000 }, async () => {
    const { spy } = stubBrain({ offered: ['me'] });
    renderBrain('/brain/review', { role: 'csm', waitingLink: true });
    await waitFor(() => expect(where()).toBe('/brain/waiting?scope=me'));
    const link = await screen.findByRole('link', { name: 'Waiting on you' });
    expect(await within(link).findByText('4')).toBeInTheDocument();
    const review = await findRow('rule_review-14');
    await userEvent.dblClick(within(review).getByRole('button', { name: 'Skip' }));
    expect(await screen.findByText('Skipped the survey from Detractor follow-up.')).toBeInTheDocument();
    expect(await within(link).findByText('3')).toBeInTheDocument();
    expect(requests(spy, 'POST', '/rules/reviews/')).toEqual(['/rules/reviews/14/skip/']);
    expect(requests(spy, 'GET', '/metrics/')).toEqual([]);
  });
});
```

and add `beforeEach` to the `vitest` import.

Run: `npx vitest run --maxWorkers=2 src/e2e/brain.test.tsx`
Expected: PASS (3 journeys: delivery 1's and these two).

- [ ] **Step 4: The product documents**

`docs/03-ui-ux-design.md`:
- Replace the bullet that starts `- **Review Queue (`/brain/review`): From your rules**` (through "…never left for the next person on the device.") with:

```markdown
- **Rule reviews wait in Waiting on you (`/brain/waiting`)** for every
  member (`/brain/review` redirects there). A review's row: the review's
  title, "From <rule> (a link): 12 to send · 2 skipped" in DM Mono, then
  Approve (opens the new survey; a campaign opens Campaigns) and Skip, each
  sent once. A refusal shows at Approve in the danger colour ("Surveys
  refused it: …") and takes focus. A review expires 7 days after its night,
  or sooner if the rule's segment or trigger changes ("This rule's segment or
  trigger has changed since this review was made, so it has expired."); an
  expired or already-decided item drops off the list, saying so.
```

- In the campaigns "Elsewhere" bullet, replace "the Review Queue's From your rules shows campaign reviews (the campaign, "Would email 2 people · 1 skipped", Approve and Skip; records are counted, never named)" with "Waiting on you shows campaign reviews (the rule, "4 to send · 0 skipped", Approve and Skip; records are counted, never named)".
- In "### Brain: What changed", the last bullet: "The Navbar shows "Brain" as a paragraph, not a heading, on `/brain` and `/brain/waiting`."
- After that section, add:

```markdown
### Brain: Waiting on you

Spec `docs/superpowers/specs/2026-10-05-brain-waiting-design.md` §2. Same
folder and house-rules suite as What changed.

- **Header.** An `h1` at 22px in DM Serif Display ("Waiting on you"), the
  same scope switch, and in Company, for `view_all_accounts` readers, the
  page's one primary button, Ask the agent, with "Uses AI credits." below it.
- **Chips.** All · Rule reviews · Proposals · Questions · Overdue tasks, each
  with its full count in DM Mono; pill buttons that wrap, `aria-pressed`.
- **The list.** One bordered surface, `divide-y`, oldest first; each row is
  flat: a meta line (kind · "3 days" in DM Mono · "Waiting on Dana CSM"
  outside Me), the title, the record it is about (a link), then the kind's
  body: a rule review's counts and Approve / Skip; a proposal's action in
  words, its evidence in DM Mono, "Decided in session …", and Approve /
  Reject (Reject asks "Why not? (optional)"); a question's asker and
  Answer; an overdue task's due date and Open task. When the reader may not
  act: "Waiting on Dana CSM to decide" instead of buttons. Approve is the
  bordered button; Skip, Reject and Cancel are quiet.
- **Feedback.** A decision is sent once; the row leaves and one status line
  says what happened. A 403 shows the server's sentence at the buttons and
  takes focus.
- **States.** A skeleton of chips and rows, "Try again" on error, an empty
  line per scope ("Nothing is waiting on you." / "… on your team." /
  "Nothing is waiting."), "N more items about records you can't open".
- **Sidebar.** Waiting on you (Lucide `Inbox`) after What changed, with the
  reader's Me count as its badge.
```

`docs/04-app-flow.md`:
- Route table: replace the `/brain/review` row with two rows:

```markdown
| `/brain/waiting` | `WaitingPage`: Waiting on you, scoped Me / My team / Company (`?scope=`) | auth |
| `/brain/review` | redirect to `/brain/waiting` | auth |
```

- Sidebar paragraph: "KNOWLEDGE BRAIN (What changed and Waiting on you, with the reader's Me count as its badge, for everyone; Initiatives, Feature Requests and Anomalies for `view_all_accounts`)".
- Rules flow step 4 ("**Review.**"): replace its first sentence's path with "`/brain/waiting` (Waiting on you), for every signed-in user, lists the rule reviews on the reader's desk from `GET /brain/waiting/?scope=`"; keep the approve / refusal / `RULE_CHANGED` / skip / 409 / expiry sentences; replace the last sentence about the AI proposals with "Proposals are decided on the same page." Step 5: "`rule_review` links to `/brain/review`, which redirects to Waiting on you."
- Copilot sessions step 6: "writes proposals that wait in Waiting on you, tagged with the session".
- "### 4.11 Brain": replace "Company knowledge (Questions waiting, Knowledge by function) sits under Company only" with "Knowledge by function sits under Company only"; replace the sentence "Review Queue is open to every member (the pending-proposal badge stays behind `view_all_accounts`)." with:

```markdown
Waiting on you (`/brain/waiting`, spec 2026-10-05 Waiting §2) is open to
every member, on the same scope switch: `GET /brain/waiting/?scope=` lists
rule reviews, proposals, questions and overdue tasks, oldest first, naming
whom each waits on outside Me. Rule reviews are decided with the rules
endpoints (Approve opens the new send); proposals with `POST
/metrics/proposals/<id>/approve|reject/` (a 403 "You can't decide this
proposal." stays on the row; 409 drops it); Answer opens the question where
it is answered (the organization's Knowledge tab, else the Copilot); Open
task opens the record's story filtered to tasks. Each decision is sent once
and asks the sidebar badge (`GET /brain/waiting/count/`, the reader's Me
total, for every member) to read again. Ask the agent (`POST
/metrics/proposals/generate/`) shows in Company for `view_all_accounts`
readers and re-reads the desk. `/brain/review` redirects here.
```

- "## 6. Redux map": "26 slices." and "What changed (`/brain`) and Waiting on you (`/brain/waiting`) are not among them: they read `/brain/` through hooks (`useBrainScope`, `useChanged`, `useKept`, `useWaiting`, `useWaitingCount`), no slice."; delete the `proposals` row.

`.agents/workflows/repo-architecture.md`:
- `features/brain/` line: append "; Waiting on you's types, copy (`waitingText.ts`) and API; testWaitingFixtures.ts".
- `components/brain/` line: "What changed and Waiting on you: ScopeSwitch, useBrainScope, useChanged, useKept, ScopeBriefCard, MovesList, WhyPanel, MeasureTable, ChangedSkeleton, useWaiting, useWaitingCount, WaitingDesk, WaitingRow, ProposalDecision, WaitingSkeleton, LostAccessNotice, styles, formatMetric; KnowledgeByFunctionPanel rides along unchanged (delivery 3 moves it); own house-rules suite".
- `pages/brain/` line: "BrainRoutes; WhatChangedPage (/brain) and WaitingPage (/brain/waiting), every member; Initiatives, Graph, FeatureRequests, Anomalies (view_all_accounts); testPages.tsx (renderBrain)".
- The routes line: "`brain/*` → BrainRoutes (What changed and Waiting on you open to all, `/brain/review` redirects; the rest needs view_all_accounts)".
- Wherever `components/rules/` is described, name `ReviewDecision` (the shared Approve / Skip) in place of `RuleReviews`; wherever `features/proposals/` is described, "types only".

Run: `grep -rn "Review Queue\|ReviewQueuePage\|QuestionsWaitingPanel\|RuleReviews" docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md`
Expected: no output (fix any hit that describes something that no longer ships).

- [ ] **Step 5: The full run**

Run: `npx tsc -b --noEmit && npx vitest run && npm run lint && npm run build`
Expected: tsc silent; every test passes; lint `15 problems (0 errors, 15 warnings)`; the build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/brain/houseRules.test.ts src/pages/brain/testPages.tsx src/e2e/brain.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "$(cat <<'EOF'
test(e2e): Waiting on you journeys, house rules and product documents

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review (done while writing)

**Spec coverage.**
- §0 What exists: the Review Queue (`Review.tsx`, `RuleReviews`), the view_all-only proposals and badge, questions and tasks: replaced in Tasks 3–7.
- Decisions 1 (whose desk): `useBrainScope` + `waitingOnText` (Tasks 1, 5). 2 (four kinds, oldest first; who decides): Tasks 1, 4; the server's `can_decide` drives buttons. 3 (session proposals, "Decided in session"): Task 4 (`SESSION_PROPOSAL`). 4 (Ask the agent stays Company): Task 5. 5 (badge for every member, Me count): Tasks 4, 6, 8. 6 (`/brain/review` redirects; notifications land): Tasks 6, 8. 7 (Questions waiting leaves What changed; Knowledge by function stays until delivery 3): Task 7.
- §2.1: header, chips with counts (Task 5); each row's parts (Task 4); shared rule review decision (Task 3); proposals with can't-decide (Task 4); question Answer, task Open task (Task 4); decide once, leave, badge drops (Tasks 4–6, e2e Task 8); hidden (Task 5); Ask the agent (Task 5); empty by scope, skeleton, error, 375px (Task 5); house rules (Task 8).
- §2.2: sidebar, `Inbox`, badge for everyone, `fetchProposals` removed (Task 6); redirect (Task 6); What changed drops the panel (Task 7).
- §2.3: four kinds (Task 4), filters (Task 5), who in My team (Tasks 4–5), can't decide (Task 4), decide once and leave (Tasks 4–5, 8), hidden (Task 5), badge without view_all (Tasks 6, 8), redirect (Tasks 6, 8), house rules (Task 8), contract stub (Task 2), the manager e2e (Task 8).
- §3: both shapes field for field (Task 1), 400 before 403 (Task 2).

**Placeholder scan.** No TBD/TODO; every code step carries its code.

**Type consistency.** `WaitingRowProps.onGone(item, message)` (Task 4) is what `WaitingDesk` passes and the page's `gone(item, text)` takes (Task 5). `ReviewDecisionProps` (Task 3) is used by `RuleReviews` (Task 3) and `WaitingRow` (Task 4) with the same names. `useWaitingCount(userId)` / `refreshWaitingCount()` (Task 4) are what `Sidebar` (Task 6) and the page (Task 5) call. `stubBrain` options `waiting`, `failWaiting`, `refuseNextDecision`, `generates`, `passThrough` (Task 2) are the ones Tasks 4, 5, 7 and 8 pass. `renderBrain`'s `waitingLink` (Task 8) mounts `WaitingNavItem` (Task 6).
