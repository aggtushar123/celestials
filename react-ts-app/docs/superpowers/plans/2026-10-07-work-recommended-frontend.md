# Work, delivery 2 ("Recommended"): frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Recommended tab in Work (`/work/recommended`) where a manager reads what Revenact recommends (title, facts, evidence, record, suggested person) and assigns each one (person, due date and title prefilled) or dismisses it with a reason; the sidebar badge counts overdue tasks plus recommendations waiting; the bell gets `recommendations_waiting`; and a new Settings › Work › Recommendations page sets who receives them, each source's switch and threshold, the dismiss cooldown and "Run now".

**Architecture:** Delivery 1's `features/work` layer gains the contract's recommendation and settings shapes, their API calls, two pure modules (`recommended.ts` for the page's words and rules, `workSettings.ts` for the settings draft, validation, patch and refusals) and a stateful stub extension. `components/work` gains the card, its Assign and Dismiss forms, a list hook and a waiting-count hook; the existing change bus (`taskChanges.ts`) gets a second event, `recommendationsChanged()`, for changes that are not task changes (Brain deciding an AI-agent proposal, "Run now"). `pages/work/Recommended.tsx` is the page; `pages/settings/WorkRecommendationsPage.tsx` is the settings page, in a new Work group of `WORKSPACE_SETTINGS_NAV`. No Redux slice: every read goes through hooks, as delivery 1 does.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), react-router 7, Tailwind v4 tokens, Redux Toolkit (store only), Vitest + Testing Library (jsdom), lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-07-work-round-design.md` (§2.4 for the frontend, with §2.1 to §2.3 for behaviour, §4, §5 and §6 as they apply to delivery 2, and the owner's decisions in §1.2). **API contract (binding):** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/work-rec-be/docs/superpowers/plans/2026-10-07-work-recommended-api.md`, plus the "Decisions" section of `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/work-rec-be/docs/superpowers/plans/2026-10-07-work-recommended-backend.md`. Delivery 1's frontend plan (`docs/superpowers/plans/2026-10-07-work-tasks-frontend.md`) is the house style; its code is what this plan extends. Read all four with this plan.

## Global Constraints

- **Worktree and branch.** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/work-rec-fe`, branch `feat/work-recommended`, based on `feat/work-tasks` (`dbcb5f2`, delivery 1's frontend, not yet on `main`). `node_modules` is a symlink: never commit it; always `git add <explicit paths>`, never `git add -A` or `git add .`.
- **Never run prettier. Never use `git stash`** (the stash stack is shared across worktrees; use a WIP commit if you must set work aside).
- **Commands.** `npx vitest run <path> --maxWorkers=2`, `npx vitest run --maxWorkers=2`, `npm run lint`, `npm run build`. Run them in the foreground.
- **Every commit message ends with exactly this line:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Tokens only** (`src/test/houseRules.ts` `RAW`): no hex, `rgb()`, or named Tailwind palette colours in any `.tsx`.
- **Type sizes 11/13/15/22 only** on every Work surface (`text-[11px]`, `text-[13px]`, `text-[15px]`, `text-[22px]`), at most four per surface; no named sizes. The settings page keeps the settings frame's own `text-[20px] font-bold` h1 (03 UI/UX, "Settings: the frame") and otherwise uses 11/13/15.
- **Figures in DM Mono:** every count and date uses `MONO` (`font-mono-brand tabular-nums`); a server sentence with figures in it goes through `Figured` (`src/components/brain/Figured.tsx`).
- **44px targets:** every `<button>`, `<Link>`, `<select>`, `<input>` and `<textarea>` reaches `min-h-11` (or `h-11 w-11`) on phones, directly or through a compliant constant (`BUTTON`, `PRIMARY`, `QUIET`, `INPUT`, `FILTER_SELECT`, `LINK`, or a local `const` holding `min-h-11`). A `className={CONTROL}` alone does not count to the checker; wrap it in a local `INPUT` constant as Task 5 shows.
- **Lucide icons only**, each with `aria-hidden="true"`. No emoji. **No em dash (`—`) anywhere in a file under `src/components/work/`, `src/pages/work/` or `src/features/work/`, comments included,** nor in `src/pages/settings/WorkRecommendationsPage.tsx`.
- **No glass** on any Work surface, no card inside a card (each recommendation is a flat row inside one bordered `LIST`), and Today's New task stays the only `PRIMARY` in the Work section (Assign and Dismiss are `BUTTON` and `QUIET`). The settings page has one primary, Save changes.
- **Every list has loading (a skeleton, not a spinner), empty and error states.**
- **Privacy.** Anything the reader cannot open is counted, never named (`hidden`: "N more about accounts you can't open"). The UI never guesses who may decide or who can open a record: it shows what the API returns (`suggested_assignee.can_open`, `GET /work/assignees/`'s `can_open`, `can_edit`).
- **Copy.** Sentence case. The server's refusals are shown verbatim. The UI's own words say "organization" where delivery 1 does; the hidden line keeps the spec's own words ("accounts you can't open").
- **Out of scope:** delivery 3 (timezone, working days, escalation, digest, `email_ready`, the `task_overdue` and `task_escalated` bell kinds, Briefs moving into Work). Briefs stays in Settings › AI. The mock `features/tasks/tasksSlice` is left alone.

## Decisions (where the spec or the contract leaves a choice)

1. **The tab rule.** Recommended shows to anyone with reports, `view_all_accounts` or the Leadership function (the Team rule, `useTeamAccess`), and to anyone whose waiting count (`GET /work/recommendations/?scope=team`'s `count`) is above zero (spec §2.4: "anyone with open items to decide, or with reports"). It also stays drawn while the reader is on `/work/recommended`, so deciding the last one does not pull the tab out from under them.
2. **No redirect.** `/work/recommended` always renders, unlike Team. The route is open to every member (contract: no 403, `team` only adds what the reader may decide), a `recommendations_waiting` link must never bounce, and a reader with nothing to decide sees the empty state.
3. **Scope.** The page reads `?scope=me|team` from its URL; without one it sends no `scope` and shows what the server chose (`team` for readers with reports or `view_all_accounts`, else `me`). The Me / My team switch (Brain's `ScopeSwitch`, a select below `sm`) is shown to readers with reports or `view_all_accounts`, inline in the page's toolbar (not portaled into the bar: Recommended's scopes are not Brain's, and `useBrainScope` would offer Company). Choosing writes `?scope=` with `replace`.
4. **The badge.** The sidebar's Work item shows `counts.overdue` (Today) plus `count` (`GET /work/recommendations/?scope=team`), as the contract says. Its accessible name says both parts it has: "Work, 1 overdue, 3 recommended", "Work, 2 recommended", "Work, 1 overdue". Each part is read on its own; a failed read keeps that part's last value. Both read on mount, on every route change, after every `taskChanged()` and after every `recommendationsChanged()`.
5. **Two change events.** A decision made on Recommended calls `taskChanged()` (a task was made, or the badge, Today, Team, Brain's desk and Brain's badge may have moved). Brain's `ProposalDecision` and Settings' Run now call the new `recommendationsChanged()` instead: it reaches only the recommendation readers (the page, the waiting count, the badge), so Brain's own desk does not re-read and flash its skeleton after its own decision.
6. **Cards are rows.** Each recommendation is an `<li>` holding an `<article>` named by its title, flat inside one `LIST` (the spec's "cards"; house rule: no card in a card). Its meta line: the record (a link), the kind ("Renewal"), the priority from `defaults`, "Suggested for Carl CSM" (or "Suggested for you", "Nobody suggested", "Suggested for Dana CSM, who can't open it now", "... (no longer active)"), and "In Carl CSM's queue" when the recipient is not the reader. Then the facts as a short bulleted list (`aria-label="Why"`, figures in DM Mono via `Figured`), the evidence links (`aria-label="Evidence"`), then Assign (`BUTTON`) and Dismiss (`QUIET`).
7. **Assign** opens a small form in the row: Who does it (delivery 1's `AssigneeSelect`, fed by `GET /work/assignees/?customer=|account=`, people who cannot open the record disabled with "· Can't open this organization"), Due date and Task title. Who does it is prefilled with the suggested person only when `active && can_open` (contract) and while the assignee list still offers them; otherwise it reads "Nobody yet". Due date and title are prefilled from `defaults`; priority is not asked (the server uses `defaults.priority`, shown in the meta line). The browser refuses, in the server's words, a missing person ("Choose who does it."), a date that does not parse ("Choose a date."), a blank title ("Give the task a title.") and one over 255 characters. Submit is "Assign task"; Cancel closes the form and puts focus back on Assign.
8. **Dismiss** opens a small form in the row: Reason, a select of Already handled, Not relevant, Wrong person and Other, with "Choose a reason" as its disabled first option; Other adds "Say why" (required, at most 255). Refused in place: no reason ("Choose a reason."), Other without a note ("Say why."), a note over 255 ("Keep the note under 255 characters.").
9. **Outcomes.** Success removes the row, decrements `count`, says "Assigned to you: <title>." (with an Open task link to `?task=<id>` on this page) or "Dismissed: <title>." in the page's status line, focuses that line, and calls `taskChanged()`. A 409 `ALREADY_DECIDED` removes the row and shows the server's `detail` ("Mona Manager already assigned this.", "This recommendation has expired."); a 404 removes it with "This recommendation isn't there any more." A 403 `CANT_DECIDE`, a field error or `ASSIGNEE_CANNOT_OPEN` stays in the form (the last under Who does it). Each form sends once (`useSubmitOnce` with `holdOnSuccess`).
10. **Settings path and icon.** `/settings/recommendations`, Lucide `Lightbulb`, in a new **Work** group between Data and AI. No capability gate on the item: every member opens it; `can_edit` from `GET /work/settings/` decides between the form and the read-only view (a member sees values as text, not disabled controls, as delivery 1 Decision 5 does for the panel). Delivery 3 adds Tasks and Notifications to the group.
11. **The settings form.** Who receives them: two radios ("The suggested person's manager" / "The suggested person"). Signals: one row per source in contract order, each a switch (`role="switch"` checkbox) and its threshold inputs (renewal "Within (days)"; health drop "Drop of at least" and "Compared with (days ago)"; urgent tickets "At least (tickets)"; overdue tasks "Overdue by (days)"; questions "Open for (days)"; anomaly and the AI agent have none). The cooldown "After a dismissal (days)". Numbers are typed as text (`inputMode`), checked in the browser against the contract's limits with the contract's own sentences, then only the changed fields are sent (`PATCH` with a partial `sources`). Save changes is disabled until something changed. Server refusals map to their field (nested `sources.<kind>.<field>`), a source's own refusal under its row, anything else on the form.
12. **Run now** (only when `can_edit`) posts `refresh/` and shows "Run finished: 2 new, 5 updated, 1 expired. 2 people told.", plus "N couldn't be sent to anyone who can open the record." when `unrouted > 0` and "These sources failed this run: Renewal due." when `failed` is not empty; then `recommendationsChanged()`. It runs with the saved settings ("Runs with the saved settings.").
13. **The bell.** `recommendations_waiting` gets Lucide `Lightbulb`; its link `/work/recommended` is an ordinary navigation (no task-panel history state).
14. **Brain stays consistent.** Brain › Waiting on you still shows AI-agent proposals and decides them through `/metrics/proposals/`; the backend settles the matching recommendation. After a decision (or a 404/409 there), `ProposalDecision` calls `recommendationsChanged()` so the Work badge and an open Recommended list catch up. A Recommended decision calls `taskChanged()`, which already re-reads Brain's desk and badge (delivery 1).
15. **Copy for the page.** Section heading "Yours to decide" (scope `me`) or "Yours and your team's" (scope `team`), with the count in DM Mono; "Showing 100 of 130" under the list when `count` exceeds the items. Empty: "Nothing to decide" / "Revenact recommends work here when a renewal nears, health drops or tickets pile up." Error: "Could not load recommendations." with Try again.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/features/work/workTypes.ts` | modify | Recommendation, decision, refresh and settings shapes; `REC_KINDS` |
| `src/features/work/workApi.ts` | modify | The six new calls; `RefusalField` gains `reason`, `note` |
| `src/features/work/recommended.ts` | create | `REC` copy, `REC_SCOPES`, `KIND_LABEL`, `DISMISS_REASONS`, `isRecScope`, `recTitle`, `hiddenRecText`, `suggestedText`, `queueText`, `prefillAssignee`, `pickable`, `validateAssign`, `validateDismiss`, `assignedStatus`, `dismissedStatus`, `withoutRec`, `decidedElsewhere`, `workBadgeName` |
| `src/features/work/workSettings.ts` | create | `SOURCE_SPECS`, `SET` copy, draft, validation, patch, refusal reading, Run now summary |
| `src/features/work/testWorkFixtures.ts` | modify | `recRow`, `REC_RENEWAL`, `REC_TICKETS`, `REC_AGENT`, `RECOMMENDATIONS`, `WORK_SETTINGS` |
| `src/features/work/testWork.ts` | modify | Recommendations, decisions, refresh and settings in the stub |
| `src/features/work/workTabs.ts` | modify | Recommended tab, `workTabsFor({team, recommended})`, `showsRecommended` |
| `src/features/notifications/types.ts` | modify | `recommendations_waiting` |
| `src/components/work/taskChanges.ts` | modify | `recommendationsChanged()`, `useRecommendationChanges(cb)` |
| `src/components/work/useRefreshTick.ts` | create | The tick the Work counts re-read on |
| `src/components/work/useRecommendedCount.ts` | create | The waiting count |
| `src/components/work/useWorkCount.ts` | modify | `{ overdue, waiting }` |
| `src/components/work/useRecommended.ts` | create | `GET /work/recommendations/` for the page |
| `src/components/work/RecommendationCard.tsx` | create | One recommendation |
| `src/components/work/AssignForm.tsx` | create | Assign |
| `src/components/work/DismissForm.tsx` | create | Dismiss |
| `src/components/work/RecommendedSkeleton.tsx` | create | The page's loading state |
| `src/components/layout/Sidebar.tsx` | modify | `WorkNavItem` badge; `NavItem`'s `badgeName` |
| `src/components/layout/WorkTabs.tsx` | modify | The Recommended tab |
| `src/components/layout/NotificationKindIcon.tsx` | modify | `recommendations_waiting` |
| `src/components/brain/ProposalDecision.tsx` | modify | `recommendationsChanged()` after a decision |
| `src/pages/work/Recommended.tsx` | create | `/work/recommended` |
| `src/pages/work/WorkRoutes.tsx` | modify | The `recommended` route |
| `src/pages/settings/WorkRecommendationsPage.tsx` | create | Settings › Work › Recommendations |
| `src/pages/settings/workspaceSettingsNav.ts` | modify | The Work group |
| `src/pages/settings/routes.tsx` | modify | `/settings/recommendations` |
| `src/components/work/houseRules.test.ts` | modify | The new files under the house rules |
| `src/e2e/work.test.tsx` | modify | The journeys |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md` | modify | The product docs |

---

### Task 1: The recommendation data layer and the second change event

**Files:**
- Modify: `src/features/work/workTypes.ts` (append), `src/features/work/workApi.ts`, `src/features/work/testWorkFixtures.ts` (append), `src/components/work/taskChanges.ts`
- Create: `src/features/work/recommended.ts`
- Test: `src/features/work/recommended.test.ts` (create), `src/features/work/workApi.test.ts` (append), `src/components/work/taskChanges.test.tsx` (append)

**Interfaces:**
- Consumes: `apiFetch`, `ApiError` (`src/lib/apiClient.ts`); `ScopeOption` (`src/features/brain/brainTypes.ts`); `WORK`, `isDueDate` (`src/features/work/workText.ts`); delivery 1's `TaskParent`, `TaskPerson`, `PersonRef`, `TaskPriority`, `TaskRow`, `AssigneeOption`, `readRefusal`, `Refusal`; fixtures `ALICE`, `CARL`, `DANA`, `PIZZA`, `UBER`, `NOW`, `refOf`.
- Produces:
  - types `RecKind`, `RecScope`, `RecStatus`, `DismissReason`, `RecEvidence`, `RecSuggested`, `RecDefaults`, `RecommendationRow`, `RecommendationsPayload`, `DecidedRecommendation`, `AssignBody`, `AssignAnswer`, `DismissBody`, `DismissAnswer`, `RefreshResult`, `RecommendTo`, `SourceField`, `SourceSettings`, `WorkSettings`, `WorkSettingsPatch`; const `REC_KINDS`.
  - `fetchRecommendations(scope?: RecScope | null): Promise<RecommendationsPayload>`, `assignRecommendation(id: number, body: AssignBody): Promise<AssignAnswer>`, `dismissRecommendation(id: number, body: DismissBody): Promise<DismissAnswer>`, `refreshRecommendations(): Promise<RefreshResult>`, `fetchWorkSettings(): Promise<WorkSettings>`, `patchWorkSettings(patch: WorkSettingsPatch): Promise<WorkSettings>`; `RefusalField` now includes `'reason' | 'note'`.
  - `REC` (copy), `REC_SCOPES: ScopeOption[]`, `KIND_LABEL: Record<RecKind, string>`, `DISMISS_REASONS: { value: DismissReason; label: string }[]`, `isRecScope(value: string | null): value is RecScope`, `recTitle(scope: RecScope): string`, `hiddenRecText(n: number): string | null`, `suggestedText(rec: RecommendationRow, me: number | null): string`, `queueText(rec: RecommendationRow, me: number | null): string | null`, `prefillAssignee(rec: RecommendationRow): number | null`, `pickable(people: AssigneeOption[] | null, id: number | null): number | null`, `validateAssign(form: { assignee: number | null; due: string; title: string }): AssignErrors`, `validateDismiss(reason: DismissReason | '', note: string): DismissErrors`, `assignedStatus(title: string, assignee: TaskPerson | null, me: number | null): string`, `dismissedStatus(title: string): string`, `withoutRec(payload: RecommendationsPayload, id: number): RecommendationsPayload`, `decidedElsewhere(err: unknown): string | null`, `workBadgeName(overdue: number, waiting: number): string`; types `AssignErrors = Partial<Record<'assignee_id' | 'due_date' | 'title', string>>`, `DismissErrors = Partial<Record<'reason' | 'note', string>>`.
  - fixtures `recRow(over)`, `REC_RENEWAL` (id 5), `REC_TICKETS` (id 6), `REC_AGENT` (id 7), `RECOMMENDATIONS`, `WORK_SETTINGS`.
  - `recommendationsChanged(): void`, `useRecommendationChanges(onChange: () => void): void`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/work/recommended.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import {
  DISMISS_REASONS,
  KIND_LABEL,
  REC,
  assignedStatus,
  decidedElsewhere,
  dismissedStatus,
  hiddenRecText,
  isRecScope,
  pickable,
  prefillAssignee,
  queueText,
  recTitle,
  suggestedText,
  validateAssign,
  validateDismiss,
  withoutRec,
  workBadgeName,
} from './recommended';
import { ALICE, CARL, REC_AGENT, REC_RENEWAL, REC_TICKETS, recRow } from './testWorkFixtures';
import type { AssigneeOption, RecommendationsPayload } from './workTypes';

const people: AssigneeOption[] = [
  { id: 1, name: 'Alice', function: 'cs', can_open: true },
  { id: 3, name: 'Carl CSM', function: 'cs', can_open: true },
  { id: 4, name: 'Dana CSM', function: 'cs', can_open: false },
];

describe('recommended: words', () => {
  it('labels every kind and every dismiss reason', () => {
    expect(KIND_LABEL).toEqual({
      renewal_due: 'Renewal',
      health_drop: 'Health drop',
      urgent_tickets: 'Urgent tickets',
      overdue_tasks: 'Overdue tasks',
      open_questions: 'Open questions',
      anomaly: 'Anomaly',
      agent: 'AI agent',
    });
    expect(DISMISS_REASONS.map((r) => `${r.value}:${r.label}`)).toEqual([
      'already_handled:Already handled',
      'not_relevant:Not relevant',
      'wrong_person:Wrong person',
      'other:Other',
    ]);
  });

  it('knows its two scopes and titles each', () => {
    expect(isRecScope('me')).toBe(true);
    expect(isRecScope('team')).toBe(true);
    expect(isRecScope('company')).toBe(false);
    expect(isRecScope(null)).toBe(false);
    expect(recTitle('me')).toBe('Yours to decide');
    expect(recTitle('team')).toBe("Yours and your team's");
  });

  it('counts what the reader cannot open, never naming it (spec §2.4)', () => {
    expect(hiddenRecText(0)).toBeNull();
    expect(hiddenRecText(1)).toBe("1 more about an account you can't open");
    expect(hiddenRecText(4)).toBe("4 more about accounts you can't open");
  });

  it('says who it is suggested for, and whose queue it is in', () => {
    expect(suggestedText(REC_RENEWAL, ALICE.id)).toBe('Suggested for Carl CSM');
    expect(suggestedText(REC_RENEWAL, CARL.id)).toBe('Suggested for you');
    expect(suggestedText(REC_TICKETS, ALICE.id)).toBe("Suggested for Dana CSM, who can't open it now");
    expect(suggestedText(recRow({ id: 9, kind: 'anomaly', title: 'Check', suggested_assignee: null }), ALICE.id)).toBe('Nobody suggested');
    expect(
      suggestedText(recRow({ id: 9, kind: 'anomaly', title: 'Check', suggested_assignee: { id: 5, name: 'Erin Former', active: false, can_open: true } }), ALICE.id),
    ).toBe('Suggested for Erin Former (no longer active)');
    expect(queueText(REC_RENEWAL, ALICE.id)).toBeNull();
    expect(queueText(REC_AGENT, ALICE.id)).toBe("In Carl CSM's queue");
  });

  it('says what happened', () => {
    expect(assignedStatus('Prep', { id: 1, name: 'Alice', active: true }, 1)).toBe('Assigned to you: Prep.');
    expect(assignedStatus('Prep', { id: 3, name: 'Carl CSM', active: true }, 1)).toBe('Assigned to Carl CSM: Prep.');
    expect(dismissedStatus('Prep')).toBe('Dismissed: Prep.');
  });

  it('names both parts of the badge it has (Decision 4)', () => {
    expect(workBadgeName(1, 3)).toBe('1 overdue, 3 recommended');
    expect(workBadgeName(0, 2)).toBe('2 recommended');
    expect(workBadgeName(2, 0)).toBe('2 overdue');
    expect(workBadgeName(0, 0)).toBe('');
  });
});

describe('recommended: the Assign prefill (contract: do not prefill someone who can no longer take it)', () => {
  it('prefills only an active suggested person who can open the record', () => {
    expect(prefillAssignee(REC_RENEWAL)).toBe(3);
    expect(prefillAssignee(REC_TICKETS)).toBeNull();
    expect(prefillAssignee(recRow({ id: 9, kind: 'anomaly', title: 'Check', suggested_assignee: null }))).toBeNull();
    expect(prefillAssignee(recRow({ id: 9, kind: 'anomaly', title: 'Check', suggested_assignee: { id: 3, name: 'Carl CSM', active: false, can_open: true } }))).toBeNull();
  });

  it('keeps a choice only while the picker offers it enabled; keeps it while the list loads', () => {
    expect(pickable(null, 3)).toBe(3);
    expect(pickable(people, 3)).toBe(3);
    expect(pickable(people, 4)).toBeNull();
    expect(pickable(people, 99)).toBeNull();
    expect(pickable(people, null)).toBeNull();
  });
});

describe('recommended: refusing in the browser, in the server’s words', () => {
  it('checks Assign', () => {
    expect(validateAssign({ assignee: 3, due: '2026-10-09', title: 'Prep' })).toEqual({});
    expect(validateAssign({ assignee: null, due: '', title: '  ' })).toEqual({
      assignee_id: 'Choose who does it.',
      due_date: 'Choose a date.',
      title: 'Give the task a title.',
    });
    expect(validateAssign({ assignee: 3, due: '2026-02-30', title: 'x'.repeat(256) })).toEqual({
      due_date: 'Choose a date.',
      title: 'Keep the title under 255 characters.',
    });
  });

  it('checks Dismiss', () => {
    expect(validateDismiss('', '')).toEqual({ reason: 'Choose a reason.' });
    expect(validateDismiss('not_relevant', '')).toEqual({});
    expect(validateDismiss('other', '   ')).toEqual({ note: 'Say why.' });
    expect(validateDismiss('other', 'x'.repeat(256))).toEqual({ note: 'Keep the note under 255 characters.' });
    expect(validateDismiss('other', 'Moving to annual billing')).toEqual({});
  });
});

describe('recommended: outcomes', () => {
  it('drops a decided row and counts one fewer', () => {
    const payload: RecommendationsPayload = { scope: 'team', items: [REC_RENEWAL, REC_TICKETS], count: 2, hidden: 1 };
    expect(withoutRec(payload, 5)).toEqual({ scope: 'team', items: [REC_TICKETS], count: 1, hidden: 1 });
    expect(withoutRec({ ...payload, count: 0 }, 99).count).toBe(0);
  });

  it('reads a decision that can no longer happen: 409 with its own sentence, 404, else nothing', () => {
    const already = new ApiError(409, { code: 'ALREADY_DECIDED', detail: 'Mona Manager already assigned this.', recommendation: {} }, 'Mona Manager already assigned this.');
    expect(decidedElsewhere(already)).toBe('Mona Manager already assigned this.');
    expect(decidedElsewhere(new ApiError(409, {}, 'Request failed (409)'))).toBe(REC.ALREADY_DECIDED);
    expect(decidedElsewhere(new ApiError(404, { detail: 'No such recommendation.' }, 'No such recommendation.'))).toBe("This recommendation isn't there any more.");
    expect(decidedElsewhere(new ApiError(403, { code: 'CANT_DECIDE', detail: "You can't decide this recommendation." }, 'x'))).toBeNull();
    expect(decidedElsewhere(new Error('offline'))).toBeNull();
  });
});
```

Append to `src/features/work/workApi.test.ts` (add `assignRecommendation`, `dismissRecommendation`, `fetchRecommendations`, `fetchWorkSettings`, `patchWorkSettings`, `refreshRecommendations` to the existing import from `./workApi`):

```ts
describe('workApi: the delivery 2 routes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads and decides recommendations, runs the recommender, and reads and writes the settings', async () => {
    const calls = spyFetch();
    await fetchRecommendations();
    await fetchRecommendations('me');
    await assignRecommendation(5, { assignee_id: 3, due_date: '2026-10-09', title: 'Prep' });
    await dismissRecommendation(6, { reason: 'other', note: 'Handled by phone' });
    await refreshRecommendations();
    await fetchWorkSettings();
    await patchWorkSettings({ sources: { renewal_due: { days: 45 } } });
    expect(calls()).toEqual([
      { method: 'GET', path: '/work/recommendations/', body: undefined },
      { method: 'GET', path: '/work/recommendations/?scope=me', body: undefined },
      { method: 'POST', path: '/work/recommendations/5/assign/', body: { assignee_id: 3, due_date: '2026-10-09', title: 'Prep' } },
      { method: 'POST', path: '/work/recommendations/6/dismiss/', body: { reason: 'other', note: 'Handled by phone' } },
      { method: 'POST', path: '/work/recommendations/refresh/', body: undefined },
      { method: 'GET', path: '/work/settings/', body: undefined },
      { method: 'PATCH', path: '/work/settings/', body: { sources: { renewal_due: { days: 45 } } } },
    ]);
  });

  it('reads a dismiss refusal under its field', () => {
    expect(readRefusal(new ApiError(400, { note: ['Say why.'] }, 'x'), 'fallback')).toEqual({ field: { note: 'Say why.' }, form: null });
    expect(readRefusal(new ApiError(400, { reason: ['Choose already handled, not relevant, wrong person or other.'] }, 'x'), 'fallback').field.reason).toBe(
      'Choose already handled, not relevant, wrong person or other.',
    );
  });
});
```

Append to `src/components/work/taskChanges.test.tsx` (add `recommendationsChanged`, `useRecommendationChanges` to the import from `./taskChanges`):

```tsx
describe('recommendationsChanged / useRecommendationChanges (Decision 5)', () => {
  it('reaches its own listeners and never a task listener', () => {
    const recs = vi.fn();
    const tasks = vi.fn();
    const { unmount } = renderHook(() => {
      useRecommendationChanges(recs);
      useTaskChanges(tasks);
    });
    act(() => recommendationsChanged());
    expect(recs).toHaveBeenCalledTimes(1);
    expect(tasks).not.toHaveBeenCalled();
    unmount();
    act(() => recommendationsChanged());
    expect(recs).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/features/work/recommended.test.ts src/features/work/workApi.test.ts src/components/work/taskChanges.test.tsx --maxWorkers=2`
Expected: FAIL (`./recommended` does not exist; `fetchRecommendations` is not exported; `recommendationsChanged` is not exported).

- [ ] **Step 3: Append the shapes to `src/features/work/workTypes.ts`**

```ts
// Delivery 2 ("Recommended"), contract revenact-backend
// docs/superpowers/plans/2026-10-07-work-recommended-api.md.

export type RecKind = 'renewal_due' | 'health_drop' | 'urgent_tickets' | 'overdue_tasks' | 'open_questions' | 'anomaly' | 'agent';
/** In the contract's order, which the settings page follows. */
export const REC_KINDS: readonly RecKind[] = ['renewal_due', 'health_drop', 'urgent_tickets', 'overdue_tasks', 'open_questions', 'anomaly', 'agent'];
export type RecScope = 'me' | 'team';
export type RecStatus = 'open' | 'assigned' | 'dismissed' | 'expired';
export type DismissReason = 'already_handled' | 'not_relevant' | 'wrong_person' | 'other';

/** A link inside the app: `/organizations/<id>`, `/accounts/<id>`, `/brain/anomalies`. */
export interface RecEvidence {
  label: string;
  link: string;
}

/** `active: false` or `can_open: false`: that person can no longer take it. */
export interface RecSuggested extends PersonRef {
  active: boolean;
  can_open: boolean;
}

/** What Assign prefills. */
export interface RecDefaults {
  title: string;
  due_date: string;
  priority: TaskPriority;
}

/** One item of GET /work/recommendations/. */
export interface RecommendationRow {
  id: number;
  kind: RecKind;
  title: string;
  why: { facts: string[]; evidence: RecEvidence[] };
  record: TaskParent;
  /** Null when nobody could be suggested (a fallback recipient has it). */
  suggested_assignee: RecSuggested | null;
  recipient: PersonRef;
  defaults: RecDefaults;
  /** The AI agent's proposal id for `kind: 'agent'`. */
  proposal: number | null;
  created_at: string;
}

/** At most 100 `items`, newest first; `count` is the full total; `hidden`
 *  counts those about records the reader cannot open. */
export interface RecommendationsPayload {
  scope: RecScope;
  items: RecommendationRow[];
  count: number;
  hidden: number;
}

export interface DecidedRecommendation {
  id: number;
  status: RecStatus;
  decided_by: PersonRef | null;
  decided_at: string | null;
  task_id: number | null;
  dismiss_reason: DismissReason | '';
  dismiss_note: string;
}

export interface AssignBody {
  assignee_id: number;
  due_date?: string;
  title?: string;
  priority?: TaskPriority;
}

export interface AssignAnswer {
  recommendation: DecidedRecommendation;
  task: TaskRow;
}

export interface DismissBody {
  reason: DismissReason;
  /** Required with `other`, ignored otherwise. */
  note?: string;
}

export interface DismissAnswer {
  recommendation: DecidedRecommendation;
}

/** POST /work/recommendations/refresh/ ("Run now"). */
export interface RefreshResult {
  created: number;
  updated: number;
  expired: number;
  unrouted: number;
  notified: number;
  /** The sources that failed this run, by kind. */
  failed: string[];
}

export type RecommendTo = 'manager' | 'owner';
export type SourceField = 'days' | 'drop' | 'window_days' | 'min';

export interface SourceSettings {
  enabled: boolean;
  days?: number;
  drop?: number;
  window_days?: number;
  min?: number;
}

/** GET /work/settings/. Delivery 3 adds fields; unknown keys are ignored. */
export interface WorkSettings {
  recommend_to: RecommendTo;
  sources: Record<RecKind, SourceSettings>;
  dismiss_cooldown_days: number;
  can_edit: boolean;
}

/** PATCH /work/settings/: any field, and inside `sources` any kind and field. */
export interface WorkSettingsPatch {
  recommend_to?: RecommendTo;
  sources?: Partial<Record<RecKind, Partial<SourceSettings>>>;
  dismiss_cooldown_days?: number;
}
```

- [ ] **Step 4: Add the calls to `src/features/work/workApi.ts`**

Replace the type import at the top with:

```ts
import type {
  AssignAnswer,
  AssignBody,
  AssigneesPayload,
  DismissAnswer,
  DismissBody,
  DrillPayload,
  DrillState,
  NewTaskBody,
  RecScope,
  RecommendationsPayload,
  RefreshResult,
  TaskDetail,
  TaskEvent,
  TaskParentRef,
  TaskPatch,
  TeamPayload,
  TodayPayload,
  WorkSettings,
  WorkSettingsPatch,
} from './workTypes';
```

After `createWorkTask`, add:

```ts
// Delivery 2 (contract 2026-10-07-work-recommended-api.md).
/** No `scope`: the server's default (team for readers with reports or view-all, else me). */
export const fetchRecommendations = (scope: RecScope | null = null) =>
  apiFetch<RecommendationsPayload>(scope ? `/work/recommendations/?${query({ scope })}` : '/work/recommendations/');
export const assignRecommendation = (id: number, body: AssignBody) =>
  apiFetch<AssignAnswer>(`/work/recommendations/${id}/assign/`, { method: 'POST', body });
export const dismissRecommendation = (id: number, body: DismissBody) =>
  apiFetch<DismissAnswer>(`/work/recommendations/${id}/dismiss/`, { method: 'POST', body });
export const refreshRecommendations = () => apiFetch<RefreshResult>('/work/recommendations/refresh/', { method: 'POST' });
export const fetchWorkSettings = () => apiFetch<WorkSettings>('/work/settings/');
export const patchWorkSettings = (patch: WorkSettingsPatch) => apiFetch<WorkSettings>('/work/settings/', { method: 'PATCH', body: patch });
```

Replace the two `RefusalField` lines with:

```ts
export type RefusalField = 'title' | 'description' | 'status' | 'blocked_reason' | 'due_date' | 'priority' | 'assignee_id' | 'body' | 'reason' | 'note';
const FIELDS: readonly RefusalField[] = ['title', 'description', 'status', 'blocked_reason', 'due_date', 'priority', 'assignee_id', 'body', 'reason', 'note'];
```

- [ ] **Step 5: Create `src/features/work/recommended.ts`**

```ts
// Recommended's words and rules (spec §2.4; delivery 2 contract), kept free
// of React so they are unit-tested on their own. Sentence case, no em dash.
import { ApiError } from '../../lib/apiClient';
import type { ScopeOption } from '../brain/brainTypes';
import { WORK, isDueDate } from './workText';
import type { AssigneeOption, DismissReason, RecKind, RecScope, RecommendationRow, RecommendationsPayload, TaskPerson } from './workTypes';

export const REC = {
  LOAD: 'Could not load recommendations.',
  EMPTY_TITLE: 'Nothing to decide',
  EMPTY_DETAIL: 'Revenact recommends work here when a renewal nears, health drops or tickets pile up.',
  ASSIGN: 'Assign',
  ASSIGN_TASK: 'Assign task',
  ASSIGNING: 'Assigning…',
  DISMISS: 'Dismiss',
  DISMISSING: 'Dismissing…',
  CANCEL: 'Cancel',
  WHO: 'Who does it',
  DUE: 'Due date',
  TITLE: 'Task title',
  REASON: 'Reason',
  CHOOSE_REASON: 'Choose a reason',
  NOTE: 'Say why',
  WHY: 'Why',
  EVIDENCE: 'Evidence',
  OPEN_TASK: 'Open task',
  GONE: "This recommendation isn't there any more.",
  ALREADY_DECIDED: 'Someone already decided this.',
  ASSIGN_FAILED: 'Could not assign that. Try again.',
  DISMISS_FAILED: 'Could not dismiss that. Try again.',
  PERSON_REQUIRED: 'Choose who does it.',
  REASON_REQUIRED: 'Choose a reason.',
  NOTE_REQUIRED: 'Say why.',
  NOTE_TOO_LONG: 'Keep the note under 255 characters.',
  TITLE_TOO_LONG: 'Keep the title under 255 characters.',
} as const;

/** Me · My team (Decision 3): Recommended has no Company. */
export const REC_SCOPES: ScopeOption[] = [
  { key: 'me', label: 'Me' },
  { key: 'team', label: 'My team' },
];

export const KIND_LABEL: Record<RecKind, string> = {
  renewal_due: 'Renewal',
  health_drop: 'Health drop',
  urgent_tickets: 'Urgent tickets',
  overdue_tasks: 'Overdue tasks',
  open_questions: 'Open questions',
  anomaly: 'Anomaly',
  agent: 'AI agent',
};

/** Spec §2.3's four reasons, in its order. */
export const DISMISS_REASONS: { value: DismissReason; label: string }[] = [
  { value: 'already_handled', label: 'Already handled' },
  { value: 'not_relevant', label: 'Not relevant' },
  { value: 'wrong_person', label: 'Wrong person' },
  { value: 'other', label: 'Other' },
];

const LONGEST = 255;

export function isRecScope(value: string | null): value is RecScope {
  return value === 'me' || value === 'team';
}

const TITLES: Record<RecScope, string> = { me: 'Yours to decide', team: "Yours and your team's" };
export const recTitle = (scope: RecScope): string => TITLES[scope];

export function hiddenRecText(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 more about an account you can't open" : `${n} more about accounts you can't open`;
}

export function suggestedText(rec: RecommendationRow, me: number | null): string {
  const person = rec.suggested_assignee;
  if (!person) return 'Nobody suggested';
  if (person.id === me) return 'Suggested for you';
  if (!person.active) return `Suggested for ${person.name} (no longer active)`;
  if (!person.can_open) return `Suggested for ${person.name}, who can't open it now`;
  return `Suggested for ${person.name}`;
}

/** Whose queue it is in, when that is not the reader's. */
export function queueText(rec: RecommendationRow, me: number | null): string | null {
  return rec.recipient.id === me ? null : `In ${rec.recipient.name}'s queue`;
}

/** The contract: `active: false` or `can_open: false` is not prefilled. */
export function prefillAssignee(rec: RecommendationRow): number | null {
  const person = rec.suggested_assignee;
  return person && person.active && person.can_open ? person.id : null;
}

/** A choice the picker still offers enabled; kept as is while the list loads. */
export function pickable(people: AssigneeOption[] | null, id: number | null): number | null {
  if (id === null || people === null) return id;
  return people.some((person) => person.id === id && person.can_open) ? id : null;
}

export type AssignErrors = Partial<Record<'assignee_id' | 'due_date' | 'title', string>>;
export type DismissErrors = Partial<Record<'reason' | 'note', string>>;

export function validateAssign(form: { assignee: number | null; due: string; title: string }): AssignErrors {
  const errors: AssignErrors = {};
  if (form.assignee === null) errors.assignee_id = REC.PERSON_REQUIRED;
  if (!isDueDate(form.due)) errors.due_date = WORK.DATE_REQUIRED;
  const title = form.title.trim();
  if (!title) errors.title = WORK.TITLE_REQUIRED;
  else if (title.length > LONGEST) errors.title = REC.TITLE_TOO_LONG;
  return errors;
}

export function validateDismiss(reason: DismissReason | '', note: string): DismissErrors {
  if (reason === '') return { reason: REC.REASON_REQUIRED };
  if (reason !== 'other') return {};
  const text = note.trim();
  if (!text) return { note: REC.NOTE_REQUIRED };
  return text.length > LONGEST ? { note: REC.NOTE_TOO_LONG } : {};
}

export function assignedStatus(title: string, assignee: TaskPerson | null, me: number | null): string {
  const who = !assignee ? 'nobody' : assignee.id === me ? 'you' : assignee.name;
  return `Assigned to ${who}: ${title}.`;
}

export const dismissedStatus = (title: string): string => `Dismissed: ${title}.`;

export function withoutRec(payload: RecommendationsPayload, id: number): RecommendationsPayload {
  const items = payload.items.filter((item) => item.id !== id);
  const removed = payload.items.length - items.length;
  return { ...payload, items, count: Math.max(0, payload.count - removed) };
}

/** A decision that can no longer happen (Decision 9): a 409 ALREADY_DECIDED
 *  with the server's own sentence ("Mona Manager already assigned this."),
 *  or a 404 (gone, or a record the reader can no longer open). Null for
 *  every other failure, which stays in the form. */
export function decidedElsewhere(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 404) return REC.GONE;
  if (err.status !== 409) return null;
  const body = err.body;
  const detail = body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).detail : undefined;
  return typeof detail === 'string' && detail ? detail : REC.ALREADY_DECIDED;
}

/** The words after "Work, " in the sidebar item's name (Decision 4). */
export function workBadgeName(overdue: number, waiting: number): string {
  const parts: string[] = [];
  if (overdue > 0) parts.push(`${overdue} overdue`);
  if (waiting > 0) parts.push(`${waiting} recommended`);
  return parts.join(', ');
}
```

- [ ] **Step 6: Append the fixtures to `src/features/work/testWorkFixtures.ts`**

Change the type import line to:

```ts
import type { AssigneeOption, PersonRef, RecommendationRow, TaskDetail, TaskEvent, TaskParent, TaskPerson, WorkSettings } from './workTypes';
```

Append:

```ts
/** A recommendation as GET /work/recommendations/ lists it: on Pizza Hut,
 *  suggested for Carl, in Alice's queue, unless `over` says otherwise. */
export function recRow(over: Partial<RecommendationRow> & Pick<RecommendationRow, 'id' | 'kind' | 'title'>): RecommendationRow {
  const record = over.record ?? PIZZA;
  return {
    why: { facts: [], evidence: [{ label: record.name, link: record.kind === 'customer' ? `/organizations/${record.id}` : `/accounts/${record.id}` }] },
    record,
    suggested_assignee: { ...refOf(CARL), active: true, can_open: true },
    recipient: refOf(ALICE),
    defaults: { title: over.title, due_date: '2026-10-12', priority: 'high' },
    proposal: null,
    created_at: NOW,
    ...over,
  };
}

/** In Alice's queue, suggested for Carl, who can open Pizza Hut. */
export const REC_RENEWAL = recRow({
  id: 5,
  kind: 'renewal_due',
  title: "Prepare Pizza Hut's renewal",
  why: { facts: ['Renews in 9 days', 'Renewal date 16 Oct'], evidence: [{ label: 'Pizza Hut', link: '/organizations/7' }] },
  defaults: { title: "Prepare Pizza Hut's renewal", due_date: '2026-10-09', priority: 'high' },
  created_at: '2026-10-07T00:05:00.000000Z',
});

/** In Alice's queue, suggested for Dana, who can no longer open Uber EMEA. */
export const REC_TICKETS = recRow({
  id: 6,
  kind: 'urgent_tickets',
  title: "Get Uber EMEA's urgent tickets moving",
  record: UBER,
  why: { facts: ['3 urgent tickets open', 'Oldest opened 6 days ago'], evidence: [{ label: 'Uber EMEA', link: '/accounts/9' }] },
  suggested_assignee: { ...refOf(DANA), active: true, can_open: false },
  defaults: { title: "Get Uber EMEA's urgent tickets moving", due_date: '2026-10-12', priority: 'high' },
  created_at: '2026-10-06T00:05:00.000000Z',
});

/** The AI agent's proposal 22, in Carl's own queue: Alice decides it as his manager. */
export const REC_AGENT = recRow({
  id: 7,
  kind: 'agent',
  title: 'Send the renewal pricing',
  why: { facts: ['Proposed by the AI agent', 'The agent suggested Carl CSM'], evidence: [{ label: 'Pizza Hut', link: '/organizations/7' }] },
  recipient: refOf(CARL),
  defaults: { title: 'Send the renewal pricing', due_date: '2026-10-14', priority: 'medium' },
  proposal: 22,
  created_at: '2026-10-05T00:05:00.000000Z',
});

export const RECOMMENDATIONS: RecommendationRow[] = [REC_RENEWAL, REC_TICKETS, REC_AGENT];

/** GET /work/settings/ with the spec §2.1 defaults, for an admin. */
export const WORK_SETTINGS: WorkSettings = {
  recommend_to: 'manager',
  sources: {
    renewal_due: { enabled: true, days: 30 },
    health_drop: { enabled: true, drop: 0.5, window_days: 14 },
    urgent_tickets: { enabled: true, min: 1 },
    overdue_tasks: { enabled: true, days: 2 },
    open_questions: { enabled: true, days: 3 },
    anomaly: { enabled: true },
    agent: { enabled: true },
  },
  dismiss_cooldown_days: 14,
  can_edit: true,
};
```

- [ ] **Step 7: Replace `src/components/work/taskChanges.ts`**

```ts
import { useEffect, useRef } from 'react';
import { refreshWaitingCount } from '../brain/useWaitingCount';

const tasks = new EventTarget();
const recommendations = new EventTarget();

/** A task changed (the panel saved, a row was marked done, a task was made,
 *  a recommendation was decided on Recommended): every list that shows
 *  tasks reads again, and so does Brain's badge. */
export function taskChanged(): void {
  tasks.dispatchEvent(new Event('change'));
  refreshWaitingCount();
}

/** The recommendations waiting changed where no task did (Brain decided an
 *  AI-agent proposal; Run now): only the recommendation readers read again
 *  (Decision 5), so Brain's desk does not re-read after its own decision. */
export function recommendationsChanged(): void {
  recommendations.dispatchEvent(new Event('change'));
}

function useEvent(target: EventTarget, onChange: () => void): void {
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  }, [onChange]);
  useEffect(() => {
    const run = () => latest.current();
    target.addEventListener('change', run);
    return () => target.removeEventListener('change', run);
  }, [target]);
}

/** Runs the latest `onChange` after every `taskChanged()` while mounted. */
export function useTaskChanges(onChange: () => void): void {
  useEvent(tasks, onChange);
}

/** Runs the latest `onChange` after every `recommendationsChanged()` while mounted. */
export function useRecommendationChanges(onChange: () => void): void {
  useEvent(recommendations, onChange);
}
```

- [ ] **Step 8: Run the tests and make sure they pass**

Run: `npx vitest run src/features/work src/components/work/taskChanges.test.tsx --maxWorkers=2`
Expected: PASS (delivery 1's tests in `src/features/work` still pass).

- [ ] **Step 9: Commit**

```bash
git add src/features/work/workTypes.ts src/features/work/workApi.ts src/features/work/recommended.ts src/features/work/recommended.test.ts src/features/work/workApi.test.ts src/features/work/testWorkFixtures.ts src/components/work/taskChanges.ts src/components/work/taskChanges.test.tsx
git commit -m "feat(work): recommendation shapes, calls, words and a second change event

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 2: The stub answers the recommendation and settings routes

**Files:**
- Modify: `src/features/work/testWork.ts`
- Test: `src/features/work/testWork.test.ts` (append)

**Interfaces:**
- Consumes: Task 1's types and fixtures (`RECOMMENDATIONS`, `WORK_SETTINGS`); delivery 1's stub internals (`json`, `DOWN`, `reader`, `me`, `members`, `viewAll`, `isAbove`, `assignees`, `tasks`, `nextTask`, `nextEvent`, `rowOf`, `taskDetail`, `taskEvent`, `PRIORITIES`).
- Produces: `stubWork(stub)` additionally accepts `recommendations?: RecommendationRow[]`, `recHidden?: Partial<Record<RecScope, number>>`, `failRecommendations?: number`, `refuseNextDecision?: { status: number; body: unknown }`, `workSettings?: WorkSettings`, `failSettings?: number`, `refuseNextSettings?: { status: number; body: unknown }`, `refreshResult?: RefreshResult`, and returns `{ spy, tasks, recommendations: Map<number, RecState>, settings: WorkSettings }`, where `RecState = { row: RecommendationRow; decided: DecidedRecommendation }` (exported). A test changes `recommendations.get(id)!.decided` to play someone deciding first.

- [ ] **Step 1: Write the failing tests**

In `src/features/work/testWork.test.ts`, change the fixture import to `import { CALL_PIZZA, CARL, WORK_SETTINGS } from './testWorkFixtures';` and the type import to `import type { AssignAnswer, RecommendationsPayload, TaskDetail, TeamPayload, TodayPayload, WorkSettings } from './workTypes';`, then append:

```ts
const post = (path: string, body?: unknown) => get(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

describe('stubWork: delivery 2 (contract 2026-10-07-work-recommended-api.md)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists what the reader may decide, newest first: team by default for a manager, me for a member', async () => {
    stubWork({ recHidden: { team: 2 } });
    const team = (await get('/work/recommendations/')).body as RecommendationsPayload;
    expect([team.scope, team.items.map((r) => r.id), team.count, team.hidden]).toEqual(['team', [5, 6, 7], 3, 2]);
    const mine = (await get('/work/recommendations/?scope=me')).body as RecommendationsPayload;
    expect([mine.scope, mine.items.map((r) => r.id), mine.hidden]).toEqual(['me', [5, 6], 0]);
    expect((await get('/work/recommendations/?scope=company')).body).toEqual({ code: 'SCOPE_UNKNOWN', detail: 'Choose me or team.' });
    vi.unstubAllGlobals();
    stubWork({ reader: CARL });
    const carl = (await get('/work/recommendations/')).body as RecommendationsPayload;
    expect([carl.scope, carl.items.map((r) => r.id)]).toEqual(['me', [7]]);
  });

  it('assigns: refusals in the contract order, then one task and a decided recommendation; deciding again is a 409', async () => {
    const { tasks } = stubWork();
    expect((await post('/work/recommendations/99/assign/', { assignee_id: 3 })).status).toBe(404);
    expect((await post('/work/recommendations/5/assign/', {})).body).toEqual({ assignee_id: ['Choose who does it.'] });
    expect((await post('/work/recommendations/5/assign/', { assignee_id: 4 })).body).toEqual({
      code: 'ASSIGNEE_CANNOT_OPEN',
      detail: "That person can't open this organisation.",
    });
    const { status, body } = await post('/work/recommendations/5/assign/', { assignee_id: 1, due_date: '2026-10-06' });
    expect(status).toBe(201);
    const answer = body as AssignAnswer;
    expect(answer.recommendation).toMatchObject({ id: 5, status: 'assigned', decided_by: { id: 1, name: 'Alice' }, task_id: answer.task.id });
    expect(answer.task).toMatchObject({
      title: "Prepare Pizza Hut's renewal",
      due_date: '2026-10-06',
      priority: 'high',
      source: 'recommendation',
      assignee: { id: 1, name: 'Alice', active: true },
    });
    const task = tasks.get(answer.task.id)!;
    expect(task.description).toBe('Recommended by Revenact:\n- Renews in 9 days\n- Renewal date 16 Oct');
    expect(task.events.map((event) => event.kind)).toEqual(['created', 'recommended']);
    expect((await post('/work/recommendations/5/dismiss/', { reason: 'not_relevant' })).body).toEqual({
      code: 'ALREADY_DECIDED',
      detail: 'Alice already assigned this.',
      recommendation: answer.recommendation,
    });
    expect(((await get('/work/recommendations/')).body as RecommendationsPayload).items.map((r) => r.id)).toEqual([6, 7]);
  });

  it('refuses a reader who may not decide before reading the body (CANT_DECIDE)', async () => {
    stubWork({ reader: CARL });
    expect((await post('/work/recommendations/5/assign/', {})).body).toEqual({ code: 'CANT_DECIDE', detail: "You can't decide this recommendation." });
  });

  it('dismisses with a reason, and Other only with a note', async () => {
    const { recommendations } = stubWork();
    expect((await post('/work/recommendations/6/dismiss/', {})).body).toEqual({ reason: ['Choose already handled, not relevant, wrong person or other.'] });
    expect((await post('/work/recommendations/6/dismiss/', { reason: 'other', note: ' ' })).body).toEqual({ note: ['Say why.'] });
    const { body } = await post('/work/recommendations/6/dismiss/', { reason: 'other', note: 'Handled by phone' });
    expect((body as { recommendation: unknown }).recommendation).toMatchObject({ status: 'dismissed', dismiss_reason: 'other', dismiss_note: 'Handled by phone' });
    expect(recommendations.get(6)!.decided.status).toBe('dismissed');
  });

  it('reads and saves the settings within the contract limits; a member reads but neither saves nor runs', async () => {
    const { settings } = stubWork();
    expect(((await get('/work/settings/')).body as WorkSettings).sources.renewal_due).toEqual({ enabled: true, days: 30 });
    expect((await patch('/work/settings/', { sources: { renewal_due: { days: 121 } } })).body).toEqual({
      sources: { renewal_due: { days: ['Choose a whole number from 1 to 120.'] } },
    });
    expect((await patch('/work/settings/', { sources: { health_drop: { drop: 0 } }, dismiss_cooldown_days: -1 })).body).toEqual({
      dismiss_cooldown_days: ['Choose a whole number from 0 to 120.'],
      sources: { health_drop: { drop: ['Choose a number from 0.1 to 5.'] } },
    });
    const saved = (await patch('/work/settings/', { recommend_to: 'owner', sources: { health_drop: { enabled: false, drop: 1.25 } } })).body as WorkSettings;
    expect(saved.recommend_to).toBe('owner');
    expect(saved.sources.health_drop).toEqual({ enabled: false, drop: 1.3, window_days: 14 });
    expect(settings.recommend_to).toBe('owner');
    expect((await post('/work/recommendations/refresh/')).body).toEqual({ created: 2, updated: 5, expired: 1, unrouted: 0, notified: 2, failed: [] });
    vi.unstubAllGlobals();
    stubWork({ workSettings: { ...WORK_SETTINGS, can_edit: false } });
    expect((await patch('/work/settings/', { recommend_to: 'owner' })).status).toBe(403);
    expect((await post('/work/recommendations/refresh/')).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/features/work/testWork.test.ts --maxWorkers=2`
Expected: FAIL (the new routes answer `404 {detail: 'Not found.'}`).

- [ ] **Step 3: Extend `src/features/work/testWork.ts`**

Add to the header comment, after its last paragraph:

```ts
//
// Delivery 2: GET /work/recommendations/ (me: the reader is the recipient;
// team: everything they may decide, which is the recipient, anyone above the
// suggested person, or `viewAll`, here standing for view_all_accounts), the
// assign and dismiss decisions in the contract's refusal order (404, 403
// CANT_DECIDE, 400 fields, 409 ALREADY_DECIDED, 400 ASSIGNEE_CANNOT_OPEN),
// Run now, and GET/PATCH /work/settings/ with the contract's limits.
```

Replace the two import lines with:

```ts
import { ASSIGNEES, MEMBERS, NOW, RECOMMENDATIONS, RECORDS, TEAM_PEOPLE, TODAY, ALICE, WORK_SETTINGS, refOf, taskDetail, taskEvent, WORK_TASKS } from './testWorkFixtures';
import type {
  AssigneeOption,
  DecidedRecommendation,
  DismissReason,
  RecKind,
  RecScope,
  RecommendationRow,
  RefreshResult,
  SourceSettings,
  TaskDetail,
  TaskPerson,
  TaskRow,
  TaskStatus,
  TeamPerson,
  TodayGroup,
  WorkSettings,
} from './workTypes';
```

Add these members to `interface WorkStub`, before `passThrough`:

```ts
  /** The recommendations, all open. Default RECOMMENDATIONS (copied). */
  recommendations?: RecommendationRow[];
  /** GET /work/recommendations/'s `hidden` by scope. Default 0. */
  recHidden?: Partial<Record<RecScope, number>>;
  /** How many reads of GET /work/recommendations/ fail (500) first. */
  failRecommendations?: number;
  /** The next assign or dismiss the reader may make answers this instead, once. */
  refuseNextDecision?: { status: number; body: unknown };
  /** GET /work/settings/. Default WORK_SETTINGS (copied); `can_edit: false` is a member. */
  workSettings?: WorkSettings;
  /** How many reads of GET /work/settings/ fail (500) first. */
  failSettings?: number;
  /** The next PATCH /work/settings/ answers this instead, once. */
  refuseNextSettings?: { status: number; body: unknown };
  /** POST /work/recommendations/refresh/'s answer. */
  refreshResult?: RefreshResult;
```

Below `interface ChainMember`, add:

```ts
/** One recommendation as the stub keeps it: the row as listed, and its outcome. */
export interface RecState {
  row: RecommendationRow;
  decided: DecidedRecommendation;
}

const NO_SETTINGS = "You don't have permission to change organisation settings.";
const DISMISS_CODES: readonly DismissReason[] = ['already_handled', 'not_relevant', 'wrong_person', 'other'];
const SOURCE_FIELDS: Record<RecKind, readonly string[]> = {
  renewal_due: ['days'],
  health_drop: ['drop', 'window_days'],
  urgent_tickets: ['min'],
  overdue_tasks: ['days'],
  open_questions: ['days'],
  anomaly: [],
  agent: [],
};
const LIMITS: Record<string, { lo: number; hi: number; whole: boolean }> = {
  days: { lo: 1, hi: 120, whole: true },
  window_days: { lo: 1, hi: 120, whole: true },
  min: { lo: 1, hi: 50, whole: true },
  drop: { lo: 0.1, hi: 5, whole: false },
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const inRange = (value: unknown, lo: number, hi: number, whole: boolean) =>
  typeof value === 'number' && value >= lo && value <= hi && (!whole || Number.isInteger(value));
const openDecision = (id: number): DecidedRecommendation => ({
  id,
  status: 'open',
  decided_by: null,
  decided_at: null,
  task_id: null,
  dismiss_reason: '',
  dismiss_note: '',
});

function alreadyText(decided: DecidedRecommendation): string {
  if (decided.status === 'expired') return 'This recommendation has expired.';
  return `${decided.decided_by?.name ?? 'Someone'} already ${decided.status} this.`;
}

/** PATCH /work/settings/'s 400 body, or null when the body is fine. */
function settingsRefusal(body: unknown): Record<string, unknown> | null {
  if (!isObject(body)) return { non_field_errors: ['Send the fields as one object.'] };
  const errors: Record<string, unknown> = {};
  if ('recommend_to' in body && body.recommend_to !== 'manager' && body.recommend_to !== 'owner') errors.recommend_to = ['Choose manager or owner.'];
  if ('dismiss_cooldown_days' in body && !inRange(body.dismiss_cooldown_days, 0, 120, true)) {
    errors.dismiss_cooldown_days = ['Choose a whole number from 0 to 120.'];
  }
  if ('sources' in body) {
    if (!isObject(body.sources)) errors.sources = ['Send the sources as one object.'];
    else {
      const sources: Record<string, unknown> = {};
      for (const [kind, change] of Object.entries(body.sources)) {
        if (!(kind in SOURCE_FIELDS)) {
          sources[kind] = ['Unknown source.'];
          continue;
        }
        if (!isObject(change)) {
          sources[kind] = ["Send each source's settings as one object."];
          continue;
        }
        const fields: Record<string, string[]> = {};
        for (const [field, value] of Object.entries(change)) {
          if (field === 'enabled') {
            if (typeof value !== 'boolean') fields.enabled = ['Choose on or off.'];
          } else if (!SOURCE_FIELDS[kind as RecKind].includes(field)) {
            fields[field] = ['Unknown setting.'];
          } else {
            const { lo, hi, whole } = LIMITS[field];
            if (!inRange(value, lo, hi, whole)) fields[field] = [whole ? `Choose a whole number from ${lo} to ${hi}.` : `Choose a number from ${lo} to ${hi}.`];
          }
        }
        if (Object.keys(fields).length > 0) sources[kind] = fields;
      }
      if (Object.keys(sources).length > 0) errors.sources = sources;
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
}
```

Inside `stubWork`, after `let nextEvent = 9000;`, add:

```ts
  const recommendations = new Map<number, RecState>(
    (stub.recommendations ?? RECOMMENDATIONS).map((row) => [row.id, { row: JSON.parse(JSON.stringify(row)) as RecommendationRow, decided: openDecision(row.id) }]),
  );
  const settings: WorkSettings = JSON.parse(JSON.stringify(stub.workSettings ?? WORK_SETTINGS));
  let failRecommendations = stub.failRecommendations ?? 0;
  let failSettings = stub.failSettings ?? 0;
  let refuseDecision = stub.refuseNextDecision ?? null;
  let refuseSettings = stub.refuseNextSettings ?? null;
  const hasReports = members.some((person) => person.reports_to?.id === reader.id);
```

After the `today()`/`team()` helpers (before `function write`), add:

```ts
  /** Contract: its recipient, anyone above its suggested person, or view-all. */
  function mayDecide(row: RecommendationRow): boolean {
    if (viewAll || row.recipient.id === reader.id) return true;
    const person = row.suggested_assignee;
    return person !== null && person.id !== reader.id && isAbove(reader.id, person.id);
  }

  function recList(scope: RecScope) {
    const open = [...recommendations.values()]
      .filter((state) => state.decided.status === 'open')
      .map((state) => state.row)
      .filter((row) => (scope === 'me' ? row.recipient.id === reader.id : mayDecide(row)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
    return { scope, items: open.slice(0, 100), count: open.length, hidden: stub.recHidden?.[scope] ?? 0 };
  }

  function decide(id: number, action: 'assign' | 'dismiss', body: unknown) {
    const state = recommendations.get(id);
    if (!state) return json(404, { detail: 'No such recommendation.' });
    const { row } = state;
    if (!mayDecide(row)) return json(403, { code: 'CANT_DECIDE', detail: "You can't decide this recommendation." });
    if (refuseDecision) {
      const answer = refuseDecision;
      refuseDecision = null;
      return json(answer.status, answer.body);
    }
    const asked: Record<string, unknown> = isObject(body) ? body : {};
    if (action === 'assign') {
      if (typeof asked.assignee_id !== 'number') return json(400, { assignee_id: ['Choose who does it.'] });
      if ('due_date' in asked && !/^\d{4}-\d{2}-\d{2}$/.test(String(asked.due_date))) return json(400, { due_date: ['Choose a date.'] });
      if ('title' in asked) {
        const title = String(asked.title ?? '').trim();
        if (!title) return json(400, { title: ['Give the task a title.'] });
        if (title.length > 255) return json(400, { title: ['Keep the title under 255 characters.'] });
      }
      if ('priority' in asked && !PRIORITIES.includes(String(asked.priority))) return json(400, { priority: ['Choose high, medium or low.'] });
    } else {
      if (!DISMISS_CODES.includes(asked.reason as DismissReason)) {
        return json(400, { reason: ['Choose already handled, not relevant, wrong person or other.'] });
      }
      if (asked.reason === 'other') {
        const note = String(asked.note ?? '').trim();
        if (!note) return json(400, { note: ['Say why.'] });
        if (note.length > 255) return json(400, { note: ['Keep the note under 255 characters.'] });
      }
    }
    if (state.decided.status !== 'open') {
      return json(409, { code: 'ALREADY_DECIDED', detail: alreadyText(state.decided), recommendation: state.decided });
    }
    if (action === 'dismiss') {
      const reason = asked.reason as DismissReason;
      state.decided = {
        ...state.decided,
        status: 'dismissed',
        decided_by: me,
        decided_at: NOW,
        dismiss_reason: reason,
        dismiss_note: reason === 'other' ? String(asked.note).trim() : '',
      };
      return json(200, { recommendation: state.decided });
    }
    const person = assignees.find((option) => option.id === asked.assignee_id);
    if (!person || !person.can_open) {
      return json(400, { code: 'ASSIGNEE_CANNOT_OPEN', detail: `That person can't open this ${row.record.kind === 'customer' ? 'organisation' : 'account'}.` });
    }
    const source = row.kind === 'agent' ? ('agent' as const) : ('recommendation' as const);
    const facts = row.why.facts;
    const task = taskDetail({
      id: nextTask++,
      title: typeof asked.title === 'string' ? asked.title.trim() : row.defaults.title,
      due_date: typeof asked.due_date === 'string' ? asked.due_date : row.defaults.due_date,
      priority: typeof asked.priority === 'string' ? (asked.priority as TaskDetail['priority']) : row.defaults.priority,
      parent: row.record,
      assignee: { id: person.id, name: person.name, active: true },
      created_by: me,
      created_at: NOW,
      source,
      description: `Recommended by Revenact:\n${facts.map((fact) => `- ${fact}`).join('\n')}`,
      events: [
        taskEvent(nextEvent++, 'created', me, {
          source,
          assignee: { id: person.id, name: person.name },
          recommendation: row.id,
          ...(row.proposal ? { proposal: row.proposal } : {}),
        }),
        taskEvent(nextEvent++, 'recommended', null, { facts }),
      ],
    });
    tasks.set(task.id, task);
    state.decided = { ...state.decided, status: 'assigned', decided_by: me, decided_at: NOW, task_id: task.id };
    return json(201, { recommendation: state.decided, task: rowOf(task) });
  }

  function saveSettings(body: unknown) {
    if (!settings.can_edit) return json(403, { detail: NO_SETTINGS });
    if (refuseSettings) {
      const answer = refuseSettings;
      refuseSettings = null;
      return json(answer.status, answer.body);
    }
    const refusal = settingsRefusal(body);
    if (refusal) return json(400, refusal);
    const asked = body as Record<string, unknown>;
    if (asked.recommend_to === 'manager' || asked.recommend_to === 'owner') settings.recommend_to = asked.recommend_to;
    if (typeof asked.dismiss_cooldown_days === 'number') settings.dismiss_cooldown_days = asked.dismiss_cooldown_days;
    if (isObject(asked.sources)) {
      for (const [kind, change] of Object.entries(asked.sources)) {
        const next = { ...settings.sources[kind as RecKind], ...(change as Partial<SourceSettings>) };
        if (typeof next.drop === 'number') next.drop = Math.round(next.drop * 10) / 10;
        settings.sources[kind as RecKind] = next;
      }
    }
    return json(200, settings);
  }
```

In the `spy`, before `const detail = /^\/tasks\/(\d+)\/$/.exec(path);`, add:

```ts
    if (method === 'GET' && path === '/work/recommendations/') {
      const asked = url.searchParams.get('scope');
      if (asked !== null && asked !== 'me' && asked !== 'team') return json(400, { code: 'SCOPE_UNKNOWN', detail: 'Choose me or team.' });
      if (failRecommendations > 0) {
        failRecommendations -= 1;
        return json(500, DOWN);
      }
      return json(200, recList((asked as RecScope | null) ?? (hasReports || viewAll ? 'team' : 'me')));
    }
    if (method === 'POST' && path === '/work/recommendations/refresh/') {
      if (!settings.can_edit) return json(403, { detail: NO_SETTINGS });
      return json(200, stub.refreshResult ?? { created: 2, updated: 5, expired: 1, unrouted: 0, notified: 2, failed: [] });
    }
    const decision = /^\/work\/recommendations\/(\d+)\/(assign|dismiss)\/$/.exec(path);
    if (decision && method === 'POST') return decide(Number(decision[1]), decision[2] as 'assign' | 'dismiss', body);
    if (path === '/work/settings/' && method === 'GET') {
      if (failSettings > 0) {
        failSettings -= 1;
        return json(500, DOWN);
      }
      return json(200, settings);
    }
    if (path === '/work/settings/' && method === 'PATCH') return saveSettings(body);
```

Change the last line of `stubWork` to:

```ts
  return { spy, tasks, recommendations, settings };
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run src/features/work --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/work/testWork.ts src/features/work/testWork.test.ts
git commit -m "test(work): the stub answers recommendations, decisions, Run now and settings

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The badge counts recommendations waiting

**Files:**
- Create: `src/components/work/useRefreshTick.ts`, `src/components/work/useRecommendedCount.ts`
- Modify: `src/components/work/useWorkCount.ts`, `src/components/layout/Sidebar.tsx:313-331` (`WorkNavItem`) and `NavItem` (its props and `name`)
- Test: `src/components/work/useWorkCount.test.tsx` (replace)

**Interfaces:**
- Consumes: `fetchToday`, `fetchRecommendations` (Task 1), `useTaskChanges`, `useRecommendationChanges` (Task 1), `workBadgeName` (Task 1), `stubWork` (Task 2), `renderWork` (`src/pages/work/testPages.tsx`).
- Produces: `useRefreshTick(): number`; `useRecommendedCount(userId: number | null): number | null`; `useWorkCount(userId: number | null): WorkCount` with `interface WorkCount { overdue: number | null; waiting: number | null }`; `NavItem`'s new optional prop `badgeName?: string`.

- [ ] **Step 1: Write the failing tests**

Replace `src/components/work/useWorkCount.test.tsx`:

```tsx
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { calls, stubWork } from '../../features/work/testWork';
import { renderWork } from '../../pages/work/testPages';
import { resetViewport } from '../../test/viewport';
import { recommendationsChanged, taskChanged } from './taskChanges';
import { useWorkCount } from './useWorkCount';

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/work/today']}>{children}</MemoryRouter>;

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
});

describe('useWorkCount (the sidebar badge, Decision 4)', () => {
  it('reads my overdue count and the recommendations waiting, and both again after a task changes', async () => {
    const { spy, tasks } = stubWork();
    const { result } = renderHook(() => useWorkCount(1), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ overdue: 1, waiting: 3 }));
    tasks.get(41)!.status = 'completed';
    act(() => taskChanged());
    await waitFor(() => expect(result.current).toEqual({ overdue: 0, waiting: 3 }));
    expect(calls(spy, 'GET', '/work/today/')).toHaveLength(2);
    expect(calls(spy, 'GET', '/work/recommendations/')).toEqual(['/work/recommendations/?scope=team', '/work/recommendations/?scope=team']);
  });

  it('reads the waiting count again after recommendationsChanged() (Brain decided, or Run now)', async () => {
    const { recommendations } = stubWork();
    const { result } = renderHook(() => useWorkCount(1), { wrapper });
    await waitFor(() => expect(result.current.waiting).toBe(3));
    recommendations.get(5)!.decided.status = 'dismissed';
    act(() => recommendationsChanged());
    await waitFor(() => expect(result.current.waiting).toBe(2));
  });

  it('reads nothing signed out, and keeps each part when its read fails', async () => {
    const { spy } = stubWork();
    const none = renderHook(() => useWorkCount(null), { wrapper });
    expect(none.result.current).toEqual({ overdue: null, waiting: null });
    expect(calls(spy, 'GET', '/work/')).toEqual([]);
    const { result } = renderHook(() => useWorkCount(1), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ overdue: 1, waiting: 3 }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ detail: 'Down.' }) })));
    act(() => taskChanged());
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(result.current).toEqual({ overdue: 1, waiting: 3 });
  });
});

describe('WorkNavItem (Decision 4)', () => {
  it('counts overdue plus waiting, and its name says both', async () => {
    stubWork();
    renderWork('/work/today', { sidebarItem: true });
    const link = await screen.findByRole('link', { name: 'Work, 1 overdue, 3 recommended' });
    expect(link).toHaveAttribute('href', '/work/today');
    expect(within(link).getByText('4')).toBeInTheDocument();
  });

  it('names only the part there is', async () => {
    stubWork({ tasks: [] });
    renderWork('/work/today', { sidebarItem: true });
    expect(await screen.findByRole('link', { name: 'Work, 3 recommended' })).toBeInTheDocument();
  });

  it('keeps delivery 1’s name when nothing is recommended', async () => {
    stubWork({ recommendations: [] });
    renderWork('/work/today', { sidebarItem: true });
    expect(await screen.findByRole('link', { name: 'Work, 1 overdue' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/components/work/useWorkCount.test.tsx --maxWorkers=2`
Expected: FAIL (`useWorkCount` answers a number, not `{ overdue, waiting }`; the link is named "Work, 1 overdue").

- [ ] **Step 3: Create `src/components/work/useRefreshTick.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useRecommendationChanges, useTaskChanges } from './taskChanges';

/** A number that grows after every taskChanged(), every
 *  recommendationsChanged() and every route change (never on the first
 *  render), for the Work counts to read again on (Decision 4). A task
 *  assigned by someone else arrives as a notification, then a navigation. */
export function useRefreshTick(): number {
  const [tick, setTick] = useState(0);
  const { pathname } = useLocation();
  const seenPath = useRef<string | null>(null);
  const bump = useCallback(() => setTick((n) => n + 1), []);
  useTaskChanges(bump);
  useRecommendationChanges(bump);
  useEffect(() => {
    if (seenPath.current === null) seenPath.current = pathname;
    else if (seenPath.current !== pathname) {
      seenPath.current = pathname;
      bump();
    }
  }, [pathname, bump]);
  return tick;
}
```

- [ ] **Step 4: Create `src/components/work/useRecommendedCount.ts`**

```ts
import { useEffect, useState } from 'react';
import { fetchRecommendations } from '../../features/work/workApi';
import { useRefreshTick } from './useRefreshTick';

type Answer = { userId: number; count: number };

/** The recommendations waiting for me (contract: the badge adds `count` of
 *  scope `team`). Read on mount, for another user and on every refresh
 *  tick. A failed read keeps the last count; null until the first answer. */
export function useRecommendedCount(userId: number | null): number | null {
  const tick = useRefreshTick();
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    if (userId === null) return;
    let alive = true;
    fetchRecommendations('team').then(
      (data) => {
        if (alive && typeof data?.count === 'number') setAnswer({ userId, count: data.count });
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

- [ ] **Step 5: Replace `src/components/work/useWorkCount.ts`**

```ts
import { useEffect, useState } from 'react';
import { fetchToday } from '../../features/work/workApi';
import { useRecommendedCount } from './useRecommendedCount';
import { useRefreshTick } from './useRefreshTick';

type Answer = { userId: number; overdue: number };

/** The badge's two parts; null until that part's first answer. */
export interface WorkCount {
  overdue: number | null;
  waiting: number | null;
}

/** The sidebar's Work badge (Decision 4): my overdue count (GET
 *  /work/today/'s counts.overdue) and the recommendations waiting for me,
 *  each read on mount, for another user and on every refresh tick. A
 *  failed read keeps that part's last value. */
export function useWorkCount(userId: number | null): WorkCount {
  const tick = useRefreshTick();
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    if (userId === null) return;
    let alive = true;
    fetchToday().then(
      (data) => {
        const overdue = data?.counts?.overdue;
        if (alive && typeof overdue === 'number') setAnswer({ userId, overdue });
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [userId, tick]);
  const waiting = useRecommendedCount(userId);
  return { overdue: answer !== null && answer.userId === userId ? answer.overdue : null, waiting };
}
```

- [ ] **Step 6: The sidebar item**

In `src/components/layout/Sidebar.tsx`, add the import beside the other feature imports:

```ts
import { workBadgeName } from '../../features/work/recommended';
```

Replace `WorkNavItem` and its comment with:

```tsx
/** Work (spec §1.5, §2.4): one item to Today, lit on every Work route. Its
 *  badge is my overdue count plus the recommendations waiting for me, and
 *  its name says both parts it has ("Work, 1 overdue, 3 recommended";
 *  Decision 4). Exported for the Work journeys. */
export function WorkNavItem({ expanded = false }: { expanded?: boolean }) {
  const userId = useAppSelector((state) => state.auth.user?.id ?? null);
  const { overdue, waiting } = useWorkCount(userId);
  const location = useLocation();
  const known = overdue !== null || waiting !== null;
  return (
    <NavItem
      to="/work/today"
      icon={<ListTodo className="w-5 h-5" aria-hidden="true" />}
      label="Work"
      badge={known ? (overdue ?? 0) + (waiting ?? 0) : undefined}
      badgeName={workBadgeName(overdue ?? 0, waiting ?? 0)}
      forceActive={isWorkPath(location.pathname)}
      expanded={expanded}
    />
  );
}
```

In `NavItem`'s parameter list add `badgeName,` after `badgeNoun = 'waiting',`, and in its props type, after `badgeNoun?: string;`, add:

```ts
  /** The words after the label when the badge shows, in place of
   *  "<badge> <badgeNoun>" (Work: "1 overdue, 3 recommended"). */
  badgeName?: string;
```

Replace the `const name = ...` line with:

```ts
  const name = badge !== undefined && badge > 0 ? `${label}, ${badgeName || `${badge} ${badgeNoun}`}` : label;
```

- [ ] **Step 7: Keep delivery 1's badge tests about delivery 1**

`stubWork()` now also lists three recommendations, so the tests that assert the exact names "Work, 1 overdue" and "Work" must say there are none:
- `src/e2e/work.test.tsx`: in "opens Today, opens a task, blocks it ..." and "marks the overdue task done from Today ...", change `const { spy } = stubWork();` to `const { spy } = stubWork({ recommendations: [] });`.
- `src/components/layout/Sidebar.test.tsx`, "Sidebar Work item": change `stubWork();` to `stubWork({ recommendations: [] });` and `stubWork({ tasks: [] })` to `stubWork({ tasks: [], recommendations: [] })`.

- [ ] **Step 8: Run the tests and make sure they pass**

Run: `npx vitest run src/components/work src/components/layout src/e2e/work.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/work/useRefreshTick.ts src/components/work/useRecommendedCount.ts src/components/work/useWorkCount.ts src/components/work/useWorkCount.test.tsx src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.tsx src/e2e/work.test.tsx
git commit -m "feat(work): the badge counts recommendations waiting too

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 4: The Recommended tab and page: reading what waits

**Files:**
- Create: `src/components/work/useRecommended.ts`, `src/components/work/RecommendationCard.tsx`, `src/components/work/RecommendedSkeleton.tsx`, `src/pages/work/Recommended.tsx`
- Modify: `src/features/work/workTabs.ts`, `src/components/layout/WorkTabs.tsx`, `src/pages/work/WorkRoutes.tsx`
- Test: `src/pages/work/Recommended.test.tsx` (create), `src/features/work/workTabs.test.ts`, `src/pages/work/WorkRoutes.test.tsx`, `src/components/layout/Navbar.test.tsx` ("Navbar on Work")

**Interfaces:**
- Consumes: `fetchRecommendations`, `REC`, `REC_SCOPES`, `KIND_LABEL`, `isRecScope`, `recTitle`, `hiddenRecText`, `suggestedText`, `queueText`, `useTaskChanges`, `useRecommendationChanges` (Task 1); `useRecommendedCount` (Task 3); `stubWork` (Task 2); delivery 1's `WorkFrame`, `PRIORITY_LABEL`, `parentPath`, `moreRowsText`, `useTeamAccess`; Brain's `ScopeSwitch`, `Figured`, `LIST`, `SECTION_TITLE`; `useHasReports`; `EmptyState`, `ErrorBlock`.
- Produces:
  - `WorkTab` gains `recommended?: boolean`; `WORK_TABS` is Today, Recommended, Team; `workTabsFor(access: WorkTabAccess): WorkTab[]` with `interface WorkTabAccess { team: boolean; recommended: boolean }`; `showsRecommended(input: { teamAccess: boolean; waiting: number | null; onIt: boolean }): boolean`.
  - `useRecommended(scope: RecScope | null): { data: RecommendationsPayload | null; error: string | null; reload: () => void; update: (change: (data: RecommendationsPayload) => RecommendationsPayload) => void }`.
  - `<RecommendationCard rec={RecommendationRow} me={number | null} />` (Task 5 adds `onSettled`), `<RecommendedSkeleton />`, `<RecommendedPage />` at `/work/recommended`.

- [ ] **Step 1: Write the failing tests**

In `src/features/work/workTabs.test.ts`, change the import to `import { isWorkPath, showsRecommended, workTabOf, workTabsFor } from './workTabs';` and replace the third `it` with:

```ts
  it('lights Recommended on its page', () => {
    expect(workTabOf('/work/recommended')).toBe('/work/recommended');
  });

  it('shows Team and Recommended only to readers who may use them (Decision 1; delivery 1 Decision 7)', () => {
    expect(workTabsFor({ team: false, recommended: false }).map((tab) => tab.label)).toEqual(['Today']);
    expect(workTabsFor({ team: false, recommended: true }).map((tab) => tab.label)).toEqual(['Today', 'Recommended']);
    expect(workTabsFor({ team: true, recommended: true }).map((tab) => tab.label)).toEqual(['Today', 'Recommended', 'Team']);
  });

  it('shows Recommended to Team readers, to anyone with something waiting, and to whoever is on it', () => {
    expect(showsRecommended({ teamAccess: true, waiting: null, onIt: false })).toBe(true);
    expect(showsRecommended({ teamAccess: false, waiting: 2, onIt: false })).toBe(true);
    expect(showsRecommended({ teamAccess: false, waiting: 0, onIt: true })).toBe(true);
    expect(showsRecommended({ teamAccess: false, waiting: 0, onIt: false })).toBe(false);
    expect(showsRecommended({ teamAccess: false, waiting: null, onIt: false })).toBe(false);
  });
```

In `src/pages/work/WorkRoutes.test.tsx`, change the `it.each` list to `['/work', '/work/', '/work/anything']` and append inside the `describe`:

```ts
  it('serves Recommended at /work/recommended, to every member (Decision 2)', async () => {
    stubWork({ reader: CARL });
    renderWork('/work/recommended', { role: 'csm', user: { id: 3, name: 'Carl CSM' } });
    expect(await screen.findByRole('region', { name: 'Yours to decide 1' })).toBeInTheDocument();
    expect(where()).toBe('/work/recommended');
  });
```

In `src/components/layout/Navbar.test.tsx`, "Navbar on Work": change the `it.each` table and its expectation to:

```ts
  it.each([
    ['/work/today', 'Today'],
    ['/work/recommended', 'Recommended'],
    ['/work/team', 'Team'],
  ])('on %s: the framed bar, "Work" as its h1, Today, Recommended and Team, "%s" current', (url, current) => {
    stubWork();
    const setSlot = vi.fn();
    renderNavbar(url, null, null, [], setSlot);
    expect(screen.getByRole('heading', { level: 1, name: 'Work' })).toBeInTheDocument();
    expect(document.querySelector('header')).toHaveClass('h-16', 'px-4');
    expect(setSlot).toHaveBeenCalledWith(expect.any(HTMLElement));
    expect(tabs().getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Today', '/work/today'],
      ['Recommended', '/work/recommended'],
      ['Team', '/work/team'],
    ]);
    expect(tabs().getByRole('link', { name: current })).toHaveAttribute('aria-current', 'page');
  });
```

In its "hides Team from a member ..." test, change `stubWork({ members: [] })` to `stubWork({ members: [], recommendations: [] })`, rename it to `'hides Team and Recommended from a member with no reports, nothing to decide, no view-all and another function'`, and add after it:

```ts
  it('shows Recommended to a member with something to decide (Decision 1)', async () => {
    stubWork({ members: [] });
    renderNavbar('/work/today', null, null, [], () => {}, { ...mockUser, permissions: [] });
    expect(await tabs().findByRole('link', { name: 'Recommended' })).toHaveAttribute('href', '/work/recommended');
    expect(tabs().queryByRole('link', { name: 'Team' })).toBeNull();
  });
```

Create `src/pages/work/Recommended.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { recommendationsChanged } from '../../components/work/taskChanges';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { calls, stubWork } from '../../features/work/testWork';
import { CARL } from '../../features/work/testWorkFixtures';
import { resetViewport } from '../../test/viewport';
import { renderWork, where } from './testPages';

const CARL_USER = { id: 3, name: 'Carl CSM' };
const card = (title: string) => screen.getByRole('article', { name: title });
const workTabs = () => within(screen.getByRole('navigation', { name: 'Work' }));

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
});

describe('Recommended (spec §2.4)', () => {
  it('lists what a manager may decide, newest first, each with its record, kind, person, facts and evidence', async () => {
    stubWork();
    renderWork('/work/recommended');
    const region = await screen.findByRole('region', { name: "Yours and your team's 3" });
    expect(within(region).getAllByRole('article').map((article) => article.querySelector('h3')?.textContent)).toEqual([
      "Prepare Pizza Hut's renewal",
      "Get Uber EMEA's urgent tickets moving",
      'Send the renewal pricing',
    ]);
    const renewal = card("Prepare Pizza Hut's renewal");
    const meta = renewal.querySelector('[data-part="meta"]') as HTMLElement;
    expect(meta).toHaveTextContent('Pizza Hut · Renewal · High priority · Suggested for Carl CSM');
    expect(within(meta).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    const why = within(renewal).getByRole('list', { name: 'Why' });
    expect(within(why).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Renews in 9 days', 'Renewal date 16 Oct']);
    expect(within(why).getByText('9')).toHaveClass('font-mono-brand');
    const evidence = within(renewal).getByRole('list', { name: 'Evidence' });
    expect(within(evidence).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(card("Get Uber EMEA's urgent tickets moving")).toHaveTextContent("Suggested for Dana CSM, who can't open it now");
    expect(card('Send the renewal pricing').querySelector('[data-part="meta"]')).toHaveTextContent(
      "Pizza Hut · AI agent · Medium priority · Suggested for Carl CSM · In Carl CSM's queue",
    );
  });

  it('counts what the reader cannot open, never naming it', async () => {
    stubWork({ recHidden: { team: 2 } });
    renderWork('/work/recommended');
    expect(await screen.findByText("2 more about accounts you can't open")).toBeInTheDocument();
  });

  it('says so when there is nothing to decide, still counting the hidden', async () => {
    stubWork({ recommendations: [], recHidden: { team: 1 } });
    renderWork('/work/recommended');
    expect(await screen.findByText('Nothing to decide')).toBeInTheDocument();
    expect(screen.getByText("1 more about an account you can't open")).toBeInTheDocument();
  });

  it('shows a skeleton while it loads, then the error with Try again', async () => {
    stubWork({ failRecommendations: 1 });
    renderWork('/work/recommended');
    expect(screen.getByLabelText('Loading recommendations')).toBeInTheDocument();
    expect(await screen.findByText('Down.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: "Yours and your team's 3" })).toBeInTheDocument();
  });

  it('switches a manager between Me and My team, in the URL (Decision 3)', async () => {
    stubWork();
    renderWork('/work/recommended');
    await screen.findByRole('region', { name: "Yours and your team's 3" });
    const view = screen.getByRole('group', { name: 'View' });
    expect(within(view).getByRole('button', { name: 'My team' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(view).getByRole('button', { name: 'Me' }));
    await waitFor(() => expect(where()).toBe('/work/recommended?scope=me'));
    expect(await screen.findByRole('region', { name: 'Yours to decide 2' })).toBeInTheDocument();
  });

  it('shows a member their own queue with no switch, sending no scope', async () => {
    const { spy } = stubWork({ reader: CARL });
    renderWork('/work/recommended', { role: 'csm', user: CARL_USER });
    expect(await screen.findByRole('region', { name: 'Yours to decide 1' })).toBeInTheDocument();
    expect(card('Send the renewal pricing')).toHaveTextContent('Suggested for you');
    expect(card('Send the renewal pricing')).not.toHaveTextContent('queue');
    await waitFor(() => expect(calls(spy, 'GET', '/auth/members/')).toHaveLength(1));
    expect(screen.queryByRole('group', { name: 'View' })).toBeNull();
    expect(calls(spy, 'GET', '/work/recommendations/')).toEqual(['/work/recommendations/']);
  });

  it('reads again when recommendations change elsewhere (Brain, Run now)', async () => {
    const { recommendations } = stubWork();
    renderWork('/work/recommended');
    await screen.findByRole('region', { name: "Yours and your team's 3" });
    recommendations.get(7)!.decided.status = 'assigned';
    act(() => recommendationsChanged());
    expect(await screen.findByRole('region', { name: "Yours and your team's 2" })).toBeInTheDocument();
  });

  it('puts the switch in a select at phone width', async () => {
    stubWork();
    renderWork('/work/recommended', { width: 375 });
    await screen.findByRole('region', { name: "Yours and your team's 3" });
    expect(screen.getByRole('combobox', { name: 'View' })).toHaveValue('team');
  });
});

describe('the Recommended tab (Decision 1)', () => {
  it('is lit on its page, between Today and Team', async () => {
    stubWork();
    renderWork('/work/recommended', { nav: true });
    expect(workTabs().getAllByRole('link').map((link) => link.textContent)).toEqual(['Today', 'Recommended', 'Team']);
    expect(workTabs().getByRole('link', { name: 'Recommended' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows to a member with something to decide', async () => {
    stubWork({ reader: CARL });
    renderWork('/work/today', { nav: true, role: 'csm', user: CARL_USER });
    expect(await workTabs().findByRole('link', { name: 'Recommended' })).toHaveAttribute('href', '/work/recommended');
  });

  it('stays while a member is on it, even with nothing left to decide', async () => {
    stubWork({ reader: CARL, recommendations: [] });
    renderWork('/work/recommended', { nav: true, role: 'csm', user: CARL_USER });
    await screen.findByText('Nothing to decide');
    expect(workTabs().getAllByRole('link').map((link) => link.textContent)).toEqual(['Today', 'Recommended']);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/pages/work src/features/work/workTabs.test.ts src/components/layout/Navbar.test.tsx --maxWorkers=2`
Expected: FAIL (no `showsRecommended`; `/work/recommended` redirects to Today; no Recommended tab).

- [ ] **Step 3: Replace `src/features/work/workTabs.ts`**

```ts
// The Work bar's tabs (spec §1.5, §2.4), kept free of React so the rules
// are unit-tested on their own.

export interface WorkTab {
  path: string;
  label: string;
  /** Shown only to readers who may use Team (delivery 1 Decision 7). */
  team?: boolean;
  /** Shown only by the Recommended rule (Decision 1). */
  recommended?: boolean;
}

export const WORK_TABS: readonly WorkTab[] = [
  { path: '/work/today', label: 'Today' },
  { path: '/work/recommended', label: 'Recommended', recommended: true },
  { path: '/work/team', label: 'Team', team: true },
];

export interface WorkTabAccess {
  team: boolean;
  recommended: boolean;
}

/** Every Work route wears the Work bar; `/workspace` would not. */
export function isWorkPath(pathname: string): boolean {
  return /^\/work(\/|$)/.test(pathname);
}

export function workTabOf(pathname: string): string | null {
  return WORK_TABS.find((tab) => pathname === tab.path || pathname === `${tab.path}/`)?.path ?? null;
}

export function workTabsFor(access: WorkTabAccess): WorkTab[] {
  return WORK_TABS.filter((tab) => (!tab.team || access.team) && (!tab.recommended || access.recommended));
}

/** Recommended shows to anyone with reports, view-all or the Leadership
 *  function (the Team rule), to anyone with something waiting for them to
 *  decide (spec §2.4), and to whoever is on it, so deciding the last one
 *  does not pull the tab from under them (Decision 1). */
export function showsRecommended({ teamAccess, waiting, onIt }: { teamAccess: boolean; waiting: number | null; onIt: boolean }): boolean {
  return teamAccess || onIt || (waiting ?? 0) > 0;
}
```

- [ ] **Step 4: Replace `src/components/layout/WorkTabs.tsx`**

```tsx
import { Link, useLocation } from 'react-router-dom';
import { showsRecommended, workTabOf, workTabsFor } from '../../features/work/workTabs';
import { useAppSelector } from '../../hooks';
import { useRecommendedCount } from '../work/useRecommendedCount';
import { useTeamAccess } from '../work/useTeamAccess';

// Class for class the Brain bar's tabs (BrainTabs.tsx): a negative offset
// keeps the ring inside the tab, since the row's own overflow-x-auto clips
// an outline drawn outside it.
const TAB =
  'inline-flex h-full min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 text-[13px] font-semibold transition-colors duration-[var(--dur-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[-2px]';

/** The Work bar (spec §1.5, §2.4): "Work", then Today, Recommended for
 *  readers the Recommended rule lets in (Decision 1) and Team for readers
 *  who may use it, as underline tabs. Below sm the row scrolls sideways. */
export function WorkTabs() {
  const location = useLocation();
  const userId = useAppSelector((state) => state.auth.user?.id ?? null);
  const canSeeTeam = useTeamAccess();
  const waiting = useRecommendedCount(userId);
  const current = workTabOf(location.pathname);
  const tabs = workTabsFor({
    team: canSeeTeam,
    recommended: showsRecommended({ teamAccess: canSeeTeam, waiting, onIt: current === '/work/recommended' }),
  });
  return (
    <div className="flex h-full min-w-0 items-center gap-4">
      <h1 className="shrink-0 text-[15px] font-bold tracking-tight text-ink">Work</h1>
      <nav aria-label="Work" className="flex h-full min-w-0 items-center gap-4 overflow-x-auto [scrollbar-width:none]">
        {tabs.map((tab) => {
          const active = tab.path === current;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              aria-current={active ? 'page' : undefined}
              className={`${TAB} ${active ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
```

- [ ] **Step 5: Create `src/components/work/useRecommended.ts`**

```ts
import { useCallback, useEffect, useState } from 'react';
import { REC } from '../../features/work/recommended';
import { fetchRecommendations } from '../../features/work/workApi';
import type { RecScope, RecommendationsPayload } from '../../features/work/workTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

type Answer = { key: string; data: RecommendationsPayload };
type Failure = { key: string; message: string };

/** GET /work/recommendations/ for `scope` (null: the server's default). An
 *  answer is kept for the scope it was read for, so switching shows the
 *  skeleton, never the other scope's items; a reload keeps the list until
 *  its answer lands; an error shows only while there is no list. `update`
 *  changes the list in place (a decided row leaves at once). */
export function useRecommended(scope: RecScope | null) {
  const key = scope ?? '';
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  useEffect(() => {
    let alive = true;
    fetchRecommendations(scope).then(
      (data) => {
        if (!alive) return;
        setAnswer({ key, data });
        setFailure(null);
      },
      (err: unknown) => {
        if (alive) setFailure({ key, message: errorMessage(err, REC.LOAD) });
      },
    );
    return () => {
      alive = false;
    };
  }, [scope, key, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const update = useCallback((change: (data: RecommendationsPayload) => RecommendationsPayload) => {
    setAnswer((current) => (current ? { ...current, data: change(current.data) } : current));
  }, []);
  const data = answer && answer.key === key ? answer.data : null;
  const error = failure && failure.key === key ? failure.message : null;
  return { data, error, reload, update };
}
```

- [ ] **Step 6: Create `src/components/work/RecommendedSkeleton.tsx`**

```tsx
import { LIST } from '../brain/styles';

/** Recommended while it loads: a heading and three rows in the loaded layout. */
export function RecommendedSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading recommendations" className="flex flex-col gap-2">
      <div className="h-3 w-32 animate-pulse rounded-md bg-subtle" />
      <div className={LIST}>
        {[0, 1, 2].map((n) => (
          <div key={n} className="flex flex-col gap-2 px-4 py-3">
            <div className="h-3 w-1/2 animate-pulse rounded-md bg-subtle" />
            <div className="h-2.5 w-1/3 animate-pulse rounded-md bg-subtle" />
            <div className="h-2.5 w-2/3 animate-pulse rounded-md bg-subtle" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create `src/components/work/RecommendationCard.tsx`**

```tsx
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { KIND_LABEL, REC, queueText, suggestedText } from '../../features/work/recommended';
import { PRIORITY_LABEL, parentPath } from '../../features/work/workText';
import type { RecommendationRow } from '../../features/work/workTypes';
import { Figured } from '../brain/Figured';
import { FOCUS } from '../organizations/portfolio/styles';

const META_LINK = `inline-flex min-h-11 items-center font-semibold text-ink-muted hover:text-ink hover:underline sm:min-h-0 ${FOCUS}`;
const EVIDENCE_LINK = `inline-flex min-h-11 items-center text-[13px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`;

function Dot() {
  return <span aria-hidden="true"> · </span>;
}

/** One recommendation (spec §2.4; Decision 6): flat inside the page's list.
 *  Its title, a meta line (record, kind, priority, who it is suggested for,
 *  whose queue), the facts with their figures in DM Mono, and the evidence
 *  links. Nothing here names a record beyond the one it is about. */
export function RecommendationCard({ rec, me }: { rec: RecommendationRow; me: number | null }) {
  const titleId = useId();
  const queue = queueText(rec, me);
  return (
    <li data-rec={rec.id} className="px-4 py-3">
      <article aria-labelledby={titleId} className="flex flex-col gap-2">
        <h3 id={titleId} className="text-[13px] font-semibold text-ink">
          {rec.title}
        </h3>
        <p data-part="meta" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-muted">
          <Link to={parentPath(rec.record)} className={META_LINK}>
            {rec.record.name}
          </Link>
          <Dot />
          <span>{KIND_LABEL[rec.kind]}</span>
          <Dot />
          <span>{PRIORITY_LABEL[rec.defaults.priority]} priority</span>
          <Dot />
          <span>{suggestedText(rec, me)}</span>
          {queue ? (
            <>
              <Dot />
              <span>{queue}</span>
            </>
          ) : null}
        </p>
        {rec.why.facts.length > 0 ? (
          <ul aria-label={REC.WHY} className="flex max-w-[70ch] list-disc flex-col gap-0.5 pl-5 text-[13px] text-ink">
            {rec.why.facts.map((fact, index) => (
              <li key={index}>
                <Figured text={fact} />
              </li>
            ))}
          </ul>
        ) : null}
        {rec.why.evidence.length > 0 ? (
          <ul aria-label={REC.EVIDENCE} className="flex flex-wrap items-center gap-x-3">
            {rec.why.evidence.map((item) => (
              <li key={`${item.link}:${item.label}`}>
                <Link to={item.link} className={EVIDENCE_LINK}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </article>
    </li>
  );
}
```

- [ ] **Step 8: Create `src/pages/work/Recommended.tsx`**

```tsx
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ScopeSwitch } from '../../components/brain/ScopeSwitch';
import { LIST, SECTION_TITLE } from '../../components/brain/styles';
import { EmptyState, ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { MONO } from '../../components/organizations/portfolio/styles';
import { useHasReports } from '../../components/plans/useHasReports';
import { RecommendationCard } from '../../components/work/RecommendationCard';
import { RecommendedSkeleton } from '../../components/work/RecommendedSkeleton';
import { useRecommendationChanges, useTaskChanges } from '../../components/work/taskChanges';
import { useRecommended } from '../../components/work/useRecommended';
import { WorkFrame } from '../../components/work/WorkFrame';
import type { ScopeKey } from '../../features/brain/brainTypes';
import { REC, REC_SCOPES, hiddenRecText, isRecScope, recTitle } from '../../features/work/recommended';
import { moreRowsText } from '../../features/work/workText';
import { useAppSelector, useCapability } from '../../hooks';

const TITLE_ID = 'work-recommended-title';

/** /work/recommended (spec §2.4): what Revenact recommends that the reader
 *  may decide, newest first, Me or My team (Decision 3). Anything about a
 *  record they cannot open is counted, never named. */
export function RecommendedPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get('scope');
  const recs = useRecommended(isRecScope(asked) ? asked : null);
  useTaskChanges(recs.reload);
  useRecommendationChanges(recs.reload);
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const hasReports = useHasReports();
  const canSeeAll = useCapability('view_all_accounts');
  const canSwitch = hasReports === true || canSeeAll;
  const data = recs.data;

  function choose(key: ScopeKey) {
    const next = new URLSearchParams(params);
    next.set('scope', key);
    setParams(next, { replace: true });
  }

  let body: ReactNode;
  if (!data && recs.error) body = <ErrorBlock message={recs.error} onRetry={recs.reload} />;
  else if (!data) body = <RecommendedSkeleton />;
  else if (data.items.length === 0) body = <EmptyState title={REC.EMPTY_TITLE} detail={REC.EMPTY_DETAIL} action={null} />;
  else {
    const more = moreRowsText(data.items.length, data.count);
    body = (
      <section aria-labelledby={TITLE_ID} className="flex flex-col gap-2">
        <h2 id={TITLE_ID} className={SECTION_TITLE}>
          {recTitle(data.scope)} <span className={MONO}>{data.count}</span>
        </h2>
        <ul aria-labelledby={TITLE_ID} className={LIST}>
          {data.items.map((rec) => (
            <RecommendationCard key={rec.id} rec={rec} me={me} />
          ))}
        </ul>
        {more ? <p className="text-[11px] text-ink-muted">{more}</p> : null}
      </section>
    );
  }
  const hidden = data ? hiddenRecText(data.hidden) : null;

  return (
    <WorkFrame>
      <div data-part="toolbar" className="flex min-h-11 flex-wrap items-center justify-end gap-3">
        {canSwitch && data ? <ScopeSwitch scopes={REC_SCOPES} value={data.scope} onChange={choose} /> : null}
      </div>
      {body}
      {hidden ? <p className="text-[13px] text-ink-muted">{hidden}</p> : null}
    </WorkFrame>
  );
}
```

- [ ] **Step 9: The route**

In `src/pages/work/WorkRoutes.tsx`, add `import { RecommendedPage } from './Recommended';`, add `<Route path="recommended" element={<RecommendedPage />} />` between the `today` and `team` routes, and replace the `WorkRoutes` comment with:

```tsx
/** /work/* (spec §1.5, §2.4): Today, Recommended and Team. Recommended is
 *  open to every member (Decision 2); /work, and anything unknown under it,
 *  lands on Today. */
```

- [ ] **Step 10: Run the tests and make sure they pass**

Run: `npx vitest run src/pages/work src/features/work src/components/layout --maxWorkers=2`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/features/work/workTabs.ts src/features/work/workTabs.test.ts src/components/layout/WorkTabs.tsx src/components/layout/Navbar.test.tsx src/components/work/useRecommended.ts src/components/work/RecommendedSkeleton.tsx src/components/work/RecommendationCard.tsx src/pages/work/Recommended.tsx src/pages/work/Recommended.test.tsx src/pages/work/WorkRoutes.tsx src/pages/work/WorkRoutes.test.tsx
git commit -m "feat(work): the Recommended tab and page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Assign a recommendation

**Files:**
- Create: `src/components/work/AssignForm.tsx`
- Modify: `src/components/work/RecommendationCard.tsx` (replace), `src/pages/work/Recommended.tsx` (replace)
- Test: `src/pages/work/Recommended.test.tsx` (append)

**Interfaces:**
- Consumes: `assignRecommendation`, `readRefusal`, `NO_REFUSAL`, `Refusal`, `REC`, `prefillAssignee`, `pickable`, `validateAssign`, `decidedElsewhere`, `assignedStatus`, `withoutRec`, `taskChanged` (Task 1); `useRecommended` (Task 4); delivery 1's `AssigneeSelect`, `useAssignees`, `assigneeOptions`, `useTaskLink`, `WORK`; `Field` (`components/organizations/activity/FormField.tsx`), `CONTROL`, `FORM_ERROR`, `FORM_GRID` (`formStyles.ts`); `useSubmitOnce` (`components/plans/useSubmitOnce.ts`); `BUTTON`, `QUIET`, `FOCUS`; Brain's `LINK`.
- Produces:
  - `<AssignForm rec onAssigned={(answer: AssignAnswer) => void} onGone={(text: string) => void} onCancel={() => void} />`.
  - `RecommendationCard` props become `{ rec: RecommendationRow; me: number | null; onSettled: (rec: RecommendationRow, text: string, taskId: number | null) => void }`; the card keeps its Assign button (`aria-expanded`) mounted while the form is open.
  - The page's status line (`role="status"`, focusable) with an Open task link.

- [ ] **Step 1: Write the failing tests**

Append to `src/pages/work/Recommended.test.tsx` (add `fireEvent` to the `@testing-library/react` import, `sent` to the `testWork` import, and `MONA, refOf` to the fixtures import):

```tsx
describe('Assign (spec §2.4; Decisions 7, 9)', () => {
  async function openAssign(title: string) {
    await screen.findByRole('article', { name: title });
    await userEvent.click(within(card(title)).getByRole('button', { name: 'Assign' }));
    const who = within(card(title)).getByLabelText('Who does it');
    await waitFor(() => expect(who).toBeEnabled());
    return who;
  }

  it('prefills the suggested person, the default due date and title; people who cannot open the record are disabled', async () => {
    stubWork();
    renderWork('/work/recommended');
    const who = await openAssign("Prepare Pizza Hut's renewal");
    const row = card("Prepare Pizza Hut's renewal");
    expect(within(row).getByRole('button', { name: 'Assign' })).toHaveAttribute('aria-expanded', 'true');
    expect(who).toHaveValue('3');
    expect(within(who).getByRole('option', { name: "Dana CSM · Can't open this organization" })).toBeDisabled();
    expect(within(row).getByLabelText('Due date')).toHaveValue('2026-10-09');
    expect(within(row).getByLabelText('Task title')).toHaveValue("Prepare Pizza Hut's renewal");
  });

  it('does not prefill someone who can no longer open the record, and asks for a person before sending', async () => {
    const { spy } = stubWork();
    renderWork('/work/recommended');
    const who = await openAssign("Get Uber EMEA's urgent tickets moving");
    expect(who).toHaveValue('');
    await userEvent.click(within(card("Get Uber EMEA's urgent tickets moving")).getByRole('button', { name: 'Assign task' }));
    expect(await within(card("Get Uber EMEA's urgent tickets moving")).findByText('Choose who does it.')).toBeInTheDocument();
    expect(sent(spy, 'POST', '/assign/')).toEqual([]);
  });

  it('assigns once, the row leaves, and the status line names it with a link to the task', async () => {
    const { spy } = stubWork();
    renderWork('/work/recommended');
    const who = await openAssign("Prepare Pizza Hut's renewal");
    await userEvent.selectOptions(who, '1');
    fireEvent.change(within(card("Prepare Pizza Hut's renewal")).getByLabelText('Due date'), { target: { value: '2026-10-06' } });
    await userEvent.dblClick(within(card("Prepare Pizza Hut's renewal")).getByRole('button', { name: 'Assign task' }));
    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent("Assigned to you: Prepare Pizza Hut's renewal."));
    expect(status).toHaveFocus();
    expect(within(status).getByRole('link', { name: 'Open task' })).toHaveAttribute('href', '/work/recommended?task=900');
    expect(screen.queryByRole('article', { name: "Prepare Pizza Hut's renewal" })).toBeNull();
    expect(await screen.findByRole('region', { name: "Yours and your team's 2" })).toBeInTheDocument();
    expect(sent(spy, 'POST', '/work/recommendations/5/assign/')).toEqual([{ assignee_id: 1, due_date: '2026-10-06', title: "Prepare Pizza Hut's renewal" }]);
  });

  it('removes a row someone else decided first, with the server’s own sentence (409)', async () => {
    const { recommendations } = stubWork();
    renderWork('/work/recommended');
    await openAssign("Prepare Pizza Hut's renewal");
    recommendations.get(5)!.decided = { ...recommendations.get(5)!.decided, status: 'assigned', decided_by: refOf(MONA), decided_at: '2026-10-07T09:30:00.000000Z', task_id: 77 };
    await userEvent.click(within(card("Prepare Pizza Hut's renewal")).getByRole('button', { name: 'Assign task' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Mona Manager already assigned this.');
    expect(screen.queryByRole('article', { name: "Prepare Pizza Hut's renewal" })).toBeNull();
  });

  it('keeps the row on ASSIGNEE_CANNOT_OPEN, under Who does it, and on CANT_DECIDE, on the form', async () => {
    stubWork({ refuseNextDecision: { status: 400, body: { code: 'ASSIGNEE_CANNOT_OPEN', detail: "That person can't open this organisation." } } });
    renderWork('/work/recommended');
    await openAssign("Prepare Pizza Hut's renewal");
    const row = card("Prepare Pizza Hut's renewal");
    await userEvent.click(within(row).getByRole('button', { name: 'Assign task' }));
    expect(await within(row).findByText("That person can't open this organisation.")).toBeInTheDocument();
    expect(within(row).getByLabelText('Who does it')).toHaveAttribute('aria-invalid', 'true');
    vi.unstubAllGlobals();
    stubWork({ refuseNextDecision: { status: 403, body: { code: 'CANT_DECIDE', detail: "You can't decide this recommendation." } } });
    await userEvent.click(within(row).getByRole('button', { name: 'Assign task' }));
    expect(await within(row).findByRole('alert')).toHaveTextContent("You can't decide this recommendation.");
    expect(within(row).getByRole('button', { name: 'Assign task' })).toBeEnabled();
  });

  it('offers Try again when the teammates do not load', async () => {
    stubWork({ failAssignees: 1 });
    renderWork('/work/recommended');
    await screen.findByRole('article', { name: "Prepare Pizza Hut's renewal" });
    const row = card("Prepare Pizza Hut's renewal");
    await userEvent.click(within(row).getByRole('button', { name: 'Assign' }));
    expect(await within(row).findByText('Could not load teammates.')).toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(within(row).getByLabelText('Who does it')).toHaveValue('3'));
  });

  it('closes on Cancel, focus back on Assign', async () => {
    stubWork();
    renderWork('/work/recommended');
    await openAssign("Prepare Pizza Hut's renewal");
    const row = card("Prepare Pizza Hut's renewal");
    await userEvent.click(within(row).getByRole('button', { name: 'Cancel' }));
    expect(within(row).queryByLabelText('Who does it')).toBeNull();
    expect(within(row).getByRole('button', { name: 'Assign' })).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/pages/work/Recommended.test.tsx --maxWorkers=2`
Expected: FAIL (no Assign button).

- [ ] **Step 3: Create `src/components/work/AssignForm.tsx`**

```tsx
import { useId, useState, type FormEvent } from 'react';
import { assigneeOptions } from '../../features/work/assignees';
import { REC, decidedElsewhere, pickable, prefillAssignee, validateAssign } from '../../features/work/recommended';
import { NO_REFUSAL, assignRecommendation, readRefusal, type Refusal } from '../../features/work/workApi';
import { WORK } from '../../features/work/workText';
import type { AssignAnswer, RecommendationRow } from '../../features/work/workTypes';
import { CONTROL, FORM_ERROR, FORM_GRID } from '../organizations/activity/formStyles';
import { Field } from '../organizations/activity/FormField';
import { BUTTON, QUIET } from '../organizations/portfolio/styles';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { AssigneeSelect } from './AssigneeSelect';
import { useAssignees } from './useAssignees';

// CONTROL is min-h-11 below sm (formStyles.ts); named INPUT here so the
// house rules' touch-target check knows it.
const INPUT = `${CONTROL}`;

/** Assign (spec §2.4; Decision 7): who does it, prefilled with the
 *  suggested person while they can still take it, the due date and the
 *  title from the row's defaults. Sent once. The server's refusals sit
 *  under their fields (ASSIGNEE_CANNOT_OPEN under Who does it) or on the
 *  form (CANT_DECIDE); a recommendation decided elsewhere (404, 409) hands
 *  its sentence up and the row leaves (Decision 9). */
export function AssignForm({
  rec,
  onAssigned,
  onGone,
  onCancel,
}: {
  rec: RecommendationRow;
  onAssigned: (answer: AssignAnswer) => void;
  onGone: (text: string) => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const assignees = useAssignees(rec.record);
  const [chosen, setChosen] = useState<number | null>(() => prefillAssignee(rec));
  const [due, setDue] = useState(rec.defaults.due_date);
  const [title, setTitle] = useState(rec.defaults.title);
  const [refusal, setRefusal] = useState<Refusal>(NO_REFUSAL);
  const { busy, run } = useSubmitOnce({ holdOnSuccess: true });
  const options = assigneeOptions(assignees.people ?? [], rec.record.kind);
  const value = pickable(assignees.people, chosen);
  const hint = assignees.error ? WORK.LOAD_PEOPLE : assignees.people === null ? WORK.LOADING_PEOPLE : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const local = validateAssign({ assignee: value, due, title });
    if (value === null || Object.keys(local).length > 0) {
      setRefusal({ field: local, form: null });
      return;
    }
    setRefusal(NO_REFUSAL);
    const outcome = await run(() => assignRecommendation(rec.id, { assignee_id: value, due_date: due, title: title.trim() }));
    if (!outcome) return;
    if (outcome.ok) {
      onAssigned(outcome.value);
      return;
    }
    const elsewhere = decidedElsewhere(outcome.error);
    if (elsewhere) onGone(elsewhere);
    else setRefusal(readRefusal(outcome.error, REC.ASSIGN_FAILED));
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate aria-label={`Assign “${rec.title}”`} className="@container flex flex-col gap-3">
      <div className={FORM_GRID}>
        <Field id={`${ids}-who`} label={REC.WHO} wide hint={hint} error={refusal.field.assignee_id}>
          <AssigneeSelect
            id={`${ids}-who`}
            value={value}
            options={options}
            onChange={setChosen}
            disabled={assignees.people === null}
            size="form"
            aria={{ 'aria-invalid': Boolean(refusal.field.assignee_id) }}
          />
          {assignees.error ? (
            <button type="button" onClick={assignees.retry} className={`${QUIET} self-start`}>
              {WORK.TRY_AGAIN}
            </button>
          ) : null}
        </Field>
        <Field id={`${ids}-due`} label={REC.DUE} error={refusal.field.due_date}>
          <input id={`${ids}-due`} type="date" value={due} onChange={(event) => setDue(event.target.value)} className={INPUT} />
        </Field>
        <Field id={`${ids}-title`} label={REC.TITLE} error={refusal.field.title}>
          <input id={`${ids}-title`} value={title} maxLength={255} onChange={(event) => setTitle(event.target.value)} className={INPUT} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={BUTTON}>
          {busy ? REC.ASSIGNING : REC.ASSIGN_TASK}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={QUIET}>
          {REC.CANCEL}
        </button>
      </div>
      {refusal.form ? (
        <p role="alert" className={FORM_ERROR}>
          {refusal.form}
        </p>
      ) : null}
    </form>
  );
}
```

- [ ] **Step 4: Replace `src/components/work/RecommendationCard.tsx`**

```tsx
import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { KIND_LABEL, REC, assignedStatus, queueText, suggestedText } from '../../features/work/recommended';
import { PRIORITY_LABEL, parentPath } from '../../features/work/workText';
import type { RecommendationRow } from '../../features/work/workTypes';
import { Figured } from '../brain/Figured';
import { BUTTON, FOCUS } from '../organizations/portfolio/styles';
import { AssignForm } from './AssignForm';

const META_LINK = `inline-flex min-h-11 items-center font-semibold text-ink-muted hover:text-ink hover:underline sm:min-h-0 ${FOCUS}`;
const EVIDENCE_LINK = `inline-flex min-h-11 items-center text-[13px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`;

type Mode = 'idle' | 'assign';

function Dot() {
  return <span aria-hidden="true"> · </span>;
}

/** One recommendation (spec §2.4; Decision 6): flat inside the page's list.
 *  Its title, a meta line (record, kind, priority, who it is suggested for,
 *  whose queue), the facts with their figures in DM Mono, the evidence
 *  links, then Assign, which opens its form below while the button stays
 *  (`aria-expanded`). `onSettled` hands up what happened, and the task when
 *  one was made; the page drops the row. */
export function RecommendationCard({
  rec,
  me,
  onSettled,
}: {
  rec: RecommendationRow;
  me: number | null;
  onSettled: (rec: RecommendationRow, text: string, taskId: number | null) => void;
}) {
  const titleId = useId();
  const formId = useId();
  const assignRef = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const queue = queueText(rec, me);
  return (
    <li data-rec={rec.id} className="px-4 py-3">
      <article aria-labelledby={titleId} className="flex flex-col gap-2">
        <h3 id={titleId} className="text-[13px] font-semibold text-ink">
          {rec.title}
        </h3>
        <p data-part="meta" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-muted">
          <Link to={parentPath(rec.record)} className={META_LINK}>
            {rec.record.name}
          </Link>
          <Dot />
          <span>{KIND_LABEL[rec.kind]}</span>
          <Dot />
          <span>{PRIORITY_LABEL[rec.defaults.priority]} priority</span>
          <Dot />
          <span>{suggestedText(rec, me)}</span>
          {queue ? (
            <>
              <Dot />
              <span>{queue}</span>
            </>
          ) : null}
        </p>
        {rec.why.facts.length > 0 ? (
          <ul aria-label={REC.WHY} className="flex max-w-[70ch] list-disc flex-col gap-0.5 pl-5 text-[13px] text-ink">
            {rec.why.facts.map((fact, index) => (
              <li key={index}>
                <Figured text={fact} />
              </li>
            ))}
          </ul>
        ) : null}
        {rec.why.evidence.length > 0 ? (
          <ul aria-label={REC.EVIDENCE} className="flex flex-wrap items-center gap-x-3">
            {rec.why.evidence.map((item) => (
              <li key={`${item.link}:${item.label}`}>
                <Link to={item.link} className={EVIDENCE_LINK}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            ref={assignRef}
            type="button"
            aria-expanded={mode === 'assign'}
            aria-controls={mode === 'assign' ? formId : undefined}
            aria-describedby={titleId}
            onClick={() => setMode(mode === 'assign' ? 'idle' : 'assign')}
            className={BUTTON}
          >
            {REC.ASSIGN}
          </button>
        </div>
        {mode === 'assign' ? (
          <div id={formId}>
            <AssignForm
              rec={rec}
              onAssigned={(answer) => onSettled(rec, assignedStatus(answer.task.title, answer.task.assignee, me), answer.task.id)}
              onGone={(text) => onSettled(rec, text, null)}
              onCancel={() => {
                setMode('idle');
                assignRef.current?.focus();
              }}
            />
          </div>
        ) : null}
      </article>
    </li>
  );
}
```

- [ ] **Step 5: Replace `src/pages/work/Recommended.tsx`**

```tsx
import { useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ScopeSwitch } from '../../components/brain/ScopeSwitch';
import { LINK, LIST, SECTION_TITLE } from '../../components/brain/styles';
import { EmptyState, ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { FOCUS, MONO } from '../../components/organizations/portfolio/styles';
import { useHasReports } from '../../components/plans/useHasReports';
import { RecommendationCard } from '../../components/work/RecommendationCard';
import { RecommendedSkeleton } from '../../components/work/RecommendedSkeleton';
import { taskChanged, useRecommendationChanges, useTaskChanges } from '../../components/work/taskChanges';
import { useRecommended } from '../../components/work/useRecommended';
import { useTaskLink } from '../../components/work/useTaskLink';
import { WorkFrame } from '../../components/work/WorkFrame';
import type { ScopeKey } from '../../features/brain/brainTypes';
import { REC, REC_SCOPES, hiddenRecText, isRecScope, recTitle, withoutRec } from '../../features/work/recommended';
import { moreRowsText } from '../../features/work/workText';
import type { RecommendationRow } from '../../features/work/workTypes';
import { useAppSelector, useCapability } from '../../hooks';

const TITLE_ID = 'work-recommended-title';

/** /work/recommended (spec §2.4): what Revenact recommends that the reader
 *  may decide, newest first, Me or My team (Decision 3). Anything about a
 *  record they cannot open is counted, never named. A decided row leaves at
 *  once; the status line says what happened and takes focus (Decision 9). */
export function RecommendedPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get('scope');
  const recs = useRecommended(isRecScope(asked) ? asked : null);
  useTaskChanges(recs.reload);
  useRecommendationChanges(recs.reload);
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const hasReports = useHasReports();
  const canSeeAll = useCapability('view_all_accounts');
  const canSwitch = hasReports === true || canSeeAll;
  const taskLink = useTaskLink();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [status, setStatus] = useState<{ text: string; taskId: number | null } | null>(null);
  const data = recs.data;

  function choose(key: ScopeKey) {
    const next = new URLSearchParams(params);
    next.set('scope', key);
    setParams(next, { replace: true });
  }

  function settle(rec: RecommendationRow, text: string, taskId: number | null) {
    recs.update((current) => withoutRec(current, rec.id));
    setStatus({ text, taskId });
    statusRef.current?.focus();
    taskChanged();
  }

  let body: ReactNode;
  if (!data && recs.error) body = <ErrorBlock message={recs.error} onRetry={recs.reload} />;
  else if (!data) body = <RecommendedSkeleton />;
  else if (data.items.length === 0) body = <EmptyState title={REC.EMPTY_TITLE} detail={REC.EMPTY_DETAIL} action={null} />;
  else {
    const more = moreRowsText(data.items.length, data.count);
    body = (
      <section aria-labelledby={TITLE_ID} className="flex flex-col gap-2">
        <h2 id={TITLE_ID} className={SECTION_TITLE}>
          {recTitle(data.scope)} <span className={MONO}>{data.count}</span>
        </h2>
        <ul aria-labelledby={TITLE_ID} className={LIST}>
          {data.items.map((rec) => (
            <RecommendationCard key={rec.id} rec={rec} me={me} onSettled={settle} />
          ))}
        </ul>
        {more ? <p className="text-[11px] text-ink-muted">{more}</p> : null}
      </section>
    );
  }
  const hidden = data ? hiddenRecText(data.hidden) : null;

  return (
    <WorkFrame>
      <div data-part="toolbar" className="flex min-h-11 flex-wrap items-center justify-between gap-3">
        <p ref={statusRef} tabIndex={-1} role="status" className={`text-[13px] text-ink-muted ${FOCUS}`}>
          {status ? status.text : null}
          {status && status.taskId !== null ? (
            <>
              {' '}
              <Link {...taskLink(status.taskId)} className={LINK}>
                {REC.OPEN_TASK}
              </Link>
            </>
          ) : null}
        </p>
        {canSwitch && data ? <ScopeSwitch scopes={REC_SCOPES} value={data.scope} onChange={choose} /> : null}
      </div>
      {body}
      {hidden ? <p className="text-[13px] text-ink-muted">{hidden}</p> : null}
    </WorkFrame>
  );
}
```

- [ ] **Step 6: Run the tests and make sure they pass**

Run: `npx vitest run src/pages/work --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/work/AssignForm.tsx src/components/work/RecommendationCard.tsx src/pages/work/Recommended.tsx src/pages/work/Recommended.test.tsx
git commit -m "feat(work): assign a recommendation, prefilled, sent once

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Dismiss a recommendation, with a reason

**Files:**
- Create: `src/components/work/DismissForm.tsx`
- Modify: `src/components/work/RecommendationCard.tsx`
- Test: `src/pages/work/Recommended.test.tsx` (append)

**Interfaces:**
- Consumes: `dismissRecommendation`, `readRefusal`, `NO_REFUSAL`, `Refusal`, `REC`, `DISMISS_REASONS`, `validateDismiss`, `decidedElsewhere`, `dismissedStatus` (Task 1); the card from Task 5.
- Produces: `<DismissForm rec onDismissed={() => void} onGone={(text: string) => void} onCancel={() => void} />`; the card's Dismiss button (`QUIET`, `aria-expanded`), beside Assign; opening one form closes the other.

- [ ] **Step 1: Write the failing tests**

Append to `src/pages/work/Recommended.test.tsx`:

```tsx
describe('Dismiss (spec §2.3, §2.4; Decision 8)', () => {
  async function openDismiss(title: string) {
    await screen.findByRole('article', { name: title });
    await userEvent.click(within(card(title)).getByRole('button', { name: 'Dismiss' }));
    return within(card(title)).getByLabelText('Reason');
  }

  it('asks for a reason first, then dismisses once; the row leaves and the status says so', async () => {
    const { spy } = stubWork();
    renderWork('/work/recommended');
    const reason = await openDismiss("Get Uber EMEA's urgent tickets moving");
    const row = card("Get Uber EMEA's urgent tickets moving");
    expect(within(row).getByRole('button', { name: 'Dismiss' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(reason).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a reason', 'Already handled', 'Not relevant', 'Wrong person', 'Other']);
    await userEvent.click(within(row).getByRole('button', { name: 'Dismiss it' }));
    expect(await within(row).findByText('Choose a reason.')).toBeInTheDocument();
    await userEvent.selectOptions(reason, 'not_relevant');
    await userEvent.dblClick(within(row).getByRole('button', { name: 'Dismiss it' }));
    expect(await screen.findByRole('status')).toHaveTextContent("Dismissed: Get Uber EMEA's urgent tickets moving.");
    expect(screen.queryByRole('article', { name: "Get Uber EMEA's urgent tickets moving" })).toBeNull();
    expect(sent(spy, 'POST', '/dismiss/')).toEqual([{ reason: 'not_relevant' }]);
  });

  it('asks Other to say why, and sends the note', async () => {
    const { spy } = stubWork();
    renderWork('/work/recommended');
    const reason = await openDismiss("Get Uber EMEA's urgent tickets moving");
    const row = card("Get Uber EMEA's urgent tickets moving");
    await userEvent.selectOptions(reason, 'other');
    await userEvent.click(within(row).getByRole('button', { name: 'Dismiss it' }));
    expect(await within(row).findByText('Say why.')).toBeInTheDocument();
    expect(sent(spy, 'POST', '/dismiss/')).toEqual([]);
    await userEvent.type(within(row).getByLabelText('Say why'), 'Handled by phone');
    await userEvent.click(within(row).getByRole('button', { name: 'Dismiss it' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Dismissed:');
    expect(sent(spy, 'POST', '/dismiss/')).toEqual([{ reason: 'other', note: 'Handled by phone' }]);
  });

  it('removes a row that expired before the decision (409)', async () => {
    const { recommendations } = stubWork();
    renderWork('/work/recommended');
    const reason = await openDismiss("Prepare Pizza Hut's renewal");
    recommendations.get(5)!.decided = { ...recommendations.get(5)!.decided, status: 'expired', decided_at: '2026-10-07T09:30:00.000000Z' };
    await userEvent.selectOptions(reason, 'already_handled');
    await userEvent.click(within(card("Prepare Pizza Hut's renewal")).getByRole('button', { name: 'Dismiss it' }));
    expect(await screen.findByRole('status')).toHaveTextContent('This recommendation has expired.');
    expect(screen.queryByRole('article', { name: "Prepare Pizza Hut's renewal" })).toBeNull();
  });

  it('opens one form at a time; Cancel puts focus back on Dismiss', async () => {
    stubWork();
    renderWork('/work/recommended');
    await openDismiss("Prepare Pizza Hut's renewal");
    const row = card("Prepare Pizza Hut's renewal");
    await userEvent.click(within(row).getByRole('button', { name: 'Assign' }));
    expect(within(row).queryByLabelText('Reason')).toBeNull();
    expect(within(row).getByLabelText('Who does it')).toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Dismiss' }));
    await userEvent.click(within(row).getByRole('button', { name: 'Cancel' }));
    expect(within(row).getByRole('button', { name: 'Dismiss' })).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/pages/work/Recommended.test.tsx --maxWorkers=2`
Expected: FAIL (no Dismiss button).

- [ ] **Step 3: Create `src/components/work/DismissForm.tsx`**

```tsx
import { useId, useState, type FormEvent } from 'react';
import { DISMISS_REASONS, REC, decidedElsewhere, validateDismiss } from '../../features/work/recommended';
import { NO_REFUSAL, dismissRecommendation, readRefusal, type Refusal } from '../../features/work/workApi';
import type { DismissBody, DismissReason, RecommendationRow } from '../../features/work/workTypes';
import { CONTROL, FORM_ERROR, FORM_GRID } from '../organizations/activity/formStyles';
import { Field } from '../organizations/activity/FormField';
import { BUTTON, QUIET } from '../organizations/portfolio/styles';
import { useSubmitOnce } from '../plans/useSubmitOnce';

// CONTROL is min-h-11 below sm (formStyles.ts); named INPUT here so the
// house rules' touch-target check knows it.
const INPUT = `${CONTROL}`;

/** Dismiss (spec §2.3; Decision 8): a reason, and with Other a note,
 *  refused in place in the server's words before anything is sent. Sent
 *  once; a recommendation decided elsewhere (404, 409) hands its sentence
 *  up and the row leaves. */
export function DismissForm({
  rec,
  onDismissed,
  onGone,
  onCancel,
}: {
  rec: RecommendationRow;
  onDismissed: () => void;
  onGone: (text: string) => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const [reason, setReason] = useState<DismissReason | ''>('');
  const [note, setNote] = useState('');
  const [refusal, setRefusal] = useState<Refusal>(NO_REFUSAL);
  const { busy, run } = useSubmitOnce({ holdOnSuccess: true });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const local = validateDismiss(reason, note);
    if (reason === '' || Object.keys(local).length > 0) {
      setRefusal({ field: local, form: null });
      return;
    }
    setRefusal(NO_REFUSAL);
    const body: DismissBody = reason === 'other' ? { reason, note: note.trim() } : { reason };
    const outcome = await run(() => dismissRecommendation(rec.id, body));
    if (!outcome) return;
    if (outcome.ok) {
      onDismissed();
      return;
    }
    const elsewhere = decidedElsewhere(outcome.error);
    if (elsewhere) onGone(elsewhere);
    else setRefusal(readRefusal(outcome.error, REC.DISMISS_FAILED));
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate aria-label={`Dismiss “${rec.title}”`} className="@container flex flex-col gap-3">
      <div className={FORM_GRID}>
        <Field id={`${ids}-reason`} label={REC.REASON} error={refusal.field.reason}>
          <select
            id={`${ids}-reason`}
            value={reason}
            aria-invalid={Boolean(refusal.field.reason)}
            onChange={(event) => setReason(event.target.value as DismissReason | '')}
            className={INPUT}
          >
            <option value="" disabled>
              {REC.CHOOSE_REASON}
            </option>
            {DISMISS_REASONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        {reason === 'other' ? (
          <Field id={`${ids}-note`} label={REC.NOTE} error={refusal.field.note}>
            <input
              id={`${ids}-note`}
              value={note}
              maxLength={255}
              aria-invalid={Boolean(refusal.field.note)}
              onChange={(event) => setNote(event.target.value)}
              className={INPUT}
            />
          </Field>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={BUTTON}>
          {busy ? REC.DISMISSING : REC.DISMISS_IT}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={QUIET}>
          {REC.CANCEL}
        </button>
      </div>
      {refusal.form ? (
        <p role="alert" className={FORM_ERROR}>
          {refusal.form}
        </p>
      ) : null}
    </form>
  );
}
```

In `src/features/work/recommended.ts`, add `DISMISS_IT: 'Dismiss it',` to `REC` after `DISMISS: 'Dismiss',` (the submit button is named apart from the row's Dismiss, which stays on screen).

- [ ] **Step 4: Give the card its Dismiss**

In `src/components/work/RecommendationCard.tsx`:

Change the recommended import to `import { KIND_LABEL, REC, assignedStatus, dismissedStatus, queueText, suggestedText } from '../../features/work/recommended';`, the styles import to `import { BUTTON, FOCUS, QUIET } from '../organizations/portfolio/styles';`, add `import { DismissForm } from './DismissForm';`, and change `type Mode = 'idle' | 'assign';` to `type Mode = 'idle' | 'assign' | 'dismiss';`.

After `const assignRef = useRef<HTMLButtonElement>(null);` add `const dismissRef = useRef<HTMLButtonElement>(null);`.

Replace the buttons `div` and the form block (from `<div className="flex flex-wrap gap-2">` to the end of `{mode === 'assign' ? ( ... ) : null}`) with:

```tsx
        <div className="flex flex-wrap gap-2">
          <button
            ref={assignRef}
            type="button"
            aria-expanded={mode === 'assign'}
            aria-controls={mode === 'assign' ? formId : undefined}
            aria-describedby={titleId}
            onClick={() => setMode(mode === 'assign' ? 'idle' : 'assign')}
            className={BUTTON}
          >
            {REC.ASSIGN}
          </button>
          <button
            ref={dismissRef}
            type="button"
            aria-expanded={mode === 'dismiss'}
            aria-controls={mode === 'dismiss' ? formId : undefined}
            aria-describedby={titleId}
            onClick={() => setMode(mode === 'dismiss' ? 'idle' : 'dismiss')}
            className={QUIET}
          >
            {REC.DISMISS}
          </button>
        </div>
        {mode === 'assign' ? (
          <div id={formId}>
            <AssignForm
              rec={rec}
              onAssigned={(answer) => onSettled(rec, assignedStatus(answer.task.title, answer.task.assignee, me), answer.task.id)}
              onGone={(text) => onSettled(rec, text, null)}
              onCancel={() => {
                setMode('idle');
                assignRef.current?.focus();
              }}
            />
          </div>
        ) : null}
        {mode === 'dismiss' ? (
          <div id={formId}>
            <DismissForm
              rec={rec}
              onDismissed={() => onSettled(rec, dismissedStatus(rec.title), null)}
              onGone={(text) => onSettled(rec, text, null)}
              onCancel={() => {
                setMode('idle');
                dismissRef.current?.focus();
              }}
            />
          </div>
        ) : null}
```

Update the card's doc comment's last sentences to: "... then Assign and Dismiss, each opening its form below while both buttons stay (`aria-expanded`; one form at a time). `onSettled` hands up what happened, and the task when one was made; the page drops the row."

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `npx vitest run src/pages/work src/features/work --maxWorkers=2`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/work/DismissForm.tsx src/components/work/RecommendationCard.tsx src/features/work/recommended.ts src/pages/work/Recommended.test.tsx
git commit -m "feat(work): dismiss a recommendation with a reason

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 7: The bell's `recommendations_waiting`, and Brain kept in step

**Files:**
- Modify: `src/features/notifications/types.ts`, `src/components/layout/NotificationKindIcon.tsx`, `src/components/brain/ProposalDecision.tsx`
- Test: `src/components/layout/NotificationKindIcon.test.tsx`, `src/components/layout/Navbar.test.tsx` ("Navbar notification bell"), `src/components/brain/WaitingRow.test.tsx`

**Interfaces:**
- Consumes: `recommendationsChanged`, `useRecommendationChanges` (Task 1); `stubWork` (Task 2); Brain's `stubBrain`, `CARL_TASK_PROPOSAL`, `renderRow` (in `WaitingRow.test.tsx`).
- Produces: `NotificationKind` includes `'recommendations_waiting'`; its bell icon is Lucide `Lightbulb`; `ProposalDecision` calls `recommendationsChanged()` after a decision lands and after a 404 or 409 (never after a 403 or another failure).

- [ ] **Step 1: Write the failing tests**

Append inside the `describe` of `src/components/layout/NotificationKindIcon.test.tsx`:

```tsx
  it('gives recommendations_waiting the lightbulb (Work spec §2.2; Decision 13)', () => {
    const { container } = render(<NotificationKindIcon kind="recommendations_waiting" />);
    expect(container.querySelector('[data-kind-icon="recommendations_waiting"]')).toHaveAttribute('aria-hidden', 'true');
  });
```

In `src/components/layout/Navbar.test.tsx`, after the `taskAssigned` fixture, add:

```ts
// Work spec §2.2: the daily notice of recommendations waiting, opening Recommended.
const recsWaiting: Notification = {
  ...planStarted,
  id: 9,
  kind: 'recommendations_waiting',
  message: '3 tasks recommended for your team.',
  link: '/work/recommended',
  actor: null,
};
```

and, in "Navbar notification bell", after the `task_assigned` test:

```ts
  it('opens Recommended from a recommendations_waiting notification, with its icon, as an ordinary link', async () => {
    stubWork();
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [recsWaiting]);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(document.querySelector('[data-kind-icon="recommendations_waiting"]')).toHaveAttribute('aria-hidden', 'true');
    await user.click(screen.getByText('3 tasks recommended for your team.'));
    expect(notificationApi.markNotificationRead).toHaveBeenCalledWith(9);
    const marker = await screen.findByTestId('segment-marker');
    expect(marker).toHaveTextContent('/work/recommended');
    expect(marker).not.toHaveTextContent('opened-here');
  });
```

In `src/components/brain/WaitingRow.test.tsx`, add `renderHook` to the `@testing-library/react` import and `import { useRecommendationChanges } from '../work/taskChanges';`, then append inside `describe('WaitingRow (spec §2.1)', ...)`:

```tsx
  it('tells Work its recommendations changed once a proposal is decided here (Work Decision 14)', async () => {
    stubBrain();
    const heard = vi.fn();
    renderHook(() => useRecommendationChanges(heard));
    const { row } = renderRow(CARL_TASK_PROPOSAL);
    await userEvent.click(within(row).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
  });

  it('tells Work too when the proposal was decided elsewhere (409)', async () => {
    stubBrain({ refuseNextDecision: { status: 409, body: { detail: 'This has already been decided.' } } });
    const heard = vi.fn();
    renderHook(() => useRecommendationChanges(heard));
    const { row, onGone } = renderRow(CARL_TASK_PROPOSAL);
    await userEvent.click(within(row).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onGone).toHaveBeenCalled());
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('does not tell Work when the decision is refused (403)', async () => {
    stubBrain({ refuseNextDecision: { status: 403, body: { detail: "You can't decide this proposal." } } });
    const heard = vi.fn();
    renderHook(() => useRecommendationChanges(heard));
    const { row } = renderRow(CARL_TASK_PROPOSAL);
    await userEvent.click(within(row).getByRole('button', { name: 'Approve' }));
    await within(row).findByRole('alert');
    expect(heard).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/components/layout/NotificationKindIcon.test.tsx src/components/layout/Navbar.test.tsx src/components/brain/WaitingRow.test.tsx --maxWorkers=2`
Expected: FAIL (no icon for the kind; TypeScript in the editor flags the unknown kind; `heard` is never called).

- [ ] **Step 3: The kind**

In `src/features/notifications/types.ts`, change the last member of `NotificationKind` from `| 'task_assigned';` to:

```ts
  | 'task_assigned'
  // "3 tasks recommended for your team." (or "Revenact recommends “<title>”.")
  // for a recipient with new open recommendations, at most once a day; links
  // to /work/recommended (Work spec §2.2).
  | 'recommendations_waiting';
```

- [ ] **Step 4: The icon**

Replace `src/components/layout/NotificationKindIcon.tsx`:

```tsx
import { ClipboardList, Lightbulb, ListChecks, Megaphone, SquareCheck, type LucideIcon } from 'lucide-react';
import type { NotificationKind } from '../../features/notifications/types';

/** The kinds that carry an icon in the bell (plans spec §2.5, campaigns spec
 *  §2.5, Work spec §1.3 and §2.2). */
const ICONS: Partial<Record<NotificationKind, LucideIcon>> = {
  plan_started: ClipboardList,
  plan_task_assigned: ListChecks,
  campaign_sent: Megaphone,
  task_assigned: SquareCheck,
  recommendations_waiting: Lightbulb,
};

/** A notification kind's icon, beside its words; nothing for the others. */
export function NotificationKindIcon({ kind }: { kind: NotificationKind }) {
  const Icon = ICONS[kind];
  return Icon ? <Icon data-kind-icon={kind} className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" /> : null;
}
```

- [ ] **Step 5: Brain tells Work**

In `src/components/brain/ProposalDecision.tsx`, add `import { recommendationsChanged } from '../work/taskChanges';`, and change the body of `decide` after `if (!outcome) return;` to:

```tsx
    if (outcome.ok) {
      // Deciding an AI-agent proposal settles its recommendation too (Work
      // Decision 14): the Work badge and an open Recommended list catch up.
      recommendationsChanged();
      onGone(`${decision === 'approve' ? 'Approved' : 'Rejected'}: ${title}.`);
      return;
    }
    setPending(null);
    const err = outcome.error;
    if (err instanceof ApiError && err.status === 404) {
      recommendationsChanged();
      onGone(WAIT.ALREADY_DECIDED);
    } else if (err instanceof ApiError && err.status === 409) {
      recommendationsChanged();
      // M6: `message` is never empty (apiClient falls back to "Request
      // failed (409)" when the server sends no `detail`), so check the raw
      // body directly for the server's own sentence, falling back only
      // when it truly gave none.
      const body = err.body;
      const detail = body !== null && typeof body === 'object' ? (body as Record<string, unknown>).detail : undefined;
      onGone(typeof detail === 'string' ? detail : WAIT.ALREADY_DECIDED);
    } else {
      setError(errorMessage(err, WAIT.DECIDE_FAILED));
      setErrorTick((n) => n + 1);
    }
```

- [ ] **Step 6: Run the tests and make sure they pass**

Run: `npx vitest run src/components/layout src/components/brain src/pages/brain --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/notifications/types.ts src/components/layout/NotificationKindIcon.tsx src/components/layout/NotificationKindIcon.test.tsx src/components/layout/Navbar.test.tsx src/components/brain/ProposalDecision.tsx src/components/brain/WaitingRow.test.tsx
git commit -m "feat(work): the bell's recommendations_waiting; Brain decisions update Work

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The settings rules: sources, draft, limits, patch, refusals and Run now's words

**Files:**
- Create: `src/features/work/workSettings.ts`
- Test: `src/features/work/workSettings.test.ts`

**Interfaces:**
- Consumes: Task 1's `RecKind`, `REC_KINDS`, `RecommendTo`, `RefreshResult`, `SourceField`, `SourceSettings`, `WorkSettings`, `WorkSettingsPatch`; `WORK_SETTINGS` fixture; `ApiError`.
- Produces:
  - `SET` (copy); `RECEIVE_OPTIONS: { value: RecommendTo; label: string; detail: string }[]`; `interface FieldSpec { field: SourceField; label: string; min: number; max: number; whole: boolean }`; `interface SourceSpec { kind: RecKind; label: string; detail: string; fields: FieldSpec[] }`; `SOURCE_SPECS: readonly SourceSpec[]`; `COOLDOWN_SPEC: { min: 0; max: 120; whole: true }`; `sourceLabel(kind: string): string`; `rangeMessage(spec: { min: number; max: number; whole: boolean }): string`.
  - `interface SourceDraft { enabled: boolean; values: Partial<Record<SourceField, string>> }`; `interface SettingsDraft { recommend_to: RecommendTo; cooldown: string; sources: Record<RecKind, SourceDraft> }`; `draftOf(settings: WorkSettings): SettingsDraft`.
  - `type SourceErrors = Partial<Record<SourceField | 'enabled' | 'source', string>>`; `interface SettingsErrors { recommend_to?: string; dismiss_cooldown_days?: string; sources: Partial<Record<RecKind, SourceErrors>>; form: string | null }`; `NO_SETTINGS_ERRORS`; `validateDraft(draft: SettingsDraft): SettingsErrors`; `hasErrors(errors: SettingsErrors): boolean`.
  - `patchOf(saved: WorkSettings, draft: SettingsDraft): WorkSettingsPatch`; `isEmptyPatch(patch: WorkSettingsPatch): boolean`.
  - `readSettingsRefusal(err: unknown, fallback: string): SettingsErrors`.
  - `interface RunSummary { text: string; failed: string | null }`; `refreshSummary(result: RefreshResult): RunSummary`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/work/workSettings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { WORK_SETTINGS } from './testWorkFixtures';
import {
  SOURCE_SPECS,
  draftOf,
  hasErrors,
  isEmptyPatch,
  patchOf,
  rangeMessage,
  readSettingsRefusal,
  refreshSummary,
  sourceLabel,
  validateDraft,
  type SettingsDraft,
} from './workSettings';
import { REC_KINDS } from './workTypes';

const edit = (change: (draft: SettingsDraft) => void): SettingsDraft => {
  const draft = draftOf(WORK_SETTINGS);
  change(draft);
  return draft;
};

describe('workSettings: the sources (Decision 11)', () => {
  it('lists every kind in the contract’s order, each with its fields and limits', () => {
    expect(SOURCE_SPECS.map((spec) => spec.kind)).toEqual([...REC_KINDS]);
    expect(SOURCE_SPECS.map((spec) => [spec.label, spec.fields.map((f) => `${f.field} ${f.label} ${f.min}-${f.max}${f.whole ? '' : ' decimal'}`)])).toEqual([
      ['Renewal due', ['days Within (days) 1-120']],
      ['Health drop', ['drop Drop of at least 0.1-5 decimal', 'window_days Compared with (days ago) 1-120']],
      ['Urgent tickets', ['min At least (tickets) 1-50']],
      ['Overdue tasks', ['days Overdue by (days) 1-120']],
      ['Open questions', ['days Open for (days) 1-120']],
      ['Anomalies', []],
      ['AI agent', []],
    ]);
    expect(sourceLabel('health_drop')).toBe('Health drop');
    expect(sourceLabel('something_new')).toBe('something_new');
  });

  it('words a limit as the contract does', () => {
    expect(rangeMessage({ min: 1, max: 120, whole: true })).toBe('Choose a whole number from 1 to 120.');
    expect(rangeMessage({ min: 0.1, max: 5, whole: false })).toBe('Choose a number from 0.1 to 5.');
  });
});

describe('workSettings: the draft', () => {
  it('holds every number as the text the reader edits', () => {
    const draft = draftOf(WORK_SETTINGS);
    expect(draft.recommend_to).toBe('manager');
    expect(draft.cooldown).toBe('14');
    expect(draft.sources.renewal_due).toEqual({ enabled: true, values: { days: '30' } });
    expect(draft.sources.health_drop).toEqual({ enabled: true, values: { drop: '0.5', window_days: '14' } });
    expect(draft.sources.agent).toEqual({ enabled: true, values: {} });
  });

  it('passes the saved settings, and refuses each number outside its limits', () => {
    expect(hasErrors(validateDraft(draftOf(WORK_SETTINGS)))).toBe(false);
    const errors = validateDraft(
      edit((draft) => {
        draft.sources.renewal_due.values.days = '0';
        draft.sources.health_drop.values.drop = '5.5';
        draft.sources.health_drop.values.window_days = 'two';
        draft.sources.urgent_tickets.values.min = '2.5';
        draft.cooldown = '';
      }),
    );
    expect(hasErrors(errors)).toBe(true);
    expect(errors).toEqual({
      dismiss_cooldown_days: 'Choose a whole number from 0 to 120.',
      sources: {
        renewal_due: { days: 'Choose a whole number from 1 to 120.' },
        health_drop: { drop: 'Choose a number from 0.1 to 5.', window_days: 'Choose a whole number from 1 to 120.' },
        urgent_tickets: { min: 'Choose a whole number from 1 to 50.' },
      },
      form: null,
    });
    expect(validateDraft(edit((draft) => (draft.cooldown = '0'))).dismiss_cooldown_days).toBeUndefined();
  });
});

describe('workSettings: the PATCH (only what changed)', () => {
  it('sends nothing for an untouched draft', () => {
    expect(isEmptyPatch(patchOf(WORK_SETTINGS, draftOf(WORK_SETTINGS)))).toBe(true);
  });

  it('sends each changed field, and inside sources only the changed kinds and fields', () => {
    const draft = edit((d) => {
      d.recommend_to = 'owner';
      d.cooldown = '7';
      d.sources.renewal_due.values.days = '45';
      d.sources.health_drop.enabled = false;
      d.sources.health_drop.values.drop = ' 0.5 ';
    });
    expect(patchOf(WORK_SETTINGS, draft)).toEqual({
      recommend_to: 'owner',
      dismiss_cooldown_days: 7,
      sources: { renewal_due: { days: 45 }, health_drop: { enabled: false } },
    });
  });
});

describe('workSettings: the server’s refusals, onto the form', () => {
  it('puts nested field errors under their field and a source’s own under its row', () => {
    const err = new ApiError(
      400,
      {
        recommend_to: ['Choose manager or owner.'],
        dismiss_cooldown_days: ['Choose a whole number from 0 to 120.'],
        sources: { overdue_tasks: { days: ['Choose a whole number from 1 to 120.'] }, anomaly: ["Send each source's settings as one object."] },
      },
      'x',
    );
    expect(readSettingsRefusal(err, 'fallback')).toEqual({
      recommend_to: 'Choose manager or owner.',
      dismiss_cooldown_days: 'Choose a whole number from 0 to 120.',
      sources: { overdue_tasks: { days: 'Choose a whole number from 1 to 120.' }, anomaly: { source: "Send each source's settings as one object." } },
      form: null,
    });
  });

  it('puts everything else on the form', () => {
    expect(readSettingsRefusal(new ApiError(400, { sources: ['Send the sources as one object.'] }, 'x'), 'fallback').form).toBe('Send the sources as one object.');
    expect(readSettingsRefusal(new ApiError(400, { non_field_errors: ['Send the fields as one object.'] }, 'x'), 'fallback').form).toBe('Send the fields as one object.');
    expect(readSettingsRefusal(new ApiError(403, { detail: "You don't have permission to change organisation settings." }, 'x'), 'fallback').form).toBe(
      "You don't have permission to change organisation settings.",
    );
    expect(readSettingsRefusal(new Error('offline'), 'Could not save these settings.')).toEqual({ sources: {}, form: 'Could not save these settings.' });
  });
});

describe('workSettings: Run now’s words (Decision 12)', () => {
  it('says what the run did', () => {
    expect(refreshSummary({ created: 2, updated: 5, expired: 1, unrouted: 0, notified: 2, failed: [] })).toEqual({
      text: 'Run finished: 2 new, 5 updated, 1 expired. 2 people told.',
      failed: null,
    });
    expect(refreshSummary({ created: 0, updated: 0, expired: 0, unrouted: 3, notified: 1, failed: ['renewal_due', 'health_drop'] })).toEqual({
      text: "Run finished: 0 new, 0 updated, 0 expired. 3 couldn't be sent to anyone who can open the record. 1 person told.",
      failed: 'These sources failed this run: Renewal due, Health drop.',
    });
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/features/work/workSettings.test.ts --maxWorkers=2`
Expected: FAIL (`./workSettings` does not exist).

- [ ] **Step 3: Create `src/features/work/workSettings.ts`**

```ts
// Settings › Work › Recommendations (spec §2.4; Decisions 10 to 12): each
// source's fields and limits, the draft the form edits, checking it in the
// contract's own words, the PATCH it sends (only what changed), the
// server's refusals read back onto the form, and Run now's summary. Kept
// free of React. No em dash.
import { ApiError } from '../../lib/apiClient';
import type { RecKind, RecommendTo, RefreshResult, SourceField, SourceSettings, WorkSettings, WorkSettingsPatch } from './workTypes';

export const SET = {
  TITLE: 'Recommendations',
  INTRO: 'Revenact reads the workspace once a day and recommends a task wherever one of these signals triggers.',
  LOAD: 'Could not load these settings.',
  LOADING: 'Loading these settings',
  READ_ONLY: 'Only admins can change these.',
  RECEIVES: 'Who receives them',
  SIGNALS: 'Signals',
  DISMISSALS: 'Dismissals',
  COOLDOWN: 'After a dismissal (days)',
  COOLDOWN_DETAIL: "A dismissed signal isn't recommended again for this long unless it gets worse. 0 means straight away.",
  ON: 'On',
  OFF: 'Off',
  SAVE: 'Save changes',
  SAVING: 'Saving…',
  SAVED: 'Saved.',
  SAVE_FAILED: 'Could not save these settings.',
  RUN: 'Run now',
  RUNNING: 'Running…',
  RUN_HINT: 'Runs with the saved settings.',
  RUN_FAILED: 'Could not run the recommender.',
} as const;

export const RECEIVE_OPTIONS: { value: RecommendTo; label: string; detail: string }[] = [
  {
    value: 'manager',
    label: "The suggested person's manager",
    detail: 'When they have an active manager who can open the record; otherwise the person themselves.',
  },
  { value: 'owner', label: 'The suggested person', detail: 'Straight to the person Revenact suggests.' },
];

export interface FieldSpec {
  field: SourceField;
  label: string;
  min: number;
  max: number;
  whole: boolean;
}

export interface SourceSpec {
  kind: RecKind;
  label: string;
  detail: string;
  fields: FieldSpec[];
}

const days = (label: string): FieldSpec => ({ field: 'days', label, min: 1, max: 120, whole: true });

/** The contract's sources, in its order, with its limits. */
export const SOURCE_SPECS: readonly SourceSpec[] = [
  { kind: 'renewal_due', label: 'Renewal due', detail: 'A renewal within this many days, or overdue.', fields: [days('Within (days)')] },
  {
    kind: 'health_drop',
    label: 'Health drop',
    detail: 'Health now at least this much below the reading from this many days ago.',
    fields: [
      { field: 'drop', label: 'Drop of at least', min: 0.1, max: 5, whole: false },
      { field: 'window_days', label: 'Compared with (days ago)', min: 1, max: 120, whole: true },
    ],
  },
  {
    kind: 'urgent_tickets',
    label: 'Urgent tickets',
    detail: 'At least this many open critical or high tickets.',
    fields: [{ field: 'min', label: 'At least (tickets)', min: 1, max: 50, whole: true }],
  },
  { kind: 'overdue_tasks', label: 'Overdue tasks', detail: 'Tasks overdue by at least this many days.', fields: [days('Overdue by (days)')] },
  { kind: 'open_questions', label: 'Open questions', detail: 'Questions open for at least this many days.', fields: [days('Open for (days)')] },
  { kind: 'anomaly', label: 'Anomalies', detail: 'A live anomaly that names the record.', fields: [] },
  { kind: 'agent', label: 'AI agent', detail: 'Tasks the AI agent proposed.', fields: [] },
];

export const COOLDOWN_SPEC = { min: 0, max: 120, whole: true } as const;

export function sourceLabel(kind: string): string {
  return SOURCE_SPECS.find((spec) => spec.kind === kind)?.label ?? kind;
}

export function rangeMessage(spec: { min: number; max: number; whole: boolean }): string {
  return spec.whole ? `Choose a whole number from ${spec.min} to ${spec.max}.` : `Choose a number from ${spec.min} to ${spec.max}.`;
}

/** The number typed, inside the limits, or null. */
function parse(text: string, spec: { min: number; max: number; whole: boolean }): number | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (spec.whole && !Number.isInteger(value)) return null;
  return value >= spec.min && value <= spec.max ? value : null;
}

export interface SourceDraft {
  enabled: boolean;
  values: Partial<Record<SourceField, string>>;
}

export interface SettingsDraft {
  recommend_to: RecommendTo;
  cooldown: string;
  sources: Record<RecKind, SourceDraft>;
}

export function draftOf(settings: WorkSettings): SettingsDraft {
  const sources = {} as Record<RecKind, SourceDraft>;
  for (const spec of SOURCE_SPECS) {
    const saved: SourceSettings | undefined = settings.sources[spec.kind];
    const values: Partial<Record<SourceField, string>> = {};
    for (const field of spec.fields) {
      const value = saved?.[field.field];
      values[field.field] = value === undefined ? '' : String(value);
    }
    sources[spec.kind] = { enabled: saved?.enabled === true, values };
  }
  return { recommend_to: settings.recommend_to, cooldown: String(settings.dismiss_cooldown_days), sources };
}

export type SourceErrors = Partial<Record<SourceField | 'enabled' | 'source', string>>;

export interface SettingsErrors {
  recommend_to?: string;
  dismiss_cooldown_days?: string;
  sources: Partial<Record<RecKind, SourceErrors>>;
  form: string | null;
}

export const NO_SETTINGS_ERRORS: SettingsErrors = { sources: {}, form: null };

export function validateDraft(draft: SettingsDraft): SettingsErrors {
  const errors: SettingsErrors = { sources: {}, form: null };
  if (parse(draft.cooldown, COOLDOWN_SPEC) === null) errors.dismiss_cooldown_days = rangeMessage(COOLDOWN_SPEC);
  for (const spec of SOURCE_SPECS) {
    const fields: SourceErrors = {};
    for (const field of spec.fields) {
      if (parse(draft.sources[spec.kind].values[field.field] ?? '', field) === null) fields[field.field] = rangeMessage(field);
    }
    if (Object.keys(fields).length > 0) errors.sources[spec.kind] = fields;
  }
  return errors;
}

export function hasErrors(errors: SettingsErrors): boolean {
  return Boolean(errors.recommend_to || errors.dismiss_cooldown_days || errors.form || Object.keys(errors.sources).length > 0);
}

/** Only what changed (Decision 11). Run it on a draft that passed
 *  `validateDraft`; on any other it still answers, for the dirty check. */
export function patchOf(saved: WorkSettings, draft: SettingsDraft): WorkSettingsPatch {
  const patch: WorkSettingsPatch = {};
  if (draft.recommend_to !== saved.recommend_to) patch.recommend_to = draft.recommend_to;
  const cooldown = Number(draft.cooldown.trim());
  if (cooldown !== saved.dismiss_cooldown_days) patch.dismiss_cooldown_days = cooldown;
  const sources: NonNullable<WorkSettingsPatch['sources']> = {};
  for (const spec of SOURCE_SPECS) {
    const was: SourceSettings | undefined = saved.sources[spec.kind];
    const now = draft.sources[spec.kind];
    const change: Partial<SourceSettings> = {};
    if (now.enabled !== (was?.enabled === true)) change.enabled = now.enabled;
    for (const field of spec.fields) {
      const value = Number((now.values[field.field] ?? '').trim());
      if (value !== was?.[field.field]) change[field.field] = value;
    }
    if (Object.keys(change).length > 0) sources[spec.kind] = change;
  }
  if (Object.keys(sources).length > 0) patch.sources = sources;
  return patch;
}

export const isEmptyPatch = (patch: WorkSettingsPatch): boolean => Object.keys(patch).length === 0;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const first = (value: unknown): string | undefined => (Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined);
const isKind = (kind: string): kind is RecKind => SOURCE_SPECS.some((spec) => spec.kind === kind);
const SOURCE_FIELDS: readonly string[] = ['days', 'drop', 'window_days', 'min', 'enabled'];

/** A PATCH refusal, read onto the form: each field's first sentence under
 *  that field (`sources.<kind>.<field>` under its input, a source's own
 *  under its row), anything else (`sources` as a list, `non_field_errors`,
 *  a 403's `detail`) on the form; offline or a bare 500 is `fallback`. */
export function readSettingsRefusal(err: unknown, fallback: string): SettingsErrors {
  if (!(err instanceof ApiError) || !isObject(err.body)) return { sources: {}, form: fallback };
  const body = err.body;
  const out: SettingsErrors = { sources: {}, form: null };
  const recommendTo = first(body.recommend_to);
  if (recommendTo) out.recommend_to = recommendTo;
  const cooldown = first(body.dismiss_cooldown_days);
  if (cooldown) out.dismiss_cooldown_days = cooldown;
  if (Array.isArray(body.sources)) out.form = first(body.sources) ?? null;
  else if (isObject(body.sources)) {
    for (const [kind, value] of Object.entries(body.sources)) {
      if (!isKind(kind)) continue;
      const own = first(value);
      if (own) {
        out.sources[kind] = { source: own };
        continue;
      }
      if (!isObject(value)) continue;
      const fields: SourceErrors = {};
      for (const [field, messages] of Object.entries(value)) {
        const message = first(messages);
        if (!message) continue;
        if (SOURCE_FIELDS.includes(field)) fields[field as SourceField | 'enabled'] = message;
        else fields.source = message;
      }
      if (Object.keys(fields).length > 0) out.sources[kind] = fields;
    }
  }
  if (hasErrors(out)) return out;
  const general = first(body.non_field_errors);
  return { sources: {}, form: general ?? (typeof body.detail === 'string' ? body.detail : fallback) };
}

export interface RunSummary {
  text: string;
  failed: string | null;
}

/** Run now's result in words (Decision 12). */
export function refreshSummary(result: RefreshResult): RunSummary {
  let text = `Run finished: ${result.created} new, ${result.updated} updated, ${result.expired} expired.`;
  if (result.unrouted > 0) text += ` ${result.unrouted} couldn't be sent to anyone who can open the record.`;
  text += result.notified === 1 ? ' 1 person told.' : ` ${result.notified} people told.`;
  const failed = result.failed.length > 0 ? `These sources failed this run: ${result.failed.map(sourceLabel).join(', ')}.` : null;
  return { text, failed };
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run src/features/work/workSettings.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/work/workSettings.ts src/features/work/workSettings.test.ts
git commit -m "feat(work): the recommender settings' draft, limits, patch and refusals

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Settings › Work › Recommendations

**Files:**
- Create: `src/components/work/WorkSettingsForm.tsx`, `src/components/work/WorkSettingsSummary.tsx`, `src/pages/settings/WorkRecommendationsPage.tsx`
- Modify: `src/pages/settings/workspaceSettingsNav.ts`, `src/pages/settings/routes.tsx`
- Test: `src/pages/settings/WorkRecommendationsPage.test.tsx` (create), `src/pages/settings/workspaceSettingsNav.test.ts`

**Interfaces:**
- Consumes: Task 8's whole module; `fetchWorkSettings`, `patchWorkSettings`, `refreshRecommendations` and `recommendationsChanged` (Task 1); `stubWork` (Task 2); `renderPage` (`src/pages/work/testPages.tsx`); `useSubmitOnce`; `Figured`; `LIST`; `ErrorBlock`; `BUTTON`, `PRIMARY`, `FOCUS`, `MONO`; `CONTROL`, `FORM_ERROR`.
- Produces: `<WorkSettingsForm settings onSaved={(next: WorkSettings) => void} />`, `<WorkSettingsSummary settings />`, `<WorkRecommendationsPage />` at `/settings/recommendations`; `WORKSPACE_SETTINGS_NAV` has a Work group with Recommendations between Data and AI.

- [ ] **Step 1: Write the failing tests**

In `src/pages/settings/workspaceSettingsNav.test.ts`, change the first test's title to `'lists the five groups and their items in order'` and add, between the Data and AI rows of its expectation:

```ts
      ['Work', ['Recommendations /settings/recommendations']],
```

and in "shows a member only the items their routes let them into" add `expect(labels).toContain('Recommendations');`. Change the comment above `describe('WORKSPACE_SETTINGS_NAV', ...)` to: `// Settings spec 2026-10-06 §1, plus Work (Work spec §2.4): five groups, each item opening an existing page, in this order.`

Create `src/pages/settings/WorkRecommendationsPage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRecommendationChanges } from '../../components/work/taskChanges';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { sent, stubWork } from '../../features/work/testWork';
import { WORK_SETTINGS } from '../../features/work/testWorkFixtures';
import { resetViewport } from '../../test/viewport';
import { renderPage } from '../work/testPages';
import { WorkRecommendationsPage } from './WorkRecommendationsPage';

const URL = '/settings/recommendations';
const row = (kind: string) => document.querySelector(`[data-source="${kind}"]`) as HTMLElement;

async function retype(label: string, value: string) {
  const input = screen.getByLabelText(label);
  await userEvent.clear(input);
  if (value) await userEvent.type(input, value);
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
});

describe('Settings › Work › Recommendations (spec §2.4; Decisions 10 to 12)', () => {
  it('shows an admin the form, filled from the saved settings, with Save off until something changes', async () => {
    stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    expect(screen.getByRole('heading', { level: 1, name: 'Recommendations' })).toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: "The suggested person's manager" })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'The suggested person' })).not.toBeChecked();
    for (const name of ['Renewal due', 'Health drop', 'Urgent tickets', 'Overdue tasks', 'Open questions', 'Anomalies', 'AI agent']) {
      expect(screen.getByRole('switch', { name })).toBeChecked();
    }
    expect(screen.getByLabelText('Within (days)')).toHaveValue('30');
    expect(screen.getByLabelText('Drop of at least')).toHaveValue('0.5');
    expect(screen.getByLabelText('Compared with (days ago)')).toHaveValue('14');
    expect(screen.getByLabelText('At least (tickets)')).toHaveValue('1');
    expect(screen.getByLabelText('Overdue by (days)')).toHaveValue('2');
    expect(screen.getByLabelText('Open for (days)')).toHaveValue('3');
    expect(screen.getByLabelText('After a dismissal (days)')).toHaveValue('14');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Run now' })).toBeEnabled();
  });

  it('sends only what changed, then says Saved.', async () => {
    const { spy, settings } = stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    await userEvent.click(await screen.findByRole('radio', { name: 'The suggested person' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Health drop' }));
    await retype('Within (days)', '45');
    await retype('After a dismissal (days)', '7');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([
      { recommend_to: 'owner', dismiss_cooldown_days: 7, sources: { renewal_due: { days: 45 }, health_drop: { enabled: false } } },
    ]);
    expect(settings.sources.renewal_due.days).toBe(45);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('refuses numbers outside the limits in place, in the contract’s words, sending nothing', async () => {
    const { spy } = stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    await screen.findByRole('switch', { name: 'Renewal due' });
    await retype('Within (days)', '121');
    await retype('Drop of at least', '6');
    await retype('At least (tickets)', '2.5');
    await retype('After a dismissal (days)', '');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await within(row('renewal_due')).findByText('Choose a whole number from 1 to 120.')).toBeInTheDocument();
    expect(within(row('health_drop')).getByText('Choose a number from 0.1 to 5.')).toBeInTheDocument();
    expect(within(row('urgent_tickets')).getByText('Choose a whole number from 1 to 50.')).toBeInTheDocument();
    expect(screen.getByText('Choose a whole number from 0 to 120.')).toBeInTheDocument();
    expect(screen.getByLabelText('Within (days)')).toHaveAttribute('aria-invalid', 'true');
    expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([]);
  });

  it('puts a server refusal under its field', async () => {
    stubWork({ refuseNextSettings: { status: 400, body: { sources: { overdue_tasks: { days: ['Choose a whole number from 1 to 120.'] } } } } });
    renderPage(<WorkRecommendationsPage />, URL);
    await screen.findByRole('switch', { name: 'Overdue tasks' });
    await retype('Overdue by (days)', '3');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await within(row('overdue_tasks')).findByText('Choose a whole number from 1 to 120.')).toBeInTheDocument();
  });

  it('runs the recommender now, says what it did, and tells Work', async () => {
    stubWork({ refreshResult: { created: 2, updated: 5, expired: 1, unrouted: 1, notified: 1, failed: ['health_drop'] } });
    const heard = vi.fn();
    renderHook(() => useRecommendationChanges(heard));
    renderPage(<WorkRecommendationsPage />, URL);
    await userEvent.click(await screen.findByRole('button', { name: 'Run now' }));
    expect(await screen.findByText(/Run finished/)).toHaveTextContent(
      "Run finished: 2 new, 5 updated, 1 expired. 1 couldn't be sent to anyone who can open the record. 1 person told.",
    );
    expect(screen.getByText('These sources failed this run: Health drop.')).toBeInTheDocument();
    await waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
  });

  it('shows a member the settings as text: no controls, no Run now', async () => {
    stubWork({ workSettings: { ...WORK_SETTINGS, can_edit: false } });
    renderPage(<WorkRecommendationsPage />, URL, { role: 'csm' });
    expect(await screen.findByText('Only admins can change these.')).toBeInTheDocument();
    expect(screen.getByText("The suggested person's manager")).toBeInTheDocument();
    expect(row('renewal_due')).toHaveTextContent('Renewal due: On · Within (days) 30');
    expect(row('health_drop')).toHaveTextContent('Health drop: On · Drop of at least 0.5 · Compared with (days ago) 14');
    expect(row('agent')).toHaveTextContent('AI agent: On');
    expect(screen.getByText(/After a dismissal \(days\)/)).toHaveTextContent('After a dismissal (days): 14');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run now' })).toBeNull();
  });

  it('shows a skeleton, then the error with Try again', async () => {
    stubWork({ failSettings: 1 });
    renderPage(<WorkRecommendationsPage />, URL);
    expect(screen.getByLabelText('Loading these settings')).toBeInTheDocument();
    expect(await screen.findByText('Down.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('switch', { name: 'Renewal due' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/pages/settings --maxWorkers=2`
Expected: FAIL (no `./WorkRecommendationsPage`; the nav has four groups).

- [ ] **Step 3: Create `src/components/work/WorkSettingsForm.tsx`**

```tsx
import { useId, useState, type FormEvent } from 'react';
import type { RecKind, SourceField, WorkSettings } from '../../features/work/workTypes';
import { patchWorkSettings, refreshRecommendations } from '../../features/work/workApi';
import {
  NO_SETTINGS_ERRORS,
  RECEIVE_OPTIONS,
  SET,
  SOURCE_SPECS,
  draftOf,
  hasErrors,
  isEmptyPatch,
  patchOf,
  readSettingsRefusal,
  refreshSummary,
  validateDraft,
  type RunSummary,
  type SettingsDraft,
  type SettingsErrors,
} from '../../features/work/workSettings';
import { Figured } from '../brain/Figured';
import { LIST } from '../brain/styles';
import { CONTROL, FORM_ERROR } from '../organizations/activity/formStyles';
import { BUTTON, FOCUS, PRIMARY } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { recommendationsChanged } from './taskChanges';

// CONTROL is min-h-11 below sm (formStyles.ts); named INPUT here so the
// house rules' touch-target check knows it. Narrow from sm: a number.
const INPUT = `${CONTROL} sm:w-28`;
const CHOICE = 'flex min-h-11 items-center gap-2 text-[13px] font-semibold text-ink sm:min-h-9';
const BOX = `h-4 w-4 shrink-0 accent-accent ${FOCUS}`;
const HEADING = 'text-[15px] font-bold text-ink';
const NOTE = 'text-[11px] text-ink-muted';
const ERROR = 'text-[11px] text-danger';

/** The recommender's settings for an admin (spec §2.4; Decisions 11, 12):
 *  who receives them, each source's switch and thresholds, the dismiss
 *  cooldown, Save changes (only what changed, refused in place first), and
 *  Run now with what it did. */
export function WorkSettingsForm({ settings, onSaved }: { settings: WorkSettings; onSaved: (next: WorkSettings) => void }) {
  const ids = useId();
  const [draft, setDraft] = useState<SettingsDraft>(() => draftOf(settings));
  const [errors, setErrors] = useState<SettingsErrors>(NO_SETTINGS_ERRORS);
  const [status, setStatus] = useState('');
  const [run, setRun] = useState<RunSummary | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const saving = useSubmitOnce();
  const running = useSubmitOnce();
  const dirty = !isEmptyPatch(patchOf(settings, draft));

  const setEnabled = (kind: RecKind, enabled: boolean) =>
    setDraft((current) => ({ ...current, sources: { ...current.sources, [kind]: { ...current.sources[kind], enabled } } }));
  const setValue = (kind: RecKind, field: SourceField, value: string) =>
    setDraft((current) => ({
      ...current,
      sources: { ...current.sources, [kind]: { ...current.sources[kind], values: { ...current.sources[kind].values, [field]: value } } },
    }));

  async function save(event: FormEvent) {
    event.preventDefault();
    setStatus('');
    const local = validateDraft(draft);
    if (hasErrors(local)) {
      setErrors(local);
      return;
    }
    const patch = patchOf(settings, draft);
    if (isEmptyPatch(patch)) return;
    setErrors(NO_SETTINGS_ERRORS);
    const outcome = await saving.run(() => patchWorkSettings(patch));
    if (!outcome) return;
    if (outcome.ok) {
      setDraft(draftOf(outcome.value));
      onSaved(outcome.value);
      setStatus(SET.SAVED);
    } else {
      setErrors(readSettingsRefusal(outcome.error, SET.SAVE_FAILED));
    }
  }

  async function runNow() {
    setRun(null);
    setRunError(null);
    const outcome = await running.run(() => refreshRecommendations());
    if (!outcome) return;
    if (outcome.ok) {
      setRun(refreshSummary(outcome.value));
      recommendationsChanged();
    } else {
      setRunError(errorMessage(outcome.error, SET.RUN_FAILED));
    }
  }

  const cooldownId = `${ids}-cooldown`;
  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={(event) => void save(event)} noValidate aria-label={SET.TITLE} className="flex flex-col gap-6">
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className={`${HEADING} mb-2`}>{SET.RECEIVES}</legend>
          {RECEIVE_OPTIONS.map((option) => {
            const detailId = `${ids}-receives-${option.value}`;
            return (
              <div key={option.value} className="flex flex-col">
                <label className={CHOICE}>
                  <input
                    type="radio"
                    name={`${ids}-receives`}
                    value={option.value}
                    checked={draft.recommend_to === option.value}
                    aria-describedby={detailId}
                    onChange={() => setDraft((current) => ({ ...current, recommend_to: option.value }))}
                    className={BOX}
                  />
                  {option.label}
                </label>
                <p id={detailId} className={`${NOTE} pl-6`}>
                  {option.detail}
                </p>
              </div>
            );
          })}
          {errors.recommend_to ? (
            <p role="alert" className={ERROR}>
              {errors.recommend_to}
            </p>
          ) : null}
        </fieldset>

        <section aria-labelledby={`${ids}-signals`} className="flex flex-col gap-2">
          <h2 id={`${ids}-signals`} className={HEADING}>
            {SET.SIGNALS}
          </h2>
          <ul className={LIST}>
            {SOURCE_SPECS.map((spec) => {
              const source = draft.sources[spec.kind];
              const failed = errors.sources[spec.kind] ?? {};
              const detailId = `${ids}-${spec.kind}-detail`;
              const own = failed.enabled ?? failed.source;
              return (
                <li key={spec.kind} data-source={spec.kind} className="flex flex-col gap-2 px-4 py-3">
                  <label className={CHOICE}>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={source.enabled}
                      aria-describedby={detailId}
                      onChange={(event) => setEnabled(spec.kind, event.target.checked)}
                      className={BOX}
                    />
                    {spec.label}
                  </label>
                  <p id={detailId} className={NOTE}>
                    {spec.detail}
                  </p>
                  {spec.fields.length > 0 ? (
                    <div className="flex flex-wrap gap-3">
                      {spec.fields.map((field) => {
                        const id = `${ids}-${spec.kind}-${field.field}`;
                        const error = failed[field.field];
                        return (
                          <div key={field.field} className="flex min-w-0 flex-col gap-1">
                            <label htmlFor={id} className="text-[11px] font-semibold text-ink-muted">
                              {field.label}
                            </label>
                            <input
                              id={id}
                              inputMode={field.whole ? 'numeric' : 'decimal'}
                              value={source.values[field.field] ?? ''}
                              aria-invalid={Boolean(error)}
                              aria-describedby={error ? `${id}-error` : undefined}
                              onChange={(event) => setValue(spec.kind, field.field, event.target.value)}
                              className={INPUT}
                            />
                            {error ? (
                              <p id={`${id}-error`} role="alert" className={ERROR}>
                                {error}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  {own ? (
                    <p role="alert" className={ERROR}>
                      {own}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby={`${ids}-dismissals`} className="flex flex-col gap-1">
          <h2 id={`${ids}-dismissals`} className={`${HEADING} mb-1`}>
            {SET.DISMISSALS}
          </h2>
          <label htmlFor={cooldownId} className="text-[11px] font-semibold text-ink-muted">
            {SET.COOLDOWN}
          </label>
          <input
            id={cooldownId}
            inputMode="numeric"
            value={draft.cooldown}
            aria-invalid={Boolean(errors.dismiss_cooldown_days)}
            aria-describedby={`${cooldownId}-detail`}
            onChange={(event) => setDraft((current) => ({ ...current, cooldown: event.target.value }))}
            className={INPUT}
          />
          <p id={`${cooldownId}-detail`} className={NOTE}>
            {SET.COOLDOWN_DETAIL}
          </p>
          {errors.dismiss_cooldown_days ? (
            <p role="alert" className={ERROR}>
              {errors.dismiss_cooldown_days}
            </p>
          ) : null}
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={!dirty || saving.busy} className={PRIMARY}>
            {saving.busy ? SET.SAVING : SET.SAVE}
          </button>
          <p role="status" className="text-[13px] text-ink-muted">
            {status}
          </p>
        </div>
        {errors.form ? (
          <p role="alert" className={FORM_ERROR}>
            {errors.form}
          </p>
        ) : null}
      </form>

      <section aria-labelledby={`${ids}-run`} className="flex flex-col gap-2">
        <h2 id={`${ids}-run`} className={HEADING}>
          {SET.RUN}
        </h2>
        <p className={NOTE}>{SET.RUN_HINT}</p>
        <div>
          <button type="button" onClick={() => void runNow()} disabled={running.busy} className={BUTTON}>
            {running.busy ? SET.RUNNING : SET.RUN}
          </button>
        </div>
        <div role="status" className="flex flex-col gap-1 text-[13px]">
          {run ? (
            <p className="text-ink">
              <Figured text={run.text} />
            </p>
          ) : null}
          {run?.failed ? <p className="text-warning">{run.failed}</p> : null}
        </div>
        {runError ? (
          <p role="alert" className={FORM_ERROR}>
            {runError}
          </p>
        ) : null}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/components/work/WorkSettingsSummary.tsx`**

```tsx
import { RECEIVE_OPTIONS, SET, SOURCE_SPECS } from '../../features/work/workSettings';
import type { WorkSettings } from '../../features/work/workTypes';
import { LIST } from '../brain/styles';
import { MONO } from '../organizations/portfolio/styles';

const HEADING = 'text-[15px] font-bold text-ink';

/** The recommender's settings for a member (Decision 10): the values as
 *  text, never disabled controls, and who may change them. */
export function WorkSettingsSummary({ settings }: { settings: WorkSettings }) {
  const receives = RECEIVE_OPTIONS.find((option) => option.value === settings.recommend_to)?.label ?? settings.recommend_to;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[13px] text-ink-muted">{SET.READ_ONLY}</p>
      <section className="flex flex-col gap-1">
        <h2 className={HEADING}>{SET.RECEIVES}</h2>
        <p className="text-[13px] text-ink">{receives}</p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className={HEADING}>{SET.SIGNALS}</h2>
        <ul className={LIST}>
          {SOURCE_SPECS.map((spec) => {
            const saved = settings.sources[spec.kind];
            return (
              <li key={spec.kind} data-source={spec.kind} className="flex flex-col gap-1 px-4 py-3">
                <p className="text-[13px] text-ink">
                  <span className="font-semibold">{spec.label}:</span> {saved?.enabled ? SET.ON : SET.OFF}
                  {spec.fields.map((field) => (
                    <span key={field.field}>
                      {' · '}
                      {field.label} <span className={MONO}>{saved?.[field.field] ?? ''}</span>
                    </span>
                  ))}
                </p>
                <p className="text-[11px] text-ink-muted">{spec.detail}</p>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="flex flex-col gap-1">
        <h2 className={HEADING}>{SET.DISMISSALS}</h2>
        <p className="text-[13px] text-ink">
          {SET.COOLDOWN}: <span className={MONO}>{settings.dismiss_cooldown_days}</span>
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Create `src/pages/settings/WorkRecommendationsPage.tsx`**

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import { ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { WorkSettingsForm } from '../../components/work/WorkSettingsForm';
import { WorkSettingsSummary } from '../../components/work/WorkSettingsSummary';
import { fetchWorkSettings } from '../../features/work/workApi';
import { SET } from '../../features/work/workSettings';
import type { WorkSettings } from '../../features/work/workTypes';

/** Settings › Work › Recommendations (spec §2.4; Decision 10): the form for
 *  whoever holds manage_org_settings (`can_edit`), the values as text for
 *  everyone else. */
export function WorkRecommendationsPage() {
  const [attempt, setAttempt] = useState(0);
  const [settings, setSettings] = useState<WorkSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchWorkSettings().then(
      (data) => {
        if (!alive) return;
        setSettings(data);
        setError(null);
      },
      (err: unknown) => {
        if (alive) setError(errorMessage(err, SET.LOAD));
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  let body: ReactNode;
  if (!settings && error) body = <ErrorBlock message={error} onRetry={() => setAttempt((n) => n + 1)} />;
  else if (!settings)
    body = (
      <div aria-busy="true" aria-label={SET.LOADING} className="flex flex-col gap-3">
        {[0, 1, 2].map((n) => (
          <div key={n} className="h-16 animate-pulse rounded-xl bg-subtle" />
        ))}
      </div>
    );
  else if (settings.can_edit) body = <WorkSettingsForm settings={settings} onSaved={setSettings} />;
  else body = <WorkSettingsSummary settings={settings} />;

  return (
    <div className="flex h-full w-full max-w-2xl flex-col gap-6 overflow-y-auto p-6">
      <div>
        <h1 className="text-[20px] font-bold tracking-tight text-ink">{SET.TITLE}</h1>
        <p className="mt-0.5 text-[13px] font-medium text-ink-faint">{SET.INTRO}</p>
      </div>
      {body}
    </div>
  );
}
```

- [ ] **Step 6: The nav group and the route**

In `src/pages/settings/workspaceSettingsNav.ts`, add `Lightbulb,` to the lucide import (alphabetically, after `KeyRound,`), replace the comment above `WORKSPACE_SETTINGS_NAV` with:

```ts
/** Settings' grouped navigation (settings spec 2026-10-06 §1; Work spec
 *  §2.4 adds Work). Agents arrives with its feature in a later round;
 *  nothing is drawn for it until then. Briefs moves to Work › Notifications
 *  with Work's delivery 3. */
```

and add between the Data group and the AI group:

```ts
  {
    label: 'Work',
    items: [{ label: 'Recommendations', path: '/settings/recommendations', icon: Lightbulb }],
  },
```

In `src/pages/settings/routes.tsx`, add `import { WorkRecommendationsPage } from './WorkRecommendationsPage';` after the `EntityUploadsPage` import, and after `<Route path="entity-uploads" element={el(<EntityUploadsPage />)} />` add:

```tsx
        {/* Work (Work spec §2.4): every member opens it; can_edit decides the form. */}
        <Route path="recommendations" element={el(<WorkRecommendationsPage />)} />
```

- [ ] **Step 7: Run the tests and make sure they pass**

Run: `npx vitest run src/pages/settings src/features/work --maxWorkers=2`
Expected: PASS (`routes.test.tsx` now also opens `/settings/recommendations` for an admin, from the nav).

- [ ] **Step 8: Commit**

```bash
git add src/components/work/WorkSettingsForm.tsx src/components/work/WorkSettingsSummary.tsx src/pages/settings/WorkRecommendationsPage.tsx src/pages/settings/WorkRecommendationsPage.test.tsx src/pages/settings/workspaceSettingsNav.ts src/pages/settings/workspaceSettingsNav.test.ts src/pages/settings/routes.tsx
git commit -m "feat(settings): Settings › Work › Recommendations

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 10: House rules, the journeys, the product docs, and the full check

**Files:**
- Modify: `src/components/work/houseRules.test.ts` (replace), `src/e2e/work.test.tsx` (append), `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`

**Interfaces:**
- Consumes: everything above; `RAW`, `houseRuleSuite`, `rowsIconsTargetsSuite` (`src/test/houseRules.ts`); `renderWork`, `renderPage`, `where`; `stubWork`, `sent`.
- Produces: no new code; the house rules cover every new file, three journeys and a phone-width check run end to end in jsdom, and the two frontend product docs describe delivery 2.

- [ ] **Step 1: Replace `src/components/work/houseRules.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { RAW, houseRuleSuite, rowsIconsTargetsSuite } from '../../test/houseRules';

// The house rules (revenact-design §4) over every Work component, the Work
// pages and the Work bar; and, for tokens, targets and copy only (it keeps
// the settings frame's own 20px h1), Settings › Work › Recommendations.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const files = {
  ...raw(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(
    import.meta.glob(['../../pages/work/Today.tsx', '../../pages/work/Team.tsx', '../../pages/work/Recommended.tsx', '../../pages/work/WorkRoutes.tsx'], {
      query: '?raw',
      eager: true,
      import: 'default',
    }),
  ),
  ...raw(import.meta.glob('../layout/WorkTabs.tsx', { query: '?raw', eager: true, import: 'default' })),
};
const settingsPage = raw(import.meta.glob('../../pages/settings/WorkRecommendationsPage.tsx', { query: '?raw', eager: true, import: 'default' }));
// Every file in the three Work folders, tests included, plus the settings page, for the copy rule.
const everything = {
  ...files,
  ...settingsPage,
  ...raw(import.meta.glob(['./*.ts', '../../features/work/*.ts', '../../pages/work/*.tsx'], { query: '?raw', eager: true, import: 'default' })),
};
const sources = Object.entries(files).filter(([file]) => !file.includes('.test.'));
const PAGES = ['../../pages/work/Today.tsx', '../../pages/work/Team.tsx', '../../pages/work/Recommended.tsx'];
// One primary per surface: Today's New task, and the settings form's Save changes.
const PRIMARY_OWNERS = ['../../pages/work/Today.tsx', './WorkSettingsForm.tsx'];

houseRuleSuite('work house rules', files);
rowsIconsTargetsSuite('work rows, icons and targets', files);
rowsIconsTargetsSuite('work settings page: rows, icons and targets', settingsPage);

describe('work: coverage, figures, states, cards, copy', () => {
  it('covers the pages, the bar and every component', () => {
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        ...PAGES,
        '../../pages/work/WorkRoutes.tsx',
        '../layout/WorkTabs.tsx',
        './TaskPanelHost.tsx',
        './TaskSheet.tsx',
        './TaskPanel.tsx',
        './TaskFields.tsx',
        './TaskFacts.tsx',
        './TaskValue.tsx',
        './ActivityTrail.tsx',
        './CommentBox.tsx',
        './AssigneeSelect.tsx',
        './TaskRowItem.tsx',
        './TodayGroups.tsx',
        './TodaySkeleton.tsx',
        './NewTaskSheet.tsx',
        './TeamRow.tsx',
        './TeamSkeleton.tsx',
        './TaskPanelSkeleton.tsx',
        './WorkFrame.tsx',
        './RecommendationCard.tsx',
        './AssignForm.tsx',
        './DismissForm.tsx',
        './RecommendedSkeleton.tsx',
        './WorkSettingsForm.tsx',
        './WorkSettingsSummary.tsx',
      ]),
    );
    expect(Object.keys(settingsPage)).toEqual(['../../pages/settings/WorkRecommendationsPage.tsx']);
  });

  it('uses at most four type sizes across the section', () => {
    const sizes = new Set(sources.flatMap(([, s]) => [...s.matchAll(/text-\[(\d+)px\]/g)].map((m) => m[1])));
    expect(sizes.size).toBeLessThanOrEqual(4);
  });

  it('sets every figure in DM Mono with tabular-nums', () => {
    for (const file of [
      './TaskRowItem.tsx',
      './TeamRow.tsx',
      './TaskFacts.tsx',
      './ActivityTrail.tsx',
      './TodayGroups.tsx',
      './TaskValue.tsx',
      './WorkSettingsSummary.tsx',
      '../../pages/work/Recommended.tsx',
    ]) {
      expect(files[file], file).toMatch(/\bMONO\b/);
    }
    for (const file of ['./RecommendationCard.tsx', './WorkSettingsForm.tsx']) expect(files[file], file).toMatch(/<Figured /);
  });

  it('designs loading, empty and error states', () => {
    expect(files['../../pages/work/Today.tsx']).toMatch(/<TodaySkeleton \/>/);
    expect(files['../../pages/work/Today.tsx']).toMatch(/<ErrorBlock /);
    expect(files['../../pages/work/Today.tsx']).toMatch(/<EmptyState /);
    expect(files['../../pages/work/Team.tsx']).toMatch(/<TeamSkeleton \/>/);
    expect(files['../../pages/work/Team.tsx']).toMatch(/<ErrorBlock /);
    expect(files['../../pages/work/Team.tsx']).toMatch(/<EmptyState /);
    expect(files['../../pages/work/Recommended.tsx']).toMatch(/<RecommendedSkeleton \/>/);
    expect(files['../../pages/work/Recommended.tsx']).toMatch(/<ErrorBlock /);
    expect(files['../../pages/work/Recommended.tsx']).toMatch(/<EmptyState /);
    expect(settingsPage['../../pages/settings/WorkRecommendationsPage.tsx']).toMatch(/<ErrorBlock /);
    expect(settingsPage['../../pages/settings/WorkRecommendationsPage.tsx']).toMatch(/animate-pulse/);
    expect(files['./TeamRow.tsx']).toMatch(/NO_DRILL/);
    expect(files['./TeamRow.tsx']).toMatch(/TRY_AGAIN/);
    expect(files['./TaskSheet.tsx']).toMatch(/<TaskPanelSkeleton \/>/);
    expect(files['./TaskSheet.tsx']).toMatch(/<ErrorBlock /);
    expect(files['./TaskSheet.tsx']).toMatch(/NO_TASK/);
    for (const file of ['./TodaySkeleton.tsx', './TeamSkeleton.tsx', './TaskPanelSkeleton.tsx', './TeamRow.tsx', './RecommendedSkeleton.tsx']) {
      expect(files[file], file).toMatch(/animate-pulse/);
    }
  });

  it('nests no card in a card: rows are flat inside one bordered list', () => {
    for (const file of ['./TaskRowItem.tsx', './TeamRow.tsx', './RecommendationCard.tsx']) expect(files[file], file).not.toMatch(/rounded-(lg|xl)|border border-line|shadow/);
    expect(files['./TodayGroups.tsx']).toMatch(/className=\{LIST\}/);
    expect(files['../../pages/work/Team.tsx']).toMatch(/className=\{LIST\}/);
    expect(files['../../pages/work/Recommended.tsx']).toMatch(/className=\{LIST\}/);
  });

  it('keeps one primary per surface: Today’s New task and the settings form’s Save changes', () => {
    for (const file of PRIMARY_OWNERS) expect(files[file], file).toMatch(/className=\{PRIMARY\}/);
    for (const [file, source] of sources) if (!PRIMARY_OWNERS.includes(file)) expect(source, file).not.toMatch(/\bPRIMARY\b/);
  });

  it('draws no h1 on a Work page: "Work" in the bar is the title', () => {
    for (const page of PAGES) expect(files[page], page).not.toMatch(/font-display|<h1\b/);
  });

  it('touches no browser storage', () => {
    expect(sources.filter(([, s]) => /localStorage|sessionStorage/.test(s)).map(([f]) => f)).toEqual([]);
  });

  it('keeps the settings page on tokens', () => {
    expect(Object.entries(settingsPage).filter(([, s]) => RAW.test(s)).map(([f]) => f)).toEqual([]);
  });

  it('writes no em dash anywhere in the Work folders or the settings page, comments and tests included', () => {
    expect(Object.entries(everything).filter(([, s]) => s.includes('—')).map(([f]) => f)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the house rules and fix what they find**

Run: `npx vitest run src/components/work/houseRules.test.ts --maxWorkers=2`
Expected: PASS. If a target or size test fails, fix the named file (never the rule), then run it again.

- [ ] **Step 3: Write the journeys**

In `src/e2e/work.test.tsx`, change the `@testing-library/react` import to `import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';`, add `import { renderPage } from '../pages/work/testPages';` beside the `renderWork` import (one import: `import { renderPage, renderWork, where } from '../pages/work/testPages';`) and `import { WorkRecommendationsPage } from '../pages/settings/WorkRecommendationsPage';`, add to the header comment `// Delivery 2 (spec §2.4, §6): a recommendation assigned appears in Today, is marked done and leaves the badge; one dismissed is gone; an admin saves the settings and a member reads them.`, and append:

```tsx
describe('Work: a manager decides what Revenact recommends', () => {
  const bar = () => within(screen.getByRole('navigation', { name: 'Work' }));

  it('assigns one to themself, finds it in Today, marks it done, and the badge drops', { timeout: 30000 }, async () => {
    const { spy } = stubWork();
    renderWork('/work/recommended', { nav: true, sidebarItem: true });

    // 1. Recommended under the Work bar; the badge counts overdue and waiting.
    expect(await screen.findByRole('link', { name: 'Work, 1 overdue, 3 recommended' })).toHaveAttribute('href', '/work/today');
    expect(bar().getByRole('link', { name: 'Recommended' })).toHaveAttribute('aria-current', 'page');
    const renewal = await screen.findByRole('article', { name: "Prepare Pizza Hut's renewal" });

    // 2. Assign, prefilled with Carl; the manager takes it herself, due yesterday.
    await userEvent.click(within(renewal).getByRole('button', { name: 'Assign' }));
    const who = within(renewal).getByLabelText('Who does it');
    await waitFor(() => expect(who).toHaveValue('3'));
    await userEvent.selectOptions(who, '1');
    fireEvent.change(within(renewal).getByLabelText('Due date'), { target: { value: '2026-10-06' } });
    await userEvent.click(within(renewal).getByRole('button', { name: 'Assign task' }));

    // 3. The row leaves; one moves from recommended to overdue on the badge.
    expect(await screen.findByText("Assigned to you: Prepare Pizza Hut's renewal.")).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: "Prepare Pizza Hut's renewal" })).toBeNull();
    expect(await screen.findByRole('link', { name: 'Work, 2 overdue, 2 recommended' })).toBeInTheDocument();
    expect(sent(spy, 'POST', '/work/recommendations/5/assign/')).toEqual([{ assignee_id: 1, due_date: '2026-10-06', title: "Prepare Pizza Hut's renewal" }]);

    // 4. Today has it, overdue, recommended by Revenact; Done takes it off the badge.
    await userEvent.click(bar().getByRole('link', { name: 'Today' }));
    await waitFor(() => expect(where()).toBe('/work/today'));
    const overdue = await screen.findByRole('region', { name: 'Overdue 2' });
    expect(overdue).toHaveTextContent('Recommended by Revenact');
    await userEvent.click(within(overdue).getByRole('button', { name: 'Mark “Prepare Pizza Hut\'s renewal” done' }));
    expect(await screen.findByText("Done: Prepare Pizza Hut's renewal.")).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Work, 1 overdue, 2 recommended' })).toBeInTheDocument();
  });

  it('dismisses one with a reason of its own, and it does not come back', { timeout: 30000 }, async () => {
    const { spy } = stubWork();
    renderWork('/work/recommended', { nav: true, sidebarItem: true });
    const tickets = await screen.findByRole('article', { name: "Get Uber EMEA's urgent tickets moving" });
    await userEvent.click(within(tickets).getByRole('button', { name: 'Dismiss' }));
    await userEvent.selectOptions(within(tickets).getByLabelText('Reason'), 'other');
    await userEvent.type(within(tickets).getByLabelText('Say why'), 'Handled on the QBR call');
    await userEvent.click(within(tickets).getByRole('button', { name: 'Dismiss it' }));
    expect(await screen.findByText("Dismissed: Get Uber EMEA's urgent tickets moving.")).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Work, 1 overdue, 2 recommended' })).toBeInTheDocument();

    await userEvent.click(bar().getByRole('link', { name: 'Today' }));
    await screen.findByRole('region', { name: 'Overdue 1' });
    await userEvent.click(bar().getByRole('link', { name: 'Recommended' }));
    expect(await screen.findByRole('region', { name: "Yours and your team's 2" })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: "Get Uber EMEA's urgent tickets moving" })).toBeNull();
    expect(sent(spy, 'POST', '/dismiss/')).toEqual([{ reason: 'other', note: 'Handled on the QBR call' }]);
  });
});

describe('Work: an admin tunes the recommender, and a member reads it', () => {
  it('saves who receives them and a threshold, runs it now, and a member sees the saved values', { timeout: 30000 }, async () => {
    const { spy, settings } = stubWork();
    renderPage(<WorkRecommendationsPage />, '/settings/recommendations');
    await userEvent.click(await screen.findByRole('radio', { name: 'The suggested person' }));
    const days = screen.getByLabelText('Within (days)');
    await userEvent.clear(days);
    await userEvent.type(days, '45');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ recommend_to: 'owner', sources: { renewal_due: { days: 45 } } }]);
    await userEvent.click(screen.getByRole('button', { name: 'Run now' }));
    expect(await screen.findByText(/Run finished/)).toHaveTextContent('Run finished: 2 new, 5 updated, 1 expired. 2 people told.');

    cleanup();
    vi.unstubAllGlobals();
    stubWork({ workSettings: { ...settings, can_edit: false } });
    renderPage(<WorkRecommendationsPage />, '/settings/recommendations', { role: 'csm' });
    expect(await screen.findByText('The suggested person')).toBeInTheDocument();
    expect(document.querySelector('[data-source="renewal_due"]')).toHaveTextContent('Renewal due: On · Within (days) 45');
  });
});

describe('Recommended at phone width', () => {
  it('puts the switch in a select and gives the Assign form 44px controls', async () => {
    stubWork();
    renderWork('/work/recommended', { width: 375, nav: true });
    const renewal = await screen.findByRole('article', { name: "Prepare Pizza Hut's renewal" });
    expect(screen.getByRole('combobox', { name: 'View' })).toHaveValue('team');
    await userEvent.click(within(renewal).getByRole('button', { name: 'Assign' }));
    expect(within(renewal).getByLabelText('Due date')).toHaveClass('min-h-11');
    expect(within(renewal).getByRole('button', { name: 'Assign task' })).toHaveClass('min-h-11');
    expect(within(renewal).getByRole('button', { name: 'Dismiss' })).toHaveClass('min-h-11');
  });
});
```

- [ ] **Step 4: Run the journeys**

Run: `npx vitest run src/e2e/work.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: The UI/UX doc (`docs/03-ui-ux-design.md`)**

In "### Work: Today, Team and the task panel", replace

```
- **The bar.** Every `/work*` route wears the framed bar: "Work" as its
  only h1, then Today and, for readers with reports, `view_all_accounts`
  or the Leadership function, Team, as underline tabs class for class the
  Brain's.
```

with

```
- **The bar.** Every `/work*` route wears the framed bar: "Work" as its
  only h1, then Today, Recommended (for readers with reports,
  `view_all_accounts` or the Leadership function, for anyone with a
  recommendation waiting for them, and for whoever is on it) and, for
  readers with reports, `view_all_accounts` or the Leadership function,
  Team, as underline tabs class for class the Brain's.
```

replace

```
- **The sidebar.** One Work item (Lucide `ListTodo`) after Dashboard, lit
  on every Work route, with my overdue count as its badge and in its name
  ("Work, 2 overdue").
```

with

```
- **The sidebar.** One Work item (Lucide `ListTodo`) after Dashboard, lit
  on every Work route. Its badge is my overdue count plus the
  recommendations waiting for me; its name says each part it has ("Work,
  2 overdue, 3 recommended", "Work, 3 recommended", "Work, 2 overdue").
```

replace `` - **The bell.** `task_assigned` gets Lucide `SquareCheck`. `` with `` - **The bell.** `task_assigned` gets Lucide `SquareCheck`; `recommendations_waiting` gets Lucide `Lightbulb`. ``

Then, before "### Settings: the frame", add:

```
### Work: Recommended, and Settings › Work › Recommendations

Spec `docs/superpowers/specs/2026-10-07-work-round-design.md` §2.4.

- **Recommended** (`/work/recommended`). `WorkFrame`. A toolbar row with
  the status line (it takes focus after a decision: "Assigned to you:
  <title>." with an Open task link, "Dismissed: <title>.", or the server's
  "Mona Manager already assigned this.") and, for readers with reports or
  `view_all_accounts`, the Me / My team switch (Brain's `ScopeSwitch`,
  inline here, a select below `sm`). Then "Yours to decide" or "Yours and
  your team's" with the count in DM Mono over one bordered `LIST`. A row
  is flat: the title (13px semibold), a meta line in 11px (the record as
  a link, the kind, the priority, "Suggested for Carl CSM" or "Nobody
  suggested" or "Suggested for Dana CSM, who can't open it now", and "In
  Carl CSM's queue" when it is not mine), the facts as a short bulleted
  list with their figures in DM Mono, the evidence links, then Assign
  (bordered) and Dismiss (quiet), each `aria-expanded`, each opening its
  form below while both stay. Assign: Who does it (the record's people,
  those who can't open it disabled), Due date and Task title, prefilled;
  "Assign task" and Cancel. Dismiss: Reason (Already handled, Not
  relevant, Wrong person, Other) and, for Other, Say why; "Dismiss it"
  and Cancel. Labels above, errors below, in the server's words. "N more
  about accounts you can't open" under the list. States: a skeleton, Try
  again, "Nothing to decide". No primary on this page.
- **Settings › Work › Recommendations** (`/settings/recommendations`,
  Lucide `Lightbulb`). The settings frame's 20px h1 and its intro, then,
  for an admin: Who receives them (two radios, each with its note under
  it), Signals (one `LIST` row per source: a switch with its name, an
  11px note, and its threshold inputs, labelled above, narrow from `sm`),
  Dismissals (After a dismissal (days)), then the page's one primary,
  Save changes, disabled until something changed, with "Saved." beside
  it; then Run now (bordered) and what it did ("Run finished: 2 new, 5
  updated, 1 expired. 2 people told.", failed sources in `text-warning`).
  A member reads "Only admins can change these." and the values as
  text, figures in DM Mono. States: a skeleton, Try again.
```

In "### Settings: the frame", replace `in four groups, Workspace, Data, AI` / `and Developers,` with `in five groups, Workspace, Data, Work, AI` / `and Developers,`, and replace `Work and Agents get groups when their features land; nothing is drawn for` / `them before.` with `Agents gets a group when its feature lands; nothing is drawn for it` / `before.` (keep the line breaks as they are around them).

- [ ] **Step 6: The app-flow doc (`docs/04-app-flow.md`)**

Replace the routes-table row

```
| `/work`, `/work/*` | `WorkRoutes` (`pages/work/`): `/work` and anything unknown under it redirect to `/work/today` | auth |
```

with

```
| `/work`, `/work/*` | `WorkRoutes` (`pages/work/`): Today, Recommended (open to every member) and Team; `/work` and anything unknown under it redirect to `/work/today` | auth |
```

In the **Sidebar** paragraph, replace `with my overdue count as its badge, "Work, 2 overdue")` with `with my overdue count plus the recommendations waiting for me as its badge, "Work, 2 overdue, 3 recommended")`.

In "### 4.10 Settings and administration", before the line beginning `- **AI.** AI agent, AI attributes,`, add:

```
- **Work.** Recommendations (`WorkRecommendationsPage`, every member):
  `GET /work/settings/`; with `can_edit` (`manage_org_settings`) the form
  sends `PATCH /work/settings/` with only what changed (who receives them,
  a source's switch or threshold, the dismiss cooldown), each number
  checked first against the contract's limits in its words ("Choose a
  whole number from 1 to 120."), a refusal shown under its field; Run now
  posts `/work/recommendations/refresh/` and says what it did. Without
  `can_edit` the values are text.
```

Rename `### 4.11b Work (Today, Team and the task panel)` to `### 4.11b Work (Today, Recommended, Team and the task panel)`, add after its contract line `` and `revenact-backend docs/superpowers/plans/2026-10-07-work-recommended-api.md` (delivery 2). `` on its own line, and before the bullet beginning `- **The task panel** opens wherever the URL carries`, add:

```
- **Recommended** (`/work/recommended`, also the bell's
  `recommendations_waiting` link) reads `GET /work/recommendations/`,
  with `?scope=me|team` from the page's URL when the reader chose one
  (the switch is offered to readers with reports or `view_all_accounts`;
  without one the server picks team for them, me for everyone else). It
  lists, newest first, the open recommendations the reader may decide
  (their queue; in team also those suggesting anyone below them, and
  every one for `view_all_accounts`), at most 100 with the full `count`,
  and `hidden` as "N more about accounts you can't open". Assign reads
  `GET /work/assignees/` for the record, prefills the suggested person
  only while they are active and can open it, prefills the due date and
  title from `defaults`, and posts `/work/recommendations/<id>/assign/
  {assignee_id, due_date, title}`; Dismiss posts `.../dismiss/ {reason}`
  (with `note` for Other). Both are refused in place first in the
  server's words, sent once, and on success the row leaves and the page's
  status line says what happened (Assign links to the new task's panel).
  A 409 `ALREADY_DECIDED` or a 404 removes the row with the server's
  sentence ("Mona Manager already assigned this.", "This recommendation
  has expired."); a 403 `CANT_DECIDE`, a field error or
  `ASSIGNEE_CANNOT_OPEN` stays in the form. An AI-agent recommendation is
  the same decision as its proposal in Brain › Waiting on you: deciding in
  either place settles both, and a Brain decision (or a 404/409 there)
  calls `recommendationsChanged()` so the Work badge and an open
  Recommended list read again.
```

Replace the "After any change" bullet

```
- **After any change** in the panel or a quick Done, `taskChanged()` tells
  every mounted reader to read again: Today, Team and its open rows, the
  sidebar badge (`GET /work/today/` `counts.overdue`, also read on every
  route change), Brain's desk and badge, and the open record's story.
```

with

```
- **After any change** in the panel, a quick Done or a decision on
  Recommended, `taskChanged()` tells every mounted reader to read again:
  Today, Team and its open rows, Recommended, the sidebar badge (`GET
  /work/today/` `counts.overdue` plus `GET /work/recommendations/?scope=team`
  `count`, also read on every route change), Brain's desk and badge, and
  the open record's story. `recommendationsChanged()` (Brain's proposal
  decisions, Run now) reaches only Recommended and the badge.
```

In "## 6. Redux map", replace `` `useDrill`, `useTask`, `useAssignees`, `useWorkCount`). `` with `` `useDrill`, `useTask`, `useAssignees`, `useWorkCount`, `useRecommended`, `useRecommendedCount`). ``

- [ ] **Step 7: The full check**

Run, in order, each in the foreground:
- `npx vitest run --maxWorkers=2` — Expected: every test passes. A failure in an older suite that counts fetches or names the Work link means `stubWork()` there now also lists recommendations: give that call `recommendations: []` (as Task 3 Step 7 did), never loosen the assertion.
- `npm run lint` — Expected: no errors, no new warnings.
- `npm run build` — Expected: success.

- [ ] **Step 8: Commit**

```bash
git add src/components/work/houseRules.test.ts src/e2e/work.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md
git commit -m "test(work): Recommended's house rules and journeys; docs for delivery 2

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

If Step 7 needed changes to other test files, add those paths explicitly to this commit.

---

## Self-review

**Spec coverage (§2.4, with §2.1 to §2.3, §4, §5, §6 for delivery 2):**
- `/work/recommended` shown to anyone with open items to decide or with reports: Task 4 (`showsRecommended`, Decision 1), the route open to all (Decision 2).
- Each card shows the title, facts as a short list, evidence links, the record, the suggested person: Task 4 (`RecommendationCard`).
- Assign opens a small form with the person and due date prefilled, and the title: Task 5; the picker reuses `AssigneeSelect` with can-open flags; `ASSIGNEE_CANNOT_OPEN` under the field; §4's "the Assign picker only offers people who can open the record" through `assigneeOptions` and `pickable`.
- Dismiss asks for a reason (four reasons, Other with text): Task 6.
- "N more about accounts you can't open": Task 4.
- Brain › Waiting on you keeps showing AI-agent proposals; deciding in either place resolves both: Task 7 (`recommendationsChanged()` from Brain), Task 5 (`taskChanged()` re-reads Brain's desk and badge).
- Settings › Work › Recommendations in a new Work group between Data and AI, who receives, one row per source with switch and threshold, cooldown, Run now for admins, members read-only: Tasks 8 and 9.
- §2.3 409 `ALREADY_DECIDED` naming who decided, and the row leaves: Tasks 5 and 6; `CANT_DECIDE` stays in the form.
- §1.5's sidebar badge "plus recommendations waiting, from delivery 2": Task 3.
- §3.3's bell icon for `recommendations_waiting` and its click to Recommended (the delivery 2 part of it): Task 7.
- §4 counted, not named: `hidden` only; facts and evidence are the server's.
- §6 frontend: Recommended with loading, empty, error and hidden states (Task 4); Settings › Work admin versus member (Task 9); the sidebar badge (Task 3); the bell's new kind (Task 7); phone width (Tasks 4 and 10); the end-to-end assign → Today → done → badge (Task 10).
- Docs 03 and 04 in the same PR: Task 10.

**Placeholder scan:** no TBD or "similar to"; every code step shows its code; Task 6 Step 4 edits the card with the full replacement block for the region it changes.

**Type consistency:** `RecommendationRow`, `RecommendationsPayload`, `AssignAnswer`, `DismissBody`, `WorkSettings`, `WorkSettingsPatch`, `RefreshResult` (Task 1) are the names used in Tasks 2 to 10; `recommendationsChanged` / `useRecommendationChanges` (Task 1) in Tasks 3, 4, 7, 9; `useRecommendedCount` (Task 3) in Task 4; `RecState` (Task 2) in the tests of Tasks 3 to 6; `onSettled(rec, text, taskId)` (Task 5) in Task 6; `SettingsDraft`, `SettingsErrors`, `RunSummary`, `SET`, `SOURCE_SPECS`, `RECEIVE_OPTIONS` (Task 8) in Task 9; `REC.DISMISS_IT` added in Task 6 before its first use.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-07-work-recommended-frontend.md`. Two execution options:

1. **Subagent-Driven (recommended)**: a fresh subagent per task, a review between tasks (superpowers:subagent-driven-development).
2. **Inline Execution**: the tasks in one session with checkpoints (superpowers:executing-plans).

Which approach?
